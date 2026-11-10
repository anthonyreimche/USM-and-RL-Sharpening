import { describe, expect, it } from "vitest";
import {
  BILATERAL_TABLES,
  DEFAULT_PARAMS,
  MAX_DRAWS,
  bilateralDraws,
  bilateralTable,
  drawCount,
  iirRadius,
  isActive,
  kernelFor,
  schedule,
  type Params,
} from "../src/model";

const on = (p: Partial<Params> = {}): Params => ({ ...DEFAULT_PARAMS, on: true, ...p });

describe("defaults", () => {
  it("are RawTherapee's SharpeningParams, off", () => {
    expect(DEFAULT_PARAMS).toMatchObject({
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
    });
  });
});

describe("gaussianBlur's kernel choice", () => {
  it("copies, then 3x3, then 5x5 and 7x7 for multiply and divide, then the recursion", () => {
    expect(kernelFor(0.24, "div")).toBe("skip");
    expect(kernelFor(0.25, "standard")).toBe("3x3");
    expect(kernelFor(0.59, "mult")).toBe("3x3");
    expect(kernelFor(0.6, "standard")).toBe("iir");
    expect(kernelFor(0.6, "div")).toBe("5x5");
    expect(kernelFor(0.84, "mult")).toBe("5x5");
    expect(kernelFor(0.85, "mult")).toBe("7x7");
    expect(kernelFor(1.15, "div")).toBe("7x7");
    expect(kernelFor(1.16, "div")).toBe("iir");
  });

  it("reaches 6 sigma with the recursion's taps, at most 18", () => {
    expect(iirRadius(0.6)).toBe(4);
    expect(iirRadius(2)).toBe(12);
    expect(iirRadius(3)).toBe(18);
    expect(iirRadius(4)).toBe(18);
  });
});

describe("the bilateral's tables", () => {
  it("has bilateral2.h's 21 kernels, a quadrant each", () => {
    expect(BILATERAL_TABLES).toHaveLength(21);
    for (const t of BILATERAL_TABLES) expect(t.a).toHaveLength((t.r + 1) ** 2);
  });

  it("picks none below 0.45 and the nearest tenth above", () => {
    expect(bilateralTable(0.44)).toBe(-1);
    expect(bilateralTable(0.45)).toBe(0);
    expect(bilateralTable(0.549)).toBe(0);
    expect(bilateralTable(0.55)).toBe(1);
    expect(bilateralTable(1.9)).toBe(14);
    expect(bilateralTable(2.44)).toBe(19);
    expect(bilateralTable(2.45)).toBe(20);
    expect(bilateralTable(9)).toBe(20);
  });

  it("sums three rows of the window a draw", () => {
    expect(bilateralDraws(0.3)).toBe(0);
    expect(bilateralDraws(0.5)).toBe(1);
    expect(bilateralDraws(1.0)).toBe(2);
    expect(bilateralDraws(1.9)).toBe(3);
    expect(bilateralDraws(2.5)).toBe(4);
  });
});

describe("the schedule", () => {
  it("does nothing while off, below amount 1, or deconvolving nothing with no blur radius", () => {
    expect(drawCount(DEFAULT_PARAMS)).toBe(0);
    expect(isActive(on({ amount: 0 }))).toBe(false);
    expect(isActive(on({ method: "rld", deconvAmount: 0 }))).toBe(false);
    expect(isActive(on({ method: "rld", deconvAmount: 0, blurRadius: 0.5 }))).toBe(true);
  });

  it("runs unsharp mask in a handful of draws", () => {
    // luminance, 3x3 blur, apply, blend mask (3), result
    expect(schedule(on()).total).toBe(7);
    // recursion: two halves; the blur radius's recursion: two
    expect(schedule(on({ radius: 1, blurRadius: 1 })).total).toBe(9);
    // edges only at radius 2.5: four bilateral draws
    expect(schedule(on({ edgesOnly: true, edgesRadius: 2.5 })).total).toBe(11);
  });

  it("runs a deconvolution iteration in two to four draws", () => {
    expect(schedule(on({ method: "rld" })).perIteration).toBe(2);
    expect(schedule(on({ method: "rld", deconvRadius: 2 })).perIteration).toBe(4);
    // damping blurs plainly first: the recursion from 0.6, then multiplies with 5x5
    expect(schedule(on({ method: "rld", deconvDamping: 10 })).perIteration).toBe(3);
    expect(schedule(on({ method: "rld", deconvRadius: 2.5, deconvIterations: 100, blurRadius: 2 })).total).toBe(1 + 400 + 3 + 2);
  });

  it("shrinks with the render and never exceeds the full-size count", () => {
    const cases = [
      on({ method: "rld", deconvRadius: 2.5, deconvIterations: 100, deconvDamping: 30, blurRadius: 2 }),
      on({ radius: 3, edgesOnly: true, edgesRadius: 2.5, blurRadius: 1 }),
      on({ method: "rld", deconvRadius: 1.1 }),
    ];
    for (const p of cases) {
      const full = drawCount(p);
      expect(full).toBeLessThanOrEqual(MAX_DRAWS);
      let last = full;
      for (const scale of [0.9, 0.7, 0.5, 0.3, 0.1]) {
        const t = schedule(p, scale).total;
        expect(t).toBeLessThanOrEqual(last);
        last = t;
      }
    }
  });

  it("skips the iterations where the radius drops below GAUSS_SKIP", () => {
    expect(schedule(on({ method: "rld", deconvRadius: 0.4 }), 0.5).iterations).toBe(0);
  });
});
