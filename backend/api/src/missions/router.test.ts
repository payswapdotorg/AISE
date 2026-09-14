/**
 * Mission planning HTTP surface tests (AISE-007) — plan endpoint happy path
 * and escalation path, input validation (400s), GET projections, 404/405
 * discipline, x-request-id echo and router-level determinism.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalJsonStringify,
  decodeCaptureMission,
  type CaptureMission,
  type DeviceCapabilityProfile,
} from "@aise/shared-contracts";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import type { EnvRecord } from "../lib/config";
import { createLogger } from "../lib/log";
import { sha256Hex } from "../lib/hash";
import { createRequestHandler } from "../server";
import { handleMissionsRequest, type MissionsRouteOptions } from "./router";
import { FsMissionStore, InMemoryMissionStore } from "./store";
import {
  assertMissionContractValid,
  CAMERA_AND_TRACKING_DEAD_PROFILE,
  deterministicPlanner,
  DIMENSIONAL_INTENT,
  FIXED_ASSURANCE,
  FIXED_NOW,
  FLAGSHIP_PROFILE,
  fixedClock,
  makeProfile,
  RECONSTRUCTION_INTENT,
  withTempDir,
} from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** Handler options with the missions surface wired to deterministic injections. */
function missionsOptions(store: InMemoryMissionStore, idPrefix = "id"): MissionsRouteOptions {
  return {
    planner: deterministicPlanner(idPrefix),
    store,
    logger: quietLogger,
  };
}

function handlerWith(missions: MissionsRouteOptions): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: "0.1.0",
    logger: quietLogger,
    capture: createCaptureGateway({
      store: new InMemoryCaptureStore(),
      clock: fixedClock,
    }),
    missions,
  });
}

/** Call the missions router directly (no capture surface involved). */
function missionsRouterCall(options: MissionsRouteOptions) {
  return (request: Request): Promise<Response | null> =>
    handleMissionsRequest(request, new URL(request.url), "req-router-test", options);
}

function postJson(path: string, body: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

function get(path: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers });
}

function planBody(
  profile: DeviceCapabilityProfile,
  intent = DIMENSIONAL_INTENT,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    intent,
    assurance: { ...FIXED_ASSURANCE },
    deviceProfile: profile,
    ...extra,
  });
}

interface PlanResponse {
  ok: boolean;
  escalated?: boolean;
  escalationReason?: string;
  recommendation?: string;
  mission: CaptureMission;
}

describe("POST /v1/missions/plan: happy path", () => {
  test("plans, persists and returns a draft mission for a capable device", async () => {
    const store = new InMemoryMissionStore();
    const handler = handlerWith(missionsOptions(store));

    const response = await handler(
      postJson("/v1/missions/plan", planBody(FLAGSHIP_PROFILE), { "x-request-id": "corr-007" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-request-id")).toBe("corr-007");
    const body = (await response.json()) as PlanResponse;
    expect(body.ok).toBe(true);
    expect(body.escalated).toBeUndefined();

    const mission = decodeCaptureMission(body.mission);
    expect(mission.state).toBe("draft");
    expect(mission.intent).toBe(DIMENSIONAL_INTENT);
    expect(mission.assurance.summary).toBe(FIXED_ASSURANCE.summary);
    expect(mission.steps.length).toBe(2);
    assertMissionContractValid(mission);

    // Persisted at revision 0 with the capability snapshot on the mission.
    const stored = await store.get(mission.missionId);
    expect(stored).not.toBeNull();
    expect(stored!.history).toEqual([{ revision: 0, state: "draft" }]);
    expect(canonicalJsonStringify(stored!.current)).toBe(canonicalJsonStringify(mission));

    // The stored mission is readable through the GET surface.
    const readResponse = await handler(get(`/v1/missions/${mission.missionId}`));
    expect(readResponse.status).toBe(200);
    const readBody = (await readResponse.json()) as { mission: CaptureMission; history: unknown };
    expect(readBody.history).toEqual([{ revision: 0, state: "draft" }]);
    expect(canonicalJsonStringify(readBody.mission)).toBe(canonicalJsonStringify(mission));
  });

  test("existingEvidence hints flow through to the planned mission", async () => {
    const store = new InMemoryMissionStore();
    const response = await handlerWith(missionsOptions(store))(
      postJson(
        "/v1/missions/plan",
        planBody(FLAGSHIP_PROFILE, DIMENSIONAL_INTENT, {
          existingEvidence: [{ method: "STILL_IMAGERY", coverageNote: "west wall already captured" }],
        }),
      ),
    );
    expect(response.status).toBe(200);
    const mission = decodeCaptureMission(((await response.json()) as PlanResponse).mission);
    const stillStep = mission.steps.find((step) => step.method === "STILL_IMAGERY")!;
    expect(stillStep.instructions).toContain("west wall already captured");
    expect(stillStep.mandatory).toBe(false);
  });
});

describe("POST /v1/missions/plan: escalation path", () => {
  test("an inadequate device returns the escalation envelope and persists state escalated", async () => {
    const store = new InMemoryMissionStore();
    const handler = handlerWith(missionsOptions(store));

    const response = await handler(
      postJson("/v1/missions/plan", planBody(CAMERA_AND_TRACKING_DEAD_PROFILE, RECONSTRUCTION_INTENT)),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as PlanResponse;
    expect(body.ok).toBe(true);
    expect(body.escalated).toBe(true);
    expect(body.escalationReason).toContain("tracking: unavailable");
    expect(body.escalationReason).toContain("camera: unavailable");
    expect(body.recommendation).toContain("specialist instrument");

    const mission = decodeCaptureMission(body.mission);
    expect(mission.state).toBe("escalated");
    const escalation = (mission as { escalation?: { reason: string } }).escalation;
    expect(escalation?.reason).toBe(body.escalationReason);
    assertMissionContractValid(mission);

    const stored = await store.get(mission.missionId);
    expect(stored!.current.state).toBe("escalated");
    expect(stored!.history).toEqual([{ revision: 0, state: "escalated" }]);
  });
});

describe("POST /v1/missions/plan: request validation", () => {
  const cases: ReadonlyArray<{ name: string; body: string; error: string }> = [
    { name: "malformed JSON", body: "{not json", error: "malformed_json" },
    { name: "non-object body", body: "[1,2,3]", error: "schema_invalid" },
    {
      name: "invalid deviceProfile (missing depth domain)",
      body: JSON.stringify({
        intent: DIMENSIONAL_INTENT,
        assurance: { summary: FIXED_ASSURANCE.summary },
        deviceProfile: { contractVersion: "1.0.0", profileId: "x" },
      }),
      error: "device_profile_invalid",
    },
    {
      name: "missing deviceProfile",
      body: JSON.stringify({ intent: DIMENSIONAL_INTENT, assurance: { summary: "s" } }),
      error: "device_profile_invalid",
    },
    {
      name: "empty intent",
      body: JSON.stringify({
        intent: "   ",
        assurance: { summary: "s" },
        deviceProfile: FLAGSHIP_PROFILE,
      }),
      error: "invalid_intent",
    },
    {
      name: "missing assurance summary",
      body: JSON.stringify({ intent: DIMENSIONAL_INTENT, assurance: {}, deviceProfile: FLAGSHIP_PROFILE }),
      error: "invalid_assurance",
    },
    {
      name: "invalid existingEvidence method",
      body: planBody(FLAGSHIP_PROFILE, DIMENSIONAL_INTENT, {
        existingEvidence: [{ method: "NOT_A_METHOD" }],
      }),
      error: "invalid_existing_evidence",
    },
  ];

  for (const testCase of cases) {
    test(`400 with ${testCase.error} for ${testCase.name}`, async () => {
      const response = await handlerWith(missionsOptions(new InMemoryMissionStore()))(
        postJson("/v1/missions/plan", testCase.body),
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe(testCase.error);
      expect(response.headers.get("x-request-id")).toBeTruthy();
    });
  }

  test("deviceProfile with an unsupported contract major version is a 400", async () => {
    const badProfile = { ...makeProfile(), contractVersion: "2.0.0" };
    const response = await handlerWith(missionsOptions(new InMemoryMissionStore()))(
      postJson("/v1/missions/plan", planBody(badProfile as unknown as DeviceCapabilityProfile)),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("version_unsupported");
  });
});

describe("GET /v1/missions and GET /v1/missions/:id", () => {
  async function planTwo(handler: (request: Request) => Promise<Response>): Promise<void> {
    for (const profile of [FLAGSHIP_PROFILE, CAMERA_AND_TRACKING_DEAD_PROFILE]) {
      const response = await handler(
        postJson(
          "/v1/missions/plan",
          planBody(profile, profile === FLAGSHIP_PROFILE ? DIMENSIONAL_INTENT : RECONSTRUCTION_INTENT),
        ),
      );
      expect(response.status).toBe(200);
    }
  }

  test("list projects id, state, intent and revision for stored missions", async () => {
    const handler = handlerWith(missionsOptions(new InMemoryMissionStore()));
    await planTwo(handler);
    const response = await handler(get("/v1/missions"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      missions: Array<{ missionId: string; state: string; intent: string; revision: number }>;
    };
    expect(body.ok).toBe(true);
    expect(body.missions).toHaveLength(2);
    expect(body.missions.map((entry) => entry.state).sort()).toEqual(["draft", "escalated"]);
    for (const entry of body.missions) {
      expect(entry.revision).toBe(0);
      expect(typeof entry.intent).toBe("string");
    }
    const ids = body.missions.map((entry) => entry.missionId);
    expect([...ids].sort()).toEqual(ids);
  });

  test("unknown mission id answers 404 mission_not_found", async () => {
    const response = await handlerWith(missionsOptions(new InMemoryMissionStore()))(
      get("/v1/missions/mission-never-planned"),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("mission_not_found");
  });

  test("revision history accumulates across state transitions", async () => {
    const store = new InMemoryMissionStore();
    const handler = handlerWith(missionsOptions(store));
    const planResponse = await handler(postJson("/v1/missions/plan", planBody(FLAGSHIP_PROFILE)));
    const mission = decodeCaptureMission(((await planResponse.json()) as PlanResponse).mission);
    // Simulate the executor's transition: new revision, never a rewrite.
    await store.save({ ...mission, state: "active", updatedAt: FIXED_NOW, revision: 1 });

    const readResponse = await handler(get(`/v1/missions/${mission.missionId}`));
    const readBody = (await readResponse.json()) as {
      mission: CaptureMission;
      history: Array<{ revision: number; state: string }>;
    };
    expect(readBody.mission.state).toBe("active");
    expect(readBody.mission.revision).toBe(1);
    expect(readBody.history).toEqual([
      { revision: 0, state: "draft" },
      { revision: 1, state: "active" },
    ]);
  });
});

describe("HTTP discipline: 405/404 and fallthrough", () => {
  test("wrong methods on missions routes answer 405 with an explicit allow", async () => {
    const call = missionsRouterCall(missionsOptions(new InMemoryMissionStore()));
    const getPlan = await call(get("/v1/missions/plan"));
    expect(getPlan!.status).toBe(405);
    expect(getPlan!.headers.get("allow")).toBe("POST");
    const postList = await call(postJson("/v1/missions", "{}"));
    expect(postList!.status).toBe(405);
    expect(postList!.headers.get("allow")).toBe("GET");
    const putMission = await call(
      new Request("http://localhost/v1/missions/some-id", { method: "PUT" }),
    );
    expect(putMission!.status).toBe(405);
    expect(putMission!.headers.get("allow")).toBe("GET");
  });

  test("unmatched /v1/missions paths fall through to the server 404", async () => {
    const handler = handlerWith(missionsOptions(new InMemoryMissionStore()));
    for (const path of ["/v1/missions/a/b", "/v1/missions/plan/extra"]) {
      const response = await handler(get(path));
      expect(response.status).toBe(404);
      const body = (await response.json()) as { ok: boolean; error: string };
      expect(body.error).toBe("not_found");
    }
  });

  test("non-missions paths are not handled by the missions router", async () => {
    const call = missionsRouterCall(missionsOptions(new InMemoryMissionStore()));
    expect(await call(get("/v1/capture/sync"))).toBeNull();
    expect(await call(get("/healthz"))).toBeNull();
  });
});

describe("router-level determinism", () => {
  test("two identical plan requests with identical injections produce identical mission bytes", async () => {
    const planOnce = async (): Promise<string> => {
      const store = new InMemoryMissionStore();
      const response = await missionsRouterCall(missionsOptions(store))(
        postJson("/v1/missions/plan", planBody(FLAGSHIP_PROFILE)),
      );
      const body = (await response!.json()) as PlanResponse;
      return canonicalJsonStringify(decodeCaptureMission(body.mission));
    };
    expect(await planOnce()).toBe(await planOnce());
  });

  test("the plan endpoint persists through a real file-system store", async () => {
    await withTempDir(async (dataDir) => {
      const store = new FsMissionStore(dataDir);
      const response = await missionsRouterCall({
        planner: deterministicPlanner("id-fs"),
        store,
        logger: quietLogger,
      })(postJson("/v1/missions/plan", planBody(FLAGSHIP_PROFILE)));
      expect(response!.status).toBe(200);
      const mission = decodeCaptureMission(((await response!.json()) as PlanResponse).mission);
      const stored = await store.get(mission.missionId);
      expect(stored).not.toBeNull();
      expect(canonicalJsonStringify(stored!.current)).toBe(canonicalJsonStringify(mission));
    });
  });
});

describe("server default wiring (no explicit missions options)", () => {
  test("resolves the file-system store from the configured data dir on first use", async () => {
    await withTempDir(async (dataDir) => {
      const handler = createRequestHandler({
        envSource: () => ({ ...validEnv, AISE_DATA_DIR: dataDir }),
        version: "0.1.0",
        logger: quietLogger,
        capture: createCaptureGateway({
          store: new InMemoryCaptureStore(),
          clock: fixedClock,
        }),
      });
      const response = await handler(postJson("/v1/missions/plan", planBody(FLAGSHIP_PROFILE)));
      expect(response.status).toBe(200);
      const mission = decodeCaptureMission(((await response.json()) as PlanResponse).mission);
      // Persisted under <dataDir>/missions/<sha256(missionId)>/0.json.
      const missionFile = join(
        dataDir,
        "missions",
        sha256Hex(mission.missionId),
        "0.json",
      );
      expect(existsSync(missionFile)).toBe(true);
      expect(readFileSync(missionFile, "utf8")).toContain(mission.missionId);
      // And readable through the list surface.
      const listResponse = await handler(get("/v1/missions"));
      const listBody = (await listResponse.json()) as { missions: Array<{ missionId: string }> };
      expect(listBody.missions.map((entry) => entry.missionId)).toEqual([mission.missionId]);
    });
  });

  test("falls back to an in-memory store when the environment does not resolve", async () => {
    const handler = createRequestHandler({
      envSource: () => ({ ...validEnv, PORT: "not-a-port" }),
      version: "0.1.0",
      logger: quietLogger,
      capture: createCaptureGateway({
        store: new InMemoryCaptureStore(),
        clock: fixedClock,
      }),
    });
    const response = await handler(postJson("/v1/missions/plan", planBody(FLAGSHIP_PROFILE)));
    expect(response.status).toBe(200);
    const mission = decodeCaptureMission(((await response.json()) as PlanResponse).mission);
    expect(mission.state).toBe("draft");
    const readResponse = await handler(get(`/v1/missions/${mission.missionId}`));
    expect(readResponse.status).toBe(200);
  });

  test("handlers that never touch the missions surface construct no store", async () => {
    // healthz through a handler whose env cannot resolve a data dir: the
    // missions default wiring is lazy, so no store construction occurs.
    const response = await createRequestHandler({
      envSource: () => validEnv,
      version: "0.1.0",
      logger: quietLogger,
      capture: createCaptureGateway({
        store: new InMemoryCaptureStore(),
        clock: fixedClock,
      }),
    })(get("/healthz"));
    expect(response.status).toBe(200);
  });
});
