---
phase: 35-cut-v1.2.0
id: 35-01
tier: standard
status: PENDING
---

# 35-01 — Cut v1.2.0 — version bump, CHANGELOG finalize, release-shape test fix

## Objective

Prepare the v1.2.0 release — bump `package.json`'s version, finalize CHANGELOG's `[1.2.0]` heading from "Unreleased" to a release date, and fix `release-shape.test.ts`'s frozen "Unreleased" assertion — so the repo is publish-ready. The actual `git tag`/push that triggers `release.yml`'s live `npm publish` is a separate, explicitly user-confirmed step **outside** this phase.

## Acceptance Criteria

### AC-1: package.json version bumped, nothing else changed
Given `package.json`'s `version` field is `"1.1.0"`
When updated
Then it reads `"1.2.0"` and no other field (`name`, `bin`, `files`, `scripts`, etc.) changes.

### AC-2: CHANGELOG's [1.2.0] heading finalized to a release date, content byte-identical
Given `CHANGELOG.md`'s `## [1.2.0] — Unreleased` heading
When updated
Then the heading reads `## [1.2.0] — 2026-07-17`, every bullet underneath it is left byte-identical, and no other version heading (`[1.1.0]` and earlier) is touched.

### AC-3: release-shape.test.ts's frozen "Unreleased" assertion is relaxed, not deleted
Given `test/release-shape.test.ts` L46 currently does `expect(changelog).toContain("## [1.2.0] — Unreleased")` — a literal string that cannot survive the release ever actually shipping
When updated
Then the assertion instead matches the `## [1.2.0]` heading regardless of its Unreleased-vs-date suffix (e.g. a regex), while the rest of that test (the fail-closed-entry-resolution content checks on L48-52) is unchanged and still passes.

### AC-4: full suite stays green after all three changes
Given the version bump, CHANGELOG finalize, and test fix
When `npm run typecheck && npm run build && npm test` is run
Then all three pass — matching the 439-passed/6-skipped baseline, with the "CLI/MCP version is sourced from package.json and cannot drift" test (L27-31) now asserting `1.2.0`.

## Tasks

### T1: Bump package.json version
- files: `package.json`
- action: Change `version` from `"1.1.0"` to `"1.2.0"`. Touch no other field.
- verify: `git diff package.json` shows only the version line changed; `node -p "require('./package.json').version"` prints `1.2.0`.
- done: AC-1

### T2: Finalize CHANGELOG's [1.2.0] heading
- files: `CHANGELOG.md`
- action: Change `## [1.2.0] — Unreleased` to `## [1.2.0] — 2026-07-17`. Touch no bullet content, no other heading.
- verify: `git diff CHANGELOG.md` shows a single-line heading change; `grep "## \[1.2.0\]" CHANGELOG.md` shows the dated heading.
- done: AC-2

### T3: Confirm the frozen test goes red, then relax its assertion
- files: `test/release-shape.test.ts`
- action: After T1/T2, run the suite once to confirm L46's `toContain("## [1.2.0] — Unreleased")` now fails (red, expected). Then change that line to match the `## [1.2.0]` heading regardless of Unreleased-vs-date suffix (e.g. `expect(changelog).toMatch(/## \[1\.2\.0\][^\n]*\n/)`), leaving L47-52's content checks untouched.
- verify: `npx vitest run test/release-shape.test.ts` — all tests in this file pass after the fix (confirm it was red before, green after).
- done: AC-3

### T4: Full suite green
- files: none (verification only)
- action: Run `npm run typecheck && npm run build && npm test`.
- verify: All three exit 0; test count matches the 439-passed/6-skipped baseline (same count, contents differ only in the version-drift test now asserting 1.2.0).
- done: AC-4

## Boundaries

- DO NOT run `git tag` or `git push --tags` — that's the separate, explicitly-confirmed publish step after this phase settles.
- DO NOT touch any file other than `package.json` (version field), `CHANGELOG.md` (heading line), and `test/release-shape.test.ts` (one assertion).
- DO NOT add a new `## [Unreleased]` placeholder heading to CHANGELOG.md.
- DO NOT touch `.github/workflows/release.yml` or any other workflow file.
