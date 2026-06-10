# Necro

**Find dead code with evidence, not guesses.** Necro is a local, free, polyglot
CLI that finds anti-pattern code and proposes LLM-assisted fixes — and refuses
to guess where pure-static tools can't.

> **Status: early.** This first release finds **dead code in TypeScript** with
> confidence tiers, evidence chains, and the `test-only` verdict. Duplication,
> complexity, churn scoring, coverage ingestion, `--fix`, LLM triage, SARIF, and
> Python are on the [roadmap](#roadmap) — not yet implemented.

## Why Necro

Every analysis axis already has a strong incumbent, but no free, local tool
combines them with fix reasoning across languages. Necro targets that gap:

**free + local + multi-axis + LLM-assisted-fix + polyglot.**

Dead code means "unreachable from any entry point." Pure-static tools must make
a binary alive/dead call and eat the false positive when unsure. Necro's edge is
**refusing to guess**:

- **Confidence tiers** — `certain` / `likely` / `maybe`. Ambiguous code is
  quarantined in `maybe`, not falsely killed.
- **Evidence chains** — every finding ships its reasoning (static references,
  package exports, dynamic-import taint) so you audit the verdict.
- **The `test-only` verdict** — production-dead code kept warm only by tests, a
  signal no incumbent surfaces cleanly.
- **Semantic, not textual** — dead-code detection runs on the TypeScript
  compiler API (via [ts-morph](https://ts-morph.com)), following re-exports,
  type-only imports, and barrel files.

## Install

Requires **Node.js ≥ 20**.

The npm package (`@necrotool/necro`) and a global `necro` command are
[planned](#roadmap); for now, install from source:

```bash
git clone https://github.com/manehorizons/necro
cd necro
npm install
npm run build      # bundles the CLI to dist/cli.js
```

Run it with Node (optionally alias it):

```bash
node dist/cli.js scan src/
# or:
alias necro="node $(pwd)/dist/cli.js"
necro scan src/
```

## Quickstart

Point `necro scan` at a directory (defaults to `.`):

```bash
necro scan src/
```

You get a summary line followed by one **evidence chain** per finding, sorted
worst-first:

```
3 findings (1 certain, 1 likely, 1 test-only)

deadFn  src/util.ts:2   tier: certain
  ✓ 0 static references (TS compiler)
  • coverage: not available
  ✓ not in package.json exports
  ✓ no dynamic-import taint in scope
  → safe to remove

lonelyExport  src/util.ts:3   tier: likely
  ✓ 0 static references (TS compiler)
  • coverage: not available
  ✓ not in package.json exports
  ✓ no dynamic-import taint in scope
  → exported but unused — confirm no external use, then remove

testUtil  src/util.ts:4   tier: maybe
  ✓ 0 production references
  ✗ referenced only in test files
  • coverage: not available
  → prod-dead — delete fn + test, or wire into prod
```

- **`deadFn`** is private and unreferenced → `certain`, safe to remove.
- **`lonelyExport`** is exported but unused internally → `likely` (might be used
  externally, so Necro asks you to confirm).
- **`testUtil`** is reached only via tests → the `test-only` verdict.

### Output modes

```bash
necro scan src/ --json      # machine-readable JSON (for CI)
necro scan src/ --top 10    # only the 10 worst findings
node dist/cli.js --version
node dist/cli.js scan --help
```

A successful scan exits `0` regardless of findings (non-zero only on internal
error); a `--fail-on <tier>` flag is [planned](#roadmap). Gate CI by parsing
`--json` output.

## Use from an AI agent (MCP)

Necro runs as a read-only [MCP](https://modelcontextprotocol.io) server over
stdio, so an agent (Claude Code, Cursor, Codex, Windsurf) can call necro's
evidence-backed verdicts and verify its own edits in isolation — necro **never
edits your files and never wraps an LLM**:

```bash
necro mcp        # serves over stdio
```

Two read-only tools are exposed:

- **`necro_scan`** — the same findings as `necro scan --json` (dead-code tiers +
  evidence chains, complexity, hotspots, duplication).
- **`necro_verify`** — apply a set of `{file, content}` edits in a throwaway git
  worktree, run checks (default: typecheck + tests), and report `{ok, output}`.
  Your working tree is never touched.

Register it with your agent (Claude Code example):

```json
{
  "mcpServers": {
    "necro": { "command": "necro", "args": ["mcp"] }
  }
}
```

## Configuration

Necro runs zero-config. To customize which files it analyzes, add a
`necro.config.json` to your project root:

```json
{
  "include": ["**/*.ts", "**/*.tsx"],
  "ignore": ["**/node_modules/**", "**/dist/**"]
}
```

Each key you set **replaces** its default. Declaration files (`*.d.ts`) and the
`node_modules`, `.git`, `dist`, `build`, and `coverage` directories are always
skipped.

## How it works

A scan is a pipeline of small, independently tested stages:

```
discover files
  → build symbol graph        (ts-morph; the only language-specific part)
  → resolve entries           (prod entries + framework plugins)
  → two-color reachability    (+ taint)
  → classify into tiers
  → render (terminal / JSON)
```

The **core invariant**: language-specific code lives only in the symbol-graph
adapter. Reachability, classification, and reporting are language-agnostic — so
adding a language (Python is planned) means writing one new adapter, not
touching the engine. Test files are recognized from your real test-runner config
(jest `--showConfig` / vitest), so test infrastructure is never flagged dead.

See the [Architecture docs](#documentation) and
[`docs/necro-design-spec.md`](docs/necro-design-spec.md) for the full design.

## Documentation

A full documentation site (landing + guide + reference + architecture) lives in
[`website/`](website/), built with [Astro Starlight](https://starlight.astro.build).

Run it locally:

```bash
cd website
nvm use 22          # the docs site requires Node ≥ 22 (Astro 6)
npm install
npm run dev         # → http://localhost:4321/necro/
```

Or build and preview the static site:

```bash
npm run build       # outputs static HTML to website/dist/ (with search)
npm run preview
```

> The site is wired to deploy to GitHub Pages via
> [`.github/workflows/docs.yml`](.github/workflows/docs.yml); the deploy step is
> manual (`workflow_dispatch`) until Pages is enabled for the repository.

## Project layout

```
src/
├─ cli.ts                  commander CLI (necro scan)
├─ config.ts               necro.config.json loader
├─ discover.ts / glob.ts   file discovery
├─ engine/                 scan pipeline + prod-entry resolution
├─ graph/                  symbol graph (ts-morph) — the language adapter
├─ plugins/                FrameworkPlugin contract + test-runner plugin
├─ analyze/                two-color reachability, taint, tier classification
└─ report/                 evidence chains, terminal/JSON output, sorting
test/                      vitest suite, mirroring src/
website/                   Astro Starlight documentation site
docs/necro-design-spec.md  the full design reference
```

## Development

Requires **Node.js ≥ 20** (the docs site under `website/` needs Node ≥ 22).

```bash
npm test            # vitest, single run
npm run test:watch  # vitest watch mode
npm run typecheck   # tsc --noEmit
npm run build       # bundle the CLI (esbuild)
```

Necro is built **test-first** (red → green → refactor) and planned with the
[CADENCE](https://github.com/manehorizons/cadence) draft → build → settle
workflow; phase artifacts live in `.cadence/`. Contributions that come with
tests and clear acceptance criteria match how the codebase is built.

## Roadmap

**Available today:** semantic dead-code detection for TypeScript, confidence
tiers, evidence chains, the `test-only` verdict, test-runner awareness
(jest/vitest), and `--json` / `--top` output.

**Planned** (not yet implemented):

| Area | Planned capability |
|---|---|
| Accuracy | Coverage ingestion (lcov/c8) |
| Detectors | Duplication, nesting, cyclomatic & cognitive complexity, god-function |
| Scoring | CRAP score, complexity × churn hotspots |
| Fixes | `--fix-safe` (remove `certain`-dead), then LLM triage on `maybe`, then LLM refactors |
| Output | SARIF (GitHub code scanning), `--fail-on <tier>` |
| Frameworks | Next.js, NestJS (DI), template-based plugins |
| Languages | Python (detectors reused, new symbol-graph adapter) |
| Scale | Monorepo workspace-edge resolution |
| Packaging | Published npm package + global `necro` command |

## License

Not yet chosen — a license will be added before any public release. (MIT is the
intended default.)
