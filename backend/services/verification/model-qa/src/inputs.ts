/**
 * AISE-014 input contracts: the narrow reader ports and the
 * run-input records.
 *
 * Port discipline (the AISE-013 pattern): QA never imports
 * another service's internal mutable state. It composes over
 * narrow reader ports that hand it (a) the committed graph of
 * the version under verification, (b) the frozen evidence
 * mapping snapshot, and (c) optionally the AISE-013 readiness
 * record for that version — each as plain immutable data, each
 * re-validated at THIS service's boundary before any check runs.
 */
import type {
  EvidenceGraph,
  RealityModelGraph,
} from "@aise/engineering-model";
import type { AssuranceProfile } from "@aise/shared-contracts";

/**
 * The readiness context record QA consumes (an adapter view of
 * the AISE-013 `ReadinessReport`). Structural mirror, not a
 * canonical dependency: AISE-013 remains the only readiness
 * authority; QA only checks that the readiness verdict pins the
 * same content it was computed over and records it as context.
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
export interface QaModelReader {
  /** The committed graph of the version, or undefined when absent. */
  getModelGraph(modelId: string, version: number): RealityModelGraph | undefined;
}

/** Reader port: the frozen evidence mapping snapshot. */
export interface QaEvidenceMappingReader {
  /** The frozen mapping snapshot, or undefined when the project has none. */
  getMapping(projectId: string): EvidenceGraph | undefined;
}

/** Reader port: the readiness record of one version. */
export interface QaReadinessReader {
  /** The latest readiness record for the version, or undefined. */
  getReadiness(modelId: string, version: number): ReadinessContextInput | undefined;
}

/** The full input of one QA run (library composition form). */
export interface QaRunInput {
  /** The committed Reality Graph under verification (sole canonical input). */
  readonly graph: RealityModelGraph;
  /** The committed version number of that graph. */
  readonly version: number;
  /** The assurance profile this verification run executes under (AC-110). */
  readonly profile: AssuranceProfile;
  /** The evidence mapping snapshot, when evidence checks should run. */
  readonly mapping?: EvidenceGraph;
  /** The readiness context, when readiness pinning should be checked. */
  readonly readiness?: ReadinessContextInput;
}

/** Verified, ready-to-check input (boundary output). */
export interface QaVerifiedInput extends QaRunInput {
  /** Mapping present flag (explicit for the checks). */
  readonly hasMapping: boolean;
  readonly hasReadiness: boolean;
}
