---
phase: 14-refactor-realrepo-eval
id: 14-14
tier: standard
status: PENDING
---

# 14-14 — Real-repo accuracy eval for the LLM refactor feature

## Objective

Give necro's **god-function refactor** the same real-repo accuracy gate the triage
feature earned in phases 11–13. Today the refactor feature is measured only by
hand-authored synthetic fixtures (`test/fixtures/refactor/cases.json`) — small, tidy
functions the model splits trivially (synthetic pass-rate ≈1.0). That hides whether
the live model can split a **genuinely messy, authentically-sized** god function from
real code. This phase adds a deterministic capture pipeline that turns real
`necro scan --json` god-function findings (from ≥2 external TS repos, pinned by SHA)
into provenance-tagged `RefactorEvalCase`s carrying each function's **verbatim**
source, a deterministic corpus-integrity CI guard, and a **calibrated live
structural-pass-rate gate** (auto-skipped without a key, never a CI network call).
Crucially, refactor scoring is **structurally self-judging** — `evaluateProposal`
computes the three pass criteria (splits into multiple / preserves the public
signature / every unit under threshold) directly from the model's proposed code — so
unlike triage **no human output-labeling is needed**; the corpus only needs authentic,
genuinely-hard *inputs*. The refactor `SYSTEM_PROMPT` and classifier are **not** tuned
here (a future phase owns that, mirroring phase 12); this phase grows what measures
them. The extract-duplicate real-repo corpus is **deliberately deferred** to a
follow-up phase to keep this one bounded and high-quality.

## Acceptance Criteria

### AC-1: Real-repo god-function corpus with a deterministic capture pipeline
Given a new refactor capture pipeline (`src/refactor/eval-capture.ts`) that turns a `necro scan --json` document into `RefactorEvalCase` skeletons — one per god-function finding, carrying the function's **verbatim** source (re-read from the pinned checkout), its public signature, the detector's LOC threshold, and full provenance (repo + SHA + file + line + symbol) — and the `RefactorEvalCase` schema extended with an **optional** `provenance` field (backward-compatible: existing synthetic cases without it still load)
When the pipeline is run against ≥2 distinct external TS repos pinned by commit SHA (real "messy middle" god functions — **not** toy functions, **not** necro-on-itself) and the genuinely-hard cases are selected
Then a checked-in `test/fixtures/refactor-realrepo/cases.json` holds **≥12 cases drawn from ≥2 distinct source repos**, every case carrying verbatim source (no re-authored bodies), a real public signature, a real threshold, and complete provenance; and `test/fixtures/refactor-realrepo/SOURCES.md` records each repo + SHA + the exact scan command + any deliberate exclusions and why.

### AC-2: Deterministic corpus-integrity CI guard
Given the real-repo refactor corpus
When `test/refactor-realrepo-corpus.test.ts` runs with **no API key** and makes **no network call** (mock/oracle client only)
Then it validates corpus integrity (≥12 cases, ≥2 distinct `provenance.repo`, every case's `source` non-empty and containing its `signature` verbatim, `threshold` a positive number, provenance complete and `provenance.symbol === name`) and asserts the structural scoring math against synthetic proposals (a perfect oracle proposal yields pass-rate 1; a deliberately-degenerate one — single function / changed signature / still-oversized — fails the same case), so a corrupted or shrunk corpus fails loudly and offline.

### AC-3: Calibrated live structural-pass-rate gate on the real corpus
Given the expanded corpus and the existing `runRefactorEval` scorer
When the live refactor eval is run deliberately **≥3 times** against the real model (`test/refactor-eval.live.test.ts`, auto-skipped without `ANTHROPIC_API_KEY`, never a CI network call) on the real-repo corpus
Then a new real-repo pass-rate floor is set to the highest value that holds under the **observed run-to-run minima** across those ≥3 runs (not cherry-picked to pass; if it lands below the synthetic 0.8, that is recorded honestly as the real-difficulty baseline with the run numbers), the synthetic gate is left untouched as a separate assertion, and the calibration basis (the ≥3 run pass-rates) is documented in the test and in `SOURCES.md`.

### AC-4: No regression in the refactor classifier, prompt, or synthetic gate
Given the eval additions
When the full suite runs
Then the synthetic refactor + extract-duplicate live evals still clear their ≥0.8 thresholds, the refactor `SYSTEM_PROMPT`/`buildRefactorPrompt` and the proposal/parse path are **byte-for-byte unchanged**, the new corpus-integrity guard stays deterministic and network-free in CI, lazy-`import()` SDK isolation is preserved, and no existing test regresses.

## Tasks

### T1: Refactor capture pipeline + provenance on the case schema
- files: `src/refactor/eval-capture.ts`, `src/refactor/eval.ts`
- action: Add `src/refactor/eval-capture.ts` mirroring `src/triage/eval-capture.ts`: a deterministic (no LLM, no network) function that reads a `necro scan --json` document, filters to **god-function** findings, and for each emits a `RefactorEvalCase` skeleton — re-reading the function's **verbatim** source from the pinned local checkout (reuse `extractRange`/snippet machinery), capturing its signature line, the detector threshold, and a `provenance` object (repo, sha, file, line, symbol) analogous to triage's `CaseProvenance`. Extend `RefactorEvalCase` in `src/refactor/eval.ts` with an **optional** `provenance?: CaseProvenance` field (shared type or a refactor-local mirror) so existing synthetic cases without it still load via `loadEvalCases`.
- verify: a unit test feeds a sample scan-json + checkout fixture through the pipeline and gets back well-formed cases (verbatim source contains the signature, provenance complete); existing `refactor-eval.test.ts` and synthetic `loadEvalCases` still pass unchanged.
- done: AC-1

### T2: Source, capture, and select the real-repo god-function corpus
- files: `test/fixtures/refactor-realrepo/cases.json`, `test/fixtures/refactor-realrepo/SOURCES.md`
- action: Pick ≥2 external TS repos with real, oversized god functions (candidates: trpc, hono, vite/rollup src, drizzle — repos already known to have non-trivial functions; **not** clean toy libs, **not** necro-on-itself). For each, check out a pinned SHA, run `necro scan --json` (god-function detector), capture skeletons via the T1 pipeline, and **select ≥12 genuinely-hard cases** spanning ≥2 repos — real branching/imperative functions, not getters or formatters that split trivially. Bodies are captured verbatim (never re-authored). Write `SOURCES.md` recording each repo + pinned SHA + exact scan command + which findings were taken vs excluded and why (mirror the triage `SOURCES.md` rigor).
- verify: `cases.json` parses; ≥12 cases spanning ≥2 distinct `provenance.repo`; every case's `source` contains its `signature` verbatim and is a real multi-statement function; `SOURCES.md` lists each repo + SHA + command.
- done: AC-1

### T3: Deterministic corpus-integrity CI guard
- files: `test/refactor-realrepo-corpus.test.ts`
- action: Add a deterministic guard (mirror `test/triage-realrepo-corpus.test.ts`) that runs with **no key, no network**: asserts ≥12 cases / ≥2 repos, schema + provenance completeness (`provenance.symbol === name`), `source` contains `signature`, positive `threshold`; and exercises the structural scoring math with a mock `RefactorClient` — a good oracle proposal (real split, signature preserved, all units under threshold) yields pass-rate 1 on the corpus, and degenerate proposals (single function / changed signature / still-oversized helper) fail the corresponding case. Tag the relevant test titles with AC-1/AC-2.
- verify: passes with `ANTHROPIC_API_KEY` unset and makes no network call; shrinking the corpus below 12 or collapsing it to one repo fails it loudly.
- done: AC-2

### T4: Calibrate and add the live real-repo structural gate
- files: `test/refactor-eval.live.test.ts`, `test/fixtures/refactor-realrepo/SOURCES.md`
- action: Add a third `test.runIf(process.env.ANTHROPIC_API_KEY)` block to `refactor-eval.live.test.ts` that loads the real-repo corpus and runs `runRefactorEval` against the live model. Run it deliberately **≥3×** (`set -a; . ./.env; set +a; npx vitest run test/refactor-eval.live.test.ts`), record each run's pass-rate, then set a `REALREPO_PASS_RATE_GATE` to the highest value holding under the observed minima (honest about real difficulty — if it's below 0.8, say so and record the runs; do not cherry-pick). Document the calibration runs in the test comment and the `SOURCES.md` baseline table. The new block stays auto-skipped without a key; the existing synthetic block is untouched.
- verify: with no key the block skips and CI makes no network call; with a key it runs against the real corpus and prints the pass-rate breakdown; the floor is documented with its run-by-run basis, not cherry-picked.
- done: AC-3

### T5: Regression sweep — synthetic gates + prompt/classifier untouched
- files: `test/refactor-eval.test.ts`, `src/refactor/prompt.ts` (assert-only)
- action: Run the full suite and confirm: synthetic refactor + extract-duplicate evals still clear ≥0.8; `refactor-eval.test.ts` passes unchanged; the refactor `SYSTEM_PROMPT`/`buildRefactorPrompt` and proposal-parse path are byte-for-byte unchanged (diff-check, no edits); lazy `import()` SDK isolation holds (no top-level SDK import added by the capture pipeline). Record the regression result.
- verify: `npx vitest run` is green; `git diff src/refactor/prompt.ts` is empty; the capture pipeline imports the SDK lazily / not at all.
- done: AC-4

## Boundaries

- **DO NOT tune the refactor prompt or classifier.** `src/refactor/prompt.ts` (`SYSTEM_PROMPT`, `buildRefactorPrompt`) and the proposal/parse path stay byte-for-byte unchanged. This phase grows what *measures* the refactor feature; a future phase (mirroring triage phase 12) owns tuning if the real-repo gate reveals weakness.
- **DO NOT include the extract-duplicate real-repo corpus** — it is deliberately deferred to a follow-up phase. This phase covers the **god-function** mode only. The existing synthetic duplicate eval stays as-is.
- **DO NOT re-author captured function bodies.** Corpus `source` is the verbatim function from the pinned checkout (the whole point is authentic difficulty). Only case *selection* is human; the source/provenance is mechanical capture.
- **DO NOT vendor external repos** into the tree — only distilled, provenance-tagged cases land in `cases.json`, exactly as the triage corpus does.
- **DO NOT let the live eval run in CI or without a key** — it must `test.runIf(ANTHROPIC_API_KEY)` and the deterministic guard must make no network call. Live evals are billable and non-deterministic; gate on run-to-run minima across ≥3 runs, never a single run.
- **DO NOT regress the synthetic refactor/duplicate gates** (≥0.8) or break lazy SDK isolation.
