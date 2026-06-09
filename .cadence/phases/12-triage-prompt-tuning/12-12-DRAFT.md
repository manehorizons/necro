---
phase: 12-triage-prompt-tuning
id: 12-12
tier: standard
status: PENDING
---

# 12-12 — Triage prompt tuning — raise real-repo precision toward ≥0.85

## Objective

Revise the triage `SYSTEM_PROMPT` so the model stops treating "0 static references" plus an unresolvable dynamic-import taint as evidence of death — that taint is the *reason* a symbol was quarantined as `maybe`, not a death signal — raising live real-repo precision from the 0.50–0.75 baseline toward ≥0.85 and fixing the two persistent false positives (`RequiredRequestInit`, `detectResponseType`) first, without regressing the synthetic eval or changing scan/classify/fix.

## Acceptance Criteria

### AC-1: Prompt discounts absence-of-static-references / dynamic-taint evidence
Given the triage `SYSTEM_PROMPT` in `src/triage/prompt.ts`
When its text is asserted by a prompt-content unit test
Then it explicitly instructs the model that absence of static references combined with an unresolvable dynamic import is the reason for the `maybe` quarantine — not evidence of death — and must be discounted.

### AC-2: The two persistent false positives are no longer called dead
Given the live real-repo (hono) corpus
When the triage runs against it
Then `RequiredRequestInit` and `detectResponseType` are no longer classified `likely-dead` (live test, auto-skips without an API key).

### AC-3: Live real-repo precision clears a raised gate
Given the live real-repo corpus and the tuned prompt
When the eval is run (2–3× for the non-deterministic model)
Then precision clears a raised floor of ≥0.70 (aspirational ≥0.85), and `PRECISION_GATE` in `test/triage-eval.live.test.ts` is lifted from 0.4 to the tuned baseline.

### AC-4: Synthetic eval does not regress
Given the synthetic live eval
When it is run with the tuned prompt
Then precision still clears ≥0.8 (no regression from the prompt change).

### AC-5: Scan/fix and core invariants unchanged
Given the existing CI suite
When `npx vitest run` and `npm run typecheck` are executed
Then scan/classify/fix behavior, the lazy-SDK isolation invariant, and code-not-diff all remain green and unchanged.

## Tasks

### T1: Prompt-content unit test (red)
- files: `test/triage-prompt.test.ts` (or nearest existing prompt test)
- action: Assert `SYSTEM_PROMPT` contains the discount instruction for absence-of-static-references + dynamic-taint. Title the test so it carries `AC-1`.
- verify: test fails before the prompt change (red)
- done: AC-1

### T2: Revise SYSTEM_PROMPT
- files: `src/triage/prompt.ts`
- action: Add explicit guidance that the "zero static references + dynamic import in scope" combination is *why* necro was uncertain, not a death signal, and must be discounted. Prompt text only.
- verify: T1 unit test passes (green)
- done: AC-1

### T3: Live-measure the two FPs + precision, iterate
- files: `src/triage/prompt.ts`
- action: Run `set -a; . ./.env; set +a; npx vitest run test/triage-eval.live.test.ts -t "real-repo"` 2–3×; confirm `RequiredRequestInit` / `detectResponseType` no longer land `likely-dead`; iterate prompt wording until precision clears ≥0.70.
- verify: live eval shows both FPs resolved and precision ≥0.70 across runs
- done: AC-2, AC-3

### T4: Raise the live regression floor + retag gates
- files: `test/triage-eval.live.test.ts`
- action: Lift `PRECISION_GATE` from 0.4 to the tuned baseline; ensure each `AC-N` appears in a (live, auto-skipping) test title so the settle gate is satisfied.
- verify: gate reflects tuned floor; AC tags present in test titles
- done: AC-3

### T5: Confirm synthetic + full CI + typecheck green
- files: (none — verification only)
- action: Run the synthetic live eval (≥0.8), full `npx vitest run`, and `npm run typecheck`.
- verify: synthetic ≥0.8, suite green, typecheck clean
- done: AC-4, AC-5

## Boundaries

- Prompt text only — DO NOT change scan, classify, fix, the corpus labels, or the SDK call path.
- DO NOT add new dependencies.
- The real-repo gate stays an auto-skipping live test — never a network call in CI.
- DO NOT regress the synthetic eval, break the code-not-diff invariant, or move LLM code onto static import paths (keep the lazy-`import()` SDK isolation).
