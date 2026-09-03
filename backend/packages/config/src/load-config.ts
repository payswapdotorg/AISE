import type { LogLevel } from "@aise/backend-logging";

/**
 * Deployment environment. Required at boot: services refuse to guess.
 */
export type AiseEnv = "development" | "test" | "production";

export interface AiseApiConfig {
  readonly host: string;
  readonly port: number;
}

export interface AiseWorkerConfig {
  readonly pollIntervalMs: number;
}

/**
 * Fully validated runtime configuration for AISE backend services.
 * Values marked optional in the environment are materialised with defaults,
 * so consumers never see `undefined` configuration.
 */
export interface AiseConfig {
  readonly env: AiseEnv;
  readonly logLevel: LogLevel;
  readonly api: AiseApiConfig;
  readonly worker: AiseWorkerConfig;
}

export interface LoadConfigSuccess {
  readonly ok: true;
  readonly config: AiseConfig;
}

export interface LoadConfigFailure {
  readonly ok: false;
  /** All validation problems, never just the first one. */
  readonly errors: readonly string[];
}

export type LoadConfigResult = LoadConfigSuccess | LoadConfigFailure;

const AISE_ENV_VALUES: readonly AiseEnv[] = ["development", "test", "production"];
const LOG_LEVEL_VALUES: readonly LogLevel[] = ["debug", "info", "warn", "error"];

const DEFAULT_LOG_LEVEL: LogLevel = "info";
const DEFAULT_API_HOST = "127.0.0.1";
const DEFAULT_API_PORT = 8080;
const DEFAULT_WORKER_POLL_INTERVAL_MS = 1000;

const API_PORT_MIN = 1;
const API_PORT_MAX = 65535;
const WORKER_POLL_INTERVAL_MIN_MS = 50;
const WORKER_POLL_INTERVAL_MAX_MS = 600_000;

const AISE_ENV_REQUIRED_MESSAGE =
  "AISE_ENV is required (one of: development | test | production) — refusing to start with unknown configuration";

type EnvInput = Record<string, string | undefined>;

/**
 * Loads and validates AISE runtime configuration from the given environment
 * (pass `process.env` in production code, plain objects in tests).
 *
 * Missing required values and invalid values produce a failure with every
 * problem listed — callers fail closed rather than partially boot. Absent
 * optional values fall back to documented defaults.
 */
export function loadConfig(input: EnvInput): LoadConfigResult {
  const errors: string[] = [];

  const envRaw = input["AISE_ENV"];
  const env = readEnum(input, "AISE_ENV", AISE_ENV_VALUES, errors);
  if (env === undefined && (envRaw === undefined || envRaw.trim() === "")) {
    errors.push(AISE_ENV_REQUIRED_MESSAGE);
  }

  const logLevel = readEnum(input, "AISE_LOG_LEVEL", LOG_LEVEL_VALUES, errors) ?? DEFAULT_LOG_LEVEL;
  const apiHost = readString(input, "AISE_API_HOST") ?? DEFAULT_API_HOST;
  const apiPort = readInt(input, "AISE_API_PORT", API_PORT_MIN, API_PORT_MAX, errors) ?? DEFAULT_API_PORT;
  const pollIntervalMs =
    readInt(
      input,
      "AISE_WORKER_POLL_INTERVAL_MS",
      WORKER_POLL_INTERVAL_MIN_MS,
      WORKER_POLL_INTERVAL_MAX_MS,
      errors,
    ) ?? DEFAULT_WORKER_POLL_INTERVAL_MS;

  if (errors.length > 0 || env === undefined) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      env,
      logLevel,
      api: { host: apiHost, port: apiPort },
      worker: { pollIntervalMs },
    },
  };
}

/**
 * Reads an enum-valued variable. Absent/empty values return `undefined`
 * without an error (optionality is decided by the caller); present-but-
 * invalid values record an error and return `undefined`.
 */
function readEnum<T extends string>(
  input: EnvInput,
  name: string,
  allowed: readonly T[],
  errors: string[],
): T | undefined {
  const raw = input[name];
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  if (!allowed.includes(raw as T)) {
    errors.push(`${name} must be one of: ${allowed.join(" | ")} (got "${raw}")`);
    return undefined;
  }
  return raw as T;
}

/** Reads a string variable. Absent/empty returns `undefined` (no error). */
function readString(input: EnvInput, name: string): string | undefined {
  const raw = input[name];
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  return raw;
}

/**
 * Reads an integer variable with range validation. Absent/empty returns
 * `undefined` (no error); invalid values record an error and return
 * `undefined`.
 */
function readInt(
  input: EnvInput,
  name: string,
  min: number,
  max: number,
  errors: string[],
): number | undefined {
  const raw = input[name];
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  if (!/^-?\d+$/.test(raw)) {
    errors.push(`${name} must be an integer between ${min} and ${max} (got "${raw}")`);
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  if (value < min || value > max) {
    errors.push(`${name} must be an integer between ${min} and ${max} (got ${value})`);
    return undefined;
  }
  return value;
}
