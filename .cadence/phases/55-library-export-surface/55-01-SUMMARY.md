# SETTLE Summary — 55-01

**Completed:** 2026-07-19T02:30:58.122Z

## Acceptance Criteria

- AC-1: PASS (assertion)
- AC-2: PASS (assertion)
- AC-3: PASS (assertion)
- AC-4: PASS (assertion)

## Tasks

- T1: DONE — Added src/index.ts re-exporting scan/ScanResult/ScanOptions/ScanDiagnostics/Finding, buildReachabilityModel/ReachabilityModel/EntryResolution/EntryResolutionRecord, explain/resolveQuery/ExplainResult/ExplainOptions/ExplainSymbol/TraceNode/InboundRef, loadConfig/NecroConfig/LlmOptions, ClassifiedFinding/Tier/Verdict/EvidenceSignal, SymbolNode. Named re-exports only, no default export. Biome's organize-imports auto-fix reordered the groups (now sorted by source module). typecheck + lint clean.
- T2: DONE — src/version.ts: replaced static `import pkg from "../package.json"` with a runtime `createRequire(import.meta.url)("../package.json")` read, typed `as { version: string }`. Fixes the library build's rootDir:"src" blocker (a static import resolves outside src/, causing TS6059 under the tsconfig.build.json T3 adds next). Verified VERSION's observable value is unchanged: `node dist/cli.js --version` still prints 1.3.0 matching package.json, and the full suite (incl. release-shape.test.ts's VERSION===pkg.version assertion) passes 731/737.
- T3: DONE — Added tsconfig.build.json extending base tsconfig: module/moduleResolution NodeNext, types:["node"], declaration:true, noEmit:false, outDir "dist", rootDir "src", include ["src"], exclude ["src/cli.ts","src/bench","test"]. Verified end-to-end: clean rm -rf dist -> npm run build (esbuild) -> npx tsc -p tsconfig.build.json produces dist/index.js + dist/index.d.ts + full per-module mirror (177 files, bench/ correctly absent), with dist/cli.js's sha256 identical before and after the tsc step (no collision). dist/index.d.ts re-exports resolve correctly with .js extensions intact.
- T4: DONE — package.json: added main:"./dist/index.js", types:"./dist/index.d.ts", exports map ("." -> types+import, plus "./package.json" passthrough). bin unchanged. Split build into build:cli (esbuild, unchanged command) + build:lib (tsc -p tsconfig.build.json); build now runs both in that order. Verified: npm run build produces dist/cli.js + dist/index.js + dist/index.d.ts; checksum of dist/cli.js identical before/after build:lib; prepublishOnly succeeds; lint/typecheck/full test suite (731/737) all clean.
- T5: DONE — Added test/library-exports.test.ts, 3 tests: (1) writes a temp consumer.ts + tsconfig (NodeNext) inside the repo (required for Node/tsc self-reference resolution to walk up to this repo's own package.json) importing scan/explain/buildReachabilityModel/loadConfig + types via the bare specifier "@manehorizons/necro", shells to tsc --noEmit, asserts success; (2) dynamic `import("@manehorizons/necro")` (bare specifier, not a relative dist path) asserts each runtime export is a function; (3) calls the built scan()/loadConfig() against a real fixture directory (index.ts with one dead, non-exported function) and asserts the dead symbol appears in findings.

Caught a real gap during the required sabotage checks: my first draft of tests (2) and (3) imported dist/index.js by relative path, which bypasses the exports map entirely — corrupting exports.".".import in package.json still passed. Fixed by switching to the bare specifier for both; re-verified the corrupted-import-path sabotage now fails with a clear vite/exports-resolution error, and reverted. Also verified the export-rename sabotage (scan -> scanRenamed) fails all 3 tests, then reverted. Added .tmp-lib-check-*/ to .gitignore for the scratch dir. Full suite from a clean dist/: lint, typecheck, build, 734/740 tests all green.

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: skipped — boundaryEnforcement is not "block"
- build-test-must-pass: skipped — no test command configured — build-test-must-pass cannot verify your tests ran; this settle will NOT confirm the suite passes. Set verification.testCommand in .cadence/config.json to enable real enforcement.
- test-coverage: ran
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: skipped — not requested (no --deep / --interactive, not in gate set)
- code-review: skipped — not in the active tier × profile gate set
- security-audit: skipped — not in the active tier × profile gate set

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
