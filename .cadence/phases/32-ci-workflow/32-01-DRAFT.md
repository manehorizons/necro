---
phase: 32-ci-workflow
id: 32-01
tier: standard
status: PENDING
---

# 32-01 — Add ci.yml — typecheck + build + test on every push/PR

## Objective

Add a CI workflow that runs typecheck, build, and the test suite on every push and pull request, closing the gap where `npm test` currently only executes in the tag-triggered release job (rec-20260701-001).

## Acceptance Criteria

### AC-1: ci.yml triggers on push and pull_request
Given a new `.github/workflows/ci.yml` file
When a commit is pushed to `main` or a pull request is opened/updated against `main`
Then the workflow's `on:` block includes both `push` (branches: [main]) and `pull_request` triggers.

### AC-2: workflow runs typecheck, build, and test
Given `ci.yml`'s `ci` job
When it executes
Then it runs `npm run typecheck`, `npm run build`, and `npm test` (via `npm ci` install) as separate steps, in that order, on `ubuntu-latest` with Node 20 (matching `release.yml`'s node-version and npm cache setup).

### AC-3: workflow YAML is structurally valid and steps match real scripts
Given the committed `ci.yml`
When parsed as YAML and cross-checked against `package.json`'s `scripts` block
Then it parses without error and every `run:` command it invokes (`npm ci`, `npm run typecheck`, `npm run build`, `npm test`) is a real, currently-passing script.

### AC-4: does not disturb existing workflows
Given `docs.yml`, `necro-scan.yml`, and `release.yml`
When `ci.yml` is added
Then none of the three existing workflow files are modified, and no job name / concurrency group collides with them.

## Tasks

### T1: Add .github/workflows/ci.yml
- files: `.github/workflows/ci.yml`
- action: Create a new workflow named `CI` triggered on `push` (branches: `[main]`) and `pull_request`, with a single `ci` job on `ubuntu-latest` using `actions/checkout@v5` + `actions/setup-node@v5` (node-version 20, `cache: npm`), then steps `npm ci`, `npm run typecheck`, `npm run build`, `npm test`, following the same action versions/style as `release.yml`.
- verify: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` exits 0; manually diff the step commands against `package.json`'s `scripts` block to confirm each one exists verbatim.
- done: AC-1, AC-2, AC-3

### T2: Confirm no collision with existing workflows and the invoked scripts actually pass
- files: `.github/workflows/docs.yml`, `.github/workflows/necro-scan.yml`, `.github/workflows/release.yml` (read-only — not edited)
- action: Diff the new file against the three existing workflows for job-name/concurrency-group collisions; run `npm run typecheck && npm run build && npm test` locally to confirm the exact commands `ci.yml` invokes are green on current `main`.
- verify: `git diff --stat` shows only `.github/workflows/ci.yml` added, zero lines changed in `docs.yml`/`necro-scan.yml`/`release.yml`; local `npm run typecheck && npm run build && npm test` all exit 0.
- done: AC-4

## Boundaries

- DO NOT modify `docs.yml`, `necro-scan.yml`, or `release.yml`.
- DO NOT change `package.json` scripts — reuse the existing `typecheck`/`build`/`test` scripts as-is.
- DO NOT add a status-check branch-protection rule (GitHub repo settings) — out of scope for this phase, source-only change.
