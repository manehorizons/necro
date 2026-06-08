---
phase: 02-docs
id: 02-02
tier: complex
status: PENDING
---

# 02-02 — Comprehensive documentation site (Astro Starlight)

## Objective

Ship a static, browsable documentation site (Astro Starlight) covering a landing page, a user guide, a reference, and contributor/architecture docs — accurately reflecting slice-1 reality — and deploy it to GitHub Pages.

## Acceptance Criteria

### AC-1: Starlight site builds to static HTML
Given the docs project in `website/`
When `npm run build` runs there
Then Astro Starlight produces static HTML in `website/dist/` with zero build errors, and the build includes Pagefind search.

### AC-2: All four sections exist with their pages
Given the built site
When a reader navigates it
Then it contains: a **Landing** page; a **Guide** (introduction, installation, quickstart, understanding results [tiers, evidence chains, test-only, dead code & reachability], configuration, framework awareness, CI integration, roadmap); a **Reference** (CLI commands & flags, configuration keys, glossary); and an **Architecture** section (overview & core invariant, symbol graph, two-color reachability & taint, confidence tiers, evidence chains, plugin contract + how to write one, project layout, contributing).

### AC-3: Landing communicates the positioning
Given the landing page
When it loads
Then it states the positioning (free + local + multi-axis + LLM-assisted-fix + polyglot), names the differentiators (false-positive layer, evidence chains, `test-only` verdict), and shows an install one-liner and a call-to-action to the quickstart.

### AC-4: Results docs accurately explain slice-1 behavior
Given the "understanding results" guide pages
When compared to the shipped code
Then they correctly describe the three confidence tiers (`certain`/`likely`/`maybe`), the evidence-chain format, and the `test-only` verdict — matching what `necro scan` actually emits.

### AC-5: Reference matches the code
Given the CLI and configuration reference pages
When each documented flag and config key is checked against `src/`
Then every documented item (`necro scan`, `--json`, `--top N`, `--version`; `necro.config.json` `include`/`ignore`) exists in the code, and no shipped scan flag or config key is omitted.

### AC-6: Unbuilt features are labeled "Planned"
Given the roadmap and any forward-looking mention
When a feature not in slice 1 is referenced (coverage ingestion, syntactic detectors, duplication, CRAP/churn, `--fix`, LLM triage/fix, SARIF, Python, monorepo)
Then it is explicitly marked "Planned"/"not yet available" — never described as currently working.

### AC-7: No broken internal links
Given the site build
When `starlight-links-validator` runs
Then there are zero broken internal links.

### AC-8: Deploys to GitHub Pages
Given a push to `main`
When the docs CI workflow runs
Then `.github/workflows/docs.yml` builds the site and deploys it to GitHub Pages, with `astro.config` `site` + `base: '/necro'` set for project-pages pathing.

## Tasks

### T1: Scaffold Starlight app in `website/`
- files: `website/package.json`, `website/astro.config.mjs`, `website/tsconfig.json`, `website/src/content/config.ts`, `website/.gitignore`
- action: Initialize an Astro + Starlight project isolated in `website/` (own deps). Configure `astro.config.mjs` with `site` + `base: '/necro'`, Starlight `title`/`description`, the sidebar groups (Guide, Reference, Architecture), and the `starlight-links-validator` plugin. Add `dev`/`build`/`preview` scripts.
- verify: `cd website && npm install && npm run build` exits 0 and emits `website/dist/` (with a placeholder index); Pagefind assets present in `dist/`.
- done: AC-1

### T2: Landing page
- files: `website/src/content/docs/index.mdx`
- action: Splash-template landing with hero (tagline, install one-liner, CTA to quickstart), the positioning (free + local + multi-axis + LLM-assisted-fix + polyglot), and a differentiators section (false-positive layer, evidence chains, `test-only` verdict).
- verify: Built `index.html` contains the positioning phrase, the differentiator names, an install command, and a link to the quickstart.
- done: AC-3

### T3: User guide pages
- files: `website/src/content/docs/guide/{introduction,installation,quickstart,understanding-results,evidence-chains,test-only,reachability,configuration,framework-awareness,ci-integration}.md`
- action: Author the guide. "Understanding results" + dedicated pages explain the three tiers, the evidence-chain format, and the `test-only` verdict, cross-checked against `src/analyze/classify.ts`, `src/report/evidence.ts`, and real `necro scan` output. Configuration page documents `necro.config.json`. Framework-awareness covers jest/vitest detection.
- verify: Build succeeds; tiers/evidence/test-only descriptions match shipped behavior (spot-check against a real scan); pages appear under the Guide sidebar group.
- done: AC-4

### T4: Reference pages (code-verified)
- files: `website/src/content/docs/reference/{cli,configuration,glossary}.md`
- action: Document CLI commands & flags (`necro scan`, `--json`, `--top N`, `--version`), the config keys (`include`, `ignore`), and a glossary (tier, taint, two-color reachability, prod/test edge, entry, evidence). Cross-check every flag/key against `src/cli.ts` and `src/config.ts`.
- verify: Every documented flag/key exists in `src/`; no shipped scan flag/config key is omitted (diff against `src/cli.ts`/`src/config.ts`).
- done: AC-5

### T5: Architecture / contributor pages
- files: `website/src/content/docs/architecture/{overview,symbol-graph,reachability,tiers,evidence,plugins,project-layout,contributing}.md`
- action: Explain the core invariant (two IRs; language code only in `lower`), the ts-morph symbol graph, two-color reachability + taint, tier classification, evidence chains, the `FrameworkPlugin` contract + how to write one, the `src/` module map, and contributing (dev setup, TDD, CADENCE workflow). Link to `docs/necro-design-spec.md` for deep decisions.
- verify: Build succeeds; all four sections (Landing, Guide, Reference, Architecture) present in the built site nav.
- done: AC-2

### T6: Roadmap + "Planned" labeling pass
- files: `website/src/content/docs/guide/roadmap.md`, plus edits across existing pages
- action: Add a Roadmap page listing planned features (coverage ingestion, syntactic detectors, duplication, CRAP/churn, `--fix`, LLM triage/fix, SARIF, Python, monorepo). Sweep all pages to ensure any forward-looking mention is explicitly marked "Planned"/"not yet available".
- verify: grep the content for the planned-feature names confirms each is labeled Planned and never described as currently working.
- done: AC-6

### T7: GitHub Pages deploy workflow
- files: `.github/workflows/docs.yml`
- action: CI workflow that, on push to `main`, builds `website/` and deploys `website/dist/` to GitHub Pages (actions/configure-pages, upload-pages-artifact, deploy-pages; correct permissions/concurrency).
- verify: `actionlint`/YAML parse clean; workflow steps reference the `website/` build and Pages deploy actions. (Live deploy confirmed after merge to `main`.)
- done: AC-8

### T8: Build + link-validation gate
- files: `website/package.json` (scripts)
- action: Ensure the build runs `starlight-links-validator`; fix any broken internal links surfaced across T2–T6.
- verify: `cd website && npm run build` passes with link validation enabled and reports zero broken internal links.
- done: AC-7

## Boundaries

- DO NOT edit `docs/necro-design-spec.md` or anything under `src/` (the CLI tool) — docs only.
- DO NOT add documentation dependencies to the root `package.json`; all docs deps live in `website/`.
- DO NOT document any unbuilt feature as currently working — label it "Planned" (AC-6).
- DO NOT add versioned docs, i18n, a blog, a custom domain, or source-generated reference (deferred).
- DO NOT commit `website/dist/` or `website/node_modules/` (gitignore them).
