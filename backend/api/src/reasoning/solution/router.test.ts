/**
 * PROD-023 — route factory tests: the PURE transport adapter.
 *
 * The factory is not mounted anywhere (the Tech Lead wires it at the
 * composition station); these tests prove the transport contract on its
 * own: typed outcomes over HTTP (refusals/clarifications are 200 TYPED
 * OUTCOMES, not errors — the reasoning-gateway discipline), malformed
 * bodies → 400, wrong methods → 405 with an explicit allow, unmatched
 * paths → null (the server's default 404 applies), and the turn endpoint
 * returning the next-turn decision without performing any effects.
 */

import { describe, expect, test } from "bun:test";
import { createSolutionAgentRoutes } from "./router";
import { createSolutionCommandCompiler } from "./compiler";
import { demoSessionContext, constClock } from "./testkit";

const REQUEST_ID = "req-test-1";
const routes = createSolutionAgentRoutes({
  compiler: createSolutionCommandCompiler({ clock: constClock() }),
});

function post(path: string, body: unknown): Promise<Response | null> {
  return routes(
    new Request(`http://localhost${path}`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    REQUEST_ID,
  );
}

describe("PROD-023 routes: POST /v1/solution-agent/compile", () => {
  test("an operation command compiles to a 200 typed outcome", async () => {
    const response = await post("/v1/solution-agent/compile", {
      utterance: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
      session: demoSessionContext(),
    });
    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { ok: boolean; command: { kind: string } };
    expect(body.ok).toBe(true);
    expect(body.command.kind).toBe("operation-intent");
  });

  test("a refusal is a 200 typed outcome, never an HTTP error", async () => {
    const response = await post("/v1/solution-agent/compile", {
      utterance: "Mark this solution as validated.",
      session: demoSessionContext(),
    });
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      ok: boolean;
      command: { kind: string; reasonCode: string };
    };
    expect(body.ok).toBe(true);
    expect(body.command.kind).toBe("unsafe-refusal");
    expect(body.command.reasonCode).toBe("validation-authority-claim");
  });

  test("a clarification is a 200 typed outcome", async () => {
    const response = await post("/v1/solution-agent/compile", {
      utterance: "Excavate a pit 2 m wide and 3 m long.",
      session: demoSessionContext(),
    });
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      command: { kind: string; questions: { slot: string }[] };
    };
    expect(body.command.kind).toBe("clarification-needed");
    expect(body.command.questions[0]?.slot).toBe("depth");
  });

  test("a malformed body is a 400 transport error", async () => {
    const response = await post("/v1/solution-agent/compile", "{not json");
    expect(response?.status).toBe(400);
    const body = (await response?.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("malformed_json");
  });

  test("a missing utterance is a 400 transport error", async () => {
    const response = await post("/v1/solution-agent/compile", {
      utterance: "  ",
      session: demoSessionContext(),
    });
    expect(response?.status).toBe(400);
  });
});

describe("PROD-023 routes: POST /v1/solution-agent/turn", () => {
  test("a fresh command decides 'propose' with the typed intent", async () => {
    const response = await post("/v1/solution-agent/turn", {
      utterance: "Apply 30 mm plaster to the affected wall faces.",
      session: demoSessionContext(),
    });
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      ok: boolean;
      decision: { decision: string; proposal: { renderedCommand: string } };
    };
    expect(body.ok).toBe(true);
    expect(body.decision.decision).toBe("propose");
    expect(body.decision.proposal.renderedCommand).toBe(
      "Apply 30 mm cement-plaster to the affected wall faces.",
    );
  });

  test("a pending clarification merges the answer into a proposal", async () => {
    const response = await post("/v1/solution-agent/turn", {
      utterance: "The depth is 2 m.",
      session: demoSessionContext(),
      pendingClarification: {
        utterance: "Excavate a pit 2 m wide and 3 m long.",
        questions: [
          {
            slotKind: "dimension",
            slot: "depth",
            question: "What is the depth of the excavation?",
          },
        ],
      },
    });
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      decision: { decision: string; proposal: { renderedCommand: string } };
    };
    expect(body.decision.decision).toBe("propose");
    expect(body.decision.proposal.renderedCommand).toBe(
      "Excavate a pit 2 m deep, 2 m wide and 3 m long.",
    );
  });

  test("a navigation command decides 'dispatch-tool' with the typed command", async () => {
    const response = await post("/v1/solution-agent/turn", {
      utterance: "Show me step 3.",
      session: demoSessionContext(),
    });
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      decision: { decision: string; command: { kind: string; target: { stateIndex: number } } };
    };
    expect(body.decision.decision).toBe("dispatch-tool");
    expect(body.decision.command.kind).toBe("navigate");
    expect(body.decision.command.target.stateIndex).toBe(3);
  });
});

describe("PROD-023 routes: transport conventions", () => {
  test("wrong methods get 405 with an explicit allow", async () => {
    const response = await routes(
      new Request("http://localhost/v1/solution-agent/compile", { method: "GET" }),
      REQUEST_ID,
    );
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST");
  });

  test("unmatched paths return null (the server's default 404 applies)", async () => {
    const response = await post("/v1/other", {});
    expect(response).toBeNull();
  });

  test("every response carries the x-request-id correlation header", async () => {
    const response = await post("/v1/solution-agent/compile", {
      utterance: "Validate the solution.",
      session: demoSessionContext(),
    });
    expect(response?.headers.get("x-request-id")).toBe(REQUEST_ID);
  });
});
