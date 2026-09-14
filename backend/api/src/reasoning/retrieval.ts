/**
 * AISE-029 — Engineering Reasoning gateway: the deterministic RETRIEVAL /
 * TOOL layer.
 *
 * `RetrievalAdapter` is the provider-neutral TOOL PORT: search and filter
 * over the CALLER-SUPPLIED `GroundedContext` — deterministic, pure, no I/O,
 * no clock, no randomness. The default `GroundedRetrieval` implementation
 * is array filtering/sorting with ID-SORTED determinism: the same context
 * (in any input order) always yields the same, canonically ordered results.
 *
 * HONESTY IS THE CONTRACT: retrieval NEVER fabricates. What the context
 * lacks is returned as an honest ABSENT — `null` for single lookups, an
 * EMPTY array for searches — never a placeholder record, never a guess.
 * Invalidated evidence is still RETURNED (with its invalidation state
 * visible) by the neutral searches (`findEvidenceForNode`); callers that
 * need claim-support use `validEvidenceForNode`, and `resolveCitation`
 * reports invalidated evidence as the distinct state "invalidated" so the
 * gateway can reject claims that cite it.
 *
 * This layer also owns the citation RESOLUTION and σ-SOURCE tools the
 * gateway's contract post-validation uses: `resolveCitation` answers
 * whether a citation is a verbatim reference to something INSIDE the
 * supplied context, and `uncertaintySourcesAt` enumerates the (σ, unit)
 * pairs available at a cited target — the basis of the fabrication gate
 * (a claim's σ must exist among its cited sources). It also exports the
 * deterministic WORD-BOUNDARY text matcher shared by the policy gate and
 * the reference providers' question resolution.
 *
 * Read-only type imports only: the finding/observation/node shapes belong
 * to AISE-023 / AISE-025 / AISE-016. Foreign vocabularies are compared by
 * membership only (form validation is the owning authority's duty).
 */

import type {
  ClaimCitation,
  Finding,
  GroundedCase,
  GroundedContext,
  GroundedEvidenceRecord,
  GroundedNode,
  Observation,
} from "./model";

/* ------------------------------------------------------------------ */
/* Port                                                                 */
/* ------------------------------------------------------------------ */

/** One (σ, unit) pair available at a cited source (see header). */
export interface UncertaintySource {
  readonly sigma: number;
  readonly unit: string;
}

/** Citation resolution outcome (see header: absent ≠ invalidated). */
export type CitationResolution = "resolved" | "absent" | "invalidated";

/**
 * The deterministic retrieval/tool port over a supplied context. Stateless:
 * every operation takes the context it operates on — an adapter NEVER
 * holds store state or performs I/O.
 */
export interface RetrievalAdapter {
  /** All graph nodes, id-sorted. */
  nodes(context: GroundedContext): readonly GroundedNode[];
  /** One node by id, or null when ABSENT (honest absence). */
  node(context: GroundedContext, nodeId: string): GroundedNode | null;
  /** All cases, caseId-sorted. */
  cases(context: GroundedContext): readonly GroundedCase[];
  /** One case by id, or null when absent. */
  caseById(context: GroundedContext, caseId: string): GroundedCase | null;
  /** Evidence linked to a node (invalidation state visible), contentId-sorted. */
  findEvidenceForNode(context: GroundedContext, nodeId: string): readonly GroundedEvidenceRecord[];
  /** Evidence linked to a node AND not invalidated, contentId-sorted. */
  validEvidenceForNode(context: GroundedContext, nodeId: string): readonly GroundedEvidenceRecord[];
  /** One evidence record by content id, or null when absent. */
  evidenceByContentId(context: GroundedContext, contentId: string): GroundedEvidenceRecord | null;
  /** Findings whose subjectNodeIds include the node, code→subjects→message-sorted. */
  findFindingsForNode(context: GroundedContext, nodeId: string): readonly Finding[];
  /** A case's observations, observationId-sorted. */
  observationsForCase(context: GroundedContext, caseId: string): readonly Observation[];
  /**
   * Resolve a citation against the supplied context: "resolved" (verbatim
   * reference to something inside it), "absent" (references nothing in it)
   * or "invalidated" (resolves to an invalidated evidence record).
   */
  resolveCitation(context: GroundedContext, citation: ClaimCitation): CitationResolution;
  /**
   * The (σ, unit) pairs available at a cited target: property σ for a graph
   * node, measurement σ for evidence; findings and observations carry none
   * (observations reference measurements by id only — AISE-025 discipline).
   */
  uncertaintySourcesAt(context: GroundedContext, citation: ClaimCitation): readonly UncertaintySource[];
}

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                                */
/* ------------------------------------------------------------------ */

function byId<T>(key: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deterministic WORD-BOUNDARY, case-insensitive containment: true iff the
 * phrase appears in the question delimited by non-alphanumerics (the
 * AISE-017 lesson — "roof" never fires inside "waterproofing"). Shared by
 * the policy gate (forbidden topics) and question resolution.
 */
export function questionMentionsPhrase(question: string, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (trimmed.length === 0) {
    return false;
  }
  const pattern = new RegExp(
    `(^|[^0-9a-z])${escapeRegExp(trimmed.toLowerCase())}([^0-9a-z]|$)`,
  );
  return pattern.test(question.toLowerCase());
}

/** The label-lookup convention shared with callers (string "label" value). */
export function labelOfNode(node: GroundedNode): string | null {
  for (const property of node.properties) {
    if (property.key === "label" && typeof property.value === "string") {
      return property.value;
    }
  }
  return null;
}

/**
 * The default deterministic retrieval toolset (PURE array
 * filtering/sorting; no state, no I/O). Create one per context or reuse —
 * behavior is identical. `createGroundedRetrieval()` is also the
 * constructor-less functional form: every tool below is exported as a pure
 * function and the adapter object simply binds them.
 */
export const GroundedRetrieval: RetrievalAdapter = {
  nodes: (context) => [...context.graphSnapshot.nodes].sort(byId((n) => n.nodeId)),

  node: (context, nodeId) =>
    context.graphSnapshot.nodes.find((n) => n.nodeId === nodeId) ?? null,

  cases: (context) => [...context.cases].sort(byId((c) => c.caseId)),

  caseById: (context, caseId) => context.cases.find((c) => c.caseId === caseId) ?? null,

  findEvidenceForNode: (context, nodeId) =>
    context.evidenceRecords
      .filter((record) => record.linkedNodeIds.includes(nodeId))
      .sort(byId((record) => record.contentId)),

  validEvidenceForNode: (context, nodeId) =>
    context.evidenceRecords
      .filter((record) => !record.invalidated && record.linkedNodeIds.includes(nodeId))
      .sort(byId((record) => record.contentId)),

  evidenceByContentId: (context, contentId) =>
    context.evidenceRecords.find((record) => record.contentId === contentId) ?? null,

  findFindingsForNode: (context, nodeId) =>
    context.verificationFindings
      .filter((finding) => finding.subjectNodeIds.includes(nodeId))
      .sort(
        (a, b) =>
          a.code < b.code
            ? -1
            : a.code > b.code
              ? 1
              : a.subjectNodeIds.join(",") < b.subjectNodeIds.join(",")
                ? -1
                : a.subjectNodeIds.join(",") > b.subjectNodeIds.join(",")
                  ? 1
                  : a.message < b.message
                    ? -1
                    : a.message > b.message
                      ? 1
                      : 0,
      ),

  observationsForCase: (context, caseId) => {
    const found = context.cases.find((c) => c.caseId === caseId);
    return found === undefined
      ? []
      : [...found.observations].sort(byId((o) => o.observationId));
  },

  resolveCitation: (context, citation) => {
    switch (citation.kind) {
      case "evidence": {
        const record = context.evidenceRecords.find(
          (candidate) => candidate.contentId === citation.contentId,
        );
        if (record === undefined) {
          return "absent";
        }
        return record.invalidated ? "invalidated" : "resolved";
      }
      case "graph_node": {
        const node = context.graphSnapshot.nodes.find(
          (candidate) => candidate.nodeId === citation.nodeId,
        );
        return node === undefined ? "absent" : "resolved";
      }
      case "finding": {
        const found = context.verificationFindings.some(
          (finding) =>
            finding.code === citation.findingCode &&
            finding.subjectNodeIds.includes(citation.subjectNodeId),
        );
        return found ? "resolved" : "absent";
      }
      case "case_observation": {
        const found = context.cases.some(
          (c) =>
            c.caseId === citation.caseId &&
            c.observations.some((o) => o.observationId === citation.observationId),
        );
        return found ? "resolved" : "absent";
      }
    }
  },

  uncertaintySourcesAt: (context, citation) => {
    switch (citation.kind) {
      case "evidence": {
        const record = context.evidenceRecords.find(
          (candidate) => candidate.contentId === citation.contentId,
        );
        if (record === undefined || record.measurement === undefined) {
          return [];
        }
        return record.measurement.sigma === undefined
          ? []
          : [{ sigma: record.measurement.sigma, unit: record.measurement.unit }];
      }
      case "graph_node": {
        const node = context.graphSnapshot.nodes.find(
          (candidate) => candidate.nodeId === citation.nodeId,
        );
        if (node === undefined) {
          return [];
        }
        const sources: UncertaintySource[] = [];
        for (const property of node.properties) {
          if (
            property.uncertainty !== undefined &&
            typeof property.value === "number" &&
            property.unit !== undefined
          ) {
            sources.push({ sigma: property.uncertainty.sigma, unit: property.unit });
          }
        }
        return sources;
      }
      case "finding":
      case "case_observation":
        return [];
    }
  },
};

/** The default adapter factory (identical to using GroundedRetrieval). */
export function createGroundedRetrieval(): RetrievalAdapter {
  return GroundedRetrieval;
}
