// rtref.ts against rawtherapee-cli (rawtherapee.json). Each side's change is
// compared, rtref's from the fixture input and RawTherapee's from its own
// identity render, so the CLI's colour-management round trip (2.6·10⁻⁵)
// cancels. In L, the tool's own result, they agree to under one L unit of
// 32768 (float32 rounding, the CLI's LUTs and its 12-bit reciprocal square
// root in the blend mask's sigmoid, through up to 100 iterations). In RGB the
// CLI's ICC output conversion adds up to 3·10⁻⁴ of the value where an
// iteration triples it.

import { describe, expect, it } from "vitest";
import { loadFixture } from "./fixture";
import { gaussianBlur, lumaPlane, sharpenImage, yvvFactors } from "./rtref";

const fixture = loadFixture();
const { width: W, height: H } = fixture.input;
const L0 = lumaPlane(fixture.input);
const Lidentity = lumaPlane({ width: W, height: H, data: fixture.identity });

describe("rtref against rawtherapee-cli", () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const out = sharpenImage(fixture.input, c.params);
    const L = lumaPlane(out);
    const Lrt = lumaPlane({ width: W, height: H, data: c.output });
    let worstL = 0;
    let moved = 0;
    for (let p = 0; p < W * H; p++) {
      moved = Math.max(moved, Math.abs(Lrt[p] - Lidentity[p]));
      worstL = Math.max(worstL, Math.abs(L[p] - L0[p] - (Lrt[p] - Lidentity[p])));
    }
    let worstRgb = 0;
    for (let i = 0; i < out.data.length; i++) {
      const rt = c.output[i] - fixture.identity[i];
      const ours = out.data[i] - fixture.input.data[i];
      worstRgb = Math.max(worstRgb, Math.abs(ours - rt) / Math.max(1, Math.abs(c.output[i])));
    }
    expect(moved, "the case sharpens").toBeGreaterThan(1000);
    expect(worstL).toBeLessThan(1);
    expect(worstRgb).toBeLessThan(4e-4);
  });
});

describe("the recursive blur's edges", () => {
  // The SSE build normalizes Triggs-Sdika's matrix differently from the scalar
  // build: its right and bottom edges start the backward pass rho times too
  // far from the edge value. A constant stays constant either way.
  it("keeps a constant and differs from rho = 1 only near the far edges", () => {
    const flat = new Float32Array(W * H).fill(0.5);
    const out = new Float32Array(W * H);
    gaussianBlur(flat, out, W, H, 2);
    expect(Math.max(...out.map((v) => Math.abs(v - 0.5)))).toBeLessThan(1e-6);
    expect(yvvFactors(2).rho).not.toBeCloseTo(1, 2);
  });
});
