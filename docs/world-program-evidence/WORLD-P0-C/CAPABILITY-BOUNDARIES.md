# WORLD-P0-C — capability boundaries per substrate (the Solution lane)

What each substrate CAN and CANNOT do FOR THE SOLUTION LANE
(SYNCHRO-4D/Revit/Navisworks-parity interactive authoring, precise
geometry, world-internal validation, consequences, BOQ coupling,
what-if, execution simulation, replay) — recorded BEFORE any adoption,
with the explicit non-goals and what deliberately stays behind the
adapter. The binding law throughout: every substrate is implementation
technology behind a typed port; it is never an AISE authority, its ids
never become canonical identity, and the canonical Solution Graph stays
the only solution authority.

## FreeCAD (the parametric CAD reference, `cad.parametric/1`)

**CAN (observed in-sandbox, FreeCAD 1.0.0 headless FreeCADCmd — see
PERFORMANCE-OBSERVATIONS.md):**
- headless deterministic parametric modeling: documents, sketch
  geometry + constraints, PartDesign features, typed parameters with
  units, recompute;
- parametric rebuild that tracks parameters exactly (Length 3→4 moved
  the pad volume 15.0→20.0 and the bound box z-extent 3→4);
- document/object NAMES (the `freecad-document`/`freecad-object`
  external-label carriers — observed: `AISEProbe`,
  `Sketch_lintel_profile`, `Pad_feature_001`);
- exact solid topology (the 5×1×4 pad: 8 vertices / 12 edges / 6
  faces);
- tessellated mesh export (Mesh/STL lane verified).
- ifcopenshell 0.7.0 is importable INSIDE the AppImage bundle (an
  adapter could co-locate IFC handling with the CAD sidecar).

**CANNOT (observed or structural — stays behind the adapter):**
- IFC export through `Import.export` silently produced NO file for
  bare PartDesign/Part::Box/Arch objects in the headless probe (no
  exception, no output; 0.3–15.1 ms return) — the real-adapter IFC
  lane needs BIM-context objects or direct IfcOpenShell API usage
  (recorded as a measured finding, protocol handed to WORLD-P3);
- no core glTF exporter in headless FreeCAD 1.0.0 (probe negative) —
  the glTF delivery lane stays the P0-A delivery port's (tessellation
  via Mesh/STL/OBJ + conversion, or the geometry-kernel lane);
- FreeCAD's native length unit is mm (`Unit: mm … [Length]` observed)
  — the adapter must map quantities to the AISE-side DECLARED units;
  units discipline stays with the contract;
- no browser execution (native toolchain) — hence the sidecar model.

**NON-GOALS (behind the adapter by design):** no FreeCAD GUI dependency
(the FreeCADCmd scripting surface is the reference, not the workbench);
no FreeCAD document becomes the parametric authority (the AISE-side
typed model + content digests are; FreeCAD rebuilds are reproducible
projections); no FreeCAD object name becomes canonical identity
(namespaced external labels only); no BREP kernel is embedded in AISE
code (process isolation).

## Babylon.js scene runtime (via the P0-A port, `solution.scene-usage/1`)

**CAN (contract-level, composed through the P0-A port):** host the
solution world's scene graph ingest, ghost/proposed-state overlays,
picking with AISE element ids, layer visibility, sectioning, camera
walk/orbit/fly, measurement surfacing — all through
`BabylonSceneRuntimeAdapter` semantics with the ghost-distinctness law
enforced end-to-end by the usage contract.

**CANNOT / NON-GOALS:** GPU rendering behavior is BLOCKED in P0 (the
usage double renders nothing; WORLD-P3 owns the game-loop measurement
lane); the runtime never becomes the state authority (the ComposedScene
is a presentation projection; the governed changes API stays the only
production path); Babylon mesh ids never become canonical identity (the
pick identity guard refuses unknown ids at the last hop).

## OpenUSD composition (via the P0-A port, `solution.scene-usage/1`)

**CAN (contract-level):** what-if variant composition with explicit
AISE-side variant selection, payload laziness declarations, opinion
provenance — as AISE scene-composition types.

**CANNOT / NON-GOALS:** USD is interchange/composition substrate,
never authority (directive §10) — USD paths bind through
`pathBindings` and an unbound path is a refusal (identity is never
invented); no USD runtime is integrated in P0; no what-if variant
presents as captured reality (the what-if ghost discipline refuses
non-ghost variant targets).

## glTF/GLB delivery (via the P0-A port)

**CAN:** validated runtime delivery of solution assets (the real
fail-closed parser validates CAD exports — proven by the cross-family
round-trip test).

**CANNOT / NON-GOALS:** part labels are asset-scoped `gltf-part`
external labels, never canonical identity; the CAD double's GLB
container emission is honestly refused (declared limit) — GLB is a
real-adapter duty.

## OCCT exact geometry (via the P0-B port, `cad.parametric/1` delegation)

**CAN:** the closed-form measurement/predicate vocabulary
(distance/length/area/volume/containment) with tolerance-DECLARED
comparisons — the CAD contract's `exactGeometryRequest` emits P0-B
requests and the consumer runs them through the exact-geometry port
(proven by the delegation round-trip test: the derived pad box volume
computed 20 through the P0-B reference double).

**CANNOT / NON-GOALS:** the CAD adapter NEVER computes authoritative
predicates itself (delegation law); near-boundary verdicts answer
`within-tolerance` — the tolerance decision stays with the consumer;
no OCCT topology name becomes canonical identity (`occt-topology`
labels in the P0-B vocabulary).

## IfcOpenShell IFC interpretation (via the P0-B port, CAD IFC export lane)

**CAN:** the CAD IFC export emits STEP text in the interpretation
vocabulary and the P0-B port reads it back (round-trip proven:
4-level spatial tree, IFCWALL elements, base quantities, containment).

**CANNOT / NON-GOALS:** IFC GUIDs stay `ifc-guid` external labels
(P0-B law, carried through); IFC is never the Solution Graph's
storage format — it is an interchange lane only.

## Execution-simulation substrate (`simulation.execution/1`)

**CAN (the P0 transform set, proven by the doubles):** deterministic
activity sequencing from the canonical `completion-before` edges,
time-anchored world states tied to the canonical proposed-state layer
chain (activity k completing ⇔ operation k applied ⇔ state layer
baseline+k), simulated-progress capture entering the Outcome lane as
PROPOSED with simulation provenance.

**CANNOT / NON-GOALS (declared BLOCKED capabilities):** resource
leveling, working-hours calendars, discrete-event uncertainty,
cost-time trade-off optimization — none of these exist in the P0
contract (a future occupant may add them behind the same port);
**the simulation substrate NEVER replaces the deterministic solution
engine as authority** (directive §10): the port exposes no write-back
(structurally — closed method surface), simulated progress is never
CONFIRMED (structural PROPOSED), and the substrate never invents
durations (declared-duration law, fail-closed).

## Desktop shell — Tauri AND the existing Electron thin shell (`desktop.shell/1`)

**CAN (contract-level):** shell lifecycle, window/view state with the
substrate-neutral world camera, typed sidecar spawn/query/teardown for
the heavy substrates, shutdown with the no-orphans report — proven
implementable by BOTH candidates through the two in-repo doubles.

**CANNOT / NON-GOALS (both candidates):** the shell is a thin host —
presentation and platform interaction ONLY, never canonical engineering
state (the closed method surface has no engineering operation; drilled
by the structural thin-shell tests); real process management, native
window systems, webview fidelity and OS integration are BLOCKED in the
doubles (honestly declared) — they are real-shell measurement lanes
(per the decision record, the sandbox cannot measure them).

## The substitution doubles themselves (what they are NOT)

The doubles are in-memory CONTRACT proofs, not performance claims: they
prove every interface is implementable with ZERO substrate. No number
measured on a double says anything about a real substrate's performance
— the real measurements live in PERFORMANCE-OBSERVATIONS.md and are
labeled per-method.
