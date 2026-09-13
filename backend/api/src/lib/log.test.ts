import { describe, expect, test } from "bun:test";
import { createLogger, type LogFields } from "./log";

interface Captured {
  lines: string[];
  write: (line: string) => void;
  entries: () => LogFields[];
}

function collector(): Captured {
  const lines: string[] = [];
  return {
    lines,
    write: (line: string) => {
      lines.push(line);
    },
    entries: () => lines.map((line) => JSON.parse(line) as LogFields),
  };
}

describe("structured logger", () => {
  test("emits one JSON line per event with level, timestamp and message", () => {
    const captured = collector();
    const logger = createLogger("debug", captured.write);
    logger.info("hello", { requestId: "req-1" });
    expect(captured.lines).toHaveLength(1);
    const entry = captured.entries()[0]!;
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("hello");
    expect(entry.requestId).toBe("req-1");
    // ISO 8601, UTC — format only, never an exact timestamp assertion.
    expect(typeof entry.timestamp).toBe("string");
    expect(entry.timestamp as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });

  test("filters events below the minimum level", () => {
    const captured = collector();
    const logger = createLogger("warn", captured.write);
    logger.debug("suppressed");
    logger.info("suppressed");
    logger.warn("kept");
    logger.error("kept");
    expect(captured.lines).toHaveLength(2);
    expect(captured.entries().map((entry) => entry.level)).toEqual(["warn", "error"]);
  });
});
