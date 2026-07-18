import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { computeResolutionRate, isLocalImportCandidate, parseArgs } from "../src/bench/python-import-resolution-rate.js";
import type { PythonImport } from "../src/graph/python/import-parser.js";

const FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "python-module-resolver");
const REALREPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "python-realrepo");

describe("parseArgs", () => {
  test("parses --repo", () => {
    expect(parseArgs(["--repo", "/some/path"])).toEqual({ repo: "/some/path" });
  });

  test("throws without --repo", () => {
    expect(() => parseArgs([])).toThrow("--repo");
  });
});

describe("computeResolutionRate", () => {
  test("AC-7: aggregates resolved/total across every import in a fixture tree", async () => {
    const result = await computeResolutionRate(join(FIXTURES_ROOT, "regular-package"));
    expect(result).toEqual({ total: 1, resolved: 1, rate: 1 });
  });

  test("imports of packages this repo never discovered are excluded as non-local, not counted as failures", async () => {
    // `import totally.missing` / `from also.missing import nothing`: neither
    // `totally` nor `also` is a top-level package this fixture tree produced,
    // so both are judged external (stdlib/third-party-shaped) and excluded.
    const result = await computeResolutionRate(join(FIXTURES_ROOT, "missing-target"));
    expect(result).toEqual({ total: 0, resolved: 0, rate: 0 });
  });

  test("a local package's genuinely missing submodule counts as a real failure", async () => {
    // `from pkg import ghost` in a fixture where `pkg` IS a discovered
    // top-level package (via pkg/real.py) but has no __init__.py and no
    // `ghost` submodule — this must count toward total and NOT resolved.
    const result = await computeResolutionRate(join(FIXTURES_ROOT, "unresolvable-local"));
    expect(result).toEqual({ total: 1, resolved: 0, rate: 0 });
  });
});

describe("computeResolutionRate against the vendored python-realrepo corpus (AC-7, phase 48)", () => {
  test("pip fixture slice resolves >=95% of local imports", async () => {
    const result = await computeResolutionRate(join(REALREPO_ROOT, "pip"));
    console.log(`pip: ${result.resolved}/${result.total} local imports resolved (${(result.rate * 100).toFixed(1)}%)`);
    expect(result.total).toBeGreaterThan(0);
    expect(result.rate).toBeGreaterThanOrEqual(0.95);
  });

  test("httpie fixture slice resolves >=95% of local imports", async () => {
    const result = await computeResolutionRate(join(REALREPO_ROOT, "httpie"));
    console.log(`httpie: ${result.resolved}/${result.total} local imports resolved (${(result.rate * 100).toFixed(1)}%)`);
    expect(result.total).toBeGreaterThan(0);
    expect(result.rate).toBeGreaterThanOrEqual(0.95);
  });
});

describe("isLocalImportCandidate", () => {
  const topLevel = new Set(["pkg"]);

  test("relative imports are always local regardless of top-level packages", () => {
    const imp: PythonImport = { kind: "from", line: 1, relativeDots: 1, moduleSegments: [], isStar: false, names: [{ name: "x", alias: null, binding: "x" }] };
    expect(isLocalImportCandidate(imp, new Set())).toEqual([true]);
  });

  test("absolute from-import is local only if its top segment is a known package", () => {
    const local: PythonImport = { kind: "from", line: 1, relativeDots: 0, moduleSegments: ["pkg", "sub"], isStar: false, names: [{ name: "a", alias: null, binding: "a" }, { name: "b", alias: null, binding: "b" }] };
    const external: PythonImport = { kind: "from", line: 1, relativeDots: 0, moduleSegments: ["os", "path"], isStar: false, names: [{ name: "join", alias: null, binding: "join" }] };
    expect(isLocalImportCandidate(local, topLevel)).toEqual([true, true]);
    expect(isLocalImportCandidate(external, topLevel)).toEqual([false]);
  });

  test("`import a, b` is judged per module, not per statement", () => {
    const imp: PythonImport = { kind: "import", line: 1, modules: [{ segments: ["pkg", "mod"], alias: null, binding: "pkg" }, { segments: ["sys"], alias: null, binding: "sys" }] };
    expect(isLocalImportCandidate(imp, topLevel)).toEqual([true, false]);
  });

  test("a `_vendor`/`vendor` bundled-dependency import is excluded even though its top segment matches (AC-7, phase 48)", () => {
    const pipVendor: PythonImport = {
      kind: "from",
      line: 1,
      relativeDots: 0,
      moduleSegments: ["pip", "_vendor", "requests"],
      isStar: false,
      names: [{ name: "get", alias: null, binding: "get" }],
    };
    const setuptoolsVendor: PythonImport = {
      kind: "import",
      line: 1,
      modules: [{ segments: ["pkg", "vendor", "six"], alias: null, binding: "pkg" }],
    };
    expect(isLocalImportCandidate(pipVendor, new Set(["pip"]))).toEqual([false]);
    expect(isLocalImportCandidate(setuptoolsVendor, topLevel)).toEqual([false]);
  });
});
