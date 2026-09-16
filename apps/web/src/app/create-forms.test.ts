/**
 * PROD-010 — create-forms tests (pure, deterministic: no network, no
 * clock, no randomness; authorization ports are injected stubs).
 */

import { describe, expect, test } from "bun:test";
import { validateConnectorActionDescriptor, type ShellAuthorizationPort } from "../shell";
import {
  allowedScenarioTransitions,
  appendStepRequestBody,
  CASE_REVIEW_DECISIONS,
  createCaseRequestBody,
  createRecordAction,
  idListFromField,
  parseStepPropertyLines,
  projectsResourceKey,
  resolveCreateActionOffer,
  SCENARIO_STATUSES,
  SCENARIO_TRANSITIONS,
  stateNodeOptions,
  STEP_KINDS,
  validateAppendStepDraft,
  validateApprovalReferenceDraft,
  validateNewCaseDraft,
  validateNewProjectDraft,
  validateNewScenarioDraft,
  type AppendStepDraft,
  type CreateActionQuestion,
} from "./create-forms";

const HEX64 = "a".repeat(64);
const TARGET = { kind: "project", organizationId: "org-northwind", projectId: "p1" } as const;

function question(
  authorization: ShellAuthorizationPort | undefined,
  permission: string,
): CreateActionQuestion {
  return {
    authorization,
    descriptor: createRecordAction({
      actionId: "create-project",
      label: "Create project",
      permission,
    }),
    bindingId: "panel-create-project",
    returnTo: { module: "context", projectId: "p1" },
    principalId: "user-alice",
    target: TARGET,
  };
}

const allowPort: ShellAuthorizationPort = {
  decide: async () => ({
    allowed: true,
    grant: {
      membershipId: "mem-1",
      roleId: "org-founder",
      permission: "identity:write",
      scope: { kind: "organization" },
    },
  }),
};

const refusePort: ShellAuthorizationPort = {
  decide: async () => ({
    allowed: false,
    refusal: {
      code: "missing_permission",
      detail: "no grant carries identity:write",
      principalId: "user-alice",
      target: TARGET,
    },
  }),
};

describe("PROD-010 create-forms — brokered action descriptors", () => {
  test("createRecordAction builds a descriptor valid through the FROZEN shell validator", () => {
    const descriptor = createRecordAction({
      actionId: "create-project",
      label: "Create project",
      permission: "identity:write",
    });
    expect(() => validateConnectorActionDescriptor(descriptor)).not.toThrow();
    expect(descriptor.requiredPermission).toBe("identity:write");
    expect(descriptor.kind).toBe("open-record");
    expect(descriptor.label.value).toBe("Create project");
  });

  test("the deployment's write permissions ride the descriptors verbatim", () => {
    expect(
      createRecordAction({ actionId: "a", label: "A", permission: "intervention:write" })
        .requiredPermission,
    ).toBe("intervention:write");
    expect(
      createRecordAction({ actionId: "c", label: "C", permission: "case:write" })
        .requiredPermission,
    ).toBe("case:write");
  });

  test("the broker tri-state: allowed carries the grant; refused names the code", async () => {
    const allowed = await resolveCreateActionOffer(question(allowPort, "identity:write"));
    expect(allowed.state.kind).toBe("allowed");
    if (allowed.state.kind === "allowed") {
      expect(allowed.state.grant.permission).toBe("identity:write");
    }
    const refused = await resolveCreateActionOffer(question(refusePort, "identity:write"));
    expect(refused.state.kind).toBe("refused");
    if (refused.state.kind === "refused") {
      expect(refused.state.refusal.code).toBe("missing_permission");
    }
  });

  test("absent port / null target → the honest unavailable states (never guessed)", async () => {
    const noPort = await resolveCreateActionOffer(question(undefined, "identity:write"));
    expect(noPort.state).toEqual({ kind: "unavailable", reason: "authorization-port-absent" });
    const noTarget = await resolveCreateActionOffer({
      ...question(allowPort, "identity:write"),
      target: null,
    });
    expect(noTarget.state).toEqual({ kind: "unavailable", reason: "authorization-target-unknown" });
  });

  test("a THROWING port surfaces as the explicit ask-failed state", async () => {
    const throwing: ShellAuthorizationPort = {
      decide: async () => {
        throw new Error("authorization relay is down");
      },
    };
    const offer = await resolveCreateActionOffer(question(throwing, "identity:write"));
    expect(offer.state.kind).toBe("ask-failed");
    if (offer.state.kind === "ask-failed") {
      expect(offer.state.detail).toContain("authorization relay is down");
    }
  });
});

describe("PROD-010 create-forms — vocabulary + transition-table mirrors", () => {
  test("SCENARIO_STATUSES and the transition table mirror the backend verbatim", () => {
    expect([...SCENARIO_STATUSES]).toEqual([
      "draft",
      "under_review",
      "approved",
      "rejected",
      "superseded",
    ]);
    expect(SCENARIO_TRANSITIONS).toEqual({
      draft: ["under_review", "superseded"],
      under_review: ["approved", "rejected", "superseded"],
      approved: [],
      rejected: [],
      superseded: [],
    });
  });

  test("allowedScenarioTransitions: governed edges; unknown statuses have none", () => {
    expect(allowedScenarioTransitions("draft")).toEqual(["under_review", "superseded"]);
    expect(allowedScenarioTransitions("under_review")).toEqual([
      "approved",
      "rejected",
      "superseded",
    ]);
    expect(allowedScenarioTransitions("approved")).toEqual([]);
    expect(allowedScenarioTransitions("nope")).toEqual([]);
  });

  test("CASE_REVIEW_DECISIONS is the AISE-025 vocabulary verbatim", () => {
    expect([...CASE_REVIEW_DECISIONS]).toEqual([
      "approved",
      "rejected",
      "needs_more_evidence",
    ]);
  });

  test("STEP_KINDS mirrors the intervention vocabulary verbatim", () => {
    expect([...STEP_KINDS]).toEqual([
      "property_change",
      "element_addition",
      "element_modification",
      "proposed_removal",
      "note",
    ]);
  });
});

describe("PROD-010 create-forms — draft validators", () => {
  test("project drafts mirror the identity contract", () => {
    expect(
      validateNewProjectDraft({
        organizationId: "org-northwind",
        projectId: "p1",
        name: "Riverside",
        actor: "user-alice",
      }),
    ).toEqual([]);
    expect(
      validateNewProjectDraft({ organizationId: "", projectId: "p1", name: "R", actor: "u" }),
    ).toEqual(["organizationId must be a non-empty string"]);
  });

  test("scenario drafts enforce the vNNN baseline rule client-side too", () => {
    expect(
      validateNewScenarioDraft({
        scenarioId: "scenario-1",
        projectId: "p1",
        title: "Refit",
        baselineVersionId: "v002",
      }),
    ).toEqual([]);
    const defects = validateNewScenarioDraft({
      scenarioId: "scenario-1",
      projectId: "p1",
      title: "Refit",
      baselineVersionId: "version-2",
    });
    expect(defects).toEqual(['baselineVersionId "version-2" is not a vNNN sequence id']);
  });

  test("case drafts require the auth body scope (top-level projectId)", () => {
    expect(
      validateNewCaseDraft({
        caseId: "case-007",
        projectId: "p1",
        title: "Wall mismatch",
        nodeIds: [],
        evidenceIds: [HEX64],
        captureSessionIds: [],
      }),
    ).toEqual([]);
    expect(
      validateNewCaseDraft({
        caseId: "",
        projectId: "",
        title: "",
        nodeIds: [""],
        evidenceIds: [""],
        captureSessionIds: [],
      }),
    ).toEqual([
      "caseId must be a non-empty string",
      "projectId must be a non-empty string",
      "title must be a non-empty string",
      "nodeIds entries must be non-empty strings",
      "evidenceIds entries must be non-empty strings",
    ]);
  });

  test("approval-reference drafts enforce the vocabulary + ISO instant", () => {
    expect(
      validateApprovalReferenceDraft({
        caseId: "case-007",
        reviewDecision: "needs_more_evidence",
        reviewedAt: "2026-03-01T12:00:00.000Z",
      }),
    ).toEqual([]);
    const defects = validateApprovalReferenceDraft({
      caseId: "case-007",
      reviewDecision: "APPROVED",
      reviewedAt: "2026-03-01",
    });
    expect(defects).toEqual([
      "reviewDecision must be one of approved|rejected|needs_more_evidence",
      "reviewedAt must be an ISO-8601 UTC timestamp (milliseconds)",
    ]);
  });
});

describe("PROD-010 create-forms — the typed-unit line parser", () => {
  test("`key = value unit` lines parse (numeric+unit, boolean, text)", () => {
    const parsed = parseStepPropertyLines(
      "thickness = 240 mm\nfireRating = REI90\nloadBearing = true\n",
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.properties).toEqual([
        { key: "thickness", value: 240, unit: "mm" },
        { key: "fireRating", value: "REI90" },
        { key: "loadBearing", value: true },
      ]);
    }
  });

  test("numeric-without-unit is a NAMED defect (both parser and validator)", () => {
    const parsed = parseStepPropertyLines("thickness = 240");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.defects).toEqual(["line 1: numeric value 240 requires a typed unit"]);
    }
    const draft: AppendStepDraft = {
      kind: "property_change",
      targetNodeId: "wall-north",
      propertyLines: "thickness = 240",
      provenanceEvidenceIds: [HEX64],
    };
    expect(validateAppendStepDraft(draft)).toEqual([
      "line 1: numeric value 240 requires a typed unit",
      "property_change requires exactly one `key = value unit` line",
    ]);
  });

  test("the other way: a boolean value with a trailing unit is a named defect", () => {
    const parsed = parseStepPropertyLines("loadBearing = true kN");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.defects).toEqual(["line 1: boolean value true carries no unit"]);
    }
  });

  test("lines without `=`, empty values and empty keys are named", () => {
    const parsed = parseStepPropertyLines("thickness 240 mm\n= 5 mm");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.defects).toEqual([
        'line 1: expected "key = value unit"',
        "line 2: key must be 1..256 characters",
      ]);
    }
  });
});

describe("PROD-010 create-forms — the five per-kind exact bodies", () => {
  test("property_change: exactly one property line + provenance", () => {
    const assembled = appendStepRequestBody({
      kind: "property_change",
      targetNodeId: "wall-north",
      propertyLines: "thickness = 240 mm",
      rationale: "align with design",
      provenanceEvidenceIds: [HEX64],
    });
    expect(assembled).toEqual({
      ok: true,
      body: {
        kind: "property_change",
        targetNodeId: "wall-north",
        property: { key: "thickness", value: 240, unit: "mm" },
        rationale: "align with design",
        provenance: { evidenceIds: [HEX64] },
      },
    });
  });

  test("element_addition: node kind + properties + optional parent host", () => {
    const assembled = appendStepRequestBody({
      kind: "element_addition",
      targetNodeId: "zone-north",
      propertyLines: "thickness = 240 mm",
      nodeKind: "wall",
      parentNodeId: "storey-01",
      provenanceEvidenceIds: [],
      provenanceDerivationNote: "derived from the BOQ line 4",
    });
    expect(assembled).toEqual({
      ok: true,
      body: {
        kind: "element_addition",
        targetNodeId: "zone-north",
        node: { kind: "wall", properties: [{ key: "thickness", value: 240, unit: "mm" }] },
        parentNodeId: "storey-01",
        provenance: { evidenceIds: [], derivationNote: "derived from the BOQ line 4" },
      },
    });
  });

  test("element_modification: at least one property line (the captured leg)", () => {
    const ok = appendStepRequestBody({
      kind: "element_modification",
      targetNodeId: "wall-north",
      propertyLines: "thickness = 300 mm",
      provenanceEvidenceIds: [HEX64],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.body).toEqual({
        kind: "element_modification",
        targetNodeId: "wall-north",
        properties: [{ key: "thickness", value: 300, unit: "mm" }],
        provenance: { evidenceIds: [HEX64] },
      });
    }
    const empty = validateAppendStepDraft({
      kind: "element_modification",
      targetNodeId: "wall-north",
      propertyLines: "",
      provenanceEvidenceIds: [HEX64],
    });
    expect(empty).toEqual([
      "element_modification requires at least one `key = value unit` line",
    ]);
  });

  test("proposed_removal requires a reason; note requires text", () => {
    const removal = appendStepRequestBody({
      kind: "proposed_removal",
      targetNodeId: "wall-east",
      reason: "Design removes this wall",
      provenanceEvidenceIds: [HEX64],
    });
    expect(removal.ok).toBe(true);
    if (removal.ok) {
      expect(removal.body).toEqual({
        kind: "proposed_removal",
        targetNodeId: "wall-east",
        reason: "Design removes this wall",
        provenance: { evidenceIds: [HEX64] },
      });
    }
    const note = appendStepRequestBody({
      kind: "note",
      targetNodeId: "wall-east",
      text: "Coordinate with the tenant",
      provenanceEvidenceIds: [HEX64],
    });
    expect(note.ok).toBe(true);
    if (note.ok) {
      expect(note.ok && note.body.kind === "note" && note.body.text).toBe(
        "Coordinate with the tenant",
      );
    }
    expect(
      validateAppendStepDraft({
        kind: "proposed_removal",
        targetNodeId: "wall-east",
        propertyLines: "",
        provenanceEvidenceIds: [HEX64],
      }),
    ).toEqual(["proposed_removal requires a non-empty reason (a removal is never silent)"]);
    expect(
      validateAppendStepDraft({
        kind: "note",
        targetNodeId: "wall-east",
        propertyLines: "",
        provenanceEvidenceIds: [HEX64],
      }),
    ).toEqual(["note requires a non-empty text"]);
  });

  test("missing provenance is named (the missing_provenance mirror)", () => {
    expect(
      validateAppendStepDraft({
        kind: "note",
        targetNodeId: "wall-east",
        propertyLines: "",
        text: "hello",
        provenanceEvidenceIds: [],
      }),
    ).toEqual(["a step requires provenance — a non-empty evidence list and/or a derivation note"]);
    expect(
      validateAppendStepDraft({
        kind: "note",
        targetNodeId: "wall-east",
        propertyLines: "",
        text: "hello",
        provenanceEvidenceIds: ["not-hex"],
      }),
    ).toEqual(["provenance evidence ids must be 64-hex content addresses"]);
  });

  test("assembly is fail-closed: an invalid draft returns defects, never a body", () => {
    const assembled = appendStepRequestBody({
      kind: "property_change",
      targetNodeId: "",
      propertyLines: "thickness = 240",
      provenanceEvidenceIds: [],
    });
    expect(assembled.ok).toBe(false);
    if (!assembled.ok) {
      expect(assembled.defects.length).toBeGreaterThan(0);
    }
  });
});

describe("PROD-010 create-forms — picker + resource keys", () => {
  test("createCaseRequestBody assembles the exact wire shape (optionals omitted)", () => {
    const body = createCaseRequestBody({
      caseId: "case-007",
      projectId: "p1",
      title: "Wall mismatch",
      nodeIds: ["wall-north"],
      evidenceIds: [HEX64],
      captureSessionIds: [],
    });
    expect(body).toEqual({
      caseId: "case-007",
      projectId: "p1",
      title: "Wall mismatch",
      links: { nodeIds: ["wall-north"], evidenceIds: [HEX64], captureSessionIds: [] },
    });
    const withOptionals = createCaseRequestBody({
      caseId: "case-007",
      projectId: "p1",
      title: "Wall mismatch",
      summary: "The wall differs.",
      createdBy: "user-alice",
      nodeIds: [],
      evidenceIds: [],
      captureSessionIds: [],
    });
    expect(withOptionals.summary).toBe("The wall differs.");
    expect(withOptionals.createdBy).toBe("user-alice");
  });

  test("stateNodeOptions labels come from the state's own nodes (order verbatim)", () => {
    const options = stateNodeOptions({
      nodes: [
        { nodeId: "wall-north", node: { kind: "wall" } },
        { nodeId: "door-01", node: { kind: "door" } },
      ],
    });
    expect(options).toEqual([
      { nodeId: "wall-north", label: "wall-north — wall" },
      { nodeId: "door-01", label: "door-01 — door" },
    ]);
    expect(stateNodeOptions(null)).toEqual([]);
  });

  test("idListFromField parses comma-separated ids (de-duplicated, blanks dropped)", () => {
    expect(idListFromField("a, b ,a,, c")).toEqual(["a", "b", "c"]);
  });

  test("projectsResourceKey keys on mode + acting principal (the Settings precedent)", () => {
    expect(projectsResourceKey("live", "user-alice")).toBe("projects:live:user-alice");
    expect(projectsResourceKey("live", "user-bob")).not.toBe(
      projectsResourceKey("live", "user-alice"),
    );
    expect(projectsResourceKey("demo", "user-alice")).toBe("projects:demo:user-alice");
  });
});
