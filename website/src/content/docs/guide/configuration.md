---
title: Configuration
description: Configure which files Necro analyzes.
sidebar:
  order: 8
---

Necro runs zero-config. To customize which files it analyzes, add a
`necro.config.json` to your project root.

```json title="necro.config.json"
{
  "include": ["**/*.ts", "**/*.tsx"],
  "ignore": ["**/node_modules/**", "**/dist/**"]
}
```

## Keys

| Key | Type | Default | Description |
|---|---|---|---|
| `include` | `string[]` | `["**/*.ts", "**/*.tsx"]` | Globs of files to analyze. |
| `ignore` | `string[]` | `["**/node_modules/**", "**/dist/**"]` | Globs to exclude. |

Each key you set **replaces** its default (values are merged per key, not
concatenated). If you set `ignore`, include the defaults you still want:

```json title="necro.config.json"
{
  "ignore": ["**/node_modules/**", "**/dist/**", "**/*.generated.ts"]
}
```

Declaration files (`*.d.ts`) and the directories `node_modules`, `.git`,
`dist`, `build`, and `coverage` are always skipped.

## What's not configurable yet

Entry-point overrides, per-detector thresholds, and tier tuning are
[planned](/necro/guide/roadmap/). Today, entry points are resolved
automatically from `package.json` and your test-runner config.

See the full [configuration reference](/necro/reference/) for the
authoritative key list.
