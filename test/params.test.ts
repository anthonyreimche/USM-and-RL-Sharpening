import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, drawCount, type Params } from "../src/model";
import { DRAWS_KEY, EDIT_KEYS, STAGE_ID, bagPatch, qualified, readParams, rederivePatch, resetPatch } from "../src/params";

const on = (p: Partial<Params> = {}): Params => ({ ...DEFAULT_PARAMS, on: true, ...p });

describe("the param bag", () => {
  it("keys every edit under the stage", () => {
    expect(qualified("amount")).toBe(`${STAGE_ID}.amount`);
    expect(EDIT_KEYS).toHaveLength(Object.keys(DEFAULT_PARAMS).length);
  });

  it("reads an empty bag as the defaults, off", () => {
    expect(readParams({})).toEqual(DEFAULT_PARAMS);
  });

  it("round-trips an edit, with the switches and the method as numbers", () => {
    const p = on({ method: "rld", edgesOnly: true, haloControl: true, deconvIterations: 77, radius: 1.37 });
    const bag = bagPatch(p);
    expect(bag[qualified("on")]).toBe(true);
    expect(bag[qualified("method")]).toBe(1);
    expect(bag[qualified("edgesOnly")]).toBe(true);
    expect(bag[qualified(DRAWS_KEY)]).toBe(drawCount(p));
    expect(readParams(bag)).toEqual(p);
  });

  it("clamps to the controls' ranges and rounds RawTherapee's whole-number params", () => {
    const p = readParams({
      [qualified("radius")]: 9,
      [qualified("amount")]: 0,
      [qualified("deconvIterations")]: 33.6,
      [qualified("edgesTolerance")]: 1234.4,
      [qualified("contrast")]: Number.NaN,
      [qualified("method")]: "rld",
    });
    expect(p.radius).toBe(3);
    expect(p.amount).toBe(1);
    expect(p.deconvIterations).toBe(34);
    expect(p.edgesTolerance).toBe(1234);
    expect(p.contrast).toBe(DEFAULT_PARAMS.contrast);
    expect(p.method).toBe("usm");
  });

  it("re-derives a draw count that disagrees with its edit, and leaves a matching one", () => {
    const p = on({ method: "rld", deconvRadius: 2 });
    const pasted = { [qualified("on")]: 1, [qualified("method")]: 1, [qualified("deconvRadius")]: 2 };
    expect(rederivePatch(pasted)).toEqual({ [qualified(DRAWS_KEY)]: drawCount(p) });
    expect(rederivePatch(bagPatch(p))).toBeNull();
    expect(rederivePatch({ "other.key": 1 })).toBeNull();
  });

  it("repairs a bag that holds the draw count but no edit key", () => {
    expect(rederivePatch({ [qualified(DRAWS_KEY)]: 9 })).toEqual({ [qualified(DRAWS_KEY)]: 0 });
    expect(rederivePatch({ [qualified(DRAWS_KEY)]: 0 })).toBeNull();
  });

  it("resets to the defaults, off and idle", () => {
    const bag = resetPatch();
    expect(readParams(bag)).toEqual(DEFAULT_PARAMS);
    expect(bag[qualified(DRAWS_KEY)]).toBe(0);
  });
});
