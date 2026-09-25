/**
 * HFX-401 — the per-layer promotion checklist tests: versioned
 * applicability, the NA allowance discipline (machine-checked), the
 * Layer-3 required task surface and the dependent-layer citation
 * requirements.
 */

import { describe, expect, test } from "bun:test";
import type { GateOutcome } from "./gates";
import { PROMOTION_SCORECARD_GATE_IDS } from "./gates";
import {
  LAYER3_REQUIRED_OPERATION_FAMILIES,
  LAYER_CHECKLISTS,
  LAYER_CHECKLIST_VERSION,
  LAYER_PROVIDER_CLASSES,
  NA_ALLOWANCE_CODES,
  checkChecklistConformance,
  dependentLayerRegressionOf,
  gateApplicabilityOf,
  layerChecklistOf,
  layerChecklistProjectionJson,
  requiredCapabilityCoverageOf,
} from "./layers";

describe("HFX-401 layers: the versioned per-layer checklist", () => {
  test("the three AISE capability layers each declare a checklist (versioned)", () => {
    expect(LAYER_CHECKLIST_VERSION).toBe("hfx-401/layer-checklist/1");
    for (const layer of [1, 2, 3] as const) {
      const checklist = layerChecklistOf(layer);
      expect(checklist.layer).toBe(layer);
      expect(checklist.gates).toHaveLength(10);
      expect(checklist.providerClasses).toEqual(LAYER_PROVIDER_CLASSES[layer]);
      expect(checklist.dependentLayerRegression.statement.length).toBeGreaterThan(0);
      expect(checklist.dependentLayerRegression.requiredCitationKinds.length).toBeGreaterThan(0);
    }
  });

  test("Layers 1 and 2: ALL TEN gates mandatory (the work order's list applies fully)", () => {
    for (const layer of [1, 2] as const) {
      for (const gate of PROMOTION_SCORECARD_GATE_IDS) {
        expect(gateApplicabilityOf(layer, gate).applicability).toBe("mandatory");
      }
    }
  });

  test("Layer 3: semantic-equivalence is na-permitted for the BOUNDED VISUAL class ONLY", () => {
    const applicability = gateApplicabilityOf(3, "semantic-equivalence");
    expect(applicability.applicability).toBe("na-permitted");
    expect(applicability.naAllowanceCode).toBe("layer3-visual-presentation-only");
    expect(applicability.naAllowedClasses).toEqual(["visual"]);
    // every OTHER Layer-3 gate stays mandatory
    for (const gate of PROMOTION_SCORECARD_GATE_IDS) {
      if (gate !== "semantic-equivalence") {
        expect(gateApplicabilityOf(3, gate).applicability).toBe("mandatory");
      }
    }
  });

  test("an unknown layer is refused (fail-closed)", () => {
    expect(() => layerChecklistOf(4)).toThrow();
    expect(() => layerChecklistOf(0)).toThrow();
  });
});

describe("HFX-401 layers: the NA allowance discipline (machine-checked)", () => {
  const naOutcome = (gate: string, allowanceCode?: string): GateOutcome => ({
    gate: gate as GateOutcome["gate"],
    outcome: "na",
    naReason: "reason",
    ...(allowanceCode === undefined ? {} : { naAllowanceCode: allowanceCode }),
    statement: "statement",
    evidence: [{ kind: "test-name", pointer: "x" }],
  });
  const passOutcome = (gate: string): GateOutcome => ({
    gate: gate as GateOutcome["gate"],
    outcome: "pass",
    statement: "statement",
    evidence: [{ kind: "test-name", pointer: "x" }],
  });
  const allPass = PROMOTION_SCORECARD_GATE_IDS.map((gate) => passOutcome(gate));

  test("an NA on a MANDATORY gate is a checklist violation (blocks eligibility)", () => {
    const outcomes = allPass.map((outcome) =>
      outcome.gate === "dependent-layer-regression" ? naOutcome(outcome.gate) : outcome,
    );
    const conformance = checkChecklistConformance(1, "perception", outcomes);
    expect(conformance.ok).toBe(false);
    if (!conformance.ok) {
      expect(
        conformance.failures.some((failure) => failure.kind === "na-on-mandatory-gate"),
      ).toBe(true);
    }
  });

  test("a Layer-3 VISUAL provider may take the semantic-equivalence NA with the allowance code", () => {
    const outcomes = allPass.map((outcome) =>
      outcome.gate === "semantic-equivalence"
        ? naOutcome(outcome.gate, "layer3-visual-presentation-only")
        : outcome,
    );
    expect(checkChecklistConformance(3, "visual", outcomes).ok).toBe(true);
  });

  test("a Layer-3 GEOMETRY provider CANNOT take that NA (the class is not permitted)", () => {
    const outcomes = allPass.map((outcome) =>
      outcome.gate === "semantic-equivalence"
        ? naOutcome(outcome.gate, "layer3-visual-presentation-only")
        : outcome,
    );
    const conformance = checkChecklistConformance(3, "geometry", outcomes);
    expect(conformance.ok).toBe(false);
    if (!conformance.ok) {
      expect(conformance.failures.some((failure) => failure.kind === "na-class-not-permitted"))
        .toBe(true);
    }
  });

  test("an NA without the layer's declared allowance code is refused", () => {
    const outcomes = allPass.map((outcome) =>
      outcome.gate === "semantic-equivalence" ? naOutcome(outcome.gate) : outcome,
    );
    const conformance = checkChecklistConformance(3, "visual", outcomes);
    expect(conformance.ok).toBe(false);
    if (!conformance.ok) {
      expect(
        conformance.failures.some((failure) => failure.kind === "na-without-allowance-code"),
      ).toBe(true);
    }
  });

  test("an unknown provider class is refused", () => {
    const conformance = checkChecklistConformance(3, "telepathy", allPass);
    expect(conformance.ok).toBe(false);
    if (!conformance.ok) {
      expect(
        conformance.failures.some((failure) => failure.kind === "unknown-provider-class"),
      ).toBe(true);
    }
  });

  test("the allowance-code vocabulary is closed", () => {
    expect([...NA_ALLOWANCE_CODES]).toEqual(["layer3-visual-presentation-only"]);
  });
});

describe("HFX-401 layers: the required task surface + dependent-layer citations", () => {
  test("Layer-3 geometry/solution providers must cover the TEN documented v1 families", () => {
    expect(LAYER3_REQUIRED_OPERATION_FAMILIES).toHaveLength(10);
    expect(LAYER3_REQUIRED_OPERATION_FAMILIES).toContain("excavation");
    expect(LAYER3_REQUIRED_OPERATION_FAMILIES).toContain("finish-application");
    expect(requiredCapabilityCoverageOf(3, "geometry")).toEqual(LAYER3_REQUIRED_OPERATION_FAMILIES);
    expect(requiredCapabilityCoverageOf(3, "solution")).toEqual(LAYER3_REQUIRED_OPERATION_FAMILIES);
    expect(requiredCapabilityCoverageOf(3, "visual")).toEqual([]);
    expect(requiredCapabilityCoverageOf(1, "perception")).toEqual([]);
  });

  test("the Layer-3 dependent-layer requirement cites the geometry + equivalence corpora", () => {
    const requirement = dependentLayerRegressionOf(3);
    expect(requirement.requiredCitationKinds).toContain("geometry-eval");
    expect(requirement.requiredCitationKinds).toContain("equivalence-eval");
    expect(requirement.statement).toContain("Layer-3");
  });

  test("the Layer-1/2 requirements name their dependent consumers", () => {
    expect(dependentLayerRegressionOf(1).statement).toContain("Layer-2");
    expect(dependentLayerRegressionOf(2).statement).toContain("Layer-3");
  });

  test("the committed checklist projection carries the version + every layer", () => {
    const projection = layerChecklistProjectionJson() as {
      checklistVersion: string;
      gateVocabularyVersion: string;
      layers: { layer: number; gates: unknown[] }[];
    };
    expect(projection.checklistVersion).toBe(LAYER_CHECKLIST_VERSION);
    expect(projection.gateVocabularyVersion).toBe("hfx-401/gate-vocabulary/1");
    expect(projection.layers).toHaveLength(3);
    for (const layer of projection.layers) {
      expect(layer.gates).toHaveLength(10);
    }
  });

  test("the checklists are structurally frozen (byte-stable projection)", () => {
    expect(JSON.stringify(layerChecklistProjectionJson())).toBe(
      JSON.stringify(layerChecklistProjectionJson()),
    );
    expect(LAYER_CHECKLISTS[3].gates).toHaveLength(10);
  });
});
