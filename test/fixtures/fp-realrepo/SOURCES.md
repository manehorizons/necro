# Real-repo false-positive corpus — sources & provenance

This corpus measures necro's **false-"dead"** rate on real-world framework
repos: structurally-alive symbols that static reachability cannot see a reason
for, so they read as dead. Unlike the `triage-realrepo` corpus (single-symbol
snippets + captured evidence), reachability false positives need the **repo
structure** (entrypoint + surrounding files), so each case is a small vendored
file tree.

Dead-code reachability is deterministic (no model in the loop), so these slices
are a hermetic `npm test` gate — no API key, no network, no cost.

## `nextjs-app/` — Next.js App Router (phase 23)

Real, SHA-pinned files from **`vercel/next.js`** at commit
`5b0aa04b1042abb492504a378cfc08416a937273`:

| file in slice | source path in `vercel/next.js` |
|---------------|----------------------------------|
| `app/page.tsx` | `packages/create-next-app/templates/app/ts/app/page.tsx` |
| `app/layout.tsx` | `packages/create-next-app/templates/app/ts/app/layout.tsx` |
| `app/api/disable-draft/route.ts` | `examples/cms-contentful/app/api/disable-draft/route.ts` |

`package.json` and `next.config.mjs` are a **minimal scaffold** (not vendored) —
just enough for the Next.js plugin's `detect()` to fire (a `next` dependency and
a `next.config.*`). External imports (`next/image`, `next/font/google`,
`next/headers`, the `.module.css`) are unresolved at scan time; that is fine —
ts-morph still parses the local declarations, and `test/fixtures` is excluded
from `tsc` (these are scan-data, not project source).

### Why these are false positives

Next.js invokes these files by file-routing convention; nothing in the repo
imports them, so every symbol they export has 0 static references and reads as
dead. Baseline scan (before the Next.js plugin) reports **6** false-dead:

- `Home` (default export, `app/page.tsx`) — `likely`
- `RootLayout` (default export, `app/layout.tsx`) — `likely`
- `metadata` (named export, `app/layout.tsx`) — `likely`
- `GET` (route handler, `app/api/disable-draft/route.ts`) — `likely`
- `geistSans`, `geistMono` (module-private consts in `app/layout.tsx`) —
  `certain`, dead only because `RootLayout` (which uses them) is itself dead;
  they clear transitively once `RootLayout` is rooted.

With the Next.js plugin registered, the matched entry files' exported symbols
become prod roots, and all 6 clear to **zero** false-dead — while genuinely-dead
non-entry symbols elsewhere are still reported.

## `monorepo-basic/` — workspace cross-package (phase 24)

A **synthesized structural fixture** (not vendored from a real repo). The
monorepo false positive is structural — it's about the workspace *layout* and
package aliasing, not about any real-world code — and a genuine cross-package
slice from a real monorepo (e.g. trpc) cannot be kept minimal, self-contained,
and deterministic: a single consumed symbol drags in many transitive imports.
So this case is hand-built to reproduce the exact structure:

- `@mono/core` exports `usedCrossPackage` (consumed by `@mono/app` via the
  `@mono/core` alias) and `trulyUnused` (referenced by nobody).
- `@mono/app` imports `usedCrossPackage` and executes `appMain()` at module top
  level in its own entry.

Baseline (before phase 24) flags **3** false-dead: `appMain`, `usedCrossPackage`,
`trulyUnused`. After: only `trulyUnused` remains — `appMain` is alive (member
entry rooting), `usedCrossPackage` is alive (the workspace alias resolves so the
cross-package reference connects), and genuine dead code is preserved.

> The `pnpm-workspace.yaml` and `workspaces.packages` object parsing variants are
> covered by `test/workspaces.test.ts` rather than additional scan fixtures.
