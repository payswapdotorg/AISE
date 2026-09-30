# POST-006-R1 — the fixes' file map

Every change of the remediation wave, by fix. Five files, all in the web
adapter / its styles and tests / the live harness's record template. No
backend, no packages, no `apps/android`, no new dependencies.

## Fix 1 — the touch-target floor (the 21 serious findings, WCAG 2.5.8 AA)

Mechanism: vertical padding on the inline prose-link contexts the live ledger
measured under 24×24 CSS px (the tappable box grows past the floor; the visual
language — inline flow, wrapping, font, color — is untouched), plus the native
file input joining the repo's input sizing convention (`min-height:
var(--touch)`, the same floor every other input clears).

| file | the change |
|---|---|
| `apps/web/src/styles/app.css` | NEW section "the inline prose-link touch floor": `padding-block: 5px` on `.journey-body a, .crumbs a, .callout a, .task-strip-line a, .notes-list a, .pane-foot a, p[data-boq-class] a` (the dashboard journey links, the crumbs' Projects/project links, the solution callout links, the task-strip links, the journey-echo/cross-link notes links, the pane-foot links, the BOQ source/solution panel links). NEW rule: `input[type="file"] { min-height: var(--touch); }` (the capture + boq-lens file inputs). |
| `apps/web/src/app/post006-accessibility.test.tsx` | NEW static pin in the touch-target contract describe: "the stylesheet carries the inline-link touch floor + the file-input sizing" — asserts every floor selector and the mechanism rules exist in the SHIPPED stylesheet, so removal fails fast in `bun run verify` between live audits (the measured proof stays with the live harness, check E — never wired into verify, the journey-harness law). |

Measured outcome (the AFTER audit, check E): 0 controls below 24×24 on all
seven key surfaces (was 6/0/3/5/2/2/3).

## Fix 2 — FINDING A11Y-1 (the pinned moderate): the visually-hidden h1

Mechanism: the Interactive Solution surface composes its page identity as a
top-level h1 in the repo's sr-only pattern — the canonical pattern the
solution workspace's own stylesheet already carried
(`apps/web/src/solution/styles.ts`), lifted verbatim into the always-loaded
app stylesheet. The heading is FIRST in DOM order (before every card h2), in
both ladder branches (the world-held body and the honest empty state), and
visually hidden: no visual redesign of the accepted surface.

| file | the change |
|---|---|
| `apps/web/src/app/surfaces/Solution.tsx` | `<h1 className="sr-only">Build solution</h1>` as the surface's first element (with the remediation rationale comment). The name is the task-first vocabulary's destination name — the primary nav's own label for this surface; the card h2s keep their distinguishing tails ("Build solution — two ways"). The live route sweep (check A) reads it: `heading "Build solution"` — no harness expectation change was needed. |
| `apps/web/src/styles/app.css` | NEW `.sr-only` utility (the canonical pattern from `solution/styles.ts`, now app-wide). |
| `apps/web/src/app/post006-accessibility.test.tsx` | the pin FLIPPED: "FINDING A11Y-1 REMEDIATED (POST-006-R1)" now asserts exactly one h1, the sr-only class, the text, and h1-before-h2 DOM order. The surface also joined the `PAGE_HEAD_SURFACES` exactly-one-h1 sweep (now the eleven composed surfaces). |

Measured outcome: `page-has-heading-one` 0 findings at both viewports (was 1
per viewport); the route sweep records the h1 as the route's first heading.

## Fix 3 — the color-contrast verification + the tokens pin extension (the 2 serious findings, WCAG 1.4.3 AA)

Mechanism: the findings' measured tones (`#147d93` at 4.22/4.42:1) were the
pre-POST-010 token; POST-010 (`ea09ed9`, an ancestor of this branch's base)
already remediated `--accent` to `#11748a` (≥ 4.62:1 computed on every light
surface). This lane: (a) verified the MEASURED state — the AFTER axe run
records 0 contrast violations on all seven surfaces at both viewports; (b)
closed the pin gap so the escape cannot recur — the `--accent` pin now
asserts the FULL 11-surface light set (the five epistemic backgrounds join
the six palette surfaces — the same set `--ink-faint` is pinned on; a future
link on any light surface is covered).

| file | the change |
|---|---|
| `apps/web/src/styles/tokens.test.ts` | NEW test: "--accent clears AA on the FULL light-surface set incl. the epistemic backgrounds (POST-006-R1: the Solution-surface links)" — 11 surfaces, ratios computed from the committed stylesheet, with the full honest history in the comment. |

## Fix 4 — the live harness's record template tracks the remediated state

The harness (`tools/post006/acceptance.ts`, a STANDALONE tool — still never
wired into `bun run verify`, the journey-harness law) had two template lines
asserting the PRE-remediation state as facts about the tree it measures (the
A11Y-1 honesty note and the route-sweep probe comment). A record that
measures the remediated tree must not assert the old state.

| file | the change |
|---|---|
| `tools/post006/acceptance.ts` | the record's honesty note now states A11Y-1 was remediated by POST-006-R1 (the h1 + the flipped pin); the check-A probe comment states eleven surfaces compose an h1. No check logic, budget, gate or selector changed. |

## The held items (verified, not fixed — with reasons)

| item | state | why held |
|---|---|---|
| the landmark family, `main#app` share (42 of the 44 BEFORE moderates) | VERIFIED CLEARED (0 findings on the six non-solution surfaces, both viewports) | the mission's directive: "already cleared later by the QA-006 `div#app` mount fix — do not re-fix what is fixed; VERIFY the current state instead." Verified live. |
| FINDING QA-005-B (the 4 remaining moderates: the solution workspace's nested `main#solution-workspace`) | REMAINS, declared | a canonical semantic change (the workspace's root element) in `apps/web/src/solution/**` — outside this lane's owned surfaces; the mission's own carve-outs ("the landmark family … verify only"; "canonical semantic changes" out of scope). The pin in `apps/web/src/app/qa005-a11y-shell.test.tsx` exists to be flipped by the solution-workspace lane under the Lead's governance. |
| the 44×44 best-practice shortfall (check E, non-gated) | REMAINS, recorded | promoting inline prose links to 44px blocks would be a visual redesign — out of scope; the gate is WCAG 2.5.8's 24×24 minimum (AA), now met. |
