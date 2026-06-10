import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { captureRefactorSkeletons } from "../src/refactor/eval-capture.js";

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
