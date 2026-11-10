// The processing stage: the schedule in one four-channel pass (glsl.ts), and
// the inline that moves each pixel's L* by the pass's result. RawTherapee
// sharpens the L of its Lab after the tone curve, so the stage sits after the
// display tools, in linear Rec.709, RawTherapee's "sRGB" working space.

import { INLINE_GLSL, INLINE_HELPERS, PASS_GLSL, PASS_HELPERS, REGION_GLSL } from "./glsl";
import { DEFAULT_PARAMS, MAX_DRAWS, RANGES, type NumericKey } from "./model";
import { DRAWS_KEY, EDIT_KEYS, LABELS, STAGE_ID, bagValue, isSwitch, type EditKey } from "./params";
import type { ProcessingStageContribution, UniformDeclaration } from "./safelight";

/** After impulse noise reduction (10), sharpen edges (120) and microcontrast
 *  (130), as RawTherapee runs them. */
export const PRIORITY = 140;

const isNumeric = (key: EditKey): key is NumericKey => key in RANGES;

const edit = (key: EditKey): UniformDeclaration => {
  const base = { key, default: bagValue(DEFAULT_PARAMS, key), label: LABELS[key] };
  if (isSwitch(key)) return { ...base, glslType: "bool" };
  return { ...base, glslType: "float", range: isNumeric(key) ? { ...RANGES[key] } : { min: 0, max: 1, step: 1 } };
};

const DRAWS: UniformDeclaration = { key: DRAWS_KEY, glslType: "int", default: 0 };

export function sharpeningStage(): ProcessingStageContribution {
  return {
    id: STAGE_ID,
    name: "USM & RL Sharpening",
    phase: "display-adjust",
    priority: PRIORITY,
    reads: "current",
    space: { encoding: "linear", primaries: "rec709" },
    glsl: INLINE_GLSL,
    helpers: INLINE_HELPERS,
    uniforms: [...EDIT_KEYS.map(edit), DRAWS],
    passes: [
      {
        channels: 4,
        glsl: PASS_GLSL,
        helpers: PASS_HELPERS,
        region: REGION_GLSL,
        iterations: { key: DRAWS_KEY, max: MAX_DRAWS },
        uniforms: EDIT_KEYS.map(edit),
      },
    ],
    dormantWhen: { [DRAWS_KEY]: 0 },
    mask: { maskable: true },
  };
}
