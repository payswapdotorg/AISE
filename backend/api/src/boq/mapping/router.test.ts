/**
 * Mapping router tests (AISE-017) — exercised through the REAL server
 * request handler (`createRequestHandler`) with injected BOQ routes over
 * real temporary file-system stores (boq + normalizations + mappings),
 * mirroring the AISE-011/014 router test harness: the full 011 -> 014 ->
 * 017 pipeline over a CSV import AND a synthetic XLSX with a merged
 * "GROUND FLOOR FINISHES" banner (location refinement to high confidence),
 * manual revisions with untouched earlier versions, precise
 * 409/404/422/400/405 discipline, x-request-id echo, the lazy fallback
 * wiring and coexistence with the pre-existing BOQ routes.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createCaptureGateway } from "../../capture/gateway";
import { InMemoryCaptureStore } from "../../capture/store";
import type { EnvRecord } from "../../lib/config";
import { bytesEqual, sha256Hex } from "../../lib/hash";
import { createLogger } from "../../lib/log";
import { createRequestHandler } from "../../server";
import { MappingService } from "./service";
import { FsMappingStore } from "./store";
import { NormalizationService } from "../normalization/service";
import { FsNormalizationStore } from "../normalization/store";
import { BoqService } from "../service";
import { FsBoqStore } from "../store";
import { buildXlsx, fixedClock, text, withTempDir } from "../testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MEDIA_TYPE = "text/csv";
const REQUEST_ID = "0b4b6d6e-0000-4000-8000-000000000017";
const UNKNOWN_IMPORT = `ee`.repeat(32);

const BOQ_CSV = text(
  [
    "Item,Description,Unit,Qty,Rate",
    "1,Plaster to internal walls,m2,100,5",
    "2,Steel work,m2,100,5",
    "TOTAL,,,200,10",
    "",
  ].join("\n"),
);

/** Synthetic XLSX: merged banner "GROUND FLOOR FINISHES" + plaster item row. */
const GROUND_FLOOR_XLSX = buildXlsx({
  sheetName: "Finishes",
  worksheet:
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    '<row r="1"><c r="A1" t="inlineStr"><is><t>GROUND FLOOR FINISHES</t></is></c></row>' +
    '<row r="2"><c r="A2" t="inlineStr"><is><t>Item</t></is></c><c r="B2" t="inlineStr"><is><t>Description</t></is></c><c r="C2" t="inlineStr"><is><t>Unit</t></is></c><c r="D2" t="inlineStr"><is><t>Qty</t></is></c><c r="E2" t="inlineStr"><is><t>Rate</t></is></c></row>' +
    '<row r="3"><c r="A3" t="inlineStr"><is><t>1</t></is></c><c r="B3" t="inlineStr"><is><t>Plaster to internal walls</t></is></c><c r="C3" t="inlineStr"><is><t>m2</t></is></c><c r="D3"><v>100</v></c></row>' +
    '<row r="4"><c r="A4" t="inlineStr"><is><t>TOTAL</t></is></c><c r="D4"><v>100</v></c></row>' +
    "</sheetData>" +
    '<mergeCells count="1"><mergeCell ref="A1:E1"/></mergeCells></worksheet>',
});

const WALLS_BODY = JSON.stringify({
  nodes: [1, 2, 3].map((index) => ({
    nodeId: `wall-${index}`,
    kind: "element",
    properties: [{ key: "semantic.kind", value: "wall" }],
  })),
});

const GROUND_FLOOR_WALLS_BODY = JSON.stringify({
  nodes: [
    {
      nodeId: "wall-g1",
      kind: "element",
      properties: [{ key: "semantic.kind", value: "wall" }],
      spacePath: ["Site A", "Building 1", "Ground Floor", "Room 101"],
      nodeVersionId: "v004",
    },
    {
      nodeId: "wall-g2",
      kind: "element",
      properties: [{ key: "semantic.kind", value: "wall" }],
      spacePath: ["Site A", "Building 1", "Ground Floor", "Room 102"],
    },
  ],
});

/** Handler backed by REAL file-system BOQ + normalization + mapping stores. */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  const dataDir = join(root, "data");
  const boq = new BoqService({ store: new FsBoqStore(dataDir), clock: fixedClock });
  const normalization = new NormalizationService({
    store: new FsNormalizationStore(dataDir),
    clock: fixedClock,
    boq,
  });
  return createRequestHandler({
    envSource: () => validEnv,
    version: "0.1.0",
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
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
}

/** Handler with ONLY the ingestion service (lazy fallbacks for 014 + 017). */
function lazyHandlerWith(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: "0.1.0",
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    boq: {
      service: new BoqService({ store: new FsBoqStore(join(root, "data")), clock: fixedClock }),
      logger: quietLogger,
    },
  });
}

function post(path: string, bytes?: Uint8Array, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: bytes ?? new Uint8Array(0),
    headers: { "x-request-id": REQUEST_ID, ...headers },
  });
}

function get(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { "x-request-id": REQUEST_ID },
  });
}

function request(path: string, method: string): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "x-request-id": REQUEST_ID },
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

interface MappingResponse {
  ok: boolean;
  mapping: {
    mappingId: string;
    importId: string;
    version: number;
    entries: Array<{
      entryId: string;
      status: string;
      confidence: string;
      method: string;
      targets: Array<{ nodeId: string; spacePath?: string[]; nodeVersionId?: string; matchNote?: string }>;
      reason?: string;
    }>;
  };
  stats: {
    mapped: number;
    ambiguous: number;
    unmapped: number;
    byConfidence: Record<string, number>;
  };
}

/** Import the CSV + normalize it; returns the importId. */
async function preparedImport(handler: (request: Request) => Promise<Response>): Promise<string> {
  const imported = await handler(post("/v1/boq/imports", BOQ_CSV, { "content-type": CSV_MEDIA_TYPE }));
  expect(imported.status).toBe(200);
  const importId = ((await body(imported)) as { import: { importId: string } }).import.importId;
  const normalized = await handler(post(`/v1/boq/imports/${importId}/normalization`));
  expect(normalized.status).toBe(200);
  return importId;
}

describe("POST /v1/boq/imports/:id/mappings", () => {
  test("200: deterministic matcher over the CSV view; stats + one-to-many targets", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await preparedImport(handler);
      const response = await handler(
        post(`/v1/boq/imports/${importId}/mappings`, text(WALLS_BODY), {
          "content-type": "application/json",
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
      expect(response.headers.get("content-type")).toContain("application/json");
      const parsed = (await body(response)) as unknown as MappingResponse;
      expect(parsed.ok).toBe(true);
      expect(parsed.mapping.importId).toBe(importId);
      expect(parsed.mapping.version).toBe(1);
      expect(parsed.mapping.entries.length).toBe(2);
      expect(parsed.mapping.entries[0]!.status).toBe("mapped");
      expect(parsed.mapping.entries[0]!.confidence).toBe("medium");
      expect(parsed.mapping.entries[0]!.targets.map((target) => target.nodeId).sort()).toEqual([
        "wall-1",
        "wall-2",
        "wall-3",
      ]);
      expect(parsed.mapping.entries[1]!.status).toBe("unmapped");
      expect(parsed.mapping.entries[1]!.method).toBe("unresolved");
      expect(parsed.mapping.entries[1]!.targets).toEqual([]);
      expect(parsed.stats).toEqual({
        mapped: 1,
        ambiguous: 0,
        unmapped: 1,
        byConfidence: { high: 0, medium: 1, low: 0, uncertain: 1 },
      });
      // Persisted on disk under the append-only versioned tree.
      const { readFileSync } = await import("node:fs");
      const stored = readFileSync(
        join(root, "data", "boq", "mappings", sha256Hex(importId), "v001.json"),
        "utf8",
      );
      expect(JSON.parse(stored).version).toBe(1);
    });
  });

  test("200 via XLSX merged banner: location refinement -> high + location_match", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const imported = await handler(
        post("/v1/boq/imports", GROUND_FLOOR_XLSX, { "content-type": XLSX_MEDIA_TYPE }),
      );
      expect(imported.status).toBe(200);
      const importId = ((await body(imported)) as { import: { importId: string } }).import.importId;
      const normalized = await handler(post(`/v1/boq/imports/${importId}/normalization`));
      expect(normalized.status).toBe(200);
      const response = await handler(
        post(`/v1/boq/imports/${importId}/mappings`, text(GROUND_FLOOR_WALLS_BODY), {
          "content-type": "application/json",
        }),
      );
      expect(response.status).toBe(200);
      const parsed = (await body(response)) as unknown as MappingResponse;
      const entry = parsed.mapping.entries[0]!;
      expect(entry.status).toBe("mapped");
      expect(entry.confidence).toBe("high");
      expect(entry.method).toBe("location_match");
      expect(entry.targets.map((target) => target.nodeId).sort()).toEqual(["wall-g1", "wall-g2"]);
      expect(entry.targets[0]!.spacePath).toEqual(["Site A", "Building 1", "Ground Floor", "Room 101"]);
      expect(entry.targets[0]!.nodeVersionId).toBe("v004");
      expect(parsed.stats.byConfidence.high).toBe(1);
    });
  });

  test("409 normalization_required when no stored normalized view exists", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const imported = await handler(post("/v1/boq/imports", BOQ_CSV, { "content-type": CSV_MEDIA_TYPE }));
      const importId = ((await body(imported)) as { import: { importId: string } }).import.importId;
      const response = await handler(
        post(`/v1/boq/imports/${importId}/mappings`, text(WALLS_BODY), {
          "content-type": "application/json",
        }),
      );
      expect(response.status).toBe(409);
      expect(await body(response)).toMatchObject({ ok: false, error: "normalization_required" });
      // Nothing was persisted by the refused run.
      const missing = await handler(get(`/v1/boq/imports/${importId}/mappings`));
      expect(missing.status).toBe(404);
    });
  });

  test("404 import_not_found for unknown imports (POST, GET, manual)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const posted = await handler(
        post(`/v1/boq/imports/${UNKNOWN_IMPORT}/mappings`, text(WALLS_BODY), {
          "content-type": "application/json",
        }),
      );
      expect(posted.status).toBe(404);
      expect(await body(posted)).toMatchObject({ ok: false, error: "import_not_found" });
      const listed = await handler(get(`/v1/boq/imports/${UNKNOWN_IMPORT}/mappings`));
      expect(listed.status).toBe(404);
      const manual = await handler(
        post(`/v1/boq/imports/${UNKNOWN_IMPORT}/mappings/manual`, text("{}"), {
          "content-type": "application/json",
        }),
      );
      expect(manual.status).toBe(404);
    });
  });

  test("400 malformed_json and invalid_graph_snapshot bodies", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await preparedImport(handler);
      const malformed = await handler(
        post(`/v1/boq/imports/${importId}/mappings`, text("{not json"), {
          "content-type": "application/json",
        }),
      );
      expect(malformed.status).toBe(400);
      expect(await body(malformed)).toMatchObject({ ok: false, error: "malformed_json" });
      const noNodes = await handler(
        post(`/v1/boq/imports/${importId}/mappings`, text('{"nodes":"nope"}'), {
          "content-type": "application/json",
        }),
      );
      expect(noNodes.status).toBe(400);
      expect(await body(noNodes)).toMatchObject({ ok: false, error: "invalid_graph_snapshot" });
      const badNode = await handler(
        post(`/v1/boq/imports/${importId}/mappings`, text('{"nodes":[{"kind":"element"}]}'), {
          "content-type": "application/json",
        }),
      );
      expect(badNode.status).toBe(400);
      expect(await body(badNode)).toMatchObject({ ok: false, error: "invalid_graph_snapshot" });
    });
  });

  test("405 with allow on wrong methods", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await preparedImport(handler);
      const response = await handler(request(`/v1/boq/imports/${importId}/mappings`, "PUT"));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, POST");
      expect(await body(response)).toMatchObject({ ok: false, error: "method_not_allowed" });
    });
  });
});

describe("GET /v1/boq/imports/:id/mappings", () => {
  test("200 latest (byte-identical to the POST body) and 404 before any run", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await preparedImport(handler);
      const before = await handler(get(`/v1/boq/imports/${importId}/mappings`));
      expect(before.status).toBe(404);
      expect(await body(before)).toMatchObject({ ok: false, error: "mapping_not_found" });
      const posted = await handler(
        post(`/v1/boq/imports/${importId}/mappings`, text(WALLS_BODY), {
          "content-type": "application/json",
        }),
      );
      const latest = await handler(get(`/v1/boq/imports/${importId}/mappings`));
      expect(latest.status).toBe(200);
      expect(latest.headers.get("x-request-id")).toBe(REQUEST_ID);
      expect(await latest.text()).toBe(await posted.text());
    });
  });

  test("400 invalid_import_id for malformed ids", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(get("/v1/boq/imports/not-an-id/mappings"));
      expect(response.status).toBe(400);
      expect(await body(response)).toMatchObject({ ok: false, error: "invalid_import_id" });
    });
  });
});

describe("POST /v1/boq/imports/:id/mappings/manual", () => {
  test("200: manual decision -> v2; v1 still readable and untouched", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await preparedImport(handler);
      const posted = await handler(
        post(`/v1/boq/imports/${importId}/mappings`, text(WALLS_BODY), {
          "content-type": "application/json",
        }),
      );
      const v1 = (await body(posted)) as unknown as MappingResponse;
      const target = v1.mapping.entries[1]!;
      const manual = await handler(
        post(
          `/v1/boq/imports/${importId}/mappings/manual`,
          text(
            JSON.stringify({
              entryId: target.entryId,
              targets: [{ nodeId: "beam-9", spacePath: ["Ground Floor"] }],
              note: "beam over the ground-floor entrance",
            }),
          ),
          { "content-type": "application/json" },
        ),
      );
      expect(manual.status).toBe(200);
      const parsed = (await body(manual)) as unknown as MappingResponse;
      expect(parsed.mapping.version).toBe(2);
      expect(parsed.mapping.entries[1]!.method).toBe("manual");
      expect(parsed.mapping.entries[1]!.status).toBe("mapped");
      expect(parsed.mapping.entries[1]!.confidence).toBe("high");
      expect(parsed.mapping.entries[1]!.targets[0]!.matchNote).toBe(
        "beam over the ground-floor entrance",
      );
      expect(parsed.stats).toEqual({
        mapped: 2,
        ambiguous: 0,
        unmapped: 0,
        byConfidence: { high: 1, medium: 1, low: 0, uncertain: 0 },
      });
      // Latest is v2; v1 is still readable with its ORIGINAL unresolved entry.
      const latest = (await (await handler(get(`/v1/boq/imports/${importId}/mappings`))).json()) as unknown as MappingResponse;
      expect(latest.mapping.version).toBe(2);
      const original = (await (
        await handler(get(`/v1/boq/imports/${importId}/mappings/v1`))
      ).json()) as unknown as MappingResponse;
      expect(original.mapping.version).toBe(1);
      expect(original.mapping.entries[1]!.method).toBe("unresolved");
      // v1 bytes on disk were not rewritten by the manual revision.
      const { readFileSync } = await import("node:fs");
      const stored = JSON.parse(
        readFileSync(join(root, "data", "boq", "mappings", sha256Hex(importId), "v001.json"), "utf8"),
      );
      expect(stored.version).toBe(1);
      expect(stored.entries[1].method).toBe("unresolved");
    });
  });

  test("422 entry_not_found; 400 invalid_manual_input; 404 mapping_not_found", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await preparedImport(handler);
      const noMapping = await handler(
        post(
          `/v1/boq/imports/${importId}/mappings/manual`,
          text(JSON.stringify({ entryId: "x", targets: [{ nodeId: "n" }] })),
          { "content-type": "application/json" },
        ),
      );
      expect(noMapping.status).toBe(404);
      expect(await body(noMapping)).toMatchObject({ ok: false, error: "mapping_not_found" });
      await handler(
        post(`/v1/boq/imports/${importId}/mappings`, text(WALLS_BODY), {
          "content-type": "application/json",
        }),
      );
      const badEntry = await handler(
        post(
          `/v1/boq/imports/${importId}/mappings/manual`,
          text(JSON.stringify({ entryId: "missing", targets: [{ nodeId: "n" }] })),
          { "content-type": "application/json" },
        ),
      );
      expect(badEntry.status).toBe(422);
      expect(await body(badEntry)).toMatchObject({ ok: false, error: "entry_not_found" });
      const badBody = await handler(
        post(`/v1/boq/imports/${importId}/mappings/manual`, text('{"entryId":"x"}'), {
          "content-type": "application/json",
        }),
      );
      expect(badBody.status).toBe(400);
      expect(await body(badBody)).toMatchObject({ ok: false, error: "invalid_manual_input" });
      const malformed = await handler(
        post(`/v1/boq/imports/${importId}/mappings/manual`, text("nope"), {
          "content-type": "application/json",
        }),
      );
      expect(malformed.status).toBe(400);
      expect(await body(malformed)).toMatchObject({ ok: false, error: "malformed_json" });
    });
  });

  test("405 GET on the manual subroute", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await preparedImport(handler);
      const response = await handler(get(`/v1/boq/imports/${importId}/mappings/manual`));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    });
  });
});

describe("GET /v1/boq/imports/:id/mappings/:version", () => {
  test("200 for v1 and aliases (1, v001); 404 unknown; 400 invalid; 405 POST", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await preparedImport(handler);
      await handler(
        post(`/v1/boq/imports/${importId}/mappings`, text(WALLS_BODY), {
          "content-type": "application/json",
        }),
      );
      for (const alias of ["v1", "1", "v001"]) {
        const response = await handler(get(`/v1/boq/imports/${importId}/mappings/${alias}`));
        expect(response.status).toBe(200);
        const parsed = (await body(response)) as unknown as MappingResponse;
        expect(parsed.mapping.version).toBe(1);
      }
      const unknown = await handler(get(`/v1/boq/imports/${importId}/mappings/v9`));
      expect(unknown.status).toBe(404);
      expect(await body(unknown)).toMatchObject({
        ok: false,
        error: "mapping_version_not_found",
        version: "9",
      });
      const invalid = await handler(get(`/v1/boq/imports/${importId}/mappings/latest`));
      expect(invalid.status).toBe(400);
      expect(await body(invalid)).toMatchObject({ ok: false, error: "invalid_mapping_version" });
      const zero = await handler(get(`/v1/boq/imports/${importId}/mappings/v0`));
      expect(zero.status).toBe(400);
      const wrongMethod = await handler(
        request(`/v1/boq/imports/${importId}/mappings/v1`, "POST"),
      );
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.headers.get("allow")).toBe("GET");
    });
  });
});

describe("wiring + coexistence", () => {
  test("lazy fallback wiring: no explicit normalization/mapping options -> 200", async () => {
    await withTempDir(async (root) => {
      const handler = lazyHandlerWith(root);
      const importId = await preparedImport(handler);
      const response = await handler(
        post(`/v1/boq/imports/${importId}/mappings`, text(WALLS_BODY), {
          "content-type": "application/json",
        }),
      );
      expect(response.status).toBe(200);
      const parsed = (await body(response)) as unknown as MappingResponse;
      expect(parsed.mapping.version).toBe(1);
      expect(parsed.stats.mapped).toBe(1);
    });
  });

  test("unknown BOQ subpaths still fall through to the server 404", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(get(`/v1/boq/imports/${UNKNOWN_IMPORT}/unknown-tail`));
      expect(response.status).toBe(404);
    });
  });

  test("pre-existing ingestion routes keep working alongside mappings", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await preparedImport(handler);
      await handler(
        post(`/v1/boq/imports/${importId}/mappings`, text(WALLS_BODY), {
          "content-type": "application/json",
        }),
      );
      const imports = await handler(get("/v1/boq/imports"));
      expect(imports.status).toBe(200);
      const parsed = (await body(imports)) as { imports: Array<{ importId: string }> };
      expect(parsed.imports.map((record) => record.importId)).toContain(importId);
      const source = await handler(get(`/v1/boq/imports/${importId}/source`));
      expect(source.status).toBe(200);
      expect(bytesEqual(new Uint8Array(await source.arrayBuffer()), BOQ_CSV)).toBe(true);
    });
  });
});
