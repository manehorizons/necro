# SETTLE Summary — 20-20

**Completed:** 2026-06-11T16:01:35.621Z

## Acceptance Criteria

- AC-1: PASS

## Tasks

- T1: DONE — package.json: version 1.0.0, private:false, repository/homepage/bugs/keywords added, prepublishOnly:npm run build
- T2: DONE — Dry-run tarball clean: 4 files (LICENSE, README, dist/cli.js, package.json), 32.7kB, no src/test/.env/dumpfile/docs/website. npm pkg fix normalized bin path. DEVIATION: --version was hardcoded 0.0.0 in src/cli.ts + src/mcp/server.ts; added src/version.ts sourcing version from package.json at build time (packaging, within boundary) so it tracks the bump. Suite 288 passed/6 skipped.
- T3: DONE — User ran npm login + npm publish --access public; @manehorizons/necro@1.0.0 live on registry (maintainer manehorizons). Release commit 7cd3df0 pushed to main; v1.0.0 annotated tag repointed to 7cd3df0 (old MVP marker preserved as mvp-feature-complete); both tags pushed. Repo made public.
- T4: DONE — Clean-room verified from published @manehorizons/necro@1.0.0 in /tmp (no clone): npm view→1.0.0, npx --version→1.0.0, scan --help works, MCP initialize handshake returns serverInfo{name:necro,version:1.0.0}, tools/list→[necro_scan,necro_verify]. AC-1 agent-install story real.
- T5: DONE — Flipped install story to npm/npx across README, installation.md, roadmap.md, index.mdx, cli.md. MCP snippets -> {command:npx, args:[-y,@manehorizons/necro,mcp]}. Removed 'pre-1.0' and shipped 'Packaging' roadmap rows. Done before publish so the npm-page README is correct on day one.
- T6: DONE — Added .github/workflows/release.yml: triggers on v* tags, guards tag==package.json version, npm ci + build + test + npm publish --access public via NODE_AUTH_TOKEN/secrets.NPM_TOKEN. Needs NPM_TOKEN repo secret set before first automated use (not needed for manual T3).
- T7: DONE — Added test/release-shape.test.ts (4 tests, all tagged AC-1): public-scoped package shape, npm-page metadata, VERSION===package.json.version (no drift), release.yml publishes on v* with NPM_TOKEN + version guard. Full suite 292 passed/6 skipped.

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
