# POST-006-R1 — the before/after table

- BEFORE: the accepted POST-006 findings ledger —
  `../POST-006/acceptance-2026-09-26T06-21-18-061Z.md` (repo SHA at run time
  `4a437bed48e5a7bdf68844c83798d3263696b870`, 2026-09-26, headless Chromium
  145.0.7632.6, local production-like serve, seven key surfaces at BOTH
  breakpoints).
- AFTER: the remediation tree's live audit —
  `after-acceptance-2026-09-30T18-57-34-014Z.md` (repo SHA at run time
  `585649e` — the POST-006-R1 remediation commit, 2026-09-30, headless
  Chromium 145.0.7632.6, the same harness `tools/post006/acceptance.ts`, the
  same serve discipline, the same seven key surfaces at BOTH breakpoints).
- Same evidence class on both sides: deterministic (live headless Chromium;
  local production-like serve). The ONLY differences between the runs are the
  tree under test and calendar time.

## The severity ledger

| severity | BEFORE | AFTER | the delta |
|---|---|---|---|
| critical | 0 | 0 | — (never any) |
| **serious** | **23** | **0** | **−23, all remediated/verified** |
| **moderate** | **44** | **4** | **−40** (42 landmark family cleared/verified + 2 A11Y-1 h1 fixed; 4 remain — the recorded out-of-lane QA-005-B family, see below) |
| minor | 0 | 0 | — |

## Serious, by rule

| rule (WCAG) | BEFORE | AFTER | the fix that closed it |
|---|---|---|---|
| color-contrast (1.4.3 AA) — the Solution-surface links | 2 findings (desktop + mobile; 3 nodes each: `p > a:nth-child(2)`, `p > a:nth-child(3)` at 4.22:1 on `#eef1f4`; `.pane-foot > a` at 4.42:1 on `#f4f6f8` — the then-token `#147d93`) | 0 | POST-010 (`ea09ed9`, an ancestor of this branch's base) had already darkened `--accent` to `#11748a` (computed: 4.76:1 on surface-2, 4.98:1 on bg; ≥ 4.62:1 on every light surface). This lane VERIFIED the measured state (0 axe contrast violations at both viewports) and EXTENDED the tokens pin (`--accent` now asserted on the full 11-surface light set — the epistemic backgrounds join, the same set `--ink-faint` is pinned on) so the escape cannot recur. No token change was needed in this lane — the mission's "≥ 4.5:1 measured, no visual redesign" target is met by the already-landed token. |
| touch-target-size (2.5.8 AA, 24×24 CSS px, mobile 390×844) | 21 findings (dashboard 6, capture 3, boq-lens 5, case 2, outcomes 2, solution 3 — every one an inline prose link at 15–19px tall, or a native file input at 21px) | 0 (measured: 0 below 24×24 on all seven surfaces; the 44×44 best-practice shortfall remains recorded per surface, not gated — unchanged policy) | the inline prose-link touch floor (`padding-block: 5px` over `.journey-body a`, `.crumbs a`, `.callout a`, `.task-strip-line a`, `.notes-list a`, `.pane-foot a`, `p[data-boq-class] a` in `apps/web/src/styles/app.css`) + the file-input sizing convention (`input[type="file"] { min-height: var(--touch) }`). The measured heights after: 25–29px on every previously-flagged context. |

## Moderate, by rule family

| rule family | BEFORE | AFTER | what happened |
|---|---|---|---|
| landmark-main-is-top-level | 14 findings (7 surfaces × 2 viewports; solution carried 2 nodes) | 2 (solution@desktop 1 node + solution@mobile 1 node) | the `main#app` mount share — CLEARED, verified live: the QA-005 D6b `div#app` mount (+ QA-006's tag-agnostic deployed checks) holds; 0 findings on all six non-solution surfaces. The remaining 2 = the solution workspace's own nested `main#solution-workspace` (FINDING QA-005-B, pinned out-of-lane — a canonical semantic change to `apps/web/src/solution/**`, outside this lane's owned surfaces and the mission's carve-out). |
| landmark-no-duplicate-main | 14 findings | 2 (solution@desktop 1 + solution@mobile 1) | same split: `main#app` share cleared/verified; the QA-005-B nested-main share remains (the shell main + the workspace main = two mains on the solution route). |
| landmark-unique | 14 findings | 0 | cleared with the mount fix (the AFTER tree's two mains on solution carry distinct accessible names — axe's uniqueness rule passes; recorded honestly as a measurement of the current tree, not a fix claim by this lane). |
| page-has-heading-one (A11Y-1, the pinned moderate) | 2 (solution@desktop + solution@mobile) | 0 | FIXED-AND-PINNED: the surface's visually-hidden page-identity h1; the static pin is flipped to assert it. |

## Per-surface (serious / moderate)

| surface | serious BEFORE → AFTER | moderate BEFORE → AFTER |
|---|---|---|
| dashboard | 6 → 0 | 6 → 0 |
| projects | 0 → 0 | 6 → 0 |
| capture | 3 → 0 | 6 → 0 |
| boq-lens | 5 → 0 | 6 → 0 |
| case | 2 → 0 | 6 → 0 |
| outcomes | 2 → 0 | 6 → 0 |
| solution | 5 → 0 | 8 → 4 |

(The BEFORE per-surface serious counts: dashboard 6 touch; capture 3 touch;
boq-lens 5 touch; case 2 touch; outcomes 2 touch; solution 3 touch + 2
color-contrast (one finding per viewport, 3 nodes each) = 5. The BEFORE
moderate counts: 3 landmark rules × 2 viewports = 6 on each non-solution
surface; solution 4 per viewport (the landmark trio with a 2-node
main-is-top-level + page-has-heading-one) = 8.)

## The AFTER run's non-gated lines (recorded, unchanged policy)

- Check E's 44×44 best-practice shortfall: `dashboard 24, projects 22, capture
  11, boq-lens 15, case 11, outcomes 15, solution 21` controls below 44×44 —
  recorded per surface, NOT gated (the POST-006 policy; WCAG 2.5.8's minimum
  is the gate). The inline-link floor targets the 24px minimum; promoting
  prose links to 44px blocks would be a visual redesign — out of scope.
- Check G's designed-404 family: the local serve's task-flow lane answered
  zero `reality-latest` 404s this run (vs 9 in the BEFORE run) — live serve
  variance in the honest-empty lane, non-blocking in both runs.
