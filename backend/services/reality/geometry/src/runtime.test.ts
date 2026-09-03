/**
 * Runtime composition tests (AISE-009): production defaults, the
 * bounded-compute guard, and the service composition contract.
 */
import { describe, expect, it } from "vitest";
import { buildGeometryService } from "./runtime.js";
import { createLogger } from "@aise/backend-logging";
import { exactCylinderPoints, exactPlanePoints } from "./fixtures/golden.js";
import { GeometryError } from "./errors.js";
import type { AiseConfig } from "@aise/backend-config";

function testConfig(): AiseConfig {
  return {
    env: "test",
    logLevel: "error",
    http: { host: "127.0.0.1", port: 3001 },
    worker: { pollIntervalMs: 1000 },
  } as unknown as AiseConfig;
}

function testLogger() {
  return createLogger({ level: "error", module: "geometry-test" });
}

describe("geometry service composition", () => {
  it("builds with production defaults and exposes the measurement surface", () => {
    const service = buildGeometryService(testConfig(), testLogger());
    expect(service.limits.maxFitPoints).toBe(10000);
    expect(typeof service.fit.plane).toBe("function");
    expect(typeof service.fit.planeRobust).toBe("function");
    expect(typeof service.fit.cylinder).toBe("function");
    expect(typeof service.fit.cylinderRobust).toBe("function");
  });

  it("wires the bounded-compute cap into cylinder fits", () => {
    const service = buildGeometryService(testConfig(), testLogger(), { maxFitPoints: 500 });
    expect(() => service.fit.cylinder({ points: exactCylinderPoints(), unit: "meter" })).not.toThrow();
    const tooMany = Array.from({ length: 501 }, (_, i) => ({
      x: Math.cos(i * 0.01),
      y: Math.sin(i * 0.01),
      z: i * 0.02,
    }));
    expect(() => service.fit.cylinder({ points: tooMany, unit: "meter" })).toThrow(GeometryError);
  });

  it("rejects invalid maxFitPoints configuration (fail closed)", () => {
    expect(() => buildGeometryService(testConfig(), testLogger(), { maxFitPoints: 0 })).toThrow();
    expect(() => buildGeometryService(testConfig(), testLogger(), { maxFitPoints: 1.5 })).toThrow();
  });

  it("service-bound fits carry the full evidence chain", () => {
    const service = buildGeometryService(testConfig(), testLogger());
    const result = service.fit.plane({ points: exactPlanePoints(), unit: "meter" });
    expect(result.epistemic).toBe("INFERRED");
    expect(result.provenance.serviceId).toBe("aise.geometry");
    expect(result.residualStats.count).toBe(exactPlanePoints().length);
  });
});
