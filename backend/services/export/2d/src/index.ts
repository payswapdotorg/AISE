/**
 * @aise/backend-export-2d — the AISE-017 deterministic 2D
 * plan/elevation projection.
 *
 * Vector plan primitives derived from the canonical Reality
 * Graph (AISE-011), behind a clean service boundary:
 *
 * - errors   — typed, fail-closed Export2dError (non-retryable
 *              by construction; deterministic input can never
 *              succeed on retry where it failed before)
 * - project  — the pure projection: plan (viewer above, basis
 *              derived from the declared up axis) and elevation
 *              (horizontal view direction, image-right =
 *              d × up). Parallel object planes → polygons
 *              (canonical corner order); perpendicular planes →
 *              segments (the diameter pair of the projected
 *              corners); oblique planes → unprojected, honestly
 * - fidelity — dimensions are the source objects' canonical
 *              quantities VERBATIM (value, unit, uncertainty)
 *              plus exact SI conversion through the frozen unit
 *              vocabulary; never recomputed from coordinates
 *              (no second, drifting measurement authority)
 * - trace    — every primitive carries its source object ID,
 *              class, epistemic state (passthrough — never
 *              upgraded), content hash, and provenance chain
 * - limits   — the explicit v1 limitations travel INSIDE the
 *              document (wall face geometry without thickness,
 *              no room-boundary derivation, no occlusion
 *              removal, unprojected objects listed with
 *              reasons — never silent)
 * - runtime  — service composition with bounded-compute default
 *
 * Authority: this package is a pure consumer of the Reality
 * Graph. It stores nothing, mutates nothing, and fabricates no
 * geometry — the exported document is derived state (the DXF
 * serialization is AISE-019, downstream of this document).
 */
export {
  Export2dError,
  toExport2dError,
  type Export2dErrorCode,
  type Export2dErrorDetails,
} from "./errors.js";
export {
  project2d,
  PLAN_2D_LIMITATIONS,
  type Projection2dRequest,
  type Plan2dDocument,
  type Projection2dView,
  type Primitive2d,
  type Primitive2dBase,
  type Primitive2dSource,
  type Primitive2dProvenance,
  type Primitive2dProvenanceInput,
  type Primitive2dDimensions,
  type Polygon2d,
  type Segment2d,
  type Point2d,
  type Quantity2dView,
  type Unprojected2d,
} from "./project.js";
export {
  buildExport2dService,
  DEFAULT_MAX_GRAPH_OBJECTS,
  type Export2dService,
  type BuildExport2dServiceOptions,
} from "./runtime.js";
