---
phase: 33-docs-sync
id: 33-01
tier: standard
status: PENDING
---

# 33-01 — Sync every doc surface to HEAD (phases 22-32)

## Objective

Sync README.md, the website docs, and CHANGELOG.md to the shipped state through phase 32 — closing a six-phase documentation lag (missing `explain`/`verify-removal`/`--narrate`, an undercounted MCP tool list, stale "planned" roadmap entries for shipped Next.js/monorepo support, an incomplete CHANGELOG Unreleased section, and a stale version line).

## Acceptance Criteria

### AC-1: README's MCP section lists all 4 shipped tools; Roadmap drops shipped items from Planned
Given README.md's "Use from an AI agent (MCP)" section currently says "Two read-only tools are exposed" (`necro_scan`, `necro_verify` only — confirmed against `src/mcp/tools/*.ts`, which registers 4: `necro_scan`, `necro_verify`, `necro_verify_removal`, `necro_explain`), and README's "Roadmap" section lists "Next.js, NestJS (DI)" under Frameworks and "Monorepo workspace-edge resolution" under Scale as not-yet-implemented (contradicted by `src/plugins/nextjs/` and `src/engine/workspaces.ts`, both shipped)
When README.md is updated
Then the MCP section documents all four tools with a one-line description each, and the Roadmap table moves Next.js support and monorepo workspace-edge resolution out of "Planned" into "Available today" (NestJS stays in Planned — phase 23 only established it's zero-false-positive without a dedicated plugin, not that framework support shipped).

### AC-2: README's stale version line matches the published package
Given README.md line 7 reads "Status: v1.0 — published on npm" while `package.json` and the published npm package are both at 1.1.0
When README.md is updated
Then the line reflects the correct current version.

### AC-3: website reference/cli.md drops shipped features from its "planned" note and lists all 4 MCP tools
Given `website/src/content/docs/reference/cli.md`'s opt-in/cost callout says "An `explain` command, SARIF output, and `--fail-on` gating are planned" (SARIF and `--fail-on` shipped in 1.1.0 per CHANGELOG; `explain` shipped since phase 25) and its MCP tools table lists only `necro_scan`/`necro_verify`
When the page is updated
Then the callout no longer lists any of those three as planned, and the MCP tools table documents all four shipped tools (including `necro_verify_removal`'s per-symbol build-green check and `necro_explain`'s `--narrate` option).

### AC-4: website roadmap.md's Available/Planned lists reflect shipped explain, verify-removal, and framework/monorepo support
Given `website/src/content/docs/guide/roadmap.md`'s "Available today" list omits `explain`/`--narrate`/`verify-removal`, and its "Planned" table lists Next.js under Frameworks and monorepo workspace-edge resolution under Scale
When the page is updated
Then "Available today" gains entries for `necro explain` (with `--narrate`) and `necro verify-removal`, and the "Planned" table drops Next.js from Frameworks (NestJS stays) and drops monorepo workspace-edge resolution from Scale.

### AC-5: CHANGELOG's [1.2.0] Unreleased section covers phases 22-32
Given CHANGELOG.md's `## [1.2.0] — Unreleased` section currently documents only the fail-closed entry-resolution work and omits `explain`, `--narrate`, `verify-removal`, the `fix --verify` gate, the verify-removal exit-code fix, the `--checks` repeatable-flag fix, and the new `ci.yml`
When CHANGELOG.md is updated
Then the Unreleased section gains entries for each of those shipped phase-22-through-32 features, with the existing fail-closed-entry-resolution entries left intact.

## Tasks

### T1: README — 4 MCP tools, version line, Roadmap table
- files: `README.md`
- action: Rewrite the "Use from an AI agent (MCP)" section (~L182-210) to document all four tools (`necro_scan`, `necro_verify`, `necro_verify_removal`, `necro_explain`) instead of "Two read-only tools are exposed". Fix the "Status: v1.0" line (~L7) to the correct published version. In the "Roadmap" section (~L330-360), move Next.js support and monorepo workspace-edge resolution out of the "Planned" table into "Available today" (NestJS stays under Planned).
- verify: `grep -c "necro_verify_removal\|necro_explain" README.md` ≥ 2; `grep "Status: v1\." README.md` matches the current `package.json` version; `grep -A8 "Frameworks" README.md` no longer lists Next.js, and a Monorepo/workspace-edge line no longer appears under Planned.
- done: AC-1, AC-2

### T2: website reference/cli.md — drop shipped items from "planned", 4-tool MCP table
- files: `website/src/content/docs/reference/cli.md`
- action: Update the opt-in/cost callout (~L205-210) to stop listing `explain`, SARIF output, and `--fail-on` as planned. Expand the MCP tools table (~L190-193) to all four tools, including `necro_verify_removal` (per-symbol build-green check) and `necro_explain` (with its `--narrate` option).
- verify: `grep "are planned" website/src/content/docs/reference/cli.md` no longer mentions explain/SARIF/--fail-on; the MCP table has 4 rows (`necro_scan`, `necro_verify`, `necro_verify_removal`, `necro_explain`).
- done: AC-3

### T3: website guide/roadmap.md — Available/Planned lists
- files: `website/src/content/docs/guide/roadmap.md`
- action: Add `necro explain` (with `--narrate`) and `necro verify-removal` to "Available today". In the "Planned" table, drop Next.js from the Frameworks row (keep NestJS) and drop monorepo workspace-edge resolution from the Scale row.
- verify: `grep "explain\|verify-removal" website/src/content/docs/guide/roadmap.md` appears under "Available today"; the Planned table's Frameworks row no longer says Next.js, and no Scale row mentions monorepo workspace-edge resolution.
- done: AC-4

### T4: CHANGELOG.md — fill out [1.2.0] Unreleased
- files: `CHANGELOG.md`
- action: Add entries under the existing `## [1.2.0] — Unreleased` heading (do not create a new heading or touch released sections) for: `explain` (witness-chain trace), `--narrate` (LLM narrative layer, degrades gracefully with no key), `verify-removal` (per-symbol worktree build-green check, exit-code fix), the `fix --write --verify` gate, the `--checks` repeatable-flag fix (was comma-split), and the new `ci.yml` (typecheck+build+test on push/PR).
- verify: `grep -c "explain\|narrate\|verify-removal\|--checks\|ci.yml" CHANGELOG.md` shows new bullets under `[1.2.0] — Unreleased`; `git diff CHANGELOG.md` touches only the Unreleased section, no other version headings.
- done: AC-5

## Boundaries

- DO NOT touch source code (`src/`, `test/`) — documentation only.
- DO NOT bump `package.json`'s version or edit CHANGELOG's already-released sections (`[1.1.0]` and earlier).
- DO NOT modify GitHub Pages settings or `.github/workflows/docs.yml` — Pages is already live at https://manehorizons.github.io/necro/.
- DO NOT list NestJS as "available" in any roadmap surface.
