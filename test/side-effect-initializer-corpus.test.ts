import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Project, SyntaxKind } from "ts-morph";
import { describe, expect, test } from "vitest";

/**
 * Evidence-gathering test for rec-20260719-008, phase 67 — measures the
 * precision of a NAIVE syntax screen ("initializer is a Call/New/Await/
 * TaggedTemplate expression => may have side effects") against a hand-labeled
 * corpus of real `certain`-tier findings. This classifier is test-only
 * scaffolding for measurement — it is intentionally NOT wired into
 * `src/analyze/classify.ts` or `src/fix/remove.ts` (see phase 67 boundaries).
 */

interface CorpusCase {
  file: string;
  line: number;
  name: string;
  source: string;
  provenance: { repo: string; sha: string };
  truth: "genuinely-risky" | "safe-to-remove";
  reasoning: string;
}

const corpusPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/side-effect-initializer-corpus/cases.json",
);

function loadCorpus(): CorpusCase[] {
  return JSON.parse(readFileSync(corpusPath, "utf8"));
}

const RISKY_KINDS = new Set([
  SyntaxKind.CallExpression,
  SyntaxKind.NewExpression,
  SyntaxKind.AwaitExpression,
  SyntaxKind.TaggedTemplateExpression,
]);

type SyntaxVerdict = "risky" | "safe";

/** rec-20260719-008's proposed screen, verbatim: any of the four initializer shapes => risky. */
function classifyInitializer(source: string): SyntaxVerdict {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true },
  });
  const sf = project.createSourceFile("case.tsx", source);
  const decl = sf.getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration);
  const init = decl.getInitializerOrThrow();
  return RISKY_KINDS.has(init.getKind()) ? "risky" : "safe";
}

describe("side-effect-initializer corpus integrity (AC-1)", () => {
  const cases = loadCorpus();

  test("has >=15 cases spanning >=2 repos, both truth labels, both syntax verdicts (AC-1)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(15);

    const repos = new Set(cases.map((c) => c.provenance.repo));
    expect(repos.size).toBeGreaterThanOrEqual(2);

    const truths = new Set(cases.map((c) => c.truth));
    expect(truths).toEqual(new Set(["genuinely-risky", "safe-to-remove"]));

    const verdicts = new Set(cases.map((c) => classifyInitializer(c.source)));
    expect(verdicts).toEqual(new Set(["risky", "safe"]));
  });

  test("every case carries verbatim source, file, line, and complete provenance (AC-1)", () => {
    for (const c of cases) {
      expect(c.source.length).toBeGreaterThan(0);
      expect(c.file.length).toBeGreaterThan(0);
      expect(c.line).toBeGreaterThan(0);
      expect(c.provenance.repo).toBeTruthy();
      expect(c.provenance.sha).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});

describe("naive syntax screen confusion matrix (AC-2)", () => {
  test("classifier scores against hand-labeled truth match the recorded, reproducible numbers (AC-2)", () => {
    const cases = loadCorpus();

    let tp = 0; // syntax says risky, truth says genuinely-risky
    let fp = 0; // syntax says risky, truth says safe-to-remove
    let tn = 0; // syntax says safe, truth says safe-to-remove
    let fn = 0; // syntax says safe, truth says genuinely-risky

    for (const c of cases) {
      const verdict = classifyInitializer(c.source);
      const isRisky = c.truth === "genuinely-risky";
      if (verdict === "risky" && isRisky) tp++;
      else if (verdict === "risky" && !isRisky) fp++;
      else if (verdict === "safe" && !isRisky) tn++;
      else fn++;
    }

    // Fixed, named constants so an edited corpus fails loudly instead of
    // silently shifting the sizing number this evidence-gathering phase exists
    // to produce. See SOURCES.md for how `truth` was judged per case.
    expect({ tp, fp, tn, fn }).toEqual({ tp: 3, fp: 13, tn: 3, fn: 0 });

    const precision = tp / (tp + fp);
    // 3/16 ≈ 0.19 — of the cases the naive screen would demote from `certain`
    // to `likely`, only ~19% are genuine side-effect risks in this sample;
    // the rest are pure allocations/computations that merely look risky
    // syntactically (`new Map()`, `t.router({...})`, `parseInt(...)`, etc.)
    expect(precision).toBeCloseTo(3 / 16, 5);
  });
});
