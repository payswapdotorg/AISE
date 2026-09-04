/**
 * AISE-021 input contracts: the narrow reader ports and the
 * run-input records.
 *
 * Port discipline (the AISE-013/014 pattern): the rule engine
 * never imports another service's internal mutable state. It
 * composes over narrow reader ports that hand it (a) the
 * committed graph of the version under evaluation, (b) the
 * frozen evidence mapping snapshot, and (c) optionally the
 * AISE-013 readiness record for that version — each as plain
 * immutable data, each re-validated at THIS service's boundary
 * before a single rule runs.
 */
import type {
  EvidenceGraph,
  RealityModelGraph,
} from "@aise/engineering-model";
import type { AssuranceProfile } from "@aise/shared-contracts";

/**
 * The readiness context record the rules engine consumes (an
 * adapter view of the AISE-013 `ReadinessReport`, the same
 * structural mirror AISE-014 QA uses). AISE-013 remains the
 * only readiness authority; the rule engine only checks that
 * the readiness verdict pins the same content it gates.
 */
export interface ReadinessContextInput {
  readonly taskId: string;
  readonly verdict: "READY" | "NOT_READY";
  readonly assuranceProfile: AssuranceProfile;
  readonly modelId: string;
  readonly version: number;
  readonly graphDigest: string;
  readonly mappingDigest: string;
}

/** Reader port: the committed graph of one version. */
export interface RulesModelReader {
  /** The committed graph of the version, or undefined when absent. */
  getModelGraph(modelId: string, version: number): RealityModelGraph | undefined;
}

/** Reader port: the frozen evidence mapping snapshot. */
export interface RulesEvidenceMappingReader {
  /** The frozen mapping snapshot, or undefined when the project has none. */
  getMapping(projectId: string): EvidenceGraph | undefined;
}

/** Reader port: the readiness record of one version. */
export interface RulesReadinessReader {
  /** The latest readiness record for the version, or undefined. */
  getReadiness(modelId: string, version: number): ReadinessContextInput | undefined;
}

/** The full input of one rule evaluation run (library composition form). */
export interface RulesRunInput {
  /** The committed Reality Graph under evaluation (sole canonical content input). */
  readonly graph: RealityModelGraph;
  /** The committed version number of that graph. */
  readonly version: number;
  /**
   * The assurance profile this evaluation run executes under
   * (AC-110: recorded on the report). Must satisfy the rule
   * set's declared profile.
   */
  readonly profile: AssuranceProfile;
  /** The validated, content-pinned rule set. */
  readonly ruleset: RuleSetLike;
  /** The evidence mapping snapshot, when evidence gating applies. */
  readonly mapping?: EvidenceGraph;
  /** The readiness context, when a readiness gate is declared. */
  readonly readiness?: ReadinessContextInput;
}

/**
 * The rule-set surface the run input accepts (a validated set —
 * `ruleSet()` output — is structurally this; the boundary
 * re-validates content regardless).
 */
export interface RuleSetLike {
  readonly rulesetId: string;
  readonly profile: AssuranceProfile;
  readonly readinessGate?: { readonly profile: AssuranceProfile };
  readonly rules: readonly unknown[];
  readonly digest: string;
}

/** Verified, ready-to-evaluate input (boundary output). */
export interface RulesVerifiedInput extends RulesRunInput {
  /** Mapping present flag (explicit for the evaluators). */
  readonly hasMapping: boolean;
  readonly hasReadiness: boolean;
}
