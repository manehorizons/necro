---
phase: 27-explain-narrate
id: 27-27
tier: standard
status: PENDING
---

# 27-27 — explain --narrate: LLM narrative layer over the deterministic reachability verdict

## Objective

Add an **additive** `--narrate` layer to `necro explain` (CLI flag + `narrate` param on `necro_explain`) that translates the *already-decided* deterministic verdict + witness chain into a plain-English "why", without ever re-deriving reachability — and degrades silently to the static trace when no API key or the LLM is unavailable.

## Acceptance Criteria

### AC-1: Narrative is a pure function of the resolved verdict
Given a resolved `ExplainResult` (alive / test-only / dead) and its source snippets
When the narrate engine runs with an injected `NarrateClient`
Then it builds the prompt from the verdict + witness/inbound + snippets (never from raw reachability inputs) and attaches `narrative` prose to the result; a non-resolved result (not-found / ambiguous) yields `narrative: null`.

### AC-2: --narrate degrades silently when the LLM is unavailable
Given `--narrate` requested but no API key (or the client throws)
When `explain` runs
Then the deterministic trace still renders in full, `narrative` is `null`, a one-line note goes to stderr, and the command's exit code is unchanged from the non-narrated run.

### AC-3: CLI --narrate renders prose and carries it in --json
Given `necro explain <symbol> --narrate` over a resolved symbol
When it runs with and without `--json`
Then the human output appends a `Why:` block after the static trace, `--json` includes a `narrative` field, and (no key) the degradation path of AC-2 holds at the CLI.

### AC-4: necro_explain narrate param returns prose via an injected client
Given the `necro_explain` MCP tool called with `narrate: true` and an injected `narrateClientFactory`
When the symbol resolves
Then the returned JSON includes the `narrative` prose; with `narrate` false/absent the result is byte-identical to today's (no LLM call).

## Tasks

### T1: Narrate prompt builder
- files: `src/explain/prompt.ts` (new)
- action: Pure `buildNarratePrompt(result, snippets): { system, user }`. System fixes the role ("explain this *given* verdict; do not re-judge reachability"); user embeds the verdict, reachability, witness chain / inbound referrers, and the small source snippets. No SDK import.
- verify: unit test asserts the prompt contains the verdict + chain names + snippet text and the "do not re-judge" guard.
- done: AC-1

### T2: Narrate client (injectable, reuses triage scaffolding)
- files: `src/explain/client.ts` (new)
- action: `NarrateClient { narrate(prompt): Promise<string> }` + `createNarrateClient(llm: LlmOptions)` reusing `lazyAnthropic` / `resolveApiKey` / `MissingApiKeyError` from `src/triage/client.js`. `messages.create({ model: llm.model, max_tokens, system, messages })`, return the text block.
- verify: unit test — missing key throws `MissingApiKeyError` before any SDK import; a memoized fake returns text.
- done: AC-1

### T3: Wire narrative into the explain engine
- files: `src/engine/explain.ts`
- action: `explain(targetPath, config, query, opts?: { narrate?: NarrateClient })`. Add optional `narrative?: string | null` to the resolved `ExplainResult`. When `opts.narrate` is set and the result is resolved, build snippets from `model.sources` (the symbol + witness/referrer lines), call `buildNarratePrompt` + `client.narrate`, attach prose; on client error, attach `null` (never throw). Non-resolved → untouched.
- verify: engine test with a fake client — resolved→prose; not-found→null; client throws→null.
- done: AC-1, AC-2

### T4: CLI --narrate flag + renderer
- files: `src/cli.ts`, `src/report/explain.ts`
- action: Add `--narrate` to the explain command; build `createNarrateClient(llm)` from config, catching `MissingApiKeyError` → stderr note + run without narrate. Pass the client into `explain`. Extend `renderExplain` to append a `Why:\n<prose>` block when `narrative` is present; `--json` already serializes the field.
- verify: CLI test (built binary) — `--narrate` with no key still prints the static trace, exit unchanged, stderr carries the note; `--json` shape includes `narrative: null` on the degraded path.
- done: AC-2, AC-3

### T5: MCP narrate param + injectable factory
- files: `src/mcp/tools/explain.ts`, `src/mcp/server.ts`
- action: Add `narrate?: boolean` to `necro_explain` input; add `narrateClientFactory?: (llm) => NarrateClient` to `ServerDeps`. When `narrate` is true, construct the client (factory or `createNarrateClient`), catching `MissingApiKeyError` → degrade. Pass into `explain`. Default path (no narrate) makes no LLM call.
- verify: MCP test with an injected fake factory — `narrate:true` → narrative in JSON; `narrate` absent → no narrative, no client construction.
- done: AC-4

## Boundaries

- DO NOT let the LLM re-derive or override reachability — `narrate` consumes the deterministic verdict only; the static trace is computed first and is the source of truth.
- DO NOT make `--narrate` failure fatal — missing key or LLM error degrades to the static trace with `narrative: null`, never a non-zero exit beyond what the static result already implies.
- DO NOT pull `@anthropic-ai/sdk` into the non-narrated path — reuse the lazy dynamic-import factory so `scan`/`fix`/plain `explain` never load the SDK.
- DO NOT fork the deterministic explain logic or change its existing output when `narrate` is off (byte-identical).
- DO NOT add new LLM config — reuse the existing `llm` (`model`, `apiKey`) options and `resolveApiKey` precedence.
