/**
 * Schema-validated environment configuration for the AISE backend API.
 *
 * Contract (AISE-001, extended by AISE-004):
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
 */

import { isLogLevel, LOG_LEVELS, type LogLevel } from "./log";

export interface AppConfig {
  host: string;
  port: number;
  logLevel: LogLevel;
  /** Root directory for the capture store (AISE-004). Relative paths resolve against the process working directory. */
  dataDir: string;
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

const PORT_ISSUE = "PORT: expected an integer between 1 and 65535";
const HOST_ISSUE = "HOST: expected a hostname or IP address";
const LOG_LEVEL_ISSUE = `LOG_LEVEL: expected one of ${LOG_LEVELS.join("|")}`;
const DATA_DIR_ISSUE = "AISE_DATA_DIR: expected a non-empty directory path";

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

function parseDataDir(value: string | undefined, issues: string[]): string {
  if (value === undefined) {
    return DEFAULT_DATA_DIR;
  }
  // Present-but-empty (or whitespace-only, or non-string junk injected by a
  // misbehaving env source) is a misconfiguration, not "unset" — mirrors the
  // HOST/PORT discipline. The accepted value is never rewritten, only its
  // emptiness is tested.
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(DATA_DIR_ISSUE);
    return DEFAULT_DATA_DIR;
  }
  return value;
}

/**
 * Validate an environment record. Returns every issue at once; issue strings
 * name the variable and the expectation, never the provided value.
 */
export function validateEnv(env: EnvRecord): ConfigResult {
  const issues: string[] = [];
  const config: AppConfig = {
    host: parseHost(env.HOST, issues),
    port: parsePort(env.PORT, issues),
    logLevel: parseLogLevel(env.LOG_LEVEL, issues),
    dataDir: parseDataDir(env.AISE_DATA_DIR, issues),
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
