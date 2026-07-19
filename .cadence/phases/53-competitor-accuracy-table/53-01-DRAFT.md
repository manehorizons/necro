---
phase: 53-competitor-accuracy-table
id: 53-01
tier: standard
status: PENDING
---

# 53-01 — Competitor head-to-head accuracy table (knip, ts-prune)

> Rec: `rec-20260701-012` (audit P2-13). Follow-on to phase 22, which shipped
> necro-only bench numbers and explicitly deferred competitor comparison
> ("DO NOT run knip / ts-prune ... deferred to a follow-on").

## Objective

Score knip and ts-prune against the exact same real-repo triage corpus and
ground truth necro is measured on, and publish the head-to-head on the
Accuracy docs page — same cases, same "dead" positive class, same
precision/recall math, named competitors.

## Acceptance Criteria

### AC-1: knip and ts-prune are scored on the identical 63-case triage corpus
Given the pinned corpus checkouts (`honojs/hono@61d6d66`, `trpc/trpc@c7360d4`)
and the existing `test/fixtures/triage-realrepo/cases.json` ground truth
When a maintainer runs the new competitor-bench script against a local
checkout of each pinned SHA
Then for every one of the 63 cases, each tool's prediction ("dead" if the tool
flags that case's exact `provenance.file`+`symbol` as an unused/dead export,
else "alive") is captured, and precision/recall/F1/TP/FP/FN are computed on
the "dead" class using the same scoring logic necro's own triage metric uses —
no case is silently dropped or excluded.

### AC-2: the snapshot and Accuracy page carry a provenance-stamped competitors section
Given a completed competitor-bench run
When its output is merged into `bench/results.json` and committed
Then the snapshot has a `competitors` array (tool name, version, per-corpus
metrics matching `TriageMetrics`' shape) and the Accuracy page renders a
head-to-head table (Necro vs knip vs ts-prune: precision, recall, F1) sourced
entirely from the committed snapshot, with each tool's version and the
corpus/case count in the provenance caption — no hand-typed numbers.

### AC-3: deterministic tests cover the scoring/mapping logic with zero live clones
Given captured fixture output from a real knip run and a real ts-prune run
(committed as small JSON/text fixtures, not live tool invocations)
When `npm test` runs
Then unit tests verify the file+symbol matching logic that turns raw
knip/ts-prune output into per-case "dead"/"alive" predictions, and the
precision/recall/F1 computation over a known small case set, entirely offline;
the full suite stays green with zero network calls and zero external repo
checkouts.

## Tasks

### T1: repo-checkout convenience script (maintainer-run, not CI)
- files: `scripts/bench-checkout-corpus-repos.sh` (or equivalent), `.gitignore`
- action: shallow-clone `honojs/hono@61d6d66d27911001b9b4d57ab93139f9ad61384b`
  and `trpc/trpc@c7360d4eb3c89c336468809a293e5cda4b302d4b` into a gitignored
  cache dir (e.g. `.bench-cache/`); idempotent (skip if SHA already checked
  out).
- verify: running it twice leaves the same two pinned checkouts, no git-tracked
  output
- done: AC-1

### T2: knip / ts-prune as pinned devDependencies + raw-output capture
- files: `package.json`, `src/bench/competitors/knip-runner.ts`,
  `src/bench/competitors/ts-prune-runner.ts`
- action: add `knip` and `ts-prune` as pinned `devDependencies`; write thin
  wrappers that run each tool against a checked-out repo root (per-repo
  `knip.json`/tsconfig as each tool needs) and return raw unused-export
  results (file, symbol/export name) plus the installed tool version.
- verify: manually run against one cached checkout, output looks sane
- done: AC-1

### T3: case-to-prediction mapping + scoring
- files: `src/bench/competitors/score.ts`
- action: pure function(s) mapping each corpus case's
  `provenance.file`+`symbol` against a tool's raw unused-export list (exact
  match; a case is "dead" per that tool iff its symbol appears in that file's
  unused list) → prediction; then compute precision/recall/F1/TP/FP/FN on the
  "dead" class, reusing/mirroring the existing triage metric math. No I/O, no
  clock — testable in isolation.
- verify: unit tests (T6) green
- done: AC-1

### T4: competitor-bench orchestrator + CLI entry
- files: `src/bench/competitors/run.ts`, `src/bench/cli-competitors.ts`,
  `package.json` (new `"bench:competitors"` script)
- action: wire checkout paths → runners (T2) → scorer (T3) → a
  `CompetitorResults` shape (tool, version, corpus id, metrics); write to
  `bench/competitors.json`. Manual, `ANTHROPIC_API_KEY`-free, maintainer-run
  step (repo checkouts are a local prerequisite, not automated in this task).
- verify: `npm run bench:competitors` (with local checkouts present) produces
  a valid `bench/competitors.json` scoring all 63 cases for both tools
- done: AC-1

### T5: merge into snapshot schema + Accuracy page head-to-head table
- files: `src/bench/snapshot.ts`, `bench/results.json`,
  `website/src/content/docs/guide/accuracy.mdx`
- action: extend `BenchResults` with an optional `competitors:
  CompetitorResult[]` field (schemaVersion bump if needed); merge
  `bench/competitors.json` into the committed `bench/results.json`; add a
  "Head-to-head" table to the Accuracy page (Necro vs knip vs ts-prune:
  precision/recall/F1), sourced from the snapshot, with tool versions in the
  provenance caption.
- verify: docs site builds; table numbers match `bench/results.json`
- done: AC-2

### T6: tests — mapping/scoring units + fixture-based knip/ts-prune parsing
- files: `test/bench-competitors-score.test.ts`,
  `test/fixtures/bench-competitors/` (small committed knip/ts-prune raw-output
  fixtures)
- action: unit tests for the file+symbol matching (T3) and metric computation
  against a known small fixture case set with hand-computed expected
  precision/recall; parser tests for each tool's raw-output shape using
  committed fixture output (no live tool run, no network, no repo checkout).
  Title tests with AC ids per the settle AC↔test gate.
- verify: `npm test` green, zero network calls
- done: AC-3

## Boundaries

- DO NOT re-measure necro's own triage numbers — reuse the existing committed
  `bench/results.json` triage metrics as-is; this phase only adds knip/ts-prune
  alongside them.
- DO NOT extend this to the duplication corpus — knip and ts-prune are
  dead-export detectors, not clone detectors; scope is triage-corpus only.
- DO NOT commit cloned repo checkouts or add repo cloning to `npm test` / CI —
  the competitor bench is a manual, maintainer-run step like `npm run bench`.
- DO NOT change `test/fixtures/triage-realrepo/cases.json` ground truth or add
  new cases — the corpus is frozen; reuse it as-is.
- DO NOT add a `necro`-branded subcommand for this — it lives under
  `src/bench/`, not `src/cli.ts` / the published binary.
