/**
 * AISE API — the ONE catch-all Vercel serverless function (PROD-003).
 *
 * Vercel Hobby caps serverless functions per project, so the deployable
 * shape is a single optional catch-all (this file) that delegates EVERY
 * method+path to the API's shared runtime pipeline — no per-route
 * functions. The pipeline (backend/api/src/runtime/entry.ts) wraps the
 * routing core (backend/api/src/server.ts `createRequestHandler`) with the
 * production concerns: same-origin-default CORS, /readyz per-optional-
 * provider statuses and the stable error envelope. Local `bun run start`
 * serves the SAME routes with the SAME shapes through the same factory.
 *
 * Public paths (vercel.json rewrites) — the web app (PROD-002) calls these
 * same-origin, exactly as it does against the local API:
 *
 *   GET  /healthz     liveness (no secrets, no provider probes)
 *   GET  /readyz      config validity + provider availability statuses
 *   ANY  /v1/**       the twelve /v1 namespaces
 *   ANY  /api/**      the same surface under the native function mount
 *
 * The import is the bare workspace specifier `@aise/api/runtime` (see
 * backend/api/package.json `exports`): the repository-root zone may not
 * relative-import into backend/ (workspace boundary gate), and the package
 * name is the sanctioned cross-zone channel — the same way the backend
 * consumes @aise/shared-contracts.
 *
 * Web-standard handler shape `(request: Request) => Promise<Response>` —
 * what @vercel/node builds for a default-exported web handler. No Vercel
 * SDK dependency is required (the function itself is runtime-neutral web
 * glue; the actual deployment is PROD-011).
 */

import { createServerlessHandler } from "@aise/api/runtime";

export default createServerlessHandler();
