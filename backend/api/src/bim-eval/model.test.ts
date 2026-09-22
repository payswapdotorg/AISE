/**
 * HFX-204 — the bim-eval MODEL tests: the frozen vocabularies, the pinned
 * upstream manifests (the dataset/model-use rule), the building-model
 * fixture and the fail-closed boundary parsers (typed errors, never silent
 * coercion).
 */

import { describe, expect, test } from "bun:test";
import {
  BIM_EDIT_COMMAND_FORMS,
  BIM_EDIT_EDIT_CLASSES,
  BIM_EDIT_INTEGRITY_RULES,
  BIM_EDIT_RULE_KINDS,
  BIM_EDIT_UPSTREAM_MANIFEST,
  BIM_EVAL_ERROR_CODES,
  BIM_EVAL_LANES,
  BIM_EVAL_UPSTREAM_MANIFESTS,
  BIM_NEGATIVE_CASE_CLASSES,
  BimEvalError,
  IFC_BENCH_QUESTION_CLASSES,
  IFC_BENCH_UPSTREAM_MANIFEST,
  UPSTREAM_BENCHMARK_IDS,
  buildUpstreamBenchmarkManifest,
  isBimEditEditClass,
  isBimEditIntegrityRule,
  isBimEvalLane,
  isIfcBenchQuestionClass,
  parseBimBuildingModel,
  parseBimEditBundle,
  parseBimEditFixture,
  parseBimQuestionFixture,
  parseUpstreamBenchmarkManifest,
} from "./model";
import { BIM_EVAL_BUILDING_MODEL, BIM_EVAL_EDIT_FIXTURES, BIM_EVAL_QUESTION_FIXTURES } from "./testkit";

/* A committed edit bundle at hand for the negative-path parsers. */
const COMMITTED_EDIT_BUNDLE_JSON = (() => {
  const fixture = BIM_EVAL_EDIT_FIXTURES[0] as unknown as Record<string, unknown>;
  const input = fixture["input"] as Record<string, unknown>;
  const payload = input["payload"] as Record<string, unknown>;
  return String(payload["bundleJson"]);
})();

/* ------------------------------------------------------------------ */

describe("HFX-204 model: the frozen vocabularies", () => {
  test("the two corpus lanes are frozen and guarded", () => {
    expect([...BIM_EVAL_LANES]).toEqual(["ifc-bench-questions", "bim-edit-operations"]);
    expect(isBimEvalLane("ifc-bench-questions")).toBe(true);
    expect(isBimEvalLane("vlm")).toBe(false);
  });

  test("the IFC-Bench question taxonomy is frozen (the pinned upstream classes)", () => {
    expect([...IFC_BENCH_QUESTION_CLASSES]).toEqual([
      "property-lookup",
      "quantity-lookup",
      "spatial-composition",
      "part-of-topology",
      "connected-to-topology",
      "classification",
    ]);
    expect(isIfcBenchQuestionClass("property-lookup")).toBe(true);
    expect(isIfcBenchQuestionClass("reasoning")).toBe(false);
  });

  test("the BIM-Edit edit taxonomy is frozen (the pinned upstream classes)", () => {
    expect([...BIM_EDIT_EDIT_CLASSES]).toEqual([
      "element-create",
      "element-update",
      "element-delete",
      "spatial-change",
      "topological-change",
    ]);
    expect(isBimEditEditClass("element-create")).toBe(true);
    expect(isBimEditEditClass("element-rename")).toBe(false);
  });

  test("the two command forms (natural-language and direct-intent) are frozen", () => {
    expect([...BIM_EDIT_COMMAND_FORMS]).toEqual(["natural-language", "direct-intent"]);
  });

  test("the four AISE negative-case classes are frozen", () => {
    expect([...BIM_NEGATIVE_CASE_CLASSES]).toEqual([
      "unavailable-geometry",
      "conflicting-evidence",
      "missing-dimensions",
      "invalid-constraints",
    ]);
  });

  test("the BIM-Edit integrity rules are frozen and map onto CLOSED failure kinds only", () => {
    expect([...BIM_EDIT_INTEGRITY_RULES]).toEqual([
      "intent-contract-decodable",
      "target-references-existing-elements",
      "parameters-grounded-in-bundle",
      "command-semantics-honored",
      "constraints-honored",
    ]);
    expect(isBimEditIntegrityRule("constraints-honored")).toBe(true);
    expect(isBimEditIntegrityRule("made-up-rule")).toBe(false);
    for (const rule of BIM_EDIT_INTEGRITY_RULES) {
      expect(typeof BIM_EDIT_RULE_KINDS[rule]).toBe("string");
    }
    expect(BIM_EDIT_RULE_KINDS["intent-contract-decodable"]).toBe("contract-mismatch");
    expect(BIM_EDIT_RULE_KINDS["target-references-existing-elements"]).toBe("unsupported-data");
    expect(BIM_EDIT_RULE_KINDS["parameters-grounded-in-bundle"]).toBe("perception-failure");
    expect(BIM_EDIT_RULE_KINDS["command-semantics-honored"]).toBe("operation-semantic-failure");
    expect(BIM_EDIT_RULE_KINDS["constraints-honored"]).toBe("operation-semantic-failure");
  });

  test("the typed error codes are frozen", () => {
    expect([...BIM_EVAL_ERROR_CODES]).toEqual([
      "invalid_request",
      "invalid_fixture",
      "invalid_bundle",
      "invalid_manifest",
      "invalid_profile",
      "invalid_input",
      "unknown_fixture",
    ]);
  });
});

/* ------------------------------------------------------------------ */

describe("HFX-204 model: the pinned upstream manifests (the dataset/model-use rule)", () => {
  test("both upstream identities are pinned with taxonomy-only versions", () => {
    expect([...UPSTREAM_BENCHMARK_IDS]).toEqual(["IFC-Bench", "BIM-Edit"]);
    expect(IFC_BENCH_UPSTREAM_MANIFEST.upstreamId).toBe("IFC-Bench");
    expect(BIM_EDIT_UPSTREAM_MANIFEST.upstreamId).toBe("BIM-Edit");
    expect(IFC_BENCH_UPSTREAM_MANIFEST.pinnedVersion).toBe(
      "ifc-bench-question-taxonomy-2025-pinned",
    );
    expect(BIM_EDIT_UPSTREAM_MANIFEST.pinnedVersion).toBe(
      "bim-edit-edit-class-taxonomy-2025-pinned",
    );
  });

  test("the pinned upstream licenses are EVALUATION-ONLY by derivation (unverified offline)", () => {
    for (const manifest of BIM_EVAL_UPSTREAM_MANIFESTS) {
      expect(manifest.license.commercialUse).toBe(false);
      expect(manifest.license.intendedUseCleared).toBe(false);
      expect(manifest.license.evaluationOnly).toBe(true);
    }
  });

  test("no upstream dataset is vendored and the fixture provenance says so", () => {
    for (const manifest of BIM_EVAL_UPSTREAM_MANIFESTS) {
      expect(manifest.datasetVendored).toBe(false);
      expect(manifest.fixtureProvenance).toContain("in-repo deterministic fixtures");
      expect(manifest.fixtureProvenance).toContain("NOT the upstream dataset");
      expect(manifest.taxonomy.length).toBeGreaterThan(0);
    }
  });

  test("parseUpstreamBenchmarkManifest accepts the pinned manifests and fails closed on drift", () => {
    for (const manifest of BIM_EVAL_UPSTREAM_MANIFESTS) {
      expect(parseUpstreamBenchmarkManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
    }
    expect(() => parseUpstreamBenchmarkManifest("nope")).toThrow(BimEvalError);
    expect(() => parseUpstreamBenchmarkManifest({ kind: "other" })).toThrow(BimEvalError);
    // a hand-declared evaluationOnly flag that violates the derivation invariant is refused
    const tampered = JSON.parse(JSON.stringify(IFC_BENCH_UPSTREAM_MANIFEST)) as Record<
      string,
      unknown
    >;
    const license = tampered["license"] as Record<string, unknown>;
    license["evaluationOnly"] = false;
    expect(() => parseUpstreamBenchmarkManifest(tampered)).toThrow(/derivation invariant/);
    // vendoring upstream data is structurally refused
    const vendoring = JSON.parse(JSON.stringify(BIM_EDIT_UPSTREAM_MANIFEST)) as Record<
      string,
      unknown
    >;
    vendoring["datasetVendored"] = true;
    expect(() => parseUpstreamBenchmarkManifest(vendoring)).toThrow(/datasetVendored/);
  });

  test("buildUpstreamBenchmarkManifest derives the flag through the control plane discipline", () => {
    const cleared = buildUpstreamBenchmarkManifest({
      upstreamId: "IFC-Bench",
      pinnedVersion: "test/1",
      license: {
        identifier: "test-license",
        commercialUse: true,
        intendedUse: "production",
        intendedUseCleared: true,
      },
      fixtureProvenance: "test provenance",
      taxonomy: ["property-lookup"],
    });
    expect(cleared.license.evaluationOnly).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe("HFX-204 model: the building-model fixture", () => {
  test("the committed building model parses (fail-closed self-check)", () => {
    const parsed = parseBimBuildingModel(JSON.parse(JSON.stringify(BIM_EVAL_BUILDING_MODEL)));
    expect(parsed.modelId).toBe("bim-eval-tower");
    expect(parsed.elements.length).toBe(8);
    expect(parsed.storeys.length).toBe(2);
    expect(parsed.topology.length).toBe(3);
  });

  test("parseBimBuildingModel fails closed on broken worlds", () => {
    const base = JSON.parse(JSON.stringify(BIM_EVAL_BUILDING_MODEL)) as Record<string, unknown>;
    const withGhost = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    (withGhost["storeys"] as Record<string, unknown>[])[0]!["contains"] = [
      "wall-W1",
      "wall-WX",
    ];
    expect(() => parseBimBuildingModel(withGhost)).toThrow(/wall-WX/);
    const dup = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    (dup["elements"] as Record<string, unknown>[])[1]!["elementId"] = "wall-W1";
    expect(() => parseBimBuildingModel(dup)).toThrow(/duplicate element id/);
    expect(() => parseBimBuildingModel(42)).toThrow(BimEvalError);
  });
});

/* ------------------------------------------------------------------ */

describe("HFX-204 model: parseBimQuestionFixture (fail closed)", () => {
  test("every committed question fixture round-trips through the parser", () => {
    expect(BIM_EVAL_QUESTION_FIXTURES.length).toBe(15);
    for (const fixture of BIM_EVAL_QUESTION_FIXTURES) {
      const parsed = parseBimQuestionFixture(JSON.parse(JSON.stringify(fixture)));
      expect(parsed.fixtureId).toBe(fixture.fixtureId);
      expect(parsed.questionClass).toBe(fixture.questionClass);
      expect(parsed.negativeCase).toBe(fixture.negativeCase);
      expect(parsed.scenario.lane).toBe("document-understanding");
    }
  });

  test("a non-object or wrongly-sealed fixture is rejected", () => {
    expect(() => parseBimQuestionFixture("nope")).toThrow(BimEvalError);
    expect(() => parseBimQuestionFixture({ kind: "bim-edit-fixture" })).toThrow(/bim-question-fixture/);
  });

  test("a fixture outside the pinned question taxonomy is rejected", () => {
    const fixture = JSON.parse(
      JSON.stringify(BIM_EVAL_QUESTION_FIXTURES[0]),
    ) as Record<string, unknown>;
    fixture["questionClass"] = "free-form-chat";
    expect(() => parseBimQuestionFixture(fixture)).toThrow(/questionClass/);
  });

  test("a scenario id mismatch between wrapper and scenario is rejected", () => {
    const fixture = JSON.parse(
      JSON.stringify(BIM_EVAL_QUESTION_FIXTURES[0]),
    ) as Record<string, unknown>;
    fixture["fixtureId"] = "another-id";
    expect(() => parseBimQuestionFixture(fixture)).toThrow(/does not match the fixture id/);
  });

  test("a fixture riding the wrong Layer-2 lane is rejected", () => {
    const fixture = JSON.parse(
      JSON.stringify(BIM_EVAL_QUESTION_FIXTURES[0]),
    ) as Record<string, unknown>;
    const scenario = fixture["scenario"] as Record<string, unknown>;
    scenario["lane"] = "retrieval";
    expect(() => parseBimQuestionFixture(fixture)).toThrow(/document-understanding/);
  });
});

/* ------------------------------------------------------------------ */

describe("HFX-204 model: parseBimEditBundle (fail closed)", () => {
  const bundleJson = COMMITTED_EDIT_BUNDLE_JSON;

  test("every committed edit fixture's bundle round-trips", () => {
    expect(BIM_EVAL_EDIT_FIXTURES.length).toBe(14);
    for (const fixture of BIM_EVAL_EDIT_FIXTURES) {
      const payload = fixture.input.payload as Record<string, unknown>;
      const bundle = parseBimEditBundle(JSON.parse(String(payload["bundleJson"])));
      expect(bundle.fixtureId).toBe(fixture.fixtureId);
      expect(bundle.modelNodeIds.length).toBe(10);
      expect(bundle.referencedElements.length).toBeGreaterThan(0);
    }
  });

  test("an edit class outside the pinned taxonomy is rejected", () => {
    const bundle = JSON.parse(bundleJson) as Record<string, unknown>;
    bundle["editClass"] = "element-rename";
    expect(() => parseBimEditBundle(bundle)).toThrow(/editClass/);
  });

  test("a referencedElements exists flag contradicting the model universe is rejected", () => {
    const bundle = JSON.parse(bundleJson) as Record<string, unknown>;
    (bundle["referencedElements"] as Record<string, unknown>[])[0]!["exists"] = false;
    expect(() => parseBimEditBundle(bundle)).toThrow(/contradicts the model node universe/);
  });

  test("a constraint without its required unit/maxValue is rejected", () => {
    const bundle = JSON.parse(bundleJson) as Record<string, unknown>;
    bundle["constraints"] = [
      { constraintId: "c1", kind: "max-numeric-parameter", statement: "s", parameterName: "width" },
    ];
    expect(() => parseBimEditBundle(bundle)).toThrow(/maxValue/);
    const bundle2 = JSON.parse(bundleJson) as Record<string, unknown>;
    bundle2["constraints"] = [
      { constraintId: "c1", kind: "parameter-unit", statement: "s", parameterName: "width" },
    ];
    expect(() => parseBimEditBundle(bundle2)).toThrow(/parameter-unit/);
  });

  test("a direct intent without a unit on a numeric parameter is rejected (the typed-unit discipline)", () => {
    const bundle = JSON.parse(bundleJson) as Record<string, unknown>;
    bundle["command"] = {
      form: "direct-intent",
      intent: {
        operationType: "block-wall-placement",
        parameters: [{ name: "length", value: 3 }],
        targetSelectorKind: "storey",
        targetNodeRefs: ["storey-01"],
        targetUnits: { linear: "mm", angular: "rad" },
      },
    };
    expect(() => parseBimEditBundle(bundle)).toThrow(/without an explicit unit/);
  });
});

/* ------------------------------------------------------------------ */

describe("HFX-204 model: parseBimEditFixture (fail closed)", () => {
  test("every committed edit fixture round-trips through the parser", () => {
    for (const fixture of BIM_EVAL_EDIT_FIXTURES) {
      const parsed = parseBimEditFixture(JSON.parse(JSON.stringify(fixture)));
      expect(parsed.fixtureId).toBe(fixture.fixtureId);
      expect(parsed.editClass).toBe(fixture.editClass);
      expect(parsed.commandForm).toBe(fixture.commandForm);
      expect(parsed.behavior).toBe(fixture.behavior);
      expect(parsed.expected.expectedFailureKind).toBe(fixture.expected.expectedFailureKind);
    }
  });

  test("an invented failure kind in the expected block is rejected (closed vocabulary)", () => {
    const fixture = JSON.parse(
      JSON.stringify(BIM_EVAL_EDIT_FIXTURES[0]),
    ) as Record<string, unknown>;
    const expected = fixture["expected"] as Record<string, unknown>;
    expected["expectedFailureKind"] = "vibes-failure";
    expect(() => parseBimEditFixture(fixture)).toThrow(/CLOSED failure kinds/);
  });

  test("a replay fixture without its scripted intent is rejected", () => {
    const fixture = JSON.parse(
      JSON.stringify(BIM_EVAL_EDIT_FIXTURES[0]),
    ) as Record<string, unknown>;
    const input = fixture["input"] as Record<string, unknown>;
    const payload = input["payload"] as Record<string, unknown>;
    delete payload["variantScript"];
    expect(() => parseBimEditFixture(fixture)).toThrow(/variantScript/);
  });

  test("a behavior tag disagreeing with the fixture behavior is rejected", () => {
    const fixture = JSON.parse(
      JSON.stringify(BIM_EVAL_EDIT_FIXTURES[0]),
    ) as Record<string, unknown>;
    fixture["behavior"] = "refuse";
    expect(() => parseBimEditFixture(fixture)).toThrow(/behaviorTag/);
  });

  test("a numeric expected-intent parameter without a unit is rejected", () => {
    const fixture = JSON.parse(
      JSON.stringify(BIM_EVAL_EDIT_FIXTURES[0]),
    ) as Record<string, unknown>;
    const expected = fixture["expected"] as Record<string, unknown>;
    const intent = expected["expectedIntent"] as Record<string, unknown>;
    (intent["parameters"] as Record<string, unknown>[])[0]!["unit"] = undefined;
    expect(() => parseBimEditFixture(fixture)).toThrow(/typed-unit/);
  });
});
