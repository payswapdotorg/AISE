# R4 — Successor-TL exact-SHA reconciliation replay (2026-10-01)

Performed by the successor AISE Tech Lead per `docs/TECH-LEAD-HANDOFF.md` §0
(the 2026-10-01 final handoff, commit `c2bfccf`): reconcile current main,
restore exact-SHA release hygiene, then reconcile machine state. No
application code changed in this stage (evidence + state records only).

## 1. The exact deployment

| fact | value |
|---|---|
| deployed commit (exact) | `c2bfccf1fe77473e7d2a2f6846a86f3b5bc44b91` (docs-only: the final successor-TL handoff) |
| deployment id | `dpl_E9rtSLPkaXE7Xc3hPRVoFYyAYJXv` (Vercel, project `aise`, target production, READY 2026-10-01T13:20:47Z) |
| production URL | https://aise-tan.vercel.app (aliases: `aise-tan.vercel.app`, `aise-ekonplacidegmailcoms-projects.vercel.app`, `aise-git-main-ekonplacidegmailcoms-projects.vercel.app`) |
| healthz | `service=aise-api version=0.1.0`, `ok === true` |
| readyz fingerprint | `ok === true`; `cost.ledger === "redis"` (the deployed Upstash pair live, `redis_commands` 1099/400000 used); `auth.status === "enabled"`, mode `demo-open`; `providers.worldsculpt: "disabled"`; `artifacts.backend === "r2"` |
| edge | `x-vercel-id hkg1::9kvft-1790861443990-b1f7e709eaad` (the deployment host answered) |
| code-bearing application tip | `0d56dc1` (ANCHOR-003b merge) — `c2bfccf` is documentation-only over it: `git diff --name-only 0d56dc1 c2bfccf` = `docs/TECH-LEAD-HANDOFF.md` (256 insertions, no other file), so the deployed runtime artifact IS the code-bearing tip's build |
| relation to R2 | main advanced 65 commits past the R2-proven `c34ad7b` (POST-006-R1, POST-007…POST-011, R3, ANCHOR-001/002/003a/003b + docs). None of those inherited R2's deployment proof — THIS replay establishes it at the current deployment. |

## 2. The replay results (all against the deployment above)

| gate | result | record |
|---|---|---|
| deployed-check (PROD-012, the §4.3 seven checks, real headless Chromium) | **PASS 7/7** — incl. accessibility `critical=0 serious=0` at BOTH viewports (the Interactive Solution surface carries the known, held QA-005-B nested-main moderates, reported non-blocking) | `deployed-check-PASS.txt` (this directory, committed — see the note below) |
| W journey (Gate F, W1 golden product + W2 interactive solution) | **25/25 PASS, 0 FAIL, 0 BLOCKED** | `../PROD-033/runs/w-2026-10-01T13-29-28Z.md` |
| M journey (mobile/Android field) | **22 PASS, 0 FAIL, 1 BLOCKED_NO_KVM** (the emulator lane's honest recorded state; never upgraded) | `../PROD-033/runs/m-2026-10-01T13-30-27Z.md` |
| X journey (combined field-to-office composition) | **15/15 PASS, 0 FAIL** | `../PROD-033/runs/x-2026-10-01T13-30-31Z.md` |

Journey-harness exit law honored: `JOURNEY HARNESS: PASS` (every step PASS
with its recorded class) on all three journeys.

Environment note: the run station's Playwright cache lacked the repo-pinned
`chromium-1208`; the preflight failed explicitly (as designed — browser
checks are never silently skipped) and the pinned browser was installed
before this replay. All checks ran against the real deployed site.

Evidence-capture finding (process defect found and fixed by this
reconciliation): the repo's `.gitignore` (`*.log`, line 20) silently ate
the R2 deployed-check log — R2's README cites `deployed-check-PASS.log`
in its evidence directory, but that file was never actually committed
(`git ls-files docs/productization-evidence/R2-2026-09-28/` returns only
`README.md`). R4 commits its log as `deployed-check-PASS.txt` so the
recorded evidence is durable in-repo.

## 3. What this reconciliation establishes

- **Current production = the current main tip** (`c2bfccf`, runtime equal to
  the code-bearing application tip `0d56dc1`) — no longer only the R2-era
  `c34ad7b`.
- The 65 commits of accepted follow-on work (the accessibility remediation
  wave, the SiteTwin evidence-card wiring, element_addition hardening, typed
  failure surfacing, mobile-fit/route hardening, R3 revalidation, the
  ANCHOR-001/002/003a/003b chain) now carry exact-deployment replay evidence.
- Machine state (`docs/productization-state.json`) is reconciled to this
  deployment (see its `R4 complete 2026-10-01` fields). The R2 records
  remain valid for their own exact SHA/deployment and are preserved.

## 4. Build-inert note (exact-SHA hygiene)

The R4 reconciliation commit itself (this evidence tree + the state-json
update) is documentation/evidence-only and build-inert: any auto-deployment
it triggers serves an application artifact identical to the replay-proven
one above. The next code-bearing change on main must again establish its
own exact-SHA deployment evidence before being called production.

## 5. Open evidence frontiers after R4 (honest)

1. **Physical Android device validation** — the M journey's emulator lane
   records `BLOCKED_NO_KVM` on this station and the E2B evidence is station
   evidence; neither is ever converted to physical-device evidence. This
   frontier requires a physical device (environmental, not code).
2. **Automatic spatial anchoring** — evaluation-kept by evidence
   (ANCHOR-003b: 0/28 real stills anchored, zero fabricated anchors). Any
   promotion requires new governed evidence; no promotion is authorized now.
3. **GBIM-004 (shared geometry contract)** — defined, intentionally deferred;
   execute only when a concrete product requirement requires it.
4. The four held QA-005-B nested-main accessibility moderates — a recorded,
   explicitly held semantic finding, not a defect to silently patch.
