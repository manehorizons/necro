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

function deadCodeFinding(file: string, line = 1, name = "fn"): ClassifiedFinding {
  return {
    node: { id: `${file}:${line}:${name}`, name, file, line, exported: false },
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
    const f = deadCodeFinding("/repo/a.ts", 1, "fn");
    expect(findingKey(f, "/repo")).toBe(
      findingKey(deadCodeFinding("/repo/a.ts", 1, "fn"), "/repo"),
    );
  });

  test("makes the file portion relative to root, not the raw absolute path", () => {
    const f = deadCodeFinding("/repo/src/a.ts", 1, "fn");
    expect(findingKey(f, "/repo")).toBe("src/a.ts:1:fn");
  });

  test("is identical from two different absolute roots for the same relative file (portable across machines/CI)", () => {
    const oneMachine = findingKey(
      deadCodeFinding("/home/dev/repo/src/a.ts", 1, "fn"),
      "/home/dev/repo/src",
    );
    const ciRunner = findingKey(
      deadCodeFinding("/home/runner/work/repo/repo/src/a.ts", 1, "fn"),
      "/home/runner/work/repo/repo/src",
    );
    expect(oneMachine).toBe(ciRunner);
  });
});

describe("complexityKey", () => {
  test("is stable across repeated calls for the same finding", () => {
    expect(complexityKey(complexityFinding(), "/repo")).toBe(
      complexityKey(complexityFinding(), "/repo"),
    );
  });

  test("differs by detector for the same location", () => {
    const cyclomatic = complexityKey(
      complexityFinding({ detector: "cyclomatic" }),
      "/repo",
    );
    const nesting = complexityKey(
      complexityFinding({ detector: "nesting" }),
      "/repo",
    );
    expect(cyclomatic).not.toBe(nesting);
  });

  test("is identical from two different absolute roots for the same relative file", () => {
    const oneMachine = complexityKey(
      complexityFinding({ file: "/home/dev/repo/src/a.ts" }),
      "/home/dev/repo/src",
    );
    const ciRunner = complexityKey(
      complexityFinding({ file: "/home/runner/work/repo/repo/src/a.ts" }),
      "/home/runner/work/repo/repo/src",
    );
    expect(oneMachine).toBe(ciRunner);
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
