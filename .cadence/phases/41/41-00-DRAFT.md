---
phase: 41
id: 41-00
tier: standard
status: PENDING
---

# 41-00 — Extract src/llm/: shared client plumbing + structuredCall helper + usage reporting

## Objective

Move the SDK client plumbing (`lazyAnthropic`, `resolveApiKey`, `MissingApiKeyError`) out of `triage/client.ts` into a real shared `src/llm/client.ts`, add a `structuredCall` helper that collapses the request→text-block→parse sequence duplicated 4x across `triage`/`refactor`/`explain` clients, and thread `response.usage` through an optional `onUsage` callback so `triage` and `refactor` can report token spend on stderr.

## Acceptance Criteria

### AC-1: Shared plumbing lives in src/llm/
Given the SDK client helpers currently live in `src/triage/client.ts` but are imported by `refactor/client.ts`, `explain/client.ts`, `cli.ts`, and `mcp/tools/explain.ts`
When `src/llm/client.ts` is created
Then it exports `lazyAnthropic`, `resolveApiKey`, `MissingApiKeyError`, and `structuredCall`, and it is the only file in `src/` that performs `import("@anthropic-ai/sdk")` (dynamic) or `import type Anthropic from "@anthropic-ai/sdk"` — `triage/client.ts` no longer defines any of these three.

### AC-2: structuredCall collapses the request→text-block→parse duplication
Given the same ~15-line request/extract-text-block/JSON-parse-or-raw sequence is repeated in `triage/client.ts` (classify), `refactor/client.ts` (propose, proposeDuplicate), and `explain/client.ts` (narrate)
When `structuredCall(getClient, { model, maxTokens, system, user, schema?, thinking?, parse })` is called
Then it sends one `messages.create` request (with `output_config.format` only when `schema` is given, `thinking: { type: "adaptive" }` only when `thinking` is true), extracts the first text content block (JSON-parsed when it parses, else the raw string, else `undefined` when no text block exists), runs it through `parse`, and returns `{ result, usage: { inputTokens, outputTokens } }` from `response.usage` — and each of the four call sites in `triage/client.ts`, `refactor/client.ts`, and `explain/client.ts` is rewritten to call it instead of duplicating the sequence inline.

### AC-3: Every LLM-backed call site imports from the new location
Given `cli.ts` and `mcp/tools/explain.ts` currently import `MissingApiKeyError` from `./triage/client.js` / `../../triage/client.js`
When the extraction lands
Then both import it from `./llm/client.js` / `../../llm/client.js` instead, and `refactor/client.ts` / `explain/client.ts` import `lazyAnthropic`/`resolveApiKey`/`MissingApiKeyError` from `../llm/client.js` instead of `../triage/client.js`.

### AC-4: Token usage is observable without changing existing result shapes
Given `TriageResult`, `ProposalResult`, `DuplicateProposalResult`, and `narrate`'s return type are consumed as-is by `triage/index.ts`, `refactor/index.ts`, and `engine/explain.ts` and must not change shape
When `createTriageClient`, `createRefactorClient`, and `createNarrateClient` are called with a second, optional `{ onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void }` argument
Then each call to the model invokes `onUsage` (when given) with that call's usage from `structuredCall`, exactly once per `messages.create` request, before returning its normal (unchanged-shape) result — usage is reported on every call, including ones where `parse` produces a failure/`unsure` result.

### AC-5: CLI reports aggregate token spend for triage and refactor
Given `necro triage` and `necro refactor` currently give no visibility into API spend (relevant because `llm.maxFindings` is uncapped by default)
When either command's `action` handler runs
Then it wires `onUsage` to accumulate a running `{ inputTokens, outputTokens }` total across every call made during that invocation, and prints one summary line (e.g. `tokens: <in> in / <out> out`) to stderr after the command's normal report output — the JSON output mode (`--json`) is unchanged (usage line still goes to stderr, not mixed into the JSON on stdout).

### AC-6: Full verification stays green
Given the offline-guard and SDK-isolation tests (`test/triage-client.test.ts`, `test/refactor-client.test.ts`, `test/explain-narrate-client.test.ts`) assert exact file locations for the SDK-import invariant
When the extraction lands
Then those tests are updated to assert against `src/llm/client.ts` (the new sole SDK-import site) instead of `src/triage/client.ts` / `src/refactor/client.ts`, new tests cover `structuredCall` (schema-based JSON parse, malformed-JSON-falls-back-to-raw-text, missing-text-block, usage always returned) and the `onUsage` callback firing on each client, and `npm run build && npm run typecheck && npm test` all pass.

## Tasks

### T1: Create src/llm/client.ts with structuredCall + moved plumbing
- files: `src/llm/client.ts` (new), `test/llm-client.test.ts` (new)
- action: Create `src/llm/client.ts`. Move `MissingApiKeyError`, `lazyAnthropic`, `resolveApiKey` from `src/triage/client.ts` verbatim (same behavior/messages). Add `structuredCall<T>(getClient, { model, maxTokens, system, user, schema?, thinking?, parse }): Promise<{ result: T; usage: { inputTokens: number; outputTokens: number } }>` per AC-2 (schema→`output_config.format`, thinking→`thinking: { type: "adaptive" }`, text block found via `res.content.find(b => b.type === "text")`, JSON.parse-or-raw via a local `jsonOrText` helper, usage from `res.usage.input_tokens`/`output_tokens`). Write red tests first: mock the Anthropic client shape (`{ messages: { create: vi.fn() } }`) and cover: schema-based JSON response is parsed and passed to `parse`; malformed JSON text falls back to the raw string passed to `parse`; no text block passes `undefined` to `parse`; `usage` is always returned regardless of parse outcome; `schema`/`thinking` omitted → request body omits `output_config`/`thinking` keys.
- verify: `npx vitest run test/llm-client.test.ts`
- done: AC-1, AC-2

### T2: Rewire triage/client.ts onto src/llm/client.ts
- files: `src/triage/client.ts`, `test/triage-client.test.ts`
- action: Remove the moved plumbing from `src/triage/client.ts`; import `lazyAnthropic`, `resolveApiKey`, `MissingApiKeyError`, `structuredCall` from `../llm/client.js`. Add a second `opts: { onUsage?: (usage) => void }` param to `createTriageClient`. Rewrite `classify()` to call `structuredCall(getClient, { model: llm.model, maxTokens: MAX_TOKENS, thinking: true, schema: VERDICT_SCHEMA, system: prompt.system, user: prompt.user, parse: parseVerdict })`, call `opts.onUsage?.(usage)`, and return `result` (the plain `TriageResult` — unchanged shape). Update `test/triage-client.test.ts`'s SDK-isolation tests to read `src/llm/client.ts` (not `src/triage/client.ts`) for the dynamic-import assertion, and add a test that `onUsage` fires with the mocked response's usage.
- verify: `npx vitest run test/triage-client.test.ts`
- done: AC-2, AC-3, AC-4, AC-6

### T3: Rewire refactor/client.ts onto src/llm/client.ts
- files: `src/refactor/client.ts`, `test/refactor-client.test.ts`
- action: Change the import from `../triage/client.js` to `../llm/client.js`. Add the same `opts: { onUsage? }` second param to `createRefactorClient`. Rewrite `propose()` (schema: `PROPOSAL_SCHEMA`, parse: `parseProposal`) and `proposeDuplicate()` (schema: `DUP_PROPOSAL_SCHEMA`, parse: `(raw) => parseDuplicateProposal(raw, finding)`) to call `structuredCall` with `thinking: true`, call `opts.onUsage?.(usage)` in both, and return `result` unchanged. Delete the now-unused local `jsonOrText` helper (moved into `llm/client.ts`). Update `test/refactor-client.test.ts`'s SDK-isolation test to assert `src/refactor/client.ts` has no static/dynamic `@anthropic-ai/sdk` import at all (plumbing lives elsewhere now) and add an `onUsage` test for both `propose` and `proposeDuplicate`.
- verify: `npx vitest run test/refactor-client.test.ts test/refactor-duplicate.test.ts`
- done: AC-2, AC-3, AC-4, AC-6

### T4: Rewire explain/client.ts onto src/llm/client.ts
- files: `src/explain/client.ts`, `test/explain-narrate-client.test.ts`
- action: Change the import from `../triage/client.js` to `../llm/client.js`. Add the `opts: { onUsage? }` second param to `createNarrateClient`. Rewrite `narrate()` to call `structuredCall` with no `schema`, no `thinking`, `parse: (raw) => (typeof raw === "string" ? raw.trim() : "")` (matches current `text.text.trim()` / `""` fallback behavior), call `opts.onUsage?.(usage)`, and return `result` (still `Promise<string>` — unchanged shape). Update `test/explain-narrate-client.test.ts` to import `MissingApiKeyError` from `../src/llm/client.js`, and add an `onUsage` test.
- verify: `npx vitest run test/explain-narrate-client.test.ts test/explain-narrate.test.ts`
- done: AC-2, AC-3, AC-4, AC-6

### T5: Update cli.ts and mcp/tools/explain.ts; wire CLI usage reporting
- files: `src/cli.ts`, `src/mcp/tools/explain.ts`, `test/mcp-explain-narrate.test.ts`
- action: In `cli.ts`, change both `MissingApiKeyError` imports (the top-level one at line ~19 and the dynamic one inside the `triage`/`refactor` actions) to `./llm/client.js`. In the `triage` action, create a running `{ inputTokens: 0, outputTokens: 0 }` total, pass `{ onUsage: (u) => { total.inputTokens += u.inputTokens; total.outputTokens += u.outputTokens } }` as the second arg to `createTriageClient`, and after the existing `console.log(...)` report line add `console.error(\`tokens: ${total.inputTokens} in / ${total.outputTokens} out\`)` (only if at least one call was made, i.e. `client` was constructed and triage actually ran). Do the same in the `refactor` action for `createRefactorClient`. In `src/mcp/tools/explain.ts`, change the `MissingApiKeyError` import to `../../llm/client.js`. Update `test/mcp-explain-narrate.test.ts` if it references the old import path.
- verify: `npx vitest run test/mcp-explain-narrate.test.ts && npm run build`
- done: AC-3, AC-5

### T6: Full regression pass
- files: (none — verification only)
- action: Run the full build/typecheck/test pipeline and confirm no stray `src/triage/client.js` imports of the moved symbols remain anywhere (`grep -rn "triage/client" src`).
- verify: `npm run build && npm run typecheck && npm test`
- done: AC-6

## Boundaries

- DO NOT add a backwards-compat re-export of the moved helpers from `src/triage/client.ts` — every import site is updated directly (small, known set: T2–T5's files).
- DO NOT change the shape of `TriageResult`, `ProposalResult`, `DuplicateProposalResult`, or `narrate`'s `Promise<string>` return — usage travels only through the new `onUsage` callback.
- DO NOT print the token-usage summary line to stdout or mix it into `--json` output — stderr only, per AC-5.
- DO NOT touch `explain`'s non-`--narrate` path, `scan`, or `fix` — they must still never pull in `@anthropic-ai/sdk`.
- DO NOT add a printed usage summary for `explain --narrate` — out of scope per the approved SPEC's constraints (no spend-cap analog for narrate).
