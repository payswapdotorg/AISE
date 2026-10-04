/**
 * WORLD-P2 — the REASONING family's two in-memory SUBSTITUTION DOUBLES —
 * THE LLM SUBSTRATE DOUBLES.
 *
 * Both implement the `BoundedReasoningProvider` port WITHOUT any model —
 * no network, no inference runtime, no token sampling: the real LLM lane
 * is BLOCKED pending the bounded-reasoning substrate decision (recorded
 * in the item's CAPABILITY-BOUNDARIES with the decision protocol). The
 * doubles prove the bounded-reasoning CONTRACT implementable and —
 * because they build claims through the SAME canonical content-id
 * helpers — they produce BYTE-IDENTICAL `ReasoningStepResult` records on
 * the committed fixtures:
 *
 *  - `referenceBoundedReasonerDouble` — DIRECT claim construction: builds
 *    each claim object directly from the supplied scope, seals each with
 *    its content-derived claimId, seals the result.
 *  - `alternateBoundedReasonerDouble` — ROUND-TRIP claim construction:
 *    serializes each claim to canonical JSON, parses it back, re-seals —
 *    proving the claim/result contracts are wire-stable.
 *
 * THE BOUNDED RETRIEVAL DISCIPLINE (what makes these doubles honest
 * stand-ins for the bounded-reasoning seam): every claim is constructed
 * ONLY from the supplied (request, context, envelope, report) scope — the
 * doubles perform a real retrieval pass over that scope (they look up the
 * observations, assertions, measurements, substrate candidates and
 * evidence by content), cite exactly what they found, and never emit a
 * statement whose citations are not in scope. The controlled entry point
 * (`reasonThroughBoundedPort`) post-validates this against any provider,
 * real or double.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { canonicalDigestOf } from "@aise/world-understanding-substrate";
import {
  contentIdOf,
  type LaneProviderDescriptor,
} from "../seam";
import type {
  BoundedReasoningProvider,
  BoundedReasoningRequest,
  ClaimCitation,
  ReasoningClaim,
  ReasoningProvenance,
  ReasoningStepResult,
} from "./contract";
import { promptDigestOf } from "./contract";
import type { CaseContext } from "../problem/contract";
import type {
  MissingEvidenceReport,
  ProblemEvidenceEnvelope,
} from "../evidence/contract";

export const REFERENCE_REASONER_DESCRIPTOR: LaneProviderDescriptor = {
  providerId: "layer2-experience.reasoning.reference-llm-double",
  family: "reasoning",
  technologyVersion: "bounded-reasoner-reference-double/1.0.0",
  engineNote:
    "in-memory substitution double — deterministic retrieval-scoped claim construction over the " +
    "supplied case scope; NO LLM integrated (the real lane is BLOCKED pending the substrate decision)",
  laneStatement:
    "AISE Layer-2 experience lane (WORLD-P2): bounded reasoning as a replaceable LLM substrate " +
    "behind a provider port — retrieval scoped to the case context, outputs INFERRED with " +
    "prompt/context provenance, refusal on insufficient evidence, never an engineering authority.",
};

export const ALTERNATE_REASONER_DESCRIPTOR: LaneProviderDescriptor = {
  providerId: "layer2-experience.reasoning.alternate-llm-double",
  family: "reasoning",
  technologyVersion: "bounded-reasoner-alternate-double/1.0.0",
  engineNote:
    "in-memory substitution double — canonical-JSON round-trip claim construction over the " +
    "supplied case scope; NO LLM integrated (the real lane is BLOCKED pending the substrate decision)",
  laneStatement:
    "AISE Layer-2 experience lane (WORLD-P2): bounded reasoning as a replaceable LLM substrate " +
    "behind a provider port — retrieval scoped to the case context, outputs INFERRED with " +
    "prompt/context provenance, refusal on insufficient evidence, never an engineering authority.",
};

/* ------------------------------------------------------------------ */
/* The deterministic claim bank (built ONLY from the supplied scope)    */
/* ------------------------------------------------------------------ */

/** The retrieval: the observations of the case, in scope order. */
function scopeObservations(context: CaseContext): CaseContext["observations"] {
  return context.observations;
}

/** The retrieval: the observed property assertions of the case. */
function scopeAssertions(context: CaseContext): CaseContext["propertyAssertions"] {
  return context.propertyAssertions;
}

/** The retrieval: the substrate-candidate INFERRED property seeds. */
function scopeSubstrateAssertions(context: CaseContext): {
  readonly assertionId: string;
  readonly property: string;
  readonly value: number | string | boolean;
}[] {
  return context.substrateCandidates.flatMap((candidate) =>
    candidate.aise.propertyAssertions.map((assertion) => ({
      assertionId: assertion.assertionId,
      property: assertion.property,
      value: assertion.value,
    })),
  );
}

/** The retrieval: the evidence records SUPPORTing the case subjects. */
function scopeEvidence(envelope: ProblemEvidenceEnvelope): ProblemEvidenceEnvelope["evidence"] {
  return envelope.evidence;
}

interface ClaimDraft {
  readonly statement: string;
  readonly citations: readonly ClaimCitation[];
}

/** Claim 1: the distress reading of the observed facts. */
function distressClaim(
  context: CaseContext,
  envelope: ProblemEvidenceEnvelope,
): ClaimDraft | null {
  const observations = scopeObservations(context);
  const crack = observations.find((observation) =>
    observation.statement.includes("Diagonal crack"),
  );
  const drawing = observations.find((observation) =>
    observation.statement.includes("Drawing sheet"),
  );
  if (crack === undefined || drawing === undefined) {
    return null;
  }
  const photos = scopeEvidence(envelope).filter(
    (record) => record.acquisitionMethod === "STILL_IMAGERY",
  );
  if (photos.length === 0) {
    return null;
  }
  return {
    statement:
      "The lintel bearing above Opening-001 is distressed: field evidence documents a diagonal " +
      "crack originating at the bearing, and the registered drawing context confirms the " +
      "reinforced-concrete lintel bears on the masonry wall. This reading is INFERRED from the " +
      "cited observations and imagery, not an observed engineering conclusion.",
    citations: [
      { citedKind: "observation", citedId: crack.observationId },
      { citedKind: "observation", citedId: drawing.observationId },
      ...photos.map(
        (photo): ClaimCitation => ({ citedKind: "evidence", citedId: photo.contentId }),
      ),
    ],
  };
}

/** Claim 2: the measured-basis reading (only when the measurements exist). */
function measuredBasisClaim(context: CaseContext): ClaimDraft | null {
  const assertions = scopeAssertions(context);
  const steel = assertions.find(
    (assertion) => assertion.property === "remaining_steel_section",
  );
  const deflection = assertions.find(
    (assertion) => assertion.property === "midspan_deflection",
  );
  const measurement = context.measurements.find(
    (record) => record.quantity === "midspan_deflection",
  );
  if (steel === undefined || deflection === undefined || measurement === undefined) {
    return null;
  }
  return {
    statement:
      "The measured basis supports a section-loss assessment: the remaining steel section and " +
      "the midspan deflection are observed with declared 1σ uncertainties within the case's " +
      "declared bounds. The numbers are cited verbatim from the observed assertions and " +
      "measurement — this claim adds no value the citations do not carry.",
    citations: [
      { citedKind: "property_assertion", citedId: steel.assertionId },
      { citedKind: "property_assertion", citedId: deflection.assertionId },
      { citedKind: "measurement", citedId: measurement.measurementId },
    ],
  };
}

/** Claim 3: the substrate-candidate contradiction reading. */
function substrateContradictionClaim(context: CaseContext): ClaimDraft | null {
  const loadBearing = scopeSubstrateAssertions(context).find(
    (assertion) => assertion.property === "LoadBearing",
  );
  if (loadBearing === undefined) {
    return null;
  }
  return {
    statement:
      `The BIM-derived candidate asserts LoadBearing=${String(loadBearing.value)} (INFERRED from ` +
      "the model file). The observed distress pattern at the bearing contradicts treating this " +
      "candidate as settled: it must remain an unverified model claim until field-confirmed. " +
      "The candidate is cited by its seed id — the model file is not an engineering authority.",
    citations: [
      { citedKind: "substrate_candidate", citedId: loadBearing.assertionId },
    ],
  };
}

/** The claim bank by question kind (deterministic subset selection). */
function claimBank(
  request: BoundedReasoningRequest,
  context: CaseContext,
  envelope: ProblemEvidenceEnvelope,
): readonly ClaimDraft[] {
  const drafts = [
    distressClaim(context, envelope),
    measuredBasisClaim(context),
    substrateContradictionClaim(context),
  ];
  const present = drafts.filter((draft): draft is ClaimDraft => draft !== null);
  switch (request.question) {
    case "summarize_evidence":
      return present.filter((_, index) => index === 0 || index === 1);
    case "discriminate_hypotheses":
      return present.filter((_, index) => index === 1 || index === 2);
    case "identify_risk":
      return present.filter((_, index) => index === 0 || index === 2);
    case "propose_next_action":
      return present;
  }
}

/* ------------------------------------------------------------------ */
/* The shared sealing (byte-identity by construction)                   */
/* ------------------------------------------------------------------ */

function sealClaim(draft: ClaimDraft): ReasoningClaim {
  const claim: Omit<ReasoningClaim, "claimId"> = {
    statement: draft.statement,
    epistemicStatus: "INFERRED",
    citations: draft.citations,
    advisoryOnly: true,
  };
  const claimId = contentIdOf(claim as unknown as Record<string, unknown>, "claimId");
  return { ...claim, claimId };
}

function provenanceOf(
  descriptor: LaneProviderDescriptor,
  request: BoundedReasoningRequest,
  contextDigest: string,
): ReasoningProvenance {
  return {
    providerId: descriptor.providerId,
    technologyVersion: descriptor.technologyVersion,
    providerDescriptorDigest: canonicalDigestOf(descriptor),
    promptDigest: promptDigestOf(request, contextDigest),
    contextDigest,
    retrievalScope: "case-context",
  };
}

function resultBody(
  descriptor: LaneProviderDescriptor,
  request: BoundedReasoningRequest,
  context: CaseContext,
  envelope: ProblemEvidenceEnvelope,
  report: MissingEvidenceReport,
  claims: readonly ReasoningClaim[],
): Omit<ReasoningStepResult, "resultId"> {
  return {
    kind: "bounded-reasoning-result",
    schemaVersion: "bounded-reasoning-result/1",
    requestId: request.requestId,
    claims,
    reasoningProvenance: provenanceOf(descriptor, request, context.contextId),
    producedAt: request.askedAt,
  };
}

/* ------------------------------------------------------------------ */
/* The reference double (direct claim construction)                     */
/* ------------------------------------------------------------------ */

export const referenceBoundedReasonerDouble: BoundedReasoningProvider = {
  descriptor: REFERENCE_REASONER_DESCRIPTOR,
  reason: (request, context, envelope, report) => {
    const drafts = claimBank(request, context, envelope);
    if (drafts.length === 0) {
      return {
        ok: false,
        refusal: {
          code: "PROVIDER_FAILURE",
          detail:
            "the supplied scope carries no citable basis for any claim — the double refuses " +
            "rather than emit an uncited statement",
        },
        provenance: provenanceOf(REFERENCE_REASONER_DESCRIPTOR, request, context.contextId),
      };
    }
    const claims = drafts.map(sealClaim);
    const body = resultBody(
      REFERENCE_REASONER_DESCRIPTOR,
      request,
      context,
      envelope,
      report,
      claims,
    );
    const resultId = contentIdOf(body as unknown as Record<string, unknown>, "resultId");
    return { ok: true, result: { ...body, resultId } };
  },
};

/* ------------------------------------------------------------------ */
/* The alternate double (canonical round-trip claim construction)       */
/* ------------------------------------------------------------------ */

export const alternateBoundedReasonerDouble: BoundedReasoningProvider = {
  descriptor: ALTERNATE_REASONER_DESCRIPTOR,
  reason: (request, context, envelope, report) => {
    const drafts = claimBank(request, context, envelope);
    if (drafts.length === 0) {
      return {
        ok: false,
        refusal: {
          code: "PROVIDER_FAILURE",
          detail:
            "the supplied scope carries no citable basis for any claim — the double refuses " +
            "rather than emit an uncited statement",
        },
        provenance: provenanceOf(ALTERNATE_REASONER_DESCRIPTOR, request, context.contextId),
      };
    }
    /* The mechanical difference: each claim travels through the canonical
     * wire form before sealing — a wire-unstable claim contract would
     * drift here and the byte-identity assertion would fail. */
    const claims = drafts.map((draft) => {
      const wireText = canonicalJsonStringify({
        statement: draft.statement,
        epistemicStatus: "INFERRED",
        citations: draft.citations,
        advisoryOnly: true,
      });
      const reparsed = JSON.parse(wireText) as Omit<ReasoningClaim, "claimId">;
      const claimId = contentIdOf(reparsed as unknown as Record<string, unknown>, "claimId");
      return { ...reparsed, claimId } satisfies ReasoningClaim;
    });
    const body = resultBody(
      ALTERNATE_REASONER_DESCRIPTOR,
      request,
      context,
      envelope,
      report,
      claims,
    );
    const resultId = contentIdOf(body as unknown as Record<string, unknown>, "resultId");
    return { ok: true, result: { ...body, resultId } };
  },
};
