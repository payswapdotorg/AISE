/**
 * PROD-028 — Layer-2 reasoning evaluation: the provider-neutral MODEL.
 *
 * Contract (docs/productization-layer-hardening-work-orders.md §HFX-201..204
 * — the FUTURE consumers of this entry point;
 * spec/governance/architecture-change-record-006.md Layer-2 requirements;
 * spec/architecture-lock.md "Layer 2 Evidence Envelope"):
 *
 * THE PROVIDER-NEUTRAL LAYER-2 EVALUATION TARGET is the Evidence Envelope:
 * every consequential reasoning result a provider declares is evaluated
 * AGAINST the canonical envelope semantics declared HERE (the evaluable
 * projection of the architecture-lock's Layer-2 envelope list), NEVER
 * against a provider's own output schema:
 *
 *   intent · authorized context · evidence IDs + revisions · observed
 *   facts · explicit assumptions · unknowns · measurement uncertainty ·
 *   deterministic checks invoked · result claim + status · invalidation
 *   conditions · agent/provider identity · (operation scenarios) the
 *   proposed operation.
 *
 * AUTHORITY DISCIPLINE (the loud parts first — the reasoning module's
 * convention):
 *
 *  - PROVIDERS ARE BOUNDED PROPOSERS, NEVER AUTHORITIES (ACR-006). This
 *    module EVALUATES provider-declared results; it never turns any
 *    provider's output into canonical engineering truth. The envelope a
 *    provider declares is UNTRUSTED INPUT: it is normalized, mapped onto
 *    the canonical shape, integrity-verified and classified.
 *  - NO PROVIDER-SPECIFIC TYPE CROSSES THE CANONICAL BOUNDARY. The
 *    provider's result is exchanged through the HFX-000 control plane's
 *    normalized I/O (`ProviderInput`/`ProviderResult` from
 *    `@aise/provider-registry` — imported, never modified). The declared
 *    envelope rides the result's contract-validated `outputs` as CANONICAL
 *    JSON text (`envelopeJson` — the AISE-side schema every Layer-2
 *    provider must emit, per HFX-201 "Require structured Evidence Envelope
 *    output; provider replacement does not change the Evidence Envelope
 *    schema"); provider-NATIVE payloads stay OPAQUE
 *    (`providerNative`) — carried verbatim for provenance only, never
 *    parsed into canonical semantics (asserted by harness tests).
 *  - FAILURE OBSERVATIONS USE THE CLOSED VOCABULARY ONLY (HFX-000
 *    failures.ts). Envelope-integrity violations are recorded as
 *    closed-vocabulary failure observations — this module invents NO new
 *    failure vocabulary. The five-way discrimination the HF-2 exit gate
 *    demands (perception / retrieval / reasoning / unsupported-data /
 *    operation-semantic) is computed by the harness's deterministic
 *    precedence tree (harness.ts).
 *  - DETERMINISM: no wall clock, no randomness, no I/O in this module.
 *    The same scenario + the same registry log produce byte-identical
 *    outcomes, records and manifests. Measurement uncertainty is
 *    PROPAGATED VERBATIM from cited evidence items (never provider-
 *    fabricated — the provider does not even get to declare it).
 *
 * Input shapes are pure data (JSON round-trippable): every scenario, its
 * evidence-question bundle and its expected outcome are committed
 * artifacts (tools/reasoning-eval/scenario.json) — the benchmark suite is
 * reproducible from data alone.
 */

import { FAILURE_KINDS, isFailureKind } from "@aise/provider-registry";
import type { FailureKind, ProviderInput } from "@aise/provider-registry";
import { sha256Hex } from "../lib/hash";

/* ------------------------------------------------------------------ */
/* Frozen vocabularies (as const + Object.freeze — the house style)     */
/* ------------------------------------------------------------------ */

/**
 * The three Layer-2 evaluation lanes (the PROD-028 work order):
 * multimodal-reasoning (HFX-201's lane), document-understanding
 * (HFX-202's lane), retrieval (HFX-203's lane). HFX-204's operation/
 * command corpus enters through the document lane's operation scenarios
 * today and gains its own lane in a future governed item.
 */
export const REASONING_EVAL_LANES = Object.freeze([
  "multimodal-reasoning",
  "document-understanding",
  "retrieval",
] as const satisfies readonly string[]);
export type ReasoningEvalLane = (typeof REASONING_EVAL_LANES)[number];

/**
 * The canonical envelope result-status vocabulary: `supported` (the claim
 * is grounded in cited authorized evidence), `unsupported` (no authorized
 * evidence supports an answer — the honest refusal status),
 * `conflicted` (cited evidence disagrees — declared for completeness; no
 * committed fixture exercises it today, see the honest gap list in
 * docs/productization-evidence/PROD-028/envelope-fixture-map.md).
 */
export const ENVELOPE_RESULT_STATUSES = Object.freeze([
  "supported",
  "unsupported",
  "conflicted",
] as const satisfies readonly string[]);
export type EnvelopeResultStatus = (typeof ENVELOPE_RESULT_STATUSES)[number];

/**
 * The frozen envelope-integrity rule vocabulary — WHICH canonical envelope
 * contract rule a violation names. The violation KIND always comes from
 * the CLOSED failure vocabulary (never invented here):
 *
 *  - `output-contract-normalizable`      → contract-mismatch (the raw
 *    execution failed the declared output contract or the envelope JSON
 *    did not parse into the canonical envelope schema)
 *  - `claim-requires-evidence`          → unsupported-data (a supported
 *    claim citing no evidence at all)
 *  - `claim-requires-authorized-scope`  → unsupported-data (a supported
 *    claim to a question whose required data is OUTSIDE the authorized
 *    evidence set)
 *  - `cited-evidence-exists`            → unsupported-data (a fabricated
 *    evidence reference — an id that does not exist in the bundle)
 *  - `facts-grounded-in-cited-evidence` → perception-failure (a declared
 *    fact the cited evidence does not contain — hallucinated or misread
 *    content, including false-absence facts)
 *  - `unknowns-declared-when-unsupported` → contract-mismatch (an
 *    unsupported envelope naming no evidence gap)
 *  - `assumptions-explicit`             → contract-mismatch (a supported
 *    claim resting on premises the expected outcome requires as
 *    assumptions, none declared)
 *  - `checks-authorized`                → contract-mismatch (a claimed
 *    deterministic check outside the bundle's offered check set)
 *  - `identity-recorded`                → contract-mismatch (no agent/
 *    provider identity, or an identity that is not the evaluated
 *    profile's own)
 *  - `operation-contract-honored`       → operation-semantic-failure (a
 *    proposed operation violating the scenario's operation contract —
 *    wrong target, field, unit or kind)
 */
export const ENVELOPE_INTEGRITY_RULES = Object.freeze([
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
] as const satisfies readonly string[]);
export type EnvelopeIntegrityRule = (typeof ENVELOPE_INTEGRITY_RULES)[number];

/** One envelope-integrity violation: the rule + its CLOSED failure kind + detail. */
export interface EnvelopeIntegrityViolation {
  readonly rule: EnvelopeIntegrityRule;
  readonly kind: FailureKind;
  readonly detail: string;
}

/**
 * The frozen evidence-item kind vocabulary (the canonical modality doubles
 * of the fixture bundles — deterministic textual stand-ins for the real
 * capture modalities Layer 1 owns).
 */
export const EVIDENCE_ITEM_KINDS = Object.freeze([
  "image",
  "document-section",
  "retrieval-hit",
] as const satisfies readonly string[]);
export type EvidenceItemKind = (typeof EVIDENCE_ITEM_KINDS)[number];

/** The canonical bundle scope: is the question's required data inside the authorized evidence set? */
export const BUNDLE_SCOPES = Object.freeze(["in-scope", "out-of-scope"] as const satisfies readonly string[]);
export type BundleScope = (typeof BUNDLE_SCOPES)[number];

/**
 * The fixture-double behavior vocabulary (the input-contract control channel).
 * The harness NEVER reads the behavior tag or the variant script — they
 * steer the deterministic in-repo doubles only; a real provider adapter
 * (HFX-201+) ignores them and answers from the bundle alone.
 */
export const FIXTURE_BEHAVIORS = Object.freeze([
  /** Replay the scripted variant envelope verbatim (correct OR defective — the double's answer script). */
  "replay",
  /** Answer with an explicit unsupported-data refusal (a failed provider result — the control-plane pattern). */
  "refuse",
  /** Answer with an empty unsupported envelope (no evidence surfaced, gaps named). */
  "empty",
  /** Emit a malformed envelope payload (the normalization/parse negative path). */
  "malformed",
] as const satisfies readonly string[]);
export type FixtureBehavior = (typeof FIXTURE_BEHAVIORS)[number];

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)            */
/* ------------------------------------------------------------------ */

/**
 * Caller/wiring bugs (thrown, never stringly): a malformed scenario, an
 * unparsable bundle, an invalid registry log, an unknown scenario id.
 * Evaluation OUTCOMES (classifications, violations, mismatched
 * expectations) are first-class VALUES, never throws.
 */
export const REASONING_EVAL_ERROR_CODES = Object.freeze([
  "invalid_request",
  "invalid_scenario",
  "invalid_bundle",
  "invalid_registry_log",
  "invalid_profile",
  "invalid_input",
  "unknown_scenario",
] as const satisfies readonly string[]);
export type ReasoningEvalErrorCode = (typeof REASONING_EVAL_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (mirrors ReasoningGatewayError). */
export class ReasoningEvalError extends Error {
  readonly code: ReasoningEvalErrorCode;
  readonly detail: string;

  constructor(code: ReasoningEvalErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ReasoningEvalError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* The evidence-question bundle (the canonical input fixture content)   */
/* ------------------------------------------------------------------ */

/** Measurement uncertainty carried by ONE evidence item (1σ in its own unit). */
export interface EvidenceMeasurement {
  readonly sigma: number;
  readonly unit: string;
}

/**
 * One authorized evidence item of a bundle: a stable evidence id + revision
 * (the Evidence-Graph identity discipline), the canonical kind, a
 * deterministic content double and the GROUND-TRUTH facts the item
 * supports (the harness's grounding oracle — exact strings).
 */
export interface EvidenceItem {
  readonly evidenceId: string;
  readonly revision: string;
  readonly kind: EvidenceItemKind;
  readonly content: string;
  readonly facts: readonly string[];
  readonly measurement?: EvidenceMeasurement;
}

/**
 * The operation contract of an operation-semantics scenario (the BIM-Edit/
 * HFX-204 hook): the LAWFUL shape of a proposed operation — kind, target
 * evidence, field and unit. A proposal differing on any dimension is an
 * operation-semantic failure (wrong target / wrong units / ill-typed
 * command), even though parsing and perception succeeded.
 */
export interface EnvelopeOperationContract {
  readonly operationKind: string;
  readonly targetEvidenceId: string;
  readonly field: string;
  readonly unit: string;
  readonly description: string;
}

/** A provider's proposed operation (evaluated against the operation contract). */
export interface ProposedOperation {
  readonly operationKind: string;
  readonly targetEvidenceId: string;
  readonly field: string;
  readonly value: string;
  readonly unit: string;
}

/**
 * THE evidence-question bundle — the canonical, provider-neutral input
 * fixture: the authorized evidence set, the question, the ground truth of
 * which evidence answers it (requiredEvidenceIds), whether the required
 * data is in scope at all, the offered deterministic checks and the
 * optional operation contract. THE ANSWER KEY NEVER RIDES THE BUNDLE: the
 * correct outcome lives in the scenario's evaluator-side expected block
 * (correctResultClaim & co) — a real model under evaluation (HFX-201+)
 * receives the question side only.
 */
export interface EvidenceQuestionBundle {
  readonly scenarioId: string;
  readonly lane: ReasoningEvalLane;
  readonly question: string;
  readonly authorizedContext: {
    readonly projectId: string;
    readonly contextId: string;
    readonly revision: string;
  };
  readonly evidence: readonly EvidenceItem[];
  /** Empty iff scope is "out-of-scope" (enforced by parseEvidenceQuestionBundle). */
  readonly requiredEvidenceIds: readonly string[];
  readonly scope: BundleScope;
  readonly offeredChecks: readonly string[];
  readonly operation?: EnvelopeOperationContract;
}

/* ------------------------------------------------------------------ */
/* The declared envelope (what a provider emits) and the canonical one   */
/* ------------------------------------------------------------------ */

/** The agent/provider identity an envelope must record (checked against the evaluated profile). */
export interface EnvelopeAgentIdentity {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly capability: string;
}

/**
 * The envelope a Layer-2 provider DECLARES (emitted through the normalized
 * result's `outputs.envelopeJson` as canonical JSON). This is the
 * AISE-side schema — provider replacement never changes it. The provider
 * does NOT declare intent/authorized context (the harness injects them
 * from the bundle) and does NOT declare measurement uncertainty (the
 * harness propagates it verbatim from cited evidence — never fabricated).
 */
export interface DeclaredEvidenceEnvelope {
  readonly evidenceIds: readonly string[];
  readonly facts: readonly string[];
  readonly assumptions: readonly string[];
  readonly unknowns: readonly string[];
  readonly deterministicChecks: readonly string[];
  readonly resultClaim: string | null;
  readonly resultStatus: EnvelopeResultStatus;
  readonly invalidationConditions: readonly string[];
  readonly nextRecommendedAction?: string | null;
  readonly agentIdentity: EnvelopeAgentIdentity | null;
  readonly proposedOperation?: ProposedOperation | null;
}

/**
 * The CANONICAL Evidence Envelope — the provider's declared result MAPPED
 * onto the architecture-lock's Layer-2 envelope semantics (the harness
 * performs the mapping; providers never author canonical envelopes
 * directly). One measurement-uncertainty entry per CITED evidence item
 * that carries one (propagated verbatim).
 */
export interface CanonicalEvidenceEnvelope {
  readonly intent: string;
  readonly authorizedContext: {
    readonly projectId: string;
    readonly contextId: string;
    readonly revision: string;
  };
  readonly evidenceIds: readonly string[];
  readonly evidenceRevisions: readonly { readonly evidenceId: string; revision: string }[];
  readonly facts: readonly string[];
  readonly assumptions: readonly string[];
  readonly unknowns: readonly string[];
  readonly measurementUncertainty: readonly {
    readonly evidenceId: string;
    readonly sigma: number;
    readonly unit: string;
  }[];
  readonly deterministicChecks: readonly string[];
  readonly resultClaim: string | null;
  readonly resultStatus: EnvelopeResultStatus;
  readonly nextRecommendedAction: string | null;
  readonly invalidationConditions: readonly string[];
  readonly agentIdentity: EnvelopeAgentIdentity | null;
  readonly proposedOperation: ProposedOperation | null;
}

/* ------------------------------------------------------------------ */
/* Expected outcome + evaluation criteria + the scenario               */
/* ------------------------------------------------------------------ */

/**
 * The expected outcome of ONE scenario — evaluator-side data NEVER sent to
 * the provider. Two distinct roles, deliberately separated:
 *
 *  - THE GOLDEN PREDICTION (resultStatus/resultClaim/facts/…): the exact
 *    envelope the committed double is scripted to emit — the benchmark's
 *    byte-level golden (positive scenarios: identical to the oracle).
 *  - THE CORRECTNESS ORACLE (correctResultStatus/correctResultClaim/
 *    correctAssumptions): the canonical CORRECT answer the harness's
 *    classification tree consults (a negative scenario's prediction
 *    deviates from it — that deviation is exactly what the five-way
 *    discrimination detects).
 *
 * `expectedFailureKind` + `expectedViolationRules` assert the observed
 * classification and violation set — the discrimination ground truth.
 */
export interface ExpectedEnvelopeOutcome {
  /* The golden prediction of the emitted envelope. */
  readonly resultStatus: EnvelopeResultStatus;
  readonly resultClaim: string | null;
  readonly facts: readonly string[];
  readonly assumptions: readonly string[];
  readonly unknowns: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly deterministicChecks: readonly string[];
  readonly invalidationConditions: readonly string[];
  /* The evaluator-side correctness oracle (the canonical correct answer). */
  readonly correctResultStatus: EnvelopeResultStatus;
  readonly correctResultClaim: string | null;
  readonly correctAssumptions: readonly string[];
  /** The expected classification — the five-way discrimination assertion. */
  readonly expectedFailureKind: FailureKind | "none";
  /** The expected integrity-violation rules (order follows the rule vocabulary). */
  readonly expectedViolationRules: readonly EnvelopeIntegrityRule[];
}

/**
 * The evaluation criteria — which envelope-integrity rules THIS scenario
 * enforces (the "where relevant" qualifier of the architecture-lock's
 * envelope list, made machine-checkable). The classification tree is
 * ALWAYS active; the integrity rules are criteria-gated.
 */
export interface EvaluationCriteria {
  readonly requireNormalizableOutput: boolean;
  readonly requireEvidenceCitation: boolean;
  readonly requireAuthorizedScope: boolean;
  readonly requireExistingEvidenceRefs: boolean;
  readonly requireGroundedFacts: boolean;
  readonly requireExplicitUnknowns: boolean;
  readonly requireExplicitAssumptions: boolean;
  readonly requireAuthorizedChecks: boolean;
  readonly requireAgentIdentity: boolean;
}

/** Every integrity rule on (the default — Layer-2 envelopes are consequential). */
export const FULL_EVALUATION_CRITERIA: EvaluationCriteria = Object.freeze({
  requireNormalizableOutput: true,
  requireEvidenceCitation: true,
  requireAuthorizedScope: true,
  requireExistingEvidenceRefs: true,
  requireGroundedFacts: true,
  requireExplicitUnknowns: true,
  requireExplicitAssumptions: true,
  requireAuthorizedChecks: true,
  requireAgentIdentity: true,
});

/**
 * ONE Layer-2 evaluation scenario: the lane, the provider profile
 * reference, the normalized input (carrying the evidence-question bundle),
 * the expected canonical outcome and the evaluation criteria.
 */
export interface ReasoningEvalScenario {
  readonly scenarioId: string;
  readonly lane: ReasoningEvalLane;
  readonly providerRef: {
    readonly providerId: string;
    readonly technologyVersion: string;
  };
  readonly capability: string;
  readonly input: ProviderInput;
  readonly expected: ExpectedEnvelopeOutcome;
  readonly criteria: EvaluationCriteria;
}

/**
 * The registry log entry ONE evaluation consumes: the registered provider
 * profile + the raw execution the provider's adapter submitted for the
 * scenario's input. Untyped at the boundary (the house fail-closed
 * discipline); the harness validates both through the control plane's
 * pure validators.
 */
export interface ReasoningEvalRegistryLog {
  readonly profile: unknown;
  readonly execution: unknown;
}

/* ------------------------------------------------------------------ */
/* Canonical JSON discipline (the committed-artifact form)              */
/* ------------------------------------------------------------------ */

/** Sort one parsed JSON value's object keys recursively (arrays keep order). */
export function sortCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortCanonicalValue);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortCanonicalValue(record[key]);
    }
    return out;
  }
  return value;
}

/**
 * The canonical committed-artifact JSON text: 2-space indented, sorted
 * keys, trailing newline (the generic discipline tools/building-benchmark
 * states; byte-stable across zones — the tools-side runner re-derives
 * digests with the SAME form).
 */
export function canonicalJsonText(value: unknown): string {
  return `${JSON.stringify(sortCanonicalValue(value), null, 2)}\n`;
}

/** sha-256 over the canonical JSON text (the committed-artifact digest form). */
export function canonicalDigestOf(value: unknown): string {
  return sha256Hex(canonicalJsonText(value));
}

/* ------------------------------------------------------------------ */
/* Boundary parsers (shape → typed errors; hand-rolled discipline)      */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isLane(value: unknown): value is ReasoningEvalLane {
  return typeof value === "string" && (REASONING_EVAL_LANES as readonly string[]).includes(value);
}

function isEnvelopeStatus(value: unknown): value is EnvelopeResultStatus {
  return (
    typeof value === "string" && (ENVELOPE_RESULT_STATUSES as readonly string[]).includes(value)
  );
}

function isRule(value: unknown): value is EnvelopeIntegrityRule {
  return typeof value === "string" && (ENVELOPE_INTEGRITY_RULES as readonly string[]).includes(value);
}

function isBehavior(value: unknown): value is FixtureBehavior {
  return typeof value === "string" && (FIXTURE_BEHAVIORS as readonly string[]).includes(value);
}

function isFailureKindOrNone(value: unknown): value is FailureKind | "none" {
  return value === "none" || isFailureKind(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new ReasoningEvalError("invalid_bundle", `${path} must be an array of strings`);
  }
  const out: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new ReasoningEvalError(
        "invalid_bundle",
        `${path}[${index}] must be a non-empty string`,
      );
    }
    out.push(entry);
  }
  return out;
}

function optionalStringArray(
  value: unknown,
  path: string,
): readonly string[] {
  return value === undefined ? [] : stringArray(value, path);
}

function optionalNullableString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return nonEmptyString(value) ?? null;
}

function isEvidenceItemKind(value: unknown): value is EvidenceItemKind {
  return typeof value === "string" && (EVIDENCE_ITEM_KINDS as readonly string[]).includes(value);
}

function isBundleScope(value: unknown): value is BundleScope {
  return typeof value === "string" && (BUNDLE_SCOPES as readonly string[]).includes(value);
}

/**
 * Parses + validates an unknown value as an {@link EvidenceQuestionBundle}
 * (fail closed, typed errors). Enforces: unique evidence ids, non-empty
 * evidence and facts, requiredEvidenceIds ⊆ evidence ids, the scope⇒empty-
 * required rule and the operation contract's lawful target.
 */
export function parseEvidenceQuestionBundle(input: unknown): EvidenceQuestionBundle {
  if (!isRecord(input)) {
    throw new ReasoningEvalError("invalid_bundle", "the bundle must be a JSON object");
  }
  const scenarioId = nonEmptyString(input["scenarioId"]);
  if (scenarioId === undefined) {
    throw new ReasoningEvalError("invalid_bundle", "scenarioId must be a non-empty string");
  }
  if (!isLane(input["lane"])) {
    throw new ReasoningEvalError(
      "invalid_bundle",
      `lane must be one of [${REASONING_EVAL_LANES.join(", ")}]`,
    );
  }
  const lane = input["lane"];
  const question = nonEmptyString(input["question"]);
  if (question === undefined) {
    throw new ReasoningEvalError("invalid_bundle", "question must be a non-empty string");
  }
  const contextRecord = input["authorizedContext"];
  if (!isRecord(contextRecord)) {
    throw new ReasoningEvalError("invalid_bundle", "authorizedContext must be an object");
  }
  const contextProjectId = nonEmptyString(contextRecord["projectId"]);
  const contextId = nonEmptyString(contextRecord["contextId"]);
  const contextRevision = nonEmptyString(contextRecord["revision"]);
  if (contextProjectId === undefined || contextId === undefined || contextRevision === undefined) {
    throw new ReasoningEvalError(
      "invalid_bundle",
      "authorizedContext requires projectId, contextId and revision (non-empty strings)",
    );
  }
  const authorizedContext = {
    projectId: contextProjectId,
    contextId,
    revision: contextRevision,
  };
  const evidenceRaw = input["evidence"];
  if (!Array.isArray(evidenceRaw) || evidenceRaw.length === 0) {
    throw new ReasoningEvalError("invalid_bundle", "evidence must be a non-empty array");
  }
  const evidence: EvidenceItem[] = [];
  const evidenceIds = new Set<string>();
  for (const [index, entryRaw] of evidenceRaw.entries()) {
    const path = `evidence[${index}]`;
    if (!isRecord(entryRaw)) {
      throw new ReasoningEvalError("invalid_bundle", `${path} must be an object`);
    }
    const entry = entryRaw;
    const evidenceId = nonEmptyString(entry["evidenceId"]);
    const revision = nonEmptyString(entry["revision"]);
    const content = nonEmptyString(entry["content"]);
    if (evidenceId === undefined || revision === undefined || content === undefined) {
      throw new ReasoningEvalError(
        "invalid_bundle",
        `${path} requires evidenceId, revision and content (non-empty strings)`,
      );
    }
    if (evidenceIds.has(evidenceId)) {
      throw new ReasoningEvalError(
        "invalid_bundle",
        `duplicate evidence id '${evidenceId}' — evidence identity is stable and unique`,
      );
    }
    evidenceIds.add(evidenceId);
    const kind = entry["kind"];
    if (!isEvidenceItemKind(kind)) {
      throw new ReasoningEvalError(
        "invalid_bundle",
        `${path}.kind must be one of [${EVIDENCE_ITEM_KINDS.join(", ")}]`,
      );
    }
    const facts = stringArray(entry["facts"], `${path}.facts`);
    if (facts.length === 0) {
      throw new ReasoningEvalError("invalid_bundle", `${path}.facts must be non-empty`);
    }
    let measurement: EvidenceMeasurement | undefined;
    const measurementRaw = entry["measurement"];
    if (measurementRaw !== undefined) {
      if (!isRecord(measurementRaw)) {
        throw new ReasoningEvalError("invalid_bundle", `${path}.measurement must be an object`);
      }
      const sigma = measurementRaw["sigma"];
      const unit = nonEmptyString(measurementRaw["unit"]);
      if (typeof sigma !== "number" || !Number.isFinite(sigma) || sigma <= 0 || unit === undefined) {
        throw new ReasoningEvalError(
          "invalid_bundle",
          `${path}.measurement requires a positive finite sigma and a non-empty unit`,
        );
      }
      measurement = { sigma, unit };
    }
    evidence.push({
      evidenceId,
      revision,
      kind,
      content,
      facts,
      ...(measurement === undefined ? {} : { measurement }),
    });
  }
  const requiredEvidenceIds = optionalStringArray(input["requiredEvidenceIds"], "requiredEvidenceIds");
  const scope = input["scope"];
  if (!isBundleScope(scope)) {
    throw new ReasoningEvalError(
      "invalid_bundle",
      `scope must be one of [${BUNDLE_SCOPES.join(", ")}]`,
    );
  }
  if (scope === "out-of-scope" && requiredEvidenceIds.length > 0) {
    throw new ReasoningEvalError(
      "invalid_bundle",
      "an out-of-scope question names required evidence — the required data is by definition absent from the authorized set (requiredEvidenceIds must be empty)",
    );
  }
  for (const requiredId of requiredEvidenceIds) {
    if (!evidenceIds.has(requiredId)) {
      throw new ReasoningEvalError(
        "invalid_bundle",
        `requiredEvidenceIds references '${requiredId}' which is not in the evidence set`,
      );
    }
  }
  const offeredChecks = optionalStringArray(input["offeredChecks"], "offeredChecks");
  let operation: EnvelopeOperationContract | undefined;
  const operationRaw = input["operation"];
  if (operationRaw !== undefined) {
    if (!isRecord(operationRaw)) {
      throw new ReasoningEvalError("invalid_bundle", "operation must be an object");
    }
    const operationKind = nonEmptyString(operationRaw["operationKind"]);
    const targetEvidenceId = nonEmptyString(operationRaw["targetEvidenceId"]);
    const field = nonEmptyString(operationRaw["field"]);
    const unit = nonEmptyString(operationRaw["unit"]);
    const description = nonEmptyString(operationRaw["description"]);
    if (
      operationKind === undefined ||
      targetEvidenceId === undefined ||
      field === undefined ||
      unit === undefined ||
      description === undefined
    ) {
      throw new ReasoningEvalError(
        "invalid_bundle",
        "operation requires operationKind, targetEvidenceId, field, unit and description (non-empty strings)",
      );
    }
    if (!evidenceIds.has(targetEvidenceId)) {
      throw new ReasoningEvalError(
        "invalid_bundle",
        `operation.targetEvidenceId references '${targetEvidenceId}' which is not in the evidence set`,
      );
    }
    operation = { operationKind, targetEvidenceId, field, unit, description };
  }
  return {
    scenarioId,
    lane,
    question,
    authorizedContext,
    evidence,
    requiredEvidenceIds,
    scope,
    offeredChecks,
    ...(operation === undefined ? {} : { operation }),
  };
}

/**
 * Parses + validates an unknown value as a {@link DeclaredEvidenceEnvelope}
 * (the envelope a provider emitted through `outputs.envelopeJson`).
 */
export function parseDeclaredEvidenceEnvelope(input: unknown): DeclaredEvidenceEnvelope {
  if (!isRecord(input)) {
    throw new ReasoningEvalError("invalid_scenario", "the declared envelope must be a JSON object");
  }
  const resultStatus = input["resultStatus"];
  if (!isEnvelopeStatus(resultStatus)) {
    throw new ReasoningEvalError(
      "invalid_scenario",
      `resultStatus must be one of [${ENVELOPE_RESULT_STATUSES.join(", ")}]`,
    );
  }
  const agentIdentityRaw = input["agentIdentity"];
  let agentIdentity: EnvelopeAgentIdentity | null = null;
  if (agentIdentityRaw !== undefined && agentIdentityRaw !== null) {
    if (!isRecord(agentIdentityRaw)) {
      throw new ReasoningEvalError("invalid_scenario", "agentIdentity must be an object or null");
    }
    const providerId = nonEmptyString(agentIdentityRaw["providerId"]);
    const technologyVersion = nonEmptyString(agentIdentityRaw["technologyVersion"]);
    const capability = nonEmptyString(agentIdentityRaw["capability"]);
    if (providerId === undefined || technologyVersion === undefined || capability === undefined) {
      throw new ReasoningEvalError(
        "invalid_scenario",
        "agentIdentity requires providerId, technologyVersion and capability (non-empty strings)",
      );
    }
    agentIdentity = { providerId, technologyVersion, capability };
  }
  const proposedOperationRaw = input["proposedOperation"];
  let proposedOperation: ProposedOperation | null = null;
  if (proposedOperationRaw !== undefined && proposedOperationRaw !== null) {
    if (!isRecord(proposedOperationRaw)) {
      throw new ReasoningEvalError("invalid_scenario", "proposedOperation must be an object or null");
    }
    const operationKind = nonEmptyString(proposedOperationRaw["operationKind"]);
    const targetEvidenceId = nonEmptyString(proposedOperationRaw["targetEvidenceId"]);
    const field = nonEmptyString(proposedOperationRaw["field"]);
    const value = nonEmptyString(proposedOperationRaw["value"]);
    const unit = nonEmptyString(proposedOperationRaw["unit"]);
    if (
      operationKind === undefined ||
      targetEvidenceId === undefined ||
      field === undefined ||
      value === undefined ||
      unit === undefined
    ) {
      throw new ReasoningEvalError(
        "invalid_scenario",
        "proposedOperation requires operationKind, targetEvidenceId, field, value and unit (non-empty strings)",
      );
    }
    proposedOperation = { operationKind, targetEvidenceId, field, value, unit };
  }
  return {
    evidenceIds: stringArray(input["evidenceIds"], "evidenceIds"),
    facts: optionalStringArray(input["facts"], "facts"),
    assumptions: optionalStringArray(input["assumptions"], "assumptions"),
    unknowns: optionalStringArray(input["unknowns"], "unknowns"),
    deterministicChecks: optionalStringArray(input["deterministicChecks"], "deterministicChecks"),
    resultClaim: optionalNullableString(input["resultClaim"]),
    resultStatus,
    invalidationConditions: optionalStringArray(
      input["invalidationConditions"],
      "invalidationConditions",
    ),
    nextRecommendedAction: optionalNullableString(input["nextRecommendedAction"]),
    agentIdentity,
    proposedOperation,
  };
}

/**
 * Parses + validates an unknown value as a {@link ReasoningEvalScenario}.
 * The input must carry the typed `provider-input` seal with a payload of
 * `bundleJson` (canonical bundle JSON), `behaviorTag` (the fixture-double
 * control channel) and an optional `variantScript` (the deterministic
 * defect double's replay script — read only by fixture providers, never
 * by the harness).
 */
export function parseReasoningEvalScenario(input: unknown): ReasoningEvalScenario {
  if (!isRecord(input)) {
    throw new ReasoningEvalError("invalid_scenario", "the scenario must be a JSON object");
  }
  const scenarioId = nonEmptyString(input["scenarioId"]);
  if (scenarioId === undefined) {
    throw new ReasoningEvalError("invalid_scenario", "scenarioId must be a non-empty string");
  }
  if (!isLane(input["lane"])) {
    throw new ReasoningEvalError(
      "invalid_scenario",
      `lane must be one of [${REASONING_EVAL_LANES.join(", ")}]`,
    );
  }
  const lane = input["lane"];
  const providerRaw = input["providerRef"];
  if (!isRecord(providerRaw)) {
    throw new ReasoningEvalError("invalid_scenario", "providerRef must be an object");
  }
  const providerId = nonEmptyString(providerRaw["providerId"]);
  const technologyVersion = nonEmptyString(providerRaw["technologyVersion"]);
  if (providerId === undefined || technologyVersion === undefined) {
    throw new ReasoningEvalError(
      "invalid_scenario",
      "providerRef requires providerId and technologyVersion (non-empty strings)",
    );
  }
  const capability = nonEmptyString(input["capability"]);
  if (capability === undefined) {
    throw new ReasoningEvalError("invalid_scenario", "capability must be a non-empty string");
  }
  const inputRaw = input["input"];
  if (!isRecord(inputRaw) || inputRaw["kind"] !== "provider-input") {
    throw new ReasoningEvalError(
      "invalid_scenario",
      "input must be a ProviderInput object (typed seal 'provider-input')",
    );
  }
  const payload = inputRaw["payload"];
  if (!isRecord(payload)) {
    throw new ReasoningEvalError("invalid_scenario", "input.payload must be an object");
  }
  const bundleJson = nonEmptyString(payload["bundleJson"]);
  if (bundleJson === undefined) {
    throw new ReasoningEvalError(
      "invalid_scenario",
      "input.payload.bundleJson must be a non-empty string (the canonical evidence-question bundle JSON)",
    );
  }
  const behaviorTag = payload["behaviorTag"];
  if (!isBehavior(behaviorTag)) {
    throw new ReasoningEvalError(
      "invalid_scenario",
      `input.payload.behaviorTag must be one of [${FIXTURE_BEHAVIORS.join(", ")}] (the fixture-double control channel)`,
    );
  }
  const variantScript = payload["variantScript"];
  if (variantScript !== undefined && typeof variantScript !== "string") {
    throw new ReasoningEvalError(
      "invalid_scenario",
      "input.payload.variantScript, when present, must be a string (the defect double's replay script)",
    );
  }
  const criteriaRaw = input["criteria"];
  let criteria: EvaluationCriteria = FULL_EVALUATION_CRITERIA;
  if (criteriaRaw !== undefined) {
    if (!isRecord(criteriaRaw)) {
      throw new ReasoningEvalError("invalid_scenario", "criteria must be an object");
    }
    const flags: Record<string, boolean> = {};
    for (const key of Object.keys(FULL_EVALUATION_CRITERIA)) {
      const flag = criteriaRaw[key];
      if (typeof flag !== "boolean") {
        throw new ReasoningEvalError(
          "invalid_scenario",
          `criteria.${key} must be a boolean`,
        );
      }
      flags[key] = flag;
    }
    criteria = flags as unknown as EvaluationCriteria;
  }
  const expectedRaw = input["expected"];
  if (!isRecord(expectedRaw)) {
    throw new ReasoningEvalError("invalid_scenario", "expected must be an object");
  }
  const expectedStatusRaw = expectedRaw["resultStatus"];
  if (!isEnvelopeStatus(expectedStatusRaw)) {
    throw new ReasoningEvalError(
      "invalid_scenario",
      `expected.resultStatus must be one of [${ENVELOPE_RESULT_STATUSES.join(", ")}]`,
    );
  }
  const correctStatusRaw = expectedRaw["correctResultStatus"];
  if (!isEnvelopeStatus(correctStatusRaw)) {
    throw new ReasoningEvalError(
      "invalid_scenario",
      `expected.correctResultStatus must be one of [${ENVELOPE_RESULT_STATUSES.join(", ")}] (the evaluator-side correctness oracle)`,
    );
  }
  const expectedFailureKind = expectedRaw["expectedFailureKind"];
  if (!isFailureKindOrNone(expectedFailureKind)) {
    throw new ReasoningEvalError(
      "invalid_scenario",
      `expected.expectedFailureKind must be 'none' or one of the CLOSED failure kinds [${FAILURE_KINDS.join(", ")}] — expected outcomes cannot invent failure vocabulary`,
    );
  }
  const expectedViolationRulesRaw = expectedRaw["expectedViolationRules"];
  if (expectedViolationRulesRaw !== undefined && !Array.isArray(expectedViolationRulesRaw)) {
    throw new ReasoningEvalError(
      "invalid_scenario",
      "expected.expectedViolationRules must be an array of integrity rules",
    );
  }
  const expectedViolationRules: EnvelopeIntegrityRule[] = [];
  for (const [index, ruleRaw] of (expectedViolationRulesRaw ?? []).entries()) {
    if (!isRule(ruleRaw)) {
      throw new ReasoningEvalError(
        "invalid_scenario",
        `expected.expectedViolationRules[${index}] must be one of [${ENVELOPE_INTEGRITY_RULES.join(", ")}]`,
      );
    }
    expectedViolationRules.push(ruleRaw);
  }
  const expected: ExpectedEnvelopeOutcome = {
    resultStatus: expectedStatusRaw,
    resultClaim: optionalNullableString(expectedRaw["resultClaim"]),
    facts: optionalStringArray(expectedRaw["facts"], "expected.facts"),
    assumptions: optionalStringArray(expectedRaw["assumptions"], "expected.assumptions"),
    unknowns: optionalStringArray(expectedRaw["unknowns"], "expected.unknowns"),
    evidenceIds: optionalStringArray(expectedRaw["evidenceIds"], "expected.evidenceIds"),
    deterministicChecks: optionalStringArray(
      expectedRaw["deterministicChecks"],
      "expected.deterministicChecks",
    ),
    invalidationConditions: optionalStringArray(
      expectedRaw["invalidationConditions"],
      "expected.invalidationConditions",
    ),
    correctResultStatus: correctStatusRaw,
    correctResultClaim: optionalNullableString(expectedRaw["correctResultClaim"]),
    correctAssumptions: optionalStringArray(expectedRaw["correctAssumptions"], "expected.correctAssumptions"),
    expectedFailureKind,
    expectedViolationRules,
  };
  return {
    scenarioId,
    lane,
    providerRef: { providerId, technologyVersion },
    capability,
    input: {
      kind: "provider-input",
      capability,
      payload: {
        bundleJson,
        behaviorTag,
        ...(variantScript === undefined ? {} : { variantScript }),
      },
    },
    expected,
    criteria,
  };
}

/* ------------------------------------------------------------------ */
/* Runtime vocabulary guards (house style)                              */
/* ------------------------------------------------------------------ */

/** Is a value one of the frozen lanes? */
export function isReasoningEvalLane(value: unknown): value is ReasoningEvalLane {
  return isLane(value);
}

/** Is a value one of the frozen envelope result statuses? */
export function isEnvelopeResultStatus(value: unknown): value is EnvelopeResultStatus {
  return isEnvelopeStatus(value);
}

/** Is a value one of the frozen integrity rules? */
export function isEnvelopeIntegrityRule(value: unknown): value is EnvelopeIntegrityRule {
  return isRule(value);
}
