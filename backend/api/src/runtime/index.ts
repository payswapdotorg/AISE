/**
 * Public seam of the AISE API runtime package (PROD-003).
 *
 * Consumed by:
 *   - `main.ts` (the LOCAL Bun.serve adapter) via `createRuntimeHandler`;
 *   - `api/[[...path]].ts` (the Vercel catch-all function, repository root)
 *     via `createServerlessHandler` — imported as the bare specifier
 *     `@aise/api/runtime` (the workspace package name; see
 *     backend/api/package.json `exports`), because the workspace boundary
 *     gate forbids relative imports out of the repository-root zone.
 *
 * Both adapters serve the SAME pipeline (see runtime/entry.ts): routing core
 * (server.ts, never rewritten) + readiness provider statuses + the stable
 * error envelope + the CORS layer.
 */

export { createRuntimeHandler, RuntimeBootError } from "./entry";
export type { RuntimeHandlerOptions } from "./entry";
export { createServerlessHandler, remapRequestPath, stripApiMountPrefix } from "./serverless";
export { createCorsLayer } from "./cors";
export type { CorsLayer } from "./cors";
export { errorResponse, humanizeCode, translateErrorResponse } from "./errors";
export type { ErrorEnvelopeBody } from "./errors";
export {
  evaluateOptionalProviders,
  OPTIONAL_PROVIDERS,
} from "./readiness";
export type { OptionalProviderRule, ProviderReadiness, ProviderStatus } from "./readiness";
