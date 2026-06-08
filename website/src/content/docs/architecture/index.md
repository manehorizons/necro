---
title: Overview
description: How Necro is built, and the invariant that keeps it polyglot.
sidebar:
  order: 0
---

This section is for contributors. It explains how a scan flows through the
engine and the design rules that keep Necro extensible.

For the full rationale and locked decisions, see the
[design spec](https://github.com/manehorizons/necro/blob/main/docs/necro-design-spec.md)
in the repo.

## The pipeline

A scan is a pipeline of small, independently testable stages:

```
discover files
  → build symbol graph        (ts-morph; language-specific)
  → resolve entries           (prod entries + framework plugins)
  → two-color reachability    (+ taint)
  → classify into tiers
  → render (terminal / JSON)
```

Each stage is a focused module with a clear interface — see
[Project layout](/necro/architecture/project-layout/).

## The core invariant

> Language-specific code lives **only** in the symbol-graph adapter.

Detectors and the reachability/classification logic are language-agnostic. They
operate on a generic graph, never on TypeScript specifics. Adding a new language
(Python is [planned](/necro/guide/roadmap/)) means writing one new symbol-graph
adapter — the rest of the engine is reused unchanged. A detector that
special-cases a language is a leak.

## Two IRs (by design)

The design calls for two intermediate representations:

1. **Symbol graph** — references, exports, reachability. Per-language, built by
   the language-native semantic tool (the TS compiler API today). **Implemented.**
2. **Syntactic IR** — block tree + branch counts for complexity/duplication
   detectors. Language-agnostic, tree-sitter-fed. **Planned** — this release
   ships dead-code detection only, which needs the symbol graph.

## What exists today

The dead-code vertical slice: discovery, symbol graph, plugin/entry resolution,
two-color reachability with taint, tier classification, evidence chains, and
terminal/JSON output. Syntactic detectors, scoring, and fixes are
[planned](/necro/guide/roadmap/).
