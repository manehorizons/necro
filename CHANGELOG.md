# Changelog

All notable changes to `@manehorizons/necro` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/).

## [1.2.0] — Unreleased

### Added
- **Fail-closed entry resolution.** When zero production entry points resolve
  on a non-empty codebase, `scan` demotes every dead-code finding to `maybe`
  (never auto-fix eligible), prints a warning banner naming the fix, and
  `fix --write` refuses (exit `3`) instead of guessing — closing a bug where
  necro's own repo (and any `dist/`-pointing manifest with a non-conventional
  source entry) collapsed to zero prod entries and made `fix --write` eligible
  to mass-delete correct code.
- `resolveProdEntries` now maps compiled manifest entries (`main`/`module`/
  `bin`/`exports`) back to their TypeScript source via `tsconfig.json`
  `outDir`/`rootDir` (one level of local `extends`), with a `dist|build|out →
  src` heuristic fallback when there's no tsconfig — both existence-gated
  against the scanned files, never guessing into undiscovered paths.
- `package.json` `scripts` values are mined for additional entry-point tokens
  (e.g. `"bench": "tsx src/bench.ts"`).
- `necro.config.json` gains an `entries: string[]` field — globs declaring
  production entry points directly, the canonical fix for the warning banner.
- `scan` reports `diagnostics.entryResolution` (`prodEntryCount`, per-entry
  `{file, source}`, `collapsed`) in terminal, `--json`, and `--sarif`
  (`runs[0].properties.entryResolution`) output.
- `fix`'s exit codes are now a documented public contract: `0`
  written/preview/nothing-to-fix, `1` unexpected error, `2` refused-dirty,
  `3` refused-no-entries (no-entries always wins over a dirty tree).
- **`necro explain <symbol>`** (CLI + MCP `necro_explain`). Traces the
  reachability witness chain for an alive symbol, or annotated inbound
  referrers for a dead one — the same structured result over CLI, `--json`,
  and the MCP tool (no logic fork).
- **`--narrate`** on `explain` (CLI + MCP `narrate: true`). Adds an additive
  LLM plain-English explanation of the verdict; degrades gracefully (static
  trace still renders, `narrative: null` in `--json`) when no API key is set.
- **`necro verify-removal <symbols...>`** (CLI + MCP `necro_verify_removal`).
  For each named symbol, plans its removal and verifies independently in its
  own throwaway git worktree — a per-symbol green/red/unresolved verdict
  proving a deletion keeps the build green before you apply it. `verify-removal`
  now exits non-zero when any symbol comes back red (previously always
  exited `0`, even on a red verdict).
- **`fix --write --verify`**: gates automatic removal on `verify-removal`'s
  per-symbol build-green check — only symbols that verify green are deleted;
  red or unresolved symbols are skipped, not removed blind.
- `fix --checks` and `verify-removal --checks` now accept a repeatable flag
  (`--checks "npm test" --checks "npm run lint"`) instead of comma-splitting a
  single value — a check command containing a comma is now run verbatim.
- **CI**: `.github/workflows/ci.yml` runs `typecheck` + `build` + `test` on
  every push to `main` and every pull request, closing the gap where the test
  suite previously only ran in the tag-triggered release job.

## [1.1.0] — 2026-06-11

### Added
- **CI/PR citizen.** `scan --sarif <file>` emits a schema-valid SARIF 2.1.0
  report for GitHub code-scanning.
- `scan --fail-on <high|medium|low>` gates the exit code on a unified severity
  scale (high = certain-dead; medium = likely-dead + complexity; low = the rest).
- A composite GitHub Action (`manehorizons/necro/.github/actions/necro`) that
  runs necro and uploads SARIF to code-scanning.

## [1.0.1] — 2026-06-11

### Changed
- Add this changelog. First release published through the automated
  tag → build → publish GitHub Actions workflow (with npm provenance);
  `1.0.0` was published by hand.

## [1.0.0] — 2026-06-11

First public release on npm as `@manehorizons/necro`.

### Added
- TypeScript dead-code analysis with confidence tiers (`certain` / `likely` /
  `maybe`), evidence chains, and the `test-only` verdict.
- Complexity, risk-hotspot (CRAP × git churn), and Type-2 duplication detectors.
- `fix` — safe removal of `certain`-dead code (preview by default, dirty-tree guard).
- `triage` — opt-in LLM resolution of `maybe` findings.
- `refactor` — LLM god-function splits and extract-duplicate, verified in a
  scratch worktree.
- `mcp` — read-only MCP server exposing `necro_scan` and `necro_verify` for AI agents.
