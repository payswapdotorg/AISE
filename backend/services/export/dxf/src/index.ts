/**
 * @aise/backend-export-dxf — the AISE-019 deterministic DXF
 * export.
 *
 * Structured CAD drawing (DXF 2000 / AC1015 ASCII) derived from
 * the canonical 2D plan document (AISE-017, the declared
 * dependency), behind a clean service boundary:
 *
 * - errors   — typed, fail-closed ExportDxfError (non-retryable
 *              by construction; deterministic input can never
 *              succeed on retry where it failed before)
 * - dxf      — the pure serialization: closed LWPOLYLINE for
 *              polygons, LINE for segments, deterministic
 *              sequential handles, $INSUNITS unit declaration,
 *              AISE XDATA (identity, epistemic passthrough,
 *              canonical quantities VERBATIM, provenance), meta
 *              + limitations + unprojected TEXT blocks (honest
 *              display, never hidden)
 * - validate — the built-in structural conformance validator
 *              (subset-level profile conformance: sections,
 *              tables, entity shapes, XDATA, referential
 *              integrity) — honest about its own scope, never
 *              claimed as full AutoCAD conformance
 * - runtime  — service composition with bounded compute and the
 *              self-conformance check (every produced file is
 *              validated before it is returned)
 *
 * Authority: this package is a pure consumer of the ALREADY
 * DERIVED plan document — a serialization layer one step
 * further from the canonical Reality Graph. It stores nothing,
 * mutates nothing, fabricates no geometry, and upgrades no
 * epistemic state (architecture-lock: the Export layer never
 * becomes a second source of truth).
 */
export {
  ExportDxfError,
  toExportDxfError,
  type ExportDxfErrorCode,
  type ExportDxfErrorDetails,
} from "./errors.js";
export {
  dxfOf,
  wrapText,
  AISE_APPID,
  DXF_ACADVER,
  INSUNITS_OF,
  type DxfExportResult,
} from "./dxf.js";
export {
  parseDxfGroups,
  validateDxf,
  type DxfGroup,
  type DxfValidationResult,
  type DxfValidationStats,
} from "./validate.js";
export {
  buildExportDxfService,
  DEFAULT_MAX_PRIMITIVES,
  DEFAULT_MAX_OUTPUT_BYTES,
  type ExportDxfService,
  type BuildExportDxfServiceOptions,
} from "./runtime.js";
