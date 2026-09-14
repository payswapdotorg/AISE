/**
 * AISE-016 — Reality Graph v2 canonical object model.
 *
 * AUTHORITY (spec/architecture-lock.md "Authority" #1): the Reality Graph is
 * the ONLY canonical structured engineering-model authority. The types below
 * ARE that authority's in-repo vocabulary, aligned with (never competing
 * with) the frozen shared-contracts model family: `EpistemicStatus` /
 * `EPISTEMIC_STATUSES` are reused VERBATIM (no second enum), `NodeKind` is
 * the project-hierarchy vocabulary R6 mandates, and `PropertyRecord`
 * mirrors the `PropertyAssertion` value domain (string | number | boolean).
 * The wire contracts deliberately carry "identity ONLY — full object is
 * AISE-016" (shared-contracts model.ts); this module owns the graph
 * structure: hierarchy, relationships, versioned state, tombstones.
 *
 * EPISTEMIC DISCIPLINE (lock "Truth and uncertainty" — enforced by the
 * validators in this module, not by convention):
 *
 *  - Every consequential assertion (node, property, relationship) carries
 *    provenance; a missing or source-less provenance record is a typed
 *    validation error (`missing_provenance` / `invalid_provenance`).
 *  - Numeric property values REQUIRE a typed unit (`unit` string) — a
 *    unitless numeric property is a typed error
 *    (`numeric_property_without_unit`). Non-numeric values carry NO unit.
 *  - Evidence references are content addresses (64 lowercase hex) of
 *    Evidence-Graph records (`invalid_evidence_id` otherwise). Existence
 *    checking stays with the Evidence authority: this module stores explicit
 *    references only, mirroring the evidence service's symmetric refusal to
 *    verify foreign subjects.
 *  - Confirmations are never silently undone: `EPISTEMIC_RANK` defines a
 *    certainty order (CONFIRMED > OBSERVED > INFERRED > PROPOSED) used by
 *    the versioning engine to reject downgrades — "estimates cannot
 *    silently become measurements" cuts both ways.
 *  - Observations NEVER mutate node state (they are inputs to version
 *    transitions) and their properties are pinned to OBSERVED.
 *  - `interventionRef` marks PROPOSED intervention states. POLICY (guidance
 *    only, deliberately NOT enforced here — assurance items own it):
 *    intervention references belong on PROPOSED-status subgraphs; a
 *    PROPOSED node can never be silently promoted to OBSERVED/CONFIRMED by
 *    carrying one — promotion requires an explicit upsert with real
 *    provenance.
 *
 * All identifiers (nodeId, relationshipId, observationId) are CALLER-supplied
 * stable ids (common.ts `StableId` semantics: opaque, 1..256 chars, assigned
 * by the owning authority — here the graph's caller). Determinism: records
 * are plain JSON data; canonical serialization is the shared
 * `canonicalJsonStringify`.
 */

import {
  EPISTEMIC_STATUSES,
  ISO_8601_UTC_PATTERN,
  type EpistemicStatus,
} from "@aise/shared-contracts";

/* ------------------------------------------------------------------ */
/* Vocabularies (closed, stable — aligned with the contract family)    */
/* ------------------------------------------------------------------ */

/** Project-hierarchy node kinds (R6: project hierarchy, spaces, objects, issues). */
export const NODE_KINDS = [
  "project",
  "site",
  "building",
  "storey",
  "space",
  "element",
  "opening",
  "system",
  "issue",
  "annotation",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Typed relationship kinds between graph nodes. */
export const RELATIONSHIP_KINDS = [
  "contains",
  "bounded-by",
  "adjacent-to",
  "supports",
  "part-of",
  "opens-into",
  "references",
] as const;
export type RelKind = (typeof RELATIONSHIP_KINDS)[number];

/** Provenance roles (how a source relates to an assertion). */
export const PROVENANCE_ROLES = ["SUPPORTS", "DERIVED_FROM", "CONTEXT", "CONTRADICTS"] as const;
export type ProvenanceRole = (typeof PROVENANCE_ROLES)[number];

/** Geometry is REFERENCED, never parsed here (013/012 own computation). */
export const GEOMETRY_REF_KINDS = ["plane", "polygon", "mesh-ref", "point-cloud-ref"] as const;
export type GeometryRefKind = (typeof GEOMETRY_REF_KINDS)[number];

/**
 * Certainty order for the no-silent-downgrade rule: CONFIRMED > OBSERVED >
 * INFERRED > PROPOSED. Equal rank and upgrades are allowed; a rank DECREASE
 * on an upsert is a typed `epistemic_downgrade` rejection.
 */
export const EPISTEMIC_RANK: Readonly<Record<EpistemicStatus, number>> = {
  CONFIRMED: 3,
  OBSERVED: 2,
  INFERRED: 1,
  PROPOSED: 0,
};

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)           */
/* ------------------------------------------------------------------ */

export const REALITY_ERROR_CODES = [
  // record-shape / vocabulary validation (422 at the HTTP boundary)
  "invalid_change",
  "invalid_node",
  "invalid_relationship",
  "invalid_observation",
  "invalid_kind",
  "invalid_epistemic_status",
  "invalid_id",
  "invalid_timestamp",
  "invalid_evidence_id",
  "invalid_provenance",
  "missing_provenance",
  "invalid_property",
  "numeric_property_without_unit",
  // graph semantics
  "dangling_reference",
  "epistemic_downgrade",
  "observation_property_not_observed",
  "duplicate_observation",
  "delete_unknown_node",
  "delete_unknown_relationship",
  // not-found codes
  "project_not_found",
  "version_not_found",
  "node_not_found",
  // persistence / addressing
  "invalid_project_id",
  "invalid_version_id",
  "project_exists",
  "version_exists",
  "empty_graph",
] as const;
export type RealityErrorCode = (typeof REALITY_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (never a bare string error). */
export class RealityGraphError extends Error {
  readonly code: RealityErrorCode;
  readonly detail: string;

  constructor(code: RealityErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "RealityGraphError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Graph objects                                                        */
/* ------------------------------------------------------------------ */

/**
 * How an assertion is sourced. At least ONE of `evidenceId` (content
 * address in the Evidence Graph), `sourceArtifactId` (reconstruction/
 * capture artifact) or `derivationNote` (explicit derivation statement)
 * must be present — a provenance record naming no source is a typed error.
 */
export interface ProvenanceRecord {
  readonly role: ProvenanceRole;
  readonly evidenceId?: string;
  readonly sourceArtifactId?: string;
  readonly derivationNote?: string;
  readonly recordedAt: string;
}

/** A typed property assertion on a node (value domain of PropertyAssertion). */
export interface PropertyRecord {
  readonly key: string;
  readonly value: string | number | boolean;
  /** REQUIRED for numeric values (typed unit); absent for non-numeric. */
  readonly unit?: string;
  readonly epistemicStatus: EpistemicStatus;
  readonly provenance: readonly ProvenanceRecord[];
}

/** A REFERENCE to geometry owned elsewhere (stable id or inline geo JSON id). */
export interface GeometryRef {
  readonly kind: GeometryRefKind;
  readonly ref: string;
  readonly sourceArtifactId?: string;
}

/** Units of a node's geometry and numeric properties. */
export interface UnitDeclaration {
  readonly linear: string;
  readonly angular: string;
}

/** Acquisition reference: where the node's evidence was captured. */
export interface AcquisitionRef {
  readonly captureSessionId: string;
  readonly missionId?: string;
}

/**
 * Intervention reference (work order: "acquisition and intervention
 * references"). Names a PROPOSED scenario state — carrying one NEVER
 * promotes a node's epistemic status (lock: proposals stay proposals).
 */
export interface InterventionRef {
  readonly scenarioId: string;
  readonly stateId: string;
}

/** The canonical reality object, materialized per version. */
export interface RealityNode {
  readonly nodeId: string;
  readonly kind: NodeKind;
  readonly epistemicStatus: EpistemicStatus;
  readonly properties: readonly PropertyRecord[];
  readonly geometry?: GeometryRef;
  readonly provenance: readonly ProvenanceRecord[];
  readonly units?: UnitDeclaration;
  readonly acquisitionRef?: AcquisitionRef;
  readonly interventionRef?: InterventionRef;
}

/** A typed relationship between two nodes of the same version's state. */
export interface Relationship {
  readonly relationshipId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: RelKind;
  readonly provenance: readonly ProvenanceRecord[];
}

/**
 * An append-only factual observation. NEVER mutates node state directly —
 * observations are inputs to version transitions. `nodeId` need not resolve
 * to a live node (an observation may precede modeling; binding it into node
 * state is an explicit, provenance-carrying upsert).
 */
export interface ObservationRecord {
  readonly observationId: string;
  readonly nodeId: string;
  readonly observedAt: string;
  readonly evidenceIds: readonly string[];
  readonly properties: readonly PropertyRecord[];
  readonly observer?: string;
  readonly note?: string;
}

/** Node deletion tombstone — nodes are never physically removed. */
export interface Tombstone {
  readonly nodeId: string;
  readonly reason: string;
}

/** One change in a change set (append-only version transition input). */
export type ChangeRecord =
  | { readonly op: "upsert-node"; readonly node: RealityNode }
  | { readonly op: "delete"; readonly nodeId: string; readonly reason: string }
  | { readonly op: "upsert-relationship"; readonly relationship: Relationship }
  | {
      readonly op: "delete-relationship";
      readonly relationshipId: string;
      readonly reason: string;
    }
  | { readonly op: "observe"; readonly observation: ObservationRecord };

/**
 * One materialized version: the FULL state (parent state + changes applied)
 * plus the EXACT change records that produced it. Prior versions are never
 * rewritten — history is immutable.
 */
export interface GraphVersion {
  /** Monotonic zero-padded sequence id, e.g. `v001`, `v002`. */
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly createdAt: string;
  readonly changeLog: readonly ChangeRecord[];
  readonly nodes: readonly RealityNode[];
  readonly relationships: readonly Relationship[];
  readonly observations: readonly ObservationRecord[];
  readonly tombstones: readonly Tombstone[];
}

/** Rebuildable index projection of one version (graph.json entry). */
export interface VersionSummary {
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly createdAt: string;
  readonly changeCount: number;
  readonly nodeCount: number;
  readonly relationshipCount: number;
  readonly observationCount: number;
  readonly tombstoneCount: number;
}

/** Project-level container: the graph IS the project's versioned reality. */
export interface RealityGraph {
  readonly projectId: string;
  readonly createdAt: string;
  /** Ordered by sequence; the LAST entry is the latest version. */
  readonly versions: readonly GraphVersion[];
}

/** Project header + version index (the persisted/readable projection). */
export interface ProjectHeader {
  readonly projectId: string;
  readonly createdAt: string;
  readonly latestVersionId: string;
  readonly versions: readonly VersionSummary[];
}

/** Per-version entry of a node's history (node history read view). */
export interface NodeVersionEntry {
  readonly versionId: string;
  /** Whether THIS version's changeLog touched the node. */
  readonly changed: boolean;
  readonly changeOp: "upsert-node" | "delete" | null;
  /** Live record in THIS version (null when absent/tombstoned). */
  readonly node: RealityNode | null;
  readonly tombstone: Tombstone | null;
}

export interface NodeHistory {
  readonly projectId: string;
  readonly nodeId: string;
  readonly latestVersionId: string;
  readonly entries: readonly NodeVersionEntry[];
}

/* ------------------------------------------------------------------ */
/* Pure projections                                                     */
/* ------------------------------------------------------------------ */

/** Version sequence number parsed from a `vNNN` id (NaN-safe: -1 invalid). */
export function versionSequence(versionId: string): number {
  const match = /^v(\d+)$/.exec(versionId);
  return match === null ? -1 : Number(match[1]);
}

/** Deterministic zero-padded version id for a sequence number. */
export function formatVersionId(sequence: number): string {
  return `v${String(sequence).padStart(3, "0")}`;
}

/** Index projection of one materialized version (pure, deterministic). */
export function summarizeVersion(version: GraphVersion): VersionSummary {
  return {
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    createdAt: version.createdAt,
    changeCount: version.changeLog.length,
    nodeCount: version.nodes.length,
    relationshipCount: version.relationships.length,
    observationCount: version.observations.length,
    tombstoneCount: version.tombstones.length,
  };
}

/* ------------------------------------------------------------------ */
/* Runtime validation (single path for in-process AND wire records)    */
/* ------------------------------------------------------------------ */

const ISO_UTC = new RegExp(ISO_8601_UTC_PATTERN);
const CONTENT_ID = /^[0-9a-f]{64}$/;

function isEpistemicStatus(value: unknown): value is EpistemicStatus {
  return typeof value === "string" && (EPISTEMIC_STATUSES as readonly string[]).includes(value);
}

function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === "string" && (NODE_KINDS as readonly string[]).includes(value);
}

function isRelKind(value: unknown): value is RelKind {
  return typeof value === "string" && (RELATIONSHIP_KINDS as readonly string[]).includes(value);
}

function isProvenanceRole(value: unknown): value is ProvenanceRole {
  return typeof value === "string" && (PROVENANCE_ROLES as readonly string[]).includes(value);
}

function isGeometryRefKind(value: unknown): value is GeometryRefKind {
  return typeof value === "string" && (GEOMETRY_REF_KINDS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 256;
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && ISO_UTC.test(value);
}

function isContentId(value: unknown): value is string {
  return typeof value === "string" && CONTENT_ID.test(value);
}

/** StableId-shaped string (caller-supplied opaque identity). */
export function assertStableId(value: unknown, what: string): string {
  if (!isId(value)) {
    throw new RealityGraphError("invalid_id", `${what}: must be a non-empty string (<=256 chars)`);
  }
  return value;
}

/** ISO-8601 UTC timestamp (injected-clock discipline, millisecond `Z`). */
export function assertIsoTimestamp(value: unknown, what: string): string {
  if (!isIso(value)) {
    throw new RealityGraphError(
      "invalid_timestamp",
      `${what}: must be ISO 8601 UTC with millisecond precision and Z suffix`,
    );
  }
  return value;
}

function arrayField(value: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new RealityGraphError("invalid_property", `${what}: expected an array`);
  }
  return value;
}

function optionalString(value: unknown, what: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isId(value)) {
    throw new RealityGraphError("invalid_provenance", `${what}: must be a non-empty string`);
  }
  return value;
}

function parseProvenanceRecord(value: unknown, where: string): ProvenanceRecord {
  if (!isRecord(value)) {
    throw new RealityGraphError("invalid_provenance", `${where}: not an object`);
  }
  const role = value["role"];
  if (!isProvenanceRole(role)) {
    throw new RealityGraphError(
      "invalid_provenance",
      `${where}: role must be one of ${PROVENANCE_ROLES.join("|")}`,
    );
  }
  const recordedAt = assertIsoTimestamp(value["recordedAt"], `${where} recordedAt`);
  const evidenceId = value["evidenceId"];
  if (evidenceId !== undefined && evidenceId !== null && !isContentId(evidenceId)) {
    throw new RealityGraphError(
      "invalid_evidence_id",
      `${where}: evidenceId must be a content address (64 lowercase hex)`,
    );
  }
  const sourceArtifactId = optionalString(value["sourceArtifactId"], `${where} sourceArtifactId`);
  const note = value["derivationNote"];
  if (note !== undefined && note !== null && (typeof note !== "string" || note.length > 4096)) {
    throw new RealityGraphError("invalid_provenance", `${where}: derivationNote must be bounded text`);
  }
  if (
    (evidenceId === undefined || evidenceId === null) &&
    sourceArtifactId === undefined &&
    (note === undefined || note === null)
  ) {
    throw new RealityGraphError(
      "invalid_provenance",
      `${where}: names no source (need evidenceId, sourceArtifactId or derivationNote)`,
    );
  }
  return {
    role,
    ...(evidenceId === undefined || evidenceId === null ? {} : { evidenceId }),
    ...(sourceArtifactId === undefined ? {} : { sourceArtifactId }),
    ...(note === undefined || note === null ? {} : { derivationNote: note }),
    recordedAt,
  };
}

function parseProvenanceList(
  value: unknown,
  where: string,
  code: RealityErrorCode,
): readonly ProvenanceRecord[] {
  const list = arrayField(value, where);
  if (list.length === 0) {
    throw new RealityGraphError(code, `${where}: at least one provenance record is required`);
  }
  return list.map((entry, index) =>
    parseProvenanceRecord(entry, `${where}[${String(index)}]`),
  );
}

function parseProperty(value: unknown, where: string): PropertyRecord {
  if (!isRecord(value)) {
    throw new RealityGraphError("invalid_property", `${where}: not an object`);
  }
  const key = value["key"];
  if (!isId(key)) {
    throw new RealityGraphError("invalid_property", `${where}: missing/invalid key`);
  }
  const propertyValue = value["value"];
  if (
    typeof propertyValue !== "string" &&
    typeof propertyValue !== "boolean" &&
    !(typeof propertyValue === "number" && Number.isFinite(propertyValue))
  ) {
    throw new RealityGraphError(
      "invalid_property",
      `${where}: value must be a finite number, string or boolean`,
    );
  }
  const epistemicStatus = value["epistemicStatus"];
  if (!isEpistemicStatus(epistemicStatus)) {
    throw new RealityGraphError(
      "invalid_epistemic_status",
      `${where}: must be one of ${EPISTEMIC_STATUSES.join("|")}`,
    );
  }
  const unit = value["unit"];
  if (typeof propertyValue === "number") {
    if (typeof unit !== "string" || unit.length < 1 || unit.length > 256) {
      throw new RealityGraphError(
        "numeric_property_without_unit",
        `${where}: numeric value requires a typed unit`,
      );
    }
  } else if (unit !== undefined && unit !== null) {
    throw new RealityGraphError(
      "invalid_property",
      `${where}: unit is only applicable to numeric values`,
    );
  }
  const provenance = parseProvenanceList(
    value["provenance"],
    `${where} provenance`,
    "missing_provenance",
  );
  return {
    key,
    value: propertyValue,
    ...(unit === undefined || unit === null ? {} : { unit }),
    epistemicStatus,
    provenance,
  };
}

function parseGeometry(value: unknown, where: string): GeometryRef {
  if (!isRecord(value)) {
    throw new RealityGraphError("invalid_node", `${where}: not an object`);
  }
  const kind = value["kind"];
  if (!isGeometryRefKind(kind)) {
    throw new RealityGraphError(
      "invalid_node",
      `${where}: kind must be one of ${GEOMETRY_REF_KINDS.join("|")}`,
    );
  }
  const ref = assertStableId(value["ref"], `${where} ref`);
  const sourceArtifactId = optionalString(value["sourceArtifactId"], `${where} sourceArtifactId`);
  return { kind, ref, ...(sourceArtifactId === undefined ? {} : { sourceArtifactId }) };
}

function parseUnits(value: unknown, where: string): UnitDeclaration {
  if (!isRecord(value)) {
    throw new RealityGraphError("invalid_node", `${where}: not an object`);
  }
  const linear = optionalString(value["linear"], `${where} linear`);
  const angular = optionalString(value["angular"], `${where} angular`);
  if (linear === undefined || angular === undefined) {
    throw new RealityGraphError("invalid_node", `${where}: linear and angular units are required`);
  }
  return { linear, angular };
}

function parseAcquisitionRef(value: unknown, where: string): AcquisitionRef {
  if (!isRecord(value)) {
    throw new RealityGraphError("invalid_node", `${where}: not an object`);
  }
  const captureSessionId = assertStableId(
    value["captureSessionId"],
    `${where} captureSessionId`,
  );
  const missionId = optionalString(value["missionId"], `${where} missionId`);
  return { captureSessionId, ...(missionId === undefined ? {} : { missionId }) };
}

function parseInterventionRef(value: unknown, where: string): InterventionRef {
  if (!isRecord(value)) {
    throw new RealityGraphError("invalid_node", `${where}: not an object`);
  }
  const scenarioId = assertStableId(value["scenarioId"], `${where} scenarioId`);
  const stateId = assertStableId(value["stateId"], `${where} stateId`);
  return { scenarioId, stateId };
}

/** Runtime-validate one node record (unknown keys are ignored — open shapes). */
export function parseNode(value: unknown): RealityNode {
  if (!isRecord(value)) {
    throw new RealityGraphError("invalid_node", "node: not an object");
  }
  const nodeId = assertStableId(value["nodeId"], "node nodeId");
  const where = `node "${nodeId}"`;
  const kind = value["kind"];
  if (!isNodeKind(kind)) {
    throw new RealityGraphError(
      "invalid_kind",
      `${where}: kind must be one of ${NODE_KINDS.join("|")}`,
    );
  }
  const epistemicStatus = value["epistemicStatus"];
  if (!isEpistemicStatus(epistemicStatus)) {
    throw new RealityGraphError(
      "invalid_epistemic_status",
      `${where}: epistemicStatus must be one of ${EPISTEMIC_STATUSES.join("|")}`,
    );
  }
  const rawProperties = arrayField(value["properties"], `${where} properties`);
  const properties = rawProperties.map((entry) => {
    const key = isRecord(entry) ? entry["key"] : undefined;
    return parseProperty(entry, `${where} property "${isId(key) ? key : "?"}"`);
  });
  const provenance = parseProvenanceList(value["provenance"], `${where} provenance`, "missing_provenance");
  const geometry = value["geometry"];
  const units = value["units"];
  const acquisitionRef = value["acquisitionRef"];
  const interventionRef = value["interventionRef"];
  return {
    nodeId,
    kind,
    epistemicStatus,
    properties,
    ...(geometry === undefined || geometry === null
      ? {}
      : { geometry: parseGeometry(geometry, `${where} geometry`) }),
    ...(units === undefined || units === null ? {} : { units: parseUnits(units, `${where} units`) }),
    ...(acquisitionRef === undefined || acquisitionRef === null
      ? {}
      : { acquisitionRef: parseAcquisitionRef(acquisitionRef, `${where} acquisitionRef`) }),
    ...(interventionRef === undefined || interventionRef === null
      ? {}
      : { interventionRef: parseInterventionRef(interventionRef, `${where} interventionRef`) }),
    provenance,
  };
}

/** Runtime-validate one relationship record. */
export function parseRelationship(value: unknown): Relationship {
  if (!isRecord(value)) {
    throw new RealityGraphError("invalid_relationship", "relationship: not an object");
  }
  const relationshipId = assertStableId(value["relationshipId"], "relationship relationshipId");
  const where = `relationship "${relationshipId}"`;
  const fromNodeId = assertStableId(value["fromNodeId"], `${where} fromNodeId`);
  const toNodeId = assertStableId(value["toNodeId"], `${where} toNodeId`);
  const kind = value["kind"];
  if (!isRelKind(kind)) {
    throw new RealityGraphError(
      "invalid_kind",
      `${where}: kind must be one of ${RELATIONSHIP_KINDS.join("|")}`,
    );
  }
  const provenance = parseProvenanceList(value["provenance"], `${where} provenance`, "missing_provenance");
  return { relationshipId, fromNodeId, toNodeId, kind, provenance };
}

/** Runtime-validate one observation record (properties pinned to OBSERVED). */
export function parseObservation(value: unknown): ObservationRecord {
  if (!isRecord(value)) {
    throw new RealityGraphError("invalid_observation", "observation: not an object");
  }
  const observationId = assertStableId(value["observationId"], "observation observationId");
  const where = `observation "${observationId}"`;
  const nodeId = assertStableId(value["nodeId"], `${where} nodeId`);
  const observedAt = assertIsoTimestamp(value["observedAt"], `${where} observedAt`);
  const rawEvidence = arrayField(value["evidenceIds"], `${where} evidenceIds`);
  const evidenceIds = rawEvidence.map((entry, index) => {
    if (!isContentId(entry)) {
      throw new RealityGraphError(
        "invalid_evidence_id",
        `${where} evidenceIds[${String(index)}]: must be a content address (64 lowercase hex)`,
      );
    }
    return entry;
  });
  const rawProperties = arrayField(value["properties"], `${where} properties`);
  const properties = rawProperties.map((entry) => {
    const key = isRecord(entry) ? entry["key"] : undefined;
    const property = parseProperty(entry, `${where} property "${isId(key) ? key : "?"}"`);
    if (property.epistemicStatus !== "OBSERVED") {
      throw new RealityGraphError(
        "observation_property_not_observed",
        `${where} property "${property.key}": observation properties must be OBSERVED`,
      );
    }
    return property;
  });
  const observer = optionalString(value["observer"], `${where} observer`);
  const note = value["note"];
  if (note !== undefined && note !== null && (typeof note !== "string" || note.length > 4096)) {
    throw new RealityGraphError("invalid_observation", `${where}: note must be bounded text`);
  }
  return {
    observationId,
    nodeId,
    observedAt,
    evidenceIds,
    properties,
    ...(observer === undefined ? {} : { observer }),
    ...(note === undefined || note === null ? {} : { note }),
  };
}

/** Runtime-validate one change record (discriminated by `op`). */
export function parseChangeRecord(value: unknown): ChangeRecord {
  if (!isRecord(value)) {
    throw new RealityGraphError("invalid_change", "change: not an object");
  }
  const op = value["op"];
  switch (op) {
    case "upsert-node":
      if (value["node"] === undefined) {
        throw new RealityGraphError("invalid_change", "upsert-node: node is required");
      }
      return { op, node: parseNode(value["node"]) };
    case "delete":
    case "delete-relationship": {
      if (op === "delete") {
        const nodeId = assertStableId(value["nodeId"], "delete nodeId");
        const reason = requireReason(value["reason"], "delete");
        return { op, nodeId, reason };
      }
      const relationshipId = assertStableId(value["relationshipId"], "delete-relationship relationshipId");
      const reason = requireReason(value["reason"], "delete-relationship");
      return { op, relationshipId, reason };
    }
    case "upsert-relationship":
      if (value["relationship"] === undefined) {
        throw new RealityGraphError("invalid_change", "upsert-relationship: relationship is required");
      }
      return { op, relationship: parseRelationship(value["relationship"]) };
    case "observe":
      if (value["observation"] === undefined) {
        throw new RealityGraphError("invalid_change", "observe: observation is required");
      }
      return { op, observation: parseObservation(value["observation"]) };
    default:
      throw new RealityGraphError(
        "invalid_change",
        `unknown op (expected upsert-node|delete|upsert-relationship|delete-relationship|observe)`,
      );
  }
}

function requireReason(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096) {
    throw new RealityGraphError("invalid_change", `${what}: reason must be bounded text`);
  }
  return value;
}
