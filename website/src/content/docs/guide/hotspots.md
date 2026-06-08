---
title: Risk hotspots
description: Rank the riskiest functions by CRAP score and git churn.
sidebar:
  order: 9.6
---

`necro scan` ends with a **Risk hotspots** section: a single worst-first ranking
that fuses the other axes — complexity, test coverage, and git churn — into one
risk score per function. It answers "where is the dangerous code?" without a
cloud dashboard.

```
Risk hotspots (top 3)
  parsePayload  src/api/fmt.ts:88    cx=14 cov=20% crap=145.5 churn=9
  reconcile     src/sync/run.ts:12   cx=11 cov=0%  crap=132   churn=3
  buildTree     src/graph/tree.ts:40 cx=9  cov=60% crap=10.8  churn=7
```

Every input is shown so you can audit the ranking rather than trust a black box.

## The numbers

- **`cx`** — cyclomatic complexity of the function.
- **`cov`** — fraction of the function's lines covered, from your
  [lcov report](/necro/reference/cli/#coverage) (`n/a` if none).
- **`crap`** — the [CRAP score](https://en.wikipedia.org/wiki/Programming_complexity):
  `complexity² × (1 − coverage)³ + complexity`. Complex **and** untested code
  scores explosively higher; fully-covered code collapses to just its
  complexity. Computed only when coverage is available.
- **`churn`** — how many commits have touched the file (`git log`), `n/a`
  outside a git repo.

The ranking weight is:

```
risk = (crap ?? complexity) × (churn ?? 1)
```

## Graceful degradation

Coverage and git history are both optional. necro uses whatever is present:

| Available | Risk reduces to |
|---|---|
| coverage + git | `CRAP × churn` |
| coverage only | `CRAP` |
| git only | `complexity × churn` |
| neither | `complexity` |

So hotspots work in any repo, and sharpen as you add a coverage report and run
inside git history.

## Tuning

Show more or fewer rows via the `hotspots` block in `necro.config.json`:

```json title="necro.config.json"
{
  "hotspots": { "top": 20 }
}
```

:::note[Report-only]
Hotspots rank risk; they never modify code. Per-line and recency-weighted churn
are [planned](/necro/guide/roadmap/).
:::
