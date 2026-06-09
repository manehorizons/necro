import { describe, expect, test } from "vitest";
import type { DuplicateProposal } from "../src/refactor/prompt.js";
import { spliceDuplicate } from "../src/refactor/splice.js";

const SHARED = "export function loadId(key) {\n  const r = db.query(key);\n  return r.id;\n}";

describe("spliceDuplicate (AC-3)", () => {
  test("single-file multi-site: inserts the shared function and replaces every site", async () => {
    const file = "/repo/svc.ts";
    const content = [
      'import { db } from "./db.js";', // 1
      "export function loadA() {", // 2
      "  const r = db.query('a');", // 3
      "  return r.id;", // 4
      "}", // 5
      "export function loadB() {", // 6
      "  const r = db.query('b');", // 7
      "  return r.id;", // 8
      "}", // 9
    ].join("\n");

    const proposal: DuplicateProposal = {
      summary: "extract loadId",
      sharedFunction: SHARED,
      sharedFunctionFile: file,
      edits: [
        { file, startLine: 3, endLine: 4, replacement: "  return loadId('a');" },
        { file, startLine: 7, endLine: 8, replacement: "  return loadId('b');" },
      ],
      rationale: "shared the query",
    };

    const [res] = await spliceDuplicate(new Map([[file, content]]), proposal);
    expect(res?.file).toBe(file);
    const out = res!.newContent;
    expect(out).toContain("export function loadId(key)");
    expect(out).toContain("  return loadId('a');");
    expect(out).toContain("  return loadId('b');");
    // both clone bodies are gone
    expect(out).not.toContain("  const r = db.query('a');");
    expect(out).not.toContain("  const r = db.query('b');");
    // no cross-file import for a single-file extraction
    expect(out).not.toMatch(/^import \{ loadId \}/m);
    expect(res!.diff).toContain("loadId");
  });

  test("cross-file: shared function in one file, import wired into the other", async () => {
    const a = "/repo/a.ts";
    const b = "/repo/sub/b.ts";
    const aContent = ['import { db } from "../db.js";', "export function loadA() {", "  const r = db.query('a');", "  return r.id;", "}"].join("\n");
    const bContent = ['import { db } from "../db.js";', "export function loadB() {", "  const r = db.query('b');", "  return r.id;", "}"].join("\n");

    const proposal: DuplicateProposal = {
      summary: "extract loadId",
      sharedFunction: SHARED,
      sharedFunctionFile: a,
      edits: [
        { file: a, startLine: 3, endLine: 4, replacement: "  return loadId('a');" },
        { file: b, startLine: 3, endLine: 4, replacement: "  return loadId('b');" },
      ],
      rationale: "shared the query across files",
    };

    const results = await spliceDuplicate(
      new Map([
        [a, aContent],
        [b, bContent],
      ]),
      proposal,
    );
    // shared-function file is emitted first
    expect(results[0]?.file).toBe(a);
    expect(results[0]?.newContent).toContain("export function loadId(key)");

    const bRes = results.find((r) => r.file === b)!;
    // b imports loadId from a, with a correct relative path (b is in /repo/sub)
    expect(bRes.newContent).toMatch(/import \{ loadId \} from "\.\.\/a\.js";/);
    expect(bRes.newContent).toContain("  return loadId('b');");
    expect(bRes.newContent).not.toContain("export function loadId"); // not duplicated
  });

  test("rejects overlapping edits in the same file", async () => {
    const file = "/repo/x.ts";
    const content = ["a", "b", "c", "d", "e"].join("\n");
    const proposal: DuplicateProposal = {
      summary: "x",
      sharedFunction: SHARED,
      sharedFunctionFile: file,
      edits: [
        { file, startLine: 2, endLine: 3, replacement: "X" },
        { file, startLine: 3, endLine: 4, replacement: "Y" },
      ],
      rationale: "r",
    };
    await expect(spliceDuplicate(new Map([[file, content]]), proposal)).rejects.toThrow(/overlapping/);
  });

  test("rejects an out-of-bounds edit range", async () => {
    const file = "/repo/x.ts";
    const content = ["a", "b"].join("\n");
    const proposal: DuplicateProposal = {
      summary: "x",
      sharedFunction: SHARED,
      sharedFunctionFile: file,
      edits: [{ file, startLine: 5, endLine: 9, replacement: "X" }],
      rationale: "r",
    };
    await expect(spliceDuplicate(new Map([[file, content]]), proposal)).rejects.toThrow(/out of bounds/);
  });
});
