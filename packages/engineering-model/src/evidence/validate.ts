/**
 * Whole-graph validation for the evidence mapping (AISE-012).
 *
 * `validateEvidenceGraph` re-validates a complete assembled
 * mapping — every invariant `assembleEvidenceGraph` enforces on
 * the producing path. Its purpose is the PERSISTENCE BOUNDARY
 * (the AISE-008 lesson, hardened in PR #9's review): the store
 * does not trust the caller; a mapping presented as a snapshot
 * is fully re-validated before it is trusted or re-indexed. A
 * tampered, thawed, or digest-forged mapping never passes.
 *
 * The check is exact: the graph's content is re-assembled from
 * scratch and must produce the SAME canonical digest — anything
 * else (reordering, field drift, a forged digest) fails closed.
 */
import { EvidenceError } from "./errors.js";
import { assembleEvidenceGraph, type EvidenceGraph } from "./graph.js";

/**
 * Fail-closed whole-graph validation (the persistence-boundary
 * gate): shape, immutability proof, full event re-validation,
 * and digest identity with a from-scratch re-assembly.
 */
export function validateEvidenceGraph(graph: EvidenceGraph): void {
  if (graph === null || typeof graph !== "object") {
    throw new EvidenceError("MAPPING_INVALID", "evidence graph must be an object", {
      details: { field: "graph", value: typeof graph },
    });
  }
  const { projectId, records, evidenceRetractions, links, linkRetractions, digest } = graph;
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new EvidenceError("MAPPING_INVALID", "graph.projectId must be a non-empty string", {
      details: { field: "projectId", value: String(projectId) },
    });
  }
  if (
    !Array.isArray(records) ||
    !Array.isArray(evidenceRetractions) ||
    !Array.isArray(links) ||
    !Array.isArray(linkRetractions)
  ) {
    throw new EvidenceError("MAPPING_INVALID", "graph content fields must be arrays", {
      details: { field: "graph" },
    });
  }
  if (typeof digest !== "string" || digest.length === 0) {
    throw new EvidenceError("MAPPING_INVALID", "graph.digest must be a non-empty string", {
      details: { field: "digest", value: String(digest) },
    });
  }

  // Immutability: assembled graphs are deep-frozen by construction.
  if (
    !Object.isFrozen(graph) ||
    !Object.isFrozen(records) ||
    !Object.isFrozen(evidenceRetractions) ||
    !Object.isFrozen(links) ||
    !Object.isFrozen(linkRetractions)
  ) {
    throw new EvidenceError("MAPPING_INVALID", "graph content must be frozen (immutable by construction)", {
      details: { field: "graph", value: "not-frozen" },
    });
  }

  // Exact re-assembly: same content must produce the same digest.
  const reassembled = assembleEvidenceGraph({
    projectId,
    records,
    evidenceRetractions,
    links,
    linkRetractions,
  });
  if (reassembled.digest !== digest) {
    throw new EvidenceError("MAPPING_INVALID", `graph digest mismatch: expected ${reassembled.digest}, found ${digest}`, {
      details: { field: "digest", value: digest, expected: reassembled.digest },
    });
  }
}
