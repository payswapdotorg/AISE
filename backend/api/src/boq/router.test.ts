/**
 * BOQ router tests (AISE-011) — exercised through the REAL server request
 * handler (`createRequestHandler`) with injected BOQ routes over a real
 * temporary file-system store, plus the full capture wiring to prove the
 * delegation block coexists with the capture surface.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import type { EnvRecord } from "../lib/config";
import { bytesEqual, sha256Hex } from "../lib/hash";
import { createLogger } from "../lib/log";
import { BoqService } from "./service";
import { FsBoqStore } from "./store";
import { createRequestHandler } from "../server";
import { fixtureBytes, fixedClock, text, withTempDir } from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MEDIA_TYPE = "text/csv";
const PDF_MEDIA_TYPE = "application/pdf";
const REQUEST_ID = "0b4b6d6e-0000-4000-8000-000000000011";

/** Handler backed by the REAL file-system BOQ store rooted at `root`. */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: "0.1.0",
    logger: quietLogger,
    capture: createCaptureGateway({
      store: new InMemoryCaptureStore(),
      clock: fixedClock,
    }),
    boq: {
      service: new BoqService({
        store: new FsBoqStore(join(root, "data")),
        clock: fixedClock,
      }),
      logger: quietLogger,
    },
  });
}

function post(path: string, bytes: Uint8Array, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: bytes,
    headers: { "x-request-id": REQUEST_ID, ...headers },
  });
}

function get(path: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { "x-request-id": REQUEST_ID, ...headers },
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("POST /v1/boq/imports", () => {
  test("xlsx fixture: 200 with the full import envelope + document", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const bytes = await fixtureBytes();
      const response = await handler(
        post("/v1/boq/imports", bytes, { "content-type": XLSX_MEDIA_TYPE }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
      expect(response.headers.get("content-type")).toContain("application/json");
      const parsed = (await body(response)) as {
        ok: boolean;
        import: {
          importId: string;
          source: { mediaType: string; byteSize: number; importedAt: string };
          format: string;
          parse: {
            status: string;
            document: {
              sheets: Array<{
                name: string;
                dimension: string;
                mergedRanges: string[];
                sections: Array<{ headerCells: string[]; totalRows: number[] }>;
              }>;
            };
          };
        };
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.import.importId).toBe(sha256Hex(bytes));
      expect(parsed.import.format).toBe("xlsx");
      expect(parsed.import.source.mediaType).toBe(XLSX_MEDIA_TYPE);
      expect(parsed.import.source.importedAt).toBe(fixedClock());
      expect(parsed.import.parse.status).toBe("parsed");
      const sheet = parsed.import.parse.document.sheets[0]!;
      expect(sheet.name).toBe("Substructure");
      expect(sheet.dimension).toBe("A1:G7");
      expect(sheet.mergedRanges).toEqual(["A1:F1"]);
      expect(sheet.sections[0]!.headerCells).toEqual(["A2", "B2", "C2", "D2", "E2", "F2", "G2"]);
      expect(sheet.sections[0]!.totalRows).toEqual([7]);
    });
  });

  test("csv upload via content-type", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(
        post("/v1/boq/imports", text("Item;Qty\nA;1\nTOTAL;1"), { "content-type": CSV_MEDIA_TYPE }),
      );
      expect(response.status).toBe(200);
      const parsed = (await body(response)) as {
        import: { format: string; parse: { document: { sheets: Array<{ name: string }> } } };
      };
      expect(parsed.import.format).toBe("csv");
      expect(parsed.import.parse.document.sheets[0]!.name).toBe("csv");
    });
  });

  test("pdf blob: 200 with unsupported_format + reason (source preserved)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const pdf = text("%PDF-1.4\n%%EOF");
      const response = await handler(post("/v1/boq/imports", pdf, { "content-type": PDF_MEDIA_TYPE }));
      expect(response.status).toBe(200);
      const parsed = (await body(response)) as {
        import: { parse: { status: string; reason: string }; importId: string };
      };
      expect(parsed.import.parse.status).toBe("unsupported_format");
      expect(parsed.import.parse.reason).toContain("pdf_text_extraction_not_implemented");
      // Source retrievable byte-for-byte with the original media type.
      const sourceResponse = await handler(
        get(`/v1/boq/imports/${parsed.import.importId}/source`),
      );
      expect(sourceResponse.status).toBe(200);
      expect(sourceResponse.headers.get("content-type")).toBe(PDF_MEDIA_TYPE);
      expect(bytesEqual(new Uint8Array(await sourceResponse.arrayBuffer()), pdf)).toBe(true);
    });
  });

  test("?format= override beats an unusable content-type", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(
        post("/v1/boq/imports?format=csv", text("a,b\n1,2"), { "content-type": "text/plain" }),
      );
      expect(response.status).toBe(200);
      const parsed = (await body(response)) as { import: { format: string } };
      expect(parsed.import.format).toBe("csv");
    });
  });

  test("415 for unsupported media types; 400 for invalid override", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const unsupported = await handler(
        post("/v1/boq/imports", text("hello"), { "content-type": "text/plain" }),
      );
      expect(unsupported.status).toBe(415);
      expect(await body(unsupported)).toMatchObject({ ok: false, error: "unsupported_media_type" });
      const noType = await handler(
        new Request("http://localhost/v1/boq/imports", {
          method: "POST",
          body: text("hello"),
          headers: { "x-request-id": REQUEST_ID },
        }),
      );
      expect(noType.status).toBe(415);
      const badOverride = await handler(
        post("/v1/boq/imports?format=docx", text("x"), { "content-type": "text/plain" }),
      );
      expect(badOverride.status).toBe(400);
      expect(await body(badOverride)).toMatchObject({ ok: false, error: "invalid_format" });
    });
  });

  test("corrupt xlsx bytes: 422 boq_parse_failed with the failing part", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(
        post("/v1/boq/imports", new Uint8Array(64).fill(0x07), { "content-type": XLSX_MEDIA_TYPE }),
      );
      expect(response.status).toBe(422);
      const parsed = await body(response);
      expect(parsed.error).toBe("boq_parse_failed");
      expect(String(parsed.part)).toBe("zip:end-of-central-directory");
    });
  });

  test("idempotent re-upload: identical importId, same body", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const bytes = await fixtureBytes();
      const first = await handler(post("/v1/boq/imports", bytes, { "content-type": XLSX_MEDIA_TYPE }));
      const second = await handler(post("/v1/boq/imports", bytes, { "content-type": XLSX_MEDIA_TYPE }));
      expect(await first.text()).toBe(await second.text());
    });
  });
});

describe("GET /v1/boq/imports (list, detail, source)", () => {
  test("list is ordered and complete; detail and source round-trip", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const xlsx = await fixtureBytes();
      const csv = text("Item,Qty\nA,1\nTotal,1");
      await handler(post("/v1/boq/imports", xlsx, { "content-type": XLSX_MEDIA_TYPE }));
      await handler(post("/v1/boq/imports", csv, { "content-type": CSV_MEDIA_TYPE }));

      const listResponse = await handler(get("/v1/boq/imports"));
      expect(listResponse.status).toBe(200);
      const list = (await body(listResponse)) as { ok: boolean; imports: Array<{ importId: string }> };
      expect(list.ok).toBe(true);
      expect(list.imports.length).toBe(2);
      expect(list.imports.map((item) => item.importId)).toEqual(
        [sha256Hex(xlsx), sha256Hex(csv)].sort(),
      );

      const importId = sha256Hex(xlsx);
      const detailResponse = await handler(get(`/v1/boq/imports/${importId}`));
      expect(detailResponse.status).toBe(200);
      const detail = (await body(detailResponse)) as {
        import: { importId: string; parse: { status: string } };
      };
      expect(detail.import.importId).toBe(importId);
      expect(detail.import.parse.status).toBe("parsed");

      const sourceResponse = await handler(get(`/v1/boq/imports/${importId}/source`));
      expect(sourceResponse.status).toBe(200);
      expect(sourceResponse.headers.get("content-type")).toBe(XLSX_MEDIA_TYPE);
      expect(sourceResponse.headers.get("x-request-id")).toBe(REQUEST_ID);
      expect(bytesEqual(new Uint8Array(await sourceResponse.arrayBuffer()), xlsx)).toBe(true);
    });
  });

  test("404 for unknown imports; 400 for malformed ids", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const unknown = await handler(get(`/v1/boq/imports/${"a".repeat(64)}`));
      expect(unknown.status).toBe(404);
      expect(await body(unknown)).toMatchObject({ ok: false, error: "import_not_found" });
      const unknownSource = await handler(get(`/v1/boq/imports/${"a".repeat(64)}/source`));
      expect(unknownSource.status).toBe(404);
      const malformed = await handler(get("/v1/boq/imports/not-a-hash"));
      expect(malformed.status).toBe(400);
      expect(await body(malformed)).toMatchObject({ ok: false, error: "invalid_import_id" });
    });
  });

  test("unknown /v1/boq/... shapes fall through to the server 404", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(get("/v1/boq/nonsense"));
      expect(response.status).toBe(404);
      expect(await body(response)).toMatchObject({ ok: false, error: "not_found" });
    });
  });
});

describe("method discipline and coexistence with capture routes", () => {
  test("405 with explicit allow on wrong methods", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const deleteResponse = await handler(
        new Request("http://localhost/v1/boq/imports", {
          method: "DELETE",
          headers: { "x-request-id": REQUEST_ID },
        }),
      );
      expect(deleteResponse.status).toBe(405);
      expect(deleteResponse.headers.get("allow")).toBe("GET, POST");
      const putResponse = await handler(
        new Request(`http://localhost/v1/boq/imports/${"a".repeat(64)}`, {
          method: "PUT",
          headers: { "x-request-id": REQUEST_ID },
        }),
      );
      expect(putResponse.status).toBe(405);
      expect(putResponse.headers.get("allow")).toBe("GET");
    });
  });

  test("capture health + readiness still route; x-request-id echoed everywhere", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const health = await handler(get("/healthz"));
      expect(health.status).toBe(200);
      expect(health.headers.get("x-request-id")).toBe(REQUEST_ID);
      const ready = await handler(get("/readyz"));
      expect(ready.status).toBe(200);
      const unknown = await handler(get("/v1/capture/unknown"));
      expect(unknown.status).toBe(404);
    });
  });
});

/* ---------------- PROD-010: GET /v1/boq/imports/:id/lens ---------------- */

/** Encode a JSON request body as bytes (the `post` helper takes Uint8Array). */
function jsonText(value: unknown): Uint8Array {
  return text(JSON.stringify(value));
}

/** A small deterministic GHS finishes BOQ (3 item rows; header + TOTAL row). */
const LENS_CSV =
  "Description,Unit,Qty,Rate (GHS),Amount (GHS)\n" +
  "Plaster to internal walls,m2,220,12.5,2750\n" +
  "Painting to walls and ceilings,m2,220,8,1760\n" +
  "Vinyl floor tiling to floors,m2,60,45,2700\n" +
  "TOTAL,,,480,,7210\n";

/** A tiny reality snapshot the matcher can ground the three rows against. */
const LENS_SNAPSHOT = {
  nodes: [
    {
      nodeId: "node-wall-gf",
      kind: "element",
      properties: [{ key: "semantic.kind", value: "wall" }],
      spacePath: ["Demo Site", "Building 1", "Ground Floor"],
      nodeVersionId: "v001",
    },
    {
      nodeId: "node-ceiling-gf",
      kind: "element",
      properties: [{ key: "semantic.kind", value: "ceiling" }],
      spacePath: ["Demo Site", "Building 1", "Ground Floor"],
      nodeVersionId: "v001",
    },
    {
      nodeId: "node-floor-gf",
      kind: "element",
      properties: [{ key: "semantic.kind", value: "floor" }],
      spacePath: ["Demo Site", "Building 1", "Ground Floor"],
      nodeVersionId: "v001",
    },
  ],
};

interface LensItemShape {
  itemId: string;
  rowNumber: number;
  originalText: string;
  descriptionCellRef: string | null;
  unitCellRef: string | null;
  unitText: string | null;
  currency: string;
  quantity: { cellRef: string | null; value: number } | null;
  rate: { cellRef: string | null; value: number } | null;
  amount: { cellRef: string | null; value: number } | null;
  interpretation?: {
    description: { conceptCode?: string; originalText: string } | null;
    unit: { unitCode?: string; originalText: string } | null;
  };
  mapping?: { entryId: string; status: string; targets: { nodeId: string }[] };
}

interface LensShape {
  importId: string;
  sourceName: string;
  dictionaryVersion: string | null;
  mappingVersion: number | null;
  sourceCellRefs: string[];
  items: LensItemShape[];
}

async function importLensCsv(
  handler: (request: Request) => Promise<Response>,
): Promise<string> {
  const response = await handler(
    post("/v1/boq/imports", text(LENS_CSV), { "content-type": CSV_MEDIA_TYPE }),
  );
  expect(response.status).toBe(200);
  const parsed = (await body(response)) as { import: { importId: string } };
  return parsed.import.importId;
}

describe("GET /v1/boq/imports/:id/lens — the joined lens input (PROD-010)", () => {
  test("happy path: verbatim rows + stored interpretation + latest mapping joined", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await importLensCsv(handler);
      // The derived view + one mapping version through the REAL routes.
      expect(
        (await handler(post(`/v1/boq/imports/${importId}/normalization`, text(""), {
          "content-type": "application/json",
        }))).status,
      ).toBe(200);
      const mapped = await handler(
        post(`/v1/boq/imports/${importId}/mappings`, jsonText(LENS_SNAPSHOT), {
          "content-type": "application/json",
        }),
      );
      expect(mapped.status).toBe(200);
      expect(((await body(mapped)) as { mapping: { version: number } }).mapping.version).toBe(1);

      const response = await handler(get(`/v1/boq/imports/${importId}/lens`));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      const parsed = (await body(response)) as { ok: boolean; lens: LensShape };
      expect(parsed.ok).toBe(true);
      const lens = parsed.lens;
      expect(lens.importId).toBe(importId);
      expect(lens.sourceName).toBe("boq-import.csv");
      expect(lens.dictionaryVersion).toBe("1.0.0");
      expect(lens.mappingVersion).toBe(1);
      // The provenance-resolution universe: every non-empty source cell.
      for (const ref of ["csv!A1", "csv!E1", "csv!A2", "csv!E4", "csv!A5"]) {
        expect(lens.sourceCellRefs).toContain(ref);
      }
      expect(lens.items.length).toBe(3);

      const first = lens.items[0]!;
      expect(first.rowNumber).toBe(2);
      expect(first.originalText).toBe("Plaster to internal walls");
      expect(first.descriptionCellRef).toBe("csv!A2");
      expect(first.unitCellRef).toBe("csv!B2");
      expect(first.unitText).toBe("m2");
      expect(first.currency).toBe("GHS");
      expect(first.quantity).toEqual({ cellRef: "csv!C2", value: 220 });
      expect(first.rate).toEqual({ cellRef: "csv!D2", value: 12.5 });
      expect(first.amount).toEqual({ cellRef: "csv!E2", value: 2750 });
      // The stored interpretation (AISE-014) joined verbatim.
      expect(first.interpretation?.description?.conceptCode).toBe("PLASTERING");
      expect(first.interpretation?.unit?.unitCode).toBe("m2");
      // The latest mapping entry (AISE-017) joined by the shared row identity.
      expect(first.mapping?.entryId).toBe(first.itemId);
      expect(first.mapping?.status).toBe("mapped");
      expect(first.mapping?.targets.length).toBeGreaterThan(0);
      expect(["node-wall-gf", "node-ceiling-gf"]).toContain(first.mapping?.targets[0]?.nodeId ?? "");
      expect(lens.items.map((item) => item.itemId)).toEqual([
        lens.items[0]!.itemId,
        lens.items[1]!.itemId,
        lens.items[2]!.itemId,
      ]);
      expect(new Set(lens.items.map((item) => item.itemId)).size).toBe(3);
    });
  });

  test("unknown import -> 404 import_not_found (honest nothing)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(get(`/v1/boq/imports/${sha256Hex("no-such-import")}/lens`));
      expect(response.status).toBe(404);
      expect(((await body(response)) as { error: string }).error).toBe("import_not_found");
    });
  });

  test("import without a stored normalization -> 409 normalization_required (nothing fabricated)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await importLensCsv(handler);
      const response = await handler(get(`/v1/boq/imports/${importId}/lens`));
      expect(response.status).toBe(409);
      const parsed = (await body(response)) as { error: string; detail: string };
      expect(parsed.error).toBe("normalization_required");
      expect(parsed.detail).toContain("normalization");
    });
  });

  test("no stored mapping -> the honest EMPTY JOIN (200, mappingVersion null, no mapping members)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await importLensCsv(handler);
      expect(
        (await handler(post(`/v1/boq/imports/${importId}/normalization`, text(""), {
          "content-type": "application/json",
        }))).status,
      ).toBe(200);
      const response = await handler(get(`/v1/boq/imports/${importId}/lens`));
      expect(response.status).toBe(200);
      const parsed = (await body(response)) as { lens: LensShape };
      expect(parsed.lens.mappingVersion).toBe(null);
      expect(parsed.lens.items.length).toBe(3);
      for (const item of parsed.lens.items) {
        expect(item.mapping).toBeUndefined();
        // The interpretation join is INDEPENDENT of the mapping join.
        expect(item.interpretation?.description?.originalText).toBe(item.originalText);
      }
    });
  });

  test("wrong method on the lens route -> 405 with allow GET", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await importLensCsv(handler);
      const response = await handler(
        post(`/v1/boq/imports/${importId}/lens`, text(""), { "content-type": "application/json" }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
    });
  });
});
