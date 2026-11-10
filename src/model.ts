// RawTherapee's Sharpening tool (rtengine/ipsharpen.cc, rt_algo.cc, gauss.cc,
// bilateral2.h, params/threshold.h; GPL-3.0-or-later): the parts the CPU needs.
// The edit's defaults and ranges (procparams.cc SharpeningParams, the GUI's
// adjusters in rtgui/tools/sharpening.cc), the blur and bilateral kernels the
// passes pick by radius, and the draw schedule glsl.ts runs. The two must
// agree; the tests pin both.
//
// Copyright (c) 2004-2010 Gabor Horvath <hgabor@rawtherapee.com> (ipsharpen.cc,
// gauss.cc, bilateral2.h)
// Copyright (c) 2017-2018 Ingo Weyrich <heckflosse67@gmx.de> (rt_algo.cc)
// Copyright (c) 2025 Daniel Gao <daniel.gao.work@gmail.com> (params/threshold.h)

export type Method = "usm" | "rld";

export interface Params {
  on: boolean;
  method: Method;
  /** The contrast threshold of the blend mask, 0 to 200; 0 sharpens everywhere. */
  contrast: number;
  /** Below 0.25 off; otherwise the radius that blurs the low-contrast areas. */
  blurRadius: number;
  radius: number;
  /** 1 to 1000 %. Also gates deconvolution, as RawTherapee's does. */
  amount: number;
  /** The threshold's four points in L units of 0 to 32768: sharpening fades in
   *  from bottomLeft to topLeft and out from topRight to bottomRight. */
  thresholdBottomLeft: number;
  thresholdTopLeft: number;
  thresholdBottomRight: number;
  thresholdTopRight: number;
  edgesOnly: boolean;
  edgesRadius: number;
  edgesTolerance: number;
  haloControl: boolean;
  haloAmount: number;
  deconvRadius: number;
  deconvAmount: number;
  deconvDamping: number;
  deconvIterations: number;
}

export type NumericKey = {
  [K in keyof Params]: Params[K] extends number ? K : never;
}[keyof Params];

export const DEFAULT_PARAMS: Readonly<Params> = {
  on: false,
  method: "usm",
  contrast: 20,
  blurRadius: 0.2,
  radius: 0.5,
  amount: 200,
  thresholdBottomLeft: 20,
  thresholdTopLeft: 80,
  thresholdBottomRight: 2000,
  thresholdTopRight: 1200,
  edgesOnly: false,
  edgesRadius: 1.9,
  edgesTolerance: 1800,
  haloControl: false,
  haloAmount: 85,
  deconvRadius: 0.75,
  deconvAmount: 100,
  deconvDamping: 0,
  deconvIterations: 30,
};

export interface Range {
  min: number;
  max: number;
  step: number;
}

/** The GUI's adjuster ranges and steps. */
export const RANGES: Readonly<Record<NumericKey, Range>> = {
  contrast: { min: 0, max: 200, step: 1 },
  blurRadius: { min: 0.2, max: 2, step: 0.05 },
  radius: { min: 0.3, max: 3, step: 0.01 },
  amount: { min: 1, max: 1000, step: 1 },
  thresholdBottomLeft: { min: 0, max: 2000, step: 1 },
  thresholdTopLeft: { min: 0, max: 2000, step: 1 },
  thresholdBottomRight: { min: 0, max: 2000, step: 1 },
  thresholdTopRight: { min: 0, max: 2000, step: 1 },
  edgesRadius: { min: 0.5, max: 2.5, step: 0.1 },
  edgesTolerance: { min: 10, max: 10000, step: 100 },
  haloAmount: { min: 1, max: 100, step: 1 },
  deconvRadius: { min: 0.4, max: 2.5, step: 0.01 },
  deconvAmount: { min: 0, max: 100, step: 1 },
  deconvDamping: { min: 0, max: 100, step: 1 },
  deconvIterations: { min: 5, max: 100, step: 1 },
};

/** gauss.cc's thresholds: below GAUSS_SKIP a blur copies, below the 3x3
 *  limit it is an exact 3x3, MULT and DIV blurs use truncated 5x5 and 7x7
 *  kernels up to theirs, and anything wider is the Young-van Vliet recursion. */
export const GAUSS_SKIP = 0.25;
export const GAUSS_3X3_LIMIT = 0.6;
export const GAUSS_5X5_LIMIT = 0.84;
export const GAUSS_7X7_LIMIT = 1.15;
/** ipsharpen.cc runs the blur radius step from this radius up. */
export const BLUR_RADIUS_MIN = 0.25;

export type Kernel = "skip" | "3x3" | "5x5" | "7x7" | "iir";
export type BlurMode = "standard" | "mult" | "div";

/** The kernel gaussianBlur picks for a sigma and mode (src != dst). */
export function kernelFor(sigma: number, mode: BlurMode): Kernel {
  if (sigma < GAUSS_SKIP) return "skip";
  if (sigma < GAUSS_3X3_LIMIT) return "3x3";
  if (mode !== "standard" && sigma <= GAUSS_5X5_LIMIT) return "5x5";
  if (mode !== "standard" && sigma <= GAUSS_7X7_LIMIT) return "7x7";
  return "iir";
}

/** Draws a blur takes on the GPU: the recursion's horizontal and vertical
 *  halves, one for the others. */
export const kernelDraws = (k: Kernel): number => (k === "iir" ? 2 : 1);

/** Taps each side of the recursion's impulse response: 6 sigma, past which the
 *  dropped tail moves a result by under 10⁻⁴ of the local contrast. */
export const IIR_REACH = 6;
export const MAX_IIR_RADIUS = 18;
export const iirRadius = (sigma: number): number => Math.min(Math.ceil(IIR_REACH * sigma), MAX_IIR_RADIUS);

/** bilateral2.h's kernels, from sigma 0.5 to 2.5 in tenths: the half-width r
 *  and the weights of one quadrant, outer row first, A[r - |dy|][r - |dx|]. */
export const BILATERAL_TABLES: readonly { sigma: number; r: number; a: readonly number[] }[] = [
  { sigma: 0.5, r: 1, a: [1, 7, 7, 55] },
  { sigma: 0.6, r: 1, a: [1, 4, 4, 16] },
  { sigma: 0.7, r: 2, a: [0, 0, 1, 0, 8, 21, 1, 21, 59] },
  { sigma: 0.8, r: 2, a: [0, 0, 1, 0, 5, 10, 1, 10, 23] },
  { sigma: 0.9, r: 2, a: [0, 1, 2, 1, 6, 12, 2, 12, 22] },
  { sigma: 1.0, r: 2, a: [0, 1, 2, 1, 4, 7, 2, 7, 12] },
  { sigma: 1.1, r: 3, a: [0, 0, 1, 1, 0, 2, 5, 8, 1, 5, 18, 27, 1, 8, 27, 41] },
  { sigma: 1.2, r: 3, a: [0, 0, 1, 1, 0, 1, 4, 6, 1, 4, 11, 16, 1, 6, 16, 23] },
  { sigma: 1.3, r: 3, a: [0, 0, 1, 1, 0, 2, 4, 6, 1, 4, 11, 14, 1, 6, 14, 19] },
  { sigma: 1.4, r: 3, a: [0, 1, 2, 3, 1, 4, 8, 10, 2, 8, 17, 21, 3, 10, 21, 28] },
  { sigma: 1.5, r: 4, a: [0, 0, 0, 1, 1, 0, 1, 2, 4, 5, 0, 2, 6, 12, 14, 1, 4, 12, 22, 28, 1, 5, 14, 28, 35] },
  { sigma: 1.6, r: 4, a: [0, 0, 0, 1, 1, 0, 1, 2, 3, 4, 0, 2, 5, 9, 10, 1, 3, 9, 15, 19, 1, 4, 10, 19, 23] },
  { sigma: 1.7, r: 4, a: [0, 0, 1, 1, 1, 0, 1, 2, 3, 4, 1, 2, 5, 8, 9, 1, 3, 8, 13, 16, 1, 4, 9, 16, 19] },
  { sigma: 1.8, r: 4, a: [0, 0, 1, 2, 2, 0, 1, 3, 5, 5, 1, 3, 6, 10, 12, 2, 5, 10, 16, 19, 2, 5, 12, 19, 22] },
  { sigma: 1.9, r: 4, a: [0, 0, 1, 2, 2, 0, 1, 3, 4, 5, 1, 3, 5, 8, 9, 2, 4, 8, 12, 14, 2, 5, 9, 14, 16] },
  { sigma: 2.0, r: 5, a: [0, 0, 0, 1, 1, 1, 0, 0, 1, 2, 3, 3, 0, 1, 2, 4, 7, 7, 1, 2, 4, 8, 12, 14, 1, 3, 7, 12, 18, 20, 1, 3, 7, 14, 20, 23] },
  { sigma: 2.1, r: 5, a: [0, 0, 0, 1, 1, 1, 0, 0, 1, 2, 3, 3, 0, 1, 2, 4, 6, 7, 1, 2, 4, 8, 11, 12, 1, 3, 6, 11, 15, 17, 1, 3, 7, 12, 17, 19] },
  { sigma: 2.2, r: 5, a: [0, 0, 0, 1, 1, 2, 0, 1, 2, 3, 3, 4, 1, 2, 3, 5, 7, 8, 1, 3, 5, 9, 12, 13, 1, 3, 7, 12, 16, 18, 2, 4, 8, 13, 18, 20] },
  { sigma: 2.3, r: 5, a: [0, 0, 1, 1, 1, 1, 0, 1, 1, 2, 3, 3, 1, 1, 3, 5, 6, 7, 1, 2, 5, 7, 10, 11, 1, 3, 6, 10, 13, 14, 1, 3, 7, 11, 14, 16] },
  { sigma: 2.4, r: 5, a: [0, 0, 1, 1, 1, 1, 0, 1, 1, 2, 3, 3, 1, 1, 3, 4, 5, 6, 1, 2, 4, 6, 8, 9, 1, 3, 5, 8, 10, 11, 1, 3, 6, 9, 11, 12] },
  { sigma: 2.5, r: 5, a: [0, 0, 1, 1, 1, 1, 0, 1, 1, 2, 3, 3, 1, 1, 2, 4, 5, 5, 1, 2, 4, 5, 7, 7, 1, 3, 5, 7, 9, 9, 1, 3, 5, 7, 9, 10] },
];

/** bilateral()'s pick: none below 0.45, else the table whose tenth is nearest
 *  (each band ends below the next x.x5). */
export function bilateralTable(sigma: number): number {
  if (sigma < 0.45) return -1;
  let k = 0;
  while (k < BILATERAL_TABLES.length - 1 && sigma >= 0.55 + 0.1 * k) k++;
  return k;
}

/** Rows of the bilateral window one draw sums. */
export const BILATERAL_ROWS_PER_DRAW = 3;
export const MAX_BILATERAL_RADIUS = 5;

export function bilateralDraws(sigma: number): number {
  const k = bilateralTable(sigma);
  return k < 0 ? 0 : Math.ceil((2 * BILATERAL_TABLES[k].r + 1) / BILATERAL_ROWS_PER_DRAW);
}

/** The host's per-pass draw cap. */
export const MAX_DRAWS = 1024;
/** The luminance, split over two channels. */
export const PREP_DRAWS = 1;
/** The blend mask: the gradient's sigmoid, then its blur's two halves. */
export const BLEND_DRAWS = 3;

/** Whether the edit runs at all: RawTherapee's gate (enabled, amount >= 1),
 *  and deconvolution's own early return (no amount and no blur radius). */
export function isActive(p: Params): boolean {
  if (!p.on || p.amount < 1) return false;
  if (p.method === "rld" && p.deconvAmount === 0 && p.blurRadius < BLUR_RADIUS_MIN) return false;
  return true;
}

/** Draws of the last step: the result, after the blur radius's horizontal
 *  half when that blur is the recursion. */
export function finalDraws(p: Params, scale: number): number {
  return p.blurRadius >= BLUR_RADIUS_MIN ? kernelDraws(kernelFor(p.blurRadius * scale, "standard")) : 1;
}

/** Draws one deconvolution iteration takes: the blur that divides (or the
 *  plain blur that damping follows) and the one that multiplies. 0 when the
 *  radius is below GAUSS_SKIP, where both blurs copy and leave the estimate. */
export function iterationDraws(p: Params, scale: number): number {
  const sigma = p.deconvRadius * scale;
  if (sigma < GAUSS_SKIP) return 0;
  const first = kernelFor(sigma, p.deconvDamping > 0 ? "standard" : "div");
  return kernelDraws(first) + kernelDraws(kernelFor(sigma, "mult"));
}

/** The draws of each step, in the order the pass runs them, on a render whose
 *  radii are `scale` times the source's. */
export interface Schedule {
  prep: number;
  bilateral: number;
  blur: number;
  apply: number;
  iterations: number;
  perIteration: number;
  blend: number;
  final: number;
  total: number;
}

export function schedule(p: Params, scale = 1): Schedule {
  const usm = p.method === "usm";
  const bilateral = usm && p.edgesOnly ? bilateralDraws(p.edgesRadius * scale) : 0;
  const blur = usm ? kernelDraws(kernelFor(p.radius * scale, "standard")) : 0;
  const apply = usm ? 1 : 0;
  const perIteration = usm ? 0 : iterationDraws(p, scale);
  const iterations = perIteration > 0 ? Math.round(p.deconvIterations) : 0;
  const final = finalDraws(p, scale);
  const total = PREP_DRAWS + bilateral + blur + apply + iterations * perIteration + BLEND_DRAWS + final;
  return { prep: PREP_DRAWS, bilateral, blur, apply, iterations, perIteration, blend: BLEND_DRAWS, final, total };
}

/** The pass's draw count: the schedule at full size, which no smaller render
 *  exceeds (every radius shrinks with the render), and 0 while idle. */
export function drawCount(p: Params): number {
  return isActive(p) ? Math.min(schedule(p, 1).total, MAX_DRAWS) : 0;
}
