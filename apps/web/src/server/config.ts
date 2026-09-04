/**
 * AISE web server configuration (AISE-015).
 *
 * The web app's own environment contract — the same fail-closed
 * discipline as the backend services' `@aise/backend-config`:
 * configuration comes only from the environment; the dev/test
 * defaults are documented, never secrets; the session secret
 * MUST be provided in production (fail closed at runtime, not
 * at build time — builds never require secrets).
 */
import process from "node:process";

/** The web environment name. */
export type WebEnv = "development" | "test" | "production";

/** The web app's runtime configuration. */
export interface WebConfig {
  readonly env: WebEnv;
  /** The demo sign-in user name (env-configurable; single-user v1). */
  readonly demoUser: string;
  /** The demo sign-in passphrase (env-configurable). */
  readonly demoPassphrase: string;
  /** The HMAC session secret (REQUIRED in production). */
  readonly sessionSecret: string;
  /** Session lifetime in seconds. */
  readonly sessionTtlSeconds: number;
}

const DEV_DEMO_USER = "engineer";
const DEV_DEMO_PASSPHRASE = "aise-demo";
const DEV_SESSION_SECRET = "aise-dev-session-secret-not-for-production";

function envName(): WebEnv {
  const raw = process.env.AISE_ENV ?? process.env.NODE_ENV ?? "development";
  if (raw === "production") {
    return "production";
  }
  if (raw === "test") {
    return "test";
  }
  return "development";
}

/**
 * Loads the web configuration. In PRODUCTION a missing
 * `AISE_WEB_SESSION_SECRET` fails closed (the caller decides how
 * to surface it; the auth layer refuses to mint sessions).
 */
export function loadWebConfig(): WebConfig {
  const env = envName();
  const demoUser = process.env.AISE_WEB_DEMO_USER ?? DEV_DEMO_USER;
  const demoPassphrase = process.env.AISE_WEB_DEMO_PASSPHRASE ?? DEV_DEMO_PASSPHRASE;
  const sessionSecret =
    process.env.AISE_WEB_SESSION_SECRET ?? (env === "production" ? "" : DEV_SESSION_SECRET);
  const ttlRaw = process.env.AISE_WEB_SESSION_TTL_SECONDS;
  const sessionTtlSeconds = ttlRaw !== undefined && /^\d+$/.test(ttlRaw) ? Number(ttlRaw) : 8 * 3600;
  return {
    env,
    demoUser,
    demoPassphrase,
    sessionSecret,
    sessionTtlSeconds,
  };
}
