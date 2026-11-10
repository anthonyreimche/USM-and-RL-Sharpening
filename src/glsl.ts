// The GPU side of model.ts: RawTherapee's Sharpening (rtengine/ipsharpen.cc,
// rt_algo.cc buildBlendMask, gauss.cc, bilateral2.h, params/threshold.h;
// GPL-3.0-or-later).
//
// Copyright (c) 2004-2010 Gabor Horvath <hgabor@rawtherapee.com> (ipsharpen.cc,
// gauss.cc, bilateral2.h, color.cc)
// Copyright (c) 2017-2018 Ingo Weyrich <heckflosse67@gmx.de> (rt_algo.cc)
// Copyright (c) 2025 Daniel Gao <daniel.gao.work@gmail.com> (params/threshold.h)
//
// One four-channel pass; every draw decodes uPassIndex into a step of the
// schedule (model.ts schedule()) and draws past it copy the result through.
// The state, in L / 32768 (RawTherapee's L over its range, L* over 100):
//   x, y  L as a half and its remainder, so about 22 bits;
//   z     unsharp mask: the bilateral's numerator, then its result less L,
//         then the unblended change; deconvolution: the estimate less L;
//   w     the bilateral's denominator, a blur less what it blurs, the
//         deconvolution's ratio less 1, then the blend mask.
// The blend mask is built last, when y and w are free of the steps before it,
// as RawTherapee uses it only to mix the result. The final draw leaves the
// change of L in x for the inline, which moves L* of the full-precision pixel
// by it and keeps a* and b*.
//
// gaussianBlur's recursion (Young-van Vliet with Triggs-Sdika's boundary) is
// drawn as a FIR of its own impulse response, the autocorrelation of the
// causal recursion, from the Yule-Walker equations, 6 sigma a side, read with
// the edge clamped: the recursion's constant extension. The SSE build starts
// the backward pass at the far edge with Triggs-Sdika's matrix normalized
// differently from the scalar build, rho times too far from the edge value;
// the FIR adds that difference, carried back by the recursion, near the right
// and bottom edges. Its 3x3, 5x5 and 7x7 kernels, the bilateral's tables,
// the threshold, the halo control and the borders are RawTherapee's.

import {
  BILATERAL_ROWS_PER_DRAW,
  BILATERAL_TABLES,
  BLEND_DRAWS,
  BLUR_RADIUS_MIN,
  GAUSS_3X3_LIMIT,
  GAUSS_5X5_LIMIT,
  GAUSS_7X7_LIMIT,
  GAUSS_SKIP,
  IIR_REACH,
  MAX_BILATERAL_RADIUS,
  MAX_IIR_RADIUS,
  PREP_DRAWS,
} from "./model";

/** A GLSL float literal that always carries a decimal point. */
export function glslLiteral(v: number): string {
  const s = v.toPrecision(10);
  if (/e/i.test(s)) {
    const [mantissa, exponent] = s.split(/e/i);
    const m = mantissa.includes(".") ? mantissa : `${mantissa}.0`;
    return `${m}e${Number(exponent)}`;
  }
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, ".0") : `${s}.0`;
}

const lit = glslLiteral;

/** iccmatrices.h xyz_sRGB: linear Rec.709 to XYZ, Bradford-adapted to D50. */
export const XYZ_SRGB: readonly (readonly number[])[] = [
  [0.4360747, 0.3850649, 0.1430804],
  [0.2225045, 0.7168786, 0.0606169],
  [0.0139322, 0.0971045, 0.7141733],
];

function invert3(m: readonly (readonly number[])[]): number[][] {
  const [a, b, c] = m;
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  return [
    [(b[1] * c[2] - b[2] * c[1]) / det, (a[2] * c[1] - a[1] * c[2]) / det, (a[1] * b[2] - a[2] * b[1]) / det],
    [(b[2] * c[0] - b[0] * c[2]) / det, (a[0] * c[2] - a[2] * c[0]) / det, (a[2] * b[0] - a[0] * b[2]) / det],
    [(b[0] * c[1] - b[1] * c[0]) / det, (a[1] * c[0] - a[0] * c[1]) / det, (a[0] * b[1] - a[1] * b[0]) / det],
  ];
}

/** A row-major matrix as GLSL's column-major mat3 constructor takes it. */
const mat3 = (m: readonly (readonly number[])[]): string =>
  `mat3(${[0, 1, 2].flatMap((col) => [0, 1, 2].map((row) => lit(m[row][col]))).join(", ")})`;

/** Lab's kappa and epsilon (color.h), and D50 as RawTherapee rounds it. */
const KAPPA = 24389 / 27;
const EPSILON = 216 / 24389;
const D50X = 0.9642;
const D50Z = 0.8249;

/** L in units of 32768 (L* over 100) of a linear Rec.709 pixel: RGB2Lab's L. */
const LUMINANCE_GLSL = `
float shCbrt(float v) {
  float r = exp2(log2(v) / 3.0);
  return r - (r * r * r - v) / (3.0 * r * r);
}
float shLuminance(vec3 rgb) {
  float y = dot(vec3(${XYZ_SRGB[1].map(lit).join(", ")}), rgb);
  return y > ${lit(EPSILON)} ? 1.16 * shCbrt(y) - 0.16 : ${lit(KAPPA / 100)} * y;
}
`;

/** The inline's helpers: the pixel's L* moved by dL (in L* over 100), a* and b*
 *  kept, through XYZ (D50) as Lab2XYZ inverts XYZ2Lab. */
export const INLINE_HELPERS = `
float shLabF(float t) {
  if (t > ${lit(EPSILON)}) {
    float r = exp2(log2(t) / 3.0);
    return r - (r * r * r - t) / (3.0 * r * r);
  }
  return (${lit(KAPPA)} * t + 16.0) / 116.0;
}
float shLabFInv(float f) {
  return f > ${lit(6 / 29)} ? f * f * f : (116.0 * f - 16.0) / ${lit(KAPPA)};
}
vec3 shShiftLightness(vec3 rgb, float dL) {
  vec3 xyz = ${mat3(XYZ_SRGB)} * rgb / vec3(${lit(D50X)}, 1.0, ${lit(D50Z)});
  float shift = dL * ${lit(100 / 116)};
  vec3 moved = vec3(shLabFInv(shLabF(xyz.x) + shift), shLabFInv(shLabF(xyz.y) + shift), shLabFInv(shLabF(xyz.z) + shift));
  return ${mat3(invert3(XYZ_SRGB))} * (moved * vec3(${lit(D50X)}, 1.0, ${lit(D50Z)}));
}
`;

export const INLINE_GLSL = `
if (draws > 0) {
  float shDL = stageResult.x;
  if (shDL != 0.0) c.rgb = shShiftLightness(c.rgb, shDL);
}
`;

// ── The pass ─────────────────────────────────────────────────────────────────
//
// D3D11 (ANGLE) shapes this code: no arrays at all, since a const array is
// copied into indexable registers for every pixel of every draw and a local
// array indexed in a loop gets such a copy per call site. Tables are code,
// generated here, and loops roll scalars.

export const STEP = {
  zero: 0,
  prep: 1,
  bilateral: 2,
  blur: 3,
  apply: 4,
  divide: 5,
  multiply: 6,
  blend: 7,
  final: 8,
  copy: 9,
} as const;

/** Kernel kinds, as model.ts names them. */
const K_SKIP = 0;
const K_3X3 = 1;
const K_5X5 = 2;
const K_7X7 = 3;
const K_IIR = 4;

/** What a line of the recursion filters, read from a texel. */
export const LINE = {
  /** L, the blend mask's source and the unsharp mask's blur radius. */
  luminance: 0,
  base: 2,
  /** The unsharp mask's horizontal half: its base plus that half's change. */
  baseBlurred: 3,
  /** The deconvolution's estimate, and its horizontal half. */
  estimate: 4,
  estimateBlurred: 5,
  /** The ratio less 1, and its horizontal half. */
  ratio: 6,
  blend: 7,
  observed: 8,
  /** The blur radius's horizontal half: y over the source's half. */
  finalBlurred: 9,
} as const;

/** The blurs a draw can read. */
export const FILTER = {
  none: 0,
  gauss3x3: 1,
  disc5: 2,
  disc7: 3,
  row: 4,
  column: 5,
} as const;

const R = MAX_IIR_RADIUS;
const BR = MAX_BILATERAL_RADIUS;

/** compute5x5kernel's and compute7x7kernel's discs: the offsets within
 *  3 x 0.84 and 3 x 1.15 pixels, as squared distances. */
const DISC5 = { r: 2, limit: Math.floor((3 * 0.84) ** 2) };
const DISC7 = { r: 3, limit: Math.floor((3 * 1.15) ** 2) };

// The discs' gaussian, normalized; gauss5x5/7x7 sum it over the interior, the
// 7x7 its (i - 2, j + 1) tap times c21 twice. Returns the weighted sum less
// the weights times the texel's value, and the weights' sum. The gaussian is
// separable: a row's factor times the column's.
function disc(name: string, { r, limit }: { r: number; limit: number }, quirk: boolean): string {
  const offsets = Array.from({ length: 2 * r + 1 }, (_, k) => k - r);
  const factors = Array.from({ length: r + 1 }, (_, j) => `  float c${j} = exp(${lit(j * j)} / temp);`);
  const row = (body: (j: number) => string[]) =>
    offsets.map((j) => body(j).join("\n")).join("\n");
  return `
vec2 ${name}(ivec2 q, float sigma, int what) {
  float temp = -2.0 * sigma * sigma;
${factors.join("\n")}
  float sum = 0.0;
  for (int i = -${r}; i <= ${r}; i++) {
    float rf = exp(float(i * i) / temp);
${row((j) => [`    if (i * i + ${j * j} <= ${limit}) sum += rf * c${Math.abs(j)};`])}
  }
${quirk ? "  float quirk = exp(5.0 / temp) / sum;\n" : ""}  vec4 la;
  vec2 lb;
  shLine(what, la, lb);
  ivec2 last = shSize() - 1;
  float own = shRead(shAtIn(q, last), la, lb);
  float acc = 0.0;
  float weights = 0.0;
  for (int i = -${r}; i <= ${r}; i++) {
    float rf = exp(float(i * i) / temp) / sum;
${row((j) => [
    `    if (i * i + ${j * j} <= ${limit}) {`,
    `      float w = rf * c${Math.abs(j)};`,
    ...(quirk && j === 1 ? ["      if (i == -2) w *= quirk;"] : []),
    "      weights += w;",
    `      acc += w * (shRead(shAtIn(q + ivec2(${j}, i), last), la, lb) - own);`,
    "    }",
  ])}
  }
  return vec2(acc, weights);
}`;
}

// sharpenHaloCtrl over the interior: the change held to the extremes of the
// np values around this and the two previous columns (a queue that starts at
// 0 on each row) and of L, and scaled down past them.
function haloControl(): string {
  const n = (a: number, b: number) => `n${a}${b}`;
  const reads: string[] = [];
  for (let a = 0; a < 5; a++) {
    for (let b = 0; b < 5; b++) reads.push(`  float ${n(a, b)} = shBase(shAt(q + ivec2(${b - 2}, ${a - 2})));`);
  }
  // The column j - 2 + col, whose np values centre one to its right.
  const columns = [0, 1, 2].map((col) => {
    const values = [0, 1, 2].map((row) => {
      const box: string[] = [];
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) box.push(n(row + a, col + b));
      return [
        `    np = 2.0 * (${box.join(" + ")}) / 27.0 + ${n(row + 1, col + 1)} / 3.0;`,
        "    hi = first ? np : max(hi, np);",
        "    lo = first ? np : min(lo, np);",
        "    first = false;",
      ].join("\n");
    });
    return `  if (q.x >= ${4 - col}) {\n${values.join("\n")}\n  }`;
  });
  return `
vec4 shApplyHalo(ivec2 q, vec4 c) {
  ivec2 size = shSize();
  if (q.x < 2 || q.y < 2 || q.x >= size.x - 2 || q.y >= size.y - 2) return vec4(c.xy, 0.0, 0.0);
  float delta = shDelta(-c.w);
${reads.join("\n")}
  float hi = 0.0;
  float lo = 0.0;
  float np = 0.0;
  bool first = true;
${columns.join("\n")}
  if (q.x < 4) {
    hi = max(hi, 0.0);
    lo = min(lo, 0.0);
  }
  float lab = shL(c);
  hi = max(hi, lab);
  lo = min(lo, lab);
  float scale = (100.0 - haloAmount) * 0.01;
  float moved = lab + delta;
  float change = delta;
  if (moved > hi) change = (hi - lab) + (moved - hi) * scale;
  else if (moved < lo) change = (lo - lab) - (lo - moved) * scale;
  return vec4(c.xy, change, 0.0);
}`;
}

/** Bits a bilateral weight takes in shBilWeights' packing; the largest is 59. */
const WEIGHT_BITS = 6;
const WEIGHT_MASK = (1 << WEIGHT_BITS) - 1;

/** bilateral2.h's weight A[r - |dy|][r - |dx|], 0 past the table's radius. */
function bilateralWeight(t: number, ady: number, adx: number): number {
  const { r, a } = BILATERAL_TABLES[t];
  if (ady > r || adx > r) return 0;
  const w = a[(r - ady) * (r + 1) + r - adx];
  if (!Number.isInteger(w) || w < 0 || w > WEIGHT_MASK) throw new Error(`bilateral weight ${w} does not pack`);
  return w;
}

/** A row's weights for |dx| 0 to 2 and 3 to 5, three to an int. */
function packedRow(t: number, ady: number): string {
  const pack = (from: number) => [0, 1, 2].reduce((bits, k) => bits | (bilateralWeight(t, ady, from + k) << (WEIGHT_BITS * k)), 0);
  return `ivec2(${pack(0)}, ${pack(3)})`;
}

// bilateral2.h's tables as code: each table's radius, and the weights of its
// row |dy|, packed.
function bilateralTables(): string {
  const radius = BILATERAL_TABLES.map((t) => t.r);
  const steps = radius.flatMap((r, t) => (t > 0 && r !== radius[t - 1] ? [t] : []));
  const chain = steps.map((t) => `t < ${t} ? ${radius[t - 1]} : `).join("") + `${radius[radius.length - 1]}`;
  const tables = BILATERAL_TABLES.map(({ r }, t) => {
    const rowsOf = Array.from({ length: r }, (_, ady) => `ady == ${ady} ? ${packedRow(t, ady)} : `).join("");
    return `  if (t == ${t}) return ${rowsOf}${packedRow(t, r)};`;
  });
  return `
int shBilRadius(int t) { return ${chain}; }
ivec2 shBilWeights(int t, int ady) {
${tables.join("\n")}
  return ivec2(0);
}
float shBilWeight(ivec2 row, int adx) {
  int bits = adx < 3 ? row.x : row.y;
  return float((bits >> (${WEIGHT_BITS} * (adx < 3 ? adx : adx - 3))) & ${WEIGHT_MASK});
}`;
}

export const PASS_HELPERS = `
${LUMINANCE_GLSL}
const int SH_K_SKIP = ${K_SKIP};
const int SH_K_3X3 = ${K_3X3};
const int SH_K_5X5 = ${K_5X5};
const int SH_K_7X7 = ${K_7X7};
const int SH_K_IIR = ${K_IIR};
${bilateralTables()}

ivec2 shSize() { return ivec2(floor(1.0 / uTexel + 0.5)); }
// The render's size over the source's: radii in source pixels, as
// RawTherapee divides by its preview scale. Never above 1, which the draw
// count is sized for.
float shScale() {
  vec2 size = vec2(shSize());
  float src = max(uSourceSize.x, uSourceSize.y);
  return src > 0.0 ? min(max(size.x, size.y) / src, 1.0) : 1.0;
}
vec4 shAt(ivec2 t) { return fetchPrev4(clamp(t, ivec2(0), shSize() - 1)); }

int shKernel(float sigma, int mode) {
  if (sigma < ${lit(GAUSS_SKIP)}) return SH_K_SKIP;
  if (sigma < ${lit(GAUSS_3X3_LIMIT)}) return SH_K_3X3;
  if (mode != 0 && sigma <= ${lit(GAUSS_5X5_LIMIT)}) return SH_K_5X5;
  if (mode != 0 && sigma <= ${lit(GAUSS_7X7_LIMIT)}) return SH_K_7X7;
  return SH_K_IIR;
}
int shKernelDraws(int k) { return k == SH_K_IIR ? 2 : 1; }
int shBilateralTable(float sigma) {
  if (sigma < 0.45) return -1;
  int k = 0;
  for (int i = 0; i < ${BILATERAL_TABLES.length - 1}; i++) {
    if (sigma >= 0.55 + 0.1 * float(i)) k = i + 1;
  }
  return k;
}
int shBilateralDraws(float sigma) {
  int t = shBilateralTable(sigma);
  return t < 0 ? 0 : (2 * shBilRadius(t) + ${BILATERAL_ROWS_PER_DRAW}) / ${BILATERAL_ROWS_PER_DRAW};
}
bool shUsm() { return method < 0.5; }
float shDeconvSigma() { return deconvRadius * shScale(); }
bool shDamped() { return deconvDamping > 0.0; }

// Which step this draw runs (STEP in glsl.ts), its index within the step, and
// the schedule's draw count.
void shSchedule(out int kind, out int sub, out int total) {
  ivec2 size = shSize();
  float s = shScale();
  bool usm = shUsm();
  int bil = usm && edgesOnly ? shBilateralDraws(edgesRadius * s) : 0;
  int blur = usm ? shKernelDraws(shKernel(radius * s, 0)) : 0;
  int apply = usm ? 1 : 0;
  float sd = shDeconvSigma();
  int nA = shKernelDraws(shKernel(sd, shDamped() ? 0 : 2));
  int nB = shKernelDraws(shKernel(sd, 1));
  int per = usm || sd < ${lit(GAUSS_SKIP)} ? 0 : nA + nB;
  int fin = blurRadius >= ${lit(BLUR_RADIUS_MIN)} ? shKernelDraws(shKernel(blurRadius * s, 0)) : 1;
  int fixedDraws = ${PREP_DRAWS} + bil + blur + apply + ${BLEND_DRAWS} + fin;
  int iters = per > 0 ? min(int(deconvIterations + 0.5), max(uPassCount - fixedDraws, 0) / per) : 0;
  total = fixedDraws + iters * per;
  sub = 0;
  int i = uPassIndex;
  if (size.x < 8 || size.y < 8 || total > uPassCount) {
    kind = i == 0 ? ${STEP.zero} : ${STEP.copy};
    total = 1;
    return;
  }
  if (i == 0) { kind = ${STEP.prep}; return; }
  i -= 1;
  if (i < bil) { kind = ${STEP.bilateral}; sub = i; return; }
  i -= bil;
  if (i < blur) { kind = ${STEP.blur}; sub = i; return; }
  i -= blur;
  if (i < apply) { kind = ${STEP.apply}; return; }
  i -= apply;
  if (i < iters * per) {
    int k = i - (i / per) * per;
    kind = k < nA ? ${STEP.divide} : ${STEP.multiply};
    sub = k < nA ? k : k - nA;
    return;
  }
  i -= iters * per;
  if (i < ${BLEND_DRAWS}) { kind = ${STEP.blend}; sub = i; return; }
  i -= ${BLEND_DRAWS};
  if (i < fin) { kind = ${STEP.final}; sub = i; return; }
  kind = ${STEP.copy};
}

// Every draw of the schedule writes the whole frame; of the copies past it,
// only the first changes anything.
ivec4 shRegion() {
  int kind, sub, total;
  shSchedule(kind, sub, total);
  if (kind == ${STEP.copy} && uPassIndex > total) return ivec4(0);
  return ivec4(0, 0, shSize());
}

float shL(vec4 t) { return t.x + t.y; }
float shBase(vec4 t) { return t.x + t.y + t.z; }
// The blend mask as w keeps it (shWithBlend), and 1 less it.
float shBlend(float w) { return w > 0.0 ? w : 1.0 + w; }
float shBlendRest(float w) { return w > 0.0 ? 1.0 - w : -w; }
float shObserved(vec4 t) { return max(t.x + t.y, 0.0); }

// What a blur reads from a texel (LINE), as weights of x + y, max(x + y, 0),
// z and w, and of the blend mask's 1 at or below 0 and y + max(x, 0): set
// once a draw, so every tap is the same straight-line code.
void shLine(int what, out vec4 a, out vec2 b) {
  a = vec4(0.0);
  b = vec2(0.0);
  if (what == ${LINE.luminance}) a = vec4(1.0, 0.0, 0.0, 0.0);
  else if (what == ${LINE.base}) a = vec4(1.0, 0.0, 1.0, 0.0);
  else if (what == ${LINE.baseBlurred}) a = vec4(1.0, 0.0, 1.0, 1.0);
  else if (what == ${LINE.estimate}) a = vec4(0.0, 1.0, 1.0, 0.0);
  else if (what == ${LINE.estimateBlurred}) a = vec4(0.0, 1.0, 1.0, 1.0);
  else if (what == ${LINE.ratio}) a = vec4(0.0, 0.0, 0.0, 1.0);
  else if (what == ${LINE.blend}) { a = vec4(0.0, 0.0, 0.0, 1.0); b = vec2(1.0, 0.0); }
  else if (what == ${LINE.observed}) a = vec4(0.0, 1.0, 0.0, 0.0);
  else if (shUsm()) a = vec4(1.0, 0.0, 0.0, 0.0);
  else b = vec2(0.0, 1.0);
}
float shRead(vec4 t, vec4 a, vec2 b) {
  float s = t.x + t.y;
  return dot(vec4(s, max(s, 0.0), t.z, t.w), a) + dot(vec2(step(t.w, 0.0), t.y + max(t.x, 0.0)), b);
}
// A texel of the previous draw, clamped to the frame's last texel.
vec4 shAtIn(ivec2 t, ivec2 last) { return fetchPrev4(clamp(t, ivec2(0), last)); }

// Young-van Vliet's coefficients (calculateYvVFactors), with the SSE build's
// far-edge factor rho over the scalar build's.
void shYvV(float sigma, out float B, out float b1, out float b2, out float b3, out float rho) {
  float q = sigma < 2.5 ? 3.97156 - 4.14554 * sqrt(1.0 - 0.26891 * sigma) : 0.98711 * sigma - 0.9633;
  float b0 = 1.57825 + 2.44413 * q + 1.4281 * q * q + 0.422205 * q * q * q;
  b1 = (2.44413 * q + 2.85619 * q * q + 1.26661 * q * q * q) / b0;
  b2 = (-1.4281 * q * q - 1.26661 * q * q * q) / b0;
  b3 = 0.422205 * q * q * q / b0;
  B = 1.0 - (b1 + b2 + b3);
  float k = 1.0 + b2 + (b1 - b3) * b3;
  rho = k * k / (1.0 - b1 - b2 - b3);
}

// The recursion of a line along e (length n, this texel at j) applied to
// value \`what\`, less this texel's value. The taps are the impulse response's
// autocorrelation, h0 = 1 and the Yule-Walker ratios, rolled as h(k), h(k + 1)
// and h(k + 2).
float shRecursion(ivec2 q, ivec2 e, int n, int j, float sigma, int what) {
  float B, b1, b2, b3, rho;
  shYvV(sigma, B, b1, b2, b3, rho);
  int reach = min(int(ceil(${lit(IIR_REACH)} * sigma)), ${R});
  float r1 = (b1 + b2 * b3) / (1.0 - b2 - b3 * (b1 + b3));
  float r2 = b2 + (b1 + b3) * r1;
  float r3 = b3 + b2 * r1 + b1 * r2;
  vec4 la;
  vec2 lb;
  shLine(what, la, lb);
  ivec2 last = shSize() - 1;
  float own = shRead(shAtIn(q, last), la, lb);
  float h0 = r1;
  float h1 = r2;
  float h2 = r3;
  float norm = 1.0;
  float acc = 0.0;
  for (int k = 1; k <= ${R}; k++) {
    if (k > reach) break;
    norm += 2.0 * h0;
    acc += h0 * ((shRead(shAtIn(q - e * k, last), la, lb) - own) + (shRead(shAtIn(q + e * k, last), la, lb) - own));
    float next = b1 * h2 + b2 * h1 + b3 * h0;
    h0 = h1;
    h1 = h2;
    h2 = next;
  }
  acc /= norm;
  int d = n - 1 - j;
  if (d <= reach) {
    // The constant extension past the far edge: the line's taps at or beyond
    // offset d read the edge, the rest the d - s before it, s = 1 to reach,
    // each the tap k = -(s + m) of the sum centred m past the edge.
    float edge = shRead(shAtIn(q + e * d, last), la, lb) - own;
    float y0 = 0.0;
    float y1 = 0.0;
    float y2 = 0.0;
    float tail0 = 0.0;
    float tail1 = 0.0;
    float tail2 = 0.0;
    h0 = r1;
    h1 = r2;
    h2 = r3;
    for (int s = 1; s <= ${R}; s++) {
      if (s > reach) break;
      float v = shRead(shAtIn(q + e * (d - s), last), la, lb) - own;
      y0 += h0 * v;
      tail0 += h0;
      if (s + 1 <= reach) y1 += h1 * v;
      if (s >= 2) tail1 += h0;
      if (s + 2 <= reach) y2 += h2 * v;
      if (s >= 3) tail2 += h0;
      float next = b1 * h2 + b2 * h1 + b3 * h0;
      h0 = h1;
      h1 = h2;
      h2 = next;
    }
    float c0 = (rho - 1.0) * ((y0 + edge * (norm - tail0)) / norm - edge);
    float c1 = (rho - 1.0) * ((y1 + edge * (norm - tail1)) / norm - edge);
    float c2 = (rho - 1.0) * ((y2 + edge * (norm - tail2)) / norm - edge);
    for (int t = 0; t < ${R}; t++) {
      if (t >= d) break;
      float next = b1 * c0 + b2 * c1 + b3 * c2;
      c2 = c1;
      c1 = c0;
      c0 = next;
    }
    acc += c0;
  }
  return acc;
}
float shRecursionH(ivec2 q, float sigma, int what) { return shRecursion(q, ivec2(1, 0), shSize().x, q.x, sigma, what); }
float shRecursionV(ivec2 q, float sigma, int what) { return shRecursion(q, ivec2(0, 1), shSize().y, q.y, sigma, what); }

// gauss3x3 (src != dst): the corners copied, the outer rows and columns a
// 3-tap blur along them; the result less the texel's value.
float shGauss3x3(ivec2 q, float sigma, int what) {
  ivec2 size = shSize();
  vec4 la;
  vec2 lb;
  shLine(what, la, lb);
  ivec2 last = shSize() - 1;
  float own = shRead(shAtIn(q, last), la, lb);
  bool rowEdge = q.y == 0 || q.y == size.y - 1;
  bool colEdge = q.x == 0 || q.x == size.x - 1;
  if (rowEdge && colEdge) return 0.0;
  if (rowEdge || colEdge) {
    float b = exp(-1.0 / (2.0 * sigma * sigma));
    float b1 = b / (2.0 * b + 1.0);
    ivec2 e = rowEdge ? ivec2(1, 0) : ivec2(0, 1);
    return b1 * (shRead(shAtIn(q - e, last), la, lb) - own + shRead(shAtIn(q + e, last), la, lb) - own);
  }
  float c1 = exp(-0.5 / (sigma * sigma));
  float c2 = exp(-1.0 / (sigma * sigma));
  float sum = 1.0 + 4.0 * (c1 + c2);
  float acc = c2 * (shRead(shAtIn(q + ivec2(-1, -1), last), la, lb) - own) + c1 * (shRead(shAtIn(q + ivec2(0, -1), last), la, lb) - own)
    + c2 * (shRead(shAtIn(q + ivec2(1, -1), last), la, lb) - own) + c1 * (shRead(shAtIn(q + ivec2(-1, 0), last), la, lb) - own)
    + c1 * (shRead(shAtIn(q + ivec2(1, 0), last), la, lb) - own) + c2 * (shRead(shAtIn(q + ivec2(-1, 1), last), la, lb) - own)
    + c1 * (shRead(shAtIn(q + ivec2(0, 1), last), la, lb) - own) + c2 * (shRead(shAtIn(q + ivec2(1, 1), last), la, lb) - own);
  return acc / sum;
}
${disc("shDisc5", DISC5, false)}
${disc("shDisc7", DISC7, true)}

// Threshold<int>::multiply, double, not starting at one: x in L units.
float shThreshold(float x, float yMax) {
  if (x == thresholdBottomRight && thresholdBottomRight == thresholdTopRight) return yMax;
  if (x >= thresholdBottomRight) return 0.0;
  if (x > thresholdTopRight) return yMax * (1.0 - (x - thresholdTopRight) / (thresholdBottomRight - thresholdTopRight));
  if (x >= thresholdTopLeft) return yMax;
  if (x > thresholdBottomLeft) return yMax * (x - thresholdBottomLeft) / (thresholdTopLeft - thresholdBottomLeft);
  return 0.0;
}
// The unsharp mask's change for base - blur (upperBound 2000 L units).
float shDelta(float diff) {
  return shThreshold(min(abs(diff) * 32768.0, 2000.0), amount * 0.01 * diff);
}

vec4 shPrep(vec4 c) {
  float lum = shLuminance(c.rgb);
  float hi = unpackHalf2x16(packHalf2x16(vec2(lum, 0.0))).x;
  return vec4(hi, lum - hi, 0.0, 0.0);
}

// One draw's three rows of bilateral2.h's window: the weighted differences
// from the centre and the weights, in z and w, and the last draw their
// quotient in z: the base less L. The border keeps L.
vec4 shBilateral(ivec2 q, vec4 c, int chunk) {
  ivec2 size = shSize();
  int t = shBilateralTable(edgesRadius * shScale());
  int r = shBilRadius(t);
  if (q.x < r || q.y < r || q.x >= size.x - r || q.y >= size.y - r) return vec4(c.xy, 0.0, 1.0);
  float centre = shL(c);
  float num = chunk == 0 ? 0.0 : c.z;
  float den = chunk == 0 ? 0.0 : c.w;
  float twoSens2 = 2.0 * edgesTolerance * edgesTolerance;
  for (int k = 0; k < ${BILATERAL_ROWS_PER_DRAW}; k++) {
    int dy = -r + ${BILATERAL_ROWS_PER_DRAW} * chunk + k;
    if (dy > r) break;
    ivec2 weightsRow = shBilWeights(t, abs(dy));
    for (int dx = -${BR}; dx <= ${BR}; dx++) {
      if (abs(dx) > r) continue;
      float w = shBilWeight(weightsRow, abs(dx));
      if (w == 0.0) continue;
      float d = shL(shAt(q + ivec2(dx, dy))) - centre;
      float e = exp(-(d * 32768.0) * (d * 32768.0) / twoSens2);
      num += w * e * d;
      den += w * e;
    }
  }
  bool last = chunk == shBilateralDraws(edgesRadius * shScale()) - 1;
  return last ? vec4(c.xy, num / den, 0.0) : vec4(c.xy, num, den);
}

// The unsharp mask's blur of its base (L, or the bilateral's result): z the
// base less L, w the blur less the base.
float shBlurSigma() { return radius * shScale(); }
vec4 shBlurSkip(vec4 c) { return vec4(c.xyz, 0.0); }
// The 3x3, or the recursion's horizontal half.
vec4 shBlurFirst(vec4 c, float f) { return vec4(c.xyz, f); }
vec4 shBlurV(vec4 c, float f) { return vec4(c.xyz, c.w + f); }

// The unsharp mask's change, unblended, in z: the threshold's share of
// amount times base - blur.
vec4 shApplyPlain(vec4 c) { return vec4(c.xy, shDelta(-c.w), 0.0); }
${haloControl()}

// dcdamping on the blurred estimate I against the observed O: the ratio less 1.
float shDamp(float I, float O) {
  if (O <= 0.0 || I <= 0.0) return -1.0;
  float d = deconvDamping / 5.0;
  float U = (O * log(I / O) - I + O) * (-2.0 * 32768.0 / (d * d));
  U = min(U, 1.0);
  U = U * U * U * U * (5.0 - U * 4.0);
  return (O - I) / I * U;
}
// GAUSS_DIV's O over the blurred estimate, less 1; RawTherapee's guard is 1 L unit.
float shDivide(float O, float blurred) {
  return blurred > 0.0 ? (O - blurred) / blurred : O * 32768.0 - 1.0;
}
float shRatio(vec4 c, float blurred) {
  float O = shObserved(c);
  return shDamped() ? shDamp(blurred, O) : shDivide(O, blurred);
}
bool shInside(ivec2 q, int r) {
  ivec2 size = shSize();
  return q.x >= r && q.y >= r && q.x < size.x - r && q.y < size.y - r;
}
// gauss5x5div / gauss7x7div's interior, divided by at least 0.00001 L units.
vec4 shDivideDisc(vec4 c, vec2 disc) {
  float O = shObserved(c);
  float val = (O + c.z) * disc.y + disc.x;
  float guard = ${lit(0.00001 / 32768)};
  return vec4(c.xyz, val >= guard ? (O - val) / val : O / guard - 1.0);
}

// The deconvolution's first blur: the estimate's, divided into the observed
// L (or damped against it): the ratio less 1 in w. The 5x5 and 7x7 borders'
// ratio is 1.
vec4 shDivide3x3(vec4 c, float f) { return vec4(c.xyz, shRatio(c, shObserved(c) + c.z + f)); }
vec4 shDivideDiscAt(ivec2 q, vec4 c, vec2 disc, int border) { return shInside(q, border) ? shDivideDisc(c, disc) : vec4(c.xyz, 0.0); }
vec4 shDivideH(vec4 c, float f) { return vec4(c.xyz, f); }
vec4 shDivideV(vec4 c, float f) { return vec4(c.xyz, shRatio(c, shObserved(c) + c.z + c.w + f)); }

// The second blur: the ratio's, multiplying the estimate: z the new estimate
// less L. gauss5x5mult and gauss7x7mult leave the border.
vec4 shMultiply(vec4 c, float gain) { return vec4(c.xy, c.z + (shObserved(c) + c.z) * gain, 0.0); }
// The 3x3, or the recursion's vertical half.
vec4 shMultiplyLast(vec4 c, float f) { return shMultiply(c, c.w + f); }
vec4 shMultiplyDisc(ivec2 q, vec4 c, vec2 disc, int border) {
  return shInside(q, border) ? shMultiply(c, c.w * disc.y + disc.x + (disc.y - 1.0)) : vec4(c.xyz, 0.0);
}
vec4 shMultiplyH(vec4 c, float f) { return vec4(c.xyz, c.w + f); }

// buildBlendMask in w: the sigmoid of the 4-tap gradient over the interior,
// the 2 px border taking its nearest interior value, then the sigma 2 blur.
// Contrast 0 is 1 everywhere. The mask is kept as itself up to 0.5 and as
// itself less 1 above, so a half float holds 1 - blend as finely as blend:
// a fully sharpened pixel takes the deconvolution's estimate whole, which can
// be 0. The sigmoid is never below 0.00097, so 0 can only mean 1.
vec4 shWithBlend(vec4 c, float b) { return vec4(c.xyz, b > 0.5 ? b - 1.0 : b); }
vec4 shBlendGradient(ivec2 q, vec4 c) {
  if (contrast == 0.0) return shWithBlend(c, 1.0);
  ivec2 p = clamp(q, ivec2(2), shSize() - 3);
  float gx1 = shL(shAt(p + ivec2(1, 0))) - shL(shAt(p - ivec2(1, 0)));
  float gy1 = shL(shAt(p + ivec2(0, 1))) - shL(shAt(p - ivec2(0, 1)));
  float gx2 = shL(shAt(p + ivec2(2, 0))) - shL(shAt(p - ivec2(2, 0)));
  float gy2 = shL(shAt(p + ivec2(0, 2))) - shL(shAt(p - ivec2(0, 2)));
  float g = sqrt(gx1 * gx1 + gy1 * gy1 + gx2 * gx2 + gy2 * gy2) * ${lit((32768 * 0.0625) / 327.68)};
  float x = -16.0 + (16.0 / (contrast / 100.0)) * g;
  return shWithBlend(c, 0.5 * (1.0 + x / sqrt(1.0 + x * x)));
}
vec4 shBlendBlur(vec4 c, float f) { return contrast == 0.0 ? c : shWithBlend(c, shBlend(c.w) + f); }

// The result: the change of L, in x. Unsharp mask: L plus the blend times its
// change; deconvolution: the estimate mixed in by the blend times the amount.
// With the blur radius on, either is mixed with the blur by the blend,
// intp(blend, result, intp(blend, L, blur)), all as changes from L: \`toBlur\`
// is the blur less its source (L, or the observed L), and \`lum\` only places
// the clamps at 0.
bool shBlurRadiusOn() { return blurRadius >= ${lit(BLUR_RADIUS_MIN)}; }
float shFinalSigma() { return blurRadius * shScale(); }
int shFinalLine() { return shUsm() ? ${LINE.luminance} : ${LINE.observed}; }
// max(v + d, 0) - v.
float shAbove(float v, float d) { return v + d >= 0.0 ? d : -v; }
vec4 shResult(vec4 c, float lum, float toBlur, bool mixBlur) {
  float b = shBlend(c.w);
  float rest = shBlendRest(c.w);
  bool usm = shUsm();
  float O = max(lum, 0.0);
  float base = usm ? lum : O;
  // The result less its base (L for the unsharp mask, O for deconvolution).
  float sharp = usm ? b * c.z : b * (deconvAmount / 100.0) * shAbove(O, c.z);
  float change = sharp;
  if (mixBlur) {
    float mixed = rest * shAbove(base, toBlur);
    change = sharp + rest * (shAbove(base, mixed) - sharp);
  }
  return vec4(change + base - lum, 0.0, 0.0, 1.0);
}
// Without the blur radius, or with it below GAUSS_SKIP, where the blur is its source.
vec4 shFinalPlain(vec4 c) { return shResult(c, shL(c), 0.0, shBlurRadiusOn()); }
vec4 shFinal3x3(vec4 c, float f) { return shResult(c, shL(c), f, true); }
// The recursion's horizontal half less its source, in y: y's remainder of L
// is spent here, and the vertical half reads its taps over the source's half.
vec4 shFinalH(vec4 c, float f) { return vec4(c.x, f, c.zw); }
vec4 shFinalV(vec4 c, float f) { return shResult(c, c.x, c.y + f, true); }

// The kernel this draw's step blurs with.
int shStepKernel(int kind) {
  float s = shScale();
  if (kind == ${STEP.blur}) return shKernel(radius * s, 0);
  if (kind == ${STEP.divide}) return shKernel(shDeconvSigma(), shDamped() ? 0 : 2);
  if (kind == ${STEP.multiply}) return shKernel(shDeconvSigma(), 1);
  if (kind == ${STEP.final}) return shBlurRadiusOn() ? shKernel(blurRadius * s, 0) : SH_K_SKIP;
  return SH_K_SKIP;
}

// The one blur this draw's step reads (FILTER), its sigma, and the value it
// filters (LINE). Each blur has one call site in the pass, so the compiler
// inlines each once.
void shFilterOf(int kind, int kernel, int sub, out int blurKind, out float sigma, out int what) {
  blurKind = ${FILTER.none};
  sigma = 1.0;
  what = ${LINE.luminance};
  bool iir = kernel == SH_K_IIR;
  int halfOf = sub == 1 ? ${FILTER.column} : ${FILTER.row};
  if (kind == ${STEP.blur}) {
    sigma = shBlurSigma();
    blurKind = kernel == SH_K_3X3 ? ${FILTER.gauss3x3} : iir ? halfOf : ${FILTER.none};
    what = iir && sub == 1 ? ${LINE.baseBlurred} : ${LINE.base};
  } else if (kind == ${STEP.divide} || kind == ${STEP.multiply}) {
    sigma = shDeconvSigma();
    blurKind = kernel == SH_K_3X3 ? ${FILTER.gauss3x3} : kernel == SH_K_5X5 ? ${FILTER.disc5} : kernel == SH_K_7X7 ? ${FILTER.disc7} : halfOf;
    what = kind == ${STEP.multiply} ? ${LINE.ratio} : iir && sub == 1 ? ${LINE.estimateBlurred} : ${LINE.estimate};
  } else if (kind == ${STEP.blend} && sub > 0 && contrast != 0.0) {
    sigma = 2.0;
    blurKind = sub == 2 ? ${FILTER.column} : ${FILTER.row};
    what = ${LINE.blend};
  } else if (kind == ${STEP.final}) {
    sigma = shFinalSigma();
    blurKind = kernel == SH_K_3X3 ? ${FILTER.gauss3x3} : iir ? halfOf : ${FILTER.none};
    what = iir && sub == 1 ? ${LINE.finalBlurred} : shFinalLine();
  }
}
`;

/** The pass's region (StagePass.region). */
export const REGION_GLSL = "return shRegion();";

/** The blurs, one call site each; a step reads f or d. */
export const FILTER_CALLS = {
  gauss3x3: "f = shGauss3x3(q, sigma, what);",
  row: "f = shRecursionH(q, sigma, what);",
  column: "f = shRecursionV(q, sigma, what);",
  disc5: "d = shDisc5(q, sigma, what);",
  disc7: "d = shDisc7(q, sigma, what);",
} as const;

/** Every draw runs one of these. */
export const STEP_CALLS = {
  prep: "c = shPrep(c);",
  bilateral: "c = shBilateral(q, c, sub);",
  blurSkip: "c = shBlurSkip(c);",
  blurFirst: "c = shBlurFirst(c, f);",
  blurV: "c = shBlurV(c, f);",
  applyPlain: "c = shApplyPlain(c);",
  applyHalo: "c = shApplyHalo(q, c);",
  divide3x3: "c = shDivide3x3(c, f);",
  divide5x5: "c = shDivideDiscAt(q, c, d, 2);",
  divide7x7: "c = shDivideDiscAt(q, c, d, 3);",
  divideH: "c = shDivideH(c, f);",
  divideV: "c = shDivideV(c, f);",
  multiplyLast: "c = shMultiplyLast(c, f);",
  multiply5x5: "c = shMultiplyDisc(q, c, d, 2);",
  multiply7x7: "c = shMultiplyDisc(q, c, d, 3);",
  multiplyH: "c = shMultiplyH(c, f);",
  blendGradient: "c = shBlendGradient(q, c);",
  blendBlur: "c = shBlendBlur(c, f);",
  finalPlain: "c = shFinalPlain(c);",
  final3x3: "c = shFinal3x3(c, f);",
  finalH: "c = shFinalH(c, f);",
  finalV: "c = shFinalV(c, f);",
} as const;

/** The widest blur each step reads, if any. */
export const STEP_FILTER: Record<keyof typeof STEP_CALLS, keyof typeof FILTER_CALLS | null> = {
  prep: null,
  bilateral: null,
  blurSkip: null,
  blurFirst: "row",
  blurV: "column",
  applyPlain: null,
  applyHalo: null,
  divide3x3: "gauss3x3",
  divide5x5: "disc5",
  divide7x7: "disc7",
  divideH: "row",
  divideV: "column",
  multiplyLast: "column",
  multiply5x5: "disc5",
  multiply7x7: "disc7",
  multiplyH: "row",
  blendGradient: null,
  blendBlur: "column",
  finalPlain: null,
  final3x3: "gauss3x3",
  finalH: "row",
  finalV: "column",
};

const S = STEP_CALLS;
const F = FILTER_CALLS;

export const PASS_GLSL = `
ivec2 q = ivec2(gl_FragCoord.xy);
int kind, sub, total;
shSchedule(kind, sub, total);
int kernel = shStepKernel(kind);
bool second = sub == 1;
int blurKind;
float sigma;
int what;
shFilterOf(kind, kernel, sub, blurKind, sigma, what);
float f = 0.0;
vec2 d = vec2(0.0);
if (blurKind == ${FILTER.gauss3x3}) ${F.gauss3x3}
else if (blurKind == ${FILTER.row}) ${F.row}
else if (blurKind == ${FILTER.column}) ${F.column}
else if (blurKind == ${FILTER.disc5}) ${F.disc5}
else if (blurKind == ${FILTER.disc7}) ${F.disc7}
if (kind == ${STEP.zero}) {
  c = vec4(0.0);
} else if (kind == ${STEP.prep}) {
  ${S.prep}
} else if (kind == ${STEP.bilateral}) {
  ${S.bilateral}
} else if (kind == ${STEP.blur}) {
  if (kernel == ${K_SKIP}) ${S.blurSkip}
  else if (!second) ${S.blurFirst}
  else ${S.blurV}
} else if (kind == ${STEP.apply}) {
  if (haloControl) ${S.applyHalo}
  else ${S.applyPlain}
} else if (kind == ${STEP.divide}) {
  if (kernel == ${K_3X3}) ${S.divide3x3}
  else if (kernel == ${K_5X5}) ${S.divide5x5}
  else if (kernel == ${K_7X7}) ${S.divide7x7}
  else if (!second) ${S.divideH}
  else ${S.divideV}
} else if (kind == ${STEP.multiply}) {
  if (kernel == ${K_5X5}) ${S.multiply5x5}
  else if (kernel == ${K_7X7}) ${S.multiply7x7}
  else if (kernel == ${K_3X3} || second) ${S.multiplyLast}
  else ${S.multiplyH}
} else if (kind == ${STEP.blend}) {
  if (sub == 0) ${S.blendGradient}
  else ${S.blendBlur}
} else if (kind == ${STEP.final}) {
  if (kernel == ${K_SKIP}) ${S.finalPlain}
  else if (kernel == ${K_3X3}) ${S.final3x3}
  else if (!second) ${S.finalH}
  else ${S.finalV}
}
`;
