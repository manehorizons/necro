---
title: Complexity detectors
description: Necro's syntactic detectors — nesting, cyclomatic, cognitive, and god-function.
sidebar:
  order: 9.5
---

Beyond dead code, `necro scan` runs a second axis: **syntactic detectors** that
flag over-complex functions. They are deterministic, free, and run locally —
parsing each function with [tree-sitter](https://tree-sitter.github.io/) into a
language-agnostic shape, then measuring it. Complexity findings appear in their
own `Complexity` section under the dead-code report (and in `--json` as a
`complexity` array).

## The detectors

| Detector | Measures | Default threshold |
|---|---|---|
| `nesting` | Maximum block-nesting depth in the function | `> 3` |
| `cyclomatic` | Independent paths: `1 +` each branch / loop / `case` / `catch` / ternary / `&&` / `\|\|` / `??` | `> 10` |
| `cognitive` | Sonar-style score: each control structure costs `1 + its nesting depth`, so deeply nested code scores worse than flat code with the same branch count | `> 15` |
| `god-function` | Function size: lines of code **or** parameter count | `> 50` LOC / `> 5` params |

Cognitive complexity is the better human-pain proxy: two functions with the
same number of branches score differently if one buries them three levels deep.

:::note[Report-only]
Complexity findings are never auto-fixed — `necro fix` only removes
`certain`-dead code. LLM-assisted refactors (e.g. god-function splits) are
[planned](/necro/guide/roadmap/).
:::

## Tuning thresholds

Override any threshold in `necro.config.json` under a `complexity` block; unset
keys keep their defaults.

```json title="necro.config.json"
{
  "complexity": {
    "nesting": 4,
    "cyclomatic": 15,
    "cognitive": 20,
    "godFunctionLoc": 80,
    "godFunctionParams": 6
  }
}
```

See the [configuration reference](/necro/reference/configuration/) for the full
key set.

## Why tree-sitter (not the TS compiler)?

Dead-code detection needs *semantic* resolution — following imports, re-exports,
and types — so it uses the TypeScript compiler API. Syntactic detectors only
need the *shape* of the code, so they use tree-sitter: faster, and the same
detector logic will serve other languages once their grammar is added (the
detectors read a language-agnostic IR, never TypeScript constructs).
