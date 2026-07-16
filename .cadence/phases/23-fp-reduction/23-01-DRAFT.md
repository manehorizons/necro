---
phase: 23-fp-reduction
id: 23-01
tier: complex
---

# 23-01 — Real-world false-positive reduction: Next.js framework plugin

> Scope narrowed twice during BUILD on empirical evidence:
> - **NestJS dropped:** a minimal NestJS app scans to 0 findings (DI forces
>   static imports; necro doesn't node-ify methods).
> - **Monorepo split to its own phase:** the valuable monorepo FP is the
>   cross-package alias-edge case (a consumed `@scope/pkg` symbol reads dead);
>   member-entry rooting alone fixes only the minor executed-entry case, and the
>   alias-edge work + "keep true positives dead" deserves a dedicated phase.
> Active scope: the Next.js plugin — 4 confirmed false-dead on a real slice.

## Objective

Eliminate necro's structural false-"dead" findings on Next.js repos by adding a
Next.js framework plugin whose file-routing entrypoints root the **exported
symbols** declared in those files — validated to zero false-dead on a
SHA-pinned real-repo corpus, with no regression elsewhere.

## Acceptance Criteria

### AC-1: Next.js file-routing entry exports are alive
Given a Next.js repo slice (`next` dep or `next.config.*`) whose App/Pages
router files and root specials (`middleware`, `instrumentation`) have no static
importer
When `scan` runs with the Next.js plugin registered
Then every symbol exported by those convention files is treated as a prod root
and none is reported dead (they read as `likely` dead without the plugin),
while genuinely-dead non-entry symbols are still reported.

### AC-2: No regression on non-Next.js repos and existing corpora
Given a repo with no detected Next.js framework
When `scan` runs
Then prod-entry resolution and findings are unchanged from current behavior, the
existing test-runner plugin's entries stay test-kind, the triage/dup corpora
hold their floors, and the full suite stays green.

## Tasks

### T1: SHA-pinned Next.js FP corpus (red baseline)
- files: `test/fixtures/fp-realrepo/nextjs-app/`,
  `test/fixtures/fp-realrepo/SOURCES.md`
- action: vendor real, SHA-pinned App-Router entry files from `vercel/next.js`
  (`app/page.tsx`, `app/layout.tsx`, `app/api/.../route.ts`) plus a minimal
  scaffold (`package.json` with `next` dep); record repo + sha + path in
  SOURCES.md. The slice reproduces 4 false-dead symbols (`Home`, `RootLayout`,
  `metadata`, `GET`).
- verify: scanning the slice with the current engine flags those 4 as dead.
- done: AC-1

### T2: Next.js plugin + engine prod-entry export-rooting
- files: `src/plugins/nextjs/index.ts`, `src/engine/index.ts`, `test/fp-realrepo.test.ts`
- action: implement the `FrameworkPlugin` (detect via `hasDep(["next"])` /
  `hasConfig(["next.config.*"])`; `entryPatterns` for App Router special files,
  Pages Router, `src/` variants, and root specials `middleware`/`instrumentation`,
  all `kind: "prod"`); register it in `PLUGINS`. In the engine, split plugin
  entry globs by `kind`: `test` → `testEntries` (unchanged); `prod` → match
  files, then add **the exported symbol ids declared in those files** to
  `prodEntries` (entry files do not auto-root their own declared exports — a
  file-path seed only roots top-level references, so framework-exported
  components/handlers need symbol-level rooting).
- verify: AC-1 test — the Next.js slice reports zero false-dead; a unit test
  asserts the plugin's entryPatterns cover page/layout/route/middleware/pages.
- done: AC-1

### T3: Regression guard
- files: `test/engine.test.ts` or `test/fp-realrepo.test.ts`
- action: assert a non-Next.js single-package repo's prod-entry resolution and
  findings are unchanged, the test-runner plugin's entries remain test-kind, and
  run the existing triage/dup corpus gates.
- verify: AC-2 test + full suite green (≥325).
- done: AC-2

## Boundaries

- DO NOT add a NestJS plugin (dropped — zero FP at necro's granularity).
- DO NOT implement monorepo workspace support or cross-package alias edges (its
  own phase).
- DO NOT extend the `FrameworkPlugin` interface.
- DO NOT add Remix/SvelteKit/Angular plugins or a competitor head-to-head table.
- DO NOT change behavior for repos with no detected Next.js framework, and DO
  NOT change the test-runner plugin's test-kind entries.
- DO NOT require an API key or network at test time — the corpus is vendored and
  deterministic under `npm test`.
