---
phase: 62-cobertura-coverage
id: 62-01
tier: standard
status: PENDING
---

# 62-01 — Cobertura coverage.xml reader for Python runtime-contradiction signal

## Objective

Coverage ingestion is lcov-only, so the "executed at runtime despite 0 static refs" contradiction signal can never fire for Python — add a Cobertura `coverage.xml` reader normalized into the existing coverage lookup.

## Acceptance Criteria

### AC-1: a Python symbol with runtime coverage hits is no longer `certain`/`likely` — the coverage contradiction demotes it
Given a Python symbol with 0 static references but a `coverage.xml` (Cobertura) record showing hits > 0 on its declaration line
When a scan runs with the default `coverage.xml` auto-discovered at the repo root
Then `coverageFor` reports `{ kind: "hit" }` for that symbol and `classify` demotes its tier to `maybe` (the same contradiction path lcov already drives for TS)

### AC-2: a config override path is respected, same precedence as the existing lcov `coveragePath`
Given a Cobertura report at a non-default path and `pythonCoveragePath` set in config
When coverage is loaded
Then the report at the configured path is used, not the default `coverage.xml`

### AC-3: an unreadable/missing Cobertura report never blocks a scan
Given no `coverage.xml` at the default location (and no override configured)
When coverage is loaded
Then `loadCoverage` returns without the Cobertura report present (lcov-only, or `null` if lcov is also absent) — mirrors the existing ENOENT-is-silent guarantee for lcov (AC-4 of phase 1)

## Tasks

### T1: Cobertura XML parser normalizing into the existing `LcovReport` shape
- files: `src/analyze/coverage/cobertura.ts` (new)
- action: Hand-roll a regex/string-based parser (matching `lcov.ts`'s style — no new XML dependency) reading `<class filename="...">` blocks and their nested `<line number="N" hits="H"/>` records, producing `Map<lineNumber, hits>` per file. Leave `fns: []` (Cobertura's `def`/`class` line is itself a covered `<line>` record, so `coverageFor`'s existing `cov.lines.get(node.line)` fallback resolves it without needing function-name matching). Export `parseCobertura(raw: string): LcovReport`.
- verify: `npm test -- coverage-cobertura.test.ts`
- done: AC-1

### T2: wire Cobertura into `loadCoverage`, config override, merge with lcov
- files: `src/analyze/coverage/load.ts`, `src/config.ts`
- action: Add `pythonCoveragePath?: string` to `CoverageOptions` and to `NecroConfig`/`RawConfig` (mirroring `coveragePath`'s existing three call sites in `config.ts`). Add `DEFAULT_COBERTURA_PATH = "coverage.xml"`. In `loadCoverage`, independently attempt the lcov path and the Cobertura path (each ENOENT-silent per the existing guarantee); if both resolve, merge their `files` maps into one `LcovReport` (key spaces don't collide — TS/JS vs Python paths); if only one resolves, return it; if neither, return `null`.
- verify: `npm test -- coverage-load.test.ts`
- done: AC-2, AC-3

### T3: tests for all three ACs
- files: `test/coverage-cobertura.test.ts` (new), `test/coverage-load.test.ts`
- action: Unit tests for `parseCobertura` (line hits parsed correctly) plus a `loadCoverage` case proving the merged report drives `coverageFor`'s hit/miss for a Python file, one proving `pythonCoveragePath` override precedence (AC-2), and one proving a missing `coverage.xml` doesn't throw/warn (AC-3). Confirm red against pre-T1/T2 code, then green after.
- verify: `npm test -- coverage-cobertura.test.ts coverage-load.test.ts`
- done: AC-1, AC-2, AC-3

## Boundaries

- DO NOT change `coverageFor`/`lookup.ts` — Cobertura output must conform to the existing `LcovReport` shape so the lookup logic is untouched.
- DO NOT add a new XML-parsing dependency — hand-roll, matching `lcov.ts`'s existing style.
- DO NOT add CLI flags (`--python-coverage`) — the recommendation asks for auto-detection by filename plus a config override, not a new flag; config-only per `pythonCoveragePath`.
