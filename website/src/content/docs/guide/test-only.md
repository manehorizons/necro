---
title: The test-only verdict
description: Production-dead code kept warm only by tests.
sidebar:
  order: 6
---

Some code is referenced **only by your tests**. It's reachable — the tests use
it — but no production path leads to it. Pure-static tools call it alive (tests
reference it) and miss that it's production-dead. Necro gives it its own
verdict: **`test-only`**.

```
testUtil  src/util.ts:4   tier: maybe
  ✓ 0 production references
  ✗ referenced only in test files
  • coverage: not available
  → prod-dead — delete fn + test, or wire into prod
```

## How Necro decides

Necro tracks the *kind* of every reference edge — `prod` or `test` — based on
whether the referencing file is a test file (resolved from your real
[test-runner config](/necro/guide/framework-awareness/)). It then runs
reachability in two colors:

1. From production entries over **prod** edges → reached-by-prod (**alive**).
2. From test entries over **prod + test** edges → reached-by-any.

A symbol in reached-by-any but **not** reached-by-prod is `test-only`. See
[Dead code & reachability](/necro/guide/reachability/) for the full model.

## What to do about it

`test-only` is a signal, not a command. The fix depends on intent:

- The util is genuinely unused in production → **delete the function and its
  test**.
- It *should* be used in production → **wire it in**.

:::caution[Report-only]
Necro never auto-removes `test-only` code. Deleting tests is high-risk, so this
verdict is report-only — it emits the suggestion and leaves the decision to you.
:::
