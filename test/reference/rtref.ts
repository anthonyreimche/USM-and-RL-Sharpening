// A float32 transcription of RawTherapee 5.13's Sharpening (1924179;
// GPL-3.0-or-later): ImProcFunctions::sharpening, deconvsharpening,
// sharpenHaloCtrl and dcdamping (rtengine/ipsharpen.cc), buildBlendMask
// (rt_algo.cc), gaussianBlur with the SSE2 build's paths (gauss.cc), the
// bilateral filter (bilateral2.h) and Threshold::multiply (params/threshold.h),
// with their loops, borders and quirks, on the L of RGB2Lab in the "sRGB"
// working space. rawtherapee.json pins it to rawtherapee-cli (rtref.test.ts);
// the GPU spec pins the shaders to it.
//
// Copyright (c) 2004-2010 Gabor Horvath <hgabor@rawtherapee.com> (ipsharpen.cc,
// gauss.cc, bilateral2.h, color.cc)
// Copyright (c) 2017-2018 Ingo Weyrich <heckflosse67@gmx.de> (rt_algo.cc)
// Copyright (c) 2025 Daniel Gao <daniel.gao.work@gmail.com> (params/threshold.h)
//
// Two of RawTherapee's floating-point shortcuts are taken exactly instead:
// buildBlendMask's SSE sigmoid uses _mm_rsqrt_ps (12 bits, and its value
// differs between CPU makers) and the bilateral's weights come from a 2^17
// entry LUT interpolated linearly (the gaussian to 10⁻³ at the smallest
// tolerance). Both stay well inside the fixture's tolerance.
//
// `store`, when given, rounds the values the GPU keeps between draws the way
// the passes keep them (half floats, as differences from a base), so the same
// code measures what the render targets cost.

import { BILATERAL_TABLES, BLUR_RADIUS_MIN, GAUSS_3X3_LIMIT, GAUSS_5X5_LIMIT, GAUSS_7X7_LIMIT, GAUSS_SKIP, bilateralTable, type Params } from "../../src/model";

const f = Math.fround;
type Grid = Float32Array;

export interface Image {
  width: number;
  height: number;
  /** Linear RGB, three floats per pixel, row-major. */
  data: Float32Array;
}

export interface RefOptions {
  /** What every radius is multiplied by: the render's size over the source's
   *  (RawTherapee divides by its preview `scale`; the CLI's is 1). */
  scale?: number;
  /** Rounds a value the GPU stores, in L units, relative to `base`. */
  store?: (value: number, base: number) => number;
  /** Rounds the blend mask as the GPU stores it. */
  storeBlend?: (blend: number) => number;
  /** Rounds the deconvolution's ratio as the GPU stores it between its two
   *  blurs: as the ratio less 1, unscaled. */
  storeRatio?: (ratio: number) => number;
  /** The image as the passes read it, when that is a rounded copy of the one
   *  the change of L is applied to (sharpenImage). */
  passInput?: Image;
  /** Below GAUSS_SKIP RawTherapee's damped deconvolution copies the damped
   *  ratio into the estimate (an image of ratios, black); the port leaves the
   *  estimate alone there instead, as the undamped path does. */
  portSkip?: boolean;
}

// ── Colour: RGB2Lab's L (working space "sRGB", xyz_sRGB) and back ────────────

/** iccmatrices.h xyz_sRGB: linear Rec.709 to XYZ, Bradford-adapted to D50. */
export const XYZ_SRGB = [
  [0.4360747, 0.3850649, 0.1430804],
  [0.2225045, 0.7168786, 0.0606169],
  [0.0139322, 0.0971045, 0.7141733],
] as const;
const D50X = 0.9642;
const D50Z = 0.8249;
const KAPPA = 24389 / 27;
const EPS = 216 / 24389;

function invert3(m: readonly (readonly number[])[]): number[][] {
  const [a, b, c] = m;
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  return [
    [(b[1] * c[2] - b[2] * c[1]) / det, (a[2] * c[1] - a[1] * c[2]) / det, (a[1] * b[2] - a[2] * b[1]) / det],
    [(b[2] * c[0] - b[0] * c[2]) / det, (a[0] * c[2] - a[2] * c[0]) / det, (a[2] * b[0] - a[0] * b[2]) / det],
    [(b[0] * c[1] - b[1] * c[0]) / det, (a[1] * c[0] - a[0] * c[1]) / det, (a[0] * b[1] - a[1] * b[0]) / det],
  ];
}
export const SRGB_XYZ = invert3(XYZ_SRGB);

const labF = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const labFInv = (t: number) => (t > 6 / 29 ? t * t * t : (116 * t - 16) / KAPPA);

/** RawTherapee's L, 0 to 32768 for Y from 0 to 1 (L* times 327.68). */
export function luminanceOf(r: number, g: number, b: number): number {
  const y = XYZ_SRGB[1][0] * r + XYZ_SRGB[1][1] * g + XYZ_SRGB[1][2] * b;
  return y > EPS ? 327.68 * (116 * Math.cbrt(y) - 16) : 327.68 * KAPPA * y;
}

export function lumaPlane(img: Image): Grid {
  const out = new Float32Array(img.width * img.height);
  for (let p = 0; p < out.length; p++) out[p] = luminanceOf(img.data[3 * p], img.data[3 * p + 1], img.data[3 * p + 2]);
  return out;
}

/** The pixel with its L moved by dL (RawTherapee units), a and b kept. */
export function withLuminanceShift(rgb: readonly number[], dL: number): [number, number, number] {
  const m = XYZ_SRGB;
  const x = (m[0][0] * rgb[0] + m[0][1] * rgb[1] + m[0][2] * rgb[2]) / D50X;
  const y = m[1][0] * rgb[0] + m[1][1] * rgb[1] + m[1][2] * rgb[2];
  const z = (m[2][0] * rgb[0] + m[2][1] * rgb[1] + m[2][2] * rgb[2]) / D50Z;
  const shift = dL / 327.68 / 116;
  const X = labFInv(labF(x) + shift) * D50X;
  const Y = labFInv(labF(y) + shift);
  const Z = labFInv(labF(z) + shift) * D50Z;
  const i = SRGB_XYZ;
  return [i[0][0] * X + i[0][1] * Y + i[0][2] * Z, i[1][0] * X + i[1][1] * Y + i[1][2] * Z, i[2][0] * X + i[2][1] * Y + i[2][2] * Z];
}

// ── gauss.cc ─────────────────────────────────────────────────────────────────

export interface YvV {
  B: number;
  b1: number;
  b2: number;
  b3: number;
  /** Triggs-Sdika's boundary matrix with the SSE build's normalization. */
  M: number[][];
  /** M over the exact (non-SSE) normalization: the SSE build's right and
   *  bottom edges start the backward recursion this many times too far from
   *  the edge value. */
  rho: number;
}

/** calculateYvVFactors<double>, on the float sigma the SSE paths take, and the
 *  coefficients as the vector code holds them (F2V: floats). */
export function yvvFactors(sigmaIn: number): YvV {
  const sigma = f(sigmaIn);
  const q = sigma < 2.5 ? 3.97156 - 4.14554 * Math.sqrt(1.0 - 0.26891 * sigma) : 0.98711 * sigma - 0.9633;
  const b0 = 1.57825 + 2.44413 * q + 1.4281 * q * q + 0.422205 * q * q * q;
  let b1 = 2.44413 * q + 2.85619 * q * q + 1.26661 * q * q * q;
  let b2 = -1.4281 * q * q - 1.26661 * q * q * q;
  let b3 = 0.422205 * q * q * q;
  const B = 1.0 - (b1 + b2 + b3) / b0;
  b1 /= b0;
  b2 /= b0;
  b3 /= b0;
  const raw = [
    [-b3 * b1 + 1.0 - b3 * b3 - b2, (b3 + b1) * (b2 + b3 * b1), b3 * (b1 + b3 * b2)],
    [b1 + b3 * b2, -(b2 - 1.0) * (b2 + b3 * b1), -(b3 * b1 + b3 * b3 + b2 - 1.0) * b3],
    [b3 * b1 + b2 + b1 * b1 - b2 * b2, b1 * b2 + b3 * b2 * b2 - b1 * b3 * b3 - b3 * b3 * b3 - b3 * b2 + b3, b3 * (b1 + b3 * b2)],
  ];
  const sse = (1.0 + b2 + (b1 - b3) * b3) / ((1.0 + b1 - b2 + b3) * (1.0 - b1 - b2 - b3));
  const exact = 1 / ((1.0 + b1 - b2 + b3) * (1.0 + b2 + (b1 - b3) * b3));
  return { B: f(B), b1: f(b1), b2: f(b2), b3: f(b3), M: raw.map((r) => r.map((v) => f(v * sse))), rho: sse / exact };
}

/** One line of gaussHorizontalSse / gaussVerticalSse: the forward recursion
 *  from a constant extension, Triggs-Sdika's start, the backward recursion. */
function iirLine(line: Float64Array, c: YvV): void {
  const { B, b1, b2, b3, M } = c;
  const n = line.length;
  const t = new Float64Array(n);
  const s0 = line[0];
  t[0] = f(s0 * (B + b1 + b2 + b3));
  t[1] = f(B * line[1] + b1 * t[0] + s0 * (b2 + b3));
  t[2] = f(B * line[2] + b1 * t[1] + b2 * t[0] + b3 * s0);
  for (let j = 3; j < n; j++) t[j] = f(B * line[j] + b1 * t[j - 1] + b2 * t[j - 2] + b3 * t[j - 3]);
  const u = line[n - 1];
  const d0 = t[n - 1] - u;
  const d1 = t[n - 2] - u;
  const d2 = t[n - 3] - u;
  const wm1 = f(u + M[0][0] * d0 + M[0][1] * d1 + M[0][2] * d2);
  const w0 = f(u + M[1][0] * d0 + M[1][1] * d1 + M[1][2] * d2);
  const wp1 = f(u + M[2][0] * d0 + M[2][1] * d1 + M[2][2] * d2);
  t[n - 1] = wm1;
  t[n - 2] = f(B * t[n - 2] + b1 * t[n - 1] + b2 * w0 + b3 * wp1);
  t[n - 3] = f(B * t[n - 3] + b1 * t[n - 2] + b2 * t[n - 1] + b3 * w0);
  for (let j = n - 4; j >= 0; j--) t[j] = f(B * t[j] + b1 * t[j + 1] + b2 * t[j + 2] + b3 * t[j + 3]);
  line.set(t);
}

/** How a line of the recursive blur is filtered: RawTherapee's recursion, or
 *  a stand-in (the GPU's FIR, in the approximation study). */
export type LineFilter = (line: Float64Array, sigma: number) => void;
const recursion: LineFilter = (line, sigma) => iirLine(line, yvvFactors(sigma));
let lineFilter: LineFilter = recursion;

/** Runs `body` with `filter` in place of the recursion. */
export function withLineFilter<T>(filter: LineFilter, body: () => T): T {
  lineFilter = filter;
  try {
    return body();
  } finally {
    lineFilter = recursion;
  }
}

function iirHorizontal(src: Grid, dst: Grid, W: number, H: number, sigma: number): void {
  const line = new Float64Array(W);
  for (let i = 0; i < H; i++) {
    for (let j = 0; j < W; j++) line[j] = src[i * W + j];
    lineFilter(line, sigma);
    for (let j = 0; j < W; j++) dst[i * W + j] = line[j];
  }
}

/** The vertical half; `apply` stores each result (standard, mult or div). */
function iirVertical(src: Grid, W: number, H: number, sigma: number, apply: (p: number, v: number) => void): void {
  const line = new Float64Array(H);
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < H; i++) line[i] = src[i * W + j];
    lineFilter(line, sigma);
    for (let i = 0; i < H; i++) apply(i * W + j, f(line[i]));
  }
}

type Apply = (p: number, v: number) => void;

function gauss3x3(src: Grid, W: number, H: number, sigma: number, apply: Apply): void {
  const c1d = Math.exp(-0.5 * (1.0 / sigma) ** 2);
  const c2d = Math.exp(-((1.0 / sigma) ** 2));
  const sum = 1 + 4 * (c1d + c2d);
  const c0 = f(1 / sum);
  const c1 = f(c1d / sum);
  const c2 = f(c2d / sum);
  const bb = Math.exp(-1.0 / (2.0 * sigma * sigma));
  const bsum = 2 * bb + 1;
  const b1 = f(bb / bsum);
  const b0 = f(1 / bsum);
  const s = (i: number, j: number) => src[i * W + j];
  for (let i = 0; i < H; i++) {
    for (let j = 0; j < W; j++) {
      const rowEdge = i === 0 || i === H - 1;
      const colEdge = j === 0 || j === W - 1;
      let v: number;
      if (rowEdge && colEdge) v = s(i, j);
      else if (rowEdge) v = b1 * (s(i, j - 1) + s(i, j + 1)) + b0 * s(i, j);
      else if (colEdge) v = b1 * (s(i - 1, j) + s(i + 1, j)) + b0 * s(i, j);
      else {
        v =
          c2 * (s(i - 1, j - 1) + s(i - 1, j + 1) + s(i + 1, j - 1) + s(i + 1, j + 1)) +
          c1 * (s(i - 1, j) + s(i, j - 1) + s(i, j + 1) + s(i + 1, j)) +
          c0 * s(i, j);
      }
      apply(i * W + j, f(v));
    }
  }
}

/** compute5x5kernel / compute7x7kernel: a disc of the gaussian, summed and
 *  normalized in float. */
export function discKernel(sigmaIn: number, r: 2 | 3): Float32Array {
  const sigma = f(sigmaIn);
  const temp = -2 * f(sigma * sigma);
  const limit = (3.0 * (r === 2 ? 0.84 : 1.15)) ** 2;
  const n = 2 * r + 1;
  const k = new Float32Array(n * n);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      if (i * i + j * j <= limit) {
        k[(i + r) * n + j + r] = Math.exp((i * i + j * j) / temp);
        sum = f(sum + k[(i + r) * n + j + r]);
      }
    }
  }
  for (let i = 0; i < n * n; i++) k[i] = f(k[i] / sum);
  return k;
}

/** gauss5x5div / gauss7x7div / gauss5x5mult / gauss7x7mult over the interior;
 *  7x7 multiplies its (i - 2, j + 1) tap by c21 twice (gauss.cc:285, 384). */
function gaussDisc(src: Grid, W: number, H: number, sigma: number, r: 2 | 3, apply: Apply): void {
  const n = 2 * r + 1;
  const k = discKernel(sigma, r);
  const c21 = k[(r - 2) * n + r + 1];
  for (let i = r; i < H - r; i++) {
    for (let j = r; j < W - r; j++) {
      let v = 0;
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          let w = k[(di + r) * n + dj + r];
          if (r === 3 && di === -2 && dj === 1) w *= c21;
          if (w !== 0) v += w * src[(i + di) * W + j + dj];
        }
      }
      apply(i * W + j, f(v));
    }
  }
}

export type GaussMode = "standard" | "mult" | "div";

/** gaussianBlurImpl, useBoxBlur false, as the SSE2 build runs it. `div` is
 *  buffer2 (the divisor's numerator) for GAUSS_DIV. In place (src === dst) is
 *  only reached by buildBlendMask, at sigma 2. */
export function gaussianBlur(src: Grid, dst: Grid, W: number, H: number, sigma: number, mode: GaussMode = "standard", div?: Grid): void {
  if (sigma < GAUSS_SKIP) {
    if (src !== dst) dst.set(src);
    return;
  }
  const store: Apply =
    mode === "standard"
      ? (p, v) => (dst[p] = v)
      : mode === "mult"
        ? (p, v) => (dst[p] = f(dst[p] * v))
        : (p, v) => (dst[p] = f(Math.max(div![p] / (v > 0 ? v : 1), 0)));
  if (sigma < GAUSS_3X3_LIMIT) {
    if (src === dst) throw new Error("the separable 3-tap path is not transcribed");
    gauss3x3(src, W, H, sigma, store);
    return;
  }
  if (mode !== "standard" && sigma <= GAUSS_7X7_LIMIT && src !== dst) {
    const r = sigma <= GAUSS_5X5_LIMIT ? 2 : 3;
    if (mode === "div") {
      for (let i = 0; i < W * H; i++) dst[i] = 1;
      gaussDisc(src, W, H, sigma, r, (p, v) => (dst[p] = f(div![p] / Math.max(v, 0.00001))));
    } else gaussDisc(src, W, H, sigma, r, store);
    return;
  }
  if (mode === "mult") {
    iirHorizontal(src, src, W, H, sigma);
    iirVertical(src, W, H, sigma, store);
  } else {
    const tmp = new Float32Array(W * H);
    iirHorizontal(src, tmp, W, H, sigma);
    iirVertical(tmp, W, H, sigma, store);
  }
}

// ── rt_algo.cc buildBlendMask ────────────────────────────────────────────────

export function calcBlendFactor(val: number, threshold: number): number {
  const x = -16 + (16 / threshold) * val;
  return 0.5 * (1 + x / Math.sqrt(1 + x * x));
}

export function buildBlendMask(L: Grid, W: number, H: number, contrastThreshold: number): Grid {
  const blend = new Float32Array(W * H);
  if (contrastThreshold === 0) {
    blend.fill(1);
    return blend;
  }
  const scale = 0.0625 / 327.68;
  const l = (j: number, i: number) => L[j * W + i];
  for (let j = 2; j < H - 2; j++) {
    for (let i = 2; i < W - 2; i++) {
      const contrast =
        Math.sqrt(
          (l(j, i + 1) - l(j, i - 1)) ** 2 + (l(j + 1, i) - l(j - 1, i)) ** 2 + (l(j, i + 2) - l(j, i - 2)) ** 2 + (l(j + 2, i) - l(j - 2, i)) ** 2,
        ) * scale;
      blend[j * W + i] = calcBlendFactor(contrast, contrastThreshold);
    }
  }
  for (let j = 0; j < 2; j++) for (let i = 2; i < W - 2; i++) blend[j * W + i] = blend[2 * W + i];
  for (let j = H - 2; j < H; j++) for (let i = 2; i < W - 2; i++) blend[j * W + i] = blend[(H - 3) * W + i];
  for (let j = 0; j < H; j++) {
    blend[j * W] = blend[j * W + 1] = blend[j * W + 2];
    blend[j * W + W - 2] = blend[j * W + W - 1] = blend[j * W + W - 3];
  }
  gaussianBlur(blend, blend, W, H, 2.0);
  return blend;
}

// ── params/threshold.h Threshold<int>::multiply, double, not starting at one ──

export function thresholdMultiply(p: Params, x: number, yMax: number): number {
  const bl = p.thresholdBottomLeft;
  const tl = p.thresholdTopLeft;
  const br = p.thresholdBottomRight;
  const tr = p.thresholdTopRight;
  if (x === br && br === tr) return yMax;
  if (x >= br) return 0;
  if (x > tr) return yMax * (1.0 - (x - tr) / (br - tr));
  if (x >= tl) return yMax;
  if (x > bl) return (yMax * (x - bl)) / (tl - bl);
  return 0;
}

// ── bilateral2.h ─────────────────────────────────────────────────────────────

/** bilateral<float, float>(src, dst, buffer, W, H, sigma, sens): the table for
 *  sigma, weights from the interpolated ec LUT, the border copied. */
export function bilateral(src: Grid, W: number, H: number, sigma: number, sens: number): Grid {
  const dst = new Float32Array(src);
  const k = bilateralTable(sigma);
  if (k < 0) return dst;
  const { r, a } = BILATERAL_TABLES[k];
  const ec = (d: number) => {
    // LUTf ec(0x20000) at index d + 65536: linear between whole entries, clipped.
    const idx = Math.min(Math.max(d + 65536, 0), 0x20000 - 1);
    const i0 = Math.min(Math.floor(idx), 0x20000 - 2);
    const t = idx - i0;
    const e = (i: number) => f(Math.exp(-((i - 0x10000) * (i - 0x10000)) / (2 * sens * sens)));
    return e(i0) + t * (e(i0 + 1) - e(i0));
  };
  for (let i = r; i < H - r; i++) {
    for (let j = r; j < W - r; j++) {
      const c = src[i * W + j];
      let num = 0;
      let den = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const w = a[(r - Math.abs(dy)) * (r + 1) + r - Math.abs(dx)];
          if (w === 0) continue;
          const s = src[(i + dy) * W + j + dx];
          const e = ec(s - c);
          num += w * s * e;
          den += w * e;
        }
      }
      dst[i * W + j] = f(num / den);
    }
  }
  return dst;
}

// ── ipsharpen.cc ─────────────────────────────────────────────────────────────

const intp = (a: number, b: number, c: number) => a * (b - c) + c;
const UPPER_BOUND = 2000;

function sharpenHaloCtrl(luminance: Grid, blurmap: Grid, base: Grid, blend: Grid, W: number, H: number, p: Params): void {
  const scale = (100 - p.haloAmount) * 0.01;
  const sharpFac = p.amount * 0.01;
  const nL = (i: number, j: number) => base[i * W + j];
  const box = (i: number, j: number) => nL(i, j) + nL(i, j + 1) + nL(i, j + 2);
  for (let i = 2; i < H - 2; i++) {
    let max1 = 0;
    let max2 = 0;
    let min1 = 0;
    let min2 = 0;
    for (let j = 2; j < W - 2; j++) {
      const np1 = (2 * (box(i - 2, j) + box(i - 1, j) + box(i, j))) / 27 + nL(i - 1, j + 1) / 3;
      const np2 = (2 * (box(i - 1, j) + box(i, j) + box(i + 1, j))) / 27 + nL(i, j + 1) / 3;
      const np3 = (2 * (box(i, j) + box(i + 1, j) + box(i + 2, j))) / 27 + nL(i + 1, j + 1) / 3;
      const maxn = Math.max(np1, np2, np3);
      const minn = Math.min(np1, np2, np3);
      let max_ = Math.max(max1, max2, maxn);
      let min_ = Math.min(min1, min2, minn);
      max1 = max2;
      max2 = maxn;
      min1 = min2;
      min2 = minn;
      const labL = luminance[i * W + j];
      if (max_ < labL) max_ = labL;
      if (min_ > labL) min_ = labL;
      const diff = nL(i, j) - blurmap[i * W + j];
      const delta = thresholdMultiply(p, Math.min(Math.abs(diff), UPPER_BOUND), f(sharpFac * diff));
      let newL = labL + delta;
      if (newL > max_) newL = max_ + (newL - max_) * scale;
      else if (newL < min_) newL = min_ - (min_ - newL) * scale;
      luminance[i * W + j] = f(intp(blend[i * W + j], newL, luminance[i * W + j]));
    }
  }
}

function dcdamping(aI: Grid, aO: Grid, damping: number, n: number): void {
  const dampingFac = -2 / (damping * damping);
  for (let p = 0; p < n; p++) {
    const I = aI[p];
    const O = aO[p];
    if (O <= 0 || I <= 0) {
      aI[p] = 0;
      continue;
    }
    let U = (O * Math.log(I / O) - I + O) * dampingFac;
    U = Math.min(U, 1);
    U = U * U * U * U * (5 - U * 4);
    aI[p] = f(((O - I) / I) * U + 1);
  }
}

function deconvsharpening(luminance: Grid, blend: Grid, W: number, H: number, p: Params, o: RefOptions): void {
  if (p.deconvAmount === 0 && p.blurRadius < BLUR_RADIUS_MIN) return;
  const scale = o.scale ?? 1;
  const n = W * H;
  const q = o.store ?? ((v: number) => v);
  const tmpI = new Float32Array(n);
  for (let i = 0; i < n; i++) tmpI[i] = luminance[i] = Math.max(luminance[i], 0);
  let blur: Grid | null = null;
  if (p.blurRadius >= BLUR_RADIUS_MIN) {
    blur = new Float32Array(n);
    gaussianBlur(tmpI, blur, W, H, p.blurRadius * scale);
    for (let i = 0; i < n; i++) blur[i] = intp(blend[i], luminance[i], Math.max(blur[i], 0));
  }
  const damping = p.deconvDamping / 5.0;
  const needdamp = p.deconvDamping > 0;
  const sigma = p.deconvRadius * scale;
  const amount = p.deconvAmount / 100;
  const tmp = new Float32Array(n);
  const skip = (o.portSkip ?? false) && sigma < GAUSS_SKIP;
  const iterations = skip ? 0 : Math.round(p.deconvIterations);
  for (let k = 0; k < iterations; k++) {
    if (!needdamp) {
      gaussianBlur(tmpI, tmp, W, H, sigma, "div", luminance);
    } else {
      gaussianBlur(tmpI, tmp, W, H, sigma);
      dcdamping(tmp, luminance, damping, n);
    }
    if (o.storeRatio) for (let i = 0; i < n; i++) tmp[i] = o.storeRatio(tmp[i]);
    gaussianBlur(tmp, tmpI, W, H, sigma, "mult");
    for (let i = 0; i < n; i++) tmpI[i] = q(tmpI[i], luminance[i]);
  }
  for (let i = 0; i < n; i++) luminance[i] = intp(blend[i] * amount, Math.max(tmpI[i], 0), luminance[i]);
  if (blur) for (let i = 0; i < n; i++) luminance[i] = intp(blend[i], luminance[i], Math.max(blur[i], 0));
}

/** ImProcFunctions::sharpening on an L plane (RawTherapee units), in place. */
export function sharpening(L: Grid, W: number, H: number, p: Params, o: RefOptions = {}): void {
  if (!p.on || p.amount < 1 || W < 8 || H < 8) return;
  const scale = o.scale ?? 1;
  const blend = buildBlendMask(L, W, H, p.contrast / 100.0);
  if (o.storeBlend) for (let i = 0; i < W * H; i++) blend[i] = o.storeBlend(blend[i]);
  const q = o.store ?? ((v: number) => v);
  if (p.method === "rld") {
    deconvsharpening(L, blend, W, H, p, o);
    return;
  }
  const n = W * H;
  let blur: Grid | null = null;
  if (p.blurRadius >= BLUR_RADIUS_MIN) {
    blur = new Float32Array(n);
    gaussianBlur(L, blur, W, H, p.blurRadius * scale);
    for (let i = 0; i < n; i++) blur[i] = intp(blend[i], L[i], Math.max(blur[i], 0));
  }
  const b2 = new Float32Array(n);
  let base: Grid = L;
  if (p.edgesOnly) {
    base = bilateral(L, W, H, p.edgesRadius * scale, p.edgesTolerance);
    for (let i = 0; i < n; i++) base[i] = q(base[i], L[i]);
  }
  gaussianBlur(base, b2, W, H, p.radius * scale);
  for (let i = 0; i < n; i++) b2[i] = q(b2[i], base[i]);
  if (!p.haloControl) {
    for (let i = 0; i < n; i++) {
      const diff = base[i] - b2[i];
      const delta = thresholdMultiply(p, Math.min(Math.abs(diff), UPPER_BOUND), f(p.amount * diff * 0.01));
      L[i] = f(intp(blend[i], L[i] + delta, L[i]));
    }
  } else {
    sharpenHaloCtrl(L, b2, p.edgesOnly ? base : new Float32Array(L), blend, W, H, p);
  }
  if (blur) for (let i = 0; i < n; i++) L[i] = f(intp(blend[i], L[i], Math.max(blur[i], 0)));
}

/** The whole tool on a linear Rec.709 image: L in, sharpened, and a and b kept. */
export function sharpenImage(img: Image, p: Params, o: RefOptions = {}): Image {
  const { width: W, height: H } = img;
  const L0 = lumaPlane(o.passInput ?? img);
  const L = new Float32Array(L0);
  sharpening(L, W, H, p, o);
  if (o.store) for (let px = 0; px < W * H; px++) L[px] = o.store(L[px], L0[px]);
  const out = new Float32Array(img.data.length);
  for (let px = 0; px < W * H; px++) {
    const rgb = [img.data[3 * px], img.data[3 * px + 1], img.data[3 * px + 2]];
    out.set(L[px] === L0[px] ? rgb : withLuminanceShift(rgb, L[px] - L0[px]), 3 * px);
  }
  return { width: W, height: H, data: out };
}
