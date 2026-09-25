/**
 * HFX-401 — the gate-vocabulary tests: closure, versioning, the evidence
 * doctrine (an outcome without an evidence pointer is not recorded), the
 * NA discipline and the negative paths.
 */

import { describe, expect, test } from "bun:test";
import {
  CONTROL_PLANE_GATE_MAPPING,
  GATE_EVIDENCE_KINDS,
  GATE_VOCABULARY_VERSION,
  PROMOTION_SCORECARD_GATE_IDS,
  SCORECARD_GATES,
  gateDefinitionOf,
  isGateEvidenceKind,
  isGateOutcomeKind,
  isScorecardGateId,
  validateGateOutcome,
  validateGateOutcomeSet,
} from "./gates";

describe("HFX-401 gates: the closed ten-gate vocabulary", () => {
  test("the ten ids are EXACTLY the work order's list, in its frozen order", () => {
    expect([...PROMOTION_SCORECARD_GATE_IDS]).toEqual([
      "contract-conformance",
      "semantic-equivalence",
      "negative-discrimination-behavior",
      "provenance-continuity",
      "uncertainty-behavior",
      "failure-unsupported-behavior",
      "dependent-layer-regression",
      "license-use-clearance",
      "cost-quota-safety",
      "historical-interpretability",
    ]);
  });

  test("the vocabulary is closed: no duplicates, definitions align with ids", () => {
    expect(new Set(PROMOTION_SCORECARD_GATE_IDS).size).toBe(10);
    expect(SCORECARD_GATES).toHaveLength(10);
    for (const gate of SCORECARD_GATES) {
      expect(gate.id).toBeDefined();
      expect(gate.title.length).toBeGreaterThan(0);
      expect(gate.requirement.length).toBeGreaterThan(0);
      expect(gate.evidenceKinds.length).toBeGreaterThan(0);
      for (const kind of gate.evidenceKinds) {
        expect(GATE_EVIDENCE_KINDS).toContain(kind);
      }
    }
    expect(SCORECARD_GATES.map((gate) => gate.id)).toEqual([...PROMOTION_SCORECARD_GATE_IDS]);
  });

  test("the vocabulary is versioned (a governed change bumps, never mutates)", () => {
    expect(GATE_VOCABULARY_VERSION).toBe("hfx-401/gate-vocabulary/1");
  });

  test("the type guards refuse invented ids, kinds and outcomes", () => {
    expect(isScorecardGateId("contract-conformance")).toBe(true);
    expect(isScorecardGateId("better-task-metrics")).toBe(false);
    expect(isScorecardGateId("semantic_equivalence")).toBe(false);
    expect(isGateEvidenceKind("test-name")).toBe(true);
    expect(isGateEvidenceKind("gut-feeling")).toBe(false);
    expect(isGateOutcomeKind("pass")).toBe(true);
    expect(isGateOutcomeKind("na")).toBe(true);
    expect(isGateOutcomeKind("probably-fine")).toBe(false);
  });

  test("gateDefinitionOf resolves every id; the lookup is total over the closed set", () => {
    for (const id of PROMOTION_SCORECARD_GATE_IDS) {
      expect(gateDefinitionOf(id).id).toBe(id);
    }
  });
});

describe("HFX-401 gates: the evidence doctrine (enforced)", () => {
  test("a gate outcome WITHOUT an evidence pointer is REJECTED (not recorded)", () => {
    const validation = validateGateOutcome({
      gate: "contract-conformance",
      outcome: "pass",
      statement: "it looked right",
      evidence: [],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((failure) => failure.kind === "missing-evidence")).toBe(true);
    }
  });

  test("an outcome with NO evidence field at all is rejected", () => {
    const validation = validateGateOutcome({
      gate: "semantic-equivalence",
      outcome: "pass",
      statement: "trust me",
    });
    expect(validation.ok).toBe(false);
  });

  test("an INVENTED evidence kind is refused (closed vocabulary)", () => {
    const validation = validateGateOutcome({
      gate: "semantic-equivalence",
      outcome: "pass",
      statement: "statement",
      evidence: [{ kind: "vibes", pointer: "somewhere" }],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.kind === "unknown-evidence-kind"),
      ).toBe(true);
    }
  });

  test("an evidence kind the gate does NOT ACCEPT is refused", () => {
    // license-use-clearance accepts license-declaration + runner-record only
    const validation = validateGateOutcome({
      gate: "license-use-clearance",
      outcome: "pass",
      statement: "statement",
      evidence: [{ kind: "committed-benchmark-id", pointer: "a".repeat(64) }],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.kind === "evidence-kind-not-accepted"),
      ).toBe(true);
    }
  });

  test("an NA without a reason is refused; a reasoned NA with evidence passes", () => {
    const unreasoned = validateGateOutcome({
      gate: "dependent-layer-regression",
      outcome: "na",
      statement: "statement",
      evidence: [{ kind: "runner-record", pointer: "some-run" }],
    });
    expect(unreasoned.ok).toBe(false);
    if (!unreasoned.ok) {
      expect(unreasoned.failures.some((failure) => failure.kind === "na-without-reason")).toBe(
        true,
      );
    }
    const reasoned = validateGateOutcome({
      gate: "dependent-layer-regression",
      outcome: "na",
      naReason: "no Layer-2 consumer corpus exists in the committed fixture scope",
      statement: "unevaluable — recorded NA",
      evidence: [{ kind: "runner-record", pointer: "some-run" }],
    });
    expect(reasoned.ok).toBe(true);
  });

  test("an invented GATE id is refused (scorecards cannot invent dimensions)", () => {
    const validation = validateGateOutcome({
      gate: "vibes-based-approval",
      outcome: "pass",
      statement: "statement",
      evidence: [{ kind: "test-name", pointer: "x" }],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((failure) => failure.kind === "unknown-gate")).toBe(true);
    }
  });

  test("a free-text outcome is refused (pass | fail | na only)", () => {
    const validation = validateGateOutcome({
      gate: "cost-quota-safety",
      outcome: "probably-pass",
      statement: "statement",
      evidence: [{ kind: "runner-record", pointer: "x" }],
    });
    expect(validation.ok).toBe(false);
  });
});

describe("HFX-401 gates: the complete-set validator", () => {
  const validOutcome = (gate: string, outcome: "pass" | "fail" | "na" = "pass") => ({
    gate,
    outcome,
    ...(outcome === "na" ? { naReason: "reason" } : {}),
    statement: "statement",
    // runner-record is the one evidence kind every gate accepts
    evidence: [{ kind: "runner-record", pointer: "x" }],
  });

  test("exactly the ten gates: a missing gate fails the set", () => {
    const nine = PROMOTION_SCORECARD_GATE_IDS.slice(0, 9).map((gate) => validOutcome(gate));
    const validation = validateGateOutcomeSet(nine);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some(
          (failure) => failure.kind === "unknown-gate" && failure.detail.includes("MISSING"),
        ),
      ).toBe(true);
    }
  });

  test("an eleventh gate fails the set (dimensions cannot be added)", () => {
    const ten = PROMOTION_SCORECARD_GATE_IDS.map((gate) => validOutcome(gate));
    const validation = validateGateOutcomeSet([
      ...ten,
      validOutcome("contract-conformance"),
    ]);
    expect(validation.ok).toBe(false);
  });

  test("a duplicate gate fails the set", () => {
    const validation = validateGateOutcomeSet([
      validOutcome("contract-conformance"),
      validOutcome("contract-conformance"),
      ...PROMOTION_SCORECARD_GATE_IDS.slice(2).map((gate) => validOutcome(gate)),
    ]);
    expect(validation.ok).toBe(false);
  });

  test("the full valid set passes", () => {
    const validation = validateGateOutcomeSet(
      PROMOTION_SCORECARD_GATE_IDS.map((gate) => validOutcome(gate)),
    );
    expect(validation.ok).toBe(true);
  });
});

describe("HFX-401 gates: the control-plane seed mapping", () => {
  test("the three HFX-000 gates map onto scorecard dimensions (documented, versioned)", () => {
    expect(CONTROL_PLANE_GATE_MAPPING).toHaveLength(3);
    const controlPlaneIds = CONTROL_PLANE_GATE_MAPPING.map((entry) => entry.controlPlaneGateId);
    expect(controlPlaneIds).toContain("license-use-clearance");
    expect(controlPlaneIds).toContain("benchmark-evidence");
    expect(controlPlaneIds).toContain("provenance-continuity");
    for (const entry of CONTROL_PLANE_GATE_MAPPING) {
      expect(entry.statement.length).toBeGreaterThan(0);
    }
  });
});
