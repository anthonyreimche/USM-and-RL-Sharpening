// What the passes do in place of RawTherapee's arithmetic, in TypeScript, for
// the approximation study (approximations.test.ts): the recursive blur as a
// FIR of its own impulse response with the SSE build's far-edge correction,
// as glsl.ts draws it, and half-float storage.

import { iirRadius } from "../../src/model";
import { yvvFactors } from "./rtref";

/** The recursion's symmetric impulse response h[0..R], normalized so the
 *  2R + 1 taps sum to 1: its autocorrelation. The Yule-Walker equations give
 *  h1..h3 over h0 in closed form, the recursion the rest, as glsl.ts does. */
export function recursionTaps(sigma: number, R: number): Float64Array {
  const { b1, b2, b3 } = yvvFactors(sigma);
  const h = new Float64Array(Math.max(R + 1, 4));
  const r1 = (b1 + b2 * b3) / (1 - b2 - b3 * (b1 + b3));
  const r2 = b2 + (b1 + b3) * r1;
  h[0] = 1;
  h[1] = r1;
  h[2] = r2;
  h[3] = b3 + b2 * r1 + b1 * r2;
  for (let n = 4; n <= R; n++) h[n] = b1 * h[n - 1] + b2 * h[n - 2] + b3 * h[n - 3];
  let sum = h[0];
  for (let n = 1; n <= R; n++) sum += 2 * h[n];
  const out = new Float64Array(R + 1);
  for (let n = 0; n <= R; n++) out[n] = h[n] / sum;
  return out;
}

/** One line through the FIR with clamped reads, plus the SSE build's far
 *  edge: the backward recursion started rho times too far from the edge
 *  value u, i.e. (rho - 1)(Y_m - u) at positions n - 1, n, n + 1 carried back
 *  by the homogeneous recursion. */
export function firLine(line: Float64Array, sigma: number): void {
  const n = line.length;
  const R = iirRadius(sigma);
  const h = recursionTaps(sigma, R);
  const { b1, b2, b3, rho } = yvvFactors(sigma);
  const at = (j: number) => line[Math.min(Math.max(j, 0), n - 1)];
  const fir = (j: number) => {
    let v = 0;
    for (let k = -R; k <= R; k++) v += h[Math.abs(k)] * at(j + k);
    return v;
  };
  const u = line[n - 1];
  const e = [0, 1, 2].map((m) => (rho - 1) * (fir(n - 1 + m) - u));
  const out = new Float64Array(n);
  for (let j = 0; j < n; j++) out[j] = fir(j);
  // d = n - 1 - j: the correction at d is c(d) = b1 c(d - 1) + b2 c(d - 2) + b3 c(d - 3),
  // c(0) = e0, c(-1) = e1, c(-2) = e2.
  let c0 = e[0];
  let c1 = e[1];
  let c2 = e[2];
  for (let d = 0; d < n && d <= R; d++) {
    out[n - 1 - d] += c0;
    const next = b1 * c0 + b2 * c1 + b3 * c2;
    c2 = c1;
    c1 = c0;
    c0 = next;
  }
  line.set(out);
}

/** How a GPU rounds a float into a half-float target: to nearest (ties to
 *  even, as SwiftShader does), or toward zero, which D3D11 allows and the
 *  RTX 4070 Ti does through ANGLE. */
export type Rounding = "nearest" | "zero";

/** The half float `v` rounds to. */
export function toHalf(v: number, rounding: Rounding = "nearest"): number {
  const a = Math.abs(v);
  if (!(a > 0)) return v;
  if (a >= 65520) return Math.sign(v) * Infinity;
  const e = Math.max(Math.floor(Math.log2(a)), -14);
  const ulp = 2 ** (e - 10);
  const t = a / ulp;
  if (rounding === "zero") return Math.sign(v) * Math.floor(t) * ulp;
  let q = Math.round(t);
  if (q - t === 0.5 && q % 2 === 1) q -= 1;
  return Math.sign(v) * q * ulp;
}

/** A value the passes keep as a half-float difference from `base`, in the
 *  normalized units they use (L / 32768). */
export const halfStore =
  (rounding: Rounding = "nearest") =>
  (value: number, base: number): number =>
    base + toHalf((value - base) / 32768, rounding) * 32768;
export const storeHalf = halfStore();

/** The blend mask as the passes keep it: itself up to 0.5, less 1 above. */
export const blendStore =
  (rounding: Rounding = "nearest") =>
  (b: number): number =>
    b > 0.5 ? 1 + toHalf(b - 1, rounding) : toHalf(b, rounding);
export const storeBlend = blendStore();

/** The deconvolution's ratio as the passes keep it: less 1, unscaled. */
export const ratioStore =
  (rounding: Rounding = "nearest") =>
  (ratio: number): number =>
    1 + toHalf(ratio - 1, rounding);
export const storeRatio = ratioStore();
