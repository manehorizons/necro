# Retro

## Rough tasks

- T1: DONE_WITH_CONCERNS — src/bench/competitors/checkout.ts + cli-checkout.ts (npm run bench:checkout) ship and work correctly — idempotent full-clone+checkout, per-repo failure isolation. Concern (not a script bug): the pinned hono SHA (61d6d66d...) is no longer reachable in the real honojs/hono repo (confirmed via full multi-branch clone + GitHub API 422). trpc checks out fine. Documented in SOURCES.md's new "Open gap (phase 53)" note.
- T4: DONE_WITH_CONCERNS — src/bench/competitors/run.ts + cli-competitors.ts (npm run bench:competitors) wire checkout resolution → runners → scorer, scoring each repo's predictions separately before summing (avoids cross-repo filename collisions). Skipped repos are reported in skippedRepos, never silently dropped. Concern: AC-1 asked for all 63 cases scored; live run currently covers only 44 (trpc) because of the T1 hono-checkout gap — user explicitly chose "ship trpc-only live numbers + document gap" over blocking. Real live output committed to bench/competitors.json and merged into bench/results.json.
