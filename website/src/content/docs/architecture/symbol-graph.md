---
title: Symbol graph
description: How Necro models references with the TypeScript compiler API.
sidebar:
  order: 2
---

The symbol graph is Necro's accuracy moat. It's built with the **TypeScript
compiler API** (via [ts-morph](https://ts-morph.com)) — not text matching — so
it resolves references the way the compiler does: across re-exports, type-only
imports, and barrel files.

Module: `src/graph/symbol-graph.ts`. Types: `src/graph/types.ts`.

## Nodes

A `SymbolNode` is a top-level declaration — function, class, interface, type
alias, enum, or top-level variable:

```ts
interface SymbolNode {
  id: string;        // `${file}:${line}:${name}`
  name: string;
  file: string;
  line: number;
  exported: boolean;
}
```

## Edges

A `SymbolEdge` is a reference from one symbol (or module) to another, tagged by
the kind of file it originates in:

```ts
interface SymbolEdge {
  from: string;          // symbol id, or a module file path
  to: string;            // referenced symbol id
  kind: "prod" | "test";
}
```

`buildSymbolGraph(filePaths, { isTestFile })` walks each declaration's
references via `findReferencesAsNodes()` and emits one edge per real use. Two
rules matter for accuracy:

- **Barrel re-exports** (`export { foo } from "./foo"`) are pass-throughs, *not*
  terminal references — they don't keep a symbol alive on their own.
- **Edge kind** is decided by `isTestFile(referencingFile)`, which the engine
  derives from your resolved [test-runner config](/necro/guide/framework-awareness/).
  This `prod`/`test` tagging is what powers the
  [`test-only`](/necro/guide/test-only/) verdict.

## Why ts-morph, not tree-sitter

tree-sitter can't resolve symbols across files — it can't follow re-exports,
type-only imports, or barrel files. Dead code needs real semantic resolution,
and the TS compiler API is the canonical, Microsoft-maintained engine for it.
(tree-sitter is [planned](/necro/guide/roadmap/) for the language-agnostic
syntactic detectors, which don't need cross-file resolution.)
