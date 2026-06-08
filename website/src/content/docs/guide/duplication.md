---
title: Duplication
description: Find copy-paste clones, including renamed copies, with no external tools.
sidebar:
  order: 9.7
---

`necro scan` detects copy-paste **clones** — duplicated code, even when the copy
renamed its variables. Clones appear in a `Duplication` section (and a
`duplication` array in `--json`).

```
Duplication (1 clone)
  43 tokens duplicated: src/a.ts:1-6, src/b.ts:1-6
```

## How it works

necro tokenizes each file with the same [tree-sitter](https://tree-sitter.github.io/)
parser the [complexity detectors](/necro/guide/complexity/) use — **no jscpd or
other external tool**. Before matching, it **normalizes** the tokens:

- identifiers collapse to a single `ID` token,
- literal values collapse to `LIT`,
- comments and whitespace are dropped,
- keywords, operators, and punctuation keep their kind.

It then finds the longest normalized token sequences shared by two or more
places. Because names and literals are erased, a block copied and then renamed
(a **Type-2 clone**) still matches:

```ts
function add(a, b) { const sum = a + b; return sum; }   // ← reported as
function plus(x, y) { const total = x + y; return total; } //   one clone group
```

Each clone is reported once, as its maximal region — not as a swarm of
overlapping fragments.

## Tuning

A sequence must be at least `minTokens` long to count (default 50). Lower it to
catch smaller clones, raise it to focus on large ones:

```json title="necro.config.json"
{
  "duplication": { "minTokens": 80 }
}
```

:::note[Report-only]
Duplication is reported, never auto-fixed. Cross-language and fuzzy (gapped)
clone detection are [planned](/necro/guide/roadmap/).
:::
