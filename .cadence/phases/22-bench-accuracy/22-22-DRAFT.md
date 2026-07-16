---
phase: 22-bench-accuracy
id: 22-22
tier: standard
status: PENDING
---

# 22-22 — Public measured-accuracy benchmark: necro bench + Accuracy page

> Design: `docs/superpowers/specs/2026-06-11-necro-bench-accuracy-design.md`
> Rec: `rec-20260610-006`. v1 scope: necro-only numbers; competitor head-to-head deferred.

## Objective

Externalize the existing internal eval harness into a published credibility artifact:
a thin `npm run bench` runner that emits a provenance-stamped snapshot, and an Accuracy
docs page that renders measured triage precision/recall (headline) + duplication
pass-rate from that committed snapshot.

## Acceptance Criteria

### AC-1: bench runner emits a provenance-stamped snapshot covering both corpora
Given the in-repo triage (48-case) and dup (12-case) corpora and a model client
When `npm run bench` runs (or `runBench` is invoked with live clients)
Then it writes `bench/results.json` containing, per corpus, the source repos+SHAs,
case count `n`, and metrics (triage → precision/recall/F1 + TP/FP/FN; dup → passRate/
passed/total), plus top-level provenance: `necroVersion`, `model`, `generatedAt`,
`schemaVersion`, `methodologyVersion`.

### AC-2: Accuracy page renders the measured numbers from the committed snapshot
Given a committed `bench/results.json`
When the docs site builds
Then a reachable Accuracy page (in the docs nav) renders the headline triage
precision/recall/F1 and the dup pass-rate **sourced from the snapshot** (no hand-typed
metrics), shows a provenance caption (model + corpus SHAs + date + N), and includes
methodology, non-determinism caveat, limitations, and a "reproduce: `npm run bench`" block.

### AC-3: deterministic tests cover the runner + the page↔snapshot contract
Given stubbed (non-live) clients
When `npm test` runs
Then unit tests verify `snapshot.ts` (serialize/parse round-trip, F1 derivation,
provenance completeness) and `runBench` (wires both corpora, correct shape/counts) with
zero live model calls, plus a schema-guard test asserting every field the Accuracy page
reads exists in the committed `bench/results.json`; the full suite stays green.

## Tasks

### T1: snapshot schema + pure summarizers
- files: `src/bench/snapshot.ts`
- action: define `BenchResults` / `BenchCorpusResult` types; implement
  `summarizeTriage(EvalMetrics, sources)`, `summarizeDup(RefactorEvalMetrics, sources)`,
  `serialize(BenchResults)` (stable key order + trailing newline), `parse(string)`.
  Pure — no I/O, no clock, no model calls. F1 derived from precision/recall.
- verify: unit tests (T5) green
- done: AC-1

### T2: bench orchestrator
- files: `src/bench/run.ts`
- action: implement `runBench({ corpus, triageClient, refactorClient, now, model })` —
  load selected corpora via existing `loadEvalCases`, call `runEval` / `runRefactorEval`,
  map through `snapshot.ts` summarizers, stamp provenance (read `necroVersion` from
  `src/version.ts`). Clients + clock injected.
- verify: unit tests (T5) with stub clients green
- done: AC-1

### T3: runner entry + generated snapshot
- files: `src/bench/cli-bench.ts`, `package.json`, `bench/results.json`
- action: tiny CLI parsing `--corpus triage|dup|all` (default all), `--out`, `--dry-run`;
  constructs the real live clients (same model wiring as `*.live.test.ts`, needs
  `ANTHROPIC_API_KEY`), calls `runBench`, writes the snapshot. Add `"bench"` script to
  package.json (confirm `tsx` availability or use the vitest-runner equivalent). Run it
  once to produce and commit a real `bench/results.json`. Do NOT add to `src/cli.ts`.
- verify: `npm run bench` writes a valid snapshot; `bench/results.json` parses
- done: AC-1

### T4: Accuracy docs page
- files: `website/src/content/docs/guide/accuracy.md`, docs nav/sidebar config
- action: render headline triage metrics + dup pass-rate from the committed snapshot
  (resolve the Astro import/loader mechanism against existing content collections);
  provenance caption, methodology, non-determinism caveat, limitations, reproduce block;
  add to nav.
- verify: docs site builds (Node ≥ 22 / `nvm use 22`); page reachable, numbers match snapshot
- done: AC-2

### T5: tests — runner units + page↔snapshot guard
- files: `test/bench-snapshot.test.ts`, `test/bench-run.test.ts`, `test/bench-page-contract.test.ts`
- action: snapshot round-trip + F1 + provenance-completeness; `runBench` with stub
  clients (both corpora, shape/counts); schema-guard asserting the page's read-fields
  exist in `bench/results.json`. Title each test with its AC id (AC-1 / AC-2 / AC-3) per
  the settle AC↔test gate.
- verify: `npm test` green, no live calls
- done: AC-3

## Boundaries

- DO NOT add a `necro bench` subcommand to `src/cli.ts` / the published binary — the
  corpus is not in the npm tarball (`files: ["dist"]`); bench is repo-internal.
- DO NOT run knip / ts-prune or publish any competitor comparison — deferred to a follow-on.
- DO NOT add new corpus cases or repos; reuse the existing triage + dup corpora as-is.
- DO NOT call the model in the docs build or in `npm test`; live regeneration stays a
  manual maintainer step. The page's numbers always come from the committed snapshot.
- DO NOT re-implement scoring — reuse `runEval` / `runRefactorEval` unchanged.
- DO NOT hardcode a version string; read `necroVersion` from `src/version.ts`.
