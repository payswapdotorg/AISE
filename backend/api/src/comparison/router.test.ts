/**
 * AISE-032 — Reality-vs-design comparison HTTP surface tests (through
 * the FULL server handler, exercising the one AISE-032 routing
 * delegation block).
 *
 * Depth mandated by the work order: every endpoint's happy path and
 * error path, the stable 404/400/422 status table, 405 with allow,
 * x-request-id correlation, the governed-path refusal matrix over HTTP,
 * and the LAZY DEFAULT WIRING end-to-end — the default comparison
 * service resolves its two READ-ONLY reference resolvers over the
 * handler's OWN env data dir (a REAL reality project built through the
 * default reality wiring; coverage evidence registered through the
 * default evidence wiring), never through a memoized sibling wiring.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { createLogger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { createRequestHandler } from "../server";
import { sha256Hex } from "../lib/hash";
import { ComparisonService } from "./service";
import { FsComparisonStore } from "./store";
import {
  COMPARISON_ID,
  EV_DUCT_UNKNOWN,
  EV_SKYLIGHT_OCCLUDED,
  FIXED_NOW,
  KNOWN_EVIDENCE,
  PROJECT_ID,
  VERSION_ID,
  WALL_WEST_TOMBSTONE_REASON,
  buildCanonicalInput,
  buildRealityNodes,
  buildRealityVersion,
  buildRealityVersionWithoutDoorEvidence,
  buildWallWestNode,
  fixedClock,
  makeEvidenceMembershipResolver,
  makeRealityVersionResolver,
  withTempDir,
} from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** Handler with the AISE-032 routing block backed by an injected FS store (canonical resolver). */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    comparison: {
      service: new ComparisonService({
        store: new FsComparisonStore(join(root, "data")),
        clock: fixedClock,
        realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [
          buildRealityVersion(),
        ]),
        evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
      }),
      logger: quietLogger,
    },
  });
}

/** Handler whose resolver serves the NO-DOOR-EVIDENCE variant (the unsubstantiated-discrepancy refusal). */
function handlerWithUnsubstantiatedDoor(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    comparison: {
      service: new ComparisonService({
        store: new FsComparisonStore(join(root, "data")),
        clock: fixedClock,
        realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [
          buildRealityVersionWithoutDoorEvidence(),
        ]),
        evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
      }),
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

function put(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "PUT" });
}

function del(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "DELETE" });
}

interface ErrorBody {
  ok: boolean;
  error: string;
  detail?: string;
}

async function errorBody(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

/** The canonical comparison request body over the fixture resolver. */
function comparisonBody(): string {
  const input = buildCanonicalInput();
  return JSON.stringify({
    comparisonId: input.comparisonId,
    realityRef: input.realityRef,
    designReference: input.designReference,
    tolerances: input.tolerances,
    coverage: input.coverage,
  });
}

describe("comparison HTTP surface: run and read", () => {
  test("POST /v1/comparisons runs the comparison; x-request-id echoes; canonical file at the path convention", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(
        postJson("/v1/comparisons", comparisonBody(), { "x-request-id": "corr-comp-1" }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-comp-1");
      const body = (await response.json()) as {
        ok: boolean;
        comparison: {
          comparisonId: string;
          realityRef: { projectId: string; versionId: string };
          stats: { totalEntries: number; discrepancies: number };
          history: { eventType: string }[];
        };
      };
      expect(body.ok).toBe(true);
      expect(body.comparison.comparisonId).toBe(COMPARISON_ID);
      expect(body.comparison.realityRef).toEqual({ projectId: PROJECT_ID, versionId: VERSION_ID });
      expect(body.comparison.stats.totalEntries).toBe(12);
      expect(body.comparison.stats.discrepancies).toBe(1);
      expect(body.comparison.history.map((event) => event.eventType)).toEqual([
        "comparison_recorded",
      ]);
      const path = join(root, "data", "comparisons", `${sha256Hex(COMPARISON_ID)}.json`);
      expect(existsSync(path)).toBe(true);
      const parsed = JSON.parse(readFileSync(path, "utf8")) as { comparisonId: string };
      expect(parsed.comparisonId).toBe(COMPARISON_ID);
    });
  });

  test("GET /v1/comparisons lists summaries; GET /:id returns the record; 404 unknown", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/comparisons", comparisonBody()));
      const list = await handler(get("/v1/comparisons", { "x-request-id": "corr-list" }));
      expect(list.status).toBe(200);
      expect(list.headers.get("x-request-id")).toBe("corr-list");
      const listBody = (await list.json()) as {
        ok: boolean;
        comparisons: { comparisonId: string; designSourceRecordId: string; discrepancies: number }[];
      };
      expect(listBody.ok).toBe(true);
      expect(listBody.comparisons).toHaveLength(1);
      expect(listBody.comparisons[0]?.comparisonId).toBe(COMPARISON_ID);
      expect(listBody.comparisons[0]?.designSourceRecordId).toBe("IFC-MODEL-0042");
      expect(listBody.comparisons[0]?.discrepancies).toBe(1);

      const one = await handler(get(`/v1/comparisons/${COMPARISON_ID}`));
      expect(one.status).toBe(200);
      const oneBody = (await one.json()) as {
        ok: boolean;
        comparison: {
          entries: { status: string; designItemId: string | null }[];
          inputDigest: string;
        };
      };
      expect(oneBody.ok).toBe(true);
      expect(oneBody.comparison.entries).toHaveLength(12);
      expect(oneBody.comparison.inputDigest).toMatch(/^[0-9a-f]{64}$/);

      const missing = await handler(get("/v1/comparisons/comparison-ghost"));
      expect(missing.status).toBe(404);
      expect((await errorBody(missing)).error).toBe("comparison_not_found");
    });
  });

  test("the derived record round-trips byte-identically through GET (canonical JSON on the wire)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      await handler(postJson("/v1/comparisons", comparisonBody()));
      const path = join(root, "data", "comparisons", `${sha256Hex(COMPARISON_ID)}.json`);
      const fileBytes = readFileSync(path, "utf8");
      const response = await handler(get(`/v1/comparisons/${COMPARISON_ID}`));
      const body = (await response.json()) as { comparison: unknown };
      expect(canonicalJsonStringify(body.comparison)).toBe(fileBytes);
    });
  });
});

describe("comparison HTTP surface: the stable status table", () => {
  test("400: malformed JSON body", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(postJson("/v1/comparisons", "{not json"));
      expect(response.status).toBe(400);
      const body = await errorBody(response);
      expect(body.error).toBe("malformed_json");
    });
  });

  test("400: invalid comparison id in the path", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(get(`/v1/comparisons/${"x".repeat(257)}`));
      expect(response.status).toBe(400);
      const body = await errorBody(response);
      expect(body.error).toBe("invalid_comparison_id");
    });
  });

  test("422: the governed-path refusal matrix (each code DISTINCT, each detail naming the offender)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const base = JSON.parse(comparisonBody()) as Record<string, unknown>;

      // unknown_reality_version (the fixture resolver knows only v002).
      const unknownVersion = await handler(
        postJson(
          "/v1/comparisons",
          JSON.stringify({ ...base, realityRef: { projectId: PROJECT_ID, versionId: "v999" } }),
        ),
      );
      expect(unknownVersion.status).toBe(422);
      const versionBody = await errorBody(unknownVersion);
      expect(versionBody.error).toBe("unknown_reality_version");
      expect(versionBody.detail).toContain("v999");

      // unknown_coverage_target (annotation naming an unmapped target).
      const unknownTarget = await handler(
        postJson(
          "/v1/comparisons",
          JSON.stringify({
            ...base,
            coverage: [
              { targetNodeId: "pipe-service", observationStatus: "OCCLUDED", evidenceIds: [EV_SKYLIGHT_OCCLUDED] },
            ],
          }),
        ),
      );
      expect(unknownTarget.status).toBe(422);
      const targetBody = await errorBody(unknownTarget);
      expect(targetBody.error).toBe("unknown_coverage_target");
      expect(targetBody.detail).toContain("pipe-service");

      // unknown_evidence_ref (coverage evidence id that does not resolve).
      const ghost = sha256Hex("router-ghost-evidence");
      const unknownEvidence = await handler(
        postJson(
          "/v1/comparisons",
          JSON.stringify({
            ...base,
            coverage: [{ targetNodeId: "skylight", observationStatus: "OCCLUDED", evidenceIds: [ghost] }],
          }),
        ),
      );
      expect(unknownEvidence.status).toBe(422);
      const evidenceBody = await errorBody(unknownEvidence);
      expect(evidenceBody.error).toBe("unknown_evidence_ref");
      expect(evidenceBody.detail).toContain(ghost);

      // coverage_contradicts_reality (NOT_OBSERVED for a carried node).
      const contradiction = await handler(
        postJson(
          "/v1/comparisons",
          JSON.stringify({
            ...base,
            coverage: [{ targetNodeId: "wall-north", observationStatus: "NOT_OBSERVED", evidenceIds: [EV_SKYLIGHT_OCCLUDED] }],
          }),
        ),
      );
      expect(contradiction.status).toBe(422);
      const contradictionBody = await errorBody(contradiction);
      expect(contradictionBody.error).toBe("coverage_contradicts_reality");
      expect(contradictionBody.detail).toContain("wall-north");

      // discrepancy_without_evidence (the variant resolver strips the
      // door's evidence; the deviation becomes unsubstantiated).
      const unsubstantiated = await handlerWithUnsubstantiatedDoor(root)(
        postJson("/v1/comparisons", comparisonBody()),
      );
      expect(unsubstantiated.status).toBe(422);
      const unsubstantiatedBody = await errorBody(unsubstantiated);
      expect(unsubstantiatedBody.error).toBe("discrepancy_without_evidence");
      expect(unsubstantiatedBody.detail).toContain("width");

      // comparison_exists (id reuse — append-only, never a rewrite).
      const first = await handler(
        postJson("/v1/comparisons", JSON.stringify({ ...base, comparisonId: "comparison-reuse" })),
      );
      expect(first.status).toBe(200);
      const reuse = await handler(
        postJson("/v1/comparisons", JSON.stringify({ ...base, comparisonId: "comparison-reuse" })),
      );
      expect(reuse.status).toBe(422);
      expect((await errorBody(reuse)).error).toBe("comparison_exists");

      // Payload shape refusals: numeric design value without a unit;
      // empty items; duplicate design items.
      const design = base["designReference"] as Record<string, unknown>;
      const items = design["items"] as Record<string, unknown>[];
      const noUnit = await handler(
        postJson(
          "/v1/comparisons",
          JSON.stringify({
            ...base,
            comparisonId: "comparison-no-unit",
            designReference: {
              ...design,
              items: [
                {
                  designItemId: "x-dgn",
                  targetNodeId: "wall-north",
                  properties: [{ key: "length", value: 5 }],
                },
              ],
            },
          }),
        ),
      );
      expect(noUnit.status).toBe(422);
      expect((await errorBody(noUnit)).error).toBe("invalid_design_property");

      const noItems = await handler(
        postJson(
          "/v1/comparisons",
          JSON.stringify({
            ...base,
            comparisonId: "comparison-no-items",
            designReference: { ...design, items: [] },
          }),
        ),
      );
      expect(noItems.status).toBe(422);
      expect((await errorBody(noItems)).error).toBe("comparison_without_items");

      const duplicateItems = await handler(
        postJson(
          "/v1/comparisons",
          JSON.stringify({
            ...base,
            comparisonId: "comparison-dup-items",
            designReference: { ...design, items: [items[0], items[0]] },
          }),
        ),
      );
      expect(duplicateItems.status).toBe(422);
      expect((await errorBody(duplicateItems)).error).toBe("duplicate_design_item");
    });
  });

  test("the uncertainty statuses arrive on the wire VERBATIM (never collapsed)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(postJson("/v1/comparisons", comparisonBody()));
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        comparison: { entries: { status: string; omissionCode?: string }[] };
      };
      const statuses = body.comparison.entries.map((row) => row.status).sort();
      expect(statuses).toEqual(
        [
          "deviation_beyond_tolerance",
          "matches",
          "matches",
          "not_observed_in_reality",
          "occluded_in_reality",
          "unknown",
          "unknown",
          "unknown",
          "unknown",
          "unplanned_in_reality",
          "within_tolerance",
          "within_tolerance",
        ].sort(),
      );
      const skylight = body.comparison.entries.find(
        (row) => row.status === "occluded_in_reality",
      );
      expect(skylight?.omissionCode).toBe("occluded_target");
    });
  });
});

describe("comparison HTTP surface: methods and fall-through", () => {
  test("405 with explicit allow on wrong methods", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const putRoot = await handler(put("/v1/comparisons"));
      expect(putRoot.status).toBe(405);
      expect(putRoot.headers.get("allow")).toBe("GET, POST");
      const delRoot = await handler(del("/v1/comparisons"));
      expect(delRoot.status).toBe(405);
      expect(delRoot.headers.get("allow")).toBe("GET, POST");
      const postOne = await handler(postJson(`/v1/comparisons/${COMPARISON_ID}`, "{}"));
      expect(postOne.status).toBe(405);
      expect(postOne.headers.get("allow")).toBe("GET");
      const delOne = await handler(del(`/v1/comparisons/${COMPARISON_ID}`));
      expect(delOne.status).toBe(405);
      expect(delOne.headers.get("allow")).toBe("GET");
    });
  });

  test("unmatched comparison subpaths fall through to the server-wide 404", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const deep = await handler(get("/v1/comparisons/some-id/entries/extra"));
      expect(deep.status).toBe(404);
      const foreign = await handler(get("/v1/comparisonsX"));
      expect(foreign.status).toBe(404);
      // Health traffic is unaffected by the comparison block.
      const health = await handler(get("/healthz"));
      expect(health.status).toBe(200);
    });
  });
});

describe("comparison HTTP surface: lazy default wiring (end-to-end)", () => {
  test("the default wiring compares over the env data dir: a REAL reality project + evidence, all through their own default wirings", async () => {
    await withTempDir(async (root) => {
      const envWithDir: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(root, "data") };
      // NO injected comparison wiring: the surface under test is the LAZY
      // DEFAULT, which resolves its two read-only reference resolvers over
      // the handler's OWN env data dir — the REAL FsRealityStore and the
      // REAL FsEvidenceStore of THIS handler (never a memoized sibling
      // wiring, so handler/test ordering can never point it at another
      // data dir).
      const handler = createRequestHandler({
        envSource: () => envWithDir,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
      });

      // 1. The REALITY authority through the DEFAULT reality wiring:
      //    v001 empty → v002 the six live nodes + wall-west → v003 the
      //    tombstone (delete wall-west).
      const created = await handler(
        postJson("/v1/reality/projects", JSON.stringify({ projectId: PROJECT_ID })),
      );
      expect(created.status).toBe(200);
      const upserts = [...buildRealityNodes(), buildWallWestNode()].map((node) => ({
        op: "upsert-node",
        node,
      }));
      const nodesApplied = await handler(
        postJson(
          `/v1/reality/projects/${PROJECT_ID}/changes`,
          JSON.stringify({ changes: upserts }),
        ),
      );
      expect(nodesApplied.status).toBe(200);
      const tombstoneApplied = await handler(
        postJson(
          `/v1/reality/projects/${PROJECT_ID}/changes`,
          JSON.stringify({
            changes: [{ op: "delete", nodeId: "wall-west", reason: WALL_WEST_TOMBSTONE_REASON }],
          }),
        ),
      );
      expect(tombstoneApplied.status).toBe(200);
      const versionPath = join(
        root,
        "data",
        "reality",
        sha256Hex(PROJECT_ID),
        "versions",
        "v003.json",
      );
      const versionBytesBefore = readFileSync(versionPath, "utf8");

      // 2. Coverage evidence through the DEFAULT evidence wiring (the
      //    default comparison resolver reads THIS store).
      for (const contentId of [EV_SKYLIGHT_OCCLUDED, EV_DUCT_UNKNOWN]) {
        const evidence = await handler(
          postJson(
            "/v1/evidence",
            JSON.stringify({
              contractVersion: "1.0.0",
              contentId,
              byteSize: 2048,
              mediaType: "image/jpeg",
              capturedAt: FIXED_NOW,
              acquisitionMethod: "STILL_IMAGERY",
              acquisitionMetadata: { "mission.id": "mission-2026-000042" },
            }),
          ),
        );
        expect(evidence.status).toBe(200);
      }

      // 3. THE COMPARISON through the DEFAULT comparison wiring: the
      //    pinned reality version resolves read-only over the env data
      //    dir; coverage evidence membership resolves over the same dir.
      const input = buildCanonicalInput();
      const response = await handler(
        postJson(
          "/v1/comparisons",
          JSON.stringify({
            ...input,
            realityRef: { projectId: PROJECT_ID, versionId: "v003" },
          }),
        ),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        comparison: {
          comparisonId: string;
          stats: { totalEntries: number; discrepancies: number; occludedInReality: number };
          entries: { status: string; designItemId: string | null; targetNodeId: string | null }[];
        };
      };
      expect(body.ok).toBe(true);
      expect(body.comparison.comparisonId).toBe(COMPARISON_ID);
      expect(body.comparison.stats.totalEntries).toBe(12);
      expect(body.comparison.stats.discrepancies).toBe(1);
      expect(body.comparison.stats.occludedInReality).toBe(1);
      const unplanned = body.comparison.entries.find(
        (row) => row.status === "unplanned_in_reality",
      );
      expect(unplanned?.targetNodeId).toBe("pipe-service");
      expect(
        existsSync(join(root, "data", "comparisons", `${sha256Hex(COMPARISON_ID)}.json`)),
      ).toBe(true);

      // 4. NEITHER SOURCE ALTERED over HTTP: the reality authority's
      //    version file is byte-identical after the comparison.
      expect(readFileSync(versionPath, "utf8")).toBe(versionBytesBefore);

      // 5. Read-back through the default wiring.
      const readBack = await handler(get(`/v1/comparisons/${COMPARISON_ID}`));
      expect(readBack.status).toBe(200);
      const list = await handler(get("/v1/comparisons"));
      const listBody = (await list.json()) as { comparisons: { comparisonId: string }[] };
      expect(listBody.comparisons.map((summary) => summary.comparisonId)).toEqual([COMPARISON_ID]);

      // 6. The refusal paths through the default wiring too.
      const unknownVersion = await handler(
        postJson(
          "/v1/comparisons",
          JSON.stringify({
            ...input,
            comparisonId: "comparison-default-refused",
            realityRef: { projectId: "project-other", versionId: "v001" },
          }),
        ),
      );
      expect(unknownVersion.status).toBe(422);
      expect((await errorBody(unknownVersion)).error).toBe("unknown_reality_version");
      // Non-comparison traffic stays a plain 404.
      const foreign = await handler(get("/v1/comparisons/nope/extra/deep"));
      expect(foreign.status).toBe(404);
    });
  });

  test("an injected comparison wiring wins over the default (explicit construction)", async () => {
    await withTempDir(async (root) => {
      const envWithDir: EnvRecord = { ...validEnv, AISE_DATA_DIR: join(root, "elsewhere") };
      const handler = createRequestHandler({
        envSource: () => envWithDir,
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
        comparison: {
          service: new ComparisonService({
            store: new FsComparisonStore(join(root, "injected")),
            clock: fixedClock,
            realityVersionResolver: makeRealityVersionResolver(PROJECT_ID, [
              buildRealityVersion(),
            ]),
            evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
          }),
          logger: quietLogger,
        },
      });
      const response = await handler(postJson("/v1/comparisons", comparisonBody()));
      expect(response.status).toBe(200);
      // The record landed under the INJECTED store's root, not the env dir.
      expect(existsSync(join(root, "injected", "comparisons", `${sha256Hex(COMPARISON_ID)}.json`))).toBe(true);
      expect(existsSync(join(root, "elsewhere", "comparisons"))).toBe(false);
    });
  });
});
