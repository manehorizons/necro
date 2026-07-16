---
name: fp-reduction-framework-plugins
description: Phase 23 dead-code FP reduction — NestJS is a non-problem, the entry-file-doesn't-root-exports gotcha, Next.js plugin shipped, monorepo deferred
metadata:
  type: project
---

Phase 23 (rec-008) reduced dead-code **false positives** (false-"dead"). Three
durable findings, verified by scanning minimal slices during BUILD:

- **NestJS needs no plugin (zero FP).** necro node-ifies only top-level
  declarations (classes/functions), **not class methods**, and NestJS DI forces
  every provider/controller to be statically imported into a `@Module` → the
  class is already alive. A minimal Nest app scans to 0 findings. Don't build a
  NestJS plugin.

- **A prod-entry FILE does not root the symbols it *declares*** — a file-path
  seed in `prodEntries` only roots symbols *referenced at module top-level*
  (proof: a conventional `src/index.ts` entry's own unused exports are still
  flagged dead). Framework entry files are *invoked by convention*, so the
  Next.js fix roots their **exported symbol ids** (see the export-rooting loop in
  `src/engine/index.ts`). Any future framework plugin relying on file entries
  must account for this.

- **Next.js plugin shipped** (`src/plugins/nextjs/`): `prod`-kind entryPatterns
  for App/Pages router + `src/` variants + middleware/instrumentation; the engine
  splits plugin entry globs by `kind`. Corpus `test/fixtures/fp-realrepo/` (6
  false-dead → 0).

- **Monorepo FP — phase 24 shipped** (was [[rec-20260611-001]]): the fix is
  `resolveWorkspaces` (`src/engine/workspaces.ts`, npm/yarn + pnpm) → feed
  ts-morph `paths` (baseUrl `.` + absolute member entry) so `@scope/pkg`
  cross-package refs resolve in the existing reference walk — consumed symbols go
  alive, `trulyUnused` stays dead (no blanket export-rooting). Plus member entry
  files become prod roots (file-path semantics) for executed entries. Corpus
  `monorepo-basic` is a SYNTHESIZED structural fixture (a real cross-package
  slice can't stay minimal/deterministic). Subpath aliases (`@scope/pkg/x`) not
  yet mapped — bare-name only.

Related: [[triage-realrepo-accuracy-baseline]] (the other accuracy axis).
