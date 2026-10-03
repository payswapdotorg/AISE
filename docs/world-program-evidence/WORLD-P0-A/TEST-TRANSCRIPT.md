# WORLD-P0-A Test Transcript

**Work item:** WORLD-P0-A (worker-a, reality substrate contracts)
**Base:** `09dd9c3` (the world-program activation commit; parent of the
program-state baseline `bc08e99`)
**Gate:** `bun run verify` (typecheck → lint → test → boundaries), the
deterministic AISE verify gate.

This transcript records every gate run of this wave, INCLUDING the
honest failure runs and their causes — no failure was silently retried
away.

---

## 1 — Baseline verification at the pinned base (before any new code)

| Run | Command | Result | Cause / action |
|---|---|---|---|
| 1 | `bun test` at base, cold sandbox | 6495 pass / 3 fail (6498 total) | The 3 failures were the real-Chromium gates (PROD-030, PROD-031, QA-002 browser): this sandbox had Playwright browser builds 1200/1243 but NOT the pinned `chromium-1208`. Environment gap, not a code regression. Action: `bunx playwright install chromium` (fetched the pinned build). |
| 2 | `bun test` after chromium install | 6501 pass / 1 fail (6502 total) | The remaining failure was QA-002 D2 (agent-panel choice click) — a 10-second waitFor that timed out under full-battery load. In isolation the file passes 5/5. Load-sensitive flake, recorded here. |
| 3 | `bun test` (warm) | **6502 pass / 0 fail — the R7 baseline reproduced exactly (6502/6502)** | Baseline CONFIRMED at the pinned base in this sandbox. |

## 2 — Development-time validation (not gates, recorded for honesty)

The geodesy in `src/wgs84.ts` was cross-validated during development
against **GeographicLib 1.52.2** (Karney's reference implementation),
installed OUTSIDE the repo (scratch module — never a dependency of the
delivered package, never in `bun.lock`):

- 9 canonical vectors (Flinders–Buninyong, Paris–NYC, quarter-equator,
  meridian, short-line, east-line, near-antipodal, high-lat,
  trans-equator): worst |diff| **1.8e-5 m**.
- 1000-pair seeded random corpus: 1000/1000 converged, worst |diff|
  **7.7e-5 m**.

Two real defects were FOUND AND FIXED by this validation before any
test was committed (recorded so the history is honest): (1) the
`sinσ` second term used the wrong pair of reduced latitudes —
meridional lines measured zero; (2) the λ update dropped the `sinα`
factor — oblique lines carried a ≈f relative error (the equatorial case
masked both). The committed test battery pins the corrected behavior to
Vincenty's published 54,972.271 m vector and exact equatorial arcs.
A third defect (a transposed quaternion rotation matrix in
`src/linalg.ts`) was caught by the package's own canonical-rotation
tests before commit.

## 3 — The package battery (new tests, this work item)

`packages/world-reality-substrate` — **253 tests, 7 files, 0 fail**
(5,830 expect() calls, ~0.7 s):

| Suite | Coverage |
|---|---|
| `src/glb.test.ts` (103) | Roundtrip + byte-identical rule; 16 container-negative fixtures; 62 document-negative fixtures; issue-code coverage assertion (no dead codes — every one of the 80 closed codes is exercised); kind-mapping closure; declared resource limits with limit pairs; 500-mutation seeded fail-closed totality property; truncated-prefix totality. |
| `src/conformance.test.ts` (40) | The six-check battery over all five lanes (30 checks constructive); contract-digest tamper evidence; **11 anti-subject discrimination tests** (accept-the-poison, throw-on-canonical, non-determinism, dead capability, undeclared capability, unbound provenance, canonical-id minting, cross-lane handle, non-opaque handle, empty-detail refusal, out-of-vocabulary kind) — each fails exactly its law's check. |
| `src/identity.test.ts` (25) | Handle determinism/lane-quarantine/one-way digests; canonical-id quarantine both branches; provider-ref quarantine; the frozen five-kind vocabulary; typed constructors; failClosed; sha-256 digest helper; seeded PRNG determinism. |
| `src/wgs84.test.ts` (17) | Defining parameters; exact ECEF anchors (equator/poles); Bowring roundtrips at declared tolerances; the exact polar branch; Vincenty canonical vectors (Flinders–Buninyong 54,972.271 m at 1e-3 m; equatorial arcs exact; meridian arc at declared 1 m band); chord lower bound; the honest near-antipodal NON-convergence; horizon visible/culled cases + bisection tangency. |
| `src/composition.test.ts` (19) | Layer strength; variant/reference/payload strength order; lazy payloads with provenance; determinism; the six closed-shape refusals; canonical-value and path-grammar guards. |
| `src/linalg.test.ts` (15) | Canonical rotations; T·R·S order; parent chains; identity laws; ray/AABB hit/miss/inside/away; bounds fitting; digest stability. |
| `src/lanes.test.ts` (27) | Closed request envelopes per lane (unknown fields refused with the field named); per-lane artifact determinism + opaque handles + provenance binding; the five-kind vocabulary exercised across the lane family; STL/PLY parse semantics + refusals + frame policy; magic sniffing with NAMED ambiguity; the cesium whole-request geodesic-convergence refusal. |

## 4 — The full gate battery at the work item's head

| Run | Result | Notes |
|---|---|---|
| `bun run verify` (first at head) | test step: 6754/6755 (1 fail) | One TIMEOUT after 5001 ms: "cost-guards seam — REDIS MODE … session store fail-closes against the unreachable endpoint" — a pre-existing backend/api test (not this item's surface; it waits on an unreachable endpoint with a 5 s budget under full-battery load). In isolation the file passes 5/5. Load-sensitive flake, same class as the baseline QA-002 flake. Recorded, not retried silently. |
| `bun run verify` (re-run) | **VERIFY: PASS** | typecheck ✓ · lint ✓ · test **6755/6755** (87541 expect calls, 436 files) ✓ · boundaries ✓ (1133 source files scanned, no cross-zone import violations) |

**Final arithmetic:** baseline 6502 + new 253 = **6755/6755 — zero
regressions, every new test green.**

## 5 — Environment facts recorded for reproduction

- bun 1.3.14, Node v24.21.0, Linux x64 sandbox.
- Pinned Playwright chromium v1208 installed during this wave (see
  §1); the three real-Chromium gates and one load-sensitive browser
  flake are the only baseline tests that ever failed here, all for
  environment/load reasons, all recorded above.
- `bun install` was run once at the item's base to register the new
  workspace package; `bun.lock` carries the mechanical workspace
  addition only (verified in the delivery diffstat).
- Determinism note: two browser-class tests in the wider battery are
  load-sensitive under full-battery parallelism (QA-002 D2; the REDIS
  cost-guards seam). Both pass in isolation and on warm re-runs; both
  pre-date this work item; neither touches this package's surface.
