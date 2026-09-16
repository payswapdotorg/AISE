/**
 * Upstash REST adapter tests — PROD-007.
 *
 * Proves the wire contract and the typed-failure mapping with an
 * INJECTED fetch stub: no network, no credentials (the URL/token here
 * are inert strings), full determinism. The exact request bodies are
 * asserted byte-for-byte — the twin-fidelity contract with
 * client-memory.ts.
 */

import { describe, expect, test } from "bun:test";
import { UpstashRedisClient, type FetchLike } from "./client-upstash";

const TEST_URL = "https://redis-test.example.upstash.io";
const TEST_TOKEN = "test-token-not-a-real-credential";

/** A scripted fetch stub recording every request it serves. */
class FetchStub {
  readonly requests: { readonly url: string; readonly init: RequestInit }[] = [];
  private handler: (url: string, init: RequestInit) => Promise<Response>;

  constructor(handler: (url: string, init: RequestInit) => Promise<Response>) {
    this.handler = handler;
  }

  get fetchImpl(): FetchLike {
    return async (url, init) => {
      this.requests.push({ url, init });
      return this.handler(url, init);
    };
  }

  get lastBody(): string {
    return String(this.requests[this.requests.length - 1]?.init.body ?? "");
  }

  get lastAuth(): string {
    const headers = this.requests[this.requests.length - 1]?.init.headers as Record<string, string>;
    return String(headers.Authorization ?? "");
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient(handler: (url: string, init: RequestInit) => Promise<Response>): {
  client: UpstashRedisClient;
  stub: FetchStub;
} {
  const stub = new FetchStub(handler);
  return {
    client: new UpstashRedisClient({ url: TEST_URL, token: TEST_TOKEN, fetchImpl: stub.fetchImpl }),
    stub,
  };
}

describe("wire contract (deterministic requests over the global-fetch seam)", () => {
  test("set issues one POST with the bearer token and the exact SET/EX body", async () => {
    const { client, stub } = makeClient(async () => jsonResponse(200, "OK"));
    const result = await client.set("aise:v1:cache:t:p:name", "value", 300);
    expect(result).toEqual({ ok: true, value: true });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]?.url).toBe(TEST_URL);
    expect(stub.requests[0]?.init.method).toBe("POST");
    expect(stub.lastAuth).toBe(`Bearer ${TEST_TOKEN}`);
    expect(JSON.parse(stub.lastBody)).toEqual([
      "SET",
      "aise:v1:cache:t:p:name",
      "value",
      "EX",
      300,
    ]);
  });

  test("get issues GET and maps null / string results", async () => {
    const { client } = makeClient(async (_url, init) => {
      const command = JSON.parse(String(init.body)) as string[];
      return jsonResponse(200, command[1] === "missing" ? null : "cached-value");
    });
    expect(await client.get("present")).toEqual({ ok: true, value: "cached-value" });
    expect(await client.get("missing")).toEqual({ ok: true, value: null });
  });

  test("delete maps DEL 0/1 to booleans", async () => {
    const { client } = makeClient(async (_url, init) => {
      const command = JSON.parse(String(init.body)) as string[];
      return jsonResponse(200, command[1] === "gone" ? 0 : 1);
    });
    expect(await client.delete("here")).toEqual({ ok: true, value: true });
    expect(await client.delete("gone")).toEqual({ ok: true, value: false });
  });

  test("expire maps EXPIRE 0/1 to booleans", async () => {
    const { client } = makeClient(async () => jsonResponse(200, 1));
    expect(await client.expire("k", 60)).toEqual({ ok: true, value: true });
  });

  test("increment pipelines INCR + EXPIRE NX in ONE round trip and maps the array", async () => {
    const { client, stub } = makeClient(async () => jsonResponse(200, [7, 1]));
    const result = await client.increment("aise:v1:rl:api:tenant:42", 60);
    expect(result).toEqual({ ok: true, value: 7 });
    expect(JSON.parse(stub.lastBody)).toEqual([
      ["INCR", "aise:v1:rl:api:tenant:42"],
      ["EXPIRE", "aise:v1:rl:api:tenant:42", 60, "NX"],
    ]);
  });

  test("identical inputs issue byte-identical requests (twin-fidelity determinism)", async () => {
    const { client, stub } = makeClient(async () => jsonResponse(200, "OK"));
    await client.set("same", "bytes", 60);
    await client.set("same", "bytes", 60);
    const bodies = stub.requests.map((request) => String(request.init.body));
    expect(bodies[0]).toBe(bodies[1]);
  });
});

describe("typed failure mapping (never a raw throw)", () => {
  test("transport failure (fetch rejects) maps to unavailable with the error NAME only", async () => {
    const { client } = makeClient(async () => {
      throw new TypeError("fetch failed: could not resolve " + TEST_URL);
    });
    const result = await client.get("k");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("unavailable");
      // The URL (credential-adjacent) never appears in the detail.
      expect(result.failure.detail).not.toContain(TEST_URL);
      expect(result.failure.detail).toBe("redis rest request failed (TypeError)");
    }
  });

  test("HTTP 401/403 map to auth_failed", async () => {
    const { client } = makeClient(async () => jsonResponse(401, { error: "unauthorized" }));
    const result = await client.set("k", "v", 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("auth_failed");
      expect(result.failure.detail).toContain("HTTP 401");
    }
  });

  test("HTTP 429 maps to quota_exceeded (the free-tier signature)", async () => {
    const { client } = makeClient(async () => new Response("rate limited", { status: 429 }));
    const result = await client.increment("k", 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("quota_exceeded");
    }
  });

  test("HTTP 5xx maps to unavailable", async () => {
    const { client } = makeClient(async () => jsonResponse(503, { error: "unavailable" }));
    const result = await client.get("k");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("unavailable");
      expect(result.failure.detail).toContain("HTTP 503");
    }
  });

  test("unexpected HTTP 4xx maps to protocol_error", async () => {
    const { client } = makeClient(async () => jsonResponse(400, { error: "bad command" }));
    const result = await client.delete("k");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("protocol_error");
    }
  });

  test("a 200 with a non-JSON body maps to protocol_error", async () => {
    const { client } = makeClient(async () => new Response("not json", { status: 200 }));
    const result = await client.get("k");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("protocol_error");
      expect(result.failure.detail).toContain("not valid JSON");
    }
  });

  test("a GET returning a non-string maps to protocol_error", async () => {
    const { client } = makeClient(async () => jsonResponse(200, 17));
    const result = await client.get("k");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("protocol_error");
    }
  });

  test("an INCR pipeline response of the wrong shape maps to protocol_error", async () => {
    const { client } = makeClient(async () => jsonResponse(200, "5"));
    const result = await client.increment("k", 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("protocol_error");
      expect(result.failure.detail).toContain("unexpected shape");
    }
  });

  test("an empty URL or token fails closed as auth_failed without any request", async () => {
    const stub = new FetchStub(async () => jsonResponse(200, "OK"));
    const client = new UpstashRedisClient({ url: "  ", token: TEST_TOKEN, fetchImpl: stub.fetchImpl });
    const result = await client.get("k");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("auth_failed");
      expect(result.failure.detail).toContain("AISE_REDIS_REST_URL");
    }
    expect(stub.requests).toHaveLength(0);
  });
});

describe("explicit-TTL enforcement before any request is issued", () => {
  test("set/increment/expire reject non-positive TTLs locally (no wire call)", async () => {
    const stub = new FetchStub(async () => jsonResponse(200, "OK"));
    const client = new UpstashRedisClient({ url: TEST_URL, token: TEST_TOKEN, fetchImpl: stub.fetchImpl });
    for (const bad of [0, -5, 1.5]) {
      expect((await client.set("k", "v", bad)).ok).toBe(false);
      expect((await client.increment("k", bad)).ok).toBe(false);
      expect((await client.expire("k", bad)).ok).toBe(false);
    }
    expect(stub.requests).toHaveLength(0);
  });
});
