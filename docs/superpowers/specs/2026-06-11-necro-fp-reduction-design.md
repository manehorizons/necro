# Design: Real-world false-positive reduction (rec-20260610-008)

**Date:** 2026-06-11
**Recommendation:** rec-20260610-008 — "False-positive reduction: Next.js/NestJS
plugins + monorepo workspace edges"
**Status:** design approved; scope narrowed twice during BUILD on empirical
evidence (NestJS dropped, monorepo split to phase 24 — see "Build-time
findings"). **Active scope: the Next.js plugin.**

## Problem

necro's dead-code axis flags symbols as dead when static reachability can't see
why they're alive. The Next.js blind spot: file-routing entrypoints
(`app/**/page.tsx`, `pages/**`, `middleware.ts`, …) are alive by framework
convention but have no static importer, so the framework's own surface reads as
dead. It is deterministic to detect (no model in the loop), so the validation
corpus runs under `npm test` with no API key and no cost.

## Build-time findings

### NestJS dropped (zero FP)

The original recommendation named a NestJS plugin. Empirical scans of a minimal
NestJS app during BUILD showed **zero false positives**: necro node-ifies only
top-level declarations (classes, functions, …), **not class methods**, and
NestJS DI *requires* every provider/controller to be statically imported into a
`@Module`, which keeps the class alive. The route-handler methods that "look
dead" are never graph nodes. A NestJS plugin would detect the framework and then
do nothing, so it was cut. Evidence: a minimal
`main → AppModule → UsersModule → controller/service` slice scanned to 0
findings, while the Next.js slice produced 4 false-dead.

### Monorepo split to its own phase (phase 24)

The recommendation also named monorepo workspace edges. BUILD scans showed the
*valuable* monorepo FP is the **cross-package alias** case, not member rooting.
On a slice where `@ws/app` imports `@ws/core` and uses one of its symbols:

- `appMain` (executed in the member's own entry) — FP, fixable by rooting member
  entry **files**.
- `usedCrossPackage` (consumed by app via the `@ws/core` alias) — FP, fixable
  **only** by resolving the workspace alias to the member entry and adding a
  cross-package edge.
- `trulyUnused` (genuinely unused) — correctly dead; a fix **must not** suppress
  it.

So member-entry rooting alone fixes only the minor case; the real fix is
alias-edge resolution while preserving true positives. That is a substantial,
self-contained unit and was split to **phase 24** with its own corpus, rather
than shipped half-done here.

## Architecture

The bones already exist and are reused, not rebuilt:

- `FrameworkPlugin` contract (`src/plugins/types.ts`):
  `detect / entryPatterns / resolveEdges / taintRules`.
- `PLUGINS` registry array in `src/engine/index.ts` (today only
  `createTestRunnerPlugin()`).
- `RepoContext` (`hasDep` / `hasConfig` / `packageJsonHas`) for zero-config
  auto-detection.

One new plugin registers into `PLUGINS`; one engine change makes `prod`-kind
plugin entries root the exported symbols of the matched files.

## Unit 1 — Next.js plugin (`src/plugins/nextjs/`)

- **detect:** `hasDep(["next"]) || hasConfig(["next.config.*"])`
- **entryPatterns** (alive-by-convention globs):
  - App Router: `app/**/{page,layout,route,loading,error,template,default,not-found,global-error}.{ts,tsx,js,jsx}`
  - Pages Router: `pages/**/*.{ts,tsx,js,jsx}` (includes `pages/api/**`)
  - Root specials: `middleware.{ts,js}`, `instrumentation.{ts,js}`
  - The `src/`-prefixed variants of the above (Next.js supports a `src/` dir).
- **resolveEdges / taintRules:** none — file routing is pure entrypoints.
- **resolveEdges / taintRules:** none — file routing is pure entrypoints.
- **Engine change required — entry-kind split + export-rooting:** today
  `engine/index.ts` collapses *all* plugin entry globs into **test** entries (it
  ignores `EntrySpec.kind`). Two corrections:
  1. Split entry globs by `kind`: `test` → `testEntries` (unchanged), `prod` →
     a new prod path.
  2. A file being a prod entry does **not** auto-root the symbols *declared* in
     it — a file-path seed only roots symbols *referenced at module top-level*
     (verified: a conventional `src/index.ts` entry's own unused exports are
     still flagged). Framework entry files export components/handlers the
     framework invokes, so the engine must add **the exported symbol ids
     declared in matched prod-entry files** to `prodEntries`, not just the file
     path. Genuinely-dead non-entry symbols are untouched.
- **Risk:** low–medium. The glob set is pure convention; the subtlety is the
  export-rooting primitive, covered by the corpus slice + a regression test.

## Validation — `test/fixtures/fp-realrepo/`

- **Form:** SHA-pinned minimal slice. Real App-Router entry files vendored from
  `vercel/next.js` (`app/page.tsx`, `app/layout.tsx`, `app/api/.../route.ts`)
  plus a trivial scaffold (`package.json` with a `next` dep), recorded in
  `SOURCES.md` with `repo` + commit `sha` + path (mirrors the `triage-realrepo`
  corpus discipline). The slice reproduces 4 false-dead symbols (`Home`,
  `RootLayout`, `metadata`, `GET`).
- **Pattern coverage:** middleware / instrumentation / Pages-Router globs that
  aren't in the corpus slice are covered by a plugin unit test over
  `entryPatterns`.
- **TDD:** scan the slice and assert the 4 symbols are **dead before** the
  plugin (red), then **zero false-dead after** (green).
- **Determinism:** dead-code reachability runs no model → the corpus is a
  normal `npm test` gate, hermetic and free.

### Acceptance bar

- Zero false-dead on the Next.js corpus slice; genuinely-dead non-entry symbols
  still reported.
- **No regression:** existing corpora hold their floors (triage precision, dup
  pass-rate) and the full suite stays green (currently 325 passing).
- Non-Next.js repos behave exactly as before; the test-runner plugin's entries
  stay `test`-kind.

## Boundaries (YAGNI)

- No competitor head-to-head accuracy table (that is the rec-006 fast-follow).
- No NestJS plugin (dropped — zero FP at necro's granularity).
- No monorepo workspace support or cross-package alias edges (phase 24).
- No Remix / SvelteKit / Angular plugins.
- No `FrameworkPlugin` interface extension.
- Public Accuracy-page FP-rate line: optional, only if cheap; not a goal.

## Open risks carried into the build

- The engine entry-kind split + export-rooting must not change behavior for the
  existing test-runner plugin (entries stay `test`-kind) or for non-Next.js
  repos (no `prod`-kind plugin entries → no new roots).
