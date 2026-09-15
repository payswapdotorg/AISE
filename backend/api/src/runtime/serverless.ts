/**
 * The Vercel serverless adapter (PROD-003).
 *
 * The ONE catch-all function `api/[[...path]].ts` (repository root) exports
 * the handler built here. Vercel's Hobby plan caps serverless functions per
 * project, so the deployable shape is a SINGLE optional catch-all function —
 * no per-route functions — that delegates EVERY method+path to the shared
 * runtime pipeline (runtime/entry.ts), which delegates to the routing core
 * (server.ts `createRequestHandler`).
 *
 * Mount-path remapping: Vercel serves functions under `/api/*`. The vercel.json
 * rewrites map the SAME-ORIGIN public paths the web app uses onto that mount:
 *
 *   /healthz           → /api/healthz
 *   /readyz            → /api/readyz
 *   /v1/:path*         → /api/v1/:path*
 *   (direct /api/** hits work too — the function is the filesystem route)
 *
 * This adapter therefore strips exactly ONE leading `/api` prefix from the
 * incoming pathname before handing the request to the runtime handler, so
 * the core sees the public path (`/healthz`, `/v1/gaps`, …) — the identical
 * path local `bun run start` serves. The request is rebuilt with the
 * rewritten URL and the ORIGINAL method/headers/body (the two-argument
 * Request constructor carries them); query strings are preserved.
 *
 * Web-standard signature: `(request: Request) => Promise<Response>` — the
 * shape @vercel/node builds for a default-exported web handler, the same
 * shape Bun.serve consumes locally. No Vercel-internal types are imported:
 * the adapter is thin glue, tested through the handler contract.
 */

import { createRuntimeHandler, type RuntimeHandlerOptions } from "./entry";

/** Strip one leading `/api` mount segment (`/api` itself becomes `/`). */
export function stripApiMountPrefix(pathname: string): string {
  if (pathname === "/api") {
    return "/";
  }
  if (pathname.startsWith("/api/")) {
    return pathname.slice("/api".length);
  }
  return pathname;
}

/** Remap a request onto the public (unmounted) path, preserving everything else. */
export function remapRequestPath(request: Request): Request {
  const url = new URL(request.url);
  const remapped = `${url.origin}${stripApiMountPrefix(url.pathname)}${url.search}`;
  if (remapped === request.url) {
    return request;
  }
  return new Request(remapped, request);
}

/**
 * Build the Vercel catch-all handler. Options default to the live process
 * environment; the boot-honesty discipline (no fail-fast) is the serverless
 * default documented in runtime/entry.ts.
 */
export function createServerlessHandler(
  options: RuntimeHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const handler = createRuntimeHandler(options);
  return async (request: Request): Promise<Response> => handler(remapRequestPath(request));
}
