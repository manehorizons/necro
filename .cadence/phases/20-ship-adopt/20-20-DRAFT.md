---
phase: 20-ship-adopt
id: 20-20
tier: standard
status: PENDING
---

# 20-20 — ship: publish @manehorizons/necro 1.0.0 + release workflow (AC-1)

## Objective

Make necro adoptable in practice: publish `@manehorizons/necro@1.0.0` to npm so an
agent can install and run the phase-19 MCP server with no clone. This is the
**manual first publish** (decision D4) plus the doc flip (D5) and an automated
tag→build→publish workflow for subsequent releases. SARIF/Action/`--fail-on`
(SPEC AC-2) is a separate fast-follow draft, out of scope here.

## Acceptance Criteria

### AC-1: Publish @manehorizons/necro to npm + working agent-install story
Given `@manehorizons/necro` is unpublished (`npm view @manehorizons/necro version` → 404),
`package.json` version is `0.0.0`, and the only way to run `necro mcp` is
`git clone && npm run build`
When the version is bumped to `1.0.0` and the scoped package is published public
(bin `necro` → `dist/cli.js`, `files:["dist"]`, prepublish build), a
tag→build→publish release workflow is added, and the README/site install story +
MCP config are flipped to the `npx` form
Then `npm view @manehorizons/necro version` returns `1.0.0`, and
`npx -y @manehorizons/necro mcp` starts the stdio MCP server from the published
package alone (no local clone), so the documented agent MCP config
(`{command:"npx", args:["-y","@manehorizons/necro","mcp"]}`) is real

## Tasks

### T1: Package shape — version + metadata + prepublishOnly
- files: `package.json`
- action: bump to `1.0.0` (`npm version 1.0.0 --no-git-tag-version`); add
  `repository`, `homepage`, `bugs`, `keywords`; add `prepublishOnly: "npm run build"`
- verify: `node -e "p=require('./package.json'); ..."` shows version 1.0.0, the
  4 metadata fields present, prepublishOnly set
- done: AC-1

### T2: Build + dry-run tarball audit
- files: `dist/cli.js` (generated)
- action: `npm run build`; `npm publish --dry-run`; confirm tarball contains ONLY
  `dist/cli.js` + auto `package.json`/`README.md`/`LICENSE`
- verify: dry-run Tarball Contents has no `src/`, `test/`, `.env`, `dumpfile`,
  `.cadence/`, `docs/`, `website/`; `node dist/cli.js --version` prints 1.0.0
- done: AC-1

### T3: Publish public + tag the release (manual, OTP-gated)
- files: (npm registry; git tag)
- action: user runs `npm publish --access public` (supplies OTP); then
  `git commit -m "release: @manehorizons/necro@1.0.0"`, `git tag v1.0.0`,
  `git push origin main --tags`
- verify: npm prints `+ @manehorizons/necro@1.0.0`; `git tag` lists `v1.0.0`
- done: AC-1

### T4: Verify the agent-install story clean-room
- files: (smoke test in /tmp, no clone)
- action: in a fresh dir, `npm view @manehorizons/necro version`,
  `npx -y @manehorizons/necro --version`, `npx -y @manehorizons/necro mcp`
- verify: §4a returns 1.0.0 (not 404); §4b runs with no clone; §4c starts the
  stdio MCP server
- done: AC-1

### T5: Flip install docs to npm/npx (decision D5)
- files: `README.md`, `website/src/content/docs/guide/installation.md`,
  `website/src/content/docs/guide/roadmap.md`
- action: switch "install from source" → `npm i -g` / `npx`; MCP snippets
  `{command:"necro"}` → `{command:"npx", args:["-y","@manehorizons/necro","mcp"]}`;
  remove now-stale "pre-1.0" wording (D3 → 1.0.0)
- verify: grep finds no "install from source" / "pre-1.0" / `{command:"necro"}`
  in the flipped docs
- done: AC-1

### T6: Automated tag→build→publish release workflow
- files: `.github/workflows/release.yml`
- action: on `v*` tag push — checkout, Node ≥ 20, `npm ci`, `npm run build`,
  `npm publish --access public` using the `NPM_TOKEN` secret
- verify: workflow YAML is valid; triggers on `push: tags: ['v*']`; uses
  `NODE_AUTH_TOKEN`/`NPM_TOKEN`
- done: AC-1

### T7: Package-shape + release-workflow regression test (AC-1)
- files: `test/release-shape.test.ts` (or repo's test convention)
- action: assert `package.json` name `@manehorizons/necro`, version `1.0.0`,
  `bin.necro`, `files:["dist"]`, `prepublishOnly`; assert
  `.github/workflows/release.yml` exists and publishes on `v*`
- verify: `npm test` green; test title contains the `AC-1` tag so settle's
  AC↔test gate is satisfied
- done: AC-1

## Boundaries

- DO NOT implement SARIF / GitHub Action / `--fail-on` (SPEC AC-2) — separate
  fast-follow draft.
- DO NOT touch `src/` analysis logic; this phase is packaging/distribution + docs.
- DO NOT republish `0.0.0`; npm forbids re-publishing a version — roll forward to
  `1.0.1` if a bad `1.0.0` ships.
- DO NOT commit `.env`/`dumpfile`; confirm the dry-run tarball excludes them.
