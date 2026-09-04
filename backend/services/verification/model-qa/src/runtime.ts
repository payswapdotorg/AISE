/**
 * Bounded service composition for the AISE-014 model-QA service.
 *
 * Composition mirrors the AISE-013 pattern: narrow reader ports
 * in, deterministic verification out. The runtime never imports
 * another service's mutable state — it reads the committed graph
 * (AISE-011 store), the frozen evidence mapping (AISE-012 store)
 * and the readiness record (AISE-013 store) through ports, each
 * re-validated at THIS boundary, then runs the pure check suite.
 *
 * Read-only guarantee: the service composes reads only; the
 * graph, mapping and readiness records it consumed are bit-wise
 * unchanged by any QA operation (digest-proven in the tests —
 * no second canonical authority).
 */
import { ModelQaError, toModelQaError } from "./errors.js";
import type {
  QaEvidenceMappingReader,
  QaModelReader,
  QaReadinessReader,
  QaRunInput,
} from "./inputs.js";
import { buildQaReport, type QaReport } from "./report.js";
import { buildQaView } from "./view.js";
import { validateQaInput } from "./boundary.js";
import { runGeometryChecks } from "./checks/geometry.js";
import { runTopologyChecks } from "./checks/topology.js";
import { runSemanticChecks } from "./checks/semantic.js";
import { runEpistemicChecks } from "./checks/epistemic.js";
import { runCrossObjectChecks } from "./checks/crossobject.js";
import type { AssuranceProfile } from "@aise/shared-contracts";
import { QA_CHECK_SUITE_VERSION } from "./vocabulary.js";
import type { QaFinding } from "./findings.js";

/** Bounded-compute limits (fail closed, injectable for tests). */
export interface ModelQaLimits {
  /** Maximum objects per verified graph. */
  readonly maxObjects: number;
  /** Maximum spaces per verified graph. */
  readonly maxSpaces: number;
  /** Maximum relationships per verified graph. */
  readonly maxRelationships: number;
}

export const DEFAULT_QA_LIMITS: ModelQaLimits = Object.freeze({
  maxObjects: 20_000,
  maxSpaces: 5_000,
  maxRelationships: 100_000,
});

/** The composed model-QA service. */
export interface ModelQaService {
  readonly kind: "model-qa";
  readonly checkSuiteVersion: string;
  /** Runs the deterministic verification of one committed version. */
  runQa(input: {
    readonly modelId: string;
    readonly version: number;
    readonly profile: AssuranceProfile;
    /** Optional explicit mapping/readiness overrides (library composition). */
    readonly mappingOverride?: boolean;
  }): QaReport;
  /** The reader ports this service was composed over. */
  readonly ports: {
    readonly model: QaModelReader;
    readonly evidence?: QaEvidenceMappingReader;
    readonly readiness?: QaReadinessReader;
  };
}

/** Options for `buildModelQaService`. */
export interface BuildModelQaServiceOptions {
  readonly modelReader: QaModelReader;
  readonly evidenceReader?: QaEvidenceMappingReader;
  readonly readinessReader?: QaReadinessReader;
  readonly limits?: Partial<ModelQaLimits>;
}

/** Builds the composed model-QA service. */
export function buildModelQaService(options: BuildModelQaServiceOptions): ModelQaService {
  const limits: ModelQaLimits = { ...DEFAULT_QA_LIMITS, ...options.limits };
  const ports = {
    model: options.modelReader,
    ...(options.evidenceReader !== undefined ? { evidence: options.evidenceReader } : {}),
    ...(options.readinessReader !== undefined ? { readiness: options.readinessReader } : {}),
  };
  return {
    kind: "model-qa",
    checkSuiteVersion: QA_CHECK_SUITE_VERSION,
    ports,
    runQa({ modelId, version, profile }) {
      try {
        const graph = options.modelReader.getModelGraph(modelId, version);
        if (graph === undefined) {
          throw new ModelQaError("MODEL_NOT_FOUND", `model ${modelId} has no version ${version}`, {
            details: { field: "version", value: `${modelId}@${version}` },
          });
        }
        const mapping = options.evidenceReader?.getMapping(graph.projectId);
        const readiness = options.readinessReader?.getReadiness(modelId, version);
        return runModelQa({
          graph,
          version,
          profile,
          ...(mapping !== undefined ? { mapping } : {}),
          ...(readiness !== undefined ? { readiness } : {}),
          __limits: limits,
        });
      } catch (error) {
        throw error instanceof ModelQaError ? error : toModelQaError(error);
      }
    },
  };
}

/** Internal limits-carrying run input. */
interface LimitedQaRunInput extends QaRunInput {
  readonly __limits?: ModelQaLimits;
}

/**
 * The pure QA run: validate at the boundary, build the read
 * view, run every check family, assemble the deterministic
 * report. Identical inputs produce bit-identical reports.
 */
export function runModelQa(input: QaRunInput & { readonly __limits?: ModelQaLimits }): QaReport {
  const limited = input as LimitedQaRunInput;
  const limits = limited.__limits ?? DEFAULT_QA_LIMITS;

  // Bounds are enforced on the verified input's graph — but the
  // graph is validated FIRST (fail-closed on content before
  // fail-closed on size).
  const verified = validateQaInput({
    graph: input.graph,
    version: input.version,
    profile: input.profile,
    ...(input.mapping !== undefined ? { mapping: input.mapping } : {}),
    ...(input.readiness !== undefined ? { readiness: input.readiness } : {}),
  });

  const { graph } = verified;
  if (graph.objects.length > limits.maxObjects) {
    throw new ModelQaError("BOUNDS_EXCEEDED", `graph carries more objects than the QA limit: ${graph.objects.length} > ${limits.maxObjects}`);
  }
  if (graph.spaces.length > limits.maxSpaces) {
    throw new ModelQaError("BOUNDS_EXCEEDED", `graph carries more spaces than the QA limit: ${graph.spaces.length} > ${limits.maxSpaces}`);
  }
  if (graph.relationships.length > limits.maxRelationships) {
    throw new ModelQaError("BOUNDS_EXCEEDED", `graph carries more relationships than the QA limit: ${graph.relationships.length} > ${limits.maxRelationships}`);
  }

  const view = buildQaView(verified);

  const findings: QaFinding[] = [
    ...runGeometryChecks(view, input.profile),
    ...runTopologyChecks(view, input.profile),
    ...runSemanticChecks(view, input.profile),
    ...runEpistemicChecks(view, input.profile),
    ...runCrossObjectChecks(view, input.profile),
  ];

  return buildQaReport({
    modelId: graph.modelId,
    projectId: graph.projectId,
    version: input.version,
    profile: input.profile,
    modelDigest: graph.digest,
    mappingDigest: verified.hasMapping && input.mapping !== undefined ? input.mapping.digest : undefined,
    findings,
    ...(input.readiness !== undefined ? { readiness: input.readiness } : {}),
  });
}
