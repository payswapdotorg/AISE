/**
 * AISE-028 — Impact HTTP surface tests (through the FULL server handler,
 * exercising the one AISE-028 routing delegation block).
 *
 * Depth mandated by the work order: the compute happy path (with
 * x-request-id echo and the on-disk path convention), the stable
 * 404/400/422 status table, 405 with allow, the governed-path refusal
 * matrix over HTTP, idempotent re-computation, and the lazy default wiring
 * end-to-end (impacts NOT injected: the default service resolves its two
 * read-only resolvers over PRIVATE service instances on the handler's OWN
 * env data dir — a real intervention scenario and a real BOQ import ->
 * normalization -> mapping pipeline over the same data dir).
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { createRequestHandler } from "../server";
import { sha256Hex } from "../lib/hash";
import { InterventionService } from "../intervention/service";
import { FsInterventionStore } from "../intervention/store";
import { buildBaselineStorey, makeBaselineResolver } from "../intervention/testkit";
import { ImpactService } from "./service";
import { FsImpactStore } from "./store";
import {
  CANONICAL_RATES,
  IMPORT_ID,
  SCENARIO_ID,
  canonicalResolvers,
  fixedClock,
  withTempDir,
} from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** Handler with the AISE-028 routing block backed by an injected FS store. */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: "0.1.0",
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    impacts: {
      service: new ImpactService({
        store: new FsImpactStore(join(root, "data")),
        clock: fixedClock,
        ...canonicalResolvers(),
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

interface ImpactResponse {
  ok: boolean;
  impact: {
    impactId: string;
    request: { scenarioId: string; stateIndex: number; importId: string };
    report: {
      lines: {
        lineId: string;
        kind: string;
        stepId: string;
        targetNodeId: string;
        quantity: { value: number; unit: string; uncertainty: number | null } | null;
        omissionCode: string | null;
        epistemicStatus: string;
        boqMappings: { entryId: string; unitText: string | null; unitRelation: string }[];
      }[];
      costImpacts: unknown[];
      summary: { lineCount: number; costImpactCount: number };
      epistemicStatus: string;
    };
  };
}

const IMPACT_BODY = JSON.stringify({
  scenarioId: SCENARIO_ID,
  stateIndex: 5,
  importId: IMPORT_ID,
  rates: Object.fromEntries(CANONICAL_RATES.map((rate) => [rate.entryId, rate])),
});

describe("impact HTTP surface: compute and read", () => {
  test("POST /v1/impacts computes + persists; x-request-id echoes; file at the path convention", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(postJson("/v1/impacts", IMPACT_BODY, { "x-request-id": "corr-imp-1" }));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-imp-1");
      const body = (await response.json()) as ImpactResponse;
      expect(body.ok).toBe(true);
      expect(body.impact.request.scenarioId).toBe(SCENARIO_ID);
      expect(body.impact.request.stateIndex).toBe(5);
      expect(body.impact.report.summary.lineCount).toBe(9);
      expect(body.impact.report.summary.costImpactCount).toBe(3);
      expect(body.impact.report.epistemicStatus).toBe("PROPOSED");
      for (const line of body.impact.report.lines) {
        expect(line.epistemicStatus).toBe("PROPOSED");
      }
      // On disk at <dataDir>/impacts/<sha256(impactId)>.json.
      const path = join(root, "data", "impacts", `${sha256Hex(body.impact.impactId)}.json`);
      expect(existsSync(path)).toBe(true);
      expect(JSON.parse(readFileSync(path, "utf8")).impactId).toBe(body.impact.impactId);

      // Idempotent re-POST over the same inputs returns the SAME record.
      const again = await handler(postJson("/v1/impacts", IMPACT_BODY));
      expect(again.status).toBe(200);
      const againBody = (await again.json()) as ImpactResponse;
      expect(againBody.impact.impactId).toBe(body.impact.impactId);
    });
  });

  test("GET /v1/impacts lists summaries; GET /v1/impacts/:id returns the full record", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const created = await handler(postJson("/v1/impacts", IMPACT_BODY));
      const impactId = ((await created.json()) as ImpactResponse).impact.impactId;

      const list = await handler(get("/v1/impacts"));
      expect(list.status).toBe(200);
      const listBody = (await list.json()) as { ok: boolean; impacts: { impactId: string }[] };
      expect(listBody.impacts).toHaveLength(1);
      expect(listBody.impacts[0]!.impactId).toBe(impactId);

      const detail = await handler(get(`/v1/impacts/${impactId}`, { "x-request-id": "corr-imp-2" }));
      expect(detail.status).toBe(200);
      expect(detail.headers.get("x-request-id")).toBe("corr-imp-2");
      const detailBody = (await detail.json()) as ImpactResponse;
      expect(detailBody.impact.impactId).toBe(impactId);
      expect(detailBody.impact.report.lines.length).toBe(9);
    });
  });
});

describe("impact HTTP surface: the governed-path refusal matrix", () => {
  test("400: malformed JSON; invalid import id shape; invalid impact id in the path", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const malformed = await handler(
        new Request("http://localhost/v1/impacts", {
          method: "POST",
          body: "{not json",
          headers: { "content-type": "application/json" },
        }),
      );
      expect(malformed.status).toBe(400);
      expect((await errorBody(malformed)).error).toBe("malformed_json");

      const badImport = await handler(
        postJson("/v1/impacts", JSON.stringify({ scenarioId: SCENARIO_ID, stateIndex: 1, importId: "v001" })),
      );
      expect(badImport.status).toBe(400);
      expect((await errorBody(badImport)).error).toBe("invalid_import_ref");

      const badPathId = await handler(get("/v1/impacts/not-a-content-id"));
      expect(badPathId.status).toBe(400);
      expect((await errorBody(badPathId)).error).toBe("invalid_impact_id");
    });
  });

  test("422: the PROPOSED-literal boundary, body shape, state index and rate refusals", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      // A claimed OBSERVED impact is a typed boundary rejection over HTTP.
      const observed = await handler(
        postJson(
          "/v1/impacts",
          JSON.stringify({ ...JSON.parse(IMPACT_BODY), epistemicStatus: "OBSERVED" }),
        ),
      );
      expect(observed.status).toBe(422);
      expect((await errorBody(observed)).error).toBe("invalid_epistemic_status");

      const notObject = await handler(postJson("/v1/impacts", JSON.stringify([1, 2])));
      expect(notObject.status).toBe(422);
      expect((await errorBody(notObject)).error).toBe("invalid_impact");

      const badIndex = await handler(
        postJson(
          "/v1/impacts",
          JSON.stringify({ ...JSON.parse(IMPACT_BODY), stateIndex: -3 }),
        ),
      );
      expect(badIndex.status).toBe(422);
      expect((await errorBody(badIndex)).error).toBe("invalid_state_index");

      const badRates = await handler(
        postJson("/v1/impacts", JSON.stringify({ ...JSON.parse(IMPACT_BODY), rates: { x: 5 } })),
      );
      expect(badRates.status).toBe(422);
      expect((await errorBody(badRates)).error).toBe("invalid_rate_input");
    });
  });

  test("422: unknown scenario / out-of-range state / no stored mapping", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const unknownScenario = await handler(
        postJson("/v1/impacts", JSON.stringify({ ...JSON.parse(IMPACT_BODY), scenarioId: "scenario-none" })),
      );
      expect(unknownScenario.status).toBe(422);
      expect((await errorBody(unknownScenario)).error).toBe("unknown_scenario_ref");

      const outOfRange = await handler(
        postJson("/v1/impacts", JSON.stringify({ ...JSON.parse(IMPACT_BODY), stateIndex: 99 })),
      );
      expect(outOfRange.status).toBe(422);
      expect((await errorBody(outOfRange)).error).toBe("state_not_found");

      const noMapping = await handler(
        postJson(
          "/v1/impacts",
          JSON.stringify({ ...JSON.parse(IMPACT_BODY), importId: sha256Hex("no-such-import") }),
        ),
      );
      expect(noMapping.status).toBe(422);
      expect((await errorBody(noMapping)).error).toBe("mapping_not_available");
    });
  });

  test("404 impact_not_found for a well-formed but unknown impact id", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const ghost = sha256Hex("impact-router-ghost");
      const response = await handler(get(`/v1/impacts/${ghost}`));
      expect(response.status).toBe(404);
      expect((await errorBody(response)).error).toBe("impact_not_found");
    });
  });
});

describe("impact HTTP surface: method discipline", () => {
  test("405 with allow on wrong methods; unknown subpaths fall to the server 404", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const created = await handler(postJson("/v1/impacts", IMPACT_BODY));
      const impactId = ((await created.json()) as ImpactResponse).impact.impactId;

      const putRoot = await handler(put("/v1/impacts"));
      expect(putRoot.status).toBe(405);
      expect(putRoot.headers.get("allow")).toBe("GET, POST");

      const putOne = await handler(put(`/v1/impacts/${impactId}`));
      expect(putOne.status).toBe(405);
      expect(putOne.headers.get("allow")).toBe("GET");

      const postOne = await handler(postJson(`/v1/impacts/${impactId}`, "{}"));
      expect(postOne.status).toBe(405);

      const foreign = await handler(get(`/v1/impacts/${impactId}/mystery`));
      expect(foreign.status).toBe(404);
      expect((await errorBody(foreign)).error).toBe("not_found");
      const deep = await handler(del(`/v1/impacts/${impactId}/extra/deep`));
      expect(deep.status).toBe(404);
      expect((await errorBody(deep)).error).toBe("not_found");
    });
  });
});

describe("impact HTTP surface: lazy default wiring", () => {
  test("end-to-end: real scenario + real BOQ mapping over the env data dir, impacts NOT injected", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const envWithDir: EnvRecord = { ...validEnv, AISE_DATA_DIR: dataDir };
      const { BoqService } = await import("../boq/service");
      const { FsBoqStore } = await import("../boq/store");
      const { NormalizationService } = await import("../boq/normalization/service");
      const { FsNormalizationStore } = await import("../boq/normalization/store");
      const { MappingService } = await import("../boq/mapping/service");
      const { FsMappingStore } = await import("../boq/mapping/store");

      const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: fixedClock });
      const normalization = new NormalizationService({
        store: new FsNormalizationStore(dataDir),
        clock: fixedClock,
        boq,
      });
      const handler = createRequestHandler({
        envSource: () => envWithDir,
        version: "0.1.0",
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
        interventions: {
          service: new InterventionService({
            store: new FsInterventionStore(dataDir),
            clock: fixedClock,
            baselineResolver: makeBaselineResolver("project-zurich-hq", [buildBaselineStorey()]),
          }),
          logger: quietLogger,
        },
        boq: {
          service: boq,
          logger: quietLogger,
          normalization,
          mapping: new MappingService({
            store: new FsMappingStore(dataDir),
            clock: fixedClock,
            normalization,
            boq,
          }),
        },
      });

      // 1. A real intervention scenario over the data dir: one property
      //    change step (wall-north thickness 240mm -> 300mm).
      const scenarioId = "scenario-lazy-impact";
      const scenario = await handler(
        postJson(
          "/v1/interventions",
          JSON.stringify({
            scenarioId,
            projectId: "project-zurich-hq",
            title: "Lazy default wiring impact",
            baselineVersionId: "v001",
          }),
        ),
      );
      expect(scenario.status).toBe(200);
      const step = await handler(
        postJson(
          `/v1/interventions/${scenarioId}/steps`,
          JSON.stringify({
            kind: "property_change",
            targetNodeId: "wall-north",
            property: { key: "thickness", value: 300, unit: "mm" },
            rationale: "Fire strategy upgrade.",
            provenance: { evidenceIds: [sha256Hex("lazy-impact-evidence")] },
          }),
        ),
      );
      expect(step.status).toBe(200);

      // 2. A real BOQ import -> normalization -> mapping over the SAME data
      //    dir: the plaster row maps to the wall-north node.
      const csv = new TextEncoder().encode(
        ["Item,Description,Unit,Qty,Rate", "1,Plaster to internal walls,m2,100,5", "TOTAL,,,200,10", ""].join("\n"),
      );
      const imported = await handler(
        new Request("http://localhost/v1/boq/imports", {
          method: "POST",
          body: csv,
          headers: { "content-type": "text/csv" },
        }),
      );
      expect(imported.status).toBe(200);
      const importId = ((await imported.json()) as { import: { importId: string } }).import
        .importId;
      const normalized = await handler(postJson(`/v1/boq/imports/${importId}/normalization`, "{}"));
      expect(normalized.status).toBe(200);
      const mapped = await handler(
        postJson(
          `/v1/boq/imports/${importId}/mappings`,
          JSON.stringify({
            nodes: [
              {
                nodeId: "wall-north",
                kind: "element",
                properties: [{ key: "semantic.kind", value: "wall" }],
              },
            ],
          }),
        ),
      );
      expect(mapped.status).toBe(200);
      const mappingBody = (await mapped.json()) as {
        mapping: { entries: { entryId: string; status: string; targets: { nodeId: string }[] }[] };
      };
      const plaster = mappingBody.mapping.entries.find((entry) => entry.status === "mapped");
      expect(plaster?.targets.map((target) => target.nodeId)).toEqual(["wall-north"]);

      // 3. THE LAZY DEFAULT IMPACT WIRING: impacts was NOT injected; the
      //    default service resolves its resolvers over PRIVATE instances on
      //    the handler's env data dir and computes the traced impact.
      const impact = await handler(
        postJson(
          "/v1/impacts",
          JSON.stringify({
            scenarioId,
            stateIndex: 1,
            importId,
            rates: { [plaster!.entryId]: { amount: 5, currency: "CHF" } },
          }),
        ),
      );
      expect(impact.status).toBe(200);
      const impactBody = (await impact.json()) as ImpactResponse;
      expect(impactBody.impact.request.scenarioId).toBe(scenarioId);
      expect(impactBody.impact.request.stateIndex).toBe(1);
      const lines = impactBody.impact.report.lines;
      expect(lines).toHaveLength(1);
      expect(lines[0]!.kind).toBe("property_delta");
      expect(lines[0]!.targetNodeId).toBe("wall-north");
      expect(lines[0]!.quantity).toEqual({ value: 60, unit: "mm", uncertainty: null });
      expect(lines[0]!.boqMappings).toHaveLength(1);
      expect(lines[0]!.boqMappings[0]!.unitText).toBe("m2");
      // m2 (BOQ) vs mm (delta): different — and the supplied rate is
      // honestly NOT applied across units.
      expect(lines[0]!.boqMappings[0]!.unitRelation).toBe("different");
      expect(impactBody.impact.report.costImpacts).toHaveLength(0);
    });
  });
});
