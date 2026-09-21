/**
 * Solution contract versioning (PROD-021).
 *
 * Every wire object in `@aise/solution-contract` carries a `contractVersion`
 * string (strict semver, the same primitive schema as
 * `@aise/shared-contracts` and `@aise/adapter-contract`). The package version
 * IS the contract version: the two are asserted equal by tests, and every
 * contract family currently ships the single program-wide
 * `SOLUTION_CONTRACT_VERSION`.
 *
 * This is THE interactive solution graph and engineering operation contract
 * named by `spec/solution-operation-contract.md` (the checkable artifact set
 * of PROD-021, governing records ACR-005/ACR-006). After PROD-021 merges,
 * the solution wave workers (PROD-022 engine, PROD-023 agent compiler,
 * PROD-025 BOQ derivation) must not change this contract without a new
 * governed SHARED work item — see
 * `docs/productization-evidence/PROD-021/contract-artifacts.md`.
 *
 * Compatibility rules (identical discipline to `@aise/shared-contracts` and
 * `@aise/adapter-contract`):
 *
 *  - decode accepts any payload whose major version equals the family's
 *    current major version (same-major forward/backward compatibility within
 *    a major); minor/patch differences are additive-only by policy;
 *  - a missing, malformed or cross-major `contractVersion` is rejected with a
 *    typed error (`SolutionContractVersionMismatchError`) — never silently
 *    coerced;
 *  - encode emits exactly the family version and rejects values carrying a
 *    different version.
 *
 * DETERMINISTIC IDENTITY IS VERSION-INDEPENDENT: the identity derivations in
 * `src/identity.ts` deliberately EXCLUDE `contractVersion` — a same-major
 * minor bump of this contract must not re-address every operation, state,
 * snapshot or BOQ trace ever recorded.
 */

/**
 * The program-wide solution contract version. Bump rules:
 *  - MAJOR: any removal, rename, type narrowing, enum-value removal or
 *    semantic change to an existing field;
 *  - MINOR: additive changes only (new optional fields, new enum values,
 *    new wire objects, relaxed constraints);
 *  - PATCH: documentation/description-only changes.
 */
export const SOLUTION_CONTRACT_VERSION = "1.0.0";

/** The contract families owned by this package (one logical module group each). */
export const SOLUTION_CONTRACT_FAMILIES = [
  "solution",
  "operation",
  "state",
  "validation",
  "capability",
  "trace",
  "domain",
] as const;

export type SolutionContractFamily = (typeof SOLUTION_CONTRACT_FAMILIES)[number];

/**
 * Per-family contract versions. Families may diverge in minor/patch over
 * time; they all start at the program-wide version and must stay within the
 * same major while this package is the single solution-contract authority.
 */
export const SOLUTION_FAMILY_VERSIONS: Readonly<
  Record<SolutionContractFamily, string>
> = {
  solution: SOLUTION_CONTRACT_VERSION,
  operation: SOLUTION_CONTRACT_VERSION,
  state: SOLUTION_CONTRACT_VERSION,
  validation: SOLUTION_CONTRACT_VERSION,
  capability: SOLUTION_CONTRACT_VERSION,
  trace: SOLUTION_CONTRACT_VERSION,
  domain: SOLUTION_CONTRACT_VERSION,
};

/** The current contract version of a family. */
export function solutionFamilyVersion(family: SolutionContractFamily): string {
  return SOLUTION_FAMILY_VERSIONS[family];
}

/**
 * The ten solution-graph and BOQ-trace objects the PROD-021 work order names
 * (docs/productization-work-orders.md §PROD-021 scope): the versioned
 * Solution/SolutionVersion containers, the typed operation records and their
 * target/dependency/effect satellites, the PROPOSED-sealed state, the
 * validation snapshot, and the bidirectional solution-step ↔ BOQ-line trace
 * objects.
 */
export const SOLUTION_GRAPH_OBJECT_NAMES = [
  "Solution",
  "SolutionVersion",
  "EngineeringOperation",
  "ProposedState",
  "OperationDependency",
  "OperationTarget",
  "OperationEffect",
  "SolutionValidationSnapshot",
  "SolutionBoqLineTrace",
  "SolutionBoqTraceSet",
] as const;

export type SolutionGraphObjectName = (typeof SOLUTION_GRAPH_OBJECT_NAMES)[number];

/**
 * The four interaction-facing objects that feed the graph: the typed
 * operation intent (authorable by direct manipulation OR an agent through the
 * SAME constructor surface), the engine's operation capability profile, the
 * capability negotiation result, and the domain (vertical) descriptor that
 * keeps building specifics out of client-facing authority.
 */
export const SOLUTION_INTERACTION_OBJECT_NAMES = [
  "EngineeringOperationIntent",
  "OperationCapabilityProfile",
  "OperationCapabilityNegotiation",
  "SolutionDomainDescriptor",
] as const;

export type SolutionInteractionObjectName =
  (typeof SOLUTION_INTERACTION_OBJECT_NAMES)[number];

/** Every checkable solution contract object (graph + interaction). */
export const SOLUTION_OBJECT_NAMES = [
  ...SOLUTION_GRAPH_OBJECT_NAMES,
  ...SOLUTION_INTERACTION_OBJECT_NAMES,
] as const;

export type SolutionObjectName = (typeof SOLUTION_OBJECT_NAMES)[number];
