# GBIM-003 — SCORECARD

**Work item:** GBIM-003 (browser spatial UX + Atelier proof) · **Base:** `0bb8c87898ee59ceb5c37784078d7f6bcce82f10`
**Gate record over the common scorecard** (`docs/geometry-bim-spike-scorecard-2026-09-25.md`) — not a ranking. Machine-readable copy: `results/spike-results.json`.

| Dimension | Verdict | Evidence line |
|---|---|---|
| Canonical semantics | **PROVEN** | the sandbox holds zero local operation semantics: every op is an `EngineeringOperationIntent` through the contract's ONE constructor `createOperationIntent` (`packages/solution-contract/src/intent.ts` L174); every quantity/validation/identity is an engine output rendered verbatim; the fixture mapping is AISE-owned (`apps/spatial-studio-spike/src/server/workspace.ts`); no provider/renderer type crosses the canonical contract |
| Exact geometry | **PARTIAL** | the browser lane is PRESENTATION-grade by design (parametric boxes from the pinned fixture); exact solids are GBIM-001's lane — recorded explicitly: no BRep authority exists in the renderer and none is needed for presentation |
| Quantities | **PROVEN** | all displayed quantities (HUD, inspector, BOQ) are engine outputs (`applyOperation` quantities with cited `calculationRef`+`formula`, `deriveSolutionBoq`); sanity: op-001 wall-volume 4.8 m³ = 8×3×0.2; the renderer adds no quantity of its own |
| Validation | **PROVEN** | neg-003 (negative dimension) and neg-006 (unsupported op) fail closed IN THE ENGINE (live in-browser too); neg-001/002/004 are layered: engine gaps recorded honestly + the AISE-side fixture invariant layer fails closed; no fabricated approval anywhere (the compiler also refuses authority claims: `unsafe-refusal / approval-authority-claim`) |
| Provenance | **PROVEN** | fixture sha-256 recorded; Three.js 0.186.1 / web-ifc 0.0.78 versions recorded; deterministic demo clock documented; every applied op carries full intent provenance; reproduction commands in `provenance.md` |
| IFC/BIM | **PARTIAL** | web-ifc (That Open) parses the spike-authored IFC4 projection of the fixture in-browser (11 entities; GlobalIds shown as EXTERNAL refs mapped to AISE ids); full import/export round-trip is GBIM-002's lane — mapping is explicit, losses (no engine types for door leaf/column/beam) visible in the mapping table |
| Rendering | **PROVEN** | presentation-only: check `renderer-non-interference` (mutating every presentation box leaves the canonical projection byte-identical; serialized ops/states contain no renderer tokens); selection/section/measure never POSTed; Three.js uuids displayed as external refs; 2D+3D+synchronized state verified in-browser |
| Direct/NL equivalence | **PROVEN** | live proof: the direct 8×3×0.2 m wall intent and the REAL compiler's intent for "…8 m long, 3 m high and 200 mm thick…" (mm→m canonicalized) derive the IDENTICAL operation id `cb0ba7c4…` (same version context); recorded in `results/agent-trace.json`, re-derived by check `direct-nl-equivalence`, live banner in the sandbox (screenshot 05); structural law cited (identity.ts excludes provenance; PROD-021 fixture pair) |
| Negative/discrimination | **PROVEN** | all 7 GBIM-000 negative cases exercised with the catching layer named (engine / AISE fixture validator / presentation guard); every engineered divergence caught or explicitly recorded as an engine gap — none silently passed |
| Historical replay | **PROVEN** | the renderer-free JSON projection (operation ids, typed parameters, state digests) fully interprets the record; the accessible fallback pane renders it live with the renderer removed (screenshot 09); canonical records contain zero renderer-specific fields (checked); workspace rebuilds are byte-identical (determinism check) |
| Licensing/use | **PROVEN** | Three.js MIT (threejs.org), web-ifc MIT (github.com/ThatOpen/engine_web-ifc), React MIT — permissive, recorded before adoption per the charter anchors; no copyleft obligation reaches AISE code through the presentation lane |
| Performance | **PROVEN** | deterministic benchmarks recorded in `provenance.md` (workspace build <1 s; 16 checks ≈1 s; interactive 3D at 11 meshes single-rAF; web-ifc parse 1–2 s one-time); tradeoffs (global clip plane, no per-object sections) documented in `adapter-notes.md` §7, not hidden |
| Maintainability | **PROVEN** | the renderer seam is two viewport components behind shared `SceneElementSeed` DTOs; the engine is reached only through AISE package sources; the spike passes the repo's own boundaries gate (1048 files, 0 violations), repo eslint law, and strict tsc under the repo base config; swapping Three.js touches only `Scene3D.tsx` |

## Verdict vocabulary use

- **DIVERGENT (recorded, not a gate failure):** check `revision-dependency-gap` — the engine's
  `reviseVersion` cannot remap version-pinned dependency refs (a dependent version fails closed
  under revision). Recorded as engine follow-up G-4 with a live demonstration; the spike's
  mapping avoids dependency edges for this reason.
- **PARTIAL:** Exact geometry (presentation-grade by design — exact solids are GBIM-001's lane)
  and IFC/BIM (parse lane proven; round-trip is GBIM-002's lane).

## Fork-gate answer (charter §6)

No fork of any external project is proposed or justified — see `recommendation.md` (verdict:
ADAPT).
