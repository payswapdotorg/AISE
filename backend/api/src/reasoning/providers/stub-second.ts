/**
 * AISE-029 — the SECOND deterministic (stub) provider.
 *
 * A second rule-based provider with deliberately MORE CONSERVATIVE claim
 * thresholds, proving the OUTPUT CONTRACT is identical across providers:
 * same schema, same refusal vocabulary, same citation kinds, same honesty
 * rules — the provider's identity affects CONTENT QUALITY, never the
 * canonical shape (R16 acceptance: "no provider-specific semantics become
 * canonical"). The descriptor says honestly what it is
 * (`providerKind: "deterministic-conservative"` — NOT an LLM).
 *
 * The conservative thresholds (documented, deterministic):
 *  - Property claims require a MEASURED numeric property (declared σ) with
 *    at least one valid supporting evidence record — an unmeasured or
 *    unverified property is refused INSUFFICIENT_EVIDENCE (the first
 *    provider would answer unmeasured model values when policy permits).
 *  - Only ERROR-severity verification findings are claimed; warning-level
 *    findings are refused (suspects, not deterministic violations).
 *  - Case observations are claimed only when EVERY cited evidence id
 *    resolves to a valid record; hypotheses only with at least TWO
 *    supporting observations (a single observation is too thin to forward
 *    as even a proposal).
 */

import type {
  ClaimCitation,
  GroundedProperty,
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

/** Honest identity: rule-based, conservative, not an LLM. */
export const STUB_SECOND_PROVIDER_ID = "reasoning-stub-second";

const UNGROUNDED_NODE_DETAIL =
  "no node of the supplied context is named in the question (matched by node id or label)";

/** A conservative threshold: hypotheses need ≥ 2 supporting observations. */
export const STUB_SECOND_MIN_SUPPORTING_OBSERVATIONS = 2;

function isMeasured(property: GroundedProperty): boolean {
  return property.uncertainty !== undefined && typeof property.value === "number";
}

/* ------------------------------------------------------------------ */
/* Property family (conservative)                                       */
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
          `conservative threshold: question does not name a property of node '${displayName(node)}' (modeled keys: ${modeledKeys.join(", ")})`,
        ),
      );
      continue;
    }
    const presentKeys = resolution.propertyKeys.filter((key) => modeledKeys.includes(key));
    if (presentKeys.length === 0) {
      refusals.push(
        insufficient(
          `conservative threshold: node '${displayName(node)}' does not carry property '${resolution.propertyKeys.join("', '")}' (modeled keys: ${modeledKeys.join(", ")})`,
        ),
      );
      continue;
    }
    const properties = node.properties
      .filter((p) => presentKeys.includes(p.key))
      .sort((a, b) => (a.key < b.key ? -1 : 1));
    for (const property of properties) {
      const evidence = validEvidenceForProperty(query, node, property);
      if (evidence.length === 0) {
        refusals.push(
          insufficient(
            `conservative threshold: no valid evidence record supports property '${property.key}' of node '${displayName(node)}'`,
          ),
        );
        continue;
      }
      if (!isMeasured(property)) {
        refusals.push(
          insufficient(
            `conservative threshold: property '${property.key}' of node '${displayName(node)}' carries no measured 1σ in the supplied context`,
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
            `conservative threshold: property '${property.key}' of node '${displayName(node)}' has ${citations.length} grounding citations; policy requires at least ${query.policy.requiredCitationsPerClaim}`,
          ),
        );
        continue;
      }
      claims.push(
        makeClaim(
          `Conservative restatement — node '${displayName(node)}' asserts property '${property.key}' = ${formatPropertyValue(property)}.`,
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
/* Findings family (conservative: error severity only)                  */
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
          `conservative threshold: no verification finding references node '${displayName(node)}' in the supplied context`,
        ),
      );
      continue;
    }
    for (const finding of findings) {
      if (finding.severity !== "error") {
        refusals.push(
          insufficient(
            `conservative threshold: ${finding.severity}-severity finding ${finding.code} on node '${displayName(node)}' is not claimed`,
          ),
        );
        continue;
      }
      const citations: ClaimCitation[] = [
        { kind: "finding", findingCode: finding.code, subjectNodeId: node.nodeId },
        { kind: "graph_node", nodeId: node.nodeId },
      ];
      if (citations.length < query.policy.requiredCitationsPerClaim) {
        refusals.push(
          insufficient(
            `conservative threshold: finding '${finding.code}' on node '${displayName(node)}' has ${citations.length} grounding citations; policy requires at least ${query.policy.requiredCitationsPerClaim}`,
          ),
        );
        continue;
      }
      claims.push(
        makeClaim(
          `Conservative restatement — node '${displayName(node)}' carries ${finding.severity} finding ${finding.code}: ${finding.message}`,
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
/* Case family (conservative: fully-valid evidence, ≥2 observations)    */
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
      if (ungrounded.length > 0) {
        refusals.push(
          insufficient(
            `conservative threshold: observation '${observation.observationId}' of case '${c.caseId}' cites evidence with no valid record in the supplied context: ${ungrounded.join(", ")}`,
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
            `conservative threshold: observation '${observation.observationId}' of case '${c.caseId}' has ${citations.length} grounding citations; policy requires at least ${query.policy.requiredCitationsPerClaim}`,
          ),
        );
        continue;
      }
      claims.push(
        makeClaim(
          `Conservative restatement — case '${c.caseId}' records the observation: "${observation.statement}"`,
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
      if (citations.length < STUB_SECOND_MIN_SUPPORTING_OBSERVATIONS) {
        refusals.push(
          insufficient(
            `conservative threshold: hypothesis '${hypothesis.hypothesisId}' of case '${c.caseId}' has ${citations.length} supporting observation${citations.length === 1 ? "" : "s"}; at least ${STUB_SECOND_MIN_SUPPORTING_OBSERVATIONS} required`,
          ),
        );
        continue;
      }
      if (citations.length < query.policy.requiredCitationsPerClaim) {
        refusals.push(
          insufficient(
            `conservative threshold: hypothesis '${hypothesis.hypothesisId}' of case '${c.caseId}' has ${citations.length} grounding citations; policy requires at least ${query.policy.requiredCitationsPerClaim}`,
          ),
        );
        continue;
      }
      claims.push(
        makeClaim(
          `Conservative restatement — case '${c.caseId}' records the ${hypothesis.epistemicStatus} hypothesis: "${hypothesis.statement}"`,
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
 * Create the second deterministic provider (conservative thresholds, NOT
 * an LLM). Interchangeable with the deterministic reference provider
 * behind the same port.
 */
export function createStubSecondProvider(): ReasoningProvider {
  return {
    descriptor: {
      providerId: STUB_SECOND_PROVIDER_ID,
      providerKind: "deterministic-conservative",
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
