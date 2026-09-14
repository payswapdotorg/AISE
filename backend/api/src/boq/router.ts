/**
 * BOQ HTTP surface — ingestion transport (AISE-011) plus the derived
 * normalization transport (AISE-014), both adapters over policy engines
 * (`BoqService`, `NormalizationService`) injected via `BoqRouteOptions`.
 *
 * Contract (spec/work-orders.md §011 + §014; spec/requirements.md R8):
 *
 *   POST /v1/boq/imports[?format=xlsx|csv|pdf]
 *       Raw-body upload of ONE BOQ source. The format comes from the
 *       request Content-Type (`text/csv`,
 *       `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
 *       `application/pdf`) or the `?format=` override (which wins). An
 *       invalid override value -> 400 `invalid_format`; a missing or
 *       unsupported media type without an override -> 415 with the stable
 *       code `unsupported_media_type`. The source bytes are stored
 *       content-addressed BEFORE parsing; the response is the full
 *       `BoqImport` envelope (document included for parsed formats),
 *       serialized as canonical JSON. Idempotent: identical bytes ->
 *       identical importId, no duplication.
 *
 *   GET  /v1/boq/imports              -> all imports (ordered by importId)
 *   GET  /v1/boq/imports/:id          -> one import + document
 *   GET  /v1/boq/imports/:id/source   -> the RAW preserved bytes with the
 *                                        ORIGINAL media type (R8: the source
 *                                        of any derived claim is retrievable)
 *
 *   POST /v1/boq/imports/:id/normalization  -> run the DERIVED normalization
 *                                        (idempotent, write-once) and return
 *                                        the explicit-interpretation view
 *                                        (AISE-014). The source BOQ is never
 *                                        changed; numbers are never touched.
 *   GET  /v1/boq/imports/:id/normalization  -> the STORED derived view or 404
 *                                        (`normalization_not_found`; unknown
 *                                        imports answer `import_not_found`).
 *
 * HTTP STATUS MAPPING — the single place for this translation:
 *
 *   successful ingest               -> 200 (canonical-JSON import envelope)
 *   BoqParseError (corrupt bytes of
 *   a supported format)             -> 422 `boq_parse_failed` + failing `part`
 *   other BoqError                  -> 500 `boq_store_error` + `part`
 *   bad format / media type         -> 400 `invalid_format` / 415 `unsupported_media_type`
 *   malformed :id                   -> 400 `invalid_import_id`
 *   unknown import                  -> 404 `import_not_found`
 *   normalization of an un-parsed
 *   import (the PDF known limit)    -> 422 `normalization_unavailable` + `code`
 *   stored view missing (GET)       -> 404 `normalization_not_found`
 *
 * Sources stored but left unrecorded (parse failed) keep their bytes and
 * sidecar on disk — preservation is unconditional; visibility requires a
 * parse outcome. Every response carries `x-request-id`; wrong methods on
 * a known route shape get 405 with an explicit `allow`; non-BOQ paths
 * return null so the server-wide 404 applies.
 */

import { canonicalJsonStringify, contentIdSchema } from "@aise/shared-contracts";
import { jsonResponse, jsonTextResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import { BoqError, BoqParseError, type BoqFormat } from "./model";
import { NormalizationService, NormalizationServiceError } from "./normalization/service";
import { InMemoryNormalizationStore } from "./normalization/store";
import type { BoqService } from "./service";

export interface BoqRouteOptions {
  /** BOQ ingestion service (policy engine over an injected store). */
  readonly service: BoqService;
  /** Structured logger for domain-level request events. */
  readonly logger: Logger;
  /**
   * Derived normalization surface (AISE-014). Optional: when absent, a
   * fallback service over an IN-MEMORY derived-view store and the same
   * `service` is constructed lazily (memoized per options object) — the
   * server's default wiring injects the file-system store instead, so
   * persistence is the norm in deployments.
   */
  readonly normalization?: NormalizationService;
}

const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MEDIA_TYPE = "text/csv";
const PDF_MEDIA_TYPE = "application/pdf";
const SUPPORTED_MEDIA_TYPES: readonly string[] = [XLSX_MEDIA_TYPE, CSV_MEDIA_TYPE, PDF_MEDIA_TYPE];

/** Media type (parameters stripped, lowercased) -> format; null otherwise. */
function mediaTypeToFormat(header: string | null): BoqFormat | null {
  const mediaType = header === null ? "" : (header.split(";")[0] ?? "").trim().toLowerCase();
  switch (mediaType) {
    case XLSX_MEDIA_TYPE:
      return "xlsx";
    case CSV_MEDIA_TYPE:
      return "csv";
    case PDF_MEDIA_TYPE:
      return "pdf";
    default:
      return null;
  }
}

/** The media type recorded in the source sidecar for this request. */
function effectiveMediaType(request: Request, url: URL, format: BoqFormat): string {
  if (url.searchParams.get("format") !== null) {
    // Format came from the override; record the matching canonical media
    // type so the sidecar stays self-describing.
    return format === "xlsx" ? XLSX_MEDIA_TYPE : format === "csv" ? CSV_MEDIA_TYPE : PDF_MEDIA_TYPE;
  }
  const header = request.headers.get("content-type");
  return header === null ? "application/octet-stream" : (header.split(";")[0] ?? "").trim().toLowerCase();
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

// AISE-014: lazily-constructed default normalization service, memoized per
// options object (never module-global, so handlers never share state).
// Explicit construction wins; the fallback keeps derived views in memory
// only — the server's default wiring injects the Fs store instead.
const normalizationFallbacks = new WeakMap<BoqRouteOptions, NormalizationService>();

function normalizationOrDefault(options: BoqRouteOptions): NormalizationService {
  if (options.normalization !== undefined) {
    return options.normalization;
  }
  let fallback = normalizationFallbacks.get(options);
  if (fallback === undefined) {
    fallback = new NormalizationService({
      store: new InMemoryNormalizationStore(),
      clock: () => new Date().toISOString(),
      boq: options.service,
    });
    normalizationFallbacks.set(options, fallback);
  }
  return fallback;
}

/**
 * Route and answer one request against the BOQ surface. Returns null when
 * the path is not a BOQ route (the server then answers 404).
 */
export async function handleBoqRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: BoqRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "boq") {
    return null;
  }
  const { service, logger } = options;

  /* /v1/boq/imports — collection ---------------------------------------- */

  if (segments.length === 3 && segments[2] === "imports") {
    if (request.method === "POST") {
      // Format resolution: `?format=` override first, then Content-Type.
      const override = url.searchParams.get("format");
      let format: BoqFormat;
      if (override !== null) {
        const normalized = override.trim().toLowerCase();
        if (normalized !== "xlsx" && normalized !== "csv" && normalized !== "pdf") {
          return jsonResponse(400, { ok: false, error: "invalid_format", format: override }, requestId);
        }
        format = normalized;
      } else {
        const fromHeader = mediaTypeToFormat(request.headers.get("content-type"));
        if (fromHeader === null) {
          return jsonResponse(
            415,
            {
              ok: false,
              error: "unsupported_media_type",
              mediaType: request.headers.get("content-type") ?? null,
              supportedMediaTypes: SUPPORTED_MEDIA_TYPES,
            },
            requestId,
          );
        }
        format = fromHeader;
      }
      const bytes = new Uint8Array(await request.arrayBuffer());
      try {
        const imported = await service.importSource(
          bytes,
          effectiveMediaType(request, url, format),
          format,
        );
        logger.info("boq_import", {
          requestId,
          importId: imported.importId,
          format: imported.format,
          byteSize: imported.source.byteSize,
          status: imported.parse.status,
        });
        return jsonTextResponse(200, canonicalJsonStringify({ ok: true, import: imported }), requestId);
      } catch (error) {
        if (error instanceof BoqParseError) {
          logger.warn("boq_parse_failed", {
            requestId,
            part: error.part,
            detail: error.detail,
            byteSize: bytes.length,
          });
          return jsonResponse(
            422,
            { ok: false, error: "boq_parse_failed", part: error.part, detail: error.detail },
            requestId,
          );
        }
        if (error instanceof BoqError) {
          logger.error("boq_store_error", { requestId, part: error.part, detail: error.detail });
          return jsonResponse(
            500,
            { ok: false, error: "boq_store_error", part: error.part, detail: error.detail },
            requestId,
          );
        }
        throw error;
      }
    }
    if (request.method === "GET") {
      const imports = await service.listImports();
      logger.info("boq_imports_listed", { requestId, count: imports.length });
      return jsonTextResponse(200, canonicalJsonStringify({ ok: true, imports }), requestId);
    }
    return methodNotAllowed(requestId, "GET, POST");
  }

  /* /v1/boq/imports/:id — one import ------------------------------------ */

  if (segments.length === 4 && segments[2] === "imports") {
    const importId = segments[3] ?? "";
    if (!contentIdSchema.safeParse(importId).success) {
      return jsonResponse(400, { ok: false, error: "invalid_import_id" }, requestId);
    }
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    const imported = await service.getImport(importId);
    if (imported === null) {
      return jsonResponse(404, { ok: false, error: "import_not_found" }, requestId);
    }
    logger.info("boq_import_read", { requestId, importId });
    return jsonTextResponse(200, canonicalJsonStringify({ ok: true, import: imported }), requestId);
  }

  /* /v1/boq/imports/:id/source — raw preserved bytes -------------------- */

  if (segments.length === 5 && segments[2] === "imports" && segments[4] === "source") {
    const importId = segments[3] ?? "";
    if (!contentIdSchema.safeParse(importId).success) {
      return jsonResponse(400, { ok: false, error: "invalid_import_id" }, requestId);
    }
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    const source = await service.getSource(importId);
    if (source === null) {
      return jsonResponse(404, { ok: false, error: "import_not_found" }, requestId);
    }
    logger.info("boq_source_read", { requestId, importId, byteSize: source.bytes.length });
    return new Response(new Uint8Array(source.bytes), {
      status: 200,
      headers: {
        "content-type": source.mediaType,
        "x-request-id": requestId,
      },
    });
  }

  /* /v1/boq/imports/:id/normalization — derived view (AISE-014) --------- */

  if (segments.length === 5 && segments[2] === "imports" && segments[4] === "normalization") {
    const importId = segments[3] ?? "";
    if (!contentIdSchema.safeParse(importId).success) {
      return jsonResponse(400, { ok: false, error: "invalid_import_id" }, requestId);
    }
    if (request.method !== "POST" && request.method !== "GET") {
      return methodNotAllowed(requestId, "GET, POST");
    }
    const normalization = normalizationOrDefault(options);

    if (request.method === "POST") {
      // Run the (idempotent) normalization: pure projection + write-once
      // persistence. The response is byte-identical on re-run.
      try {
        const view = await normalization.normalizeImport(importId);
        if (view === null) {
          return jsonResponse(404, { ok: false, error: "import_not_found" }, requestId);
        }
        logger.info("boq_normalization_computed", {
          requestId,
          importId,
          dictionaryVersion: view.dictionaryVersion,
          totalItems: view.stats.totalItems,
          resolvedConcepts: view.stats.resolvedConcepts,
          unresolvedConcepts: view.stats.unresolvedConcepts,
        });
        return jsonTextResponse(200, canonicalJsonStringify({ ok: true, normalization: view }), requestId);
      } catch (error) {
        if (error instanceof NormalizationServiceError) {
          logger.warn("boq_normalization_unavailable", {
            requestId,
            importId,
            code: error.code,
            detail: error.detail,
          });
          return jsonResponse(
            422,
            { ok: false, error: "normalization_unavailable", code: error.code, detail: error.detail },
            requestId,
          );
        }
        if (error instanceof BoqError) {
          logger.error("boq_store_error", { requestId, part: error.part, detail: error.detail });
          return jsonResponse(
            500,
            { ok: false, error: "boq_store_error", part: error.part, detail: error.detail },
            requestId,
          );
        }
        throw error;
      }
    }

    // GET: the STORED derived record, with precise 404s (unknown import vs
    // known import without a stored view).
    const imported = await service.getImport(importId);
    if (imported === null) {
      return jsonResponse(404, { ok: false, error: "import_not_found" }, requestId);
    }
    const view = await normalization.getNormalization(importId);
    if (view === null) {
      return jsonResponse(404, { ok: false, error: "normalization_not_found" }, requestId);
    }
    logger.info("boq_normalization_read", { requestId, importId });
    return jsonTextResponse(200, canonicalJsonStringify({ ok: true, normalization: view }), requestId);
  }

  // A /v1/boq/... path with no matching route shape falls through to the
  // server-wide 404.
  return null;
}
