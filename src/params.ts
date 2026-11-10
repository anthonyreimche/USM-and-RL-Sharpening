// The param-bag contract. The edit is RawTherapee's Sharpening params under the
// stage's qualified keys, the switches as booleans and the method as 0 or 1. One derived
// key, `draws`, is the pass's draw count: 0 while the edit changes nothing, so
// an untouched photo never runs the passes.

import { DEFAULT_PARAMS, RANGES, drawCount, type NumericKey, type Params } from "./model";

export const EXT_ID = "usm-rl-sharpening";
export const STAGE_ID = `${EXT_ID}.sharpen`;

export type EditKey = keyof Params;
export const EDIT_KEYS: readonly EditKey[] = [
  "on",
  "contrast",
  "blurRadius",
  "method",
  "radius",
  "thresholdBottomLeft",
  "thresholdTopLeft",
  "thresholdTopRight",
  "thresholdBottomRight",
  "amount",
  "edgesOnly",
  "edgesRadius",
  "edgesTolerance",
  "haloControl",
  "haloAmount",
  "deconvRadius",
  "deconvAmount",
  "deconvDamping",
  "deconvIterations",
];
export const DRAWS_KEY = "draws" as const;

/** The panel's labels, which the stage's uniforms share. */
export const LABELS: Record<EditKey, string> = {
  on: "Enabled",
  method: "Method",
  contrast: "Contrast threshold",
  blurRadius: "Blur radius",
  radius: "Radius",
  amount: "Amount",
  thresholdBottomLeft: "Fade-in start",
  thresholdTopLeft: "Fade-in end",
  thresholdTopRight: "Fade-out start",
  thresholdBottomRight: "Fade-out end",
  edgesOnly: "Sharpen only edges",
  edgesRadius: "Edge detection radius",
  edgesTolerance: "Edge tolerance",
  haloControl: "Halo control",
  haloAmount: "Halo amount",
  deconvRadius: "Deconvolution radius",
  deconvAmount: "Deconvolution amount",
  deconvDamping: "Deconvolution damping",
  deconvIterations: "Deconvolution iterations",
};

/** Where the panel's section already says it, the deconvolution controls read short. */
export const PANEL_LABELS: Partial<Record<EditKey, string>> = {
  deconvRadius: "Radius",
  deconvAmount: "Amount",
  deconvDamping: "Damping",
  deconvIterations: "Iterations",
};

export const SWITCHES = ["on", "edgesOnly", "haloControl"] as const;
export type Switch = (typeof SWITCHES)[number];
export const isSwitch = (key: EditKey): key is Switch => (SWITCHES as readonly string[]).includes(key);

/** RawTherapee keeps these as ints. */
const WHOLE: ReadonlySet<NumericKey> = new Set<NumericKey>([
  "amount",
  "thresholdBottomLeft",
  "thresholdTopLeft",
  "thresholdBottomRight",
  "thresholdTopRight",
  "edgesTolerance",
  "haloAmount",
  "deconvAmount",
  "deconvDamping",
  "deconvIterations",
]);

export const qualified = (key: EditKey | typeof DRAWS_KEY): string => `${STAGE_ID}.${key}`;

type Bag = Readonly<Record<string, unknown>>;
type Patch = Record<string, number | boolean>;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function readNumber(key: NumericKey, v: number): number {
  const { min, max } = RANGES[key];
  const clamped = Math.min(Math.max(v, min), max);
  return WHOLE.has(key) ? Math.round(clamped) : clamped;
}

/** `bag` is the host's untyped per-photo bag; a missing or non-finite value reads as the default. */
export function readParams(bag: Bag): Params {
  const out: Params = { ...DEFAULT_PARAMS };
  for (const key of EDIT_KEYS) {
    const v = bag[qualified(key)];
    if (isSwitch(key) && typeof v === "boolean") out[key] = v;
    else if (!finite(v)) continue;
    else if (key === "method") out.method = v >= 0.5 ? "rld" : "usm";
    else if (isSwitch(key)) out[key] = v >= 0.5;
    else out[key] = readNumber(key, v);
  }
  return out;
}

/** A param as the bag holds it. */
export function bagValue(p: Params, key: EditKey): number | boolean {
  if (key === "method") return p.method === "rld" ? 1 : 0;
  if (isSwitch(key)) return p[key];
  return p[key];
}

/** The edit and its draw count. */
export function bagPatch(p: Params): Patch {
  const out: Patch = {};
  for (const key of EDIT_KEYS) out[qualified(key)] = bagValue(p, key);
  out[qualified(DRAWS_KEY)] = drawCount(p);
  return out;
}

/** The draw count the bag's edit needs, when the bag holds a different one. */
export function rederivePatch(bag: Bag): Patch | null {
  if (!(qualified(DRAWS_KEY) in bag) && !EDIT_KEYS.some((key) => qualified(key) in bag)) return null;
  const draws = drawCount(readParams(bag));
  return bag[qualified(DRAWS_KEY)] === draws ? null : { [qualified(DRAWS_KEY)]: draws };
}

export const resetPatch = (): Patch => bagPatch(DEFAULT_PARAMS);
