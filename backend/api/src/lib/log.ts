/**
 * Structured JSON logger for the AISE backend API.
 *
 * Contract (AISE-001):
 * - one JSON object per line on stdout;
 * - fields: level, timestamp (ISO 8601, UTC), message, plus arbitrary fields;
 * - no console.* usage is permitted outside this module (enforced by ESLint);
 * - correlation ids travel as a regular field (convention: `requestId`).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"] as const;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

function writeStdout(line: string): void {
  process.stdout.write(line + "\n");
}

/**
 * Create a logger that emits JSON lines at or above `minLevel`.
 * `write` is injectable so tests can capture output deterministically.
 */
export function createLogger(
  minLevel: LogLevel = "info",
  write: (line: string) => void = writeStdout,
): Logger {
  const emit = (level: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) {
      return;
    }
    write(
      JSON.stringify({
        level,
        timestamp: new Date().toISOString(),
        message,
        ...fields,
      }),
    );
  };

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
  };
}
