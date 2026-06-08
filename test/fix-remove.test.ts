import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ClassifiedFinding } from "../src/analyze/classify.js";
import { planRemovals } from "../src/fix/remove.js";
import type { SymbolNode } from "../src/graph/types.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-fix-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function finding(
  file: string,
  line: number,
  name: string,
  autoFixEligible: boolean,
): ClassifiedFinding {
  const node: SymbolNode = { id: `${file}:${line}:${name}`, name, file, line, exported: false };
  return {
    node,
    verdict: "dead",
    tier: autoFixEligible ? "certain" : "maybe",
    autoFixEligible,
    evidence: [],
  };
}

/** Re-parse the resulting text into an AST and return its top-level function names. */
function functionsIn(text: string): string[] {
  const p = new Project({ useInMemoryFileSystem: true });
  const sf = p.createSourceFile("check.ts", text);
  return sf.getFunctions().map((f) => f.getName() ?? "");
}

describe("planRemovals (AC-1, AC-5)", () => {
  test("removes a certain-dead declaration, leaving live siblings intact", async () => {
    const file = join(dir, "util.ts");
    await writeFile(
      file,
      `export function liveFn() {\n  return 1;\n}\nfunction deadFn() {\n  return 2;\n}\n`,
    );
    // deadFn's name is on line 4.
    const edits = planRemovals([finding(file, 4, "deadFn", true)]);

    expect(edits).toHaveLength(1);
    expect(edits[0]?.after).not.toContain("deadFn");
    expect(edits[0]?.after).toContain("liveFn");
    expect(edits[0]?.after).toContain("return 1;");
    expect(functionsIn(edits[0]!.after)).toEqual(["liveFn"]);
  });

  test("removes multiple certain-dead symbols from one file (no line-shift bug)", async () => {
    const file = join(dir, "multi.ts");
    await writeFile(
      file,
      `function deadA() {}\nexport function live() {}\nfunction deadB() {}\n`,
    );
    const edits = planRemovals([
      finding(file, 1, "deadA", true),
      finding(file, 3, "deadB", true),
    ]);
    expect(edits[0]?.after).not.toContain("deadA");
    expect(edits[0]?.after).not.toContain("deadB");
    expect(edits[0]?.after).toContain("live");
  });

  test("non-autoFixEligible findings produce no edit", async () => {
    const file = join(dir, "keep.ts");
    await writeFile(file, `function maybeDead() {}\n`);
    const edits = planRemovals([finding(file, 1, "maybeDead", false)]);
    expect(edits).toEqual([]);
  });
});
