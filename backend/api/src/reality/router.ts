/**
 * AISE-016 — Reality Graph HTTP surface (transport adapter ONLY).
 *
 * Contract (spec/work-orders.md §016; spec/architecture-lock.md — the Reality
 * Graph is the ONLY canonical engineering-model authority, and this surface
 * never judges truth/readiness — it applies caller-supplied change sets
 * through the deterministic versioning engine and reads back canonical
 * state):
 *
 *   POST /v1/reality/projects
 *       Create a project graph (empty v1). Body `{ projectId }` — the id is
 *       CALLER-supplied stable identity. Duplicate ids are 422
 *       `project_exists`. Responds with the project header + version index.
 *
 *   GET  /v1/reality/projects/:id
 *       Project header + ordered version list.
 *
 *   GET  /v1/reality/projects/:id/versions/:versionId   (or `latest`)
 *       The FULL materialized version snapshot (nodes, relationships,
 *       observations, tombstones, exact changeLog).
 *
 *   POST /v1/reality/projects/:id/changes
 *       Apply one change set `{ changes: [...] }` → new version. Engine
 *       validation failures are 422 with the typed code; success returns the
 *       new version record.
 *
 *   GET  /v1/reality/projects/:id/nodes/:nodeId
 *       Node across versions: latest state + full per-version history
 *       (which version changed it; tombstones visible).
 *
 * HTTP STATUS MAPPING — the single authoritative place for this translation
 * (mirrors capture/evidence router discipline; do not duplicate elsewhere):
 *
 *   engine policy codes     -> 422 (typed codes: numeric_property_without_unit,
 *                                  missing_provenance, dangling_reference,
 *                                  epistemic_downgrade, invalid_change, …)
 *   not-found codes         -> 404 (project_not_found | version_not_found |
 *                                  node_not_found)
 *   malformed ids           -> 400 (invalid_project_id | invalid_version_id |
 *                                  invalid_body | malformed_json)
 *
 * Every response carries the `x-request-id` correlation header (see
 * `lib/http.ts`); wrong methods get 405 with an explicit `allow`; paths that
 * match no reality route return null so the server's default 404 applies.
 * The store may be injected directly or as a lazy factory (resolved only
 * after the path is recognized as a reality route — see server.ts wiring).
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import { RealityGraphError, type ChangeRecord, type ProjectHeader } from "./model";
import type { RealityStore } from "./store";

export interface RealityRouteOptions {
  /**
   * The reality-graph store, or a lazy factory for it. A factory is resolved
   * ONLY after the path is recognized as a reality route, so deployments
   * without reality traffic never construct the store.
   */
  readonly store: RealityStore | (() => RealityStore);
  /**
   * Injected clock: the sole source of `createdAt` timestamps for project
   * creation and change-set application (determinism pin).
   */
  readonly clock: () => string;
  /** Structured logger for domain-level request events. */
  readonly logger: Logger;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; payload: unknown } | { ok: false }> {
  const text = await request.text();
  try {
    return { ok: true, payload: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Map a typed reality error to its single authoritative HTTP response. */
function realityErrorResponse(error: RealityGraphError, requestId: string): Response {
  const status =
    error.code === "project_not_found" ||
    error.code === "version_not_found" ||
    error.code === "node_not_found"
      ? 404
      : error.code === "invalid_project_id" || error.code === "invalid_version_id"
        ? 400
        : 422;
  return jsonResponse(
    status,
    { ok: false, error: error.code, detail: error.detail },
    requestId,
  );
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Router                                                               */
/* ------------------------------------------------------------------ */

/**
 * Route and answer one request against the reality-graph surface. Returns
 * null when the path is not a reality route (the server then answers 404).
 * Error mapping happens HERE only (see module header).
 */
export async function handleRealityRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: RealityRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "reality") {
    return null;
  }
  const store = typeof options.store === "function" ? options.store() : options.store;
  const { logger, clock } = options;

  try {
    /* POST /v1/reality/projects --------------------------------------- */

    if (segments.length === 3 && segments[2] === "projects") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return jsonResponse(
          400,
          { ok: false, error: "malformed_json", detail: "request body is not valid JSON" },
          requestId,
        );
      }
      const payload = body.payload;
      if (
        payload === null ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        typeof (payload as Record<string, unknown>)["projectId"] !== "string"
      ) {
        return jsonResponse(
          400,
          { ok: false, error: "invalid_body", detail: "expected { projectId: string }" },
          requestId,
        );
      }
      const projectId = (payload as Record<string, unknown>)["projectId"] as string;
      const header = await store.createProject(projectId, clock());
      logger.info("reality_project_created", { requestId, projectId, latestVersionId: header.latestVersionId });
      return jsonResponse(200, { ok: true, project: header }, requestId);
    }

    /* /v1/reality/projects/:id/... ------------------------------------ */

    if (segments.length >= 4 && segments[2] === "projects") {
      const projectId = decodeSegment(segments[3] ?? "");
      if (projectId === null) {
        return jsonResponse(400, { ok: false, error: "invalid_project_id", detail: "un-decodable project id" }, requestId);
      }

      /* GET /v1/reality/projects/:id ---------------------------------- */

      if (segments.length === 4) {
        if (request.method !== "GET") {
          return methodNotAllowed(requestId, "GET");
        }
        const header = await store.getProject(projectId);
        if (header === null) {
          return jsonResponse(
            404,
            { ok: false, error: "project_not_found", detail: `project "${projectId}" is unknown` },
            requestId,
          );
        }
        logger.info("reality_project_read", { requestId, projectId, latestVersionId: header.latestVersionId });
        return jsonResponse(200, { ok: true, project: header }, requestId);
      }

      /* POST /v1/reality/projects/:id/changes ------------------------- */

      if (segments.length === 5 && segments[4] === "changes") {
        if (request.method !== "POST") {
          return methodNotAllowed(requestId, "POST");
        }
        const body = await readJsonBody(request);
        if (!body.ok) {
          return jsonResponse(
            400,
            { ok: false, error: "malformed_json", detail: "request body is not valid JSON" },
            requestId,
          );
        }
        const payload = body.payload;
        if (
          payload === null ||
          typeof payload !== "object" ||
          Array.isArray(payload) ||
          !Array.isArray((payload as Record<string, unknown>)["changes"])
        ) {
          return jsonResponse(
            400,
            { ok: false, error: "invalid_body", detail: "expected { changes: ChangeRecord[] }" },
            requestId,
          );
        }
        const changes = (payload as Record<string, unknown>)["changes"] as unknown[];
        // The engine re-validates every record at runtime (single validation
        // path); the router stays a pure transport adapter.
        const version = await store.applyChanges(
          projectId,
          changes as readonly ChangeRecord[],
          { createdAt: clock() },
        );
        logger.info("reality_changes_applied", {
          requestId,
          projectId,
          versionId: version.versionId,
          changeCount: version.changeLog.length,
        });
        return jsonResponse(200, { ok: true, version }, requestId);
      }

      /* GET /v1/reality/projects/:id/versions/:versionId | latest ----- */

      if (segments.length === 6 && segments[4] === "versions") {
        if (request.method !== "GET") {
          return methodNotAllowed(requestId, "GET");
        }
        const requested = decodeSegment(segments[5] ?? "");
        if (requested === null) {
          return jsonResponse(400, { ok: false, error: "invalid_version_id", detail: "un-decodable version id" }, requestId);
        }
        const version =
          requested === "latest"
            ? await store.getVersion(projectId)
            : await store.getVersion(projectId, requested);
        if (version === null) {
          const header: ProjectHeader | null = await store.getProject(projectId);
          const code = header === null ? "project_not_found" : "version_not_found";
          const detail =
            header === null
              ? `project "${projectId}" is unknown`
              : `version "${requested}" of project "${projectId}" is unknown`;
          return jsonResponse(404, { ok: false, error: code, detail }, requestId);
        }
        logger.info("reality_version_read", {
          requestId,
          projectId,
          versionId: version.versionId,
        });
        return jsonResponse(200, { ok: true, version }, requestId);
      }

      /* GET /v1/reality/projects/:id/nodes/:nodeId -------------------- */

      if (segments.length === 6 && segments[4] === "nodes") {
        if (request.method !== "GET") {
          return methodNotAllowed(requestId, "GET");
        }
        const nodeId = decodeSegment(segments[5] ?? "");
        if (nodeId === null || nodeId.length < 1 || nodeId.length > 256) {
          return jsonResponse(400, { ok: false, error: "invalid_id", detail: "invalid node id" }, requestId);
        }
        const history = await store.getNodeHistory(projectId, nodeId);
        if (history === null) {
          return jsonResponse(
            404,
            { ok: false, error: "project_not_found", detail: `project "${projectId}" is unknown` },
            requestId,
          );
        }
        const everPresent = history.entries.some(
          (entry) => entry.node !== null || entry.tombstone !== null || entry.changeOp !== null,
        );
        if (!everPresent) {
          return jsonResponse(
            404,
            {
              ok: false,
              error: "node_not_found",
              detail: `node "${nodeId}" never appeared in project "${projectId}"`,
            },
            requestId,
          );
        }
        logger.info("reality_node_history_read", { requestId, projectId, nodeId });
        return jsonResponse(200, { ok: true, history }, requestId);
      }
    }

    // A /v1/reality/... path with no matching route shape falls through to
    // the server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof RealityGraphError) {
      options.logger.warn("reality_policy_rejection", { requestId, code: error.code });
      return realityErrorResponse(error, requestId);
    }
    throw error;
  }
}
