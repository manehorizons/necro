---
title: Quickstart
description: Run your first scan and read the output.
sidebar:
  order: 3
---

This walks through a scan and how to read what comes back. It assumes you've
[installed](/necro/guide/installation/) Necro.

## Run a scan

Point `necro scan` at a directory (defaults to the current directory):

```bash
necro scan src/
```

Necro discovers your TypeScript files, builds a symbol graph with the compiler
API, resolves entry points, and reports anything unreachable.

## Read the output

The default output is a summary line followed by one **evidence chain** per
finding, sorted worst-first:

```
3 findings (1 certain, 1 likely, 1 test-only)

deadFn  src/util.ts:2   tier: certain
  ✓ 0 static references (TS compiler)
  • coverage: not available
  ✓ not in package.json exports
  ✓ no dynamic-import taint in scope
  → safe to remove

lonelyExport  src/util.ts:3   tier: likely
  ✓ 0 static references (TS compiler)
  • coverage: not available
  ✓ not in package.json exports
  ✓ no dynamic-import taint in scope
  → exported but unused — confirm no external use, then remove

testUtil  src/util.ts:4   tier: maybe
  ✓ 0 production references
  ✗ referenced only in test files
  • coverage: not available
  → prod-dead — delete fn + test, or wire into prod
```

What this tells you:

- **`deadFn`** is private and unreferenced → **`certain`**, safe to remove.
- **`lonelyExport`** is exported but unused internally → **`likely`**; it might
  be consumed externally, so Necro asks you to confirm.
- **`testUtil`** is reached only through test files → the
  [`test-only`](/necro/guide/test-only/) verdict.

Read more in [Understanding results](/necro/guide/understanding-results/) and
[Evidence chains](/necro/guide/evidence-chains/).

## Other output modes

```bash
necro scan src/ --json      # machine-readable JSON
necro scan src/ --top 10    # only the 10 worst findings
```

See [CI integration](/necro/guide/ci-integration/) for using JSON in a pipeline.
