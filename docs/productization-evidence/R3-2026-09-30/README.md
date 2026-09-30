# R3 — Directive-3 re-validation: journey simulation + adversarial stress + three-layer alignment (2026-09-30)

The operator's directive-3 arc (agent-browser journey simulation + adversarial
stress + three-layer quality alignment) re-run at the current production
state, following the R2-2026-09-28 protocol.

## 1. The exact deployment

| fact | value |
|---|---|
| code-bearing deployed commit | `8f40a45` (merge: ANCHOR-002 — the anchoring contract layer) |
| main tip at run time | `410d41a` (docs-only over 8f40a45); evidence commits follow docs-only |
| production URL | https://aise-tan.vercel.app |
| healthz | `{"ok":true,"service":"aise-api","version":"0.1.0"}` |
| readyz | `ok` with `artifacts backend=r2` (the durable stack: Neon domain state + R2 blobs + Redis sessions) |

## 2. The journey battery (fresh, 2026-09-30T13:17Z)

| gate | result | record |
|---|---|---|
| deployed-check (a11y + runtime errors, desktop 1440x900 + mobile 390x844) | **DEPLOYED: PASS** — `critical=0 serious=0` at both viewports (3 moderate non-blocking landmark notes); zero uncaught page errors; zero blocking console errors; zero blocking failed requests | `journey-battery.log` (this directory) |
| W journey (golden product + interactive solution, real headless Chromium) | **25/25 PASS** | `../PROD-033/runs/w-2026-09-30T13-17-12Z.md` |
| M journey (mobile/Android field) | **22 PASS + 1 BLOCKED_NO_KVM** (the standing physical-emulator lane; fidelity matrix 5 REAL / 8 DETERMINISTIC / 2 SYNTHETIC / 1 UNAVAILABLE-ON-STATION — never upgraded) | `../PROD-033/runs/m-2026-09-30T13-18-06Z.md` |
| X journey (combined field-to-office) | **15/15 PASS** | `../PROD-033/runs/x-2026-09-30T13-18-06Z.md` |

## 3. The adversarial stress battery (fresh, `adversarial-battery.log`)

7/7 classes green against the deployed production:

| class | probe | observed |
|---|---|---|
| A. concurrency idempotency | 10 parallel identical uploads of fresh content | exactly **1 STORED + 9 DUPLICATE** |
| B. cross-session idempotency | fresh demo session re-uploads stored bytes | **DUPLICATE** (the store, not the session, owns the identity) |
| C. hash mismatch | bytes uploaded under a wrong content id | **422 `CONTENT_ID_MISMATCH`** naming the computed sha-256 |
| D. invalid content id format | `not-a-hash` | **400 `invalid_content_id`** (typed) |
| E. oversize asset | 11 MB random bytes under their true id | **413** (typed) |
| F. unauthenticated upload | no session cookie | **401 fail-closed** |
| G. durable stack | GET /readyz | **200, `artifacts backend=r2`** |

## 4. The agent-browser journey walk (fresh, `walk/`)

The golden journey walked interactively in a real browser (agent-browser),
signed in through the demo gate, one screenshot per canonical surface, zero
page errors and zero console errors across the whole walk:

| step | surface | screenshot |
|---|---|---|
| 1 | the sign-in gate (session required; the demo entry) | `walk/01-landing.png` |
| 2 | the task-first landing — "What do you need to do?", the four canonical actions, the LIVE API badge | `walk/02-dashboard.png` |
| 3 | Capture / Upload — the mission, what to capture and why, the mobile handoff | `walk/03-capture.png` |
| 4 | Engineering Case — observations / hypotheses / declared missing evidence / "What is this case based on?" | `walk/04-investigate.png` |
| 5 | Build solution — the two ways + the interactive workspace (observed and proposed) | `walk/05-build-solution.png` |
| 6 | BOQ Lens — source import, item rows, cost hierarchy, grounded explanations | `walk/06-boq.png` |
| 7 | Outcomes — recorded executions, design-vs-reality, post-work evidence return path | `walk/07-outcome.png` |

## 5. Three-layer alignment (the scorecard re-validated)

`docs/layered-competitive-parity-scorecard-2026-09-29.md` remains the
alignment record; at this re-validation every MET/HONEST verdict it records
re-holds at the current SHA with the fresh evidence above (the W/X/M battery
re-ran the journeys the scorecard cites; the adversarial battery re-proved
the durability + typed-failure rows). The open items are unchanged and
honest:

- **L1 automatic spatial anchoring** — the ANCHOR-002 contract layer
  (`8f40a45`) is live and deployed; production parity waits only on the
  real-photoset run (an external precondition — real photos of a real
  floor; never fabricated).
- **M-journey physical emulator lane** — BLOCKED_NO_KVM (hardware-gated;
  recorded, never upgraded).

Both batteries' exit law: every step PASS with its recorded class, or the
honest recorded BLOCK — nothing in between.
