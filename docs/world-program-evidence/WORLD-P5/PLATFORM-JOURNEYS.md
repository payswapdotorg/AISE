# WORLD-P5 — Platform Journey Records (web + desktop + field mobile)

**Item:** WORLD-P5 — Multiplatform convergence.
**The convergence law (the work order):** web, desktop and field mobile
resolve to the IDENTICAL governed engineering state — one Reality
Graph, one Evidence Graph, one station-record discipline, one typed
EngineeringOperation vocabulary; the platform is a mount, never a
second authority. This file records each platform's journey parity —
what is PROVEN, on which machine, and what is honestly declared.

## The shared governed state (all platforms)

- The ONE committed station record: `apps/web/src/app/world/station-record.json`
  — station identity `794d5f8ca8e59d66`, scope `proj-demo-001`, 7
  elements (3 capture assets + the coverage annotation + the plan wall
  + the plan slab + the plaster ghost), 7 declared viewport boxes, 7
  POPULATED panels, the ghost summary (proposed
  `ghost-reparameterize-2814f7cd97b18960`, removed `plan-wall-001`).
  The record regenerated at P5 with the viewport projection; the
  station IDENTITY unchanged (presentation geometry is excluded from
  the identity digest — the P4 identity law held through the
  extension).
- The ONE typed command vocabulary: `browser-station.ts`'s closed
  command set (select / clear / camera-operation / toggle-layer) —
  the same reducer every platform's journey drives.
- The ONE typed EngineeringOperation vocabulary: the P3 lane compiler
  — the same operation from gesture and NL (the authoring parity).
- The ONE live seam: the backend's world-station route
  (`GET /v1/world/projects/:id/station`) over the same
  `WorldStationSources` ports — the live occupant.

## Web — PROVEN (this sandbox, in-repo)

The world route is REACHABLE from the product shell (`#/world` — the
typed hash router, `world-route.test.ts` 5 tests) and renders:
- the committed station by default (the deterministic mount — the P4
  surface, chrome-composed);
- the REAL GPU viewport (the P5 mount — `gpu-smoke.test.ts` 13 legs in
  a real Chromium over loopback: engine up, renderer recorded
  (SwiftShader software GL in this sandbox), census = the record's
  boxes, a real ray pick hits the ghost, typed camera ops round-trip,
  layer toggles hide real meshes, refusals fail closed, the DM gesture
  capture captures from real picks deterministically, zero pageerror);
- the LIVE station when a project scope is queried (the world screen's
  live fetch of the served record; the honest unavailable fallback
  renders the committed station — never a fabricated live station).
The browser proof runs in THIS sandbox (the recorded renderer:
SwiftShader — software-rendered, honestly labeled).

## Desktop — PROVEN at the adapter/policy level (this sandbox); the shell LAUNCH declared BLOCKED

The P0-C standing decision holds: **Electron KEEP; Tauri deferred with
its recorded trigger** (the trigger's two conditions are NOT met in
this sandbox — no display/webview to verify per-platform WebGPU
fidelity in the OS-webview set; no field-device footprint product
requirement recorded).
The desktop world journey (`apps/desktop/src/world/world-journey.test.ts`
— 7 tests, the PROD-020 bun-testable adapter discipline): the shell
boots through its OWN policy parsing (`aise://project/proj-demo-001`
deep link → the load target), composes the web app's `#/world` route,
mounts the SAME committed record (the census: stationId
`794d5f8ca8e59d66`, the 7 canonical panels all POPULATED, 7 elements,
7 viewport boxes, the ghost present), drives the SAME reducer
(selections incl. the ghost + the removed wall, camera orbit, layer
toggle, the unknown-element refusal — state unchanged), and proves
the REAL-adapter parity (NullEngine: loadScene revision match, camera
round-trip JSON-equal, the ghost set applies, rendererInfo honestly
null). Feature-equivalence is over the ONE record — the desktop
imports the web route's committed `station-record.json` (apps→apps,
boundary-legal; no copied truth).
The shell LAUNCH itself (an Electron process with a display) is
BLOCKED in this sandbox (no display — the PROD-020 launch evidence
stays the integration-station lane). The desktop consumes the SAME
web front end — there is no second desktop authority (the P0-C law).

## Field mobile — the capture→sync journey PROVEN (prior items, the station lane); the WORLD-OPEN handoff WRITTEN at P5, execution declared BLOCKED in this sandbox

- Capture → upload/synchronize: the existing station trio
  (`FieldJourneyStationSyncTest` + `RealImageStationJourneyTest` +
  the field-journey station script) — REAL backend, REAL HTTP submit,
  idempotent DUPLICATE re-submit, server-verified sessions (PROD-032's
  recorded lane; not re-run in this sandbox).
- WORLD-OPEN (the Scenario A "open" verb): `WorldOpenDeepLink` — the
  strict `aise://world?project=…[&case=…]` codec (compose + parse,
  typed rejections, canonical formatting — the POST-005 codec
  discipline) + `world-open.sh` (the e2b station leg: the :core codec
  tests, the REAL backend boot, the governed project creation, the
  live station verification, the composed handoff). WRITTEN at P5;
  NOT EXECUTED in this sandbox (no Android SDK, no gradle — the
  verification protocol is the CI android lane + the station script;
  the app UI is untouched; the handoff is a URI — no second
  authority).
- The "open" verb completes on web/desktop: `#/world?project=…` opens
  the SAME governed state through the live seam (proven web-side in
  this sandbox — `backend/api/src/world/world.test.ts`).

## Cross-platform identity (handoff §9 Scenario E, the honest subset)

What is PROVEN to resolve identically across the platforms THIS
delivery reaches: the project identity (the scope label / project id
carried verbatim), the station identity (the content-derived digest —
the same record on web and desktop; the live station's identity
derived from the same governed content through the same binding), the
element identities (the canonical AISE ids — the same roster on every
platform; the real viewport's picks return them), the typed
EngineeringOperation identity (the gesture ≡ NL parity), and the
provenance chain (the record's evidence ids; the live case records'
evidence links). Platform-specific rendering NEVER creates
platform-specific engineering truth (the GPU viewport renders the
DECLARED geometry; the live nodes without declared geometry render no
mesh — an honest roster, never an invented scene).

## The honest environmental record (this sandbox)

The delivery sandbox is a 2-core GPU-less container. The full-battery
environmental characteristic recorded at base AND unchanged by this
item's design: the pre-existing QA-002 browser legs are
load-contention-flaky under full-parallel battery runs in THIS
sandbox (they pass 5/5 in isolation; the P4 verification recorded
7325/7325 on its own station). This item's battery runs and the
flakiness characterization are recorded verbatim in TEST-TRANSCRIPT.md
— nothing is averaged away, nothing hidden.
