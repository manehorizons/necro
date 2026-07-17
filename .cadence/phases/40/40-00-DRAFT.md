---
phase: 40
id: 40-00
tier: standard
status: PENDING
---

# 40-00 — MCP hardening: progress notifications, target-relative config, full tool docs

## Objective

Stream MCP progress notifications from `necro_verify_removal` so long-running calls survive client timeouts, fix all three config-loading MCP tools to resolve `necro.config.json` relative to the scan target instead of the server's own cwd, and add duration hints + a `claude mcp add` one-liner to close the remaining doc gap.

## Acceptance Criteria

### AC-1: `necro_verify_removal` streams per-symbol MCP progress notifications
Given a client calls `necro_verify_removal` with a `progressToken` in `_meta` (the MCP out-of-band progress opt-in) and multiple symbols
When the tool iterates symbols and verifies each in its own worktree
Then it sends a `notifications/progress` message per symbol via `extra.sendNotification` (using the existing `verifyRemovals({ onProgress })` hook from `src/engine/verify-removal.ts`), carrying `progress`/`total`/`message`, and sends nothing when the caller supplied no `progressToken`.

### AC-2: MCP tools resolve config relative to the scan target, not the server's cwd
Given `necro_scan`, `necro_verify_removal`, and `necro_explain` all currently call `loadConfig(process.cwd())` (`src/mcp/tools/scan.ts:30`, `verify-removal.ts:34`, `explain.ts:46`) — so a long-lived server whose `path` argument points at a sibling project silently ignores that project's `necro.config.json`
When any of the three tools is called with a `path` pointing at a directory (or file) that has its own `necro.config.json`
Then config loads from that target's directory (its own dirname if `path` names a file) via a new shared `resolveConfigDir` helper in `src/config.ts`, not from `process.cwd()`.

### AC-3: Duration hints on long-running tools, and a `claude mcp add` one-liner in the README
Given `necro_verify` and `necro_verify_removal` both run a full typecheck+test cycle (per edit-set or per symbol) with no indication in their tool description that this can take minutes, and the README's MCP section (already documenting all four tools as of the 2026-07 doc-sync) has no `claude mcp add` one-liner, only the raw JSON registration block
When an agent reads either tool's `description` field, or a developer reads the README's MCP section
Then both descriptions state the call can take from seconds to minutes depending on repo size and check commands, and the README shows `claude mcp add necro -- npx -y @manehorizons/necro mcp` alongside the existing JSON snippet.

## Tasks

### T1: Stream MCP progress notifications from `necro_verify_removal`
- files: `src/mcp/tools/verify-removal.ts`, `test/mcp-verify-removal.test.ts`
- action: accept the handler's second `extra` argument; wire `verifyRemovals`'s existing `onProgress(symbol, index, total)` hook to call `extra.sendNotification({ method: "notifications/progress", params: { progressToken, progress: index, total, message: symbol } })`, only when `extra._meta?.progressToken` is defined (read it once before the loop; skip sending entirely if absent).
- verify: new test calls `necro_verify_removal` with 2+ symbols via `client.callTool(params, resultSchema, { onprogress })`, collects notifications, and asserts one per symbol with increasing `progress` and the right `total`; a second test omits progress opt-in and asserts no notifications fire (existing recording runner can capture this via a spy).
- done: AC-1

### T2: Resolve MCP tool config relative to the scan target, not server cwd
- files: `src/config.ts`, `src/mcp/tools/scan.ts`, `src/mcp/tools/verify-removal.ts`, `src/mcp/tools/explain.ts`, `test/config.test.ts`, `test/mcp-server.test.ts`, `test/mcp-verify-removal.test.ts`, `test/mcp-explain.test.ts`
- action: add `resolveConfigDir(target: string): Promise<string>` to `src/config.ts` (stat `target`; return it if a directory, else `dirname(target)`; on `ENOENT` fall back to `dirname(target)`). Replace `loadConfig(process.cwd())` with `loadConfig(await resolveConfigDir(target))` in all three tool files (after `target` is resolved). Update the `necro_scan` golden-equality test in `mcp-server.test.ts` to build its expectation via `loadConfig(dir)` instead of `loadConfig(process.cwd())`, since that's now the tool's real behavior.
- verify: unit tests in `test/config.test.ts` for `resolveConfigDir` (directory input, file input, nonexistent-path input). Integration test per tool (scan/verify-removal/explain): create a tmp target dir with its own `necro.config.json` (server `process.cwd()` — the repo root during test runs — has none), call the MCP tool with `path` pointing at the tmp dir, and assert the config override took effect (e.g. an `ignore` glob excludes a file from `necro_scan`'s findings) — proving config resolved from the target, not cwd.
- done: AC-2

### T3: Duration hints on long-running tools + `claude mcp add` one-liner
- files: `src/mcp/tools/verify.ts`, `src/mcp/tools/verify-removal.ts`, `README.md`, `test/mcp-server.test.ts`, `test/mcp-verify-removal.test.ts`
- action: append a duration-hint clause to `necro_verify`'s and `necro_verify_removal`'s `description` strings (typecheck+test cycle can take from seconds to minutes depending on repo size and check commands). In `README.md`'s "Use from an AI agent (MCP)" section, add `claude mcp add necro -- npx -y @manehorizons/necro mcp` as a one-liner alongside the existing JSON `mcpServers` registration block.
- verify: tests assert (via `client.listTools()`) that both tools' `description` contains a duration-hint substring (e.g. "minutes"); a lightweight test reads `README.md` and asserts it contains the `claude mcp add necro` string.
- done: AC-3

## Boundaries

- DO NOT add an `onProgress` hook to `verifyEdits` / `necro_verify` — out of scope per the spec's Constraints (no existing engine-layer hook to wire).
- DO NOT change any `loadConfig(process.cwd())` call site in `src/cli.ts` — the CLI's cwd convention is correct and untouched.
- DO NOT rewrite or restructure the README's MCP section beyond adding the one-liner — it was already brought current in an earlier doc-sync phase.
