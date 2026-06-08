---
phase: 06-hotspots
id: 06-06
tier: standard
status: PENDING
---

# 06-06 — CRAP score + churn hotspots

## Objective

Rank the riskiest functions in one list: combine per-function complexity,

## Acceptance Criteria

### AC-1: Per-function complexity metric (reused, not re-derived)
Given a function lowered to the syntactic IR
When risk analysis runs
Then its raw cyclomatic complexity is available via a shared `metrics(unit)` API (independent of any threshold), and both the phase-05 detectors and CRAP read that one definition — no duplicate complexity math.

### AC-2: Per-function coverage ratio from lcov
Given an lcov report and a function's line range (declaration line + LOC)
When coverage is resolved for risk
Then necro computes the covered fraction over that range (covered instrumented lines ÷ instrumented lines), in `[0,1]`; a function with no instrumented lines in the report yields `null` (ratio unavailable), not `0`.

### AC-3: CRAP score
Given a function with complexity `C` and coverage ratio `cov`
When the CRAP score is computed
Then it equals `C² × (1 − cov)³ + C`, so a complex, untested function scores far higher than a simple or well-covered one; CRAP is computed only when a coverage report is present (else `null`).

### AC-4: Per-file churn from git
Given a git repository
When churn is computed
Then each file's churn (count of commits touching it) is derived in a single `git log` pass; a non-git target (or git failure) yields `null` churn for every file and never crashes the scan.

### AC-5: Composite risk ranking with graceful degrade
Given functions with varying complexity, coverage, and churn
When hotspots are ranked
Then each carries `risk = (CRAP ?? complexity) × (churn ?? 1)`, the list is sorted worst-first and capped at the top N (default 10); with no coverage it falls back to `complexity × churn`, with no git to `CRAP`/`complexity`, and with neither to raw complexity — always monotonic in the inputs present.

### AC-6: Surfacing in scan
Given a project with rankable functions
When `necro scan` runs
Then it prints a "Risk hotspots" section — a worst-first table of `name`, `file:line`, complexity, coverage%, CRAP, churn — and `--json` includes a `hotspots` array; `necro fix` is unaffected; a project with no functions shows no section.

## Tasks

### T1: shared metrics API
- files: `src/syntactic/metrics.ts`, `src/syntactic/detectors.ts`
- action: Add `metrics(unit): { cyclomatic, cognitive, nesting, loc, params }` computing each raw value from the IR (threshold-independent). Refactor the four detectors to consume `metrics()` instead of recomputing — one definition of each metric (AC-1). No behavior change to detector outputs.
- verify: unit test — `metrics()` returns the expected cyclomatic/cognitive/nesting for a hand-built unit; existing detector tests still pass (no output drift).
- done: AC-1

### T2: per-function coverage ratio
- files: `src/analyze/coverage/ratio.ts`, `src/analyze/coverage/lookup.ts`
- action: Export the file-matching helper from `lookup.ts` (or factor a shared `findFileCoverage`). Add `coverageRatio(report, file, startLine, endLine): number | null`: over the lcov `DA` line-hit records within `[startLine, endLine]`, return `coveredLines / instrumentedLines`; no instrumented lines in range → `null`.
- verify: unit tests — fully-covered range → 1; half-covered → 0.5; file/range absent → null.
- done: AC-2

### T3: per-file churn from git
- files: `src/analyze/churn.ts`
- action: `fileChurn(targetPath): Promise<Map<string, number> | null>` — one `git log --format= --name-only HEAD` pass (execFile, cwd=target, timeout), tally commits per file path (absolute). Any error / non-repo → `null`. Mirror `fix/git-guard.ts`.
- verify: unit tests (tmp git repos) — a file touched in 2 commits → churn 2; non-git dir → null.
- done: AC-4

### T4: CRAP + risk ranking
- files: `src/analyze/hotspots.ts`
- action: Define `HotspotEntry = { name, file, line, complexity, coverage: number|null, crap: number|null, churn: number|null, risk }`. `crap(C, cov) = C*C*(1-cov)**3 + C`. `rankHotspots(units, coverageReport|null, churn|null, topN)`: per unit, complexity = `metrics(unit).cyclomatic`; coverage = ratio over the unit's line range (null if no report); crap = coverage===null ? null : crap(C, cov); churn = churn?.get(file) ?? null; `risk = (crap ?? complexity) * (churn ?? 1)`. Sort by risk desc (tiebreak file/line), take top N.
- verify: unit tests — complex+uncovered ranks above simple+covered; CRAP matches the formula; no-coverage falls back to complexity×churn; no-git falls back to CRAP/complexity; topN caps the list.
- done: AC-3, AC-5

### T5: engine + config integration
- files: `src/engine/index.ts`, `src/config.ts`
- action: Refactor the heavy axis to lower IR units **once** and produce both `complexity` (detectors) and `hotspots` (rank from the same units + the already-loaded `coverageReport` + `fileChurn(targetPath)`). Extend `ScanResult` with `hotspots: HotspotEntry[]`; gate it with the existing `complexity` scan option (so `fix` skips it). Add a `hotspots?: { top?: number }` config block (default 10).
- verify: integration test — a project with a complex, untested, churned function surfaces a hotspot with crap/risk set; a clean function does not top the list; `{ complexity: false }` → `hotspots: []`.
- done: AC-6

### T6: surfacing (terminal section + JSON)
- files: `src/report/hotspots.ts`, `src/report/json.ts`, `src/cli.ts`
- action: `renderHotspots(entries): string` — a labeled "Risk hotspots" table (`name  file:line  cx=N  cov=NN%  crap=N  churn=N`), worst-first; "" when empty. `scan` prints it after the complexity section. `toJson` gains `hotspots`. `--top` still applies to dead-code findings only.
- verify: report unit test (table contains the columns) + CLI/integration test (`--json` includes a `hotspots` array; no functions → no section).
- done: AC-6

### T7: docs
- files: `website/src/content/docs/guide/hotspots.md` (new), `website/src/content/docs/reference/cli.md`, `website/src/content/docs/reference/configuration.md`, `website/src/content/docs/guide/ci-integration.md`, `website/src/content/docs/guide/roadmap.md`
- action: New guide page explaining CRAP, churn, the risk formula, and graceful degrade. Update the scan output reference + `--json` shape (now also `hotspots`), the `hotspots` config block, the CI-integration JSON example, and move "CRAP score / complexity × churn" from Planned → Available in the roadmap. Run `nvm use 22` before any `website/` build.
- verify: `nvm use 22 && npm --prefix website run build` passes the link-validator gate.
- done: AC-6

## Boundaries

- **Reuse phase-05 metrics + phase-03 lcov — no duplicate complexity or coverage math.** CRAP uses the §5 formula exactly.
- **DO NOT change dead-code detection, `classify`, tiers, or `necro fix`** — hotspots are additive; `fix` passes `{ complexity: false }` and must skip them.
- **Churn is read-only git** — `git log` only; any failure / non-repo → `null`, never a crash.
- **DO NOT implement** duplication (step 9), per-line or recency-weighted churn, or ownership weighting.
- **Lazy/gated** — hotspots ride the existing heavy (tree-sitter) axis; the dead-code/`fix` path must not pay for them.
- No LLM (locked #3); report-only.
- **DO NOT add deps to `website/`'s package.json** (separate package, Node ≥ 22).
