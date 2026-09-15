/**
 * AISE-038 — Developer API/SDK typed-client-builder tests.
 *
 * Pins the builder conventions over the shipped contract:
 *  - request SHAPES (method, path, query, headers, body) for every
 *    builder family, derived from the registry (no hand-written URLs);
 *  - STABLE-ID enforcement (a missing caller-supplied id is a typed
 *    stable_id_required refusal — never a sent request);
 *  - GET-LITERAL reads (GET requests carry no body, and materializing a
 *    GET with a body is refused);
 *  - path-parameter encoding and the path_parameter_required refusal;
 *  - unknown-operation binding refusals over a purpose-built contract;
 *  - the fetch materializer (json bodies carry the content type; byte
 *    bodies carry their declared media type).
 */

import { describe, expect, test } from "bun:test";
import { makeBatch } from "../capture/testkit";
import { SDK_CONTRACT, buildSdkContract, type SdkContract } from "./model";
import {
  SdkClientError,
  createSdkClient,
  sdkRequestToFetchRequest,
  type SdkRequest,
} from "./client";

const client = createSdkClient(SDK_CONTRACT);

function expectJsonBody(request: SdkRequest): Record<string, unknown> {
  expect(request.body.kind).toBe("json");
  if (request.body.kind !== "json") {
    throw new Error("unreachable");
  }
  return JSON.parse(request.body.text) as Record<string, unknown>;
}

describe("client builders: request shapes", () => {
  test("capture.uploadAsset builds the content-addressed raw upload", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const request = client.capture.uploadAsset({
      contentId: "ab".repeat(32),
      bytes,
      mediaType: "image/jpeg",
    });
    expect(request.method).toBe("POST");
    expect(request.path).toBe(`/v1/capture/assets/${"ab".repeat(32)}`);
    expect(request.body.kind).toBe("bytes");
    if (request.body.kind === "bytes") {
      expect(request.body.bytes).toBe(bytes);
      expect(request.body.contentType).toBe("image/jpeg");
    }
  });

  test("capture.syncSession builds the SyncBatch POST with the batch as JSON body", () => {
    const batch = makeBatch({ sessionId: "s-1", sequence: 0, assets: [] });
    const request = client.capture.syncSession(batch);
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/v1/capture/sync");
    expect(expectJsonBody(request)["batchId"]).toBe(batch.batchId);
    expect(expectJsonBody(request)["idempotencyKey"]).toBe(batch.idempotencyKey);
  });

  test("capture.getSession builds a GET-literal read", () => {
    const request = client.capture.getSession("session-42");
    expect(request.method).toBe("GET");
    expect(request.path).toBe("/v1/capture/sessions/session-42");
    expect(request.body.kind).toBe("none");
  });

  test("reality.createProject builds the stable-id create", () => {
    const request = client.reality.createProject({ projectId: "proj-1" });
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/v1/reality/projects");
    expect(expectJsonBody(request)).toEqual({ projectId: "proj-1" });
  });

  test("reality.getVersion supports explicit versions and latest", () => {
    expect(
      client.reality.getVersion({ projectId: "p", versionId: "v012" }).path,
    ).toBe("/v1/reality/projects/p/versions/v012");
    expect(
      client.reality.getVersion({ projectId: "p", versionId: "latest" }).path,
    ).toBe("/v1/reality/projects/p/versions/latest");
  });

  test("reality.applyChanges carries the change set in the body", () => {
    const request = client.reality.applyChanges({ projectId: "p", changes: [] });
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/v1/reality/projects/p/changes");
    expect(expectJsonBody(request)).toEqual({ changes: [] });
  });

  test("boq.importSource uses the explicit format override with the canonical media type", () => {
    const request = client.boq.importSource({ format: "csv", bytes: new Uint8Array([65]) });
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/v1/boq/imports?format=csv");
    expect(request.body.kind).toBe("bytes");
    if (request.body.kind === "bytes") {
      expect(request.body.contentType).toBe("text/csv");
    }
  });

  test("boq.importSource refuses an unknown format", () => {
    expect(() =>
      client.boq.importSource({ format: "docx" as never, bytes: new Uint8Array() }),
    ).toThrow(SdkClientError);
  });

  test("boq.runNormalization is a bodyless POST", () => {
    const request = client.boq.runNormalization("cd".repeat(32));
    expect(request.method).toBe("POST");
    expect(request.path).toBe(`/v1/boq/imports/${"cd".repeat(32)}/normalization`);
    expect(request.body.kind).toBe("none");
  });

  test("boq.getMappingVersion accepts numeric and prefixed versions", () => {
    expect(
      client.boq.getMappingVersion({ importId: "ef".repeat(32), version: 3 }).path,
    ).toBe(`/v1/boq/imports/${"ef".repeat(32)}/mappings/3`);
    expect(
      client.boq.getMappingVersion({ importId: "ef".repeat(32), version: "v003" }).path,
    ).toBe(`/v1/boq/imports/${"ef".repeat(32)}/mappings/v003`);
  });

  test("cases.createCase carries the caller-stable id and links verbatim", () => {
    const request = client.cases.createCase({
      caseId: "case-9",
      title: "Crack in slab",
      links: { nodeIds: ["node-1"], evidenceIds: [], captureSessionIds: ["sess-1"] },
    });
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/v1/cases");
    expect(expectJsonBody(request)).toEqual({
      caseId: "case-9",
      title: "Crack in slab",
      links: { nodeIds: ["node-1"], evidenceIds: [], captureSessionIds: ["sess-1"] },
    });
  });

  test("cases.waiveEvidence carries the mandatory note in the body", () => {
    const request = client.cases.waiveEvidence({
      caseId: "case-9",
      missingId: "mis-1",
      note: "covered by other evidence",
    });
    expect(request.path).toBe("/v1/cases/case-9/missing-evidence/mis-1/waive");
    expect(expectJsonBody(request)).toEqual({ note: "covered by other evidence" });
  });

  test("cases.collectEvidence is a bodyless POST", () => {
    const request = client.cases.collectEvidence({ caseId: "c", missingId: "m" });
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/v1/cases/c/missing-evidence/m/collect");
    expect(request.body.kind).toBe("none");
  });

  test("interventions.createScenario never sends the in-process baseline field", () => {
    const request = client.interventions.createScenario({
      scenarioId: "sc-1",
      projectId: "p-1",
      title: "Reroute",
      baselineVersionId: "v001",
    });
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/v1/interventions");
    const body = expectJsonBody(request);
    expect(body).toEqual({
      scenarioId: "sc-1",
      projectId: "p-1",
      title: "Reroute",
      baselineVersionId: "v001",
    });
    expect("baseline" in body).toBe(false);
  });

  test("interventions.getState accepts numeric and latest selectors", () => {
    expect(client.interventions.getState({ scenarioId: "s", selector: 2 }).path).toBe(
      "/v1/interventions/s/states/2",
    );
    expect(client.interventions.getState({ scenarioId: "s", selector: "latest" }).path).toBe(
      "/v1/interventions/s/states/latest",
    );
  });

  test("interventions.transitionStatus carries the status in the body", () => {
    const request = client.interventions.transitionStatus({
      scenarioId: "s",
      status: "approved",
    });
    expect(request.path).toBe("/v1/interventions/s/status");
    expect(expectJsonBody(request)).toEqual({ status: "approved" });
  });
});

describe("client builders: conventions and refusals", () => {
  test("a missing caller-stable id is a typed stable_id_required refusal (no request built)", () => {
    for (const build of [
      () => client.cases.createCase({
        caseId: "",
        title: "t",
        links: { nodeIds: [], evidenceIds: [], captureSessionIds: [] },
      }),
      () => client.reality.createProject({ projectId: "" }),
      () =>
        client.interventions.createScenario({
          scenarioId: "",
          projectId: "p",
          title: "t",
          baselineVersionId: "v001",
        }),
    ]) {
      try {
        build();
        throw new Error("expected a refusal");
      } catch (error) {
        expect(error).toBeInstanceOf(SdkClientError);
        expect((error as SdkClientError).code).toBe("stable_id_required");
      }
    }
  });

  test("a missing path parameter is a typed path_parameter_required refusal", () => {
    try {
      client.capture.getSession("");
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(SdkClientError);
      expect((error as SdkClientError).code).toBe("path_parameter_required");
    }
  });

  test("path parameters are URI-encoded", () => {
    const request = client.capture.getSession("session/with spaces");
    expect(request.path).toBe("/v1/capture/sessions/session%2Fwith%20spaces");
  });

  test("every constructed request matches a REGISTERED operation route", () => {
    // Spot-check across families: builder output must always be a
    // registry member (method + path), never a hand-written URL.
    const requests = [
      client.capture.getSession("s"),
      client.reality.getProject("p"),
      client.boq.listImports(),
      client.cases.listCases(),
      client.interventions.listScenarios(),
      client.boq.getMappingVersion({ importId: "ab".repeat(32), version: 1 }),
      client.cases.collectEvidence({ caseId: "c", missingId: "m" }),
    ];
    const registered = new Set(
      SDK_CONTRACT.operations
        .filter((operation) => operation.transport === "http")
        .map((operation) =>
          operation.transport === "http" ? `${operation.method} ${operation.path}` : "",
        ),
    );
    for (const request of requests) {
      // The registered paths are templates; builder paths are concrete.
      // Match by prefix discipline: the concrete path's literal segments
      // must align with exactly one registered template of the method.
      const matches = [...registered].filter((entry) => {
        const [method = "", template = ""] = entry.split(" ");
        if (method !== request.method) {
          return false;
        }
        const templateSegments = template.split("/").filter((s) => s !== "");
        const pathSegments = request.path.split("?")[0]?.split("/").filter((s) => s !== "") ?? [];
        if (templateSegments.length !== pathSegments.length) {
          return false;
        }
        return templateSegments.every(
          (segment, index) =>
            segment.startsWith(":") || segment === pathSegments[index],
        );
      });
      expect(matches.length).toBe(1);
    }
  });
});

describe("client binding over a foreign contract", () => {
  function minimalContract(): SdkContract {
    return buildSdkContract(
      {
        domains: [
          {
            id: "capture",
            title: "Capture",
            authority: "test",
            namespace: "/v1/capture",
            operations: [
              {
                id: "capture.sessions.get",
                transport: "http",
                method: "GET",
                path: "/v1/capture/sessions/:sessionId",
                summary: "read",
                scope: "capture:read",
                idempotencyClass: "read",
                errorCodes: [],
              },
            ],
          },
        ],
        versions: [{ version: "1", operations: ["capture.sessions.get"] }],
      },
    );
  }

  test("a builder whose operation is missing from the contract refuses with unknown_operation", () => {
    const foreignClient = createSdkClient(minimalContract());
    try {
      foreignClient.cases.listCases();
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(SdkClientError);
      expect((error as SdkClientError).code).toBe("unknown_operation");
      expect((error as SdkClientError).detail).toContain("cases.list");
    }
  });

  test("builders over the foreign contract use ITS route, not the shipped one", () => {
    const foreignClient = createSdkClient(minimalContract());
    const request = foreignClient.capture.getSession("s");
    expect(request.path).toBe("/v1/capture/sessions/s");
  });
});

describe("sdkRequestToFetchRequest materialization", () => {
  test("a JSON POST materializes with the JSON content type and exact body", async () => {
    const request = client.reality.createProject({ projectId: "proj-m" });
    const fetchRequest = sdkRequestToFetchRequest(request, "https://api.example");
    expect(fetchRequest.method).toBe("POST");
    expect(fetchRequest.url).toBe("https://api.example/v1/reality/projects");
    expect(fetchRequest.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await fetchRequest.text()).toBe(JSON.stringify({ projectId: "proj-m" }));
  });

  test("a byte POST materializes with its declared media type", async () => {
    const bytes = new Uint8Array([9, 9, 9]);
    const request = client.capture.uploadAsset({
      contentId: "cd".repeat(32),
      bytes,
      mediaType: "application/octet-stream",
    });
    const fetchRequest = sdkRequestToFetchRequest(request);
    expect(fetchRequest.method).toBe("POST");
    expect(fetchRequest.headers.get("content-type")).toBe("application/octet-stream");
    expect(new Uint8Array(await fetchRequest.arrayBuffer())).toEqual(bytes);
  });

  test("a GET materializes with NO body", async () => {
    const fetchRequest = sdkRequestToFetchRequest(client.cases.listCases());
    expect(fetchRequest.method).toBe("GET");
    expect(await fetchRequest.text()).toBe("");
  });

  test("materializing a GET that somehow carries a body is a typed refusal (GET-literal)", () => {
    const smuggled: SdkRequest = {
      method: "GET",
      path: "/v1/cases",
      headers: {},
      body: { kind: "json", text: "{}" },
    };
    try {
      sdkRequestToFetchRequest(smuggled);
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(SdkClientError);
      expect((error as SdkClientError).code).toBe("get_has_no_body");
    }
  });
});
