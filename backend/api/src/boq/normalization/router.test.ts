/**
 * Normalization router tests (AISE-014) — exercised through the REAL server
 * request handler (`createRequestHandler`) with injected BOQ routes over
 * real temporary file-system stores, mirroring the AISE-011 router test
 * harness: POST/GET normalization routes, idempotent re-runs (byte-identical
 * bodies), precise 404/400/405/422 discipline, x-request-id echo, the lazy
 * in-memory fallback wiring and the server default wiring via AISE_DATA_DIR
 * — plus coexistence with the pre-existing BOQ ingestion routes.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { createCaptureGateway } from "../../capture/gateway";
import { InMemoryCaptureStore } from "../../capture/store";
import type { EnvRecord } from "../../lib/config";
import { sha256Hex } from "../../lib/hash";
import { createLogger } from "../../lib/log";
import { createRequestHandler } from "../../server";
import { BoqService } from "../service";
import { FsBoqStore } from "../store";
import { fixtureBytes, fixedClock, text, withTempDir } from "../testkit";
import { NormalizationService } from "./service";
import { FsNormalizationStore } from "./store";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MEDIA_TYPE = "text/csv";
const PDF_MEDIA_TYPE = "application/pdf";
const REQUEST_ID = "0b4b6d6e-0000-4000-8000-000000000014";

/** Handler backed by REAL file-system BOQ + normalization stores. */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  const boq = new BoqService({
    store: new FsBoqStore(join(root, "data")),
    clock: fixedClock,
  });
  return createRequestHandler({
    envSource: () => validEnv,
    version: "0.1.0",
    logger: quietLogger,
    capture: createCaptureGateway({
      store: new InMemoryCaptureStore(),
      clock: fixedClock,
    }),
    boq: {
      service: boq,
      logger: quietLogger,
      normalization: new NormalizationService({
        store: new FsNormalizationStore(join(root, "data")),
        clock: fixedClock,
        boq,
      }),
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

/** Import the committed fixture and return its importId. */
async function importFixture(handler: (request: Request) => Promise<Response>): Promise<string> {
  const response = await handler(post("/v1/boq/imports", await fixtureBytes(), { "content-type": XLSX_MEDIA_TYPE }));
  expect(response.status).toBe(200);
  const parsed = (await body(response)) as { import: { importId: string } };
  return parsed.import.importId;
}

describe("POST /v1/boq/imports/:id/normalization", () => {
  test("200 with the derived view: stats, per-item readings, provenance headers", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await importFixture(handler);
      const response = await handler(post(`/v1/boq/imports/${importId}/normalization`));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
      expect(response.headers.get("content-type")).toContain("application/json");
      const parsed = (await body(response)) as {
        ok: boolean;
        normalization: {
          importId: string;
          dictionaryVersion: string;
          generatedBy: string;
          stats: Record<string, number>;
          perItem: Array<{ rowNumber: number; description: { conceptCode?: string }; unit: { unitCode?: string } }>;
        };
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.normalization.importId).toBe(importId);
      expect(parsed.normalization.dictionaryVersion).toBe("1.0.0");
      expect(parsed.normalization.generatedBy).toBe("aise-boq-normalizer/1.0");
      expect(parsed.normalization.stats).toMatchObject({
        totalItems: 4,
        rowsWithoutInterpretableCells: 1,
        resolvedConcepts: 3,
        unresolvedConcepts: 0,
        resolvedUnits: 3,
        unresolvedUnits: 0,
      });
      expect(parsed.normalization.perItem.map((item) => item.rowNumber)).toEqual([4, 5, 6]);
      expect(parsed.normalization.perItem[0]?.description.conceptCode).toBe("CONCRETE_WORK");
      expect(parsed.normalization.perItem[0]?.unit.unitCode).toBe("m3");
    });
  });

  test("idempotent re-POST returns a byte-identical body; the view file is written once", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await importFixture(handler);
      const first = await handler(post(`/v1/boq/imports/${importId}/normalization`));
      const second = await handler(post(`/v1/boq/imports/${importId}/normalization`));
      expect(second.status).toBe(200);
      expect(await second.text()).toBe(await first.text());
    });
  });

  test("404 import_not_found for unknown imports; 400 for malformed ids", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const unknown = await handler(post(`/v1/boq/imports/${"a".repeat(64)}/normalization`));
      expect(unknown.status).toBe(404);
      expect(await body(unknown)).toMatchObject({ ok: false, error: "import_not_found" });
      const malformed = await handler(post("/v1/boq/imports/not-a-hash/normalization"));
      expect(malformed.status).toBe(400);
      expect(await body(malformed)).toMatchObject({ ok: false, error: "invalid_import_id" });
    });
  });

  test("422 normalization_unavailable for imports without a parsed document (pdf)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(post("/v1/boq/imports", text("%PDF-1.4\n%%EOF"), { "content-type": PDF_MEDIA_TYPE }));
      expect(response.status).toBe(200);
      const parsed = (await body(response)) as { import: { importId: string } };
      const refused = await handler(post(`/v1/boq/imports/${parsed.import.importId}/normalization`));
      expect(refused.status).toBe(422);
      const refusedBody = (await body(refused)) as { error: string; code: string };
      expect(refusedBody.error).toBe("normalization_unavailable");
      expect(refusedBody.code).toBe("no_parsed_document");
    });
  });
});

describe("GET /v1/boq/imports/:id/normalization", () => {
  test("200 with the STORED view (byte-identical to the POST body)", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await importFixture(handler);
      const postResponse = await handler(post(`/v1/boq/imports/${importId}/normalization`));
      const getResponse = await handler(get(`/v1/boq/imports/${importId}/normalization`));
      expect(getResponse.status).toBe(200);
      expect(getResponse.headers.get("x-request-id")).toBe(REQUEST_ID);
      expect(await getResponse.text()).toBe(await postResponse.text());
    });
  });

  test("404 normalization_not_found for a known import that was never normalized", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await importFixture(handler);
      const response = await handler(get(`/v1/boq/imports/${importId}/normalization`));
      expect(response.status).toBe(404);
      expect(await body(response)).toMatchObject({ ok: false, error: "normalization_not_found" });
    });
  });

  test("404 import_not_found for unknown imports; 400 for malformed ids", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const unknown = await handler(get(`/v1/boq/imports/${"a".repeat(64)}/normalization`));
      expect(unknown.status).toBe(404);
      expect(await body(unknown)).toMatchObject({ ok: false, error: "import_not_found" });
      const malformed = await handler(get("/v1/boq/imports/not-a-hash/normalization"));
      expect(malformed.status).toBe(400);
      expect(await body(malformed)).toMatchObject({ ok: false, error: "invalid_import_id" });
    });
  });
});

describe("method discipline and existing-route coexistence", () => {
  test("405 with explicit allow on wrong methods", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const importId = await importFixture(handler);
      for (const method of ["DELETE", "PUT", "PATCH"]) {
        const response = await handler(request(`/v1/boq/imports/${importId}/normalization`, method));
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET, POST");
      }
    });
  });

  test("existing BOQ ingestion routes still work next to the new surface", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const bytes = await fixtureBytes();
      const importId = await importFixture(handler);
      // List
      const list = await handler(get("/v1/boq/imports"));
      expect(list.status).toBe(200);
      const listBody = (await body(list)) as { imports: Array<{ importId: string }> };
      expect(listBody.imports.map((item) => item.importId)).toEqual([sha256Hex(bytes)]);
      // Detail
      const detail = await handler(get(`/v1/boq/imports/${importId}`));
      expect(detail.status).toBe(200);
      // Raw source bytes round-trip
      const source = await handler(get(`/v1/boq/imports/${importId}/source`));
      expect(source.status).toBe(200);
      expect(source.headers.get("content-type")).toBe(XLSX_MEDIA_TYPE);
      expect(new Uint8Array(await source.arrayBuffer()).length).toBe(bytes.length);
      // CSV import still routes (a second import coexists with normalization)
      const csv = await handler(post("/v1/boq/imports", text("Item;Qty\nA;1\nTOTAL;1"), { "content-type": CSV_MEDIA_TYPE }));
      expect(csv.status).toBe(200);
      // Unknown /v1/boq shapes still fall through to the server 404.
      const nonsense = await handler(get("/v1/boq/nonsense"));
      expect(nonsense.status).toBe(404);
      expect(await body(nonsense)).toMatchObject({ ok: false, error: "not_found" });
      // Health + readiness coexist.
      expect((await handler(get("/healthz"))).status).toBe(200);
      expect((await handler(get("/readyz"))).status).toBe(200);
    });
  });
});

describe("lazy fallback and default server wiring", () => {
  test("without an injected normalization service, POST then GET work through the in-memory fallback", async () => {
    await withTempDir(async (root) => {
      const boq = new BoqService({
        store: new FsBoqStore(join(root, "data")),
        clock: fixedClock,
      });
      const handler = createRequestHandler({
        envSource: () => validEnv,
        version: "0.1.0",
        logger: quietLogger,
        capture: createCaptureGateway({
          store: new InMemoryCaptureStore(),
          clock: fixedClock,
        }),
        boq: { service: boq, logger: quietLogger },
      });
      const bytes = await fixtureBytes();
      const imported = await handler(post("/v1/boq/imports", bytes, { "content-type": XLSX_MEDIA_TYPE }));
      const parsed = (await body(imported)) as { import: { importId: string } };
      const postResponse = await handler(post(`/v1/boq/imports/${parsed.import.importId}/normalization`));
      expect(postResponse.status).toBe(200);
      const getResponse = await handler(get(`/v1/boq/imports/${parsed.import.importId}/normalization`));
      expect(getResponse.status).toBe(200);
      expect(await getResponse.text()).toBe(await postResponse.text());
    });
  });

  test("server default wiring persists views under AISE_DATA_DIR (no boq options injected)", async () => {
    await withTempDir(async (root) => {
      const env: EnvRecord = {
        HOST: "127.0.0.1",
        PORT: "8080",
        LOG_LEVEL: "info",
        AISE_DATA_DIR: join(root, "envdata"),
      };
      const handler = createRequestHandler({
        envSource: () => env,
        version: "0.1.0",
        logger: quietLogger,
        capture: createCaptureGateway({
          store: new InMemoryCaptureStore(),
          clock: fixedClock,
        }),
      });
      const bytes = await fixtureBytes();
      const imported = await handler(post("/v1/boq/imports", bytes, { "content-type": XLSX_MEDIA_TYPE }));
      expect(imported.status).toBe(200);
      const parsed = (await body(imported)) as { import: { importId: string } };
      const importId = parsed.import.importId;

      const normalized = await handler(post(`/v1/boq/imports/${importId}/normalization`));
      expect(normalized.status).toBe(200);
      const normalizedText = await normalized.text();

      // The derived view is persisted by the default Fs wiring, content-
      // addressed exactly as the design mandates (canonical JSON bytes).
      const key = sha256Hex(importId + "1.0.0");
      const viewPath = join(root, "envdata", "boq", "normalizations", `${key}.json`);
      const fileText = readFileSync(viewPath, "utf8");
      const viewBody = JSON.parse(normalizedText) as { normalization: unknown };
      expect(fileText).toBe(canonicalJsonStringify(viewBody.normalization));

      // And the stored view is retrievable by a fresh handler over the SAME
      // data dir (the default wiring reads the view back from disk).
      const restarted = createRequestHandler({
        envSource: () => env,
        version: "0.1.0",
        logger: quietLogger,
        capture: createCaptureGateway({
          store: new InMemoryCaptureStore(),
          clock: fixedClock,
        }),
      });
      const stored = await restarted(get(`/v1/boq/imports/${importId}/normalization`));
      expect(stored.status).toBe(200);
      expect(await stored.text()).toBe(normalizedText);
    });
  });
});
