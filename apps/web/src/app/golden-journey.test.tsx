/**
 * PROD-017 — the GOLDEN JOURNEY TASK TRACE: the automated task trace that
 * drives the REAL application entrypoints end-to-end (the PROD-017
 * acceptance: "browser completes the primary product journey through real
 * application entrypoints").
 *
 * The trace follows the task-first interaction model of
 * spec/client-adapter-contract.md over the app's REAL seams — the same
 * modules the browser runs (no test doubles of app code; only the fetch
 * transport is injected, exactly like api.test.ts):
 *
 *   1. ROUTER      — the journey's hash addresses parse to the real routes;
 *   2. PROJECT     — `loadProjectsLive` + `createProjectLive` (the identity
 *                    write path, exact backend contract);
 *   3. TASK INTENT — `taskIntentFromSelection` (W-R3) →
 *                    `submitTaskIntentLive` → the server-authoritative
 *                    OperationResult + follow-up NextBestAction (the
 *                    adapter seam, contract decoders);
 *   4. TASK FLOW   — `loadTaskFlowLive` decodes the joined bundle
 *                    (ProjectContext, RealitySummary, EvidenceSummary,
 *                    BOQContext, case/scenario/outcome summaries,
 *                    NextBestAction, AuthorizationContext, requirements)
 *                    and `loadAuthorizationContextLive` (W-R1) answers the
 *                    permission state;
 *   5. SURFACES    — the real data adapters of the golden journey's steps:
 *                    reality (GraphVersion → RealityPaneView), the
 *                    evidence register, the case list + detail, the BOQ
 *                    lens joined input, the intervention scenario read;
 *   6. OUTCOME     — `recordExecutionLive` + `recordOutcomeLive` (the
 *                    outcome loop's write legs, exact backend contracts).
 *
 * PROVENANCE SPOT CHECKS at every consequential quantity: values trace to
 * their source/evidence/version context (reality node sources, evidence
 * ids, the OBSERVED outcome's post-work evidence, the PROPOSED scenario's
 * epistemic seal, the BOQ's source-of-record identity).
 *
 * Determinism: stub fetches with fixed payloads; no clock, no randomness,
 * no network. The stub bodies for the /v1/adapter/** routes are the
 * committed PROD-016 corpus values — what a contract-serving deployment
 * answers.
 */

import { describe, expect, test } from "bun:test";
import { parseHash } from "./router";
import {
  createProjectLive,
  loadAuthorizationContextLive,
  loadBoqImportsLive,
  loadBoqLensLive,
  loadCaseDetailLive,
  loadCaseSummariesLive,
  loadEvidenceIndexLive,
  loadProjectsLive,
  loadRealityLive,
  loadScenarioLive,
  loadTaskFlowLive,
  recordExecutionLive,
  recordOutcomeLive,
  submitTaskIntentLive,
  isNotFoundHttp,
  type FetchLike,
} from "./api";
import { taskIntentFromSelection } from "./create-forms";
import { taskFlowView, operationResultView } from "./task-flow";
import { demoTaskFlowBundle } from "./task-dataset";
import { canonicalScenario } from "../viewer/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { ContractObjectFields } from "./contract-objects";

/* ------------------------------------------------------------------ */
/* The stub transport (the api.test.ts discipline)                       */
/* ------------------------------------------------------------------ */

function stubFetch(
  routes: Readonly<Record<string, { readonly status?: number; readonly body?: unknown } | "throw">>,
): FetchLike {
  return async (input: string) => {
    const route = routes[input];
    if (route === undefined) {
      return new Response("not stubbed", { status: 404 });
    }
    if (route === "throw") {
      throw new TypeError("network is down");
    }
    const status = route.status ?? 200;
    const body = route.body ?? { ok: true };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

/** The corpus task-flow wire values (what a contract-serving deployment answers). */
function taskFlowWire(): Record<string, unknown> {
  const bundle = demoTaskFlowBundle();
  return {
    ok: true,
    flow: {
      context: bundle.context,
      reality: bundle.reality,
      evidence: bundle.evidence,
      boq: bundle.boq,
      caseSummary: bundle.caseSummary,
      scenario: bundle.scenario,
      outcome: bundle.outcome,
      nextBestAction: bundle.nextBestAction,
      authorization: bundle.authorization,
      requirements: bundle.requirements,
    },
  };
}

/** A GraphVersion wire record (the backend's own reality route contract). */
const REALITY_WIRE = {
  ok: true,
  version: {
    versionId: "v014",
    createdAt: "2026-01-15T10:05:00.000Z",
    nodes: [
      {
        nodeId: "node-wall-12",
        kind: "wall",
        epistemicStatus: "CONFIRMED",
        properties: [
          { key: "thickness", value: 240, unit: "mm" },
          { key: "condition", value: "cracked-masonry" },
        ],
        provenance: [
          { evidenceId: "f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712" },
        ],
      },
      {
        nodeId: "node-slab-3",
        kind: "slab",
        epistemicStatus: "OBSERVED",
        properties: [{ key: "thickness", value: 180, unit: "mm" }],
        provenance: [],
      },
    ],
  },
};

const EVIDENCE_WIRE = {
  ok: true,
  evidence: [
    {
      evidence: {
        contentId: "f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712",
        acquisitionMethod: "STILL_IMAGERY",
        mediaType: "image/jpeg",
        byteSize: 2841503,
        capturedAt: "2026-01-14T09:00:00.000Z",
      },
      invalidation: null,
    },
    {
      evidence: {
        contentId: "60dbb33388e68f526c58a7b6595a72a33475bcb95f9706f0ceafe94e7488680b",
        acquisitionMethod: "DEPTH_SCAN",
        mediaType: "application/octet-stream",
        byteSize: 587202,
        capturedAt: "2026-01-14T09:05:00.000Z",
      },
      invalidation: null,
    },
  ],
};

const CASE_LIST_WIRE = {
  ok: true,
  cases: [
    {
      caseId: "case-91ab",
      title: "Level 2 masonry cracking — diagnosis pending reference dimensions",
      status: "under-review",
      createdAt: "2026-01-12T08:00:00.000Z",
      updatedAt: "2026-01-15T09:45:00.000Z",
      counts: {
        observations: 7,
        hypotheses: 2,
        missingEvidence: 2,
        openMissingEvidence: 2,
      },
    },
  ],
};

const CASE_DETAIL_WIRE = {
  ok: true,
  case: {
    caseId: "case-91ab",
    title: "Level 2 masonry cracking — diagnosis pending reference dimensions",
    status: "under-review",
    observations: [
      {
        nodeId: "node-wall-12",
        observedAt: "2026-01-13T10:00:00.000Z",
        evidenceIds: ["f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712"],
        note: "Stepped cracking above the level-2 window heads.",
      },
    ],
    hypotheses: [
      {
        statement: "Differential settlement of the north strip foundation.",
        status: "open",
        supportedByEvidenceIds: ["f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712"],
      },
    ],
    missingEvidence: [
      {
        description: "A calibrated reference dimension for the cracked area.",
        status: "open",
      },
    ],
  },
};

const BOQ_IMPORTS_WIRE = {
  ok: true,
  imports: [
    {
      importId: "boq-import-33d",
      format: "xlsx",
      source: { byteSize: 48124 },
      parse: { status: "parsed" },
    },
  ],
};

const BOQ_LENS_WIRE = {
  ok: true,
  lens: {
    importId: "boq-import-33d",
    sourceName: "ERP-BOQ-2026-0042.xlsx",
    dictionaryVersion: null,
    mappingVersion: 2,
    sourceCellRefs: ["B4", "C4"],
    items: [
      {
        rowNumber: 1,
        section: "Masonry works",
        description: "Brickwork to external walls 240mm",
        quantity: 120,
        unit: "m²",
        amount: 10320,
        currency: "EUR",
        cellRef: "B4",
        mapping: { status: "mapped", nodeId: "node-wall-12" },
      },
    ],
  },
};

const EXECUTION_WIRE = {
  ok: true,
  execution: {
    executionRecordId: "exec-001",
    caseId: "case-91ab",
    scenarioId: "scenario-55c1",
    stateId: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
    executedStepIds: ["step-1"],
    evidenceIds: ["196b5ab5d99835a2a14dce2348d3a29c0a21226d65bb0ce8a088fcfcd37c0e43"],
    captureSessionIds: [],
    executedAt: "2026-01-18T10:00:00.000Z",
    recordedAt: "2026-01-18T10:05:00.000Z",
    stateTransition: {
      fromStatus: "approved",
      toStatus: "executed",
      evidenceIds: ["196b5ab5d99835a2a14dce2348d3a29c0a21226d65bb0ce8a088fcfcd37c0e43"],
    },
    outcomes: [
      {
        outcomeId: "outcome-77e2",
        statement: "The crack width did not increase after stabilization.",
        epistemicStatus: "OBSERVED",
      },
    ],
  },
};

const OUTCOME_WIRE = {
  ok: true,
  outcome: {
    outcomeId: "outcome-77e2",
    executionRecordId: "exec-001",
    caseId: "case-91ab",
    statement: "The crack width did not increase after stabilization.",
    epistemicStatus: "OBSERVED",
    evidenceIds: ["196b5ab5d99835a2a14dce2348d3a29c0a21226d65bb0ce8a088fcfcd37c0e43"],
  },
};

/** The whole journey's stub world (adapter routes + backend routes). */
function journeyFetch(): FetchLike {
  return stubFetch({
    "/v1/identity/organizations/org-northwind/projects?requester=user-alice": {
      body: {
        ok: true,
        projects: [
          {
            projectId: "proj-7f3a2b",
            organizationId: "org-northwind",
            name: "Riverside Block B Refurbishment",
            createdAt: "2026-01-10T08:00:00.000Z",
          },
        ],
      },
    },
    "/v1/identity/organizations/org-northwind/projects": {
      body: {
        ok: true,
        project: {
          projectId: "proj-7f3a2b",
          organizationId: "org-northwind",
          name: "Riverside Block B Refurbishment",
          createdAt: "2026-01-10T08:00:00.000Z",
        },
      },
    },
    "/v1/adapter/projects/proj-7f3a2b/task-flow": { body: taskFlowWire() },
    "/v1/adapter/projects/proj-7f3a2b/authorization": {
      body: { ok: true, authorization: demoTaskFlowBundle().authorization },
    },
    "/v1/adapter/task-intents": {
      body: {
        ok: true,
        result: {
          contractVersion: "1.0.0",
          operationId: "operation-3fa9",
          actionRef: "action-8ba1",
          status: "succeeded",
          resultRefs: ["mission-batch-9917", "evidence-f08d256a", "mission-step-42"],
          completedAt: "2026-01-15T12:40:00.000Z",
        },
        action: null,
      },
    },
    "/v1/reality/projects/proj-7f3a2b/versions/latest": { body: REALITY_WIRE },
    "/v1/evidence": { body: EVIDENCE_WIRE },
    "/v1/cases": { body: CASE_LIST_WIRE },
    "/v1/cases/case-91ab": { body: CASE_DETAIL_WIRE },
    "/v1/boq/imports": { body: BOQ_IMPORTS_WIRE },
    "/v1/boq/imports/boq-import-33d/lens": { body: BOQ_LENS_WIRE },
    "/v1/interventions/scenario-55c1": {
      body: { ok: true, scenario: canonicalScenario() },
    },
    "/v1/executions": { body: EXECUTION_WIRE },
    "/v1/executions/exec-001/outcomes": { body: OUTCOME_WIRE },
  });
}

/* ------------------------------------------------------------------ */
/* The trace                                                            */
/* ------------------------------------------------------------------ */

describe("PROD-017 the golden journey task trace (real entrypoints, injected transport)", () => {
  const fetchImpl = journeyFetch();

  test("step 0 — the journey's hash addresses parse to the REAL routes", () => {
    expect(parseHash("#/")).toEqual({ name: "dashboard" });
    expect(parseHash("#/projects")).toEqual({ name: "projects" });
    expect(parseHash("#/projects/proj-7f3a2b")).toEqual({
      name: "project",
      projectId: "proj-7f3a2b",
    });
    expect(parseHash("#/projects/proj-7f3a2b/sitetwin")).toEqual({
      name: "sitetwin",
      projectId: "proj-7f3a2b",
    });
    expect(parseHash("#/projects/proj-7f3a2b/boq-lens")).toEqual({
      name: "boq-lens",
      projectId: "proj-7f3a2b",
    });
    expect(parseHash("#/projects/proj-7f3a2b/case")).toEqual({
      name: "case",
      projectId: "proj-7f3a2b",
    });
    expect(parseHash("#/projects/proj-7f3a2b/intervention?layer=3&scenario=scenario-55c1")).toEqual(
      {
        name: "intervention",
        projectId: "proj-7f3a2b",
        query: { layer: 3, scenario: "scenario-55c1" },
      },
    );
  });

  test("step 1 — open the project through the identity read (requester-guarded)", async () => {
    const result = await loadProjectsLive(fetchImpl, "org-northwind", "user-alice");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0]?.record.projectId).toBe("proj-7f3a2b");
      expect(result.projects[0]?.endpoint).toContain("/v1/identity/organizations/");
    }
  });

  test("step 1b — create a project through the identity WRITE path (exact contract)", async () => {
    const result = await createProjectLive(fetchImpl, "org-northwind", {
      projectId: "proj-7f3a2b",
      name: "Riverside Block B Refurbishment",
      actor: "user-alice",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.projectId).toBe("proj-7f3a2b");
      expect(result.endpoint).toBe("/v1/identity/organizations/org-northwind/projects");
    }
  });

  test("step 2 — author the task intent (W-R3) and submit it through the adapter seam", async () => {
    const intent = taskIntentFromSelection(
      {
        projectRef: "proj-7f3a2b",
        taskType: "field-capture",
        intent: "Capture depth evidence of the cracked masonry on level 2 so the engineering case can be diagnosed.",
        targetRefs: ["case-91ab", "node-wall-12"],
        parameters: { priority: "high", area: "level-2" },
      },
      { taskId: "task-2c9f01", createdAt: "2026-01-15T09:25:00.000Z" },
    );
    const result = await submitTaskIntentLive(fetchImpl, intent);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The SERVER-AUTHORITATIVE answer: the operation result is decoded
      // through the contract, never locally re-validated.
      const view = operationResultView(result.answer.result);
      expect(view.status).toBe("succeeded");
      expect(view.resultRefs).toEqual(["mission-batch-9917", "evidence-f08d256a", "mission-step-42"]);
      expect(view.operationId).toBe("operation-3fa9");
    }
  });

  test("step 3 — load the joined TASK FLOW through the contract decoders", async () => {
    const result = await loadTaskFlowLive(fetchImpl, "proj-7f3a2b");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.endpoint).toBe("/v1/adapter/projects/proj-7f3a2b/task-flow");
      const view = taskFlowView(result.flow, "proj-7f3a2b");
      // The task-first view exposes the next action or blocked reason.
      expect(view.nextBestAction?.status).toBe("blocked");
      expect(view.nextBestAction?.blockers.map((blocker) => blocker.reasonCode)).toEqual([
        "capability-blocked",
        "authorization-denied",
      ]);
      expect(view.taskBlockedOnThisPlatform).toBe(true);
      // The journey steps carry their records' verbatim summaries.
      const evidenceStep = view.steps.find((step) => step.step === "inspect-evidence");
      expect(evidenceStep?.record.summary).toBe("3 evidence items · 2 declared gaps");
    }
  });

  test("step 3b — the W-R1 authorization seam (grants + typed denials)", async () => {
    const result = await loadAuthorizationContextLive(fetchImpl, "proj-7f3a2b");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authorization.subjectRef).toBe("principal-field-12");
      expect(result.authorization.denials.map((denial) => denial.action)).toEqual([
        "reality:write",
        "settings:tenant-admin",
      ]);
    }
  });

  test("step 4a — reality: the GraphVersion → RealityPaneView with PROVENANCE spot checks", async () => {
    const result = await loadRealityLive(fetchImpl, "proj-7f3a2b");
    expect(result.ok).toBe(true);
    if (result.ok && result.view !== null) {
      const view = result.view;
      // PROVENANCE SPOT CHECK: every node's source names the version+node.
      const wall = view.nodes.find((node) => node.nodeId === "node-wall-12");
      expect(wall?.source).toEqual({ module: "reality", recordId: "v014:node-wall-12" });
      // The consequential quantity (thickness 240 mm) is a property join
      // carrying the node's source; its evidence id is verbatim.
      expect(wall?.summary.value).toBe("thickness 240 mm · condition cracked-masonry");
      expect(wall?.evidenceIds[0]?.value).toBe(
        "f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712",
      );
      // Epistemic statuses are carried verbatim (CONFIRMED ≠ OBSERVED).
      expect(wall?.epistemicStatus).toBe("CONFIRMED");
      expect(view.nodes.find((node) => node.nodeId === "node-slab-3")?.epistemicStatus).toBe(
        "OBSERVED",
      );
    }
  });

  test("step 4b — evidence register: content ids and honest invalidation state", async () => {
    const result = await loadEvidenceIndexLive(fetchImpl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.evidence.contentId).toBe(
        "f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712",
      );
      expect(result.items.every((item) => item.invalidation === null)).toBe(true);
    }
  });

  test("step 4c — case: the diagnosis record with evidence-linked observations", async () => {
    const summaries = await loadCaseSummariesLive(fetchImpl);
    expect(summaries.ok).toBe(true);
    const detail = await loadCaseDetailLive(fetchImpl, "case-91ab");
    expect(detail.ok).toBe(true);
    if (detail.ok && detail.record !== null) {
      // PROVENANCE SPOT CHECK: the observation carries its evidence id.
      expect(detail.record.observations[0]?.evidenceIds).toEqual([
        "f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712",
      ]);
      expect(detail.record.missingEvidence[0]?.status).toBe("open");
    }
  });

  test("step 4d — BOQ: the joined lens input with source-of-record identity", async () => {
    const imports = await loadBoqImportsLive(fetchImpl);
    expect(imports.ok).toBe(true);
    const lens = await loadBoqLensLive(fetchImpl, "boq-import-33d");
    expect(lens.ok).toBe(true);
    if (lens.ok) {
      // PROVENANCE SPOT CHECK: the import's source identity rides the
      // record verbatim (the incumbent stays the system of record).
      expect(lens.record.sourceName).toBe("ERP-BOQ-2026-0042.xlsx");
      expect(lens.record.mappingVersion).toBe(2);
      expect(lens.record.items[0]).toMatchObject({
        cellRef: "B4",
        mapping: { status: "mapped", nodeId: "node-wall-12" },
      });
    }
  });

  test("step 5 — intervention: the scenario read through the viewer library", async () => {
    const result = await loadScenarioLive(fetchImpl, "scenario-55c1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      // PROVENANCE SPOT CHECK: proposed states are PROPOSED-only — the
      // viewer's model seals the epistemic distinction.
      expect(result.scenario.record.status).toBe("draft");
      expect(result.scenario.record.states.length).toBeGreaterThan(1);
      expect(result.scenario.record.steps.length).toBeGreaterThan(0);
    }
  });

  test("step 6 — outcome loop: execution + OBSERVED outcome with post-work evidence", async () => {
    const execution = await recordExecutionLive(fetchImpl, {
      executionRecordId: "exec-001",
      caseId: "case-91ab",
      scenarioId: "scenario-55c1",
      stateId: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
      executedStepIds: ["step-1"],
      evidenceIds: ["196b5ab5d99835a2a14dce2348d3a29c0a21226d65bb0ce8a088fcfcd37c0e43"],
      executedAt: "2026-01-18T10:00:00.000Z",
    });
    expect(execution.ok).toBe(true);
    if (execution.ok) {
      // PROVENANCE SPOT CHECK: the state transition carries its evidence.
      expect(execution.record.stateTransition.toStatus).toBe("executed");
      expect(execution.record.stateTransition.evidenceIds).toEqual([
        "196b5ab5d99835a2a14dce2348d3a29c0a21226d65bb0ce8a088fcfcd37c0e43",
      ]);
    }
    const outcome = await recordOutcomeLive(fetchImpl, "exec-001", {
      caseId: "case-91ab",
      statement: "The crack width did not increase after stabilization.",
      evidenceIds: ["196b5ab5d99835a2a14dce2348d3a29c0a21226d65bb0ce8a088fcfcd37c0e43"],
      observedAt: "2026-01-19T10:00:00.000Z",
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // PROVENANCE SPOT CHECK: OBSERVED is earned by post-work evidence.
      expect(outcome.record.epistemicStatus).toBe("OBSERVED");
      expect(outcome.record.evidenceIds).toEqual([
        "196b5ab5d99835a2a14dce2348d3a29c0a21226d65bb0ce8a088fcfcd37c0e43",
      ]);
    }
  });

  test("the audit trail renders: consequential claims trace to source/evidence/version context", () => {
    const bundle = demoTaskFlowBundle();
    // The reality summary's readiness statement renders verbatim with its
    // model version and update instant.
    const html = renderToStaticMarkup(
      <ContractObjectFields objectName="RealitySummary" payload={bundle.reality} />,
    );
    expect(html).toContain("readinessStatus");
    expect(html).toContain("partial");
    expect(html).toContain("modelVersion");
    expect(html).toContain("14");
    // The evidence summary's ids and gaps render.
    const evidenceHtml = renderToStaticMarkup(
      <ContractObjectFields objectName="EvidenceSummary" payload={bundle.evidence} />,
    );
    expect(evidenceHtml).toContain("f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712");
    expect(evidenceHtml).toContain("gap-4471");
  });

  test("explicit states: a deployment that does not serve the adapter routes answers 404 honestly", async () => {
    const result = await loadTaskFlowLive(stubFetch({}), "proj-7f3a2b");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(isNotFoundHttp(result.failure)).toBe(true);
      if (result.failure.kind === "http") {
        expect(result.failure.status).toBe(404);
      }
    }
  });

  test("explicit states: a contract-version mismatch is a typed failure (never coerced)", async () => {
    const mismatched = stubFetch({
      "/v1/adapter/projects/proj-7f3a2b/task-flow": {
        body: {
          ok: true,
          flow: {
            context: {
              contractVersion: "2.0.0",
              projectId: "proj-7f3a2b",
              projectName: "X",
              userRole: "engineer",
              updatedAt: "2026-01-15T09:20:00.000Z",
            },
          },
        },
      },
    });
    const result = await loadTaskFlowLive(mismatched, "proj-7f3a2b");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("invalid");
      expect(result.failure.detail).toContain("version mismatch");
    }
  });
});
