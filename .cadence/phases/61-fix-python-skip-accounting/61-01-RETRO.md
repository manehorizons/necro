# Retro

## Rough tasks

- T1: BLOCKED — Premise disproven: classify.ts line 90-91 already caps every Python dead-code finding's tier away from "certain" unconditionally (AC-6, phase 45) — `tier === "certain" && isPythonFile(node.file) ? "likely" : rawTier`, and autoFixEligible is `tier === "certain"`. Empirically verified with a private (underscore-prefixed) Python symbol via a scratch fixture: tier="likely", autoFixEligible=false. Since `planRemovals`/`remove.ts` and `runFix`'s default path only ever operate on `f.autoFixEligible` findings, a Python finding can never reach `planRemovals` today. The bug rec-20260719-005 describes does not exist in the current codebase — it's already prevented upstream of the point the recommendation targeted. Not implementing T1/T2/T3 against a phantom bug.
- T2: BLOCKED — Same root cause as T1 — no fix needed since the described condition can't occur.
- T3: BLOCKED — No test written — the AC-1/AC-2 preconditions (a Python "certain" finding) are unreachable in current code, confirmed empirically.
