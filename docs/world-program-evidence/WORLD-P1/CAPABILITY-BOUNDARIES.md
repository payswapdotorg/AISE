# WORLD-P1 — Capability Boundaries

**Item:** WORLD-P1 (Layer 1 OpenSpace parity — the experience lane)
**Base:** `82f31d6`

What the Layer-1 experience lane CAN and CANNOT do at P1, and what
must stay behind the ports even when convenient. The typed contracts
in `packages/world-layer1-experience` enforce these boundaries
structurally (pure validators + substitution doubles + fail-closed
drills); nothing here is enforced "by convention".

---

## CAPTURE → SPATIALIZE (`layer1.capture.spatialize`)

**CAN:**
- Consume the existing capture seam (`CaptureSessionEnvelope`) VERBATIM
  and project a capture session into a `SpatializedWorldFragment`:
  per-asset evidence bindings, device-DECLARED poses (site frame,
  metres), device-declared capture volumes, and the derived spatial
  coverage (union of declared volumes, with bases and limitations).
- Partition assets honestly: spatializable media types (image/jpeg,
  image/png, video/mp4 — the closed P1 vocabulary) become fragment
  assets; everything else (voice notes, documents) is OMITTED with a
  typed visible reason — evidence, but not spatial input.
- Fail closed: non-64-hex content ids, duplicate content ids, empty
  sessions, non-ISO declared instants, substrate-shaped session ids —
  all typed refusals (HFX-000 `contract-mismatch`).

**CANNOT (explicit non-goals at P1):**
- RECONSTRUCT geometry from imagery. Spatialization places the
  device-DECLARED pose/volume; it never infers 3D structure (a
  reconstruction engine is a future port occupant; its outputs enter
  as declared data through the same types).
- Fabricate coverage. No declared volume → no coverage contribution
  (a recorded limitation, never a guessed bound). No declared pose →
  the asset is carried UNPLACED (never placed at an origin or
  interpolated).
- Widen the media-type vocabulary on its own (a contract bump).

**Stays behind the port:** the acquisition-metadata open-map keys
this lane recognizes (`layer1.pose.*`, `layer1.volume.*` — ADDING
consumer-recognized keys without modifying the frozen
shared-contracts key table); the pose-declaring device's own quality
judgement (garbage poses omit the asset; the lane never "fixes" them).

## REGISTER (`layer1.capture.register`)

**CAN:**
- Bind a fragment to the site's geospatial context through the P0-A
  vocabulary (`SiteGeoreference`, `GeodeticPosition`), consuming
  `AnchoringHypothesis` inputs VERBATIM and answering with the
  anchoring outcome vocabulary (`anchored` | `partial` | `refused`).
- Enforce the echo law (hypotheses naming foreign evidence are
  per-hypothesis refusals), the minimal hypothesis-quality laws
  (positive inliers; the uncertainty budget law `budget95M ≥
  floorRmsM`), and the insufficient-evidence fail-closed (< 2
  admissible → the whole registration refuses, ZERO fabricated
  georeferences — the ANCHOR-003b discipline).
- Move the fragment's registration state forward: `unregistered` →
  `site-registered` / `partially-registered` / `registration-refused`
  (the closed state vocabulary).

**CANNOT:**
- Redefine anchoring. The anchoring-contract package owns the
  hypothesis/outcome vocabulary; this lane CONSUMES it (imports the
  types, echoes the outcomes) and adds only the pre-registration
  state and the fragment-binding semantics.
- Anchor real photosets. ANCHOR-003b's frontier result stands:
  automatic images→plans anchoring is evaluation-kept, NOT promoted.
  P1's registration consumes DECLARED hypotheses (from whatever
  provider the anchoring seam admits) — it does not produce them.
- Re-register a registered fragment (the stage machine refuses; a
  fresh spatialization is required).

## RECONSTRUCT (`layer1.world.compose`)

**CAN:**
- Compose registered fragments + an optional plan/model side (the
  P0-B IFC-interpretation vocabulary in: elements with AISE stable
  ids, IFC GUIDs as NAMESPACED EXTERNAL LABELS, declared comparable
  geometry) into a `NavigableWorld`: the P0-A `ComposedScene` value +
  per-element provenance + the coverage summary + the georeference.
- Enforce the registration gate (only site-registered /
  partially-registered fragments enter), the one-frame-per-world law,
  the identity quarantine (substrate-shaped plan element ids are
  typed refusals naming the pattern), duplicate-id refusal, and the
  structural validity of the composed scene (the P0-A
  `validateScene`).
- Keep identity stable across revisions: `worldId` digests the
  world's IDENTITY INPUTS (frame + fragment ids + plan-model id +
  georeference), not the per-revision content — what-changed (and
  every cross-revision query) depends on this.

**CANNOT:**
- Own engineering truth. The world is a PRESENTATION/INTERACTION
  projection of canonical state; composing it never mutates the
  Reality Graph (the P0-A authority law, carried through).
- Compose ghosts. The Layer-1 world carries `ghostSummary: null` and
  every composed node is `isGhost: false` (the ghost-distinctness
  law, structural): captured reality and plan model are NEVER
  proposed states; the ghost overlay belongs to the Layer-3 solution
  preview and enters through its own typed path in WORLD-P3/P4.
- Place unplaced assets (spatial honesty: only PLACED assets become
  scene nodes; unplaced assets stay non-spatial evidence in the
  fragment, carried in the coverage limitations).

## NAVIGATE (`layer1.world.layer-toggles` / `.bookmark-*`)

**CAN:**
- Resolve layer toggling as a TYPED VISIBILITY PREDICATE: the
  effective layer map (visibleByDefault, then toggles in order,
  last-wins) and the per-element resolution (a node is visible iff
  EVERY layer it belongs to is visible — the P0-A runtime law, typed
  as pure data). Unknown layer ids refuse (fail-closed).
- Capture/resolve navigation bookmarks as TYPED WORLD STATES:
  camera + layer visibility + section plane + selection, bound to
  the world revision, content-addressed (`bookmarkId` = the digest of
  the state), with the digest round-trip law and the
  revision-checked resolution (a stale bookmark REFUSES — never
  silently applied).

**CANNOT:**
- Render anything. Navigation is typed state resolution; a scene
  runtime (Babylon today, any substitute tomorrow) ingests the world
  behind the P0-A `BabylonSceneRuntimeAdapter` port. GPU behavior is
  BLOCKED (below).
- Apply a bookmark across revisions or across worlds (both are typed
  `operation-semantic-failure` refusals).

## COMPARE (`layer1.compare.compare`)

**CAN:**
- Compare model-vs-capture through DECLARED aligned pairs (the
  pairing is declared data at P1 — the app/author declares which
  model element pairs with which capture element; an automatic
  alignment engine is a future port occupant whose output enters
  through the same type).
- Classify differences with the closed vocabulary: `missing-in-
  capture`, `missing-in-model`, `deviation-detected`,
  `within-tolerance`, `unverifiable` — with per-classification counts
  in the closed order.
- Carry the DECLARED tolerance VERBATIM into every verdict, the
  DECLARED near-boundary band (`nearBoundaryBand` — the band is a
  declaration, never an implicit fraction of the tolerance), and the
  deviation value (the P1 proxy: the Euclidean distance between the
  declared shapes' centroids — exact for integer fixture geometry).

**CANNOT:**
- Compare without a declared tolerance/units/band (all three are
  typed `operation-semantic-failure` refusals — tolerances are
  declared, never implicit).
- Surface-to-surface or distributional deviation (the centroid proxy
  is the declared P1 semantics; a richer deviation model is a future
  port occupant entering through the same verdict type).
- Fabricate a verdict for undeclared geometry: a pair without a
  well-formed shape on both sides refuses (and `unverifiable` exists
  in the vocabulary precisely because an honest comparison can lack
  geometry, which is NOT a deviation and NOT a match).
- Pair one element twice (ambiguity refuses).

## MEASURE (`layer1.compare.measure`)

**CAN:**
- Run point / line / area / volume / containment queries over a
  DECLARED world state, with DECLARED tolerances and units (the P0-B
  vocabulary, delegated to), computing closed-form exact values
  (fixture coordinates chosen for IEEE-754 exactness — the
  substitution-double byte-identity discipline).
- Answer containment with the P0-B near-boundary discipline: a point
  inside the declared linear tolerance band of the region boundary
  answers `within-tolerance` — never a silent boolean; the boundary
  distance rides as the consumer's evidence.
- Bind every measurement to the measured elements' evidence chains
  as an INFERRED candidate (`epistemicStatus: "INFERRED"`, method
  `world.measurement`) — measurements taken in the world are
  evidence candidates, never authoritative measurements.

**CANNOT:**
- Measure without a declared tolerance/units (refused — the P0-B
  `tolerance-must-be-declared` discipline, delegated to).
- Measure unknown elements, inverted boxes, 2-vertex polygons, or
  duplicate query ids (all typed refusals; one bad query refuses the
  whole batch — never a partially-computed set).
- Compute on OCCT. The kernels are closed-form analytic (the P0-B
  reference-double semantics); an OCCT/OCP adapter is a future port
  occupant that must agree with these pinned semantics.

## EVIDENCE (`layer1.evidence.*`)

**CAN:**
- Bind every lane output to the Evidence Envelope through the EXISTING
  shared-contracts seam types (`Derivation` + `ProvenanceLink`):
  fragment bindings (one DERIVED_FROM link per session asset),
  world bindings (per-element links over the evidence-backed
  elements), comparison bindings (the union of the paired elements'
  chains), measurement bindings (the declared-instant derivation).
- Answer "what is actually here?" with the honest closed vocabulary:
  `element-bound` (capture elements' declared volumes contain the
  point, with their provenance chains), `coverage-only`, 
  `not-covered`, `unverifiable` — NONE of which imply absence.
- Answer "what changed?" between two revisions of ONE world with the
  closed change kinds (`added`/`removed`/`moved`/
  `evidence-changed`/`unchanged`), every record carrying both sides'
  evidence chains.

**CANNOT:**
- Promote epistemic status. Capture-derived facts enter as INFERRED;
  promotion is the Reality Graph's (the lane law, structural:
  `epistemicStatus: "INFERRED"` on every binding and answer).
- Fabricate a chain: binding a world/comparison/measurement without
  real evidence content ids refuses with a typed `retrieval-failure`;
  a comparison verdict element without provenance refuses.
- Answer from plan elements' shapes as capture claims (only
  capture-origin provenance records carry declared volumes; the
  derived coverage marker is not an element claim).
- Diff across worlds or backwards (both typed refusals).

## Cross-cutting laws (every family)

- **Identity quarantine (directive §10):** substrate-shaped ids
  (ifc-guid, usd prim paths, glTF refs, Assimp names, Cesium entity
  ids — the recognized pattern set) in ANY canonical identity field
  are typed refusals naming the pattern. IFC GUIDs ride as namespaced
  external labels; capture element ids are AISE content digests.
- **Ghost distinctness (P0-A law):** carried through every contract
  (no capture/plan node is ever a ghost; Layer-1 worlds carry no
  ghost summary).
- **Determinism:** no network, no clock reads, no randomness, no I/O
  in the contract core (behaviorally proven by byte-identical
  repeated invocation; source-level proven by the lexical tripwire
  test). Every instant is a declared input.
- **Honest failure vocabulary:** every refusal carries a kind from
  the CLOSED HFX-000 set (`@aise/provider-registry`, imported never
  modified) + the port + the honest detail + the subject id. The
  mapping is documented in `src/failures.ts`: `contract-mismatch`
  (shape), `unsupported-data` (outside declared support),
  `operation-semantic-failure` (semantically ill-typed: tolerance-less
  requests, cross-revision applications, ghost violations),
  `retrieval-failure` (evidence queries without provenance).
  `perception-failure`/`reasoning-failure` are RESERVED for future
  reconstruction-engine occupants (a real engine that misreads its
  inputs); the P1 in-memory doubles never emit them;
  `resource-exhaustion`/`timeout` are not emitted at contract level
  (no compute/latency budgets here); `license-blocked` is not emitted
  (no substrate is integrated at P1 — the license matrices live in
  the P0 evidence sets).

---

## LARGE-MODEL PERFORMANCE — **BLOCKED** (declared, with the WORLD-P4 protocol)

**BLOCKED: real-substrate large-model performance measurement.** No
number for the following exists anywhere in this delivery, because
P1 (per the world program) defines contracts and proves the lane with
in-memory doubles — no Babylon, no Cesium, no real capture corpus,
no GPU is integrated:

- render-loop frame time / draw-call cost at any scene size;
- GPU pick latency (vs the contract-level `what-is-here` costs
  measured in PERFORMANCE-OBSERVATIONS.md);
- Babylon NullEngine CPU-side scene-graph ingest cost (the P0-A
  recorded protocol);
- Cesium 3D Tiles streaming cost for real photogrammetry tilesets;
- reconstruction-engine throughput on REAL photosets (the ANCHOR-003b
  corpus is evaluation-kept; no promoted engine exists to measure);
- mobile-device (Android field adapter) performance of any stage.

**The WORLD-P4 measurement protocol (recorded for execution):**

1. Run the real Babylon adapter (WORLD-P4's occupant of the P0-A
   scene-runtime port) on this lane's generated scene corpus
   (10/100/1000-node fixtures from `measure.ts`) headless via
   Babylon NullEngine for CPU-side costs (ingest, layer toggling,
   camera application); then on a real GPU for frame time and
   draw-call counts — median and p95 over 25 runs per fixture, the
   same table shape as PERFORMANCE-OBSERVATIONS.md §1.
2. Run the Cesium geospatial adapter on a real 3D Tiles corpus
   (photogrammetry tilesets at campus scale) for streaming/register
   costs, recording the georeference tolerance round-trip against
   the P0-A declared tolerance.
3. Run the what-is-here / what-changed / measure queries through the
   P4 UI against the same corpus and compare with the contract-level
   numbers recorded here (the contract core is the floor, not the
   ceiling).
4. Record GPU vendor/driver alongside every number (substitution law
   2: hardware-declared, never averaged across vendors).
5. Zero fabricated numbers: any measurement that cannot run stays
   declared BLOCKED with the exact blocker.

## Other declared boundaries

- **Mobile-to-web continuity (directive P1 scope item):** the LANE
  CONTRACTS are platform-neutral typed values (the same fragment/
  world/bookmark/evidence types on web, desktop, mobile — the
  cross-platform identity law), but the CONTINUITY UX (capture on
  mobile → open on web at the same world state) is WORLD-P4/P5
  wiring over these contracts — not executable at P1 (no app surface
  exists in this package, by design).
- **Plan/field context (directive P1 scope item):** the plan side is
  present at contract level (plan elements through the P0-B IFC
  vocabulary, layer toggling between `capture-reality` and
  `plan-model`, model-vs-capture comparison). Drawing-linked
  navigation (plan raster ↔ world positions) is not in this package:
  the plan-context seam belongs to the anchoring-contract family
  (ANCHOR-003a) and composes at P4.
- **Measurement instants:** the shared `Derivation` type requires a
  `createdAt` instant; measurement results carry tolerances/units
  but no instant (queries are instant-free by design), so the
  measurement ENVELOPE BINDING takes a declared `declaredAt`
  parameter (the caller stamps; the lane never reads a clock). This
  is a recorded composition decision, not a seam change.
