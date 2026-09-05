/**
 * MEP service composition tests (AISE-026) — bounded compute, the
 * CRITICAL self-check, and observability without payload logging.
 */
import { describe, expect, it } from "vitest";
import { buildMepService, DEFAULT_MAX_INPUT_POINTS } from "./runtime.js";
import { reconstructPipeNetwork } from "./network.js";
import { toMepError } from "./errors.js";
import { exactPipeNetworkPoints } from "./fixtures/golden.js";
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";

const CONFIG = { env: "test", logLevel: "error" } as unknown as AiseConfig;
const LOGGER = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as Logger;

function capture(action: () => unknown): ReturnType<typeof toMepError> {
  try {
    action();
  } catch (error) {
    return toMepError(error);
  }
  return null;
}

describe("buildMepService", () => {
  it("builds with production defaults and exposes the limits", () => {
    const service = buildMepService(CONFIG, LOGGER);
    expect(service.limits.maxInputPoints).toBe(DEFAULT_MAX_INPUT_POINTS);
    expect(service.limits.maxInputPoints).toBe(2_000_000);
  });

  it("reconstructs the golden fixture through the service surface (validated before return)", () => {
    const service = buildMepService(CONFIG, LOGGER);
    const points = exactPipeNetworkPoints();
    const network = service.reconstruct({ points, unit: "meter" });
    expect(network.counts.pipes).toBe(4);
    // Service output is the pure reconstruction's output, verbatim.
    expect(JSON.stringify(network)).toBe(JSON.stringify(reconstructPipeNetwork({ points, unit: "meter" })));
  });

  it("enforces the input point cap (fail closed before any work)", () => {
    const service = buildMepService(CONFIG, LOGGER, { maxInputPoints: 100 });
    const error = capture(() => service.reconstruct({ points: exactPipeNetworkPoints(), unit: "meter" }));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details.points).toBeGreaterThan(100);
    expect(error?.retryable).toBe(false);
  });

  it("invalid limits fail at build time", () => {
    for (const bad of [{ maxInputPoints: 0 }, { maxInputPoints: -1 }, { maxInputPoints: 1.5 }]) {
      expect(() => buildMepService(CONFIG, LOGGER, bad)).toThrow();
    }
  });

  it("emits a structured debug record per reconstruction (no payload logging)", () => {
    const records: { msg: string; fields: Record<string, unknown> }[] = [];
    const recordingLogger = {
      debug: (msg: string, fields: Record<string, unknown>) => records.push({ msg, fields }),
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as Logger;
    const service = buildMepService(CONFIG, recordingLogger);
    service.reconstruct({ points: exactPipeNetworkPoints(), unit: "meter", joinTolerance: 0.3 });
    expect(records).toHaveLength(1);
    expect(records[0]!.msg).toBe("mep.reconstructed");
    expect(records[0]!.fields.pipes).toBe(4);
    expect(records[0]!.fields.junctions).toBe(3);
    expect(Object.keys(records[0]!.fields)).not.toContain("network");
  });
});
