/**
 * AISE-016 — Reality Graph v2 public surface.
 *
 * The Reality Graph is the ONLY canonical structured engineering-model
 * authority (spec/architecture-lock.md "Authority" #1). This package owns
 * the canonical project/reality object/version/relationship/observation
 * model, the append-only versioning engine, deterministic persistence and
 * the HTTP transport. Read the module headers before use:
 *
 *  - model.ts       — canonical types, epistemic/unit/provenance discipline,
 *                     typed validation errors, runtime record validators;
 *  - versioning.ts  — THE append-only version-transition engine
 *                     (materialized snapshots, tombstones, downgrade guard);
 *  - store.ts       — FsRealityStore / InMemoryRealityStore (persistence only);
 *  - router.ts      — /v1/reality HTTP surface (transport only).
 *
 * Downstream consumers (017 BOQ mapping, 020 projections, 022 assurance,
 * 025 Engineering Case) read canonical state from here and write ONLY
 * through explicit, provenance-carrying change sets.
 */

export {
  // vocabularies + discipline constants
  NODE_KINDS,
  RELATIONSHIP_KINDS,
  PROVENANCE_ROLES,
  GEOMETRY_REF_KINDS,
  EPISTEMIC_RANK,
  REALITY_ERROR_CODES,
  // pure projections
  versionSequence,
  formatVersionId,
  summarizeVersion,
  // runtime validators (single validation path for store + router)
  assertStableId,
  assertIsoTimestamp,
  parseNode,
  parseRelationship,
  parseObservation,
  parseChangeRecord,
  // typed error
  RealityGraphError,
} from "./model";

export type {
  NodeKind,
  RelKind,
  ProvenanceRole,
  GeometryRefKind,
  RealityErrorCode,
  ProvenanceRecord,
  PropertyRecord,
  GeometryRef,
  UnitDeclaration,
  AcquisitionRef,
  InterventionRef,
  RealityNode,
  Relationship,
  ObservationRecord,
  Tombstone,
  ChangeRecord,
  GraphVersion,
  VersionSummary,
  RealityGraph,
  ProjectHeader,
  NodeVersionEntry,
  NodeHistory,
} from "./model";

export {
  applyChanges,
  createInitialVersion,
  epistemicRank,
  type ChangeMeta,
} from "./versioning";

export {
  FsRealityStore,
  InMemoryRealityStore,
  type RealityStore,
} from "./store";

export { handleRealityRequest, type RealityRouteOptions } from "./router";
