# @aise/backend-export-dxf

AISE deterministic DXF export — **AISE-019** (HIGH_ASSURANCE).

Structured CAD drawing (**DXF 2000 / AC1015 ASCII**) derived from the
canonical 2D plan document ([AISE-017](../2d)), behind a clean service
boundary. The export layer **consumes** derived state; it never becomes
a second source of truth (architecture-lock).

## What it does

`dxfOf(document)` is a **pure function** of the immutable
`Plan2dDocument`:

| Plan primitive | DXF entity |
|---|---|
| `polygon` (plane parallel to the view) | closed `LWPOLYLINE` — the exact projected corners, 6-decimal canonical reals |
| `segment` (plane perpendicular to the view) | `LINE` — the diameter pair endpoints |
| unprojected objects | `TEXT` notes on `AISE-UNPROJECTED` with their honest reasons — never dropped, never approximated |
| document limitations | `TEXT` notes on `AISE-LIMITS` — always visible, never hidden |
| model identity | `TEXT` block on `AISE-META` + `999` file comments (modelId, projectId, graph digest, view, unit, counts) |

## Units and traceability (the acceptance core)

- **$INSUNITS** declares the frame unit through the standardized DXF
  code (meter=6, centimeter=5, millimeter=4, foot=2, inch=1);
  `$MEASUREMENT` marks the metric/imperial family. Coordinates are in
  the model's declared frame unit.
- **Dimensions are the source objects' canonical quantities, VERBATIM**
  (value, unit, uncertainty) in AISE XDATA — never recomputed from
  coordinates (a recomputed length would be a second, drifting
  measurement authority — the AISE-011 lesson).
- **Every entity carries its traceable source mapping as XDATA under
  the registered APPID `AISE`**: objectId, objectClass, name,
  contentHash, epistemic state (passthrough — never upgraded), the
  canonical quantities, and the provenance chain (service, method,
  content-pinned inputs). Long values split into continuation strings
  (`key.cont=…`) — never truncated.
- **Deterministic sequential handles** from a fixed seed make the
  identity mapping stable across re-exports.

## Determinism

Canonical entity order (the document's own primitive order, then
meta/limitations/unprojected text), fixed number formatting, fixed
text-layout rules derived from the drawing extents, CRLF ASCII-only
output. No clock, no randomness, no environment reads in the
serialization path (source-scanned and tested). Two exports of the
same plan document are byte-identical.

## Self-conformance

`validateDxf(text)` is the built-in **subset-level structural
validator** for the emitted profile: section order, table structure
and counts, handle uniqueness/monotonicity (`$HANDSEED`), layer/style/
appid referential integrity, entity group patterns (closed-polyline
vertex counts, LINE endpoint pairs, TEXT values/heights), and XDATA
structure. The runtime validates **every produced file before it is
returned** (`DXF_INVALID` fail-closed).

> Honest scope: this is *our* structural conformance check for the
> emitted subset — full external AutoCAD conformance is not claimed
> anywhere by this package (the AISE-018 subset-validator honesty
> discipline).

## Declared v1 limitations (embedded in every artifact and README)

1. one DXF profile is emitted (DXF 2000 / AC1015 ASCII); no R12
   ASCII or binary variants;
2. geometry is 2D plan/elevation projection (z = 0); no 3D solids,
   wall thickness, or hatch/cut symbols — the full AISE-017
   projection limitations travel inside every drawing as TEXT;
3. entity owner (330) handles and OBJECTS section are omitted
   (accepted by widespread DXF readers; documented subset-level
   structure — the built-in validator defines the emitted contract);
4. text layout is a fixed deterministic stacking around the drawing
   extents (not a CAD-annotative layout);
5. epistemic states pass through verbatim in XDATA; the DXF format
   has no native epistemic concept, and none is invented.

## Service composition

`buildExportDxfService(config, logger, options?)` adds bounded
compute (`maxPrimitives`, default 100,000; `maxOutputBytes`,
default 64 MiB), the self-conformance check, and per-call
structured debug logging (graph digest, counts, bytes — never
payloads). `main.ts` is the standard fail-closed boot/SIGTERM
entry (v1 library limitation: no external request intake yet).
