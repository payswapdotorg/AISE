/**
 * AISE web workspace Vite configuration (PROD-001).
 *
 * - EXPLICIT, overridable ports with `strictPort`: when the configured port
 *   is already taken, the dev server fails deterministically instead of
 *   silently hopping to the next free port;
 * - dev AND preview proxy the backend API routes (`/healthz`, `/readyz`,
 *   `/v1/**`) to the API port, so the browser needs zero configuration —
 *   the app always talks to same-origin paths and Vite forwards them;
 * - the API port mirrors the backend API's own contract: `PORT` with the
 *   documented default 8080 (backend/api/src/lib/config.ts, AISE-001);
 * - the web port is `AISE_WEB_PORT` (default 5173 in dev, 4173 for the
 *   production-like preview started by `bun run start`);
 * - malformed port values fail fast with a precise message naming the
 *   variable — never a silent fallback.
 *
 * The web product UI itself is PROD-002; this file only establishes the
 * build/dev runtime contract.
 */

import { defineConfig } from "vite";

const DEFAULT_API_PORT = 8080;
const DEFAULT_DEV_PORT = 5173;
const DEFAULT_PREVIEW_PORT = 4173;

function readEnvPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  // Present-but-empty is a misconfiguration, not "unset" — mirrors the
  // backend API's configuration discipline.
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name}: expected an integer between 1 and 65535 (got a non-numeric or empty value)`);
  }
  const port = Number.parseInt(raw, 10);
  if (port < 1 || port > 65535) {
    throw new Error(`${name}: expected an integer between 1 and 65535`);
  }
  return port;
}

const apiPort = readEnvPort("PORT", DEFAULT_API_PORT);
const apiTarget = `http://127.0.0.1:${apiPort}`;
const proxy = {
  "/healthz": { target: apiTarget, changeOrigin: true },
  "/readyz": { target: apiTarget, changeOrigin: true },
  "/v1": { target: apiTarget, changeOrigin: true },
};

export default defineConfig({
  server: {
    port: readEnvPort("AISE_WEB_PORT", DEFAULT_DEV_PORT),
    strictPort: true,
    proxy,
  },
  preview: {
    port: readEnvPort("AISE_WEB_PORT", DEFAULT_PREVIEW_PORT),
    strictPort: true,
    proxy,
  },
});
