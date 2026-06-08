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
| `-h`, `--help` | Show help for `scan`. |

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
