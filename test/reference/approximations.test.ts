// The approximation study: what the GPU's stand-ins cost against rtref, in
// RawTherapee's L units (0 to 32768; one L* is 327.68).
//  • The recursive blur is drawn as a FIR of its own impulse response,
//    iirRadius (6 sigma, at most 18) taps a side, plus the SSE build's
//    far-edge correction. The correction is what makes it exact: without it
//    the right and bottom edges are hundreds of L units off on a noisy line.
//    Truncation leaves about 10⁻⁴ of the local contrast.
//  • The passes keep their state in half floats: L split in two halves (a
//    half and its remainder, so about 22 bits), and every other value as a
//    difference from its base (the bilateral's and the blur's from the L they
//    filter, the deconvolution's estimate from the observed L and its ratio
//    from 1). This study rounds the same values in rtref; the GPU spec checks
//    the shaders themselves.

import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, iirRadius, type Params } from "../../src/model";
import { loadFixture } from "./fixture";
import { firLine, recursionTaps, storeBlend, storeHalf, storeRatio } from "./gpumodel";
import { gaussianBlur, lumaPlane, sharpening, withLineFilter } from "./rtref";

function scene(W: number, H: number, seed: number): Float32Array {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const L = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const step = x > W * 0.6 && y < H * 0.5 ? 9000 : 0;
      L[y * W + x] = 6000 + 14000 * (x / W) + step + 4000 * Math.sin(x * 0.9) * Math.sin(y * 0.6) + 3000 * (rnd() - 0.5);
    }
  }
  return L;
}

describe("the recursive blur as a FIR with the far-edge correction", () => {
  const W = 72;
  const H = 54;
  it.each([0.6, 0.9, 1.2, 1.6, 2, 2.5, 3])("sigma %s, against RawTherapee's recursion", (sigma) => {
    const src = scene(W, H, 9);
    const ref = new Float32Array(W * H);
    gaussianBlur(src, ref, W, H, sigma);
    const fir = new Float32Array(W * H);
    withLineFilter(firLine, () => gaussianBlur(src, fir, W, H, sigma));
    let worst = 0;
    for (let i = 0; i < W * H; i++) worst = Math.max(worst, Math.abs(fir[i] - ref[i]));
    expect(worst).toBeLessThan(3);
  });
});

describe("half-float state, as the passes keep it", () => {
  const fixture = loadFixture();
  const { width: W, height: H } = fixture.input;
  const L0 = lumaPlane(fixture.input);
  const on = (p: Partial<Params>): Params => ({ ...DEFAULT_PARAMS, on: true, ...p });
  // Bounds on the worst pixel; the measured worst, 99th percentile and median
  // (2026-11-09, with the ratio kept as itself less 1 and not kept at all by the
  // fused 3x3 and 5x5 iterations) are in each name; each bound is about twice
  // the worst.
  const cases: [string, Params, number][] = [
    ["USM default (worst 1.6, p99 0.9, median 0.07)", on({}), 4],
    ["USM radius 2.8, amount 500 (23, 17, 1.4)", on({ radius: 2.8, amount: 500, contrast: 0 }), 60],
    ["USM edges only, halo (10, 4.2, 0.19)", on({ radius: 1.2, amount: 600, edgesOnly: true, edgesRadius: 2.5, edgesTolerance: 400, haloControl: true, haloAmount: 60 }), 25],
    ["RL default, 30 iterations (19, 9.7, 0.47)", on({ method: "rld" }), 40],
    ["RL radius 2, 100 iterations (90, 42, 3.9)", on({ method: "rld", deconvRadius: 2, deconvIterations: 100 }), 180],
    ["RL radius 0.75, 100 iterations (71, 31, 2.0)", on({ method: "rld", deconvIterations: 100 }), 140],
    ["RL damping 50, radius 1.6, 100 iterations (183, 58, 3.2)", on({ method: "rld", deconvDamping: 50, deconvRadius: 1.6, deconvIterations: 100 }), 370],
  ];
  it.each(cases)("%s", (_name, p, bound) => {
    const exact = new Float32Array(L0);
    sharpening(exact, W, H, p);
    const gpu = new Float32Array(L0);
    withLineFilter(firLine, () => sharpening(gpu, W, H, p, { store: storeHalf, storeBlend, storeRatio }));
    let worst = 0;
    for (let i = 0; i < W * H; i++) worst = Math.max(worst, Math.abs(gpu[i] - exact[i]));
    expect(worst).toBeLessThan(bound);
  });
});

describe("the recursion's taps", () => {
  // A vertical line through RawTherapee's blur: every column is constant, so
  // the vertical half leaves it and a row is the horizontal impulse response.
  it.each([0.6, 1.3, 2, 3])("are its impulse response, normalized, at sigma %s", (sigma) => {
    const W = 301;
    const H = 8;
    const src = new Float32Array(W * H);
    for (let y = 0; y < H; y++) src[y * W + 150] = 1;
    const out = new Float32Array(W * H);
    gaussianBlur(src, out, W, H, sigma);
    const reach = iirRadius(sigma);
    const taps = recursionTaps(sigma, reach);
    let total = 0;
    for (let k = -reach; k <= reach; k++) total += out[3 * W + 150 + k];
    for (let k = 0; k <= reach; k++) expect(taps[k]).toBeCloseTo(out[3 * W + 150 + k] / total, 6);
  });
});
