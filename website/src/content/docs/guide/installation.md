---
title: Installation
description: Install Necro and run it against your project.
sidebar:
  order: 2
---

Necro requires **Node.js ≥ 20**.

:::note[npm package is planned]
A published package (`@necrotool/necro`) with a global `necro` command is
[planned](/necro/guide/roadmap/) but not yet available. For now, install from
source.
:::

## From source

```bash
git clone https://github.com/manehorizons/necro
cd necro
npm install
npm run build
```

This produces a bundled CLI at `dist/cli.js`. Run it with Node:

```bash
node dist/cli.js scan src/
```

For convenience you can alias it:

```bash
alias necro="node $(pwd)/dist/cli.js"
necro scan src/
```

The rest of this guide writes commands as `necro …`; substitute
`node dist/cli.js …` if you haven't set up the alias.

## Verify

```bash
node dist/cli.js --version
node dist/cli.js scan --help
```

Next: run your first scan in the [Quickstart](/necro/guide/quickstart/).
