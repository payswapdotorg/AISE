/**
 * The historical change report and its fail-closed boundary
 * (AISE-031).
 *
 * `compareModelVersions` is the pure entry point: it re-validates
 * both pinned versions (structural validation, authoritative
 * commit-producer validation, and digest re-derivation — tampered
 * or under-provenanced inputs fail closed), decomposes the
 * difference into deterministic change records, optionally
 * compares the two versions' evidence-validity projections, and
 * assembles the content-bound report.
 *
 * The report digest binds the full ordered record list (each
 * record's identity already binds its own content — the validator
 * re-derives both levels). Read-only guarantee: no input graph,
 * version record, or evidence graph is ever mutated.
 */
import {
  canonicalJsonString,
  graphContentDigest,
  sha256Hex,
  validateModelProvenance,
  validateRealityGraph,
  type EvidenceGraph,
  type ModelProvenance,
  type ModelVersionRecord,
  type RealityModelGraph,
} from "@aise/engineering-model";
import { HistoryError } from "./errors.js";
import { compareObjects, compareRelationships, compareSpaces } from "./compare.js";
import { compareEvidenceValidity, validityProjection } from "./evidence.js";
import {
  CATEGORY_RANK,
  compareRecords,
  type ChangeCategory,
  type ChangeRecord,
} from "./records.js";

/** One side of the comparison: the committed version record, its graph, and its authoritative commit producer. */
export interface VersionedGraph {
  readonly record: ModelVersionRecord;
  readonly graph: RealityModelGraph;
  /**
   * The authoritative producer the source version was committed
   * under (fail-closed validated). Space/relationship records carry
   * this version producer; object-family records carry the richer
   * per-object producer provenance of the graphs themselves.
   */
  readonly producer: ModelProvenance;
}

/** Evidence input: BOTH versions' evidence mapping states (or neither). */
export interface EvidencePair {
  readonly from: EvidenceGraph;
  readonly to: EvidenceGraph;
}

/** Comparison input (fail-closed boundary). */
export interface CompareInput {
  readonly from: VersionedGraph;
  readonly to: VersionedGraph;
  readonly evidence?: EvidencePair;
}

/** The pinned identity of one compared version. */
export interface VersionPin {
  readonly version: number;
  readonly parentVersion?: number;
  readonly digest: string;
  readonly committedAt: string;
}

/** The deterministic version-to-version change report. */
export interface HistoricalChangeReport {
  readonly kind: "historical-change-report";
  readonly modelId: string;
  readonly from: VersionPin;
  readonly to: VersionPin;
  readonly records: readonly ChangeRecord[];
  readonly summary: {
    readonly total: number;
    readonly byCategory: readonly { readonly category: ChangeCategory; readonly count: number }[];
    readonly objectsAdded: number;
    readonly objectsRemoved: number;
    readonly objectsChanged: number;
    readonly identical: boolean;
  };
  readonly limitations: readonly string[];
  readonly digest: string;
}

export const HISTORICAL_CHANGE_LIMITATIONS = Object.freeze([
  "Added/removed records state identity facts only; no correspondence between a removed and an added object is ever inferred (AISE-011 identity discipline: identity is lineage).",
  "Quantity uncertainties pass through verbatim per side and are never recomputed, converted, or folded into confidence; confidence (a model probability, AC-070) is reported on its own axis.",
  "Derived quantity deltas exist only for same-unit comparisons; combined uncertainties exist only when both sides state standard uncertainties (RSS).",
  "Per-record provenance is the producer summary (serviceId, method, methodVersion) of the authoritative source: object-family records carry the per-object producer provenance of the compared graphs; space/relationship records (spaces and relationships carry no per-entity provenance in the Reality Graph v1) carry the compared versions' commit producers, supplied and fail-closed validated at the boundary — never a synthesized authority.",
  "Evidence-validity records carry no producer summary: a validity flip is derived from the two pinned evidence graphs (the evidence subsystem is the authority, with its own recordedBy/linkedBy/retractedBy lineage inside those graphs); pinning a version producer on a derived validity flip would misattribute it. All other change kinds carry provenance.",
  "Evidence-validity records cover logical assertions CONFIRMED in both compared versions only; first-time confirmations are property/object change records, not validity changes.",
  "Non-decomposed fields in v1 — assertion metadata (method label, verifiedBy/verifiedAt) and space kind changes — are covered by the changed content identity but not decomposed into dedicated records; the summary's identical flag reflects the pinned version digests, so such changes are never silently identical. Optional structured-geometry quantities ARE decomposed into their own added/removed records.",
  "The comparison is read-only: the canonical Reality Graph and the evidence mapping are never mutated (fail-closed, no partial output).",
  "The report states WHAT changed, never WHY: cause attribution belongs to provenance and review, not to derived comparison facts.",
]);

/** Size caps (fail-closed; never truncate). */
export const HISTORY_LIMITS = Object.freeze({
  maxRecords: 5000,
});

/** Validates one side of the comparison (structural + producer + digest re-derivation). */
function validateSide(side: VersionedGraph, label: "from" | "to"): void {
  if (side === null || typeof side !== "object" || typeof side.record !== "object" || typeof side.graph !== "object") {
    throw new HistoryError("INPUT_INVALID", `${label} must carry a version record and a graph`, {
      details: { field: label },
    });
  }
  const { record, graph, producer } = side;
  if (record === undefined || graph === undefined) {
    throw new HistoryError("INPUT_INVALID", `${label} must carry a version record and a graph`, {
      details: { field: label },
    });
  }
  // The authoritative source-version producer (fail-closed: an absent
  // or malformed producer is a gap in provenance, never a default).
  try {
    if (producer === undefined) {
      throw new Error("producer is required (the authoritative source-version producer)");
    }
    validateModelProvenance(producer);
  } catch (error) {
    throw new HistoryError("INPUT_INVALID", `${label}.producer is not a valid ModelProvenance: ${String((error as Error).message)}`, {
      details: { field: `${label}.producer` },
    });
  }
  if (typeof record.modelId !== "string" || record.modelId.length === 0) {
    throw new HistoryError("INPUT_INVALID", `${label}.record.modelId must be a non-empty string`);
  }
  if (!Number.isInteger(record.version) || record.version < 1) {
    throw new HistoryError("VERSION_INVALID", `${label}.record.version must be a positive integer`, {
      details: { field: `${label}.record.version`, value: String(record.version) },
    });
  }
  if (typeof record.committedAt !== "string" || record.committedAt.length === 0) {
    throw new HistoryError("VERSION_INVALID", `${label}.record.committedAt must be a non-empty RFC 3339 instant`);
  }
  if (record.parentVersion !== undefined && (!Number.isInteger(record.parentVersion) || record.parentVersion < 1)) {
    throw new HistoryError("VERSION_INVALID", `${label}.record.parentVersion must be a positive integer when present`);
  }

  // Fail-closed structural re-validation of the graph content.
  try {
    validateRealityGraph(graph);
  } catch (error) {
    throw new HistoryError("INPUT_INVALID", `${label}.graph failed structural validation: ${String((error as Error).message)}`, {
      details: { field: `${label}.graph` },
    });
  }

  // Digest re-derivation: the pinned record must describe THIS content.
  const derived = graphContentDigest(graph.modelId, graph.projectId, graph.spaces, graph.objects, graph.relationships);
  if (derived !== record.digest || derived !== graph.digest) {
    throw new HistoryError("DIGEST_MISMATCH", `${label} version pin does not match the graph content (tampered or mismatched input)`, {
      details: { field: `${label}.record.digest`, value: String(record.digest) },
    });
  }
  if (record.modelId !== graph.modelId) {
    throw new HistoryError("VERSION_INVALID", `${label} record and graph disagree on modelId`, {
      details: { field: `${label}.modelId`, value: `${record.modelId} vs ${graph.modelId}` },
    });
  }
  if (record.objectCount !== graph.objects.length || record.spaceCount !== graph.spaces.length || record.relationshipCount !== graph.relationships.length) {
    throw new HistoryError("VERSION_INVALID", `${label} record content counts disagree with the graph`, {
      details: { field: `${label}.record` },
    });
  }
}

/** The pure comparison entry point (deterministic, read-only, fail-closed). */
export function compareModelVersions(input: CompareInput): HistoricalChangeReport {
  if (input === null || typeof input !== "object") {
    throw new HistoryError("INPUT_INVALID", "comparison input must be a record");
  }
  validateSide(input.from, "from");
  validateSide(input.to, "to");

  const modelIds = new Set([input.from.record.modelId, input.to.record.modelId, input.from.graph.modelId, input.to.graph.modelId]);
  if (modelIds.size !== 1) {
    throw new HistoryError("MODEL_MISMATCH", "both versions must belong to the same model", {
      details: { value: [...modelIds].join(" vs ") },
    });
  }
  const projectIds = new Set([input.from.graph.projectId, input.to.graph.projectId]);
  if (projectIds.size !== 1) {
    throw new HistoryError("MODEL_MISMATCH", "both versions must belong to the same project");
  }
  if (input.from.record.version >= input.to.record.version) {
    throw new HistoryError("VERSION_INVALID", "the comparison runs from the earlier version to the later version (strictly ascending)", {
      details: { value: `${input.from.record.version} -> ${input.to.record.version}` },
    });
  }

  const evidence = input.evidence;
  if (evidence !== undefined) {
    if (evidence.from === undefined || evidence.to === undefined) {
      throw new HistoryError("EVIDENCE_ASYMMETRIC", "evidence input must carry BOTH versions' mapping states (from and to)");
    }
    const evidenceProjects = new Set([evidence.from.projectId, evidence.to.projectId, input.from.graph.projectId]);
    if (evidenceProjects.size !== 1) {
      throw new HistoryError("INPUT_INVALID", "evidence graphs must belong to the compared project");
    }
  }

  const from = input.from;
  const to = input.to;

  const records: ChangeRecord[] = [
    ...compareObjects(from.graph, to.graph),
    ...compareRelationships(from, to),
    ...compareSpaces(from, to),
  ];
  if (evidence !== undefined) {
    records.push(
      ...compareEvidenceValidity(
        validityProjection(from.graph, from.record.version, evidence.from),
        validityProjection(to.graph, to.record.version, evidence.to),
      ),
    );
  }
  records.sort(compareRecords);

  if (records.length > HISTORY_LIMITS.maxRecords) {
    throw new HistoryError("LIMIT_EXCEEDED", `change record count ${records.length} exceeds the cap ${HISTORY_LIMITS.maxRecords} — fail closed, never truncated`, {
      details: { field: "records", value: String(records.length) },
    });
  }

  const objectsChanged = countChangedObjects(from.graph, to.graph);
  const summary = buildSummary(records, from, to, objectsChanged);

  const body = {
    kind: "historical-change-report" as const,
    modelId: from.record.modelId,
    from: pinOf(from.record),
    to: pinOf(to.record),
    records,
    summary,
    limitations: HISTORICAL_CHANGE_LIMITATIONS,
  };
  const report: HistoricalChangeReport = Object.freeze({
    ...body,
    digest: reportDigest(body),
  });
  return report;
}

/** The content-bound digest of a report body. */
export function reportDigest(body: Omit<HistoricalChangeReport, "digest">): string {
  return sha256Hex(canonicalJsonString(body));
}

function pinOf(record: ModelVersionRecord): VersionPin {
  const pin: VersionPin = {
    version: record.version,
    digest: record.digest,
    committedAt: record.committedAt,
  };
  return record.parentVersion !== undefined ? { ...pin, parentVersion: record.parentVersion } : pin;
}

/** Objects whose identity persisted but whose content hash changed (AISE-011 diff semantics). */
function countChangedObjects(from: RealityModelGraph, to: RealityModelGraph): number {
  const before = new Map(from.objects.map((object) => [object.objectId, object.contentHash] as const));
  let changed = 0;
  for (const object of to.objects) {
    const previousHash = before.get(object.objectId);
    if (previousHash !== undefined && previousHash !== object.contentHash) {
      changed += 1;
    }
  }
  return changed;
}

function buildSummary(
  records: readonly ChangeRecord[],
  from: VersionedGraph,
  to: VersionedGraph,
  objectsChanged: number,
): HistoricalChangeReport["summary"] {
  const counts = new Map<ChangeCategory, number>();
  for (const record of records) {
    counts.set(record.category, (counts.get(record.category) ?? 0) + 1);
  }
  const byCategory = (Object.keys(CATEGORY_RANK) as ChangeCategory[])
    .filter((category) => (counts.get(category) ?? 0) > 0)
    .map((category) => ({ category, count: counts.get(category)! }));

  let objectsAdded = 0;
  let objectsRemoved = 0;
  const beforeIds = new Set(from.graph.objects.map((object) => object.objectId));
  const afterIds = new Set(to.graph.objects.map((object) => object.objectId));
  for (const objectId of afterIds) {
    if (!beforeIds.has(objectId)) objectsAdded += 1;
  }
  for (const objectId of beforeIds) {
    if (!afterIds.has(objectId)) objectsRemoved += 1;
  }

  return Object.freeze({
    total: records.length,
    byCategory: Object.freeze(byCategory),
    objectsAdded,
    objectsRemoved,
    objectsChanged,
    // Honest definition: identical VERSION CONTENT (the pinned digests),
    // not "no decomposed records" — non-decomposed fields can change
    // without producing records (documented limitation).
    identical: from.record.digest === to.record.digest,
  });
}

/** A minimal report constructor for validator tests (records must already be built). */
export function assembleReportForTest(input: {
  modelId: string;
  from: VersionPin;
  to: VersionPin;
  records: readonly ChangeRecord[];
}): HistoricalChangeReport {
  const records = [...input.records].sort(compareRecords);
  const objectsChanged = records.filter(
    (record) =>
      record.category === "geometry" ||
      record.category === "property" ||
      (record.category === "object" && record.kind !== "object-added" && record.kind !== "object-removed"),
  ).length;
  const summary = Object.freeze({
    total: records.length,
    byCategory: Object.freeze([]),
    objectsAdded: 0,
    objectsRemoved: 0,
    objectsChanged,
    identical: input.from.digest === input.to.digest,
  });
  const body = {
    kind: "historical-change-report" as const,
    modelId: input.modelId,
    from: input.from,
    to: input.to,
    records,
    summary,
    limitations: HISTORICAL_CHANGE_LIMITATIONS,
  };
  return Object.freeze({ ...body, digest: reportDigest(body) });
}
