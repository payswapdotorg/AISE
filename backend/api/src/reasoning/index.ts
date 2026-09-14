/**
 * AISE-029 — Engineering Reasoning gateway public surface.
 *
 * A provider-neutral reasoning LIBRARY: the frozen refusal/citation/
 * provider-kind vocabularies, the caller-assembled GroundedContext contract,
 * the deterministic retrieval tool port (+ pure default), the policy gate,
 * TWO interchangeable deterministic reference providers with a
 * provider-neutral selection helper, and the orchestrating gateway with
 * contract post-validation and deterministic failover.
 *
 * This is a domain library: NO router/server wiring is exported here —
 * HTTP integration is AISE-036/038's explicitly reviewed change (the same
 * deliberate deferral as AISE-033). Read model.ts (authority + epistemic
 * discipline + the not-a-store-reader rule), gateway.ts (the untrusted-
 * provider post-validation pipeline) and policy.ts (the rules gate) before
 * use. NO new npm dependencies; read-only type imports from the owning
 * authorities (reality / cases / verification) plus shared-contracts,
 * lib/hash and lib/log.
 */

export {
  // frozen registries + vocabularies
  REFUSAL_CODES,
  CITATION_KINDS,
  PROVIDER_KINDS,
  PROVIDER_FAILURE_KINDS,
  CLAIM_EPISTEMIC_STATUSES,
  UNCERTAINTY_KINDS,
  REASONING_ERROR_CODES,
  // typed error
  ReasoningGatewayError,
  // deterministic identity helpers
  contentFingerprint,
  claimIdFor,
  isRefusalCode,
  isCitationKind,
  isClaimEpistemicStatus,
} from "./model";

export type {
  RefusalCode,
  CitationKind,
  ProviderKind,
  ProviderFailureKind,
  ClaimEpistemicStatus,
  UncertaintyKind,
  ReasoningErrorCode,
  GroundedUncertainty,
  GroundedProperty,
  GroundedNode,
  GroundedEvidenceMeasurement,
  GroundedEvidenceRecord,
  GroundedCase,
  GroundedContext,
  ClaimCitation,
  ReasoningUncertainty,
  ReasoningClaim,
  Refusal,
  ReasoningProviderDescriptor,
  ProviderFailure,
  ProviderCompletion,
  ReasoningProvider,
  ReasoningQuery,
  ReasoningResult,
  EvidenceMethod,
  Hypothesis,
  Observation,
  Finding,
  PropertyRecord,
  RealityNode,
  Relationship,
} from "./model";

export {
  DEFAULT_REASONING_POLICY,
  validateReasoningPolicy,
  evaluatePolicy,
} from "./policy";
export type { ReasoningPolicy, PolicyVerdict } from "./policy";

export {
  GroundedRetrieval,
  createGroundedRetrieval,
  labelOfNode,
  questionMentionsPhrase,
} from "./retrieval";
export type { RetrievalAdapter, UncertaintySource, CitationResolution } from "./retrieval";

export { chooseProvider, eligibleProviders, isDescriptorWellFormed } from "./providers/select";
export {
  createDeterministicReferenceProvider,
  DETERMINISTIC_REFERENCE_PROVIDER_ID,
} from "./providers/deterministic-reference";
export {
  createStubSecondProvider,
  STUB_SECOND_PROVIDER_ID,
  STUB_SECOND_MIN_SUPPORTING_OBSERVATIONS,
} from "./providers/stub-second";
export { resolveQuestion } from "./providers/question";
export type { QuestionFamily, QuestionResolution } from "./providers/question";

export { createReasoningGateway } from "./gateway";
export type { ReasoningGatewayOptions, ReasoningGateway } from "./gateway";
