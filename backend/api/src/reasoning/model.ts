/**
 * AISE-029 — Engineering Reasoning gateway: the provider-neutral MODEL.
 *
 * Contract (spec/work-orders.md §029: "Create provider-neutral
 * retrieval/tool/LLM interface grounded in graph, evidence, rules and policy.
 * Verify claim citations, uncertainty awareness, refusal on insufficient
 * evidence and provider interchangeability."; spec/requirements.md R16 —
 * "Reasoning shall be model/provider neutral and support multiple
 * LLM/model providers, deterministic tools and retrieval. Acceptance: no
 * provider-specific semantics become canonical.";
 * spec/architecture-lock.md "Authority" item 7 — "LLMs and agents are
 * non-authoritative"; "Truth and uncertainty"):
 *
 * AUTHORITY DISCIPLINE (the loud parts first):
 *
 *  - THE GATEWAY IS NOT A STORE READER. `GroundedContext` is a
 *    CALLER-ASSEMBLED grounding bundle: a reality-graph snapshot slice,
 *    evidence records (verbatim, with invalidation state), verification
 *    findings, case observations/hypotheses and applicable rule statements.
 *    This module NEVER fetches grounding data itself — no store access, no
 *    I/O, no network. Retrieval ADAPTERS (see retrieval.ts) are the injected
 *    deterministic tool seam; production wiring (AISE-036/038) owns
 *    assembling the context from the real authorities.
 *  - NEVER AUTHORITATIVE ENGINEERING TRUTH (lock item 7): a `ReasoningClaim`
 *    is reasoning OUTPUT, so its `epistemicStatus` is the LITERAL union
 *    `"INFERRED" | "PROPOSED"` — OBSERVED/CONFIRMED are IMPOSSIBLE at the
 *    type level (a compile error, exactly like AISE-025's
 *    `Hypothesis.epistemicStatus`) and rejected at runtime by the gateway's
 *    post-validation. Observation/confirmation authority stays with the
 *    cited sources (Reality Graph, Evidence Graph); a claim only ever
 *    REFERENCES them.
 *  - CITATIONS ARE THE GROUNDING CONTRACT: every claim carries a NON-EMPTY
 *    citation tuple of VERBATIM references to things INSIDE the supplied
 *    context (evidence content id / graph node id / verification finding
 *    code+subject / case observation id). The gateway resolves every
 *    citation against the supplied context and REJECTS claims whose
 *    citations do not resolve or that cite invalidated evidence (providers
 *    are untrusted input sources, like wire input).
 *  - UNCERTAINTY HONESTY (lock "Truth and uncertainty"): claim uncertainty
 *    is either `MEASURED_SIGMA` — a 1σ PROPAGATED verbatim from a cited
 *    source (property σ or evidence-measurement σ; the propagated value is
 *    the MAXIMUM of the cited source σ values, so it is always one of the
 *    source values — combining σ by any other model is AISE-013's
 *    deterministic domain and is deliberately NOT done here) — or `UNKNOWN`
 *    when no cited source declares one. Numbers are NEVER fabricated: the
 *    gateway's fabrication gate rejects any (σ, unit) pair that does not
 *    exist among the claim's cited sources. Confidence is not measurement
 *    uncertainty and never appears as one.
 *  - REFUSAL IS A FIRST-CLASS OUTCOME: a wrong-but-confident answer is the
 *    failure mode this module exists to prevent. Insufficient evidence MUST
 *    refuse; refusal codes are a frozen registry below.
 *  - NO PROVIDER-SPECIFIC SEMANTICS BECOME CANONICAL (R16 acceptance): the
 *    `ReasoningResult`/`ReasoningClaim` schema is provider-neutral;
 *    `providerDescriptor` is METADATA. Providers are REPLACEABLE seams
 *    behind the `ReasoningProvider` port (the AISE-012 provider-port +
 *    descriptor structural precedent); the gateway post-validates every
 *    provider's output against THIS contract regardless of provider.
 *
 * INPUT SHAPES are STRUCTURAL MIRRORS of the owning authorities' read types
 * (imported READ-ONLY, type-only): a plain `RealityNode` projection is a
 * valid `GroundedNode`; a plain AISE-025 `Observation`/`Hypothesis` is a
 * valid case slice entry; a plain AISE-023 `Finding` is a valid finding
 * entry. No second model is defined — the owning modules stay the
 * authorities. Foreign vocabularies (node kinds, evidence methods, finding
 * codes) are carried VERBATIM and are NOT re-validated here: form
 * validation is each owning authority's write-time duty (the documented
 * AISE-023 boundary — membership checks only).
 *
 * DETERMINISM: no wall clock, no randomness, no I/O anywhere in this
 * module. Claim ids are content-derived (sha-256 over canonical JSON), so
 * the same grounding + the same provider behavior yields byte-identical
 * results; `completedAt` is stamped by the GATEWAY from an injected clock
 * (providers never own time).
 */

import { canonicalizeJson } from "@aise/shared-contracts";
import type { EvidenceMethod } from "@aise/shared-contracts";
import type { Hypothesis, Observation } from "../cases/model";
import { sha256Hex } from "../lib/hash";
import type { PropertyRecord, RealityNode, Relationship } from "../reality/model";
import type { Finding } from "../verification/model";
import type { ReasoningPolicy } from "./policy";

/* Verbatim re-exports of the composed foreign read types (single import
 * surface for consumers of this module — never a second definition). */
export type { EvidenceMethod } from "@aise/shared-contracts";
export type { Hypothesis, Observation } from "../cases/model";
export type { Finding } from "../verification/model";
export type { PropertyRecord, RealityNode, Relationship } from "../reality/model";

/* ------------------------------------------------------------------ */
/* Frozen registries (as const + Object.freeze — the stable contracts)  */
/* ------------------------------------------------------------------ */

/**
 * The frozen refusal-code vocabulary (documented semantics):
 *
 *  - INSUFFICIENT_EVIDENCE — the question is grounded but the supplied
 *    context lacks the evidence/property/fact needed to answer it. The
 *    detail MUST name what is missing.
 *  - UNGROUNDED_QUESTION — the question references nothing in the supplied
 *    grounding context (no node, case or finding it could attach to).
 *  - POLICY_VIOLATION — the deterministic policy gate (or a claim-level
 *    policy threshold) forbids this query/topic/output shape.
 *  - PROVIDER_FAILURE — no provider could produce a result (a permanent
 *    provider failure, or every transient attempt exhausted).
 *  - CONTRACT_VIOLATION — a provider produced output that failed the
 *    gateway's contract post-validation (unresolvable citations, forbidden
 *    epistemic status, fabricated uncertainty, …). The offending claim is
 *    REJECTED — it never passes through to the claims array.
 */
export const REFUSAL_CODES = Object.freeze([
  "INSUFFICIENT_EVIDENCE",
  "UNGROUNDED_QUESTION",
  "POLICY_VIOLATION",
  "PROVIDER_FAILURE",
  "CONTRACT_VIOLATION",
] as const satisfies readonly string[]);
export type RefusalCode = (typeof REFUSAL_CODES)[number];

/**
 * The frozen citation-kind vocabulary — the four ways a claim can ground
 * itself in the supplied context (verbatim references only):
 * evidence content id / graph node id / verification finding code+subject /
 * case observation id.
 */
export const CITATION_KINDS = Object.freeze([
  "evidence",
  "graph_node",
  "finding",
  "case_observation",
] as const satisfies readonly string[]);
export type CitationKind = (typeof CITATION_KINDS)[number];

/**
 * The frozen provider-kind vocabulary (classification METADATA, never
 * selection authority):
 *  - "deterministic-reference" — rule-based lookup/templating reasoner,
 *    NOT an LLM (the descriptor says so honestly).
 *  - "deterministic-conservative" — rule-based reasoner with deliberately
 *    more conservative claim thresholds, NOT an LLM.
 *  - "llm-adapter" — RESERVED for future adapters around external
 *    LLM/model providers. None ships in this library (the no-IO,
 *    no-nondeterminism discipline of this module); the vocabulary is
 *    forward-compatible so wiring a real LLM later needs NO contract
 *    change.
 */
export const PROVIDER_KINDS = Object.freeze([
  "deterministic-reference",
  "deterministic-conservative",
  "llm-adapter",
] as const satisfies readonly string[]);
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/**
 * The frozen provider-failure-kind vocabulary. TRANSIENT failures let the
 * gateway fail over deterministically to the next provider; PERMANENT
 * failures refuse immediately (PROVIDER_FAILURE) — a provider that reports
 * a permanent failure is saying "retrying me cannot help".
 */
export const PROVIDER_FAILURE_KINDS = Object.freeze(["TRANSIENT", "PERMANENT"] as const);
export type ProviderFailureKind = (typeof PROVIDER_FAILURE_KINDS)[number];

/**
 * Reasoning-output epistemic statuses — the LITERAL union EXCLUDES
 * "OBSERVED" and "CONFIRMED" (observation/confirmation belong to cited
 * sources and governed review acts, NEVER to reasoning output; structural
 * separation exactly like AISE-025's `HYPOTHESIS_EPISTEMIC_STATUSES`).
 */
export const CLAIM_EPISTEMIC_STATUSES = Object.freeze(["INFERRED", "PROPOSED"] as const);
export type ClaimEpistemicStatus = (typeof CLAIM_EPISTEMIC_STATUSES)[number];

/** The frozen uncertainty-outcome vocabulary (see header: never fabricated). */
export const UNCERTAINTY_KINDS = Object.freeze(["UNKNOWN", "MEASURED_SIGMA"] as const);
export type UncertaintyKind = (typeof UNCERTAINTY_KINDS)[number];

/**
 * Typed gateway/validation errors (thrown, never stringly): query shape,
 * policy shape and wiring problems. These are CALLER bugs, not reasoning
 * outcomes — refusal codes carry the runtime outcomes.
 */
export const REASONING_ERROR_CODES = Object.freeze([
  "invalid_query",
  "invalid_context",
  "invalid_policy",
  "no_providers",
  "duplicate_provider_id",
  "invalid_provider_descriptor",
] as const satisfies readonly string[]);
export type ReasoningErrorCode = (typeof REASONING_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (never a bare string error). */
export class ReasoningGatewayError extends Error {
  readonly code: ReasoningErrorCode;
  readonly detail: string;

  constructor(code: ReasoningErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ReasoningGatewayError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* GroundedContext — the CALLER-ASSEMBLED grounding bundle              */
/* ------------------------------------------------------------------ */

/** Caller-projected 1σ for a property, in the property's own unit. */
export interface GroundedUncertainty {
  readonly sigma: number;
  /** How this σ was obtained (provenance note; carried, not interpreted). */
  readonly basis?: string;
}

/**
 * A reality `PropertyRecord` (imported read-only) extended with the
 * caller-projected σ — exactly the documented AISE-016 → AISE-022/023
 * fact-mapping convention. A plain `PropertyRecord` is structurally valid.
 */
export interface GroundedProperty extends PropertyRecord {
  readonly uncertainty?: GroundedUncertainty;
}

/** A reality `RealityNode` whose properties may carry projected σ. */
export interface GroundedNode extends Omit<RealityNode, "properties"> {
  readonly properties: readonly GroundedProperty[];
}

/** A measurement carried by an evidence record (caller-extracted). */
export interface GroundedEvidenceMeasurement {
  readonly value: number;
  readonly unit: string;
  /** 1σ in the measurement's own unit; ABSENT = UNKNOWN, never 0. */
  readonly sigma?: number;
}

/**
 * One evidence record projection: the verbatim identity + acquisition
 * method + invalidation state + the node links the caller asserts. The
 * caller projects this from the Evidence authority's read view
 * (AISE-008 `EvidenceReadView`); THIS MODULE NEVER FETCHES IT.
 */
export interface GroundedEvidenceRecord {
  readonly contentId: string;
  readonly method: EvidenceMethod;
  readonly capturedAt: string;
  readonly invalidated: boolean;
  /** Present iff invalidated (verbatim reason; never invented here). */
  readonly invalidationReason?: string;
  readonly linkedNodeIds: readonly string[];
  readonly measurement?: GroundedEvidenceMeasurement;
}

/** One engineering-case slice: verbatim AISE-025 observations/hypotheses. */
export interface GroundedCase {
  readonly caseId: string;
  readonly observations: readonly Observation[];
  readonly hypotheses: readonly Hypothesis[];
}

/**
 * THE grounding bundle — everything reasoning may look at. Assembled by the
 * CALLER (production wiring is AISE-036/038's change). `rules` are
 * applicable rule/policy statements carried VERBATIM (advisory context for
 * providers; the deterministic policy gate in policy.ts is the enforced
 * rules layer).
 */
export interface GroundedContext {
  readonly graphSnapshot: {
    readonly nodes: readonly GroundedNode[];
    readonly relationships: readonly Relationship[];
  };
  readonly evidenceRecords: readonly GroundedEvidenceRecord[];
  readonly verificationFindings: readonly Finding[];
  readonly cases: readonly GroundedCase[];
  readonly rules?: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Claims, citations, uncertainty, refusals                             */
/* ------------------------------------------------------------------ */

/** A verbatim reference to something INSIDE the supplied context. */
export type ClaimCitation =
  | { readonly kind: "evidence"; readonly contentId: string }
  | { readonly kind: "graph_node"; readonly nodeId: string }
  | {
      readonly kind: "finding";
      readonly findingCode: string;
      readonly subjectNodeId: string;
    }
  | {
      readonly kind: "case_observation";
      readonly caseId: string;
      readonly observationId: string;
    };

/** Claim uncertainty: propagated source σ, or honestly UNKNOWN. */
export type ReasoningUncertainty =
  | { readonly kind: "UNKNOWN" }
  | {
      readonly kind: "MEASURED_SIGMA";
      /** 1σ, propagated VERBATIM from a cited source (the max of them). */
      readonly sigma: number;
      readonly unit: string;
    };

/**
 * One reasoning output claim. NEVER observed/confirmed truth (see header);
 * citations are a NON-EMPTY tuple of verbatim in-context references.
 */
export interface ReasoningClaim {
  readonly claimId: string;
  readonly text: string;
  readonly citations: readonly [ClaimCitation, ...ClaimCitation[]];
  readonly epistemicStatus: ClaimEpistemicStatus;
  readonly uncertainty: ReasoningUncertainty;
}

/** A typed first-class refusal; `detail` names what is missing. */
export interface Refusal {
  readonly code: RefusalCode;
  readonly detail: string;
}

/* ------------------------------------------------------------------ */
/* Provider port (the REPLACEABLE seam — AISE-012 structural precedent) */
/* ------------------------------------------------------------------ */

/** Provider identity METADATA — never content authority. */
export interface ReasoningProviderDescriptor {
  readonly providerId: string;
  readonly providerKind: ProviderKind;
}

/** A typed provider failure state (transient vs permanent). */
export interface ProviderFailure {
  readonly failureKind: ProviderFailureKind;
  /** Deterministic, sanitized detail — never stack traces or internals. */
  readonly detail: string;
}

/**
 * The provider-side completion seam. NOTE ON THE WORK ORDER'S SHORTHAND:
 * §029 sketches the port as `complete(query): Promise<ReasoningResult>`;
 * the completion union here is that seam refined so provider failures are
 * TYPED states (transient vs permanent) for deterministic failover —
 * providers never stamp `completedAt` (they own no clock) and never
 * self-describe the final result. The GATEWAY assembles the canonical
 * `ReasoningResult` (descriptor from its own provider record, clock from
 * the injection, claims post-validated). This mirrors AISE-010/012's typed
 * `ReconstructionOutcome` precedent exactly.
 */
export type ProviderCompletion =
  | {
      readonly kind: "completed";
      readonly claims: readonly ReasoningClaim[];
      readonly refusals: readonly Refusal[];
    }
  | { readonly kind: "failure"; readonly failure: ProviderFailure };

/** The provider PORT: a descriptor plus an explicit-outcome executor. */
export interface ReasoningProvider {
  readonly descriptor: ReasoningProviderDescriptor;
  complete(query: ReasoningQuery): Promise<ProviderCompletion>;
}

/* ------------------------------------------------------------------ */
/* Query and result                                                     */
/* ------------------------------------------------------------------ */

/** One reasoning request: caller text + caller-assembled grounding + policy. */
export interface ReasoningQuery {
  readonly queryId: string;
  readonly question: string;
  readonly policy: ReasoningPolicy;
  readonly context: GroundedContext;
}

/**
 * The canonical provider-neutral result. `providerDescriptor` is null iff
 * NO provider was dispatched (policy-gate refusal) — a provider's identity
 * never stamps a gateway-level decision. `completedAt` comes from the
 * gateway's injected clock.
 */
export interface ReasoningResult {
  /** Canonical order: claimId ascending (the gateway sorts). */
  readonly claims: readonly ReasoningClaim[];
  /** Canonical order: code, then detail; exact duplicates removed. */
  readonly refusals: readonly Refusal[];
  readonly providerDescriptor: ReasoningProviderDescriptor | null;
  readonly completedAt: string;
}

/* ------------------------------------------------------------------ */
/* Deterministic identity helpers                                       */
/* ------------------------------------------------------------------ */

/** sha-256 over the compact canonical JSON (sorted keys) of any value. */
export function contentFingerprint(value: unknown): string {
  return sha256Hex(JSON.stringify(canonicalizeJson(value)));
}

/**
 * Deterministic claim id: content-derived (sha-256 over the canonical claim
 * content minus the id itself) — same grounding + same provider behavior ⇒
 * the same id, with no sequence state and no randomness.
 */
export function claimIdFor(claim: Omit<ReasoningClaim, "claimId">): string {
  return `claim-${contentFingerprint(claim).slice(0, 16)}`;
}

/** Is a value one of the frozen refusal codes? (runtime vocabulary check) */
export function isRefusalCode(value: unknown): value is RefusalCode {
  return typeof value === "string" && (REFUSAL_CODES as readonly string[]).includes(value);
}

/** Is a value one of the frozen citation kinds? (runtime vocabulary check) */
export function isCitationKind(value: unknown): value is CitationKind {
  return typeof value === "string" && (CITATION_KINDS as readonly string[]).includes(value);
}

/** Is a value one of the frozen claim epistemic statuses? */
export function isClaimEpistemicStatus(value: unknown): value is ClaimEpistemicStatus {
  return (
    typeof value === "string" &&
    (CLAIM_EPISTEMIC_STATUSES as readonly string[]).includes(value)
  );
}
