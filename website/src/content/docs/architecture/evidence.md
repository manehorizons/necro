---
title: Evidence chains
description: How findings render their reasoning.
sidebar:
  order: 5
---

Module: `src/report/evidence.ts`.

The evidence reporter is a pure formatter. It takes the signals that
[classification](/necro/architecture/tiers/) already attached to a finding and
renders the [evidence chain](/necro/guide/evidence-chains/) — it does no
analysis of its own.

```ts
function renderEvidenceChain(finding: ClassifiedFinding): string;
function renderFindings(findings: ClassifiedFinding[]): string;
```

## The signal model

```ts
interface EvidenceSignal {
  ok: boolean | null; // true → ✓, false → ✗, null → •
  text: string;
}
```

A `null` (`•`) marks a signal that wasn't checked — coverage renders this way
whenever no lcov/Cobertura report is found for that symbol's file or line (see
[Coverage](/necro/reference/cli/#coverage)); it's additive and never blocks a verdict.

## Why split assemble from format

Keeping signal-truth at the point of decision (`classify`) and formatting in the
reporter means the two can never disagree. The evidence box always shows exactly
what the classifier reasoned about — which is the whole point of a trust
artifact.

## Other reporters

- `src/report/terminal.ts` — the default human view: a summary line plus
  evidence chains.
- `src/report/json.ts` — the `--json` serializer (a stable, flat finding shape).
- `src/report/sort.ts` — `sortWorstFirst` (tier severity → file → line).
