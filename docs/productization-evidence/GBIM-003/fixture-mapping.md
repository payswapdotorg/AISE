# GBIM-003 — Fixture mapping (GBIM-000 → engine → scene)

**Work item:** GBIM-003 · **Fixture:** `docs/productization-evidence/GBIM-000/canonical-fixture.json` (consumed verbatim; sha-256 in `results/spike-results.json`)

## 1. The ten operations → engine mapping

Single source: `apps/spatial-studio-spike/src/server/workspace.ts` (`buildFixtureMapping`).
Parameters are normalized from the fixture's snake_case SI fields to the engine's kebab-case
typed parameters with explicit units, in the engine profile's required order
(`packages/solution-contract/src/capability.ts` L231–278).

| Fixture op | Engine type | Parameters | Outcome | Assumptions / gaps (all recorded in the mapping note) |
|---|---|---|---|---|
| op-001 create-wall (wall-001, t=0.2, room 8×6×3) | `block-wall-placement` | length 8 m, height 3 m, thickness 0.2 m, material concrete-block | APPLIED | length/height from room-001; material assumed (fixture states none) |
| op-002 create-opening (door 0.9×2.1, sill 0) | `opening-creation` | width 0.9 m, height 2.1 m, material door | APPLIED | sill_m 0 has NO Phase 1 parameter slot (gap); host relation to wall-001 documented in the note (no dependency edge — see gap G-2) |
| op-003 create-door (leaf in opening) | — | — | REFUSED `unsupported` (engine negotiation, exercised as a real intent) | no Phase 1 type for door-leaf placement — honest refusal |
| op-004 create-window (1.2×1.2, sill 0.9) | `opening-creation` | width 1.2 m, height 1.2 m, material window | APPLIED | sill_m 0.9 has NO Phase 1 parameter slot (gap) |
| op-005 create-column (0.3×0.3) | — | — | REFUSED `unsupported` | no Phase 1 structural-column type |
| op-006 create-footing (0.4×0.4×0.3) | `foundation-placement` | length 0.4 m, width 0.4 m, depth 0.3 m, material plain-concrete | APPLIED | fixture width/depth/height → length/width/depth; material assumed |
| op-007 create-slab (t=0.2) | `slab-placement` | length 8 m, width 6 m, thickness 0.2 m, material plain-concrete | APPLIED | plan dims from room-001; material assumed |
| op-008 create-beam (0.25×0.4) | — | — | REFUSED `unsupported` | no Phase 1 framing type |
| op-009 create-partition (t=0.15) | `block-wall-placement` | length 6 m, height 3 m, thickness 0.15 m, material aac-block | APPLIED | length/height from the room span; material assumed |
| op-010 revise-opening (window → 1.5×1.2) | revision path | width 1.5 m, height 1.2 m, material window | APPLIED via NEW VERSION | engine `reviseVersion` UNDOES the window op in v2 (append-only), then the revised opening applies through the same constructor — demonstrated live in the sandbox |

Coverage: **6 mapped + applied, 3 honest unsupported refusals, 1 revision-path** (check
`fixture-mapping-coverage`). The unsupported refusals are the REAL engine negotiation outcomes
(applyOperation with a genuine intent), not synthesized text.

## 2. Scene layout conventions (presentation-grade, deterministic)

`apps/spatial-studio-spike/src/scene/scene-model.ts` — room-001 is 8 m along X, 6 m along Z,
3 m tall, origin at room center, y=0 at slab top:

- slab-001: 8×0.2×6, top at y=0 · wall-001: south perimeter (z=+2.9) · door panel at x=−2,
  window panel at x=+1.5 (sill 0.9) · partition-001: across Z at x=0 · column-001: (3.5, −2.5)
  full height · footing-001: directly under the column (top at slab bottom — connected) ·
  beam-001: spans Z at x=−3.5 under the roof · roof-001: thin plane at y=3.05 · room-001:
  wireframe context box.
- Proposed-operation overlays: ghost meshes (dashed in plan) keyed by the ENGINE operation id
  (`op:<operationId>`); placement boxes derive from the staged draft (walls from the two drawn
  points + parameters; openings anchored to the wall; room-center fallback for slabs). Overlay
  placement is CLIENT presentation memory keyed by stable AISE operation ids — it never feeds
  back into canonical state.

These conventions are presentation choices of the spike (documented here), not fixture or
engine semantics.

## 3. AISE-side fixture invariants (the layer the Phase 1 engine does not model)

`validateFixtureInvariants` (same file) enforces the GBIM-000 §3 invariant set on the AISE side
and fails closed (the workspace refuses to build): duplicate fixture op ids (neg-005), finite
strictly-positive dimensions (neg-003), wall/partition thickness sanity vs the room
(neg-001), opening hosts must exist and fit (neg-002), a footing must have a declared supported
vertical element (neg-004). See `negative-tests.md` for the layered outcomes.

## 4. Recorded engine gaps found by this mapping

- **G-1 (engine)**: no wall-thickness limit in the Phase 1 profile (8.1 m accepted — neg-001);
  follow-up: capability-profile limits / Geometry Port validation.
- **G-2 (engine)**: opening-creation has no host-wall existence/void model (neg-002) and no
  sill parameter slot; follow-up: Geometry Port target resolution + parameter catalogue.
- **G-3 (engine)**: foundation-placement has no support-connectivity model (neg-004).
- **G-4 (engine)**: `reviseVersion` does not remap version-pinned dependency refs — a version
  whose kept operations carry cross-operation dependencies fails closed under revision (check
  `revision-dependency-gap`, DIVERGENT by design); the spike's mapping therefore documents host
  relations in mapping notes instead of dependency edges; follow-up: remap refs by operation
  index during the revision rebuild.
- **G-5 (fixture schema)**: no material vocabulary and no support-relation field in the fixture
  schema — spike assumptions are recorded per-op above.
