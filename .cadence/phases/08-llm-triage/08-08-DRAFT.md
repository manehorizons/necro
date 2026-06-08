---
phase: 08-llm-triage
id: 08-08
tier: standard
status: PENDING
---

# 08-08 — LLM triage of maybe-dead findings

## Objective

Add an opt-in `necro triage` command that sends each quarantined `maybe`
dead-code finding — plus a re-read source snippet and its evidence chain — to
Claude (`claude-opus-4-8`, adaptive thinking) and annotates it with an
**advisory** verdict (`likely-dead` / `likely-alive` / `unsure`) and reasoning.
Triage never changes a finding's tier and never makes anything auto-fix-eligible;
`scan`/`fix` stay local, free, and network-free (SDK lazy-imported only inside
`triage`). Quality is held to a hand-labeled reference dataset via an eval
harness with an accuracy gate. Open-question defaults adopted: an
`llm.maxFindings` spend cap (response caching deferred), synthetic hand-labeled
fixtures, and one request per finding with bounded concurrency.

## Acceptance Criteria

### AC-1: `triage` targets only the `maybe` tier
Given a scan that produces `certain`, `likely`, and `maybe` findings
When `necro triage <path>` runs
Then it sends only the `maybe`-tier findings to the LLM (one logical triage per finding); `certain` and `likely` findings are never sent, and a project with zero `maybe` findings makes no API calls and reports nothing to triage.

### AC-2: Source snippet is re-read and supplied as context
Given a `maybe` finding carrying `{ file, line, name }` but no code snippet
When the finding is prepared for the LLM
Then the triage step re-reads `file`, extracts a bounded snippet around `line` (the enclosing declaration, or a ±N-line window when that can't be determined), and the request payload contains the snippet, the symbol name/location, and the finding's evidence chain.

### AC-3: Structured advisory verdict
Given the LLM responds for one finding
When the response is parsed
Then it yields a structured `{ verdict: "likely-dead" | "likely-alive" | "unsure", reasoning: string }` validated against a schema (structured outputs); a malformed/unparseable response is treated as `unsure` with the failure recorded, not crashed.

### AC-4: Advisory only — no tier change, no fix-eligibility
Given any triage verdict (including `likely-dead`)
When triage completes
Then the finding's `tier` and `autoFixEligible` are unchanged (a `maybe` stays `maybe`, `autoFixEligible` stays `false`); the verdict is attached as an annotation only, and a subsequent `necro fix` removes nothing that triage touched.

### AC-5: API-key handling and offline safety
Given `necro triage` is invoked
When no API key is available (`ANTHROPIC_API_KEY` env, or an optional `llm.apiKey` config override)
Then triage exits with a clear, actionable message and a non-zero code **before** any network call; and `necro scan` / `necro fix` run with no API key present and never import the SDK (verified — the SDK is lazy-imported only on the triage path).

### AC-6: Triage a prior scan and surface results
Given a path (re-scan) or `--json <file>` from a prior `necro scan --json`
When `necro triage` runs
Then it prints each triaged finding with its verdict and reasoning (worst-first: `likely-dead` before `unsure` before `likely-alive`), and `--json` emits the findings with a `triage: { verdict, reasoning, model }` field attached; scan/fix JSON output is unchanged.

### AC-7: Reference dataset + eval harness with accuracy gate
Given a hand-labeled reference set of `maybe`-style findings with ground-truth labels (dead / alive)
When the eval harness runs against it
Then it reports precision and recall for the `likely-dead` verdict and fails if either falls below the configured threshold; unit tests drive triage against a **mocked** SDK (deterministic, no live API calls in CI), and the harness is documented as runnable separately against the live API.

## Tasks

### T1: LLM config block
- files: `src/config.ts`, `test/config.test.ts`
- action: Extend `NecroConfig` with an optional `llm` block (`{ model?, apiKey?, maxFindings?, snippetRadius? }`); `loadConfig` reads it from CWD `necro.config.json` with defaults (`model: "claude-opus-4-8"`, `snippetRadius: 20`, `maxFindings` unset = no cap). All fields optional; existing config behavior unchanged.
- verify: `npx vitest run test/config.test.ts` — defaults applied when absent; user values override.
- done: AC-5

### T2: Source snippet extraction
- files: `src/triage/snippet.ts`, `test/triage-snippet.test.ts`
- action: Given a `ClassifiedFinding` (`node.file`, `node.line`, `node.name`), re-read the file and return a bounded snippet — the enclosing declaration when resolvable, else a ±`snippetRadius`-line window — with line numbers preserved for the prompt.
- verify: snippet contains the declaration line; window is bounded; missing/short file handled gracefully.
- done: AC-2

### T3: Prompt contract + verdict schema
- files: `src/triage/prompt.ts`, `test/triage-prompt.test.ts`
- action: Build the request payload (system instruction + user content from snippet, symbol name/location, and the evidence chain). Define the structured-output verdict schema `{ verdict: "likely-dead"|"likely-alive"|"unsure", reasoning: string }`. Implement a parser that validates a response and maps any malformed/unparseable response to `{ verdict: "unsure" }` with the failure recorded.
- verify: payload includes snippet + evidence; valid response parses; garbage response → `unsure`, no throw.
- done: AC-3

### T4: Mockable LLM client + key resolution & offline guard
- files: `src/triage/client.ts`, `package.json`, `test/triage-client.test.ts`
- action: Add `@anthropic-ai/sdk` as a dependency. Define an injectable `TriageClient` interface (one method: verdict for a payload). The real implementation **dynamically `import()`s** the SDK inside the function (never at module top level), uses `claude-opus-4-8` + `thinking:{type:"adaptive"}` + `output_config.format` (no temperature/top_p/budget_tokens). Resolve the key from `ANTHROPIC_API_KEY` then `llm.apiKey`; if absent, throw a typed "no API key" error **before** constructing the client or any network call. Never log/serialize the key.
- verify: with no key, the offline error fires before any SDK import; a grep/asserted check confirms `src/cli.ts`, `src/engine/`, `src/fix/` contain no static `@anthropic-ai/sdk` import.
- done: AC-5

### T5: Triage orchestration (advisory, maybe-only)
- files: `src/triage/index.ts`, `test/triage.test.ts`
- action: From a `ScanResult` (or scan), select only `tier === "maybe"` findings; cap at `llm.maxFindings` when set (log how many were dropped); run one request per finding through the injected `TriageClient` with bounded concurrency; attach the verdict as a `triage` annotation on a copy of the finding **without mutating `tier` or `autoFixEligible`**. Zero `maybe` findings → no client calls, empty result.
- verify: with a mocked client, only maybe findings are sent; tier/autoFixEligible unchanged on every finding; zero-maybe makes zero calls; cap respected.
- done: AC-1, AC-4

### T6: CLI command + reporting
- files: `src/cli.ts`, `src/report/triage.ts`, `src/report/json.ts`, `test/triage-cli.test.ts`
- action: Wire `necro triage [path]` with `--json <file>` (triage a prior `scan --json`) and `--json` output flag. Render triaged findings worst-first (`likely-dead` → `unsure` → `likely-alive`) with reasoning; `--json` attaches `triage: { verdict, reasoning, model }`. Leave `scan`/`fix` text and JSON output byte-for-byte unchanged.
- verify: triage output ordering correct; JSON carries triage field; a snapshot/assert confirms scan & fix JSON are unchanged.
- done: AC-6

### T7: Reference dataset + eval harness with accuracy gate
- files: `test/fixtures/triage/` (labeled cases), `src/triage/eval.ts`, `test/triage-eval.test.ts`
- action: Create a small hand-labeled synthetic fixture set of `maybe`-style findings with ground-truth (dead/alive). Build a harness that runs triage over the set, computes precision and recall for the `likely-dead` verdict, and fails below a configured threshold. Unit tests run the harness against a **mocked** client (deterministic). Document a separate command to run the harness against the live API.
- verify: harness reports precision/recall; passes against a mock tuned above threshold and fails a deliberately-bad mock; CI path makes no live calls.
- done: AC-7

## Boundaries

- **DO NOT** add any LLM/SDK code path to `scan` or `fix`. The `@anthropic-ai/sdk` import must be a dynamic `import()` reachable only from `src/triage/`; `src/cli.ts`, `src/engine/`, and `src/fix/` must contain no static SDK import.
- **DO NOT** mutate `tier` or `autoFixEligible` anywhere in triage — the verdict is an advisory annotation only. Nothing triage produces may become `necro fix`-eligible.
- **DO NOT** make live API calls in any test — all tests use the injected/mocked `TriageClient`; the live eval is a separate, documented, opt-in command.
- **DO NOT** touch the tree-sitter / IR seam (`src/syntactic/*`) or the detectors/classifier logic. Triage consumes `ClassifiedFinding` + source files only.
- **DO NOT** log or serialize the API key anywhere (console, JSON output, error messages).
- Keep the model default `claude-opus-4-8` with adaptive thinking; do not send `temperature`/`top_p`/`budget_tokens`.
