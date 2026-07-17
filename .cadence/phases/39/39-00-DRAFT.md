---
phase: 39
id: 39-00
tier: standard
status: PENDING
---

# 39-00 — Coverage in CI + scheduled live-accuracy gate

## Objective

Add vitest coverage tooling gated in CI, and a scheduled workflow that runs the existing `*.live.test.ts` accuracy gates weekly so regressions trip a wire instead of drifting silently.

## Acceptance Criteria

### AC-1: Coverage tooling runs in CI with enforced thresholds
Given `vitest.config.ts` has no coverage config and `package.json` has no `@vitest/coverage-v8` or `test:coverage` script
When `npm run test:coverage` runs (locally or in `ci.yml`)
Then it produces `text` + `lcov` coverage reports under `coverage/`, and the run fails if coverage on `src/discover.ts`, `src/glob.ts`, `src/prod-entries.ts`, `src/parse.ts`, and the MCP `scan`/`verify-removal` handlers drops below a checked-in threshold, with `ci.yml`'s `Test` step invoking it instead of plain `npm test`.

### AC-2: Scheduled live-accuracy gate runs weekly and on demand
Given `test/triage-eval.live.test.ts` and `test/refactor-eval.live.test.ts` exist, self-skip without `ANTHROPIC_API_KEY`, and are wired into no workflow today
When Monday 06:00 UTC arrives, or a maintainer manually triggers the workflow
Then `.github/workflows/live-accuracy.yml` checks out, installs, builds, and runs both live test files with `ANTHROPIC_API_KEY` sourced from `secrets.ANTHROPIC_API_KEY`, failing the run if either file's accuracy gate regresses, and no-oping cleanly (tests self-skip, workflow still exits 0) if the secret is unset.

## Tasks

### T1: Add vitest coverage tooling with enforced thresholds
- files: `package.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, `test/coverage-config.test.ts`
- action: add `@vitest/coverage-v8` devDependency; add a `coverage` block to `vitest.config.ts` (`provider: "v8"`, `reporter: ["text", "lcov"]`, `reportsDirectory: "coverage"`, `include` covering `src/discover.ts`, `src/glob.ts`, `src/engine/prod-entries.ts`, `src/syntactic/parse.ts`, `src/mcp/tools/scan.ts`, `src/mcp/tools/verify.ts`, and per-file `thresholds` set as a regression floor just under a baseline `npm run test:coverage` run — not an aspirational target); add a `"test:coverage": "vitest run --coverage"` script; change `ci.yml`'s `Test` step from `npm test` to `npm run test:coverage`. Write `test/coverage-config.test.ts` importing the vitest config to assert `coverage.thresholds` keys cover all six modules.
- verify: `npm run test:coverage` exits 0, writes `coverage/lcov.info`, and prints a text summary; `npm test` (which now includes `coverage-config.test.ts`) passes.
- done: AC-1

### T2: Add scheduled live-accuracy workflow
- files: `.github/workflows/live-accuracy.yml` (new), `test/live-accuracy-workflow.test.ts` (new)
- action: create a workflow triggered on `schedule` (`cron: "0 6 * * 1"`, weekly Monday 06:00 UTC) and `workflow_dispatch`; steps: checkout, setup-node@20, `npm ci`, `npm run build`, then `npx vitest run test/triage-eval.live.test.ts test/refactor-eval.live.test.ts` with `env: { ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }} }`. Write `test/live-accuracy-workflow.test.ts` that reads the raw YAML and asserts it contains the cron schedule, `workflow_dispatch`, `secrets.ANTHROPIC_API_KEY`, and both live test file paths.
- verify: new test passes; `npm run typecheck` stays green (no source changes, workflow YAML only).
- done: AC-2

## Boundaries

- DO NOT modify `.github/workflows/docs.yml`, `necro-scan.yml`, or `release.yml`.
- DO NOT change `ci.yml`'s `on:` triggers (push to main + pull_request) — only its `Test` step.
- DO NOT gate CI on `necro scan`-ing necro's own source (self-scan is known-degenerate per prior audit) — coverage enforcement is vitest's own `coverage.thresholds` only.
- DO NOT add a YAML-parsing dependency for `live-accuracy-workflow.test.ts` — assert against the raw file text/string content, consistent with `test/scan-ci.test.ts`'s file-based assertion style.
