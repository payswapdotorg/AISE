/**
 * Upstash REST adapter tests — PROD-007.
 *
 * Proves the wire contract and the typed-failure mapping with an
 * INJECTED fetch stub: no network, no credentials (the URL/token here
 * are inert strings), full determinism. The exact request bodies are
 * asserted byte-for-byte — the twin-fidelity contract with
 * client-memory.ts.
 *
 * FIXTURE FIDELITY (the 2026-09-20 deployed-walk lesson): every success
 * fixture uses the REAL Upstash REST response envelope —
 * `{"result": <value>}` (including `{"result": null}` for absent keys),
 * `{"error": "<message>"}` with a non-200 status — captured live against
 * the deployed free-tier endpoint (upstash_version 1.18.1). The original
 * fixtures answered with BARE values, so the client was built and green
 * against an imagined wire while every real command failed parsing
 * (writes still executed server-side; reads answered fail-closed). The
 * envelope is asserted here so that defect class can never regress.
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

/** A success envelope — the real Upstash REST 200 body shape. */
function okResponse(result: unknown): Response {
  return jsonResponse(200, { result });
}

/** A failure envelope — the real Upstash REST error body shape. */
function errorResponse(status: number, message: string): Response {
  return jsonResponse(status, { error: message });
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
  test("set issues one POST with the bearer token and the exact SET/EX body, unwrapping {result:\"OK\"}", async () => {
    const { client, stub } = makeClient(async () => okResponse("OK"));
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

  test("get issues a FLAT GET and maps {result:null} / {result:string}", async () => {
    const { client, stub } = makeClient(async (_url, init) => {
      const command = JSON.parse(String(init.body)) as string[];
      return okResponse(command[1] === "missing" ? null : "cached-value");
    });
    expect(await client.get("present")).toEqual({ ok: true, value: "cached-value" });
    expect(await client.get("missing")).toEqual({ ok: true, value: null });
    // Flat command form — the live free-tier endpoint rejects nested
    // arrays ("unsupported arg type"), so GET is never pipelined.
    expect(JSON.parse(stub.lastBody)).toEqual(["GET", "missing"]);
  });

  test("delete maps {result:0/1} to booleans", async () => {
    const { client } = makeClient(async (_url, init) => {
      const command = JSON.parse(String(init.body)) as string[];
      return okResponse(command[1] === "gone" ? 0 : 1);
    });
    expect(await client.delete("here")).toEqual({ ok: true, value: true });
    expect(await client.delete("gone")).toEqual({ ok: true, value: false });
  });

  test("expire maps {result:0/1} to booleans", async () => {
    const { client } = makeClient(async () => okResponse(1));
    expect(await client.expire("k", 60)).toEqual({ ok: true, value: true });
  });

  test("increment issues INCR then EXPIRE NX as TWO flat round trips (no pipeline)", async () => {
    const { client, stub } = makeClient(async (_url, init) => {
      const command = JSON.parse(String(init.body)) as string[];
      return okResponse(command[0] === "INCR" ? 7 : 1);
    });
    const result = await client.increment("aise:v1:rl:api:tenant:42", 60);
    expect(result).toEqual({ ok: true, value: 7 });
    expect(stub.requests).toHaveLength(2);
    expect(JSON.parse(String(stub.requests[0]?.init.body))).toEqual([
      "INCR",
      "aise:v1:rl:api:tenant:42",
    ]);
    expect(JSON.parse(String(stub.requests[1]?.init.body))).toEqual([
      "EXPIRE",
      "aise:v1:rl:api:tenant:42",
      60,
      "NX",
    ]);
  });

  test("increment surfaces a failed EXPIRE leg honestly (count spent, window unbounded)", async () => {
    const { client, stub } = makeClient(async (_url, init) => {
      const command = JSON.parse(String(init.body)) as string[];
      if (command[0] === "INCR") {
        return okResponse(3);
      }
      return errorResponse(500, "boom");
    });
    const result = await client.increment("k", 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("unavailable");
    }
    expect(stub.requests).toHaveLength(2);
  });

  test("identical inputs issue byte-identical requests (twin-fidelity determinism)", async () => {
    const { client, stub } = makeClient(async () => okResponse("OK"));
    await client.set("same", "bytes", 60);
    await client.set("same", "bytes", 60);
    const bodies = stub.requests.map((request) => String(request.init.body));
    expect(bodies[0]).toBe(bodies[1]);
  });
});

describe("the Upstash response envelope (verified live 2026-09-20, upstash_version 1.18.1)", () => {
  test("a 200 body that is NOT the {result|error} envelope maps to protocol_error — the deployed-walk regression pin", async () => {
    // Before the envelope fix, the client passed the parsed body through
    // whole: every GET answered "non-string value" and every SET "did
    // not answer OK" against the real endpoint while the server-side
    // effects still executed. A bare body must now be a protocol error.
    const { client } = makeClient(async () => jsonResponse(200, "OK"));
    const result = await client.get("k");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("protocol_error");
      expect(result.failure.detail).toContain("envelope");
    }
  });

  test("a 200 error-envelope body maps to protocol_error with a bounded excerpt", async () => {
    const { client } = makeClient(async () =>
      jsonResponse(200, { error: "ERR something server-side went wrong" }),
    );
    const result = await client.set("k", "v", 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("protocol_error");
      expect(result.failure.detail).toContain("ERR something server-side went wrong");
    }
  });

  test("a non-200 error envelope contributes a bounded single-line excerpt to the failure detail", async () => {
    const { client } = makeClient(async () =>
      errorResponse(400, "ERR Command is not available: 'NOTACOMMAND'. See https://upstash.com/docs"),
    );
    const result = await client.delete("k");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("protocol_error");
      expect(result.failure.detail).toContain("HTTP 400");
      expect(result.failure.detail).toContain("NOTACOMMAND");
    }
  });

  test("a GET whose result is a JSON number (not a string) maps to protocol_error", async () => {
    const { client } = makeClient(async () => okResponse(17));
    const result = await client.get("k");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("protocol_error");
    }
  });

  test("an INCR whose result is a non-integer maps to protocol_error", async () => {
    const { client } = makeClient(async () => okResponse("not-a-number"));
    const result = await client.increment("k", 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("protocol_error");
      expect(result.failure.detail).toContain("INCR");
    }
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
    const { client } = makeClient(async () => errorResponse(401, "unauthorized"));
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
    const { client } = makeClient(async () => errorResponse(503, "unavailable"));
    const result = await client.get("k");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("unavailable");
      expect(result.failure.detail).toContain("HTTP 503");
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

  test("an empty URL or token fails closed as auth_failed without any request", async () => {
    const stub = new FetchStub(async () => okResponse("OK"));
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
    const stub = new FetchStub(async () => okResponse("OK"));
    const client = new UpstashRedisClient({ url: TEST_URL, token: TEST_TOKEN, fetchImpl: stub.fetchImpl });
    for (const bad of [0, -5, 1.5]) {
      expect((await client.set("k", "v", bad)).ok).toBe(false);
      expect((await client.increment("k", bad)).ok).toBe(false);
      expect((await client.expire("k", bad)).ok).toBe(false);
    }
    expect(stub.requests).toHaveLength(0);
  });
});
