/**
 * PROD-016 — the reality recorder's LIVE write-adapter tests (injected
 * fetch stubs only: no network, no timers, deterministic).
 *
 * Pinned:
 *  - `ensureRealityProjectLive`: 200 → created:true with the header's
 *    latestVersionId; 422 project_exists → created:false via the header
 *    read (an honest "already exists", never a failure); the header read
 *    failing after a project_exists refusal surfaces THAT failure; other
 *    failures pass through verbatim;
 *  - `applyRealityChangesLive`: 200 `{version}` → the recorded-version
 *    subset (versionId, parent, counts from the response's own fields);
 *    a typed 422 surfaces code + reason through the POST-009 failure
 *    discipline; a missing version envelope is an invalid failure.
 */

import { describe, expect, test } from "bun:test";
import {
  applyRealityChangesLive,
  ensureRealityProjectLive,
  type FetchLike,
} from "./api";

/** A fetch stub answering each path with canned behavior (deterministic). */
function stubFetch(
  routes: Readonly<
    Record<string, { readonly status?: number; readonly body?: unknown } | "throw">
  >,
): FetchLike {
  return async (input: string) => {
    const route = routes[input];
    if (route === undefined) {
      return new Response("not stubbed", { status: 404 });
    }
    if (route === "throw") {
      throw new TypeError("network is down");
    }
    const status = route.status ?? 200;
    const body = route.body ?? { ok: true };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

function versionPayload() {
  return {
    ok: true,
    version: {
      versionId: "v002",
      parentVersionId: "v001",
      createdAt: "2026-09-29T13:00:00Z",
      nodes: [
        { nodeId: "site-1", kind: "site", epistemicStatus: "OBSERVED", provenance: [] },
        { nodeId: "slab-1", kind: "element", epistemicStatus: "CONFIRMED", provenance: [] },
      ],
      relationships: [
        {
          relationshipId: "site-1--contains-->slab-1",
          fromNodeId: "site-1",
          toNodeId: "slab-1",
          kind: "contains",
          provenance: [],
        },
      ],
      changeLog: [{ op: "upsert-node" }, { op: "upsert-node" }, { op: "upsert-relationship" }],
      observations: [],
      tombstones: [],
    },
  };
}

describe("PROD-016 ensureRealityProjectLive (the seam's first leg)", () => {
  test("200 answers created:true with the header's latestVersionId", async () => {
    const result = await ensureRealityProjectLive(
      stubFetch({
        "/v1/reality/projects": {
          body: { ok: true, project: { projectId: "p1", latestVersionId: "v001" } },
        },
      }),
      "p1",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome.created).toBe(true);
      expect(result.outcome.latestVersionId).toBe("v001");
    }
  });

  test("422 project_exists is an honest already-exists: created:false via the header read", async () => {
    const result = await ensureRealityProjectLive(
      stubFetch({
        "/v1/reality/projects": {
          status: 422,
          body: { ok: false, error: "project_exists", detail: 'project "p1" already exists' },
        },
        "/v1/reality/projects/p1": {
          body: { ok: true, project: { projectId: "p1", latestVersionId: "v007" } },
        },
      }),
      "p1",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome.created).toBe(false);
      expect(result.outcome.latestVersionId).toBe("v007");
    }
  });

  test("project_exists followed by a FAILED header read surfaces that failure (never a guess)", async () => {
    const result = await ensureRealityProjectLive(
      stubFetch({
        "/v1/reality/projects": {
          status: 422,
          body: { ok: false, error: "project_exists", detail: "…" },
        },
        "/v1/reality/projects/p1": { status: 500, body: { ok: false, error: "internal" } },
      }),
      "p1",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("http");
      if (result.failure.kind === "http") {
        expect(result.failure.status).toBe(500);
      }
    }
  });

  test("other typed failures pass through verbatim (invalid_project_id 400)", async () => {
    const result = await ensureRealityProjectLive(
      stubFetch({
        "/v1/reality/projects": {
          status: 400,
          body: { ok: false, error: "invalid_body", detail: "expected { projectId: string }" },
        },
      }),
      "",
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.status).toBe(400);
      expect(result.failure.code).toBe("invalid_body");
      expect(result.failure.reason).toBe("expected { projectId: string }");
    }
  });

  test("a network failure is a typed network failure", async () => {
    const result = await ensureRealityProjectLive(
      stubFetch({ "/v1/reality/projects": "throw" }),
      "p1",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("network");
    }
  });
});

describe("PROD-016 applyRealityChangesLive (the governed changes POST)", () => {
  test("200 answers the recorded-version subset from the response's own fields", async () => {
    const result = await applyRealityChangesLive(
      stubFetch({
        "/v1/reality/projects/p1/changes": { body: versionPayload() },
      }),
      "p1",
      [{ op: "upsert-node" }],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.versionId).toBe("v002");
      expect(result.record.parentVersionId).toBe("v001");
      expect(result.record.createdAt).toBe("2026-09-29T13:00:00Z");
      expect(result.record.nodeCount).toBe(2);
      expect(result.record.relationshipCount).toBe(1);
      expect(result.record.changeCount).toBe(3);
      expect(result.endpoint).toBe("/v1/reality/projects/p1/changes");
    }
  });

  test("the POST body carries { changes } verbatim", async () => {
    let seen: unknown = null;
    const fetchImpl: FetchLike = async (input: string, init?: RequestInit) => {
      expect(input).toBe("/v1/reality/projects/p1/changes");
      expect(init?.method).toBe("POST");
      seen = JSON.parse(String(init?.body ?? "{}")) as unknown;
      return new Response(JSON.stringify(versionPayload()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const changes = [
      { op: "upsert-node", node: { nodeId: "site-1", kind: "site" } },
    ];
    const result = await applyRealityChangesLive(fetchImpl, "p1", changes);
    expect(result.ok).toBe(true);
    expect(seen).toEqual({ changes });
  });

  test("a typed engine refusal (422) surfaces code + reason verbatim", async () => {
    const result = await applyRealityChangesLive(
      stubFetch({
        "/v1/reality/projects/p1/changes": {
          status: 422,
          body: {
            ok: false,
            error: "missing_provenance",
            detail: "node site-1 provenance: at least one provenance record is required",
          },
        },
      }),
      "p1",
      [{ op: "upsert-node" }],
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.status).toBe(422);
      expect(result.failure.code).toBe("missing_provenance");
      expect(result.failure.reason).toBe(
        "node site-1 provenance: at least one provenance record is required",
      );
    }
  });

  test("a 200 without the version envelope is an invalid failure (never a guess)", async () => {
    const result = await applyRealityChangesLive(
      stubFetch({
        "/v1/reality/projects/p1/changes": { body: { ok: true } },
      }),
      "p1",
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("invalid");
    }
  });

  test("a 404 project_not_found passes through verbatim", async () => {
    const result = await applyRealityChangesLive(
      stubFetch({
        "/v1/reality/projects/ghost/changes": {
          status: 404,
          body: { ok: false, error: "project_not_found", detail: 'project "ghost" is unknown' },
        },
      }),
      "ghost",
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.status).toBe(404);
      expect(result.failure.code).toBe("project_not_found");
    }
  });
});
