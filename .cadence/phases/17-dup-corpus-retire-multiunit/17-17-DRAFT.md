---
phase: 17-dup-corpus-retire-multiunit
id: 17-17
tier: standard
status: PENDING
---

# 17-17 — Retire multi-unit clone windows; curate single-unit corpus by live validation

## Objective

Curate the real-repo extract-duplicate corpus so its pass-rate measures **model
extraction quality on genuinely single-extractable clones**, not the duplication
detector's habit of emitting clone windows larger than any one extractable unit.
Phase-16's live calibration (0.75 / 0.75 / 0.58, floor held at 0.5) found three
cases — `select-L685`, `delete-L205`, `driver-L61` — that the model handles
**correctly** (it lifts the one real shared function: `createSelectionProxy`,
`buildQueryFromDialect`, `extractRelationalConfig`, and wires every call site) yet
the edited-site scorer fails every run, because the detector's window bundles
near-identical class scaffolding (overload signatures, `getSQL`/`_prepare` methods,
driver-construction blocks) that has no single-function extraction and stays cloned
(residual 0.66–0.89). Those residuals **overlap** the genuinely-non-extractable pair
retired in phase 16 (~0.87), so no `COLLAPSE_RATIO` can credit them — they are a
corpus-input artifact. A **static single-unit predicate was tested and rejected**:
counting function-unit declarations / body overlaps inside the clone window does NOT
separate good from bad (the good `session-L69` / `session-L205` look *more*
multi-unit than the bad `driver-L61` / `select-L685`); the discriminator is semantic.
So this phase drops the three multi-unit windows and backfills three **single-unit**
clones selected by a loose heuristic and **confirmed by live validation** (the only
reliable discriminator), keeping ≥12 cases / ≥2 repos, then re-baselines the floor —
expected to rise materially above 0.5 now that the impossible cases are gone. This is
an **eval-corpus** change only: the phase-16 edited-site scorer (`COLLAPSE_RATIO`),
`DUP_SYSTEM_PROMPT`, and the production refactor path are untouched.

## Acceptance Criteria

### AC-1: Multi-unit windows retired; corpus stays ≥12 cases / ≥2 repos
Given the real-repo dup corpus (`test/fixtures/refactor-dup-realrepo/cases.json`)
When `select-L685`, `delete-L205`, `driver-L61` are removed and three single-unit clone groups are backfilled — each a **real** `duplication` finding captured **verbatim** from a pinned checkout (trpc `c7360d4` / drizzle `48e5406`) via `captureDuplicateSkeletons`, oracle-valid under the edited-site scorer
Then `cases.json` holds ≥12 cases spanning ≥2 source repos, no source file hosts >3 cases, and the corpus-integrity guard (`test/refactor-dup-realrepo-corpus.test.ts`) passes network-free.

### AC-2: Deterministic scoring guard holds on the curated corpus
Given the curated corpus and the unchanged edited-site scorer
When the deterministic guard runs with no API key and no network call
Then the generic oracle still yields `passRate = 1` across the whole corpus, the per-case lazy-extraction sweep still fails every case, the degenerate proposals still fail, and every case carries verbatim sources / resolvable locations / surviving signatures / complete provenance.

### AC-3: Re-calibrated live floor rises above 0.5 on the curated corpus
Given the curated corpus + the phase-16 edited-site scorer
When the live dup eval is run deliberately **≥3×** against the real model (`test/refactor-eval.live.test.ts`, auto-skipped without `ANTHROPIC_API_KEY`)
Then each backfilled case collapses (passes) in **≥2/3** runs — empirically confirming single-unit collapsibility (the static predicate's non-viability is documented with its measured evidence) — and `DUP_REALREPO_PASS_RATE_GATE` is re-set below the observed run-to-run minimum, **rising materially above 0.5** (if it does not, that is recorded honestly with the runs); the calibration block in the test comment + `SOURCES.md` is replaced.

### AC-4: Scorer, prompt, and production untouched; no regression
Given the eval-corpus change
When the full suite runs
Then `evaluateDuplicateProposal` / `COLLAPSE_RATIO` and the rest of `src/refactor/eval.ts` scoring logic, `src/refactor/prompt.ts` (`DUP_SYSTEM_PROMPT`/`buildDuplicatePrompt`), and the production `runExtractDuplicate` refactor path are **byte-for-byte unchanged**; only `cases.json`, the proposal/case fixtures, `SOURCES.md`, and the `DUP_REALREPO_PASS_RATE_GATE` constant + its comment change; the deterministic guard stays network-free, lazy `import()` SDK isolation holds, and no existing test regresses.

## Tasks

### T1: Drop the 3 multi-unit windows; capture + provisionally backfill 3 single-unit clones
- files: `test/fixtures/refactor-dup-realrepo/cases.json`, `test/fixtures/refactor-dup-realrepo/proposals/` (capture/selection harness, throwaway)
- action: Remove `select-L685` / `delete-L205` / `driver-L61` from `cases.json`. Re-run `captureDuplicateSkeletons` over the pinned checkouts (`/tmp/necro-corpus/...`), filter to oracle-valid genuine-logic clones excluding existing cases + import/type/class-structural noise, and select a **pool** of single-unit candidates (prefer clone windows that are one coherent expression/statement block, not spanning multiple complete method bodies). Add three provisional picks to reach ≥12 cases / ≥2 repos / ≤3 per file; stage the spare candidates for T2 swap-in. Keep the deterministic guard green (oracle-valid ⇒ passes).
- verify: `npx vitest run test/refactor-dup-realrepo-corpus.test.ts test/refactor-eval.test.ts` green with no key/network; corpus = ≥12 / ≥2 repos / ≤3 per file; the 3 windows gone.
- done: AC-1, AC-2

### T2: Live-validate the backfills + re-calibrate the floor  (BILLABLE — confirm spend)
- files: `test/refactor-eval.live.test.ts`, `test/fixtures/refactor-dup-realrepo/SOURCES.md`
- action: Run the real-repo dup live block **≥3×** (`set -a; . ./.env; set +a; npx vitest run test/refactor-eval.live.test.ts -t "12-case corpus"`). Confirm each backfilled case collapses in ≥2/3 runs; **swap** any that fails from the T1 candidate pool and re-validate. Record per-run pass-rate + failures, set `DUP_REALREPO_PASS_RATE_GATE` below the observed minimum (expected materially above 0.5), and replace the phase-16 calibration block in the test comment + `SOURCES.md`. **Confirm billable spend before running.**
- verify: live gate passes at the new (higher) floor across the runs; each backfill passes ≥2/3; floor documented with its run-by-run basis; block still auto-skips without a key.
- done: AC-3

### T3: Regression sweep — scorer/prompt/production untouched; document empirical curation
- files: `src/refactor/eval.ts` (assert-only), `src/refactor/prompt.ts` (assert-only), production refactor path (assert-only), `test/fixtures/refactor-dup-realrepo/SOURCES.md`
- action: Confirm `evaluateDuplicateProposal`/`COLLAPSE_RATIO`, `DUP_SYSTEM_PROMPT`, and `runExtractDuplicate` are byte-for-byte unchanged (diff-check); re-confirm `evaluateDuplicateProposal` has no production importer (grep). Document in `SOURCES.md` that "single-unit" is curated **empirically (live validation)**, with the measured evidence that a static predicate is non-viable, and add a note that the deeper root cause is the duplication detector emitting clone windows across function boundaries (`findClones`) — a separate, production-scope concern. Full non-live suite green.
- verify: `git diff` shows changes confined to `cases.json` + fixtures + `SOURCES.md` + the gate constant/comment; `npx vitest run` (non-live) green; eval-only confirmed.
- done: AC-4

## Boundaries

- **Eval-corpus change only.** DO NOT change the phase-16 edited-site scorer (`evaluateDuplicateProposal` / `COLLAPSE_RATIO` / `src/refactor/eval.ts` scoring logic). This phase changes *which cases exist* and *the calibrated floor*, not *how proposals are scored*.
- **DO NOT tune `DUP_SYSTEM_PROMPT`** or touch the production `runExtractDuplicate` refactor path. The model is already correct on these cases; the fix is corpus membership.
- **Capture verbatim only.** Backfills are real detector `duplication` clone groups from the pinned checkouts, captured by `captureDuplicateSkeletons` and oracle-valid — no synthetic, re-authored, or hand-edited clone bodies.
- **DO NOT claim a static single-unit predicate.** It is proven non-viable (phase-17 measurement); curation is **empirical via live validation**. Document the evidence rather than encoding a brittle structural gate that mis-classifies good cases.
- **DO NOT overfit the corpus to look good.** Backfills must be authentic real-repo clones that are single coherent extractable units — not cherry-picked trivia. The gate must still measure genuine difficulty across ≥2 repos.
- **DO NOT let the live eval run in CI or without a key.** The deterministic guard makes no network call; live runs are billable + non-deterministic — gate on run-to-run minima across ≥3 runs.
