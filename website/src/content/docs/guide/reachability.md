---
title: Dead code & reachability
description: How Necro decides what is reachable.
sidebar:
  order: 7
---

Dead code is code **unreachable from any entry point**. Necro answers "is this
reachable?" with a graph, not a guess.

## The model

1. **Build a symbol graph.** Using the TypeScript compiler API, Necro finds
   every top-level declaration (functions, classes, variables, types) and every
   reference between them. Edges are tagged `prod` or `test` by the referencing
   file.
2. **Collect entry points.** Production entries come from `package.json`
   (`main`, `module`, `bin`, `exports`) and conventional files like
   `src/index.ts`. Test entries come from your test-runner config.
3. **Mark and sweep.** Starting from entries, walk the edges and mark everything
   reachable.
4. **Classify the rest.** Unmarked symbols are dead candidates, tiered by
   confidence.

## Two-color reachability

Reachability runs twice so Necro can tell production-dead from truly dead:

- **Prod pass** — from production entries over `prod` edges → `alive`.
- **Any pass** — from all entries over `prod + test` edges.

| Reached by prod | Reached by any | Verdict |
|---|---|---|
| ✅ | ✅ | `alive` (not reported) |
| ❌ | ✅ | [`test-only`](/necro/guide/test-only/) |
| ❌ | ❌ | `dead` candidate |

## Taint

Some constructs can't be resolved statically — dynamic `import()` with a
computed path, `eval`, or computed member dispatch (`obj[name]()`). Necro marks
the surrounding region as **tainted**. A tainted dead candidate is downgraded to
[`maybe`](/necro/guide/understanding-results/) rather than condemned — Necro
refuses to guess where it can't see.

## Scope

This release analyzes a **single package**. Monorepo workspace edges — a major
false-positive risk if done wrong — are [planned](/necro/guide/roadmap/) for a
dedicated release.
