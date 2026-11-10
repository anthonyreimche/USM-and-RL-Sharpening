// The stage on the real renderer. Run via `npm run test:gpu` (run.cjs copies
// this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//  • the four-channel pass compiles with the host's namespacing, runs the
//    bag's draw count and copies past its schedule, and an idle edit leaves
//    the frame as it was;
//  • on half-float targets, every kernel path (3x3, 5x5, 7x7 and the
//    recursion with its far-edge correction, plain, multiply, divide and
//    damped), the bilateral, the threshold, halo control, the blend mask, the
//    blur radius and the inline's Lab shift land on RawTherapee's result, here
//    the float32 transcription test/reference/rtref.ts, which rtref.test.ts
//    holds to rawtherapee-cli, within what this GPU's half floats cost;
//  • a render smaller than its source scales the radii as RawTherapee's
//    preview scale does;
//  • a draw count too short for the schedule leaves the image alone;
//  • what a draw costs on a 4096-pixel frame.

import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, schedule, type Params } from "@sh/model";
import { bagPatch, qualified, resetPatch } from "@sh/params";
import { sharpeningStage } from "@sh/stage";
import { blendStore, firLine, halfStore, ratioStore, toHalf, type Rounding } from "@sh-test/reference/gpumodel";
import { luminanceOf, sharpenImage, withLineFilter, type Image } from "@sh-test/reference/rtref";
import { CURRENT_PROCESS_VERSION } from "@/catalog/process-version";
import type { ProcessingStageContribution } from "@/extensions/types";
import { OPEN_PROBE, builtinStages, floatImage, identityParams, withRenderer, type FloatImage } from "@/rendering/webgl/webgl.test-support";

const W = 200;
const H = 150;
const AS_DRAWN = { encoding: "perceptual", primaries: "rec709" } as const;

const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** A deterministic hash in [0, 1). */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Display-encoded: a lit gradient, a dark disc, a bright window with hard
 *  edges, fine lines, coloured blobs and per-pixel noise, linear 0.01 to 0.9. */
function scene(width: number, height: number): FloatImage {
  return floatImage(width, height, (x, y) => {
    const u = x / width;
    const v = y / height;
    let base = 0.06 + 0.45 * u * (1 - 0.4 * v);
    if ((u - 0.3) ** 2 + (v - 0.65) ** 2 < 0.03) base *= 0.25;
    if (u > 0.62 && u < 0.85 && v > 0.15 && v < 0.45) base = 0.75;
    if (v > 0.8) base += 0.08 * Math.sin(x * 0.9) * Math.sin(y * 0.7);
    const tint: [number, number, number] =
      (u - 0.8) ** 2 + (v - 0.75) ** 2 < 0.012 ? [1.2, 0.75, 0.45] : (u - 0.15) ** 2 + (v - 0.2) ** 2 < 0.01 ? [0.55, 0.8, 1.15] : [1, 1, 1];
    const texture = 1 + 0.18 * (hash(x, y) - 0.5);
    return tint.map((t) => encode(Math.min(Math.max(base * texture * t, 0.01), 0.9))) as [number, number, number];
  });
}

const CASES: [string, Partial<Params>][] = [
  ["USM default (3x3)", {}],
  ["USM radius 1.6, amount 600 (recursion)", { radius: 1.6, amount: 600 }],
  ["USM threshold 200/600/1000/1800", { radius: 0.9, amount: 400, thresholdBottomLeft: 200, thresholdTopLeft: 600, thresholdTopRight: 1000, thresholdBottomRight: 1800 }],
  ["USM edges only, radius 1.9", { radius: 0.8, amount: 500, edgesOnly: true, edgesRadius: 1.9, edgesTolerance: 1800 }],
  ["USM edges only, radius 2.5, halo 60", { radius: 1.2, amount: 700, edgesOnly: true, edgesRadius: 2.5, edgesTolerance: 900, haloControl: true, haloAmount: 60 }],
  ["USM halo 85", { radius: 1, amount: 800, haloControl: true, haloAmount: 85 }],
  ["USM contrast 60, blur radius 1.2", { radius: 0.6, amount: 300, contrast: 60, blurRadius: 1.2 }],
  ["USM blur radius 0.4 (3x3), contrast 0", { amount: 250, contrast: 0, blurRadius: 0.4 }],
  ["RL default (5x5)", { method: "rld" }],
  ["RL radius 0.5 (3x3)", { method: "rld", deconvRadius: 0.5, deconvIterations: 20 }],
  ["RL radius 1 (7x7), 60 iterations", { method: "rld", deconvRadius: 1, deconvIterations: 60 }],
  ["RL radius 2 (recursion), 100 iterations", { method: "rld", deconvRadius: 2, deconvIterations: 100 }],
  ["RL damping 20", { method: "rld", deconvDamping: 20 }],
  ["RL damping 50, radius 1.6", { method: "rld", deconvDamping: 50, deconvRadius: 1.6, deconvIterations: 40 }],
  ["RL damping 30, radius 0.5 (3x3)", { method: "rld", deconvDamping: 30, deconvRadius: 0.5 }],
  ["RL amount 60, blur radius 1.2, contrast 40", { method: "rld", deconvAmount: 60, blurRadius: 1.2, contrast: 40 }],
];

type Frames = Record<string, Float32Array>;

function render(image: FloatImage, bags: Record<string, Record<string, unknown>>, stages: ProcessingStageContribution[] = [sharpeningStage()], maxEdge?: number): Frames {
  const frames: Frames = {};
  withRenderer({ stages: [...builtinStages(), ...stages], pipeline: OPEN_PROBE }, (renderer) => {
    if (maxEdge) renderer.setImage(image, maxEdge);
    else renderer.setImage(image);
    renderer.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
    for (const [name, bag] of Object.entries(bags)) {
      renderer.setContributedParams(bag);
      const frame = renderer.readFloatFrame("pre-output", Infinity, AS_DRAWN);
      if (!frame) throw new Error(`no frame for ${name}`);
      frames[name] = frame.data;
    }
  });
  return frames;
}

const full = (p: Partial<Params>): Params => ({ ...DEFAULT_PARAMS, on: true, ...p });

/** An RGBA frame of display-encoded values as the linear RGB image the stage works on. */
function linear(frame: Float32Array, width: number, height: number): Image {
  const data = new Float32Array(width * height * 3);
  for (let k = 0; k < width * height; k++) for (let c = 0; c < 3; c++) data[3 * k + c] = decode(frame[4 * k + c]);
  return { width, height, data };
}

const lightness = (img: Image, k: number) => luminanceOf(img.data[3 * k], img.data[3 * k + 1], img.data[3 * k + 2]);
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

interface Stats {
  moved: number;
  p50: number;
  p99: number;
  max: number;
  /** a* and b* of the result against the input's, the worst pixel's. */
  chroma: number;
}

/** In RawTherapee's L units (0 to 32768; one L* is 327.68). */
function compare(input: Image, got: Image, ref: Image): Stats {
  const n = input.width * input.height;
  const errors: number[] = [];
  const moved: number[] = [];
  let chroma = 0;
  for (let k = 0; k < n; k++) {
    const L0 = lightness(input, k);
    errors.push(Math.abs(lightness(got, k) - lightness(ref, k)));
    moved.push(Math.abs(lightness(ref, k) - L0));
    for (let c = 0; c < 3; c++) chroma = Math.max(chroma, Math.abs(got.data[3 * k + c] - ref.data[3 * k + c]) / Math.max(ref.data[3 * k + c], 0.05));
  }
  errors.sort((a, b) => a - b);
  moved.sort((a, b) => a - b);
  return { moved: quantile(moved, 0.99), p50: quantile(errors, 0.5), p99: quantile(errors, 0.99), max: errors[errors.length - 1], chroma };
}

const report = (name: string, s: Stats) =>
  console.log(
    `${name}: moved p99 ${s.moved.toFixed(0)}; error p50 ${s.p50.toFixed(2)} p99 ${s.p99.toFixed(1)} max ${s.max.toFixed(1)} L units; RGB rel max ${s.chroma.toExponential(2)}`,
  );

// What the GPU's half floats cost, by case. The passes read the image through
// a half-float copy of the linear values the chain made, and keep their state
// between draws in half floats (rtref's store hooks). A float written to a
// half-float target is rounded to nearest on SwiftShader and toward zero on
// D3D11 (the RTX 4070 Ti through ANGLE): truncation is biased, so a hundred
// deconvolution iterations drift on it where rounding to nearest averages
// out. halfModel runs that arithmetic on the CPU with this GPU's rounding,
// the chain's values placed at a fixed pseudo-random point between two
// halves; on this scene it lands within about 20% of the GPU at the median,
// 99th percentile and worst pixel on both. The GPU and the model are two
// draws of the same rounding, which a long deconvolution carries apart pixel
// by pixel, so the GPU may reach twice the model's error, plus 1 L unit for
// what the model leaves near 0.
function targetRounding(): Rounding {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) throw new Error("no float render targets");
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error("no shader");
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, "#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0, 0.0, 1.0); }"));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, "#version 300 es\nprecision highp float;\nout vec4 o;\nvoid main() { o = vec4(1.0 + 0.75 * exp2(-10.0)); }"));
  gl.linkProgram(program);
  gl.useProgram(program);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer());
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, 1, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const out = new Float32Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, out);
  if (out[0] === 1 + 2 ** -10) return "nearest";
  if (out[0] === 1) return "zero";
  throw new Error(`a half-float target stored ${out[0]}`);
}
const ROUNDING = targetRounding();

const ulpOf = (v: number) => 2 ** (Math.max(Math.floor(Math.log2(Math.abs(v))), -14) - 10);

function halfModel(input: Image, p: Params, scale = 1): Image {
  const read: Image = { ...input, data: input.data.map((v, i) => toHalf(v + (hash(i, 7) - 0.5) * ulpOf(v), ROUNDING)) };
  return withLineFilter(firLine, () =>
    sharpenImage(input, p, {
      scale,
      passInput: read,
      store: halfStore(ROUNDING),
      storeBlend: blendStore(ROUNDING),
      storeRatio: ratioStore(ROUNDING),
    }),
  );
}

function expectWithinModel(name: string, input: Image, got: Image, ref: Image, model: Image): Stats {
  const s = compare(input, got, ref);
  const m = compare(input, model, ref);
  report(name, s);
  console.log(`  half-float model (${ROUNDING}): p50 ${m.p50.toFixed(2)} p99 ${m.p99.toFixed(1)} max ${m.max.toFixed(1)}`);
  expect(s.p50).toBeLessThan(2 * m.p50 + 1);
  expect(s.p99).toBeLessThan(2 * m.p99 + 1);
  expect(s.max).toBeLessThan(2 * m.max + 1);
  return s;
}

describe("USM and RL Sharpening on the GPU", () => {
  const image = scene(W, H);
  const bags: Record<string, Record<string, unknown>> = { identity: resetPatch() };
  for (const [name, p] of CASES) bags[name] = bagPatch(full(p));
  const frames = render(image, bags);
  const input = linear(frames.identity, W, H);

  // The two frames come from different programs (the dormant inline is linked
  // into one), which a compiler may reassociate differently: up to an ulp of
  // float32 (2^-24) on each of the chain's few dozen dependent operations.
  it("leaves the frame as it was while idle, to float rounding", () => {
    const without = render(image, { identity: {} }, []).identity;
    let worst = 0;
    for (let i = 0; i < without.length; i++) worst = Math.max(worst, Math.abs(frames.identity[i] - without[i]) / Math.max(Math.abs(without[i]), 1e-6));
    expect(worst).toBeLessThan(64 * 2 ** -24);
  });

  it.each(CASES)("matches RawTherapee's result: %s", (name, p) => {
    const ref = sharpenImage(input, full(p));
    const s = expectWithinModel(name, input, linear(frames[name], W, H), ref, halfModel(input, full(p)));
    expect(s.moved, "the case changes the image").toBeGreaterThan(300);
  });

  it("leaves a*, b* alone: a grey stays grey", () => {
    const got = linear(frames["USM radius 1.6, amount 600 (recursion)"], W, H);
    let worst = 0;
    for (let k = 0; k < W * H; k++) {
      const [r, g, b] = [input.data[3 * k], input.data[3 * k + 1], input.data[3 * k + 2]];
      if (Math.abs(r - g) > 1e-3 || Math.abs(g - b) > 1e-3) continue;
      const [R, G, B] = [got.data[3 * k], got.data[3 * k + 1], got.data[3 * k + 2]];
      worst = Math.max(worst, Math.abs(R - G) / Math.max(G, 1e-3), Math.abs(B - G) / Math.max(G, 1e-3));
    }
    expect(worst).toBeLessThan(3e-3);
  });

  it("leaves the image alone when the bag's draw count is short of the schedule", () => {
    const p = full({ method: "rld", deconvRadius: 2 });
    const short = render(image, { short: { ...bagPatch(p), [qualified("draws")]: 4 } }).short;
    let worst = 0;
    for (let i = 0; i < short.length; i++) worst = Math.max(worst, Math.abs(short[i] - frames.identity[i]));
    expect(worst).toBeLessThan(1e-6);
  });

  it("copies its result through the draws past the schedule", () => {
    const p = full({ method: "rld", deconvRadius: 1 });
    const longer = render(image, { longer: { ...bagPatch(p), [qualified("draws")]: schedule(p).total + 9 } }).longer;
    const exact = render(image, { exact: bagPatch(p) }).exact;
    let worst = 0;
    for (let i = 0; i < longer.length; i++) worst = Math.max(worst, Math.abs(longer[i] - exact[i]));
    expect(worst).toBeLessThan(1e-6);
  });
});

describe("negative lightness", () => {
  // An out-of-gamut pixel with Y < 0 enters the deconvolution as 0 whatever the
  // blend (ipsharpen.cc: max(L, 0)); the unsharp mask takes it as it is.
  const base = scene(W, H);
  const holes = new Set([`${60},${50}`, `${61},${50}`, `${120},${90}`, `${150},${30}`]);
  const image = floatImage(W, H, (x, y) => {
    const i = 4 * (y * W + x);
    return holes.has(`${x},${y}`) ? [-0.06, -0.03, -0.05] : ([base.data[i], base.data[i + 1], base.data[i + 2]] as [number, number, number]);
  });
  const cases: [string, Partial<Params>][] = [
    ["RL default", { method: "rld" }],
    ["RL damping 30, radius 0.5 (3x3)", { method: "rld", deconvDamping: 30, deconvRadius: 0.5 }],
    ["USM default", {}],
  ];
  const bags: Record<string, Record<string, unknown>> = { identity: resetPatch() };
  for (const [name, p] of cases) bags[name] = bagPatch(full(p));
  const frames = render(image, bags);
  const input = linear(frames.identity, W, H);

  it("reaches the stage with Y below zero", () => {
    expect(Math.min(...[...holes].map((h) => { const [x, y] = h.split(",").map(Number); return lightness(input, y * W + x); }))).toBeLessThan(0);
  });

  it.each(cases)("matches RawTherapee's result: %s", (name, p) => {
    expectWithinModel(`negative L, ${name}`, input, linear(frames[name], W, H), sharpenImage(input, full(p)), halfModel(input, full(p)));
  });
});

describe("a flat field", () => {
  // Nothing to sharpen and its blur is itself: every path's change must be 0
  // to the inline's own float rounding, not to the half-float L the passes
  // hold, or the whole field would shift.
  const flat = floatImage(64, 48, () => [encode(0.6038), encode(0.3189), encode(0.2142)]);
  const cases: [string, Partial<Params>][] = [
    ["blur radius 1.2", { radius: 0.6, contrast: 40, blurRadius: 1.2 }],
    ["blur radius 0.4", { contrast: 40, blurRadius: 0.4 }],
    ["deconvolution, blur radius 1.2", { method: "rld", deconvRadius: 2, blurRadius: 1.2 }],
  ];
  const bags: Record<string, Record<string, unknown>> = { identity: resetPatch() };
  for (const [name, p] of cases) bags[name] = bagPatch(full(p));
  const frames = render(flat, bags);
  it.each(cases)("stays as it was: %s", (name) => {
    let worst = 0;
    for (let i = 0; i < frames[name].length; i++) worst = Math.max(worst, Math.abs(frames[name][i] - frames.identity[i]) / Math.max(frames.identity[i], 1e-3));
    expect(worst).toBeLessThan(2e-5);
  });
});

describe("a render smaller than its source", () => {
  // At half size every radius halves, as RawTherapee divides by its preview
  // scale: a deconvolution radius of 2 runs the 7x7 kernels at sigma 1, the
  // unsharp mask's 1.6 the recursion at 0.8, the edge radius 2.2 the
  // bilateral's 1.1 table and the blur radius 1 the 3x3 at 0.5.
  const SW = 2 * W;
  const SH = 2 * H;
  const source = scene(SW, SH);
  const cases: [string, Partial<Params>][] = [
    ["RL radius 2 at half size", { method: "rld", deconvRadius: 2, deconvIterations: 30 }],
    ["USM radius 1.6, edges only, blur radius 1 at half size", { radius: 1.6, amount: 400, edgesOnly: true, edgesRadius: 2.2, blurRadius: 1, contrast: 30 }],
  ];
  const bags: Record<string, Record<string, unknown>> = { identity: resetPatch() };
  for (const [name, p] of cases) bags[name] = bagPatch(full(p));
  const frames = render(source, bags, [sharpeningStage()], W);
  const input = linear(frames.identity, W, H);

  it.each(cases)("%s", (name, p) => {
    const ref = sharpenImage(input, full(p), { scale: 0.5 });
    const s = expectWithinModel(name, input, linear(frames[name], W, H), ref, halfModel(input, full(p), 0.5));
    expect(s.moved).toBeGreaterThan(300);
  });
});

describe("a 4096-pixel frame", () => {
  // The widest draws: the recursion at sigma 2.5 (37 taps, its far-edge
  // correction in the last 15 rows and columns), four a deconvolution
  // iteration, and the bilateral's 11 x 11 window, three rows a draw.
  const width = 4096;
  const height = 2048;
  const big = floatImage(width, height, (x, y) => {
    const v = encode(0.1 + 0.3 * (x / width) + 0.1 * (y / height) + 0.2 * (Math.hypot(x - 2048, y - 1024) < 600 ? 1 : 0) + 0.02 * (hash(x, y) - 0.5));
    return [v, v * 0.97, v * 0.93];
  });
  it.each<[string, Partial<Params>]>([
    ["RL radius 2.5, damping 10, 10 iterations", { method: "rld", deconvRadius: 2.5, deconvIterations: 10, deconvDamping: 10, blurRadius: 2 }],
    ["USM radius 3, edges only 2.5, halo, blur radius 2", { radius: 3, edgesOnly: true, edgesRadius: 2.5, haloControl: true, blurRadius: 2 }],
  ])("%s: time per draw", (name, p) => {
    const draws = schedule(full(p)).total;
    const started = performance.now();
    const frame = render(big, { run: bagPatch(full(p)) }).run;
    const seconds = (performance.now() - started) / 1000;
    console.log(`${name}, 4096 x 2048: ${draws} draws in ${seconds.toFixed(1)} s, ${((1000 * seconds) / draws).toFixed(0)} ms a draw on SwiftShader (compile, upload and readback included)`);
    expect(frame.every(Number.isFinite)).toBe(true);
    expect(seconds / draws).toBeLessThan(10);
  });
});
