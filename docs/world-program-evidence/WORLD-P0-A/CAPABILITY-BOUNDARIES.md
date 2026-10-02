# WORLD-P0-A — Capability Boundaries

**Item:** WORLD-P0-A (Reality substrate contracts)
**Base:** 09dd9c3f4c4627940efd482d0d6bc7d36547c8d4

Per substrate: what it CAN do for the Reality lane, what it CANNOT
(explicit non-goals), and what must remain behind the adapter even when
convenient. The adapter contracts in `packages/world-reality-substrate`
enforce these boundaries structurally (typed ports + substitution doubles
+ tests).

---

## Babylon.js (`babylon.scene-runtime/1`)

**CAN:**
- Real-time interactive scene rendering (WebGL/WebGPU) with camera
  control surfaces (walk/orbit/fly), picking, layer visibility,
  sectioning and overlay rendering — the directive's Layer-1 world
  interaction surface.
- Scene-graph ingest from AISE `ComposedScene` types with per-node
  transforms, geometry references and material descriptions.
- Ghost/proposed-state overlays (the Layer-3 solution preview) rendered
  as visually distinct overlay sets.

**CANNOT (explicit non-goals):**
- Be an authority: Babylon never writes the Reality Graph, never derives
  quantities, never validates engineering semantics. It is a PRESENTATION
  and INTERACTION substrate.
- Own identity: Babylon mesh ids are adapter-internal; pick results must
  return AISE `elementId`s (structurally enforced — the port's types
  carry no Babylon types).
- Compute engineering measurements authoritatively: measurements taken in
  the world are surfaced as `WorldMeasurement` evidence candidates — they
  enter the Evidence Graph through the governed path, never directly.

**Stays behind the adapter even when convenient:**
- The scene graph itself (callers compose AISE types; they never touch
  Babylon nodes).
- Materials/shading models (AISE declares `SurfaceMaterial`; Babylon's
  PBR stack is an implementation detail).
- Input handling and camera controllers (the port exposes
  `CameraState`/`SelectionState`, not Babylon cameras/pointers).

## CesiumJS (`cesium.geospatial/1`)

**CAN:**
- WGS84 site context: placing the AISE site frame on the ellipsoid and
  bridging site-frame ↔ geodetic coordinates (analytic, declared
  tolerance).
- 3D Tiles streaming (photogrammetry/terrain tilesets) referenced by
  AISE-owned tileset ids.
- Georeferencing verdicts REUSING the anchoring-contract vocabulary
  (`anchored`/`partial`/`refused`) with hypotheses consumed verbatim.

**CANNOT:**
- Redefine anchoring: the anchoring-contract package owns that domain;
  this adapter MAPS to its interfaces (imports its types, emits its
  outcome vocabulary) and never invents a parallel one.
- Be a coordinate authority: the site frame and its georeference are
  AISE-owned; Cesium entity ids never become canonical identity.
- Decide georeference quality: `resolveGeoreference` reports outcomes;
  acceptance of a georeference is the governed path's decision.

**Stays behind the adapter:**
- The ellipsoid math (the double's analytic ENU bridge is the declared
  reference; a real Cesium adapter must match it to the declared
  tolerance — substitution law 2).
- Tileset streaming internals (callers hold `TilesetHandle`s; Cesium
  tile objects never cross).
- Cesium ion services (not used; no cloud dependency introduced).

## OpenUSD (`usd.composition/1`)

**CAN:**
- Layered composition: per-field opinion strength (the LIVRPS essence)
  mapped onto AISE scene overrides with full opinion provenance.
- Variants as explicit named alternatives — the AISE side selects,
  never the substrate.
- Payload regions as declared lazy-load sets (AISE decides what loads).
- Time samples mapped to explicit composition revisions (capture
  replay/compare by date).

**CANNOT:**
- Be an authority: USD is interchange/composition technology; the
  composed scene is a new AISE `ComposedScene` revision — canonical
  state changes still go through the governed path.
- Own identity: USD object paths never become canonical AISE identity.
  Structurally enforced: every override must carry a `pathBindings`
  entry; an unbound path is refused as `identity_leak_detected`.
- Auto-select variants or auto-load payloads (both are explicit AISE
  decisions in the contract).

**Stays behind the adapter:**
- The USD stage/prim data model (callers see `SceneNodeOverride`s and
  composition results only).
- File formats (.usd/.usda/.usdc) — P0 declares them BLOCKED in the
  double; the native sidecar (WORLD-P1+) owns file I/O.

## glTF/GLB (`gltf.runtime-asset/1`)

**CAN (FULLY REAL, headless, this delivery):**
- REAL parsing/validation of the glTF 2.0 JSON document and GLB
  container: asset/version gates, scene/node/mesh/material traversal,
  accessor/bufferView structural arithmetic (bounds, strides),
  node-cycle detection — all fail-closed with 26 typed issue codes.
- Typed AISE asset-delivery outputs (`ValidatedGltfAsset`) addressed by
  opaque `partId` labels scoped to the asset.

**CANNOT:**
- Own identity: glTF node/mesh indices are substrate-internal; partIds
  are asset-scoped labels, never canonical AISE identity.
- Partially load: fail-closed is total — a malformed asset NEVER yields
  a partially-validated result (structurally impossible: the parse
  result is valid-asset XOR issue-list).
- Decode compressed extensions (Draco/meshopt) — declared BLOCKED in the
  double with the WORLD-P1 protocol recorded.

**Stays behind the adapter:**
- The JSON/GLB byte formats (callers pass `GltfAssetSource` bytes and
  receive typed structures).
- Buffer layout details (bufferViews/accessors are validated internally;
  only counts and part lists cross the port).

## Assimp (`assimp.ingest/1`)

**CAN:**
- Multi-format ingest boundary: extract meshes/materials/transforms from
  external format families as structured data with declared units and
  declared lossiness.
- REAL minimal OBJ ingest in the double (genuine subset parser — the
  quarantine law is exercised against real extracted provider names).

**CANNOT:**
- Make imported identity canonical: provider IDs are QUARANTINED as
  namespaced external labels (`ext:{family}:{sourceName}`) — structurally
  enforced; the Reality Graph's governed path assigns AISE identity
  downstream, never the ingest boundary.
- Approximate what a format lacks: gaps are declared
  (`declaredMissing`/`formatLimitations`), never silently filled.
- Handle glTF (owned by the dedicated glTF port — the double refuses
  `gltf2-assimp` with a pointer to `gltf.runtime-asset/1`).

**Stays behind the adapter:**
- The Assimp scene graph and its C++ types entirely.
- The format-specific semantics (units are caller-DECLARED — the OBJ
  format has no unit field; the adapter refuses invalid scales).

---

## Three.js (the replaced incumbent — boundary record)

The GBIM spike (`apps/spatial-studio-spike/`) proved the browser lane
with Three.js and stays in-repo as the honest prior record. Its boundary
lesson is institutionalized in `babylon.scene-runtime/1`: the spike's
tighter coupling (spike code calling the rendering library directly)
is exactly what the world program replaces — the port keeps ANY
interactive substrate (Babylon, or a conforming Three.js adapter if ever
needed) behind AISE types. Not migrated, not deleted: recorded.
