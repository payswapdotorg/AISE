/**
 * AISE-038 — Developer API/SDK HTTP surface tests (through the FULL
 * server handler, exercising the one AISE-038 routing delegation block).
 *
 * Covers: both GET routes' envelopes and apiVersion stamps, the
 * governed-path refusal matrix over HTTP (405 + allow on wrong methods,
 * the server-wide 404 for unknown /v1/sdk sub-shapes), response
 * determinism (byte-identical across requests), the lazy default wiring
 * (no sdk options injected — the default is constructed inside the
 * /v1/sdk path guard and explicit wiring wins), correlation ids, and a
 * loopback end-to-end over Bun.serve.
 */

import { describe, expect, test } from "bun:test";
import { createLogger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { fixedClock } from "../capture/testkit";
import { createRequestHandler, type HandlerOptions } from "../server";
import { buildSdkDiscoveryDocument } from "./discovery";
import { buildSdkContract, SDK_CONTRACT, SDK_API_VERSION } from "./model";
import { handleSdkRequest } from "./router";
import { createFullHandler, withTempDir } from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** Handler with ONLY the capture surface injected (like server.test.ts). */
function bareHandler(): (request: Request) => Promise<Response> {
  const options: HandlerOptions = {
    envSource: () => validEnv,
    version: "0.1.0-test",
    logger: quietLogger,
    capture: createCaptureGateway({
      store: new InMemoryCaptureStore(),
      clock: fixedClock,
    }),
  };
  return createRequestHandler(options);
}

function get(path: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers });
}

function methodOf(method: string, path: string): Request {
  return new Request(`http://localhost${path}`, { method });
}

describe("GET /v1/sdk (discovery)", () => {
  test("serves the discovery document stamped with the apiVersion", async () => {
    const response = await bareHandler()(get("/v1/sdk"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    const body = (await response.json()) as {
      ok: boolean;
      apiVersion: string;
      discovery: { apiVersion: string; domains: { id: string }[] };
    };
    expect(body.ok).toBe(true);
    expect(body.apiVersion).toBe(SDK_API_VERSION);
    expect(body.discovery.apiVersion).toBe(SDK_API_VERSION);
    expect(body.discovery.domains.map((domain) => domain.id)).toEqual([
      "capture",
      "reality",
      "boq",
      "case",
      "intervention",
      "projections",
    ]);
  });

  test("the served discovery document equals buildSdkDiscoveryDocument(SDK_CONTRACT) exactly", async () => {
    const response = await bareHandler()(get("/v1/sdk"));
    const body = (await response.json()) as { discovery: unknown };
    expect(body.discovery).toEqual(buildSdkDiscoveryDocument(SDK_CONTRACT));
  });

  test("echoes a provided correlation id", async () => {
    const response = await bareHandler()(get("/v1/sdk", { "x-request-id": "corr-sdk-1" }));
    expect(response.headers.get("x-request-id")).toBe("corr-sdk-1");
  });
});

describe("GET /v1/sdk/contract (machine-readable contract)", () => {
  test("serves the operation + version registries stamped with the apiVersion", async () => {
    const response = await bareHandler()(get("/v1/sdk/contract"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      apiVersion: string;
      contract: {
        versionRegistry: { current: string; versions: { version: string; operations: string[] }[] };
        governedNamespaces: string[];
        domains: { id: string; operations: { id: string }[] }[];
      };
    };
    expect(body.ok).toBe(true);
    expect(body.apiVersion).toBe(SDK_API_VERSION);
    expect(body.contract.versionRegistry.current).toBe(SDK_API_VERSION);
    expect(body.contract.governedNamespaces).toContain("/v1/projections");
    const operationIds = body.contract.domains
      .flatMap((domain) => domain.operations.map((operation) => operation.id))
      .sort();
    expect(operationIds).toEqual(
      SDK_CONTRACT.operations.map((operation) => operation.id).sort(),
    );
  });
});

describe("governed-path refusal matrix over HTTP", () => {
  test("non-GET methods on /v1/sdk are refused with 405 + allow GET", async () => {
    const handler = bareHandler();
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const response = await handler(methodOf(method, "/v1/sdk"));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
      expect(((await response.json()) as { error: string }).error).toBe("method_not_allowed");
    }
  });

  test("non-GET methods on /v1/sdk/contract are refused with 405 + allow GET", async () => {
    const handler = bareHandler();
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const response = await handler(methodOf(method, "/v1/sdk/contract"));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
    }
  });

  test("unknown /v1/sdk sub-shapes fall through to the server-wide 404", async () => {
    const handler = bareHandler();
    for (const path of [
      "/v1/sdk/unknown",
      "/v1/sdk/contract/extra",
      "/v1/sdk/contract/extra/deeper",
      "/v1/sdk/discovery",
    ]) {
      const response = await handler(get(path));
      expect(response.status).toBe(404);
      expect(((await response.json()) as { ok: boolean; error: string })).toEqual({
        ok: false,
        error: "not_found",
      });
    }
  });

  test("a trailing slash collapses to the route (the house segment convention)", async () => {
    const handler = bareHandler();
    const response = await handler(get("/v1/sdk/"));
    expect(response.status).toBe(200);
  });

  test("non-sdk paths are untouched (the delegation block never claims them)", async () => {
    const handler = bareHandler();
    const healthz = await handler(get("/healthz"));
    expect(healthz.status).toBe(200);
    const unknown = await handler(get("/nope"));
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { error: string }).error).toBe("not_found");
  });
});

describe("response determinism over HTTP", () => {
  test("the discovery document is BYTE-IDENTICAL across repeated requests", async () => {
    const handler = bareHandler();
    const first = await handler(get("/v1/sdk"));
    const second = await handler(get("/v1/sdk"));
    expect(await first.text()).toBe(await second.text());
  });

  test("the contract document is BYTE-IDENTICAL across repeated requests", async () => {
    const handler = bareHandler();
    const first = await handler(get("/v1/sdk/contract"));
    const second = await handler(get("/v1/sdk/contract"));
    expect(await first.text()).toBe(await second.text());
  });

  test("discovery and contract carry the SAME apiVersion stamp", async () => {
    const handler = bareHandler();
    const discovery = (await (await handler(get("/v1/sdk"))).json()) as { apiVersion: string };
    const contract = (await (await handler(get("/v1/sdk/contract"))).json()) as {
      apiVersion: string;
    };
    expect(discovery.apiVersion).toBe(contract.apiVersion);
  });
});

describe("lazy default wiring (no sdk options injected)", () => {
  test("the default wiring serves /v1/sdk end-to-end without any sdk options", async () => {
    const handler = bareHandler();
    const response = await handler(get("/v1/sdk"));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(true);
  });

  test("non-sdk traffic never disturbs the surface (healthz then sdk)", async () => {
    const handler = bareHandler();
    const healthz = await handler(get("/healthz"));
    expect(healthz.status).toBe(200);
    const sdk = await handler(get("/v1/sdk"));
    expect(sdk.status).toBe(200);
  });

  test("the default wiring serves /v1/sdk over a full six-domain handler too", async () => {
    await withTempDir(async (root) => {
      const handler = createFullHandler(root); // no `sdk` option injected
      const response = await handler(get("/v1/sdk/contract"));
      expect(response.status).toBe(200);
      expect(((await response.json()) as { apiVersion: string }).apiVersion).toBe(SDK_API_VERSION);
    });
  });
});

describe("explicit sdk wiring wins over the default", () => {
  test("an injected contract is served instead of the shipped one", async () => {
    const custom = buildSdkContract({
      domains: [
        {
          id: "capture",
          title: "Capture (test)",
          authority: "test authority",
          namespace: "/v1/capture",
          notes: [],
          operations: [
            {
              id: "capture.only.op",
              transport: "http",
              method: "GET",
              path: "/v1/capture/only",
              summary: "only operation",
              scope: "capture:read",
              idempotencyClass: "read",
              errorCodes: [],
            },
          ],
        },
      ],
      versions: [{ version: "1", operations: ["capture.only.op"] }],
    });
    const handler = createRequestHandler({
      envSource: () => validEnv,
      version: "0.1.0-test",
      logger: quietLogger,
      capture: createCaptureGateway({
        store: new InMemoryCaptureStore(),
        clock: fixedClock,
      }),
      sdk: { contract: custom, logger: quietLogger },
    });
    const discovery = (await (await handler(get("/v1/sdk"))).json()) as {
      discovery: { domains: { id: string; operations: { id: string }[] }[] };
    };
    expect(discovery.discovery.domains).toHaveLength(1);
    expect(discovery.discovery.domains[0]?.operations.map((op) => op.id)).toEqual([
      "capture.only.op",
    ]);
  });
});

describe("handleSdkRequest path guard", () => {
  test("returns null for non-sdk paths (the server's 404 applies)", async () => {
    const response = await handleSdkRequest(
      get("/v1/cases"),
      new URL("http://localhost/v1/cases"),
      "req-1",
      { logger: quietLogger },
    );
    expect(response).toBeNull();
  });
});

describe("end-to-end over Bun.serve (loopback)", () => {
  test("serves /v1/sdk and /v1/sdk/contract through a real socket", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: bareHandler(),
    });
    try {
      const discovery = await fetch(`http://127.0.0.1:${server.port}/v1/sdk`);
      expect(discovery.status).toBe(200);
      const discoveryBody = (await discovery.json()) as { ok: boolean; apiVersion: string };
      expect(discoveryBody.ok).toBe(true);
      expect(discoveryBody.apiVersion).toBe(SDK_API_VERSION);
      const contract = await fetch(`http://127.0.0.1:${server.port}/v1/sdk/contract`);
      expect(contract.status).toBe(200);
      expect(contract.headers.get("x-request-id")).toBeTruthy();
      const refused = await fetch(`http://127.0.0.1:${server.port}/v1/sdk`, {
        method: "DELETE",
      });
      expect(refused.status).toBe(405);
      expect(refused.headers.get("allow")).toBe("GET");
    } finally {
      server.stop(true);
    }
  });
});
