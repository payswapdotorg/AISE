/**
 * Declared environment schema for the AISE workspace runtime (PROD-001).
 *
 * This module is the PROD-001 declaration of which environment variables the
 * LOCAL application runtime consumes, in which mode each is required, and how
 * each value must be shaped. It mirrors — and deliberately does not replace —
 * the backend API's own configuration authority in
 * `backend/api/src/lib/config.ts` (AISE-001/AISE-004): the API remains the
 * loader of record for its process; this schema is the workspace-level
 * pre-flight gate that root scripts (`check:env`, `dev`, `start`, `smoke`)
 * run BEFORE launching anything.
 *
 * Determinism contract (PROD-001):
 * - pure function of the env record and the mode — no I/O, no clock, no
 *   randomness; the same input always yields the same report;
 * - issue strings name the variable and the expectation, NEVER the value
 *   (mirroring the API config discipline), so they are safe to print anywhere;
 * - missing OPTIONAL provider credentials are reported as
 *   `disabled (optional)` and are never an error;
 * - a missing required variable (mode-dependent) or a malformed value is a
 *   deterministic failure with a precise, actionable message.
 *
 * Modes:
 * - `dev`: the local development runtime (`bun run dev`). Every core variable
 *   has a documented default; only malformed values fail.
 * - `start`: the production-like local start (`bun run start`). The capture
 *   data directory MUST be explicitly set — a production-like start refuses
 *   to rely on the silent `./data` default (deterministic failure beats a
 *   silent, cwd-dependent default; see docs/INSTALL.md).
 */

export type ValidationMode = "dev" | "start";

export const VALIDATION_MODES: readonly ValidationMode[] = ["dev", "start"] as const;

export type EnvFormat =
  | "port"
  | "host"
  | "log-level"
  | "path"
  | "secret"
  | "auth-toggle"
  | "auth-mode"
  | "ttl-seconds"
  | "identifier";

/** Anything that can be read like process.env. */
export type EnvRecord = Record<string, string | undefined>;

export interface EnvVarRule {
  readonly name: string;
  readonly description: string;
  /** Which workspace consumes the value (documentation surface only). */
  readonly consumer: string;
  readonly format: EnvFormat;
  /** Documented fallback per mode. Empty string for modes where the var is required. */
  readonly defaults: Readonly<Record<ValidationMode, string>>;
  /** Modes in which the variable must be explicitly set. */
  readonly requiredIn: readonly ValidationMode[];
  /**
   * Optional provider credential. Missing is never an error: it is reported as
   * `disabled (optional)`. Present-but-empty IS an error (malformed).
   */
  readonly optionalProvider?: boolean;
  /**
   * PROD-004: the variable is required only when another toggle variable is
   * ENABLED (e.g. AUTH_SECRET is required when AISE_AUTH=1|true). While the
   * toggle is unset or disabled, a missing value is a documented default —
   * never an error. Mirrors the backend auth layer's own fail-closed config
   * semantics (backend/api/src/auth/config.ts — three validation surfaces,
   * one documented rule).
   */
  readonly requiredWhen?: {
    readonly variable: string;
    readonly enabledValues: readonly string[];
  };
}

/**
 * The declared schema. Only variables actually consumed by the current
 * runtime are listed. Future productization items (Neon/R2/Upstash/Apify —
 * PROD-005..PROD-008) extend this list when their consumers land; until then
 * they appear only as commented placeholders in `.env.example`.
 */
export const ENV_RULES: readonly EnvVarRule[] = [
  {
    name: "HOST",
    description: "API bind hostname or IP address",
    consumer: "backend/api (AISE-001 contract)",
    format: "host",
    defaults: { dev: "127.0.0.1", start: "127.0.0.1" },
    requiredIn: [],
  },
  {
    name: "PORT",
    description: "API HTTP port",
    consumer: "backend/api (AISE-001 contract)",
    format: "port",
    defaults: { dev: "8080", start: "8080" },
    requiredIn: [],
  },
  {
    name: "LOG_LEVEL",
    description: "API log level",
    consumer: "backend/api (AISE-001 contract)",
    format: "log-level",
    defaults: { dev: "info", start: "info" },
    requiredIn: [],
  },
  {
    name: "AISE_DATA_DIR",
    description: "API capture-store root directory (content blobs, sessions, idempotency ledger)",
    consumer: "backend/api (AISE-004 contract)",
    format: "path",
    defaults: { dev: "./data", start: "" },
    requiredIn: ["start"],
  },
  {
    name: "AISE_WEB_PORT",
    description: "Web dev-server port (production-like preview when unset: 4173)",
    consumer: "apps/web (vite.config.ts)",
    format: "port",
    defaults: { dev: "5173", start: "4173" },
    requiredIn: [],
  },
  {
    name: "WORLDSCULPT_API_KEY",
    description: "WorldSculpt reconstruction provider API key (optional provider)",
    consumer: "backend/api reconstruction adapter (optional provider)",
    format: "secret",
    defaults: { dev: "", start: "" },
    requiredIn: [],
    optionalProvider: true,
  },
  {
    name: "AISE_AUTH",
    description: "Enable the auth/tenant-safety layer (1|true; 0|false/unset = disabled, zero behavior change)",
    consumer: "backend/api auth layer (PROD-004 contract)",
    format: "auth-toggle",
    defaults: { dev: "unset (auth layer disabled)", start: "unset (auth layer disabled)" },
    requiredIn: [],
  },
  {
    name: "AUTH_SECRET",
    description: "HMAC key for session tokens — REQUIRED when AISE_AUTH=1, never committed, never echoed",
    consumer: "backend/api auth layer (PROD-004 contract)",
    format: "secret",
    defaults: { dev: "", start: "" },
    requiredIn: [],
    requiredWhen: { variable: "AISE_AUTH", enabledValues: ["1", "true"] },
  },
  {
    name: "AISE_AUTH_MODE",
    description: "Auth mode: required (every /v1 request needs a session) | demo-open (anonymous demo-tenant reads)",
    consumer: "backend/api auth layer (PROD-004 contract)",
    format: "auth-mode",
    defaults: { dev: "demo-open", start: "demo-open" },
    requiredIn: [],
  },
  {
    name: "AISE_SESSION_TTL_SECONDS",
    description: "Session lifetime in seconds (60..2592000; default 604800 = 7 days)",
    consumer: "backend/api auth layer (PROD-004 contract)",
    format: "ttl-seconds",
    defaults: { dev: "604800", start: "604800" },
    requiredIn: [],
  },
  {
    name: "AISE_DEMO_PRINCIPAL",
    description: "The deterministic demo principal id the 'Enter demo' path mints a session for",
    consumer: "backend/api auth layer (PROD-004 contract)",
    format: "identifier",
    defaults: { dev: "demo-evaluator", start: "demo-evaluator" },
    requiredIn: [],
  },
] as const;

const LOG_LEVELS: readonly string[] = ["debug", "info", "warn", "error"];

const AUTH_MODE_VALUES: readonly string[] = ["required", "demo-open"];
const AUTH_TOGGLE_VALUES: readonly string[] = ["1", "true", "0", "false"];
const MIN_SESSION_TTL_SECONDS = 60;
const MAX_SESSION_TTL_SECONDS = 2_592_000;

const FORMAT_EXPECTATIONS: Readonly<Record<EnvFormat, string>> = {
  port: "expected an integer between 1 and 65535",
  host: "expected a hostname or IP address",
  "log-level": "expected one of debug|info|warn|error",
  path: "expected a non-empty directory path",
  secret: "expected a non-empty value",
  "auth-toggle": "expected 1|true|0|false",
  "auth-mode": "expected required|demo-open",
  "ttl-seconds": "expected an integer between 60 and 2592000 (seconds)",
  identifier: "expected a non-empty value (1..256 characters)",
};

export function formatExpectation(format: EnvFormat): string {
  return FORMAT_EXPECTATIONS[format];
}

/**
 * Shape check for a single value. Mirrors the API's config discipline:
 * present-but-empty is a misconfiguration, not "unset"; the check never
 * inspects or leaks the value itself.
 */
export function isFormatValid(format: EnvFormat, value: string): boolean {
  switch (format) {
    case "port":
      if (!/^\d+$/.test(value)) {
        return false;
      }
      {
        const port = Number.parseInt(value, 10);
        return port >= 1 && port <= 65535;
      }
    case "host":
      return value !== "" && /^[A-Za-z0-9.:-]+$/.test(value);
    case "log-level":
      return LOG_LEVELS.includes(value.toLowerCase());
    case "path":
      return value.trim() !== "";
    case "secret":
      return value.trim() !== "";
    case "auth-toggle":
      return AUTH_TOGGLE_VALUES.includes(value.trim().toLowerCase());
    case "auth-mode":
      return AUTH_MODE_VALUES.includes(value.trim().toLowerCase());
    case "ttl-seconds": {
      if (!/^\d+$/.test(value.trim())) {
        return false;
      }
      const ttl = Number.parseInt(value.trim(), 10);
      return ttl >= MIN_SESSION_TTL_SECONDS && ttl <= MAX_SESSION_TTL_SECONDS;
    }
    case "identifier": {
      const trimmed = value.trim();
      return trimmed.length >= 1 && trimmed.length <= 256;
    }
  }
}

/** True when a toggle variable is set to one of its enabled values (PROD-004). */
function isToggleEnabled(
  env: EnvRecord,
  toggle: { readonly variable: string; readonly enabledValues: readonly string[] },
): boolean {
  const value = env[toggle.variable];
  return (
    value !== undefined && toggle.enabledValues.includes(value.trim().toLowerCase())
  );
}

export type CheckStatus =
  | "ok"
  | "ok-default"
  | "enabled-optional"
  | "disabled-optional"
  | "missing"
  | "invalid";

export interface EnvCheck {
  readonly name: string;
  readonly status: CheckStatus;
  /**
   * Human-readable detail. For `ok` on non-secret formats this is the
   * effective value; secrets are never echoed. For failures this repeats the
   * actionable issue text.
   */
  readonly detail: string;
}

export interface EnvReport {
  readonly mode: ValidationMode;
  readonly checks: readonly EnvCheck[];
  /** Precise, actionable issue strings (`VAR: expectation`) — never values. */
  readonly issues: readonly string[];
  readonly ok: boolean;
}

const MISSING_REQUIRED_DETAIL: Readonly<Record<ValidationMode, string>> = {
  dev: "required in mode 'dev' — set it in the repository root .env file (see docs/INSTALL.md)",
  start: "required for production-like start (mode 'start') — set it in the repository root .env file (see docs/INSTALL.md)",
};

function requiredInMode(rule: EnvVarRule, mode: ValidationMode): boolean {
  return rule.requiredIn.includes(mode);
}

/** Evaluate an env record against the declared schema. Pure and deterministic. */
export function evaluateEnv(env: EnvRecord, mode: ValidationMode): EnvReport {
  const checks: EnvCheck[] = [];
  const issues: string[] = [];

  for (const rule of ENV_RULES) {
    const value = env[rule.name];
    if (value === undefined) {
      if (requiredInMode(rule, mode)) {
        const issue = `${rule.name}: ${MISSING_REQUIRED_DETAIL[mode]}`;
        issues.push(issue);
        checks.push({ name: rule.name, status: "missing", detail: issue });
        continue;
      }
      if (rule.optionalProvider === true) {
        checks.push({ name: rule.name, status: "disabled-optional", detail: "disabled (optional)" });
        continue;
      }
      if (rule.requiredWhen !== undefined && isToggleEnabled(env, rule.requiredWhen)) {
        // PROD-004 required-when-enabled semantics: enabling the auth layer
        // makes its secret REQUIRED — a deterministic failure naming the
        // variable and the expectation, never the value.
        const issue = `${rule.name}: required when ${rule.requiredWhen.variable}=1 — set it to a long random string (see docs/INSTALL.md §Auth)`;
        issues.push(issue);
        checks.push({ name: rule.name, status: "missing", detail: issue });
        continue;
      }
      if (rule.requiredWhen !== undefined) {
        checks.push({
          name: rule.name,
          status: "ok-default",
          detail: `not required while ${rule.requiredWhen.variable} is unset or disabled`,
        });
        continue;
      }
      checks.push({
        name: rule.name,
        status: "ok-default",
        detail: `default: ${rule.defaults[mode]}`,
      });
      continue;
    }

    if (!isFormatValid(rule.format, value)) {
      const issue = `${rule.name}: ${FORMAT_EXPECTATIONS[rule.format]}`;
      issues.push(issue);
      checks.push({ name: rule.name, status: "invalid", detail: issue });
      continue;
    }

    if (rule.optionalProvider === true) {
      checks.push({ name: rule.name, status: "enabled-optional", detail: "enabled (optional provider)" });
      continue;
    }
    // Non-secret values are echoed so the operator sees the effective config;
    // secrets never are (a set secret reports "set", nothing more).
    checks.push({
      name: rule.name,
      status: "ok",
      detail: rule.format === "secret" ? "set (value hidden)" : value,
    });
  }

  return { mode, checks, issues, ok: issues.length === 0 };
}
