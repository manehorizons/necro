---
phase: 04-fix-safe
id: 04-04
tier: standard
status: PENDING
---

# 04-04 — Safe fix (necro fix)

## Objective

Turn necro from "reports dead code" into "removes it safely": `necro fix`

## Acceptance Criteria

### AC-1: Only `certain`-dead symbols are removed
Given a project containing a `certain`-dead private symbol alongside `likely`, `maybe`, and `test-only` findings
When `necro fix --write` runs
Then only the `certain`-dead (autoFixEligible) declaration is removed; `likely`, `maybe`, and `test-only` symbols are left untouched — the locked tiers (`maybe` never auto-fixed, `test-only` report-only) are honored.

### AC-2: Preview by default (no writes)
Given `certain`-dead symbols in the project
When `necro fix` runs without `--write`
Then it prints a unified diff of the pending removals and modifies no files on disk (contents unchanged), and the summary states how many symbols would be removed.

### AC-3: `--write` applies removals
Given `certain`-dead symbols and a clean git tree
When `necro fix --write` runs
Then the declarations are removed from disk, each edited file still parses as valid TypeScript, and the removed symbols no longer appear in a re-scan.

### AC-4: Dirty-tree guard
Given a git working tree with uncommitted changes
When `necro fix --write` runs
Then it refuses, writes nothing, and prints a message telling the user to commit/stash (or pass `--force`); `--force` bypasses the guard. When the target is not a git repo, it warns that there is no undo and proceeds.

### AC-5: Removal is clean, not partial
Given a `certain`-dead declaration adjacent to live code (preceding/following declarations in a shared file)
When it is removed
Then the whole declaration is deleted with no dangling syntax, sibling declarations and their formatting are intact, and the file still compiles — removal goes through the TS compiler API (ts-morph `.remove()`), never text splicing.

### AC-6: Idempotent and safe exit
Given a project that has just been fixed with `--write`
When `necro fix --write` runs again
Then it finds nothing to remove and reports "nothing to fix"; `necro fix` exits `0` on success in every mode (preview, write, no-op).

## Tasks

### T1: removal engine
- files: `src/fix/remove.ts`, `src/graph/symbol-graph.ts`
- action: Export `collectDeclarations` (or a focused `removableDeclarations`) from `symbol-graph.ts` so removal reuses the single definition of "top-level declaration". In `remove.ts`, `planRemovals(findings, targetPath)`: keep only `autoFixEligible` findings; group by file; for each file build a ts-morph `Project`, add the file, match each finding's declaration by `nameNode` start line + name, call `declNode.remove()`; return `Edit[] = { file, before, after }` for files that actually changed. ts-morph only — never text-splice.
- verify: unit test — a `certain`-dead function adjacent to a live function is removed; the live function and its formatting remain; `after` parses (re-add to a Project, no syntax errors). A finding that is not autoFixEligible yields no edit.
- done: AC-1, AC-5

### T2: unified diff renderer
- files: `src/fix/diff.ts`, `package.json`
- action: Add the `diff` (jsdiff) dependency. `renderDiff(edits): string` → for each edit, `createPatch(relPath, before, after, "", "")` joined; relative paths to the target. Returns "" for no edits.
- verify: unit test — an edit removing a function produces a unified-diff hunk containing the removed lines prefixed `-` and the function name; no edits → "".
- done: AC-2

### T3: git dirty-tree guard
- files: `src/fix/git-guard.ts`
- action: `workingTreeState(targetPath): Promise<"clean" | "dirty" | "unknown">` via `execFile("git", ["status", "--porcelain"], { cwd })` (mirror `plugins/test-runner/config-resolution.ts`). Empty stdout → clean; non-empty → dirty; spawn/git error (not a repo, no git) → unknown. Timeout-guarded.
- verify: unit test against tmp dirs — a fresh `git init` + untracked file → dirty; a clean committed tree → clean; a non-git dir → unknown.
- done: AC-4

### T4: fix orchestrator
- files: `src/fix/index.ts`
- action: `runFix(targetPath, config, { write, force }): Promise<FixResult>`. Run `scan` → `planRemovals` over its findings. No edits → `{ status: "nothing-to-fix" }`. Preview (no `--write`) → `{ status: "preview", diff, count }`, write nothing. `--write` → consult `workingTreeState`: `dirty` and not `force` → `{ status: "refused-dirty" }` (write nothing); `unknown` → warn "no undo available" and proceed; then write each edit's `after` to disk → `{ status: "written", count, files }`. Single-pass (no re-scan loop).
- verify: integration tests (tmp project) — preview leaves files byte-identical; `--write` on a clean/non-git tree removes the symbol and a re-scan finds it gone; dirty tree without `--force` refuses and writes nothing; `--force` overrides; second `--write` run → nothing-to-fix.
- done: AC-1, AC-2, AC-3, AC-4, AC-6

### T5: CLI wiring
- files: `src/cli.ts`
- action: Add a `fix` command: `argument("[path]", …, ".")`, `--write`, `--force`. Resolve target + load config (thread `--coverage` too, for tier parity with scan). Call `runFix`; print the diff/summary per `FixResult.status`; always `process.exitCode = 0` on success. Refused-dirty prints the commit/stash guidance.
- verify: `node dist/cli.js fix --help` lists `--write`/`--force`; a preview run on a fixture prints a diff and exits 0; a `--write` run mutates the fixture.
- done: AC-2, AC-3, AC-6

### T6: docs
- files: `website/src/content/docs/reference/cli.md`, `website/src/content/docs/guide/roadmap.md`
- action: Document `necro fix` (args, `--write`, `--force`), preview-by-default, the dirty-tree guard + non-git warning, and the single-pass limitation (cascading deletions deferred). Drop/adjust the "fix is planned" framing now that it ships; keep still-planned items labeled. Run `nvm use 22` before any `website/` build.
- verify: `nvm use 22 && npm --prefix website run build` passes the link-validator gate.
- done: AC-2, AC-4

## Boundaries

- **DO NOT remove anything but `autoFixEligible` (`certain`-dead) findings** — `likely`/`maybe`/`test-only` must never be written (locked tiers).
- **DO NOT write to disk without `--write`** — preview is the default and must be side-effect-free.
- **DO NOT text-splice or regex-delete** — removal goes through ts-morph `.remove()` only.
- **DO NOT modify `src/analyze/reachability.ts` or the classify tier logic** — `fix` consumes findings, it does not change detection.
- **DO NOT iterate to a fixpoint** — single-pass this slice; cascading re-analysis is deferred.
- **DO NOT bypass the dirty-tree guard except via explicit `--force`.**
- **DO NOT add fix deps to `website/`'s package.json** (separate package, Node ≥ 22).
