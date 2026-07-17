---
phase: 34-cli-ref-explain-verifyremoval
id: 34-01
tier: standard
status: PENDING
---

# 34-01 — Add CLI reference sections for necro explain and necro verify-removal

## Objective

Add standalone `## necro explain` and `## necro verify-removal` sections to `website/src/content/docs/reference/cli.md`, matching the existing scan/fix/triage/refactor command-page style, so both commands are documented as full CLI references rather than only appearing in the MCP tools table.

## Acceptance Criteria

### AC-1: `## necro explain` section documents the real CLI surface
Given `src/cli.ts`'s `explain` command (`explain <symbol> [--json] [--narrate]`, `argument("<symbol>", ...)`, exits `1` when `result.status !== "resolved"`, `0` otherwise)
When `cli.md` is updated
Then it gains a `## necro explain` section (placed after `## necro scan`, before `## necro verify-removal` — matching `src/cli.ts`'s command registration order) with a usage code fence, an Arguments table (`<symbol>`), an Options table (`--json`, `--narrate` — noting it needs `ANTHROPIC_API_KEY` and degrades gracefully without one), and an Exit code note (`0` resolved, `1` unresolved/ambiguous).

### AC-2: `## necro verify-removal` section documents the real CLI surface
Given `src/cli.ts`'s `verify-removal` command (`verify-removal <symbols...> [--json] [--checks <cmd>]`, `--checks` is repeatable via `collectChecks` — default typecheck+tests when omitted — exits `1` when any symbol's verdict is `red`, `0` otherwise including all-unresolved)
When `cli.md` is updated
Then it gains a `## necro verify-removal` section (placed directly after `## necro explain`, before `## necro fix`) with a usage code fence, an Arguments table (`<symbols...>`), an Options table (`--json`, `--checks <cmd>` documented as repeatable), and an Exit code note (`0` all green/unresolved, `1` any red).

### AC-3: sections match existing style and nothing else regresses
Given the existing `## necro fix`/`## necro triage`/`## necro refactor` sections' structure (intro paragraph, usage fence, Arguments/Options tables, `### Exit code` where applicable)
When the two new sections are added
Then they follow the same heading levels and table structure, the existing `## necro scan`/`## necro fix`/`## necro triage`/`## necro refactor`/`## necro mcp` sections are untouched (only new content inserted between scan and fix), and the MCP tools table + opt-in note (already updated in phase 33) are left as-is or cross-linked, not duplicated/contradicted.

## Tasks

### T1: Add `## necro explain` section
- files: `website/src/content/docs/reference/cli.md`
- action: Insert a `## necro explain` section immediately after `## necro scan` (before `## necro fix`), with intro paragraph, a usage code fence (`necro explain <symbol> [options]`), an Arguments table (`<symbol>`), an Options table (`--json`, `--narrate`), and an `### Exit code` note — all sourced from `src/cli.ts` L131-163.
- verify: `grep -n "^## \`necro explain\`" website/src/content/docs/reference/cli.md` matches, positioned after the `## necro scan` line and before `## necro fix`.
- done: AC-1

### T2: Add `## necro verify-removal` section
- files: `website/src/content/docs/reference/cli.md`
- action: Insert a `## necro verify-removal` section immediately after the new `## necro explain` section (before `## necro fix`), with intro paragraph, a usage code fence (`necro verify-removal <symbols...> [options]`), an Arguments table (`<symbols...>`), an Options table (`--json`, `--checks <cmd>` noted as repeatable, default typecheck+tests), and an `### Exit code` note — all sourced from `src/cli.ts` L165-195.
- verify: `grep -n "^## \`necro verify-removal\`" website/src/content/docs/reference/cli.md` matches, positioned after `## necro explain` and before `## necro fix`.
- done: AC-2

### T3: Confirm style consistency and no regressions elsewhere
- files: `website/src/content/docs/reference/cli.md` (read-only check)
- action: Diff the file to confirm only the two new sections were inserted; compare their heading levels/table structure against `## necro fix`; confirm the MCP tools table and opt-in note (from phase 33) are untouched.
- verify: `git diff -- website/src/content/docs/reference/cli.md` shows only additions between `## necro scan` and `## necro fix` — no deletions/edits to `## necro fix`, `## necro triage`, `## necro refactor`, `## necro mcp`, or the MCP tools table/opt-in note.
- done: AC-3

## Boundaries

- DO NOT touch source code (`src/`, `test/`) — documentation only.
- DO NOT edit any file other than `website/src/content/docs/reference/cli.md`.
- DO NOT invent flags/exit codes not present in `src/cli.ts`'s `explain`/`verify-removal` command definitions.
- DO NOT reorder or edit the existing `## necro scan`, `## necro fix`, `## necro triage`, `## necro refactor`, or `## necro mcp` sections beyond inserting the two new ones between scan and fix.
