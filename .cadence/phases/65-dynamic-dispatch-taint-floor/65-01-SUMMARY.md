# SETTLE Summary — 65-01

**Completed:** 2026-07-21T02:41:24.447Z

## Acceptance Criteria

- AC-1: FAIL (assertion) — reverted — repo-wide+directory scoping both failed real-corpus accuracy floors, see DRAFT parked note
- AC-2: FAIL (assertion) — reverted — same reason as AC-1
- AC-3: FAIL (assertion) — reverted — same reason as AC-1
- AC-4: FAIL (assertion) — reverted — same reason as AC-1

## Tasks

- T1: BLOCKED — Implemented exactly as specified (reachability.ts: tainted = same-file taint OR (any tainted file exists in repo AND node.exported)). Empirically confirmed against the real corpus: precision on python-realrepo-accuracy-gate.test.ts crashed from a passing baseline to 0.000 (PRECISION_FLOOR is 0.85), and scan-python-reachability.test.ts's dead_exported fixture flipped likely->maybe. Root cause: real-world repos routinely have at least one file with unresolvable dynamic dispatch (getattr/importlib/star-import/eval) somewhere, so the repo-wide 'any taint anywhere caps every exported symbol' rule is far too blunt in practice, not just in theory. Confirmed by reverting (git stash) — both tests pass cleanly at baseline. Blocking on user decision: scope down (per-package/per-directory taint radius instead of whole-repo?), or abandon (b) for the narrower (a)/(c) options from rec-20260719-004.

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: skipped — boundaryEnforcement is not "block"
- build-test-must-pass: skipped — no test command configured — build-test-must-pass cannot verify your tests ran; this settle will NOT confirm the suite passes. Set verification.testCommand in .cadence/config.json to enable real enforcement.
- test-coverage: ran
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: skipped — not requested (no --deep / --interactive, not in gate set)
- code-review: skipped — not in the active tier × profile gate set
- security-audit: skipped — not in the active tier × profile gate set

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
