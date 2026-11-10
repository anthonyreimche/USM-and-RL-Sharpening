import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { activate } from "../src/index";
import { DEFAULT_PARAMS, drawCount } from "../src/model";
import { SharpeningPanel } from "../src/Panel";
import { qualified } from "../src/params";
import { React } from "../src/rt";
import { fakeApi } from "./support/fake-api";

function setup(params: Record<string, unknown> = {}) {
  const rig = fakeApi(params);
  activate(rig.api);
  const view = render(<SharpeningPanel />);
  const labels = () => rig.sliders(view.container).map((s) => s.label);
  const slider = (label: string) => {
    const found = rig.sliders(view.container).find((s) => s.label === label);
    if (!found) throw new Error(`no slider ${label}`);
    return found;
  };
  const toggle = (label: string) => {
    const found = [...view.container.querySelectorAll("label")].find((l) => l.textContent === label)?.querySelector("input");
    if (!found) throw new Error(`no toggle ${label}`);
    return found;
  };
  const button = (label: string) => {
    const found = [...view.container.querySelectorAll("button")].find((b) => b.textContent === label);
    if (!found) throw new Error(`no button ${label}`);
    return found;
  };
  return { rig, view, labels, slider, toggle, button };
}

afterEach(cleanup);

describe("the panel", () => {
  it("lists the unsharp mask's controls in the tool's order, the threshold as its four points", () => {
    const { labels, view } = setup();
    expect(labels()).toEqual(["Contrast threshold", "Blur radius", "Radius", "Fade-in start", "Fade-in end", "Fade-out start", "Fade-out end", "Amount"]);
    expect([...view.container.querySelectorAll("label")].map((l) => l.textContent)).toEqual(["Enabled", "Sharpen only edges", "Halo control"]);
    expect([...view.container.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Unsharp mask", "RL deconvolution"]);
    expect([...view.container.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Threshold"]);
  });

  it("shows the defaults and the tool's ranges", () => {
    const { slider } = setup();
    expect(slider("Contrast threshold")).toMatchObject({ value: 20, min: 0, max: 200, defaultValue: 20 });
    expect(slider("Blur radius")).toMatchObject({ value: 0.2, min: 0.2, max: 2, step: 0.05 });
    expect(slider("Radius")).toMatchObject({ value: 0.5, min: 0.3, max: 3, step: 0.01 });
    expect(slider("Amount")).toMatchObject({ value: 200, min: 1, max: 1000 });
    expect(slider("Fade-in start")).toMatchObject({ value: 20, min: 0, max: 2000 });
    expect(slider("Fade-out end")).toMatchObject({ value: 2000 });
  });

  it("switches on in one undo step, and only then draws", () => {
    const { rig, toggle } = setup();
    act(() => void fireEvent.click(toggle("Enabled")));
    expect(rig.params()[qualified("on")]).toBe(true);
    expect(rig.params()[qualified("draws")]).toBe(drawCount({ ...DEFAULT_PARAMS, on: true }));
    expect(rig.commits).toEqual(["USM & RL Sharpening: enabled on"]);
  });

  it("writes the value and the draw count as a slider moves, and one undo step on release", () => {
    const { rig, slider } = setup({ [qualified("on")]: 1 });
    act(() => slider("Radius").onChange(1.4));
    expect(rig.params()[qualified("radius")]).toBe(1.4);
    expect(rig.params()[qualified("draws")]).toBe(drawCount({ ...DEFAULT_PARAMS, on: true, radius: 1.4 }));
    act(() => slider("Radius").onCommit?.());
    expect(rig.commits).toEqual(["USM & RL Sharpening: radius"]);
  });

  it("keeps the threshold's points in order", () => {
    const { rig, slider } = setup();
    act(() => slider("Fade-in end").onChange(1500));
    expect(rig.params()[qualified("thresholdTopLeft")]).toBe(1200);
    act(() => slider("Fade-in start").onChange(1900));
    expect(rig.params()[qualified("thresholdBottomLeft")]).toBe(1200);
  });

  it("shows the edge and halo sliders while their switches are on", () => {
    const { labels, toggle } = setup();
    act(() => void fireEvent.click(toggle("Sharpen only edges")));
    act(() => void fireEvent.click(toggle("Halo control")));
    expect(labels().slice(-3)).toEqual(["Edge detection radius", "Edge tolerance", "Halo amount"]);
  });

  it("shows deconvolution's controls for that method", () => {
    const { rig, labels, button } = setup({ [qualified("on")]: 1 });
    act(() => void fireEvent.click(button("RL deconvolution")));
    expect(rig.params()[qualified("method")]).toBe(1);
    expect(rig.params()[qualified("draws")]).toBe(drawCount({ ...DEFAULT_PARAMS, on: true, method: "rld" }));
    expect(labels()).toEqual(["Contrast threshold", "Blur radius", "Radius", "Amount", "Damping", "Iterations"]);
    expect(rig.commits).toEqual(["USM & RL Sharpening: method"]);
  });

  it("lays its switches out in a stack, as the sibling sharpeners do", () => {
    const { view } = setup();
    expect(view.container.firstElementChild?.hasAttribute("data-stack")).toBe(true);
  });

  it("names no other program", () => {
    const { view } = setup();
    expect(view.container.textContent ?? "").not.toMatch(/rawtherapee|darktable|lightroom/i);
  });
});
