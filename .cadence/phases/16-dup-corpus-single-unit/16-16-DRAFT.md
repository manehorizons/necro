---
phase: 16-dup-corpus-single-unit
id: 16-16
tier: standard
status: PENDING
---

# 16-16 — Partial-collapse credit for the extract-duplicate eval scorer

## Objective

Make the real-repo extract-duplicate gate measure **genuine model extraction
quality** by fixing the eval scorer's collapse metric **and** refining the corpus —
not by tuning the prompt. A phase-15a diagnostic (capturing the live model's actual
proposals over the three always-failing cases) split them into two kinds.
`utils-L303` is a **genuine, full deduplication** — the model lifted the shared
typeof-guard into an `isAllowedType` helper and the edited sites no longer clone —
yet the old scorer **wrongly failed it**: `collapsesDuplication` re-tokenized the
**whole spliced files** and demanded **no** residual clone ≥ the group's tokens, so
an unrelated, untouched near-duplicate (drizzle's parallel dialect modules)
surviving globally sank a correct extraction. `count-L24` and `query-builder-L90`,
by contrast, are **class-structural** clones (a constructor / select-overload block
duplicated across two dialect classes): no behavior-preserving function extraction
exists, so the model's edits leave ~0.87 of the group cloned across the sites — they
are unscorable as *model* quality, a corpus artifact.

The fix has two parts. **(a) Scorer:** `collapsesDuplication` now measures the
largest residual clone **among the model's edit replacements** (each tokenized as
its own pseudo-file via `findClones`), collapsed iff it falls below
`tokens × COLLAPSE_RATIO` (`0.5`, exported + documented) — removing the whole-file
confound so `utils-L303` passes while a non-extraction (residual ≈ the full group)
still fails. **(b) Corpus:** drop the two class-structural cases (kept as
deterministic regression fixtures that prove the scorer correctly fails them) and
backfill two clean single-unit logic clones the model can genuinely dedupe
(`dialect-L948`, `session-L69`), captured verbatim and oracle-validated — keeping
≥12 cases / ≥2 repos. `evaluateDuplicateProposal` / `collapsesDuplication` are
**eval-only** (verified: not imported by the production `runExtractDuplicate` CLI
path, which has its own `verifyRunner`), so this changes *measurement*, not the
shipped feature. The production prompt and refactor path are untouched; the live
floor is re-baselined on the fixed scorer + refined corpus (T4).

## Acceptance Criteria

### AC-1: Edited-site collapse replaces the all-or-nothing whole-file check
Given `evaluateDuplicateProposal` in `src/refactor/eval.ts` reworked so `collapsesDuplication` measures the largest residual clone **among the model's edit replacements** (each edit tokenized as its own pseudo-file, scored by `findClones`), collapsed iff it falls below `tokens × COLLAPSE_RATIO` (an exported, documented constant) — rather than re-tokenizing the whole spliced files and requiring zero residual ≥ `tokens` — and the change kept **eval-only** (no production import of `evaluateDuplicateProposal`)
When the captured live proposals are scored deterministically from the saved fixtures (`test/fixtures/refactor-dup-realrepo/proposals/`)
Then the genuine deduplication (`utils-L303`) scores `collapsesDuplication = true` and passes — the whole-file metric wrongly failed it on unrelated dialect code — while the class-structural non-extractions (`count-L24` / `query-builder-L90`, ~0.87 residual) **and** a synthetic lazy extraction score `false`; `COLLAPSE_RATIO` is chosen from the measured residuals (0.00 vs 0.87 → 0.5 midpoint), documented, not hand-fitted to a single case.

### AC-2: Degenerate and lazy proposals still fail
Given the new scoring
When the existing degenerate proposals (no shared function / wrong edit count / dropped signature) **and** a new "lazy extraction" proposal (removes less than the reduction margin) are scored, with no API key and no network call
Then all still fail `duplicatePasses`, the generic oracle still yields pass-rate 1 on the real corpus, and the synthetic unit tests in `test/refactor-eval.test.ts` are updated to pin the partial-collapse boundary (a materially-reducing extraction passes; a token-trivial one fails).

### AC-3: Re-calibrated live floor on the fixed scorer
Given the reused 15a real-repo corpus and the partial-collapse scorer
When the live duplicate eval is run deliberately **≥3 times** against the real model (`test/refactor-eval.live.test.ts`, auto-skipped without `ANTHROPIC_API_KEY`)
Then `DUP_REALREPO_PASS_RATE_GATE` is re-calibrated to the highest value holding under the observed run-to-run minima — expected to rise materially above the 15a floor of 0.5 now that correct extractions are credited (if it does not, that is recorded honestly with the runs) — set below the observed minimum with non-determinism margin, and the calibration table in the test comment + `SOURCES.md` is replaced.

### AC-4: Production untouched; no regression
Given the eval-scorer change
When the full suite runs
Then the production refactor path (`runExtractDuplicate` and its verifier) and `src/refactor/prompt.ts` (`DUP_SYSTEM_PROMPT`/`buildDuplicatePrompt`) are **byte-for-byte unchanged**, the `evaluateDuplicateProposal` change is confirmed eval-only, the synthetic refactor + extract-duplicate gates still hold, the deterministic guard stays network-free, lazy `import()` SDK isolation holds, and no existing test regresses.

## Tasks

### T1: Capture the 3 model proposals as deterministic fixtures + measure residuals
- files: `test/fixtures/refactor-dup-realrepo/proposals/` (captured `DuplicateProposal` JSON for utils-L303 / count-L24 / query-builder-L90), a throwaway capture script
- action: Run the live model once over the three cases (billable — **confirm spend first**), save each verbatim `DuplicateProposal` as a fixture, and measure for each: the original group `tokens` and the largest residual clone after splicing the proposal. Tabulate the reduction ratios to calibrate `COLLAPSE_REDUCTION`. These fixtures make the scorer fix testable deterministically (no live dependency in CI).
- verify: three proposal fixtures saved; a printed table of `tokens` vs largest-residual for each, with the implied ratio.
- done: AC-1

### T2: Implement edited-site collapse in evaluateDuplicateProposal
- files: `src/refactor/eval.ts`
- action: Replace `collapsesDuplication = clonesAfter.every((f) => f.tokens < c.tokens)` (re-tokenizing the whole spliced files) with an edited-site criterion — tokenize each edit's `replacement` as its own pseudo-file, run `findClones(editTokens, c.minTokens)`, and collapse iff the largest residual is below `c.tokens * COLLAPSE_RATIO` (constant exported + documented; calibrated from T1 so the genuine dedup passes and a near-full residual fails). Keep it eval-only; add a comment explaining why the edited sites — not the whole files — are the right scope (the whole-file confound).
- verify: scoring the T1 fixtures yields `collapsesDuplication = true` for `utils-L303` and `false` for `count-L24` / `query-builder-L90`; a synthetic lazy-extraction proposal yields `false`.
- done: AC-1

### T3: Pin the partial-collapse boundary in deterministic tests
- files: `test/refactor-eval.test.ts`, `test/refactor-dup-realrepo-corpus.test.ts`
- action: In `refactor-eval.test.ts` add tests (tag AC-1/AC-2) that score the three captured proposal fixtures (pass) and a deliberately-lazy proposal (fail), plus keep the existing degenerate-failure tests green under the new criterion. In the corpus guard, confirm the generic oracle still yields pass-rate 1 and add a "lazy extraction fails" assertion. All network-free.
- verify: both test files pass with no key / no network; the boundary tests fail if `COLLAPSE_REDUCTION` is set to the old all-or-nothing behavior.
- done: AC-2

### T4: Re-calibrate the live floor on the fixed scorer + refined corpus
- files: `test/refactor-eval.live.test.ts`, `test/fixtures/refactor-dup-realrepo/SOURCES.md`, `test/fixtures/refactor-dup-realrepo/cases.json`
- action: The corpus refinement (drop `count-L24` / `query-builder-L90`, backfill `dialect-L948` / `session-L69`) and the SOURCES/test descriptive updates are **done deterministically**; the 15a calibration block is marked SUPERSEDED and the floor held at `0.5` pending this step. Run the real-repo dup live block **≥3×** (`set -a; . ./.env; set +a; npx vitest run test/refactor-eval.live.test.ts -t "12-case corpus"`), record each pass-rate + failures under the new scorer + refined corpus, set `DUP_REALREPO_PASS_RATE_GATE` below the observed minimum, and replace the SUPERSEDED calibration block in the test comment + `SOURCES.md` with the fresh numbers. **Confirm billable spend before running.**
- verify: the live gate passes at the new (higher) floor across the runs; the floor is documented with its run-by-run basis; block still auto-skips without a key.
- done: AC-3

### T5: Regression sweep — production + prompt untouched, eval-only confirmed
- files: `src/refactor/prompt.ts` (assert-only), production refactor path (assert-only), `test/refactor-eval.test.ts`
- action: Confirm `DUP_SYSTEM_PROMPT`/`buildDuplicatePrompt` and the production `runExtractDuplicate` path are byte-for-byte unchanged (diff-check); re-confirm `evaluateDuplicateProposal` has no production importer (grep); synthetic refactor + dup gates untouched; full non-live suite green; lazy SDK isolation holds. Record the result.
- verify: `git diff` shows changes confined to `src/refactor/eval.ts` (scorer) + tests + fixtures; `prompt.ts` and the production refactor module unchanged; `npx vitest run` (non-live) green.
- done: AC-4

## Boundaries

- **DO NOT change the production refactor path.** `runExtractDuplicate` and its `verifyRunner` (the shipped `necro refactor` extract-duplicate feature) stay byte-for-byte unchanged. This phase changes the **eval scorer only** (`evaluateDuplicateProposal`), which is verified to have no production importer.
- **DO NOT tune `DUP_SYSTEM_PROMPT`.** The 15a diagnostic proved the model already produces correct extractions; the fix is the scorer, not the prompt. Prompt/classifier stays byte-for-byte unchanged.
- **Refine corpus membership, never author clone bodies.** Cases may be dropped (non-function-dedupable class-structural clones) or backfilled, but every `files[].source` stays the **verbatim** pinned-checkout file emitted by `captureDuplicateSkeletons` — no synthetic or re-authored clones, no hand-edited bodies. Backfill is oracle-validated under the new scorer and excludes import-block / type-literal / class-structural noise; the corpus stays ≥12 cases / ≥2 repos. (The captured *proposal* fixtures are model output, saved verbatim.)
- **DO NOT hand-fit `COLLAPSE_RATIO` to pass one case.** Calibrate it from the measured edited-site residuals across the real proposals (0.00 for the genuine dedup vs ~0.87 for the non-extractions) so it credits real extraction and still fails near-full residuals; document the basis.
- **DO NOT let the live eval run in CI or without a key**; the deterministic guard + the new fixture tests make no network call. Live runs are billable + non-deterministic — gate on run-to-run minima across ≥3 runs.
- **DO NOT regress** the synthetic refactor/dup gates or break lazy SDK isolation.
