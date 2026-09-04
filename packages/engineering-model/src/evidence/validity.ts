/**
 * Verification-validity projection (AISE-012).
 *
 * Requirements:
 * - AC-062: "A verified assertion without required provenance is
 *   rejected."
 * - AC-063: "Removing required evidence invalidates
 *   corresponding verification state."
 * - architecture-lock §1: "The Evidence subsystem is the
 *   authoritative provenance mapping for engineering
 *   assertions."
 * - architecture-lock §2: "Removing provenance must invalidate
 *   the assertion's verified status."
 *
 * **Binding semantics (v1, documented for architect review).**
 * The Reality Graph is immutable committed history: an
 * assertion's `CONFIRMED` status and its cited `evidenceRefs`
 * never change after commit. The evidence subsystem owns the
 * authoritative mapping (links), which CAN change — by
 * append-only retraction. A CONFIRMED assertion's verification
 * state is therefore a DERIVED read view:
 *
 * > A CONFIRMED assertion (value assertion or `CONFIRMED_ABSENT`
 * > presence assertion) is verification-VALID in a committed
 * > version iff (a) at least one LIVE link attaches evidence to
 * > its subject, and (b) EVERY evidence identity the assertion
 * > cites is attached to that subject by a live link to live
 * > (non-retracted) evidence.
 *
 * Condition (b) makes the mapping authoritative: a citation the
 * evidence subsystem does not attest is unresolved provenance.
 * Retracting evidence or retracting a link flips the projection
 * to INVALIDATED (AC-063) — the canonical graph itself remains
 * untouched (immutable history; lock §2 "reprocessing cannot
 * erase prior evidence"). Downstream authorities (AISE-013
 * readiness, AISE-014 verification engine, AISE-016 review)
 * consume this projection; nothing in the evidence subsystem
 * mutates graph content — that is the no-second-canonical-
 * authority guarantee, enforced structurally and by tests.
 *
 * Object-existence subjects cite no refs (RealityObject carries
 * `provenance`, not `evidenceRefs`), so their rule is (a) alone:
 * a CONFIRMED existence needs at least one live attested
 * evidence link.
 */
import type { RealityModelGraph } from "../model.js";
import type { EpistemicState, ModelPresence } from "../epistemic.js";
import { validateSubject, subjectKey, type EvidenceSubject } from "./subjects.js";
import type { EvidenceGraph } from "./graph.js";
import { liveLinks } from "./graph.js";

/** Why a CONFIRMED assertion's verification is invalidated. */
export type InvalidationReason =
  /** No live link attaches evidence to the subject. */
  | "NO_LIVE_SUPPORT"
  /** A cited evidence reference is not covered by live support. */
  | "UNMAPPED_CITATION";

/** Validity of one CONFIRMED assertion's verification state. */
export interface ConfirmedAssertionValidity {
  readonly subject: EvidenceSubject;
  /** Human-facing subject description (reports). */
  readonly description: string;
  /** The evidence identities the assertion itself cites. */
  readonly citedEvidenceRefs: readonly string[];
  /** Live evidence identities attached to the subject (attested support). */
  readonly liveSupportingEvidence: readonly string[];
  /** Live support that is retracted evidence — surfaced, never counted. */
  readonly retractedSupportingEvidence: readonly string[];
  readonly valid: boolean;
  /** Present iff `valid` is false; every applicable reason. */
  readonly invalidationReasons: readonly InvalidationReason[];
}

/** The validity projection of one committed model version. */
export interface VersionValidityReport {
  readonly modelId: string;
  readonly version: number;
  /** Digest of the graph the projection was computed from. */
  readonly graphDigest: string;
  readonly confirmedAssertionCount: number;
  readonly validCount: number;
  readonly invalidatedCount: number;
  /** Every CONFIRMED assertion of the version, with its validity. */
  readonly entries: readonly ConfirmedAssertionValidity[];
  /** Subject keys of invalidated assertions (quick index for consumers). */
  readonly invalidatedSubjects: readonly string[];
}

/** One CONFIRMED assertion found in a graph (enumeration step). */
export interface ConfirmedAssertionRef {
  readonly subject: EvidenceSubject;
  readonly description: string;
  readonly citedEvidenceRefs: readonly string[];
}

/**
 * Enumerates every CONFIRMED assertion of a committed graph with
 * the subject that evidence must attach to. Version-scoped:
 * subjects pin the given (modelId, version).
 */
export function listConfirmedAssertionSubjects(
  graph: RealityModelGraph,
  version: number,
): readonly ConfirmedAssertionRef[] {
  const refs: ConfirmedAssertionRef[] = [];
  for (const object of graph.objects) {
    if (object.epistemicState === "CONFIRMED") {
      refs.push({
        subject: {
          kind: "object-existence",
          modelId: graph.modelId,
          version,
          objectId: object.objectId,
        },
        description: `object "${object.objectId}" (${object.objectClass}, existence)`,
        citedEvidenceRefs: [],
      });
    }
    for (const assertion of object.properties) {
      if (assertion.status === "CONFIRMED") {
        refs.push({
          subject: {
            kind: "object-property",
            modelId: graph.modelId,
            version,
            objectId: object.objectId,
            propertyKey: assertion.key,
          },
          description: `object "${object.objectId}" property "${assertion.key}"`,
          citedEvidenceRefs: [...(assertion.evidenceRefs ?? [])],
        });
      }
    }
  }
  for (const space of graph.spaces) {
    for (const assertion of space.properties ?? []) {
      if (assertion.status === "CONFIRMED") {
        refs.push({
          subject: {
            kind: "space-property",
            modelId: graph.modelId,
            version,
            spaceId: space.spaceId,
            propertyKey: assertion.key,
          },
          description: `space "${space.spaceId}" property "${assertion.key}"`,
          citedEvidenceRefs: [...(assertion.evidenceRefs ?? [])],
        });
      }
    }
  }
  return refs.sort((a, b) => compare(subjectKey(a.subject), subjectKey(b.subject)));
}

/**
 * Computes the verification-validity projection of one committed
 * model version against one project's evidence mapping. Pure
 * read view: no input is mutated; the report is fresh data.
 */
export function computeVersionValidity(
  graph: RealityModelGraph,
  version: number,
  evidence: EvidenceGraph,
): VersionValidityReport {
  const retractedEvidence = new Set(
    evidence.evidenceRetractions.map((retraction) => retraction.evidenceId),
  );
  const retractedLinks = new Set(
    evidence.linkRetractions.map((retraction) => retraction.linkId),
  );

  // Live support per subject, from live links to non-retracted evidence.
  const liveSupportBySubject = new Map<string, Set<string>>();
  const retractedSupportBySubject = new Map<string, Set<string>>();
  for (const link of evidence.links) {
    if (retractedLinks.has(link.linkId)) {
      continue;
    }
    const key = subjectKey(link.subject);
    const support = liveSupportBySubject.get(key) ?? new Set<string>();
    const retracted = retractedSupportBySubject.get(key) ?? new Set<string>();
    if (retractedEvidence.has(link.evidenceId)) {
      retracted.add(link.evidenceId);
    } else {
      support.add(link.evidenceId);
    }
    liveSupportBySubject.set(key, support);
    retractedSupportBySubject.set(key, retracted);
  }

  const entries: ConfirmedAssertionValidity[] = [];
  for (const ref of listConfirmedAssertionSubjects(graph, version)) {
    const key = subjectKey(ref.subject);
    const support = [...(liveSupportBySubject.get(key) ?? new Set<string>())].sort();
    const retractedSupport = [...(retractedSupportBySubject.get(key) ?? new Set<string>())].sort();
    const reasons: InvalidationReason[] = [];
    if (support.length === 0) {
      reasons.push("NO_LIVE_SUPPORT");
    }
    const unmapped = ref.citedEvidenceRefs.filter((cited) => !support.includes(cited));
    if (unmapped.length > 0) {
      reasons.push("UNMAPPED_CITATION");
    }
    entries.push({
      subject: ref.subject,
      description: ref.description,
      citedEvidenceRefs: [...ref.citedEvidenceRefs].sort(),
      liveSupportingEvidence: support,
      retractedSupportingEvidence: retractedSupport,
      valid: reasons.length === 0,
      invalidationReasons: reasons,
    });
  }

  const invalidated = entries.filter((entry) => !entry.valid);
  return {
    modelId: graph.modelId,
    version,
    graphDigest: graph.digest,
    confirmedAssertionCount: entries.length,
    validCount: entries.length - invalidated.length,
    invalidatedCount: invalidated.length,
    entries: Object.freeze([...entries]),
    invalidatedSubjects: Object.freeze(invalidated.map((entry) => subjectKey(entry.subject))),
  };
}

/** Live support per assertion subject of a graph (completeness view). */
export interface AssertionSupport {
  readonly subject: EvidenceSubject;
  readonly description: string;
  /** The assertion's epistemic status (passthrough — never changed). */
  readonly status: EpistemicState;
  /** Presence state for valueless assertions (read view, passthrough). */
  readonly presence?: ModelPresence;
  readonly citedEvidenceRefs: readonly string[];
  readonly liveSupportingEvidence: readonly string[];
}

/**
 * Live support per assertion subject of a graph (the
 * evidence-completeness input for AISE-013). Non-confirmed
 * assertions are reported with their live support but carry no
 * validity verdict (only verified assertions can be
 * invalidated). Live support means live links to live
 * (non-retracted) evidence.
 */
export function assertionSupport(
  graph: RealityModelGraph,
  version: number,
  evidence: EvidenceGraph,
): readonly AssertionSupport[] {
  const retractedEvidence = new Set(
    evidence.evidenceRetractions.map((retraction) => retraction.evidenceId),
  );
  const supportBySubject = new Map<string, Set<string>>();
  for (const link of liveLinks(evidence)) {
    if (retractedEvidence.has(link.evidenceId)) {
      continue;
    }
    const key = subjectKey(link.subject);
    const support = supportBySubject.get(key) ?? new Set<string>();
    support.add(link.evidenceId);
    supportBySubject.set(key, support);
  }

  const result: AssertionSupport[] = [];
  const push = (
    subject: EvidenceSubject,
    description: string,
    status: EpistemicState,
    presence: ModelPresence | undefined,
    cited: readonly string[],
  ): void => {
    const key = subjectKey(subject);
    result.push({
      subject,
      description,
      status,
      ...(presence !== undefined ? { presence } : {}),
      citedEvidenceRefs: [...cited].sort(),
      liveSupportingEvidence: [...(supportBySubject.get(key) ?? new Set<string>())].sort(),
    });
  };

  for (const object of graph.objects) {
    push(
      {
        kind: "object-existence",
        modelId: graph.modelId,
        version,
        objectId: object.objectId,
      },
      `object "${object.objectId}" (${object.objectClass}, existence)`,
      object.epistemicState,
      undefined,
      [],
    );
    for (const assertion of object.properties) {
      push(
        {
          kind: "object-property",
          modelId: graph.modelId,
          version,
          objectId: object.objectId,
          propertyKey: assertion.key,
        },
        `object "${object.objectId}" property "${assertion.key}"`,
        assertion.status,
        assertion.presence,
        assertion.evidenceRefs ?? [],
      );
    }
  }
  for (const space of graph.spaces) {
    for (const assertion of space.properties ?? []) {
      push(
        {
          kind: "space-property",
          modelId: graph.modelId,
          version,
          spaceId: space.spaceId,
          propertyKey: assertion.key,
        },
        `space "${space.spaceId}" property "${assertion.key}"`,
        assertion.status,
        assertion.presence,
        assertion.evidenceRefs ?? [],
      );
    }
  }
  return result.sort((a, b) => compare(subjectKey(a.subject), subjectKey(b.subject)));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Validates a subject against the shared discipline (convenience re-export). */
export { validateSubject };
