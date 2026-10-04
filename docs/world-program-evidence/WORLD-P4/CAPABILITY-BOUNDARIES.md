# WORLD-P4 — capability boundaries (what this item can and cannot do at P4)

**Item:** WORLD-P4 — the game-world UX transformation.
**Scope of this record:** the honest boundary between what
`packages/world-ux` + `apps/web/src/app/world` PROVE at P4 and what
they deliberately do NOT claim. Declared-BLOCKED is acceptable
evidence (the ANCHOR doctrine); nothing here upgrades a contract proof
into a capability claim. ZERO fabricated measurements (see
PERFORMANCE-OBSERVATIONS.md).

## CAN do at P4 (proven, in-repo, deterministic)

1. **Project all seven HUD panels as read-only lane compositions with
   honest content states** — every panel is a pure function of the
   composed lane sources; POPULATED cites real lane records verbatim;
   EMPTY is the lane's honest "none in scope" (never fabricated
   filler); UNAVAILABLE carries the unified typed failure. PROVEN:
   `hud/contract.test.ts` (18 tests: per-panel POPULATED/EMPTY drills
   + the closed vocabularies + the assembled HUD over the committed
   fixtures).
2. **Fail the HUD closed (never a partial HUD)** — a poisoned source
   (a bad verdict vocabulary, a non-declared instant, a non-finite
   number, an epistemically-upgraded projection, an unsorted
   constraint list) refuses the WHOLE assembly with the unified
   failure naming the refusing family; drilled per panel + the
   assembly. PROVEN: `hud/failclosed.test.ts` (17 tests).
3. **Hold the panel projections to their invariants under generated
   inputs** — seeded property suites over generated problem/conflict
   sets, gap sets, observation sets and action sets (shape invariants,
   verbatim-citation invariants, determinism). PROVEN:
   `hud/fuzz.test.ts` (8 property suites).
4. **Compose the station scene with ghost-distinctness and
   ghost-removed RESOLVABILITY** — captured reality is never mutated
   (the ghost scene is an overlay); a ghost-removed element id stays
   resolvable with status `proposed-removed` + the captured node
   intact (P3 wiring note #5); the status vocabulary is closed;
   ghost/authored chips are distinct in the rendered roster. PROVEN:
   `surface/contract.test.ts` (18 tests).
5. **Guard provenance fail-closed (P3 wiring note #3)** — a ghost
   source command whose provenance violates
   `missing_operation_provenance` (no evidence ids, no derivation
   note, no command text) REFUSES the station composition. PROVEN:
   `surface/failclosed.test.ts` (10 tests, incl. the base-scene law,
   the no-mutation law, the removal-reference law and the quarantined
   selection drill).
6. **Keep identity quarantine at the UX boundary** — a pick or
   selection carrying a substrate-shaped id is refused (the lanes'
   `looksLikeSubstrateId` law, composed here); no substrate object id
   ever becomes canonical AISE identity (handoff §10). PROVEN:
   `surface/contract.test.ts` + `surface/failclosed.test.ts`.
7. **Bind the route through typed ports whose doubles need ZERO
   substrate** — `bindWorldStation` over the two in-memory kits (the
   reference kit: the REAL P1 fixture world + the REAL P2 lane run +
   the REAL P3 lane run + the REAL engine replay + the REAL derived
   BOQ; the alternate kit: the fully-alternate substrate seam) —
   byte-identical station models (the substitution law); the binding
   is fail-closed on poisoned sources (never a partial station).
   PROVEN: `wiring/contract.test.ts` (10) + `wiring/substitution.test.ts`
   (5).
8. **Present the UNIFIED lane-failure presentation** — the P2/P3
   family shape `{kind, family, detail}` with the P1 shape mapped
   onto it (family := port; subjectId appended); the HFX-000 closed
   vocabulary imported VERBATIM (never modified, never extended).
   PROVEN: `seam.test.ts` (15 tests).
9. **Render the station deterministically (headless) with the
   one-record discipline** — the live Node binding reproduces the
   committed `station-record.json` byte-identically (LAW 1); the
   browser interaction reducer ≡ the REAL world-ux transforms
   (LAW 2: selection / camera / layers / pick concerns / fail-closed
   refusals); repeated renders are byte-identical and the minimal
   record renders honest EMPTY panels (LAW 3). PROVEN:
   `headless.test.tsx` (11 tests).
10. **Walk the REAL browser journey with zero page errors** — the
    esbuild-bundled mount (NO Node-builtin externalization markers in
    its graph) served over loopback, opened in a real Chromium:
    MOUNT (the scene + all seven panels) → SELECT (an element click
    selects the canonical id) → GHOST (the distinct chips) → CAMERA
    (orbit → walk → fly) → LAYERS (the AND-semantics) → REFUSAL (an
    unknown-element selection fails closed IN the browser, no crash),
    ZERO `pageerror` events across the session. PROVEN:
    `browser-smoke.test.ts` (7 tests).

## CANNOT do at P4 (declared BLOCKED, with reasons and protocols)

**BLOCKED: the real Babylon GPU viewport.** The station route renders
the DETERMINISTIC PRESENTATION LAYER over the committed record (the
element roster with ghost-distinct status chips, the layer table, the
typed camera readout). The real 3D scene host — Babylon meshes, GPU
picking, camera controllers on the real scene graph — is the
**P5 multiplatform mount** (`spec/world-program.md`: P5 = the
feature-equivalent web/desktop/field-mobile journeys; the P0-A
scene-runtime port's real occupant). No real-substrate render number
exists in this item (see PERFORMANCE-OBSERVATIONS.md).
**Unblocking:** P5 mounts the real Babylon adapter behind the P0-A
scene-runtime port over the SAME station record discipline (the
record's element status index + camera state are the mount inputs;
the parity laws here are the floor the mount must hold).

**BLOCKED: the P1 real-substrate measurement protocol (re-bound to
P5).** `WORLD-P1/CAPABILITY-BOUNDARIES.md` records a measurement
protocol (Babylon NullEngine CPU-side costs; real GPU frame time /
draw calls at 10/100/1000-node fixtures; Cesium 3D Tiles streaming;
queries through the P4 UI against the same corpus). At P4 no real
Babylon/Cesium adapter exists anywhere in the repo (the P0-A
`babylon/` surface is contract + double only — verified), so the
protocol's real-substrate legs are NOT executable and NO number for
them is claimed here. What IS recorded at P4: the contract-level
floors (the station bind cost, the record regeneration cost, the
browser interaction costs of the deterministic mount — see
PERFORMANCE-OBSERVATIONS.md §3–§5). **Unblocking:** P5 executes the
P1 protocol verbatim against the real adapters, with the P4
contract-level numbers as the recorded floor (the contract core is
the floor, not the ceiling).

**BLOCKED: production HUD chrome / art direction.** The panels are
the typed contract + a deterministic minimal chrome (the honest state
+ the verbatim data summary). The game-feel art direction (spatial
audio, HUD animations, diegetic framing) is deliberately NOT claimed
— it composes over these contracts at P5 without touching them (the
panels are data; the chrome is presentation).

**BLOCKED: multi-input authoring AT the route.** The route exercises
the typed selection/camera/layer operations (the deterministic
interaction vocabulary). The full DM authoring surface (grab/move/
replace gestures against the real scene) composes the P3 lane
authoring contracts through the P5 mount — the P4 route proves the
command-reducer parity discipline the mount must hold (LAW 2).

**BLOCKED: live backend continuity.** The station record is committed
(data seeded by the composed lane fixtures, per the determinism law —
no network, no clock reads, no randomness). The live route over the
real backend (real project scopes, live problem updates) is a P5
wiring over the SAME `WorldStationSources` ports (the doubles prove
the ports are sufficient; the live occupant swaps at the seam).

## The honest boundary statement

P4 delivers the transformation's CONTRACTS (the HUD projection laws,
the station surface laws, the binding ports) and their deterministic
route proof (the one-record discipline + the parity laws + the real
browser journey over the deterministic mount). It does NOT claim a
rendered 3D viewport, a production game-feel chrome, or any
real-substrate performance number — those are the P5 mounts over
these contracts, and every claim this item does make is proven
in-repo by the recorded runs in TEST-TRANSCRIPT.md.
