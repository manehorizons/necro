---
phase: 10-extract-duplicate
id: 10-10
tier: standard
status: PENDING
---

# 10-10 — Extract-duplicate refactor type

## Objective

Add **extract-duplicate** as a second `necro refactor` type: given a
deterministically-detected clone group (`DuplicationFinding` — ≥2 locations of
duplicated code, possibly across files), send each location's source slice +
preservation context to Claude and **print a suggested extraction** — one shared
function plus a call to it at each former clone site — as a unified diff plus
rationale, never applying it to the working tree. The model returns **code, not a
diff** (per the phase-09 gotcha: LLM diffs fail `git apply`); necro splices the
shared function + per-site replacements and computes/owns the multi-file diff.
Reuse phase-09's machinery wholesale — the lazy-SDK refactor client, the
scratch-worktree verifier (apply → `typecheck` → tests → discard → badge), and
the suggest-only reporting — extending the orchestrator to dispatch on finding
kind. `scan`/`fix` stay local, free, and SDK-free.

## Acceptance Criteria

### AC-1: `refactor` selects clone groups for extract-duplicate
Given a scan that produces mixed findings (complexity, god functions, duplication)
When `necro refactor` runs in extract-duplicate mode
Then only `DuplicationFinding` clone groups are eligible (one logical extraction per chosen group); god-function and other findings are not sent on this path, and a project with zero clone groups makes no API call and reports nothing to extract. The existing god-function split path is unchanged and still selectable.

### AC-2: Per-location slices + preservation context are re-read and supplied
Given a `DuplicationFinding` carrying `{ tokens, locations: [{file, startLine, endLine}, …] }` but no code body
When the group is prepared for the LLM
Then each location's duplicated source slice is re-read via the shared snippet reader, and the request payload contains every slice, the in-file context around each site (enclosing signature + imports / sibling declarations) needed to host a shared function and preserve each call surface, and the clone metadata (token length, location count).

### AC-3: Structured, schema-validated extraction proposal (code, not diff)
Given the LLM responds for one clone group
When the response is parsed
Then it yields a schema-validated `{ summary, sharedFunction: string, edits: Array<{file, startLine, endLine, replacement: string}>, rationale }` proposal (structured outputs) where `sharedFunction` is the new function's source and each `edit.replacement` is the call-site code replacing that location — **never a diff string**; necro splices the shared function in and applies each replacement, then computes the unified diff itself. A malformed/unparseable response, or edits whose ranges don't match the finding's locations, is surfaced as a failed proposal with the reason recorded, not crashed.

### AC-4: Suggest-only — never mutates the working tree or git state
Given any proposal (including one that verified green, and spanning multiple files)
When `necro refactor` completes
Then no file in the user's working tree is created, modified, or deleted, nothing is staged or committed, and the command's only effect is printed output (the computed multi-file diff + rationale + verification badge); a subsequent `git status` is byte-identical to before the run.

### AC-5: Scratch-worktree verification across all affected files
Given a parsed extraction proposal touching N locations across M files
When verification runs
Then necro applies the shared function + every per-site replacement inside an isolated throwaway `git worktree`, runs `typecheck` + the test suite there, and attaches the outcome as a badge (green on pass; red with failing output on fail); the scratch worktree is always removed afterward — on pass, fail, or error — and the user's working tree and HEAD are unaffected.

### AC-6: API-key/offline guard and SDK isolation still hold
Given `necro refactor` is invoked in extract-duplicate mode
When no API key is available (`ANTHROPIC_API_KEY` env, or an `llm.apiKey` config override)
Then refactor exits with a clear, actionable message and a non-zero code **before** any network call; and `necro scan` / `necro fix` still run with no API key and never import the SDK (the SDK stays lazy-imported only on the triage/refactor paths — re-asserted).

### AC-7: Reference fixtures + structural eval gate
Given a synthetic reference set of duplicate-code fixtures (including a cross-file clone group) and a mocked client
When the eval harness runs in CI
Then each proposal is asserted to (a) introduce exactly one shared function and replace every clone location with a call to it, (b) collapse the clone group so re-running duplication detection on the proposed result no longer flags those locations, and (c) preserve each former site's public call surface / observable behavior; and an opt-in live eval (skipped without `ANTHROPIC_API_KEY`, like phases 08–09) exercises the real model against the same fixtures.

## Tasks

### T1: Extract-duplicate context builder (per-location slices + preservation context)
- files: `src/refactor/context.ts`, `test/refactor-context.test.ts`
- action: Add a builder that, given a `DuplicationFinding`, re-reads each `CloneLocation`'s slice via the shared snippet reader and assembles the LLM context: every duplicated slice, the enclosing signature + surrounding imports/sibling declarations at each site, and the clone metadata (`tokens`, location count). Keep the existing god-function context builder intact; share helpers where natural.
- verify: `npx vitest run test/refactor-context.test.ts` — context contains every location's slice + its surrounding context; cross-file groups capture per-file imports; a malformed finding (locations < 2, or a range that doesn't resolve) is rejected.
- done: AC-2

### T2: Extract-duplicate prompt contract + proposal schema + parser
- files: `src/refactor/prompt.ts`, `test/refactor-prompt.test.ts`
- action: Build the request payload (system instruction for a behavior-preserving extract-duplicate: one shared function, each site replaced by a call). Define the structured-output schema `{ summary: string, sharedFunction: string, edits: Array<{file: string, startLine: number, endLine: number, replacement: string}>, rationale: string }` — **code, not diff**. Implement a parser that validates the response, checks every `edit` range corresponds to a finding location, and maps any malformed/unparseable/range-mismatched response to a recorded **failed proposal** (reason captured), never a throw.
- verify: payload includes all slices + per-site context; a valid response parses to the typed proposal; a garbage response, and a response whose edit ranges don't match the finding, both → failed proposal with reason, no throw.
- done: AC-3

### T3: Splice + multi-file diff computation (necro owns the diff)
- files: `src/refactor/splice.ts`, `test/refactor-splice.test.ts`
- action: Given a parsed proposal + the finding, splice the `sharedFunction` into the appropriate file and apply each `edit.replacement` over its `[startLine,endLine]` range, then compute a unified diff per affected file. necro computes the diff — the LLM never supplies one. Handle multiple edits in one file (apply bottom-up so earlier line numbers stay valid) and edits across multiple files. Pure/deterministic: takes file contents in, returns `{file, diff, newContent}[]`, writes nothing.
- verify: single-file multi-site and cross-file groups both produce correct diffs; bottom-up application keeps ranges valid; overlapping/out-of-order edits are detected and rejected; no filesystem writes.
- done: AC-3

### T4: Orchestrator dispatch on finding kind (god-function vs duplication)
- files: `src/refactor/index.ts`, `test/refactor.test.ts`
- action: Extend the orchestrator to route by finding kind: `ComplexityFinding(detector==="god-function")` → existing split proposer; `DuplicationFinding` → extract-duplicate path (T1 context → T2 prompt/parse → T3 splice → T4 verify). For a chosen clone group: build context → call the injected `RefactorClient` → parse → splice → verify. Return proposal + computed diff + badge **without** mutating any finding or writing any file. Zero clone groups → no client call, empty result. The god-function path stays behavior-identical.
- verify: with a mocked client, only clone groups take the extract path; god-function findings still take the split path; zero-duplication → zero calls; no finding mutated; no file writes; existing refactor tests still green.
- done: AC-1, AC-4

### T5: Scratch-worktree verification for multi-file edits
- files: `src/refactor/verify.ts`, `test/refactor-verify.test.ts`
- action: Extend the verifier to apply a multi-file extraction proposal (shared-function insertion + every per-site replacement, via T3 `newContent`) inside the isolated throwaway `git worktree`, run `typecheck` + tests, and badge green/red. Worktree **always** removed in `finally` — pass, fail, or error. User tree/index/HEAD untouched. Reuse the existing worktree harness; the only change is writing N files instead of one.
- verify: a green multi-file proposal → green badge; a test-breaking one → red badge with output; worktree gone in every path; `git worktree list` + user tree/HEAD unchanged.
- done: AC-5

### T6: CLI `necro refactor` extract-duplicate mode + reporting
- files: `src/cli.ts`, `src/report/refactor.ts`, `test/refactor-cli.test.ts`
- action: Let `necro refactor` target clone groups (e.g. `--type=extract-duplicate`, defaulting/auto-selecting sensibly; keep god-function reachable). Render the computed multi-file unified diff + rationale + verification badge; suggest-only — print, never write. Preserve the offline-guard message + non-zero exit. Leave `scan`/`fix` and the god-function refactor output byte-for-byte unchanged.
- verify: end-to-end with a mocked client prints the multi-file diff + rationale + badge; **`git status` byte-identical before/after**; scan, fix, and god-function refactor output unchanged; no-key path exits non-zero before any network call.
- done: AC-4, AC-6

### T7: Reference fixtures + structural eval gate
- files: `test/fixtures/refactor-duplicate/` (clone-group cases, incl. cross-file), `src/refactor/eval.ts`, `test/refactor-eval.test.ts`, `test/refactor-eval.live.test.ts`
- action: Create synthetic duplicate-code fixtures (at least one single-file multi-site and one cross-file group). Extend the eval harness so each proposal asserts: (a) exactly one shared function introduced + every location replaced by a call to it, (b) re-running duplication detection on the spliced result no longer flags the group, (c) each former site's public call surface / behavior preserved. CI path uses a **mocked** client (deterministic). Extend the opt-in live eval (skipped without `ANTHROPIC_API_KEY`) over the same fixtures.
- verify: harness passes a good mock and fails deliberately-bad mocks (duplication not collapsed / a site left un-replaced / signature changed); CI path makes no live call; live test auto-skips without a key.
- done: AC-7

## Boundaries

- **PROPOSALS RETURN CODE, NOT DIFFS.** The LLM returns `sharedFunction` + per-site `replacement` code; necro splices and computes the unified diff. Never ask the model for, or apply, a diff string — LLM diffs fail `git apply`. (Load-bearing; see memory `refactor-proposal-is-code-not-diff`.)
- **DO NOT** mutate the user's working tree, git index, or HEAD anywhere in `refactor` — suggest-only, including for multi-file extractions. Verification happens **only** in a throwaway `git worktree` that is always removed (pass, fail, or error).
- **DO NOT** add any LLM/SDK code path to `scan` or `fix`. The `@anthropic-ai/sdk` import stays a dynamic `import()` reachable only from `src/triage/` and `src/refactor/`; `src/cli.ts`, `src/engine/`, and `src/fix/` contain no static SDK import.
- **DO NOT** change a finding's `tier` or set `autoFixEligible`; `refactor` never deletes code, and nothing it produces becomes `necro fix`-eligible.
- **DO NOT** regress the phase-09 god-function split path — it stays selectable and behavior-identical; extract-duplicate is additive via orchestrator dispatch.
- **DO NOT** touch the tree-sitter / IR seam (`src/syntactic/*`) or the duplication detector itself — phase 10 consumes existing `DuplicationFinding`s, it does not change how clones are detected.
- **DO NOT** log or serialize the API key anywhere. Keep the model default `claude-opus-4-8`; do not send `temperature`/`top_p`/`budget_tokens`.
- **DO NOT** make live API calls in any test — all tests use the injected/mocked `RefactorClient`; the live eval is a separate, opt-in command.
- **Out of scope:** caching by code-hash (still deferred); refactor types beyond god-function split and extract-duplicate; cross-language extraction beyond what the duplication detector already supports.
