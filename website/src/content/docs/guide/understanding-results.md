---
title: Understanding results
description: Confidence tiers and verdicts explained.
sidebar:
  order: 4
---

Every finding has a **verdict** (what Necro asserts) and, for dead code, a
**confidence tier** (how sure it is). The tier drives what Necro is willing to
do automatically.

## Confidence tiers

| Tier | Condition | What it means | Auto-fix eligible |
|---|---|---|---|
| `certain` | private scope, 0 references, no taint nearby | Safe to remove | ✅ yes |
| `likely` | exported, 0 internal references, not an entry, no taint | Probably dead, but external consumers are invisible | ❌ no — confirm first |
| `maybe` | taint nearby (dynamic import, reflection) **or** public API | Ambiguous — quarantined, not condemned | ❌ never |

The `maybe` tier is the false-positive sink: rather than guess, Necro reports
the ambiguity with reasons. Only `certain` findings are eligible for automatic
removal (planned `--fix`); everything else needs a human.

## Verdicts

- **`dead`** — unreachable from any production entry point. Tiered as above.
- **`test-only`** — reachable, but only through test files. Production-dead.
  See [The `test-only` verdict](/necro/guide/test-only/). Reported, never
  auto-removed.

Alive code (reachable from a production entry) is not reported.

## Sort order

Findings print worst-first: `certain` → `likely` → `maybe` → `test-only`, then
by file and line. Use `--top N` to see only the worst N.

## A note on coverage

If you see `• coverage: not available` in an evidence chain, no
[lcov or Cobertura report](/necro/reference/cli/#coverage) was found for that
symbol's file/line — tiers fall back to static signals alone. Point `scan` at
a report (`coveragePath`/`pythonCoveragePath`, or the default
`coverage/lcov.info` / `coverage.xml`) to let Necro confirm a symbol is never
executed at runtime, which strengthens or contradicts the static verdict.
