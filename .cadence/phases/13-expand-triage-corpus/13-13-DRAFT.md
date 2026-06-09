---
phase: 13-expand-triage-corpus
id: 13-13
tier: standard
status: PENDING
---

# 13-13 — Expand the real-repo triage corpus

## Objective

Grow the real-repo triage accuracy corpus from its current **single-repo, 19-case**
state (all from `honojs/hono`) into a **multi-repo** corpus large enough to make
the live precision gate a real measure rather than a collapse-detector. Today one
symbol's run-to-run coin-flip swings precision ~0.33 (19 cases / 5 dead), so the
gate floors at a coarse 0.70 — well under the 1.00 phase 12 actually achieved. This
phase captures additional **authentically-evidenced** `maybe` findings from ≥1 more
external repo (pinned by SHA) via the existing `eval-capture.ts` pipeline, hand-labels
them, and — only once the corpus is larger and the result holds across multiple live
runs — tightens the precision floor toward ≥0.85. The triage classifier and prompt are
**not** changed; phase 12 owns tuning, this phase grows what measures it.

## Acceptance Criteria

### AC-1: Multi-repo, authentically-evidenced corpus
Given the existing capture pipeline (`eval-capture.ts`) and `necro scan --json` run on ≥1 additional external TS repo (beyond hono), each pinned by commit SHA
When its discriminating `maybe` findings are captured and hand-labeled
Then the checked-in corpus grows to **≥35 cases drawn from ≥2 distinct source repos**, both `dead` and `alive` non-trivially represented, every new case carrying its **verbatim** `EvidenceSignal[]` (not re-authored), full provenance, and a one-line labeling rationale; `SOURCES.md` records each new repo + SHA + how it was scanned, and the degenerate-corpus pitfalls (necro-self, clean-entry libs) stay excluded.

### AC-2: Tightened, evidence-calibrated live accuracy gate
Given the expanded corpus
When the live accuracy eval is run deliberately ≥3 times against the real model (auto-skipped without `ANTHROPIC_API_KEY`, never a CI network call)
Then the precision floor is raised toward ≥0.85 — set to the highest value that holds under the observed run-to-run minima across those runs (if 0.85 does not hold on the larger corpus, the floor is set to the highest defensible value with the run numbers recorded, not cherry-picked) — the recall floor is re-derived for the new dead-class size, and the calibration basis (the ≥3 run results) is documented.

### AC-3: No regression in classifier, prompt, or synthetic gate
Given the corpus expansion
When the full suite runs
Then the synthetic live eval still clears its ≥0.8 threshold, the triage classifier and `SYSTEM_PROMPT` are byte-for-byte unchanged, the corpus-integrity + scoring guards stay deterministic and network-free in CI, and no existing test regresses.

## Tasks

### T1: Source, capture, and label additional real-repo cases
- files: `test/fixtures/triage-realrepo/cases.json`, `test/fixtures/triage-realrepo/SOURCES.md`
- action: Pick ≥1 "messy middle" external TS repo (a real resolvable entry point plus dynamic-import-tainted scopes that yield genuinely-ambiguous `maybe` findings with discriminating evidence — candidates: trpc, elysia, drizzle, vite's TS src; **not** clean single-entry libs (ky/got) which yield ~zero maybes, and **not** necro-on-itself which is degenerate). Run `necro scan --json`, capture skeletons via the existing `eval-capture.ts`, and hand-label `truth` by reading each symbol's actual production reachability — recording a one-line `rationale` and full provenance per case. Append to `cases.json` to reach **≥35 total cases / ≥2 repos**, keeping a non-trivial dead/alive split. Update `SOURCES.md` with each new repo + pinned SHA + scan command + any deliberate exclusions. **No vendored repos** — only distilled, provenance-tagged cases.
- verify: corpus parses; ≥35 cases spanning ≥2 distinct `provenance.repo` values; both classes present and neither trivially small; every new case has verbatim evidence + provenance + rationale; `SOURCES.md` lists each repo + SHA.
- done: AC-1

### T2: Raise the corpus-integrity floor to match
- files: `test/triage-realrepo-corpus.test.ts`
- action: Raise the deterministic integrity floor from `≥18` to match the expanded size (`≥35`) and assert the corpus now spans **≥2 distinct source repos** (`provenance.repo`), alongside the existing schema / authentic-evidence / both-classes / scoring-math checks. Stays mocked — no network, no key.
- verify: passes with no API key and makes no network call; shrinking the corpus below the floor or collapsing it to a single repo fails it loudly.
- done: AC-1

### T3: Re-calibrate and tighten the live accuracy gate
- files: `test/triage-eval.live.test.ts`, `test/fixtures/triage-realrepo/SOURCES.md`
- action: Run the real-repo live eval ≥3× against the model (`set -a; . ./.env; set +a; npx vitest run test/triage-eval.live.test.ts -t "real-repo"`), record precision/recall per run, then raise `PRECISION_GATE` toward 0.85 — to the highest value that sits at/under the observed minima (if 0.85 doesn't hold, set the highest defensible floor and say so) — and re-derive `RECALL_GATE` for the new dead-class size. Update the calibration comment and `SOURCES.md` baseline table with the ≥3 run numbers. The gate stays auto-skipped without a key.
- verify: with no key, the live test skips and CI makes no network call; with a key it runs against the expanded corpus and prints the breakdown; the new floors are documented with their run-by-run basis, not cherry-picked to pass.
- done: AC-2

### T4: Regression sweep — synthetic gate + classifier/prompt untouched
- files: `test/triage-eval.live.test.ts`, `src/triage/prompt.ts` (read-only check)
- action: Confirm the synthetic live eval still clears ≥0.8 (run it once with a key), and assert via `git diff` that `src/triage/prompt.ts` and `src/triage/client.ts` are unchanged by this phase. Run the full deterministic suite to confirm nothing regressed.
- verify: `npx vitest run` green with no key (live tests skip); synthetic live eval ≥0.8 with a key; `git diff --stat src/triage/prompt.ts src/triage/client.ts` empty for this phase.
- done: AC-3

## Boundaries

- **DO NOT** hand-write or edit evidence signals. Every new case's `evidence` must be the **verbatim** `EvidenceSignal[]` necro emits (captured via `eval-capture.ts`); only `truth` and `rationale` are human-applied.
- **DO NOT** change the triage classifier, `SYSTEM_PROMPT`, or the production `necro triage` path — phase 12 owns prompt tuning; this phase grows the corpus that measures it. If the larger corpus reveals a real accuracy defect, that is a separate tuning phase.
- **DO NOT** raise the precision floor on aspiration. The new floor must hold under the observed minima across ≥3 live runs; the model is non-deterministic (`thinking: adaptive`), so a single passing run is not evidence.
- **DO NOT** make live API calls in CI. The accuracy gate stays opt-in/live (skipped without a key); all CI tests stay deterministic/mocked.
- **DO NOT** vendor whole external repositories into the tree — only distilled, provenance-tagged cases + an updated `SOURCES.md`.
- **DO NOT** re-introduce degenerate sources (necro-on-itself → identical non-discriminating evidence; clean single-entry libs → ~zero `maybe` findings).
- **Out of scope:** refactor real-repo eval (later phase); cloning repos at eval time / external-network corpora; any change to scan/fix/refactor/triage-prompt behavior.
