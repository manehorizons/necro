# Design: Real-world false-positive reduction (rec-20260610-008)

**Date:** 2026-06-11
**Recommendation:** rec-20260610-008 — "False-positive reduction: Next.js/NestJS
plugins + monorepo workspace edges"
**Status:** design approved (brainstorm) — pending CADENCE DRAFT

## Problem

necro's dead-code axis flags symbols as dead when static reachability can't see
why they're alive. On real-world repos three structural blind spots dominate the
false-positive (false-"dead") rate:

1. **Next.js** — file-routing entrypoints (`app/**/page.tsx`, `pages/**`,
   `middleware.ts`, …) are alive by framework convention but have no static
   importer, so the framework's own surface reads as dead.
2. **NestJS** — controller route-handler methods (`@Get`/`@Post`/…) and
   lifecycle hooks (`onModuleInit`, …) are invoked by the framework, never by
   user code, so they read as uncalled → dead.
3. **Monorepos** — `resolveProdEntries` reads only the *root* `package.json`.
   Each workspace member's own `main`/`module`/`exports`/`bin` is invisible, so
   sub-package public APIs read as dead.

All three are deterministic to detect (no model in the loop), so the whole
validation corpus runs under `npm test` with no API key and no cost.

## Architecture

The bones already exist and are reused, not rebuilt:

- `FrameworkPlugin` contract (`src/plugins/types.ts`):
  `detect / entryPatterns / resolveEdges / taintRules`.
- `PLUGINS` registry array in `src/engine/index.ts` (today only
  `createTestRunnerPlugin()`).
- `RepoContext` (`hasDep` / `hasConfig` / `packageJsonHas`) for zero-config
  auto-detection.

Two new plugins register into `PLUGINS`; one engine extension widens prod-entry
resolution to workspace members.

## Unit 1 — Next.js plugin (`src/plugins/nextjs/`)

- **detect:** `hasDep(["next"]) || hasConfig(["next.config.*"])`
- **entryPatterns** (alive-by-convention globs):
  - App Router: `app/**/{page,layout,route,loading,error,template,default,not-found,global-error}.{ts,tsx,js,jsx}`
  - Pages Router: `pages/**/*.{ts,tsx,js,jsx}` (includes `pages/api/**`)
  - Root specials: `middleware.{ts,js}`, `instrumentation.{ts,js}`
  - The `src/`-prefixed variants of the above (Next.js supports a `src/` dir).
- **resolveEdges / taintRules:** none — file routing is pure entrypoints.
- **Risk:** lowest. Pure glob entrypoints, no interface stress.

## Unit 2 — NestJS plugin (`src/plugins/nestjs/`)

- **detect:** `hasDep(["@nestjs/core"])`
- The FP source is **method-level**, not class-level: provider/controller
  classes are statically imported into their `@Module` (already reachable), but
  their decorator-invoked **route handlers** and **lifecycle hooks** have no
  in-code caller.
- The current glob-based `entryPatterns` cannot express a method-level signal.
  **Decision (v1):** model these as a `taintRule` that **downgrades** symbols in
  decorator-marked handler regions to `maybe` rather than killing them. This
  stays inside the existing interface and is conservative — it never asserts a
  symbol is definitively alive, only that necro should not call it dead.
- **Deferred alternative:** a symbol-predicate entry that marks decorated
  handlers definitively alive would require extending the `FrameworkPlugin`
  interface. Noted as a possible fast-follow, not done here.
- **Risk:** highest unit. The taint-region matching against decorated methods is
  the part most likely to need iteration.

## Unit 3 — Monorepo workspace edges (`src/engine/prod-entries.ts`)

- Detect workspace layout: `workspaces` field (npm/yarn) in root `package.json`,
  and `pnpm-workspace.yaml` (pnpm). Enumerate member directories from their
  globs.
- **Root each member independently:** resolve every member's own
  `package.json` `main` / `module` / `exports` / `bin` as prod entries (the same
  logic `manifestEntries` already applies to the root, applied per member).
  This alone removes the bulk of monorepo FPs — each package's public API
  becomes a reachability root.
- **Out of scope (v1):** cross-package alias (`@scope/pkg`) import →
  member-entry **edge** resolution. Rooting members is sufficient for the FP
  reduction; alias-edge resolution is a stretch/fast-follow.
- **Risk:** medium. Touches a global code path (`resolveProdEntries`); must not
  regress single-package repos (the root case stays exactly as today when no
  workspaces are declared).

## Validation — `test/fixtures/fp-realrepo/`

- **Form:** extracted **minimal slices**. Per case, a small provenance-stamped
  file tree (framework entrypoint + the falsely-dead file(s) + just enough
  structure to reproduce the FP), pulled from a real repo and recorded in
  `SOURCES.md` with `repo` + commit `sha` + path (mirrors the
  `triage-realrepo` corpus discipline).
- **Coverage:** at least one slice per unit (Next.js App Router page, NestJS
  controller handler, pnpm/yarn workspace member) — ideally a couple per unit
  spanning the router variants.
- **TDD per slice:** scan the slice and assert the specific symbols are reported
  **dead before** the plugin (red), then **zero false-dead after** (green).
- **Determinism:** dead-code reachability runs no model → the corpus is a
  normal `npm test` gate, hermetic and free.

### Acceptance bar

- Zero false-dead on the `fp-realrepo` corpus.
- **No regression:** existing corpora hold their floors (triage precision, dup
  pass-rate) and the full suite stays green (currently 325 passing).
- Single-package (non-workspace, non-framework) repos behave exactly as before.

## Boundaries (YAGNI)

- No competitor head-to-head accuracy table (that is the rec-006 fast-follow).
- No Remix / SvelteKit / Angular plugins.
- No cross-package dead-code *detection* refinement beyond rooting members.
- No `FrameworkPlugin` interface extension (NestJS uses taint within the
  existing contract).
- Public Accuracy-page FP-rate line: optional, only if cheap; not a goal.

## Open risks carried into the build

- NestJS taint-region matching may need iteration to catch the decorator forms
  without over-tainting; the corpus slice is the guardrail.
- Workspace enumeration must be defensive against malformed/missing member
  manifests (reuse the existing `try/catch → []` discipline in
  `manifestEntries`).
