/**
 * Cross-field invariant tests (PROD-021): the typed semantic checks of
 * src/invariants.ts — units, anchoring, provenance, dependency sanity,
 * state/version consistency, snapshot worst-of, trace pinning, capability
 * uniqueness — plus the corpus guarantee that every committed VALID fixture
 * passes every invariant of its object.
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkEngineeringOperationIntent,
  checkEngineeringOperation,
  checkOperationTarget,
  checkOperationProvenance,
  checkProposedState,
  checkSolution,
  checkSolutionVersion,
  checkSolutionValidationSnapshot,
  checkOperationCapabilityProfile,
  checkSolutionBoqTraceSet,
  checkSolutionContractObject,
  validationOutcomeWorstOf,
  createOperationIntent,
  decodeEngineeringOperationIntent,
  decodeEngineeringOperation,
  decodeProposedState,
  decodeSolution,
  decodeSolutionVersion,
  decodeSolutionValidationSnapshot,
  decodeOperationCapabilityProfile,
  decodeSolutionBoqTraceSet,
  loadCommittedFixtures,
  REFERENCE_BUILDING_DOMAIN,
  SolutionContractEncodeError,
} from "./index";

const FIXTURE = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", "fixtures", path), "utf8")) as Record<
    string,
    unknown
  >;

const intentDirect = decodeEngineeringOperationIntent(
  FIXTURE("operation/EngineeringOperationIntent.valid-excavation-direct.json"),
);

describe("typed parameters (units are never optional for numbers)", () => {
  test("a numeric parameter without a unit produces numeric_parameter_without_unit", () => {
    const mutated = JSON.parse(JSON.stringify(intentDirect));
    delete mutated.parameters[0].unit;
    const findings = checkEngineeringOperationIntent(mutated);
    expect(findings.some((f) => f.code === "numeric_parameter_without_unit")).toBe(true);
  });

  test("a non-numeric parameter without a unit is fine (materials carry none)", () => {
    const findings = checkEngineeringOperationIntent(intentDirect);
    expect(
      findings.filter((f) => f.code === "numeric_parameter_without_unit"),
    ).toHaveLength(0);
  });

  test("the finding carries the parameter path and a deterministic detail", () => {
    const mutated = JSON.parse(JSON.stringify(intentDirect));
    delete mutated.parameters[0].unit;
    const finding = checkEngineeringOperationIntent(mutated).find(
      (f) => f.code === "numeric_parameter_without_unit",
    );
    expect(finding?.path).toEqual(["parameters", 0]);
    expect(finding?.detail).toContain("depth");
  });
});

describe("spatial target anchoring", () => {
  test("an unanchored target produces unanchored_operation_target", () => {
    const mutated = JSON.parse(JSON.stringify(intentDirect));
    mutated.target.nodeRefs = [];
    mutated.target.geometryRefs = [];
    const findings = checkEngineeringOperationIntent(mutated);
    expect(findings.some((f) => f.code === "unanchored_operation_target")).toBe(true);
  });

  test("a node-anchored target and a geometry-anchored target are both fine", () => {
    const nodeOnly = JSON.parse(JSON.stringify(intentDirect));
    nodeOnly.target.geometryRefs = [];
    expect(checkOperationTarget(nodeOnly.target)).toHaveLength(0);
    const geometryOnly = JSON.parse(JSON.stringify(intentDirect));
    geometryOnly.target.nodeRefs = [];
    expect(checkOperationTarget(geometryOnly.target)).toHaveLength(0);
  });
});

describe("operation provenance", () => {
  test("no evidence, no note, no command produces missing_operation_provenance", () => {
    const provenance = {
      origin: "direct-manipulation" as const,
      authoredBy: "user-demo-engineer",
      authoredAt: "2026-09-16T09:00:00.000Z",
      evidenceIds: [],
    };
    const findings = checkOperationProvenance(provenance);
    expect(findings.map((f) => f.code)).toEqual(["missing_operation_provenance"]);
  });

  test("each of evidence / derivation note / agent command satisfies provenance alone", () => {
    const base = {
      origin: "direct-manipulation" as const,
      authoredBy: "user-demo-engineer",
      authoredAt: "2026-09-16T09:00:00.000Z",
    };
    expect(
      checkOperationProvenance({
        ...base,
        evidenceIds: ["0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"],
      }),
    ).toHaveLength(0);
    expect(
      checkOperationProvenance({ ...base, evidenceIds: [], derivationNote: "direct" }),
    ).toHaveLength(0);
    expect(
      checkOperationProvenance({
        ...base,
        evidenceIds: [],
        commandText: "Excavate a pit 1.5 m deep.",
      }),
    ).toHaveLength(0);
  });
});

describe("operation records", () => {
  test("a self-referencing dependency produces self_referencing_operation_dependency", () => {
    const operation = decodeEngineeringOperation(
      FIXTURE("operation/EngineeringOperation.valid-block-wall.json"),
    );
    const mutated = JSON.parse(JSON.stringify(operation));
    mutated.dependsOn[0].operationRef = mutated.operationId;
    const findings = checkEngineeringOperation(mutated);
    expect(findings.some((f) => f.code === "self_referencing_operation_dependency")).toBe(true);
    expect(checkEngineeringOperation(operation)).toHaveLength(0);
  });

  test("a state-transition effect without resultingStateRef is flagged", () => {
    const operation = decodeEngineeringOperation(
      FIXTURE("operation/EngineeringOperation.valid-demolition.json"),
    );
    const mutated = JSON.parse(JSON.stringify(operation));
    delete mutated.effects[0].resultingStateRef;
    const findings = checkEngineeringOperation(mutated);
    expect(findings.some((f) => f.code === "operation_effect_missing_ref")).toBe(true);
  });

  test("a quantity-impact effect without quantity is flagged", () => {
    const operation = decodeEngineeringOperation(
      FIXTURE("operation/EngineeringOperation.valid-demolition.json"),
    );
    const mutated = JSON.parse(JSON.stringify(operation));
    delete mutated.effects[1].quantity;
    const findings = checkEngineeringOperation(mutated);
    expect(findings.some((f) => f.code === "operation_effect_missing_quantity")).toBe(true);
  });
});

describe("proposed state and solution version consistency", () => {
  test("a state whose appliedOperationIds length disagrees with stateIndex is flagged", () => {
    const state = decodeProposedState(FIXTURE("state/ProposedState.valid-layer.json"));
    const mutated = JSON.parse(JSON.stringify(state));
    mutated.appliedOperationIds = mutated.appliedOperationIds.slice(0, 1);
    const findings = checkProposedState(mutated);
    expect(findings.map((f) => f.code)).toEqual(["proposed_state_index_mismatch"]);
    expect(checkProposedState(state)).toHaveLength(0);
  });

  test("a version whose state count disagrees with operations + 1 is flagged", () => {
    const version = decodeSolutionVersion(FIXTURE("solution/SolutionVersion.valid.json"));
    const mutated = JSON.parse(JSON.stringify(version));
    mutated.states = mutated.states.slice(0, 2);
    const findings = checkSolutionVersion(mutated);
    expect(findings.some((f) => f.code === "solution_version_state_count_mismatch")).toBe(true);
    expect(checkSolutionVersion(version)).toHaveLength(0);
  });

  test("a validated version without a declared snapshot is flagged (BOQ gate)", () => {
    const version = decodeSolutionVersion(FIXTURE("solution/SolutionVersion.valid.json"));
    const mutated = JSON.parse(JSON.stringify(version));
    delete mutated.validationSnapshotRef;
    const findings = checkSolutionVersion(mutated);
    expect(findings.some((f) => f.code === "validated_version_without_snapshot")).toBe(true);
  });

  test("a draft version without a snapshot is fine (drafts precede validation)", () => {
    const version = decodeSolutionVersion(
      FIXTURE("solution/SolutionVersion.valid-draft-v2.json"),
    );
    expect(checkSolutionVersion(version)).toHaveLength(0);
  });

  test("version 1 carrying a parent version is flagged", () => {
    const version = decodeSolutionVersion(FIXTURE("solution/SolutionVersion.valid.json"));
    const mutated = JSON.parse(JSON.stringify(version));
    mutated.parentVersionNumber = 1;
    const findings = checkSolutionVersion(mutated);
    expect(findings.some((f) => f.code === "version_one_with_parent")).toBe(true);
  });

  test("a superseded solution without a successor is flagged", () => {
    const solution = decodeSolution(FIXTURE("solution/Solution.valid-superseded.json"));
    const mutated = JSON.parse(JSON.stringify(solution));
    delete mutated.supersededBy;
    const findings = checkSolution(mutated);
    expect(findings.map((f) => f.code)).toEqual(["superseded_solution_without_successor"]);
    expect(checkSolution(solution)).toHaveLength(0);
  });
});

describe("validation snapshot determinism", () => {
  test("the worst-of rule orders fail > review-needed > unknown > pass", () => {
    expect(validationOutcomeWorstOf(["pass", "unknown"])).toBe("unknown");
    expect(validationOutcomeWorstOf(["pass", "review-needed"])).toBe("review-needed");
    expect(validationOutcomeWorstOf(["unknown", "fail"])).toBe("fail");
    expect(validationOutcomeWorstOf(["pass", "pass"])).toBe("pass");
    expect(validationOutcomeWorstOf([])).toBe("pass");
  });

  test("an outcome that is not the worst-of the checks is flagged", () => {
    const snapshot = decodeSolutionValidationSnapshot(
      FIXTURE("validation/SolutionValidationSnapshot.valid-review-needed.json"),
    );
    const mutated = JSON.parse(JSON.stringify(snapshot));
    mutated.outcome = "pass";
    const findings = checkSolutionValidationSnapshot(mutated);
    expect(findings.some((f) => f.code === "validation_outcome_not_worst_of_checks")).toBe(true);
    expect(checkSolutionValidationSnapshot(snapshot)).toHaveLength(0);
    const passSnapshot = decodeSolutionValidationSnapshot(
      FIXTURE("validation/SolutionValidationSnapshot.valid-pass.json"),
    );
    expect(checkSolutionValidationSnapshot(passSnapshot)).toHaveLength(0);
  });
});

describe("capability profile uniqueness", () => {
  test("a duplicate operation type within a vertical is flagged", () => {
    const profile = decodeOperationCapabilityProfile(
      FIXTURE("capability/OperationCapabilityProfile.valid.json"),
    );
    const mutated = JSON.parse(JSON.stringify(profile));
    mutated.domains[0].operations.push({ ...mutated.domains[0].operations[0] });
    const findings = checkOperationCapabilityProfile(mutated);
    expect(findings.some((f) => f.code === "duplicate_operation_type_capability")).toBe(true);
    expect(checkOperationCapabilityProfile(profile)).toHaveLength(0);
  });

  test("a duplicate vertical across domains is flagged", () => {
    const profile = decodeOperationCapabilityProfile(
      FIXTURE("capability/OperationCapabilityProfile.valid.json"),
    );
    const mutated = JSON.parse(JSON.stringify(profile));
    mutated.domains.push({ ...mutated.domains[0] });
    const findings = checkOperationCapabilityProfile(mutated);
    expect(findings.some((f) => f.code === "duplicate_profile_vertical")).toBe(true);
  });
});

describe("BOQ trace pinning invariants", () => {
  test("a line trace pinned to a different version is flagged", () => {
    const traceSet = decodeSolutionBoqTraceSet(FIXTURE("trace/SolutionBoqTraceSet.valid.json"));
    const mutated = JSON.parse(JSON.stringify(traceSet));
    mutated.lineTraces[0].versionNumber = 2;
    const findings = checkSolutionBoqTraceSet(mutated);
    expect(findings.some((f) => f.code === "trace_set_version_pin_mismatch")).toBe(true);
    expect(checkSolutionBoqTraceSet(traceSet)).toHaveLength(0);
  });

  test("a line trace referencing a foreign snapshot is flagged", () => {
    const traceSet = decodeSolutionBoqTraceSet(FIXTURE("trace/SolutionBoqTraceSet.valid.json"));
    const mutated = JSON.parse(JSON.stringify(traceSet));
    mutated.lineTraces[1].validationSnapshotRef = "snapshot-foreign-0001";
    const findings = checkSolutionBoqTraceSet(mutated);
    expect(findings.some((f) => f.code === "trace_set_snapshot_pin_mismatch")).toBe(true);
  });
});

describe("the intent constructor enforces the invariants", () => {
  test("createOperationIntent refuses a numeric parameter without a unit", () => {
    const mutated = JSON.parse(JSON.stringify(intentDirect));
    delete mutated.parameters[0].unit;
    expect(() =>
      createOperationIntent({
        intentId: mutated.intentId,
        operationType: mutated.operationType,
        domain: mutated.domain,
        parameters: mutated.parameters,
        target: mutated.target,
        dependsOn: mutated.dependsOn,
        provenance: mutated.provenance,
      }),
    ).toThrow(SolutionContractEncodeError);
  });

  test("createOperationIntent refuses an unanchored target", () => {
    const mutated = JSON.parse(JSON.stringify(intentDirect));
    mutated.target.nodeRefs = [];
    mutated.target.geometryRefs = [];
    expect(() =>
      createOperationIntent({
        intentId: mutated.intentId,
        operationType: mutated.operationType,
        domain: mutated.domain,
        parameters: mutated.parameters,
        target: mutated.target,
        dependsOn: mutated.dependsOn,
        provenance: mutated.provenance,
      }),
    ).toThrow(SolutionContractEncodeError);
  });

  test("createOperationIntent re-emits a valid intent losslessly (same semantics)", () => {
    const reconstructed = createOperationIntent({
      intentId: intentDirect.intentId,
      operationType: intentDirect.operationType,
      domain: REFERENCE_BUILDING_DOMAIN,
      parameters: intentDirect.parameters,
      target: intentDirect.target,
      dependsOn: intentDirect.dependsOn,
      provenance: intentDirect.provenance,
    });
    expect(reconstructed).toEqual(intentDirect);
  });
});

describe("the committed corpus passes every invariant (corpus guarantee)", () => {
  test("every VALID fixture produces zero invariant findings for its object", () => {
    const corpus = loadCommittedFixtures();
    const valid = corpus.fixtures.filter((fixture) => fixture.kind === "valid");
    expect(valid.length).toBeGreaterThan(40);
    for (const fixture of valid) {
      const findings = checkSolutionContractObject(fixture.objectName, fixture.payload);
      expect(findings).toHaveLength(0);
    }
  });
});
