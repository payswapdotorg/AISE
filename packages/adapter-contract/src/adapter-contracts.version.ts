/**
 * Adapter contract versioning (PROD-016).
 *
 * Every wire object in `@aise/adapter-contract` carries a `contractVersion`
 * string (strict semver, the same primitive schema as
 * `@aise/shared-contracts`). The package version IS the contract version:
 * the two are asserted equal by tests, and every contract family currently
 * ships the single program-wide `ADAPTER_CONTRACT_VERSION`.
 *
 * This is THE shared client adapter contract named by
 * `spec/client-adapter-contract.md` (the checkable artifact set of PROD-016).
 * After PROD-016 merges, adapter workers (PROD-017/019/020) must not change
 * this contract without a new governed SHARED work item — see
 * `docs/productization-evidence/PROD-016/compatibility-window.md`.
 *
 * Compatibility rules (identical discipline to `@aise/shared-contracts`):
 *
 *  - decode accepts any payload whose major version equals the family's
 *    current major version (same-major forward/backward compatibility within
 *    a major); minor/patch differences are additive-only by policy;
 *  - a missing, malformed or cross-major `contractVersion` is rejected with a
 *    typed error (`AdapterContractVersionMismatchError`) — never silently
 *    coerced;
 *  - encode emits exactly the family version and rejects values carrying a
 *    different version.
 */

/**
 * The program-wide adapter contract version. Bump rules:
 *  - MAJOR: any removal, rename, type narrowing, enum-value removal or
 *    semantic change to an existing field;
 *  - MINOR: additive changes only (new optional fields, new enum values,
 *    new wire objects, relaxed constraints);
 *  - PATCH: documentation/description-only changes.
 */
export const ADAPTER_CONTRACT_VERSION = "1.0.0";

/** The contract families owned by this package (one module each). */
export const ADAPTER_CONTRACT_FAMILIES = [
  "context",
  "capability",
  "domain",
  "action",
  "authorization",
  "result",
] as const;

export type AdapterContractFamily = (typeof ADAPTER_CONTRACT_FAMILIES)[number];

/**
 * Per-family contract versions. Families may diverge in minor/patch over
 * time; they all start at the program-wide version and must stay within the
 * same major while this package is the single adapter-contract authority.
 */
export const ADAPTER_FAMILY_VERSIONS: Readonly<
  Record<AdapterContractFamily, string>
> = {
  context: ADAPTER_CONTRACT_VERSION,
  capability: ADAPTER_CONTRACT_VERSION,
  domain: ADAPTER_CONTRACT_VERSION,
  action: ADAPTER_CONTRACT_VERSION,
  authorization: ADAPTER_CONTRACT_VERSION,
  result: ADAPTER_CONTRACT_VERSION,
};

/** The current contract version of a family. */
export function adapterFamilyVersion(family: AdapterContractFamily): string {
  return ADAPTER_FAMILY_VERSIONS[family];
}

/**
 * The twelve semantic objects `spec/client-adapter-contract.md` names — the
 * objects every adapter consumes and emits. The registry additionally owns
 * the three capability-negotiation objects (ClientCapabilityProfile,
 * TaskCapabilityRequirements, CapabilityNegotiation), which are contract
 * objects of the same version.
 */
export const SEMANTIC_OBJECT_NAMES = [
  "ProjectContext",
  "TaskIntent",
  "CapabilityDescriptor",
  "EvidenceSummary",
  "RealitySummary",
  "BOQContext",
  "EngineeringCaseSummary",
  "InterventionScenarioSummary",
  "OutcomeSummary",
  "NextBestAction",
  "AuthorizationContext",
  "OperationResult",
] as const;

export type SemanticObjectName = (typeof SEMANTIC_OBJECT_NAMES)[number];

/** The capability-negotiation objects owned by this package. */
export const NEGOTIATION_OBJECT_NAMES = [
  "ClientCapabilityProfile",
  "TaskCapabilityRequirements",
  "CapabilityNegotiation",
] as const;

export type NegotiationObjectName = (typeof NEGOTIATION_OBJECT_NAMES)[number];

/** Every checkable adapter contract object (semantic + negotiation). */
export const ADAPTER_OBJECT_NAMES = [
  ...SEMANTIC_OBJECT_NAMES,
  ...NEGOTIATION_OBJECT_NAMES,
] as const;

export type AdapterObjectName = (typeof ADAPTER_OBJECT_NAMES)[number];
