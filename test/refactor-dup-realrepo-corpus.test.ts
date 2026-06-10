import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { RefactorClient } from "../src/refactor/client.js";
import {
  buildDuplicateCasePrompt,
  type DuplicateEvalCase,
  duplicatePasses,
  evaluateDuplicateProposal,
  loadDuplicateEvalCases,
  meetsThreshold,
  runDuplicateEval,
} from "../src/refactor/eval.js";
import { DUP_SYSTEM_PROMPT, type DuplicateProposal } from "../src/refactor/prompt.js";

/**
 * Deterministic CI guard for the real-repo extract-duplicate corpus — runs with
 * NO API key and makes NO network call. Validates corpus integrity (so a bad or
 * shrunk corpus fails loudly) and the structural scoring math against synthetic
 * proposals on the real corpus.
 */
const corpusPath = join(dirname(fileURLToPath(import.meta.url)), "fixtures/refactor-dup-realrepo/cases.json");

const sourceOf = (c: DuplicateEvalCase, file: string) => c.files.find((f) => f.path === file)?.source ?? "";
const bodyOf = (c: DuplicateEvalCase, loc: { file: string; startLine: number; endLine: number }) =>
  sourceOf(c, loc.file).split("\n").slice(loc.startLine - 1, loc.endLine).join("\n");

/** The generic oracle the corpus was selected against: shared function = the clone
 * body once, every clone site replaced by a call. A correct extraction provably
 * exists for every case, so the whole corpus scores `passRate = 1` under it. */
const oracle = (c: DuplicateEvalCase): DuplicateProposal => {
  const id = `__extracted_${c.name.replace(/[^A-Za-z0-9]+/g, "_")}`;
  return {
    summary: `extract ${id}`,
    sharedFunction: `export function ${id}() {\n${bodyOf(c, c.locations[0]!)}\n}`,
    sharedFunctionFile: c.locations[0]!.file,
    edits: c.locations.map((l) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, replacement: `  ${id}();` })),
    rationale: "lift the shared logic into one function",
  };
};

const dupClient = (proposal: DuplicateProposal): RefactorClient => ({
  propose: async () => ({ ok: false as const, reason: "n/a" }),
  proposeDuplicate: async () => ({ ok: true as const, proposal }),
});

describe("real-repo extract-duplicate corpus integrity (AC-2)", () => {
  test("loads ≥12 cases spanning ≥2 source repos (AC-1)", async () => {
    const cases = await loadDuplicateEvalCases(corpusPath);
    expect(cases.length).toBeGreaterThanOrEqual(12);
    // multi-repo: the gate must not silently collapse onto a single source's style.
    const repos = new Set(cases.map((c) => c.provenance?.repo).filter(Boolean));
    expect(repos.size).toBeGreaterThanOrEqual(2);
  });

  test("every case carries verbatim sources, resolvable locations, surviving signatures, and complete provenance (AC-2)", async () => {
    const cases = await loadDuplicateEvalCases(corpusPath);
    for (const c of cases) {
      // a real clone group: ≥2 locations, ≥2 distinct call-surface signatures captured
      expect(c.locations.length).toBeGreaterThanOrEqual(2);
      expect(c.signatures.length).toBe(c.locations.length);
      expect(c.tokens).toBeGreaterThan(0);
      expect(c.minTokens).toBeGreaterThan(0);
      // every referenced file has non-empty verbatim source (NOT line-prefixed — the prompt numbers it)
      expect(c.files.length).toBeGreaterThan(0);
      for (const f of c.files) {
        expect(typeof f.source).toBe("string");
        expect(f.source.length).toBeGreaterThan(0);
        expect(f.source).not.toMatch(/^\d+\t/m);
      }
      // every location resolves to a file in files[] with a valid 1-based line range
      for (let i = 0; i < c.locations.length; i++) {
        const loc = c.locations[i]!;
        const src = sourceOf(c, loc.file);
        expect(src.length, `${c.name}: location file ${loc.file} present in files[]`).toBeGreaterThan(0);
        const lineCount = src.split("\n").length;
        expect(loc.startLine).toBeGreaterThanOrEqual(1);
        expect(loc.endLine).toBeGreaterThanOrEqual(loc.startLine);
        expect(loc.endLine).toBeLessThanOrEqual(lineCount);
        // the captured signature is a surviving surface line that appears verbatim in the source
        expect(src.includes(c.signatures[i]!), `${c.name}: signature ${i} present in source`).toBe(true);
      }
      // provenance present and complete (auditable back to the pinned checkout)
      expect(c.provenance).toBeDefined();
      expect(c.provenance?.repo).toBeTruthy();
      expect(c.provenance?.sha).toBeTruthy();
      expect(c.provenance?.file).toBeTruthy();
      expect(typeof c.provenance?.line).toBe("number");
      expect(c.provenance?.symbol).toBe(c.name);
    }
  });

  test("every case builds a production duplicate prompt carrying its clone sources (AC-2)", async () => {
    const cases = await loadDuplicateEvalCases(corpusPath);
    for (const c of cases) {
      const p = buildDuplicateCasePrompt(c);
      expect(p.user).toContain("Clone group:"); // production duplicate-prompt header
      // the clone snippets are carried into the prompt
      const someSnippet = bodyOf(c, c.locations[0]!).split("\n").map((l) => l.trim()).find((l) => l.length > 12);
      if (someSnippet) expect(p.user).toContain(someSnippet);
    }
  });

  test("the real-repo eval drives the unchanged production duplicate system prompt (AC-4)", async () => {
    // No-regression invariant: this phase adds a measure, it does not fork or tune the
    // duplicate prompt. Every real-repo case is scored through the same frozen
    // DUP_SYSTEM_PROMPT `necro refactor` ships — not a copy.
    const cases = await loadDuplicateEvalCases(corpusPath);
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(buildDuplicateCasePrompt(c).system).toBe(DUP_SYSTEM_PROMPT);
    }
  });
});

describe("structural scoring math on the real corpus (AC-2)", () => {
  test("a perfect oracle yields pass-rate 1 across the whole corpus (AC-2)", async () => {
    const cases = await loadDuplicateEvalCases(corpusPath);
    for (const c of cases) {
      const cr = await evaluateDuplicateProposal(c, oracle(c));
      expect(cr.extractsSharedFunction, `${c.name}: extracts shared function`).toBe(true);
      expect(cr.collapsesDuplication, `${c.name}: collapses duplication`).toBe(true);
      expect(cr.preservesCallSurface, `${c.name}: preserves call surface`).toBe(true);
      expect(duplicatePasses(cr), `oracle should pass ${c.name}`).toBe(true);
    }
  });

  test("degenerate proposals fail a real corpus case (AC-2)", async () => {
    const cases = await loadDuplicateEvalCases(corpusPath);
    // a same-file case: dropping one edit leaves the other clone in the still-analyzed file
    const c = cases.find((cc) => new Set(cc.locations.map((l) => l.file)).size === 1) ?? cases[0]!;
    const good = oracle(c);

    // no shared function introduced
    const noFn = await evaluateDuplicateProposal(c, { ...good, sharedFunction: "const notAFunction = 1;" });
    expect(noFn.extractsSharedFunction).toBe(false);
    expect(duplicatePasses(noFn)).toBe(false);

    // a clone site left un-replaced — edit count != location count (the dropped
    // edit is caught structurally; the edited-site collapse metric only inspects
    // the edits the model did make)
    const oneEdit = await evaluateDuplicateProposal(c, { ...good, edits: [good.edits[0]!] });
    expect(oneEdit.extractsSharedFunction).toBe(false);
    expect(duplicatePasses(oneEdit)).toBe(false);

    // a changed call surface: an edit that spans and deletes a signature that exists
    // only at its own site (so it cannot survive elsewhere)
    const uniq = cases.find((cc) => {
      const combined = cc.files.map((f) => f.source).join("\n");
      return combined.split(cc.signatures[0]!).length === 2; // appears exactly once
    });
    if (uniq) {
      const g = oracle(uniq);
      const loc0 = uniq.locations[0]!;
      const lines = sourceOf(uniq, loc0.file).split("\n");
      let sigLine = loc0.startLine;
      for (let i = loc0.startLine - 2; i >= 0; i--) {
        if ((lines[i] ?? "").trim() !== "") { sigLine = i + 1; break; }
      }
      const id = g.sharedFunction.match(/function\s+(\w+)/)![1];
      const sigDeleted: DuplicateProposal = {
        ...g,
        edits: [{ file: loc0.file, startLine: sigLine, endLine: loc0.endLine, replacement: `  ${id}();` }, ...g.edits.slice(1)],
      };
      const cr = await evaluateDuplicateProposal(uniq, sigDeleted);
      expect(cr.preservesCallSurface).toBe(false);
      expect(duplicatePasses(cr)).toBe(false);
    }
  });

  test("a lazy extraction that leaves the clone body inline fails on every corpus case (AC-2)", async () => {
    // Real shared function + one edit per location (clears the structural check),
    // but each edit re-emits its own clone body instead of a call — the edited
    // sites still clone one another, so collapse must reject it for every case.
    const cases = await loadDuplicateEvalCases(corpusPath);
    for (const c of cases) {
      const lazy: DuplicateProposal = {
        ...oracle(c),
        edits: c.locations.map((l) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, replacement: bodyOf(c, l) })),
      };
      const cr = await evaluateDuplicateProposal(c, lazy);
      expect(cr.extractsSharedFunction, `${c.name}: declares a real shared function`).toBe(true);
      expect(cr.collapsesDuplication, `${c.name}: lazy extraction does NOT collapse`).toBe(false);
      expect(duplicatePasses(cr), `${c.name}: lazy extraction fails`).toBe(false);
    }
  });

  test("runDuplicateEval: a degenerate mock fails the gate; an unparseable response is a failed case, never throws (AC-2)", async () => {
    const cases = await loadDuplicateEvalCases(corpusPath);
    const c = cases[0]!;
    const degenerate = dupClient({ ...oracle(c), edits: [oracle(c).edits[0]!] }); // duplication remains
    const m = await runDuplicateEval([c], degenerate);
    expect(m.passRate).toBe(0);
    expect(meetsThreshold(m, 0.8)).toBe(false);

    const dead: RefactorClient = {
      propose: async () => ({ ok: false, reason: "n/a" }),
      proposeDuplicate: async () => ({ ok: false, reason: "unparseable" }),
    };
    const md = await runDuplicateEval([c], dead);
    expect(md.passRate).toBe(0);
    expect(md.rows[0]?.pass).toBe(false);
  });
});
