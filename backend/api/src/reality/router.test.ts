/**
 * AISE-016 — Reality Graph HTTP surface tests (through the FULL server
 * handler, exercising the one AISE-016 routing delegation block).
 *
 * Depth mandated by the CRITICAL work order: project create/get, change-set
 * happy path, validation 422s with typed codes, node history, the `latest`
 * alias, 404/405, x-request-id correlation, the lazy default wiring, and an
 * AISE-015 integration smoke (a wall extracted from an observed plane
 * projected into the graph as an INFERRED node with source-artifact
 * provenance).
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { createLogger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { createRequestHandler } from "../server";
import { handleRealityRequest } from "./router";
import { FsRealityStore } from "./store";
import { sha256Hex } from "../lib/hash";
import { extractArchitecturalSemantics } from "../semantics";
import {
  evidenceIdOf,
  FIXED_NOW,
  fixedClock,
  hierarchyChangeSet,
  makeNode,
  makeObservation,
  makeProperty,
  makeProvenance,
  makeRelationship,
  withTempDir,
} from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** Handler with the AISE-016 routing block backed by an injected FS store. */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    reality: {
      store: new FsRealityStore(join(root, "data")),
      clock: fixedClock,
      logger: quietLogger,
    },
  });
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

interface ErrorBody {
  ok: boolean;
  error: string;
  detail?: string;
}

describe("reality HTTP surface: projects", () => {
  test("POST /v1/reality/projects creates the empty v1 graph and echoes x-request-id", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(
        postJson("/v1/reality/projects", JSON.stringify({ projectId: "proj-http-1" }), {
          "x-request-id": "corr-reality-1",
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-reality-1");
      const body = (await response.json()) as {
        ok: boolean;
        project: { projectId: string; latestVersionId: string; versions: unknown[] };
      };
      expect(body.ok).toBe(true);
      expect(body.project.projectId).toBe("proj-http-1");
      expect(body.project.latestVersionId).toBe("v001");
      expect(body.project.versions).toHaveLength(1);
      // Persisted under the capture-store path convention.
      expect(
        existsSync(
          join(root, "data", "reality", sha256Hex("proj-http-1"), "versions", "v001.json"),
        ),
      ).toBe(true);
    });
  });

  test("duplicate project creation is a 422 project_exists", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/reality/projects", JSON.stringify({ projectId: "p1" })));
      const duplicate = await handler(postJson("/v1/reality/projects", JSON.stringify({ projectId: "p1" })));
      expect(duplicate.status).toBe(422);
      const body = (await duplicate.json()) as ErrorBody;
      expect(body.error).toBe("project_exists");
    });
  });

  test("missing projectId and malformed JSON are 400s", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const missing = await handler(postJson("/v1/reality/projects", JSON.stringify({})));
      expect(missing.status).toBe(400);
      expect(((await missing.json()) as ErrorBody).error).toBe("invalid_body");
      const malformed = await handler(postJson("/v1/reality/projects", "{not json"));
      expect(malformed.status).toBe(400);
      expect(((await malformed.json()) as ErrorBody).error).toBe("malformed_json");
    });
  });

  test("GET /v1/reality/projects/:id returns header + version list; unknown is 404", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/reality/projects", JSON.stringify({ projectId: "p1" })));
      await handler(
        postJson("/v1/reality/projects/p1/changes", JSON.stringify({ changes: hierarchyChangeSet() })),
      );
      const read = await handler(get("/v1/reality/projects/p1"));
      expect(read.status).toBe(200);
      const body = (await read.json()) as {
        project: { latestVersionId: string; versions: { versionId: string }[] };
      };
      expect(body.project.latestVersionId).toBe("v002");
      expect(body.project.versions.map((v) => v.versionId)).toEqual(["v001", "v002"]);
      const unknown = await handler(get("/v1/reality/projects/ghost"));
      expect(unknown.status).toBe(404);
      expect(((await unknown.json()) as ErrorBody).error).toBe("project_not_found");
    });
  });

  test("the lazy default wiring constructs FsRealityStore from the env data dir", async () => {
    await withTempDir(async (root) => {
      const envWithDir: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(root, "data") };
      const handler = createRequestHandler({
        envSource: () => envWithDir,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
      });
      const response = await handler(postJson("/v1/reality/projects", JSON.stringify({ projectId: "lazy-1" })));
      expect(response.status).toBe(200);
      expect(existsSync(join(root, "data", "reality", sha256Hex("lazy-1"), "graph.json"))).toBe(true);
    });
  });
});

describe("reality HTTP surface: change application", () => {
  async function prepared(root: string): Promise<(request: Request) => Promise<Response>> {
    const handler = handlerWith(root);
    await handler(postJson("/v1/reality/projects", JSON.stringify({ projectId: "p1" })));
    return handler;
  }

  test("happy path: hierarchy change set → v002; latest alias returns the full snapshot", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const applied = await handler(
        postJson("/v1/reality/projects/p1/changes", JSON.stringify({ changes: hierarchyChangeSet() })),
      );
      expect(applied.status).toBe(200);
      const appliedBody = (await applied.json()) as {
        version: { versionId: string; parentVersionId: string; nodes: unknown[]; relationships: unknown[] };
      };
      expect(appliedBody.version.versionId).toBe("v002");
      expect(appliedBody.version.parentVersionId).toBe("v001");
      expect(appliedBody.version.nodes).toHaveLength(6);
      expect(appliedBody.version.relationships).toHaveLength(5);

      const latest = await handler(get("/v1/reality/projects/p1/versions/latest"));
      expect(latest.status).toBe(200);
      const latestBody = (await latest.json()) as { version: { versionId: string } };
      expect(latestBody.version.versionId).toBe("v002");

      const explicit = await handler(get("/v1/reality/projects/p1/versions/v002"));
      expect(explicit.status).toBe(200);
      expect(((await explicit.json()) as { version: { versionId: string } }).version.versionId).toBe("v002");
    });
  });

  test("unitless numeric property → 422 numeric_property_without_unit naming node+property", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const response = await handler(
        postJson(
          "/v1/reality/projects/p1/changes",
          JSON.stringify({
            changes: [
              {
                op: "upsert-node",
                node: {
                  nodeId: "wall-9",
                  kind: "element",
                  epistemicStatus: "INFERRED",
                  properties: [
                    { key: "height", value: 2.7, epistemicStatus: "INFERRED", provenance: [makeProvenance()] },
                  ],
                  provenance: [makeProvenance()],
                },
              },
            ],
          }),
        ),
      );
      expect(response.status).toBe(422);
      const body = (await response.json()) as ErrorBody;
      expect(body.error).toBe("numeric_property_without_unit");
      expect(body.detail).toContain("wall-9");
      expect(body.detail).toContain("height");
    });
  });

  test("missing provenance → 422 missing_provenance", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const response = await handler(
        postJson(
          "/v1/reality/projects/p1/changes",
          JSON.stringify({
            changes: [
              {
                op: "upsert-node",
                node: { nodeId: "n1", kind: "element", epistemicStatus: "INFERRED", properties: [], provenance: [] },
              },
            ],
          }),
        ),
      );
      expect(response.status).toBe(422);
      expect(((await response.json()) as ErrorBody).error).toBe("missing_provenance");
    });
  });

  test("dangling relationship endpoint → 422 dangling_reference naming the id", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const response = await handler(
        postJson(
          "/v1/reality/projects/p1/changes",
          JSON.stringify({
            changes: [
              { op: "upsert-node", node: makeNode("a") },
              { op: "upsert-relationship", relationship: makeRelationship("r1", "a", "ghost-node") },
            ],
          }),
        ),
      );
      expect(response.status).toBe(422);
      const body = (await response.json()) as ErrorBody;
      expect(body.error).toBe("dangling_reference");
      expect(body.detail).toContain("ghost-node");
    });
  });

  test("CONFIRMED→INFERRED downgrade → 422 epistemic_downgrade naming node+property", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const confirmed = JSON.stringify({
        changes: [
          {
            op: "upsert-node",
            node: makeNode("wall-1", {
              epistemicStatus: "CONFIRMED",
              properties: [makeProperty("height", 2.7, { unit: "m", epistemicStatus: "CONFIRMED" })],
            }),
          },
        ],
      });
      expect((await handler(postJson("/v1/reality/projects/p1/changes", confirmed))).status).toBe(200);
      const downgrade = JSON.stringify({
        changes: [
          {
            op: "upsert-node",
            node: makeNode("wall-1", {
              epistemicStatus: "CONFIRMED",
              properties: [makeProperty("height", 2.7, { unit: "m", epistemicStatus: "INFERRED" })],
            }),
          },
        ],
      });
      const response = await handler(postJson("/v1/reality/projects/p1/changes", downgrade));
      expect(response.status).toBe(422);
      const body = (await response.json()) as ErrorBody;
      expect(body.error).toBe("epistemic_downgrade");
      expect(body.detail).toContain("wall-1");
      expect(body.detail).toContain("height");
    });
  });

  test("unknown change op → 422 invalid_change; non-array changes → 400", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const badOp = await handler(
        postJson("/v1/reality/projects/p1/changes", JSON.stringify({ changes: [{ op: "explode" }] })),
      );
      expect(badOp.status).toBe(422);
      expect(((await badOp.json()) as ErrorBody).error).toBe("invalid_change");
      const badBody = await handler(postJson("/v1/reality/projects/p1/changes", JSON.stringify({ changes: "x" })));
      expect(badBody.status).toBe(400);
      expect(((await badBody.json()) as ErrorBody).error).toBe("invalid_body");
    });
  });

  test("changes on an unknown project → 404 project_not_found", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const response = await handler(postJson("/v1/reality/projects/ghost/changes", JSON.stringify({ changes: [] })));
      expect(response.status).toBe(404);
      expect(((await response.json()) as ErrorBody).error).toBe("project_not_found");
    });
  });

  test("unknown version id → 404 version_not_found", async () => {
    await withTempDir(async (root) => {
      const handler = await prepared(root);
      const response = await handler(get("/v1/reality/projects/p1/versions/v099"));
      expect(response.status).toBe(404);
      expect(((await response.json()) as ErrorBody).error).toBe("version_not_found");
    });
  });
});

describe("reality HTTP surface: node history", () => {
  test("node history shows per-version records and a visible tombstone", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/reality/projects", JSON.stringify({ projectId: "p1" })));
      await handler(
        postJson(
          "/v1/reality/projects/p1/changes",
          JSON.stringify({
            changes: [
              { op: "upsert-node", node: makeNode("wall-1", { epistemicStatus: "INFERRED" }) },
              { op: "upsert-node", node: makeNode("space-1", { kind: "space" }) },
            ],
          }),
        ),
      );
      await handler(
        postJson(
          "/v1/reality/projects/p1/changes",
          JSON.stringify({ changes: [{ op: "delete", nodeId: "wall-1", reason: "demolished" }] }),
        ),
      );
      const response = await handler(get("/v1/reality/projects/p1/nodes/wall-1"));
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        history: {
          latestVersionId: string;
          entries: { versionId: string; changeOp: string | null; node: unknown | null; tombstone: unknown | null }[];
        };
      };
      expect(body.history.latestVersionId).toBe("v003");
      expect(body.history.entries.map((e) => e.versionId)).toEqual(["v001", "v002", "v003"]);
      expect(body.history.entries[1]?.node).not.toBeNull();
      expect(body.history.entries[2]?.node).toBeNull();
      expect(body.history.entries[2]?.tombstone).toEqual({
        nodeId: "wall-1",
        reason: "demolished",
      });
      // Node absent from latest but history fully visible.
      const unknown = await handler(get("/v1/reality/projects/p1/nodes/never-there"));
      expect(unknown.status).toBe(404);
      expect(((await unknown.json()) as ErrorBody).error).toBe("node_not_found");
    });
  });
});

describe("reality HTTP surface: methods and fallthrough", () => {
  test("wrong methods get 405 with an explicit allow header", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const put = await handler(
        new Request("http://localhost/v1/reality/projects", { method: "PUT" }),
      );
      expect(put.status).toBe(405);
      expect(put.headers.get("allow")).toBe("POST");
      const del = await handler(new Request("http://localhost/v1/reality/projects/p1", { method: "DELETE" }));
      expect(del.status).toBe(405);
      expect(del.headers.get("allow")).toBe("GET");
    });
  });

  test("non-reality paths return null; unmatched reality shapes fall to the server 404", async () => {
    const options = {
      store: new FsRealityStore("/tmp/aise-reality-none"),
      clock: fixedClock,
      logger: quietLogger,
    };
    const nullResponse = await handleRealityRequest(
      get("/v1/evidence"),
      new URL("http://localhost/v1/evidence"),
      "corr-0",
      options,
    );
    expect(nullResponse).toBeNull();
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(get("/v1/reality/unknown-shape"));
      expect(response.status).toBe(404);
      expect(((await response.json()) as ErrorBody).error).toBe("not_found");
    });
  });
});

describe("reality HTTP surface: AISE-015 integration smoke", () => {
  test("a wall extracted from an observed plane persists INFERRED with source-artifact provenance", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/reality/projects", JSON.stringify({ projectId: "p1" })));

      // AISE-015: extract semantics from an observed wall plane.
      const semantics = extractArchitecturalSemantics({
        planes: [
          {
            plane: { normal: [1, 0, 0], d: 0 },
            rmsResidual: 0.01,
            pointCount: 120,
            sourceArtifactId: "art-wall-w",
            observedAt: FIXED_NOW,
          },
        ],
      });
      const wall = semantics.elements[0];
      expect(wall?.kind).toBe("wall");

      // Project the SemanticElement into a canonical graph node (caller duty).
      const sourceArtifactId = wall?.provenance.sourceArtifactIds[0] ?? "art-wall-w";
      const changes = [
        {
          op: "upsert-node",
          node: {
            nodeId: `element-${wall?.elementId ?? "0"}`,
            kind: "element",
            epistemicStatus: wall?.epistemicStatus ?? "INFERRED",
            properties: [
              {
                key: "semantic.kind",
                value: wall?.kind ?? "wall",
                epistemicStatus: "INFERRED",
                provenance: [makeProvenance({ role: "DERIVED_FROM", sourceArtifactId })],
              },
            ],
            geometry: { kind: "plane" as const, ref: `plane-${wall?.elementId ?? "0"}`, sourceArtifactId },
            provenance: [
              makeProvenance({
                role: "DERIVED_FROM",
                sourceArtifactId,
                derivationNote: "extracted by aise-semantics/1.0",
                evidenceId: evidenceIdOf("wall-plane"),
              }),
            ],
            units: { linear: "m", angular: "deg" },
          },
        },
      ];
      const applied = await handler(
        postJson("/v1/reality/projects/p1/changes", JSON.stringify({ changes })),
      );
      expect(applied.status).toBe(200);

      // Read back: INFERRED status preserved, provenance verbatim.
      const latest = await handler(get("/v1/reality/projects/p1/versions/latest"));
      const body = (await latest.json()) as {
        version: {
          nodes: {
            epistemicStatus: string;
            geometry: { ref: string; sourceArtifactId: string };
            provenance: { sourceArtifactId?: string; derivationNote?: string }[];
            properties: { key: string; value: string }[];
          }[];
        };
      };
      const node = body.version.nodes[0];
      expect(node?.epistemicStatus).toBe("INFERRED");
      expect(node?.properties[0]?.key).toBe("semantic.kind");
      expect(node?.properties[0]?.value).toBe("wall");
      expect(node?.geometry.sourceArtifactId).toBe("art-wall-w");
      expect(node?.provenance[0]?.sourceArtifactId).toBe("art-wall-w");
      expect(node?.provenance[0]?.derivationNote).toBe("extracted by aise-semantics/1.0");
    });
  });

  test("observations append via changes without mutating node state (router path)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/reality/projects", JSON.stringify({ projectId: "p1" })));
      const node = makeNode("wall-1", {
        epistemicStatus: "OBSERVED",
        properties: [makeProperty("height", 2.7, { unit: "m", epistemicStatus: "OBSERVED" })],
      });
      await handler(
        postJson("/v1/reality/projects/p1/changes", JSON.stringify({ changes: [{ op: "upsert-node", node }] })),
      );
      const observe = await handler(
        postJson(
          "/v1/reality/projects/p1/changes",
          JSON.stringify({
            changes: [
              {
                op: "observe",
                observation: makeObservation("obs-1", "wall-1", {
                  properties: [makeProperty("height", 2.72, { unit: "m", epistemicStatus: "OBSERVED" })],
                }),
              },
            ],
          }),
        ),
      );
      expect(observe.status).toBe(200);
      const body = (await observe.json()) as {
        version: {
          observations: { observationId: string; properties: { value: number }[] }[];
          nodes: { nodeId: string; properties: { value: number }[] }[];
        };
      };
      expect(body.version.observations[0]?.observationId).toBe("obs-1");
      expect(body.version.observations[0]?.properties[0]?.value).toBe(2.72);
      // Node state untouched by the observation.
      expect(body.version.nodes[0]?.properties[0]?.value).toBe(2.7);
    });
  });
});
