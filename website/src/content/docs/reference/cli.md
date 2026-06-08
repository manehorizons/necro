---
title: CLI
description: Necro command-line reference.
sidebar:
  order: 1
---

```
necro [options] [command]
```

Until the [npm package](/necro/guide/roadmap/) ships, invoke the built CLI as
`node dist/cli.js …`. Examples below use `necro` for brevity.

## Global options

| Option | Description |
|---|---|
| `-V`, `--version` | Print the version and exit. |
| `-h`, `--help` | Show help and exit. |

## `necro scan`

Scan a path for anti-pattern code.

```
necro scan [path] [options]
```

### Arguments

| Argument | Default | Description |
|---|---|---|
| `[path]` | `.` | Directory or file to scan. |

### Options

| Option | Description |
|---|---|
| `--json` | Emit findings as JSON instead of the terminal report. |
| `--top <n>` | Show only the worst `N` findings (after worst-first sort). |
| `--coverage <path>` | Path to an lcov report. Defaults to `coverage/lcov.info`; overrides the `coveragePath` config key. |
| `-h`, `--help` | Show help for `scan`. |

### Coverage

When an [lcov](https://github.com/linux-test-project/lcov) report is present,
`scan` folds runtime coverage into each finding's evidence chain. necro **reads
an existing report only** — it never runs your test suite. Discovery order:
`--coverage <path>` → the `coveragePath` config key → the default
`coverage/lcov.info`. A missing report is silently ignored; an unreadable one
prints a warning and the scan proceeds without coverage.

Each finding then shows one of three coverage states:

| State | Evidence line | Effect |
|---|---|---|
| Miss | `✓ 0 coverage hits (lcov)` | Strengthens the dead verdict; a private, untainted candidate stays `certain`. |
| Runtime hit | `✗ executed at runtime (N hits) despite 0 static refs — reached dynamically` | A 0-static-ref symbol that ran is downgraded to `maybe` and never auto-removed. |
| Not available | `• coverage: not available` | The symbol's file or line isn't in the report; tiers are unaffected. |

With no report at all, every finding renders `coverage: not available` — coverage
is purely additive and never changes behavior when absent.

### Output

By default, `scan` prints a summary line followed by one
[evidence chain](/necro/guide/evidence-chains/) per finding, sorted worst-first
(`certain` → `likely` → `maybe` → `test-only`). With `--json`, it prints an
array of finding objects — see [CI integration](/necro/guide/ci-integration/)
for the shape.

### Exit code

`scan` exits `0` on a successful run regardless of findings; a non-zero exit is
returned only on an internal error. A `--fail-on <tier>` flag for gating builds
is [planned](/necro/guide/roadmap/).

:::note[This is the full surface]
`scan` is the only command in this release. Additional commands (`fix`,
`explain`) are [planned](/necro/guide/roadmap/).
:::
