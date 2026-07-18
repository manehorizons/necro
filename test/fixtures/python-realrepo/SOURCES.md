# Python real-repo accuracy corpus — sources & labeling

This corpus measures `necro scan`'s own deterministic Python reachability
output against hand-verified ground truth (unlike `test/fixtures/triage-realrepo/`,
no LLM is involved — this is a static-analysis accuracy gate, per
`.cadence/intelligence/python-support-design.md` §3).

## Vendoring scope

Whole internal packages are vendored (not per-case snippets) so `necro scan`
sees the real cross-file import graph and computes genuine reachability for
every labeled case — no manually-picked closure, no risk of a missing import
silently mistranslating a case's truth label.

| repo | pinned tag | pinned SHA | vendored path | license |
|------|-----------|-----------|----------------|---------|
| [`pypa/pip`](https://github.com/pypa/pip) | `26.1.2` | `31d7d168953668aad85154d6121879d07fbeac27` | `pip/_internal/**` + `pip/pyproject.toml` | MIT (`pip/LICENSE.txt`) |
| [`httpie/cli`](https://github.com/httpie/cli) | `3.2.4` | `2105caa49bae87c5809c274e407619a0de2639d1` | `httpie/httpie/**` + `httpie/setup.cfg` + `httpie/setup.py` | BSD-3-Clause (`httpie/LICENSE`) |

Excluded from both: `tests/`, `docs/`, CI config, packaging/tooling scripts —
everything outside the importable package itself. Only `pip/_internal` and
`httpie/httpie` (plus each repo's own manifest) are vendored.

## Why these two repos (per design doc §3)

- **pip** — `_internal` is a large (148 files, ~1.5MB), explicitly-private
  namespace (no external-consumer excuse for "dead"), carries real legacy
  code, and its `pyproject.toml` has both `[project]` + `[build-system]`
  tables (library-quarantine case, phase 47 AC-5/6) *and* a `[project.scripts]`
  entry point (pyproject entry-point case, phase 46).
- **httpie** — application-flavored CLI (78 files, ~456KB), no `pyproject.toml`
  at all — a natural non-library contrast case — with its console-script entry
  points declared via `setup.cfg`'s `[options.entry_points]` (exercises the
  phase-46 setup.cfg resolver path specifically, distinct from pip's
  pyproject-scripts path), plus a pytest suite (exercised separately by the
  real `tests/` tree, not vendored here — only the entry-point *declaration*
  in `setup.cfg` matters for this corpus, not running the tests themselves).

## Ground-truth definition

A labeled case is:

- **dead** — no reference anywhere in the vendored package tree except the
  declaration itself (and, where applicable, tests in the *original* checkout
  — confirmed by reading the real tree before vendoring, not solely the
  trimmed slice).
- **alive** — reachable from a real entry point (a console-script target, a
  test-glob-matched function, an `__init__.py` re-export chain, or a direct
  production reference) within the vendored slice.

Candidates were seeded from a prototype `necro scan` run against each vendored
slice, cross-checked against `vulture`'s independent static analysis
(disagreements are the cases worth digging into), then hand-verified by
reading the real usage in the full original checkout. Each case's `rationale`
records the specific evidence for its label. See `cases.json` for the full
case list with `provenance` (repo/sha/file/line/symbol) and `rationale`.
