/**
 * Derived read views over the evidence mapping (AISE-012).
 *
 * Coverage/completeness views for downstream consumers
 * (AISE-013 confidence/readiness needs per-assertion evidence
 * completeness; AISE-016 review needs per-object evidence
 * bundles). Everything here is DERIVED — never stored — and
 * never mutates graph or mapping content (the AISE-011
 * "derived read views (never stored)" discipline).
 *
 * The validity verdict in coverage views comes from
 * `computeVersionValidity` — the ONE implementation of the
 * binding rule; read views never re-derive it.
 */
import type { RealityModelGraph } from "../model.js";
import { subjectKey, type EvidenceSubject } from "./subjects.js";
import { liveEvidenceForSubject, type EvidenceGraph } from "./graph.js";
import type { EvidenceRecord } from "./records.js";
import { assertionSupport, computeVersionValidity } from "./validity.js";

/** Per-entity evidence coverage (completeness read view). */
export interface EntityEvidenceCoverage {
  readonly entityId: string;
  readonly entityKind: "object" | "space";
  readonly objectClass?: string;
  /** Assertions (incl. existence) total for the entity. */
  readonly assertionCount: number;
  /** Assertions with at least one live supporting evidence record. */
  readonly assertionsWithSupport: number;
  /** CONFIRMED assertions of the entity. */
  readonly confirmedCount: number;
  /** CONFIRMED assertions whose verification is currently valid. */
  readonly confirmedValid: number;
  /** CONFIRMED assertions whose verification is currently invalidated. */
  readonly confirmedInvalidated: number;
}

/** Coverage report of one model version against one project's mapping. */
export interface EvidenceCoverageReport {
  readonly modelId: string;
  readonly version: number;
  readonly graphDigest: string;
  readonly entities: readonly EntityEvidenceCoverage[];
  readonly summary: {
    readonly entityCount: number;
    readonly assertionCount: number;
    readonly assertionsWithSupport: number;
    readonly confirmedCount: number;
    readonly confirmedValid: number;
    readonly confirmedInvalidated: number;
  };
}

interface MutableCoverage {
  entityId: string;
  entityKind: "object" | "space";
  objectClass?: string;
  assertionCount: number;
  assertionsWithSupport: number;
  confirmedCount: number;
  confirmedValid: number;
  confirmedInvalidated: number;
}

/**
 * Computes per-entity evidence coverage of one committed model
 * version (the AISE-013 completeness input). Existence
 * assertions count as assertions; support means a live link to
 * live evidence on that assertion's subject; confirmed validity
 * comes from the single validity projection.
 */
export function evidenceCoverage(
  graph: RealityModelGraph,
  version: number,
  evidence: EvidenceGraph,
): EvidenceCoverageReport {
  const support = assertionSupport(graph, version, evidence);
  const validity = computeVersionValidity(graph, version, evidence);
  const validSubjects = new Set(
    validity.entries.filter((entry) => entry.valid).map((entry) => subjectKey(entry.subject)),
  );
  const confirmedSubjects = new Set(
    validity.entries.map((entry) => subjectKey(entry.subject)),
  );

  const byEntity = new Map<string, MutableCoverage>();
  const classByObjectId = new Map(graph.objects.map((object) => [object.objectId, object.objectClass]));

  for (const entry of support) {
    const entityId = entry.subject.objectId ?? entry.subject.spaceId!;
    const entityKind: "object" | "space" = entry.subject.kind === "space-property" ? "space" : "object";
    const key = `${entityKind}:${entityId}`;
    const entity: MutableCoverage = byEntity.get(key) ?? {
      entityId,
      entityKind,
      ...(entityKind === "object" ? { objectClass: classByObjectId.get(entityId) } : {}),
      assertionCount: 0,
      assertionsWithSupport: 0,
      confirmedCount: 0,
      confirmedValid: 0,
      confirmedInvalidated: 0,
    };
    entity.assertionCount += 1;
    if (entry.liveSupportingEvidence.length > 0) {
      entity.assertionsWithSupport += 1;
    }
    const subject = subjectKey(entry.subject);
    if (confirmedSubjects.has(subject)) {
      entity.confirmedCount += 1;
      if (validSubjects.has(subject)) {
        entity.confirmedValid += 1;
      } else {
        entity.confirmedInvalidated += 1;
      }
    }
    byEntity.set(key, entity);
  }

  const entities: readonly EntityEvidenceCoverage[] = [...byEntity.values()]
    .map((entity) => ({ ...entity }))
    .sort((a, b) =>
      a.entityKind !== b.entityKind
        ? a.entityKind < b.entityKind
          ? -1
          : 1
        : a.entityId < b.entityId
          ? -1
          : a.entityId > b.entityId
            ? 1
            : 0,
    );

  return {
    modelId: graph.modelId,
    version,
    graphDigest: graph.digest,
    entities: Object.freeze([...entities]),
    summary: {
      entityCount: entities.length,
      assertionCount: entities.reduce((sum, entity) => sum + entity.assertionCount, 0),
      assertionsWithSupport: entities.reduce((sum, entity) => sum + entity.assertionsWithSupport, 0),
      confirmedCount: validity.confirmedAssertionCount,
      confirmedValid: validity.validCount,
      confirmedInvalidated: validity.invalidatedCount,
    },
  };
}

/** One assertion's evidence bundle (AISE-016 review input). */
export interface SubjectEvidenceBundle {
  readonly subject: EvidenceSubject;
  readonly description: string;
  /** Live evidence records attached to this assertion's subject. */
  readonly evidence: readonly EvidenceRecord[];
}

/**
 * The evidence bundle of one entity: live evidence records for
 * every assertion subject of the entity, canonically ordered.
 */
export function evidenceBundleForEntity(
  graph: RealityModelGraph,
  version: number,
  evidence: EvidenceGraph,
  entityId: string,
): readonly SubjectEvidenceBundle[] {
  const support = assertionSupport(graph, version, evidence);
  const bundle = support
    .filter((entry) => (entry.subject.objectId ?? entry.subject.spaceId) === entityId)
    .map((entry) => ({
      subject: entry.subject,
      description: entry.description,
      evidence: liveEvidenceForSubject(evidence, entry.subject),
    }));
  return bundle
    .sort((a, b) => (subjectKey(a.subject) < subjectKey(b.subject) ? -1 : 1))
    .map((entry) => Object.freeze(entry));
}
