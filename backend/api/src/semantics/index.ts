/**
 * AISE-015 — architectural semantics public surface.
 *
 * A package-internal domain library (no router/server surface): deterministic
 * extraction of wall/floor/ceiling/opening/door/window semantics from
 * reconstruction observations, a structurally-enforced no-overwrite merge,
 * and consistency checks that find (never fix) incoherence. Consumed by
 * AISE-016 (Reality Graph v2) and downstream projections.
 *
 * Read the module headers of model.ts (epistemic discipline), extract.ts
 * (determinism + honest unknowns), merge.ts (no-overwrite invariant) and
 * consistency.ts (finding, not fixing) before use.
 */

export {
  // constants
  EXTRACTOR_VERSION,
  SEMANTIC_ELEMENT_KINDS,
  WALL_MAX_VERTICALITY,
  FLOOR_MIN_Z,
  DOOR_SILL_MAX_M,
  WINDOW_SILL_MIN_M,
  WINDOW_SILL_MAX_M,
  OPENING_ANCHOR_TOLERANCE_M,
  DUPLICATE_NORMAL_DOT_MIN,
  DUPLICATE_OFFSET_TOLERANCE_M,
  SEMANTIC_FINDING_CODES,
} from "./model";

export type {
  SemanticElementKind,
  SemanticEpistemicStatus,
  ElementPlane,
  ElementDimension,
  ElementGeometry,
  SemanticProperty,
  SemanticProvenance,
  SemanticElement,
  ObservedPlane,
  OpeningFacts,
  ObservedOpening,
  GeometryObservationInput,
  UnclassifiedEntry,
  SemanticsStats,
  SemanticsResult,
  SemanticFindingCode,
  SemanticFinding,
  ConsistencyReport,
} from "./model";

export { extractArchitecturalSemantics } from "./extract";

export {
  mergeSemantics,
  SemanticMergeRefusal,
  SEMANTIC_MERGE_REFUSAL_CODE,
  PROTECTED_GEOMETRY_KEYS,
} from "./merge";

export { checkSemanticConsistency } from "./consistency";
