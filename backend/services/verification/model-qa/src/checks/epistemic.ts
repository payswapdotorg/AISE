/**
 * EVIDENCE / EPISTEMIC consistency checks (AISE-014 family 4).
 *
 * Integrates the authoritative AISE-012 projections (support,
 * verification validity) and the AISE-013 readiness record —
 * always as READ-ONLY context. This family detects:
 *
 * - consequential CONFIRMED assertions whose live evidence
 *   support has been invalidated (AC-063 retractions surfacing
 *   through `computeVersionValidity`);
 * - CONFIRMED assertions with no evidence support at all (the
 *   distinction between invalidated support and missing support
 *   is preserved — different codes, different outcomes);
 * - assertions citing evidence identities that are not
 *   registered in the authoritative mapping;
 * - epistemic-state violations (an object whose existence state
 *   is STRONGER than the weakest epistemic state of its geometry
 *   assets — the no-silent-upgrade rule applied to committed
 *   content);
 * - readiness/verification contradictions (a readiness record
 *   that pins content other than the graph/mapping under
 *   verification);
 * - provenance inconsistencies (an object whose provenance
 *   claims the object's own content as its input).
 *
 * QA never mutates an assertion to "fix" an invalidated
 * confirmation; it reports the contradiction.
 */
import { epistemicRank, subjectKey, type EpistemicState } from "@aise/engineering-model";
import { makeFinding, type QaFinding } from "../findings.js";
import type { QaView } from "../view.js";
import type { AssuranceProfile } from "@aise/shared-contracts";

/** Runs all evidence/epistemic-family checks over the view. */
export function runEpistemicChecks(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  return [
    ...checkConfirmedAssertions(view, profile),
    ...checkCitedEvidenceRegistration(view, profile),
    ...checkEpistemicUpgrade(view, profile),
    ...checkReadinessContext(view, profile),
    ...checkProvenanceSelfReference(view, profile),
  ];
}

/** The property-subject reference shape for assertion findings. */
type PropertySubject =
  | { kind: "property"; objectId: string; propertyKey: string }
  | { kind: "property"; spaceId: string; propertyKey: string };

interface AssertedProperty {
  readonly key: string;
  readonly status: EpistemicState;
  readonly evidenceRefs?: readonly string[];
}

// --- CONFIRMED assertion verification state -------------------------------------

function checkConfirmedAssertions(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  const findings: QaFinding[] = [];

  const checkEntity = (ownerId: string, ownerKind: "object" | "space", properties: readonly AssertedProperty[]): void => {
    for (const assertion of properties) {
      if (assertion.status !== "CONFIRMED") {
        continue;
      }
      const subject: PropertySubject =
        ownerKind === "object"
          ? { kind: "property", objectId: ownerId, propertyKey: assertion.key }
          : { kind: "property", spaceId: ownerId, propertyKey: assertion.key };

      if (!view.hasMapping || view.validity === undefined) {
        findings.push(
          makeFinding({
            code: "CONFIRMATION_UNSUPPORTED",
            outcome: "INSUFFICIENT_EVIDENCE",
            profile,
            subject,
            epistemic: { assertionStatus: assertion.status },
            detail: `CONFIRMED property "${assertion.key}" has no evidence mapping to verify against — the confirmation cannot be established`,
          }),
        );
        continue;
      }

      const key = subjectKey({
        modelId: view.graph.modelId,
        version: view.version,
        kind: ownerKind === "object" ? ("object-property" as const) : ("space-property" as const),
        ...(ownerKind === "object" ? { objectId: ownerId } : { spaceId: ownerId }),
        propertyKey: assertion.key,
      });
      const entry = view.validity.entries.find(
        (candidate) => subjectKey(candidate.subject) === key,
      );

      if (entry === undefined) {
        // No live link attaches evidence to the subject at all.
        findings.push(
          makeFinding({
            code: "CONFIRMATION_UNSUPPORTED",
            outcome: "INSUFFICIENT_EVIDENCE",
            profile,
            subject,
            evidenceRefs: assertion.evidenceRefs,
            epistemic: { assertionStatus: assertion.status },
            detail: `CONFIRMED property "${assertion.key}" has no live evidence support in the authoritative mapping`,
          }),
        );
      } else if (!entry.valid) {
        findings.push(
          makeFinding({
            code: "CONFIRMATION_INVALIDATED",
            outcome: "CONTRADICTION",
            profile,
            subject,
            evidenceRefs: assertion.evidenceRefs,
            epistemic: { assertionStatus: assertion.status },
            expected: "live support covers every citation",
            actual: `invalidation: ${entry.invalidationReasons.join(", ")}`,
            detail:
              `CONFIRMED property "${assertion.key}" is invalidated: ${entry.invalidationReasons.join(", ")}` +
              ` (cited: ${entry.citedEvidenceRefs.join(", ") || "none"})` +
              ` (live: ${entry.liveSupportingEvidence.join(", ") || "none"})` +
              ` (retracted: ${entry.retractedSupportingEvidence.join(", ") || "none"})`,
          }),
        );
      }
    }
  };

  for (const object of view.graph.objects) {
    checkEntity(object.objectId, "object", object.properties);
  }
  for (const space of view.graph.spaces) {
    checkEntity(space.spaceId, "space", space.properties ?? []);
  }
  return findings;
}

// --- Cited evidence registration --------------------------------------------------

function checkCitedEvidenceRegistration(
  view: QaView,
  profile: AssuranceProfile,
): readonly QaFinding[] {
  if (!view.hasMapping || view.mapping === undefined) {
    return [];
  }
  const registered = new Set(view.mapping.records.map((record) => record.evidenceId));
  const findings: QaFinding[] = [];

  const check = (ownerId: string, ownerKind: "object" | "space", properties: readonly AssertedProperty[] | undefined): void => {
    for (const assertion of properties ?? []) {
      const unregistered = (assertion.evidenceRefs ?? []).filter((ref) => !registered.has(ref));
      if (unregistered.length > 0) {
        findings.push(
          makeFinding({
            code: "EVIDENCE_REF_UNREGISTERED",
            outcome: "INSUFFICIENT_EVIDENCE",
            profile,
            subject: {
              kind: "property",
              ...(ownerKind === "object" ? { objectId: ownerId } : { spaceId: ownerId }),
              propertyKey: assertion.key,
            },
            evidenceRefs: unregistered,
            detail: `property "${assertion.key}" of ${ownerKind} ${ownerId} cites evidence that is not registered in the authoritative mapping: ${unregistered.join(", ")}`,
          }),
        );
      }
    }
  };

  for (const object of view.graph.objects) {
    check(object.objectId, "object", object.properties);
  }
  for (const space of view.graph.spaces) {
    check(space.spaceId, "space", space.properties);
  }
  return findings;
}

// --- Epistemic no-upgrade over geometry assets --------------------------------------

function checkEpistemicUpgrade(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const object of view.graph.objects) {
    const assetRefs = object.geometry?.assetRefs;
    if (assetRefs === undefined || assetRefs.length === 0) {
      continue;
    }
    let weakest = Number.POSITIVE_INFINITY;
    let weakestState: EpistemicState | undefined;
    for (const ref of assetRefs) {
      const rank = epistemicRank(ref.epistemic);
      if (rank < weakest) {
        weakest = rank;
        weakestState = ref.epistemic;
      }
    }
    if (weakestState === undefined) {
      continue;
    }
    const objectRank = epistemicRank(object.epistemicState);
    if (objectRank > weakest) {
      findings.push(
        makeFinding({
          code: "EPISTEMIC_UPGRADE_VIOLATION",
          outcome: "CONTRADICTION",
          profile,
          subject: { kind: "object", objectId: object.objectId },
          expected: `object state no stronger than its weakest geometry asset (${weakestState})`,
          actual: `object state ${object.epistemicState} over asset(s) as weak as ${weakestState}`,
          epistemic: { objectState: object.epistemicState },
          detail: `object ${object.objectId} claims epistemic state ${object.epistemicState} while its geometry assets are only as strong as ${weakestState} — a silent epistemic upgrade`,
        }),
      );
    }
  }
  return findings;
}

// --- Readiness context pinning ----------------------------------------------------

function checkReadinessContext(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  if (view.readiness === undefined) {
    return [];
  }
  const readiness = view.readiness;
  const findings: QaFinding[] = [];

  const mismatch = (expected: string, actual: string, detail: string): QaFinding =>
    makeFinding({
      code: "READINESS_CONTEXT_MISMATCH",
      outcome: "CONTRADICTION",
      profile,
      subject: { kind: "model" },
      expected,
      actual,
      detail,
    });

  if (readiness.modelId !== view.graph.modelId) {
    findings.push(
      mismatch(
        view.graph.modelId,
        readiness.modelId,
        `the readiness record was computed for model ${readiness.modelId}, not the verified model ${view.graph.modelId}`,
      ),
    );
  }
  if (readiness.version !== view.version) {
    findings.push(
      mismatch(
        String(view.version),
        String(readiness.version),
        `the readiness record was computed for version ${readiness.version}, not the verified version ${view.version}`,
      ),
    );
  }
  if (readiness.graphDigest !== view.graph.digest) {
    findings.push(
      mismatch(
        view.graph.digest,
        readiness.graphDigest,
        "the readiness record pins graph content other than the verified graph (digest mismatch)",
      ),
    );
  }

  if (view.hasMapping && view.mapping !== undefined) {
    if (readiness.mappingDigest !== view.mapping.digest) {
      findings.push(
        mismatch(
          view.mapping.digest,
          readiness.mappingDigest,
          "the readiness record pins an evidence mapping other than the verified mapping (digest mismatch)",
        ),
      );
    }
  } else {
    // A readiness record pins a mapping this run was not given:
    // the pin cannot be verified — UNEVALUABLE, never silently
    // treated as matching.
    findings.push(
      makeFinding({
        code: "READINESS_CONTEXT_MISMATCH",
        outcome: "UNEVALUABLE",
        profile,
        subject: { kind: "model" },
        expected: "the mapping the readiness record was computed over",
        actual: "no mapping provided to this verification run",
        detail: `the readiness record pins mapping digest ${readiness.mappingDigest} but no evidence mapping was provided — the readiness pin cannot be verified`,
      }),
    );
  }
  return findings;
}

// --- Provenance self-reference ----------------------------------------------------

function checkProvenanceSelfReference(
  view: QaView,
  profile: AssuranceProfile,
): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const object of view.graph.objects) {
    for (const input of object.provenance.inputs) {
      if (input.contentHash === object.contentHash) {
        findings.push(
          makeFinding({
            code: "PROVENANCE_SELF_REFERENCE",
            outcome: "CONTRADICTION",
            profile,
            subject: { kind: "object", objectId: object.objectId },
            expected: "provenance inputs distinct from the object's own content",
            actual: `input ${input.kind} pins the object's own content hash`,
            detail: `object ${object.objectId} claims to derive from an input whose content hash equals the object's own content hash — a provenance cycle`,
          }),
        );
      }
    }
  }
  return findings;
}
