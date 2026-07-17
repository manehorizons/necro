# SETTLE Summary — 40-00

**Completed:** 2026-07-17T03:10:23.551Z

## Acceptance Criteria

- AC-1: PASS (assertion)
- AC-2: PASS (assertion)
- AC-3: PASS (assertion)

## Tasks

- T1: DONE — Wired verifyRemovals' existing onProgress(symbol, index, total) hook to extra.sendNotification({method:"notifications/progress",...}) in src/mcp/tools/verify-removal.ts, gated on extra._meta?.progressToken being defined. Added duration-hint clause to the tool description. Two new tests in test/mcp-verify-removal.test.ts (AC-1): positive case asserts 2 progress notifications with correct progress/total/message via client.callTool(..., {onprogress}); negative case asserts no protocol onerror when the caller doesn't opt in. Confirmed red before the fix, green after. Full suite: 478 passed.
- T2: DONE — Added resolveConfigDir(target) to src/config.ts (directory passthrough, dirname for file/nonexistent target). Wired it into loadConfig() calls in scan.ts, verify-removal.ts, explain.ts (all previously used loadConfig(process.cwd())). Updated mcp-server.test.ts's golden-equality expectation and mcp-explain.test.ts's stale comment to loadConfig(dir). Added AC-2 regression tests to test/config.test.ts (3 unit tests), test/mcp-server.test.ts, test/mcp-verify-removal.test.ts, test/mcp-explain.test.ts (each proves a target-local necro.config.json ignore rule takes effect where server cwd's config would not). Confirmed all 6 new/changed assertions red before the fix, green after. Full suite: 484 passed.
- T3: DONE — Added duration-hint clause to necro_verify's description (verify-removal's was already added during T1). Added a `claude mcp add necro -- npx -y @manehorizons/necro mcp` one-liner to README.md's MCP section alongside the existing JSON registration block. New tests: mcp-server.test.ts (necro_verify description hint, README content check), mcp-verify-removal.test.ts (necro_verify_removal description hint, tagging AC-3 on the T1-added text). Confirmed both new failing assertions red before the fix, green after. Build clean, full suite: 487 passed.

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
