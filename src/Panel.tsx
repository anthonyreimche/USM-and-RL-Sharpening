// The panel, in the order of the tool it ports: the switch, the contrast
// threshold and blur radius both methods share, the method, then the
// method's own controls. The unsharp mask's threshold is its four points,
// kept in order; the edge and halo sliders show while their switch is on.
//
// It edits whatever useParamScope hands it: the photo's bag in the dock, a
// mask's in the Masking panel. A drag writes the value and the draw count
// live and commits on release, so one gesture is one undo step; a switch
// commits at once. Each change reads the bag the scope holds now, as drags
// outrun renders.

import { DEFAULT_PARAMS, RANGES, drawCount, type Method, type NumericKey, type Params } from "./model";
import { DRAWS_KEY, LABELS, PANEL_LABELS, bagValue, qualified, readParams, type EditKey, type Switch } from "./params";
import { React, api } from "./rt";

export const TITLE = "USM & RL Sharpening";

const METHODS: { value: Method; label: string }[] = [
  { value: "usm", label: "Unsharp mask" },
  { value: "rld", label: "RL deconvolution" },
];

/** The threshold's points, left to right along the difference axis. */
const THRESHOLD: NumericKey[] = ["thresholdBottomLeft", "thresholdTopLeft", "thresholdTopRight", "thresholdBottomRight"];

/** A threshold point moved to `v`, held between its neighbours. */
function orderedThreshold(p: Params, key: NumericKey, v: number): number {
  const at = THRESHOLD.indexOf(key);
  if (at < 0) return v;
  const lo = at > 0 ? p[THRESHOLD[at - 1]] : RANGES[key].min;
  const hi = at < THRESHOLD.length - 1 ? p[THRESHOLD[at + 1]] : RANGES[key].max;
  return Math.min(Math.max(v, lo), hi);
}

export function SharpeningPanel() {
  const { Slider } = api.components;
  const { Section, SegmentedControl, Stack, Toggle } = api.ui;
  const scope = api.develop.useParamScope();
  const p = readParams(scope.getParams());

  const write = (next: Params, keys: readonly EditKey[]) => {
    const patch: Record<string, number | boolean> = {};
    for (const key of keys) patch[qualified(key)] = bagValue(next, key);
    patch[qualified(DRAWS_KEY)] = drawCount(next);
    scope.setParams(patch);
  };

  const slider = (key: NumericKey) => {
    const range = RANGES[key];
    const label = PANEL_LABELS[key] ?? LABELS[key];
    return (
      <Slider
        key={key}
        label={label}
        value={p[key]}
        min={range.min}
        max={range.max}
        step={range.step}
        defaultValue={DEFAULT_PARAMS[key]}
        onChange={(v) => {
          const now = readParams(scope.getParams());
          const clamped = Math.min(Math.max(v, range.min), range.max);
          write({ ...now, [key]: orderedThreshold(now, key, clamped) }, [key]);
        }}
        onCommit={() => scope.commit(`${TITLE}: ${LABELS[key].toLowerCase()}`)}
      />
    );
  };

  const toggle = (key: Switch) => (
    <Toggle
      checked={p[key]}
      label={LABELS[key]}
      onChange={(checked) => {
        write({ ...readParams(scope.getParams()), [key]: checked }, [key]);
        scope.commit(`${TITLE}: ${LABELS[key].toLowerCase()} ${checked ? "on" : "off"}`);
      }}
    />
  );

  const usm = p.method === "usm";

  return (
    <Stack gap={6} style={{ padding: 8 }}>
      {toggle("on")}
      {slider("contrast")}
      {slider("blurRadius")}
      <SegmentedControl
        size="sm"
        value={p.method}
        options={METHODS}
        onChange={(v) => {
          write({ ...readParams(scope.getParams()), method: v === "rld" ? "rld" : "usm" }, ["method"]);
          scope.commit(`${TITLE}: ${LABELS.method.toLowerCase()}`);
        }}
      />
      {usm ? (
        <>
          {slider("radius")}
          <Section title="Threshold">{THRESHOLD.map((key) => slider(key))}</Section>
          {slider("amount")}
          {toggle("edgesOnly")}
          {p.edgesOnly ? (
            <>
              {slider("edgesRadius")}
              {slider("edgesTolerance")}
            </>
          ) : null}
          {toggle("haloControl")}
          {p.haloControl ? slider("haloAmount") : null}
        </>
      ) : (
        <>
          {slider("deconvRadius")}
          {slider("deconvAmount")}
          {slider("deconvDamping")}
          {slider("deconvIterations")}
        </>
      )}
    </Stack>
  );
}
