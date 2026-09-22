/**
 * PROD-028 — Layer-2 reasoning evaluation: the provider-neutral HARNESS.
 *
 * `evaluateScenario(scenario, registryLog)` is THE Layer-2 evaluation
 * entry point (the one HFX-201/202/203/204 consume — see
 * docs/productization-evidence/PROD-028/evaluation-entry-point.md):
 *
 *   1. VALIDATE the scenario and the registry log through the control
 *      plane's pure validators (profile 15/15, the input against the
 *      profile's declared INPUT contract, the raw execution against the
 *      OUTPUT contract via `normalizeResult`) — typed refusals, never a
 *      silent coercion;
 *   2. MAP the provider's declared result ONTO the canonical Evidence
 *      Envelope shape (model.ts) — a failed provider result (e.g. the
 *      explicit unsupported-data refusal, the control-plane pattern)
 *      maps onto the degenerate honest-refusal envelope; measurement
 *      uncertainty is propagated VERBATIM from cited evidence, never
 *      provider-declared;
 *   3. VERIFY the envelope's integrity rules (every claim carries
 *      evidence IDs; assumptions are explicit; unknowns are explicit;
 *      agent/provider identity recorded; …) and record violations as
 *      CLOSED-vocabulary failure observations — never new vocabulary;
 *   4. CLASSIFY the outcome with the deterministic precedence tree that
 *      distinguishes perception / retrieval / reasoning /
 *      unsupported-data / operation-semantic failures — the §HF-2 exit
 *      gate's five-way discrimination;
 *   5. EMIT the control-plane `BenchmarkRecord` (content-addressed,
 *      validated by `validateBenchmarkRecord`) + the portable
 *      `ProvenanceManifest` (`sealProvenanceManifest`) — the evaluation
 *      artifact pair the provider registry consumes.
 *
 * THE PRECEDENCE TREE (documented order; the discrimination contract):
 *
 *   normalization refusal                          → contract-mismatch
 *   operation-contract violation                   → operation-semantic-failure
 *   failed provider result                         → its own closed kind
 *     (out-of-scope + unsupported-data refusal = the honest refusal,
 *      still classified unsupported-data — the scenario asserts it)
 *   out-of-scope question answered                 → unsupported-data
 *   fabricated evidence reference (id ∉ bundle)    → unsupported-data
 *   required evidence not cited (wrong/missed/
 *   empty — all real ids)                          → retrieval-failure
 *   declared fact ungrounded in cited evidence     → perception-failure
 *   claim/status mismatch (evidence + facts right) → reasoning-failure
 *   otherwise: first violation kind (integrity), else "none"
 *
 * Why this order is the discrimination contract: a provider answering
 * from the WRONG (but real) evidence is a retrieval failure, not a
 * reasoning failure (the selection defect precedes the comprehension
 * defect — the closed vocabulary's own boundary); a provider refusing
 * out-of-scope data is unsupported-data, not a perception failure; a
 * provider hallucinating plausible content cites real evidence whose
 * ground truth does not contain it — a perception failure caught by the
 * grounding rule; a provider FABRICATING an evidence reference asserts
 * support that does not exist in the authorized context — unsupported
 * data. Each neighboring case is exercised by a committed negative
 * scenario (failure-discrimination.md).
 *
 * DETERMINISM: no clock, no randomness, no I/O. Identical inputs
 * (scenario + registry log) produce byte-identical envelopes,
 * classifications, violations, records and manifests — asserted by the
 * colocated tests against the committed goldens. Engine-dependent error
 * text NEVER enters an envelope: a payload that fails the canonical
 * envelope schema is recorded with THIS module's fixed deterministic
 * wording.
 */

import {
  inputDigestOf,
  normalizeResult,
  providerResultDigestOf,
  sealProvenanceManifest,
  validateBenchmarkRecord,
  validateProviderInput,
  validateProviderProfile,
} from "@aise/provider-registry";
import type {
  BenchmarkRecord,
  EnvironmentFingerprint,
  FailureKind,
  ProvenanceManifest,
} from "@aise/provider-registry";
import {
  canonicalDigestOf,
  parseDeclaredEvidenceEnvelope,
  parseEvidenceQuestionBundle,
  parseReasoningEvalScenario,
  ReasoningEvalError,
} from "./model";
import type {
  CanonicalEvidenceEnvelope,
  DeclaredEvidenceEnvelope,
  EnvelopeAgentIdentity,
  EnvelopeIntegrityRule,
  EnvelopeIntegrityViolation,
  EvidenceQuestionBundle,
  EvaluationCriteria,
  ExpectedEnvelopeOutcome,
  ReasoningEvalRegistryLog,
} from "./model";

/* ------------------------------------------------------------------ */
/* Constants (declared, never sensed)                                   */
/* ------------------------------------------------------------------ */

/** The pinned benchmark id of the Layer-2 reasoning evaluation suite. */
export const REASONING_EVAL_BENCHMARK_ID = "reasoning-eval-suite/1" as const;

/** The code version stamped into every emitted record (deterministic reproduction). */
export const REASONING_EVAL_CODE_VERSION = "prod-028/reasoning-eval/1" as const;

/** The DECLARED environment fingerprint of every sealed manifest (never sensed). */
export const REASONING_EVAL_ENVIRONMENT: EnvironmentFingerprint = {
  declaredRuntime: "bun",
  declaredPlatform: "aise-layer2-reasoning-eval",
  codeVersion: REASONING_EVAL_CODE_VERSION,
  statement:
    "declared, not sensed — the evaluation harness never reads the runtime environment " +
    "(determinism contract: identical scenario + registry log produce identical artifacts)",
};

/** The AISE-side consumer identity of the Layer-2 evaluation manifests. */
export const REASONING_EVAL_CONSUMER = {
  consumer: "AISE",
  surface: "layer2-reasoning-eval",
} as const;

/** The declared resource observations of the deterministic fixture doubles. */
const DECLARED_RESOURCE_OBSERVATIONS = {
  compute: "deterministic-fixture-cpu",
  memoryMiB: 16,
  latencyMsP50: 0.5,
  latencyMsP95: 1,
} as const;

/** The integrity-rule evaluation order (the violation report's stable order). */
const RULE_ORDER: readonly EnvelopeIntegrityRule[] = [
  "output-contract-normalizable",
  "claim-requires-evidence",
  "claim-requires-authorized-scope",
  "cited-evidence-exists",
  "facts-grounded-in-cited-evidence",
  "unknowns-declared-when-unsupported",
  "assumptions-explicit",
  "checks-authorized",
  "identity-recorded",
  "operation-contract-honored",
];

/* ------------------------------------------------------------------ */
/* The outcome                                                          */
/* ------------------------------------------------------------------ */

/** Per-field expected-outcome comparison results (the golden's match table). */
export interface ExpectedFieldMatches {
  readonly resultStatus: boolean;
  readonly resultClaim: boolean;
  readonly facts: boolean;
  readonly assumptions: boolean;
  readonly unknowns: boolean;
  readonly evidenceIds: boolean;
  readonly deterministicChecks: boolean;
  readonly invalidationConditions: boolean;
  readonly classification: boolean;
  readonly violations: boolean;
}

/** The full deterministic outcome of ONE scenario evaluation. */
export interface ReasoningEvalOutcome {
  readonly scenarioId: string;
  readonly lane: "multimodal-reasoning" | "document-understanding" | "retrieval";
  readonly provider: {
    readonly providerId: string;
    readonly technologyVersion: string;
  };
  readonly capability: string;
  readonly inputDigest: string;
  readonly normalizedResultDigest: string;
  /** The canonical Evidence Envelope (the provider's result, mapped). */
  readonly envelope: CanonicalEvidenceEnvelope;
  /** sha-256 over the canonical JSON of the mapped envelope. */
  readonly envelopeDigest: string;
  /** The observed classification — the five-way discrimination result. */
  readonly classification: FailureKind | "none";
  /** The integrity violations, in rule-vocabulary order (closed kinds only). */
  readonly violations: readonly EnvelopeIntegrityViolation[];
  readonly fieldMatches: ExpectedFieldMatches;
  /** Every comparison field AND the classification AND the violations match. */
  readonly expectedMatch: boolean;
  readonly benchmarkRecord: BenchmarkRecord;
  readonly provenanceManifest: ProvenanceManifest;
}

/** The provider-side failure observation carried out of a failed result. */
interface ProviderFailureObservation {
  readonly kind: FailureKind;
  readonly detail: string;
}

/* ------------------------------------------------------------------ */
/* Mapping (declared → canonical; failed results → degenerate)          */
/* ------------------------------------------------------------------ */

/** The fixed deterministic wording for an unparseable envelope payload. */
const UNPARSEABLE_ENVELOPE_DETAIL =
  "the declared envelope payload is not valid canonical Evidence Envelope JSON";

function degenerateEnvelope(
  bundle: EvidenceQuestionBundle,
  unknowns: readonly string[],
  agentIdentity: EnvelopeAgentIdentity,
): CanonicalEvidenceEnvelope {
  return {
    intent: bundle.question,
    authorizedContext: bundle.authorizedContext,
    evidenceIds: [],
    evidenceRevisions: [],
    facts: [],
    assumptions: [],
    unknowns: [...unknowns],
    measurementUncertainty: [],
    deterministicChecks: [],
    resultClaim: null,
    resultStatus: "unsupported",
    nextRecommendedAction: null,
    invalidationConditions: [],
    agentIdentity,
    proposedOperation: null,
  };
}

function canonicalEnvelopeOf(
  bundle: EvidenceQuestionBundle,
  declared: DeclaredEvidenceEnvelope,
): CanonicalEvidenceEnvelope {
  const evidenceRevisions: { evidenceId: string; revision: string }[] = [];
  const measurementUncertainty: { evidenceId: string; sigma: number; unit: string }[] = [];
  for (const evidenceId of declared.evidenceIds) {
    const item = bundle.evidence.find((entry) => entry.evidenceId === evidenceId);
    if (item === undefined) {
      continue; // fabricated reference — the integrity rules record it
    }
    evidenceRevisions.push({ evidenceId, revision: item.revision });
    if (item.measurement !== undefined) {
      measurementUncertainty.push({
        evidenceId,
        sigma: item.measurement.sigma,
        unit: item.measurement.unit,
      });
    }
  }
  return {
    intent: bundle.question,
    authorizedContext: bundle.authorizedContext,
    evidenceIds: [...declared.evidenceIds],
    evidenceRevisions,
    facts: [...declared.facts],
    assumptions: [...declared.assumptions],
    unknowns: [...declared.unknowns],
    measurementUncertainty,
    deterministicChecks: [...declared.deterministicChecks],
    resultClaim: declared.resultClaim,
    resultStatus: declared.resultStatus,
    nextRecommendedAction:
      declared.nextRecommendedAction === undefined ? null : declared.nextRecommendedAction,
    invalidationConditions: [...declared.invalidationConditions],
    agentIdentity: declared.agentIdentity,
    proposedOperation: declared.proposedOperation ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Integrity verification (criteria-gated; closed kinds only)           */
/* ------------------------------------------------------------------ */

function sortedValues(values: readonly string[]): readonly string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

/**
 * Verifies the canonical envelope against the integrity rules the
 * scenario's criteria enable. PURE and deterministic; every violation is
 * a closed-vocabulary failure observation (model.ts maps each rule to its
 * kind — this module invents no vocabulary). The identity rule also
 * verifies the declared identity IS the evaluated profile's own (a
 * provider may not attribute its envelope to another identity).
 */
export function verifyEnvelopeIntegrity(
  envelope: CanonicalEvidenceEnvelope,
  bundle: EvidenceQuestionBundle,
  expected: ExpectedEnvelopeOutcome,
  criteria: EvaluationCriteria,
  options: {
    readonly normalizableOutput: boolean;
    readonly expectedIdentity: EnvelopeAgentIdentity | null;
  },
): readonly EnvelopeIntegrityViolation[] {
  const violations: EnvelopeIntegrityViolation[] = [];

  if (!options.normalizableOutput && criteria.requireNormalizableOutput) {
    violations.push({
      rule: "output-contract-normalizable",
      kind: "contract-mismatch",
      detail:
        "the provider's raw execution failed the declared output contract or its envelope payload did not parse into the canonical Evidence Envelope schema",
    });
  }
  if (
    criteria.requireEvidenceCitation &&
    envelope.resultClaim !== null &&
    envelope.resultStatus === "supported" &&
    envelope.evidenceIds.length === 0
  ) {
    violations.push({
      rule: "claim-requires-evidence",
      kind: "unsupported-data",
      detail: `the supported claim '${envelope.resultClaim}' cites no evidence id at all — every claim carries evidence IDs`,
    });
  }
  if (
    criteria.requireAuthorizedScope &&
    bundle.scope === "out-of-scope" &&
    envelope.resultStatus === "supported" &&
    envelope.resultClaim !== null
  ) {
    violations.push({
      rule: "claim-requires-authorized-scope",
      kind: "unsupported-data",
      detail:
        `the question's required data is outside the authorized evidence set of context ` +
        `'${bundle.authorizedContext.contextId}' — answering claims data no authorized evidence supports`,
    });
  }
  if (criteria.requireExistingEvidenceRefs) {
    const known = new Set(bundle.evidence.map((item) => item.evidenceId));
    for (const evidenceId of envelope.evidenceIds) {
      if (!known.has(evidenceId)) {
        violations.push({
          rule: "cited-evidence-exists",
          kind: "unsupported-data",
          detail:
            `cited evidence id '${evidenceId}' does not exist in the authorized bundle — a fabricated ` +
            `reference asserts support outside the authorized context`,
        });
      }
    }
  }
  if (criteria.requireGroundedFacts && envelope.facts.length > 0) {
    const grounded = new Set<string>();
    for (const item of bundle.evidence) {
      if (envelope.evidenceIds.includes(item.evidenceId)) {
        for (const fact of item.facts) {
          grounded.add(fact);
        }
      }
    }
    for (const fact of envelope.facts) {
      if (!grounded.has(fact)) {
        violations.push({
          rule: "facts-grounded-in-cited-evidence",
          kind: "perception-failure",
          detail:
            `declared fact '${fact}' is not contained in the ground truth of the cited evidence — ` +
            `hallucinated or misread content (including false-absence facts)`,
        });
      }
    }
  }
  if (
    criteria.requireExplicitUnknowns &&
    envelope.resultStatus === "unsupported" &&
    envelope.unknowns.length === 0
  ) {
    violations.push({
      rule: "unknowns-declared-when-unsupported",
      kind: "contract-mismatch",
      detail: "an unsupported envelope names no unknown/evidence gap — unknowns are explicit",
    });
  }
  if (
    criteria.requireExplicitAssumptions &&
    envelope.resultStatus === "supported" &&
    envelope.assumptions.length === 0 &&
    expected.correctAssumptions.length > 0
  ) {
    violations.push({
      rule: "assumptions-explicit",
      kind: "contract-mismatch",
      detail:
        `the correct answer rests on ${expected.correctAssumptions.length} inferred assumption(s) ` +
        `(the evaluator-side oracle) — the envelope declares none (implicit premises)`,
    });
  }
  if (criteria.requireAuthorizedChecks) {
    for (const check of envelope.deterministicChecks) {
      if (!(bundle.offeredChecks as readonly string[]).includes(check)) {
        violations.push({
          rule: "checks-authorized",
          kind: "contract-mismatch",
          detail:
            `claimed deterministic check '${check}' is not offered by the scenario bundle — ` +
            `check invocations are a closed set`,
        });
      }
    }
  }
  if (criteria.requireAgentIdentity) {
    if (envelope.agentIdentity === null) {
      violations.push({
        rule: "identity-recorded",
        kind: "contract-mismatch",
        detail:
          "the envelope records no agent/provider identity — provider identity is provenance, never optional",
      });
    } else if (
      options.expectedIdentity !== null &&
      (envelope.agentIdentity.providerId !== options.expectedIdentity.providerId ||
        envelope.agentIdentity.technologyVersion !== options.expectedIdentity.technologyVersion ||
        envelope.agentIdentity.capability !== options.expectedIdentity.capability)
    ) {
      violations.push({
        rule: "identity-recorded",
        kind: "contract-mismatch",
        detail:
          `the declared identity '${envelope.agentIdentity.providerId}/${envelope.agentIdentity.technologyVersion}' ` +
          `does not match the evaluated profile '${options.expectedIdentity.providerId}/${options.expectedIdentity.technologyVersion}' ` +
          `— a provider may not attribute its envelope to another identity`,
      });
    }
  }
  if (bundle.operation !== undefined) {
    const contract = bundle.operation;
    const proposal = envelope.proposedOperation;
    const mismatched =
      proposal === null ||
      proposal.operationKind !== contract.operationKind ||
      proposal.targetEvidenceId !== contract.targetEvidenceId ||
      proposal.field !== contract.field ||
      proposal.unit !== contract.unit;
    if (mismatched) {
      violations.push({
        rule: "operation-contract-honored",
        kind: "operation-semantic-failure",
        detail:
          proposal === null
            ? `the scenario requests an operation ('${contract.description}') but the envelope proposes none — ill-typed (absent) command`
            : `the proposed operation targets evidence '${proposal.targetEvidenceId}' field '${proposal.field}' ` +
              `(unit '${proposal.unit}', kind '${proposal.operationKind}') — the contract requires evidence ` +
              `'${contract.targetEvidenceId}' field '${contract.field}' (unit '${contract.unit}', kind '${contract.operationKind}')`,
      });
    }
  }
  return violations.sort(
    (a, b) => RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule),
  );
}

/* ------------------------------------------------------------------ */
/* The classification tree (the §HF-2 five-way discrimination)          */
/* ------------------------------------------------------------------ */

/**
 * Classifies ONE evaluated outcome with the documented precedence tree
 * (see the module header). PURE and deterministic.
 */
export function classifyOutcome(
  envelope: CanonicalEvidenceEnvelope,
  bundle: EvidenceQuestionBundle,
  expected: ExpectedEnvelopeOutcome,
  providerFailure: ProviderFailureObservation | null,
  violations: readonly EnvelopeIntegrityViolation[],
): FailureKind | "none" {
  // 1. The output could not be normalized or parsed — the contract boundary.
  if (violations.some((violation) => violation.rule === "output-contract-normalizable")) {
    return "contract-mismatch";
  }
  // 2. Operation semantics precede comprehension: the proposal's
  //    ENGINEERING semantics are wrong even though parsing and
  //    perception succeeded.
  if (
    bundle.operation !== undefined &&
    violations.some((violation) => violation.rule === "operation-contract-honored")
  ) {
    return "operation-semantic-failure";
  }
  // 3. An explicitly failed provider result: the closed kind it declared
  //    (out-of-scope + unsupported-data = the honest refusal — the
  //    scenario's expected kind asserts exactly this classification).
  if (providerFailure !== null) {
    return providerFailure.kind;
  }
  // 4. Out-of-scope questions: whatever the provider does with them is an
  //    unsupported-data outcome (refusing is honest, answering violates
  //    the authorized-scope rule).
  if (bundle.scope === "out-of-scope") {
    return "unsupported-data";
  }
  // 5. Fabricated evidence references: invented support is data outside
  //    the authorized context — unsupported-data, NOT a retrieval miss
  //    (wrong-but-real evidence is the retrieval failure below).
  if (violations.some((violation) => violation.rule === "cited-evidence-exists")) {
    return "unsupported-data";
  }
  // 6. The required evidence was not cited (wrong evidence, missed
  //    evidence or empty results — all real ids): a retrieval/indexing
  //    defect, not a comprehension defect.
  const requiredCited = bundle.requiredEvidenceIds.every((required) =>
    envelope.evidenceIds.includes(required),
  );
  if (!requiredCited) {
    return "retrieval-failure";
  }
  // 7. Declared facts ungrounded in the cited evidence: the provider
  //    misread or hallucinated the content of correctly retrieved input.
  if (violations.some((violation) => violation.rule === "facts-grounded-in-cited-evidence")) {
    return "perception-failure";
  }
  // 8. Correct evidence, correct facts, wrong conclusion: an incorrect
  //    inference over correctly perceived and retrieved inputs — the
  //    comparison uses the evaluator-side CORRECTNESS ORACLE (never the
  //    golden prediction of a defective envelope).
  if (
    envelope.resultStatus !== expected.correctResultStatus ||
    envelope.resultClaim !== expected.correctResultClaim
  ) {
    return "reasoning-failure";
  }
  // 9. The answer matches: an integrity violation still names the outcome
  //    (its closed kind); otherwise the clean success.
  const firstViolation = violations[0];
  return firstViolation === undefined ? "none" : firstViolation.kind;
}

/* ------------------------------------------------------------------ */
/* Expected-outcome comparison (the golden match)                       */
/* ------------------------------------------------------------------ */

function sortedEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = sortedValues(a);
  const sortedB = sortedValues(b);
  return sortedA.every((value, index) => value === sortedB[index]);
}

function compareExpected(
  envelope: CanonicalEvidenceEnvelope,
  expected: ExpectedEnvelopeOutcome,
  classification: FailureKind | "none",
  violations: readonly EnvelopeIntegrityViolation[],
): { readonly matches: ExpectedFieldMatches; readonly expectedMatch: boolean } {
  const matches: ExpectedFieldMatches = {
    resultStatus: envelope.resultStatus === expected.resultStatus,
    resultClaim: envelope.resultClaim === expected.resultClaim,
    facts: sortedEqual(envelope.facts, expected.facts),
    assumptions: sortedEqual(envelope.assumptions, expected.assumptions),
    unknowns: sortedEqual(envelope.unknowns, expected.unknowns),
    evidenceIds: sortedEqual(envelope.evidenceIds, expected.evidenceIds),
    deterministicChecks: sortedEqual(envelope.deterministicChecks, expected.deterministicChecks),
    invalidationConditions: sortedEqual(
      envelope.invalidationConditions,
      expected.invalidationConditions,
    ),
    classification: classification === expected.expectedFailureKind,
    violations: sortedEqual(
      violations.map((violation) => violation.rule),
      expected.expectedViolationRules,
    ),
  };
  const expectedMatch = Object.values(matches).every((value) => value);
  return { matches, expectedMatch };
}

/* ------------------------------------------------------------------ */
/* Record + manifest emission                                           */
/* ------------------------------------------------------------------ */

function discriminationDetail(
  scenarioId: string,
  classification: FailureKind | "none",
  bundle: EvidenceQuestionBundle,
  envelope: CanonicalEvidenceEnvelope,
): string {
  const cited = sortedValues(envelope.evidenceIds).join(", ");
  const required = sortedValues(bundle.requiredEvidenceIds).join(", ");
  switch (classification) {
    case "perception-failure":
      return (
        `scenario '${scenarioId}': cited evidence [${cited}] was surfaced but the declared content ` +
        `is ungrounded — a perception failure, not a retrieval failure (the evidence was surfaced) ` +
        `and not a reasoning failure (the observed facts themselves are wrong)`
      );
    case "retrieval-failure":
      return (
        `scenario '${scenarioId}': the required evidence [${required}] was not surfaced (cited: ` +
        `[${cited === "" ? "nothing" : cited}]) — a retrieval/indexing defect, not a comprehension defect`
      );
    case "reasoning-failure":
      return (
        `scenario '${scenarioId}': the evidence was retrieved and the facts perceived correctly, ` +
        `but the inferred claim/status is wrong — a reasoning failure over correctly perceived and retrieved inputs`
      );
    case "unsupported-data":
      return (
        `scenario '${scenarioId}': the asserted data is outside the authorized evidence set (scope ` +
        `'${bundle.scope}') — unsupported-data, answered by explicit refusal never by fabricated support`
      );
    case "operation-semantic-failure":
      return (
        `scenario '${scenarioId}': the proposed operation violates the operation contract — wrong ` +
        `target/field/unit/kind engineering semantics, though parsing and perception succeeded`
      );
    default:
      return (
        `scenario '${scenarioId}': the envelope matched the expected canonical outcome with no ` +
        `integrity violation`
      );
  }
}

function buildBenchmarkRecord(
  scenarioId: string,
  capability: string,
  provider: { readonly providerId: string; readonly technologyVersion: string },
  inputDigest: string,
  classification: FailureKind | "none",
  violations: readonly EnvelopeIntegrityViolation[],
  providerFailure: ProviderFailureObservation | null,
  fieldMatches: ExpectedFieldMatches,
  expectedMatch: boolean,
  bundle: EvidenceQuestionBundle,
  envelope: CanonicalEvidenceEnvelope,
): BenchmarkRecord {
  const body = {
    kind: "provider-benchmark-record" as const,
    schemaVersion: "provider-benchmark/1" as const,
    providerId: provider.providerId,
    technologyVersion: provider.technologyVersion,
    benchmarkId: REASONING_EVAL_BENCHMARK_ID,
    capability,
    metrics: [
      {
        metric: "classification_match",
        value: fieldMatches.classification ? 1 : 0,
        unit: "ratio",
        subjectId: scenarioId,
        detail:
          "the harness's failure-kind classification equals the expected five-way discrimination ground truth",
      },
      {
        metric: "envelope_integrity_violations",
        value: violations.length,
        unit: "count",
        subjectId: scenarioId,
        detail:
          "the number of canonical envelope integrity rules violated (closed-vocabulary observations)",
      },
      {
        metric: "expected_outcome_match",
        value: expectedMatch ? 1 : 0,
        unit: "ratio",
        subjectId: scenarioId,
        detail:
          "every expected canonical envelope field, the classification and the violation set matched",
      },
    ],
    failureObservations: [
      ...(classification === "none"
        ? []
        : [
            {
              kind: classification,
              detail: discriminationDetail(scenarioId, classification, bundle, envelope),
            },
          ]),
      ...violations.map((violation) => ({
        kind: violation.kind,
        detail: `${violation.rule}: ${violation.detail}`,
      })),
      ...(providerFailure === null
        ? []
        : [
            {
              kind: providerFailure.kind,
              detail: `provider-declared failure: ${providerFailure.detail}`,
            },
          ]),
    ],
    resourceObservations: DECLARED_RESOURCE_OBSERVATIONS,
    reproduction: {
      inputsDigest: inputDigest,
      codeVersion: REASONING_EVAL_CODE_VERSION,
      statement:
        "deterministic reproduction: the scenario's normalized input (digest above) through the " +
        "committed registry log at code version (above) always yields these metrics — no clock, " +
        "no randomness, no network",
    },
  };
  const validated = validateBenchmarkRecord(body);
  if (!validated.ok) {
    // An internal emission bug (never a provider outcome): fail loudly.
    const issues = validated.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new ReasoningEvalError(
      "invalid_request",
      `the emitted benchmark record failed validation: ${issues}`,
    );
  }
  return validated.record;
}

/* ------------------------------------------------------------------ */
/* The entry point                                                      */
/* ------------------------------------------------------------------ */

/**
 * Evaluates ONE Layer-2 scenario against the canonical Evidence Envelope
 * semantics — the provider-neutral evaluation entry point.
 *
 * Throws {@link ReasoningEvalError} for CALLER/wiring bugs only (a
 * malformed scenario, an invalid bundle, an invalid profile, an input
 * that violates the profile's declared input contract, a provider/
 * scenario identity mismatch, an incoherent registry log). Every
 * PROVIDER-side outcome — contract violations, refusals,
 * misclassifications — is a first-class value in the returned
 * {@link ReasoningEvalOutcome}.
 */
export function evaluateScenario(
  scenarioInput: unknown,
  registryLog: ReasoningEvalRegistryLog,
): ReasoningEvalOutcome {
  const scenario = parseReasoningEvalScenario(scenarioInput);

  // The canonical bundle (the harness's ground-truth oracle).
  let bundle: EvidenceQuestionBundle;
  try {
    // bundleJson was validated as a non-empty string by the scenario parser.
    bundle = parseEvidenceQuestionBundle(JSON.parse(scenario.input.payload.bundleJson as string));
  } catch (error) {
    if (error instanceof ReasoningEvalError) {
      throw error;
    }
    throw new ReasoningEvalError(
      "invalid_bundle",
      "input.payload.bundleJson is not valid JSON — the canonical bundle must round-trip",
    );
  }
  if (bundle.scenarioId !== scenario.scenarioId) {
    throw new ReasoningEvalError(
      "invalid_bundle",
      `the bundle's scenarioId '${bundle.scenarioId}' does not match the scenario '${scenario.scenarioId}'`,
    );
  }
  if (bundle.lane !== scenario.lane) {
    throw new ReasoningEvalError(
      "invalid_bundle",
      `the bundle's lane '${bundle.lane}' does not match the scenario's lane '${scenario.lane}'`,
    );
  }

  // The registry log: the registered profile + the raw execution.
  if (registryLog === null || typeof registryLog !== "object") {
    throw new ReasoningEvalError("invalid_registry_log", "the registry log must be an object");
  }
  const profileValidation = validateProviderProfile(registryLog.profile);
  if (!profileValidation.ok) {
    const issues = profileValidation.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new ReasoningEvalError(
      "invalid_profile",
      `the registry log's profile failed typed validation: ${issues}`,
    );
  }
  const profile = profileValidation.profile;
  if (
    profile.providerId !== scenario.providerRef.providerId ||
    profile.technologyVersion !== scenario.providerRef.technologyVersion
  ) {
    throw new ReasoningEvalError(
      "invalid_registry_log",
      `the registry log's profile '${profile.providerId}/${profile.technologyVersion}' is not the ` +
        `scenario's referenced provider '${scenario.providerRef.providerId}/${scenario.providerRef.technologyVersion}'`,
    );
  }
  const expectedIdentity: EnvelopeAgentIdentity = {
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    capability: scenario.capability,
  };

  // The input direction of the provider boundary.
  const inputValidation = validateProviderInput(scenario.input, profile);
  if (!inputValidation.ok) {
    const issues = inputValidation.failures.map((failure) => failure.detail).join("; ");
    throw new ReasoningEvalError(
      "invalid_input",
      `the scenario's input violates the provider's declared input contract: ${issues}`,
    );
  }
  const inputDigest = inputDigestOf(scenario.input);

  // The output direction: normalize the raw execution, then map.
  const normalization = normalizeResult(registryLog.execution, profile, { inputDigest });
  let envelope: CanonicalEvidenceEnvelope;
  let providerFailure: ProviderFailureObservation | null = null;
  let normalizableOutput = true;
  let normalizedResultDigest: string;
  if (!normalization.ok) {
    // The provider's payload could not be normalized: a contract-mismatch
    // OUTCOME (the closed vocabulary's typed normalization refusal) —
    // never a silent coercion, never a throw.
    const refusal = normalization.failure;
    envelope = degenerateEnvelope(bundle, [
      `the raw provider execution could not be normalized — ${refusal.kind}: ${refusal.detail}`,
    ], expectedIdentity);
    normalizableOutput = false;
    normalizedResultDigest = canonicalDigestOf({ inputDigest, normalizationFailure: refusal });
  } else if (normalization.result.status === "failed") {
    // The explicit provider failure (e.g. the honest unsupported-data
    // refusal — the control-plane pattern): the degenerate honest-refusal
    // envelope, stamped with the evaluated profile's identity.
    const failure = normalization.result.failure;
    if (failure === undefined) {
      throw new ReasoningEvalError(
        "invalid_registry_log",
        "a failed normalized result must carry its explicit failure observation",
      );
    }
    envelope = degenerateEnvelope(bundle, [failure.detail], expectedIdentity);
    providerFailure = { kind: failure.kind, detail: failure.detail };
    normalizedResultDigest = providerResultDigestOf(normalization.result);
  } else {
    const outputs = normalization.result.outputs;
    const envelopeJson = outputs?.["envelopeJson"];
    if (typeof envelopeJson !== "string") {
      throw new ReasoningEvalError(
        "invalid_registry_log",
        "the normalized result's outputs must carry the envelopeJson string (declared by the output contract)",
      );
    }
    let declared: DeclaredEvidenceEnvelope | null = null;
    let unparseableDetail: string | null = null;
    try {
      declared = parseDeclaredEvidenceEnvelope(JSON.parse(envelopeJson));
    } catch (error) {
      unparseableDetail =
        error instanceof ReasoningEvalError
          ? `${UNPARSEABLE_ENVELOPE_DETAIL} — ${error.detail}`
          : UNPARSEABLE_ENVELOPE_DETAIL;
    }
    if (declared === null) {
      envelope = degenerateEnvelope(bundle, [unparseableDetail as string], expectedIdentity);
      normalizableOutput = false;
    } else {
      envelope = canonicalEnvelopeOf(bundle, declared);
    }
    normalizedResultDigest = providerResultDigestOf(normalization.result);
  }

  // Integrity verification + classification + expected comparison.
  const violations = verifyEnvelopeIntegrity(envelope, bundle, scenario.expected, scenario.criteria, {
    normalizableOutput,
    expectedIdentity,
  });
  const classification = classifyOutcome(envelope, bundle, scenario.expected, providerFailure, violations);
  const { matches, expectedMatch } = compareExpected(envelope, scenario.expected, classification, violations);

  // Emission: the content-addressed benchmark record + the portable manifest.
  const record = buildBenchmarkRecord(
    scenario.scenarioId,
    scenario.capability,
    { providerId: profile.providerId, technologyVersion: profile.technologyVersion },
    inputDigest,
    classification,
    violations,
    providerFailure,
    matches,
    expectedMatch,
    bundle,
    envelope,
  );
  const manifest = sealProvenanceManifest({
    profile,
    inputDigests: [inputDigest],
    normalizedResultDigest,
    benchmarkRecords: [record],
    environment: REASONING_EVAL_ENVIRONMENT,
    consumer: REASONING_EVAL_CONSUMER,
    reproducibilityStatement:
      "Layer-2 reasoning evaluation: the registered profile, the scenario's normalized input " +
      "(digest above), the normalized provider result (digest above) and the benchmark record " +
      "(digest above) fully determine this evaluation — identical inputs reproduce the identical manifest",
  });

  return {
    scenarioId: scenario.scenarioId,
    lane: scenario.lane,
    provider: {
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    },
    capability: scenario.capability,
    inputDigest,
    normalizedResultDigest,
    envelope,
    envelopeDigest: canonicalDigestOf(envelope),
    classification,
    violations,
    fieldMatches: matches,
    expectedMatch,
    benchmarkRecord: record,
    provenanceManifest: manifest,
  };
}
