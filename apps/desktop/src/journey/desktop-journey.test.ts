/**
 * PROD-020 — the DESKTOP JOURNEY TASK TRACE: the automated smoke trace
 * that drives the desktop adapter's REAL entrypoints end-to-end (the
 * PROD-020 acceptance: "the desktop adapter can open a project and
 * exercise representative review/intervention workflows").
 *
 * The trace follows the task-first interaction model of
 * spec/client-adapter-contract.md over the adapter layer the SHELL
 * drives (no test doubles of adapter code; only the HTTP transport is
 * injected, exactly like the browser adapter's golden journey):
 *
 *   1. SHELL STARTUP — the deep-link argument parse (`aise://project/…`)
 *      selects the project and the web-app load target (policy.ts);
 *   2. OPEN PROJECT  — `openProject` (client.ts) → the joined task-flow
 *                      bundle decoded through the contract seam
 *                      (ProjectContext, RealitySummary, EvidenceSummary,
 *                      BOQContext, case/scenario/outcome summaries,
 *                      NextBestAction, AuthorizationContext,
 *                      requirements) + the negotiation + the composed
 *                      high-density review workspace;
 *   3. REVIEW        — the dense workspace surfaces: the evidence table
 *                      (provenance ids + declared gaps), the BOQ
 *                      source-of-record, the case summary, the PROPOSED
 *                      scenario seal, the OBSERVED outcome with
 *                      post-work evidence;
 *   4. ACTION        — the blocked NextBestAction renders its blockers
 *                      verbatim; the authorization denials render with
 *                      reason codes;
 *   5. INTENT        — a review TaskIntent is authored (the ONE
 *                      client-authored object) and submitted through the
 *                      shared endpoint → the SERVER-AUTHORITATIVE
 *                      OperationResult (the failed provider-unavailable
 *                      scenario, then the answered retry);
 *   6. OFFLINE LEG   — an unreachable submission queues honestly in the
 *                      outbox and completes only on replay through the
 *                      same shared endpoint;
 *   7. AFFORDANCES   — the keyboard focus path dispatches over the
 *                      workspace; the open-local-file affordance authors
 *                      a typed TaskIntent behind its capability gate.
 *
 * PROVENANCE SPOT CHECKS at every consequential quantity. Determinism:
 * stub transport with fixed payloads (the committed PROD-016 corpus
 * values — what a contract-serving deployment answers); no clock, no
 * randomness, no network.
 */

import { describe, expect, test } from "bun:test";
import {
  parseShellArguments,
  dispatchForAccelerator,
} from "../shell/policy";
import {
  authorizationEndpoint,
  composeReviewWorkspace,
  createDesktopClient,
  taskFlowEndpoint,
  TASK_INTENT_ENDPOINT,
  type DesktopTransport,
  type TransportResponse,
} from "../adapter/client";
import { decodeTaskIntentAtSeam, encodeTaskIntentWire } from "../adapter/seam";
import {
  CORPUS_AUTHORIZATION_WIRE,
  CORPUS_OPERATION_RESULT_FAILED_WIRE,
  CORPUS_OPERATION_RESULT_SUCCEEDED_WIRE,
  CORPUS_TASK_FLOW_WIRE,
} from "../adapter/corpus-world";
import { paneById, provenanceSpotCheck } from "../adapter/review-layout";
import { negotiateDesktopTask } from "../adapter/profile";
import {
  enabledLocalAffordances,
  taskIntentForLocalFile,
} from "../adapter/local-integrations";
import {
  emptyConvenienceState,
  enqueueIntent,
  rememberProject,
  replayableIntents,
} from "../adapter/convenience-store";

const API_BASE = "http://127.0.0.1:8080";
const PROJECT = "proj-7f3a2b";

/* ------------------------------------------------------------------ */
/* The stub transport (what a contract-serving deployment answers)      */
/* ------------------------------------------------------------------ */

type RouteTable = Readonly<Record<string, TransportResponse | "throw">>;

function stubTransport(routes: RouteTable): DesktopTransport {
  return {
    get: async (url: string) => {
      const route = routes[url];
      if (route === "throw") {
        throw new Error("network is down (stubbed)");
      }
      return route ?? { status: 404, body: null };
    },
    postJson: async (url: string) => {
      const route = routes[url];
      if (route === "throw") {
        throw new Error("network is down (stubbed)");
      }
      return route ?? { status: 404, body: null };
    },
  };
}

function ok(body: unknown): TransportResponse {
  return { status: 200, body: JSON.stringify(body) };
}

const TASK_FLOW_URL = `${API_BASE}${taskFlowEndpoint(PROJECT)}`;
const AUTHORIZATION_URL = `${API_BASE}${authorizationEndpoint(PROJECT)}`;
const SUBMIT_URL = `${API_BASE}${TASK_INTENT_ENDPOINT}`;

describe("PROD-020 the desktop project/review journey (the real adapter entrypoints)", () => {
  test("step 1 — shell startup: the deep link selects the project over the web-app target", () => {
    const parsed = parseShellArguments(["aise://project/proj-7f3a2b"], {});
    expect(parsed).toEqual({
      kind: "deep-link",
      projectRef: PROJECT,
      target: { kind: "url", url: "http://localhost:5173" },
    });
  });

  test("steps 2–4 — open the project, review the surfaces, surface the blocked action", async () => {
    const client = createDesktopClient(
      stubTransport({ [TASK_FLOW_URL]: ok({ ok: true, flow: CORPUS_TASK_FLOW_WIRE }) }),
      { apiBaseUrl: API_BASE },
    );

    // Step 2 — OPEN PROJECT through the real entrypoint.
    const opened = await client.openProject(PROJECT, {
      convenience: rememberProject(emptyConvenienceState(), {
        contractVersion: "1.0.0",
        projectId: PROJECT,
        projectName: "STALE LOCAL NAME",
        userRole: "observer",
        updatedAt: "2020-01-01T00:00:00.000Z",
      }, "2020-01-01T00:00:00.000Z"),
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const view = opened.value;

    // ProjectContext decoded through the seam; the SERVER identity wins.
    expect(view.context?.projectId).toBe(PROJECT);
    expect(view.projectIdentity).toEqual({
      source: "server",
      name: "Riverside Block B Refurbishment",
    });

    // The high-density workspace composes all review panes.
    const layout = view.workspace;
    expect(layout.columns).toHaveLength(3);
    expect(layout.emptyPanes).toEqual(["pane:operation-result"]);

    // Step 3 — REVIEW SURFACES with provenance visible.
    const spot = provenanceSpotCheck(layout);
    expect(spot.boqSourceOfRecord).toBe("erp / ERP-BOQ-2026-0042"); // source-of-record identity
    expect(spot.scenarioEpistemicState).toBe("PROPOSED"); // the proposal seal stays
    expect(spot.outcomePostWorkEvidence).toHaveLength(2); // post-work evidence ids
    expect(spot.realityModelVersion).toBe(14); // the reality version

    // The dense evidence table: 3 provenance-anchored items + 2 declared gaps.
    expect(layout.evidenceTable.rows).toHaveLength(5);
    const gaps = layout.evidenceTable.rows.filter((row) => row.kind === "evidence-gap");
    expect(gaps.map((row) => row.gapKind)).toEqual(["MISSING", "WEAK"]);

    // The case summary renders verbatim (under review, 7 observations).
    const casePane = paneById(layout, "pane:engineering-case");
    expect(casePane?.lines.find((line) => line.field === "caseId")?.text).toBe("case-91ab");
    expect(casePane?.lines.find((line) => line.field === "status")?.text).toBe("under-review");
    expect(casePane?.lines.find((line) => line.field === "observationCount")?.text).toBe("7");

    // Step 4 — THE BLOCKED ACTION surfaces its blockers verbatim.
    const actionPane = paneById(layout, "pane:next-best-action");
    expect(actionPane?.lines.find((line) => line.field === "status")?.text).toBe("blocked");
    const blockers = actionPane?.lines.find((line) => line.field === "blockers")?.text ?? "";
    expect(blockers).toContain("capability-blocked");
    expect(blockers).toContain("authorization-denied");

    // The negotiation pane agrees: the depth-capture task is BLOCKED on
    // this review-optimized shell (empty permitted modes).
    expect(view.negotiation?.outcome).toBe("blocked");
    expect(view.negotiation?.permittedInteractionModes).toEqual([]);

    // The authorization pane renders grants AND typed denials.
    const authPane = paneById(layout, "pane:authorization");
    const denials = authPane?.lines.find((line) => line.field === "denials")?.text ?? "";
    expect(denials).toContain("reality:write");
    expect(denials).toContain("missing-permission");
    expect(denials).toContain("forbidden-role");
  });

  test("steps 5–6 — author a review TaskIntent, submit, render the server-authoritative result, queue and replay offline", async () => {
    // Step 5a — AUTHOR the intent (the ONE client-authored object): a
    // review intent over the engineering case, authored through the seam.
    const intentWire = {
      contractVersion: "1.0.0",
      taskId: "task-journey-review",
      taskType: "evidence-review",
      intent: "Review the cracked-masonry evidence, its declared gaps and the PROPOSED intervention scenario.",
      projectRef: PROJECT,
      targetRefs: ["case-91ab", "scenario-55c1"],
      parameters: { area: "level-2", density: "dense" },
      createdAt: "2026-01-15T16:00:00.000Z",
    };
    const decodedIntent = decodeTaskIntentAtSeam(intentWire);
    expect(decodedIntent.ok).toBe(true);
    if (!decodedIntent.ok) {
      return;
    }
    const intent = decodedIntent.value;
    // The wire encoding is canonical (serialization, never authority).
    const encoded = encodeTaskIntentWire(intent);
    expect(encoded.ok).toBe(true);

    // Step 5b — SUBMIT through the shared endpoint; the server answers
    // with the FAILED provider-unavailable result — carried verbatim.
    const failingClient = createDesktopClient(
      stubTransport({
        [TASK_FLOW_URL]: ok({ ok: true, flow: CORPUS_TASK_FLOW_WIRE }),
        [SUBMIT_URL]: ok({ ok: true, result: CORPUS_OPERATION_RESULT_FAILED_WIRE, action: null }),
      }),
      { apiBaseUrl: API_BASE },
    );
    const failedOutcome = await failingClient.submitIntent(intent);
    expect(failedOutcome.kind).toBe("answered");
    if (failedOutcome.kind !== "answered") {
      return;
    }
    expect(failedOutcome.answer.result.status).toBe("failed");
    expect(failedOutcome.answer.result.failure?.code).toBe("provider-unavailable");

    // The workspace recomposition renders the failure in the action column.
    const openedOnce = await failingClient.openProject(PROJECT);
    expect(openedOnce.ok).toBe(true);
    if (!openedOnce.ok) {
      return;
    }
    const failedLayout = composeReviewWorkspace(openedOnce.value, {
      operationResult: failedOutcome.answer.result,
    });
    const failedPane = paneById(failedLayout, "pane:operation-result");
    expect(failedPane?.lines.find((line) => line.field === "status")?.text).toBe("failed");
    expect(failedPane?.lines.find((line) => line.field === "failure")?.text).toContain(
      "provider-unavailable",
    );

    // Step 5c — THE RETRY ANSWERS (the same shared endpoint): the
    // server-authoritative SUCCEEDED result with result refs.
    const answeringClient = createDesktopClient(
      stubTransport({
        [TASK_FLOW_URL]: ok({ ok: true, flow: CORPUS_TASK_FLOW_WIRE }),
        [SUBMIT_URL]: ok({
          ok: true,
          result: CORPUS_OPERATION_RESULT_SUCCEEDED_WIRE,
          action: null,
        }),
      }),
      { apiBaseUrl: API_BASE },
    );
    const answered = await answeringClient.submitIntent(intent);
    expect(answered.kind).toBe("answered");
    if (answered.kind !== "answered") {
      return;
    }
    expect(answered.answer.result.status).toBe("succeeded");
    expect(answered.answer.result.resultRefs).toEqual([
      "mission-batch-9917",
      "evidence-f08d256a",
      "mission-step-42",
    ]);

    // Step 6 — THE OFFLINE LEG: an unreachable submission queues HONESTLY
    // (never a fabricated result) and completes only on replay.
    const routes: RouteTable = {
      [TASK_FLOW_URL]: ok({ ok: true, flow: CORPUS_TASK_FLOW_WIRE }),
      [SUBMIT_URL]: "throw",
    };
    const offlineClient = createDesktopClient(stubTransport(routes), { apiBaseUrl: API_BASE });
    let convenience = emptyConvenienceState();
    const offlineOutcome = await offlineClient.submitIntent(intent);
    expect(offlineOutcome.kind).toBe("unreachable");
    if (offlineOutcome.kind === "unreachable") {
      convenience = enqueueIntent(convenience, intent, "2026-01-15T16:05:00.000Z");
    }
    expect(replayableIntents(convenience)).toHaveLength(1);
    // The queued intent carries no answer state.
    expect(Object.keys(convenience.outbox[0] ?? {})).toEqual(["queuedAt", "intent"]);

    // Connectivity returns: the replay submits through the SAME endpoint
    // and only the server's OperationResult completes the intent.
    const onlineRoutes: RouteTable = {
      [TASK_FLOW_URL]: ok({ ok: true, flow: CORPUS_TASK_FLOW_WIRE }),
      [SUBMIT_URL]: ok({
        ok: true,
        result: CORPUS_OPERATION_RESULT_SUCCEEDED_WIRE,
        action: null,
      }),
    };
    const onlineClient = createDesktopClient(stubTransport(onlineRoutes), { apiBaseUrl: API_BASE });
    const replayed = await onlineClient.replayOutbox(convenience);
    expect(replayed.state.outbox).toEqual([]);
    expect(replayed.outcomes[0]?.outcome.kind).toBe("answered");
  });

  test("step 5' — the authorization refresh leg renders the server denial verbatim", async () => {
    const client = createDesktopClient(
      stubTransport({
        [AUTHORIZATION_URL]: ok({ ok: true, authorization: CORPUS_AUTHORIZATION_WIRE }),
      }),
      { apiBaseUrl: API_BASE },
    );
    const refreshed = await client.refreshAuthorization(PROJECT);
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) {
      return;
    }
    expect(refreshed.value.subjectRef).toBe("principal-field-12");
    expect(refreshed.value.denials[0]).toEqual({
      action: "reality:write",
      reasonCode: "missing-permission",
      reasonDetail:
        "The field-operator role on this project does not carry reality:write; ask the project engineer to grant it or perform the write under an engineer session.",
    });
  });

  test("step 7 — the desktop affordances: keyboard focus dispatch + the capability-gated local file intent", async () => {
    // The keyboard focus path dispatches over the workspace (presentation).
    expect(dispatchForAccelerator("CommandOrControl+2")).toEqual({
      command: "focus-pane",
      targetPane: "pane:boq",
    });
    expect(dispatchForAccelerator("CommandOrControl+Enter")).toEqual({
      command: "submit-task-intent",
    });

    // The open-local-file affordance is capability-gated on the declared
    // profile and its consequential leg is a typed TaskIntent.
    const enabled = enabledLocalAffordances(
      (await import("../adapter/profile")).DESKTOP_ADAPTER_PROFILE,
    );
    expect(enabled.map((affordance) => affordance.id)).toContain("open-local-file");
    const localIntent = taskIntentForLocalFile(
      { fileName: "site-boq-rev2.xlsx", byteSize: 48213 },
      PROJECT,
      { taskId: "task-journey-local", createdAt: "2026-01-15T16:10:00.000Z" },
    );
    const decoded = decodeTaskIntentAtSeam(localIntent);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.taskType).toBe("project-administration");
      expect(decoded.value.parameters.channel).toBe("desktop-local-file");
    }

    // The negotiation discipline held through the whole journey: the
    // review-optimized shell stays blocked for depth capture.
    expect(
      negotiateDesktopTask({
        contractVersion: "1.0.0",
        requirementsId: "requirements-field-depth-capture",
        taskType: "field-capture",
        camera: { requireAny: ["depth"], blocking: true },
      }).outcome,
    ).toBe("blocked");
  });
});
