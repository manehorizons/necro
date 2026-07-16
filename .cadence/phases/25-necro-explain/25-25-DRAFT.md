---
phase: 25-necro-explain
id: 25-25
tier: standard
status: PENDING
---

# 25-25 — necro explain — reachability trace explainer (CLI + MCP)

## Objective

Ship a deterministic static explainer (`necro explain <symbol>` CLI + `necro_explain` MCP tool) that reconstructs the reachability witness chain showing *why* a symbol is alive, test-only, or dead.

## Acceptance Criteria

### AC-1: Alive symbol yields a prod witness chain
Given a symbol reachable from a production entry
When `necro explain <symbol>` runs (and the `explain()` engine fn)
Then it reports reachability `alive` and returns the shortest witness chain (entry → … → symbol) over prod edges, both human-rendered and in `--json`.

### AC-2: Dead symbol yields unreachable + annotated inbound references
Given a symbol unreachable from all prod and test entries
When `necro explain <symbol>` runs
Then it reports reachability `dead`, emits no witness chain, and lists each inbound reference (who uses it) annotated with that referrer's own reachability.

### AC-3: Test-only witness and symbol-resolution edge cases
Given a symbol reachable only via test edges, an ambiguous bare name, or an unknown name
When `necro explain <symbol>` runs
Then a test-only symbol returns a witness chain over test edges; an ambiguous name returns the candidate list; and an unknown name returns a not-found result (CLI exits non-zero, MCP returns it structured).

### AC-4: MCP parity and unchanged scan after model extraction
Given the shared `buildReachabilityModel()` extracted from the engine
When `scan` and `necro_explain` both run
Then existing scan behavior is unchanged, and `necro_explain` returns the same structured result as the CLI `--json` for the same symbol.

## Tasks

### T1: Path-retaining traversal
- files: `src/analyze/reachability.ts`, `test/reachability.test.ts`
- action: Add `tracePath(edges, entries, target, allow)` — BFS-with-parent returning the shortest witness chain (node-id array) from any entry to `target`, or `null` if unreachable; reuse the same `allow`-kind predicate as `computeReachability` so traces match verdicts. Keep it separate from the mark-and-sweep (scan hot path untouched).
- verify: unit tests — shortest chain, unreachable→null, prod-only vs prod+test edge filtering. Tag titles AC-1, AC-3.
- done: AC-1, AC-3

### T2: Extract shared reachability model
- files: `src/engine/index.ts`, `test/engine.test.ts` (or existing scan tests)
- action: Extract the graph-build + entry-resolution + `computeReachability` prelude (~lines 74–107) into `buildReachabilityModel(targetPath, config)` returning `{ graph, prodEntries, testEntries, reachability, taintedFiles }`. Refactor `scan()` to call it with no behavior change.
- verify: existing scan/engine suite still green; add a test asserting scan output unchanged. Tag title AC-4.
- done: AC-4

### T3: explain() engine fn + symbol resolution
- files: `src/engine/explain.ts` (new), `src/engine/index.ts` (export), `test/explain.test.ts`
- action: Add `explain(query, options)` — build model via `buildReachabilityModel`, resolve `query` (bare `name`, `file:name`, or full `file:line:name` id), then: alive → `tracePath` over prod edges; test-only → `tracePath` over all edges; dead → collect inbound edges (`to === id`) and annotate each source with its reachability. Ambiguous name → `{ambiguous: candidates[]}`; unknown → `{notFound: true}`. Return the shared result shape.
- verify: integration tests on a fixture graph — alive witness, test-only witness, dead+inbound annotation, ambiguous, not-found. Tag titles AC-1, AC-2, AC-3.
- done: AC-1, AC-2, AC-3

### T4: necro explain CLI subcommand
- files: `src/cli.ts`, `test/cli-explain.test.ts`
- action: Register `necro explain <symbol>` (commander, parallel to `scan`/`fix`/`mcp`) with `--json`. Human render: witness chain for alive/test-only; "unreachable" + annotated inbound list for dead; candidate list / not-found message with non-zero exit for those cases.
- verify: CLI output test for alive (chain), dead (inbound), and not-found (exit code). Tag titles AC-1, AC-2.
- done: AC-1, AC-2

### T5: necro_explain MCP tool
- files: `src/mcp/tools/explain.ts` (new), `src/mcp/server.ts`, `test/mcp-explain.test.ts`
- action: Add `registerExplainTool` — read-only wrapper over `explain()` returning the structured result; register it in the server alongside `necro_scan`/`necro_verify`.
- verify: registration test (tools/list includes `necro_explain`) + parity test (same structured result as CLI `--json`). Tag titles AC-4.
- done: AC-4

## Boundaries

- DO NOT call the LLM — `explain` is deterministic static analysis only (an LLM narrative layer is a future phase).
- DO NOT change `fix`, `refactor`, or `triage` behavior.
- DO NOT alter `computeReachability`'s mark-and-sweep or the scan hot path beyond the pure extraction in T2.
- DO NOT touch the `necro_verify` enhancements (verify-a-removal / verify-N-candidates) — that is rec-007 half (a), a separate follow-up.
