/**
 * The AISE-015 API route suite: the read-only, authenticated
 * model surface — the no-browser-canonical-authority guarantee,
 * tested at the HTTP boundary.
 *
 * Route handlers are invoked directly with `Request` objects
 * (the App Router contract) — no server boot required.
 */
import { describe, expect, it } from "vitest";
import { GET as listModels } from "@/app/api/models/route";
import { GET as modelSummary } from "@/app/api/models/[modelId]/route";
import { GET as versionDetail } from "@/app/api/models/[modelId]/versions/[version]/route";
import { GET as loginGet, POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { loadWebConfig } from "@/server/config";
import { mintSessionToken, SESSION_COOKIE } from "@/server/session";

function authedRequest(url: string): Request {
  const config = loadWebConfig();
  const token = mintSessionToken(config, "tester", Math.floor(Date.now() / 1000));
  return new Request(url, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
}

describe("authentication at the boundary", () => {
  it("login mints a session cookie for correct credentials (HttpOnly, SameSite)", async () => {
    const response = await loginPost(
      new Request("https://aise.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user: "engineer", passphrase: "aise-demo" }),
      }),
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("login rejects wrong credentials (401) and malformed bodies (400)", async () => {
    const wrong = await loginPost(
      new Request("https://aise.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user: "engineer", passphrase: "nope" }),
      }),
    );
    expect(wrong.status).toBe(401);
    const malformed = await loginPost(
      new Request("https://aise.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
    );
    expect(malformed.status).toBe(400);
  });

  it("login refuses non-POST methods (405 — read-only discipline)", async () => {
    expect((await loginGet()).status).toBe(405);
  });

  it("login fails honestly in production without a session secret (never a dead cookie)", async () => {
    // Indirect env access: Next's type context declares NODE_ENV
    // read-only; tests mutate the process environment as a
    // record (restored in finally).
    const env = process.env as Record<string, string | undefined>;
    const before = env.AISE_WEB_SESSION_SECRET;
    const beforeEnv = env.AISE_ENV;
    const beforeNode = env.NODE_ENV;
    delete env.AISE_WEB_SESSION_SECRET;
    env.AISE_ENV = "production";
    env.NODE_ENV = "production";
    try {
      const response = await loginPost(
        new Request("https://aise.test/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ user: "engineer", passphrase: "aise-demo" }),
        }),
      );
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error?: string };
      expect(body.error).toBe("server_misconfigured");
      expect(response.headers.get("set-cookie")).toBeNull();
    } finally {
      if (before !== undefined) {
        env.AISE_WEB_SESSION_SECRET = before;
      } else {
        delete env.AISE_WEB_SESSION_SECRET;
      }
      if (beforeEnv !== undefined) {
        env.AISE_ENV = beforeEnv;
      } else {
        delete env.AISE_ENV;
      }
      if (beforeNode !== undefined) {
        env.NODE_ENV = beforeNode;
      } else {
        delete env.NODE_ENV;
      }
    }
  });

  it("logout clears the session cookie", async () => {
    const response = await logoutPost();
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("the model API surface (authenticated, read-only)", () => {
  it("unauthenticated requests are refused 401 BEFORE any model data", async () => {
    const response = await listModels(new Request("https://aise.test/api/models"));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("unauthenticated");
  });

  it("the model list serves the seeded golden model", async () => {
    const response = await listModels(authedRequest("https://aise.test/api/models"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { models: { modelId: string; versions: number }[] };
    expect(body.models).toEqual([{ modelId: "model-golden-room", projectId: "project-golden-room", versions: 2 }]);
  });

  it("the model summary serves the version history; unknown models 404", async () => {
    const ok = await modelSummary(authedRequest("https://aise.test/api/models/model-golden-room"), {
      params: Promise.resolve({ modelId: "model-golden-room" }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { versions: { version: number }[] };
    expect(body.versions.map((version) => version.version)).toEqual([1, 2]);

    const missing = await modelSummary(authedRequest("https://aise.test/api/models/none"), {
      params: Promise.resolve({ modelId: "none" }),
    });
    expect(missing.status).toBe(404);
  });

  it("the version detail serves the full read-only view (epistemic passthrough)", async () => {
    const response = await versionDetail(
      authedRequest("https://aise.test/api/models/model-golden-room/versions/2"),
      { params: Promise.resolve({ modelId: "model-golden-room", version: "2" }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      model: { version: number; objects: { epistemicState: string }[]; spaces: unknown[] };
    };
    expect(body.model.version).toBe(2);
    expect(body.model.objects).toHaveLength(8);
    expect(body.model.objects.some((object) => object.epistemicState === "CONFIRMED")).toBe(true);
  });

  it("unknown versions 404; non-numeric versions 400 (never fabricated)", async () => {
    const missing = await versionDetail(
      authedRequest("https://aise.test/api/models/model-golden-room/versions/99"),
      { params: Promise.resolve({ modelId: "model-golden-room", version: "99" }) },
    );
    expect(missing.status).toBe(404);
    const bad = await versionDetail(
      authedRequest("https://aise.test/api/models/model-golden-room/versions/abc"),
      { params: Promise.resolve({ modelId: "model-golden-room", version: "abc" }) },
    );
    expect(bad.status).toBe(400);
  });
});

describe("the read-only discipline (no write verbs anywhere)", () => {
  it("POST/PUT/DELETE on the model surface are refused 405", async () => {
    const request = authedRequest("https://aise.test/api/models");
    const listRoute = await import("@/app/api/models/route");
    for (const verb of ["POST", "PUT", "DELETE"] as const) {
      const handler = listRoute[verb];
      expect(handler).toBeDefined();
      const response = await handler();
      expect(response.status, `${verb} must be 405`).toBe(405);
    }
    const detailRoute = await import("@/app/api/models/[modelId]/versions/[version]/route");
    for (const verb of ["POST", "PUT", "DELETE"] as const) {
      const response = await detailRoute[verb]();
      expect(response.status, `${verb} must be 405`).toBe(405);
    }
    void request;
  });

  it("the served view carries no mutation affordance (type-level structural proof)", async () => {
    const response = await versionDetail(
      authedRequest("https://aise.test/api/models/model-golden-room/versions/1"),
      { params: Promise.resolve({ modelId: "model-golden-room", version: "1" }) },
    );
    const body = (await response.json()) as Record<string, unknown>;
    // The response is a plain derived view: no store handle, no
    // write tokens, no mutation surface anywhere in the payload.
    expect(Object.keys(body)).toEqual(["model"]);
    expect(JSON.stringify(body)).not.toMatch(/commit|ingest|retract|mutate|write/i);
  });
});
