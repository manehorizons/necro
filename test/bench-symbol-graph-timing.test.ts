import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import {
  measureSymbolGraphTiming,
  parseArgs,
} from "../src/bench/symbol-graph-timing.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-symbol-graph-timing-"));
  await mkdir(join(dir, "src"), { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("measureSymbolGraphTiming (AC-1)", () => {
  test("reports file/decl/edge counts and non-negative timings for a known fixture", async () => {
    await writeFile(
      join(dir, "src", "a.ts"),
      "export function greet() { return 'hi'; }\n",
    );
    await writeFile(
      join(dir, "src", "b.ts"),
      "import { greet } from './a.js';\nexport function callGreet() { return greet(); }\n",
    );

    const result = await measureSymbolGraphTiming(dir, DEFAULT_CONFIG);

    expect(result.fileCount).toBe(2);
    expect(result.declCount).toBe(2); // greet, callGreet
    expect(result.edgeCount).toBe(2); // callGreet -> greet: one for the import specifier, one for the call
    expect(result.discoverMs).toBeGreaterThanOrEqual(0);
    expect(result.buildMs).toBeGreaterThanOrEqual(0);
  });

  test("counts zero files/decls/edges on an empty tree", async () => {
    const result = await measureSymbolGraphTiming(dir, DEFAULT_CONFIG);

    expect(result.fileCount).toBe(0);
    expect(result.declCount).toBe(0);
    expect(result.edgeCount).toBe(0);
  });
});

describe("parseArgs (AC-1)", () => {
  test("parses --repo", () => {
    expect(parseArgs(["--repo", "/some/path"])).toEqual({
      repo: "/some/path",
      include: undefined,
    });
  });

  test("parses --include as a comma-split list", () => {
    expect(parseArgs(["--repo", "/some/path", "--include", "**/*.ts,**/*.tsx"])).toEqual({
      repo: "/some/path",
      include: ["**/*.ts", "**/*.tsx"],
    });
  });

  test("throws without --repo", () => {
    expect(() => parseArgs([])).toThrow("--repo <path> is required");
  });
});

describe("measureSymbolGraphTiming with cached: true (AC-2)", () => {
  test("uses the symbol-graph cache and reports a fast second run", async () => {
    await writeFile(
      join(dir, "src", "a.ts"),
      "export function greet() { return 'hi'; }\n",
    );

    const first = await measureSymbolGraphTiming(dir, DEFAULT_CONFIG, { cached: true });
    expect(first.declCount).toBe(1);

    const second = await measureSymbolGraphTiming(dir, DEFAULT_CONFIG, { cached: true });
    expect(second.declCount).toBe(1);
    expect(second.buildMs).toBeLessThanOrEqual(first.buildMs + 1);
  });
});

describe("parseArgs --twice (AC-2)", () => {
  test("parses --twice as a boolean flag", () => {
    expect(parseArgs(["--repo", "/some/path", "--twice"])).toEqual({
      repo: "/some/path",
      include: undefined,
      twice: true,
    });
  });

  test("defaults twice to undefined when absent", () => {
    expect(parseArgs(["--repo", "/some/path"])).toEqual({
      repo: "/some/path",
      include: undefined,
      twice: undefined,
    });
  });
});
