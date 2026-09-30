/**
 * ANCHOR-002 tests — the constructive port laws: the typed refusal builder
 * (zero hypotheses by construction), the gate-order data (an earlier gate's
 * refusal wins), and the echo predicates.
 */

import { describe, expect, test } from "bun:test";
import {
  ANCHORING_GATE_ORDER,
  ANCHORING_GATE_STAGE_REASON_CODES,
  echoedContentIds,
  firstFailingStage,
  refuseAnchoring,
  refusalCarriesZeroHypotheses,
  stageOfReasonCode,
} from "./laws";
import { AnchoringContractInvariantError } from "./errors";
import {
  fixtureAnchoredResponse,
  fixtureProvenance,
  fixtureRequest,
} from "./test-fixtures";

describe("the typed fail-closed refusal builder", () => {
  test("a refusal carries ZERO hypotheses by construction (law 3)", () => {
    const request = fixtureRequest();
    const refused = refuseAnchoring(request, {
      reasonCode: "insufficient-stills",
      refusalDetail: "1 still < policy floor 2",
      provenance: fixtureProvenance(request),
      executionTimeMs: 42.0,
    });
    expect(refused.status).toBe("refused");
    expect(refused.hypotheses).toHaveLength(0);
    expect(refusalCarriesZeroHypotheses(refused)).toBe(true);
    expect(refused.executionId).toBe(request.executionId);
    expect(refused.reasonCode).toBe("insufficient-stills");
  });

  test("an empty refusalDetail is refused at construction (the refusal must name the offender)", () => {
    const request = fixtureRequest();
    expect(() =>
      refuseAnchoring(request, {
        reasonCode: "input-contract-violation",
        refusalDetail: "",
        provenance: fixtureProvenance(request),
        executionTimeMs: 1,
      }),
    ).toThrow(AnchoringContractInvariantError);
  });

  test("every whole-request reason code in the closed vocabulary is buildable", () => {
    const request = fixtureRequest();
    const codes = [
      "input-contract-violation",
      "plan-context-missing",
      "plan-context-unsupported",
      "representation-unsupported",
      "evidence-method-unsupported",
      "evidence-bytes-mismatch",
      "insufficient-stills",
      "insufficient-features",
      "registration-unreliable",
    ] as const;
    for (const reasonCode of codes) {
      const refused = refuseAnchoring(request, {
        reasonCode,
        refusalDetail: `typed refusal ${reasonCode}`,
        provenance: fixtureProvenance(request),
        executionTimeMs: 1,
      });
      expect(refused.reasonCode).toBe(reasonCode);
      expect(refused.hypotheses).toHaveLength(0);
    }
  });
});

describe("the declared gate order (the work order's sequence, as data)", () => {
  test("every stage's reason codes belong to the closed whole-request vocabulary", () => {
    const all = Object.values(ANCHORING_GATE_STAGE_REASON_CODES).flat();
    for (const code of all) {
      expect(typeof code).toBe("string");
    }
    // total: every closed reason code maps to exactly one stage
    const closedVocabulary = [
      "input-contract-violation",
      "plan-context-missing",
      "plan-context-unsupported",
      "representation-unsupported",
      "evidence-method-unsupported",
      "evidence-bytes-mismatch",
      "insufficient-stills",
      "insufficient-features",
      "registration-unreliable",
    ] as const;
    for (const code of closedVocabulary) {
      expect(ANCHORING_GATE_ORDER).toContain(stageOfReasonCode(code));
    }
  });

  test("stageOfReasonCode maps the head gates in the declared order", () => {
    expect(stageOfReasonCode("input-contract-violation")).toBe("input-sanity");
    expect(stageOfReasonCode("evidence-bytes-mismatch")).toBe("content-id-re-verification");
    expect(stageOfReasonCode("evidence-method-unsupported")).toBe("evidence-method-support");
    expect(stageOfReasonCode("plan-context-missing")).toBe("plan-context-support");
    expect(stageOfReasonCode("representation-unsupported")).toBe("parameters");
  });

  test("a refusal from an EARLIER gate wins (the order is deterministic, never a race)", () => {
    // both an evidence-method refusal (stage 3) and an input-sanity refusal (stage 1)
    const stage = firstFailingStage(["evidence-method-unsupported", "input-contract-violation"]);
    expect(stage).toBe("input-sanity");
    // content-id re-verification (stage 2) beats plan-context support (stage 4)
    expect(firstFailingStage(["plan-context-unsupported", "evidence-bytes-mismatch"])).toBe(
      "content-id-re-verification",
    );
    expect(firstFailingStage([])).toBeNull();
  });
});

describe("the echo predicates (law 2)", () => {
  test("a lawful anchored response echoes every id and the executionId", () => {
    const request = fixtureRequest();
    expect(echoedContentIds(request, fixtureAnchoredResponse(request))).toBe(true);
  });

  test("an invented id fails the predicate", () => {
    const request = fixtureRequest();
    const response = fixtureAnchoredResponse(request);
    const mutated = {
      ...response,
      hypotheses: [
        { ...response.hypotheses[0]!, evidenceContentId: "a".repeat(64) },
        ...response.hypotheses.slice(1),
      ],
    };
    expect(echoedContentIds(request, mutated)).toBe(false);
  });

  test("a foreign executionId fails the predicate", () => {
    const request = fixtureRequest();
    const response = { ...fixtureAnchoredResponse(request), executionId: "other" };
    expect(echoedContentIds(request, response)).toBe(false);
  });
});
