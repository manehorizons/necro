---
phase: 11-real-repo-triage-eval
id: 11-11
tier: standard
status: PENDING
---

# 11-11 — Real-repo triage accuracy eval

## Objective

Move the triage accuracy gate from hand-written toy snippets to a **real-repo-
derived, authentically-evidenced, hand-labeled corpus**. Today `necro triage`'s
only accuracy measurement is a synthetic live eval (~7 hand-authored cases with
hand-assigned `dead`/`alive` truth and hand-written evidence). This phase
captures cases by running necro's **own** dead-code scan on real repositories —
so each case carries the verbatim `EvidenceSignal[]` necro actually emits, the
real code snippet, and provenance — and applies only the ground-truth label by
hand. The result is a precision/recall gate that measures the model on exactly
what it sees in production. The triage classifier and prompt are **not** changed;
this phase measures them. (Refactor real-repo eval is a later phase.)

## Acceptance Criteria

### AC-1: Authentic-evidence capture (deterministic, no LLM)
Given a real repository's `necro scan --json` output
When the capture utility processes its `maybe` (likely-dead) findings
Then for each it emits an eval-case skeleton carrying the finding's real code snippet, the **verbatim** `EvidenceSignal[]` necro produced (not re-authored), and provenance (repo, commit SHA, file, line, symbol), with `truth` left empty for a human; the capture is deterministic and makes no LLM or network call.

### AC-2: Real-repo-derived labeled corpus, auditable
Given captured skeletons from ≥2 real repositories (≥1 external, pinned by commit SHA)
When ground truth is applied by hand
Then a checked-in corpus of ≥20 cases exists with both `dead` and `alive` represented (neither class token), each case carrying its provenance and a one-line labeling rationale, so every label is auditable against its source.

### AC-3: The eval prompt matches production
Given a corpus case
When the eval builds the model prompt
Then it goes through the same prompt path as a production triage run and uses the case's authentic captured evidence — no synthetic-evidence drift between what the eval measures and what `necro triage` actually sends.

### AC-4: Accuracy gate on the realistic corpus (opt-in live)
Given the real-repo corpus
When the live accuracy eval runs (auto-skipped without `ANTHROPIC_API_KEY`, like the existing live evals)
Then it scores precision and recall for the positive ("dead") class against the corpus and asserts a **documented** threshold; without a key, CI makes no network call.

### AC-5: Diagnostic, traceable reporting
Given an eval run
When it completes
Then it reports per-case rows (predicted vs truth) and a breakdown that makes a regression diagnosable — at minimum every misclassification surfaced with its provenance + evidence — so a failing gate points to which cases / evidence patterns the model missed, not just a number.

### AC-6: Corpus integrity validated in CI (no key)
Given the checked-in corpus
When the CI suite runs with no API key
Then a deterministic test validates corpus integrity (schema, non-empty authentic evidence, provenance present, a labeling rationale present, both truth classes present) and the precision/recall scoring math against a mocked client — no network, no model call.

## Tasks

### T1: Authentic-evidence capture utility
- files: `src/triage/eval-capture.ts`, `test/triage-eval-capture.test.ts`
- action: Given a `necro scan --json` document, select its `maybe` (likely-dead) findings and emit `EvalCase` skeletons: re-read each finding's snippet via the shared snippet reader, carry its `evidence: EvidenceSignal[]` **verbatim**, and attach provenance `{ repo, sha, file, line, symbol }`; leave `truth`/`rationale` empty. Pure/deterministic — no LLM, no network. (Internal module + dev use; not a new shipped CLI command.)
- verify: `npx vitest run test/triage-eval-capture.test.ts` — a sample scan JSON yields one skeleton per `maybe` finding with verbatim evidence + provenance and empty truth; non-`maybe` findings are excluded; no network/LLM.
- done: AC-1

### T2: EvalCase carries provenance + rationale
- files: `src/triage/eval.ts`, `test/triage-eval.test.ts`
- action: Extend `EvalCase` with optional `provenance` (`{repo, sha, file, line, symbol}`) and `rationale` (the human label justification); keep `truth`, `code`, `evidence`. Keep the existing synthetic fixtures loading/scoring unchanged (back-compatible — new fields optional). The real corpus uses the new fields.
- verify: existing triage-eval tests still green; a case with provenance+rationale loads and scores identically; types compile.
- done: AC-2

### T3: Source, capture, and label the real-repo corpus
- files: `test/fixtures/triage-realrepo/cases.json`, `test/fixtures/triage-realrepo/SOURCES.md`
- action: Run `necro scan --json` on ≥2 real TS repositories (≥1 external, pinned by commit SHA; necro's own source may be one), capture skeletons via T1, and hand-label `truth` by verifying actual reachability — recording a one-line `rationale` per case. Aim for ≥20 cases with a non-trivial `dead`/`alive` split. Record each source repo + SHA + how it was scanned in `SOURCES.md`. Only the distilled, provenance-tagged cases are checked in — **no vendored repos**.
- verify: corpus parses; ≥20 cases; both classes present and neither trivially small; every case has authentic evidence + provenance + rationale; `SOURCES.md` lists each repo + pinned SHA.
- done: AC-2, AC-3

### T4: Diagnostic reporting + accuracy breakdown
- files: `src/triage/eval.ts`, `test/triage-eval.test.ts`
- action: Extend the metrics/rows so each row carries the case's provenance and a misclassification flag, and add a breakdown (at least: counts per truth class, and the list of misclassified cases with provenance + evidence). Keep precision/recall as the headline. Deterministic given verdicts.
- verify: with a mocked client returning known verdicts, the breakdown surfaces exactly the misclassified cases with their provenance; precision/recall unchanged from the existing math; both truth classes counted.
- done: AC-5

### T5: Live accuracy gate on the real corpus
- files: `test/triage-eval.live.test.ts`
- action: Point the live triage accuracy eval at `test/fixtures/triage-realrepo/cases.json`, assert a documented precision/recall threshold for the positive ("dead") class, and log the breakdown. Auto-skipped without `ANTHROPIC_API_KEY`. Note the calibration basis (observed numbers from a live run) in the test or `SOURCES.md`; if no key is available at build time, the threshold is set by reasoning and the gate is ready to run.
- verify: with no key, the test skips and CI makes no network call; with a key, it runs against the real corpus and prints the breakdown; threshold is documented, not cherry-picked to pass.
- done: AC-4

### T6: CI corpus-integrity + scoring test (mocked, no key)
- files: `test/triage-realrepo-corpus.test.ts`
- action: A deterministic CI test that loads the real corpus and asserts integrity (schema valid, evidence non-empty, provenance + rationale present, both truth classes present, ≥20 cases) and runs `runEval` against a **mocked** client to assert the precision/recall math on the corpus shape. No network, no model.
- verify: the test passes with no API key and makes no network call; mutating a case to drop evidence/provenance/truth fails it.
- done: AC-6

## Boundaries

- **DO NOT** hand-write or edit evidence signals. Each case's `evidence` must be the **verbatim** `EvidenceSignal[]` necro emits (captured via T1); only `truth` and `rationale` are human-applied. Fabricated evidence defeats the entire point of a real-repo eval.
- **DO NOT** change the triage classifier, prompt, or the production `necro triage` path — this phase **measures** triage, it does not tune it. If a measurement reveals a real defect, that is a separate phase.
- **DO NOT** make live API calls in CI. The accuracy gate stays opt-in/live (skipped without a key); all CI tests are deterministic/mocked.
- **DO NOT** vendor whole external repositories into the tree — only the distilled, provenance-tagged cases + a `SOURCES.md` are checked in.
- **DO NOT** add a new shipped `necro` CLI command for capture — keep capture an internal module used at dev time.
- **DO NOT** delete the existing synthetic triage fixtures as part of this phase; the real corpus becomes the accuracy gate, the synthetic set may remain as a fast smoke check (disposition noted, not silently dropped).
- **Out of scope:** refactor real-repo eval (later phase); cloning repos at eval time / external-network corpora; any change to scan/fix/refactor behavior.
