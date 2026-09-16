/**
 * AISE API — the source of the ONE catch-all Vercel serverless function
 * (PROD-003; deployment made real by PROD-011).
 *
 * Vercel Hobby caps serverless functions per project, so the deployable
 * shape is a single catch-all that delegates EVERY method+path to
 * the API's shared runtime pipeline — no per-route functions. The pipeline
 * (backend/api/src/runtime/entry.ts) wraps the routing core
 * (backend/api/src/server.ts `createRequestHandler`) with the production
 * concerns: same-origin-default CORS, /readyz per-optional-provider statuses
 * and the stable error envelope. Local `bun run start` serves the SAME
 * routes with the SAME shapes through the same factory.
 *
 * DEPLOYMENT SHAPE (PROD-011): this file is NOT itself the deployed entry —
 * `bun run build` (tools/build.ts) esbuild-bundles it to
 * `api/[...path].mjs`, a self-contained ESM bundle for the Node.js
 * runtime. The repository's TypeScript uses Bun-style extensionless
 * imports, which @vercel/node's type-checker rejects; a pre-bundled .mjs
 * needs no tracing, no TS check and no node_modules at runtime. This source
 * file lives at `api/_serverless.ts` — the leading underscore is Vercel's
 * zero-config EXCLUSION convention (files under api/ starting with `_` are
 * never picked up as functions), so only the emitted `.mjs` becomes a
 * function. (A plain `api/serverless.ts` WAS picked up as a second,
 * broken, traced function — observed in a real deployment's build output.)
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
 * Vercel's Functions API consumes it through a `fetch` export (a DEFAULT
 * export is treated as the legacy `(req, res) => void` Node signature whose
 * return value is ignored — the first real deployment proved that). The
 * export uses the `{ handler as fetch }` form deliberately: it exports the
 * value under the name `fetch` WITHOUT introducing a module-scope `fetch`
 * binding that would shadow the global `fetch` the bundled backend code
 * calls (Upstash REST, R2, provider HTTP). No Vercel SDK dependency is
 * required (the function is runtime-neutral web glue).
 */

import { createServerlessHandler } from "@aise/api/runtime";

const handler = createServerlessHandler();

export { handler as fetch };
