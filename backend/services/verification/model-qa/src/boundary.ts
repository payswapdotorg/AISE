/**
 * The AISE-014 service boundary: validate every model/evidence
 * input before a single check runs (fail closed).
 *
 * The boundary does not trust the caller:
 *
 * - the graph is fully re-validated with the model layer's own
 *   `validateRealityGraph` (identity re-derivation, referential
 *   integrity, hierarchy, digest re-derivation, immutability) —
 *   a tampered or thawed graph never reaches the checks;
 * - the graph digest is additionally re-derived and compared
 *   (defense in depth: the same content pin the store enforces);
 * - the mapping, when present, is re-validated with the evidence
 *   layer's own `validateEvidenceGraph`;
 * - the readiness context, when present, is structurally
 *   validated (its digest PIN is checked against observed
 *   content by the epistemic checks — a boundary-level check
 *   would be circular, since the pin mismatch is itself a QA
 *   finding, not an input error);
 * - profile and version are validated against the frozen
 *   vocabulary.
 *
 * Layering note (documented honestly): `validateRealityGraph`
 * does NOT validate object geometry — the AISE-011 boundary
 * validates graph structure and assertions, and geometry is
 * validated at object construction on the producing path. The
 * QA geometry checks therefore run the model's own
 * `structuredPlanarGeometry`/`geometryAssetRef` constructors as
 * validators over committed content: structurally invalid
 * geometry that reached a stored graph is a first-line
 * GEOMETRY_INVALID finding (CONTRADICTION), not an input error —
 * the graph is well-formed as a graph; its geometry content is
 * contradictory as engineering content.
 */
import {
  graphContentDigest,
  validateEvidenceGraph,
  validateRealityGraph,
} from "@aise/engineering-model";
import { ModelQaError } from "./errors.js";
import type { QaRunInput, QaVerifiedInput, ReadinessContextInput } from "./inputs.js";
import { QA_PROFILES } from "./vocabulary.js";

/** Validates the run input at the service boundary (fail closed). */
export function validateQaInput(input: QaRunInput): QaVerifiedInput {
  if (input === null || typeof input !== "object") {
    throw new ModelQaError("QA_INPUT_INVALID", "QA run input must be an object");
  }

  if (input.graph === undefined || input.graph === null) {
    throw new ModelQaError("QA_INPUT_INVALID", "QA run input requires a graph", {
      details: { field: "graph", value: "absent" },
    });
  }

  if (!QA_PROFILES.includes(input.profile)) {
    throw new ModelQaError("QA_INPUT_INVALID", `unknown assurance profile: ${String(input.profile)}`, {
      details: { field: "profile", value: String(input.profile) },
    });
  }

  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new ModelQaError("QA_INPUT_INVALID", `version must be an integer ≥ 1: ${String(input.version)}`, {
      details: { field: "version", value: String(input.version) },
    });
  }

  // --- Graph boundary -----------------------------------------------------
  try {
    validateRealityGraph(input.graph);
  } catch (error) {
    throw new ModelQaError(
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
    throw new ModelQaError("GRAPH_INVALID", "graph digest does not match its content", {
      details: { field: "digest", value: String(input.graph.digest), expected: expectedDigest },
    });
  }

  // --- Mapping boundary ----------------------------------------------------
  if (input.mapping !== undefined) {
    if (input.mapping.projectId !== input.graph.projectId) {
      throw new ModelQaError("MAPPING_INVALID", "the mapping belongs to a different project", {
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
      throw new ModelQaError(
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
    ...(input.mapping !== undefined ? { mapping: input.mapping } : {}),
    ...(input.readiness !== undefined ? { readiness: input.readiness } : {}),
    hasMapping: input.mapping !== undefined,
    hasReadiness: input.readiness !== undefined,
  };
}

/** Structural validation of the readiness context record. */
function validateReadinessContext(context: ReadinessContextInput): void {
  if (context === null || typeof context !== "object") {
    throw new ModelQaError("CONTEXT_INVALID", "readiness context must be an object");
  }
  if (typeof context.taskId !== "string" || context.taskId.length === 0) {
    throw new ModelQaError("CONTEXT_INVALID", "readiness context taskId must be a non-empty string", {
      details: { field: "taskId", value: String(context.taskId) },
    });
  }
  if (context.verdict !== "READY" && context.verdict !== "NOT_READY") {
    throw new ModelQaError("CONTEXT_INVALID", `readiness context verdict is invalid: ${String(context.verdict)}`, {
      details: { field: "verdict", value: String(context.verdict) },
    });
  }
  if (!QA_PROFILES.includes(context.assuranceProfile)) {
    throw new ModelQaError("CONTEXT_INVALID", `readiness context profile is invalid: ${String(context.assuranceProfile)}`, {
      details: { field: "assuranceProfile", value: String(context.assuranceProfile) },
    });
  }
  if (typeof context.modelId !== "string" || context.modelId.length === 0) {
    throw new ModelQaError("CONTEXT_INVALID", "readiness context modelId must be a non-empty string", {
      details: { field: "modelId", value: String(context.modelId) },
    });
  }
  if (!Number.isInteger(context.version) || context.version < 1) {
    throw new ModelQaError("CONTEXT_INVALID", `readiness context version must be an integer ≥ 1: ${String(context.version)}`, {
      details: { field: "version", value: String(context.version) },
    });
  }
  if (typeof context.graphDigest !== "string" || !/^[0-9a-f]{64}$/.test(context.graphDigest)) {
    throw new ModelQaError("CONTEXT_INVALID", "readiness context graphDigest must be a 64-hex hash", {
      details: { field: "graphDigest", value: String(context.graphDigest) },
    });
  }
  if (typeof context.mappingDigest !== "string" || !/^[0-9a-f]{64}$/.test(context.mappingDigest)) {
    throw new ModelQaError("CONTEXT_INVALID", "readiness context mappingDigest must be a 64-hex hash", {
      details: { field: "mappingDigest", value: String(context.mappingDigest) },
    });
  }
}
