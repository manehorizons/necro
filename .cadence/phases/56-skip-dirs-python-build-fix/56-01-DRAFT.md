---
phase: 56-skip-dirs-python-build-fix
id: 56-01
tier: quick-fix
status: PENDING
---

# 56-01 — Scope SKIP_DIRS 'build' exclusion to JS/TS contexts

## Objective

Stop `discoverFiles`'s `SKIP_DIRS` from unconditionally dropping any directory literally named `build`, which silently discards legitimate Python subpackages (confirmed: pip's `pip/_internal/operations/build/`) from discovery — while still skipping JS/TS build-output dirs by default.

## Acceptance Criteria

### AC-1: Python-only configs no longer skip a `build` subpackage
Given a `config.include` containing only Python globs (no JS/TS glob) and a source tree with a `build/` directory containing `.py` files
When `discoverFiles` walks the tree
Then files under `build/` are discovered, not silently skipped

### AC-2: JS/TS configs still skip build-output dirs (regression guard)
Given `DEFAULT_CONFIG` (JS/TS globs only, no Python glob) and a source tree with a `build/` directory containing `.ts` files
When `discoverFiles` walks the tree
Then files under `build/` remain skipped, exactly as before this change

## Tasks

### T1: Make the `build` skip conditional on config.include
- files: `src/discover.ts`
- action: Replace the fixed module-level `SKIP_DIRS` set's unconditional `"build"` entry with a per-call decision: keep `"build"` in the skip set only when `config.include` contains no Python glob (no entry matching `*.py`); otherwise walk into `build/` like any other directory. Leave every other `SKIP_DIRS` entry (`node_modules`, `.git`, `dist`, `coverage`, `__pycache__`, `.venv`, `venv`, `.tox`, `.eggs`) unconditional — this rec only concerns `build`.
- verify: `npm test -- test/discover.test.ts`
- done: AC-1, AC-2

### T2: Add regression tests for both directions
- files: `test/discover.test.ts`
- action: Add a test tagged `(AC-1)` — Python-only `config.include` (e.g. `["**/*.py"]`) with a `build/` dir containing a `.py` file — asserts the file is discovered. Add a test tagged `(AC-2)` — `DEFAULT_CONFIG` with a `build/` dir containing a `.ts` file — asserts the file stays skipped.
- verify: `npm test -- test/discover.test.ts`
- done: AC-1, AC-2

## Boundaries

- DO NOT change the unconditional skip behavior of any `SKIP_DIRS` entry other than `"build"`.
- DO NOT touch `dist` — out of scope for this rec even though it's a similar-shaped build-output dir; no evidence it collides with a real Python package name.
- DO NOT add a general language-detection module — the fix should read directly off `config.include`, matching the existing `PY_CONFIG` pattern in `src/bench/python-import-resolution-rate.ts`.
