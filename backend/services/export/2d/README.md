# @aise/backend-export-2d

AISE deterministic 2D plan/elevation projection — **AISE-017** (HIGH_ASSURANCE).

Vector plan primitives derived from the canonical Reality Graph (AISE-011),
behind a clean service boundary. The export layer **consumes** the Reality
Graph; it never becomes a second source of truth (architecture-lock).

## What it does

`project2d(graph, request)` is a **pure function** of the immutable graph:

| Request | View |
|---|---|
| `{ kind: "plan" }` | Viewer above, looking along `−up`. Basis derived from the declared up axis (X, then Y, then Z priority), orthonormalized; `e2 = up × e1`. |
| `{ kind: "elevation", viewDirection }` | Viewer looks along a supplied **horizontal** unit vector `d`; `e1 = d × up` (image-right), `e2 = up` (image-up). |

Plane/view alignment classification **mirrors the upstream AISE-010 tilt
tolerance** (±10°): the same tolerance that classified these objects as walls
(vertical) and floors/ceilings (horizontal). The projection introduces no
new, stricter authority.

| Object plane vs. view | Primitive |
|---|---|
| Parallel (within tolerance) | `polygon` — the exact projection of the four canonical rectangle corners |
| Perpendicular (within tolerance) | `segment` — the diameter pair of the projected corners (the full in-view extent) |
| Oblique | **unprojected** (reason `oblique-plane`) — honest refusal, never approximation |

## Fidelity and traceability (the acceptance core)

- **Dimensions are the source objects' canonical quantities, verbatim**
  (value, unit, uncertainty) plus an exact SI conversion through the frozen
  unit vocabulary. Never recomputed from projected coordinates — a
  recomputed length would be a second, drifting measurement authority.
- **Every primitive carries its traceable source ID**: object identity,
  class, epistemic state (passthrough — never upgraded), content hash, and
  the provenance chain (service, method, content-pinned inputs).
- **The document embeds its explicit v1 limitations** (wall face geometry
  without thickness, no room-boundary derivation, no occlusion removal,
  no uncertainty banding) — displayed by every consumer, never hidden.
- The document is **anchored** to the exact graph digest it was projected
  from.

## Determinism

Canonical object ordering, fixed view-basis derivations, pure arithmetic,
canonical-zero discipline. No clock, no randomness, no environment reads in
the projection path (source-scanned and tested). Repeated projection of the
same graph and view is byte-identical.

## Errors

Typed, fail-closed `Export2dError` (non-retryable by construction):

- `VALIDATION_FAILED` — malformed input, graph object cap exceeded, unit
  outside the frozen vocabulary (defense in depth)
- `VIEW_DIRECTION_INVALID` / `VIEW_DIRECTION_NOT_HORIZONTAL` — elevation
  request discipline
- `FRAME_DECLARATION_MISSING` — the graph's first space has no declared
  coordinate frame
- `INTERNAL_ERROR` — implementation defect (retryable), never a property of
  the input

## Runtime

`buildExport2dService(config, logger)` wraps the projection with bounded
compute (`maxGraphObjects`, default 100,000) and structured per-call debug
logging (digest + counts, no payload). `src/main.ts` is the process entry
with the standard fail-closed boot contract; v1 is a deterministic library
(no external request intake yet — the DXF serialization is AISE-019,
downstream of this document).

## Scope

Declared surface: `services/export/2d/**` (AISE-017). The web 2D workspace
(`apps/web/2d/**`) composes this package server-side; the browser receives
only the derived, read-only document.
