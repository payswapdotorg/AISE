/**
 * AISE-029 — shared deterministic helpers for the reference providers.
 *
 * Both deterministic providers (deterministic-reference and stub-second)
 * build claims from the SAME pure primitives: σ propagation (verbatim,
 * maximum-of-sources — never synthesized), value formatting, display names,
 * claim construction (content-derived ids) and INSUFFICIENT_EVIDENCE
 * refusal wording. The providers DIFFER only in their claim thresholds —
 * which is exactly the interchangeability the work order asks to prove:
 * same output contract, different content quality.
 */

import type {
  ClaimCitation,
  GroundedEvidenceRecord,
  GroundedNode,
  GroundedProperty,
  Observation,
  ReasoningClaim,
  ReasoningQuery,
  ReasoningUncertainty,
  Refusal,
} from "../model";
import { claimIdFor } from "../model";
import { GroundedRetrieval, labelOfNode } from "../retrieval";

/* ------------------------------------------------------------------ */
/* σ propagation (verbatim from sources — never fabricated)             */
/* ------------------------------------------------------------------ */

export interface SigmaCandidate {
  readonly sigma: number;
  readonly unit: string;
}

/**
 * The frozen conservative propagation rule: the claim's σ is the MAXIMUM
 * of the cited source σ values (never smaller than any source; always one
 * of the source values, so the gateway's fabrication gate can verify it by
 * membership). No source ⇒ honestly UNKNOWN. Combining σ by any other
 * model (RSS etc.) is AISE-013's domain and is deliberately absent.
 */
export function maxSigma(candidates: readonly SigmaCandidate[]): ReasoningUncertainty {
  const [first] = candidates;
  if (first === undefined) {
    return { kind: "UNKNOWN" };
  }
  let best = first;
  for (const candidate of candidates) {
    if (candidate.sigma > best.sigma) {
      best = candidate;
    }
  }
  return { kind: "MEASURED_SIGMA", sigma: best.sigma, unit: best.unit };
}

/** (σ, unit) pairs carried by evidence records' measurements. */
export function evidenceSigmaCandidates(
  records: readonly GroundedEvidenceRecord[],
): SigmaCandidate[] {
  const candidates: SigmaCandidate[] = [];
  for (const record of records) {
    if (record.measurement !== undefined && record.measurement.sigma !== undefined) {
      candidates.push({ sigma: record.measurement.sigma, unit: record.measurement.unit });
    }
  }
  return candidates;
}

/**
 * (σ, unit) pairs behind one property: its own σ plus cited measurements' —
 * but σ propagates ONLY for QUANTITY claims: a non-numeric property (e.g. a
 * label) is nothing to measure, so linked-evidence σ never attaches to it
 * (the claim carries honestly UNKNOWN instead — a σ in metres on a string
 * would be fabricated precision, not propagated measurement).
 */
export function propertySigmaCandidates(
  property: GroundedProperty,
  records: readonly GroundedEvidenceRecord[],
): SigmaCandidate[] {
  const candidates: SigmaCandidate[] = [];
  if (
    property.uncertainty !== undefined &&
    typeof property.value === "number" &&
    property.unit !== undefined
  ) {
    candidates.push({ sigma: property.uncertainty.sigma, unit: property.unit });
  }
  if (typeof property.value === "number") {
    candidates.push(...evidenceSigmaCandidates(records));
  }
  return candidates;
}

/* ------------------------------------------------------------------ */
/* Templating / naming                                                  */
/* ------------------------------------------------------------------ */

/** Deterministic value rendering for claim texts (quoted strings, unit'd numbers). */
export function formatPropertyValue(property: GroundedProperty): string {
  if (typeof property.value === "string") {
    return `"${property.value}"`;
  }
  return property.unit !== undefined ? `${property.value} ${property.unit}` : `${property.value}`;
}

/** The node's "label" property value (the 016/023 convention) or its id. */
export function displayName(node: GroundedNode): string {
  return labelOfNode(node) ?? node.nodeId;
}

/** Build a claim with its content-derived deterministic id. */
export function makeClaim(
  text: string,
  citations: readonly [ClaimCitation, ...ClaimCitation[]],
  epistemicStatus: ReasoningClaim["epistemicStatus"],
  uncertainty: ReasoningUncertainty,
): ReasoningClaim {
  return {
    claimId: claimIdFor({ text, citations, epistemicStatus, uncertainty }),
    text,
    citations,
    epistemicStatus,
    uncertainty,
  };
}

/** An INSUFFICIENT_EVIDENCE refusal naming what is missing. */
export function insufficient(detail: string): Refusal {
  return { code: "INSUFFICIENT_EVIDENCE", detail };
}

/* ------------------------------------------------------------------ */
/* Grounding lookup (via the deterministic retrieval tools)             */
/* ------------------------------------------------------------------ */

/**
 * The VALID evidence behind one property: its SUPPORTS/DERIVED_FROM
 * provenance evidence ids that resolve to non-invalidated records (the
 * DIRECT support, contentId-sorted); when the property's provenance names
 * no evidence at all, the node-linked valid evidence is the honest
 * fallback (the caller linked those records to this node).
 */
export function validEvidenceForProperty(
  query: ReasoningQuery,
  node: GroundedNode,
  property: GroundedProperty,
): readonly GroundedEvidenceRecord[] {
  const provenanceIds = property.provenance
    .filter(
      (record) =>
        record.evidenceId !== undefined &&
        (record.role === "SUPPORTS" || record.role === "DERIVED_FROM"),
    )
    .map((record) => record.evidenceId as string);
  if (provenanceIds.length === 0) {
    return GroundedRetrieval.validEvidenceForNode(query.context, node.nodeId);
  }
  const resolved = provenanceIds
    .map((contentId) => GroundedRetrieval.evidenceByContentId(query.context, contentId))
    .filter(
      (record): record is GroundedEvidenceRecord =>
        record !== null && record !== undefined && !record.invalidated,
    );
  return [...resolved].sort((a, b) => (a.contentId < b.contentId ? -1 : 1));
}

/** The VALID evidence records behind an observation's evidence ids. */
export function validEvidenceForObservation(
  query: ReasoningQuery,
  observation: Observation,
): readonly GroundedEvidenceRecord[] {
  const resolved = observation.evidenceIds
    .map((contentId) => GroundedRetrieval.evidenceByContentId(query.context, contentId))
    .filter(
      (record): record is GroundedEvidenceRecord =>
        record !== null && record !== undefined && !record.invalidated,
    );
  return [...resolved].sort((a, b) => (a.contentId < b.contentId ? -1 : 1));
}

/** Evidence citations (contentId-sorted) for records. */
export function evidenceCitations(
  records: readonly GroundedEvidenceRecord[],
): ClaimCitation[] {
  return records.map((record) => ({ kind: "evidence", contentId: record.contentId }));
}

/** Non-empty citation tuple from a list known to be non-empty. */
export function citationTuple(
  citations: readonly ClaimCitation[],
): readonly [ClaimCitation, ...ClaimCitation[]] {
  const [first] = citations;
  return [first as ClaimCitation, ...citations.slice(1)];
}
