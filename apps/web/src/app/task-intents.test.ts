/**
 * PROD-017 — TaskIntent authoring tests (W-R3): the form modules emit
 * typed TaskIntent wire objects that decode and round-trip through the
 * CONTRACT package's own codec — never ad-hoc payloads.
 *
 * create-forms.ts, outcome-forms.ts and evidence-picker.ts each author
 * intents for their write leg; every emitted object must:
 *
 *  1. decode through `@aise/adapter-contract`'s TaskIntent codec (open);
 *  2. round-trip through canonical encode → decode byte-stably;
 *  3. carry the contract version, the advisory task type, the intent
 *     statement, the project ref, the target refs and inspectable
 *     parameters.
 *
 * Determinism: fixed constants; no clock, no randomness, no network.
 */

import { describe, expect, test } from "bun:test";
import type { TaskIntent } from "@aise/adapter-contract";
import {
  isAdvisoryTaskType,
  taskIntentFromApprovalReferenceDraft,
  taskIntentFromNewCaseDraft,
  taskIntentFromNewProjectDraft,
  taskIntentFromNewScenarioDraft,
  taskIntentFromSelection,
  validateTaskIntentIdentity,
  validateTaskSelectionDraft,
  type TaskSelectionDraft,
} from "./create-forms";
import {
  taskIntentFromComparisonDraft,
  taskIntentFromExecutionDraft,
  taskIntentFromOutcomeDraft,
} from "./outcome-forms";
import { taskIntentForEvidenceSubmission } from "./evidence-picker";
import { decodeTaskIntentAtSeam, encodeTaskIntentWire } from "./task-contract";

const IDENTITY = { taskId: "task-w3-001", createdAt: "2026-01-15T09:25:00.000Z" } as const;

/** The full contract round-trip every authored intent must survive. */
function roundTrip(intent: TaskIntent): TaskIntent {
  // Canonical encode (the contract codec, byte-stable) → the SEAM decode
  // (the app's own never-throw path — the same function the live wire hits).
  const encoded = encodeTaskIntentWire(intent);
  if (!encoded.ok) {
    throw new Error("authored TaskIntent failed contract encode");
  }
  const decoded = decodeTaskIntentAtSeam(JSON.parse(encoded.value));
  if (!decoded.ok) {
    throw new Error(
      `authored TaskIntent failed contract decode: ${decoded.failure.detail}`,
    );
  }
  // A second canonical encode of the round-tripped value is byte-identical.
  const reEncoded = encodeTaskIntentWire(decoded.value);
  if (reEncoded.ok) {
    expect(reEncoded.value).toBe(encoded.value);
  }
  return decoded.value;
}

describe("PROD-017 TaskIntent authoring (W-R3 — the client-authored object)", () => {
  test("create-forms: the task-selection intent is a typed wire object", () => {
    const draft: TaskSelectionDraft = {
      projectRef: "proj-7f3a2b",
      taskType: "field-capture",
      intent: "Capture depth evidence of the cracked masonry on level 2.",
      targetRefs: ["case-91ab", "node-wall-12"],
      parameters: { priority: "high", area: "level-2" },
    };
    expect(validateTaskSelectionDraft(draft)).toEqual([]);
    const intent = taskIntentFromSelection(draft, IDENTITY);
    const round = roundTrip(intent);
    expect(round.taskId).toBe("task-w3-001");
    expect(round.taskType).toBe("field-capture");
    expect(round.projectRef).toBe("proj-7f3a2b");
    expect(round.targetRefs).toEqual(["case-91ab", "node-wall-12"]);
    expect(round.parameters).toEqual({ priority: "high", area: "level-2" });
    expect(isAdvisoryTaskType(round.taskType)).toBe(true);
  });

  test("create-forms: the new-project draft authors a project-administration intent", () => {
    const intent = taskIntentFromNewProjectDraft(
      {
        organizationId: "org-northwind",
        projectId: "proj-new-1",
        name: "Block C Refurbishment",
        actor: "user-alice",
      },
      IDENTITY,
    );
    const round = roundTrip(intent);
    expect(round.taskType).toBe("project-administration");
    expect(round.parameters.organizationId).toBe("org-northwind");
    expect(round.parameters.actor).toBe("user-alice");
  });

  test("create-forms: the new-scenario draft authors a solution-authoring intent", () => {
    const intent = taskIntentFromNewScenarioDraft(
      {
        scenarioId: "scenario-new-1",
        projectId: "proj-7f3a2b",
        title: "Level 2 masonry stabilization",
        baselineVersionId: "v014",
      },
      IDENTITY,
    );
    const round = roundTrip(intent);
    expect(round.taskType).toBe("solution-authoring");
    expect(round.parameters.baselineVersionId).toBe("v014");
  });

  test("create-forms: the new-case draft authors an engineering-case-review intent", () => {
    const intent = taskIntentFromNewCaseDraft(
      {
        caseId: "case-new-1",
        projectId: "proj-7f3a2b",
        title: "Crack width monitoring",
        nodeIds: ["node-wall-12"],
        evidenceIds: ["f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712"],
        captureSessionIds: [],
      },
      IDENTITY,
    );
    const round = roundTrip(intent);
    expect(round.taskType).toBe("engineering-case-review");
    expect(round.parameters.evidenceCount).toBe("1");
  });

  test("create-forms: the approval-reference draft authors an intervention-review intent", () => {
    const intent = taskIntentFromApprovalReferenceDraft(
      {
        caseId: "case-91ab",
        reviewDecision: "approved",
        reviewedAt: "2026-01-16T08:00:00.000Z",
      },
      "scenario-55c1",
      IDENTITY,
    );
    const round = roundTrip(intent);
    expect(round.taskType).toBe("intervention-review");
    expect(round.targetRefs).toContain("scenario-55c1");
    expect(round.targetRefs).toContain("case-91ab");
  });

  test("outcome-forms: the execution draft authors an outcome-loop intent", () => {
    const intent = taskIntentFromExecutionDraft(
      {
        executionRecordId: "exec-new-1",
        caseId: "case-91ab",
        scenarioId: "scenario-55c1",
        stateId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
        executedStepIds: ["step-1", "step-2"],
        evidenceIds: ["f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712"],
        executedAt: "2026-01-18T10:00:00.000Z",
      },
      IDENTITY,
    );
    const round = roundTrip(intent);
    expect(round.taskType).toBe("outcome-comparison");
    expect(round.parameters.executedStepCount).toBe("2");
    expect(round.targetRefs).toContain("exec-new-1");
  });

  test("outcome-forms: the outcome draft authors an OBSERVED-outcome intent", () => {
    const intent = taskIntentFromOutcomeDraft(
      {
        caseId: "case-91ab",
        statement: "The crack width did not increase after stabilization.",
        evidenceIds: [
          "196b5ab5d99835a2a14dce2348d3a29c0a21226d65bb0ce8a088fcfcd37c0e43",
        ],
        observedAt: "2026-01-19T10:00:00.000Z",
      },
      "exec-new-1",
      IDENTITY,
    );
    const round = roundTrip(intent);
    expect(round.intent).toContain("OBSERVED post-work outcome");
    expect(round.parameters.observedAt).toBe("2026-01-19T10:00:00.000Z");
  });

  test("outcome-forms: the comparison draft authors a comparison intent", () => {
    const intent = taskIntentFromComparisonDraft(
      {
        comparisonId: "comp-new-1",
        projectId: "proj-7f3a2b",
        versionId: "v014",
        systemClass: "bim-ifc",
        systemInstanceId: "bim-7",
        sourceRecordId: "IFC-DESIGN-2026-0011",
        revision: "3",
        retrievedAt: "2026-01-15T08:00:00.000Z",
        designItemLines: "item-1 | node-wall-12 | Wall 12 | thickness = 240 mm",
      },
      IDENTITY,
    );
    const round = roundTrip(intent);
    expect(round.parameters.systemClass).toBe("bim-ifc");
    expect(round.targetRefs).toContain("v014");
  });

  test("evidence-picker: the submission intent targets the records' OWN content ids", () => {
    const intent = taskIntentForEvidenceSubmission(
      [
        "f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712",
        "60dbb33388e68f526c58a7b6595a72a33475bcb95f9706f0ceafe94e7488680b",
      ],
      "proj-7f3a2b",
      "the cracked-masonry case",
      IDENTITY,
    );
    const round = roundTrip(intent);
    expect(round.taskType).toBe("field-capture");
    expect(round.targetRefs).toHaveLength(2);
    expect(round.parameters.evidenceCount).toBe("2");
  });

  test("the authored intents encode through the seam wire function too", () => {
    const intent = taskIntentFromSelection(
      {
        projectRef: "proj-7f3a2b",
        taskType: "evidence-review",
        intent: "Review the evidence gaps of the cracked-masonry case.",
        targetRefs: [],
        parameters: {},
      },
      IDENTITY,
    );
    const encoded = encodeTaskIntentWire(intent);
    expect(encoded.ok).toBe(true);
  });

  test("identity validation names defects (never throws)", () => {
    expect(validateTaskIntentIdentity({ taskId: "", createdAt: "" })).toEqual([
      "taskId must be a non-empty string",
      "createdAt must be a non-empty string",
    ]);
    expect(
      validateTaskIntentIdentity({ taskId: "ok-id", createdAt: "2026-01-15" }),
    ).toEqual(["createdAt must be an ISO-8601 UTC timestamp (milliseconds)"]);
  });

  test("draft validation names defects (the server contracts stay the authority)", () => {
    const defects = validateTaskSelectionDraft({
      projectRef: "",
      taskType: "  spaced  ",
      intent: "",
      targetRefs: ["ok", ""],
      parameters: { ok: "1", "": "2" },
    });
    expect(defects).toContain("projectRef must be a non-empty string");
    expect(defects).toContain("taskType must not carry surrounding whitespace");
    expect(defects).toContain("intent must be a non-empty statement of what you need to do");
    expect(defects).toContain("targetRefs entries must be non-empty strings");
    expect(defects).toContain("parameters must be a string→string map with non-empty keys");
  });
});
