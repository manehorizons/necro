---
title: Glossary
description: Terms used throughout Necro's docs.
sidebar:
  order: 3
---

## Entry point

A symbol or file that is alive by definition — a root for reachability.
Production entries come from `package.json` (`main`, `module`, `bin`,
`exports`) and conventional files (`src/index.ts`); test entries come from your
[test-runner config](/necro/guide/framework-awareness/).

## Symbol graph

The graph Necro builds with the TypeScript compiler API: nodes are top-level
declarations, edges are references between them. The basis for
[reachability](/necro/guide/reachability/).

## Edge kind (`prod` / `test`)

Every reference edge is tagged by the kind of file it originates in —
production or test. This two-color tagging is what lets Necro distinguish
`alive` from [`test-only`](/necro/guide/test-only/).

## Reachability

Whether a symbol can be reached from an entry point by following edges. Necro
runs it in [two colors](/necro/guide/reachability/) (prod, then prod+test).

## Tier

The confidence level of a dead-code finding:
[`certain` / `likely` / `maybe`](/necro/guide/understanding-results/). Only
`certain` is flagged auto-fix eligible (for the [planned](/necro/guide/roadmap/)
`--fix`).

## Verdict

What a finding asserts: `dead` (unreachable) or
[`test-only`](/necro/guide/test-only/) (reachable only via tests).

## Taint

A region containing dynamic dispatch that static analysis can't resolve —
dynamic `import()`, `eval`, or computed member access. A tainted dead candidate
is downgraded to `maybe` rather than condemned.

## Evidence chain

The list of signals (each `✓` / `✗` / `•`) plus a verdict line that
[accompanies every finding](/necro/guide/evidence-chains/).

## CRAP

*Change Risk Anti-Patterns* — an existing public metric
(`complexity² × (1 − coverage)³ + complexity`) that Necro [plans](/necro/guide/roadmap/)
to adopt as one scoring axis. Not yet implemented.
