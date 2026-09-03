import process from "node:process";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY =
  /password|passwd|secret|token|authorization|credential|api[-_]?key|private[-_]?key/i;

export interface LogFields {
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a logger whose module is `<parent>.<name>`. */
  child(moduleName: string): Logger;
}

export interface LoggerOptions {
  /** Minimum level that is emitted. */
  readonly level: LogLevel;
  /** Stable component name included in every record (e.g. "api", "worker"). */
  readonly module?: string;
  /** Line sink; defaults to writing to stdout. */
  readonly sink?: (line: string) => void;
  /** Timestamp provider; injectable for deterministic tests. */
  readonly now?: () => string;
}

function redactReplacer(key: string, value: unknown): unknown {
  if (key !== "" && SENSITIVE_KEY.test(key)) {
    return REDACTED;
  }
  return value;
}

/**
 * Creates a structured JSON-lines logger.
 *
 * Every emitted record is a single JSON object containing at least `ts`,
 * `level` and `msg` (plus `module` when set). Sensitive-looking field names
 * are redacted at any depth.
 */
export function createLogger(options: LoggerOptions): Logger {
  const threshold = LEVEL_WEIGHT[options.level];
  const sink = options.sink ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = options.now ?? (() => new Date().toISOString());

  const makeLogger = (modulePath: string | undefined): Logger => {
    const emit = (level: LogLevel, message: string, fields: LogFields | undefined): void => {
      if (LEVEL_WEIGHT[level] < threshold) {
        return;
      }
      const record: Record<string, unknown> = {};
      if (fields) {
        for (const [key, value] of Object.entries(fields)) {
          record[key] = value;
        }
      }
      // Reserved keys win over caller fields.
      record.ts = now();
      record.level = level;
      record.msg = message;
      if (modulePath !== undefined && modulePath !== "") {
        record.module = modulePath;
      }
      let line: string;
      try {
        line = JSON.stringify(record, redactReplacer);
      } catch {
        line = JSON.stringify({
          ts: now(),
          level,
          msg: message,
          ...(modulePath !== undefined && modulePath !== "" ? { module: modulePath } : {}),
          log_failure: "unserializable_fields",
        });
      }
      sink(line);
    };

    return {
      debug: (message, fields) => emit("debug", message, fields),
      info: (message, fields) => emit("info", message, fields),
      warn: (message, fields) => emit("warn", message, fields),
      error: (message, fields) => emit("error", message, fields),
      child: (moduleName: string) =>
        makeLogger(modulePath ? `${modulePath}.${moduleName}` : moduleName),
    };
  };

  return makeLogger(options.module);
}
