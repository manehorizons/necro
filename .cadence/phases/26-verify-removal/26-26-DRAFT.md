---
phase: 26-verify-removal
id: 26-26
tier: standard
status: PENDING
---

# 26-26 — necro verify-removal: per-symbol removal safety in isolated worktrees

## Objective

Ship `necro verify-removal <symbol...>` (CLI + `necro_verify_removal` MCP tool): for each named symbol, plan its deletion with the existing ts-morph removal engine, verify it independently in a throwaway git worktree, and report per-symbol whether deleting it keeps the build green.

## Acceptance Criteria

### AC-1: Removal planner removes an arbitrary named symbol
Given a SymbolNode that is **not** necessarily `certain`-dead (an agent's "what if I delete this?")
When the ungated removal-planner core runs on it
Then it returns one `Edit` whose `after` text omits that symbol's declaration via ts-morph `.remove()`, and the existing `planRemovals` (dead-finding path) still produces identical edits (delegation preserves behavior).

### AC-2: A safe removal badges green, a breaking removal badges red
Given a symbol whose deletion leaves the build green, and another whose deletion breaks typecheck/tests
When `verify-removal` plans and verifies each in an isolated worktree
Then the first is badged `green` and the second `red` with the failing check's output, and the user's working tree is never modified (worktree torn down on both paths).

### AC-3: Multiple symbols are verified independently
Given several symbols passed in one call
When `verify-removal` runs
Then each symbol is removed and checked in **its own** worktree and the result reports a per-symbol badge — one symbol's red verdict does not taint the others' green verdicts.

### AC-4: CLI verb renders per-symbol verdicts and tolerates bad queries
Given `necro verify-removal <symbol...>` over a target
When it runs (including a symbol query that resolves to no node)
Then it prints a per-symbol green/red line (and `--json` array), and an unresolvable query is reported as `unresolved` for that symbol rather than crashing the command.

### AC-5: MCP tool returns per-symbol JSON badges, read-only w.r.t. the tree
Given the `necro_verify_removal` MCP tool registered on the server
When called with `symbols: string[]` (and optional `checks`)
Then it returns per-symbol `{ symbol, status, output? }` JSON, carries `readOnlyHint: true`, and leaves the working tree untouched with all worktrees removed.

## Tasks

### T1: Ungated removal-planner core
- files: `src/fix/remove.ts`
- action: Extract a `planRemovalOf(targets: { file: string; name: string; line: number }[]): Edit[]` core that resolves declarations and ts-morph-`.remove()`s them with the existing "resolve-all-before-removing" line-stability guarantee, **without** the `autoFixEligible` gate. Refactor `planRemovals` to map its `certain`-dead findings onto `planRemovalOf` so behavior is unchanged.
- verify: unit test removes a live-but-arbitrary symbol → correct `after`; existing `planRemovals` tests still pass.
- done: AC-1

### T2: verify-removal engine
- files: `src/engine/verify-removal.ts` (new), `src/engine/explain.ts` (export `resolveQuery`)
- action: Build the `ReachabilityModel` once; for each symbol query resolve it via the shared `resolveQuery`, `planRemovalOf` the resolved node, relativize each `Edit` to the repo root and map to `FileEdit{ file, content: after }`, then `verifyEdits(edits, checks, runnerFactory(root))` in a **fresh worktree per symbol**. Return `Array<{ symbol, status: "green" | "red" | "unresolved", output? }>`. Inject `runnerFactory`/`checks` for tests; default checks = `DEFAULT_CHECKS`.
- verify: unit test with a fake runner — safe symbol→green, breaking symbol→red, unknown→unresolved, mixed batch stays independent.
- done: AC-2, AC-3

### T3: CLI verb
- files: `src/cli.ts`, `src/report/verify-removal.ts` (new renderer)
- action: Add `.command("verify-removal").argument("<symbols...>")` with `--json` and `--checks`; call the engine, render per-symbol green/red lines (human) or the JSON array. Mirror the existing `explain` verb's option/rendering shape.
- verify: CLI test over a fixture target — per-symbol output + `--json`; an unresolvable symbol prints `unresolved`, exit stays 0.
- done: AC-4

### T4: MCP tool
- files: `src/mcp/tools/verify-removal.ts` (new), `src/mcp/server.ts` (register)
- action: Register `necro_verify_removal` with `inputSchema { symbols: string[], checks?: string[] }`, `annotations.readOnlyHint: true`; resolve target from `process.cwd()`, call the engine, return the per-symbol badge array as JSON text. Inject `runnerFactory` via deps for tests (mirror `registerVerifyTool`).
- verify: MCP test with injected runner — per-symbol JSON badges; working tree untouched.
- done: AC-5

## Boundaries

- DO NOT change the `verifyEdits` / `gitWorktreeRunner` harness contract in `src/refactor/verify.ts` — reuse it as-is (it already guarantees teardown + untouched tree).
- DO NOT alter `necro_verify`'s existing edit-set behavior; this is a sibling tool, not a replacement.
- DO NOT add cascade/transitive removal — remove only the named symbol (the agent re-asks for newly-orphaned symbols). Scoped out by decision.
- DO NOT touch the dead-code verdict semantics or reachability; verify-removal only *consumes* the model + removal engine.
- Removal is **per-symbol independent** (one worktree each), never a combined all-symbols-at-once removal.
