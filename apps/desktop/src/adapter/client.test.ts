/**
 * PROD-020 — the desktop adapter CLIENT tests: the adapter-logic
 * entrypoints the shell drives, exercised with an injected stub
 * transport (the api.test.ts discipline — no network, no clock, no
 * randomness). The endpoints are the SHARED adapter routes the browser
 * adapter consumes; the honest failure states (not-served / rejected /
 * unreachable / invalid) are typed, and only "answered" carries a
 * server-authoritative OperationResult.
 */

import { describe, expect, test } from "bun:test";
import {
  REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS,
  decodeTaskIntent,
} from "@aise/adapter-contract";
import {
  CORPUS_AUTHORIZATION_WIRE,
  CORPUS_OPERATION_RESULT_FAILED_WIRE,
  CORPUS_OPERATION_RESULT_SUCCEEDED_WIRE,
  CORPUS_TASK_FLOW_WIRE,
  CORPUS_TASK_INTENT_WIRE,
} from "./corpus-world";
import { decodeTaskIntentAtSeam } from "./seam";
import {
  authorizationEndpoint,
  composeReviewWorkspace,
  createDesktopClient,
  isNotServed,
  taskFlowEndpoint,
  TASK_INTENT_ENDPOINT,
  type DesktopTransport,
  type TransportResponse,
} from "./client";
import { negotiateDesktopTask } from "./profile";
import { paneById } from "./review-layout";
import {
  emptyConvenienceState,
  enqueueIntent,
  rememberProject,
} from "./convenience-store";

const API_BASE = "http://127.0.0.1:8080";

/** The stub transport (fixed routes; 404 for anything not stubbed). */
function stubTransport(
  routes: Readonly<Record<string, TransportResponse | "throw">>,
): DesktopTransport {
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

const INTENT = (() => {
  const decoded = decodeTaskIntentAtSeam(CORPUS_TASK_INTENT_WIRE);
  if (!decoded.ok) {
    throw new Error("corpus intent must decode");
  }
  return decoded.value;
})();

const TASK_FLOW_URL = `${API_BASE}${taskFlowEndpoint("proj-7f3a2b")}`;
const AUTHORIZATION_URL = `${API_BASE}${authorizationEndpoint("proj-7f3a2b")}`;
const SUBMIT_URL = `${API_BASE}${TASK_INTENT_ENDPOINT}`;

describe("PROD-020 the adapter client's shared endpoints (no desktop fork)", () => {
  test("the endpoint builders are the SHARED adapter routes the browser adapter consumes", () => {
    expect(taskFlowEndpoint("proj-7f3a2b")).toBe(
      "/v1/adapter/projects/proj-7f3a2b/task-flow",
    );
    expect(authorizationEndpoint("proj-7f3a2b")).toBe(
      "/v1/adapter/projects/proj-7f3a2b/authorization",
    );
    expect(TASK_INTENT_ENDPOINT).toBe("/v1/adapter/task-intents");
  });

  test("project ids are encoded in the endpoint path", () => {
    expect(taskFlowEndpoint("proj/with spaces")).toBe(
      "/v1/adapter/projects/proj%2Fwith%20spaces/task-flow",
    );
  });
});

describe("PROD-020 openProject (the REAL adapter entrypoint)", () => {
  test("opens the corpus project: decodes the joined bundle, negotiates, composes the workspace", async () => {
    const client = createDesktopClient(
      stubTransport({ [TASK_FLOW_URL]: ok({ ok: true, flow: CORPUS_TASK_FLOW_WIRE }) }),
      { apiBaseUrl: API_BASE },
    );
    const opened = await client.openProject("proj-7f3a2b");
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const view = opened.value;
    expect(view.projectId).toBe("proj-7f3a2b");
    expect(view.context?.projectName).toBe("Riverside Block B Refurbishment");
    expect(view.bundle.scenario?.epistemicState).toBe("PROPOSED");
    expect(view.negotiation?.outcome).toBe("blocked"); // depth capture on a review shell
    expect(view.negotiation?.requirementsRef).toBe("requirements-field-depth-capture");
    expect(view.workspace.panes.map((pane) => pane.paneId)).toContain("pane:evidence");
    expect(view.projectIdentity).toEqual({
      source: "server",
      name: "Riverside Block B Refurbishment",
    });
  });

  test("the server context ALWAYS wins over a stale local recents entry", async () => {
    const client = createDesktopClient(
      stubTransport({ [TASK_FLOW_URL]: ok({ ok: true, flow: CORPUS_TASK_FLOW_WIRE }) }),
      { apiBaseUrl: API_BASE },
    );
    const staleContext = {
      contractVersion: "1.0.0",
      projectId: "proj-7f3a2b",
      projectName: "STALE LOCAL NAME",
      userRole: "observer",
      updatedAt: "2020-01-01T00:00:00.000Z",
    } as const;
    const convenience = rememberProject(
      emptyConvenienceState(),
      // A deliberately stale/incorrect local entry for the same project:
      { ...staleContext, sourceSystem: undefined },
      "2020-01-01T00:00:00.000Z",
    );
    const opened = await client.openProject("proj-7f3a2b", { convenience });
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.value.projectIdentity.source).toBe("server");
      expect(opened.value.projectIdentity.name).toBe("Riverside Block B Refurbishment");
    }
  });

  test("a 404 is the honest not-served state (the deployment gates the adapter objects)", async () => {
    const client = createDesktopClient(stubTransport({}), { apiBaseUrl: API_BASE });
    const opened = await client.openProject("proj-7f3a2b");
    expect(opened.ok).toBe(false);
    if (!opened.ok) {
      expect(isNotServed(opened.failure)).toBe(true);
      expect(opened.failure.kind).toBe("http");
      if (opened.failure.kind === "http") {
        expect(opened.failure.status).toBe(404);
      }
    }
  });

  test("a network failure is the honest unreachable state", async () => {
    const client = createDesktopClient(
      stubTransport({ [TASK_FLOW_URL]: "throw" }),
      { apiBaseUrl: API_BASE },
    );
    const opened = await client.openProject("proj-7f3a2b");
    expect(opened.ok).toBe(false);
    if (!opened.ok) {
      expect(opened.failure.kind).toBe("network");
    }
  });

  test("a defective bundle object is the honest invalid state naming its object", async () => {
    const defective = {
      ...CORPUS_TASK_FLOW_WIRE,
      boq: {
        contractVersion: "9.0.0",
        boqId: "boq-x",
        revision: 1,
        lineItemCount: 1,
        updatedAt: "2026-01-14T16:30:00.000Z",
      },
    };
    const client = createDesktopClient(
      stubTransport({ [TASK_FLOW_URL]: ok({ ok: true, flow: defective }) }),
      { apiBaseUrl: API_BASE },
    );
    const opened = await client.openProject("proj-7f3a2b");
    expect(opened.ok).toBe(false);
    if (!opened.ok) {
      expect(opened.failure.kind).toBe("invalid");
      expect(opened.failure.detail).toContain("BOQContext");
      expect(opened.failure.detail).toContain("version mismatch");
    }
  });

  test("a non-envelope body is the honest invalid state", async () => {
    const client = createDesktopClient(
      stubTransport({ [TASK_FLOW_URL]: ok({ nope: true }) }),
      { apiBaseUrl: API_BASE },
    );
    const opened = await client.openProject("proj-7f3a2b");
    expect(opened.ok).toBe(false);
    if (!opened.ok) {
      expect(opened.failure.kind).toBe("invalid");
      expect(opened.failure.detail).toContain("envelope");
    }
  });
});

describe("PROD-020 refreshAuthorization (the server-provided grants/denials)", () => {
  test("decodes the authorization context with grants AND typed denials verbatim", async () => {
    const client = createDesktopClient(
      stubTransport({ [AUTHORIZATION_URL]: ok({ ok: true, authorization: CORPUS_AUTHORIZATION_WIRE }) }),
      { apiBaseUrl: API_BASE },
    );
    const refreshed = await client.refreshAuthorization("proj-7f3a2b");
    expect(refreshed.ok).toBe(true);
    if (refreshed.ok) {
      expect(refreshed.value.grantedActions).toContain("evidence:submit");
      expect(refreshed.value.denials[0]?.action).toBe("reality:write");
      expect(refreshed.value.denials[0]?.reasonCode).toBe("missing-permission");
    }
  });

  test("a 404 is the honest not-served state", async () => {
    const client = createDesktopClient(stubTransport({}), { apiBaseUrl: API_BASE });
    const refreshed = await client.refreshAuthorization("proj-7f3a2b");
    expect(refreshed.ok).toBe(false);
    if (!refreshed.ok) {
      expect(isNotServed(refreshed.failure)).toBe(true);
    }
  });
});

describe("PROD-020 submitIntent (the ONE client-authored object; the server answers)", () => {
  test("an answered submission carries the SERVER-AUTHORITATIVE OperationResult + follow-up action", async () => {
    const client = createDesktopClient(
      stubTransport({
        [SUBMIT_URL]: ok({
          ok: true,
          result: CORPUS_OPERATION_RESULT_SUCCEEDED_WIRE,
          action: null,
        }),
      }),
      { apiBaseUrl: API_BASE },
    );
    const outcome = await client.submitIntent(INTENT);
    expect(outcome.kind).toBe("answered");
    if (outcome.kind === "answered") {
      expect(outcome.answer.result.status).toBe("succeeded");
      expect(outcome.answer.result.operationId).toBe("operation-3fa9");
      expect(outcome.answer.result.resultRefs).toHaveLength(3);
      expect(outcome.answer.action).toBeNull();
    }
  });

  test("a failed operation result is carried verbatim (provider-unavailable)", async () => {
    const client = createDesktopClient(
      stubTransport({
        [SUBMIT_URL]: ok({
          ok: true,
          result: CORPUS_OPERATION_RESULT_FAILED_WIRE,
          action: null,
        }),
      }),
      { apiBaseUrl: API_BASE },
    );
    const outcome = await client.submitIntent(INTENT);
    expect(outcome.kind).toBe("answered");
    if (outcome.kind === "answered") {
      expect(outcome.answer.result.status).toBe("failed");
      expect(outcome.answer.result.failure?.code).toBe("provider-unavailable");
    }
  });

  test("the wire body IS the TaskIntent (the typed intent, not a form payload)", async () => {
    let seenBody: unknown;
    const transport: DesktopTransport = {
      get: async () => ({ status: 404, body: null }),
      postJson: async (url: string, body: unknown) => {
        seenBody = body;
        return ok({
          ok: true,
          result: CORPUS_OPERATION_RESULT_SUCCEEDED_WIRE,
          action: null,
        });
      },
    };
    const client = createDesktopClient(transport, { apiBaseUrl: API_BASE });
    await client.submitIntent(INTENT);
    // The submitted body decodes back through the CONTRACT as the same intent.
    expect(decodeTaskIntent(seenBody)).toEqual(INTENT);
  });

  test("a 404 is the honest not-served state (never a fabricated result)", async () => {
    const client = createDesktopClient(stubTransport({}), { apiBaseUrl: API_BASE });
    const outcome = await client.submitIntent(INTENT);
    expect(outcome.kind).toBe("not-served");
  });

  test("a server rejection is the honest rejected state", async () => {
    const client = createDesktopClient(
      stubTransport({
        [SUBMIT_URL]: { status: 403, body: JSON.stringify({ ok: false, error: "forbidden" }) },
      }),
      { apiBaseUrl: API_BASE },
    );
    const outcome = await client.submitIntent(INTENT);
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(outcome.failure.kind).toBe("http");
    }
  });

  test("a network failure is the honest unreachable state (the caller MAY queue for replay)", async () => {
    const client = createDesktopClient(
      stubTransport({ [SUBMIT_URL]: "throw" }),
      { apiBaseUrl: API_BASE },
    );
    const outcome = await client.submitIntent(INTENT);
    expect(outcome.kind).toBe("unreachable");
  });

  test("a defective answer is the honest invalid state naming the object", async () => {
    const client = createDesktopClient(
      stubTransport({
        [SUBMIT_URL]: ok({ ok: true, result: { contractVersion: "9.0.0" }, action: null }),
      }),
      { apiBaseUrl: API_BASE },
    );
    const outcome = await client.submitIntent(INTENT);
    expect(outcome.kind).toBe("invalid");
    if (outcome.kind === "invalid") {
      expect(outcome.failure.detail).toContain("OperationResult");
    }
  });
});

describe("PROD-020 replayOutbox (the offline queue; the server completes intents)", () => {
  test("queued intents replay through the SAME endpoint and dequeue on answer", async () => {
    let submissions = 0;
    const transport: DesktopTransport = {
      get: async () => ({ status: 404, body: null }),
      postJson: async () => {
        submissions += 1;
        return ok({
          ok: true,
          result: CORPUS_OPERATION_RESULT_SUCCEEDED_WIRE,
          action: null,
        });
      },
    };
    const client = createDesktopClient(transport, { apiBaseUrl: API_BASE });
    let state = enqueueIntent(emptyConvenienceState(), INTENT, "2026-01-15T15:00:00.000Z");
    const other = { ...INTENT, taskId: "task-other" };
    state = enqueueIntent(state, other, "2026-01-15T15:01:00.000Z");
    const replayed = await client.replayOutbox(state);
    expect(submissions).toBe(2);
    expect(replayed.state.outbox).toEqual([]);
    expect(replayed.outcomes.map((entry) => entry.taskId)).toEqual([
      INTENT.taskId,
      "task-other",
    ]);
    for (const entry of replayed.outcomes) {
      expect(entry.outcome.kind).toBe("answered");
    }
  });

  test("unreachable intents STAY QUEUED (never fabricated, never dropped)", async () => {
    const client = createDesktopClient(
      stubTransport({ [SUBMIT_URL]: "throw" }),
      { apiBaseUrl: API_BASE },
    );
    const state = enqueueIntent(emptyConvenienceState(), INTENT, "2026-01-15T15:00:00.000Z");
    const replayed = await client.replayOutbox(state);
    expect(replayed.state.outbox).toHaveLength(1);
    expect(replayed.outcomes[0]?.outcome.kind).toBe("unreachable");
  });

  test("the replay reports each entry's outcome (oldest first)", async () => {
    const client = createDesktopClient(stubTransport({}), { apiBaseUrl: API_BASE });
    let state = enqueueIntent(emptyConvenienceState(), INTENT, "2026-01-15T15:02:00.000Z");
    const earlier = { ...INTENT, taskId: "task-earlier" };
    state = enqueueIntent(state, earlier, "2026-01-15T15:01:00.000Z");
    const replayed = await client.replayOutbox(state);
    expect(replayed.outcomes.map((entry) => entry.taskId)).toEqual([
      "task-earlier",
      INTENT.taskId,
    ]);
    expect(replayed.outcomes.every((entry) => entry.outcome.kind === "not-served")).toBe(true);
  });
});

describe("PROD-020 composeReviewWorkspace (recomposition after an answer)", () => {
  test("the workspace now renders the server-authoritative operation result in the action column", async () => {
    const client = createDesktopClient(
      stubTransport({ [TASK_FLOW_URL]: ok({ ok: true, flow: CORPUS_TASK_FLOW_WIRE }) }),
      { apiBaseUrl: API_BASE },
    );
    const opened = await client.openProject("proj-7f3a2b");
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const before = paneById(opened.value.workspace, "pane:operation-result");
    expect(before?.emptyState).toBe("No operation result has been answered yet.");
    const after = composeReviewWorkspace(opened.value, {
      operationResult: {
        contractVersion: "1.0.0",
        operationId: "operation-3fa9",
        actionRef: "action-8ba1",
        status: "failed",
        failure: {
          code: "provider-unavailable",
          detail: "The reconstruction provider is currently unavailable.",
        },
        resultRefs: [],
        completedAt: "2026-01-15T12:40:00.000Z",
      },
    });
    const pane = paneById(after, "pane:operation-result");
    expect(pane?.emptyState).toBeNull();
    expect(pane?.lines.find((line) => line.field === "status")?.text).toBe("failed");
    expect(pane?.lines.find((line) => line.field === "failure")?.text).toContain(
      "provider-unavailable",
    );
  });

  test("the recomposition preserves the negotiation pane (blocked stays blocked)", async () => {
    const client = createDesktopClient(
      stubTransport({ [TASK_FLOW_URL]: ok({ ok: true, flow: CORPUS_TASK_FLOW_WIRE }) }),
      { apiBaseUrl: API_BASE },
    );
    const opened = await client.openProject("proj-7f3a2b");
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const after = composeReviewWorkspace(opened.value, {});
    const pane = paneById(after, "pane:negotiation");
    expect(pane?.lines.find((line) => line.field === "outcome")?.text).toBe("blocked");
  });
});

describe("PROD-020 the negotiation inside the view (honest platform math)", () => {
  test("the corpus depth-capture task negotiates BLOCKED on the review shell with empty modes", async () => {
    const client = createDesktopClient(
      stubTransport({ [TASK_FLOW_URL]: ok({ ok: true, flow: CORPUS_TASK_FLOW_WIRE }) }),
      { apiBaseUrl: API_BASE },
    );
    const opened = await client.openProject("proj-7f3a2b");
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    expect(opened.value.negotiation?.outcome).toBe("blocked");
    expect(opened.value.negotiation?.permittedInteractionModes).toEqual([]);
    // The shared pure function and the view agree:
    expect(opened.value.negotiation).toEqual(
      negotiateDesktopTask(REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS),
    );
  });
});
