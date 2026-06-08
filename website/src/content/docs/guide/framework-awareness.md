---
title: Framework awareness
description: How Necro avoids flagging test infrastructure as dead.
sidebar:
  order: 9
---

The single biggest false-positive class is **test infrastructure**. Test files,
setup files, and config files are run by your test runner, never imported by
production code — so a naive tool flags your whole test suite as dead.

Necro ships a **test-runner plugin** that does two opposite jobs:

1. **Don't flag test infrastructure as dead.** Test files, setup files, global
   setup, and config files are treated as entry points.
2. **Don't flag test-only production code as alive.** A util used only by tests
   is production-dead — the [`test-only`](/necro/guide/test-only/) verdict.

## Detection

The plugin activates automatically when it detects a test runner — via a
dependency (`vitest`, `jest`, `@jest/core`, `mocha`, `@playwright/test`), a
config file (`vitest.config.*`, `jest.config.*`), or a `jest` key in
`package.json`.

## Reading your real config

The #1 self-destruct is assuming `**/*.test.ts` when your repo uses
`**/*.spec.ts`. Necro reads your actual config instead:

- **jest** — runs `jest --showConfig` (when you allow it), falling back to
  parsing `jest.config.*` or `package.json#jest`.
- **vitest** — parses the `test` block of `vitest.config.*` / `vite.config.*`.

From that it learns your test match globs, setup files, and global setup, and
marks them as test entries. Resolved config is cached.

:::note[Shell-out is opt-in]
Letting a runner report its own config means executing project code, so the
`jest --showConfig` shell-out is sandboxed, timed out, and off by default in
CI. The static-parse fallback always works without it.
:::

## Other frameworks

Plugins for Next.js, NestJS (DI decorators), and template-based frameworks are
[planned](/necro/guide/roadmap/). When no plugin matches a framework, candidates
degrade to [`maybe`](/necro/guide/understanding-results/) rather than being
falsely killed.
