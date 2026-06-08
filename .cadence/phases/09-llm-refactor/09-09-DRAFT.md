---
phase: 09-llm-refactor
id: 09-09
tier: standard
status: PENDING
---

# 09-09 — LLM-assisted god-function split (suggest-only, scratch-verified)

## Objective

Add an opt-in `necro refactor` command that takes a god-function finding, sends
its source slice + preservation context to Claude (`claude-opus-4-8`), and
**prints a suggested split** into smaller functions as a unified diff plus
rationale — never applying it to the working tree. Before surfacing a proposal,
necro verifies it in a throwaway git worktree (apply → `typecheck` → tests →
discard) and badges the suggestion green/red, giving a behavior-preservation
signal without ever touching the user's tree or git state. `refactor` sits
beside `fix` (which stays certain-dead-removal only) and reuses phase-08's lazy
SDK path, so `scan`/`fix` remain local, free, and network-free.

## Acceptance Criteria

### AC-1: `refactor` targets only god-function findings
Given a scan that produces mixed findings (dead code, complexity, god functions)
When `necro refactor <path>` runs
Then only god-function-tier findings are eligible for proposal (one logical refactor per chosen finding); non-god-function findings are never sent to the LLM, and a project with zero god-function findings makes no API call and reports nothing to refactor.

### AC-2: Code slice + preservation context are re-read and supplied
Given a god-function finding carrying `{ file, line, name }` but no code body
When the finding is prepared for the LLM
Then the enclosing function body is re-read via the shared snippet reader, and the request payload contains the code slice, the finding type (`god-function`), and the surrounding context needed to preserve the call surface (the function signature and the in-file context — imports / sibling declarations — around it).

### AC-3: Structured, schema-validated split proposal
Given the LLM responds for one finding
When the response is parsed
Then it yields a schema-validated `{ summary, newFunctions: string[], diff, rationale }` proposal (structured outputs); a malformed/unparseable response is surfaced as a failed proposal with the reason recorded, not crashed.

### AC-4: Suggest-only — never mutates the working tree or git state
Given any proposal (including one that verified green)
When `necro refactor` completes
Then no file in the user's working tree is created, modified, or deleted, nothing is staged or committed, and the command's only effect is printed output (the proposed diff + rationale + verification badge); a subsequent `git status` is identical to before the run.

### AC-5: Scratch-worktree verification (typecheck + tests)
Given a parsed proposal
When verification runs
Then the proposal is applied inside an isolated throwaway git worktree, `typecheck` and the test suite are run there, and the outcome is attached to the suggestion as a badge (green on pass; red with the failing output on fail); the scratch worktree is always removed afterward — including on verification failure or error — and the user's working tree and git HEAD are unaffected.

### AC-6: API-key/offline guard and SDK isolation
Given `necro refactor` is invoked
When no API key is available (`ANTHROPIC_API_KEY` env, or an `llm.apiKey` config override)
Then refactor exits with a clear, actionable message and a non-zero code **before** any network call; and `necro scan` / `necro fix` run with no API key present and never import the SDK (verified — the SDK stays lazy-imported only on the triage/refactor paths).

### AC-7: Reference fixtures + structural eval gate
Given a synthetic reference set of god-function fixtures and a mocked client
When the eval harness runs in CI
Then each proposal is asserted to (a) split the god function into ≥2 smaller functions, (b) preserve the original public call surface (the exported / entry signature is unchanged), and (c) reduce the maximum per-function complexity below the god-function threshold; and an opt-in live eval (skipped without `ANTHROPIC_API_KEY`, like phase 08) exercises the real model against the same fixtures.

## Tasks

### T1: Refactor context builder (source slice + preservation context)
- files: `src/refactor/context.ts`, `test/refactor-context.test.ts`
- action: Given a `ComplexityFinding` with `detector === "god-function"` (`file`, `line`, `name`), re-read the enclosing function body via the shared snippet reader (`src/triage/snippet.ts`, reused/lifted as needed) and assemble the LLM context: the code slice, the finding type, the function signature, and the in-file surrounding context (imports / sibling declarations) needed to preserve the call surface.
- verify: `npx vitest run test/refactor-context.test.ts` — context contains the full declaration body + signature; surrounding imports captured; non-god-function detectors are rejected/ignored.
- done: AC-2

### T2: Prompt contract + proposal schema + parser
- files: `src/refactor/prompt.ts`, `test/refactor-prompt.test.ts`
- action: Build the request payload (system instruction for a behavior-preserving god-function split + user content from the context). Define the structured-output schema `{ summary: string, newFunctions: string[], diff: string, rationale: string }`. Implement a parser that validates a response against the schema and maps a malformed/unparseable response to a recorded **failed proposal** (reason captured), never a throw.
- verify: payload includes slice + signature + surrounding context; a valid response parses to the typed proposal; a garbage response → failed proposal with reason, no throw.
- done: AC-3

### T3: Refactor client (lazy SDK) + key resolution & offline guard
- files: `src/refactor/client.ts`, `test/refactor-client.test.ts`
- action: Define an injectable `RefactorClient` interface (one method: proposal for a payload). The real implementation **dynamically `import()`s** `@anthropic-ai/sdk` inside the function (never at module top level), on the same lazy path as `triage` — share the key-resolution + client-construction helper with `src/triage/client.ts` rather than duplicating. Resolve the key from `ANTHROPIC_API_KEY` then `llm.apiKey`; if absent, throw the typed "no API key" error **before** any SDK import or network call. Never log/serialize the key.
- verify: with no key, the offline error fires before any SDK import + before network; an asserted check confirms `src/cli.ts`, `src/engine/`, `src/fix/` still contain no static `@anthropic-ai/sdk` import.
- done: AC-6

### T4: Scratch-worktree verifier (typecheck + tests)
- files: `src/refactor/verify.ts`, `test/refactor-verify.test.ts`
- action: Given a parsed proposal, apply it inside an isolated throwaway `git worktree` (off the current HEAD), run `typecheck` + the test suite there, and return a verification badge (`green` on pass; `red` with captured failing output on fail). The scratch worktree is **always** removed in a `finally` — on pass, fail, or thrown error. The user's working tree, index, and HEAD are never touched. Reuse git invariants from `src/fix/git-guard.ts` where applicable.
- verify: green proposal → green badge; a test-breaking proposal → red badge with output; worktree is gone afterward in every path; `git worktree list` + the user tree/HEAD unchanged.
- done: AC-5

### T5: Refactor orchestration (god-function-only, suggest-only)
- files: `src/refactor/index.ts`, `test/refactor.test.ts`
- action: From a `ScanResult` (or scan), select **only** findings with `detector === "god-function"`; for the chosen finding, build context (T1) → call the injected `RefactorClient` (T3) → parse (T2) → verify (T4). Return the proposal + badge **without** mutating the finding's `tier`/`autoFixEligible`, deleting code, or writing any file. Zero god-function findings → no client call, empty result.
- verify: with a mocked client, only god-function findings are eligible; non-god-function findings never sent; zero-god-function → zero calls; finding `tier`/`autoFixEligible` unchanged; no file writes.
- done: AC-1, AC-4

### T6: CLI `necro refactor` + suggest-only reporting
- files: `src/cli.ts`, `src/report/refactor.ts`, `test/refactor-cli.test.ts`
- action: Wire `necro refactor [path]` (optional finding selection; optional `--json` output). Render the proposed unified diff + rationale + the verification badge; suggest-only — print, never write. Leave `scan`/`fix` text and JSON output byte-for-byte unchanged.
- verify: end-to-end with a mocked client prints diff + rationale + badge; **`git status` is byte-identical before and after the run** (no tree/index/HEAD change); scan & fix output unchanged.
- done: AC-4

### T7: Reference fixtures + structural eval gate
- files: `test/fixtures/refactor/` (god-function cases), `src/refactor/eval.ts`, `test/refactor-eval.test.ts`
- action: Create a small synthetic fixture set of god functions. Build a harness that, for each proposal, asserts: (a) split into ≥2 functions, (b) the original public call surface (exported symbol(s) + the function's own signature) is preserved, (c) the maximum per-function complexity drops below the god-function threshold. CI tests run the harness against a **mocked** client (deterministic). Add a separate opt-in live eval (`test/refactor-eval.live.test.ts`, skipped without `ANTHROPIC_API_KEY`, like phase 08) over the same fixtures.
- verify: harness passes a good mock and fails a deliberately-bad mock (e.g. single-function / signature-changed); CI path makes no live call; the live test auto-skips without a key.
- done: AC-7

## Boundaries

- **DO NOT** mutate the user's working tree, git index, or HEAD anywhere in `refactor` — it is suggest-only. The human applies the diff by hand. Verification happens **only** in a throwaway `git worktree` that is always removed (pass, fail, or error).
- **DO NOT** add any LLM/SDK code path to `scan` or `fix`. The `@anthropic-ai/sdk` import stays a dynamic `import()` reachable only from `src/triage/` and `src/refactor/`; `src/cli.ts`, `src/engine/`, and `src/fix/` must contain no static SDK import.
- **DO NOT** change a finding's `tier` or set `autoFixEligible`; `refactor` never deletes code, and nothing it produces becomes `necro fix`-eligible.
- **DO NOT** make live API calls in any test — all tests use the injected/mocked `RefactorClient`; the live eval is a separate, opt-in command.
- **DO NOT** touch the tree-sitter / IR seam (`src/syntactic/*`) or the detector logic. Refactor consumes `ComplexityFinding` (`detector === "god-function"`) + source files only.
- **DO NOT** log or serialize the API key anywhere.
- Keep the model default `claude-opus-4-8`; do not send `temperature`/`top_p`/`budget_tokens`.
- **Out of scope:** caching by code-hash (deferred, as in phase 08); refactor types other than god-function split.
