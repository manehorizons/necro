---
phase: 28-fail-closed-entry-resolution
id: 28-01
tier: complex
status: PENDING
---

# 28-01 — Fail-Closed Entry Resolution

## Objective

`resolveProdEntries` (`src/engine/prod-entries.ts`) returns an **empty prod-entry set** for any repo whose package.json points at build output (`dist/`) and whose source entry is not one of the hardcoded conventional names. Necro's own repo triggers this (`bin: dist/cli.js`, source entry `src/cli.ts`). With zero prod seeds the prod-color BFS reaches nothing: every non-test-reached symbol classifies `dead`, every private one classifies `certain`, and `necro fix --write` mass-deletes correct code — a confirmed field incident. The degradation promised in `src/plugins/entry-resolver.ts` ("empty entry set → degrade to `maybe`") is documented but not implemented, and `.github/workflows/necro-scan.yml` routes CI around the bug (`fail-on: ""`) instead of fixing it.

This slice delivers the fail-closed invariant plus the resolution improvements that make it rarely needed:

> **Invariant:** When zero production entry points resolve (and the graph is non-empty), no finding is `certain`, nothing is auto-fix eligible, `fix` refuses with a distinct exit code (3), and the user is told exactly why and how to declare entries.

Concretely: (1) empty-entry guard with `entryCollapse` demotion in `classify()` + truthful evidence signal + terminal warning banner; (2) explicit `entries?: string[]` config escape hatch; (3) dist→src manifest mapping via tsconfig `outDir`/`rootDir` (with `dist|build|out → src` heuristic fallback), existence-gated; (4) `package.json` scripts mining for secondary roots; (5) `fix` refusal status `refused-no-entries` and a public exit-code taxonomy (0/1/2/3). Per handoff `docs/slice1-handoffs/necro-slice1-handoff.md` (supersedes design-spec §5 where they conflict).

**Protocol: corpus before code.** The adversarial fixture corpus (T1) is authored and run against current `main` FIRST; expected-red cases must be demonstrably red at baseline before any implementation lands. The baseline run output is recorded in **Baseline Evidence** below and cited by AC-1. Corpus corrections after baseline require reviewed diffs with stated rationale — no silent edits.

## Baseline Evidence

Command: `npx vitest run test/entry-resolution.test.ts --reporter=verbose` run against `main` (commit `9741c78`), harness written against today's stable APIs only (`resolveProdEntries` → bare `Set<string>`, no `entryCollapse`, no `refused-no-entries`; see the "written against today's APIs" note at the top of `test/entry-resolution.test.ts`).

| Case | Baseline (expected) | Actual | Notes |
|---|---|---|---|
| no-entries | red | **red** | entries=[] (expected 0, matches) but `orphan` tier `certain` not `maybe` (collapse missing); `fix --write` → `written` not `refused-no-entries` |
| dist-bin-tsconfig | red | **red** | entries=[] — `src/cli.ts` unresolved (no dist→src mapping yet) |
| dist-heuristic | green | **green** | resolves via existing conventional-name fallback (`src/index.ts`), unaffected by the bug |
| dist-tsx-swap | red | **red** | entries=[] — `src/app.tsx` unresolved (no tsx swap yet) |
| scripts-entry | red | **red** | entries=[] — no scripts mining yet |
| config-entries | red | **red** | entries=[] — no `entries` config field yet |
| conventional-regression | green | **green** | unaffected, plain `src/index.ts` already resolves |
| exports-map | red | **red** | entries=[] — `src/app.ts` (mapped from the `exports` leaf) unresolved; fixture uses a non-conventional filename so the existing conventional fallback can't mask the gap |
| empty-repo | green | **green** | existing empty-model guard already correct |
| monorepo-member | green | **green** | workspace member entries already counted today (pre-existing behavior) |

Plus a dedicated **AC-4 precedence test** (no-entries fixture, dirty git tree, `fix --write`): baseline returns `refused-dirty`, not `refused-no-entries` — **red**, as expected (the no-entries guard doesn't exist yet, so the dirty-tree guard is all that fires).

**8 failed / 13 passed (21 total)** — every case marked `red` above failed for the reason the handoff predicts (empty/wrong entry resolution, no collapse, no refusal); every case marked `green` passed unchanged. No expected-red case passed at baseline. Proceeding to T2.

Note: exports-map's fixture entry file was renamed from `src/index.ts` to `src/app.ts` (and `exports` leaf to `./dist/app.js`) during authoring — the original choice of `src/index.ts` accidentally resolved via the pre-existing conventional-name fallback regardless of the exports-mapping bug, which would have made this case falsely green at baseline. Recorded here per the "corpus corrections require reviewed diffs with stated rationale" rule (handoff §4).

## Acceptance Criteria

Settle gate note: every AC id below must appear literally in at least one test title (e.g. `test("AC-4: refused-no-entries wins over refused-dirty", ...)`) — settle refuses to close the phase otherwise. AC-1, AC-6, AC-7, AC-8 are additionally evidenced in this DRAFT / by command output.

### AC-1: corpus green, and red-first proven
Given the 10-case adversarial fixture corpus in `test/entry-resolution/fixtures/` with per-case `expected.json` (resolved entries file+source, per-symbol verdict/tier, `fix` status + exit code, and full evidence-signal text for at least one finding per case)
When the corpus is run against current `main` before implementation, and against the finished slice after
Then the baseline run shows every `baseline: red` case failing and every `baseline: green` case passing (output recorded in Baseline Evidence above), and the final run is fully green.

### AC-2: necro self-scan resolves its own entry via mapping
Given necro's own repo root (`bin: dist/cli.js`, tsconfig `outDir: dist`, source `src/cli.ts`)
When `necro scan` runs at the repo root
Then `diagnostics.entryResolution.prodEntryCount >= 1` and the resolved entries include `src/cli.ts` with source `"mapped"`, visible in terminal, JSON, and SARIF output.

### AC-3: fail-closed collapse — zero certain, fix exits 3, disk untouched
Given dist→src mapping is artificially disabled (test hook or a fixture mirroring necro's manifest shape) so zero prod entries resolve on a non-empty graph
When `scan` and then `fix --write` run
Then the scan yields **zero** `certain` findings — every dead finding is tier `maybe` with `autoFixEligible: false` and its evidence chain **prepends** `{ ok: false, text: "0 production entry points resolved — reachability unseeded" }` (born in `classify()` via `entryCollapse`, not post-hoc mutation) — the terminal report prints one warning banner naming the three remedies, and `fix --write` returns `refused-no-entries`, exits 3, and writes nothing to disk.

### AC-4: refusal precedence — no-entries wins over dirty-tree
Given fixture case 1 (`no-entries`) with a deliberately dirty git working tree
When `fix --write` runs
Then the result is `refused-no-entries` (exit 3), not `refused-dirty` — the no-entries check fires before the dirty-tree guard so refusal reasons never shadow each other.

### AC-5: fix exit-code taxonomy is asserted and documented
Given the public `fix` exit-code contract — 0 written/preview/nothing-to-fix, 1 unexpected error, 2 refused-dirty, 3 refused-no-entries
When the corpus harness runs the real CLI per case
Then each of the four codes is asserted by at least one test, and the taxonomy is documented in README under `fix`. (Audit first: today `refused-dirty` prints to stderr but exits 0 — making it exit 2 is a deliberate, documented change.)

### AC-6: full chain green
Given the completed slice
When `npm run build && npm run typecheck && npm test` runs as one command
Then all three stages pass; the chained command output is cited in this DRAFT at settle.

### AC-7: no changes outside the allowlist
Given the finished branch
When `git diff --name-only <baseline>..HEAD` is reviewed
Then every changed path is within the Boundaries allowlist below; anything else means the build stopped and reported instead of proceeding.

### AC-8: CHANGELOG entry
Given the finished slice
When CHANGELOG is read
Then an entry under `[1.2.0] — Unreleased` covers: fail-closed entries, `entries` config, dist→src mapping, scripts mining, and the `fix` exit-code taxonomy.

## Tasks

Test-title rule applies to every task that adds tests: the AC id string (e.g. `AC-3`) must appear in the `test(...)`/`describe(...)` title, or settle will refuse the phase.

### T1: Author the corpus and record the red/green baseline — BEFORE any implementation
- files: `test/entry-resolution/fixtures/<case>/` (10 cases: `no-entries`, `dist-bin-tsconfig`, `dist-heuristic`, `dist-tsx-swap`, `scripts-entry`, `config-entries`, `conventional-regression`, `exports-map`, `empty-repo`, `monorepo-member`), `test/entry-resolution.test.ts`, this DRAFT (Baseline Evidence section)
- action: build each case as a minimal on-disk repo (package.json, optional tsconfig, sources) with `expected.json` declaring resolved entries (file + source), per-symbol verdict/tier, `fix` status + exit code, and the full evidence-signal text for ≥1 finding per case (evidence integrity asserted, not just tiers). Case 3 asserts both paths: convention hit, and heuristic hit with the conventional candidate removed. Then run the corpus against current `main` and paste the verbatim red/green output into Baseline Evidence above.
- verify: `npx vitest run test/entry-resolution.test.ts` on `main` — cases 1/2/4/5/6/8 red, cases 3/7/9/10 green. **STOP and report if any expected-red case passes; do not start T2.**
- done: AC-1 (baseline half)

### T2: dist→src mapping module + entry sources
- files: new `src/engine/entry-mapping.ts`, `src/engine/prod-entries.ts`
- action: when a manifest leaf (`main`/`module`/`bin`/`exports`) doesn't exist among scanned files, map via tsconfig `compilerOptions.outDir`+`rootDir` (strip outDir, prepend rootDir, swap `.js→.ts`, `.jsx→.tsx`, `.mjs→.mts`, `.cjs→.cts`; also try same basename with `.ts`/`.tsx` when the direct swap misses). Resolve one level of tsconfig `extends` (local file only; deeper chains out of scope — code comment). No tsconfig/outDir: replace leading `dist/`|`build/`|`out/` with `src/` plus the same swaps. Keep a mapped path only if it exists among scanned files (source `"mapped"`) — never guess into undiscovered paths. Extend `resolveProdEntries` to return `{ file, source }` records with `EntrySource = "manifest" | "mapped" | "convention" | "scripts" | "config" | "plugin" | "workspace"`.
- verify: `npx vitest run test/entry-resolution.test.ts` — cases 2, 4, 8 turn green; case 3 heuristic path green; titles carry AC-1/AC-2 ids where they assert those criteria
- done: AC-1, AC-2

### T3: `entries` config field + scripts mining
- files: `src/config.ts`, `src/engine/prod-entries.ts` (and/or `src/engine/entry-mapping.ts`), `src/engine/model.ts`, `test/entry-resolution.test.ts`, `test/config.test.ts`
- action: add `entries?: string[]` to `NecroConfig`/`RawConfig`/`loadConfig` — globs relative to scan target, resolved through the existing `globMatcher`, matched against discovered files, added as source `"config"`. Mine `package.json` `scripts` values: whitespace-split after stripping quotes (no shell parsing), keep tokens matching `/\.[cm]?[jt]sx?$/` that resolve to a scanned file, add as source `"scripts"` (false negatives acceptable; existence gate prevents false positives).
- verify: corpus cases 5 (`scripts-entry`) and 6 (`config-entries`) green
- done: AC-1

### T4: `entryResolution` diagnostics through model → scan → reports
- files: `src/engine/model.ts`, `src/engine/index.ts`, `src/report/terminal.ts`, `src/report/json.ts`, `src/report/sarif.ts`, `src/cli.ts`, tests (`test/report.test.ts`, `test/sarif.test.ts`, `test/scan.test.ts` as needed)
- action: `buildReachabilityModel` computes `entryResolution: { prodEntryCount, sources: Array<{ file, source }> }` (workspace entries count — case 10 must not falsely collapse); `ScanResult` gains `diagnostics: { entryResolution }`; surface in terminal, JSON, SARIF. When `prodEntryCount === 0 && graph.nodes.length > 0`, terminal prints one prominent banner block at top of output: what happened, why, three remedies (fix manifest / add `entries` config / conventional names). One banner, actionable, no preachy prose.
- verify: `npx vitest run test/report.test.ts test/sarif.test.ts test/entry-resolution.test.ts`; self-scan at repo root shows `src/cli.ts` source `mapped` in diagnostics (test title carries AC-2)
- done: AC-2, and the collapse-detection input for AC-3

### T5: `entryCollapse` demotion in classify
- files: `src/analyze/classify.ts`, `src/engine/index.ts`, `test/classify.test.ts`, `test/entry-resolution.test.ts`
- action: add `entryCollapse: boolean` to `ClassifyInput` (set by `scan` from the T4 diagnostics). When true: every `dead` finding demotes to tier `maybe`, `autoFixEligible: false`, and the evidence chain **prepends** `{ ok: false, text: "0 production entry points resolved — reachability unseeded" }`. Tier and evidence born consistent inside `classify()` — no post-hoc mutation. Case 9 (`empty-repo`) guard: empty graph never triggers collapse.
- verify: `npx vitest run test/classify.test.ts test/entry-resolution.test.ts` — case 1 tier/evidence assertions green, case 9 still green; test titles carry AC-3
- done: AC-3 (scan half), AC-1

### T6: `refused-no-entries` in runFix + CLI exit taxonomy
- files: `src/fix/index.ts`, `src/cli.ts`, `test/fix.test.ts`, `test/entry-resolution.test.ts`
- action: audit current `cli.ts` exit behavior first (today `refused-dirty` exits 0 — no exit code is set on any fix branch). `runFix`: when `diagnostics.entryResolution.prodEntryCount === 0` and the graph is non-empty, return `{ status: "refused-no-entries" }` **before** the nothing-to-fix check and before the dirty-tree guard (the user must learn why nothing is eligible; no-entries wins over dirty). CLI: exit 0 written/preview/nothing-to-fix, 1 unexpected error, 2 refused-dirty, 3 refused-no-entries.
- verify: corpus harness asserts all four exit codes against the real CLI; case 1 with a dirty tree asserts precedence; test titles carry AC-3, AC-4, AC-5
- done: AC-3, AC-4, AC-5

### T7: Docs + CHANGELOG
- files: `README.md`, `CHANGELOG.md`
- action: README — `fix` exit-code taxonomy, `entries` config as the canonical remedy for the warning banner, banner explanation. CHANGELOG — `[1.2.0] — Unreleased`: fail-closed entries, `entries` config, dist→src mapping, scripts mining, `fix` exit taxonomy.
- verify: README documents all four exit codes and the `entries` field; CHANGELOG entry present
- done: AC-5 (doc half), AC-8

### T8: Full-chain verification + settle evidence
- files: this DRAFT (evidence citations); no source changes
- action: run `npm run build && npm run typecheck && npm test` as one chained command; run necro self-scan at repo root and capture the `entryResolution` diagnostics; run `git diff --name-only` against the baseline commit and check every path against the Boundaries allowlist. Embed corpus, self-scan, chain, and diff-allowlist evidence in this DRAFT for settle.
- verify: chain exits 0; self-scan shows ≥1 prod entry (`src/cli.ts`, source `mapped`); diff paths all within allowlist
- done: AC-1, AC-2, AC-6, AC-7

**Evidence:**

1. **Full corpus** (AC-1): `npx vitest run test/entry-resolution.test.ts` — 23/23 passing, all 10 cases + the case-3 dual-path test + the AC-4 precedence test green. See Baseline Evidence above for the pre-implementation red/green split; every case that was red at baseline is green now.

2. **Full chain** (AC-6): `npm run build && npm run typecheck && npm test` — all three stages exit 0. `tsc --noEmit` clean. Test suite: **428 passed, 6 skipped** (pre-existing live-eval tests gated on an API key, unrelated to this slice), **0 failed**, across 78 files (76 run, 2 fully skipped).

3. **Self-scan at repo root** (AC-2): `node dist/cli.js scan --json .` → `diagnostics.entryResolution`:
   ```json
   {
     "prodEntryCount": 2,
     "sources": [
       { "file": "src/cli.ts", "source": "mapped" },
       { "file": "src/bench/cli-bench.ts", "source": "scripts" }
     ],
     "collapsed": false
   }
   ```
   `src/cli.ts` resolves with source `"mapped"` (via the heuristic `dist/ → src/` fallback — necro's own `tsconfig.json` has no `outDir`/`rootDir`, so the tsconfig-mapping branch is skipped and the heuristic branch resolves it) — satisfies AC-2 exactly.

4. **Collapse + refusal, end-to-end via the real built CLI** (AC-3, AC-4): `node dist/cli.js fix --write test/entry-resolution/fixtures/no-entries` → prints the refusal message, **exit 3**, disk untouched. Same fixture copied into a fresh dir, git-initialized and dirtied, then `fix --write` → still refusal message, **exit 3** (no-entries wins over dirty-tree, confirmed against the real CLI, not just the unit-level `runFix`/`fixExitCode` tests).

5. **Diff-allowlist check** (AC-7): `git diff --stat -- src/` shows exactly 10 changed files, all within the (amended) Boundaries allowlist: `src/analyze/classify.ts`, `src/cli.ts`, `src/config.ts`, `src/engine/index.ts`, `src/engine/model.ts`, `src/engine/prod-entries.ts`, `src/fix/index.ts`, `src/report/json.ts`, `src/report/sarif.ts`, `src/report/terminal.ts` — plus new `src/engine/entry-mapping.ts`. Test changes: new `test/entry-resolution/` (fixtures), `test/entry-resolution.test.ts`, `test/entry-mapping.test.ts`, and edits to `test/classify.test.ts`, `test/config.test.ts`, `test/fix.test.ts`, `test/report.test.ts`, `test/sarif.test.ts`, `test/scan.test.ts` — all under tests. Docs: `README.md`, `CHANGELOG.md`. The one file outside the DRAFT's original literal list — `src/engine/index.ts` — is covered by the Boundaries amendment above (confirmed with the user, not scope creep). No other files touched; `.cadence/state.json`/`STATE.md` changes are CADENCE's own bookkeeping from `cadence build task` commands, not source changes.

6. **AC-7/AC-8 asserting tests** (per this repo's settle AC↔test coverage gate): added to `test/release-shape.test.ts` — `"this slice's changes stay within the Boundaries allowlist (AC-7)"` runs `git diff --name-only <baseline-sha> -- src test README.md CHANGELOG.md` and asserts every changed path matches the amended allowlist; `"CHANGELOG documents the fail-closed entry-resolution slice under 1.2.0 Unreleased (AC-8)"` asserts the `[1.2.0] — Unreleased` section exists and mentions entries/mapping/scripts/exit-code. Both pass.

## Boundaries

- DO NOT change any file outside this allowlist (handoff §5.7, amended): `src/engine/prod-entries.ts`, `src/engine/model.ts`, `src/engine/index.ts`, `src/analyze/classify.ts`, `src/config.ts`, `src/fix/index.ts`, `src/cli.ts`, `src/report/*` (banner + diagnostics rendering only), new `src/engine/entry-mapping.ts`, tests/fixtures, `README.md`, `CHANGELOG.md`. Anything else needed → STOP and report before touching it.
  - **Amendment (T8):** handoff §5.7's allowlist omitted `src/engine/index.ts`, but its own Task T4 file-list (§6 step 4) requires `ScanResult` to gain `diagnostics: { entryResolution }` — and `ScanResult`/`scan()` are defined in `src/engine/index.ts`. There is no way to thread the diagnostic through without touching the file that defines the type it's added to. Confirmed with the user during T8 that this is a gap in the handoff's own allowlist, not scope creep, and the allowlist above is amended to include it. The actual diff to that file is additive only: a `ScanDiagnostics` interface, a `diagnostics` field on `ScanResult`, and `entryCollapse`/`diagnostics` wiring into the two existing `classify()`/return sites — no unrelated changes.
- DO NOT start implementation (T2+) before the T1 baseline is recorded in this DRAFT; if an expected-red case passes at baseline, STOP and report.
- DO NOT silently edit corpus fixtures or `expected.json` after baseline — corrections require a reviewed diff with stated rationale.
- DO NOT touch the later-slice work (handoff §3): `publicApiIds` wiring / export evidence truthfulness (Slice 2); pre-write worktree verification gate in `fix` (Slice 3); module-import edges, side-effect imports, taint inversion (Slice 4); cascade re-scan, initializer purity, README "safe"-language rewrite (tracked separately).
- DO NOT resolve tsconfig `extends` chains deeper than one local level — note the limit in a code comment.
- DO NOT demote findings by post-hoc mutation — collapse is an input to `classify()` so tier and evidence are born consistent.
- DO NOT let the empty-repo case trigger the collapse guard (`prodEntryCount === 0` alone is not the condition; the graph must be non-empty).
