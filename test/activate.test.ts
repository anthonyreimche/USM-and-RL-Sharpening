import { describe, expect, it } from "vitest";
import { PANEL_ID, activate, deactivate } from "../src/index";
import { DEFAULT_PARAMS, drawCount } from "../src/model";
import { STAGE_ID, qualified } from "../src/params";
import { fakeApi } from "./support/fake-api";

describe("activate", () => {
  it("registers the stage and a panel titled USM & RL Sharpening that also edits masks", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.stages.map((s) => s.id)).toEqual([STAGE_ID]);
    expect(rig.panels.map((p) => [p.id, p.title])).toEqual([[PANEL_ID, "USM & RL Sharpening"]]);
    expect(rig.panels[0].mask?.owns).toContain(qualified("draws"));
    expect(rig.panels[0].mask?.owns).toContain(qualified("deconvIterations"));
    deactivate();
  });

  it("resets to the defaults, off, in one undo step", () => {
    const rig = fakeApi({ [qualified("on")]: 1, [qualified("amount")]: 500 });
    activate(rig.api);
    rig.panels[0].onReset?.();
    expect(rig.params()[qualified("on")]).toBe(false);
    expect(rig.params()[qualified("amount")]).toBe(DEFAULT_PARAMS.amount);
    expect(rig.params()[qualified("draws")]).toBe(0);
    expect(rig.commits).toEqual(["USM & RL Sharpening reset"]);
    deactivate();
  });

  it("re-derives the draw count of a pasted edit", () => {
    const rig = fakeApi();
    activate(rig.api);
    rig.replace({ [qualified("on")]: true, [qualified("method")]: 1, [qualified("deconvIterations")]: 80 });
    expect(rig.params()[qualified("draws")]).toBe(drawCount({ ...DEFAULT_PARAMS, on: true, method: "rld", deconvIterations: 80 }));
    deactivate();
  });

  it("re-derives a mask's", () => {
    const rig = fakeApi();
    activate(rig.api);
    rig.setMasks([{ id: "m1", bag: { [qualified("on")]: true, [qualified("radius")]: 2 } }]);
    expect(rig.maskBag("m1")?.[qualified("draws")]).toBe(drawCount({ ...DEFAULT_PARAMS, on: true, radius: 2 }));
    deactivate();
  });

  it("clears a stale draw count that arrives without its edit", () => {
    const rig = fakeApi();
    activate(rig.api);
    rig.replace({ [qualified("draws")]: 7 });
    expect(rig.params()[qualified("draws")]).toBe(0);
    deactivate();
  });

  it("stops re-deriving once deactivated", () => {
    const rig = fakeApi();
    activate(rig.api);
    deactivate();
    rig.replace({ [qualified("on")]: true });
    expect(rig.params()[qualified("draws")]).toBeUndefined();
  });
});
