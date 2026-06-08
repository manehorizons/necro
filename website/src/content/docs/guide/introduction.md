---
title: Introduction
description: What Necro finds, and the idea behind it.
sidebar:
  order: 1
---

**Necro** finds anti-pattern code and proposes LLM-assisted fixes. This first
release focuses on the hardest axis to get right: **dead code** in TypeScript.

The name is forensic. Findings are triaged into tiers; each one ships an
**evidence chain** — an autopsy declaring cause of death. Code that only tests
keep alive is on life support (`test-only`). Removing dead code (planned
`--fix`) is exhumation.

## The problem with dead-code tools

Dead code means "unreachable from any entry point." Pure-static tools must make
a binary alive/dead call, and when they're unsure they either flag good code
(false positive, the trust-killer) or stay silent (false negative).

Necro's edge is **refusing to guess**. It adds a third `maybe` tier and
quarantines ambiguous code — dynamic imports, reflection, public API — with
reasons, instead of falsely killing it.

## What this release does

- Finds unreferenced TypeScript symbols using the **compiler API** (via
  ts-morph), not text matching — so it follows re-exports, type-only imports,
  and barrel files.
- Classifies every finding as [`certain` / `likely` / `maybe`](/necro/guide/understanding-results/).
- Surfaces the [`test-only`](/necro/guide/test-only/) verdict — production-dead
  code kept warm only by tests.
- Ships an [evidence chain](/necro/guide/evidence-chains/) per finding.
- Reads your real [test-runner config](/necro/guide/framework-awareness/) so
  test files aren't mistaken for dead code.

## What it doesn't do yet

Duplication, complexity/nesting, god-function detection, churn scoring,
coverage ingestion, `--fix`, LLM triage, SARIF output, and Python support are
all on the [roadmap](/necro/guide/roadmap/) — not yet available.
