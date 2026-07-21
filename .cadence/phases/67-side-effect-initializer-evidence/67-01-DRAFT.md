---
phase: 67-side-effect-initializer-evidence
id: 67-01
tier: standard
status: PENDING
---

# 67-01 — Fixture corpus + demotion measurement for side-effecting initializers

## Objective

Without changing any production dead-code logic, build a hand-labeled corpus of
real `certain`-tier initializer shapes from the honojs/hono + trpc/trpc corpora,
measure how a naive "any Call/New/Await/TaggedTemplate initializer is risky"
screen (rec-20260719-008's proposal) would score against hand-labeled ground
truth, and record repo-wide prevalence — sizing the auto-fix coverage cost
against the safety benefit before any threshold decision is made.

Spike evidence already gathered this session (not yet committed as fixtures):
scanning `.bench-cache/honojs__hono` and `.bench-cache/trpc__trpc` (pinned
checkouts via `necro bench checkout`) with `necro scan --json` found 100
`certain` findings in hono (32 with a Call/New/Await/TaggedTemplate
initializer) and 675 in trpc (141 likewise) — roughly **21-32% of current
`certain` findings would be demoted** by the naive screen. Spot-checking the
hono samples (`new Map()`, `new KoaRouter()`, `parseInt(...)`, `join(...)`)
suggests most syntax-flagged cases are NOT genuine side-effect risks in the
sense rec-20260719-008 cares about (e.g. `registerPlugin()` mutating global
state) — they're pure-in-practice calls that merely *look* risky syntactically.
That gap (naive-syntax precision vs. true risk) is what AC-2's corpus quantifies.

## Acceptance Criteria

### AC-1: hand-labeled corpus of real initializer shapes exists and is structurally valid
Given `test/fixtures/side-effect-initializer-corpus/cases.json`
When it is loaded
Then it contains ≥15 cases, spans ≥2 source repos (via `provenance.repo`),
includes both hand-labeled truths (`genuinely-risky` and `safe-to-remove`),
and includes both naive-syntax verdicts (Call/New/Await/TaggedTemplate
initializer present and absent) — each case carries verbatim `source`,
`file`, `line`, and `provenance.{repo,sha}`

### AC-2: the naive syntax screen's precision against hand-labeled truth is measured and asserted
Given the corpus from AC-1 and a test-only syntactic classifier implementing
rec-20260719-008's proposed rule (initializer is CallExpression, NewExpression,
AwaitExpression, or TaggedTemplateExpression ⇒ "risky", else ⇒ "safe") — the
classifier lives in the test file only, not in `src/`
When the classifier is run over every corpus case
Then the test asserts the resulting confusion-matrix numbers (true/false
positives and negatives against the hand-labeled truth) as fixed, named
constants — a concrete, reproducible precision figure for the naive screen,
not a vague "some are wrong"

### AC-3: repo-wide prevalence is recorded as evidence, not silently discarded
Given the two pinned `.bench-cache` checkouts (honojs/hono, trpc/trpc; fetched
via `necro bench checkout` if absent) and `necro scan --json`
When every `certain`-tier finding's initializer is classified by the same
naive screen as AC-2
Then a short evidence note records, per repo: total `certain` count, count
with a risky-shaped initializer, and the resulting percentage — written into
this phase's SUMMARY and appended to `rec-20260719-008`'s evidence — so the
number survives past this session even though `.bench-cache` itself is not
committed

### AC-4: no production dead-code logic changes
Given this phase's full diff
When compared against `src/analyze/classify.ts` and `src/fix/remove.ts`
Then both files are byte-identical to their pre-phase state — this phase
produces evidence only, no behavior change, no auto-fix eligibility change

## Tasks

### T1: curate the hand-labeled corpus
- files: `test/fixtures/side-effect-initializer-corpus/cases.json`, `test/fixtures/side-effect-initializer-corpus/SOURCES.md`
- action: extract ≥15 real cases verbatim from the `certain`-tier findings already surfaced against `.bench-cache/honojs__hono` and `.bench-cache/trpc__trpc` (rerun `necro scan --json <path>` fresh rather than reusing throwaway spike output). For each case record `file`, `line`, `name`, verbatim `source` (the full declaration), `provenance: {repo, sha}` (sha from the pinned checkout), and a hand-labeled `truth: "genuinely-risky" | "safe-to-remove"` — judge truth by whether the initializer has an effect observable outside the removed binding (registration, I/O, mutation of shared/global state, throwing) vs. a pure allocation/computation whose result is simply unused. Document provenance in SOURCES.md following the `fp-realrepo`/`refactor-realrepo` SOURCES.md convention.
- verify: `cat test/fixtures/side-effect-initializer-corpus/cases.json | node -e "..."` confirms ≥15 cases, ≥2 distinct `provenance.repo` values, both truth labels present
- done: AC-1

### T2: syntactic classifier + confusion-matrix test
- files: `test/side-effect-initializer-corpus.test.ts`
- action: implement the naive classifier inline in the test file (ts-morph, parses each case's verbatim `source` as a standalone snippet, inspects the initializer's `SyntaxKind`) — no `src/` changes. Run it over every corpus case, tabulate true-positive/false-positive/true-negative/false-negative counts against `truth`, and assert those counts as named constants (e.g. `expect(matrix).toEqual({ tp: X, fp: Y, tn: Z, fn: W })`) so a corpus edit that changes the numbers fails loudly rather than silently.
- verify: `npx vitest run test/side-effect-initializer-corpus.test.ts` — AC-1 structural checks and AC-2 confusion-matrix assertions both pass
- done: AC-1, AC-2

### T3: repo-wide prevalence measurement + evidence write-back
- files: `.cadence/phases/67-side-effect-initializer-evidence/67-01-SUMMARY.md` (written at settle), rec-20260719-008 evidence
- action: run `necro bench checkout` if `.bench-cache/honojs__hono` or `.bench-cache/trpc__trpc` is absent, then `necro scan --json` against each, classify every `certain` finding's initializer with the same naive rule as T2, and tally total-certain / risky-count / percentage per repo. Record the numbers via `cadence recommendation add` (or the equivalent evidence-append) against `rec-20260719-008` so they're queryable outside this phase's SUMMARY too.
- verify: the recorded numbers are visible via `cadence recommend` or `grep rec-20260719-008 .cadence/intelligence/evidence.json` after the write-back
- done: AC-3

### T4: no-regression check
- files: `src/analyze/classify.ts`, `src/fix/remove.ts`
- action: confirm `git diff` against both files is empty for this phase's commits; run the full suite
- verify: `git diff HEAD -- src/analyze/classify.ts src/fix/remove.ts` is empty; `npx vitest run` and `npm run typecheck` both green
- done: AC-4

## Boundaries

- DO NOT modify `src/analyze/classify.ts`, `src/fix/remove.ts`, or any other production dead-code/auto-fix logic — this phase ships evidence only, per rec-20260719-008's own "needs-evidence" (not "needs-decision") readiness.
- DO NOT wire the syntactic classifier into `src/` — it is test-only scaffolding for measurement, not a shipped feature.
- DO NOT commit the full `.bench-cache` checkouts — only the small, verbatim, hand-picked corpus cases (with provenance) get committed, following the existing `fp-realrepo`/`refactor-realrepo` fixture convention.
- DO NOT attempt to resolve rec-20260719-004 (dynamic-dispatch taint) in this phase — unrelated recommendation, already parked in phase 65.
