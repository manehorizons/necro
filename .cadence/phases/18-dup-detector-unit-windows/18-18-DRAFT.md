---
phase: 18-dup-detector-unit-windows
id: 18-18
tier: complex
status: PENDING
---

# 18-18 — Clamp findClones windows to FunctionUnit boundaries

## Objective

Make `findClones` never emit a clone window that straddles a function boundary —
each reported match lies entirely within one `FunctionUnit` (or wholly in
module-level code) on every side — eliminating the oversized cross-function
windows that phases 16–17 had to curate the eval corpus *around*.

## Acceptance Criteria

### AC-1: Cross-function matches are split at the boundary
Given two adjacent functions whose token streams share a ≥`minTokens` run that
continues across the boundary between them
When `findClones` runs with unit boundaries supplied
Then no single reported window spans both functions — the straddling run is
clamped so each location stays within one unit's line range (greedy extension
stops at the boundary; a window is never *started* straddling one).

### AC-2: Within-function clones still detected (no regression)
Given the existing `test/duplication.test.ts` cases (intra- and inter-file
genuine clones of ≥`minTokens`)
When `findClones` runs
Then every existing clone is still reported with the same token length and
locations — boundary clamping changes nothing when no boundary is crossed, and
the call works with boundaries omitted (back-compat for the fragment path).

### AC-3: Real-repo dup eval holds at gate 0.7 (live, no regression)
Given the production engine path threads the already-computed `units` into
`findClones` and the real-repo duplication eval (gate 0.7, billable)
When the live `12-case corpus` test runs ≥3 times
Then the pass-rate stays ≥0.7 — the boundary fix does not regress real-repo
detection; the gate is the regression check, NOT a tuning target.

### AC-4: Fragment residual path unaffected
Given `refactor/eval.ts` calls `findClones` on per-edit `replacement` fragments
with no unit information
When residual-clone scoring runs
Then it behaves exactly as before (each fragment treated as a single implicit
unit / boundaries absent), so `collapsesDuplication` verdicts are unchanged.

## Tasks

### T1: Add optional unit-boundary input + per-token unit assignment
- files: `src/syntactic/duplication.ts`, `src/syntactic/types.ts`
- action: extend `FileTokens` with optional `units?: { startLine: number; endLine: number }[]`.
  Precompute a per-token unit id by mapping each token's `line` to its
  innermost-enclosing unit range (smallest range containing the line; `-1` when
  none / module-level). When `units` is omitted, all tokens share unit id `-1`
  (single implicit unit → today's behaviour).
- verify: unit test that a fragment with no `units` yields one implicit unit
- done: AC-2, AC-4

### T2: Forbid windows from crossing a unit boundary
- files: `src/syntactic/duplication.ts`
- action: in the window-build loop, skip indexing a start window `[i, i+W)`
  whose tokens are not all in one unit; in the greedy-extend loop, stop when the
  next token's unit id differs from the window-start unit id (on the self
  position — group members already share the run by token equality, but assert
  per-member unit consistency too).
- verify: AC-1 synthetic boundary test (two adjacent fns sharing a straddling run)
- done: AC-1

### T3: Thread units through the production engine call site
- files: `src/engine/index.ts`
- action: pass the already-computed `units` (grouped per file) into the
  `fileTokens` entries handed to `findClones`. Leave `refactor/eval.ts`
  unit-less (fragments → implicit single unit).
- verify: `npx vitest run` green (non-live); engine duplication output unchanged on within-fn cases
- done: AC-1, AC-4

### T4: Synthetic boundary tests + live real-repo regression gate
- files: `test/duplication.test.ts`, `test/refactor-eval.live.test.ts`
- action: add AC-1/AC-2 synthetic cases; re-run the live `12-case corpus` dup
  gate (0.7) ≥3 times and record pass-rate honestly. Tag each test title with
  its AC id (settle AC↔test gate).
- verify: synthetic green; live pass-rate ≥0.7 across ≥3 runs
- done: AC-1, AC-2, AC-3

## Boundaries

- DO NOT touch `DUP_SYSTEM_PROMPT` or the model-facing `runExtractDuplicate`
  prompt — this phase is detector-only; the model contract is unchanged.
- DO NOT change `evaluateDuplicateProposal` / `COLLAPSE_RATIO` or retire any
  curated corpus case from phases 16–17 — the detector fix *enables* future
  corpus simplification, but that is a separate phase.
- DO NOT treat the 0.7 live gate as a target to optimize toward — it is the
  regression check; recalibrate only if honestly justified across ≥3 runs.
- Keep the rolling-hash + greedy-extend algorithm intact — only *constrain* it
  by unit boundaries; do not rewrite the matching strategy.
- Token granularity stays line-level; clones that share a source line with a
  boundary (rare post-format `} function f(){`) may clamp coarsely — acceptable.
