---
phase: 54-toolchain-hygiene
id: 54-01
tier: standard
status: PENDING
---

# 54-01 — Toolchain hygiene bundle: Biome, Dependabot, CI matrix, self-scan gate

## Objective

Close four toolchain-hygiene gaps identified in the 2026-07-01 audit (P2-16): no lint/format enforcement, no dependency-update automation, a single-Node CI matrix, and a necro-scan CI gate that never fails on its own findings.

## Acceptance Criteria

### AC-1: Biome lints and formats the repo with zero findings
Given Biome is added as a devDependency with a `biome.json` config scoped to `src/`
When `npx biome check src` is run
Then it exits 0 with zero lint/format findings (matching the style already maintained by hand), and CI runs it on every PR.

### AC-2: Dependabot opens update PRs for npm and GitHub Actions
Given `.github/dependabot.yml` declares `package-ecosystem: npm` and `package-ecosystem: github-actions`
When Dependabot next runs (verified via `gh api repos/:owner/:repo/dependabot/... ` or the Insights > Dependency graph > Dependabot tab)
Then it is configured to check both ecosystems on a weekly schedule.

### AC-3: CI validates the `engines.node` claim across the matrix verify-removal's worktrees actually touch
Given `package.json` declares `"engines": {"node": ">=20"}`
When `ci.yml`'s `ci` job runs
Then it runs on a matrix of Node 20/22/24 × ubuntu-latest/macos-latest (6 combinations), all green.

### AC-4: necro-scan.yml gates on its own findings instead of running with `fail-on: ""`
Given a `necro.config.json` at repo root declares `entries: ["src/cli.ts"]` (necro's real entry point — its `bin` resolves to `dist/cli.js`, which has no conventional `src/index.ts` equivalent, so today's self-scan resolves zero production entries and is non-discriminating; see prior finding in `[[necro-self-scan-degenerate]]`)
When `necro-scan.yml` runs `necro scan` with `fail-on: high` against `src`
Then production entries resolve to a non-zero count (not the degenerate zero-entry case) and the workflow fails the PR only on `high`-severity findings, not on every `maybe`.

## Tasks

### T1: Add Biome, config, and CI step
- files: `package.json`, `biome.json` (new), `.github/workflows/ci.yml`
- action: `npm install -D @biomejs/biome`; add `biome.json` scoped to `src/**` matching current style (double quotes, existing indent width — infer from an existing file); add an `npm run lint` script; run it once and fix any findings so it starts at zero; add a `Lint` step to `ci.yml`'s `ci` job.
- verify: `npm run lint` exits 0 locally and in CI.
- done: AC-1

### T2: Add Dependabot config
- files: `.github/dependabot.yml` (new)
- action: declare weekly update checks for `npm` (root directory) and `github-actions` (`.github/workflows`).
- verify: `git show` the file; optionally validate via GitHub's dependabot.yml schema (no live PR needed to satisfy this AC — config presence + correct schema is sufficient).
- done: AC-2

### T3: Expand CI to a Node × OS matrix
- files: `.github/workflows/ci.yml`
- action: replace the single `node-version: 20` / `runs-on: ubuntu-latest` with a `strategy.matrix` over `node-version: [20, 22, 24]` and `os: [ubuntu-latest, macos-latest]`; keep `npm ci` → typecheck → build → test steps unchanged.
- verify: push/PR triggers 6 CI jobs, all green (confirm via `gh run list` / `gh run view` after a push, or a `workflow_dispatch` dry run if not pushing yet).
- done: AC-3

### T4: Seed necro's self-scan entry and enable a real fail-on
- files: `necro.config.json` (new, repo root), `.github/workflows/necro-scan.yml`
- action: add `necro.config.json` with `{"entries": ["src/cli.ts"]}`; change `necro-scan.yml`'s `fail-on: ""` to `fail-on: high`; remove/update the now-stale comment explaining why fail-on was empty; run `node dist/cli.js scan --path src` locally first to confirm entries resolve to a non-zero count and check what (if anything) is `high`-severity before wiring the gate, so the first gated PR doesn't fail on unrelated pre-existing findings.
- verify: local scan shows non-degenerate entry resolution (not "0 production references" on every finding); CI `necro scan` job on this PR passes with `fail-on: high` wired in.
- done: AC-4

## Boundaries

- Do NOT change detector logic, thresholds, or the reachability resolver itself — T4 only adds a config escape hatch (`entries`), it does not touch `src/engine/prod-entries.ts`.
- Do NOT enable Biome's import-sorting or other opinionated rules beyond lint+format if they'd cause large unrelated diffs — scope Biome to catching real issues, not a repo-wide reformat.
- Do NOT add Windows to the CI matrix — audit finding specifically calls out "platforms verify-removal's worktrees actually touch" (ubuntu/macos).
