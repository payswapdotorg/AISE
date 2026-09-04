/**
 * The AISE-021 service boundary: validate every input before a
 * single rule runs (fail closed).
 *
 * The boundary does not trust the caller:
 *
 * - the graph is fully re-validated with the model layer's own
 *   `validateRealityGraph`, and its digest is re-derived and
 *   compared (a tampered graph never reaches the evaluators);
 * - the mapping, when present, is re-validated with the
 *   evidence layer's own `validateEvidenceGraph` and must
 *   belong to the same project;
 * - the readiness context, when present, is structurally
 *   validated (its content PINS are checked by the readiness
 *   gate during evaluation — a pin mismatch is an honest
 *   RULE_READINESS_STALE result, not an input error: the
 *   context is well-formed, it describes other content);
 * - the run profile must SATISFY the rule set's declared
 *   profile (no silent downgrade: a CRITICAL compliance set
 *   cannot run under LIGHT);
 * - the rule set itself is re-validated (construction
 *   validation re-run over its content — the caller cannot
 *   hand-craft a RuleSetLike that skips validation) and its
 *   digest is re-derived and compared.
 */
import {
  canonicalContentHash,
  graphContentDigest,
  validateEvidenceGraph,
  validateRealityGraph,
} from "@aise/engineering-model";
import { RulesError } from "./errors.js";
import type {
  ReadinessContextInput,
  RuleSetLike,
  RulesRunInput,
  RulesVerifiedInput,
} from "./inputs.js";
import { ruleSet as constructRuleSet, type RuleSet } from "./rule.js";
import { RULE_PROFILES } from "./vocabulary.js";

/** Validates the run input at the service boundary (fail closed). */
export function validateRulesInput(input: RulesRunInput): RulesVerifiedInput {
  if (input === null || typeof input !== "object") {
    throw new RulesError("RULES_INPUT_INVALID", "rules run input must be an object");
  }

  if (input.graph === undefined || input.graph === null) {
    throw new RulesError("RULES_INPUT_INVALID", "rules run input requires a graph", {
      details: { field: "graph", value: "absent" },
    });
  }

  if (!RULE_PROFILES.includes(input.profile)) {
    throw new RulesError(
      "RULES_INPUT_INVALID",
      `unknown assurance profile: ${String(input.profile)}`,
      { details: { field: "profile", value: String(input.profile) } },
    );
  }

  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new RulesError(
      "RULES_INPUT_INVALID",
      `version must be an integer ≥ 1: ${String(input.version)}`,
      { details: { field: "version", value: String(input.version) } },
    );
  }

  // --- Graph boundary ------------------------------------------------------
  try {
    validateRealityGraph(input.graph);
  } catch (error) {
    throw new RulesError(
      "GRAPH_INVALID",
      `the graph failed boundary validation: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error, details: { field: "graph", value: input.graph.modelId } },
    );
  }

  const expectedDigest = graphContentDigest(
    input.graph.modelId,
    input.graph.projectId,
    input.graph.spaces,
    input.graph.objects,
    input.graph.relationships,
  );
  if (input.graph.digest !== expectedDigest) {
    throw new RulesError("GRAPH_INVALID", "graph digest does not match its content", {
      details: { field: "digest", value: String(input.graph.digest), expected: expectedDigest },
    });
  }

  // --- Rule-set boundary (re-validation + digest re-derivation) ------------
  const ruleset = revalidateRuleSet(input.ruleset);
  if (ruleset.profile !== input.profile && !profileSatisfies(input.profile, ruleset.profile)) {
    throw new RulesError(
      "RULES_INPUT_INVALID",
      `run profile ${input.profile} is below the rule set's declared profile ${ruleset.profile} (no silent downgrade)`,
      { details: { field: "profile", value: input.profile, rulesetProfile: ruleset.profile } },
    );
  }

  // --- Mapping boundary ----------------------------------------------------
  if (input.mapping !== undefined) {
    if (input.mapping.projectId !== input.graph.projectId) {
      throw new RulesError("MAPPING_INVALID", "the mapping belongs to a different project", {
        details: {
          field: "mapping.projectId",
          value: String(input.mapping.projectId),
          expected: input.graph.projectId,
        },
      });
    }
    try {
      validateEvidenceGraph(input.mapping);
    } catch (error) {
      throw new RulesError(
        "MAPPING_INVALID",
        `the evidence mapping failed boundary validation: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error, details: { field: "mapping", value: input.mapping.projectId } },
      );
    }
  }

  // --- Readiness context boundary (structural only) -------------------------
  if (input.readiness !== undefined) {
    validateReadinessContext(input.readiness);
  }

  return {
    graph: input.graph,
    version: input.version,
    profile: input.profile,
    ruleset,
    ...(input.mapping !== undefined ? { mapping: input.mapping } : {}),
    ...(input.readiness !== undefined ? { readiness: input.readiness } : {}),
    hasMapping: input.mapping !== undefined,
    hasReadiness: input.readiness !== undefined,
  };
}

/** Rank order (LIGHT < STANDARD < HIGH_ASSURANCE < CRITICAL). */
function profileSatisfies(run: string, demanded: string): boolean {
  return RULE_PROFILES.indexOf(run as never) >= RULE_PROFILES.indexOf(demanded as never);
}

/**
 * Re-validates a caller-supplied rule set: construction
 * validation is re-run over its content and the digest is
 * re-derived. A hand-crafted object that skips validation or
 * pins a foreign digest never reaches the evaluators.
 */
function revalidateRuleSet(callerSet: RuleSetLike): RuleSet {
  if (callerSet === null || typeof callerSet !== "object") {
    throw new RulesError("RULES_INPUT_INVALID", "rules run input requires a rule set");
  }
  // Re-run the full construction validation over the content.
  const rebuilt = constructRuleSet({
    rulesetId: callerSet.rulesetId,
    profile: callerSet.profile,
    ...(callerSet.readinessGate !== undefined ? { readinessGate: callerSet.readinessGate } : {}),
    rules: callerSet.rules as never[],
  });
  if (rebuilt.digest !== callerSet.digest) {
    throw new RulesError("RULES_INPUT_INVALID", "rule set digest does not match its content", {
      details: { field: "ruleset.digest", value: String(callerSet.digest), expected: rebuilt.digest },
    });
  }
  return rebuilt;
}

/** Structural validation of the readiness context record. */
export function validateReadinessContext(context: ReadinessContextInput): void {
  if (context === null || typeof context !== "object") {
    throw new RulesError("CONTEXT_INVALID", "readiness context must be an object");
  }
  if (typeof context.taskId !== "string" || context.taskId.length === 0) {
    throw new RulesError("CONTEXT_INVALID", "readiness context taskId must be a non-empty string", {
      details: { field: "taskId", value: String(context.taskId) } },
    );
  }
  if (context.verdict !== "READY" && context.verdict !== "NOT_READY") {
    throw new RulesError("CONTEXT_INVALID", `readiness context verdict is invalid: ${String(context.verdict)}`, {
      details: { field: "verdict", value: String(context.verdict) },
    });
  }
  if (!RULE_PROFILES.includes(context.assuranceProfile)) {
    throw new RulesError("CONTEXT_INVALID", `readiness context profile is invalid: ${String(context.assuranceProfile)}`, {
      details: { field: "assuranceProfile", value: String(context.assuranceProfile) },
    });
  }
  if (typeof context.modelId !== "string" || context.modelId.length === 0) {
    throw new RulesError("CONTEXT_INVALID", "readiness context modelId must be a non-empty string", {
      details: { field: "modelId", value: String(context.modelId) } },
    );
  }
  if (!Number.isInteger(context.version) || context.version < 1) {
    throw new RulesError("CONTEXT_INVALID", `readiness context version must be an integer ≥ 1: ${String(context.version)}`, {
      details: { field: "version", value: String(context.version) },
    });
  }
  if (typeof context.graphDigest !== "string" || !/^[0-9a-f]{64}$/.test(context.graphDigest)) {
    throw new RulesError("CONTEXT_INVALID", "readiness context graphDigest must be a 64-hex hash", {
      details: { field: "graphDigest", value: String(context.graphDigest) },
    });
  }
  if (typeof context.mappingDigest !== "string" || !/^[0-9a-f]{64}$/.test(context.mappingDigest)) {
    throw new RulesError("CONTEXT_INVALID", "readiness context mappingDigest must be a 64-hex hash", {
      details: { field: "mappingDigest", value: String(context.mappingDigest) },
    });
  }
}

/** Deterministic digest helper re-export for report assembly (canonical pinning). */
export function canonicalSetDigest(content: unknown): string {
  return canonicalContentHash(content);
}
