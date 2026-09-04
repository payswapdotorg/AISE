/**
 * The AISE-016 decide-route suite: the governed write channel
 * at the HTTP boundary.
 *
 * Discipline (the AISE-015 boundary contract, applied to the
 * one write surface): 401 before any data; complete error lists
 * on malformed bodies (never a guess); typed machine-readable
 * codes on unresolvable targets; the success path commits a NEW
 * governed version (digest + version chain advance); every
 * other verb is 405.
 */
import { describe, expect, it } from "vitest";
import { GET, POST, PUT, DELETE } from "./route";
import { loadWebConfig } from "@/server/config";
import { mintSessionToken, SESSION_COOKIE } from "@/server/session";
import { getVersion, listVersions } from "@/server/model-store";
import { reviewStore } from "../../server/review-store";

const URL_ = "https://aise.test/review/api/decide";

function authedRequest(body?: unknown, init: RequestInit = {}): Request {
  const config = loadWebConfig();
  const token = mintSessionToken(config, "tester", Math.floor(Date.now() / 1000));
  return new Request(URL_, {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE}=${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  });
}

describe("the boundary contract", () => {
  it("401 before ANY data when unauthenticated", async () => {
    const response = await POST(
      new Request(URL_, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId: "model-golden-room" }),
      }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("unauthenticated");
  });

  it("400 on non-JSON content type and malformed JSON", async () => {
    const config = loadWebConfig();
    const token = mintSessionToken(config, "tester", Math.floor(Date.now() / 1000));
    const cookie = `${SESSION_COOKIE}=${token}`;

    const wrongType = await POST(
      new Request(URL_, { method: "POST", headers: { cookie, "content-type": "text/plain" }, body: "x" }),
    );
    expect(wrongType.status).toBe(400);

    const badJson = await POST(
      new Request(URL_, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "not-json" }),
    );
    expect(badJson.status).toBe(400);
    const body = (await badJson.json()) as { error?: string };
    expect(body.error).toBe("invalid_json");
  });

  it("400 with the COMPLETE error list when the contract fails (never a silent coercion)", async () => {
    const response = await POST(
      authedRequest({
        modelId: "model-golden-room",
        version: 2,
        entityId: "room-golden-room",
        propertyKey: "roomHeight",
        decision: "CONFIRM",
        // no evidence — the contract must refuse with the full reason
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string; errors?: string[] };
    expect(body.error).toBe("invalid_request");
    expect(body.errors?.some((error) => error.includes("CONFIRM requires evidence"))).toBe(true);
  });

  it("404 on unknown model / version / entity (typed codes)", async () => {
    const unknownModel = await POST(
      authedRequest({ modelId: "model-nope", version: 2, entityId: "e", decision: "PROPOSE", propertyKey: "k", proposal: { value: 1, unit: "meter" } }),
    );
    expect(unknownModel.status).toBe(404);
    expect(((await unknownModel.json()) as { error?: string }).error).toBe("unknown_model");

    const unknownVersion = await POST(
      authedRequest({ modelId: "model-golden-room", version: 99, entityId: "room-golden-room", propertyKey: "roomHeight", decision: "PROPOSE", proposal: { value: 1, unit: "meter" } }),
    );
    expect(unknownVersion.status).toBe(404);
    expect(((await unknownVersion.json()) as { error?: string }).error).toBe("unknown_version");

    const unknownEntity = await POST(
      authedRequest({ modelId: "model-golden-room", version: 2, entityId: "entity-nope", propertyKey: "roomHeight", decision: "PROPOSE", proposal: { value: 1, unit: "meter" } }),
    );
    expect(unknownEntity.status).toBe(404);
    expect(((await unknownEntity.json()) as { error?: string }).error).toBe("unknown_entity");
  });

  it("400 on unknown evidence (typed code)", async () => {
    const response = await POST(
      authedRequest({
        modelId: "model-golden-room",
        version: 2,
        entityId: "room-golden-room",
        propertyKey: "roomHeight",
        decision: "CONFIRM",
        evidenceId: "ev-doesnotexist",
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string; message?: string };
    expect(body.error).toBe("unknown_evidence");
    expect(body.message).toContain("ev-doesnotexist");
  });

  it("405 on every non-POST verb (the decide surface is POST-only)", async () => {
    expect((await GET()).status).toBe(405);
    expect((await PUT()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });
});

describe("the governed success path (through HTTP)", () => {
  it("commits a new version citing the real registered evidence", async () => {
    const survey = reviewStore()
      .evidence.listEvidence("project-golden-room")
      .find((entry) => entry.record.kind === "MEASUREMENT")!.record;

    const response = await POST(
      authedRequest({
        modelId: "model-golden-room",
        version: 2,
        entityId: "room-golden-room",
        propertyKey: "roomHeight",
        decision: "CONFIRM",
        evidenceId: survey.evidenceId,
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { outcome?: { newVersion: number; digest: string; decision: string; verifiedBy: string } };
    expect(body.outcome).toBeDefined();
    const outcome = body.outcome!;
    expect(outcome.decision).toBe("CONFIRM");
    expect(outcome.newVersion).toBe(3);
    expect(outcome.digest).toMatch(/^[0-9a-f]{64}$/);
    // The actor identity is canonicalized from the session user.
    expect(outcome.verifiedBy).toBe("user:tester");

    // The version chain advanced; the committed graph re-reads cleanly.
    expect(listVersions("model-golden-room").map((entry) => entry.version)).toEqual([1, 2, 3]);
    const v3 = getVersion("model-golden-room", 3)!;
    const height = (v3.graph.spaces[0]!.properties ?? []).find((assertion) => assertion.key === "roomHeight")!;
    expect(height.evidenceRefs).toEqual([survey.evidenceId]);
    expect(height.verifiedBy).toBe("user:tester");
  });

  it("a PROPOSE decision commits a PROPOSED estimate through the same channel", async () => {
    const response = await POST(
      authedRequest({
        modelId: "model-golden-room",
        version: 2,
        entityId: "room-golden-room",
        propertyKey: "roomHeight",
        decision: "PROPOSE",
        proposal: { value: 2.75, unit: "meter", uncertaintyU: 0.05 },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { outcome?: { newVersion: number; decision: string } };
    expect(body.outcome!.decision).toBe("PROPOSE");
    expect(body.outcome!.newVersion).toBe(4);

    const v4 = getVersion("model-golden-room", 4)!;
    const height = (v4.graph.spaces[0]!.properties ?? []).find((assertion) => assertion.key === "roomHeight")!;
    expect(height.status).toBe("PROPOSED");
    expect(height.kind).toBe("estimate");
    expect(height.quantity?.value).toBe(2.75);
  });
});
