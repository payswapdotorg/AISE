/**
 * PROD-025 — solution-BOQ endpoint tests (the PURE route factory,
 * exercised directly with fetch-style Request objects — no live server
 * boot, no server.ts edit; the PROD-022 solution router-test discipline).
 *
 * Proves:
 *  - every endpoint's happy path over HTTP (generate, readback,
 *    line-operations, operation-lines);
 *  - the stable status table: 400 malformed_json, 422 typed shape/gate
 *    codes, 404 unknown navigation ids, 200 deterministic answers, 405
 *    with an explicit `allow` for wrong methods;
 *  - x-request-id correlation on every response;
 *  - non-solution-BOQ paths answer null (the server's default 404);
 *  - identical requests produce identical response bodies (the tool
 *    surface is deterministic end to end).
 */

import { describe, expect, test } from "bun:test";
import { createLogger } from "../lib/log";
import { SolutionBoqService } from "./service";
import { handleSolutionBoqRequest, type SolutionBoqRouteOptions } from "./router";
import { generateBody, generatedBoq } from "./testkit";

const quietLogger = createLogger("error");

function routes(): SolutionBoqRouteOptions {
  return { service: new SolutionBoqService(), logger: quietLogger };
}

function post(path: string, body: string): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
  const url = new URL(`http://localhost${path}`);
  return handleSolutionBoqRequest(request, url, "test-request-id", routes());
}

function get(path: string): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, { method: "GET" });
  const url = new URL(`http://localhost${path}`);
  return handleSolutionBoqRequest(request, url, "test-request-id", routes());
}

interface ErrorBody {
  ok: boolean;
  error: string;
  detail?: string;
}

async function errorBody(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

describe("POST /v1/solutions/boq/generate", () => {
  test("answers 200 with the generated BOQ and the correlation header", async () => {
    const { version, snapshot } = generateBody();
    const response = await post(
      "/v1/solutions/boq/generate",
      JSON.stringify({ version, snapshot }),
    );
    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-request-id")).toBe("test-request-id");
    const payload = (await response?.json()) as {
      ok: boolean;
      boq: { artifactKind: string; lines: unknown[]; boqId: string };
    };
    expect(payload.ok).toBe(true);
    expect(payload.boq.artifactKind).toBe("solution-generated-boq");
    expect(payload.boq.lines.length).toBe(7);
  });

  test("malformed JSON answers 400 malformed_json", async () => {
    const response = await post("/v1/solutions/boq/generate", "{not json");
    expect(response?.status).toBe(400);
    expect((await errorBody(response as Response)).error).toBe("malformed_json");
  });

  test("an undecodable version answers 422 invalid_version", async () => {
    const { snapshot } = generateBody();
    const response = await post(
      "/v1/solutions/boq/generate",
      JSON.stringify({ version: { nonsense: true }, snapshot }),
    );
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("invalid_version");
  });

  test("a digest-mismatched snapshot answers 422 snapshot_input_digest_mismatch", async () => {
    const { version, snapshot } = generateBody();
    const tampered = structuredClone(version);
    tampered.operations[0]!.provenance = {
      ...tampered.operations[0]!.provenance,
      derivationNote: "changed after validation",
    };
    const response = await post(
      "/v1/solutions/boq/generate",
      JSON.stringify({ version: tampered, snapshot }),
    );
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe(
      "snapshot_input_digest_mismatch",
    );
  });

  test("GET is rejected with 405 and an explicit allow", async () => {
    const response = await get("/v1/solutions/boq/generate");
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST");
  });

  test("identical requests produce identical response bodies", async () => {
    const { version, snapshot } = generateBody();
    const body = JSON.stringify({ version, snapshot });
    const first = await post("/v1/solutions/boq/generate", body);
    const second = await post("/v1/solutions/boq/generate", body);
    expect(await first?.text()).toBe(await second?.text());
  });
});

describe("POST /v1/solutions/boq/readback", () => {
  test("answers 200 with the verified readback summary", async () => {
    const response = await post(
      "/v1/solutions/boq/readback",
      JSON.stringify({ boq: generatedBoq() }),
    );
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      verification: { lineCount: number; boqId: string };
    };
    expect(payload.ok).toBe(true);
    expect(payload.verification.lineCount).toBe(7);
    expect(payload.verification.boqId).toBe(generatedBoq().boqId);
  });

  test("a tampered BOQ answers 422 boq_integrity_mismatch", async () => {
    const boq = generatedBoq();
    const tampered = structuredClone(boq) as { boqId: string };
    tampered.boqId = "0".repeat(64);
    const response = await post(
      "/v1/solutions/boq/readback",
      JSON.stringify({ boq: tampered }),
    );
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("boq_integrity_mismatch");
  });

  test("a source-BOQ-shaped payload answers 422 invalid_boq (the typed seal)", async () => {
    const response = await post(
      "/v1/solutions/boq/readback",
      JSON.stringify({ boq: { importId: "x", format: "xlsx", parse: { status: "parsed" } } }),
    );
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("invalid_boq");
  });
});

describe("POST /v1/solutions/boq/line-operations", () => {
  test("answers 200 with the contributions (geometry + solution step)", async () => {
    const boq = generatedBoq();
    const line = boq.lines[0]!;
    const response = await post(
      "/v1/solutions/boq/line-operations",
      JSON.stringify({ boq, boqLineId: line.boqLineId }),
    );
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      boqLineId: string;
      contributions: { operationIndex: number; contributionKind: string }[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.boqLineId).toBe(line.boqLineId);
    expect(payload.contributions[0]?.operationIndex).toBe(1);
    expect(payload.contributions[0]?.contributionKind).toBe("removed");
  });

  test("an unknown line id answers 404 unknown_boq_line", async () => {
    const response = await post(
      "/v1/solutions/boq/line-operations",
      JSON.stringify({ boq: generatedBoq(), boqLineId: "no-such-line" }),
    );
    expect(response?.status).toBe(404);
    expect((await errorBody(response as Response)).error).toBe("unknown_boq_line");
  });

  test("a missing boqLineId answers 422 invalid_boq_line_id", async () => {
    const response = await post(
      "/v1/solutions/boq/line-operations",
      JSON.stringify({ boq: generatedBoq() }),
    );
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("invalid_boq_line_id");
  });
});

describe("POST /v1/solutions/boq/operation-lines", () => {
  test("answers 200 with the affected lines and contribution kinds", async () => {
    const boq = generatedBoq();
    const response = await post(
      "/v1/solutions/boq/operation-lines",
      JSON.stringify({ boq, operationId: boq.operationIds[1] }),
    );
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      operationId: string;
      lines: { activity: string; contributionKind: string; unit: string }[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.operationId).toBe(boq.operationIds[1]!);
    expect(payload.lines.length).toBe(3); // the block wall's area+volume+count
    expect(payload.lines.every((line) => line.contributionKind === "created")).toBe(true);
  });

  test("an operation unknown to the version answers 404 unknown_operation", async () => {
    const response = await post(
      "/v1/solutions/boq/operation-lines",
      JSON.stringify({ boq: generatedBoq(), operationId: "no-such-op" }),
    );
    expect(response?.status).toBe(404);
    expect((await errorBody(response as Response)).error).toBe("unknown_operation");
  });
});

describe("route boundaries", () => {
  test("non-solution-BOQ paths answer null (the server's default 404 applies)", async () => {
    const url = new URL("http://localhost/v1/solutions/step");
    expect(
      await handleSolutionBoqRequest(
        new Request("http://localhost/v1/solutions/step", { method: "POST" }),
        url,
        "test-request-id",
        routes(),
      ),
    ).toBeNull();
    expect(
      await handleSolutionBoqRequest(
        new Request("http://localhost/v1/executions", { method: "GET" }),
        new URL("http://localhost/v1/executions"),
        "test-request-id",
        routes(),
      ),
    ).toBeNull();
  });

  test("an unknown /v1/solutions/boq action answers null (404)", async () => {
    const response = await post("/v1/solutions/boq/nonsense", "{}");
    expect(response).toBeNull();
  });

  test("a bare /v1/solutions/boq path answers null (404)", async () => {
    const response = await post("/v1/solutions/boq", "{}");
    expect(response).toBeNull();
  });
});
