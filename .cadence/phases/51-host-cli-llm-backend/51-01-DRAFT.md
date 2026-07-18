---
phase: 51-host-cli-llm-backend
id: 51-01
tier: complex
status: PENDING
---

# 51-01 — Host-cli LLM backend for triage/refactor clients

## Objective

Add a `host-cli` provider mode alongside the existing direct-Anthropic-SDK path so `createTriageClient`/`createRefactorClient` can run inside an authenticated Claude Code session (or any environment with an authenticated `claude` binary on PATH) with no `ANTHROPIC_API_KEY`, unblocking phase 49's live-eval/bench work.

## Acceptance Criteria

### AC-1: host-cli provider produces valid triage/refactor results with no API key set
Given `llm.provider` is `"host-cli"`, `ANTHROPIC_API_KEY` is unset, and an authenticated `claude` binary is on PATH
When `createTriageClient(llm).classify(prompt)` or `createRefactorClient(llm).propose(prompt)` is called
Then it spawns `claude -p <prompt> --output-format json` headlessly, extracts the JSON envelope's `result` text, and returns the same `TriageResult`/`ProposalResult` shape the `anthropic` provider returns today — no `MissingApiKeyError` is thrown.

### AC-2: Loud, actionable failure — never a silent fallback or hang
Given `llm.provider` is `"host-cli"` but the configured binary is missing from PATH, the process exits non-zero, or the subprocess never closes stdout
When a `classify`/`propose`/`proposeDuplicate` call is made
Then it rejects with a typed, descriptive error (naming the failure reason: not-found / nonzero-exit / output-error / timeout) within a bounded timeout — never hangs waiting on interactive auth, never silently returns an empty/default result.

### AC-3: Selectable via config without changing existing default behavior
Given a `necro.config.json` with `llm.provider` unset or explicitly `"anthropic"`
When `createTriageClient`/`createRefactorClient` build a client
Then behavior is byte-identical to today (direct Anthropic SDK path, `resolveApiKey`/`MissingApiKeyError` semantics unchanged) — `host-cli` is strictly additive.

### AC-4: Shared transport, not duplicated per client
Given both `TriageClient` and `RefactorClient` need the host-cli path
When the host-cli transport is implemented
Then it lives once in `src/llm/` (mirroring `structuredCall`'s existing shared-helper pattern) and both clients call into it — no copy-pasted spawn/parse logic between `triage/client.ts` and `refactor/client.ts`.

## Tasks

### T1: Add `provider`/`hostCliBin` to `LlmOptions`
- files: `src/config.ts`, `test/config.test.ts`
- action: add `provider?: "anthropic" | "host-cli"` (default `"anthropic"`, applied in `DEFAULT_LLM`) and `hostCliBin?: string` (default `"claude"`) to `LlmOptions`/`RawConfig`; thread through `loadConfig`'s merge the same way `apiKey` is today
- verify: existing config tests pass; a new test confirms a config with `llm.provider: "host-cli"` and `llm.hostCliBin` parses and merges correctly, and an unset `provider` defaults to `"anthropic"`
- done: AC-3

### T2: Implement the host-cli spawn transport
- files: `src/llm/host-cli-client.ts`, `test/llm-host-cli-client.test.ts`
- action: implement `hostCliStructuredCall<T>(opts)` mirroring `structuredCall`'s signature (`system`, `user`, `schema`, `parse`, returns `{ result, usage }`) but spawning `<bin> -p <prompt> --output-format json` (claude family only — see Boundaries) via an injectable `spawnImpl` test seam, capturing stdout/stderr, enforcing a timeout (kill + reject on expiry, never hang), and parsing the JSON envelope's `result` field into `parse()`'s input the same way `structuredCall` extracts a text block today. Include the `CLAUDECODE=1` self-invocation guard from cadence-core's precedent (`/home/thomas/projects/cadence/packages/core/src/verify/host-cli-client.ts`) so a `necro` process already running inside a headless Claude Code session refuses to spawn a nested one. Usage accounting is best-effort: read `usage` off the envelope if present, else report `{ inputTokens: 0, outputTokens: 0 }` — do not fail the call over missing usage data.
- verify: unit tests exercise `host-cli-client.ts` against a stubbed spawn (success envelope, non-zero exit, malformed JSON, timeout, self-invocation-guard) — no real `claude` binary is invoked by the suite
- done: AC-1, AC-2, AC-4

### T3: Wire `createTriageClient`/`createRefactorClient` to branch on `llm.provider`
- files: `src/triage/client.ts`, `src/refactor/client.ts`, `test/triage-client.test.ts`, `test/refactor-client.test.ts`
- action: when `llm.provider === "host-cli"`, skip `resolveApiKey`/`MissingApiKeyError`/`lazyAnthropic` entirely and route `classify`/`propose`/`proposeDuplicate` through T2's `hostCliStructuredCall`, passing each existing `schema`/`parse` pair unchanged; the `anthropic` branch (default) is untouched
- depends: T1, T2
- verify: existing anthropic-path tests pass unmodified; new tests confirm `provider: "host-cli"` builds a client that calls the T2 transport (stubbed) instead of throwing `MissingApiKeyError` with no API key set
- done: AC-1, AC-3

### T4: Bench harness + docs
- files: `src/bench/cli-bench.ts`, `README.md` or `docs/` config reference
- action: confirm `runBench` (or its config plumbing) can select `provider: "host-cli"` for a live run without code changes beyond what T1-T3 provide; document the new `llm.provider`/`llm.hostCliBin` config fields and the host-cli path's scope/limitations (claude-family only, best-effort usage accounting, requires an authenticated `claude` binary on PATH)
- depends: T3
- verify: `npm run bench -- --provider host-cli` (or equivalent config-driven invocation) is documented and does not require code changes to work once config is set; docs accurately describe the new fields
- done: AC-1

## Boundaries

- DO NOT implement `codex` family support in this slice — `claude` only. The rec and phase 49's blocker are both scoped to a Claude Code session specifically; codex support is a separate future rec if ever needed.
- DO NOT require a real `claude` binary in the test suite — stub the subprocess transport; tests stay offline/deterministic.
- DO NOT touch `src/explain/client.ts` (the `narrate` command) in this slice — it shares `structuredCall` but is not in the rec's scope; a follow-up can extend it once this pattern is proven.
- DO NOT add a "mock" fallback concept — necro's clients have no existing mock-provider notion (unlike cadence-core's verifier gates); host-cli failures must throw actionable errors, not silently degrade to a stub result.
- DO NOT change `anthropic`-path default behavior, error messages, or existing test expectations.
- DO NOT attempt to unblock phase 49's AC-1 (corpus diversity) or AC-3 (gate re-derivation) opportunistically while working this phase — they are separate, already-documented follow-ups; AC-3 becomes unblocked naturally once this phase ships, but re-deriving the gates is out of scope here.
