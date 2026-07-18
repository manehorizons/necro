---
phase: 48-python-accuracy-corpus-ci-gate
id: 48-00
tier: complex
status: PENDING
---

# 48-00 — Python accuracy corpus (pip + httpie) with CI precision/recall gate

## Objective

Build a 40–60-case, pinned-SHA, hand-labeled accuracy corpus over pip and httpie (trimmed source-tree slices + provenance, mirroring `test/fixtures/triage-realrepo/`) and a deterministic precision/recall CI gate that runs necro's real `scan()`/`classify()` pipeline directly against it — no API key, no mocking, no LLM — enforcing design doc §3's floors (precision ≥0.85, recall ≥0.5, import-resolution ≥95%) in ordinary CI, closing Phase D of `.cadence/intelligence/python-support-design.md` §4.

## Acceptance Criteria

### AC-1: Vendored, trimmed source-tree slices for pip and httpie, with provenance
Given pinned-SHA checkouts of pip (`src/pip/_internal`) and httpie
When the corpus is built
Then `test/fixtures/python-realrepo/` contains trimmed, self-contained source-tree slices for each repo (not full checkouts) — enough surrounding files/imports/`__init__.py` structure that `necro scan` run directly against each slice reproduces the real reachability signal for every labeled symbol — plus a `SOURCES.md` recording repo, pinned SHA, and license attribution, mirroring `test/fixtures/triage-realrepo/SOURCES.md`'s precedent. This vendoring is intentional and explicit per phase 44's DRAFT boundary ("that pattern is reserved for Phase D's labeled corpus" — `44-00-DRAFT.md:89`), not a reversal of it.

### AC-2: `cases.json` sidecar with 40–60 hand-labeled cases spanning both truth classes and hard patterns
Given the vendored fixture slices
When cases are labeled
Then `test/fixtures/python-realrepo/cases.json` holds 40–60 entries, each `{name, truth: "dead"|"alive", provenance: {repo, sha, file, line, symbol}, rationale}` (provenance/rationale shape mirrors `EvalCase` in `src/triage/eval.ts`), spanning both repos and both truth classes, and deliberately including `__all__` members, `__init__.py` re-exports, decorator-registered functions, dunder methods, getattr-dispatched names, and genuinely-dead private helpers per design doc §3. Each `dead` case's rationale documents the vulture cross-check and (for pip) the delete+test-run confirmation where performed.

### AC-3: Corpus integrity test enforces structure and labeling discipline
Given the `cases.json` fixture
When `test/python-realrepo-corpus.test.ts` runs
Then it asserts: case count is between 40 and 60 inclusive; both truth classes present; at least 2 distinct `provenance.repo` values present; every case has a non-empty `rationale`; every case has complete `provenance` (repo/sha/file/line/symbol) with `provenance.symbol === name` — mirroring the assertion style of `test/triage-realrepo-corpus.test.ts`'s existing AC-6 integrity test.

### AC-4: Deterministic scoring module reusing the triage metrics shape, scoring necro's own verdicts
Given a new eval module (e.g. `src/python/realrepo-eval.ts`) mirroring `EvalMetrics`/`EvalBreakdown` from `src/triage/eval.ts`
When it scores a set of `{case, finding}` pairs
Then it computes precision/recall/misclassified using the same tp/fp/fn math as the triage harness, but keyed on necro's own `ClassifiedFinding` (`verdict: "dead"|"test-only"`, `tier: "certain"|"likely"|"maybe"`) rather than an LLM's `"likely-dead"`/`"likely-alive"` string — a case counts as a predicted "dead" positive when `verdict === "dead"` at `tier` `likely` or `certain` (per design doc §3's "dead findings at `likely` tier" floor wording).

### AC-5: CI gate runs the real scan pipeline against the vendored fixtures and enforces the floors
Given the vendored fixture slices and `cases.json`
When `test/python-realrepo-accuracy-gate.test.ts` runs `scan()` against each fixture slice and matches each case's `provenance` (file/line/symbol) to the resulting `Finding`/`SymbolNode.id`
Then it asserts precision ≥0.85 and recall ≥0.5 over the whole corpus; the test makes no network call and needs no API key; and it participates in ordinary `npm test`/CI with zero new CI config, per the triage precedent's own "runs with NO API key... in ordinary CI on every push" discipline.

### AC-6: The gate is proven to actually gate, not just pass
Given a deliberately corrupted input — a mutated copy of `cases.json` (e.g. truth labels flipped for enough cases to breach the floors) or an all-one-verdict oracle substituted for the real scan result
When the scoring assertion runs against that corrupted input in a dedicated unit test
Then the test asserts the ≥0.85 precision / ≥0.5 recall floors are breached (fail) for that corrupted input — a meta-test proving the assertion logic discriminates real signal from noise, not a tautology that always passes.

### AC-7: Import-resolution-rate smoke reaches ≥95% on the vendored slices
Given the vendored fixture slices
When the existing `src/bench/python-import-resolution-rate.ts` harness (built in phase 44, manual-only until now per its own doc comment) is run against each vendored slice instead of a live external clone
Then it reports resolved/total ≥95% for each repo's slice; the numbers are recorded in this phase's PROGRESS/SUMMARY notes.

### AC-8: Full suite and typecheck stay green; zero behavior change to existing verdicts
Given the new corpus fixtures, eval module, and gate tests
When `npm run build && npm run typecheck && npm test` run
Then the full suite (666 tests as of phase 47, plus new corpus tests) passes, and no phase 44–47 fixture-level truth table changes verdict — any resolver/taint-pattern/exemption tuning done to meet AC-5's floors (design doc: "this is where the real iteration happens") is additive/corrective, not a regression of already-shipped Python behavior.

## Tasks

### T1: Vendor trimmed pip + httpie source-tree slices with provenance
- files: `test/fixtures/python-realrepo/pip/**`, `test/fixtures/python-realrepo/httpie/**`, `test/fixtures/python-realrepo/SOURCES.md`
- action: Pull pinned-SHA checkouts of pip (`src/pip/_internal`) and httpie locally (not committed as full checkouts); extract the minimal set of files/packages needed for `necro scan` to reproduce real reachability for candidate symbols (enough `__init__.py`/import closure, not just isolated snippets). Commit only the trimmed slices into the two fixture directories. Write `SOURCES.md` recording each repo's URL, pinned SHA, and actual license (verified from the checkout's LICENSE file, not assumed).
- verify: `necro scan test/fixtures/python-realrepo/pip` and `.../httpie` run without crashing and without import-resolution errors on the trimmed slice's own internal imports.
- done: AC-1

### T2: Label `cases.json` — 40-60 hand-verified cases across both repos
- files: `test/fixtures/python-realrepo/cases.json`
- action: Seed candidates from a prototype `necro scan` run on each slice, cross-check against `vulture`'s output (disagreements are the interesting cases), then hand-verify each by reading references in the trimmed slice. Write `{name, truth, provenance: {repo, sha, file, line, symbol}, rationale}` per case (shape mirrors `EvalCase` in `src/triage/eval.ts`). Deliberately include `__all__` members, `__init__.py` re-exports, decorator-registered functions, dunder methods, getattr-dispatched names, and genuinely-dead private helpers. For pip `dead` cases, confirm by deleting the symbol locally and running pip's own test suite where feasible; record that confirmation in the rationale.
- verify: manual spot-check of a sample of cases against the trimmed slice source; both truth classes and both repos represented.
- done: AC-2

### T3: Corpus integrity test
- files: `test/python-realrepo-corpus.test.ts`
- action: Mirror `test/triage-realrepo-corpus.test.ts`'s integrity-test style: assert case count is 40-60 inclusive, both truth classes present, ≥2 distinct `provenance.repo` values, every case has non-empty `rationale`, complete `provenance`, and `provenance.symbol === name`.
- verify: test passes against T2's `cases.json`; deliberately truncate/corrupt a local copy to confirm each assertion actually fails on bad input (not committed — a manual dry run during implementation).
- done: AC-3

### T4: Eval/scoring module for necro's own verdicts
- files: `src/python/realrepo-eval.ts`, `test/python-realrepo-eval.test.ts`
- action: Port `EvalMetrics`/`EvalBreakdown`'s tp/fp/fn math from `src/triage/eval.ts` into a new module keyed on `ClassifiedFinding` (`verdict`, `tier`) instead of an LLM's `TriageVerdict` string. A case is a predicted "dead" positive when the matched finding has `verdict === "dead"` and `tier` is `"likely"` or `"certain"`; otherwise it's a predicted "alive"/negative.
- verify: unit tests — a perfect-oracle input yields precision/recall 1; an all-"dead" input surfaces every alive case as a false positive (mirrors the existing triage eval tests' shape).
- done: AC-4

### T5: CI accuracy gate — real `scan()` against the vendored fixtures
- files: `test/python-realrepo-accuracy-gate.test.ts`
- action: Run `scan()` against each vendored fixture slice (T1); for each `cases.json` entry, match `provenance.file`/`provenance.line`/`provenance.symbol` to the resulting `Finding`/`SymbolNode.id`; feed the matched pairs through T4's scoring module; assert precision ≥0.85 and recall ≥0.5 over the whole corpus. If floors aren't met on the first run, iterate on the resolver/taint-patterns/exemption list (Constraints: without regressing phases 45-47's existing fixture truth tables) until they are — this is the phase's expected iteration budget.
- verify: test passes with no network call and no API key required; passes in a plain `npm test` run with zero new CI config.
- done: AC-5

### T6: Meta-test — prove the gate actually gates
- files: `test/python-realrepo-accuracy-gate.test.ts` (additional test case) or a sibling file
- action: Construct a deliberately corrupted input (a mutated in-memory copy of the loaded cases with enough truth labels flipped to breach the floors, or an all-one-verdict stand-in for the scan result) and assert the same scoring path reports precision/recall below the 0.85/0.5 floors for that corrupted input.
- verify: the meta-test fails loudly if commented out to a tautology (sanity-checked once during implementation, then left as a normal assertion).
- done: AC-6

### T7: Wire the import-resolution-rate harness against the vendored slices
- files: `src/bench/python-import-resolution-rate.ts` (extend `--repo` usage or add a fixture-path convenience), this phase's PROGRESS notes
- action: Run the existing phase-44 harness against `test/fixtures/python-realrepo/pip` and `.../httpie` (the trimmed slices, not a live external clone); record resolved/total and rate for each in `--notes` on task completion.
- verify: both slices report ≥95% resolution rate.
- done: AC-7

### T8: Full suite/typecheck green; record final numbers
- files: none (verification task)
- action: Run the full suite and typecheck after T1-T7 land; record the final measured precision/recall/import-resolution numbers in this phase's SUMMARY.
- verify: `npm run build && npm run typecheck && npm test` all green (666+ tests); no phase 44-47 fixture-level truth table changed verdict.
- done: AC-8

## Boundaries

- DO NOT vendor full pip/httpie checkouts — trimmed, self-contained slices only (AC-1, Constraints).
- DO NOT pad the corpus past 60 cases or below 40 to hit a round number — prefer well-labeled hard-pattern cases (Constraints).
- DO NOT implement a live/LLM-based triage gate for Python — deferred to post-v1 (design doc §4).
- DO NOT touch namespace-package/uv-workspace resolution, `fix --write`, or Python `verify-removal` defaults.
- DO NOT add a new npm dependency for the eval/scoring module — hand-rolled math only, matching `src/triage/eval.ts`.
- DO NOT assume vendored-slice licenses — verify each repo's actual LICENSE file at the pinned SHA before writing `SOURCES.md`.
- DO NOT regress phases 45-47's existing Python fixture-level truth tables while tuning the resolver/taint-patterns/exemption list to meet T5's floors.
