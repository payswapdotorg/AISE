# WORLD-P0-A Capability Boundaries

**Work item:** WORLD-P0-A (worker-a, reality substrate contracts)
**Package:** `packages/world-reality-substrate` (self-contained; no runtime
deps; no cross-package imports)

This document records, per lane, the DECLARED capability boundary: what
the typed adapter contract publishes, what the substitution double
actually implements (REAL behavior, not stubs), what is explicitly
OUTSIDE the boundary, and which failure vocabulary governs refusals. It
mirrors the machine-checked contracts in `src/lanes.ts`; where a rule
cites the glTF 2.0 specification, the citation was verified against the
fetched specification source
(`licenses/gltf-2.0-Specification.adoc`, sha-256 in
`licenses/SHA256SUMS.txt`).

---

## The closed five-kind substrate failure vocabulary (FROZEN)

Every refusal from any lane or parser is one of EXACTLY these kinds
(`src/outcome.ts`; the package README mirrors this list):

| Kind | Definition |
|---|---|
| `malformed-input` | The input bytes/structure violate the format contract the adapter declares (bad magic, out-of-range index, misaligned offset, cyclic graph) — refused fail-closed with the offending path named. |
| `unsupported-format` | The input is well-formed but outside the adapter's declared support (unknown format family, unknown required extension, undeclared capability combination) — answered by explicit refusal, never by fabricated output. |
| `contract-mismatch` | A payload crossed the adapter boundary with a shape outside the closed AISE wire contract (unknown fields, wrong types, non-canonical ids) — refused with the field named. |
| `capability-unavailable` | A declared capability is not available in this build/adapter configuration — an honest declaration, not an error to retry or paper over. |
| `resource-limit-exceeded` | The input exceeds a declared, bounded adapter limit (byte length, node count, graph depth) — refused before unbounded work, with the limit and the actual value recorded. |

---

## Lane 1 — Babylon.js scene runtime (`babylon`)

| Declared capability | Double's real behavior |
|---|---|
| `scene-graph-instantiate` | Instantiates a typed node hierarchy (unique ids, known parents, ACYCLIC — parent chains walked and refused on cycles) into a scene artifact. |
| `transform-hierarchy-compose` | Real 4x4 matrix composition along parent chains (AISE column-vector convention, row-major storage, TRS order T·R·S; canonical digests of composed transforms). |
| `material-slot-binding` | Deterministic slot binding of material ids to node meshes; no material SEMANTICS are minted (ids pass through as opaque bindings). |
| `gpu-picking` | Real slab-method ray/AABB intersection over world-space bounds (bounds corners transformed to world, AABB re-fitted — declared: world AABB, not OBB). |

Outside the boundary: rendering, GPU state, cameras/lights semantics,
animation. Those belong to the real substrate adapter in later waves.

## Lane 2 — CesiumJS geospatial context (`cesium`)

| Declared capability | Double's real behavior |
|---|---|
| `wgs84-ellipsoid-model` | The WGS84 defining parameters (a = 6378137 m, 1/f = 298.257223563) with exact derived b, e², e'². |
| `geodetic-ecef-conversion` | Exact forward geodetic→ECEF and Bowring's closed-form inverse (with the exact polar branch); roundtrip asserted to 1e-4 m / 1e-9 deg (declared tolerances). |
| `ellipsoid-geodesic-distance` | Vincenty's inverse with a DECLARED iteration budget (200); non-convergence is refused (`capability-unavailable`, "NOT-DERIVABLE"), never approximated. Development-time cross-validation: GeographicLib 1.52.2 (Karney) over 9 canonical vectors + a 1000-pair seeded corpus — worst |diff| 7.7e-5 m (oracle used at development time only; NOT a shipped dependency). |
| `horizon-culling` | The EXACT tangent-plane visibility test for the convex ellipsoid ((C−P)·n̂ ≥ 0 with the ellipsoid normal); no tolerance, no approximation. |

Outside the boundary: tile streaming, terrain imagery, Cesium ion
services, cameras. The lane models the LOCAL mathematical core only.

## Lane 3 — OpenUSD composition semantics (`usd`)

| Declared capability | Double's real behavior |
|---|---|
| `layer-stack-composition` | Ordered layer stack, stronger-first; unique layer ids; one opinion per (path, field) per layer. |
| `variant-set-selection` | Variant opinions resolve from decorated paths (`/Path<<set=selected>>`); variant strength sits between local and reference (declared AISE strength order, LIVRPS-inspired subset). |
| `reference-arc-resolution` | One-hop reference resolution to target-layer opinions with arc-chain provenance (declared P0 simplification: no nested arc recursion). |
| `payload-lazy-loading` | Payload arcs participate ONLY when the compose request opts in (lazy semantics). |
| `winning-opinion-provenance` | Every resolved field names its winning strength class, layer id and arc chain. |

Outside the boundary: USD file formats (usd/usda/usdc), inherits and
specializes arcs, nested composition recursion, schemas. OpenUSD stays
external; these are AISE scene-composition types.

## Lane 4 — glTF/GLB runtime delivery (`gltf`)

| Declared capability | Double's real behavior |
|---|---|
| `glb-container-decode` | The REAL GLB v2 container codec: magic, version, chunk grammar, alignment, declared resource limits (64 MiB total; 10M accessor count). |
| `gltf-document-validation` | The REAL glTF 2.0 JSON validator (80 closed issue codes; every code exercised by the committed negative corpus; every code maps to a closed failure kind). |
| `canonical-geometry-extraction` | The byte-identical canonical stream (per primitive: 5×uint32 LE header + tight POSITION bytes + indices bytes) with sha-256 content address — same GLB bytes → identical stream, forever. |
| `indices-range-validation` | Data-level gate: every index value must address an existing vertex (checked from the BIN bytes, not just the JSON structure). |

### Declared validator rules and their bases

The lane's support contract for glTF 2.0 core geometry (citations
verified against the fetched specification source; wording below is
verbatim from the specification where quoted):

- **GLB container grammar** — chunk padding and order are specification
  rules: "This chunk **MUST** be padded with trailing `Space` chars
  (`0x20`) to satisfy alignment requirements." (JSON chunk) and "This
  chunk **MUST** be the second chunk of the Binary glTF asset. This
  chunk **MUST** be padded with trailing zeros (`0x00`)…" (BIN chunk).
  Container version: "`version` indicates the version of the Binary glTF
  container format. This specification defines version 2."
- **Buffer/BIN relationship** — "The byte length of the GLB's `BIN`
  chunk **MUST** be greater than or equal to the byte length of the
  corresponding glTF buffer." (basis of `gltf-glb-buffer-length-
  mismatch`; the adapter refuses buffers[0] with a `uri` in a GLB as the
  container grammar implies).
- **Accessor alignment** — "The accessor's byte offset into the buffer
  view and the buffer view's byte offset into the buffer **MUST** be
  multiples of the accessor's component type byte size." (basis of
  `gltf-accessor-offset-unaligned`).
- **Scene graph shape** — "The node hierarchy **MUST** be a set of
  disjoint strict trees. That is node hierarchy **MUST NOT** contain
  cycles and each node **MUST** have zero or one parent node." (basis of
  `gltf-scene-graph-cyclic` and `gltf-node-multi-parent`).
- **Declared adapter rules (AISE lane law, not quoted from the spec):**
  POSITION required on every primitive, non-empty `meshes` and
  `primitives`, binary-backed accessors only, dense accessors only,
  tight-stride accessors only, closed top-level/mesh/node/asset property
  sets, exactly-`"2.0"` asset version, `extensionsRequired` outside the
  empty declared set refused `capability-unavailable`. Each is recorded
  as the lane's support boundary for RUNTIME DELIVERY of renderable
  geometry; the spec's own attribute-semantics table defines POSITION as
  a core semantic, and a delivery lane for renderable geometry requires
  it.

Outside the boundary: materials/textures/animations/skins/cameras are
tolerated as opaque sections (index-checked where referenced), never
canonicalized; interleaved bufferViews, sparse accessors, data-URI
buffers, and all required extensions are refused `unsupported-format` /
`capability-unavailable` as declared.

## Lane 5 — Assimp-format ingest (`assimp`)

| Declared capability | Double's real behavior |
|---|---|
| `format-family-identification` | Closed magic-byte table; AMBIGUITY IS NAMED, never guessed (the 'solid' prefix is recorded as `stl-ascii-or-binary-header` with the ambiguity stated — binary STL may also begin 'solid'). |
| `stl-ascii-ingest` | A real ASCII STL parser (strict facet/loop/vertex grammar, finite-number checking, line-named refusals). |
| `ply-ascii-ingest` | A real ASCII PLY 1.0 parser (header grammar, exactly {float x, y, z} vertices, TRIANGLE faces only — quads/polygons are refused, never silently triangulated; face indices range-checked). |
| `coordinate-frame-declaration` | The ingest request MUST declare the source frame (handedness, up axis, unit); the artifact records it verbatim with a declared passthrough policy — NO silent unit conversion (the tolerance/conversion decision stays with the consumer, substitution contract §2 law 2). |

Outside the boundary: every other Assimp-supported family (the request
family vocabulary is exactly {stl-ascii, ply-ascii}; other families are
refused `unsupported-format` with the declared ingest set named), binary
STL/PLY, full PLY property sets, material/scene ingestion.

---

## Quarantine laws (all lanes)

- Every artifact is addressed by an OPAQUE substrate handle
  (`substrate:<lane>:<40-hex>`, lane-scoped sha-256 of the provider ref —
  one-way); the provider reference never appears in the handle.
- A canonical AISE id field carrying substrate-handle material is
  refused `contract-mismatch` fail-closed
  (`quarantineCanonicalId`); a provider that mints `aise:`-shaped ids is
  refused (`quarantineProviderRef`).
- The conformance battery's quarantine check proves per lane that no
  canonical id is minted and the handle belongs to the lane.

## What WORLD-P0-A deliberately does NOT do

- No application rewiring, no runtime adoption, no changes outside the
  item's own new package + evidence directory (P0 acceptance detail).
- No substrate is imported, wrapped, executed or downloaded into the
  build; the doubles are in-memory and prove the INTERFACES.
- No canonical AISE semantics are minted by any substrate type.
- No real-substrate performance numbers: the honest measurement surface
  is the runnable-in-sandbox code only (see
  `PERFORMANCE-OBSERVATIONS.md`); substrate-runtime rows are declared
  BLOCKED.
