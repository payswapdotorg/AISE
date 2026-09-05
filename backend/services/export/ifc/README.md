# @aise/backend-export-ifc

AISE deterministic IFC 4.3 export — **AISE-018** (CRITICAL).

A schema-valid STEP physical file (ISO 10303-21,
`FILE_SCHEMA(('IFC4X3_ADD2'))`) derived from the canonical Reality Graph
(AISE-011), with evidence/epistemic metadata preserved where supported.
The export layer **consumes** the Reality Graph; it never becomes a
second source of truth (architecture-lock).

## What it does

`exportIfc(graph, options?)` is a **pure function** of the immutable graph
(plus an optional evidence graph VALUE):

| Input | Emitted IFC |
|---|---|
| project + units + context | `IfcProject` with SI unit assignment (METRE / SQUARE_METRE / RADIAN), `IfcGeometricRepresentationContext` whose world coordinate system is the declared model frame (`Axis = up`, `RefDirection = plan-basis e1`), ownership cluster (AISE person/org/application, deterministic epoch) |
| spaces | spatial structure: `IfcSite` → `IfcBuilding` → `IfcStorey` spine (fused with the first mapped SITE/FACILITY-BUILDING/LEVEL space, scaffolding otherwise), `ROOM` → `IfcSpace`, `IfcRelAggregates` chain; model space identities/kinds/frames/parent chains travel in `Pset_AISESpace` |
| `WALL` | `IfcWall(.SOLIDWALL.)` with `Tag = objectId` |
| `FLOOR` | `IfcSlab(.FLOOR.)` |
| `CEILING` | `IfcCovering(.CEILING.)` |
| `DOOR` / `WINDOW` | `IfcOpeningElement` + `IfcDoor(.DOOR.)`/`IfcWindow(.WINDOW.)` with `IfcRelVoidsElement` (wall↔opening) + `IfcRelFillsElement` (opening↔filling) |
| geometry (structured planar rectangle) | `GeometricSet` body representation: `IfcGeometricCurveSet(IfcPolyline)` — the exact face rectangle corners (SI metre conversion of the canonical scene coordinates), translate-only placement at the rectangle center |
| objects without structured geometry | exported WITHOUT body representation, flagged `GeometryExported=No` — never approximated |
| containment | `IfcRelContainedInSpatialStructure` (all physical elements in the export storey; openings relate via voids, not containment) |
| identity/provenance | `Pset_AISEIdentity` (ObjectId, ObjectClass, ContentHash, EpistemicState, GeometryExported), `Pset_AISEProvenance` (ServiceId, Method, MethodVersion, content-pinned inputs) |
| assertions | `Pset_AISEAssertions` — every property assertion as a complete, lossless text record (status, value+unit+uncertainty, measurement-vs-estimate, confidence, method, evidence refs, verifiedBy/verifiedAt) |
| quantities | `Pset_AISECanonicalQuantities` (verbatim value+unit+uncertainty) + `BaseQuantities` (`IfcQuantityLength`/`IfcQuantityArea` with exact SI conversion, the canonical text as `Formula`) |
| evidence (optional `evidence` + `version`) | `Pset_AISEEvidence` per object/space: every LIVE **and** retracted link with full source pins, honest statuses (`LIVE` / `LINK_RETRACTED` / `RECORD_RETRACTED`) |

## Fidelity and traceability (the acceptance core)

- **Dimensions are the canonical quantities, verbatim** (value, unit,
  uncertainty) plus exact SI conversion through the frozen unit
  vocabulary. Never recomputed from emitted coordinates — a recomputed
  length would be a second, drifting measurement authority.
- **Geometry coordinates are exact SI (metre) conversions** of the
  canonical scene coordinates through the frozen vocabulary (the model
  frame unit governs).
- **Epistemic states pass through** — INFERRED is never upgraded to
  CONFIRMED; IFC has no native epistemic schema, so states travel as
  explicit properties.
- **Stable identifiers (AC-102)**: every entity's GUID is deterministically
  derived from a SHA-256 of a model-scoped seed (the IFC 22-char base-64
  compression scheme) — the same object re-exports to the SAME GUID every
  time. The canonical `objectId` rides on the IFC `Tag` AND inside
  `Pset_AISEIdentity` (the explicit round-trip mapping).
- **The document embeds its explicit v1 limitations** (face geometry
  without thickness, scaffolding spatial spine, single storey,
  deterministic epoch placeholder, subset-level schema validation) —
  displayed by every consumer, never hidden.
- The document is **anchored** to the exact graph digest (and evidence
  digest when supplied) it was exported from.

## Determinism

Canonical emission order (the graph's own canonical order), fixed
derivations, canonical real literals (`-0` normalized, integers dotted,
uppercase exponent forms), sequential entity ids. No clock, no
randomness, no environment reads in the export path (source-scanned and
tested). The `FILE_NAME` timestamp and `IfcOwnerHistory.CreationDate`
are the deterministic epoch placeholder so re-exports are byte-identical;
real temporal facts travel inside evidence/assertion property values.
Repeated exports of the same graph — including freshly built identical
chains — are byte-identical (golden-pinned).

## Schema conformance (AC-100)

The built-in validator (`validateIfcSpf`) machine-checks every emitted
file at the structural level of the STEP physical file: ISO 10303-21
syntax, the frozen `IFC4X3_ENTITY_SIGNATURES` subset table (exact
flattened attribute counts + kinds per IFC4X3_ADD2), referential
integrity, canonical id sequence, GUID validity/uniqueness, SI unit
discipline, and printable-ASCII string discipline. The service runtime
applies the validator to **its own output** and fails closed
(`EXPORT_INVALID`) — an unvalidated file is never returned.

Full EXPRESS rule validation of IFC4X3_ADD2 requires external tooling
(IfcOpenShell / IDS / bSI validation service); this is declared inside
the document's limitations, never silently implied.

## Purity (AC-103)

The export stores nothing, mutates nothing, upgrades no epistemic state,
and fabricates no geometry. The canonical graph's digest and serialized
form are unchanged by export operations (regression-tested); the graph's
own deep-freeze discipline guards against tampering. The service has no
store dependency — it consumes graph and evidence VALUES.

## Service surface

`buildExportIfcService(config, logger, options)` composes the pure export
behind bounded compute: `maxGraphObjects` (default 100,000) and
`maxOutputBytes` (default 64 MiB) fail-closed caps, per-call structured
debug logging (digests, entity count, byte length — never payloads), and
the CRITICAL self-check described above.

`npm run dev` boots the fail-closed process entry (config validation,
graceful SIGINT/SIGTERM shutdown) — the v1 library limitation (no request
intake yet; the serving transport is a later Work Item) is documented in
`src/main.ts`.
