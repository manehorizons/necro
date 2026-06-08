---
title: Evidence chains
description: How to read the reasoning behind each finding.
sidebar:
  order: 5
---

Necro's core promise is that you **audit verdicts instead of trusting them**.
Every finding ships an evidence chain: the signals Necro checked, each marked
pass or fail, ending in a verdict line.

```
formatPayload  src/api/fmt.ts:88   tier: maybe
  ✓ 0 static references (TS compiler)
  • coverage: not available
  ✗ in package.json exports — external consumers invisible
  ✗ dynamic-import taint in scope — target unresolvable
  → NOT auto-removed; LLM triage available
```

## The glyphs

| Glyph | Meaning |
|---|---|
| `✓` | Signal **supports** the verdict (e.g. zero references found) |
| `✗` | Signal **contradicts** it (e.g. it's in your public API) |
| `•` | Signal **not checked / unavailable** (e.g. no coverage report) |

## The signals

For a dead-code finding, Necro reports:

- **Static references** — how many real references the compiler found. Barrel
  re-exports are *not* counted as terminal references.
- **Coverage** — runtime hits, when a coverage report is available. Currently
  always `• not available` (ingestion is [planned](/necro/guide/roadmap/)).
- **package.json exports** — whether the symbol is part of your published
  public API. If so, external consumers are invisible and the finding is
  downgraded to `maybe`.
- **Dynamic-import taint** — whether the symbol sits near a dynamic `import()`,
  `eval`, or computed dispatch that static analysis can't resolve. Taint also
  downgrades to `maybe`.

For a [`test-only`](/necro/guide/test-only/) finding the signals are framed in
terms of production vs. test references instead.

:::note[About "LLM triage available"]
The verdict line for a `maybe` finding currently ends with
"LLM triage available". LLM triage is [planned](/necro/guide/roadmap/), not yet
implemented — read that line as *"this needs human/LLM judgement"*, not as a
feature you can invoke today.
:::

## Why it matters

A pure-static tool flags `formatPayload` as dead and burns you. Necro shows the
two `✗` lines, quarantines it as `maybe`, and leaves the call to you — that
second box is the whole pitch.
