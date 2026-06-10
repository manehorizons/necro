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

## What Necro does

- Finds unreferenced TypeScript symbols using the **compiler API** (via
  ts-morph), not text matching — so it follows re-exports, type-only imports,
  and barrel files.
- Classifies every finding as [`certain` / `likely` / `maybe`](/necro/guide/understanding-results/),
  ships an [evidence chain](/necro/guide/evidence-chains/) per finding, and
  surfaces the [`test-only`](/necro/guide/test-only/) verdict.
- Reads your real [test-runner config](/necro/guide/framework-awareness/) and
  folds [lcov coverage](/necro/reference/cli/#coverage) into the verdict.
- Analyzes beyond dead code: [complexity](/necro/guide/complexity/) detectors,
  CRAP × churn [risk hotspots](/necro/guide/hotspots/), and Type-2
  [duplication](/necro/guide/duplication/).
- Acts on findings: [`fix`](/necro/reference/cli/#necro-fix) safely removes
  `certain`-dead code; [`triage`](/necro/reference/cli/#necro-triage) and
  [`refactor`](/necro/reference/cli/#necro-refactor) bring an opt-in LLM layer
  (refactors verified in a scratch worktree).
- Exposes a read-only [MCP server](/necro/reference/cli/#necro-mcp) so AI agents
  can call necro's verdicts and verify their own edits.

## What it doesn't do yet

SARIF output, `--fail-on` build gating, more framework plugins (Next.js,
NestJS), monorepo workspace edges, and Python support are on the
[roadmap](/necro/guide/roadmap/) — not yet available.
