/**
 * PROD-010 — outcome-forms tests (pure, deterministic: no network, no
 * clock, no randomness).
 */

import { describe, expect, test } from "bun:test";
import {
  COVERAGE_OBSERVATION_STATUSES,
  parseCoverageLines,
  parseDesignItemLines,
  parseToleranceLines,
  recordExecutionAction,
  recordExecutionRequestBody,
  recordOutcomeAction,
  recordOutcomeRequestBody,
  runComparisonAction,
  runComparisonRequestBody,
  unknownStepRefs,
  validateComparisonDraft,
  validateExecutionDraft,
  validateOutcomeDraft,
  type ComparisonDraft,
  type ExecutionDraft,
  type OutcomeDraft,
} from "./outcome-forms";
import { validateConnectorActionDescriptor } from "../shell";

const HEX64 = "a".repeat(64);
const HEX64B = "b".repeat(64);

const executionDraft: ExecutionDraft = {
  executionRecordId: "exec-001",
  caseId: "case-007",
  scenarioId: "scenario-office-refit",
  stateId: HEX64,
  executedStepIds: ["step-001", "step-002"],
  evidenceIds: [HEX64, HEX64B],
  executedAt: "2026-03-02T09:00:00.000Z",
  actor: "user-alice",
};

const outcomeDraft: OutcomeDraft = {
  caseId: "case-007",
  statement: "The wall was rebuilt to spec.",
  evidenceIds: [HEX64],
  observedAt: "2026-03-03T09:00:00.000Z",
  actor: "user-alice",
};

const comparisonDraft: ComparisonDraft = {
  comparisonId: "comp-001",
  projectId: "p1",
  versionId: "v002",
  systemClass: "arch-cad",
  systemInstanceId: "arch-cad-prod-01",
  sourceRecordId: "IFC-MODEL-0042",
  revision: "C3",
  retrievedAt: "2026-03-01T08:00:00.000Z",
  designItemLines: "item-1 | wall-north | North wall | thickness = 240 mm",
};

describe("PROD-010 outcome-forms — brokered descriptors (reused, not forked)", () => {
  test("the three actions pass the frozen shell validator with honest permissions", () => {
    for (const [action, permission] of [
      [recordExecutionAction(), "intervention:write"],
      [recordOutcomeAction(), "intervention:write"],
      [runComparisonAction(), "boq:write"],
    ] as const) {
      expect(() => validateConnectorActionDescriptor(action)).not.toThrow();
      expect(action.requiredPermission).toBe(permission);
    }
  });
});

describe("PROD-010 outcome-forms — ExecutionDraft", () => {
  test("a valid draft passes; the exact body assembles with actor on the wire", () => {
    expect(validateExecutionDraft(executionDraft)).toEqual([]);
    expect(recordExecutionRequestBody(executionDraft)).toEqual({
      executionRecordId: "exec-001",
      caseId: "case-007",
      scenarioId: "scenario-office-refit",
      stateId: HEX64,
      executedStepIds: ["step-001", "step-002"],
      evidenceIds: [HEX64, HEX64B],
      executedAt: "2026-03-02T09:00:00.000Z",
      actor: "user-alice",
    });
  });

  test("optional captureSessionIds ride when present, are OMITTED when absent", () => {
    const withCapture = recordExecutionRequestBody({
      ...executionDraft,
      captureSessionIds: ["cap-1"],
    });
    expect(withCapture.captureSessionIds).toEqual(["cap-1"]);
    const withoutCapture = recordExecutionRequestBody(executionDraft);
    expect("captureSessionIds" in withoutCapture).toBe(false);
  });

  test("64-hex state/evidence, ISO-UTC-ms executedAt and required steps are NAMED defects", () => {
    const defects = validateExecutionDraft({
      ...executionDraft,
      stateId: "nope",
      executedStepIds: [],
      evidenceIds: ["zz"],
      executedAt: "2026-03-02T09:00:00Z",
    });
    expect(defects).toEqual([
      "stateId must be the 64-hex content id of a materialized state",
      "executedStepIds is required and must be non-empty — an execution must name the steps it executes",
      "evidenceIds entries must be 64-hex content addresses",
      "executedAt must be an ISO-8601 UTC timestamp (milliseconds)",
    ]);
  });

  test("unknown step refs are named before the write (unknown_step_ref mirror)", () => {
    expect(unknownStepRefs(["step-001"], ["step-001", "step-999"])).toEqual(["step-999"]);
    expect(unknownStepRefs(["step-001"], ["step-001"])).toEqual([]);
  });
});

describe("PROD-010 outcome-forms — OutcomeDraft", () => {
  test("the exact body assembles (observedAt + actor ride the wire; never an epistemicStatus)", () => {
    expect(validateOutcomeDraft(outcomeDraft, "case-007")).toEqual([]);
    const body = recordOutcomeRequestBody(outcomeDraft) as unknown as Record<string, unknown>;
    expect(body).toEqual({
      caseId: "case-007",
      statement: "The wall was rebuilt to spec.",
      evidenceIds: [HEX64],
      observedAt: "2026-03-03T09:00:00.000Z",
      actor: "user-alice",
    });
    expect("epistemicStatus" in body).toBe(false);
  });

  test("a case mismatch with the execution's case is NAMED client-side", () => {
    const defects = validateOutcomeDraft({ ...outcomeDraft, caseId: "case-009" }, "case-007");
    expect(defects).toEqual([
      "outcome_case_mismatch: the outcome's case case-009 must equal the execution's case case-007",
    ]);
  });

  test("evidence is REQUIRED (outcome_without_evidence mirror)", () => {
    const defects = validateOutcomeDraft({ ...outcomeDraft, evidenceIds: [] });
    expect(defects).toEqual([
      "evidenceIds must be a NON-EMPTY array of evidence content ids",
    ]);
  });

  test("observedAt must be ISO-UTC-ms when present; optionals omitted when absent", () => {
    expect(validateOutcomeDraft({ ...outcomeDraft, observedAt: "2026-03-03" })).toEqual([
      "observedAt must be an ISO-8601 UTC timestamp (milliseconds)",
    ]);
    const body = recordOutcomeRequestBody({
      caseId: "case-007",
      statement: "s",
      evidenceIds: [HEX64],
    });
    expect(body).toEqual({ caseId: "case-007", statement: "s", evidenceIds: [HEX64] });
  });
});

describe("PROD-010 outcome-forms — line parsers", () => {
  test("design item lines parse (multi-property via extra segments; empty target = unmapped)", () => {
    const parsed = parseDesignItemLines(
      "item-1 | wall-north | North wall | thickness = 240 mm | fireRating = REI90\n" +
        "item-2 | - | Unmapped item |\n",
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.items).toEqual([
        {
          designItemId: "item-1",
          label: "North wall",
          targetNodeId: "wall-north",
          properties: [
            { key: "thickness", value: 240, unit: "mm" },
            { key: "fireRating", value: "REI90" },
          ],
        },
        { designItemId: "item-2", label: "Unmapped item", properties: [] },
      ]);
    }
  });

  test("design item defects are named (shape, duplicates, typed-unit)", () => {
    const parsed = parseDesignItemLines(
      "item-1 | wall | Label |\nitem-1 | wall | Label | thickness = 240\nbad-line\n",
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.defects).toEqual([
        'line 2: duplicate design item id "item-1"',
        'line 3: expected "id | target | label | key = value unit"',
      ]);
    }
    const numeric = parseDesignItemLines("item-1 | wall | Label | thickness = 240");
    expect(numeric.ok).toBe(false);
    if (!numeric.ok) {
      expect(numeric.defects).toEqual([
        "line 1: property: numeric value 240 requires a typed unit",
      ]);
    }
  });

  test("empty design item input is a named defect (comparison_without_items mirror)", () => {
    const parsed = parseDesignItemLines("");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.defects).toEqual([
        "designReference.items must be a NON-EMPTY array — no items carry no scope",
      ]);
    }
  });

  test("tolerance lines parse (reserved default key; negative/duplicate named)", () => {
    const parsed = parseToleranceLines("thickness = 5\ndefault = 10\n");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.tolerances).toEqual({ byKey: { thickness: 5 }, default: 10 });
    }
    const bad = parseToleranceLines("thickness = -1\nthickness = 2\nwidth = abc\n");
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.defects).toEqual([
        'line 1: tolerance for "thickness" must be a finite number >= 0',
        'line 2: duplicate tolerance key "thickness"',
        'line 3: tolerance for "width" must be a finite number >= 0',
      ]);
    }
  });

  test("coverage lines parse with the frozen vocabulary; evidence is required", () => {
    const parsed = parseCoverageLines(
      `wall-north OCCLUDED ${HEX64}, ${HEX64B}\nwall-east NOT_OBSERVED ${HEX64}\n`,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.coverage).toEqual([
        {
          targetNodeId: "wall-north",
          observationStatus: "OCCLUDED",
          evidenceIds: [HEX64, HEX64B],
        },
        { targetNodeId: "wall-east", observationStatus: "NOT_OBSERVED", evidenceIds: [HEX64] },
      ]);
    }
    const bad = parseCoverageLines(
      `wall-north VISIBLE ${HEX64}\nwall-north UNKNOWN ${HEX64}\nwall-east UNKNOWN zz\nwall-south UNKNOWN\n`,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.defects).toEqual([
        "line 1: observationStatus must be one of UNKNOWN|NOT_OBSERVED|OCCLUDED",
        "line 2: duplicate coverage annotation for target wall-north",
        "line 3: coverage evidence ids must be 64-hex content addresses",
        "line 4: coverage annotation for wall-south requires a NON-EMPTY evidence list",
      ]);
    }
    expect([...COVERAGE_OBSERVATION_STATUSES]).toEqual(["UNKNOWN", "NOT_OBSERVED", "OCCLUDED"]);
  });
});

describe("PROD-010 outcome-forms — ComparisonDraft + the nested body", () => {
  test("the exact nested body assembles (five sourceOfRecord fields + items[].properties)", () => {
    expect(validateComparisonDraft(comparisonDraft)).toEqual([]);
    expect(runComparisonRequestBody(comparisonDraft)).toEqual({
      comparisonId: "comp-001",
      realityRef: { projectId: "p1", versionId: "v002" },
      designReference: {
        sourceOfRecord: {
          systemClass: "arch-cad",
          systemInstanceId: "arch-cad-prod-01",
          sourceRecordId: "IFC-MODEL-0042",
          revision: "C3",
          retrievedAt: "2026-03-01T08:00:00.000Z",
        },
        items: [
          {
            designItemId: "item-1",
            label: "North wall",
            targetNodeId: "wall-north",
            properties: [{ key: "thickness", value: 240, unit: "mm" }],
          },
        ],
      },
    });
  });

  test("tolerances/coverage ride when present and are OMITTED when absent", () => {
    const full = runComparisonRequestBody({
      ...comparisonDraft,
      designTitle: "Design rev C3",
      toleranceLines: "thickness = 5",
      coverageLines: `wall-north UNKNOWN ${HEX64}`,
    });
    expect(full.designReference.title).toBe("Design rev C3");
    expect(full.tolerances).toEqual({ byKey: { thickness: 5 }, default: null });
    expect(full.coverage).toEqual([
      { targetNodeId: "wall-north", observationStatus: "UNKNOWN", evidenceIds: [HEX64] },
    ]);
    const bare = runComparisonRequestBody(comparisonDraft);
    expect("tolerances" in bare).toBe(false);
    expect("coverage" in bare).toBe(false);
    expect("title" in bare.designReference).toBe(false);
  });

  test("draft defects name the five-field contract (missing + non-ISO retrievedAt)", () => {
    const defects = validateComparisonDraft({
      ...comparisonDraft,
      systemClass: "",
      retrievedAt: "2026-03-01",
    });
    expect(defects).toEqual([
      "sourceOfRecord.systemClass must be a non-empty string",
      "sourceOfRecord.retrievedAt must be an ISO-8601 UTC timestamp (milliseconds)",
    ]);
  });
});
