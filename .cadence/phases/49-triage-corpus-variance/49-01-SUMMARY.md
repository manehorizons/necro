# SETTLE Summary — 49-01

**Completed:** 2026-07-18T19:33:32.512Z

## Acceptance Criteria

- AC-1: FAIL (assertion) — met the >=30 count target but not the >=3-repos requirement; 4 attempted repos all dead-ended for documented reasons (SOURCES.md)
- AC-2: PASS (assertion) — TriageMetrics.variance + N-run summarizeTriage implemented and unit-tested; runBench runs triage eval 3x by default
- AC-3: FAIL (assertion) — gate floor re-derivation requires a live run against ANTHROPIC_API_KEY, unavailable this session; rec-20260718-003 filed as durable fix

## Tasks

- T1: BLOCKED — Grew dead-positive corpus from 15→30 cases (trpc/trpc: mined 15 new hand-verified test-local-helper dead cases via necro's testOnlyEvidence signal, using `necro scan --json .` since the documented `--json packages` command now returns EMPTY — rec-20260718-002). Meets AC-1's ≥30 count target but not its ≥3-repos clause: 4 attempts at a genuinely new 3rd repo (zod, fastify, h3 x2) all dead-ended for mechanistically-traced reasons documented in SOURCES.md's "Attempted 3rd repos" section — the qualifying trait (unexported, test-file-local helper functions, as opposed to a library's own ambiguous public API) is narrower than expected and repo-unpredictable without scanning. cases.json 48→63, triage-eval-capture.test.ts passes. Continuing to T2-T4 (bench variance) since they depend on "the grown corpus" existing, not the exact repo count.
- T2: DONE — Added MinMeanMax + TriageMetrics.variance (optional, additive) to src/bench/snapshot.ts; summarizeTriage now accepts a single run or an array of N runs, deriving mean top-level precision/recall/f1/TP/FP/FN plus min/mean/max variance when N>1. methodologyVersion widened to 1|2. Unit tests added (bench-snapshot.test.ts): single-run and 1-element-array omit variance, N-run array aggregates correctly. Full suite green (116 files, 695 passed/6 skipped).
- T3: DONE_WITH_CONCERNS — runBench now runs the triage live eval N times (default 3, opts.triageRuns override) and aggregates via the updated summarizeTriage; methodologyVersion bumped to 2. No CLI flag changes needed — `npm run bench` already picks up the new default. Verified via stub-client tests in bench-run.test.ts (varying-verdict stub proves min<mean<max aggregation; triageRuns=1 proves variance is omitted). NOT verified live: actually running `npm run bench -- --corpus triage` to write the real bench/results.json artifact requires ANTHROPIC_API_KEY, unavailable in this session (no host-cli passthrough exists in necro's triage/refactor clients — checked src/triage/client.ts, it calls the Anthropic SDK directly via resolveApiKey). Filing a recommendation to add a host-cli LLM backend (mirroring cadence-core's own host-cli provider for verifier/codeReview/etc.) as a durable fix for this and future live-eval blockers.
- T4: BLOCKED — Re-deriving PRECISION_GATE/RECALL_GATE from live observed minima requires actually running the live triage gate against the grown corpus + new multi-run bench path, which needs ANTHROPIC_API_KEY (unavailable this session). Filed rec-20260718-003 to add a host-cli LLM backend to necro (mirroring cadence-core's own host-cli provider pattern) as the durable fix; alternatively resume with a real API key. Blocked, not attempted.

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: skipped — boundaryEnforcement is not "block"
- build-test-must-pass: skipped — no test command configured — build-test-must-pass cannot verify your tests ran; this settle will NOT confirm the suite passes. Set verification.testCommand in .cadence/config.json to enable real enforcement.
- test-coverage: skipped — bypassed via --allow-missing-coverage
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: skipped — not requested (no --deep / --interactive, not in gate set)
- code-review: skipped — not in the active tier × profile gate set
- security-audit: skipped — not in the active tier × profile gate set

## Gate bypasses

- WARN test-coverage via --allow-missing-coverage: test-coverage gate bypassed via --allow-missing-coverage

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
