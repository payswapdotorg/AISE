/**
 * WORLD-P2 — the EVIDENCE family's two in-memory SUBSTITUTION DOUBLES.
 *
 * Both implement the `MissingEvidenceDetector` port WITHOUT any substrate
 * (the real occupant is the WORLD-P4 wiring over the AISE-022 Assurance
 * Engine seam) and produce BYTE-IDENTICAL `MissingEvidenceReport` records
 * on the committed fixtures:
 *
 *  - `referenceMissingEvidenceDouble` — SCAN evaluation: iterates the
 *    requirement set and, for each requirement, scans the envelope and
 *    the context collections directly (filter chains).
 *  - `alternateMissingEvidenceDouble` — INDEX evaluation: first builds
 *    inverted indexes (method → evidence, subject → links, subject +
 *    property → assertions), then evaluates each requirement through the
 *    indexes.
 *
 * The assessment RULES (what counts as satisfied, which gap kind, the
 * worst-of verdict) are the CONTRACT — both doubles implement them; the
 * evaluation MECHANICS differ. Byte-identity is asserted in
 * `evidence.test.ts` and re-asserted at the lane level.
 */

import type { EvidenceMethod } from "@aise/shared-contracts";
import {
  deepFreeze,
  laneRefused,
  type LaneOutcome,
  type LaneProviderDescriptor,
} from "../seam";
import type {
  EvidenceGap,
  EvidenceRequirement,
  ProblemEvidenceEnvelope,
  RequirementAssessment,
} from "./contract";
import {
  buildEvidenceGap,
  EPISTEMIC_RANK,
  sealMissingEvidenceReport,
  verdictOfGapKind,
  worstOfVerdicts,
  type MissingEvidenceDetector,
} from "./contract";

export const REFERENCE_DETECTOR_DESCRIPTOR: LaneProviderDescriptor = {
  providerId: "layer2-experience.evidence.reference-detector-double",
  family: "evidence",
  technologyVersion: "missing-evidence-reference-double/1.0.0",
  engineNote:
    "in-memory substitution double — scan-based requirement evaluation over the committed fixtures; " +
    "no assurance-engine store integrated (the AISE-022 authority is the future occupant)",
  laneStatement:
    "AISE Layer-2 experience lane (WORLD-P2): typed evidence binding + fail-closed missing-evidence " +
    "detection with explicit readiness/missing-evidence tasks.",
};

export const ALTERNATE_DETECTOR_DESCRIPTOR: LaneProviderDescriptor = {
  providerId: "layer2-experience.evidence.alternate-detector-double",
  family: "evidence",
  technologyVersion: "missing-evidence-alternate-double/1.0.0",
  engineNote:
    "in-memory substitution double — index-based requirement evaluation over the committed fixtures; " +
    "no assurance-engine store integrated (the AISE-022 authority is the future occupant)",
  laneStatement:
    "AISE Layer-2 experience lane (WORLD-P2): typed evidence binding + fail-closed missing-evidence " +
    "detection with explicit readiness/missing-evidence tasks.",
};

/* ------------------------------------------------------------------ */
/* The canonical assessment rules (the CONTRACT semantics)              */
/* ------------------------------------------------------------------ */

/** Detail templates — shared so both doubles emit identical bytes. */
export const GAP_DETAILS = {
  noEvidenceOfMethod: (method: EvidenceMethod, subjectRef: string): string =>
    `no valid ${method} evidence linked to subject ${subjectRef} — the requirement needs at least one`,
  shortOfEvidence: (method: EvidenceMethod, validCount: number, requiredCount: number): string =>
    `only ${validCount} valid ${method} evidence record(s) linked, ${requiredCount} required`,
  propertyAbsent: (propertyKey: string, subjectRef: string): string =>
    `no property assertion for "${propertyKey}" on subject ${subjectRef} — the measured basis does not exist yet`,
  unitMismatch: (propertyKey: string, requiredUnit: string): string =>
    `assertions for "${propertyKey}" exist but none carry the required unit ${requiredUnit} — the values cannot be compared at the declared unit`,
  sigmaNotReported: (propertyKey: string): string =>
    `no unit-consistent numeric assertion for "${propertyKey}" declares a 1σ — absent σ is UNKNOWN, never 0`,
  sigmaAboveBound: (propertyKey: string, maxMeasuredSigma: number, maxSigma: number): string =>
    `max measured 1σ for "${propertyKey}" is ${maxMeasuredSigma}, above the declared bound ${maxSigma}`,
  epistemicBelowFloor: (propertyKey: string, minMeasuredStatus: string, floor: string): string =>
    `weakest assertion status for "${propertyKey}" is ${minMeasuredStatus}, below the required floor ${floor}`,
  nonNumericProperty: (propertyKey: string): string =>
    `assertions for "${propertyKey}" carry no unit-consistent numeric value — a bound cannot be evaluated on categorical values`,
} as const;

/** One requirement's gaps + assessment (the shared rule core). */
interface RequirementResult {
  readonly requirementId: string;
  readonly gaps: readonly EvidenceGap[];
  readonly assessment: RequirementAssessment;
}

function evaluateSufficiency(
  requirement: Extract<EvidenceRequirement, { kind: "evidence_sufficiency" }>,
  validIds: readonly string[],
  invalidIds: readonly string[],
): RequirementResult {
  const validCount = validIds.length;
  const invalidCount = invalidIds.length;
  const satisfied = validCount >= requirement.requiredCount;
  const gaps: EvidenceGap[] = [];
  if (!satisfied) {
    const kind = validCount === 0 ? "MISSING" : "WEAK";
    const detail =
      validCount === 0
        ? GAP_DETAILS.noEvidenceOfMethod(requirement.method, requirement.subjectRef)
        : GAP_DETAILS.shortOfEvidence(requirement.method, validCount, requirement.requiredCount);
    gaps.push(buildEvidenceGap(requirement.requirementId, kind, detail, requirement.method));
  }
  return {
    requirementId: requirement.requirementId,
    gaps,
    assessment: {
      requirementId: requirement.requirementId,
      kind: "evidence_sufficiency",
      satisfied,
      method: requirement.method,
      requiredCount: requirement.requiredCount,
      validCount,
      invalidCount,
    },
  };
}

interface SubjectAssertion {
  readonly property: string;
  readonly value: number | string | boolean;
  readonly unit: string | null;
  readonly status: string;
  readonly sigma: number | null;
}

function evaluateUncertaintyBound(
  requirement: Extract<EvidenceRequirement, { kind: "uncertainty_bound" }>,
  assertions: readonly SubjectAssertion[],
): RequirementResult {
  const onKey = assertions.filter((assertion) => assertion.property === requirement.propertyKey);
  const assertionCount = onKey.length;
  if (assertionCount === 0) {
    return {
      requirementId: requirement.requirementId,
      gaps: [
        buildEvidenceGap(
          requirement.requirementId,
          "MISSING",
          GAP_DETAILS.propertyAbsent(requirement.propertyKey, requirement.subjectRef),
          null,
        ),
      ],
      assessment: {
        requirementId: requirement.requirementId,
        kind: "uncertainty_bound",
        satisfied: false,
        propertyKey: requirement.propertyKey,
        assertionCount: 0,
        unitConsistentCount: 0,
        sigmaReportedCount: 0,
        maxMeasuredSigma: null,
      },
    };
  }
  const unitConsistent = onKey.filter(
    (assertion) => assertion.unit === requirement.requiredUnit,
  );
  const unitConsistentCount = unitConsistent.length;
  if (unitConsistentCount === 0) {
    return {
      requirementId: requirement.requirementId,
      gaps: [
        buildEvidenceGap(
          requirement.requirementId,
          "AMBIGUOUS",
          GAP_DETAILS.unitMismatch(requirement.propertyKey, requirement.requiredUnit),
          null,
        ),
      ],
      assessment: {
        requirementId: requirement.requirementId,
        kind: "uncertainty_bound",
        satisfied: false,
        propertyKey: requirement.propertyKey,
        assertionCount,
        unitConsistentCount: 0,
        sigmaReportedCount: 0,
        maxMeasuredSigma: null,
      },
    };
  }
  const numeric = unitConsistent.filter(
    (assertion) => typeof assertion.value === "number",
  );
  if (numeric.length === 0) {
    return {
      requirementId: requirement.requirementId,
      gaps: [
        buildEvidenceGap(
          requirement.requirementId,
          "WEAK",
          GAP_DETAILS.nonNumericProperty(requirement.propertyKey),
          null,
        ),
      ],
      assessment: {
        requirementId: requirement.requirementId,
        kind: "uncertainty_bound",
        satisfied: false,
        propertyKey: requirement.propertyKey,
        assertionCount,
        unitConsistentCount,
        sigmaReportedCount: 0,
        maxMeasuredSigma: null,
      },
    };
  }
  const withSigma = numeric.filter((assertion) => assertion.sigma !== null);
  const sigmaReportedCount = withSigma.length;
  const maxMeasuredSigma =
    sigmaReportedCount === 0
      ? null
      : Math.max(...withSigma.map((assertion) => assertion.sigma as number));
  if (sigmaReportedCount === 0) {
    return {
      requirementId: requirement.requirementId,
      gaps: [
        buildEvidenceGap(
          requirement.requirementId,
          "WEAK",
          GAP_DETAILS.sigmaNotReported(requirement.propertyKey),
          null,
        ),
      ],
      assessment: {
        requirementId: requirement.requirementId,
        kind: "uncertainty_bound",
        satisfied: false,
        propertyKey: requirement.propertyKey,
        assertionCount,
        unitConsistentCount,
        sigmaReportedCount: 0,
        maxMeasuredSigma: null,
      },
    };
  }
  const satisfied = (maxMeasuredSigma as number) <= requirement.maxSigma;
  const gaps: EvidenceGap[] = [];
  if (!satisfied) {
    gaps.push(
      buildEvidenceGap(
        requirement.requirementId,
        "WEAK",
        GAP_DETAILS.sigmaAboveBound(
          requirement.propertyKey,
          maxMeasuredSigma as number,
          requirement.maxSigma,
        ),
        null,
      ),
    );
  }
  return {
    requirementId: requirement.requirementId,
    gaps,
    assessment: {
      requirementId: requirement.requirementId,
      kind: "uncertainty_bound",
      satisfied,
      propertyKey: requirement.propertyKey,
      assertionCount,
      unitConsistentCount,
      sigmaReportedCount,
      maxMeasuredSigma,
    },
  };
}

function evaluateEpistemicFloor(
  requirement: Extract<EvidenceRequirement, { kind: "epistemic_floor" }>,
  assertions: readonly SubjectAssertion[],
): RequirementResult {
  const onKey = assertions.filter((assertion) => assertion.property === requirement.propertyKey);
  const assertionCount = onKey.length;
  if (assertionCount === 0) {
    return {
      requirementId: requirement.requirementId,
      gaps: [
        buildEvidenceGap(
          requirement.requirementId,
          "MISSING",
          GAP_DETAILS.propertyAbsent(requirement.propertyKey, requirement.subjectRef),
          null,
        ),
      ],
      assessment: {
        requirementId: requirement.requirementId,
        kind: "epistemic_floor",
        satisfied: false,
        propertyKey: requirement.propertyKey,
        minMeasuredStatus: null,
        assertionCount: 0,
      },
    };
  }
  let minStatus = onKey[0]!.status;
  for (const assertion of onKey) {
    if ((EPISTEMIC_RANK[assertion.status] ?? -1) < (EPISTEMIC_RANK[minStatus] ?? -1)) {
      minStatus = assertion.status;
    }
  }
  const satisfied = (EPISTEMIC_RANK[minStatus] ?? -1) >= (EPISTEMIC_RANK[requirement.minStatus] ?? -1);
  const gaps: EvidenceGap[] = [];
  if (!satisfied) {
    gaps.push(
      buildEvidenceGap(
        requirement.requirementId,
        "WEAK",
        GAP_DETAILS.epistemicBelowFloor(requirement.propertyKey, minStatus, requirement.minStatus),
        null,
      ),
    );
  }
  return {
    requirementId: requirement.requirementId,
    gaps,
    assessment: {
      requirementId: requirement.requirementId,
      kind: "epistemic_floor",
      satisfied,
      propertyKey: requirement.propertyKey,
      minMeasuredStatus: minStatus,
      assertionCount,
    },
  };
}

/** The verdict roll-up including the explicit task statuses (waivers). */
function rollUpVerdict(
  requirementResults: readonly RequirementResult[],
  waivedGapIds: ReadonlySet<string>,
): ReturnType<typeof worstOfVerdicts> {
  const contributions: ReturnType<typeof verdictOfGapKind>[] = [];
  for (const result of requirementResults) {
    for (const gap of result.gaps) {
      if (waivedGapIds.has(gap.gapId)) {
        /* A waived gap is never silent — it contributes at most notes. */
        contributions.push("READY_WITH_NOTES");
      } else {
        contributions.push(verdictOfGapKind(gap.kind));
      }
    }
  }
  return worstOfVerdicts(contributions);
}

/* ------------------------------------------------------------------ */
/* The reference double (scan evaluation)                               */
/* ------------------------------------------------------------------ */

export const referenceMissingEvidenceDouble: MissingEvidenceDetector = {
  descriptor: REFERENCE_DETECTOR_DESCRIPTOR,
  detect: (request) => {
    const frozen = deepFreeze(request);
    const invalidated = new Set(frozen.envelope.invalidatedContentIds);
    const requirementResults: RequirementResult[] = [];
    const waivedGapIds = new Set<string>();
    for (const requirement of frozen.requirements.requirements) {
      if (requirement.kind === "evidence_sufficiency") {
        const linked = frozen.envelope.provenanceLinks
          .filter(
            (link) =>
              link.subjectId === requirement.subjectRef &&
              link.role === "SUPPORTS" &&
              frozen.envelope.evidence.some(
                (record) =>
                  record.contentId === link.evidenceContentId &&
                  record.acquisitionMethod === requirement.method,
              ),
          )
          .map((link) => link.evidenceContentId);
        const validIds = linked.filter((id) => !invalidated.has(id));
        const invalidIds = linked.filter((id) => invalidated.has(id));
        requirementResults.push(evaluateSufficiency(requirement, validIds, invalidIds));
      } else if (requirement.kind === "uncertainty_bound") {
        const assertions = frozen.context.propertyAssertions
          .filter((assertion) => assertion.subjectRef === requirement.subjectRef)
          .map((assertion) => ({
            property: assertion.property,
            value: assertion.value,
            unit: assertion.unit,
            status: assertion.status,
            sigma: assertion.uncertainty !== undefined ? (assertion.uncertainty.plusMinus ?? null) : null,
          }));
        requirementResults.push(evaluateUncertaintyBound(requirement, assertions));
      } else {
        const assertions = frozen.context.propertyAssertions
          .filter((assertion) => assertion.subjectRef === requirement.subjectRef)
          .map((assertion) => ({
            property: assertion.property,
            value: assertion.value,
            unit: assertion.unit,
            status: assertion.status,
            sigma: assertion.uncertainty !== undefined ? (assertion.uncertainty.plusMinus ?? null) : null,
          }));
        requirementResults.push(evaluateEpistemicFloor(requirement, assertions));
      }
    }
    const gaps = requirementResults.flatMap((result) => result.gaps);
    const report = sealMissingEvidenceReport({
      kind: "missing-evidence-report",
      schemaVersion: "missing-evidence-report/1",
      contractVersion: frozen.envelope.contractVersion,
      problemId: frozen.envelope.problemId,
      contextId: frozen.context.contextId,
      verdict: rollUpVerdict(requirementResults, waivedGapIds),
      gaps,
      perRequirement: requirementResults.map((result) => result.assessment),
      detectedAt: frozen.detectedAt,
    });
    return { ok: true, value: report };
  },
};

/* ------------------------------------------------------------------ */
/* The alternate double (index evaluation)                              */
/* ------------------------------------------------------------------ */

export const alternateMissingEvidenceDouble: MissingEvidenceDetector = {
  descriptor: ALTERNATE_DETECTOR_DESCRIPTOR,
  detect: (request) => {
    const frozen = deepFreeze(request);
    const invalidated = new Set(frozen.envelope.invalidatedContentIds);

    /* Index construction (the mechanical difference from the reference). */
    const evidenceByContentId = new Map(
      frozen.envelope.evidence.map((record) => [record.contentId, record]),
    );
    const linksBySubject = new Map<string, ProblemEvidenceEnvelope["provenanceLinks"][number][]>();
    for (const link of frozen.envelope.provenanceLinks) {
      const bucket = linksBySubject.get(link.subjectId) ?? [];
      bucket.push(link);
      linksBySubject.set(link.subjectId, bucket);
    }
    const assertionsBySubject = new Map<string, SubjectAssertion[]>();
    for (const assertion of frozen.context.propertyAssertions) {
      const bucket = assertionsBySubject.get(assertion.subjectRef) ?? [];
      bucket.push({
        property: assertion.property,
        value: assertion.value,
        unit: assertion.unit,
        status: assertion.status,
        sigma: assertion.uncertainty !== undefined ? (assertion.uncertainty.plusMinus ?? null) : null,
      });
      assertionsBySubject.set(assertion.subjectRef, bucket);
    }

    const requirementResults: RequirementResult[] = [];
    const waivedGapIds = new Set<string>();
    for (const requirement of frozen.requirements.requirements) {
      if (requirement.kind === "evidence_sufficiency") {
        const links = linksBySubject.get(requirement.subjectRef) ?? [];
        const linked: string[] = [];
        for (const link of links) {
          if (link.role !== "SUPPORTS") {
            continue;
          }
          const record = evidenceByContentId.get(link.evidenceContentId);
          if (record !== undefined && record.acquisitionMethod === requirement.method) {
            linked.push(link.evidenceContentId);
          }
        }
        const validIds: string[] = [];
        const invalidIds: string[] = [];
        for (const id of linked) {
          if (invalidated.has(id)) {
            invalidIds.push(id);
          } else {
            validIds.push(id);
          }
        }
        requirementResults.push(evaluateSufficiency(requirement, validIds, invalidIds));
      } else if (requirement.kind === "uncertainty_bound") {
        const assertions = assertionsBySubject.get(requirement.subjectRef) ?? [];
        requirementResults.push(evaluateUncertaintyBound(requirement, assertions));
      } else {
        const assertions = assertionsBySubject.get(requirement.subjectRef) ?? [];
        requirementResults.push(evaluateEpistemicFloor(requirement, assertions));
      }
    }
    const gaps = requirementResults.flatMap((result) => result.gaps);
    const report = sealMissingEvidenceReport({
      kind: "missing-evidence-report",
      schemaVersion: "missing-evidence-report/1",
      contractVersion: frozen.envelope.contractVersion,
      problemId: frozen.envelope.problemId,
      contextId: frozen.context.contextId,
      verdict: rollUpVerdict(requirementResults, waivedGapIds),
      gaps,
      perRequirement: requirementResults.map((result) => result.assessment),
      detectedAt: frozen.detectedAt,
    });
    return { ok: true, value: report };
  },
};

/* A typed helper the lane runner uses for honest refusal propagation. */
export function detectorRefusal(detail: string): LaneOutcome<never> {
  return laneRefused("evidence", "reasoning-failure", detail);
}
