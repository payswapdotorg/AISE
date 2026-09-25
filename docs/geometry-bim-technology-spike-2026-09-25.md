# AISE — Geometry / BIM Technology Spike Charter
**Date:** 2026-09-25  
**Status:** ARCHITECT-AUTHORIZED EXPLORATORY PROGRAM  
**Relationship to production readiness:** post-production R&D; it must not weaken, replace, or reopen PROD-015.

## 1. Decision

AISE will not fork Blender, FreeCAD, Bonsai, Open CASCADE, or another external engineering platform at this stage.

The spike evaluates interchangeable technologies behind AISE's existing Layer-3 provider boundary:

- Exact geometry: Open CASCADE Technology (OCCT), with CadQuery/OCP and FreeCAD evaluated as consumers/tooling around the kernel.
- BIM/IFC interoperability: IfcOpenShell + IFC; Bonsai/Blender evaluated as a desktop authoring/inspection adapter.
- Browser spatial presentation: Three.js + That Open/web-ifc, evaluated as an enhancement/replacement for current browser scene presentation.
- Reality-side geometry inputs: Open3D and classical reconstruction remain Layer-1 candidates, not Layer-3 authorities.

The objective is to determine which combination gives AISE better deterministic geometry, BIM interoperability, browser interaction, desktop capability, and long-term replaceability without moving canonical authority out of AISE.

## 2. Non-negotiable architecture boundary

AISE DOMAIN CORE
  -> canonical EngineeringOperation
  -> Geometry Port
       -> OCCT
       -> CadQuery / FreeCAD
       -> future providers
  -> validated geometry
       -> IFC / IfcOpenShell
       -> browser renderer
       -> Bonsai / Blender desktop adapter
       -> Three.js / That Open browser adapter

Provider output is never the Reality Graph or Solution Graph authority.

Provider-specific IDs, topology objects, file formats, scene graphs, mesh handles, Blender data-blocks, FreeCAD object IDs, OCCT handles, IFC GUIDs and renderer object IDs are external references, not AISE semantic identity.

## 3. Shared spike fixture

All three workers consume one pinned canonical fixture:

- 8 m x 6 m x 3 m rectangular room.
- 200 mm wall.
- 900 x 2100 mm door opening.
- 1200 x 1200 mm window opening.
- 300 x 300 mm column.
- 200 mm slab.
- 400 x 400 x 300 mm footing.
- 250 x 400 mm beam.
- 150 mm partition wall.
- one roof plane.

Operations:

1. create-wall
2. create-opening
3. create-door
4. create-window
5. create-column
6. create-footing
7. create-slab
8. create-beam
9. create-partition
10. revise-opening

The canonical fixture must be stored in AISE-owned provider-neutral semantics before provider execution.

## 4. Required comparison points

Every worker must report, where supported:

- operation identity;
- units and normalized parameters;
- bounding box;
- surface area;
- solid volume;
- topology validity / manifold status;
- opening/wall relationships;
- quantity values used by AISE;
- validation status;
- failure / unsupported status;
- provider identity and version;
- configuration and input digest;
- reproducibility;
- performance/resource observations;
- license/use posture.

A visualization that looks similar is insufficient.

## 5. Acceptance model

Candidates are not selected because they look better.

Evidence must distinguish:

- exact semantic equality;
- declared numeric tolerances;
- provider divergence;
- unsupported capability;
- failure;
- rendering-only differences.

Mandatory negative/discrimination cases:

- impossible wall thickness;
- opening outside host wall;
- negative dimensions;
- disconnected footing;
- duplicate operation identity;
- unsupported operation;
- malformed provider response.

Historical AISE records must remain interpretable if a candidate is later removed.

## 6. Fork decision gate

### Blender
Do not fork.

A fork may be proposed only if evidence shows that: (1) a required AISE capability cannot be delivered by an adapter/add-on or existing API; (2) the limitation materially affects product requirements; (3) the capability cannot be isolated in AISE or another open component; and (4) fork maintenance/licensing cost is justified.

### Bonsai
A Bonsai-based desktop adapter may be evaluated. A fork is prohibited until the same four tests are satisfied.

### FreeCAD
Treat as a parametric/CAD worker or desktop integration option, not canonical AISE state.

### OpenSCAD
Treat as a scripted component-generation option, not the BIM/reality/solution authority.

## 7. Deliverables

The spike closes only when the repository contains:

- provider-neutral geometry-port proposal;
- canonical fixture and expected invariants;
- three independent provider/adapter spike reports;
- semantic-equivalence and negative-test results;
- IFC/BIM mapping evidence;
- browser visualization evidence;
- Atelier-derived UX findings mapped to AISE concepts;
- build-vs-adapt-vs-fork recommendation with explicit evidence;
- successor handoff naming next implementation work, or an explicit defer decision.

## 8. External research anchors

Use official project documentation/repositories as licensing/version sources during the spike:

- Blender: https://www.blender.org/
- Blender API: https://developer.blender.org/docs/
- Blender license: https://www.blender.org/about/license/
- Bonsai: https://bonsaibim.org/
- IfcOpenShell: https://ifcopenshell.org/
- Open CASCADE: https://www.opencascade.com/
- FreeCAD: https://www.freecad.org/
- CadQuery: https://cadquery.readthedocs.io/
- OpenSCAD: https://openscad.org/
- That Open: https://thatopen.com/
- web-ifc: https://github.com/ThatOpen/engine_web-ifc
- Three.js: https://threejs.org/
- Open3D: https://www.open3d.org/

## 9. Tech Lead execution

Wave G0 is exactly three workers with disjoint primary surfaces:

- GBIM-001 — exact geometry: OCCT + CadQuery/OCP + FreeCAD comparison.
- GBIM-002 — BIM/OpenBIM: IfcOpenShell + IFC + Bonsai/Blender comparison.
- GBIM-003 — browser spatial UX: Three.js + That Open/web-ifc, plus Atelier-inspired Spatial Studio proof-of-concept.

The Tech Lead must independently reproduce every claim before accepting a worker.

After G0, the Tech Lead decides whether to implement a provider adapter, create a shared geometry contract Work Item, stage an Architecture Change Record, or defer adoption.

No candidate becomes a default provider merely because this spike was successful.