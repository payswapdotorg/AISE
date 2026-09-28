# R2 — Tech Lead exact-SHA W/M/X replay and reconciliation (2026-09-28)

Performed by the successor AISE Tech Lead (this console), per
`docs/TECH-LEAD-HANDOFF.md` §0 (the remaining governed evidence frontier)
and the post-production plan's Wave 2 protocol
(`docs/post-production-discoverability-and-device-validation-plan-2026-09-25.md` §6 Wave 2).

## 1. The exact deployment

| fact | value |
|---|---|
| deployed commit (exact) | `c34ad7bdeb68eee0c6df6621a962bf77da9e891f` (merge: QA-007 acceptance) |
| deployment id | `dpl_3Y7qBgNcjWuyGf9CfbcEBZoydnym` (Vercel, project `aise`, target production, READY) |
| production URL | https://aise-tan.vercel.app (aliases: `aise-tan.vercel.app`, `aise-ekonplacidegmailcoms-projects.vercel.app`, `aise-git-main-ekonplacidegmailcoms-projects.vercel.app`) |
| healthz | `service=aise-api version=0.1.0`, `ok === true` |
| readyz fingerprint | `ok === true`; `cost.ledger === "redis"` (the deployed Upstash pair is live); `auth.status === "enabled"`, mode `demo-open` |
| edge | `x-vercel-id hkg1::hfqcb-1790636478202-e23f5698e8de` (the deployment host answered) |
| code-bearing application tip | `c34ad7b` — the commits that follow on main (`d80f2b3` harness, then the state/evidence reconciliation commits) are tools-only/docs-only and build-inert (see §5) |

## 2. The replay results (all against the deployment above)

| gate | result | record |
|---|---|---|
| deployed-check (PROD-012, the §4.3 seven checks, real headless Chromium) | **PASS 7/7 checks, 41/41 assertions** — incl. accessibility `critical=0 serious=0` at BOTH viewports | `deployed-check-PASS.log` (this directory) |
| W journey (Gate F, W1 golden product + W2 interactive solution) | **24/24 PASS, 0 FAIL, 0 BLOCKED** | `../PROD-033/runs/w-2026-09-28T23-19-37Z.md` |
| M journey (mobile/Android field) | **22 PASS, 0 FAIL, 1 BLOCKED_NO_KVM** (the emulator lane's honest recorded state; never upgraded) | `../PROD-033/runs/m-2026-09-28T23-20-20Z.md` |
| X journey (combined field-to-office composition) | **15/15 PASS, 0 FAIL** | `../PROD-033/runs/x-2026-09-28T23-20-20Z.md` |

Journey-harness exit law honored: `JOURNEY HARNESS: PASS` (every step PASS with
its recorded class).

### The Wave-2 proof checklist, mapped

- **run W, M and X on the exact current deployment** — done (the table above; all three records cite `https://aise-tan.vercel.app` as the base URL).
- **physical Android lane** — honestly UNAVAILABLE-ON-STATION (the M record carries the PROD-032 classes verbatim; the emulator lane records `FAIL→BLOCKED_NO_KVM`; no physical-capture claims are made anywhere in this replay).
- **cross-adapter identity / provenance continuity** — X `x.capture-upload`/`x.capture-sync`/`x.server-verification` (field capture → evidence, idempotent replay, verbatim server envelope) + `x.handoff-roundtrip` (the task-identity round-trip web→link→continuation) + M `m.handoff-envelope`/`m.deeplink-continuation`.
- **direct/NL equivalence after navigation changes** — W2 + X `x.solution-direct` (direct manipulation → the typed demolition operation, corpus identity `78be478643fcbb4a…`) alongside `x.solution-agent` (the agent command through the LIVE compiler: clarification → answer → proposal → confirm → a semantically equivalent typed operation).
- **source-BOQ / solution-BOQ separation** — W1 `w1.boq` (the BOQ Lens + the SOURCE BOQ import panel + incumbent context) + X `x.boq-generated`/`x.boq-traced`/`x.boq-revision-selection` (the committed trace set, the line↔step round-trip, and the POST-005 revision selector with source-vs-solution separation).
- **post-work evidence creates outcome visibility** — X `x.postwork-return` (the post-work capture return path → outcome visibility) + M `m.postwork-entry`.
- **store all evidence under a new dated evidence directory** — this directory.

## 3. What this replay found, and how it was governed

R2 is a verification stage, and it found two real defects. Both were governed
through the campaign's own corrective-closure pattern (worker implements,
Lead independently verifies and merges — never a silent gate weakening):

1. **D9 — definition-list/dlitem serious axe violations at the deployed
   Dashboard.** The first deployed-check run against exact SHA `28c2631`
   (deployment `dpl_8wvamn9zWSWqjnBxWZnMGoM5v2Ad`) FAILED the accessibility
   gate: `serious=2` at both viewports (43 `definition-list` nodes, 350
   `dlitem` nodes — the semantic-objects audit's dt/dd groups were wrapped in
   `<span class="field">`, present in the tree since PROD-017). The failure
   reproduced deterministically twice (`deployed-check-FAIL-at-28c2631-run1.log`
   / `-run2.log` in this directory). Governed as **QA-007** (worker `815bff67`,
   Lead-verified at head: typecheck PASS, lint PASS, suite 6175/0/405, 80438
   expects, boundaries 1067 files; failing-first 3 tests with 673-line
   `dl > span.field` diffs → 3/3 pass): div wrappers for dt/dd groups
   (`apps/web/src/app/contract-objects.tsx`, layout-neutral — the `.field`
   CSS is class-based flex). Merged at `c34ad7b`; the accessibility gate now
   passes live at both viewports (§2 above).
   *Honesty note:* the QA-006 merge message's "live 7-check suite PASS against
   production" could NOT be reproduced for the accessibility check against the
   same product code (two deterministic failures) — the likely mechanism is
   the axe scan racing the task-first panel's hydration (a then-intermittent,
   now-deterministic timing shift). Per the handoff's own law, prose claims
   are not runtime evidence; the defect existed in the tree, QA-007 fixed it,
   and the live gate at `c34ad7b` is the authoritative record.
2. **The W journey's zero-settle Enter-demo click crash.** The first two
   journey runs against the `c34ad7b` deployment crashed (harness exit 1) on
   the swallowed-click race the deployed-checks suite documented and cured on
   2026-09-22 (the pass-17 forensics: a click landing ~50ms after the gate
   becomes visible is silently swallowed in a large fraction of fresh
   contexts; settled clicks pass 4/4) — the journey legs never carried that
   cure. Governed as the R2 harness commit `d80f2b3` (tools-only):
   settle-before-Enter-demo at all three journey click sites + the W2
   solution leg wrapped in the same bounded-retry classification as every
   other leg (a swallowed click is transient, not a product defect). Zero
   assertion or journey-semantics changes. The replay then passed (§2).

## 4. The QA-series reconciliation (what "current" means now)

Accepted on main before this replay but not yet in the state files at
reconciliation time: **QA-004** (`e93a052`), **QA-005** (`2cc1bba`),
**QA-006** (`28c2631`), and now **QA-007** (`c34ad7b`, this session). The
machine state (`docs/productization-state.json`), `AGENTS.md` and
`docs/TECH-LEAD-HANDOFF.md` are updated by this reconciliation to carry them.

Deployment-history note (release hygiene): the `28c2631` push at 08:19Z was
**rate-limited** by Vercel ("Deployment rate limited — retry in 24 hours" —
the team account's shared daily quota), which is why production briefly
remained at `2cc1bba`; the exact-`c34ad7b` production deployment
(`dpl_3Y7qBgNcjWuyGf9CfbcEBZoydnym`) landed 2026-09-28 ~22:5xZ via the deploy
API once the quota window allowed.

## 5. Gate evidence at the reconciliation commits (honest environmental notes)

- Full monolithic `bun run verify` **PASS** at `28c2631` (suite 6172/404,
  boundaries 1066 files) and at `815bff67` (suite 6175/405, 80438 expects,
  boundaries 1067 files) — recorded this session. `c34ad7b`'s tree is
  identical to `815bff67`'s (the merge added no changes).
- At `d80f2b3` (harness commit, tools-only): the monolithic typecheck step
  hit this sandbox's **environmental bun-runtime tsc OOM ceiling** —
  `tsc --noEmit -p backend/api` under bun exits 137 (kernel OOM kill, zero
  diagnostics) when the box's co-resident processes (the sibling replay-stack
  Chrome + the resident next-server) hold ~2.5 GiB; the same command under
  the system Node 24 runtime passes cleanly. Per-step gate results at
  `d80f2b3`: **typecheck 8/8 workspaces PASS** (node runtime for tsc; same
  tsc entry, same flags), **lint PASS** (`eslint .`), **test PASS**
  (6175/405, 80441 expects), **boundaries PASS** (no cross-zone violations).
  This is the documented-environmental-ceiling class (the repo records the
  same discipline for the journey-suite memory ceiling in
  `evidence/r35b-merge-journeys`-style notes); nothing was masked.
- `d80f2b3` and the docs/state commits that follow are **build-inert**
  relative to the deployed artifact: they touch only `tools/journey/`,
  `tools/deployed/` (the verification harness — its own boundaries zone) and
  `docs/` (evidence/state); the deployed build is `apps/web` + `backend/api`
  + `packages/*`, unchanged since `c34ad7b`. The code-bearing application
  tip therefore remains `c34ad7b`, which is exactly what `dpl_3Y7qBgNcjWuyGf9CfbcEBZoydnym`
  serves.

## 6. Residual known state (unchanged by this replay)

- POST-006's live accessibility ledger (0 critical / 23 serious / 44
  moderate) — known findings outside the accepted scope; remediation beyond
  QA-007's D9 fix requires separate governance.
- The M journey's emulator lane: `BLOCKED_NO_KVM` (recorded honestly; the
  physical lane remains station-pending).
- The QA-005 merge's flagged follow-up ("tools/deployed/checks.ts main#app
  selector needs successor WO") was already closed by QA-006; QA-007 closed
  the D9 definition-list defect this replay found. No open successor WOs are
  known to this console at reconciliation time.
