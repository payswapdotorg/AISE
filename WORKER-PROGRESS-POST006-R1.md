# WORKER-PROGRESS — POST-006-R1 (the accessibility remediation wave)

- **Work lane:** POST-006-R1 — the separately-governed remediation of the
  POST-006 accessibility findings ledger (the operator's 2026-09-30 directive).
- **Branch:** `work/post006-r1` (base: main @ `88689ae0f2202f248ec66372bb4b6103cb45bb1b`).
- **Scope held:** the SERIOUS set + the pinned moderate A11Y-1. No functional
  or visual redesign, no canonical semantic changes, no new dependencies, no
  `apps/android`, the landmark family verify-only.
- **Evidence tree:** `docs/productization-evidence/POST-006-R1/` (README +
  AFTER ledger + before/after table + fixes file map).

## 1. What was fixed

1. **Touch-target floor (WCAG 2.5.8 AA — 21 serious findings → 0):** the
   inline prose-link contexts the live ledger measured at 15–19px tall
   (dashboard journey links; `.crumbs` Projects/project links on
   capture/boq-lens/case/outcomes; the solution callout links; the
   journey-echo notes links; the pane-foot links; the BOQ source/solution
   panel links) now carry `padding-block: 5px` — the measured box grows to
   25–29px with the visual language untouched. The native file inputs (21px
   browser default) join the repo's input convention (`min-height:
   var(--touch)`). Pinned statically (the stylesheet-substrate test in
   `post006-accessibility.test.tsx`); measured live: **0 controls below
   24×24 on all seven key surfaces** (was 6/0/3/5/2/2/3).
2. **FINDING A11Y-1 (the pinned moderate — FIXED-AND-PINNED):** the
   Interactive Solution surface composes its page identity as a
   visually-hidden h1 (`Build solution` — the primary nav's own label for
   the destination; the repo's sr-only pattern, lifted from
   `solution/styles.ts` into `app.css`), first in DOM order, both ladder
   branches. The static pin is FLIPPED — it now asserts the h1 (and the
   surface joined the exactly-one-h1 sweep, now eleven). The live route
   sweep records `heading "Build solution"` as the route's first heading;
   axe `page-has-heading-one`: 0 findings (was 1 per viewport).
3. **Color-contrast (WCAG 1.4.3 AA — 2 serious findings → 0, verified +
   pinned):** the ledger's 4.22/4.42:1 measurements were the PRE-POST-010
   token `#147d93` (the POST-006 run predates POST-010 `ea09ed9`, an
   ancestor of this branch's base, which darkened `--accent` to `#11748a`).
   This lane VERIFIED the measured state (0 axe contrast violations on all
   seven surfaces at both viewports — computed: 4.76:1 on surface-2, 4.98:1
   on bg, ≥ 4.62:1 on every light surface) and EXTENDED the tokens pin:
   `--accent` is now asserted on the full 11-surface light set (the five
   epistemic backgrounds join — the same set `--ink-faint` is pinned on),
   so a future link on any light surface cannot escape the pin.
4. **The live harness's record template** (`tools/post006/acceptance.ts`)
   now states the remediated A11Y-1 state (the honesty note + the probe
   comment) — a record measuring the remediated tree must not assert the
   pre-remediation state. No check logic, budget, gate or selector changed;
   the harness is still NEVER wired into `bun run verify` (the
   journey-harness law).

## 2. The exact verify counts at the final tree

`bun run verify` — **VERIFY: PASS**:

- typecheck: PASS (12 project tsconfigs, `tsc --noEmit` each)
- lint: PASS (`eslint .`)
- test: **6453 pass / 0 fail across 427 files (81,575 expect() calls)**
- boundaries: **1112 source files scanned, zero cross-zone violations**

(Baseline context: the code-bearing ancestor evidence recorded 6451/0 across
427 files / 81,524 expects at ANCHOR-002's tree; this lane adds exactly the
two new pin tests — the stylesheet-substrate pin and the extended `--accent`
tokens pin — and flips the A11Y-1 pin in place.)

## 3. The live AFTER audit (the honest ledger)

`bun tools/post006/acceptance.ts` at the remediation commit (`585649e`),
headless Chromium 145.0.7632.6, local production-like serve, seven key
surfaces at both breakpoints — **POST-006 ACCEPTANCE: PASS**:

- critical: 0 → 0
- **serious: 23 → 0**
- **moderate: 44 → 4**
- minor: 0 → 0

Raw record: `docs/productization-evidence/POST-006/acceptance-2026-09-30T18-57-34-014Z.md`
(verbatim copy in `docs/productization-evidence/POST-006-R1/after-acceptance-2026-09-30T18-57-34-014Z.md`).

## 4. Every REMAINING finding, honestly classified

1. **`solution@desktop`: landmark-main-is-top-level (1 node)** — REMAINS,
   out of scope. Root cause: FINDING QA-005-B, recorded and pinned
   out-of-lane in `apps/web/src/app/qa005-a11y-shell.test.tsx`: the solution
   workspace (`apps/web/src/solution/**`, outside this lane's owned
   surfaces) renders its own `main#solution-workspace` inside the shell's
   `main#main-content`. The fix is a canonical semantic change (the
   workspace's root element) — explicitly out of scope for this
   accessibility lane (the mission's carve-outs: "the landmark family …
   verify only"; "canonical semantic changes"). The pin exists to be
   flipped by the solution-workspace lane under the Lead's governance.
2. **`solution@desktop`: landmark-no-duplicate-main (1 node)** — same root
   cause, same classification.
3. **`solution@mobile`: landmark-main-is-top-level (1 node)** — same.
4. **`solution@mobile`: landmark-no-duplicate-main (1 node)** — same.

Plus the non-gated recorded shortfall (not a finding of the gate): check E's
44×44 best-practice shortfall remains per surface (24/22/11/15/11/15/21
controls) — promoting inline prose links to 44px blocks would be a visual
redesign; the gate is WCAG 2.5.8's 24×24 minimum (AA), now met.

**The landmark-family verification the mission ordered (verify-only):** the
`main#app` share — 42 of the 44 BEFORE moderates — is CONFIRMED CLEARED by
the QA-005 D6b `div#app` mount (+ QA-006's tag-agnostic checks): 0 landmark
findings on all six non-solution surfaces at both viewports in the AFTER
audit. The `landmark-unique` rule (14 BEFORE findings) is 0 in the AFTER
audit including on solution. Nothing was re-fixed.

## 5. Limitations + out-of-scope items (held)

- The 4 remaining moderates (QA-005-B family) — see §4; not this lane's to
  fix.
- The 44×44 best-practice shortfall — recorded, not gated (POST-006 policy).
- No deployed-production re-audit was run (this lane's authorization is the
  local live-audit discipline; the branch is Lead-reviewed and merged before
  any deployment replay, per the release-hygiene law).
- One incidental observation for the Lead (NOT fixed here — build hygiene,
  out of this lane's scope): `api/[...path].mjs` (the committed deploy
  beacon) is stale relative to main's own tracked backend sources — a fresh
  `bun run build` regenerates it deterministically with a small diff
  (`evidenceIdentityCanonical`); the beacon on main@88689ae predates a later
  backend change that did not re-commit it. Restored to its committed state
  on this branch (the beacon is build-inert for the local serve and verify).

## 6. The delivery

- Commit 1 (`585649e`): the remediation — `apps/web/src/styles/app.css` (the
  sr-only utility + the inline-link touch floor + the file-input sizing),
  `apps/web/src/styles/tokens.test.ts` (the extended `--accent` pin),
  `apps/web/src/app/surfaces/Solution.tsx` (the h1), 
  `apps/web/src/app/post006-accessibility.test.tsx` (the flipped A11Y-1 pin +
  the eleven-surface sweep + the stylesheet-substrate pin),
  `tools/post006/acceptance.ts` (the record-template honesty note).
- Commit 2: this progress file + the evidence tree
  (`docs/productization-evidence/POST-006-R1/` + the raw AFTER record in
  `docs/productization-evidence/POST-006/`).
