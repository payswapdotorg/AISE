/**
 * AISE-033 — Historical change detection public surface.
 *
 * THE pure library for comparing Reality Graph versions across time
 * (geometry, semantics, condition). Deterministic identity matching
 * (nodeId-first, explicit AMBIGUOUS_IDENTITY, deliberately NO fuzzy
 * matching) plus a frozen change-finding registry and one pure comparator.
 *
 * This is a domain library: NO router/server wiring is exported here
 * (integration into the request surface belongs to AISE-032/035/039 —
 * the explicitly reviewed consumers). Read model.ts (the frozen registries,
 * tolerances and identity/determinism contracts) before use.
 */

export {
  // frozen registries + discipline constants
  CHANGE_FINDING_CODES,
  GEOMETRY_UNRESOLVED_REASONS,
  CHANGE_DETECTION_ID,
  PLANE_OFFSET_TOLERANCE_M,
  PLANE_ANGLE_TOLERANCE_RAD,
  SEMANTIC_KIND_PROPERTY_KEY,
  CONDITION_PROPERTY_PREFIX,
} from "./model";

export type {
  ChangeFindingCode,
  GeometryUnresolvedReason,
  SnapshotProperty,
  SnapshotGeometryRef,
  SnapshotNode,
  VersionSnapshotSlice,
  GeometryTable,
  AmbiguousIdentityFinding,
  KindChangedFinding,
  GeometryMovedFinding,
  GeometryUnresolvedFinding,
  PropertyAddedFinding,
  PropertyRemovedFinding,
  PropertyChangedFinding,
  ConditionChangedFinding,
  SemanticInconsistencyFinding,
  ChangeFinding,
  MatchKind,
  NodeMatch,
  NodeSide,
  ChangeStats,
  ChangeReport,
} from "./model";

export { compareVersions } from "./comparator";
