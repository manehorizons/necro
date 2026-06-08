---
title: Configuration
description: necro.config.json reference.
sidebar:
  order: 2
---

Necro reads an optional `necro.config.json` from the directory it's invoked in.
Values are merged over the defaults **per key** (a key you set replaces its
default; it is not concatenated). With no config file, the defaults are used
verbatim.

## Keys

### `include`

- **Type:** `string[]`
- **Default:** `["**/*.ts", "**/*.tsx"]`

Globs of files to analyze.

### `ignore`

- **Type:** `string[]`
- **Default:** `["**/node_modules/**", "**/dist/**"]`

Globs to exclude from analysis.

## Example

```json title="necro.config.json"
{
  "include": ["**/*.ts", "**/*.tsx"],
  "ignore": ["**/node_modules/**", "**/dist/**", "**/*.generated.ts"]
}
```

## Always skipped

Independent of `ignore`, declaration files (`*.d.ts`) and the directories
`node_modules`, `.git`, `dist`, `build`, and `coverage` are never analyzed.

:::note[This is the full key set]
`include` and `ignore` are the only configuration keys in this release.
Entry-point overrides, detector thresholds, and tier tuning are
[planned](/necro/guide/roadmap/).
:::
