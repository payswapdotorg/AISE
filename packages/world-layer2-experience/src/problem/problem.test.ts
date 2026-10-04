/**
 * WORLD-P2 — the PROBLEM family test suite (stages 1–2: PROBLEM +
 * CONTEXT).
 *
 * Drills: the sealed kinds + closed vocabularies; the fail-closed
 * spatial-binding laws (unresolved element ids, scene-revision mismatch,
 * structurally invalid scene); the substrate-candidate composition laws
 * (the P0-B mapping-block laws applied verbatim — INFERRED seeds, digest
 * ids, evidence binding, no external label as identity); the
 * observation-evidence law; the two substitution doubles' BYTE-IDENTICAL
 * assembly on the committed fixtures; the P0-B IFC double composition
 * (both its own reference and alternate doubles yield the same
 * extraction, so the lane's substrate input is substitution-stable); the
 * determinism seal; and the identity-law fuzz (GUID-shaped and
 * TopoDS-shaped labels never pass as canonical ids).
 */

import { describe, expect, test } from "bun:test";
import { CONTRACT_VERSION, decodePropertyAssertion, decodeRealityObject } from "@aise/shared-contracts";
import {
  alternateIfcDouble,
  referenceIfcDouble,
  validateAiseMappingBlock,
} from "@aise/world-understanding-substrate";
import { validateScene } from "@aise/world-reality-substrate";
import {
  alternateContextAssemblerDouble,
  assembleThroughContextPort,
  defineEngineeringProblem,
  fixtureIfcExtraction,
  labelsOfExtraction,
  referenceContextAssemblerDouble,
  validateCaseContext,
  validateDefineProblemInput,
  validateEngineeringProblem,
  validateSubstrateCandidateSet,
  type CaseContext,
  type CaseContextAssembler,
} from "./index";
import {
  FIXTURE_ELEMENT_WALL,
  FIXTURE_IFC_EXTRACTION,
  FIXTURE_OBSERVATIONS,
  FIXTURE_PROBLEM,
  FIXTURE_PROBLEM_ID,
  FIXTURE_PROBLEM_INPUT,
  FIXTURE_SCENE,
  FIXTURE_SUBSTRATE_CANDIDATES,
  INVALID_SCENE,
  UNRESOLVED_BINDING_PROBLEM_INPUT,
  WRONG_REVISION_PROBLEM_INPUT,
} from "./corpus";
import { FIXTURE_WALL_REALITY_OBJECT, fixtureScenarioB } from "../lane";
import { FIXTURE_MEASUREMENT_DEFLECTION, SCENARIO_B_ASSERTIONS } from "../evidence/corpus";

/** Both substitution doubles (every assembly test runs over BOTH paths). */
const DOUBLES: readonly { readonly name: string; readonly assembler: CaseContextAssembler }[] = [
  { name: "reference", assembler: referenceContextAssemblerDouble },
  { name: "alternate", assembler: alternateContextAssemblerDouble },
];

/** The canonical CONTEXT request built from the committed fixtures. */
function contextRequest() {
  return {
    problem: FIXTURE_PROBLEM,
    scene: FIXTURE_SCENE,
    realityObjects: [FIXTURE_WALL_REALITY_OBJECT],
    measurements: [FIXTURE_MEASUREMENT_DEFLECTION],
    propertyAssertions: SCENARIO_B_ASSERTIONS,
    observations: FIXTURE_OBSERVATIONS,
    substrateCandidates: FIXTURE_SUBSTRATE_CANDIDATES,
    assembledAt: "2026-10-02T08:00:00.000Z",
  };
}

/** Assembles the fixture context through one double (asserts ok). */
function assembleFixture(assembler: CaseContextAssembler): CaseContext {
  const outcome = assembleThroughContextPort(assembler, contextRequest());
  expect(outcome.ok).toBe(true);
  if (outcome.ok) {
    return outcome.value;
  }
  throw new Error(`fixture assembly failed: ${outcome.failure.detail}`);
}

describe("problem — the sealed kinds + closed vocabularies", () => {
  test("the fixture problem seals with the committed shape and a content-derived id", () => {
    expect(FIXTURE_PROBLEM.kind).toBe("engineering-problem");
    expect(FIXTURE_PROBLEM.schemaVersion).toBe("engineering-problem/1");
    expect(FIXTURE_PROBLEM.contractVersion).toBe(CONTRACT_VERSION);
    expect(FIXTURE_PROBLEM.status).toBe("open");
    expect(FIXTURE_PROBLEM.questionKind).toBe("condition_assessment");
    expect(FIXTURE_PROBLEM_ID).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the validators accept the fixture and reject shape violations with typed failures", () => {
    expect(validateDefineProblemInput(FIXTURE_PROBLEM_INPUT).ok).toBe(true);
    expect(validateEngineeringProblem(FIXTURE_PROBLEM).ok).toBe(true);
    const bad = validateDefineProblemInput({ title: "", statement: "x" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.failures.some((failure) => failure.kind === "type-mismatch")).toBe(true);
    }
    const badStatus = validateEngineeringProblem({ ...FIXTURE_PROBLEM, status: "dispatched" });
    expect(badStatus.ok).toBe(false);
    if (!badStatus.ok) {
      expect(
        badStatus.failures.some((failure) => failure.kind === "vocabulary-violation"),
      ).toBe(true);
    }
  });
});

describe("problem — the fail-closed spatial binding (law #1)", () => {
  test("a binding citing an element absent from the scene is refused", () => {
    const outcome = defineEngineeringProblem(UNRESOLVED_BINDING_PROBLEM_INPUT, FIXTURE_SCENE);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.detail).toContain("unresolved scene element ids");
    }
  });

  test("a binding citing the wrong scene revision is refused", () => {
    const outcome = defineEngineeringProblem(WRONG_REVISION_PROBLEM_INPUT, FIXTURE_SCENE);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("revision");
    }
  });

  test("a structurally invalid scene (duplicate element id) is refused", () => {
    const input = { ...FIXTURE_PROBLEM_INPUT };
    const outcome = defineEngineeringProblem(input, INVALID_SCENE);
    expect(validateScene(INVALID_SCENE).length).toBeGreaterThan(0);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("operation-semantic-failure");
    }
  });

  test("the fixture scene itself is structurally valid", () => {
    expect(validateScene(FIXTURE_SCENE)).toEqual([]);
  });
});

describe("problem — the substrate-candidate composition (the P0-B laws, verbatim)", () => {
  test("the fixture candidate set passes the substrate's own mapping-block validator", () => {
    const candidate = FIXTURE_SUBSTRATE_CANDIDATES[0]!;
    const validation = validateSubstrateCandidateSet(candidate);
    expect(validation.ok).toBe(true);
    const mapping = validateAiseMappingBlock(candidate.aise, {
      externalLabelValues: candidate.externalLabels.map((label) => label.value),
      evidenceContentId: candidate.evidenceContentId,
    });
    expect(mapping.ok).toBe(true);
  });

  test("the composed extraction is semantically IDENTICAL through both P0-B IFC doubles (composition stability)", () => {
    const viaReference = fixtureIfcExtraction(referenceIfcDouble);
    const viaAlternate = fixtureIfcExtraction(alternateIfcDouble);
    /* The P0-B substitution discipline: semantic fields byte-identical;
     * only the provider identity (provenance/methodVersion) differs. */
    expect(viaReference.resultId).not.toBe(viaAlternate.resultId);
    expect(viaReference.aise.realityObjects).toEqual(viaAlternate.aise.realityObjects);
    expect(viaReference.aise.propertyAssertions).toEqual(viaAlternate.aise.propertyAssertions);
    expect(viaReference.aise.measurements).toEqual(viaAlternate.aise.measurements);
    expect(viaReference.aise.derivation.method).toBe(viaAlternate.aise.derivation.method);
    expect(viaReference.aise.derivation.methodVersion).not.toBe(
      viaAlternate.aise.derivation.methodVersion,
    );
    expect(viaReference.elements).toEqual(viaAlternate.elements);
    expect(viaReference.resultId).toBe(FIXTURE_IFC_EXTRACTION.resultId);
    /* The labels the lane scans for the identity law are the extraction's own. */
    expect(labelsOfExtraction(viaReference).length).toBeGreaterThan(0);
  });

  test("substrate seeds stay INFERRED and decode through the shared wire codecs", () => {
    const aise = FIXTURE_SUBSTRATE_CANDIDATES[0]!.aise;
    expect(aise.propertyAssertions.length).toBeGreaterThan(0);
    for (const assertion of aise.propertyAssertions) {
      expect(assertion.status).toBe("INFERRED");
      expect(() => decodePropertyAssertion(assertion)).not.toThrow();
    }
    for (const object of aise.realityObjects) {
      expect(() => decodeRealityObject(object)).not.toThrow();
    }
  });

  test("an INFERRED-violating candidate set is refused (the epistemic law at composition)", () => {
    const candidate = FIXTURE_SUBSTRATE_CANDIDATES[0]!;
    const bad = {
      ...candidate,
      aise: {
        ...candidate.aise,
        propertyAssertions: candidate.aise.propertyAssertions.map((assertion) => ({
          ...assertion,
          status: "OBSERVED",
        })),
      },
    };
    const validation = validateSubstrateCandidateSet(bad);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some(
          (failure) => failure.kind === "substrate-candidate-invalid",
        ),
      ).toBe(true);
    }
  });

  test("a label-as-identity candidate set is refused (the identity law at composition)", () => {
    const candidate = FIXTURE_SUBSTRATE_CANDIDATES[0]!;
    const guid = labelsOfExtraction(FIXTURE_IFC_EXTRACTION)[0]!.value;
    const bad = {
      ...candidate,
      aise: {
        ...candidate.aise,
        realityObjects: candidate.aise.realityObjects.map((object) => ({
          ...object,
          objectId: guid,
        })),
      },
    };
    const validation = validateSubstrateCandidateSet(bad);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.path.includes("objectId")),
      ).toBe(true);
    }
  });
});

describe("problem — the CONTEXT assembly (stage 2)", () => {
  for (const double of DOUBLES) {
    test(`the ${double.name} double assembles the fixture context with a content-derived id`, () => {
      const context = assembleFixture(double.assembler);
      expect(context.kind).toBe("case-context");
      expect(context.contextId).toMatch(/^[0-9a-f]{64}$/);
      expect(context.problemId).toBe(FIXTURE_PROBLEM_ID);
      expect(context.sceneRevision).toBe(FIXTURE_SCENE.revision);
      expect(context.boundElementIds).toContain(FIXTURE_ELEMENT_WALL);
      expect(context.substrateCandidates).toHaveLength(1);
      expect(context.observations).toHaveLength(2);
      expect(validateCaseContext(context).ok).toBe(true);
    });
  }

  test("the two doubles produce BYTE-IDENTICAL contexts (the substitution pair)", () => {
    const reference = assembleFixture(referenceContextAssemblerDouble);
    const alternate = assembleFixture(alternateContextAssemblerDouble);
    expect(reference).toEqual(alternate);
    expect(reference.contextId).toBe(alternate.contextId);
  });

  test("determinism: the same request through the same double seals identically", () => {
    for (const double of DOUBLES) {
      const first = assembleFixture(double.assembler);
      const second = assembleFixture(double.assembler);
      expect(first).toEqual(second);
    }
  });

  test("an observation without evidence is refused at the governed entry", () => {
    const request = {
      ...contextRequest(),
      observations: [
        ...FIXTURE_OBSERVATIONS,
        {
          contractVersion: CONTRACT_VERSION,
          observationId: "x".repeat(64),
          subjectRef: FIXTURE_WALL_REALITY_OBJECT.objectId,
          statement: "An unevidenced observation — must be refused.",
          observedAt: "2026-10-02T08:00:00.000Z",
          observer: "field-engineer-f",
          evidenceContentIds: [],
        },
      ],
    };
    const outcome = assembleThroughContextPort(referenceContextAssemblerDouble, request);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("Evidence Envelope law");
    }
  });

  test("a smuggled non-OBSERVED status on an observation is refused by the context validator", () => {
    const request = {
      ...contextRequest(),
      observations: FIXTURE_OBSERVATIONS.map((observation) => ({
        ...observation,
        epistemicStatus: "INFERRED" as const,
      })),
    };
    const outcome = assembleThroughContextPort(referenceContextAssemblerDouble, request);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("epistemicStatus");
      expect(outcome.failure.detail).toContain("never INFERRED");
    }
  });

  test("the lane scenario B carries the same substrate candidates (composition re-check)", () => {
    const scenario = fixtureScenarioB();
    expect(scenario.substrateCandidates).toBe(FIXTURE_SUBSTRATE_CANDIDATES);
    expect(scenario.scene).toBe(FIXTURE_SCENE);
  });
});

describe("problem — the identity-law fuzz (label-shaped ids never pass)", () => {
  test("GUID-shaped, TopoDS-shaped and VTK-shaped values are never valid canonical ids", () => {
    const labelShapes = [
      "0xScRe4drECQ4DMSqUjd6d",
      "2FC50d1t5EQBcVMletRj35",
      "TopoDS_Face_7",
      "vtkDataObject-42",
      "",
      "short",
    ];
    for (const shape of labelShapes) {
      const bad = validateEngineeringProblem({
        ...FIXTURE_PROBLEM,
        problemId: shape,
      });
      expect(bad.ok).toBe(false);
      if (!bad.ok) {
        expect(bad.failures.some((failure) => failure.kind === "digest-format")).toBe(true);
      }
    }
  });

  test("fuzz: randomized 63-hex and 65-hex ids never pass the digest gate", () => {
    let seed = 0x2a02;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    for (let iteration = 0; iteration < 500; iteration += 1) {
      const length = next() % 2 === 0 ? 63 : 65;
      let id = "";
      for (let char = 0; char < length; char += 1) {
        id += "0123456789abcdef"[next() % 16]!;
      }
      const bad = validateEngineeringProblem({ ...FIXTURE_PROBLEM, problemId: id });
      expect(bad.ok).toBe(false);
    }
  });
});
