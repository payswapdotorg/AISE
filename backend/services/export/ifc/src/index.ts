/**
 * @aise/backend-export-ifc — the AISE-018 deterministic IFC 4.3
 * export.
 *
 * A schema-valid STEP physical file (ISO 10303-21,
 * `FILE_SCHEMA(('IFC4X3_ADD2'))`) derived from the canonical
 * Reality Graph (AISE-011), behind a clean service boundary:
 *
 * - errors   — typed, fail-closed ExportIfcError (non-retryable
 *              by construction; deterministic input can never
 *              succeed on retry where it failed before)
 * - guid     — deterministic IfcGloballyUniqueId derivation
 *              (SHA-256 of stable model-scoped seeds, the IFC
 *              22-char base-64 compression scheme)
 * - spf      — the STEP serialization primitives: canonical real
 *              literals (byte-stable, `-0` normalized), fail-
 *              closed printable-ASCII strings, typed argument
 *              values, the sequential entity writer
 * - schema   — the frozen IFC4X3 emitted-subset signature table
 *              and the built-in conformance validator (syntax,
 *              signatures, referential integrity, GUID
 *              validity/uniqueness, unit discipline)
 * - ifc      — the pure export: project/units/context, spatial
 *              spine (mapped spaces, scaffolding otherwise),
 *              products with face-geometry curve sets, typed
 *              relationships, and AISE property sets
 *              (identity/provenance/assertions/evidence/
 *              canonical quantities + BaseQuantities)
 * - fidelity — canonical quantity values travel VERBATIM (value,
 *              unit, uncertainty) plus exact SI conversion through
 *              the frozen unit vocabulary; epistemic states pass
 *              through (never upgraded); evidence (live AND
 *              retracted, with source pins) surfaces where an
 *              evidence graph is supplied
 * - limits   — the explicit v1 limitations travel INSIDE the
 *              document (face geometry without thickness,
 *              scaffolding spatial spine, single storey,
 *              deterministic epoch placeholder, subset-level
 *              schema validation) — displayed by every consumer
 * - runtime  — service composition with bounded compute and the
 *              CRITICAL self-check: every produced file is
 *              validated before it is returned (EXPORT_INVALID
 *              otherwise) — the service never returns an
 *              unvalidated file
 *
 * Authority: this package is a pure consumer of the Reality
 * Graph. It stores nothing, mutates nothing, and fabricates no
 * geometry — the exported file is derived state (the engineering
 * workspace's serving transport and reporting are downstream
 * consumers of this surface).
 */
export {
  ExportIfcError,
  toExportIfcError,
  type ExportIfcErrorCode,
  type ExportIfcErrorDetails,
} from "./errors.js";
export {
  ifcGuidOf,
  isWellFormedIfcGuid,
  isValidIfcGuid,
  IFC_GUID_LENGTH,
  GUID_ALPHABET,
} from "./guid.js";
export {
  formatReal,
  formatString,
  renderValue,
  SpfWriter,
  type SpfValue,
} from "./spf.js";
export {
  IFC4X3_SCHEMA_NAME,
  IFC4X3_ENTITY_SIGNATURES,
  validateIfcSpf,
  type AttributeKind,
  type AttributeSpec,
  type ParsedArg,
  type ParsedHeaderEntity,
  type ParsedSpfEntity,
  type SpfValidationFailure,
  type SpfValidationOk,
  type SpfValidationResult,
} from "./schema.js";
export {
  exportIfc,
  IFC_EXPORT_LIMITATIONS,
  AISE_PSET_NAMES,
  type IfcExportDocument,
  type IfcExportOptions,
} from "./ifc.js";
export {
  buildExportIfcService,
  DEFAULT_MAX_GRAPH_OBJECTS,
  DEFAULT_MAX_OUTPUT_BYTES,
  type ExportIfcService,
  type BuildExportIfcServiceOptions,
} from "./runtime.js";
