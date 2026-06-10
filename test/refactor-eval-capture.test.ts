import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { captureDuplicateSkeletons, captureRefactorSkeletons } from "../src/refactor/eval-capture.js";

/** A `necro scan --json` document carrying only the given complexity findings. */
const scanDoc = (complexity: unknown[]) => JSON.stringify({ findings: [], complexity, hotspots: [], duplication: [] });

const godFinding = (name: string, line: number, value: number, threshold = 3) => ({
  detector: "god-function",
  file: "src/svc.ts",
  line,
  name,
  value,
  threshold,
  message: `god function — ${value} lines > ${threshold}`,
});

describe("captureRefactorSkeletons (AC-1)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "necro-refactor-capture-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // src/svc.ts:
  //  1 import { helper } from "./helper.js";
  //  2
  //  3 export function bigHandler(a, b) {     <- god function, loc 5
  //  4   const x = helper(a) + b;
  //  5   const y = x * 2;
  //  6   return y;
  //  7 }
  //  8 export function tiny(a, b, c, d, e, f) {   <- params-over only, loc 3
  //  9   return a;
  // 10 }
  const writeSource = async () => {
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(
      join(dir, "src", "svc.ts"),
      [
        'import { helper } from "./helper.js";',
        "",
        "export function bigHandler(a, b) {",
        "  const x = helper(a) + b;",
        "  const y = x * 2;",
        "  return y;",
        "}",
        "export function tiny(a, b, c, d, e, f) {",
        "  return a;",
        "}",
      ].join("\n"),
    );
  };

  test("emits one case per loc-over god function with verbatim source, signature, threshold, provenance (AC-1)", async () => {
    await writeSource();
    const json = scanDoc([godFinding("bigHandler", 3, 5)]);
    const cases = await captureRefactorSkeletons(json, { repo: "acme/widgets", sha: "abc1234", sourceRoot: dir, threshold: 3 });

    expect(cases).toHaveLength(1);
    const c = cases[0]!;
    expect(c.name).toBe("bigHandler");
    expect(c.file).toBe("src/svc.ts");
    expect(c.threshold).toBe(3);
    // signature is the verbatim declaration line
    expect(c.signature).toBe("export function bigHandler(a, b) {");
    // source is the VERBATIM function body — raw, NOT line-prefixed (buildCasePrompt numbers it)
    expect(c.source).toBe(["export function bigHandler(a, b) {", "  const x = helper(a) + b;", "  const y = x * 2;", "  return y;", "}"].join("\n"));
    expect(c.source).not.toMatch(/^\d+\t/m); // no line-number prefixes
    expect(c.source).toContain(c.signature);
    // provenance — enough to re-derive and audit
    expect(c.provenance).toEqual({ repo: "acme/widgets", sha: "abc1234", file: "src/svc.ts", line: 3, symbol: "bigHandler" });
  });

  test("handles absolute finding paths (real `necro scan` output), recording repo-relative provenance (AC-1)", async () => {
    await writeSource();
    // necro scan emits ABSOLUTE file paths; capture must read them and relativize provenance to sourceRoot.
    const abs = join(dir, "src", "svc.ts");
    const json = scanDoc([godFinding("bigHandler", 3, 5)].map((f) => ({ ...f, file: abs })));
    const cases = await captureRefactorSkeletons(json, { repo: "acme/widgets", sha: "abc1234", sourceRoot: dir, threshold: 3 });

    expect(cases).toHaveLength(1);
    const c = cases[0]!;
    expect(c.signature).toBe("export function bigHandler(a, b) {");
    expect(c.file).toBe("src/svc.ts"); // repo-relative, not absolute
    expect(c.provenance).toEqual({ repo: "acme/widgets", sha: "abc1234", file: "src/svc.ts", line: 3, symbol: "bigHandler" });
  });

  test("excludes non-god-function complexity findings (AC-1)", async () => {
    await writeSource();
    const cyclomatic = { detector: "cyclomatic", file: "src/svc.ts", line: 3, name: "bigHandler", value: 11, threshold: 10, message: "cyclomatic complexity 11 > 10" };
    const json = scanDoc([cyclomatic, godFinding("bigHandler", 3, 5)]);
    const cases = await captureRefactorSkeletons(json, { repo: "r", sha: "s", sourceRoot: dir, threshold: 3 });
    expect(cases).toHaveLength(1);
    expect(cases[0]?.name).toBe("bigHandler");
  });

  test("excludes god functions whose loc does not exceed the loc threshold (params-only) (AC-1)", async () => {
    await writeSource();
    // `tiny` is flagged god-function for params (6 > 5) but is only 3 loc — not a split target.
    const json = scanDoc([godFinding("bigHandler", 3, 5), { ...godFinding("tiny", 8, 6, 5) }]);
    const cases = await captureRefactorSkeletons(json, { repo: "r", sha: "s", sourceRoot: dir, threshold: 3 });
    expect(cases.map((c) => c.name)).toEqual(["bigHandler"]);
  });

  test("empty complexity findings → empty cases, no throw (AC-1)", async () => {
    const cases = await captureRefactorSkeletons(scanDoc([]), { repo: "r", sha: "s", sourceRoot: dir, threshold: 3 });
    expect(cases).toEqual([]);
  });
});

/** A `necro scan --json` document carrying only the given duplication findings. */
const dupDoc = (duplication: unknown[]) => JSON.stringify({ findings: [], complexity: [], hotspots: [], duplication });

describe("captureDuplicateSkeletons (AC-1)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "necro-dup-capture-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // src/metrics.ts — a same-file clone group: the bodies of reportA / reportB.
  //  1 import { round } from "./math.js";
  //  2 export function reportA(values) {        <- enclosing surface for clone #1
  //  3   const total = values.reduce((s, v) => s + v, 0);   <- clone startLine
  //  4   const mean = total / values.length;
  //  5   return round(mean, 2);
  //  6 }
  //  7 export function reportB(values) {        <- enclosing surface for clone #2
  //  8   const total = values.reduce((s, v) => s + v, 0);   <- clone startLine
  //  9   const mean = total / values.length;
  // 10   return round(mean, 2);
  // 11 }
  const metricsSource = [
    'import { round } from "./math.js";',
    "export function reportA(values) {",
    "  const total = values.reduce((s, v) => s + v, 0);",
    "  const mean = total / values.length;",
    "  return round(mean, 2);",
    "}",
    "export function reportB(values) {",
    "  const total = values.reduce((s, v) => s + v, 0);",
    "  const mean = total / values.length;",
    "  return round(mean, 2);",
    "}",
  ].join("\n");
  const writeMetrics = async () => {
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "metrics.ts"), metricsSource);
  };

  const sameFileGroup = (file: string) => ({
    tokens: 18,
    locations: [
      { file, startLine: 3, endLine: 5 },
      { file, startLine: 8, endLine: 10 },
    ],
  });

  test("emits one case per clone group with verbatim file sources, locations, tokens, minTokens, signatures, provenance (AC-1)", async () => {
    await writeMetrics();
    const json = dupDoc([sameFileGroup("src/metrics.ts")]);
    const cases = await captureDuplicateSkeletons(json, { repo: "acme/widgets", sha: "abc1234", sourceRoot: dir, minTokens: 10 });

    expect(cases).toHaveLength(1);
    const c = cases[0]!;
    // a single referenced file, captured VERBATIM (raw — buildDuplicateCasePrompt numbers it)
    expect(c.files).toHaveLength(1);
    expect(c.files[0]!.path).toBe("src/metrics.ts");
    expect(c.files[0]!.source).toBe(metricsSource);
    expect(c.files[0]!.source).not.toMatch(/^\d+\t/m);
    // locations preserved (repo-relative file), tokens + minTokens recorded
    expect(c.locations).toEqual([
      { file: "src/metrics.ts", startLine: 3, endLine: 5 },
      { file: "src/metrics.ts", startLine: 8, endLine: 10 },
    ]);
    expect(c.tokens).toBe(18);
    expect(c.minTokens).toBe(10);
    // signatures are the enclosing declaration lines (nearest non-blank line above each clone), verbatim
    expect(c.signatures).toEqual(["export function reportA(values) {", "export function reportB(values) {"]);
    for (const sig of c.signatures) expect(c.files[0]!.source).toContain(sig);
    // provenance — anchored at the first location; symbol === name for the integrity guard
    expect(c.provenance).toMatchObject({ repo: "acme/widgets", sha: "abc1234", file: "src/metrics.ts", line: 3 });
    expect(c.provenance!.symbol).toBe(c.name);
  });

  test("handles absolute finding paths (real `necro scan` output), recording repo-relative paths (AC-1)", async () => {
    await writeMetrics();
    const abs = join(dir, "src", "metrics.ts");
    const json = dupDoc([sameFileGroup(abs)]);
    const cases = await captureDuplicateSkeletons(json, { repo: "acme/widgets", sha: "abc1234", sourceRoot: dir, minTokens: 10 });

    expect(cases).toHaveLength(1);
    const c = cases[0]!;
    expect(c.files[0]!.path).toBe("src/metrics.ts"); // repo-relative, not absolute
    expect(c.locations.every((l) => l.file === "src/metrics.ts")).toBe(true);
    expect(c.provenance).toMatchObject({ repo: "acme/widgets", sha: "abc1234", file: "src/metrics.ts" });
  });

  test("a cross-file clone group collects each distinct file once, verbatim (AC-1)", async () => {
    await mkdir(join(dir, "src"), { recursive: true });
    const a = ["export function loadA(p) {", "  const raw = read(p);", "  return parse(raw);", "}"].join("\n");
    const b = ["export function loadB(p) {", "  const raw = read(p);", "  return parse(raw);", "}"].join("\n");
    await writeFile(join(dir, "src", "a.ts"), a);
    await writeFile(join(dir, "src", "b.ts"), b);
    const json = dupDoc([
      {
        tokens: 20,
        locations: [
          { file: "src/a.ts", startLine: 2, endLine: 3 },
          { file: "src/b.ts", startLine: 2, endLine: 3 },
        ],
      },
    ]);
    const cases = await captureDuplicateSkeletons(json, { repo: "r", sha: "s", sourceRoot: dir, minTokens: 10 });
    expect(cases).toHaveLength(1);
    const c = cases[0]!;
    expect(c.files.map((f) => f.path).sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(c.files.find((f) => f.path === "src/a.ts")!.source).toBe(a);
    expect(c.files.find((f) => f.path === "src/b.ts")!.source).toBe(b);
    expect(c.signatures).toEqual(["export function loadA(p) {", "export function loadB(p) {"]);
  });

  test("empty duplication findings → empty cases, no throw (AC-1)", async () => {
    const cases = await captureDuplicateSkeletons(dupDoc([]), { repo: "r", sha: "s", sourceRoot: dir, minTokens: 10 });
    expect(cases).toEqual([]);
  });
});
