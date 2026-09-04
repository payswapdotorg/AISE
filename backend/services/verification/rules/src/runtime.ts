/**
 * AISE-021 service composition: bounded, port-driven, pure at
 * the core.
 *
 * - `runRuleEvaluation` — the pure entry: validate the input at
 *   the boundary, enforce the compute bounds, evaluate every
 *   rule deterministically, assemble the report. Identical
 *   inputs produce bit-identical reports.
 * - `buildRulesService` — the composition over narrow reader
 *   ports (the AISE-013/014 pattern): the service reads
 *   committed graphs, the current mapping and the latest
 *   readiness record; it writes NOTHING. The Reality Graph, the
 *   evidence mapping and the readiness store are never mutated
 *   (the rule engine is an evaluator, never a model authority —
 *   proven by tests).
 */
import { RulesError, toRulesError } from "./errors.js";
import type {
  RulesEvidenceMappingReader,
  RulesModelReader,
  RulesReadinessReader,
  RulesRunInput,
} from "./inputs.js";
import { validateRulesInput } from "./boundary.js";
import { evaluateRules } from "./evaluate.js";
import { buildRulesReport, type RulesReport } from "./report.js";
import { RULE_SUITE_VERSION } from "./vocabulary.js";

/** Bounded-compute limits (deterministic defaults). */
export interface RulesLimits {
  readonly maxRules: number;
  readonly maxObjects: number;
  readonly maxSpaces: number;
}

export const DEFAULT_RULES_LIMITS: RulesLimits = Object.freeze({
  maxRules: 1_000,
  maxObjects: 5_000,
  maxSpaces: 2_000,
});

/** The composed rules service surface. */
export interface RulesService {
  readonly kind: "rules";
  /** The rule-suite identity (digest-pinned semantics version). */
  readonly ruleSuiteVersion: string;
  /** The reader ports this service composes (observability). */
  readonly ports: {
    readonly model: RulesModelReader;
    readonly evidence?: RulesEvidenceMappingReader;
    readonly readiness?: RulesReadinessReader;
  };
  /** Runs one rule evaluation (fail-closed; deterministic). */
  runRules(request: {
    readonly modelId: string;
    readonly version: number;
    readonly profile: RulesRunInput["profile"];
    readonly ruleset: RulesRunInput["ruleset"];
  }): RulesReport;
}

/** Options of the composed service. */
export interface BuildRulesServiceOptions {
  readonly modelReader: RulesModelReader;
  readonly evidenceReader?: RulesEvidenceMappingReader;
  readonly readinessReader?: RulesReadinessReader;
  readonly limits?: Partial<RulesLimits>;
}

/** Builds the composed rules service. */
export function buildRulesService(options: BuildRulesServiceOptions): RulesService {
  const limits: RulesLimits = { ...DEFAULT_RULES_LIMITS, ...options.limits };
  const ports = {
    model: options.modelReader,
    ...(options.evidenceReader !== undefined ? { evidence: options.evidenceReader } : {}),
    ...(options.readinessReader !== undefined ? { readiness: options.readinessReader } : {}),
  };
  return {
    kind: "rules",
    ruleSuiteVersion: RULE_SUITE_VERSION,
    ports,
    runRules({ modelId, version, profile, ruleset }) {
      try {
        const graph = options.modelReader.getModelGraph(modelId, version);
        if (graph === undefined) {
          throw new RulesError("MODEL_NOT_FOUND", `model ${modelId} has no version ${version}`, {
            details: { field: "version", value: `${modelId}@${version}` },
          });
        }
        const mapping = options.evidenceReader?.getMapping(graph.projectId);
        const readiness = options.readinessReader?.getReadiness(modelId, version);
        return runRuleEvaluation({
          graph,
          version,
          profile,
          ruleset,
          ...(mapping !== undefined ? { mapping } : {}),
          ...(readiness !== undefined ? { readiness } : {}),
          __limits: limits,
        });
      } catch (error) {
        throw error instanceof RulesError ? error : toRulesError(error, "rules run");
      }
    },
  };
}

/** Internal limits-carrying run input. */
interface LimitedRulesRunInput extends RulesRunInput {
  readonly __limits?: RulesLimits;
}

/**
 * The pure rule-evaluation entry: boundary validation, bounds,
 * deterministic evaluation, report assembly. Identical inputs
 * produce bit-identical reports.
 */
export function runRuleEvaluation(
  input: RulesRunInput & { readonly __limits?: RulesLimits },
): RulesReport {
  const limited = input as LimitedRulesRunInput;
  const limits = limited.__limits ?? DEFAULT_RULES_LIMITS;

  // Validate FIRST (fail-closed on content before fail-closed on
  // size — the graph/ruleset content is authoritative).
  const verified = validateRulesInput({
    graph: input.graph,
    version: input.version,
    profile: input.profile,
    ruleset: input.ruleset,
    ...(input.mapping !== undefined ? { mapping: input.mapping } : {}),
    ...(input.readiness !== undefined ? { readiness: input.readiness } : {}),
  });

  const { graph } = verified;
  if (graph.objects.length > limits.maxObjects) {
    throw new RulesError(
      "BOUNDS_EXCEEDED",
      `graph carries more objects than the rules limit: ${graph.objects.length} > ${limits.maxObjects}`,
    );
  }
  if (graph.spaces.length > limits.maxSpaces) {
    throw new RulesError(
      "BOUNDS_EXCEEDED",
      `graph carries more spaces than the rules limit: ${graph.spaces.length} > ${limits.maxSpaces}`,
    );
  }
  if (verified.ruleset.rules.length > limits.maxRules) {
    throw new RulesError(
      "BOUNDS_EXCEEDED",
      `rule set carries more rules than the limit: ${verified.ruleset.rules.length} > ${limits.maxRules}`,
    );
  }

  const { results } = evaluateRules(verified);

  return buildRulesReport({
    modelId: graph.modelId,
    projectId: graph.projectId,
    version: verified.version,
    profile: verified.profile,
    rulesetId: verified.ruleset.rulesetId,
    rulesetDigest: verified.ruleset.digest,
    modelDigest: graph.digest,
    ...(verified.mapping !== undefined ? { mappingDigest: verified.mapping.digest } : {}),
    results,
    ...(verified.readiness !== undefined ? { readiness: verified.readiness } : {}),
  });
}
