# Changelog

All notable changes to `@manehorizons/necro` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/).

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
