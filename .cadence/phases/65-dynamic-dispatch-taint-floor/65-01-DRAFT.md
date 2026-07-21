---
phase: 65-dynamic-dispatch-taint-floor
id: 65-01
tier: standard
status: APPROVED
---

# 65-01 — Cap exported symbols at maybe when their directory has unresolvable dynamic dispatch

## PARKED — both blunt scoping strategies tried, both broke a locked floor

Two deterministic-floor variants were implemented and empirically validated against the real corpus, then reverted:

1. **Repo-wide** (any taint anywhere → every exported symbol repo-wide tainted): crashed `python-realrepo-accuracy-gate.test.ts` **precision to 0.000** (floor 0.85). Real repos routinely have unresolvable dynamic dispatch *somewhere*, so this caps nearly every exported symbol in the repo.
2. **Directory-scoped** (taint only exported siblings in the same `dirname()` as a tainted file): fixed precision, but crashed **recall to 0.462** (floor 0.5) — 7 of 13 real dead-code cases in the pip/httpie corpus got wrongly demoted to `maybe` for sharing a directory with an unrelated file's `getattr`/`importlib` usage. Python packages routinely put many unrelated files in one directory.

Both attempts are fully reverted (`src/analyze/reachability.ts`, `test/reachability.test.ts` are back at baseline — verified via `npx vitest run`, all green). No code from this phase shipped.

**Conclusion:** neither "cap the neighborhood" heuristic survives real-world Python package layouts. A real fix needs actual dynamic-dispatch *target* resolution — rec-20260719-004's option (a) (template-literal prefix resolution) or (c) (LLM-proposed candidates, existence-checked) — not a blast-radius heuristic. That's bigger than a `standard`-tier task and needs its own design pass. rec-20260719-004 has been left at `needs-decision` with this evidence recorded so a future session doesn't re-attempt the same two dead ends.

## Objective (original, not achieved by this phase)

When a file contains unresolvable dynamic dispatch, taint every exported symbol in that file's directory (not just the file itself, and not the whole repo) — so a cross-file dynamic-dispatch target in the same module/package is never misclassified as `certain` dead (rec-20260719-004, deterministic-floor option).

## Acceptance Criteria

### AC-1: taint does not cross directory boundaries
Given a repo where `findTaintedFiles` flags a file for unresolvable dynamic dispatch
When `computeReachability` runs over an exported node in a DIFFERENT directory than any tainted file
Then that node's `tainted` result stays `false` — proves the cap is directory-scoped, not repo-wide

### AC-2: an exported sibling in the tainted file's directory is tainted
Given a tainted file in directory `D`
When `computeReachability` runs over a different, exported node also in directory `D`
Then that node's `tainted` result is `true`

### AC-3: a private sibling in the tainted file's directory is unaffected
Given a tainted file in directory `D`
When `computeReachability` runs over a different, private (`exported: false`) node also in directory `D`
Then that node's `tainted` result stays `false` — the directory cap targets only exported symbols

### AC-4: a repo with zero dynamic dispatch anywhere is unaffected (regression safety)
Given `taintedFiles` is empty or omitted
When `computeReachability` runs
Then no node is tainted via the directory rule — behavior is byte-identical to pre-phase-65

## Tasks

### T1: scope taint to the tainted file's directory
- files: `src/analyze/reachability.ts`
- action: in `computeReachability`, compute `taintedDirs` as the set of `dirname(f)` for every `f` in `taintedFiles`, then set the per-node `tainted` result to `taintedFiles.has(node.file) || (node.exported && taintedDirs.has(dirname(node.file)))`. Update the `tainted` field doc comment on `ReachabilityResult` and the `taintedFiles` doc comment on `ReachabilityInput` to describe directory-scoped exported-symbol tainting (and why repo-wide was rejected).
- verify: `npm test -- reachability` (AC-1..AC-4 pass, existing same-file taint test unmodified) AND the full suite (`npx vitest run`) — `python-realrepo-accuracy-gate.test.ts` and `scan-python-reachability.test.ts` must both stay green (these are the tests that caught the repo-wide version being too blunt; they are the real regression guard for this phase, even though they're not phase-65-owned)
- done: AC-1, AC-2, AC-3, AC-4

## Boundaries

- DO NOT change `findTaintedFiles`' detection patterns or add prefix-resolution / LLM-candidate-target logic — options (a) and (c) from rec-20260719-004 are explicitly deferred to a follow-up recommendation, not this phase.
- DO NOT change `src/analyze/classify.ts` — `deadTier` already demotes any `result.tainted` node to `maybe`; no downstream change is needed for this phase's scope.
- DO NOT touch the Python-specific `certain`→`likely` tier cap in `classify.ts` — orthogonal to this change.
