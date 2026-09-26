# GBIM-003 — Recommendation

**Work item:** GBIM-003 · **Fork gate:** charter §6 (four tests before any fork may even be proposed)

## Verdict: **ADAPT** (Three.js + web-ifc behind the AISE presentation boundary; no fork, no build-from-scratch)

## Why (evidence-based)

1. **The four fork tests fail for every candidate in this lane** — no required AISE capability
   is missing from the adapter path: selection, sectioning, measurement, inspection and
   synchronized views all shipped through public APIs of stock Three.js/web-ifc (MIT), behind a
   two-file renderer seam (`Scene3D.tsx`/`Plan2D.tsx`) that is replaceable without touching any
   canonical code. Nothing materially blocks product requirements; nothing needs isolating in a
   fork; no maintenance/licensing cost is justified.
2. **The architecture law held without strain** — keeping the renderer a pure presentation
   adapter required NO changes to canonical code: the whole spike lives outside the engine, the
   PROD-031 browser-cut law worked as designed, and the repo's own boundaries gate passes. This
   is strong evidence the existing provider boundary is sufficient for spatial UX.
3. **The Atelier patterns translate losslessly** — component library, project starter,
   click-to-place, live consequence HUD, 2D⇄3D sync, calm staged workflow and export entry
   points were all prototyped WITHOUT copying Atelier's hard-coded fire/cost/compliance
   semantics: every consequence displayed is an engine quantity with a cited formula. The
   pattern layer is UI-only; the semantics layer already exists in AISE.
4. **The direct⇄agent equivalence is structural and now demonstrated in the building domain** —
   the same operation identity from a hand-drawn wall and a 200 mm utterance, through the real
   compiler. The direct-manipulation lane can ship on the SAME submission path as the agent lane
   with zero new semantics.

## What to adopt into the product (successor work items)

1. **Spatial Studio work item** — port the sandbox into `apps/web` as a new presentation surface
   behind the existing `SolutionWorkspace` seams: mount the 3D/plan viewports alongside the SVG
   lane, wire the staging flow to `submitIntent` (`apps/web/src/solution/operations-core.ts`),
   reuse the accessible fallback pane pattern (`apps/web/src/solution/fallback/`).
2. **Renderer port** — formalize a provider-neutral render port on the HFX-303
   `visual-render` pattern (`packages/visual-render/src/port.ts`): `SceneElementSeed`-shaped
   projections + strict decode (the spike's `decodeSceneSeedPayload` is the seed of the
   fail-closed guard) + renderer-unavailable fallback contract.
3. **Geometry Port follow-ups surfaced by the spike** (owned with GBIM-001): wall-thickness
   limits in the capability profile (G-1); opening host-existence + sill parameter slot (G-2);
   footing support connectivity (G-3); dependency-ref remapping in `reviseVersion` (G-4);
   fixture schema material/support-relation fields (G-5).
4. **web-ifc import lane** (with GBIM-002): the browser parse lane is proven; the IFC GUID ↔
   AISE-id external-reference mapping convention should follow the spike's display rule (GUIDs
   never become AISE identity).

## What NOT to do

- Do NOT fork Three.js/web-ifc/Blender/Bonsai/FreeCAD for presentation convenience (charter §6
  explicitly prohibits this; nothing in the evidence justifies it).
- Do NOT move any quantity, validation or identity computation into the renderer — the spike's
  strongest result is that nothing needed to move.
- Do NOT adopt Atelier's hard-coded consequence semantics; the HUD's value is precisely that it
  renders engine output verbatim.

## Defer decisions

- Full IFC 3D visualization (rendering IFC geometry as meshes in-scene) — DEFERRED until
  GBIM-002's round-trip verdict; the parse lane is sufficient for the import/inspection UX.
- Open3D / reality-side reconstruction lanes — out of GBIM-003 scope (Layer-1 candidates).
