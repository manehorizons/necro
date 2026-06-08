import { describe, expect, test } from "vitest";
import type { RefactorOutcome, RefactorRunResult } from "../src/refactor/index.js";
import { renderRefactor, toRefactorJson } from "../src/report/refactor.js";
import { toJson } from "../src/report/json.js";
import type { ComplexityFinding } from "../src/syntactic/types.js";

const find = (name: string): ComplexityFinding => ({
  detector: "god-function",
  file: "src/svc.ts",
  line: 12,
  name,
  value: 80,
  threshold: 50,
  message: "god function — 80 lines > 50",
});

const outcome = (over: Partial<RefactorOutcome> = {}): RefactorOutcome => ({
  finding: find("bigHandler"),
  model: "claude-opus-4-8",
  proposal: {
    summary: "split into validate + persist",
    newFunctions: ["validate", "persist"],
    replacement: "export function bigHandler(req, res) {\n  return persist(validate(req));\n}",
    rationale: "two distinct callee clusters",
  },
  diff: "--- a/src/svc.ts\n+++ b/src/svc.ts\n@@\n-old\n+new\n",
  badge: { status: "green" },
  ...over,
});

const result = (outcomes: RefactorOutcome[], considered = outcomes.length): RefactorRunResult => ({
  outcomes,
  consideredGodFunctions: considered,
});

describe("renderRefactor (AC-4)", () => {
  test("shows the diff, rationale, summary and a verified badge (AC-4)", () => {
    const out = renderRefactor(result([outcome()]));
    expect(out).toContain("bigHandler");
    expect(out).toContain("split into validate + persist");
    expect(out).toContain("two distinct callee clusters");
    expect(out).toContain("+new"); // the necro-computed diff, for hand-application
    expect(out).toMatch(/verified|typecheck.*tests|✓/i);
  });

  test("zero god-function findings → a clear no-op message (AC-4)", () => {
    expect(renderRefactor(result([], 0))).toBe("no god-function findings to refactor");
  });

  test("marks a failed verification clearly, not as success (AC-4)", () => {
    const out = renderRefactor(result([outcome({ badge: { status: "red", output: "1 test failed" } })]));
    expect(out).toMatch(/fail|✗/i);
    expect(out).not.toMatch(/✓ verified/);
  });

  test("surfaces the failure reason when the model response couldn't be parsed (AC-4)", () => {
    const out = renderRefactor(
      result([outcome({ proposal: null, diff: null, badge: null, failure: "unparseable response" })]),
    );
    expect(out).toContain("unparseable response");
  });
});

describe("toRefactorJson (AC-4)", () => {
  test("carries the proposal + diff + verification per finding (AC-4)", () => {
    const json = JSON.parse(toRefactorJson(result([outcome()]))) as {
      refactor: Array<{
        name: string;
        proposal: { newFunctions: string[]; replacement: string };
        verification: { status: string };
      }>;
    };
    expect(json.refactor[0]?.name).toBe("bigHandler");
    expect(json.refactor[0]?.proposal.newFunctions).toEqual(["validate", "persist"]);
    expect(json.refactor[0]?.proposal.replacement).toContain("bigHandler");
    expect(json.refactor[0]?.verification.status).toBe("green");
  });
});

describe("scan/fix JSON unchanged (AC-4)", () => {
  test("toJson output carries no refactor field (AC-4)", () => {
    const out = JSON.parse(
      toJson({ findings: [], complexity: [], hotspots: [], duplication: [] }),
    ) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["findings", "complexity", "hotspots", "duplication"]);
    expect(out).not.toHaveProperty("refactor");
  });
});
