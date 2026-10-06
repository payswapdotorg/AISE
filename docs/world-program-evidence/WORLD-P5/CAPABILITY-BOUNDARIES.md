# WORLD-P5 — Capability Boundaries (what this item can and cannot do)

**Item:** WORLD-P5 — Multiplatform convergence (the final program item:
web + desktop + field mobile resolve to the identical governed
engineering state; first-class desktop app).
**Scope of this record:** the honest boundary between what the P5
delivery PROVES in-repo and what it deliberately does NOT claim.
Declared-BLOCKED is acceptable evidence (the ANCHOR doctrine); nothing
here upgrades a contract proof into a capability claim. ZERO
fabricated measurements (see PERFORMANCE-OBSERVATIONS.md).

## CAN do at P5 (proven, in-repo)

1. **Mount the REAL Babylon viewport behind the P0-A scene-runtime
   port over the station-record discipline.** The record's element
   status index + camera state are the mount inputs; the P4 parity
   laws hold: LAW 1 (the live Node binding ≡ the committed record,
   byte-identical through the canonical-JSON comparison — now covering
   the viewport projection; the station IDENTITY is unchanged at
   `794d5f8ca8e59d66` because presentation geometry is excluded from
   the identity digest); LAW 2 (the typed reducer ≡ the applied camera/
   layer/selection state, mirrored to the real viewport); LAW 3 (the
   deterministic static markup unchanged — the P4 render tests green
   UNMODIFIED). The deterministic presentation layer stays as the
   headless/fallback path (the substitution law: `packages/world-scene-runtime/src/substitution.test.ts`
   proves equivalent canonical outputs — picks, visibility, camera
   round-trips, bounds — between the real adapter and the P0-A
   in-memory double). PROVEN: `packages/world-scene-runtime` (33
   tests) + `headless-viewport.test.ts` (5) + `gpu-smoke.test.ts`
   (the real-browser GPU legs).
2. **Run the real GPU viewport in a real browser.** The esbuild-
   bundled GPU mount (Babylon in the graph, ZERO Node-builtin markers)
   serves over loopback and opens in a real Chromium: the WebGL engine
   comes up, the renderer string is recorded (honestly: SwiftShader
   software GL in this sandbox), the mesh census equals the record's
   declared boxes, a REAL ray pick at the screen center hits the GHOST
   element (the ghost-removed wall underneath is skipped — never a
   phantom hit), typed camera operations drive the real camera
   byte-equal, layer toggles hide real meshes, unknown-element
   selections fail closed, ZERO pageerror. PROVEN: `gpu-smoke.test.ts`
   (7 legs).
3. **Execute the P1 measurement protocol verbatim against the real
   adapter.** NullEngine CPU-side costs at 10/100/1000-node fixtures
   (ingest / layer toggling / camera / pick / render, median + p95
   over 25 runs), the P1 contract floors re-measured (the
   no-regression check), the P4 UI query costs at the fixture scales,
   and the SOFTWARE-RENDERED (SwiftShader) browser legs with the
   renderer string recorded — every number from a RECORDED run. PROVEN:
   `measure.ts` + `measurements-raw.txt` (§1–§4).
4. **Compose the production HUD chrome OVER the P4 contracts without
   touching them.** The panels are data; the chrome is presentation:
   the diegetic dark theme, panel entrance animations, game-feel
   status chips, sensor-feed viewport frame, responsive layout,
   reduced-motion support, and the typed WebAudio cue hooks
   (capability-honest, gesture-gated, synthesized — no audio assets;
   presentation-only: static markup byte-identical with chrome on).
   The P4 contract tests stay green UNMODIFIED. PROVEN:
   `chrome.test.ts` (14) + `chrome-smoke.test.ts` (5, real browser).
5. **Author by GESTURE and by NL COMMAND at the route — the same typed
   EngineeringOperation.** The move-capable station authoring scope;
   the DM gesture stream (pick → grab → drag → drop → commit) and the
   NL utterance compile through the REAL lane compiler to the SAME
   operationId and the SAME ghost scene (only the provenance differs,
   exactly as the law requires); the ghost composes as an overlay and
   the target flips to `proposed-removed` through `composeStationScene`;
   the browser captures the typed gesture sequence from REAL viewport
   picks (deterministic, fail-closed on sky grabs); the serving-side
   stamp law holds (the browser never reads a clock). PROVEN:
   `authoring.test.ts` (6) + the authoring legs of `gpu-smoke.test.ts`.
6. **Serve the LIVE world station over the real backend through the
   SAME WorldStationSources ports.** The backend's own governed state
   (reality graph versions, engineering cases) read directly through
   the real stores, mapped into the lane types, bound by the same
   `bindWorldStation`, served as the station record at
   `GET /v1/world/projects/:id/station`; a LIVE case update (review →
   under_review) flows to the rebind; a new reality version changes
   the world revision AND the station identity (the honest liveness
   boundary: the identity digest carries the problem ID, not its
   status — a status change updates content, a version change updates
   identity); sources the state cannot honestly populate answer typed
   nulls (honest EMPTY panels); an unknown project refuses the binding
   (never a partial station). PROVEN: `backend/api/src/world/world.test.ts`
   (5 tests, real stores in-process).
7. **Reach the world from the product shell on every platform.** The
   SPA's typed hash router gains `#/world[?project=…&case=…&element=…&panel=…]`
   (the world screen: the committed station by default; the LIVE
   served station when a project scope is queried; the honest
   unavailable fallback — never a fabricated live station); the
   desktop world journey composes `#/world` through the shell's own
   policy parsing and proves feature-equivalence over the ONE
   committed record (the same stationId, panels, reducer refusals and
   the real-adapter parity, NullEngine); the field-mobile world-open
   handoff (`aise://world?project=…[&case=…]`) composes the Scenario A
   open with a strict codec. PROVEN: `world-route.test.ts` (5) +
   `apps/desktop/src/world/world-journey.test.ts` (7).

## CANNOT do at P5 (declared, with reasons and protocols)

**BLOCKED: real-GPU frame time / draw-call measurements.** This
sandbox has NO GPU device (`/dev/dri` absent, no VGA — the WORLD-P0-A
recorded blocker, unchanged). The browser legs render through
SwiftShader SOFTWARE GL and are recorded as clearly-labeled
supplementary software-render observations (the renderer string named
in every row) — NEVER as GPU numbers. **Unblocking:** run the
measurement harness's legs 1+4 on GPU-bearing hardware; record GPU
vendor/driver alongside every number (never averaged across vendors);
the SwiftShader rows then remain the software baseline.

**BLOCKED: Cesium 3D Tiles streaming/register measurements.** (a) no
campus-scale photogrammetry 3D Tiles corpus is available or
licensable in this sandbox (Cesium ion sample corpora are commercial
cloud services; the P0-A matrix records AISE consumes the open-source
engine only, no ion dependency); (b) no GPU device (as above); (c) no
real Cesium adapter is mounted in this delivery — the P5 mounts are
the Babylon scene viewport per the work order; the P0-A cesium port
remains contract + in-memory double with its georeference round-trip
measured at contract level (WORLD-P0-A PERFORMANCE-OBSERVATIONS §3).
**Unblocking:** mount a real Cesium occupant of the P0-A cesium port,
source an open-licensed campus-scale corpus, measure streaming/register
costs + the georeference tolerance round-trip against the P0-A
declared tolerance on GPU-bearing hardware.

**BLOCKED: the Electron shell LAUNCH (the desktop app's own process).
** The P0-C standing decision is Electron KEEP (Tauri deferred with
its recorded trigger); this sandbox has no display and no Electron
launch lane (the PROD-020 evidence records the launch smoke at the
integration station). The desktop world journey is proven at the
adapter/policy level (bun-testable — the same shell policy parsing,
the same committed record, the same reducer and real-adapter parity),
which is the established PROD-020 desktop test discipline; the shell
itself loads the SAME web front end (the `#/world` route). The Tauri
trigger's two conditions are NOT met in this sandbox (no display/
webview to verify per-platform WebGPU fidelity in the OS-webview set;
no field-device footprint requirement recorded). **Unblocking:**
launch verification at an integration station with a display (the
PROD-020 lane).

**BLOCKED: executing the Android lane in this sandbox.** No Android
SDK, no gradle distribution and no emulator exist in this sandbox, so
the WORLD-P5 android additions (the `WorldOpenDeepLink` codec + its
JVM tests, the `world-open.sh` station leg) are WRITTEN but NOT
EXECUTED here. **Unblocking:** the CI android lane
(`./gradlew :core:test :app:test`) and the e2b station script
`apps/android/scripts/e2b-station/world-open.sh` (which boots the REAL
backend and verifies the live station + the composed deep link
end-to-end). The android CODE CHANGES at P5 are deliberately minimal
and pattern-copied from the POST-005 codec (the riskiest surface —
the app UI — is untouched; no second authority is introduced: the
handoff is a URI).

## The honest boundary statement

P5 delivers the convergence MOUNTS with in-repo proofs: the real
Babylon viewport over the one-record discipline (web + the browser-
proven GPU path), the measurement protocol executed verbatim with
every number earned in this tree, the chrome composing over untouched
P4 contracts, the gesture ≡ NL authoring parity at the route, the
live backend continuity through the same ports, the product reach
(web route + desktop journey + the mobile handoff codec), and the
platform journey records. It does NOT claim real-GPU numbers, Cesium
measurements, an Electron launch, or executed Android tests — those
are declared BLOCKED with their exact blockers and unblocking
protocols above, and every claim this item does make is proven in-repo
by the recorded runs in TEST-TRANSCRIPT.md.
