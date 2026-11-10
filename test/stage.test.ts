// The stage contract the host relies on, and what a draw may cost. Unit tests
// can't run GLSL; the GPU spec (test/gpu) renders it.

import { describe, expect, it } from "vitest";
import { FILTER_CALLS, INLINE_GLSL, PASS_GLSL, PASS_HELPERS, REGION_GLSL, STEP_CALLS, STEP_FILTER, glslLiteral } from "../src/glsl";
import { DEFAULT_PARAMS, MAX_DRAWS, MAX_IIR_RADIUS } from "../src/model";
import { DRAWS_KEY, EDIT_KEYS, LABELS, STAGE_ID, bagValue } from "../src/params";
import { PRIORITY, sharpeningStage } from "../src/stage";
import { fetchBudget, inlineFetches } from "./support/fetch-budget";

const stage = sharpeningStage();
const pass = stage.passes![0];

describe("the stage", () => {
  it("reads the edited image in linear Rec.709 after the display tools", () => {
    expect(stage).toMatchObject({
      id: STAGE_ID,
      phase: "display-adjust",
      reads: "current",
      space: { encoding: "linear", primaries: "rec709" },
    });
  });

  it("runs after impulse noise reduction, sharpen edges and microcontrast, as RawTherapee orders them", () => {
    expect(PRIORITY).toBeGreaterThan(130);
    expect(stage.priority).toBe(PRIORITY);
  });

  it("runs one four-channel pass for as many draws as the bag says", () => {
    expect(stage.passes).toHaveLength(1);
    expect(pass).toMatchObject({ channels: 4, iterations: { key: DRAWS_KEY, max: MAX_DRAWS }, region: REGION_GLSL });
  });

  it("gives the pass every edit key, at the bag's encoding of the defaults, and the inline the draw count", () => {
    const keys = pass.uniforms?.map((u) => u.key) ?? [];
    expect([...keys].sort()).toEqual([...EDIT_KEYS].sort());
    for (const u of pass.uniforms ?? []) expect(u.default).toBe(bagValue(DEFAULT_PARAMS, u.key as (typeof EDIT_KEYS)[number]));
    expect(stage.uniforms.map((u) => u.key).sort()).toEqual([...EDIT_KEYS, DRAWS_KEY].sort());
  });

  it("declares every pass uniform in the stage's own uniforms, which presets and paste read", () => {
    const inline = new Map(stage.uniforms.map((u) => [u.key, u]));
    for (const u of pass.uniforms ?? []) expect(inline.get(u.key)).toEqual(u);
  });

  it("gives every control its own stage label, as the preset dialog lists them flat", () => {
    const labels = stage.uniforms.filter((u) => u.key !== DRAWS_KEY).map((u) => u.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("stores its switches as booleans, and labels each control by the shared label map", () => {
    for (const key of ["on", "edgesOnly", "haloControl"]) {
      expect(stage.uniforms.find((u) => u.key === key)).toMatchObject({ glslType: "bool", default: false });
    }
    for (const u of stage.uniforms) if (u.key !== DRAWS_KEY) expect(u.label).toBe(LABELS[u.key as (typeof EDIT_KEYS)[number]]);
    expect(stage.name).toBe("USM & RL Sharpening");
  });

  it("is dormant while it draws nothing", () => {
    expect(stage.dormantWhen).toEqual({ [DRAWS_KEY]: 0 });
  });

  it("changes nothing until the pass has drawn", () => {
    expect(INLINE_GLSL.trim().startsWith("if (draws > 0) {")).toBe(true);
  });

  it("can run inside masks", () => {
    expect(stage.mask).toEqual({ maskable: true });
  });
});

describe("a draw's cost", () => {
  const helpers = pass.helpers ?? "";
  // Each draw runs one step and the blur it reads; every branch is counted,
  // so they are upper bounds. The recursion reads 6 sigma a side, at most 18,
  // and again up to 18 behind the far edge in the rows and columns that
  // correct it; the bilateral three rows of its widest, 11 x 11, window; the
  // discs their 5 x 5 and 7 x 7 squares.
  const line = 2 * MAX_IIR_RADIUS + 2 + MAX_IIR_RADIUS;
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const reads = (step: keyof typeof STEP_CALLS) => {
    const filter = STEP_FILTER[step];
    return inlineFetches(STEP_CALLS[step], helpers) + (filter ? inlineFetches(FILTER_CALLS[filter], helpers) : 0);
  };
  const budgets: [keyof typeof STEP_CALLS, number][] = [
    ["prep", 0],
    ["bilateral", 33],
    ["blurFirst", line],
    ["blurV", line],
    ["applyPlain", 0],
    ["applyHalo", 25],
    ["divide3x3", 11],
    ["divide5x5", 26],
    ["divide7x7", 50],
    ["divideV", line],
    ["multiplyLast", line],
    ["multiply5x5", 26],
    ["multiply7x7", 50],
    ["blendGradient", 8],
    ["blendBlur", line],
    ["final3x3", 11],
    ["finalV", line],
  ];
  it.each(budgets)("%s reads %i texels", (name, budget) => {
    expect(reads(name)).toBe(budget);
  });

  it("reads at most the recursion's 56 texels in any draw", () => {
    for (const step of Object.keys(STEP_CALLS) as (keyof typeof STEP_CALLS)[]) expect(reads(step)).toBeLessThanOrEqual(line);
  });

  // FXC inlines a function at every call site: one site per blur keeps the
  // pass's build to seconds where ten sites of the recursion took twenty.
  it("calls each blur from one place", () => {
    const calls = (name: string) => (code(PASS_GLSL + PASS_HELPERS).match(new RegExp(`\\b${name}\\s*\\(`, "g")) ?? []).length;
    for (const name of ["shGauss3x3", "shRecursionH", "shRecursionV", "shDisc5", "shDisc7", "shRecursion"]) {
      const sites = name === "shRecursion" ? 2 : 1;
      expect(calls(name), name).toBe(sites + 1);
    }
  });

  // On D3D11, ANGLE turns a GLSL const array into a static array that FXC
  // copies into indexable registers for every pixel of every draw, and a
  // local array indexed in a loop into indexable registers per call site:
  // tens of milliseconds a draw at 4096 px. The tables are code instead and
  // the loops roll scalars, so the source indexes nothing at all.
  it("declares no arrays and indexes nothing", () => {
    for (const src of [PASS_HELPERS, PASS_GLSL, INLINE_GLSL]) {
      expect(code(src)).not.toMatch(/\[/);
      expect(code(src)).not.toMatch(/\bconst\s+\w+\s+\w+\s*\[/);
    }
  });

  // A gradient (implicit-derivative) sample reached from a loop makes ANGLE
  // flatten every branch around it on D3D11, so every draw runs every step.
  it("reads the previous draw only through fetchPrev4, and takes no derivatives", () => {
    for (const src of [PASS_HELPERS, PASS_GLSL]) {
      expect(code(src)).not.toMatch(/\b(texture|textureLod|textureGrad|textureProj|readPrev4?|dFdx|dFdy|fwidth)\s*\(/);
    }
    expect(code(PASS_HELPERS)).toMatch(/\bfetchPrev4\s*\(/);
  });

  it("dispatches one step per draw", () => {
    for (const call of Object.values(STEP_CALLS)) expect(PASS_GLSL).toContain(call);
    expect(fetchBudget(PASS_GLSL, helpers)).toBeGreaterThan(0);
  });

  it("draws only the first copy past the schedule", () => {
    expect(PASS_HELPERS).toMatch(/ivec4 shRegion\(\)/);
    expect(PASS_GLSL).not.toContain("discard");
    expect(PASS_HELPERS).not.toContain("gl_FragCoord");
  });

  it("names no GLSL built-in or uniform as a local", () => {
    const src = PASS_GLSL + PASS_HELPERS;
    for (const name of ["step", "smooth", "filter", "active", "input", "output", "sample", ...EDIT_KEYS, "draws"]) {
      expect(src).not.toMatch(new RegExp(`\\b(int|float|bool|vec2|vec4|ivec2)\\s+${name}\\b`));
    }
  });

  it("writes float literals GLSL ES accepts", () => {
    expect(glslLiteral(1)).toBe("1.0");
    expect(glslLiteral(2 ** -16)).toContain(".");
    expect(PASS_HELPERS).not.toMatch(/[^\w.]\d+e-?\d/);
  });
});
