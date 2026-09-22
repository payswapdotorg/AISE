/**
 * HFX-204 — the IFC-BENCH + BIM-EDIT evaluation corpus CHECK RUNNER test
 * (the tools/ pickup wired into the root `bun run verify` — the
 * building-benchmark convention).
 *
 * Exercises `./runner.ts` over the COMMITTED ARTIFACTS as data (the
 * boundary matrix forbids tools → packages/backend imports): the full
 * check report must be clean, and the mandated discrimination and
 * negative-case assertions are additionally asserted test-by-test from
 * the committed data.
 *
 * Determinism: pure reads of committed files + pure logic; no clock, no
 * randomness, no network, no engine import.
 */

import { describe, expect, test } from "bun:test";
import { loadBimEvalArtifacts, verifyBimEvalArtifacts } from "./runner";

const report = verifyBimEvalArtifacts();

describe("HFX-204 bim-eval: the committed artifacts are coherent", () => {
  test("the full check report is clean", () => {
    expect(report.ok).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(15);
  });

  test("every named check passes (failures list the gap)", () => {
    const failed = report.checks.filter((check) => !check.passed).map((check) => check.id);
    expect(failed).toEqual([]);
  });

  test("the suite is the committed 29-fixture corpus across the two lanes", () => {
    expect(report.summary.total).toBe(29);
    expect(report.summary.byLane).toEqual({
      "bim-edit-operations": 14,
      "ifc-bench-questions": 15,
    });
    expect(report.summary.classificationMatches).toBe(29);
    expect(report.summary.expectedMatches).toBe(29);
  });

  test("the artifact identities are pinned (suite, benchmark, code version, building model)", () => {
    const { scenarioSuite, outcomesSuite } = loadBimEvalArtifacts();
    expect(scenarioSuite["suiteId"]).toBe("bim-eval-suite/1");
    expect(scenarioSuite["version"]).toBe("1.0.0");
    expect(scenarioSuite["benchmarkId"]).toBe("bim-eval-suite/1");
    expect(scenarioSuite["codeVersion"]).toBe("hfx-204/bim-eval/1");
    expect(scenarioSuite["fixtureCount"]).toBe(29);
    expect(outcomesSuite["suiteId"]).toBe("bim-eval-suite/1");
    expect(outcomesSuite["scenarioCount"]).toBe(29);
    const buildingModel = scenarioSuite["buildingModel"] as Record<string, unknown>;
    expect(buildingModel["modelId"]).toBe("bim-eval-tower");
    expect(String(buildingModel["digest"])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("HFX-204 bim-eval: the pinned upstream manifests (the dataset/model-use rule)", () => {
  test("IFC-Bench and BIM-Edit are pinned taxonomy-only and evaluation-only", () => {
    expect(report.checks.find((check) => check.id === "upstream-manifests-pinned")?.passed).toBe(true);
    const { scenarioSuite } = loadBimEvalArtifacts();
    const upstream = scenarioSuite["upstream"] as Record<string, Record<string, unknown>>;
    expect(upstream["ifcBench"]?.["upstreamId"]).toBe("IFC-Bench");
    expect(upstream["bimEdit"]?.["upstreamId"]).toBe("BIM-Edit");
    expect(upstream["ifcBench"]?.["datasetVendored"]).toBe(false);
    expect(upstream["bimEdit"]?.["datasetVendored"]).toBe(false);
    const ifcLicense = upstream["ifcBench"]?.["license"] as Record<string, unknown>;
    expect(ifcLicense["evaluationOnly"]).toBe(true);
    expect(ifcLicense["commercialUse"]).toBe(false);
  });

  test("the in-repo fixture provenance disclaims the upstream datasets", () => {
    const { scenarioSuite } = loadBimEvalArtifacts();
    const upstream = scenarioSuite["upstream"] as Record<string, Record<string, unknown>>;
    expect(String(upstream["ifcBench"]?.["fixtureProvenance"])).toContain("NOT the upstream dataset");
    expect(String(upstream["bimEdit"]?.["fixtureProvenance"])).toContain("NOT the upstream dataset");
  });
});

describe("HFX-204 bim-eval: the five-way discrimination (the HF-2 exit gate)", () => {
  const { outcomes } = loadBimEvalArtifacts();
  const outcomeOf = (fixtureId: string) => {
    const found = outcomes.find((outcome) => outcome.fixtureId === fixtureId);
    if (found === undefined) {
      throw new Error(`no committed outcome for '${fixtureId}'`);
    }
    return found;
  };

  test("the five HF-2 kinds are all present across the committed classifications", () => {
    expect(report.checks.find((check) => check.id === "discrimination-five-way-present")?.passed).toBe(true);
    expect(report.summary.byClassification["perception-failure"]).toBeGreaterThan(0);
    expect(report.summary.byClassification["retrieval-failure"]).toBeGreaterThan(0);
    expect(report.summary.byClassification["reasoning-failure"]).toBeGreaterThan(0);
    expect(report.summary.byClassification["unsupported-data"]).toBeGreaterThan(0);
    expect(report.summary.byClassification["operation-semantic-failure"]).toBeGreaterThan(0);
  });

  test("a misread property (QA lane) is perception-failure, caught by the grounding rule", () => {
    const outcome = outcomeOf("ifc-property-lookup-perception");
    expect(outcome.classification).toBe("perception-failure");
    expect(outcome.violationRules).toEqual(["facts-grounded-in-cited-evidence"]);
  });

  test("wrong-element evidence is retrieval-failure, NOT reasoning-failure", () => {
    const outcome = outcomeOf("ifc-property-lookup-retrieval");
    expect(outcome.classification).toBe("retrieval-failure");
    expect(outcome.classification).not.toBe("reasoning-failure");
    expect(outcome.violationRules).toEqual([]);
  });

  test("grounded facts with a wrong comparison conclusion are reasoning-failure", () => {
    const outcome = outcomeOf("ifc-quantity-lookup-reasoning");
    expect(outcome.classification).toBe("reasoning-failure");
    expect(outcome.violationRules).toEqual([]);
  });

  test("an honest refusal of absent data is unsupported-data, never perception-failure", () => {
    expect(outcomeOf("ifc-property-lookup-unsupported").classification).toBe("unsupported-data");
    expect(outcomeOf("ifc-unavailable-element").classification).toBe("unsupported-data");
  });

  test("a fabricated evidence id is unsupported-data (invented support, not a retrieval miss)", () => {
    const outcome = outcomeOf("ifc-fabricated-evidence");
    expect(outcome.classification).toBe("unsupported-data");
    expect(outcome.violationRules).toEqual(["cited-evidence-exists"]);
  });

  test("an invented measurement (edit lane) is perception-failure via the grounding rule", () => {
    const outcome = outcomeOf("bim-edit-invented-dimension");
    expect(outcome.classification).toBe("perception-failure");
    expect(outcome.violationRules).toEqual(["parameters-grounded-in-bundle"]);
  });

  test("a wrong-unit resolution is operation-semantic-failure (wrong engineering semantics)", () => {
    const outcome = outcomeOf("bim-edit-wrong-unit");
    expect(outcome.classification).toBe("operation-semantic-failure");
    expect(outcome.violationRules).toEqual(["command-semantics-honored", "constraints-honored"]);
  });

  test("a wrong-target resolution (existing element) is operation-semantic-failure, not unsupported-data", () => {
    const outcome = outcomeOf("bim-edit-wrong-target");
    expect(outcome.classification).toBe("operation-semantic-failure");
    expect(outcome.classification).not.toBe("unsupported-data");
  });

  test("a fabricated target for a nonexistent element is unsupported-data, never a shape", () => {
    const outcome = outcomeOf("bim-edit-fabricated-target");
    expect(outcome.classification).toBe("unsupported-data");
    expect(outcome.violationRules).toEqual(["target-references-existing-elements"]);
  });

  test("malformed payloads (envelope and intent) are contract-mismatch, never coerced", () => {
    expect(outcomeOf("ifc-malformed-envelope").classification).toBe("contract-mismatch");
    expect(outcomeOf("bim-edit-malformed-intent").classification).toBe("contract-mismatch");
  });
});

describe("HFX-204 bim-eval: the four AISE negative-case classes", () => {
  const { outcomes } = loadBimEvalArtifacts();
  const outcomeOf = (fixtureId: string) => {
    const found = outcomes.find((outcome) => outcome.fixtureId === fixtureId);
    if (found === undefined) {
      throw new Error(`no committed outcome for '${fixtureId}'`);
    }
    return found;
  };

  test("all four classes carry fixtures with the honest outcome (the runner check)", () => {
    expect(report.checks.find((check) => check.id === "negative-case-classes-honest")?.passed).toBe(true);
  });

  test("unavailable geometry: the refusal is explicit and names the missing element", () => {
    const refusal = outcomeOf("bim-edit-unavailable-geometry");
    expect(refusal.classification).toBe("unsupported-data");
    expect(refusal.violationRules).toEqual([]);
  });

  test("conflicting evidence: the conflict is surfaced (status conflicted), silence is reasoning-failure", () => {
    const surfaced = outcomeOf("ifc-conflicting-evidence");
    expect(surfaced.classification).toBe("none");
    expect(surfaced.resultStatus).toBe("conflicted");
    const silent = outcomeOf("ifc-conflicting-evidence-silent-resolution");
    expect(silent.classification).toBe("reasoning-failure");
  });

  test("missing dimensions: the clarification refusal never invents a measurement", () => {
    const refusal = outcomeOf("bim-edit-missing-dimensions");
    expect(refusal.classification).toBe("unsupported-data");
    expect(refusal.violationRules).toEqual([]);
    const invented = outcomeOf("bim-edit-invented-dimension");
    expect(invented.classification).toBe("perception-failure");
  });

  test("invalid constraints: the violated constraint is named and classified operation-semantic-failure", () => {
    const outcome = outcomeOf("bim-edit-invalid-constraint");
    expect(outcome.classification).toBe("operation-semantic-failure");
    expect(outcome.violationRules).toEqual(["constraints-honored"]);
    expect(outcome.oracleMatch).toBe(true);
  });
});

describe("HFX-204 bim-eval: the emission shape and the committed summary", () => {
  test("every outcome is content-addressed with matched expectations", () => {
    expect(report.checks.find((check) => check.id === "emission-content-addressed")?.passed).toBe(true);
  });

  test("the per-classification counts are the committed golden table", () => {
    expect(report.summary.byClassification).toEqual({
      "contract-mismatch": 2,
      none: 13,
      "operation-semantic-failure": 3,
      "perception-failure": 2,
      "reasoning-failure": 2,
      "retrieval-failure": 1,
      "unsupported-data": 6,
    });
  });

  test("the provenance-manifest aggregate digest is pinned", () => {
    expect(report.summary.provenanceManifestDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(report.summary.provenanceManifestDigest).toBe(
      "11cb542b1263c94b03397b5b7ca98307335c7795c473c0f4cac4fb36753ce8c5",
    );
  });
});
