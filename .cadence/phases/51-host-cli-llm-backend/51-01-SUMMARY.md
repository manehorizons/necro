# SETTLE Summary — 51-01

**Completed:** 2026-07-18T22:00:35.912Z

## Acceptance Criteria

- AC-1: PASS (assertion)
- AC-2: PASS (assertion)
- AC-3: PASS (assertion)
- AC-4: PASS (assertion)

## Tasks

- T1: DONE — Added provider ("anthropic" | "host-cli", default "anthropic") and hostCliBin (default "claude") to LlmOptions/DEFAULT_LLM; loadConfig's existing spread-merge already threads them through. 14/14 config.test.ts tests pass incl. new AC-3 test; tsc --noEmit clean.
- T2: DONE — Implemented src/llm/host-cli-client.ts: hostCliStructuredCall<T> spawns `claude -p --output-format json`, embeds the schema as a prompt instruction (no API-level structured-output constraint available headlessly), enforces a 3-min timeout with SIGKILL, guards against self-invocation via CLAUDECODE=1, and surfaces typed HostCliError reasons (not-found/spawn-error/nonzero-exit/output-error/timeout/self-invocation). Loosened SpawnedProcessLike's stdout/stderr type to a minimal on("data",...) interface so tests use a bare EventEmitter fake instead of a full ReadableStream. 7/7 new tests pass (stubbed spawn only, no real binary); tsc clean.
- T3: DONE — createTriageClient/createRefactorClient now branch on llm.provider === "host-cli", routing classify/propose/proposeDuplicate through hostCliStructuredCall (skipping resolveApiKey/MissingApiKeyError/lazyAnthropic entirely) instead of duplicating logic per client. Anthropic-path branch untouched. Added host-cli-branch tests (no-key-no-throw, routes through stubbed hostCliStructuredCall not the SDK, anthropic default unaffected) to both triage-client.test.ts and refactor-client.test.ts. Full suite: 709 passed, 6 skipped, 0 failures; tsc clean.
- T4: DONE — necro triage/refactor CLI already load config.llm via loadConfig() and thread it through, so provider: "host-cli" works there with zero further changes (confirmed by reading cli.ts). The bench harness (src/bench/cli-bench.ts) hardcoded DEFAULT_LLM and never read config, so added --provider/--host-cli-bin flags there to actually make the live-eval path selectable (this was a genuine gap, not covered by T1-T3 alone). Documented llm.provider/llm.hostCliBin in website/src/content/docs/reference/configuration.md. Also updated a stale memory (cadence-host-cli-verifier-gap) whose index line still said "not yet released" — confirmed installed cadence-core 1.47.0 matches npm's latest and already includes the fix. Full suite: 711 passed, 6 skipped, 0 failures; tsc clean.

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: skipped — boundaryEnforcement is not "block"
- build-test-must-pass: skipped — no test command configured — build-test-must-pass cannot verify your tests ran; this settle will NOT confirm the suite passes. Set verification.testCommand in .cadence/config.json to enable real enforcement.
- test-coverage: ran
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: ran
- code-review: ran
- security-audit: skipped — not in the active tier × profile gate set

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
