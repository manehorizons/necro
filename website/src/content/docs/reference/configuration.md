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

### `coveragePath`

- **Type:** `string`
- **Default:** `"coverage/lcov.info"`

Path to an [lcov](https://github.com/linux-test-project/lcov) report (relative
to the scan target, or absolute). When the report exists, necro folds runtime
coverage into each finding — see [`scan` → Coverage](/necro/reference/cli/#coverage).
necro reads the report only; it never runs your tests. The `--coverage` flag
overrides this key.

### `complexity`

- **Type:** object (partial — unset keys keep their default)
- **Defaults:** `{ nesting: 3, cyclomatic: 10, cognitive: 15, godFunctionLoc: 50, godFunctionParams: 5 }`

Thresholds for the [complexity detectors](/necro/guide/complexity/). A function
is flagged when it exceeds a threshold. Override only the keys you want; the
rest fall back to the defaults above.

### `hotspots`

- **Type:** object
- **Default:** `{ top: 10 }`

Options for the [risk-hotspot](/necro/guide/hotspots/) ranking. `top` sets how
many hotspots `scan` shows.

### `duplication`

- **Type:** object
- **Default:** `{ minTokens: 50 }`

Options for the [duplication detector](/necro/guide/duplication/). `minTokens`
is the smallest normalized-token sequence reported as a clone.

### `llm`

- **Type:** object
- **Default:** `{ model: "claude-opus-4-8", snippetRadius: 20 }`

Options for the opt-in LLM layer ([`triage`](/necro/reference/cli/#necro-triage)
and [`refactor`](/necro/reference/cli/#necro-refactor)). `model` is the Anthropic
model id; `snippetRadius` is how many lines of context around a finding are sent.
Used only when you invoke those commands, which require `ANTHROPIC_API_KEY`.

## Example

```json title="necro.config.json"
{
  "include": ["**/*.ts", "**/*.tsx"],
  "ignore": ["**/node_modules/**", "**/dist/**", "**/*.generated.ts"],
  "coveragePath": "coverage/lcov.info",
  "complexity": { "cyclomatic": 15, "godFunctionLoc": 80 },
  "hotspots": { "top": 20 },
  "duplication": { "minTokens": 80 }
}
```

## Always skipped

Independent of `ignore`, declaration files (`*.d.ts`) and the directories
`node_modules`, `.git`, `dist`, `build`, and `coverage` are never analyzed.

:::note[This is the full key set]
`include`, `ignore`, `coveragePath`, `complexity`, `hotspots`, `duplication`,
and `llm` are the configuration keys today. Entry-point override syntax is
[planned](/necro/guide/roadmap/).
:::
