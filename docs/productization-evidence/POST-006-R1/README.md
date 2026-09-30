# POST-006-R1 — the accessibility remediation wave (the SERIOUS set + the pinned moderate A11Y-1)

Branch `work/post006-r1` (base: main @ `88689ae0f2202f248ec66372bb4b6103cb45bb1b`).
Authorization: the operator's 2026-09-30 directive — the "separate governance"
`docs/TECH-LEAD-HANDOFF.md` §0/AGENTS.md required for any remediation beyond
POST-006's accepted scope, granted scoped to the SERIOUS findings + the pinned
moderate A11Y-1.

## The evidence in this tree

| file | what it holds |
|---|---|
| `after-acceptance-2026-09-30T18-57-34-014Z.md` | the AFTER ledger — the verbatim live-Chromium acceptance record at the remediation tree (SHA `585649e`): checks A–G, the findings ledger, honesty notes. The raw original also lives in `../POST-006/` (the harness's own record path, preserved per the raw-evidence law). |
| `BEFORE-AFTER-TABLE.md` | the before/after counts: serious, moderate, per-surface — BEFORE = the accepted POST-006 ledger (SHA `4a437be`, 2026-09-26), AFTER = the remediation tree. |
| `FIXES-FILE-MAP.md` | every fix, its mechanism, and the exact file(s) it landed in. |

## The result (one line each)

- **serious: 23 → 0.** The 21 touch-target findings measured under the WCAG
  2.5.8 24×24 floor are remediated at the stylesheet (the inline prose-link
  touch floor + the file-input sizing convention); the 2 color-contrast
  findings (3 nodes × 2 viewports, measured 4.22/4.42:1 as `#147d93`) were
  already token-remediated by POST-010 (`--accent: #11748a`, minimum 4.62:1
  on every light surface) — this lane VERIFIED them measured-clear at both
  viewports and extended the tokens pin so the escape cannot recur.
- **A11Y-1: FIXED-AND-PINNED.** The Interactive Solution surface composes its
  page identity as a visually-hidden h1 (`Build solution`, the repo's sr-only
  pattern, first in DOM order, both ladder branches); the pin in
  `apps/web/src/app/post006-accessibility.test.tsx` is FLIPPED — it now
  asserts the h1 exists (and the surface joined the exactly-one-h1 sweep).
  The live route sweep records the h1 as the route's first heading.
- **moderate: 44 → 4.** The landmark family verification the mission ordered:
  the `main#app` share (42 of the 44 findings — three landmark rules across
  the six non-solution surfaces at both viewports) is CONFIRMED CLEARED by
  the QA-005 D6b `div#app` mount + QA-006 (verified live: 0 findings on all
  six surfaces). The `page-has-heading-one` share (2 findings) is closed by
  the A11Y-1 fix. The four REMAINING moderates are all one root cause —
  FINDING QA-005-B, recorded and pinned out-of-lane in
  `apps/web/src/app/qa005-a11y-shell.test.tsx`: the solution workspace
  (`apps/web/src/solution/**`, outside this lane's owned surfaces) renders
  its own `main#solution-workspace` inside the shell's `main#main-content`.
  Its fix is a canonical semantic change (the workspace's root element) —
  explicitly OUT OF SCOPE for this accessibility lane per the mission's own
  carve-out ("the landmark family … verify only"; "canonical semantic
  changes" out of scope). Declared, not silently dropped: the pin exists to
  be flipped by the solution-workspace lane under the Lead's governance.

## Governing scope held

- No functional or visual redesign: the touch floor is vertical padding on
  inline links (flow, wrapping, font, color untouched); the h1 is visually
  hidden; the file inputs only grow to the repo's own input height.
- No new dependencies. No `apps/android` changes. No canonical semantic
  changes. The live harness stays OUT of `bun run verify` (the
  journey-harness law, unchanged).
