# GBIM-003 — Adapter notes: the browser presentation layer

**Work item:** GBIM-003 · **Acceptance mapped:** renderer is a pure presentation adapter; scene selection never mutates canonical reality; visual effects cannot change quantities or validation; browser fallback remains available.

## 1. What was built

A Spatial Studio sandbox (`apps/spatial-studio-spike/`) that renders the GBIM-000 canonical
fixture (sha-256 recorded in `results/spike-results.json`) in:

- **3D** — Three.js 0.186.1, eleven parametric meshes (room context, wall with door/window
  opening panels, partition, column, footing, slab, beam, roof plane) + ghost overlays for
  engine-proposed operations; custom orbit camera; global clipping-plane section; raycast
  selection with emissive/outline highlighting; two-click surface measurement; ground-plane
  click-to-place.
- **2D plan** — deterministic SVG (the AISE svg-viewer idiom): hatched wall with door swing and
  window symbols, dashed below-ground/above-slab elements, dimension annotations, synchronized
  azimuth indicator and section readout; every element carries `data-aise-id` (the stable AISE
  join key).

Both views are driven by ONE scene model (`src/scene/scene-model.ts`) derived deterministically
from the workspace projection; both select through the SAME stable AISE references.

## 2. The presentation-adapter architecture (the law, implemented)

```
┌──────────────────────────── browser (presentation only) ───────────────────────────┐
│ SandboxApp state: workspace (engine projection) · viewState (azimuth/elevation/    │
│ section/selection/hover — NEVER POSTed) · staging draft · overlay placement memory │
│   Scene3D (Three.js) / Plan2D (SVG) / FallbackPane (text) / panes                  │
│   intents built ONLY via createOperationIntent (@aise/solution-contract/browser)   │
└───────────────┬────────────────────────────────────────────────────────────────────┘
                │ POST intent JSON (the only canonical-boundary traffic)
┌───────────────▼──────────── server (AISE side) ────────────────────────────────────┐
│ src/server/workspace.ts: decode → applyOperation → validateSolutionVersion →        │
│ deriveSolutionBoq → projectWorkspace → the browser renders verbatim                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

- **No path exists from a renderer callback to canonical state** except the typed
  intent → engine pipeline. Selection, hover, camera, section, measurement and placement are
  presentation state only — they are never sent to the server (proven by check
  `renderer-non-interference`: mutating every presentation box leaves the canonical projection
  byte-identical, and the serialized operations/states contain no renderer field tokens).
- **Renderer object ids are external references**: the inspector displays the live Three.js
  mesh uuid beside the AISE reference, labelled "external reference — NOT AISE identity"
  (screenshot `screenshots/02-studio-3d-viewport.png`, verified in-browser).
- **The engine executes server-side; the browser renders verbatim** — the PROD-031 law. The
  client imports the crypto-free cut `@aise/solution-contract/browser`; identity derivation
  happens server-side (`/api/spike/identity`).
- **Visual effects cannot change quantities or validation**: the clipping plane, highlights and
  overlays are renderer-local state; the consequence HUD, inspector quantities and BOQ are
  engine outputs. Measurement is explicitly labelled "renderer presentation only — not a
  quantity".

## 3. Interaction capabilities evaluation (work-order list)

| Capability | Verdict | Where / evidence |
|---|---|---|
| Selection | PROVEN | raycast click in 3D; element click in 2D; shared `selectedAiseId`; operation/BOQ-line clicks resolve to the same references (screenshots 02/03) |
| Sectioning | PROVEN | global clipping plane with height slider (0–3 m); purely visual — check `renderer-non-interference` (screenshot 10) |
| Measurement | PROVEN | two-click surface raycast → 3D distance with presentation-only label (screenshot 10) |
| Object inspection | PROVEN | inspector: AISE reference, source layer, engine operation id, state layer, engine quantities with cited formulas, limits, provenance, external renderer uuid |
| Synchronized view state | PROVEN | selection bidirectionally shared 3D⇄2D⇄BOQ⇄operations; azimuth indicator + section readout mirrored in the plan; camera sliders ↔ 3D drag |
| IFC visualization | PROVEN (parse lane) | web-ifc 0.0.78 (That Open) wasm parses the fixture IFC4 in-browser; Ifc GlobalIds shown as external refs mapped to AISE ids (screenshot 07) |

## 4. Renderer comparison

| Lane | Role | Assessment |
|---|---|---|
| Three.js 0.186.1 (WebGL) | spatial presentation | fits AISE's needs: small API surface at the seam (one component), no authority leakage, MIT license, replaceable behind `SceneElementSeed` DTOs |
| Deterministic SVG plan | 2D companion | the AISE idiom (apps/web viewers) retained — zero-dependency, printable, accessible; shares the same seeds and references |
| web-ifc 0.0.78 (That Open) | IFC interop parse | works in-browser (11 entities parsed from the fixture projection); useful for import/inspection UX; NOT a geometry or semantics authority (GBIM-002's lane owns round-trip) |

No fork of any external project is proposed or needed for presentation (charter §6 gate — see
`recommendation.md`).

## 5. Renderer-unavailable fallback (acceptance)

- A header switch ("simulate renderer unavailable") and an automatic path (Three.js import or
  WebGL failure → `onRendererUnavailable`) both mount the **Accessible fallback pane**: the full
  canonical record as text tables — solution/version/validation, every operation with its engine
  outcome and quantities, the BOQ text projection, and the scene-element list — plus the complete
  staging/apply flow through the same component forms (no geometry required).
- Demonstrated in-browser (canvas removed, text projection rendered — screenshot
  `screenshots/09-fallback.png`; toggle verified twice). This is also the historical-replay
  demonstration: the record is fully interpretable with the renderer removed (check
  `historical-replay`).

## 6. Atelier-inspired patterns → AISE mapping (no copied semantics)

| Atelier pattern | Where | AISE-lawful translation |
|---|---|---|
| Component library | `LibraryPane` + `COMPONENT_LIBRARY` | parameter fields come from the ENGINE capability profile's required parameters (or fixture defaults for engine-ungapped fixture kinds); ⚠-marked kinds negotiate honestly (create-column → engine `unsupported`) |
| Template / project starter | `Reset to fixture template` + the workspace bootstrap | the pinned GBIM-000 fixture replayed through the engine (sha-256 recorded) — the starter IS a canonical solution version |
| Click-to-place | plan/3D ground clicks → prefilled parameters (wall length from drawn distance) | placement is interaction provenance; the intent's parameters are explicit and never invented |
| Live consequence HUD | `ConsequenceHud` | consequences are the ENGINE's dry-run `applyOperation` quantities with cited formulas + limits + negotiation — NO hard-coded cost/fire/compliance semantics (Atelier's hard-coded semantics deliberately NOT copied) |
| 2D-to-3D synchronization | shared viewState + shared seeds | one scene model, one selection state, stable AISE references across views |
| Calm staged workflow | stage → engine preview → review → apply → recorded | nothing is recorded until Apply; refusals show fail-closed reasons |
| Export / report entry points | BOQ pane Export CSV / JSON | export is a projection of the engine-derived BOQ (never recomputed quantities) |

## 7. Honest limitations

- The 3D meshes are **presentation-grade parametric boxes** derived from fixture dimensions —
  not exact BRep solids (GBIM-001's lane); no hidden-line removal, no photorealism.
- Sectioning clips whole objects (one global plane), not per-object section views with cut
  hatching.
- Measurement is point-to-point Euclidean distance on raycast hits; no snapping, no dimension
  chains.
- web-ifc geometry is parsed and listed (entities + GUID mapping) but not rendered as meshes in
  the 3D scene (the lane proves parse/interop, not full IFC 3D visualization).
- The overlay placement memory for proposed operations is client-side presentation state keyed
  by the stable operation id (rebuilt deterministically on reset; documented in
  `fixture-mapping.md`).
