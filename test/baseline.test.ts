import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ClassifiedFinding } from "../src/analyze/classify.js";
import {
  complexityKey,
  findingKey,
  readBaseline,
  writeBaseline,
} from "../src/baseline.js";
import type { ComplexityFinding } from "../src/syntactic/types.js";

function deadCodeFinding(id: string): ClassifiedFinding {
  return {
    node: { id, name: id, file: `${id}.ts`, line: 1, exported: false },
    verdict: "dead",
    tier: "certain",
    autoFixEligible: true,
    evidence: [],
  };
}

function complexityFinding(overrides: Partial<ComplexityFinding> = {}): ComplexityFinding {
  return {
    detector: "cyclomatic",
    file: "a.ts",
    line: 10,
    name: "fn",
    value: 20,
    threshold: 10,
    message: "too complex",
    ...overrides,
  };
}

describe("findingKey", () => {
  test("is stable across repeated calls for the same finding", () => {
    const f = deadCodeFinding("a.ts:1:fn");
    expect(findingKey(f)).toBe(findingKey(deadCodeFinding("a.ts:1:fn")));
  });

  test("uses the symbol node's stable id", () => {
    expect(findingKey(deadCodeFinding("a.ts:1:fn"))).toBe("a.ts:1:fn");
  });
});

describe("complexityKey", () => {
  test("is stable across repeated calls for the same finding", () => {
    expect(complexityKey(complexityFinding())).toBe(complexityKey(complexityFinding()));
  });

  test("differs by detector for the same location", () => {
    const cyclomatic = complexityKey(complexityFinding({ detector: "cyclomatic" }));
    const nesting = complexityKey(complexityFinding({ detector: "nesting" }));
    expect(cyclomatic).not.toBe(nesting);
  });
});

describe("readBaseline / writeBaseline", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "necro-baseline-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("round-trips a set of keys through disk", async () => {
    const path = join(dir, ".necro-baseline.json");
    await writeBaseline(path, ["b.ts:2:x", "a.ts:1:fn"]);
    const keys = await readBaseline(path);
    expect(keys).toEqual(new Set(["a.ts:1:fn", "b.ts:2:x"]));
  });

  test("returns undefined when the file does not exist", async () => {
    const keys = await readBaseline(join(dir, "does-not-exist.json"));
    expect(keys).toBeUndefined();
  });

  test("writes sorted keys for diffability", async () => {
    const path = join(dir, ".necro-baseline.json");
    await writeBaseline(path, ["z", "a", "m"]);
    const raw = JSON.parse(await (await import("node:fs/promises")).readFile(path, "utf8"));
    expect(raw.keys).toEqual(["a", "m", "z"]);
  });
});
