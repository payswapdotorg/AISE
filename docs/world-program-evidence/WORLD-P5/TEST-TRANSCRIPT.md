# WORLD-P5 — Test Transcript (the recorded runs)

**Item:** WORLD-P5 — Multiplatform convergence.
**Sandbox:** bun 1.3.14, Linux x86-64, 2 cores, 4 GB RAM, NO GPU
DEVICE (`/dev/dri` absent — the P0-A recorded blocker), Playwright
Chromium headless shell 145.0.7632.6 (WebGL via SwiftShader software
GL — renderer string recorded in PERFORMANCE-OBSERVATIONS.md §4).
ZERO fabricated numbers: every count below is from a run executed in
this sandbox during this item's delivery, recorded verbatim.

## 1. The baseline at base `bb624fb` (this sandbox, before any P5 change)

`bun install` (182 packages) then `bun run verify`:

- typecheck PASS · lint PASS · boundaries PASS;
- the battery: **7325 tests — 7321 pass / 4 fail**. The 4 failures
  are the pre-existing QA-002 browser-proof legs timing out under
  full-parallel load in THIS 2-core sandbox (they pass **5/5 in
  isolation**; the WORLD-P4 verification recorded 7325/7325 at its own
  station). This is the honestly-recorded environmental
  characteristic of the delivery sandbox — pre-existing, unchanged in
  kind by this item (see §5).

## 2. The P5 branch — `bun run verify` (the composed repo, all gates)

Three consecutive full runs, all green:

| Run | Tests | expect() calls | Time | Result |
|---|---|---|---|---|
| 1 | **7418 pass / 0 fail** | 92,546 | 33.62 s | VERIFY: PASS |
| 2 | **7418 pass / 0 fail** | 92,543 | 33.07 s | VERIFY: PASS |
| 3 | **7418 pass / 0 fail** | 92,543 | ~33 s | VERIFY: PASS |

`bun run verify` = typecheck strict (every workspace, including the
NEW `packages/world-scene-runtime`) + eslint + `bun test` (the full
battery) + the boundaries scan (**1291 source files, no cross-zone
import violations**).

**The delta is exactly the 93 new tests** (7325 baseline + 93 = 7418)
across 9 new test files + the extended world battery.

## 3. The new suites (isolated runs — the per-file transcripts)

| Suite | Tests | Proves |
|---|---|---|
| `packages/world-scene-runtime/src/adapter.test.ts` | 23 pass | the REAL Babylon adapter contract: ingest laws (fail-closed scene_invalid / asset_not_found / inverted+zero-extent boxes), camera round-trips + modes + listener, real CPU-ray picks (canonical ids, containment), layer AND-semantics + unknown-layer refusal, ghost set (distinct material, removal hidden-but-resolvable, both-proposed-and-removed refusal), section, bounds (box union + the double-congruent fallback), dispose, honest capabilities (NullEngine gpu-rendering BLOCKED), headless render pass + frameStats, rendererInfo honestly null |
| `packages/world-scene-runtime/src/substitution.test.ts` | 10 pass | THE SUBSTITUTION LAW: the real adapter ≡ the P0-A in-memory double (loads, camera round-trips byte-equal, target picks identical, sky picks null in both, layer semantics equivalent, ghost semantics equivalent, geometry-less bounds identical, whole-flow determinism byte-identical) |
| `apps/web/src/app/world/headless-viewport.test.ts` | 5 pass | the record's viewport extension: projection determinism (canonical-JSON identical), LAW 1 extended (live ≡ committed incl. viewport; stationId unchanged 794d5f8ca8e59d66), box traceability (the declared plan shapes / capture volumes / coverage union / ghost = wall + 0.02 m), the real adapter over the committed scene (canonical picks, ghost set, deterministic), LAW 2 camera parity |
| `apps/web/src/app/world/gpu-smoke.test.ts` | 18 pass | ONE browser session, three journeys: (a) the GPU viewport (bundle scan crypto-free + Babylon present; MOUNT with renderer recorded + census = the record's boxes + real draw calls; typed camera ops drive the real camera; layer toggle hides real meshes; a REAL ray hits the GHOST with the removed wall skipped; refusals fail closed; zero pageerror); (b) the DM gesture capture (authoring bar; a real grab+drop on the slab captures the typed gesture sequence; determinism byte-identical; sky grabs capture nothing); (c) the chrome (the frame + injected stylesheet APPLIED — computed styles; the SAME typed surface under chrome; the audio hooks — cue mapping, gesture gate; zero pageerror) |
| `apps/web/src/app/world/authoring.test.ts` | 6 pass | DM ≡ NL at the route: the SAME operationId + ghost element id + canonical-identical ghost scenes; only the provenance differs (origin + interactionDetail vs commandText, exactly the law); the seeded delta drill; the ghost laws through composeStationScene (overlay; plan-wall-001 → proposed-removed); fail-closed drills (ghost target, stale revision, substrate id, move-needs-drop-at, unsupported utterance, missing selection, undeclared element); the serving-stamp law |
| `apps/web/src/app/world/chrome.test.ts` | 14 pass | the closed audio vocabulary; the pure command→cue mapping over all kinds + refusals + determinism; the bun sink honesty (typed unavailable, never throws); static-render determinism under the chrome frame (byte-identical; the inner markup ≡ the plain render — LAW 3 held); the stylesheet discipline |
| `apps/web/src/app/world-route.test.ts` | 5 pass | the `#/world` route: parse/format canonical round-trips (bare + live scope + deep links); the closed query set rejects unknown/empty parameters (typed not-found); the surface mapping; the desktop journey's composed URL |
| `apps/desktop/src/world/world-journey.test.ts` | 7 pass | the desktop world journey: shell boot via the shell's own policy parsing; the `#/world` URL composition; the station census (stationId 794d5f8ca8e59d66, 7 canonical panels POPULATED, 7 elements, 7 boxes, the ghost); the typed interactions through the SAME reducer (incl. the unknown-element refusal, state unchanged); the real-adapter parity (NullEngine: revision, camera round-trip, ghost set, rendererInfo null); parityFacts exact; the fail-closed shell-args drill; determinism |
| `backend/api/src/world/world.test.ts` | 5 pass | the LIVE journey over the REAL backend (in-process, real stores): seed through the REAL routes → bind (the live world + the LIVE problem POPULATED; unpopulatable sources EMPTY); the LIVE update (review → under_review flows to the rebind; a world version changes the station identity — the honest identity boundary); the scope change; fail-closed unknown project (typed 404); the HTTP route serving the record |

## 4. The P4 contract tests — green UNMODIFIED

`apps/web/src/app/world/headless.test.tsx` (11) +
`browser-smoke.test.ts` (7): **18 pass / 0 fail** on the P5 branch —
the P4 files byte-untouched (`git diff` carries no change to either).
The world-ux package suite (108 tests) and the whole P1/P2/P3 lane
suites pass inside the full battery unchanged.

## 5. The honest environmental record (the flakiness + the mitigation)

The delivery sandbox is a 2-core / 4 GB container. The full-parallel
battery runs multiple real-browser suites concurrently; at THIS
memory/CPU budget, concurrent Chromium instances occasionally crash
or time out (observed at BASE with the pre-existing QA-002 legs —
§1 — and once during THIS item's development with the new world
browser suites). The delivered configuration mitigates it WITHOUT
masking anything: the three heavy world journeys share ONE browser
session (one bundle/server/Chromium — `gpu-smoke.test.ts`) and the
two Babylon bundles are esbuild-minified (the 14.6 MB development
bundles → ~4.5 MB — the parse/compile memory drop). With the
delivered configuration the full battery passed three consecutive
times (§2). No test retries, no failure masking, no skipped legs: a
failure is a failure (the three green runs are the recorded truth;
the earlier failing runs during development are recorded here for
the record).

## 6. The measurement runs

See PERFORMANCE-OBSERVATIONS.md + `measurements-raw.txt` (the
timestamped raw transcript of `bun docs/world-program-evidence/WORLD-P5/measure.ts`
— the recorded run 2026-10-06T07:29Z, re-runnable from the repo root).
