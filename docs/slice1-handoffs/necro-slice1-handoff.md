# Necro — Slice 1 Handoff: Fail-Closed Entry Resolution

**Repo:** `manehorizons/necro` · baseline v1.1.0 (main)
**Status:** Supersedes all prior entry-resolution notes in `docs/necro-design-spec.md` §5 where they conflict.
**Verification:** Run under Cadence DRAFT→BUILD→SETTLE. SUMMARY evidence citations must be embedded in DRAFT text, not handoff prose.
**Protocol:** Corpus before code. The fixture corpus (§4) is authored and validated against the *current* build first — failing cases must be red at baseline before any implementation lands. Corpus corrections require reviewed diffs with stated rationale; no silent edits.

---

## 1. Problem statement

`resolveProdEntries` (`src/engine/prod-entries.ts`) produces an **empty prod-entry set** for any repo whose manifest points at build output (`dist/`) and whose source entry is not one of four hardcoded conventional names (`index.ts`, `src/index.ts`, `main.ts`, `src/main.ts`). Necro's own repo triggers this (`bin: dist/cli.js`, entry `src/cli.ts`).

With zero prod seeds, the prod-color BFS reaches nothing, every non-test-reached symbol classifies `dead`, every private one classifies `certain`, and `necro fix --write` mass-deletes correct code. This is a confirmed field incident.

The degradation promised in `src/plugins/entry-resolver.ts` ("empty entry set → degrade candidates to `maybe`") **is documented but not implemented**. `.github/workflows/necro-scan.yml` routes CI around the bug instead of fixing it.

## 2. Scope

Four changes, one invariant:

> **Invariant (fail-closed):** When zero production entry points resolve, no finding is `certain`, nothing is auto-fix eligible, `fix` refuses with a distinct exit code, and the user is told exactly why and how to declare entries.

### 2.1 Empty-entry guard (the safety net)

- `buildReachabilityModel` computes `entryResolution: { prodEntryCount: number, sources: EntrySource[] }` where `EntrySource = "manifest" | "mapped" | "convention" | "scripts" | "config" | "plugin" | "workspace"` (one record per resolved entry: `{ file, source }`).
- `ScanResult` gains `diagnostics: { entryResolution }` — surfaced in terminal, JSON, and SARIF output.
- When `prodEntryCount === 0` **and** `graph.nodes.length > 0`:
  - Every `dead` finding is demoted to tier `maybe`, `autoFixEligible: false`.
  - Evidence chain for each demoted finding **prepends** a truthful signal:
    `{ ok: false, text: "0 production entry points resolved — reachability unseeded" }`.
  - Terminal report prints a prominent warning banner (single block, top of output): what happened, why, and the three remedies (fix manifest, add `entries` to config, rely on convention names). No preachy prose — one banner, actionable.
- Demotion happens in `classify()` via a new `ClassifyInput` field (`entryCollapse: boolean`), not by post-hoc mutation — the evidence chain and tier must be born consistent.

### 2.2 Explicit `entries` config (the escape hatch)

- `NecroConfig` gains `entries?: string[]` — globs relative to scan target, resolved through the existing `globMatcher`, matched against discovered files, added to `prodEntries` with source `"config"`.
- Documented in README config section as the canonical remedy for the warning banner.

### 2.3 dist→src manifest mapping (fixes the common case silently)

- When a manifest entry (`main`/`module`/`bin`/`exports` leaf) does not exist among scanned files, attempt a mapping via `tsconfig.json` `compilerOptions.outDir` + `rootDir`:
  - Strip `outDir` prefix, prepend `rootDir`, swap extensions: `.js→.ts`, `.jsx→.tsx`, `.mjs→.mts`, `.cjs→.cts`. Also try the same basename with `.ts`/`.tsx` when the direct swap misses (compiled `.js` from `.tsx`).
  - Keep the mapped path **only if it exists among scanned files** (source `"mapped"`). Never guess into paths that weren't discovered.
  - `extends` chains: resolve one level of `tsconfig` `extends` (local file only); deeper chains are out of scope — note in code comment.
- No tsconfig or no `outDir`: heuristic fallback — replace a leading `dist/`, `build/`, or `out/` segment with `src/` plus the same extension swap, again gated on existence in scanned files.

### 2.4 `scripts` mining (secondary roots)

- Parse `package.json` `scripts` values. Extract tokens matching `/\.[cm]?[jt]sx?$/` that resolve (relative to target root) to a scanned file. Add as prod entries with source `"scripts"`.
- Tokenization is whitespace-split after stripping quotes; no shell parsing. False negatives acceptable; false positives must not be (existence gate covers this).

### 2.5 `fix` refusal + exit-code taxonomy

- `runFix`: if `diagnostics.entryResolution.prodEntryCount === 0` and the graph is non-empty, return new status `{ status: "refused-no-entries" }` **before** the nothing-to-fix check — the user must learn *why* there is nothing eligible.
- CLI exit codes for `fix` (public contract, mirror Cadence exit-taxonomy discipline — refusal ≠ error):
  - `0` — written / preview / nothing-to-fix
  - `1` — unexpected error
  - `2` — refused-dirty (existing behavior, now with explicit code)
  - `3` — refused-no-entries
- Audit current `cli.ts` exit behavior first; document the taxonomy in README under `fix`, and assert each code in the corpus harness.

## 3. Non-goals (later slices — do not touch)

- `publicApiIds` wiring / evidence-line truthfulness for exports (Slice 2)
- Pre-write worktree verification gate in `fix` (Slice 3)
- Module-import edges, side-effect imports, taint inversion (Slice 4)
- Cascade re-scan, initializer purity checks, README "safe" language rewrite (tracked separately)

## 4. Adversarial fixture corpus — author and validate FIRST

Location: `test/entry-resolution/fixtures/<case>/` + `test/entry-resolution.test.ts`. Each case is a minimal on-disk repo (package.json, optional tsconfig, sources) with an `expected.json` declaring: resolved entries (file + source), per-symbol verdict/tier, `fix` status + exit code.

**Baseline gate:** before implementation, run the corpus against current `main`. Cases marked `baseline: "red"` below MUST fail; `baseline: "green"` MUST pass. Record the baseline run output in DRAFT.

| # | Case | Setup | Expected after Slice 1 | Baseline |
|---|------|-------|------------------------|----------|
| 1 | `no-entries` | No main/bin/exports; entry file `src/cli.ts`; private helper `orphan()` truly unreferenced | 0 prod entries; ALL dead findings `maybe` + unseeded evidence signal; `fix` → refused-no-entries, exit 3 | red |
| 2 | `dist-bin-tsconfig` | `bin: dist/cli.js`; tsconfig `outDir: dist`, `rootDir: src`; `src/cli.ts` imports `used()`; `orphan()` private unreferenced | Entry `src/cli.ts` (source `mapped`); `used` alive; `orphan` certain | red |
| 3 | `dist-heuristic` | `main: dist/index.js`; **no tsconfig**; `src/index.ts` exists | Entry `src/index.ts` (source `convention` acceptable, but heuristic path must also resolve when convention is disabled in-test) | green* |
| 4 | `dist-tsx-swap` | `main: dist/app.js`; tsconfig outDir/rootDir; source is `src/app.tsx` | Entry `src/app.tsx` (mapped, extension fallback) | red |
| 5 | `scripts-entry` | Only root: `scripts: { bench: "tsx src/bench.ts" }`; `src/bench.ts` imports `helper()` | Entry `src/bench.ts` (source `scripts`); `helper` alive | red |
| 6 | `config-entries` | necro config `entries: ["src/server.ts"]`; server imports `handler()` | Entry via `config`; `handler` alive | red |
| 7 | `conventional-regression` | Plain `src/index.ts` entry, one dead private symbol | Entry via `convention`; dead symbol still `certain`; `fix` previews it, exit 0 | green |
| 8 | `exports-map` | `exports: { ".": { import: "./dist/index.js" } }`; tsconfig mapping to `src/index.ts` | Entry mapped from exports leaf | red |
| 9 | `empty-repo` | Zero source files | Empty model (existing behavior); `fix` → nothing-to-fix, exit 0 — guard must not misfire | green |
| 10 | `monorepo-member` | Workspace member with resolvable entry; root has none of its own | Workspace entries count toward `prodEntryCount` (no false collapse) | green |

*Case 3: assert both paths — convention hit, and heuristic hit with the conventional candidate removed.

Corpus rule: every case's `expected.json` includes the full evidence-signal text for at least one finding, so evidence integrity is asserted, not just tiers.

## 5. Acceptance bar (SETTLE criteria — all must hold)

1. Full corpus green; baseline-red cases were demonstrably red first (cited in DRAFT).
2. Necro self-scan at repo root resolves ≥1 prod entry (`src/cli.ts` via bin mapping) and reports it under `diagnostics.entryResolution` with source `mapped`.
3. With mapping artificially disabled (test hook or fixture mirroring necro's shape), self-scan yields **zero** `certain` findings and `fix --write` exits 3 without touching disk.
4. `git status --porcelain` clean-tree check: fixture case 1 confirms refused-no-entries fires *before* the dirty-tree guard (refusal reasons must not shadow each other; no-entries wins).
5. Exit codes 0/1/2/3 asserted in tests; documented in README.
6. `pnpm build && pnpm typecheck && pnpm test` green (chain in one command).
7. No changes outside: `src/engine/prod-entries.ts`, `src/engine/model.ts`, `src/analyze/classify.ts`, `src/config.ts`, `src/fix/index.ts`, `src/cli.ts`, `src/report/*` (banner + diagnostics rendering), new `src/engine/entry-mapping.ts`, tests/fixtures, README, CHANGELOG. Anything else → stop and report.
8. CHANGELOG entry under `[1.2.0] — Unreleased`: fail-closed entries, `entries` config, dist→src mapping, scripts mining, `fix` exit-code taxonomy.

## 6. Sequencing for the build session

1. Author corpus + `expected.json` files → run against `main` → record red/green baseline (STOP if any expected-red case passes; report before proceeding).
2. `entry-mapping.ts` (tsconfig + heuristic mapping) + extend `resolveProdEntries` with sources.
3. `entries` config field + scripts mining.
4. `entryResolution` diagnostics through model → scan → reports.
5. `entryCollapse` demotion in classify + evidence signal.
6. `refused-no-entries` in `runFix` + CLI exit taxonomy.
7. Docs (README `fix` exit codes + `entries` config + warning-banner explanation), CHANGELOG.
8. SETTLE with corpus + self-scan evidence embedded in DRAFT.
