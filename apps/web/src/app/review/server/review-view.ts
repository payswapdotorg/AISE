/**
 * The AISE-016 review read view: the serializable projection the
 * review workspace displays.
 *
 * The AISE-015 acceptance demanded "no browser canonical
 * authority"; the AISE-016 acceptance demands the review
 * counterpart: **every consequential displayed assertion can
 * trace to evidence/authority**. This module enforces that
 * structurally — a displayed property NEVER appears alone:
 *
 * - every property carries its epistemic passthrough (status,
 *   kind, quantity, uncertainty, confidence, method) AND its
 *   cited evidence identities AND, for each citation, the
 *   authoritative validity verdict (the AISE-012 mapping
 *   projection — VALID / UNMAPPED_CITATION / NO_LIVE_SUPPORT);
 * - every entity carries its live evidence bundle (the records
 *   the mapping actually attests for its subjects);
 * - the version carries the readiness reports (task-profiled,
 *   AISE-013) and the authority digests (graph, mapping) the
 *   whole view was computed from — the trace anchors;
 * - the workspace carries the registered evidence inventory
 *   (content-pinned records with their source pins, verbatim).
 *
 * Everything here is DERIVED, READ-ONLY data over the
 * authorities (model store, evidence service, readiness
 * computation). No mutation affordance exists in the view
 * types; the single governed write channel is the decide route
 * (`applyDecision`), which produces a NEW committed version —
 * never a view edit.
 */
import type {
  EvidenceRecord,
  EvidenceSubject,
} from "@aise/engineering-model";
import type { ReadinessReport, TaskProfileRecord } from "@aise/backend-assurance";
import { projectModelVersion, type ModelVersionView, type PropertyView } from "@/server/model-view";
import { getVersion, listModels, listVersions } from "@/server/model-store";
import { readinessReports, reviewStore, reviewTaskProfiles } from "./review-store";

// --- view types ----------------------------------------------------------------

/** One registered evidence record (read view — source pin verbatim). */
export interface ReviewEvidenceView {
  readonly evidenceId: string;
  readonly kind: string;
  /** The source-pin summary (who/what/when — the human trace). */
  readonly sourceKind: string;
  readonly sourceSummary: string;
  readonly contentHash: string;
  readonly recordedBy: string;
  readonly recordedAt: string;
  /** Live state (retracted evidence is surfaced, never counted as support). */
  readonly retracted: boolean;
}

/** One cited-evidence trace of one displayed property. */
export interface CitationTraceView {
  readonly evidenceId: string;
  /** The authoritative mapping verdict for this citation. */
  readonly status: "VALID" | "UNMAPPED_CITATION";
}

/** One displayed property: the assertion + its evidence trace. */
export interface ReviewPropertyView extends PropertyView {
  /** Model probability on [0, 1] — a SEPARATE axis from uncertainty (passthrough). */
  readonly confidence?: number;
  /** Authoritative live evidence for this assertion's subject (the mapping's attestation). */
  readonly supportingEvidence: readonly string[];
  /** Per-citation verdicts (every cited ref, never dropped). */
  readonly citationTraces: readonly CitationTraceView[];
  /** The live support count backing the subject (0 = unsupported). */
  readonly liveSupportCount: number;
}

/** One selectable review entity (object or space). */
export interface ReviewEntityView {
  readonly entityId: string;
  readonly entityKind: "object" | "space";
  readonly label: string;
  readonly sublabel: string;
  /** Objects only — epistemic passthrough. */
  readonly epistemicState?: string;
  readonly properties: readonly ReviewPropertyView[];
  /** Existence support (objects): live evidence on the existence subject. */
  readonly existenceSupport: readonly string[];
}

/** One readiness report (read view). */
export interface ReviewReadinessView {
  readonly taskId: string;
  readonly intent: string;
  readonly profile: string;
  readonly verdict: "READY" | "NOT_READY";
  readonly blockingDimensions: readonly string[];
  /** Per-dimension verdicts (machine-readable trace of the verdict). */
  readonly dimensions: readonly { readonly dimension: string; readonly verdict: string }[];
}

/** The full review workspace view (one model, one version). */
export interface ReviewWorkspaceView {
  readonly modelId: string;
  readonly projectId: string;
  readonly version: number;
  /** The versions the workspace can review (committed chain). */
  readonly versions: readonly number[];
  readonly graphDigest: string;
  /** The authority digests the view was computed from (trace anchors). */
  readonly mappingDigest: string | undefined;
  readonly entities: readonly ReviewEntityView[];
  /** Registered evidence inventory (all records, live + retracted). */
  readonly evidence: readonly ReviewEvidenceView[];
  readonly readiness: readonly ReviewReadinessView[];
  /** The task profiles the readiness reports were computed for. */
  readonly taskProfiles: readonly {
    readonly taskId: string;
    readonly intent: string;
    readonly profile: string;
    readonly description?: string;
  }[];
  /** Epistemic composition (honest counts — never collapsed). */
  readonly epistemicSummary: ModelVersionView["epistemicSummary"];
  /** Verification-validity summary of this version. */
  readonly validitySummary: {
    readonly confirmedAssertionCount: number;
    readonly validCount: number;
    readonly invalidatedCount: number;
    /** The invalidated subjects (subject keys) — surfaced, never hidden. */
    readonly invalidatedSubjects: readonly string[];
  };
}

// --- projection ----------------------------------------------------------------

/** Projects the review workspace view of one committed version (fail closed). */
export function projectReviewWorkspace(modelId: string, version: number): ReviewWorkspaceView {
  const stored = getVersion(modelId, version);
  if (stored === undefined) {
    throw new ReviewViewError("unknown_version", `version ${version} of "${modelId}" is not committed`);
  }
  const evidence = reviewStore().evidence;
  const projectId = stored.graph.projectId;
  const model = projectModelVersion(stored.graph, stored.record.version);
  const mapping = evidence.snapshot(projectId);
  const validity = evidence.computeVersionValidity(modelId, version);
  const reports = readinessReports(modelId, version);

  // --- the evidence inventory (content-pinned records, verbatim pins) ------
  const evidenceViews: ReviewEvidenceView[] = evidence
    .listEvidence(projectId)
    .map((entry) => projectEvidenceRecord(entry.record, entry.retraction !== undefined));

  // --- validity lookup: subject key → entry --------------------------------
  const validityBySubject = new Map(validity.entries.map((entry) => [subjectKeyOf(entry.subject), entry]));

  // --- entities with their property/evidence traces ------------------------
  const graph = stored.graph;
  const confidenceOf = (entityId: string, key: string): number | undefined => {
    const object = graph.objects.find((candidate) => candidate.objectId === entityId);
    if (object !== undefined) {
      return object.properties.find((assertion) => assertion.key === key)?.confidence;
    }
    const space = graph.spaces.find((candidate) => candidate.spaceId === entityId);
    return (space?.properties ?? []).find((assertion) => assertion.key === key)?.confidence;
  };

  const spaceEntities = model.spaces.map((space): ReviewEntityView => ({
    entityId: space.spaceId,
    entityKind: "space",
    label: space.name ?? space.spaceId,
    sublabel: `space · ${space.kind}`,
    properties: space.properties.map((property) =>
      projectReviewProperty(
        property,
        confidenceOf(space.spaceId, property.key),
        space.spaceId,
        "space-property",
        modelId,
        version,
        projectId,
        validityBySubject,
      ),
    ),
    existenceSupport: [],
  }));

  const objectEntities = model.objects.map((object): ReviewEntityView => ({
    entityId: object.objectId,
    entityKind: "object",
    label: object.name ?? object.objectId,
    sublabel: `object · ${object.objectClass}`,
    epistemicState: object.epistemicState,
    properties: object.properties.map((property) =>
      projectReviewProperty(
        property,
        confidenceOf(object.objectId, property.key),
        object.objectId,
        "object-property",
        modelId,
        version,
        projectId,
        validityBySubject,
      ),
    ),
    existenceSupport: liveEvidenceFor(
      projectId,
      { kind: "object-existence", modelId, version, objectId: object.objectId },
    ),
  }));

  // Canonical order: spaces first (the container), then objects (stable graph order).
  const entities = [...spaceEntities, ...objectEntities];

  return {
    modelId,
    projectId,
    version,
    versions: listVersions(modelId).map((entry) => entry.version),
    graphDigest: model.digest,
    mappingDigest: mapping?.digest,
    entities,
    evidence: evidenceViews,
    readiness: reports.map(projectReadiness),
    taskProfiles: reviewTaskProfiles().map((profile) => projectTaskProfile(profile)),
    epistemicSummary: model.epistemicSummary,
    validitySummary: {
      confirmedAssertionCount: validity.confirmedAssertionCount,
      validCount: validity.validCount,
      invalidatedCount: validity.invalidatedCount,
      invalidatedSubjects: [...validity.invalidatedSubjects],
    },
  };
}

/** One displayed property with its full evidence trace (the acceptance core). */
function projectReviewProperty(
  property: PropertyView,
  confidence: number | undefined,
  entityId: string,
  subjectKind: "space-property" | "object-property",
  modelId: string,
  version: number,
  projectId: string,
  validityBySubject: Map<string, { valid: boolean; liveSupportingEvidence: readonly string[]; citedEvidenceRefs: readonly string[] }>,
): ReviewPropertyView {
  const subject: EvidenceSubject =
    subjectKind === "space-property"
      ? { kind: "space-property", modelId, version, spaceId: entityId, propertyKey: property.key }
      : { kind: "object-property", modelId, version, objectId: entityId, propertyKey: property.key };
  const entry = validityBySubject.get(subjectKeyOf(subject));
  // Live support is authoritative regardless of CONFIRMED status (mapping attestation).
  const liveSupport = entry?.liveSupportingEvidence ?? liveEvidenceFor(projectId, subject);
  const citedRefs = property.evidenceRefs ?? [];
  // Only CONFIRMED assertions have a validity verdict; other statuses report their citations honestly.
  const citationsValid = entry?.valid ?? true;
  const citationTraces: CitationTraceView[] = citedRefs.map((evidenceId) => ({
    evidenceId,
    // A citation is VALID iff the authoritative mapping attests it for this subject.
    status: liveSupport.includes(evidenceId) && citationsValid ? "VALID" : "UNMAPPED_CITATION",
  }));
  return {
    ...property,
    ...(confidence !== undefined ? { confidence } : {}),
    supportingEvidence: [...liveSupport],
    citationTraces,
    liveSupportCount: liveSupport.length,
  };
}

/** Live evidence identities for one subject (the mapping's attestation). */
function liveEvidenceFor(projectId: string, subject: EvidenceSubject): readonly string[] {
  const evidence = reviewStore().evidence;
  return evidence
    .evidenceForSubject(projectId, subject)
    .filter((record) => evidence.getEvidence(projectId, record.evidenceId)?.retraction === undefined)
    .map((record) => record.evidenceId);
}

/** One evidence record view (source pin verbatim — never re-derived). */
function projectEvidenceRecord(record: EvidenceRecord, retracted: boolean): ReviewEvidenceView {
  return {
    evidenceId: record.evidenceId,
    kind: record.kind,
    sourceKind: record.source.kind,
    sourceSummary: describeSource(record),
    contentHash: record.contentHash,
    recordedBy: record.recordedBy,
    recordedAt: record.recordedAt,
    retracted,
  };
}

/** The human trace summary of one evidence source (verbatim fields). */
function describeSource(record: EvidenceRecord): string {
  const source = record.source;
  switch (source.kind) {
    case "capture":
      return `capture ${source.assetType.toLowerCase()} · session ${source.sessionId} · asset ${source.assetId} · ${source.byteSize}B · captured ${source.acquisition.capturedAt ?? "unknown time"}`;
    case "manual-measurement":
      return `manual measurement ${source.value} ${source.unit} · ${source.method} · by ${source.measuredBy} · ${source.measuredAt}`;
    case "document":
      return `document ${source.documentId}${source.title !== undefined ? ` "${source.title}"` : ""}${source.issuedBy !== undefined ? ` · issued by ${source.issuedBy}` : ""}${source.issuedAt !== undefined ? ` · ${source.issuedAt}` : ""}`;
    case "human-observation":
      return `observation by ${source.observer} · ${source.observedAt} · "${source.statement}"`;
    default:
      return `source kind ${String((source as { kind?: string }).kind ?? "unknown")}`;
  }
}

/** One readiness report view. */
function projectReadiness(report: ReadinessReport): ReviewReadinessView {
  return {
    taskId: report.taskId,
    intent: report.intent,
    profile: report.assuranceProfile,
    verdict: report.verdict,
    blockingDimensions: [...report.blockingDimensions],
    dimensions: report.dimensions.map((dimension) => ({
      dimension: dimension.dimension,
      verdict: dimension.verdict,
    })),
  };
}

/** One task profile view. */
function projectTaskProfile(profile: TaskProfileRecord): ReviewWorkspaceView["taskProfiles"][number] {
  return {
    taskId: profile.taskId,
    intent: profile.intent,
    profile: profile.profile,
    ...(profile.description !== undefined ? { description: profile.description } : {}),
  };
}

/** The stable subject key (mirrors the engineering-model canonical order). */
function subjectKeyOf(subject: EvidenceSubject): string {
  const parts: string[] = [subject.kind, subject.modelId, `v${subject.version}`];
  if (subject.kind === "object-existence" || subject.kind === "object-property") {
    parts.push(`obj:${subject.objectId}`);
  } else if (subject.kind === "space-property") {
    parts.push(`spc:${subject.spaceId}`);
  }
  if (subject.kind === "object-property" || subject.kind === "space-property") {
    parts.push(`key:${subject.propertyKey}`);
  }
  return parts.join("|");
}

/** A typed review-view failure (fail closed; never a silent fallback). */
export class ReviewViewError extends Error {
  readonly code: "unknown_model" | "unknown_version";

  constructor(code: "unknown_model" | "unknown_version", message: string) {
    super(message);
    this.name = "ReviewViewError";
    this.code = code;
  }
}

/** The reviewable model identifiers (the golden workspace serves one). */
export function reviewableModels(): readonly string[] {
  const models = listModels().filter((model) => model.projectId === "project-golden-room");
  return models.map((model) => model.modelId);
}
