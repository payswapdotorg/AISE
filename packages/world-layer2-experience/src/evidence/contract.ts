/**
 * WORLD-P2 — the EVIDENCE family (`src/evidence/`): stages 3–4 of the lane.
 *
 *   EVIDENCE                  — the typed contract binding evidence to
 *                               problems under the Evidence Envelope laws:
 *                               raw evidence is immutable and
 *                               content-addressed (its content address IS
 *                               its identity), provenance links carry
 *                               closed roles (SUPPORTS / CONTRADICTS /
 *                               DERIVED_FROM / CONTEXT), bundles are
 *                               described groupings (the documents/drawings
 *                               information-continuity translation), and
 *                               invalidation is RECORDED — never a silent
 *                               deletion.
 *   MISSING-EVIDENCE DETECTION — what a problem NEEDS (typed evidence
 *                               requirements) versus what it HAS (the
 *                               envelope + the case context): typed gaps
 *                               with explicit remediation tasks and a
 *                               worst-of readiness verdict — the
 *                               directive's "explicit readiness/
 *                               missing-evidence tasks". FAILS CLOSED.
 *
 * The incumbent's RFI/submittal/drawing-attachment workflow behavior is
 * translated as: documents, drawings, photos, instrument readings and
 * answers are Evidence (content-addressed, immutable, provenance-linked,
 * bundled) — there is NO parallel document-management domain here.
 *
 * HONEST AUTHORITY BOUND (recorded in the item's CAPABILITY-BOUNDARIES):
 * the AISE-022 Assurance Engine remains the SINGLE readiness authority of
 * the AISE architecture. This P2 contract is the Layer-2 experience lane's
 * typed VIEW of requirement-vs-has assessment; the WORLD-P4 wiring
 * composes the real authority behind this port. The requirement/gap/verdict
 * vocabularies here MIRROR the frozen backend registries verbatim (AISE-025
 * MISSING_EVIDENCE_KINDS, AISE-022 READINESS_LEVELS and dimension kinds)
 * so the P4 composition is a wiring act, never a re-definition.
 *
 * LAWS (on top of the seam's nine; enforced here and drilled by
 * `evidence.test.ts`):
 *
 *  1. EVIDENCE IDENTITY IS THE CONTENT ADDRESS: duplicate contentIds in
 *     one envelope are a typed refusal; records are never mutated.
 *  2. PROVENANCE RESOLVES OR REFUSES: every link's evidenceContentId must
 *     exist in the envelope and its subject must exist in the case
 *     context (fail-closed — a link to nothing is refused).
 *  3. INVALIDATION IS RECORDED, NEVER SILENT: `invalidatedContentIds`
 *     discount invalidated evidence from every sufficiency count; the
 *     basis records both valid and invalid counts.
 *  4. FAIL-CLOSED DETECTION: no declared requirements → typed refusal
 *     (assessment impossible, never vacuously ready); an unresolved
 *     requirement subject → INSUFFICIENT_DATA contribution (never READY);
 *     an empty requirement description is refused.
 *  5. WORST-OF VERDICTS: INSUFFICIENT_DATA > NOT_READY (any MISSING gap)
 *     > READY_WITH_NOTES (any WEAK/AMBIGUOUS gap) > READY — a verdict is
 *     only as good as its worst requirement (the AISE-022 discipline).
 *  6. EXPLICIT TASKS: every gap carries a typed missing-evidence task
 *     (open/collected/waived; a waiver is never silent — a waived gap
 *     requires a note and contributes READY_WITH_NOTES at most).
 */

import type {
  Evidence,
  EvidenceBundle,
  EvidenceMethod,
  ProvenanceLink,
} from "@aise/shared-contracts";
import { CONTRACT_VERSION, EVIDENCE_METHODS } from "@aise/shared-contracts";
import {
  contentIdOf,
  isCanonicalDigest,
  isDeclaredInstant,
  isNonEmptyString,
  isRecord,
  laneRefused,
  type LaneOutcome,
  type LaneProviderDescriptor,
} from "../seam";
import type { CaseContext } from "../problem/contract";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const EVIDENCE_ENVELOPE_KIND = "problem-evidence-envelope" as const;
export const EVIDENCE_ENVELOPE_SCHEMA_VERSION = "problem-evidence-envelope/1" as const;
export const MISSING_EVIDENCE_REPORT_KIND = "missing-evidence-report" as const;
export const MISSING_EVIDENCE_REPORT_SCHEMA_VERSION = "missing-evidence-report/1" as const;

/**
 * Closed gap-kind vocabulary — mirrors the AISE-025 `MISSING_EVIDENCE_KINDS`
 * frozen registry verbatim (MISSING / WEAK / AMBIGUOUS).
 */
export const GAP_KINDS = ["MISSING", "WEAK", "AMBIGUOUS"] as const;
export type GapKind = (typeof GAP_KINDS)[number];

export function isGapKind(value: unknown): value is GapKind {
  return typeof value === "string" && (GAP_KINDS as readonly string[]).includes(value);
}

/**
 * Closed readiness-verdict vocabulary — mirrors the AISE-022
 * `READINESS_LEVELS` frozen registry verbatim.
 */
export const READINESS_VERDICTS = [
  "READY",
  "READY_WITH_NOTES",
  "NOT_READY",
  "INSUFFICIENT_DATA",
] as const;
export type ReadinessVerdict = (typeof READINESS_VERDICTS)[number];

export function isReadinessVerdict(value: unknown): value is ReadinessVerdict {
  return (
    typeof value === "string" &&
    (READINESS_VERDICTS as readonly string[]).includes(value)
  );
}

/** Closed requirement-kind vocabulary (the AISE-022 dimension kinds). */
export const REQUIREMENT_KINDS = [
  "evidence_sufficiency",
  "uncertainty_bound",
  "epistemic_floor",
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

/** Closed missing-evidence task statuses — mirrors AISE-025 verbatim. */
export const MISSING_EVIDENCE_TASK_STATUSES = ["open", "collected", "waived"] as const;
export type MissingEvidenceTaskStatus = (typeof MISSING_EVIDENCE_TASK_STATUSES)[number];

/** Closed validation-failure vocabulary of this family (shape layer). */
export const EVIDENCE_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "missing-field",
  "type-mismatch",
  "value-out-of-range",
  "vocabulary-violation",
  "digest-format",
  "duplicate-evidence-identity",
  "unresolved-provenance",
  "invalidated-not-in-envelope",
  "unresolved-requirement-subject",
  "empty-requirement-set",
  "waiver-without-note",
] as const;
export type EvidenceValidationFailureKind =
  (typeof EVIDENCE_VALIDATION_FAILURE_KINDS)[number];

export interface EvidenceValidationFailure {
  readonly kind: EvidenceValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type EvidenceValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failures: readonly EvidenceValidationFailure[] };

/* ------------------------------------------------------------------ */
/* The problem evidence envelope                                        */
/* ------------------------------------------------------------------ */

/**
 * The evidence bound to one problem, under the Evidence Envelope laws.
 * The envelope is the HAS side of missing-evidence detection: what the
 * problem actually holds. Append-only by discipline: new evidence is
 * added; existing evidence is never rewritten; invalidation is recorded
 * in `invalidatedContentIds` (the records stay, the counts discount).
 */
export interface ProblemEvidenceEnvelope {
  readonly kind: typeof EVIDENCE_ENVELOPE_KIND;
  readonly schemaVersion: typeof EVIDENCE_ENVELOPE_SCHEMA_VERSION;
  readonly contractVersion: string;
  readonly problemId: string;
  /** Registered raw evidence — immutable, content-addressed. */
  readonly evidence: readonly Evidence[];
  /** Provenance links binding evidence to problem subjects with roles. */
  readonly provenanceLinks: readonly ProvenanceLink[];
  /** Described groupings (the documents/drawings continuity translation). */
  readonly bundles: readonly EvidenceBundle[];
  /** RECORDED invalidation — discounted, never silently deleted. */
  readonly invalidatedContentIds: readonly string[];
  /** Declared ISO-8601 UTC instant of sealing. */
  readonly sealedAt: string;
}

/** The EVIDENCE-stage input (the controlled entry point's request). */
export interface BindEvidenceInput {
  readonly problemId: string;
  readonly evidence: readonly Evidence[];
  readonly provenanceLinks: readonly ProvenanceLink[];
  readonly bundles: readonly EvidenceBundle[];
  readonly invalidatedContentIds: readonly string[];
  readonly sealedAt: string;
}

/* ------------------------------------------------------------------ */
/* The typed evidence requirements (the NEEDS side)                     */
/* ------------------------------------------------------------------ */

/** What the problem needs: enough valid evidence of one method. */
export interface EvidenceSufficiencyRequirement {
  readonly kind: "evidence_sufficiency";
  readonly requirementId: string;
  /** The subject the evidence must be linked to (resolves in the context). */
  readonly subjectRef: string;
  readonly method: EvidenceMethod;
  readonly requiredCount: number;
  readonly description: string;
}

/** What the problem needs: a measured value with bounded uncertainty. */
export interface UncertaintyBoundRequirement {
  readonly kind: "uncertainty_bound";
  readonly requirementId: string;
  readonly subjectRef: string;
  readonly propertyKey: string;
  readonly requiredUnit: string;
  /** The maximum acceptable 1σ (declared; the decision stays with the consumer). */
  readonly maxSigma: number;
  readonly description: string;
}

/** What the problem needs: a property at or above an epistemic floor. */
export interface EpistemicFloorRequirement {
  readonly kind: "epistemic_floor";
  readonly requirementId: string;
  readonly subjectRef: string;
  readonly propertyKey: string;
  readonly minStatus: "OBSERVED" | "CONFIRMED";
  readonly description: string;
}

export type EvidenceRequirement =
  | EvidenceSufficiencyRequirement
  | UncertaintyBoundRequirement
  | EpistemicFloorRequirement;

/** The declared requirement set of one problem. */
export interface EvidenceRequirementSet {
  readonly problemId: string;
  readonly requirements: readonly EvidenceRequirement[];
}

/* ------------------------------------------------------------------ */
/* The missing-evidence report                                          */
/* ------------------------------------------------------------------ */

/**
 * The explicit missing-evidence task attached to a gap — the directive's
 * "explicit readiness/missing-evidence tasks" made typed. A waiver is
 * never silent: `waivedNote` is present iff status is "waived".
 */
export interface MissingEvidenceTask {
  readonly taskId: string;
  readonly description: string;
  readonly requestedMethod: EvidenceMethod | null;
  readonly status: MissingEvidenceTaskStatus;
  readonly waivedNote: string | null;
}

/** One typed gap: what is missing, how bad, and the remediation task. */
export interface EvidenceGap {
  readonly gapId: string;
  readonly requirementId: string;
  readonly kind: GapKind;
  /** Names WHAT is missing — never vague (the honesty law). */
  readonly detail: string;
  readonly remediationTask: MissingEvidenceTask;
}

/** The measured basis of one requirement assessment (inspectable). */
export type RequirementAssessment =
  | {
      readonly requirementId: string;
      readonly kind: "evidence_sufficiency";
      readonly satisfied: boolean;
      readonly method: EvidenceMethod;
      readonly requiredCount: number;
      readonly validCount: number;
      readonly invalidCount: number;
    }
  | {
      readonly requirementId: string;
      readonly kind: "uncertainty_bound";
      readonly satisfied: boolean;
      readonly propertyKey: string;
      readonly assertionCount: number;
      readonly unitConsistentCount: number;
      readonly sigmaReportedCount: number;
      readonly maxMeasuredSigma: number | null;
    }
  | {
      readonly requirementId: string;
      readonly kind: "epistemic_floor";
      readonly satisfied: boolean;
      readonly propertyKey: string;
      readonly minMeasuredStatus: string | null;
      readonly assertionCount: number;
    }
  | {
      readonly requirementId: string;
      readonly kind: "unevaluable";
      readonly satisfied: false;
      readonly detail: string;
    };

/**
 * The missing-evidence report: the NEEDS-vs-HAS verdict. `verdict` is the
 * worst-of roll-up (law #5); `gaps` carries every typed gap with its
 * explicit remediation task; `perRequirement` carries the measured bases.
 */
export interface MissingEvidenceReport {
  readonly kind: typeof MISSING_EVIDENCE_REPORT_KIND;
  readonly schemaVersion: typeof MISSING_EVIDENCE_REPORT_SCHEMA_VERSION;
  readonly contractVersion: string;
  /** 64-hex content-derived identity. */
  readonly reportId: string;
  readonly problemId: string;
  readonly contextId: string;
  readonly verdict: ReadinessVerdict;
  readonly gaps: readonly EvidenceGap[];
  readonly perRequirement: readonly RequirementAssessment[];
  readonly detectedAt: string;
}

/** The MISSING-EVIDENCE-stage request (the controlled entry point's input). */
export interface MissingEvidenceRequest {
  readonly requirements: EvidenceRequirementSet;
  readonly envelope: ProblemEvidenceEnvelope;
  readonly context: CaseContext;
  readonly detectedAt: string;
}

/* ------------------------------------------------------------------ */
/* The evidence-family port                                             */
/* ------------------------------------------------------------------ */

/**
 * The provider-neutral missing-evidence detector port. The real occupant
 * is the WORLD-P4 wiring over the AISE-022 Assurance Engine seam; the two
 * in-memory substitution doubles in `doubles.ts` prove the contract
 * implementable WITHOUT any substrate.
 */
export interface MissingEvidenceDetector {
  readonly descriptor: LaneProviderDescriptor;
  readonly detect: (request: MissingEvidenceRequest) => LaneOutcome<MissingEvidenceReport>;
}

/* ------------------------------------------------------------------ */
/* Pure validators                                                      */
/* ------------------------------------------------------------------ */

function fail(
  failures: EvidenceValidationFailure[],
  kind: EvidenceValidationFailureKind,
  path: string,
  detail: string,
): void {
  failures.push({ kind, path, detail });
}

/** Validates an unknown payload as a `BindEvidenceInput`/envelope shape. PURE. */
export function validateEvidenceEnvelope(
  input: unknown,
): EvidenceValidation<ProblemEvidenceEnvelope> {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "the evidence envelope must be an object" },
      ],
    };
  }
  const failures: EvidenceValidationFailure[] = [];
  if (input["kind"] !== EVIDENCE_ENVELOPE_KIND) {
    fail(failures, "vocabulary-violation", "kind", `must be "${EVIDENCE_ENVELOPE_KIND}"`);
  }
  if (input["schemaVersion"] !== EVIDENCE_ENVELOPE_SCHEMA_VERSION) {
    fail(
      failures,
      "vocabulary-violation",
      "schemaVersion",
      `must be "${EVIDENCE_ENVELOPE_SCHEMA_VERSION}"`,
    );
  }
  if (input["contractVersion"] !== CONTRACT_VERSION) {
    fail(failures, "type-mismatch", "contractVersion", `must be ${CONTRACT_VERSION}`);
  }
  if (!isCanonicalDigest(input["problemId"])) {
    fail(failures, "digest-format", "problemId", "must be a 64-hex problem id");
  }
  if (!isDeclaredInstant(input["sealedAt"])) {
    fail(failures, "type-mismatch", "sealedAt", "must be a declared ISO-8601 UTC instant");
  }
  const evidence = input["evidence"];
  if (!Array.isArray(evidence)) {
    fail(failures, "type-mismatch", "evidence", "must be an array of Evidence records");
  } else {
    const seen = new Set<string>();
    evidence.forEach((record, index) => {
      if (!isRecord(record)) {
        fail(failures, "type-mismatch", `evidence[${index}]`, "each evidence record must be an object");
        return;
      }
      const contentId = record["contentId"];
      if (!isCanonicalDigest(contentId)) {
        fail(failures, "digest-format", `evidence[${index}].contentId`, "must be a 64-hex content address");
      } else if (seen.has(contentId)) {
        fail(
          failures,
          "duplicate-evidence-identity",
          `evidence[${index}].contentId`,
          "evidence identity IS the content address — duplicates are refused (immutable, append-only)",
        );
      } else {
        seen.add(contentId);
      }
      const method = record["acquisitionMethod"];
      if (
        typeof method !== "string" ||
        !(EVIDENCE_METHODS as readonly string[]).includes(method)
      ) {
        fail(
          failures,
          "vocabulary-violation",
          `evidence[${index}].acquisitionMethod`,
          `not a closed evidence method: ${String(method)}`,
        );
      }
    });
  }
  const links = input["provenanceLinks"];
  if (!Array.isArray(links)) {
    fail(failures, "type-mismatch", "provenanceLinks", "must be an array of ProvenanceLink records");
  } else {
    links.forEach((link, index) => {
      if (!isRecord(link)) {
        fail(failures, "type-mismatch", `provenanceLinks[${index}]`, "each link must be an object");
        return;
      }
      if (!isCanonicalDigest(link["evidenceContentId"])) {
        fail(
          failures,
          "digest-format",
          `provenanceLinks[${index}].evidenceContentId`,
          "must be a 64-hex evidence content id",
        );
      }
      if (!isNonEmptyString(link["subjectId"])) {
        fail(
          failures,
          "type-mismatch",
          `provenanceLinks[${index}].subjectId`,
          "must name the AISE-side subject",
        );
      }
    });
  }
  const bundles = input["bundles"];
  if (!Array.isArray(bundles)) {
    fail(failures, "type-mismatch", "bundles", "must be an array of EvidenceBundle records");
  }
  const invalidated = input["invalidatedContentIds"];
  if (!Array.isArray(invalidated)) {
    fail(failures, "type-mismatch", "invalidatedContentIds", "must be an array");
  } else if (!invalidated.every((id) => isCanonicalDigest(id))) {
    fail(
      failures,
      "digest-format",
      "invalidatedContentIds",
      "every invalidated content id must be 64-hex",
    );
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: input as unknown as ProblemEvidenceEnvelope };
}

/** Validates an unknown payload as an `EvidenceRequirement`. PURE. */
export function validateEvidenceRequirement(
  input: unknown,
): EvidenceValidation<EvidenceRequirement> {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "a requirement must be an object" },
      ],
    };
  }
  const failures: EvidenceValidationFailure[] = [];
  const kind = input["kind"];
  if (typeof kind !== "string" || !(REQUIREMENT_KINDS as readonly string[]).includes(kind)) {
    fail(
      failures,
      "vocabulary-violation",
      "kind",
      `must be one of ${REQUIREMENT_KINDS.join(" | ")}`,
    );
    return { ok: false, failures };
  }
  if (!isCanonicalDigest(input["requirementId"])) {
    fail(failures, "digest-format", "requirementId", "must be a 64-hex requirement id");
  }
  if (!isNonEmptyString(input["subjectRef"])) {
    fail(failures, "type-mismatch", "subjectRef", "must name the AISE-side subject");
  }
  if (!isNonEmptyString(input["description"])) {
    fail(
      failures,
      "type-mismatch",
      "description",
      "a requirement description is mandatory — gaps must name what is needed",
    );
  }
  if (kind === "evidence_sufficiency") {
    const method = input["method"];
    if (
      typeof method !== "string" ||
      !(EVIDENCE_METHODS as readonly string[]).includes(method)
    ) {
      fail(failures, "vocabulary-violation", "method", `not a closed evidence method: ${String(method)}`);
    }
    const requiredCount = input["requiredCount"];
    if (
      typeof requiredCount !== "number" ||
      !Number.isInteger(requiredCount) ||
      requiredCount < 1
    ) {
      fail(failures, "value-out-of-range", "requiredCount", "must be an integer ≥ 1");
    }
  } else if (kind === "uncertainty_bound") {
    if (!isNonEmptyString(input["propertyKey"])) {
      fail(failures, "type-mismatch", "propertyKey", "must be a non-empty property key");
    }
    if (!isNonEmptyString(input["requiredUnit"])) {
      fail(failures, "type-mismatch", "requiredUnit", "must be a non-empty unit symbol");
    }
    const maxSigma = input["maxSigma"];
    if (typeof maxSigma !== "number" || !Number.isFinite(maxSigma) || maxSigma <= 0) {
      fail(failures, "value-out-of-range", "maxSigma", "must be a finite positive 1σ bound");
    }
  } else if (kind === "epistemic_floor") {
    if (!isNonEmptyString(input["propertyKey"])) {
      fail(failures, "type-mismatch", "propertyKey", "must be a non-empty property key");
    }
    const minStatus = input["minStatus"];
    if (minStatus !== "OBSERVED" && minStatus !== "CONFIRMED") {
      fail(failures, "vocabulary-violation", "minStatus", "must be OBSERVED or CONFIRMED");
    }
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: input as unknown as EvidenceRequirement };
}

/** Validates an unknown payload as a `MissingEvidenceReport`. PURE. */
export function validateMissingEvidenceReport(
  input: unknown,
): EvidenceValidation<MissingEvidenceReport> {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "the report must be an object" },
      ],
    };
  }
  const failures: EvidenceValidationFailure[] = [];
  if (input["kind"] !== MISSING_EVIDENCE_REPORT_KIND) {
    fail(failures, "vocabulary-violation", "kind", `must be "${MISSING_EVIDENCE_REPORT_KIND}"`);
  }
  if (input["schemaVersion"] !== MISSING_EVIDENCE_REPORT_SCHEMA_VERSION) {
    fail(
      failures,
      "vocabulary-violation",
      "schemaVersion",
      `must be "${MISSING_EVIDENCE_REPORT_SCHEMA_VERSION}"`,
    );
  }
  if (input["contractVersion"] !== CONTRACT_VERSION) {
    fail(failures, "type-mismatch", "contractVersion", `must be ${CONTRACT_VERSION}`);
  }
  if (!isCanonicalDigest(input["reportId"])) {
    fail(failures, "digest-format", "reportId", "must be a 64-hex content-derived id");
  }
  if (!isCanonicalDigest(input["problemId"])) {
    fail(failures, "digest-format", "problemId", "must be a 64-hex problem id");
  }
  if (!isCanonicalDigest(input["contextId"])) {
    fail(failures, "digest-format", "contextId", "must be a 64-hex context id");
  }
  if (!isReadinessVerdict(input["verdict"])) {
    fail(failures, "vocabulary-violation", "verdict", "not a closed readiness verdict");
  }
  if (!isDeclaredInstant(input["detectedAt"])) {
    fail(failures, "type-mismatch", "detectedAt", "must be a declared ISO-8601 UTC instant");
  }
  const gaps = input["gaps"];
  if (!Array.isArray(gaps)) {
    fail(failures, "type-mismatch", "gaps", "must be an array of typed gaps");
  } else {
    gaps.forEach((gap, index) => {
      if (!isRecord(gap)) {
        fail(failures, "type-mismatch", `gaps[${index}]`, "each gap must be an object");
        return;
      }
      if (!isGapKind(gap["kind"])) {
        fail(failures, "vocabulary-violation", `gaps[${index}].kind`, "not a closed gap kind");
      }
      if (!isCanonicalDigest(gap["gapId"])) {
        fail(failures, "digest-format", `gaps[${index}].gapId`, "must be a 64-hex gap id");
      }
      if (!isCanonicalDigest(gap["requirementId"])) {
        fail(failures, "digest-format", `gaps[${index}].requirementId`, "must be a 64-hex requirement id");
      }
      if (!isNonEmptyString(gap["detail"])) {
        fail(failures, "type-mismatch", `gaps[${index}].detail`, "a gap detail must name what is missing");
      }
      const task = gap["remediationTask"];
      if (!isRecord(task)) {
        fail(failures, "missing-field", `gaps[${index}].remediationTask`, "every gap carries an explicit task");
      } else {
        const status = task["status"];
        if (
          status !== "open" &&
          status !== "collected" &&
          status !== "waived"
        ) {
          fail(
            failures,
            "vocabulary-violation",
            `gaps[${index}].remediationTask.status`,
            "not a closed task status",
          );
        }
        if (status === "waived" && !isNonEmptyString(task["waivedNote"])) {
          fail(
            failures,
            "waiver-without-note",
            `gaps[${index}].remediationTask.waivedNote`,
            "a waiver is never silent — the note is mandatory",
          );
        }
      }
    });
  }
  if (!Array.isArray(input["perRequirement"])) {
    fail(failures, "type-mismatch", "perRequirement", "must be an array of assessments");
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: input as unknown as MissingEvidenceReport };
}

/* ------------------------------------------------------------------ */
/* The EVIDENCE-stage typed transform                                   */
/* ------------------------------------------------------------------ */

/**
 * The EVIDENCE transform: bind evidence to a problem under the Evidence
 * Envelope laws. Validates the envelope shape, REFUSES duplicate evidence
 * identity, resolves every provenance link against the envelope + context
 * (fail-closed), and checks every invalidated id names evidence actually
 * in the envelope (invalidating nothing is fine; invalidating air is a
 * contract violation). PURE + deterministic.
 */
export function bindProblemEvidence(
  input: BindEvidenceInput,
  context: CaseContext,
): LaneOutcome<ProblemEvidenceEnvelope> {
  const shape = validateEvidenceEnvelope({
    ...input,
    kind: EVIDENCE_ENVELOPE_KIND,
    schemaVersion: EVIDENCE_ENVELOPE_SCHEMA_VERSION,
    contractVersion: CONTRACT_VERSION,
  });
  if (!shape.ok) {
    return laneRefused(
      "evidence",
      "contract-mismatch",
      `the evidence envelope violates the Evidence Envelope laws: ${shape.failures
        .map((failure) => `${failure.path} ${failure.kind} (${failure.detail})`)
        .join("; ")}`,
    );
  }
  if (input.problemId !== context.problemId) {
    return laneRefused(
      "evidence",
      "contract-mismatch",
      `the envelope binds problem ${input.problemId} but the case context is for problem ${context.problemId}`,
    );
  }
  const evidenceIds = new Set(input.evidence.map((record) => record.contentId));
  const contextSubjects = new Set<string>([
    ...context.realityObjects.map((object) => object.objectId),
    ...context.substrateCandidates.flatMap((candidate) =>
      candidate.aise.realityObjects.map((object) => object.objectId),
    ),
  ]);
  for (let index = 0; index < input.provenanceLinks.length; index += 1) {
    const link = input.provenanceLinks[index];
    if (link === undefined) {
      continue;
    }
    if (!evidenceIds.has(link.evidenceContentId)) {
      return laneRefused(
        "evidence",
        "contract-mismatch",
        `provenanceLinks[${index}] cites evidence ${link.evidenceContentId} that is not in the envelope — links to nothing are refused`,
      );
    }
    if (!contextSubjects.has(link.subjectId)) {
      return laneRefused(
        "evidence",
        "contract-mismatch",
        `provenanceLinks[${index}] cites subject ${link.subjectId} that does not resolve in the case context`,
      );
    }
  }
  for (const invalidatedId of input.invalidatedContentIds) {
    if (!evidenceIds.has(invalidatedId)) {
      return laneRefused(
        "evidence",
        "contract-mismatch",
        `invalidatedContentIds names ${invalidatedId} which is not evidence in this envelope — invalidating air is a contract violation`,
      );
    }
  }
  return {
    ok: true,
    value: {
      kind: EVIDENCE_ENVELOPE_KIND,
      schemaVersion: EVIDENCE_ENVELOPE_SCHEMA_VERSION,
      contractVersion: CONTRACT_VERSION,
      problemId: input.problemId,
      evidence: input.evidence,
      provenanceLinks: input.provenanceLinks,
      bundles: input.bundles,
      invalidatedContentIds: input.invalidatedContentIds,
      sealedAt: input.sealedAt,
    },
  };
}

/* ------------------------------------------------------------------ */
/* The MISSING-EVIDENCE controlled entry point                          */
/* ------------------------------------------------------------------ */

/**
 * The governed MISSING-EVIDENCE entry: validate the request (requirement
 * set non-empty — law #4, subjects resolve — law #4), freeze, delegate to
 * the detector port, post-validate the report.
 */
export function detectThroughEvidencePort(
  detector: MissingEvidenceDetector,
  request: MissingEvidenceRequest,
): LaneOutcome<MissingEvidenceReport> {
  if (request.requirements.problemId !== request.envelope.problemId) {
    return laneRefused(
      "evidence",
      "contract-mismatch",
      `the requirement set is for problem ${request.requirements.problemId} but the envelope is for ${request.envelope.problemId}`,
    );
  }
  if (request.requirements.requirements.length === 0) {
    return laneRefused(
      "evidence",
      "contract-mismatch",
      "an empty requirement set cannot be assessed — fail-closed, never vacuously READY (declare what the problem needs)",
    );
  }
  for (const requirement of request.requirements.requirements) {
    const validation = validateEvidenceRequirement(requirement);
    if (!validation.ok) {
      return laneRefused(
        "evidence",
        "contract-mismatch",
        `requirement ${requirement.requirementId} violates the contract: ${validation.failures
          .map((failure) => `${failure.path} (${failure.detail})`)
          .join("; ")}`,
      );
    }
  }
  const contextSubjects = new Set<string>([
    ...request.context.realityObjects.map((object) => object.objectId),
    ...request.context.substrateCandidates.flatMap((candidate) =>
      candidate.aise.realityObjects.map((object) => object.objectId),
    ),
  ]);
  for (const requirement of request.requirements.requirements) {
    if (!contextSubjects.has(requirement.subjectRef)) {
      return laneRefused(
        "evidence",
        "contract-mismatch",
        `requirement ${requirement.requirementId} subject ${requirement.subjectRef} does not resolve in the case context`,
      );
    }
  }
  const outcome = detector.detect(request);
  if (!outcome.ok) {
    return outcome;
  }
  const reportValidation = validateMissingEvidenceReport(outcome.value);
  if (!reportValidation.ok) {
    return laneRefused(
      "evidence",
      "contract-mismatch",
      `the detection report violates the contract: ${reportValidation.failures
        .map((failure) => `${failure.path} (${failure.detail})`)
        .join("; ")}`,
    );
  }
  return outcome;
}

/* ------------------------------------------------------------------ */
/* The canonical assessment helpers (shared by the doubles)             */
/* ------------------------------------------------------------------ */

/** The epistemic rank order for floor comparisons (OBSERVED < CONFIRMED). */
export const EPISTEMIC_RANK: Readonly<Record<string, number>> = {
  PROPOSED: 0,
  INFERRED: 1,
  OBSERVED: 2,
  CONFIRMED: 3,
};

/** The worst-of verdict roll-up (law #5). */
export function worstOfVerdicts(verdicts: readonly ReadinessVerdict[]): ReadinessVerdict {
  let worst: ReadinessVerdict = "READY";
  for (const verdict of verdicts) {
    if (verdict === "INSUFFICIENT_DATA") {
      return "INSUFFICIENT_DATA";
    }
    if (verdict === "NOT_READY") {
      worst = "NOT_READY";
    } else if (verdict === "READY_WITH_NOTES" && worst === "READY") {
      worst = "READY_WITH_NOTES";
    }
  }
  return worst;
}

/** The gap-kind → verdict contribution (law #5). */
export function verdictOfGapKind(kind: GapKind): ReadinessVerdict {
  if (kind === "MISSING") {
    return "NOT_READY";
  }
  return "READY_WITH_NOTES";
}

/**
 * The canonical gap/task builder shared by the doubles so their outputs
 * are byte-identical by construction.
 */
export function buildEvidenceGap(
  requirementId: string,
  kind: GapKind,
  detail: string,
  requestedMethod: EvidenceMethod | null,
): EvidenceGap {
  const remediationTask: MissingEvidenceTask = {
    taskId: "",
    description: `Collect the missing evidence to close requirement ${requirementId}: ${detail}`,
    requestedMethod,
    status: "open",
    waivedNote: null,
  };
  const taskId = contentIdOf(
    remediationTask as unknown as Record<string, unknown>,
    "taskId",
  );
  const task: MissingEvidenceTask = { ...remediationTask, taskId };
  const gap: EvidenceGap = {
    gapId: "",
    requirementId,
    kind,
    detail,
    remediationTask: task,
  };
  const gapId = contentIdOf(gap as unknown as Record<string, unknown>, "gapId");
  return { ...gap, gapId };
}

/**
 * The canonical report seal shared by the doubles: derives the report with
 * its content-derived `reportId`.
 */
export function sealMissingEvidenceReport(
  report: Omit<MissingEvidenceReport, "reportId">,
): MissingEvidenceReport {
  const reportId = contentIdOf(
    report as unknown as Record<string, unknown>,
    "reportId",
  );
  return { ...report, reportId };
}
