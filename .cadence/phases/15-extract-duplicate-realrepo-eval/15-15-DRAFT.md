---
phase: 15-extract-duplicate-realrepo-eval
id: 15-15
tier: standard
status: PENDING
---

# 15-15 — Real-repo accuracy eval for extract-duplicate

## Objective

Give necro's **extract-duplicate refactor** the same real-repo accuracy gate the
god-function refactor earned in phase 14. Today the duplicate feature is measured only
by two hand-authored synthetic fixtures (`test/fixtures/refactor-duplicate/cases.json`)
— tidy, obvious clone pairs the model collapses trivially. That hides whether the live
model can extract a shared function from **genuinely messy, authentically-sized** clone
groups in real code. This phase adds a deterministic capture pipeline that turns real
`necro scan --json` **`duplication`** findings (from ≥2 external TS repos, pinned by SHA)
into provenance-tagged `DuplicateEvalCase`s carrying each clone group's **verbatim**
file sources, locations, token length, and the call-surface lines that must survive; a
deterministic corpus-integrity CI guard; and a **calibrated live structural-pass-rate
gate** (auto-skipped without a key, never a CI network call). Like phase 14, duplicate
scoring is **structurally self-judging** — `evaluateDuplicateProposal` computes the three
pass criteria (extracts one shared function / one edit per clone location collapses the
duplication below `minTokens` / every call surface preserved) directly from the model's
proposed edits — so **no human output-labeling is needed**; the corpus only needs
authentic, genuinely-hard *inputs*. The refactor `DUP_SYSTEM_PROMPT` and duplicate
prompt builder are **not** tuned here (phase 15b owns prompt tuning, mirroring triage
phase 12); this phase grows what measures them. To stay bounded, the corpus is curated
to **same-file or small cross-file** clone groups — giant/multi-file groups are excluded
so each case's inline `files[]` stay reviewable.

## Acceptance Criteria

### AC-1: Real-repo duplicate corpus with a deterministic capture pipeline
Given a new duplicate capture path (`src/refactor/eval-capture.ts`) that turns a `necro scan --json` document's **`duplication`** findings into `DuplicateEvalCase`s — one per clone group, carrying every referenced file's **verbatim** source (re-read from the pinned checkout, inline as `files: [{path, source}]` with repo-relative paths), the clone `locations[]`, the matched `tokens`, the detector `minTokens`, the `signatures[]` (the call-surface line at each location that must survive), and full provenance (repo + SHA) — and `DuplicateEvalCase` extended with an **optional** `provenance` field (backward-compatible: the existing synthetic cases without it still load via `loadDuplicateEvalCases`)
When the pipeline is run against ≥2 distinct external TS repos pinned by commit SHA (real clone groups — **not** toy fixtures, **not** necro-on-itself) and genuinely-hard, reviewable groups are selected
Then a checked-in `test/fixtures/refactor-dup-realrepo/cases.json` holds **≥12 cases drawn from ≥2 distinct source repos**, every case carrying verbatim file sources (no re-authored bodies), real `locations`/`tokens`/`minTokens`, the `signatures[]` that must survive, and complete provenance; and `test/fixtures/refactor-dup-realrepo/SOURCES.md` records each repo + SHA + the exact scan command + the selection criteria (same-file / small cross-file) and any deliberate exclusions and why.

### AC-2: Deterministic corpus-integrity CI guard
Given the real-repo duplicate corpus
When `test/refactor-dup-realrepo-corpus.test.ts` runs with **no API key** and makes **no network call** (mock/oracle client only)
Then it validates corpus integrity (≥12 cases, ≥2 distinct `provenance.repo`, every case's referenced `files[]` non-empty, each `locations[]` entry resolving to a file in `files[]` with a valid line range, each `signatures[]` line appearing verbatim in the corresponding source, `tokens`/`minTokens` positive, provenance complete) and asserts the structural scoring math against synthetic proposals (a perfect oracle proposal — one shared function, one edit per clone location, duplication collapsed below `minTokens`, every signature preserved — yields pass-rate 1; a deliberately-degenerate one — no shared function / wrong edit count / duplication still present / a dropped signature — fails the same case), so a corrupted or shrunk corpus fails loudly and offline.

### AC-3: Calibrated live structural-pass-rate gate on the real corpus
Given the expanded corpus and the existing `runDuplicateEval` scorer
When the live duplicate eval is run deliberately **≥3 times** against the real model (`test/refactor-eval.live.test.ts`, auto-skipped without `ANTHROPIC_API_KEY`, never a CI network call) on the real-repo duplicate corpus
Then a new real-repo pass-rate floor is set to the highest value that holds under the **observed run-to-run minima** across those ≥3 runs (not cherry-picked to pass; if it lands below the synthetic 0.8, that is recorded honestly as the real-difficulty baseline with the run numbers), the synthetic duplicate gate is left untouched as a separate assertion, and the calibration basis (the ≥3 run pass-rates) is documented in the test and in `SOURCES.md`.

### AC-4: No regression in the duplicate prompt, scorer, or synthetic gates
Given the eval additions
When the full suite runs
Then the synthetic refactor + extract-duplicate live evals still clear their ≥0.8 thresholds, the duplicate `DUP_SYSTEM_PROMPT`/`buildDuplicatePrompt`/`buildDuplicateCasePrompt` and the proposal/parse path are **byte-for-byte unchanged**, the new corpus-integrity guard stays deterministic and network-free in CI, lazy-`import()` SDK isolation is preserved, and no existing test regresses.

## Tasks

### T1: Duplicate capture path + provenance on the duplicate case schema
- files: `src/refactor/eval-capture.ts`, `src/refactor/eval.ts`
- action: Add a `captureDuplicateSkeletons` function to `src/refactor/eval-capture.ts` (alongside `captureRefactorSkeletons`): a deterministic (no LLM, no network) function that reads a `necro scan --json` document's **`duplication`** findings (shape `{ tokens, locations: [{file,startLine,endLine}] }`), and for each clone group emits a `DuplicateEvalCase` — collecting the distinct files the group touches, re-reading each file's **verbatim** source from the pinned local checkout, recording paths **repo-relative** (normalize the scan's absolute paths the same way `captureRefactorSkeletons` does), mapping the absolute `locations` into in-`files[]` `CloneLocation`s, capturing `tokens`, the detector `minTokens`, the `signatures[]` (the first line at each clone location), and a `provenance` object (repo, sha). Extend `DuplicateEvalCase` in `src/refactor/eval.ts` with an **optional** `provenance?: CaseProvenance` field so existing synthetic cases without it still load via `loadDuplicateEvalCases`. Add a `DuplicateCaptureOptions` ({ repo, sha, sourceRoot, minTokens? }) mirroring `RefactorCaptureOptions`.
- verify: a unit test feeds a sample scan-json (with `duplication`) + checkout fixture through `captureDuplicateSkeletons` and gets back well-formed cases (verbatim file sources contain each signature, locations resolve in-files, provenance complete); existing `refactor-eval.test.ts` and synthetic `loadDuplicateEvalCases` still pass unchanged.
- done: AC-1

### T2: Source, capture, and select the real-repo duplicate corpus
- files: `test/fixtures/refactor-dup-realrepo/cases.json`, `test/fixtures/refactor-dup-realrepo/SOURCES.md`
- action: Reuse the existing pinned checkouts under `/tmp/necro-corpus` — hono @ `e50df01` and trpc @ `c7360d4` — whose `*-scan.json` already carry `duplication` findings (hono 2393 groups, trpc 1457). Filter to **genuinely-hard but reviewable** clone groups: prefer **same-file** or **small cross-file** (≤2 files) groups with modest line spans; **exclude** giant/multi-file groups and clones living in `*.test.ts` fixtures where the duplication is test-boilerplate rather than extractable logic. Capture skeletons via the T1 pipeline and **select ≥12 cases spanning ≥2 repos**. Sources captured verbatim (never re-authored). Write `SOURCES.md` recording each repo + pinned SHA + exact scan command + the selection criteria + which groups were taken vs excluded and why (mirror the phase-14 `SOURCES.md` rigor). Use the esbuild one-off bundle pattern for the capture/select script (output inside the project; delete after; do not commit it).
- verify: `cases.json` parses; ≥12 cases spanning ≥2 distinct `provenance.repo`; every case's `files[]` non-empty, each `locations[]` resolves in-files, each `signatures[]` line present verbatim; `SOURCES.md` lists each repo + SHA + command + selection rule.
- done: AC-1

### T3: Deterministic corpus-integrity CI guard
- files: `test/refactor-dup-realrepo-corpus.test.ts`
- action: Add a deterministic guard (mirror `test/refactor-realrepo-corpus.test.ts`) that runs with **no key, no network**: asserts ≥12 cases / ≥2 repos, schema + provenance completeness, `files[]` non-empty, each `locations[]` entry resolving to a `files[]` path with a valid line range, each `signatures[]` line present verbatim in source, positive `tokens`/`minTokens`; and exercises the structural scoring math with a mock `RefactorClient` — a good oracle proposal (one exported shared function, one edit per clone location, duplication collapsed below `minTokens`, every signature preserved) yields pass-rate 1 on the corpus, and degenerate proposals (no shared function / wrong edit count / duplication still present / dropped signature) fail the corresponding case. Tag the relevant test titles with AC-1/AC-2.
- verify: passes with `ANTHROPIC_API_KEY` unset and makes no network call; shrinking the corpus below 12 or collapsing it to one repo fails it loudly.
- done: AC-2

### T4: Calibrate and add the live real-repo structural gate
- files: `test/refactor-eval.live.test.ts`, `test/fixtures/refactor-dup-realrepo/SOURCES.md`
- action: Add a new `test.runIf(process.env.ANTHROPIC_API_KEY)` block to `refactor-eval.live.test.ts` (tag AC-3) that loads the real-repo duplicate corpus and runs `runDuplicateEval` against the live model. Run it deliberately **≥3×** (`set -a; . ./.env; set +a; npx vitest run test/refactor-eval.live.test.ts -t "extract-duplicate"`), record each run's pass-rate, then set a `DUP_REALREPO_PASS_RATE_GATE` to the highest value holding under the observed minima (honest about real difficulty — if it's below 0.8, say so and record the runs; do not cherry-pick). Document the calibration runs in the test comment and the `SOURCES.md` baseline table. The new block stays auto-skipped without a key; the existing synthetic duplicate block is untouched. **Confirm with the user before spending on the live runs.**
- verify: with no key the block skips and CI makes no network call; with a key it runs against the real corpus and prints the pass-rate breakdown; the floor is documented with its run-by-run basis, not cherry-picked.
- done: AC-3

### T5: Regression sweep — synthetic gates + dup prompt/scorer untouched
- files: `test/refactor-eval.test.ts`, `src/refactor/prompt.ts` (assert-only)
- action: Run the full suite and confirm: synthetic refactor + extract-duplicate evals still clear ≥0.8; `refactor-eval.test.ts` passes unchanged; the duplicate `DUP_SYSTEM_PROMPT`/`buildDuplicatePrompt`/`buildDuplicateCasePrompt` and proposal-parse path are byte-for-byte unchanged (diff-check, no edits); lazy `import()` SDK isolation holds (no top-level SDK import added by the capture path). Record the regression result.
- verify: `npx vitest run` is green; `git diff src/refactor/prompt.ts` is empty; the duplicate capture path imports the SDK lazily / not at all.
- done: AC-4

## Boundaries

- **DO NOT tune the duplicate prompt or scorer.** `src/refactor/prompt.ts` (`DUP_SYSTEM_PROMPT`, `buildDuplicatePrompt`), `buildDuplicateCasePrompt`, and the proposal/parse path stay byte-for-byte unchanged. This phase grows what *measures* the duplicate feature; phase 15b (mirroring triage phase 12) owns prompt tuning if the real-repo gate reveals weakness.
- **DO NOT touch the god-function path.** Phase 14 already shipped the real-repo god-function corpus and gate; this phase covers the **extract-duplicate** mode only. `captureRefactorSkeletons`, `test/fixtures/refactor-realrepo/`, and the phase-14 live/guard tests stay as-is.
- **DO NOT re-author captured clone sources.** Corpus `files[].source` is the verbatim file content from the pinned checkout (the whole point is authentic difficulty). Only case *selection* is human; the sources/locations/provenance are mechanical capture.
- **DO NOT include giant or many-file clone groups.** Curate to same-file or small cross-file (≤2 files) groups so each case's inline `files[]` stay reviewable; record the size cutoff in `SOURCES.md`.
- **DO NOT vendor external repos** into the tree — only distilled, provenance-tagged cases land in `cases.json`, exactly as the phase-14 corpus does.
- **DO NOT let the live eval run in CI or without a key** — it must `test.runIf(ANTHROPIC_API_KEY)` and the deterministic guard must make no network call. Live evals are billable and non-deterministic; gate on run-to-run minima across ≥3 runs, never a single run.
- **DO NOT regress the synthetic refactor/duplicate gates** (≥0.8) or break lazy SDK isolation.
