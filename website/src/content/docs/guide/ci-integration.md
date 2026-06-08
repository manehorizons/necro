---
title: CI integration
description: Run Necro in a pipeline with machine-readable output.
sidebar:
  order: 10
---

Necro's `--json` output makes it easy to consume in CI.

```bash
necro scan src/ --json
```

This prints an array of findings:

```json
[
  {
    "name": "deadFn",
    "file": "/repo/src/util.ts",
    "line": 2,
    "tier": "certain",
    "verdict": "dead",
    "autoFixEligible": true,
    "evidence": [
      { "ok": true, "text": "0 static references (TS compiler)" }
    ]
  }
]
```

## Gating a build

:::caution[Exit code today]
A successful scan currently exits `0` regardless of findings (a non-zero exit
is only returned on an internal error). A `--fail-on <tier>` flag is
[planned](/necro/guide/roadmap/). Until then, gate the build by parsing the
JSON yourself.
:::

Example — fail when any `certain`-dead code is found:

```bash
count=$(necro scan src/ --json | node -e \
  'const f=JSON.parse(require("fs").readFileSync(0));process.stdout.write(String(f.filter(x=>x.tier==="certain").length))')
if [ "$count" -gt 0 ]; then
  echo "::error::$count certain-dead symbols found"
  exit 1
fi
```

Use `--top N` to cap output when you only care about the worst offenders.

## What's planned

[SARIF output](/necro/guide/roadmap/) (for GitHub code scanning), a dedicated
`--fail-on` flag, and a ready-made GitHub Action are on the roadmap.
