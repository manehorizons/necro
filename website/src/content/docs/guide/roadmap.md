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
- [Coverage ingestion](/necro/reference/cli/#coverage) (lcov) folded into the evidence chain and tiers.
- [Safe fix](/necro/reference/cli/#necro-fix): `necro fix` removes `certain`-dead code — preview by default, `--write` to apply, with a dirty git-tree guard.
- [Complexity detectors](/necro/guide/complexity/): nesting, cyclomatic, cognitive, and god-function (tree-sitter), with configurable thresholds.
- [Risk hotspots](/necro/guide/hotspots/): CRAP score (complexity × coverage) weighted by git churn, ranked worst-first.
- [Duplication](/necro/guide/duplication/): Type-2 (renamed) copy-paste clone detection (tree-sitter, no jscpd).
- Output modes: default terminal, `--json`, `--top N`.

## Planned

None of the following is implemented yet.

| Area | Planned capability |
|---|---|
| Accuracy | istanbul-JSON coverage (lcov ships today); cascading re-analysis after a fix |
| Detectors | Cross-language & fuzzy (Type-3) clones; god-function responsibility-clustering (nesting, cyclomatic, cognitive, god-function & Type-2 duplication ship today) |
| Scoring | Per-line & recency-weighted churn, ownership weighting (CRAP + per-file churn hotspots ship today) |
| Fixes | LLM triage on `maybe`, then LLM refactors (safe `certain`-dead removal ships today) |
| Output | SARIF (GitHub code scanning), `--fail-on <tier>` exit gating |
| Frameworks | Next.js, NestJS (DI decorators), template-based plugins |
| Languages | Python (the polyglot bet — detectors reused, new symbol-graph adapter) |
| Scale | Monorepo workspace-edge resolution |
| Packaging | Published npm package + global `necro` command |

## Distribution

The npm package (`@necrotool/necro`) and a global `necro` command are planned;
today Necro is [installed from source](/necro/guide/installation/).
