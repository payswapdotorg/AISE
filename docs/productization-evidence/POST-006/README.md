# POST-006 — acceptance + accessibility verification evidence (issue #20)

Work item: POST-006 (plan §6 Wave 1 Worker 3 — acceptance, accessibility
and regression coverage for the POST-004/004B/005 bridges at the merged
base `4a437bed48e5a7bdf68844c83798d3263696b870`).

## What this lane delivered (all NEW files — no product source touched)

| File | What it pins |
| --- | --- |
| `apps/web/src/app/post006-discoverability.test.tsx` | WO1 — the discoverability sweep for every new bridge (browser + mobile + combined lanes): each capability has >= 1 obvious user-facing entry from an appropriate task context; no orphan surface; no dead pointers; the Android deep-link entry + the journey replay rows exist (committed-source reads, the android-wiring discipline). |
| `apps/web/src/app/post006-routes.test.tsx` | WO3 — route completeness + orphan-route detection: the full route table round-trips; unknown/malformed addresses are the honest typed not-found (never a silent fallback); the shell composes for every route; aria-current per route; nav ↔ route lockstep. |
| `apps/web/src/app/post006-accessibility.test.tsx` | WO4 (static layer) — semantic HTML/landmarks/skip link/one-h1-per-surface, ARIA contracts (labels, live regions, aria-current, disclosure), focus-order proxies (no positive tabindex), the native-control touch-target contract. Records FINDING A11Y-1 pinned as the current state. |
| `apps/web/src/app/post006-equivalence.test.tsx` | WO5 — the direct/NL semantic-equivalence regression after the navigation changes: entry parity from every authoring entry, the NL front door, and the three authoring journeys re-derived over the seeded world producing IDENTICAL operation identities/digests/BOQ lines with the provenance axis distinct. |
| `tools/post006/acceptance.ts` | WO2 + WO4 (live layer) — the standalone live-Chromium acceptance harness: route sweep, the four bridge surfaces at both viewports, axe over seven key surfaces at both breakpoints, a real Tab-traversal focus-order check, measured touch targets, the genuine new-tab cold already-authenticated load, and the run-wide console guard. Never wired into `bun run verify` (the journey-harness law). |

## The run records (committed evidence)

- `acceptance-2026-09-26T06-21-18-061Z.md` — the FINAL live acceptance
  record (the complete findings ledger).
- `acceptance-2026-09-26T06-17-35-942Z.md` — the intermediate record from
  the same harness before the check-G designed-404 classification layer
  was added (its G section shows the raw blocking list that motivated the
  classification; kept for the audit trail).
- The W/M/X journey replays at this base are under
  `../PROD-033/runs/` (w-2026-09-26T06-21-37Z, m-2026-09-26T06-22-01Z,
  x-2026-09-26T06-22-02Z): **W 25/0/0, M 22/0/1 (BLOCKED_NO_KVM recorded,
  never upgraded), X 16/0/0** — every POST-005 row green at the merged
  base, including the live direct/NL equivalence legs (w2.direct-
  manipulation + w2.agent-turn).

## The findings ledger (live, both breakpoints; the Lead owns the fixes)

- **[moderate] A11Y-1** — the Interactive Solution surface is the only
  routed surface without a top-level `h1` (its first heading is the card
  h2). Confirmed statically AND by axe (`page-has-heading-one`).
- **[moderate] A11Y-2 (the landmark family, 3 rules × every surface)** —
  `apps/web/index.html` uses `<main id="app">` as the MOUNT POINT, so the
  app's own `<main id="main-content">` nests inside a second main on
  every page (axe: `landmark-main-is-top-level`, `landmark-no-duplicate-
  main`, `landmark-unique`). On the solution route the workspace adds a
  THIRD `<main aria-label="Interactive solution workspace …">`
  (`SolutionWorkspaceBody.tsx`). Pre-existing at base (predates
  POST-004/005; the PROD-012 Dashboard-only scan records these as
  non-blocking moderate lines).
- **[serious] A11Y-3 (color-contrast, solution surface, both
  viewports)** — inline links `#147d93` on `#eef1f4` (4.22:1) and
  `#f4f6f8` (4.42:1) at 14.08px/12.48px fall below the 4.5:1 threshold
  (3 nodes: `p > a:nth-child(2)`, `p > a:nth-child(3)`, `.pane-foot > a`).
- **[serious] A11Y-4 (touch targets, mobile)** — 21 inline links measure
  15–21 CSS px tall (below WCAG 2.5.8's 24×24 minimum): the dashboard
  journey-step links (6), the per-surface crumbs `Projects`/project-id
  (8), the BOQ-lens cross-links (2), the solution workspace prose links
  (3), plus two text inputs at 21px. The 44×44 best-practice shortfall
  is recorded per surface in the acceptance record (12–27 controls per
  surface).
- **[pre-existing, NOT accessibility] BASE-DEFECT V1** —
  `bun run verify` at the pinned base measures **6028 pass / 1 fail / 393
  files** on this station: `PROD-026 … "the full surface renders (first
  paint: the composing state before the lazy mount resolves)"`
  (solution-composition-model.test.tsx) fails ONLY in the full-suite
  order — `post004-navigation.test.tsx` renders `SolutionSurface` for a
  held project first, warming the module-level `engineResource` cache;
  once resolved, the later static render no longer suspends and the
  Suspense-fallback assertion fails. Reproduced deterministically with
  JUST those two files (`bun test apps/web/src/app/post004-navigation.test.tsx
  apps/web/src/app/solution-composition-model.test.tsx` → 64/1). Passes
  in isolation. NOT introduced by POST-006 (measured at the clean base
  before any edit).
- **[pre-existing, NOT accessibility] BASE-DEFECT V2** — the boundaries
  step FAILS at the pinned base: `docs/productization-evidence/GBIM-001/
  aise-reference/aise_reference.ts` imports
  `packages/solution-contract/src/domain`, `packages/solution-contract/
  src/operation` and `packages/solution-engine/src/quantity-models`
  (root → packages violations; 3). Verified with POST-006's files
  stashed — pre-existing at base, introduced by the GBIM-001 evidence
  merge. NOTE: `bun run verify` stops at the first failing step, so the
  test-step failure (V1) masks this in a full run; run
  `bun tools/verify.ts boundaries` directly to see it.

## How to re-run

```bash
bun install                                   # then the recorded station repair:
ln -sfn ../.bun/@types+node@24.13.6/node_modules/@types/node node_modules/@types/node
./node_modules/.bin/playwright install chromium   # chromium-1208 (Chrome 145.0.7632.6)
bun tools/post006/acceptance.ts               # the live acceptance harness (~4 min)
bun tools/journey/run.ts w                    # W 25/0/0
bun tools/journey/run.ts m                    # M 22/0/1 (BLOCKED_NO_KVM recorded)
bun tools/journey/run.ts x                    # X 16/0/0
bun test apps/web/src/app/post006-*.test.tsx  # the new static suites (57 tests)
```

Every check's evidence class: deterministic (live headless Chromium over
the local production-like serve; or static render + committed records).
No step is device or emulator evidence; the physical/emulator lanes
remain BLOCKED_NO_PHYSICAL_HARDWARE / BLOCKED_NO_KVM (carried forward,
never upgraded).
