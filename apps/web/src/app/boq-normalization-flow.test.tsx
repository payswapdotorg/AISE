/**
 * QA-003 — the BOQ import→inspect flow tests: the normalization step, the
 * honest ephemerality messaging, and the D7 error-path selector contract.
 *
 * The boq-import.test.tsx discipline: static renders of pure projections +
 * typed seam tests with stubbed transports (fetch-order spies) + the
 * surface-load function exported for exactly this spy-driven proof.
 *
 *  (a) import success → the normalization POST fires BEFORE the lens is
 *      fetched (the 409 normalization_required defect's fix — the exact
 *      request order is the load-bearing wire);
 *  (b) a normalization typed-failure surfaces the honest failure state
 *      (the source stays stored, the lens cannot be built, the route's own
 *      reason) — never a fabricated lens, never a silent swallow;
 *  (c) the ephemerality message renders in the serverless mode and NOT in
 *      the durable mode (the deployment mode is OBSERVED on the flow's own
 *      responses — no new request is ever issued for it);
 *  (d) the selector's first-import/selection contract stays pinned (the
 *      deployment's own order, the selection named, never guessed);
 *  (e) D7: a chosen-import lens failure (409 normalization_required, 404
 *      import_not_found) keeps the imports list rendered (ready, never the
 *      false loading branch), surfaces the typed error per-import, and
 *      selecting a healthy import loads its lens (the switch-back path).
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BoqImportPanelBody,
  observedBoqDeployment,
  runBoqImportFlow,
  type BoqImportOutcome,
} from "./surfaces/BoqImport";
import {
  BoqLensBody,
  BoqRevisionSelectorCard,
  loadBoqLensSurfaceData,
  type BoqLensData,
} from "./surfaces/BoqLens";
import {
  ensureBoqNormalizationLive,
  loadBoqLensLive,
  type FetchLike,
} from "./api";
import { DEMO_TASK_PROJECT_ID } from "./task-dataset";

const noop = () => {};

/* ------------------------------------------------------------------ */
/* The wire fixtures (the routes' own answer shapes)                    */
/* ------------------------------------------------------------------ */

const IMPORT_ID = "0f".repeat(32);
const SECOND_IMPORT_ID = "1a".repeat(32);

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

/** One parsed CSV import answer (the ingestion route's own envelope). */
function importEnvelope(importId: string, rows: number): Response {
  return json({
    ok: true,
    import: {
      importId,
      source: {
        contentId: importId,
        mediaType: "text/csv",
        byteSize: 96,
        importedAt: "2026-09-26T18:00:00.000Z",
      },
      format: "csv",
      parse: {
        status: "parsed",
        document: {
          sheets: [
            {
              name: "Sheet1",
              rows: Array.from({ length: rows }, (_, index) => ({ rowNumber: index + 1 })),
            },
          ],
        },
      },
    },
  });
}

/** One normalization answer (AISE-014's own envelope + stats counters). */
function normalizationEnvelope(importId: string, totalItems: number): Response {
  return json({
    ok: true,
    normalization: {
      importId,
      dictionaryVersion: "1.0.0",
      generatedBy: "aise-boq-normalizer/1.0",
      columnRoles: [],
      interpretations: [],
      perItem: [],
      stats: {
        totalItems,
        rowsWithoutInterpretableCells: 0,
        resolvedConcepts: 1,
        unresolvedConcepts: totalItems - 1,
        ambiguousDescriptions: 0,
        resolvedUnits: totalItems,
        unresolvedUnits: 0,
      },
    },
  });
}

/** The imports list answer (the deployment's own order = by importId). */
function importsList(ids: readonly string[]): Response {
  return json({
    ok: true,
    imports: [...ids]
      .sort()
      .map((importId) => ({
        importId,
        format: "csv",
        source: { contentId: importId, byteSize: 96 },
        parse: { status: "parsed" },
      })),
  });
}

/** One joined lens answer (PROD-010's own envelope, minimal valid record). */
function lensEnvelope(importId: string): Response {
  return json({
    ok: true,
    lens: {
      importId,
      sourceName: "probe.csv",
      dictionaryVersion: "1.0.0",
      mappingVersion: null,
      sourceCellRefs: [],
      items: [],
    },
  });
}

/** The typed 409 the lens route answers without a stored normalized view. */
function normalizationRequired(importId: string): Response {
  return json(
    {
      ok: false,
      error: "normalization_required",
      detail: `import '${importId}' has no stored normalized view — run POST /v1/boq/imports/:id/normalization first`,
    },
    409,
  );
}

/** The typed 404 an unknown (vanished) import answers. */
function importNotFound(): Response {
  return json({ ok: false, error: "import_not_found" }, 404);
}

/* ------------------------------------------------------------------ */
/* (a) import success → normalization POST fired → lens loads           */
/* ------------------------------------------------------------------ */

describe("QA-003 (a) the import flow runs the normalization step before the lens", () => {
  const bytes = new Uint8Array([104, 101, 108, 108, 111]); // "hello"

  test("the fetch ORDER is import POST → normalization POST (the route's idempotent ensure)", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${input}`);
      if (input === "/v1/boq/imports?format=csv") {
        return importEnvelope(IMPORT_ID, 3);
      }
      if (input === `/v1/boq/imports/${IMPORT_ID}/normalization`) {
        return normalizationEnvelope(IMPORT_ID, 3);
      }
      return json({ ok: false }, 404);
    };
    const outcome = await runBoqImportFlow(fetchImpl, bytes, "csv");
    expect(outcome.kind).toBe("imported");
    expect(calls).toEqual([
      "POST /v1/boq/imports?format=csv",
      `POST /v1/boq/imports/${IMPORT_ID}/normalization`,
    ]);
    if (outcome.kind === "imported") {
      expect(outcome.normalization?.ok).toBe(true);
      if (outcome.normalization?.ok === true) {
        expect(outcome.normalization.view.importId).toBe(IMPORT_ID);
        expect(outcome.normalization.view.totalItems).toBe(3);
        expect(outcome.normalization.view.dictionaryVersion).toBe("1.0.0");
      }
      // The durable local deployment is NOT observed serverless — the
      // ephemerality caveat must not render (no scare-mongering).
      expect(outcome.deployment).toBe("durable");
    }
  });

  test("the post-import state lands on a VIEWABLE lens (list → the fresh import's lens, no 409)", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${input}`);
      if (input === "/v1/boq/imports?format=csv") {
        return importEnvelope(IMPORT_ID, 3);
      }
      if (input === `/v1/boq/imports/${IMPORT_ID}/normalization`) {
        return normalizationEnvelope(IMPORT_ID, 3);
      }
      if (input === "/v1/boq/imports" && init?.method !== "POST") {
        return importsList([IMPORT_ID, SECOND_IMPORT_ID]);
      }
      if (input === `/v1/boq/imports/${IMPORT_ID}/lens`) {
        return lensEnvelope(IMPORT_ID);
      }
      if (input === `/v1/boq/imports/${SECOND_IMPORT_ID}/lens`) {
        return lensEnvelope(SECOND_IMPORT_ID);
      }
      return json({ ok: false }, 404);
    };
    // The full in-flow sequence over ONE transport: import → normalization
    // → (the host surface reloads its lens resource onto the fresh import)
    // → list → the fresh import's lens. The 409 never occurs.
    const outcome = await runBoqImportFlow(fetchImpl, bytes, "csv");
    expect(outcome.kind).toBe("imported");
    const lensResource = await loadBoqLensSurfaceData({
      fetchImpl,
      projectId: DEMO_TASK_PROJECT_ID,
      selectedImportId: IMPORT_ID,
    });
    expect(lensResource.kind).toBe("ready");
    expect(calls).toEqual([
      "POST /v1/boq/imports?format=csv",
      `POST /v1/boq/imports/${IMPORT_ID}/normalization`,
      "GET /v1/boq/imports",
      `GET /v1/boq/imports/${IMPORT_ID}/lens`,
    ]);
    if (lensResource.kind === "ready") {
      expect(lensResource.data.lens?.importId).toBe(IMPORT_ID);
      expect(lensResource.data.lensFailure).toBeNull();
      expect(lensResource.data.imports?.map((entry) => entry.importId)).toEqual([
        IMPORT_ID,
        SECOND_IMPORT_ID,
      ]);
    }
  });

  test("the ensure is idempotent-honest: a stored view is returned, never recomputed into a different one", async () => {
    // The route's own contract: re-running the POST answers the SAME stored
    // view (byte-identical). The seam carries that answer as-is.
    const fetchImpl: FetchLike = async () => normalizationEnvelope(IMPORT_ID, 5);
    const first = await ensureBoqNormalizationLive(fetchImpl, IMPORT_ID);
    const second = await ensureBoqNormalizationLive(fetchImpl, IMPORT_ID);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.record).toEqual(first.record);
    }
  });

  test("the imported outcome renders the ensured normalization summary", () => {
    const outcome: BoqImportOutcome = {
      kind: "imported",
      record: {
        importId: IMPORT_ID,
        format: "csv",
        mediaType: "text/csv",
        byteSize: 96,
        importedAt: "2026-09-26T18:00:00.000Z",
        parseStatus: "parsed",
        rowCount: 3,
        parseReason: null,
      },
      endpoint: "/v1/boq/imports?format=csv",
      deployment: "durable",
      normalization: {
        ok: true,
        view: {
          importId: IMPORT_ID,
          dictionaryVersion: "1.0.0",
          totalItems: 3,
          resolvedConcepts: 1,
          unresolvedConcepts: 2,
        },
        endpoint: `/v1/boq/imports/${IMPORT_ID}/normalization`,
      },
    };
    const html = renderToStaticMarkup(
      <BoqImportPanelBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={false}
        format="csv"
        onFormat={noop}
        file={{ name: "probe.csv", byteSize: 96 }}
        reading={false}
        submitting={false}
        outcome={outcome}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-outcome="imported"');
    expect(html).toContain('data-normalization="ensured"');
    expect(html).toContain("The derived normalization is ensured");
    expect(html).toContain("3 item rows");
    expect(html).toContain("dictionary");
    expect(html).toContain("unresolved is an honest outcome, never guessed");
  });
});

/* ------------------------------------------------------------------ */
/* (b) normalization typed-failure → the honest failure state           */
/* ------------------------------------------------------------------ */

describe("QA-003 (b) a normalization typed-failure is surfaced honestly, never swallowed", () => {
  const bytes = new Uint8Array([104, 105]); // "hi"

  test("the 422 normalization_unavailable typed answer (the PDF known limit) carries code and reason", async () => {
    const fetchImpl: FetchLike = async (input) => {
      if (input === "/v1/boq/imports?format=pdf") {
        return json({
          ok: true,
          import: {
            importId: IMPORT_ID,
            source: {
              contentId: IMPORT_ID,
              mediaType: "application/pdf",
              byteSize: 2,
              importedAt: "2026-09-26T18:00:00.000Z",
            },
            format: "pdf",
            parse: {
              status: "unsupported_format",
              reason: "pdf_text_extraction_not_implemented: source bytes are preserved verbatim",
            },
          },
        });
      }
      if (input === `/v1/boq/imports/${IMPORT_ID}/normalization`) {
        return json(
          {
            ok: false,
            error: "normalization_unavailable",
            code: "unparsed_import",
            detail: "the import has no parsed document to normalize (stored-only source)",
          },
          422,
        );
      }
      return json({ ok: false }, 404);
    };
    const outcome = await runBoqImportFlow(fetchImpl, bytes, "pdf");
    expect(outcome.kind).toBe("imported");
    if (outcome.kind === "imported") {
      expect(outcome.record.parseStatus).toBe("unsupported_format");
      const normalization = outcome.normalization;
      expect(normalization?.ok).toBe(false);
      if (normalization !== undefined && !normalization.ok) {
        expect(normalization.detail).toContain("normalization_unavailable");
        expect(normalization.detail).toContain("no parsed document to normalize");
      }
    }
  });

  test("the typed failure renders the honest failure state (source stored, lens un-buildable) — no fabricated lens", () => {
    const outcome: BoqImportOutcome = {
      kind: "imported",
      record: {
        importId: IMPORT_ID,
        format: "pdf",
        mediaType: "application/pdf",
        byteSize: 2048,
        importedAt: "2026-09-26T18:00:00.000Z",
        parseStatus: "unsupported_format",
        rowCount: null,
        parseReason: "pdf sources are preserved but not parsed (known limitation)",
      },
      endpoint: "/v1/boq/imports?format=pdf",
      deployment: "durable",
      normalization: {
        ok: false,
        detail:
          "/v1/boq/imports/0f…/normalization answered HTTP 422 — normalization_unavailable: the import has no parsed document to normalize (stored-only source)",
      },
    };
    const html = renderToStaticMarkup(
      <BoqImportPanelBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={false}
        format="pdf"
        onFormat={noop}
        file={{ name: "tender.pdf", byteSize: 2048 }}
        reading={false}
        submitting={false}
        outcome={outcome}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-normalization="failed"');
    expect(html).toContain("The derived view could not be ensured");
    expect(html).toContain("normalization_unavailable");
    expect(html).toContain("the lens cannot be built for this import");
    expect(html).toContain("The source stays stored");
  });

  test("the seam surfaces the route's other typed answers honestly (404 import_not_found)", async () => {
    const fetchImpl: FetchLike = async () => importNotFound();
    const result = await ensureBoqNormalizationLive(fetchImpl, IMPORT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("http");
      if (result.failure.kind === "http") {
        expect(result.failure.status).toBe(404);
        expect(result.failure.code).toBe("import_not_found");
      }
    }
  });

  test("the DEPLOYMENT's stable error envelope carries the typed code + reason (the served shape)", async () => {
    // The serve seam (runtime/errors.ts) re-envelopes every internal
    // `{ok:false,error,detail}` into `{error:{code,message},detail}` — the
    // shape local start AND the Vercel function actually answer. The BOQ
    // seam honors BOTH shapes; this is the deployed one.
    const stableEnvelope = (code: string, detail: string, status: number): Response =>
      json(
        {
          error: { code, message: `${code} (humanized).`, requestId: "770b5d04-b05f" },
          detail,
        },
        status,
      );
    const lens = await loadBoqLensLive(
      async () =>
        stableEnvelope(
          "normalization_required",
          `import '${IMPORT_ID}' has no stored normalized view — run POST /v1/boq/imports/:id/normalization first`,
          409,
        ),
      IMPORT_ID,
    );
    expect(lens.ok).toBe(false);
    if (!lens.ok) {
      expect(lens.failure.kind).toBe("http");
      if (lens.failure.kind === "http") {
        expect(lens.failure.status).toBe(409);
        expect(lens.failure.code).toBe("normalization_required");
        expect(lens.failure.reason).toContain("run POST /v1/boq/imports/:id/normalization first");
      }
    }
    const normalization = await ensureBoqNormalizationLive(
      async () =>
        stableEnvelope(
          "normalization_unavailable",
          "the import has no parsed document to normalize (stored-only source)",
          422,
        ),
      IMPORT_ID,
    );
    expect(normalization.ok).toBe(false);
    if (!normalization.ok) {
      expect(normalization.failure.kind).toBe("http");
      if (normalization.failure.kind === "http") {
        expect(normalization.failure.status).toBe(422);
        expect(normalization.failure.code).toBe("normalization_unavailable");
        expect(normalization.failure.reason).toContain("no parsed document to normalize");
      }
    }
  });

  test("a structurally invalid normalization answer is the explicit invalid failure (never coerced)", async () => {
    const fetchImpl: FetchLike = async () => json({ ok: true, normalization: { importId: "" } });
    const result = await ensureBoqNormalizationLive(fetchImpl, IMPORT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("invalid");
      expect(result.failure.detail).toContain("importId must be a non-empty string");
    }
  });
});

/* ------------------------------------------------------------------ */
/* (c) the ephemerality message: serverless mode ONLY                   */
/* ------------------------------------------------------------------ */

describe("QA-003 (c) the honest ephemerality message renders in the serverless mode and NOT in the durable mode", () => {
  const record = {
    importId: IMPORT_ID,
    format: "csv",
    mediaType: "text/csv",
    byteSize: 96,
    importedAt: "2026-09-26T18:00:00.000Z",
    parseStatus: "parsed" as const,
    rowCount: 3,
    parseReason: null,
  };
  const normalization = {
    ok: true as const,
    view: {
      importId: IMPORT_ID,
      dictionaryVersion: "1.0.0",
      totalItems: 3,
      resolvedConcepts: 1,
      unresolvedConcepts: 2,
    },
    endpoint: `/v1/boq/imports/${IMPORT_ID}/normalization`,
  };

  function renderOutcome(outcome: BoqImportOutcome): string {
    return renderToStaticMarkup(
      <BoqImportPanelBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={false}
        format="csv"
        onFormat={noop}
        file={{ name: "probe.csv", byteSize: 96 }}
        reading={false}
        submitting={false}
        outcome={outcome}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
  }

  test("serverless mode: the honest limit is stated (per-instance imports, may not survive a reload)", () => {
    const html = renderOutcome({
      kind: "imported",
      record,
      endpoint: "/v1/boq/imports?format=csv",
      deployment: "serverless",
      normalization,
    });
    expect(html).toContain('data-ephemerality="serverless"');
    expect(html).toContain("Imports live per-instance on this deployment");
    expect(html).toContain("may not survive a reload");
    expect(html).toContain("the server");
  });

  test("durable mode: NO ephemerality caveat (no scare-mongering on durable deployments)", () => {
    const html = renderOutcome({
      kind: "imported",
      record,
      endpoint: "/v1/boq/imports?format=csv",
      deployment: "durable",
      normalization,
    });
    expect(html).not.toContain('data-ephemerality="serverless"');
    expect(html).not.toContain("may not survive a reload");
    expect(html).not.toContain("Imports live per-instance");
  });

  test("a legacy outcome without the deployment observation renders no caveat (back-compat)", () => {
    const html = renderOutcome({
      kind: "imported",
      record,
      endpoint: "/v1/boq/imports?format=csv",
    });
    expect(html).not.toContain("may not survive a reload");
    expect(html).not.toContain("Imports live per-instance");
  });

  test("the deployment mode is OBSERVED on the flow's own responses — no extra request is ever issued", async () => {
    const bytes = new Uint8Array([104, 101]); // "he"
    const calls: string[] = [];
    const serve = (extraHeaders: Record<string, string>): FetchLike => {
      const respond = (value: unknown, status = 200): Response =>
        new Response(JSON.stringify(value), {
          status,
          headers: { "content-type": "application/json", ...extraHeaders },
        });
      return async (input, init) => {
        calls.push(`${init?.method ?? "GET"} ${input}`);
        if (input === "/v1/boq/imports?format=csv") {
          return respond({
            ok: true,
            import: {
              importId: IMPORT_ID,
              source: {
                contentId: IMPORT_ID,
                mediaType: "text/csv",
                byteSize: 2,
                importedAt: "2026-09-26T18:00:00.000Z",
              },
              format: "csv",
              parse: {
                status: "parsed",
                document: { sheets: [{ name: "Sheet1", rows: [{ rowNumber: 1 }, { rowNumber: 2 }] }] },
              },
            },
          });
        }
        if (input === `/v1/boq/imports/${IMPORT_ID}/normalization`) {
          return respond({
            ok: true,
            normalization: {
              importId: IMPORT_ID,
              dictionaryVersion: "1.0.0",
              stats: {
                totalItems: 2,
                rowsWithoutInterpretableCells: 0,
                resolvedConcepts: 1,
                unresolvedConcepts: 1,
                ambiguousDescriptions: 0,
                resolvedUnits: 2,
                unresolvedUnits: 0,
              },
            },
          });
        }
        return respond({ ok: false }, 404);
      };
    };
    // The serverless platform's own response header identifies it; the
    // observation adds ZERO requests to the flow (the exact two POSTs).
    calls.length = 0;
    const serverless = await runBoqImportFlow(
      serve({ "x-vercel-id": "hkg1::iad1::t55j2-1790527282169-b3a15ca4aeda" }),
      bytes,
      "csv",
    );
    expect(calls).toEqual([
      "POST /v1/boq/imports?format=csv",
      `POST /v1/boq/imports/${IMPORT_ID}/normalization`,
    ]);
    expect(serverless.kind).toBe("imported");
    if (serverless.kind === "imported") {
      expect(serverless.deployment).toBe("serverless");
    }
    calls.length = 0;
    const durable = await runBoqImportFlow(serve({}), bytes, "csv");
    expect(calls).toEqual([
      "POST /v1/boq/imports?format=csv",
      `POST /v1/boq/imports/${IMPORT_ID}/normalization`,
    ]);
    expect(durable.kind).toBe("imported");
    if (durable.kind === "imported") {
      expect(durable.deployment).toBe("durable");
    }
  });

  test("observedBoqDeployment is the pure platform-marker observation (absent = durable)", () => {
    const serverless = new Response("{}", {
      headers: { "x-vercel-id": "hkg1::iad1::abc" },
    });
    expect(observedBoqDeployment(serverless)).toBe("serverless");
    const durable = new Response("{}");
    expect(observedBoqDeployment(durable)).toBe("durable");
    // Only the platform's own marker flips it — other headers never do.
    const otherHeaders = new Response("{}", { headers: { "x-request-id": "770b5d04" } });
    expect(observedBoqDeployment(otherHeaders)).toBe("durable");
  });
});

/* ------------------------------------------------------------------ */
/* (d) the selector's first-import/selection contract stays pinned      */
/* ------------------------------------------------------------------ */

describe("QA-003 (d) the revision selector's contract stays pinned (no guessed imports, no stale selection)", () => {
  const imports = [
    { importId: IMPORT_ID, format: "csv", byteSize: 96, parseStatus: "parsed" },
    { importId: SECOND_IMPORT_ID, format: "xlsx", byteSize: 38214, parseStatus: "parsed" },
  ];

  test("before any selection, the FIRST import in the service's own order opens (named, never guessed)", async () => {
    const fetchImpl: FetchLike = async (input) => {
      if (input === "/v1/boq/imports") {
        return importsList([IMPORT_ID, SECOND_IMPORT_ID]);
      }
      if (input === `/v1/boq/imports/${IMPORT_ID}/lens`) {
        return lensEnvelope(IMPORT_ID);
      }
      return json({ ok: false }, 404);
    };
    const resource = await loadBoqLensSurfaceData({
      fetchImpl,
      projectId: DEMO_TASK_PROJECT_ID,
      selectedImportId: null,
    });
    expect(resource.kind).toBe("ready");
    if (resource.kind === "ready") {
      // The service's own order (by importId) — the first import's lens.
      expect(resource.data.lens?.importId).toBe(IMPORT_ID);
      expect(resource.data.lensFailure).toBeNull();
    }
  });

  test("the SELECTION opens its own import; every recorded import renders with its own Inspect action", async () => {
    const fetchImpl: FetchLike = async (input) => {
      if (input === "/v1/boq/imports") {
        return importsList([IMPORT_ID, SECOND_IMPORT_ID]);
      }
      if (input === `/v1/boq/imports/${SECOND_IMPORT_ID}/lens`) {
        return lensEnvelope(SECOND_IMPORT_ID);
      }
      return json({ ok: false }, 404);
    };
    const resource = await loadBoqLensSurfaceData({
      fetchImpl,
      projectId: DEMO_TASK_PROJECT_ID,
      selectedImportId: SECOND_IMPORT_ID,
    });
    expect(resource.kind).toBe("ready");
    if (resource.kind === "ready") {
      expect(resource.data.lens?.importId).toBe(SECOND_IMPORT_ID);
    }
    const html = renderToStaticMarkup(
      <BoqRevisionSelectorCard
        mode="api"
        projectId={DEMO_TASK_PROJECT_ID}
        imports={imports}
        selectedImportId={SECOND_IMPORT_ID}
        onSelectImport={noop}
      />,
    );
    expect(html).toContain('data-selector-state="ready"');
    for (const entry of imports) {
      expect(html).toContain(`data-inspect-import="${entry.importId}"`);
    }
    expect(html).toContain(`data-selector-selection="${SECOND_IMPORT_ID}"`);
    expect(html).toContain('data-selected="true"');
    expect(html).toContain("Inspecting");
  });

  test("a freshly imported document becomes the named selection (the operator's own action, never a guess)", () => {
    // The state the surface lands in after onImported(importId): the fresh
    // import is the named selection and its own Inspect action shows
    // Inspecting (the in-flow post-import state).
    const html = renderToStaticMarkup(
      <BoqRevisionSelectorCard
        mode="api"
        projectId={DEMO_TASK_PROJECT_ID}
        imports={imports}
        selectedImportId={IMPORT_ID}
        onSelectImport={noop}
      />,
    );
    expect(html).toContain(`data-selector-selection="${IMPORT_ID}"`);
    expect(html).toContain(`data-inspect-import="${SECOND_IMPORT_ID}"`);
    expect(html).toContain(`Inspect ${SECOND_IMPORT_ID}`);
  });
});

/* ------------------------------------------------------------------ */
/* (e) D7 — the error path keeps the surface usable                    */
/* ------------------------------------------------------------------ */

describe("QA-003 (e) D7 — a chosen-import lens failure does NOT collapse the surface", () => {
  test("lens 409 normalization_required: the resource is READY with the list kept + the per-import failure", async () => {
    const fetchImpl: FetchLike = async (input) => {
      if (input === "/v1/boq/imports") {
        return importsList([IMPORT_ID, SECOND_IMPORT_ID]);
      }
      if (input === `/v1/boq/imports/${IMPORT_ID}/lens`) {
        return normalizationRequired(IMPORT_ID);
      }
      return json({ ok: false }, 404);
    };
    const resource = await loadBoqLensSurfaceData({
      fetchImpl,
      projectId: DEMO_TASK_PROJECT_ID,
      selectedImportId: null,
    });
    // NOT a whole-surface error — the already-loaded list is NOT discarded.
    expect(resource.kind).toBe("ready");
    if (resource.kind === "ready") {
      expect(resource.data.imports).toHaveLength(2);
      expect(resource.data.lens).toBeNull();
      expect(resource.data.lensFailure).not.toBeNull();
      expect(resource.data.lensFailure?.importId).toBe(IMPORT_ID);
      expect(resource.data.lensFailure?.message).toContain("normalization_required");
      expect(resource.data.lensFailure?.message).toContain(
        "run POST /v1/boq/imports/:id/normalization first",
      );
    }
  });

  test("lens 404 import_not_found (the vanished serverless import): same decoupled contract", async () => {
    const fetchImpl: FetchLike = async (input) => {
      if (input === "/v1/boq/imports") {
        return importsList([IMPORT_ID, SECOND_IMPORT_ID]);
      }
      if (input === `/v1/boq/imports/${IMPORT_ID}/lens`) {
        return importNotFound();
      }
      return json({ ok: false }, 404);
    };
    const resource = await loadBoqLensSurfaceData({
      fetchImpl,
      projectId: DEMO_TASK_PROJECT_ID,
      selectedImportId: IMPORT_ID,
    });
    expect(resource.kind).toBe("ready");
    if (resource.kind === "ready") {
      expect(resource.data.imports).toHaveLength(2);
      expect(resource.data.lensFailure?.importId).toBe(IMPORT_ID);
      expect(resource.data.lensFailure?.message).toContain("import_not_found");
    }
  });

  test("the selector STILL renders every import row (ready) in the lens-failure state — never the false loading branch", () => {
    // The exact D7 render inputs: the ready data carries BOTH the list and
    // the per-import failure; the selector receives the list (not null).
    const data: BoqLensData = {
      mode: "api",
      projectId: DEMO_TASK_PROJECT_ID,
      lens: null,
      imports: [
        { importId: IMPORT_ID, format: "csv", byteSize: 96, parseStatus: "parsed" },
        { importId: SECOND_IMPORT_ID, format: "xlsx", byteSize: 38214, parseStatus: "parsed" },
      ],
      lensFailure: {
        importId: IMPORT_ID,
        message: `/v1/boq/imports/${IMPORT_ID}/lens answered HTTP 409 — normalization_required: import has no stored normalized view`,
      },
    };
    const html = renderToStaticMarkup(
      <BoqRevisionSelectorCard
        mode="api"
        projectId={DEMO_TASK_PROJECT_ID}
        imports={data.imports ?? null}
        selectedImportId={data.lensFailure?.importId ?? null}
        onSelectImport={noop}
      />,
    );
    expect(html).toContain('data-selector-state="ready"');
    expect(html).not.toContain('data-selector-state="loading"');
    expect(html).toContain(`data-inspect-import="${IMPORT_ID}"`);
    expect(html).toContain(`data-inspect-import="${SECOND_IMPORT_ID}"`);
    // the failing import is the named selection (Inspecting); the healthy
    // import stays inspectable — the switch-back affordance.
    expect(html).toContain(`data-selector-selection="${IMPORT_ID}"`);
    expect(html).toContain(`Inspect ${SECOND_IMPORT_ID}`);
  });

  test("the lens area names WHICH import failed with the typed reason + Try again for THAT import", () => {
    const data: BoqLensData = {
      mode: "api",
      projectId: DEMO_TASK_PROJECT_ID,
      lens: null,
      imports: [
        { importId: IMPORT_ID, format: "csv", byteSize: 96, parseStatus: "parsed" },
        { importId: SECOND_IMPORT_ID, format: "xlsx", byteSize: 38214, parseStatus: "parsed" },
      ],
      lensFailure: {
        importId: IMPORT_ID,
        message: `/v1/boq/imports/${IMPORT_ID}/lens answered HTTP 409 — normalization_required: import '${IMPORT_ID}' has no stored normalized view`,
      },
    };
    const retryCalls: string[] = [];
    const html = renderToStaticMarkup(
      <BoqLensBody
        data={data}
        query=""
        onQuery={noop}
        selectedItemId={null}
        onSelectItem={noop}
        onRetryLens={() => {
          retryCalls.push(IMPORT_ID);
        }}
      />,
    );
    expect(html).toContain(`data-lens-failure="${IMPORT_ID}"`);
    expect(html).toContain("lens could not be loaded");
    expect(html).toContain(IMPORT_ID);
    expect(html).toContain("normalization_required");
    expect(html).toContain("the documents table above still lists every import");
    expect(html).toContain(`data-retry-import="${IMPORT_ID}"`);
    // The static render proves the button's presence; its handler is the
    // surface's reload (asserted by the switch-back spy test below).
    expect(html).toContain("Try again");
  });

  test("switch-back: selecting the HEALTHY import loads its lens (the seed stays reachable while another import fails)", async () => {
    const lensCalls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      if (input === "/v1/boq/imports") {
        return importsList([IMPORT_ID, SECOND_IMPORT_ID]);
      }
      if (input === `/v1/boq/imports/${IMPORT_ID}/lens`) {
        lensCalls.push(IMPORT_ID);
        return normalizationRequired(IMPORT_ID);
      }
      if (input === `/v1/boq/imports/${SECOND_IMPORT_ID}/lens`) {
        lensCalls.push(SECOND_IMPORT_ID);
        return lensEnvelope(SECOND_IMPORT_ID);
      }
      return json({ ok: false }, 404);
    };
    // The D7 sequence: list OK + chosen lens FAIL → the list renders; then
    // the user selects the healthy import → its lens loads.
    const failing = await loadBoqLensSurfaceData({
      fetchImpl,
      projectId: DEMO_TASK_PROJECT_ID,
      selectedImportId: IMPORT_ID,
    });
    expect(failing.kind).toBe("ready");
    if (failing.kind !== "ready") {
      return;
    }
    expect(failing.data.lensFailure?.importId).toBe(IMPORT_ID);
    // "Try again" retries THAT import's lens (the reload re-runs the load
    // with the SAME selection — the failing import's endpoint again).
    const retried = await loadBoqLensSurfaceData({
      fetchImpl,
      projectId: DEMO_TASK_PROJECT_ID,
      selectedImportId: IMPORT_ID,
    });
    expect(lensCalls).toEqual([IMPORT_ID, IMPORT_ID]);
    expect(retried.kind).toBe("ready");
    // The switch-back: the healthy import's selection loads ITS lens.
    const switched = await loadBoqLensSurfaceData({
      fetchImpl,
      projectId: DEMO_TASK_PROJECT_ID,
      selectedImportId: SECOND_IMPORT_ID,
    });
    expect(lensCalls).toEqual([IMPORT_ID, IMPORT_ID, SECOND_IMPORT_ID]);
    expect(switched.kind).toBe("ready");
    if (switched.kind === "ready") {
      expect(switched.data.lens?.importId).toBe(SECOND_IMPORT_ID);
      expect(switched.data.lensFailure).toBeNull();
    }
  });

  test("a LIST failure stays the whole-surface error (nothing truthful to render)", async () => {
    const fetchImpl: FetchLike = async () => new Response("boom", { status: 500 });
    const resource = await loadBoqLensSurfaceData({
      fetchImpl,
      projectId: DEMO_TASK_PROJECT_ID,
      selectedImportId: null,
    });
    expect(resource.kind).toBe("error");
    if (resource.kind === "error") {
      expect(resource.message).toContain("/v1/boq/imports answered HTTP 500");
    }
  });
});
