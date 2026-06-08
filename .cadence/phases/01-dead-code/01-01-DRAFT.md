---
phase: 01-dead-code
id: 01-01
tier: complex
status: PENDING
---

# 01-01 — Dead-code detection with evidence chains (MVP slice 1)

## Objective

Ship `necro scan` for TypeScript that finds dead code via semantic reachability, classifies each finding by confidence tier with an auditable evidence chain, and surfaces the `test-only` verdict — beating pure-static tools on false positives in the first vertical slice.

## Acceptance Criteria

### AC-1: Semantic dead-code detection over a TS project
Given a TypeScript project with at least one unreferenced private symbol
When the user runs `necro scan <path>`
Then the unreferenced symbol is reported as a dead-code finding resolved via the ts-morph symbol graph (not text matching), and a symbol with ≥1 real reference is not flagged.

### AC-2: Confidence tiers
Given findings with differing reference/taint situations
When `necro scan` classifies them
Then each finding carries exactly one tier — `certain` (private, 0 refs, no taint), `likely` (exported, 0 internal ref, not entry, no taint), or `maybe` (taint nearby OR public API OR test-only ref) — per the §5 tier table, and `maybe` findings are never auto-fix-eligible.

### AC-3: Two-color reachability and the `test-only` verdict
Given a production util imported only by `*.test.ts` files
When reachability runs (prod entries → prod edges → reachedByProd; test entries → prod+test edges → reachedByAny)
Then the util is classified `test-only` (in reachedByAny, not reachedByProd) — not `dead` and not `alive` — and production-reachable code is `alive`.

### AC-4: Test-runner plugin reads real config (no convention hardcoding)
Given a repo whose tests use a non-default pattern (e.g. `**/*.spec.ts` via jest/vitest config)
When the test-runner plugin resolves entries
Then test files, setup files, global setup, and config files are marked as `test`-kind entries from the resolved config (shell-out `--showConfig` with static-parse fallback) — and none of the test infrastructure is flagged dead.

### AC-5: Evidence chain on every finding
Given any dead-code or `maybe`/`test-only` finding
When it is reported
Then it ships an evidence chain listing each checked signal with pass/fail (static refs, coverage if available, package.json exports, dynamic-import taint) and a verdict line, matching the §5 evidence-chain format so the user can audit rather than trust blindly.

### AC-6: Output modes
Given a completed scan
When the user requests output
Then `necro scan` supports human-readable terminal output (default), `--json`, and `--top N`, with findings sorted worst-first.

## Tasks

### T1: Project + CLI scaffold + config loader
- files: `package.json`, `tsconfig.json`, `src/cli.ts`, `src/config.ts`, `src/engine/index.ts`
- action: TS project with esbuild bundling; commander CLI exposing `necro scan <path>` wired to an engine entry point; config loader for `necro.config.*` + ignore globs (lazy-load heavy deps). Engine returns an empty findings array for now.
- verify: `necro scan --help` lists the command; `necro scan <empty-dir>` exits 0 with "no findings".
- done: AC-1

### T2: Symbol-graph builder (ts-morph)
- files: `src/graph/types.ts`, `src/graph/symbol-graph.ts`
- action: Build the module/symbol graph from the TS project via ts-morph; resolve references with `getReferences()`; emit nodes (symbols w/ loc, visibility, exported?) and edges carrying `kind: 'prod' | 'test'` (test-kind = edge originates in a test-matched file). Honor `moduleNameMapper`/`alias` in import resolution.
- verify: Fixture with a referenced and an unreferenced private symbol → graph shows correct ref counts; barrel re-export resolves to terminal consumer.
- done: AC-1

### T3: Plugin registry + FrameworkPlugin contract + entry resolver
- files: `src/plugins/types.ts`, `src/plugins/registry.ts`, `src/plugins/entry-resolver.ts`
- action: Define the four-method `FrameworkPlugin` interface (§5); registry that auto-detects via `package.json` deps + config presence; entry resolver that collects `entryPatterns()` → root entry set with `kind`. When no plugin matches, candidates degrade to `maybe` (not killed).
- verify: Registry detects a test plugin from a fixture `package.json`; entry resolver returns the declared entry globs with correct kind.
- done: AC-4

### T4: Test-runner plugin + config resolution
- files: `src/plugins/test-runner/index.ts`, `src/plugins/test-runner/config-resolution.ts`
- action: Implement test-runner plugin (`detect`, `entryPatterns`, `resolveEdges` for `__mocks__`, `taintRules`). Config resolution: jest via `jest --showConfig`; vitest via vitest's programmatic config loader; static-parse fallback for both. Mark test files, setup, globalSetup, config files as `test`-kind entries. Sandbox + timeout + consent-gate the shell-out/loader; cache by config-file hash.
- verify: Fixture using `**/*.spec.ts` (non-default) → test infra is entry-marked, none flagged dead; fallback path works with runner uninstalled.
- done: AC-4

### T5: Two-color reachability + taint
- files: `src/analyze/reachability.ts`
- action: Mark-and-sweep over the graph: (1) prod entries → BFS prod edges → `reachedByProd`; (2) test entries → BFS prod+test edges → `reachedByAny`; (3) mark taint regions (dynamic import, reflection, string dispatch). Classify: in prod → `alive`; in any-not-prod → `test-only`; in neither → dead candidate.
- verify: Fixture util imported only by `*.test.ts` → `test-only`; prod-reachable → `alive`; orphan → candidate.
- done: AC-3

### T6: Confidence-tier classification
- files: `src/analyze/classify.ts`
- action: Map each dead candidate to exactly one tier per §5 table — `certain` (private, 0 refs, no taint), `likely` (exported, 0 internal ref, not entry, no taint), `maybe` (taint nearby OR public API OR test-only ref). Coverage is optional: degrade to `coverage: not available` when no report. Tag `maybe` as never auto-fix-eligible.
- verify: Fixtures hitting each tier produce the expected tier; a tainted candidate lands in `maybe` and is flagged non-auto-fixable.
- done: AC-2

### T7: Evidence-chain reporter
- files: `src/report/evidence.ts`
- action: For every finding, assemble an evidence chain listing each checked signal with ✓/✗ (static refs, coverage-if-available, package.json exports, dynamic-import taint) plus a verdict line, matching the §5 format.
- verify: A `certain` finding and a `maybe` finding render the two-box example shape from §5 (signals + verdict).
- done: AC-5

### T8: Output modes
- files: `src/report/terminal.ts`, `src/report/json.ts`, `src/cli.ts`
- action: Wire `--json`, `--top N`, and default terminal output into `necro scan`; sort findings worst-first (by tier severity, then loc).
- verify: `necro scan <fixture> --json` emits valid JSON; `--top 2` limits to 2; default prints the evidence-chain terminal view.
- done: AC-6

## Boundaries

- DO NOT add tree-sitter or any syntactic detector (nesting/complexity/duplication/god-function) — out of this slice.
- DO NOT add any LLM call (triage or fix) — static layer only, deterministic.
- DO NOT implement monorepo / cross-package workspace edges — single-package scope.
- DO NOT auto-apply the `test-only` verdict — report-only, emit suggestion text only.
- DO NOT add coverage *ingestion* (lcov/c8 parsing) — coverage is an optional, absent-tolerant signal this slice.
- DO NOT edit `docs/necro-design-spec.md` — it is the source-of-truth reference, not a work product.
