import { describe, expect, test } from "bun:test";
import {
  createServerlessHandler,
  remapRequestPath,
  stripApiMountPrefix,
} from "./serverless";

/**
 * The Vercel catch-all adapter's mount-path remapping (PROD-003; the
 * relative-URL reality added by PROD-011's first REAL deployment).
 *
 * Vercel's Node runtime invokes the default-exported web handler with a
 * Request whose `url` may be RELATIVE — the raw server `req.url` (path +
 * query, with the catch-all segment carried as a `[...path]` query
 * parameter). A standard `Request` cannot be constructed with a relative
 * url, so the tests reproduce that shape by overriding `url` on a real
 * Request (exactly what the runtime effectively hands the handler).
 */

function requestWithUrl(url: string, init?: RequestInit): Request {
  const request = new Request("https://placeholder.local/placeholder", init);
  return Object.defineProperty(request, "url", {
    value: url,
    configurable: true,
  }) as Request;
}

describe("stripApiMountPrefix", () => {
  test("strips exactly one leading /api segment", () => {
    expect(stripApiMountPrefix("/api/healthz")).toBe("/healthz");
    expect(stripApiMountPrefix("/api/v1/gaps")).toBe("/v1/gaps");
  });

  test("bare /api becomes the root path", () => {
    expect(stripApiMountPrefix("/api")).toBe("/");
  });

  test("public paths pass through untouched", () => {
    expect(stripApiMountPrefix("/healthz")).toBe("/healthz");
    expect(stripApiMountPrefix("/v1/gaps")).toBe("/v1/gaps");
    expect(stripApiMountPrefix("/")).toBe("/");
  });
});

describe("remapRequestPath", () => {
  test("an absolute /api-mounted URL is remapped onto the public path", () => {
    const request = new Request("https://deployed.example/api/v1/gaps?q=1");
    const remapped = remapRequestPath(request);
    expect(remapped.url).toBe("https://deployed.example/v1/gaps?q=1");
    expect(remapped.method).toBe("GET");
  });

  test("an absolute public URL passes through unchanged (same instance)", () => {
    const request = new Request("https://deployed.example/healthz");
    expect(remapRequestPath(request)).toBe(request);
  });

  test("a RELATIVE url (the Vercel Node runtime shape) is anchored, not crashed on", () => {
    // The observed deployment shape: the rewritten public path plus the
    // catch-all segment as a `[...path]` query parameter.
    const request = requestWithUrl("/healthz?%5B...path%5D=healthz");
    const remapped = remapRequestPath(request);
    expect(remapped.url).toBe("https://aise-serverless.local/healthz?%5B...path%5D=healthz");
    expect(remapped.method).toBe("GET");
  });

  test("a RELATIVE /api-mounted url keeps its mount-strip semantics", () => {
    const request = requestWithUrl("/api/v1/gaps?%5B...path%5D=v1%2Fgaps");
    const remapped = remapRequestPath(request);
    expect(remapped.url).toBe("https://aise-serverless.local/v1/gaps?%5B...path%5D=v1%2Fgaps");
  });

  test("method and headers survive the rebuild from a relative url", () => {
    const request = requestWithUrl("/v1/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const remapped = remapRequestPath(request);
    expect(remapped.method).toBe("POST");
    expect(remapped.headers.get("content-type")).toBe("application/json");
    expect(remapped.url).toBe("https://aise-serverless.local/v1/cases");
  });
});

describe("createServerlessHandler", () => {
  test("serves /healthz through the full runtime pipeline from a Vercel-shaped relative url", async () => {
    // The host environment may carry a sandbox-injected DATABASE_URL (a
    // file: URL the API correctly refuses) — the serverless deployment
    // shape under test has no Pg wiring, so it is excluded from the env
    // source, exactly like a clean Vercel build environment.
    const envWithoutPg = { ...process.env };
    delete envWithoutPg.DATABASE_URL;
    const handler = createServerlessHandler({
      envSource: () => ({ ...envWithoutPg, AISE_SERVERLESS: "1" }),
    });
    const response = await handler(requestWithUrl("/healthz?%5B...path%5D=healthz"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("aise-api");
  });
});
