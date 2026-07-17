---
phase: 36-post-release-doc-sync
id: 36-01
tier: standard
status: PENDING
---

# 36-01 — Post-release sync: README version line, package-lock.json, Pages deploy

## Objective

Close out the v1.2.0 release: fix README's stale version line, regenerate `package-lock.json` to match `package.json`'s bumped version, and redeploy the live GitHub Pages docs site — which has been stuck at its 2026-06-11 build (six weeks and phases 22-35 stale) because `docs.yml`'s deploy job only runs on manual `workflow_dispatch`.

## Acceptance Criteria

### AC-1: README's version line matches the shipped package
Given `README.md`'s line 7 reads `Status: v1.1` (stale since phase 35 bumped `package.json` to 1.2.0)
When updated
Then it reads `Status: v1.2`.

### AC-2: package-lock.json matches package.json's version
Given `package-lock.json`'s root `version` field is still `"1.1.0"` (never regenerated after phase 35 hand-edited `package.json`)
When regenerated
Then its root and root-package `version` fields read `"1.2.0"`, `npm ci` still succeeds cleanly, and no dependency versions change (a version-only bump, not a dependency update).

### AC-3: live Pages docs site is redeployed and reflects current content
Given the `github-pages` environment's last deployment (sha `02b91961...`, 2026-06-11) predates phases 22-35 entirely, and `docs.yml`'s deploy job only runs on `workflow_dispatch` (push-triggered runs only validate the build)
When `docs.yml` is manually dispatched
Then a new `github-pages` deployment lands at the current `HEAD` commit, and the live site (https://manehorizons.github.io/necro/) serves content matching the current repo (e.g. the CLI reference page shows the `necro explain`/`necro verify-removal` sections added in phase 34).

## Tasks

### T1: Fix README version line
- files: `README.md`
- action: Change line 7's `Status: v1.1` to `Status: v1.2`.
- verify: `grep "Status: v1" README.md` shows `v1.2`.
- done: AC-1

### T2: Regenerate package-lock.json
- files: `package-lock.json`
- action: Run `npm install --package-lock-only` (version-only bump; no dependency changes) to sync the lockfile's version fields to `package.json`'s `1.2.0`.
- verify: `grep -m2 '"version"' package-lock.json` shows `1.2.0` for the root entries; `git diff package-lock.json` touches only version fields, not dependency entries; `npm ci` succeeds.
- done: AC-2

### T3: Redeploy the live Pages site
- files: none (operational — GitHub Actions dispatch)
- action: `gh workflow run docs.yml` on `main`, wait for the run to complete, then confirm a new `github-pages` deployment was created at current `HEAD`.
- verify: `gh api repos/manehorizons/necro/deployments --jq '.[0].sha'` matches current `HEAD`; `curl -s https://manehorizons.github.io/necro/reference/cli/` contains `necro explain` and `necro verify-removal`.
- done: AC-3

## Boundaries

- DO NOT touch dependency versions in `package-lock.json` — version-field sync only.
- DO NOT modify `.github/workflows/docs.yml` itself — dispatch it as-is.
- DO NOT re-tag or re-publish to npm — that already happened in phase 35; this phase is docs/lockfile only.
