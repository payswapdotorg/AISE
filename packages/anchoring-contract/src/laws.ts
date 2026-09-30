/**
 * ANCHOR-002 — the port laws as typed, tested invariants (PORT.md §4).
 *
 * This module is the CONSTRUCTIVE side of the three laws (guard.ts is the
 * destructive side): typed helpers that build lawful responses, plus the
 * declared gate order as data and the pure predicates the tests turn into
 * invariants:
 *
 *   1. NO PROVIDER TYPE CROSSES — `refuseAnchoring`/`buildPartialResponse`
 *      can only emit the closed field set (the schemas enforce it; the
 *      guard proves it).
 *   2. AISE OWNS IDENTITY — every hypothesis/refused-still content id is
 *      taken from the request (`echoedContentIds`); provider refs appear
 *      only inside `provenance.externalReferences`.
 *   3. FAIL CLOSED BEFORE ANCHORING — `refuseAnchoring` always emits ZERO
 *      hypotheses (the `refusalCarriesZeroHypotheses` predicate), and the
 *      contract-layer gate order is the declared, frozen sequence
 *      `ANCHORING_GATE_STAGES` (input sanity → content-id re-verification →
 *      evidence-method support → plan-context support → parameters — the
 *      work order's own words): a refusal from an earlier stage wins
 *      (`firstFailingStage`).
 */

import {
  ANCHORING_GATE_STAGES,
  type AnchoringGateStage,
  type AnchoringPerStillReasonCode,
  type AnchoringReasonCode,
} from "./vocabularies";
import type { AnchoringRequest } from "./request";
import { requestStillContentIds } from "./request";
import type {
  AnchoringHypothesis,
  AnchoringProvenance,
  AnchoringRefusedStill,
  AnchoringResponse,
} from "./response";
import { ANCHORING_PORT_VERSION, ANCHORING_CONTRACT_VERSION, ANCHORING_WIRE_SCHEMA_VERSION } from "./anchoring-contracts.version";
import { AnchoringContractInvariantError } from "./errors";

/** The typed refusal input of `refuseAnchoring` (law 3's helper). */
export interface RefusalInput {
  readonly reasonCode: AnchoringReasonCode;
  readonly refusalDetail: string;
  readonly provenance: AnchoringProvenance;
  readonly executionTimeMs: number;
  readonly stageTimingsMs?: Readonly<Record<string, number>>;
}

/**
 * Builds a whole-request fail-closed refusal: a typed reasonCode from the
 * closed vocabulary, a non-empty refusalDetail naming the offending ids,
 * and ZERO hypotheses — no fabricated anchors, ever. The invariant is
 * enforced at construction (an impossible refusal cannot exist).
 */
export function refuseAnchoring(
  request: AnchoringRequest,
  input: RefusalInput,
): AnchoringResponse {
  if (input.refusalDetail.length === 0) {
    throw new AnchoringContractInvariantError(
      { family: "response", objectName: "AnchoringResponse" },
      [{ path: "refusalDetail", detail: "a refusal must name the offending ids (non-empty detail)" }],
    );
  }
  const response: AnchoringResponse = {
    schemaVersion: ANCHORING_WIRE_SCHEMA_VERSION,
    portVersion: ANCHORING_PORT_VERSION,
    contractVersion: ANCHORING_CONTRACT_VERSION,
    executionId: request.executionId,
    status: "refused",
    reasonCode: input.reasonCode,
    refusalDetail: input.refusalDetail,
    provenance: input.provenance,
    hypotheses: [],
    executionTimeMs: input.executionTimeMs,
    ...(input.stageTimingsMs === undefined ? {} : { stageTimingsMs: input.stageTimingsMs }),
  };
  const zero = refusalCarriesZeroHypotheses(response);
  if (!zero) {
    throw new AnchoringContractInvariantError(
      { family: "response", objectName: "AnchoringResponse" },
      [{ path: "hypotheses", detail: "a refusal carries zero hypotheses by construction" }],
    );
  }
  return response;
}

/** Builds one refused-still record of a PARTIAL outcome (the typed satellite). */
export function refuseStill(
  contentId: string,
  reasonCode: AnchoringPerStillReasonCode,
  detail: string,
): AnchoringRefusedStill {
  return { contentId, reasonCode, detail };
}

/** The typed PARTIAL construction input. */
export interface PartialResponseInput {
  readonly anchoredHypotheses: readonly AnchoringHypothesis[];
  readonly refusedStills: readonly AnchoringRefusedStill[];
  readonly provenance: AnchoringProvenance;
  readonly executionTimeMs: number;
  readonly stageTimingsMs?: Readonly<Record<string, number>>;
}

/**
 * Builds a typed PARTIAL outcome: the anchored stills carry their
 * hypotheses; the refused stills carry their typed per-still reason codes.
 * Accounting is enforced AT CONSTRUCTION: every requested still appears
 * exactly once across the two arrays, no invented ids, and both arrays are
 * non-empty (otherwise it is an anchored or refused outcome, not partial).
 */
export function buildPartialResponse(
  request: AnchoringRequest,
  input: PartialResponseInput,
): AnchoringResponse {
  const stillIds = requestStillContentIds(request);
  const anchoredIds = input.anchoredHypotheses.map((hypothesis) => hypothesis.evidenceContentId);
  const refusedIds = input.refusedStills.map((still) => still.contentId);
  const counts = new Map<string, number>();
  for (const id of [...anchoredIds, ...refusedIds]) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const violations: Array<{ path: string; detail: string }> = [];
  if (anchoredIds.length === 0) {
    violations.push({ path: "anchoredHypotheses", detail: "a partial outcome anchors at least one still" });
  }
  if (refusedIds.length === 0) {
    violations.push({ path: "refusedStills", detail: "a partial outcome refuses at least one still" });
  }
  for (const id of [...anchoredIds, ...refusedIds]) {
    if (!stillIds.includes(id)) {
      violations.push({
        path: "hypotheses",
        detail: `content id ${id.slice(0, 12)}… was not supplied by AISE (ids are echoed, never invented)`,
      });
    }
  }
  for (const stillId of stillIds) {
    const count = counts.get(stillId) ?? 0;
    if (count !== 1) {
      violations.push({
        path: "hypotheses",
        detail: `requested still ${stillId.slice(0, 12)}… appears ${count} times across the two arrays (exactly once is required)`,
      });
    }
  }
  if (violations.length > 0) {
    throw new AnchoringContractInvariantError(
      { family: "response", objectName: "AnchoringResponse" },
      violations,
    );
  }
  return {
    schemaVersion: ANCHORING_WIRE_SCHEMA_VERSION,
    portVersion: ANCHORING_PORT_VERSION,
    contractVersion: ANCHORING_CONTRACT_VERSION,
    executionId: request.executionId,
    status: "partial",
    reasonCode: null,
    partialSummary: {
      anchoredStills: anchoredIds.length,
      refusedStills: refusedIds.length,
    },
    provenance: input.provenance,
    hypotheses: [...input.anchoredHypotheses],
    refusedStills: [...input.refusedStills],
    executionTimeMs: input.executionTimeMs,
    ...(input.stageTimingsMs === undefined ? {} : { stageTimingsMs: input.stageTimingsMs }),
  };
}

/** Law 3's predicate: a refusal carries ZERO hypotheses (typed, pure). */
export function refusalCarriesZeroHypotheses(response: AnchoringResponse): boolean {
  return response.status !== "refused" || response.hypotheses.length === 0;
}

/** Law 2's predicate: every content id in the outcome was echoed from the request. */
export function echoedContentIds(request: AnchoringRequest, response: AnchoringResponse): boolean {
  const stillIds = new Set(requestStillContentIds(request));
  for (const hypothesis of response.hypotheses) {
    if (!stillIds.has(hypothesis.evidenceContentId)) return false;
  }
  for (const still of response.refusedStills ?? []) {
    if (!stillIds.has(still.contentId)) return false;
  }
  return response.executionId === request.executionId;
}

/**
 * The contract-layer gate stages as a typed, ordered record: each stage is
 * paired with the whole-request reason codes its refusal may carry. The
 * sequence is the work order's declared order — an invariant asserted by
 * tests (ANCHORING_GATE_STAGES is frozen data).
 */
export const ANCHORING_GATE_STAGE_REASON_CODES: Readonly<
  Record<AnchoringGateStage, readonly AnchoringReasonCode[]>
> = {
  "input-sanity": ["input-contract-violation"],
  "content-id-re-verification": ["evidence-bytes-mismatch"],
  "evidence-method-support": ["evidence-method-unsupported"],
  "plan-context-support": ["plan-context-missing", "plan-context-unsupported"],
  parameters: ["representation-unsupported", "insufficient-stills", "insufficient-features", "registration-unreliable"],
};

/** The ordered stages with their indices (the declared gate order as data). */
export const ANCHORING_GATE_ORDER: readonly AnchoringGateStage[] = ANCHORING_GATE_STAGES;

/**
 * The stage a whole-request reason code belongs to (law 3's order as a
 * lookup): a refusal from an earlier stage wins because the provider gates
 * in the declared sequence and stops at the first failure.
 */
export function stageOfReasonCode(reasonCode: AnchoringReasonCode): AnchoringGateStage {
  for (const stage of ANCHORING_GATE_ORDER) {
    if (ANCHORING_GATE_STAGE_REASON_CODES[stage].includes(reasonCode)) {
      return stage;
    }
  }
  // Unreachable for the closed vocabulary; the exhaustive record above
  // makes this a compile-time-checked total function.
  return "input-sanity";
}

/**
 * Given reason codes observed across two runs of the same request, returns
 * the one from the EARLIEST gate stage (a refusal from an earlier gate
 * wins — the fail-closed order is deterministic, never a race).
 */
export function firstFailingStage(
  codes: readonly AnchoringReasonCode[],
): AnchoringGateStage | null {
  let best: AnchoringGateStage | null = null;
  let bestIndex = ANCHORING_GATE_ORDER.length;
  for (const code of codes) {
    const stage = stageOfReasonCode(code);
    const index = ANCHORING_GATE_ORDER.indexOf(stage);
    if (index < bestIndex) {
      bestIndex = index;
      best = stage;
    }
  }
  return best;
}
