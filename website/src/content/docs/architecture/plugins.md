---
title: Plugin contract
description: The FrameworkPlugin interface and how to write one.
sidebar:
  order: 6
---

Framework awareness is pluggable. A plugin contributes exactly four things;
auto-detection makes it zero-config. Types live in `src/plugins/types.ts`; the
registry in `src/plugins/registry.ts`.

## The contract

```ts
interface FrameworkPlugin {
  name: string;
  detect(ctx: RepoContext): boolean;
  entryPatterns(ctx: RepoContext): EntrySpec[];
  resolveEdges(ctx: RepoContext, graph: SymbolGraph): SyntheticEdge[];
  taintRules(ctx: RepoContext): TaintRule[];
}
```

- **`detect`** — is the framework present? Reads `RepoContext` probes:
  `hasDep([...])`, `hasConfig([...])`, `packageJsonHas(key)`.
- **`entryPatterns`** — roots that are alive by definition, each an
  `EntrySpec { glob, kind: "prod" | "test" }`.
- **`resolveEdges`** — synthetic edges the static graph can't see (e.g. jest
  `__mocks__/foo` ↔ `foo`).
- **`taintRules`** — regions to downgrade to `maybe` rather than flag.

## RepoContext

`createRepoContext(root)` reads `package.json` and lists the root once, exposing
the three probes above. `detectPlugins(plugins, ctx)` returns the matching
plugins; `resolveEntries` aggregates their `entryPatterns`. When no plugin
matches, the entry set is empty — the signal to degrade candidates to `maybe`
rather than kill them.

## Worked example: the test-runner plugin

`src/plugins/test-runner/` is the reference implementation. It detects
vitest/jest/mocha/playwright, resolves the real test config
([config resolution](/necro/guide/framework-awareness/)), marks test files /
setup / config as `test` entries, links jest `__mocks__` siblings via
`resolveEdges`, and taints non-literal `jest.mock(...)` calls.

## Writing a new plugin

1. Implement the four methods.
2. Make `detect` cheap and precise (deps + config presence).
3. Return `EntrySpec` globs for roots; emit `SyntheticEdge`s only for links the
   compiler genuinely can't see.
4. Prefer taint over false removal when something is ambiguous.
5. Register it in the engine's plugin list.

Plugins for Next.js, NestJS, and template frameworks are
[planned](/necro/guide/roadmap/).
