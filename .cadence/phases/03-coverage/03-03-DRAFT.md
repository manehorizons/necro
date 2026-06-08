---
phase: 03-coverage
id: 03-03
tier: standard
status: PENDING
---

# 03-03 — Coverage ingestion

## Objective

Ingest lcov coverage so `necro scan` resolves false positives without paid runtime: a candidate with 0 runtime hits gets a real coverage-miss signal (and stays `certain`-eligible), while a 0-static-ref symbol that *was* executed is surfaced as `maybe` with runtime evidence instead of being falsely killed.

## Acceptance Criteria

### AC-1: lcov discovery and parse
Given a project with an lcov report at the default path `coverage/lcov.info` (or a path given via `--coverage <path>` / config `coveragePath`)
When `necro scan` runs
Then the report is parsed into per-file, per-symbol hit data (lcov `SF`/`FN`/`FNDA`/`DA` records), and a malformed or unreadable report degrades gracefully to "coverage: not available" with a warning — it never crashes the scan.

### AC-2: Coverage-miss strengthens a dead verdict
Given a dead candidate symbol whose declaration is present in the coverage report with 0 hits
When the finding is classified
Then its evidence chain shows `✓ 0 coverage hits (lcov)` (replacing the placeholder), and a private/no-taint/non-public candidate remains `certain` and auto-fix eligible per the §5 tier table.

### AC-3: Runtime hits downgrade to `maybe`
Given a symbol with 0 static references that the coverage report shows was executed (≥1 hit)
When the finding is classified
Then it is reported with tier `maybe`, verdict not auto-fix eligible, and an evidence line `✗ executed at runtime (N hits) despite 0 static refs — reached dynamically` — it is never reported `certain` and never auto-removed.

### AC-4: Coverage gates the `certain` tier
Given a private, 0-ref, no-taint candidate AND a coverage report is available
When the report has no record for that symbol's file (file not instrumented)
Then coverage is treated as "not available" for that symbol (rendered `coverage: not available`), and tier logic proceeds on the remaining signals exactly as in phase 01 — coverage strengthens but a *missing* record never blocks a verdict.

### AC-5: Evidence chain matches the §5 format
Given any finding when a coverage report was loaded
When it is reported
Then the coverage signal appears in the evidence chain in the §5 position (after static references), as one of `✓ 0 coverage hits (lcov)`, `✗ executed at runtime (N hits) …`, or `coverage: not available` — and `--json` output carries the same signal in structured form.

### AC-6: No-coverage path is unchanged
Given a project with no coverage report and no `--coverage`/`coveragePath` set
When `necro scan` runs
Then behavior is byte-for-byte identical to phase 01 (every finding renders `coverage: not available`, tiers unaffected) — coverage is purely additive.

## Tasks

### T1: lcov parser
- files: `src/analyze/coverage/lcov.ts`
- action: Pure parser `parseLcov(raw: string): LcovReport`. Walk lcov records grouped by `SF:` (source file) → for each file collect `FN:<line>,<name>` + `FNDA:<hits>,<name>` (function records) and `DA:<line>,<hits>` (line records). Return `{ files: Map<absPathOrRel, { fns: {name,line,hits}[], lines: Map<line,hits> }> }`. Tolerant of unknown record types; throws only on structurally broken input (caught by T2).
- verify: unit test parses a fixture lcov.info with multiple `SF` blocks, FN/FNDA/DA records → asserts hits per function/line.
- done: AC-1

### T2: coverage discovery + loader
- files: `src/analyze/coverage/load.ts`, `src/config.ts`, `src/cli.ts`
- action: `loadCoverage(targetPath, { coveragePath }): Promise<LcovReport | null>`. Resolve path precedence: `--coverage` flag → `coveragePath` config → default `coverage/lcov.info`. Read + `parseLcov`; on ENOENT (no report) return `null` silently; on read/parse error return `null` and `console.warn` once ("coverage report at <path> unreadable — proceeding without coverage"). Add `coveragePath?: string` to `NecroConfig`; add `--coverage <path>` option to the `scan` command, threaded into config before `scan()`.
- verify: unit test — missing file → null no warning; malformed file → null + warning; valid file → parsed report. CLI `--coverage` reaches the loader.
- done: AC-1, AC-4

### T3: symbol↔coverage lookup
- files: `src/analyze/coverage/lookup.ts`
- action: `coverageFor(report, node): { kind: "hit"; hits: number } | { kind: "miss" } | { kind: "unavailable" }`. Match by `node.file` against report file keys (normalize abs/rel). If the file is absent → `unavailable`. Within the file, match the symbol by `FN` name + `line` (declaration line); fall back to the `DA` hits at `node.line` when no FN record matches; if neither present → `unavailable`. `hits > 0` → `hit`; `hits === 0` → `miss`.
- verify: unit tests — file-not-in-report → unavailable; FN match with hits>0 → hit(N); FN match hits=0 → miss; no FN but DA line hit → hit/miss; symbol absent → unavailable.
- done: AC-2, AC-3, AC-4

### T4: classify integration
- files: `src/analyze/classify.ts`
- action: Add optional `coverage?: (node: SymbolNode) => CoverageStatus` to `ClassifyInput`. Replace the hardcoded `COVERAGE_UNAVAILABLE` in `deadEvidence`/`testOnlyEvidence` with the resolved signal: `miss` → `{ok:true,text:"0 coverage hits (lcov)"}`; `hit(N)` → `{ok:false,text:"executed at runtime (N hits) despite 0 static refs — reached dynamically"}`; `unavailable`/no-coverage → existing `coverage: not available` (`ok:null`). In `deadTier`, a `hit` forces tier `maybe` and `autoFixEligible=false` (a runtime-reached symbol is never `certain`). No coverage fn supplied → behavior byte-identical to phase 01.
- verify: unit tests on `classify` — miss keeps a private/no-taint candidate `certain`; hit forces `maybe` + not-eligible + runtime evidence line; unavailable and no-coverage both render `coverage: not available`.
- done: AC-2, AC-3, AC-4, AC-5

### T5: engine wiring
- files: `src/engine/index.ts`
- action: In `scan()`, call `loadCoverage(targetPath, config)`; when non-null build the lookup closure `(node) => coverageFor(report, node)` and pass it as `classify({ ..., coverage })`. When null, omit the field (phase-01 path). Coverage is path-based only — never run tests.
- verify: integration test — scan a fixture with `coverage/lcov.info` present shows real coverage signals + a `maybe` for a runtime-hit-but-unreferenced symbol; scan with no report is byte-identical to phase 01 and `--json` carries the coverage signal in `evidence`.
- done: AC-1, AC-5, AC-6

### T6: docs note
- files: `website/` (reference/configuration page)
- action: Document `--coverage` / `coveragePath`, the default `coverage/lcov.info` discovery, and the three coverage evidence states. Mark only as built (no "Planned" label). Run `nvm use 22` before any `website/` build.
- verify: `nvm use 22 && npm --prefix website run build` passes the link-validator gate.
- done: AC-5

## Boundaries

- **DO NOT run the test suite or shell out to generate coverage** — discovery is path-based only; reintroducing paid runtime defeats the phase's purpose.
- **DO NOT change the no-coverage path** — when no report is found, every finding must render `coverage: not available` and tiers must be byte-identical to phase 01 (AC-6).
- **DO NOT modify `src/analyze/reachability.ts`** — coverage is a classification signal, not a reachability edge.
- **DO NOT add istanbul `coverage-final.json` parsing** — lcov only this phase; istanbul JSON is a deferred follow-up.
- **DO NOT add coverage deps to `website/`'s package.json** (separate package, Node ≥ 22).
