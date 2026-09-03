import { describe, expect, it } from "vitest";
import { createLogger, type LogFields, type Logger } from "./logger.js";

const FIXED_TS = "2026-01-01T00:00:00.000Z";

interface Captured {
  lines: string[];
  records: Record<string, unknown>[];
  logger: Logger;
}

function captureLogger(level: "debug" | "info" | "warn" | "error", moduleName?: string): Captured {
  const captured: Captured = { lines: [], records: [], logger: null as unknown as Logger };
  captured.logger = createLogger({
    level,
    ...(moduleName !== undefined ? { module: moduleName } : {}),
    sink: (line) => {
      captured.lines.push(line);
      captured.records.push(JSON.parse(line) as Record<string, unknown>);
    },
    now: () => FIXED_TS,
  });
  return captured;
}

describe("createLogger", () => {
  it("emits a single JSON line with ts, level, msg and module", () => {
    const captured = captureLogger("info", "api");
    captured.logger.info("api.listening", { port: 8080 });

    expect(captured.lines).toHaveLength(1);
    expect(captured.records[0]).toEqual({
      ts: FIXED_TS,
      level: "info",
      msg: "api.listening",
      module: "api",
      port: 8080,
    });
  });

  it("suppressed records below the configured level emit nothing", () => {
    const captured = captureLogger("info");
    captured.logger.debug("worker.poll");
    expect(captured.lines).toHaveLength(0);
  });

  it("emits higher-severity records at lower thresholds", () => {
    const captured = captureLogger("debug");
    captured.logger.warn("degraded");
    expect(captured.records[0]?.level).toBe("warn");
  });

  it("redacts sensitive-looking field names at any nesting depth", () => {
    const captured = captureLogger("info", "test");
    const fields: LogFields = {
      username: "engineer",
      password: "hunter2",
      nested: {
        apiToken: "abc123",
        authorization: "Bearer xyz",
        safe: "kept",
        list: [{ SECRET: "top" }, { ok: "fine" }],
      },
    };
    captured.logger.info("event", fields);

    const record = captured.records[0] as {
      username: string;
      password: string;
      nested: {
        apiToken: string;
        authorization: string;
        safe: string;
        list: { SECRET: string; ok: string }[];
      };
    };
    expect(record.username).toBe("engineer");
    expect(record.password).toBe("[REDACTED]");
    expect(record.nested.apiToken).toBe("[REDACTED]");
    expect(record.nested.authorization).toBe("[REDACTED]");
    expect(record.nested.safe).toBe("kept");
    expect(record.nested.list[0]?.SECRET).toBe("[REDACTED]");
    expect(record.nested.list[1]?.ok).toBe("fine");
  });

  it("keeps arrays and nested objects intact for non-sensitive data", () => {
    const captured = captureLogger("info", "test");
    captured.logger.info("summary", { errors: ["a", "b"], counts: { ok: 1, bad: 2 } });
    const record = captured.records[0] as { errors: string[]; counts: { ok: number; bad: number } };
    expect(record.errors).toEqual(["a", "b"]);
    expect(record.counts).toEqual({ ok: 1, bad: 2 });
  });

  it("degrades gracefully on unserializable fields instead of throwing", () => {
    const captured = captureLogger("info", "test");
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    expect(() => captured.logger.info("event", { payload: circular })).not.toThrow();
    expect(captured.records[0]?.log_failure).toBe("unserializable_fields");
    expect(captured.records[0]?.msg).toBe("event");
  });

  it("reserved keys win over caller-supplied fields", () => {
    const captured = captureLogger("info", "real-module");
    captured.logger.info("real.message", { msg: "spoofed", level: "debug", module: "spoofed" });
    const record = captured.records[0] as Record<string, unknown>;
    expect(record.msg).toBe("real.message");
    expect(record.level).toBe("info");
    expect(record.module).toBe("real-module");
  });

  it("child loggers compose module names with dot separation", () => {
    const captured = captureLogger("info", "worker");
    const child = captured.logger.child("job");
    child.info("job.completed");

    expect(captured.records[0]?.module).toBe("worker.job");
    expect(captured.records[0]?.msg).toBe("job.completed");
  });

  it("a logger without a module omits the module key", () => {
    const captured = captureLogger("error");
    captured.logger.error("bare");
    expect(captured.records[0]).not.toHaveProperty("module");
    expect(captured.records[0]?.level).toBe("error");
  });
});
