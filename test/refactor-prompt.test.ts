import { describe, expect, test } from "vitest";
import type { DuplicateRefactorContext, RefactorContext } from "../src/refactor/context.js";
import type { ComplexityFinding, DuplicationFinding } from "../src/syntactic/types.js";
import {
  buildDuplicatePrompt,
  buildRefactorPrompt,
  DUP_PROPOSAL_SCHEMA,
  parseDuplicateProposal,
  parseProposal,
  PROPOSAL_SCHEMA,
} from "../src/refactor/prompt.js";

const ctx = (): RefactorContext => ({
  finding: {
    detector: "god-function",
    file: "/src/svc.ts",
    line: 3,
    name: "bigHandler",
    value: 80,
    threshold: 50,
    message: "god function — 80 lines > 50",
  } satisfies ComplexityFinding,
  snippet: {
    file: "/src/svc.ts",
    startLine: 1,
    endLine: 5,
    code: "1\timport { step1 } from './steps.js';\n2\t\n3\texport function bigHandler(req, res) {\n4\t  return step1(req);\n5\t}",
  },
  imports: ["import { step1 } from './steps.js';"],
});

describe("buildRefactorPrompt (AC-3)", () => {
  test("asks for rewritten code (not a diff) of the function's line range (AC-3)", () => {
    const p = buildRefactorPrompt(ctx());
    expect(p.system).toMatch(/rewrit|replace/i);
    expect(p.system).toContain("replacement"); // returns code as `replacement`, not a diff
    expect(p.user).toContain("bigHandler");
    expect(p.user).toContain("export function bigHandler(req, res) {");
    // tells the model exactly which lines it is replacing (function decl .. end)
    expect(p.user).toMatch(/lines?\s*3\D+5/);
  });
});

describe("parseProposal (AC-3)", () => {
  test("accepts a well-formed proposal with replacement code (AC-3)", () => {
    const res = parseProposal({
      summary: "split bigHandler",
      newFunctions: ["handleStep1", "handleStep2"],
      replacement: "export function bigHandler(req, res) {\n  return handleStep1(req);\n}",
      rationale: "each cluster became its own function",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.proposal.newFunctions).toEqual(["handleStep1", "handleStep2"]);
      expect(res.proposal.replacement).toContain("export function bigHandler");
    }
  });

  test("maps a non-object response to a failed proposal, never throws (AC-3)", () => {
    const res = parseProposal("not json at all");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/unparseable|invalid/i);
  });

  test("rejects a proposal missing the replacement code (AC-3)", () => {
    const res = parseProposal({ summary: "x", newFunctions: ["a"], rationale: "r" }); // no replacement
    expect(res.ok).toBe(false);
  });

  test("rejects newFunctions that is not a string array (AC-3)", () => {
    const res = parseProposal({ summary: "x", newFunctions: "a", replacement: "code", rationale: "r" });
    expect(res.ok).toBe(false);
  });
});

describe("PROPOSAL_SCHEMA (AC-3)", () => {
  test("constrains the four proposal fields incl. replacement (AC-3)", () => {
    expect(PROPOSAL_SCHEMA.required).toEqual(["summary", "newFunctions", "replacement", "rationale"]);
    expect(PROPOSAL_SCHEMA.additionalProperties).toBe(false);
  });
});

// ── extract-duplicate ───────────────────────────────────────────────────────

const dupFinding = (): DuplicationFinding => ({
  tokens: 30,
  locations: [
    { file: "/src/a.ts", startLine: 3, endLine: 4 },
    { file: "/src/b.ts", startLine: 3, endLine: 4 },
  ],
});

const dupCtx = (): DuplicateRefactorContext => ({
  finding: dupFinding(),
  locations: [
    {
      location: { file: "/src/a.ts", startLine: 3, endLine: 4 },
      snippet: { file: "/src/a.ts", startLine: 3, endLine: 4, code: "3\t  const r = db.query('a');\n4\t  return r.id;" },
      imports: ["import { db } from './db.js';"],
    },
    {
      location: { file: "/src/b.ts", startLine: 3, endLine: 4 },
      snippet: { file: "/src/b.ts", startLine: 3, endLine: 4, code: "3\t  const r = db.query('b');\n4\t  return r.id;" },
      imports: ["import { db } from './db.js';"],
    },
  ],
});

const goodEdits = () => [
  { file: "/src/a.ts", startLine: 3, endLine: 4, replacement: "  return loadId('a');" },
  { file: "/src/b.ts", startLine: 3, endLine: 4, replacement: "  return loadId('b');" },
];

const goodDupProposal = () => ({
  summary: "extract loadId",
  sharedFunction: "export function loadId(key) {\n  const r = db.query(key);\n  return r.id;\n}",
  sharedFunctionFile: "/src/a.ts",
  edits: goodEdits(),
  rationale: "lifted the shared query into loadId",
});

describe("buildDuplicatePrompt (AC-2, AC-3)", () => {
  test("asks for one shared function + one call edit per location, code not diff (AC-3)", () => {
    const p = buildDuplicatePrompt(dupCtx());
    expect(p.system).toMatch(/shared function|extract/i);
    expect(p.system).toMatch(/one edit per location/i);
    expect(p.system).toMatch(/no diff/i);
    expect(p.user).toContain("/src/a.ts");
    expect(p.user).toContain("/src/b.ts");
    expect(p.user).toContain("const r = db.query('a');");
    expect(p.user).toMatch(/lines 3-4/);
  });
});

describe("parseDuplicateProposal (AC-3)", () => {
  test("accepts a well-formed proposal covering every location (AC-3)", () => {
    const res = parseDuplicateProposal(goodDupProposal(), dupFinding());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.proposal.edits).toHaveLength(2);
      expect(res.proposal.sharedFunctionFile).toBe("/src/a.ts");
      expect(res.proposal.sharedFunction).toContain("export function loadId");
    }
  });

  test("maps a non-object response to a failed proposal, never throws (AC-3)", () => {
    const res = parseDuplicateProposal("not json", dupFinding());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/unparseable|invalid/i);
  });

  test("rejects a sharedFunctionFile outside the clone group (AC-3)", () => {
    const res = parseDuplicateProposal({ ...goodDupProposal(), sharedFunctionFile: "/src/elsewhere.ts" }, dupFinding());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/sharedFunctionFile/);
  });

  test("rejects when an edit range does not match a clone location (AC-3)", () => {
    const edits = [
      { file: "/src/a.ts", startLine: 9, endLine: 9, replacement: "x" }, // wrong range
      { file: "/src/b.ts", startLine: 3, endLine: 4, replacement: "y" },
    ];
    const res = parseDuplicateProposal({ ...goodDupProposal(), edits }, dupFinding());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/no edit matches location/);
  });

  test("rejects when the edit count does not equal the location count (AC-3)", () => {
    const res = parseDuplicateProposal({ ...goodDupProposal(), edits: [goodEdits()[0]] }, dupFinding());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/edits for .* clone locations/);
  });

  test("rejects a malformed edit field (AC-3)", () => {
    const edits = [{ file: "/src/a.ts", startLine: "three", endLine: 4, replacement: "x" }, goodEdits()[1]];
    const res = parseDuplicateProposal({ ...goodDupProposal(), edits }, dupFinding());
    expect(res.ok).toBe(false);
  });
});

describe("DUP_PROPOSAL_SCHEMA (AC-3)", () => {
  test("constrains the five proposal fields incl. edits (AC-3)", () => {
    expect(DUP_PROPOSAL_SCHEMA.required).toEqual([
      "summary",
      "sharedFunction",
      "sharedFunctionFile",
      "edits",
      "rationale",
    ]);
    expect(DUP_PROPOSAL_SCHEMA.additionalProperties).toBe(false);
  });
});
