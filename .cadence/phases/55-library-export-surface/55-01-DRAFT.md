---
phase: 55-library-export-surface
id: 55-01
tier: standard
status: PENDING
---

# 55-01 — Library export surface (exports map + type declarations)

## Objective

Publish `scan`, `explain`, and `buildReachabilityModel` (plus their supporting types and `NecroConfig`/`loadConfig`) as a real importable library entry point — with type declarations — alongside the existing bundled CLI, so editors, CI wrappers, and other tools can embed necro instead of only shelling out to it.

## Acceptance Criteria

### AC-1: A consumer can import the library entry (by its real package name) and get working types and behavior
Given a fresh `npm install @manehorizons/necro` (simulated via the built `dist/` output plus a self-reference through the package's own `exports` map)
When a consumer writes `import { scan, explain, buildReachabilityModel, loadConfig } from "@manehorizons/necro"` (the **bare specifier**, resolved through `node_modules`/self-reference — not a relative path into `dist/`) and runs `tsc --noEmit` against it
Then it type-checks cleanly by actually resolving through package.json's `exports`/`types` fields (proving the map itself is correct, not just that the `.d.ts` file happens to be well-formed), each import is a real function at runtime, and calling the built `scan()` against a tiny fixture directory returns a real, sane result (not just `typeof === "function"`).

### AC-2: `npm run build` produces both the CLI bundle and the library output, with no file collision
Given `npm run build` is run from a clean `dist/`
When the build completes
Then `dist/cli.js` (esbuild bundle) and `dist/index.js` + `dist/index.d.ts` (tsc library emit) all exist, and a checksum of `dist/cli.js` taken immediately after `build:cli` is unchanged after `build:lib` also runs (concrete proof of no collision, not just an assertion).

### AC-3: package.json is shaped for dual CLI + library consumption
Given the published package needs both `necro` (bin) and `@manehorizons/necro` (importable library) to work
When package.json is inspected
Then it declares `main`, `types`, and an `exports` map for `"."` (types + import condition) alongside the existing unchanged `bin` field, and `files` still covers everything under `dist`.

### AC-4: `VERSION` sourcing still reports the correct version everywhere, after its build-compatibility refactor
Given `src/version.ts` must stop statically importing `../package.json` (see T2 — that import is what breaks the library's declaration build)
When `necro --version`, the MCP server's identity, and `release-shape.test.ts`'s existing `VERSION === pkg.version` assertion are exercised
Then all three still report exactly `package.json`'s version, unchanged from today's behavior — this is a build-plumbing refactor, not an observable behavior change.

## Tasks

### T1: Add `src/index.ts` — the library barrel
- files: `src/index.ts` (new)
- action: Re-export the public surface named in the rec: `scan`/`ScanResult`/`ScanOptions`/`ScanDiagnostics`/`Finding` from `./engine/index.js`; `buildReachabilityModel`/`ReachabilityModel`/`EntryResolution`/`EntryResolutionRecord` from `./engine/model.js`; `explain`/`ExplainResult`/`ExplainOptions`/`ExplainSymbol`/`TraceNode`/`InboundRef`/`resolveQuery` from `./engine/explain.js`; `NecroConfig`/`loadConfig`/`LlmOptions` from `./config.js`; `ClassifiedFinding`/`Tier`/`Verdict`/`EvidenceSignal` from `./analyze/classify.js`; `SymbolNode` from `./graph/types.js`. Named re-exports only (`export { x } from "./y.js"` / `export type { X } from "./y.js"`), no default export, no new logic.
- verify: `npm run typecheck` passes with the new file included.
- done: AC-1

### T2: Fix `src/version.ts`'s static `package.json` import — the library build's blocker
- files: `src/version.ts`
- action: `src/version.ts` currently does `import pkg from "../package.json"` — a static TS input file. It's imported by `cli.ts`, `mcp/server.ts`, `report/sarif.ts`, and `bench/cli-bench.ts`, so it's always reachable and always in the tsc program; once T3's `tsconfig.build.json` sets `rootDir: "src"`, this import resolves *above* the root and `tsc` hard-errors (`TS6059`) — dropping `rootDir` instead just relocates emit to `dist/src/index.js`, breaking every path `package.json` will declare in T4. Fix at the source: replace the static import with a runtime read via `createRequire(import.meta.url)("../package.json")` (typed `as { version: string }`). This is a plumbing change only — esbuild already runs this file through Node at runtime either way; the observable output (`VERSION`'s value) is identical, just computed via a runtime `require` instead of a build-time-inlined constant. This keeps the boundary against changing *CLI behavior* intact — only the internal sourcing mechanism changes.
- verify: `node dist/cli.js --version` (after a normal `npm run build`) still prints the current `package.json` version; `npm run test` still passes (covers `release-shape.test.ts`'s `VERSION === pkg.version` assertion); this is the change that unblocks T3's tsc build — confirm `tsc -p tsconfig.build.json` (once T3 exists) no longer errors on `version.ts`.
- done: AC-4

### T3: Add `tsconfig.build.json` for library JS + declaration emit
- files: `tsconfig.build.json` (new)
- action: Extend the base `tsconfig.json`; set `"include": ["src"]`, `"exclude": ["src/cli.ts", "src/bench", "test"]`, `declaration: true`, `noEmit: false`, `outDir: "dist"`, `rootDir: "src"`, `types: ["node"]` (override the base's `vitest/globals` — not needed for a library build and it's cheap defensive hygiene, even though it doesn't actually leak into the emitted `.d.ts`), and `module`/`moduleResolution: "NodeNext"` (override the base's `Bundler` — the correct posture for declarations consumed by arbitrary Node/bundler consumers; every relative import in `src` already carries an explicit `.js` extension so this doesn't require source changes). Excluding `cli.ts` (but not its dependencies, which are matched independently by the `src` glob) avoids tsc's emit colliding with esbuild's bundled `dist/cli.js`; excluding `bench/` trims ~15 files of dev-only benchmarking harness out of the shipped tarball (not a semver/surface risk either way — the `exports` map only exposes `"."` — just bloat).
- verify: `npx tsc -p tsconfig.build.json` runs clean (this requires T2 to be done first) and produces `dist/index.js` + `dist/index.d.ts` (and the mirrored per-module tree under them, minus `cli.ts`/`bench/`) without touching `dist/cli.js`.
- done: AC-2

### T4: Wire package.json for dual CLI + library consumption
- files: `package.json`
- action: Add `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`, and `"exports": {".": {"types": "./dist/index.d.ts", "import": "./dist/index.js"}, "./package.json": "./package.json"}`. Keep `"bin"` unchanged. Split the `build` script into `build:cli` (today's esbuild command) + `build:lib` (`tsc -p tsconfig.build.json`), and have `"build"` run both in that order (`build:cli` first so AC-2's checksum-before capture has something to compare against).
- verify: `npm run build` produces both outputs; run AC-2's checksum check (`sha256sum dist/cli.js` after `build:cli`, again after `build:lib`, confirm equal); `npm run prepublishOnly` (== `npm run build`) still succeeds.
- done: AC-2, AC-3

### T5: Prove the round-trip with a real exports-map resolution + a real scan(), not just presence checks
- files: `test/library-exports.test.ts` (new)
- action: After `npm run build` has run (already a prerequisite step in `ci.yml` before `Test`), write a temp `.ts` file, alongside its own minimal `tsconfig.json` (`moduleResolution: "NodeNext"`, so Node's self-reference resolution is exercised), that imports `scan`, `explain`, `buildReachabilityModel`, `loadConfig`, and the `NecroConfig`/`ScanResult`/`ExplainResult` types via the **bare specifier `@manehorizons/necro`** (not a relative `dist/` path) — this is what actually exercises the `exports` map end-to-end, not just proves the `.d.ts` file is well-formed. Shell out to `tsc --noEmit` against it and assert exit 0. Separately, dynamically `import("../dist/index.js")` and (a) assert each export is a real function, and (b) call the built `scan()` against a tiny throwaway fixture directory (one file, one dead export) and assert it returns a finding — a real end-to-end call, catching WASM/dependency-resolution surprises that `typeof` checks can't.
- verify: `npx vitest run test/library-exports.test.ts` passes; deliberately break one export name (confirm the type-check sub-test fails) and deliberately corrupt the `exports` map's `import` path (confirm it fails too) — then revert both.
- done: AC-1

## Boundaries

- Do NOT bundle the library output with esbuild or add a dts-rollup tool (api-extractor, dts-bundle-generator) — the rec explicitly frames this as "tsc emit alongside the esbuild bundle," a full per-module `dist/` mirror is the intended shape, not a single rolled-up file.
- Do NOT change `bin`, the CLI's `dist/cli.js` bundling, or any CLI command's observable behavior — T2's `version.ts` change is an internal sourcing-mechanism swap only; `VERSION`'s value and every command's output must be byte-identical before/after.
- Do NOT widen the exported surface beyond what the rec names (scan/explain/buildReachabilityModel + supporting types/config) — no exporting `verifyRemovals`/`runFix`/internal engine modules in this pass; that's a follow-up decision, not this one.
