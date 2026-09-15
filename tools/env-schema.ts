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

export type EnvFormat = "port" | "host" | "log-level" | "path" | "secret" | "bytes-cap";

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
   * PROD-006: optional GROUP membership (all-or-nothing presence check).
   * When ANY member of the group carries a value, every member with
   * `groupRequired: true` must also carry one — a half-configured group is a
   * deterministic error naming the missing members, never a silent partial
   * activation (the runtime wiring degrades loudly: /v1/artifacts answers
   * 503 while the group is half-set).
   */
  readonly optionalGroup?: string;
  /** True when this member MUST be present once its optionalGroup is active. */
  readonly groupRequired?: boolean;
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
  // PROD-006: the Cloudflare R2 artifact storage group (optional, all-or-
  // nothing). Absent → the honest local-fs development twin serves
  // /v1/artifacts (readiness says so); complete → durable R2 blob storage
  // over the S3-compatible API with the hand-rolled SigV4 signer. Values are
  // NEVER echoed (the account id and bucket name are infrastructure
  // identifiers, not operator-facing configuration).
  {
    name: "R2_ACCOUNT_ID",
    description: "Cloudflare R2 account id (durable artifact storage — optional group)",
    consumer: "backend/api artifacts (PROD-006 R2 adapter)",
    format: "secret",
    defaults: { dev: "", start: "" },
    requiredIn: [],
    optionalProvider: true,
    optionalGroup: "r2",
    groupRequired: true,
  },
  {
    name: "R2_BUCKET",
    description: "Cloudflare R2 bucket name for artifact blobs (optional group)",
    consumer: "backend/api artifacts (PROD-006 R2 adapter)",
    format: "secret",
    defaults: { dev: "", start: "" },
    requiredIn: [],
    optionalProvider: true,
    optionalGroup: "r2",
    groupRequired: true,
  },
  {
    name: "R2_ACCESS_KEY_ID",
    description: "Cloudflare R2 S3-compatible access key id (optional group)",
    consumer: "backend/api artifacts (PROD-006 SigV4 signer)",
    format: "secret",
    defaults: { dev: "", start: "" },
    requiredIn: [],
    optionalProvider: true,
    optionalGroup: "r2",
    groupRequired: true,
  },
  {
    name: "R2_SECRET_ACCESS_KEY",
    description: "Cloudflare R2 S3-compatible secret access key (optional group)",
    consumer: "backend/api artifacts (PROD-006 SigV4 signer)",
    format: "secret",
    defaults: { dev: "", start: "" },
    requiredIn: [],
    optionalProvider: true,
    optionalGroup: "r2",
    groupRequired: true,
  },
  {
    name: "R2_PUBLIC_ENDPOINT",
    description: "Optional explicit R2 endpoint URL override (defaults to the account URL)",
    consumer: "backend/api artifacts (PROD-006 R2 adapter)",
    format: "secret",
    defaults: { dev: "", start: "" },
    requiredIn: [],
    optionalProvider: true,
    optionalGroup: "r2",
    groupRequired: false,
  },
  {
    name: "AISE_ARTIFACT_MAX_BYTES",
    description: "Artifact upload size cap in bytes (large uploads are bounded and rejected, never truncated)",
    consumer: "backend/api artifacts (PROD-006 limits)",
    format: "bytes-cap",
    defaults: { dev: "26214400", start: "26214400" },
    requiredIn: [],
  },
] as const;

const LOG_LEVELS: readonly string[] = ["debug", "info", "warn", "error"];

const FORMAT_EXPECTATIONS: Readonly<Record<EnvFormat, string>> = {
  port: "expected an integer between 1 and 65535",
  host: "expected a hostname or IP address",
  "log-level": "expected one of debug|info|warn|error",
  path: "expected a non-empty directory path",
  secret: "expected a non-empty value",
  "bytes-cap": "expected an integer number of bytes between 1 and 1073741824",
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
    case "bytes-cap": {
      if (!/^\d+$/.test(value)) {
        return false;
      }
      const cap = Number.parseInt(value, 10);
      return cap >= 1 && cap <= 1024 * 1024 * 1024;
    }
  }
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

  // PROD-006: optional-group presence state (all-or-nothing). A group is
  // ACTIVE when any member carries a non-empty value; an active group with
  // missing `groupRequired` members produces one precise issue per missing
  // member (variable names only — never values).
  const activeGroups = new Set<string>();
  const missingGroupMembers = new Map<string, readonly string[]>();
  const groupMembers = new Map<string, readonly EnvVarRule[]>();
  for (const rule of ENV_RULES) {
    if (rule.optionalGroup === undefined) {
      continue;
    }
    const members = groupMembers.get(rule.optionalGroup) ?? [];
    groupMembers.set(rule.optionalGroup, [...members, rule]);
  }
  for (const [group, members] of groupMembers) {
    const anySet = members.some(
      (member) => env[member.name] !== undefined && env[member.name]?.trim() !== "",
    );
    if (!anySet) {
      continue;
    }
    activeGroups.add(group);
    const missing = members
      .filter(
        (member) =>
          member.groupRequired === true &&
          (env[member.name] === undefined || env[member.name]?.trim() === ""),
      )
      .map((member) => member.name);
    if (missing.length > 0) {
      missingGroupMembers.set(group, missing);
    }
  }

  for (const rule of ENV_RULES) {
    const value = env[rule.name];
    if (value === undefined) {
      if (requiredInMode(rule, mode)) {
        const issue = `${rule.name}: ${MISSING_REQUIRED_DETAIL[mode]}`;
        issues.push(issue);
        checks.push({ name: rule.name, status: "missing", detail: issue });
        continue;
      }
      if (rule.optionalGroup !== undefined) {
        if (activeGroups.has(rule.optionalGroup) && rule.groupRequired === true) {
          const group = missingGroupMembers.get(rule.optionalGroup) ?? [];
          const issue =
            `${rule.name}: required when the ${rule.optionalGroup} group is active — ` +
            `set all of ${group.join(", ")} or none (a half-configured group serves 503s, never a silent fallback)`;
          issues.push(issue);
          checks.push({ name: rule.name, status: "missing", detail: issue });
          continue;
        }
        checks.push({ name: rule.name, status: "disabled-optional", detail: "disabled (optional)" });
        continue;
      }
      if (rule.optionalProvider === true) {
        checks.push({ name: rule.name, status: "disabled-optional", detail: "disabled (optional)" });
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
      const detail =
        rule.optionalGroup !== undefined
          ? `enabled (optional group '${rule.optionalGroup}')`
          : "enabled (optional provider)";
      checks.push({ name: rule.name, status: "enabled-optional", detail });
      continue;
    }
    // Non-secret values are echoed so the operator sees the effective config;
    // secrets never are.
    checks.push({ name: rule.name, status: "ok", detail: value });
  }

  return { mode, checks, issues, ok: issues.length === 0 };
}
