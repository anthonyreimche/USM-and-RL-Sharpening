// rawtherapee.json: a small linear Rec.709 scene and rawtherapee-cli's
// Sharpening output for it, made by the extension-reference rig
// (modules/rtsharpening/make_fixture.py).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PARAMS, type Params } from "../../src/model";
import type { Image } from "./rtref";

interface Raw {
  about: string;
  width: number;
  height: number;
  input: string;
  identity: string;
  cases: { name: string; params: Partial<Params>; output: string }[];
}

export interface FixtureCase {
  name: string;
  params: Params;
  output: Float32Array;
}

export interface Fixture {
  about: string;
  input: Image;
  identity: Float32Array;
  cases: FixtureCase[];
}

const decode = (b64: string): Float32Array => {
  const bytes = Buffer.from(b64, "base64");
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

export function loadFixture(): Fixture {
  const path = join(dirname(fileURLToPath(import.meta.url)), "rawtherapee.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as Raw;
  return {
    about: raw.about,
    input: { width: raw.width, height: raw.height, data: decode(raw.input) },
    identity: decode(raw.identity),
    cases: raw.cases.map((c) => ({ name: c.name, params: { ...DEFAULT_PARAMS, on: true, ...c.params }, output: decode(c.output) })),
  };
}
