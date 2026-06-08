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
[evidence chain](/necro/guide/evidence-chains/) per dead-code finding, sorted
worst-first (`certain` → `likely` → `maybe` → `test-only`), then a
[`Complexity`](/necro/guide/complexity/) section listing over-complex functions,
then a [`Risk hotspots`](/necro/guide/hotspots/) ranking (both omitted when
empty). With `--json`, it prints an object with three arrays — `findings` (dead
code), `complexity`, and `hotspots` — see
[CI integration](/necro/guide/ci-integration/) for the shape. `--top N` caps the
dead-code findings; the other sections follow their own limits.

### Exit code

`scan` exits `0` on a successful run regardless of findings; a non-zero exit is
returned only on an internal error. A `--fail-on <tier>` flag for gating builds
is [planned](/necro/guide/roadmap/).

## `necro fix`

Safely remove `certain`-dead code. `fix` reuses the same detection as `scan`,
then removes **only** `certain`-tier (auto-fix-eligible) symbols — `likely`,
`maybe`, and `test-only` findings are never touched. Removals go through the TS
compiler API (ts-morph), not text editing, so the edited file stays valid.

```
necro fix [path] [options]
```

### Arguments

| Argument | Default | Description |
|---|---|---|
| `[path]` | `.` | Directory or file to fix. |

### Options

| Option | Description |
|---|---|
| `--write` | Apply the removals to disk. **Without it, `fix` only previews** a unified diff and changes nothing. |
| `--force` | Bypass the dirty git-tree guard. |
| `--coverage <path>` | Path to an lcov report, same as `scan` — keeps tiers consistent between the two. |
| `-h`, `--help` | Show help for `fix`. |

### Safety model

- **Preview by default.** `necro fix` prints the diff of what *would* be removed and writes nothing until you add `--write`.
- **Dirty-tree guard.** With `--write`, `fix` refuses if the git working tree has uncommitted changes (git is your undo) — commit/stash first, or pass `--force`. If the target isn't a git repo, it warns that there's no undo and proceeds.
- **Single pass.** `fix` removes what's `certain`-dead in one scan; it does not re-analyze to chase code that becomes dead *after* a removal. Re-run `fix` to catch the next layer. Cascading re-analysis is [planned](/necro/guide/roadmap/).

### Exit code

`fix` exits `0` on every successful run (preview, write, or nothing-to-fix).

:::note[This is the full surface]
`scan` and `fix` are the commands in this release. An `explain` command and
LLM-assisted refactors are [planned](/necro/guide/roadmap/).
:::
