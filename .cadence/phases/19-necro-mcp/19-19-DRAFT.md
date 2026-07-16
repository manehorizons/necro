---
phase: 19-necro-mcp
id: 19-19
tier: complex
status: PENDING
---

# 19-19 — necro MCP server — agent-callable scan + verify (read-only)

## Objective

Ship a minimal stdio MCP server (`necro mcp`) exposing two read-only tools —
`necro_scan` (evidence-backed findings, golden-equal to `scan --json`) and
`necro_verify` (apply edits in a throwaway worktree, run checks, report
pass/fail) — so an AI agent can consume necro's verdicts and verify its own
edits in isolation, without necro mutating the workspace or wrapping an LLM.

## Acceptance Criteria

### AC-1: stdio server lists exactly the two read-only tools
Given a client connects to `necro mcp` over stdio
When it completes the MCP initialize handshake and lists tools
Then it sees exactly `necro_scan` and `necro_verify`, each with a valid input
schema, and no mutating or LLM-backed tool is exposed.

### AC-2: necro_scan equals `scan --json` (no logic fork)
Given a target path
When `necro_scan` is invoked over MCP
Then its structured result is byte-equal to the existing `scan()` + `toJson()`
output for the same path/config — the MCP path calls the engine, it does not
reimplement scanning.

### AC-3: necro_verify runs edits in an isolated worktree and always cleans up
Given a set of `{file, content}` edits and (optional) check commands
When `necro_verify` is invoked
Then it applies the edits in a throwaway git worktree via `verifyEdits` +
`gitWorktreeRunner`, returns `{ok, output}` (ok ⇔ all checks green), the user's
working tree is never modified, and the worktree is torn down on success and
failure alike.

### AC-4: malformed tool input is a structured error, not a crash
Given a tool call with input that violates the tool's schema (missing/ wrong-typed field)
When the server handles it
Then it returns a structured MCP tool error and stays alive for the next call —
and no v1 tool performs a working-tree mutation.

## Tasks

### T1: MCP server scaffold + `necro mcp` command
- files: `package.json`, `src/mcp/server.ts`, `src/cli.ts`
- action: add `@modelcontextprotocol/sdk`; build an `McpServer` over
  `StdioServerTransport` with a tool registry; wire a `necro mcp` command that
  starts it. No tools registered yet beyond a health-checkable empty list.
- verify: a stdio client completes initialize + `tools/list` (integration test
  driving the server over an in-memory/stdio transport)
- done: AC-1

### T2: necro_scan tool (engine reuse, golden-equal)
- files: `src/mcp/server.ts`, `src/mcp/tools/scan.ts`
- action: register `necro_scan` with input `{ path?, top?, coverage? }`; handler
  calls `scan(target, config)` and returns the `toJson()` shape as structured
  content. No scanning logic in the MCP layer.
- verify: test asserts the tool result === `toJson(await scan(dir, cfg))` for a
  fixture dir (golden equality)
- done: AC-1, AC-2

### T3: necro_verify tool (worktree harness reuse)
- files: `src/mcp/server.ts`, `src/mcp/tools/verify.ts`
- action: register `necro_verify` with input `{ edits: {file, content}[], checks?: string[] }`;
  handler maps to `FileEdit[]`, runs `verifyEdits(edits, checks ?? DEFAULT_CHECKS, gitWorktreeRunner(repoRoot))`,
  and returns `{ ok: badge.status === "green", output }`. `DEFAULT_CHECKS` =
  the same typecheck+test commands `necro refactor` uses.
- verify: test with an injected `VerifyRunner` asserts edits→checks→teardown
  order and that a red check yields `ok:false` + output; worktree always removed
- done: AC-3

### T4: input-schema validation + error path + docs
- files: `src/mcp/tools/*.ts`, `test/mcp-server.test.ts`, `README.md`
- action: declare tool input schemas; malformed input returns a structured tool
  error (server survives). Add a README "Use necro from your agent (MCP)" stanza
  with the stdio config snippet. Tag each test title with its AC id.
- verify: `npx vitest run test/mcp-server.test.ts` green; malformed-call test
  asserts structured error + server still serves a subsequent valid call
- done: AC-1, AC-4

## Boundaries

- v1 exposes **no** mutating tool and **no** LLM-backed tool — `triage` and
  `refactor` stay CLI-only. Keep the MCP surface deterministic and
  side-effect-free (worktree verification is isolated, never touches the user tree).
- **No logic fork**: `necro_scan` calls `scan()`/`toJson()` and `necro_verify`
  calls `verifyEdits()`/`gitWorktreeRunner()` as-is — AC-2's golden-equality and
  AC-3's reuse forbid reimplementing either.
- Do NOT change the engine, detectors, or the verify harness themselves — this
  phase only adds an entry point over them.
- Transport is stdio only (no HTTP/SSE server) for v1.
