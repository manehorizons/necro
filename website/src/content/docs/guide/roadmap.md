---
title: Roadmap
description: What Necro does today and what's planned next.
sidebar:
  order: 11
---

Necro is in active development. This page is the honest line between **what
works now** and **what's planned** — nothing on the "planned" list is available
yet.

## Available today

- Semantic **dead-code** detection for TypeScript (compiler API via ts-morph).
- Confidence tiers: [`certain` / `likely` / `maybe`](/necro/guide/understanding-results/).
- [Evidence chains](/necro/guide/evidence-chains/) on every finding.
- The [`test-only`](/necro/guide/test-only/) verdict.
- [Test-runner awareness](/necro/guide/framework-awareness/) (jest / vitest).
- Output modes: default terminal, `--json`, `--top N`.

## Planned

None of the following is implemented yet.

| Area | Planned capability |
|---|---|
| Accuracy | Coverage ingestion (lcov/c8) to confirm runtime-dead symbols |
| Detectors | Duplication, nesting, cyclomatic & cognitive complexity, god-function/file |
| Scoring | CRAP score, complexity × churn hotspots |
| Fixes | `--fix-safe` (remove `certain`-dead), then LLM triage on `maybe`, then LLM refactors |
| Output | SARIF (GitHub code scanning), `--fail-on <tier>` exit gating |
| Frameworks | Next.js, NestJS (DI decorators), template-based plugins |
| Languages | Python (the polyglot bet — detectors reused, new symbol-graph adapter) |
| Scale | Monorepo workspace-edge resolution |
| Packaging | Published npm package + global `necro` command |

## Distribution

The npm package (`@necrotool/necro`) and a global `necro` command are planned;
today Necro is [installed from source](/necro/guide/installation/).
