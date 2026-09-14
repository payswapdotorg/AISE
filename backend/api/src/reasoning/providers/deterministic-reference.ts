/**
 * AISE-029 — the DETERMINISTIC REFERENCE provider.
 *
 * A rule-based "reasoner" — NOT AN LLM, and the descriptor says so honestly
 * (`providerKind: "deterministic-reference"`). It answers from the
 * CALLER-SUPPLIED grounding context by direct lookup and templating:
 *
 *  - It produces claims ONLY when the grounding supports them: every claim
 *    cites the verbatim node/finding/observation it restates plus the VALID
 *    evidence records behind it (citations computed from actual context
 *    content, never invented).
 *  - It refuses with INSUFFICIENT_EVIDENCE when the grounding lacks support
 *    (no such property; no valid evidence behind a property; an
 *    observation's evidence absent/invalidated) and UNGROUNDED_QUESTION
 *    when the question names nothing in the context. The refusal detail
 *    always names what is missing.
 *  - Uncertainty honesty: σ is PROPAGATED VERBATIM from cited sources
 *    (property σ / evidence-measurement σ; the maximum of them — see
 *    internal.ts) or honestly UNKNOWN. Hypothesis restatements carry
 *    UNKNOWN — advisory confidence is never measurement uncertainty
 *    (AISE-025 discipline).
 *  - Epistemic discipline: every claim is INFERRED, except restatements of
 *    PROPOSED properties/hypotheses which are PROPOSED. A claim NEVER
 *    carries OBSERVED/CONFIRMED — those statuses stay on the cited sources.
 *
 * DETERMINISM: pure functions over the supplied context; no clock, no
 * randomness, no I/O; claim ids are content-derived (model.ts). The same
 * query always yields a byte-identical completion. maxClaims is enforced
 * by the GATEWAY (single authority for that policy field), never here.
 *
 * SCOPE (honest): question routing is keyword-conventional (question.ts)
 * and claim texts are fixed templates — richer natural-language
 * understanding is what future "llm-adapter" providers are for; the
 * CONTRACT (citations, refusal, uncertainty) is what this provider proves.
 */

import type {
  ClaimCitation,
  ProviderCompletion,
  ReasoningClaim,
  ReasoningProvider,
  ReasoningQuery,
  Refusal,
} from "../model";
import { GroundedRetrieval } from "../retrieval";
import { resolveQuestion } from "./question";
import {
  displayName,
  evidenceCitations,
  evidenceSigmaCandidates,
  formatPropertyValue,
  insufficient,
  makeClaim,
  maxSigma,
  propertySigmaCandidates,
  citationTuple,
  validEvidenceForObservation,
  validEvidenceForProperty,
} from "./internal";

/** Honest identity: this provider is rule-based, not an LLM. */
export const DETERMINISTIC_REFERENCE_PROVIDER_ID = "reasoning-deterministic-reference";

const UNGROUNDED_NODE_DETAIL =
  "no node of the supplied context is named in the question (matched by node id or label)";

/* ------------------------------------------------------------------ */
/* Property family                                                      */
/* ------------------------------------------------------------------ */

function propertyCompletion(query: ReasoningQuery): ProviderCompletion {
  const resolution = resolveQuestion(query.context, query.question);
  const claims: ReasoningClaim[] = [];
  const refusals: Refusal[] = [];

  if (resolution.nodes.length === 0) {
    return {
      kind: "completed",
      claims,
      refusals: [{ code: "UNGROUNDED_QUESTION", detail: UNGROUNDED_NODE_DETAIL }],
    };
  }

  for (const node of resolution.nodes) {
    const modeledKeys = node.properties.map((p) => p.key).sort();
    if (resolution.propertyKeys.length === 0) {
      refusals.push(
        insufficient(
          `question does not name a property of node '${displayName(node)}' (modeled keys: ${modeledKeys.join(", ")})`,
        ),
      );
      continue;
    }
    const presentKeys = resolution.propertyKeys.filter((key) => modeledKeys.includes(key));
    if (presentKeys.length === 0) {
      refusals.push(
        insufficient(
          `node '${displayName(node)}' does not carry property '${resolution.propertyKeys.join("', '")}' (modeled keys: ${modeledKeys.join(", ")})`,
        ),
      );
      continue;
    }
    const properties = node.properties
      .filter((p) => presentKeys.includes(p.key))
      .sort((a, b) => (a.key < b.key ? -1 : 1));
    for (const property of properties) {
      const evidence = validEvidenceForProperty(query, node, property);
      if (evidence.length === 0 && query.policy.refuseOnUnverifiable) {
        refusals.push(
          insufficient(
            `no valid evidence record supports property '${property.key}' of node '${displayName(node)}' in the supplied context`,
          ),
        );
        continue;
      }
      const citations: ClaimCitation[] = [
        { kind: "graph_node", nodeId: node.nodeId },
        ...evidenceCitations(evidence),
      ];
      if (citations.length < query.policy.requiredCitationsPerClaim) {
        refusals.push(
          insufficient(
            `property '${property.key}' of node '${displayName(node)}' has ${citations.length} grounding citation${citations.length === 1 ? "" : "s"}; policy requires at least ${query.policy.requiredCitationsPerClaim}`,
          ),
        );
        continue;
      }
      claims.push(
        makeClaim(
          `Node '${displayName(node)}' asserts property '${property.key}' = ${formatPropertyValue(property)}.`,
          citationTuple(citations),
          property.epistemicStatus === "PROPOSED" ? "PROPOSED" : "INFERRED",
          maxSigma(propertySigmaCandidates(property, evidence)),
        ),
      );
    }
  }

  return { kind: "completed", claims, refusals };
}

/* ------------------------------------------------------------------ */
/* Findings family                                                      */
/* ------------------------------------------------------------------ */

function findingsCompletion(query: ReasoningQuery): ProviderCompletion {
  const resolution = resolveQuestion(query.context, query.question);
  const claims: ReasoningClaim[] = [];
  const refusals: Refusal[] = [];

  if (resolution.nodes.length === 0) {
    return {
      kind: "completed",
      claims,
      refusals: [{ code: "UNGROUNDED_QUESTION", detail: UNGROUNDED_NODE_DETAIL }],
    };
  }

  for (const node of resolution.nodes) {
    const findings = GroundedRetrieval.findFindingsForNode(query.context, node.nodeId);
    if (findings.length === 0) {
      refusals.push(
        insufficient(
          `no verification finding references node '${displayName(node)}' in the supplied context`,
        ),
      );
      continue;
    }
    for (const finding of findings) {
      const citations: ClaimCitation[] = [
        { kind: "finding", findingCode: finding.code, subjectNodeId: node.nodeId },
        { kind: "graph_node", nodeId: node.nodeId },
      ];
      if (citations.length < query.policy.requiredCitationsPerClaim) {
        refusals.push(
          insufficient(
            `finding '${finding.code}' on node '${displayName(node)}' has ${citations.length} grounding citations; policy requires at least ${query.policy.requiredCitationsPerClaim}`,
          ),
        );
        continue;
      }
      claims.push(
        makeClaim(
          `Node '${displayName(node)}' carries ${finding.severity} finding ${finding.code}: ${finding.message}`,
          citationTuple(citations),
          "INFERRED",
          { kind: "UNKNOWN" },
        ),
      );
    }
  }

  return { kind: "completed", claims, refusals };
}

/* ------------------------------------------------------------------ */
/* Case family                                                          */
/* ------------------------------------------------------------------ */

function caseCompletion(query: ReasoningQuery): ProviderCompletion {
  const resolution = resolveQuestion(query.context, query.question);
  const claims: ReasoningClaim[] = [];
  const refusals: Refusal[] = [];

  if (resolution.cases.length === 0) {
    return {
      kind: "completed",
      claims,
      refusals: [
        { code: "UNGROUNDED_QUESTION", detail: "no case of the supplied context is named in the question" },
      ],
    };
  }

  for (const c of resolution.cases) {
    const observations = GroundedRetrieval.observationsForCase(query.context, c.caseId);
    for (const observation of observations) {
      const validEvidence = validEvidenceForObservation(query, observation);
      const ungrounded = observation.evidenceIds.filter(
        (contentId) => !validEvidence.some((record) => record.contentId === contentId),
      );
      if (query.policy.refuseOnUnverifiable && ungrounded.length > 0) {
        refusals.push(
          insufficient(
            `observation '${observation.observationId}' of case '${c.caseId}' cites evidence with no valid record in the supplied context: ${ungrounded.join(", ")}`,
          ),
        );
        continue;
      }
      const citations: ClaimCitation[] = [
        { kind: "case_observation", caseId: c.caseId, observationId: observation.observationId },
        ...evidenceCitations(validEvidence),
      ];
      if (citations.length < query.policy.requiredCitationsPerClaim) {
        refusals.push(
          insufficient(
            `observation '${observation.observationId}' of case '${c.caseId}' has ${citations.length} grounding citations; policy requires at least ${query.policy.requiredCitationsPerClaim}`,
          ),
        );
        continue;
      }
      claims.push(
        makeClaim(
          `Case '${c.caseId}' records the observation: "${observation.statement}"`,
          citationTuple(citations),
          "INFERRED",
          maxSigma(evidenceSigmaCandidates(validEvidence)),
        ),
      );
    }

    const hypotheses = [...c.hypotheses].sort((a, b) =>
      a.hypothesisId < b.hypothesisId ? -1 : 1,
    );
    for (const hypothesis of hypotheses) {
      const citations: ClaimCitation[] = hypothesis.supportingObservationIds
        .map((observationId) => {
          const observation = c.observations.find(
            (candidate) => candidate.observationId === observationId,
          );
          return observation === undefined
            ? null
            : ({ kind: "case_observation", caseId: c.caseId, observationId } as ClaimCitation);
        })
        .filter((citation): citation is ClaimCitation => citation !== null);
      if (citations.length === 0) {
        refusals.push(
          insufficient(
            `hypothesis '${hypothesis.hypothesisId}' of case '${c.caseId}' has no supporting observation in the supplied context`,
          ),
        );
        continue;
      }
      if (citations.length < query.policy.requiredCitationsPerClaim) {
        refusals.push(
          insufficient(
            `hypothesis '${hypothesis.hypothesisId}' of case '${c.caseId}' has ${citations.length} grounding citations; policy requires at least ${query.policy.requiredCitationsPerClaim}`,
          ),
        );
        continue;
      }
      claims.push(
        makeClaim(
          `Case '${c.caseId}' records the ${hypothesis.epistemicStatus} hypothesis: "${hypothesis.statement}"`,
          citationTuple(citations),
          hypothesis.epistemicStatus,
          { kind: "UNKNOWN" },
        ),
      );
    }
  }

  return { kind: "completed", claims, refusals };
}

/* ------------------------------------------------------------------ */
/* Provider                                                             */
/* ------------------------------------------------------------------ */

/**
 * Create the deterministic reference provider (rule-based lookup and
 * templating over the supplied grounding context — NOT an LLM).
 */
export function createDeterministicReferenceProvider(): ReasoningProvider {
  return {
    descriptor: {
      providerId: DETERMINISTIC_REFERENCE_PROVIDER_ID,
      providerKind: "deterministic-reference",
    },
    complete: async (query: ReasoningQuery): Promise<ProviderCompletion> => {
      const resolution = resolveQuestion(query.context, query.question);
      if (resolution.family === "findings") {
        return findingsCompletion(query);
      }
      if (resolution.family === "case") {
        return caseCompletion(query);
      }
      return propertyCompletion(query);
    },
  };
}
