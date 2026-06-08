---
title: Two-color reachability
description: The mark-and-sweep that distinguishes alive, test-only, and dead.
sidebar:
  order: 3
---

Module: `src/analyze/reachability.ts`.

`computeReachability` runs a mark-and-sweep over the symbol graph twice — once
in each "color" — so it can separate production-dead from truly dead.

```ts
function computeReachability(input: {
  nodes: SymbolNode[];
  edges: SymbolEdge[];
  prodEntries: Set<string>;
  testEntries: Set<string>;
  taintedFiles?: Set<string>;
}): ReachabilityResult[];
```

## The two passes

1. **Prod pass** — BFS from `prodEntries` over `prod` edges only →
   `reachedByProd`.
2. **Any pass** — BFS from all entries over `prod + test` edges →
   `reachedByAny`.

Classification per node:

| In `reachedByProd` | In `reachedByAny` | Result |
|---|---|---|
| ✅ | — | `alive` |
| ❌ | ✅ | `test-only` |
| ❌ | ❌ | `dead` |

Seeds that are themselves node ids count as reached; module-file seeds reach the
symbols referenced at their top level, which then chain transitively through
symbol-to-symbol edges.

## Taint

`findTaintedFiles(sources)` flags files containing dynamic dispatch that static
analysis can't follow — non-literal dynamic `import()`, `eval`, or computed
member dispatch (`obj[name]()`). Each `ReachabilityResult` carries a `tainted`
flag for nodes in those files. Taint doesn't change reachability; it's consumed
by [classification](/necro/architecture/tiers/) to downgrade a dead candidate to
`maybe`.

## Entries

`prodEntries` come from `resolveProdEntries` (`src/engine/prod-entries.ts`):
`package.json` `main`/`module`/`bin`/`exports` plus conventional source entries
(`src/index.ts`, etc.), kept only when they exist among scanned files.
`testEntries` come from the framework [plugins](/necro/architecture/plugins/).
