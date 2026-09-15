/**
 * Schema-validated environment configuration for the AISE backend API.
 *
 * Contract (AISE-001, extended by AISE-004; PROD-003 additive production
 * mode):
 * - hand-rolled validation, no external dependencies;
 * - aggregates EVERY invalid/missing variable before failing (never reports
 *   just the first problem);
 * - `loadConfig` fails fast with a clear message listing all issues;
 * - issue messages contain variable names and reasons only — never values —
 *   so they are safe to surface in HTTP responses and logs;
 * - `dataDir` (AISE-004) roots the capture ingestion gateway's file-system
 *   store (content blobs, session records, idempotency ledger). It is a PATH
 *   string only — this module performs no I/O; writability is established by
 *   the store implementation at construction time (fail-fast in main.ts).
 *
 * PROD-003 (additive — zero behavior change when the new variables are
 * unset): the production/serverless deployment mode. `AISE_SERVERLESS`
 * ("1"|"true") marks a serverless function deployment (the Vercel
 * catch-all): there is no bind address, so HOST/PORT remain optional
 * with their existing defaults and are simply not consumed for binding;
 * the read-only-filesystem honesty rule applies — on serverless platforms
 * (Vercel) ONLY /tmp is writable, so an UNSET `AISE_DATA_DIR` defaults to
 * `/tmp/aise-data` there instead of the cwd-relative `./data` (which would
 * make every store construction fail on a read-only fs). An explicitly set
 * `AISE_DATA_DIR` always wins, verbatim. `AISE_CORS_ORIGINS` (comma list of
 * absolute http(s) origins) is the cross-origin opt-in for the runtime CORS
 * layer — same-origin by default. These variables mirror the workspace-level
 * declarations in `tools/env-schema.ts` (which itself documents that this
 * module is the loader of record for the API process; the workspace boundary
 * gate forbids backend→tools imports, so the mirror — not an import — is the
 * established pattern for the two validation surfaces).
 */

import { isLogLevel, LOG_LEVELS, type LogLevel } from "./log";

export interface AppConfig {
  host: string;
  port: number;
  logLevel: LogLevel;
  /** Root directory for the capture store (AISE-004). Relative paths resolve against the process working directory. */
  dataDir: string;
  /** PROD-003 (additive): serverless deployment mode (`AISE_SERVERLESS=1|true`). */
  readonly serverless: boolean;
  /**
   * PROD-003 (additive): CORS allowlist (`AISE_CORS_ORIGINS`, comma-separated
   * absolute http(s) origins, normalized). Empty means same-origin only.
   */
  readonly corsOrigins: readonly string[];
}

export type ConfigResult =
  | { ok: true; config: AppConfig }
  | { ok: false; issues: string[] };

/** Anything that can be read like process.env. */
export type EnvRecord = Record<string, string | undefined>;

/** Live environment source — lets tests inject deterministic environments. */
export type EnvSource = () => EnvRecord;

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8080;
const DEFAULT_LOG_LEVEL: LogLevel = "info";
const DEFAULT_DATA_DIR = "./data";
// PROD-003: the serverless default data dir. On Vercel functions the deployment
// bundle is read-only; /tmp is the only writable directory (it persists per warm
// instance and is fresh on cold starts — durable artifacts are PROD-006's R2
// concern, NOT a filesystem promise). Kept as a literal (not os.tmpdir()) so
// validation stays a pure function of the injected env record.
const DEFAULT_SERVERLESS_DATA_DIR = "/tmp/aise-data";

const PORT_ISSUE = "PORT: expected an integer between 1 and 65535";
const HOST_ISSUE = "HOST: expected a hostname or IP address";
const LOG_LEVEL_ISSUE = `LOG_LEVEL: expected one of ${LOG_LEVELS.join("|")}`;
const DATA_DIR_ISSUE = "AISE_DATA_DIR: expected a non-empty directory path";
const SERVERLESS_ISSUE = "AISE_SERVERLESS: expected 1|true|0|false";
const CORS_ORIGINS_ISSUE =
  "AISE_CORS_ORIGINS: expected a comma-separated list of absolute http(s) origins (https://host[:port])";

function parsePort(value: string | undefined, issues: string[]): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }
  // Present-but-empty is a misconfiguration, not "unset".
  if (!/^\d+$/.test(value)) {
    issues.push(PORT_ISSUE);
    return DEFAULT_PORT;
  }
  const port = Number.parseInt(value, 10);
  if (port < 1 || port > 65535) {
    issues.push(PORT_ISSUE);
    return DEFAULT_PORT;
  }
  return port;
}

function parseHost(value: string | undefined, issues: string[]): string {
  if (value === undefined) {
    return DEFAULT_HOST;
  }
  // Present-but-empty is a misconfiguration, not "unset".
  if (value === "" || !/^[A-Za-z0-9.:-]+$/.test(value)) {
    issues.push(HOST_ISSUE);
    return DEFAULT_HOST;
  }
  return value;
}

function parseLogLevel(value: string | undefined, issues: string[]): LogLevel {
  if (value === undefined) {
    return DEFAULT_LOG_LEVEL;
  }
  const normalized = value.toLowerCase();
  if (!isLogLevel(normalized)) {
    issues.push(LOG_LEVEL_ISSUE);
    return DEFAULT_LOG_LEVEL;
  }
  return normalized;
}

// PROD-003 (additive): parse the serverless deployment flag. Unset → false;
// "1"/"true" (case-insensitive) → true; "0"/"false" → false; anything else
// (including present-but-empty, mirroring the HOST/PORT discipline) is a
// misconfiguration, never an unset value.
function parseServerless(value: string | undefined, issues: string[]): boolean {
  if (value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") {
    return true;
  }
  if (normalized === "0" || normalized === "false") {
    return false;
  }
  issues.push(SERVERLESS_ISSUE);
  return false;
}

/** True when `value` is an absolute http(s) origin (scheme://host[:port], no path/query/fragment/credentials). */
function isAbsoluteOrigin(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === ""
  );
}

// PROD-003 (additive): parse the CORS allowlist. Unset → []. Present values are
// split on commas, trimmed and NORMALIZED to `URL.origin` (lower-cases the
// host, drops any trailing slash) so allowlist matching is exact; duplicates
// collapse to their first occurrence (deterministic order). Items that are not
// absolute http(s) origins — including empty items from stray commas — make
// the whole variable invalid (an allowlist that silently ignored junk would
// be a security lie). The issue never echoes the offending value.
function parseCorsOrigins(value: string | undefined, issues: string[]): string[] {
  if (value === undefined) {
    return [];
  }
  const origins: string[] = [];
  for (const item of value.split(",")) {
    const trimmed = item.trim();
    if (!isAbsoluteOrigin(trimmed)) {
      issues.push(CORS_ORIGINS_ISSUE);
      return [];
    }
    const normalized = new URL(trimmed).origin;
    if (!origins.includes(normalized)) {
      origins.push(normalized);
    }
  }
  return origins;
}

function parseDataDir(
  value: string | undefined,
  serverless: boolean,
  issues: string[],
): string {
  if (value === undefined) {
    // PROD-003: serverless deployments default to the tmp-fs data dir (the
    // only writable directory on Vercel functions); local runs keep the
    // cwd-relative default.
    return serverless ? DEFAULT_SERVERLESS_DATA_DIR : DEFAULT_DATA_DIR;
  }
  // Present-but-empty (or whitespace-only, or non-string junk injected by a
  // misbehaving env source) is a misconfiguration, not "unset" — mirrors the
  // HOST/PORT discipline. The accepted value is never rewritten, only its
  // emptiness is tested.
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(DATA_DIR_ISSUE);
    return serverless ? DEFAULT_SERVERLESS_DATA_DIR : DEFAULT_DATA_DIR;
  }
  return value;
}

/**
 * Validate an environment record. Returns every issue at once; issue strings
 * name the variable and the expectation, never the provided value.
 */
export function validateEnv(env: EnvRecord): ConfigResult {
  const issues: string[] = [];
  // PROD-003 (additive): resolved first so the data-dir default can depend
  // on the deployment mode.
  const serverless = parseServerless(env.AISE_SERVERLESS, issues);
  const config: AppConfig = {
    host: parseHost(env.HOST, issues),
    port: parsePort(env.PORT, issues),
    logLevel: parseLogLevel(env.LOG_LEVEL, issues),
    dataDir: parseDataDir(env.AISE_DATA_DIR, serverless, issues),
    serverless,
    corsOrigins: parseCorsOrigins(env.AISE_CORS_ORIGINS, issues),
  };
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, config };
}

/** Error thrown by `loadConfig` when the environment is invalid. */
export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(formatIssues(issues));
    this.name = "ConfigError";
  }
}

export function formatIssues(issues: string[]): string {
  return ["Invalid environment configuration:"]
    .concat(issues.map((issue) => `  - ${issue}`))
    .join("\n");
}

/**
 * Load and validate configuration, failing fast with every issue listed.
 * `env` defaults to the live process environment.
 */
export function loadConfig(env: EnvRecord = process.env): AppConfig {
  const result = validateEnv(env);
  if (!result.ok) {
    throw new ConfigError(result.issues);
  }
  return result.config;
}

/**
 * PROD-003: the data-dir resolution used by the runtime entry factory — the
 * single documented rule for where file-system state roots on each deployment
 * mode, INCLUDING the invalid-env fallback (a misconfigured AISE_DATA_DIR
 * still resolves to the mode default so the serverless function can boot and
 * report its config issues honestly through /readyz instead of crashing
 * opaquely at cold start). Pure: a function of the env record only.
 */
export function resolveDataDir(env: EnvRecord): string {
  const issues: string[] = [];
  const serverless = parseServerless(env.AISE_SERVERLESS, issues);
  return parseDataDir(env.AISE_DATA_DIR, serverless, issues);
}
