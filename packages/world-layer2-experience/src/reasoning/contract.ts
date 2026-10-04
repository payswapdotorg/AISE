/**
 * WORLD-P2 — the REASONING family (`src/reasoning/`): stages 5–6 of the
 * lane.
 *
 *   BOUNDED REASONING      — the typed contract for bounded reasoning
 *                            steps over evidence. THE LLM LANE IS A
 *                            REPLACEABLE SUBSTRATE BEHIND A PORT — exactly
 *                            like the geometry/IFC substrates of P0-B: the
 *                            real occupant (an actual LLM adapter) is
 *                            BLOCKED pending the bounded-reasoning
 *                            substrate decision (see the item's
 *                            CAPABILITY-BOUNDARIES); the two in-memory
 *                            substitution doubles prove the contract
 *                            WITHOUT any model. Retrieval is SCOPED to
 *                            the case context (the provider receives
 *                            exactly the context + envelope + report and
 *                            can cite nothing else); every reasoning
 *                            output is INFERRED with its prompt/context
 *                            provenance recorded; and refusal on
 *                            insufficient evidence is a first-class
 *                            outcome — an LLM is NEVER an engineering
 *                            authority (directive §10).
 *   DETERMINISTIC CHECKS   — the gate that classifies which checks the
 *                            deterministic solution engine + verification
 *                            seams OWN (engine-owned — the only
 *                            engineering authorities) versus which are
 *                            ADVISORY (bounded-reasoning derived). The
 *                            gate REFUSES fabricated authority: a check
 *                            claiming engine ownership from outside the
 *                            closed inventory, or from a bounded-reasoning
 *                            source, is a typed refusal.
 *
 * The refusal-code registry below mirrors the AISE-029 Engineering
 * Reasoning gateway's FROZEN `REFUSAL_CODES` verbatim
 * (INSUFFICIENT_EVIDENCE / UNGROUNDED_QUESTION / POLICY_VIOLATION /
 * PROVIDER_FAILURE / CONTRACT_VIOLATION). The backend gateway remains the
 * authority for its own seam; this P2 contract is the experience lane's
 * typed mirror so the WORLD-P4 composition is a wiring act, never a
 * re-definition. Recorded as a finding in the item's evidence set.
 *
 * LAWS (on top of the seam's nine; enforced here and drilled by
 * `reasoning.test.ts`):
 *
 *  1. INFERRED-ONLY OUTPUTS: a reasoning claim's epistemicStatus is the
 *     LITERAL "INFERRED" and advisoryOnly is the LITERAL true — an
 *     OBSERVED/CONFIRMED/PROPOSED claim or an authoritative claim from a
 *     bounded reasoner is a CONTRACT_VIOLATION refusal (the claim is
 *     rejected, never passed through).
 *  2. CITATIONS RESOLVE OR REFUSE: every claim cites things INSIDE the
 *     supplied context/envelope/report (closed citation vocabulary); an
 *     unresolvable citation is a CONTRACT_VIOLATION refusal — providers
 *     are untrusted input sources, exactly like wire input.
 *  3. REFUSAL ON INSUFFICIENT EVIDENCE: when the missing-evidence verdict
 *     is NOT_READY or INSUFFICIENT_DATA, the provider MUST refuse with
 *     INSUFFICIENT_EVIDENCE naming the blocking gap ids — a
 *     wrong-but-confident answer is the failure mode this lane exists to
 *     prevent.
 *  4. PROMPT/CONTEXT PROVENANCE IS RECORDED: every output (and every
 *     refusal) carries the provider descriptor digest, the rendered
 *     prompt digest and the case-context digest — substitution continuity
 *     is testable from this block alone.
 *  5. THE GATE'S CLOSED INVENTORY: engine-owned check ids come from the
 *     closed inventory mirroring the PROD-022 solution-engine check list
 *     and the AISE-023 verification FINDING_CODES verbatim; anything else
 *     claiming engine ownership is refused as fabricated authority.
 *  6. WORST-OF ENGINE VERDICTS: engine-owned check outcomes roll up
 *     worst-of (fail > review-needed > unknown > pass — the PROD-022
 *     order); advisory checks NEVER affect the authoritative verdict.
 */

import { canonicalDigestOf } from "@aise/world-understanding-substrate";
import {
  contentIdOf,
  deepFreeze,
  isCanonicalDigest,
  isDeclaredInstant,
  isNonEmptyString,
  isRecord,
  type LaneActor,
  type LaneOutcome,
  type LaneProviderDescriptor,
} from "../seam";
import type { CaseContext } from "../problem/contract";
import type {
  MissingEvidenceReport,
  ProblemEvidenceEnvelope,
  ReadinessVerdict,
} from "../evidence/contract";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const BOUNDED_REASONING_REQUEST_KIND = "bounded-reasoning-request" as const;
export const BOUNDED_REASONING_REQUEST_SCHEMA_VERSION = "bounded-reasoning-request/1" as const;
export const BOUNDED_REASONING_RESULT_KIND = "bounded-reasoning-result" as const;
export const BOUNDED_REASONING_RESULT_SCHEMA_VERSION = "bounded-reasoning-result/1" as const;
export const CHECK_GATE_VERDICT_KIND = "deterministic-check-gate-verdict" as const;
export const CHECK_GATE_VERDICT_SCHEMA_VERSION = "deterministic-check-gate-verdict/1" as const;

/** Closed question kinds the lane asks a bounded reasoner. */
export const BOUNDED_QUESTION_KINDS = [
  "summarize_evidence",
  "discriminate_hypotheses",
  "propose_next_action",
  "identify_risk",
] as const;
export type BoundedQuestionKind = (typeof BOUNDED_QUESTION_KINDS)[number];

export function isBoundedQuestionKind(value: unknown): value is BoundedQuestionKind {
  return (
    typeof value === "string" &&
    (BOUNDED_QUESTION_KINDS as readonly string[]).includes(value)
  );
}

/**
 * The frozen refusal-code registry — a VERBATIM mirror of the AISE-029
 * Engineering Reasoning gateway's `REFUSAL_CODES` (the backend gateway
 * stays the authority for its own seam; see the module header).
 */
export const REASONING_REFUSAL_CODES = [
  "INSUFFICIENT_EVIDENCE",
  "UNGROUNDED_QUESTION",
  "POLICY_VIOLATION",
  "PROVIDER_FAILURE",
  "CONTRACT_VIOLATION",
] as const satisfies readonly string[];
export type ReasoningRefusalCode = (typeof REASONING_REFUSAL_CODES)[number];

export function isReasoningRefusalCode(value: unknown): value is ReasoningRefusalCode {
  return (
    typeof value === "string" &&
    (REASONING_REFUSAL_CODES as readonly string[]).includes(value)
  );
}

/** Closed citation-target vocabulary (what a claim may cite). */
export const CLAIM_CITATION_KINDS = [
  "evidence",
  "measurement",
  "property_assertion",
  "observation",
  "substrate_candidate",
  "gap",
] as const;
export type ClaimCitationKind = (typeof CLAIM_CITATION_KINDS)[number];

/**
 * The closed ENGINE-OWNED check inventory — the only check ids that may
 * claim engine authority, mirroring VERBATIM:
 *
 *  - the `solution.*` family: the PROD-022 deterministic solution-engine
 *    validation check inventory (7 checks);
 *  - the `verification.*` family: the AISE-023 verification engine's
 *    frozen FINDING_CODES registry (13 codes).
 *
 * The deterministic solution engine + verification seams stay the ONLY
 * engineering authorities (directive §3/§10); the WORLD-P4 wiring binds
 * these ids to the real engine snapshots.
 */
export const ENGINE_OWNED_CHECK_IDS = [
  "solution.operation.contract-invariants",
  "solution.geometry.dimensions-positive",
  "solution.units.quantity-units-typed",
  "solution.operation.ordering-dependencies",
  "solution.quantities.calculation-refs",
  "solution.operation.capability-declared",
  "solution.operation.phase1-limits",
  "verification.missing-unit",
  "verification.uncertain-numeric-without-sigma",
  "verification.epistemic-downgrade-suspect",
  "verification.unprovenanced-property",
  "verification.dangling-relationship",
  "verification.orphan-node",
  "verification.duplicate-node-kind-in-space",
  "verification.semantic-kind-mismatch",
  "verification.opening-without-host",
  "verification.invalidated-evidence-linked",
  "verification.missing-evidence-record",
  "verification.readiness-not-ready",
  "verification.critical-dimension-unknown",
] as const;
export type EngineOwnedCheckId = (typeof ENGINE_OWNED_CHECK_IDS)[number];

/** Closed check-ownership vocabulary. */
export const CHECK_OWNERSHIPS = ["engine-owned", "advisory"] as const;
export type CheckOwnership = (typeof CHECK_OWNERSHIPS)[number];

/** Closed check-source vocabulary (who produced the check). */
export const CHECK_SOURCE_KINDS = ["deterministic-engine", "bounded-reasoning"] as const;
export type CheckSourceKind = (typeof CHECK_SOURCE_KINDS)[number];

/** Closed check-outcome vocabulary — mirrors the PROD-022 snapshot checks. */
export const CHECK_OUTCOMES = ["pass", "fail", "unknown", "review-needed"] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

/** Closed gate-failure vocabulary (the fail-closed drill surface). */
export const CHECK_GATE_FAILURE_KINDS = [
  "fabricated-authority",
  "authority-mislabel",
  "unresolvable-check-provenance",
  "empty-check-set",
  "vocabulary-violation",
] as const;
export type CheckGateFailureKind = (typeof CHECK_GATE_FAILURE_KINDS)[number];

export interface CheckGateFailure {
  readonly kind: CheckGateFailureKind;
  readonly checkId: string;
  readonly detail: string;
}

/** Closed validation-failure vocabulary of this family (shape layer). */
export const REASONING_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "missing-field",
  "type-mismatch",
  "value-out-of-range",
  "vocabulary-violation",
  "digest-format",
  "epistemic-status-violation",
  "advisory-violation",
  "citation-unresolvable",
  "empty-citation-set",
] as const;
export type ReasoningValidationFailureKind =
  (typeof REASONING_VALIDATION_FAILURE_KINDS)[number];

export interface ReasoningValidationFailure {
  readonly kind: ReasoningValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type ReasoningValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; failures: readonly ReasoningValidationFailure[] };

/* ------------------------------------------------------------------ */
/* The bounded-reasoning request + result                               */
/* ------------------------------------------------------------------ */

/**
 * The bounded-reasoning request: the engineer's question over the case.
 * `contextId` + `reportId` pin the retrieval scope — the provider sees
 * exactly the pinned context/envelope/report, nothing else. The prompt
 * template identity is DECLARED (provenance law #4).
 */
export interface BoundedReasoningRequest {
  readonly kind: typeof BOUNDED_REASONING_REQUEST_KIND;
  readonly schemaVersion: typeof BOUNDED_REASONING_REQUEST_SCHEMA_VERSION;
  readonly requestId: string;
  readonly problemId: string;
  readonly contextId: string;
  readonly reportId: string;
  readonly question: BoundedQuestionKind;
  readonly questionText: string;
  readonly askedBy: LaneActor;
  readonly askedAt: string;
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: string;
}

/** One citation of a thing inside the supplied scope. */
export interface ClaimCitation {
  readonly citedKind: ClaimCitationKind;
  readonly citedId: string;
}

/**
 * One INFERRED reasoning claim — advisory, cited, never authoritative.
 * `epistemicStatus` and `advisoryOnly` are LITERAL types: the gateway's
 * post-validation rejects any provider output claiming otherwise.
 */
export interface ReasoningClaim {
  readonly claimId: string;
  readonly statement: string;
  readonly epistemicStatus: "INFERRED";
  readonly citations: readonly ClaimCitation[];
  readonly advisoryOnly: true;
}

/**
 * The prompt/context provenance recorded on EVERY reasoning output and
 * refusal (law #4): who computed it, which rendered prompt, which
 * context, under which retrieval scope.
 */
export interface ReasoningProvenance {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly providerDescriptorDigest: string;
  readonly promptDigest: string;
  readonly contextDigest: string;
  readonly retrievalScope: "case-context";
}

/** The bounded-reasoning result: INFERRED claims + provenance. */
export interface ReasoningStepResult {
  readonly kind: typeof BOUNDED_REASONING_RESULT_KIND;
  readonly schemaVersion: typeof BOUNDED_REASONING_RESULT_SCHEMA_VERSION;
  readonly resultId: string;
  readonly requestId: string;
  readonly claims: readonly ReasoningClaim[];
  readonly reasoningProvenance: ReasoningProvenance;
  readonly producedAt: string;
}

/** A typed refusal: the closed code + the honest detail naming what blocks. */
export interface ReasoningRefusal {
  readonly code: ReasoningRefusalCode;
  readonly detail: string;
}

/** The discriminated outcome of one bounded-reasoning port call. */
export type BoundedReasoningOutcome =
  | { readonly ok: true; readonly result: ReasoningStepResult }
  | {
      readonly ok: false;
      readonly refusal: ReasoningRefusal;
      readonly provenance: ReasoningProvenance;
    };

/**
 * The provider-neutral bounded-reasoning port — THE LLM SUBSTRATE SEAM.
 * Implementable by a real LLM adapter (BLOCKED — substrate decision
 * pending) or by the two in-memory substitution doubles. The provider
 * receives ONLY the pinned scope (request + context + envelope + report):
 * bounded retrieval by construction.
 */
export interface BoundedReasoningProvider {
  readonly descriptor: LaneProviderDescriptor;
  readonly reason: (
    request: BoundedReasoningRequest,
    context: CaseContext,
    envelope: ProblemEvidenceEnvelope,
    report: MissingEvidenceReport,
  ) => BoundedReasoningOutcome;
}

/* ------------------------------------------------------------------ */
/* The deterministic-check gate                                         */
/* ------------------------------------------------------------------ */

/** One check attached to a proposed action, with its CLAIMED ownership. */
export interface AttachedCheck {
  readonly checkId: string;
  readonly ownership: CheckOwnership;
  readonly outcome: CheckOutcome;
  readonly detail: string;
  readonly sourceKind: CheckSourceKind;
  /** The engine snapshot digest / reasoning result id that produced it. */
  readonly sourceProvenanceDigest: string;
}

/** The DETERMINISTIC-CHECKS-stage input (the controlled entry's request). */
export interface DeterministicCheckGateInput {
  readonly problemId: string;
  readonly attachedChecks: readonly AttachedCheck[];
  readonly reasoningResults: readonly ReasoningStepResult[];
}

/**
 * The gate verdict: the engine-owned classification + the worst-of
 * authoritative outcome. `advisoryChecks` are recorded, never verdict-
 * bearing. A refused gate carries the typed failures (fabricated
 * authority, mislabel, unresolvable provenance).
 */
export interface DeterministicCheckGateVerdict {
  readonly kind: typeof CHECK_GATE_VERDICT_KIND;
  readonly schemaVersion: typeof CHECK_GATE_VERDICT_SCHEMA_VERSION;
  readonly gateId: string;
  readonly problemId: string;
  readonly verdict: "pass" | "fail" | "unknown" | "review-needed" | "refused";
  readonly engineOwnedOutcome: CheckOutcome | null;
  readonly engineOwnedCheckIds: readonly string[];
  readonly advisoryCheckIds: readonly string[];
  readonly failures: readonly CheckGateFailure[];
  readonly gatedAt: string;
}

/** Worst-of roll-up over engine-owned check outcomes (law #6). */
export function worstOfCheckOutcomes(outcomes: readonly CheckOutcome[]): CheckOutcome {
  if (outcomes.includes("fail")) {
    return "fail";
  }
  if (outcomes.includes("review-needed")) {
    return "review-needed";
  }
  if (outcomes.includes("unknown")) {
    return "unknown";
  }
  return "pass";
}

/* ------------------------------------------------------------------ */
/* The reasoning request builder + validators                           */
/* ------------------------------------------------------------------ */

/** Builds the canonical prompt digest (law #4) — deterministic. */
export function promptDigestOf(
  request: BoundedReasoningRequest,
  contextDigest: string,
): string {
  return canonicalDigestOf({
    promptTemplateId: request.promptTemplateId,
    promptTemplateVersion: request.promptTemplateVersion,
    question: request.question,
    questionText: request.questionText,
    contextDigest,
    reportId: request.reportId,
  });
}

/** Validates an unknown payload as a `BoundedReasoningRequest`. PURE. */
export function validateBoundedReasoningRequest(
  input: unknown,
): ReasoningValidation<BoundedReasoningRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "the request must be an object" },
      ],
    };
  }
  const failures: ReasoningValidationFailure[] = [];
  const fail = (
    kind: ReasoningValidationFailureKind,
    path: string,
    detail: string,
  ): void => {
    failures.push({ kind, path, detail });
  };
  if (input["kind"] !== BOUNDED_REASONING_REQUEST_KIND) {
    fail("vocabulary-violation", "kind", `must be "${BOUNDED_REASONING_REQUEST_KIND}"`);
  }
  if (input["schemaVersion"] !== BOUNDED_REASONING_REQUEST_SCHEMA_VERSION) {
    fail(
      "vocabulary-violation",
      "schemaVersion",
      `must be "${BOUNDED_REASONING_REQUEST_SCHEMA_VERSION}"`,
    );
  }
  if (!isCanonicalDigest(input["requestId"])) {
    fail("digest-format", "requestId", "must be a 64-hex request id");
  }
  if (!isCanonicalDigest(input["problemId"])) {
    fail("digest-format", "problemId", "must be a 64-hex problem id");
  }
  if (!isCanonicalDigest(input["contextId"])) {
    fail("digest-format", "contextId", "must be a 64-hex context id");
  }
  if (!isCanonicalDigest(input["reportId"])) {
    fail("digest-format", "reportId", "must be a 64-hex report id");
  }
  if (!isBoundedQuestionKind(input["question"])) {
    fail("vocabulary-violation", "question", `must be one of ${BOUNDED_QUESTION_KINDS.join(" | ")}`);
  }
  if (!isNonEmptyString(input["questionText"])) {
    fail("type-mismatch", "questionText", "must be a non-empty string");
  }
  if (!isRecord(input["askedBy"]) || !isNonEmptyString(input["askedBy"]?.["actorId"])) {
    fail("missing-field", "askedBy", "the asking actor is required");
  }
  if (!isDeclaredInstant(input["askedAt"])) {
    fail("type-mismatch", "askedAt", "must be a declared ISO-8601 UTC instant");
  }
  if (!isNonEmptyString(input["promptTemplateId"])) {
    fail("type-mismatch", "promptTemplateId", "the declared prompt template identity is required");
  }
  if (!isNonEmptyString(input["promptTemplateVersion"])) {
    fail("type-mismatch", "promptTemplateVersion", "the declared prompt template version is required");
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: input as unknown as BoundedReasoningRequest };
}

/** Validates an unknown payload as a `ReasoningStepResult`. PURE. */
export function validateReasoningStepResult(
  input: unknown,
): ReasoningValidation<ReasoningStepResult> {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "the result must be an object" },
      ],
    };
  }
  const failures: ReasoningValidationFailure[] = [];
  const fail = (
    kind: ReasoningValidationFailureKind,
    path: string,
    detail: string,
  ): void => {
    failures.push({ kind, path, detail });
  };
  if (input["kind"] !== BOUNDED_REASONING_RESULT_KIND) {
    fail("vocabulary-violation", "kind", `must be "${BOUNDED_REASONING_RESULT_KIND}"`);
  }
  if (input["schemaVersion"] !== BOUNDED_REASONING_RESULT_SCHEMA_VERSION) {
    fail(
      "vocabulary-violation",
      "schemaVersion",
      `must be "${BOUNDED_REASONING_RESULT_SCHEMA_VERSION}"`,
    );
  }
  if (!isCanonicalDigest(input["resultId"])) {
    fail("digest-format", "resultId", "must be a 64-hex content-derived id");
  }
  if (!isCanonicalDigest(input["requestId"])) {
    fail("digest-format", "requestId", "must be a 64-hex request id");
  }
  if (!isDeclaredInstant(input["producedAt"])) {
    fail("type-mismatch", "producedAt", "must be a declared ISO-8601 UTC instant");
  }
  const claims = input["claims"];
  if (!Array.isArray(claims)) {
    fail("type-mismatch", "claims", "must be an array of claims");
  } else {
    claims.forEach((claim, index) => {
      if (!isRecord(claim)) {
        fail("type-mismatch", `claims[${index}]`, "each claim must be an object");
        return;
      }
      if (claim["epistemicStatus"] !== "INFERRED") {
        fail(
          "epistemic-status-violation",
          `claims[${index}].epistemicStatus`,
          `a reasoning claim is INFERRED, never ${String(claim["epistemicStatus"])} — the LLM lane is not an engineering authority`,
        );
      }
      if (claim["advisoryOnly"] !== true) {
        fail(
          "advisory-violation",
          `claims[${index}].advisoryOnly`,
          "a reasoning claim is advisory only — it can never carry engineering authority",
        );
      }
      if (!isNonEmptyString(claim["statement"])) {
        fail("type-mismatch", `claims[${index}].statement`, "must be a non-empty statement");
      }
      const citations = claim["citations"];
      if (!Array.isArray(citations) || citations.length === 0) {
        fail(
          "empty-citation-set",
          `claims[${index}].citations`,
          "every claim carries a non-empty citation set — citations are the grounding contract",
        );
      } else {
        citations.forEach((citation, citationIndex) => {
          if (
            !isRecord(citation) ||
            !(CLAIM_CITATION_KINDS as readonly string[]).includes(
              String(citation["citedKind"]),
            ) ||
            !isNonEmptyString(citation["citedId"])
          ) {
            fail(
              "vocabulary-violation",
              `claims[${index}].citations[${citationIndex}]`,
              "every citation names a closed citation kind and a cited id",
            );
          }
        });
      }
    });
  }
  const provenance = input["reasoningProvenance"];
  if (!isRecord(provenance)) {
    fail("missing-field", "reasoningProvenance", "the prompt/context provenance block is required");
  } else {
    if (!isNonEmptyString(provenance["providerId"])) {
      fail("type-mismatch", "reasoningProvenance.providerId", "must be a non-empty provider id");
    }
    if (!isNonEmptyString(provenance["technologyVersion"])) {
      fail("type-mismatch", "reasoningProvenance.technologyVersion", "must be a non-empty version");
    }
    if (!isCanonicalDigest(provenance["providerDescriptorDigest"])) {
      fail("digest-format", "reasoningProvenance.providerDescriptorDigest", "must be 64-hex");
    }
    if (!isCanonicalDigest(provenance["promptDigest"])) {
      fail("digest-format", "reasoningProvenance.promptDigest", "must be 64-hex");
    }
    if (!isCanonicalDigest(provenance["contextDigest"])) {
      fail("digest-format", "reasoningProvenance.contextDigest", "must be 64-hex");
    }
    if (provenance["retrievalScope"] !== "case-context") {
      fail(
        "vocabulary-violation",
        "reasoningProvenance.retrievalScope",
        "retrieval is scoped to the case context — the literal value is the law",
      );
    }
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: input as unknown as ReasoningStepResult };
}

/* ------------------------------------------------------------------ */
/* The citation-resolution law (law #2)                                 */
/* ------------------------------------------------------------------ */

/**
 * Resolves every citation of a claim set against the supplied scope.
 * Returns the typed failures for citations that cite nothing. PURE.
 */
export function resolveClaimCitations(
  claims: readonly ReasoningClaim[],
  context: CaseContext,
  envelope: ProblemEvidenceEnvelope,
  report: MissingEvidenceReport,
): readonly ReasoningValidationFailure[] {
  const evidenceIds = new Set(envelope.evidence.map((record) => record.contentId));
  const measurementIds = new Set(context.measurements.map((record) => record.measurementId));
  const assertionIds = new Set(
    context.propertyAssertions.map((record) => record.assertionId),
  );
  const observationIds = new Set(context.observations.map((record) => record.observationId));
  const candidateIds = new Set(
    context.substrateCandidates.flatMap((candidate) => [
      ...candidate.aise.realityObjects.map((object) => object.objectId),
      ...candidate.aise.propertyAssertions.map((assertion) => assertion.assertionId),
      ...candidate.aise.measurements.map((measurement) => measurement.measurementId),
    ]),
  );
  const gapIds = new Set(report.gaps.map((gap) => gap.gapId));
  const resolvers: Readonly<Record<ClaimCitationKind, ReadonlySet<string>>> = {
    evidence: evidenceIds,
    measurement: measurementIds,
    property_assertion: assertionIds,
    observation: observationIds,
    substrate_candidate: candidateIds,
    gap: gapIds,
  };
  const failures: ReasoningValidationFailure[] = [];
  claims.forEach((claim, claimIndex) => {
    claim.citations.forEach((citation, citationIndex) => {
      const ids = resolvers[citation.citedKind];
      if (ids === undefined || !ids.has(citation.citedId)) {
        failures.push({
          kind: "citation-unresolvable",
          path: `claims[${claimIndex}].citations[${citationIndex}]`,
          detail:
            `citation ${citation.citedKind}:${citation.citedId} does not resolve inside the supplied ` +
            "case scope — claims may cite only what the scope contains",
        });
      }
    });
  });
  return failures;
}

/* ------------------------------------------------------------------ */
/* The BOUNDED-REASONING controlled entry point                         */
/* ------------------------------------------------------------------ */

/**
 * The governed BOUNDED-REASONING entry: validate the request, freeze,
 * check the readiness pre-condition (law #3 — refuse BEFORE the provider
 * runs when the missing-evidence verdict is NOT_READY/INSUFFICIENT_DATA,
 * so no provider, real or double, can reason over insufficient
 * evidence), delegate, then post-validate the provider's output (laws #1
 * and #2 — INFERRED-only claims, resolved citations). Providers are
 * untrusted input sources, exactly like wire input.
 */
export function reasonThroughBoundedPort(
  provider: BoundedReasoningProvider,
  request: BoundedReasoningRequest,
  context: CaseContext,
  envelope: ProblemEvidenceEnvelope,
  report: MissingEvidenceReport,
): BoundedReasoningOutcome {
  const requestValidation = validateBoundedReasoningRequest(request);
  if (!requestValidation.ok) {
    return {
      ok: false,
      refusal: {
        code: "CONTRACT_VIOLATION",
        detail: `the request violates the contract: ${requestValidation.failures
          .map((failure) => `${failure.path} (${failure.detail})`)
          .join("; ")}`,
      },
      provenance: {
        providerId: provider.descriptor.providerId,
        technologyVersion: provider.descriptor.technologyVersion,
        providerDescriptorDigest: canonicalDigestOf(provider.descriptor),
        promptDigest: promptDigestOf(request, context.contextId),
        contextDigest: context.contextId,
        retrievalScope: "case-context",
      },
    };
  }
  if (request.contextId !== context.contextId || request.reportId !== report.reportId) {
    return {
      ok: false,
      refusal: {
        code: "UNGROUNDED_QUESTION",
        detail:
          `the request pins context ${request.contextId}/report ${request.reportId} but the supplied ` +
          `scope is ${context.contextId}/${report.reportId} — the retrieval scope is pinned, never widened`,
      },
      provenance: {
        providerId: provider.descriptor.providerId,
        technologyVersion: provider.descriptor.technologyVersion,
        providerDescriptorDigest: canonicalDigestOf(provider.descriptor),
        promptDigest: promptDigestOf(request, context.contextId),
        contextDigest: context.contextId,
        retrievalScope: "case-context",
      },
    };
  }
  if (report.verdict === "NOT_READY" || report.verdict === "INSUFFICIENT_DATA") {
    return {
      ok: false,
      refusal: {
        code: "INSUFFICIENT_EVIDENCE",
        detail:
          `the missing-evidence verdict is ${report.verdict}; blocking gaps: ` +
          report.gaps
            .filter((gap) => gap.kind === "MISSING" || report.verdict === "INSUFFICIENT_DATA")
            .map((gap) => gap.gapId)
            .join(", ") +
          " — collect the missing evidence before reasoning over this case",
      },
      provenance: {
        providerId: provider.descriptor.providerId,
        technologyVersion: provider.descriptor.technologyVersion,
        providerDescriptorDigest: canonicalDigestOf(provider.descriptor),
        promptDigest: promptDigestOf(request, context.contextId),
        contextDigest: context.contextId,
        retrievalScope: "case-context",
      },
    };
  }
  const outcome = provider.reason(deepFreeze(request), context, envelope, report);
  if (outcome.ok) {
    const resultValidation = validateReasoningStepResult(outcome.result);
    if (!resultValidation.ok) {
      return {
        ok: false,
        refusal: {
          code: "CONTRACT_VIOLATION",
          detail: `the provider's output violates the contract: ${resultValidation.failures
            .map((failure) => `${failure.path} (${failure.detail})`)
            .join("; ")}`,
        },
        provenance: outcome.result.reasoningProvenance,
      };
    }
    const citationFailures = resolveClaimCitations(
      outcome.result.claims,
      context,
      envelope,
      report,
    );
    if (citationFailures.length > 0) {
      return {
        ok: false,
        refusal: {
          code: "CONTRACT_VIOLATION",
          detail: `the provider's claims cite outside the supplied scope: ${citationFailures
            .map((failure) => failure.detail)
            .join("; ")}`,
        },
        provenance: outcome.result.reasoningProvenance,
      };
    }
  }
  return outcome;
}

/* ------------------------------------------------------------------ */
/* The DETERMINISTIC-CHECKS typed transform                             */
/* ------------------------------------------------------------------ */

/**
 * The DETERMINISTIC-CHECKS gate: classifies the attached checks and rolls
 * up the authoritative verdict. FAILS CLOSED on fabricated authority:
 *
 *  - a check claiming `engine-owned` whose id is NOT in the closed
 *    inventory → `fabricated-authority` (refused);
 *  - a check claiming `engine-owned` produced by `bounded-reasoning` →
 *    `fabricated-authority` (refused — the LLM lane never owns checks);
 *  - a check claiming `advisory` produced by `deterministic-engine` →
 *    `authority-mislabel` (refused — provenance honesty is symmetric);
 *  - an advisory check whose source digest resolves to NONE of the
 *    supplied reasoning results → `unresolvable-check-provenance`;
 *  - an engine-owned check whose source digest is not a 64-hex engine
 *    snapshot digest → `unresolvable-check-provenance`;
 *  - an empty check set → `empty-check-set` (a consequential action
 *    without any deterministic check is refused, never vacuously valid).
 *
 * Advisory checks NEVER affect the authoritative verdict (law #6).
 * PURE + deterministic.
 */
export function gateDeterministicChecks(
  input: DeterministicCheckGateInput,
  gatedAt: string,
): LaneOutcome<DeterministicCheckGateVerdict> {
  const failures: CheckGateFailure[] = [];
  const engineOwnedCheckIds: string[] = [];
  const advisoryCheckIds: string[] = [];
  const engineOutcomes: CheckOutcome[] = [];
  const reasoningResultIds = new Set(input.reasoningResults.map((result) => result.resultId));

  if (input.attachedChecks.length === 0) {
    failures.push({
      kind: "empty-check-set",
      checkId: "",
      detail:
        "no deterministic or advisory checks attached — a consequential action without any " +
        "deterministic check is refused, never vacuously valid",
    });
  }
  for (const check of input.attachedChecks) {
    const inInventory = (ENGINE_OWNED_CHECK_IDS as readonly string[]).includes(check.checkId);
    if (check.ownership === "engine-owned") {
      if (!inInventory) {
        failures.push({
          kind: "fabricated-authority",
          checkId: check.checkId,
          detail:
            "the check claims engine ownership but its id is outside the closed engine-owned " +
            "inventory (the solution-engine + verification-seam check lists) — fabricated authority",
        });
        continue;
      }
      if (check.sourceKind !== "deterministic-engine") {
        failures.push({
          kind: "fabricated-authority",
          checkId: check.checkId,
          detail:
            "the check claims engine ownership but its source is a bounded-reasoning output — " +
            "the LLM lane never owns deterministic checks",
        });
        continue;
      }
      if (!isCanonicalDigest(check.sourceProvenanceDigest)) {
        failures.push({
          kind: "unresolvable-check-provenance",
          checkId: check.checkId,
          detail:
            "the engine-owned check does not cite a 64-hex deterministic engine snapshot digest",
        });
        continue;
      }
      engineOwnedCheckIds.push(check.checkId);
      engineOutcomes.push(check.outcome);
    } else {
      if (check.sourceKind === "deterministic-engine") {
        failures.push({
          kind: "authority-mislabel",
          checkId: check.checkId,
          detail:
            "the check is advisory-labeled but produced by the deterministic engine — " +
            "provenance honesty is symmetric, mislabeling authority in either direction is refused",
        });
        continue;
      }
      if (!reasoningResultIds.has(check.sourceProvenanceDigest)) {
        failures.push({
          kind: "unresolvable-check-provenance",
          checkId: check.checkId,
          detail:
            "the advisory check cites a reasoning result that was not supplied — " +
            "advisory provenance must resolve",
        });
        continue;
      }
      advisoryCheckIds.push(check.checkId);
    }
  }

  const refused = failures.length > 0;
  const body: Omit<DeterministicCheckGateVerdict, "gateId"> = {
    kind: CHECK_GATE_VERDICT_KIND,
    schemaVersion: CHECK_GATE_VERDICT_SCHEMA_VERSION,
    problemId: input.problemId,
    verdict: refused ? "refused" : worstOfCheckOutcomes(engineOutcomes),
    engineOwnedOutcome: refused ? null : worstOfCheckOutcomes(engineOutcomes),
    engineOwnedCheckIds,
    advisoryCheckIds,
    failures,
    gatedAt,
  };
  const gateId = contentIdOf(body as unknown as Record<string, unknown>, "gateId");
  return { ok: true, value: { ...body, gateId } };
}

/* ------------------------------------------------------------------ */
/* The refusal helper for readiness-blocked questions                   */
/* ------------------------------------------------------------------ */

/** Builds the typed refusal for a readiness-blocked request (law #3). */
export function refusalForReadiness(
  verdict: ReadinessVerdict,
  blockingGapIds: readonly string[],
): ReasoningRefusal {
  return {
    code: "INSUFFICIENT_EVIDENCE",
    detail:
      `the missing-evidence verdict is ${verdict}; blocking gaps: ` +
      (blockingGapIds.length === 0 ? "(none named)" : blockingGapIds.join(", ")) +
      " — collect the missing evidence before reasoning over this case",
  };
}
