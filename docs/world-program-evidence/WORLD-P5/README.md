# WORLD-P5 — the evidence set

**Item:** WORLD-P5 — Multiplatform convergence (the final program item:
web + desktop + field mobile resolve to the identical governed
engineering state; first-class desktop app).
**Work order:** worker-c (Interactive Solution runtime + the desktop
adapter — the protected surfaces), base `bb624fb` (the P4-composed
tree, battery 7325/7325), branch `work/WORLD-P5`.

## The delivery map

| Surface | Files | Proof |
|---|---|---|
| **Mount 1 — the real Babylon GPU viewport** | `packages/world-scene-runtime/` (the real occupant of the P0-A `babylon.scene-runtime/1` port: NullEngine + WebGL modes, typed ingested-mesh geometry, canonical-id picks, AND-semantics layers, ghost distinctness, render/draw/renderer diagnostics); `apps/web/src/app/world/scene-projection.ts` (the declared-geometry viewport projection — plan shapes + capture volumes + coverage union + the ghost transform, never invented); the record extension (`record.ts` + `station-record.generate.ts` + the regenerated `station-record.json`, stationId UNCHANGED); `browser-gpu-mount.tsx` (the GPU browser mount: same station surface + the real viewport + the gesture capture) | 33 package tests (contract + substitution vs the P0-A double) + 5 headless-viewport tests + the 13-leg real-browser journey (`gpu-smoke.test.ts` — incl. the authoring legs) |
| **Mount 2 — the P1 measurement protocol, verbatim** | `measure.ts` + `corpus.ts` + `measure-mount.ts` + `measurements-raw.txt` | PERFORMANCE-OBSERVATIONS.md (§1 NullEngine CPU costs 10/100/1000, §2 the P1 floors re-measured, §3 the P4 UI costs, §4 the SwiftShader software-render legs with the renderer recorded, §5 the BLOCKED real-GPU + Cesium declarations) |
| **Mount 3 — the production HUD chrome** | `world-chrome.css`, `chrome.ts` (the typed audio hooks), `browser-chrome-mount.tsx` | 14 chrome tests + the 5-leg real-browser chrome journey; the P4 contract tests green UNMODIFIED |
| **Mount 4 — multi-input authoring at the route** | `authoring.ts` (the move-capable station scope, the NL move-grammar port occupant, the gesture-stream assembly with the serving stamp, the parity entry) + the mount's gesture capture | 6 authoring tests (DM ≡ NL: the same operationId + ghost; fail-closed drills) + the browser capture legs |
| **Mount 5 — the live backend continuity** | `backend/api/src/world/sources.ts` (the LIVE WorldStationSources occupant over the real stores) + `router.ts` (`GET /v1/world/projects/:id/station` — the served station record) + the additive `server.ts` wiring; `apps/web/src/app/router.ts` (the `#/world` route) + `world-screen.tsx` (the committed default / the live fetch / the honest fallback) + the App wiring | 5 live-journey tests (real stores in-process: seed → bind → live update → rebind; scope changes; fail-closed) + 5 route tests |
| **The first-class desktop app** | `apps/desktop/src/world/` (the corpus over the ONE committed record, the journey model, the README citing P0-C) | 7 desktop world-journey tests (adapter/policy level — the PROD-020 discipline; the Electron launch stays the integration-station lane) |
| **The field-mobile journey** | `apps/android/core/.../WorldOpenDeepLink.kt` (+ the JVM test) + `scripts/e2b-station/world-open.sh` | WRITTEN, execution declared BLOCKED in this sandbox (no SDK) — the CI lane + the station script are the protocol |

## The gates (the per-gate acceptance map is in the delivery report)

1. Baseline preserved — TEST-TRANSCRIPT.md (the battery record + the
   honest environmental characterization).
2. Substitution law — the scene-runtime substitution tests (the real
   adapter ≡ the P0-A double); the deterministic presentation layer
   stays as the fallback path.
3. License matrix — LICENSE-MATRIX.md (the Babylon runtime adoption;
   nothing else new).
4. Honesty laws — CAPABILITY-BOUNDARIES.md (the BLOCKED declarations
   with their exact blockers + unblocking protocols).
5. Evidence — this directory, committed with the branch.
6. External tech is never an AISE authority — the adapter's port
   surface is substrate-neutral; picks return canonical ids; the live
   sources map governed ids verbatim; the record is the browser's
   whole world.

## The evidence files

- `README.md` — this map.
- `LICENSE-MATRIX.md` — the runtime-adoption extension.
- `CAPABILITY-BOUNDARIES.md` — the honest CAN/CANNOT record.
- `PERFORMANCE-OBSERVATIONS.md` — the protocol results (the raw
  transcript: `measurements-raw.txt`; the harness: `measure.ts` +
  `corpus.ts` + `measure-mount.ts`).
- `TEST-TRANSCRIPT.md` — the battery + per-suite transcripts.
- `PLATFORM-JOURNEYS.md` — the web/desktop/mobile journey parity
  records.
