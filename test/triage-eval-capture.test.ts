import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { captureEvalSkeletons } from "../src/triage/eval-capture.js";

const scanDoc = (findings: unknown[]) => JSON.stringify({ findings, complexity: [], hotspots: [], duplication: [] });

const maybeFinding = (name: string, line: number) => ({
  name,
  file: "src/svc.ts",
  line,
  tier: "maybe",
  verdict: "dead",
  autoFixEligible: false,
  evidence: [
    { ok: true, text: "0 static references (TS compiler)" },
    { ok: false, text: "referenced only in test files" },
  ],
});

describe("captureEvalSkeletons (AC-1)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "necro-capture-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const writeSource = async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(
      join(dir, "src", "svc.ts"),
      [
        "import { x } from './x.js';", // 1
        "", // 2
        "export function deadThing() {", // 3
        "  return x + 1;", // 4
        "}", // 5
        "export function liveThing() {", // 6
        "  return 2;", // 7
        "}", // 8
      ].join("\n"),
    );
  };

  test("emits one skeleton per maybe finding with verbatim evidence + provenance (AC-1)", async () => {
    await writeSource();
    const json = scanDoc([maybeFinding("deadThing", 3)]);
    const skeletons = await captureEvalSkeletons(json, { repo: "acme/widgets", sha: "abc1234", sourceRoot: dir, radius: 1 });

    expect(skeletons).toHaveLength(1);
    const s = skeletons[0]!;
    expect(s.name).toBe("deadThing");
    expect(s.truth).toBeNull(); // human fills it
    expect(s.rationale).toBe("");
    // verbatim evidence — same array necro emitted, not re-authored
    expect(s.evidence).toEqual([
      { ok: true, text: "0 static references (TS compiler)" },
      { ok: false, text: "referenced only in test files" },
    ]);
    // production-format snippet (line-prefixed) re-read from the real source
    expect(s.code).toContain("export function deadThing() {");
    expect(s.code).toMatch(/3\texport function deadThing/);
    // provenance
    expect(s.provenance).toEqual({ repo: "acme/widgets", sha: "abc1234", file: "src/svc.ts", line: 3, symbol: "deadThing" });
  });

  test("excludes non-maybe findings (certain/likely) (AC-1)", async () => {
    await writeSource();
    const json = scanDoc([
      { ...maybeFinding("deadThing", 3), tier: "certain" },
      maybeFinding("deadThing", 3),
      { ...maybeFinding("liveThing", 6), tier: "likely" },
    ]);
    const skeletons = await captureEvalSkeletons(json, { repo: "r", sha: "s", sourceRoot: dir, radius: 1 });
    expect(skeletons).toHaveLength(1);
    expect(skeletons[0]?.name).toBe("deadThing");
  });

  test("empty findings → empty skeletons, no throw (AC-1)", async () => {
    const skeletons = await captureEvalSkeletons(scanDoc([]), { repo: "r", sha: "s", sourceRoot: dir });
    expect(skeletons).toEqual([]);
  });
});
