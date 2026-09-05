/**
 * Export-DXF service composition tests (AISE-019).
 *
 * Bounded-compute limits and the self-conformance check flow
 * into the export entry point; the surface exposes the
 * deterministic serialization API only and logs per-call
 * observability without payload logging.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import { project2d } from "@aise/backend-export-2d";
import {
  buildExportDxfService,
  DEFAULT_MAX_PRIMITIVES,
  DEFAULT_MAX_OUTPUT_BYTES,
} from "./runtime.js";
import { toExportDxfError } from "./errors.js";
import { dxfOf } from "./dxf.js";
import { validateDxf } from "./validate.js";
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";

const CONFIG = {
  env: "test",
  logLevel: "error",
} as unknown as AiseConfig;

const LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Logger;

const TARGET = { modelId: "model-golden", projectId: "project-golden", spaceId: "room-golden" };

function goldenPlan() {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  const graph = ingestArchitecturalScene(scene, TARGET).graph;
  return project2d(graph, { kind: "plan" });
}

function capture(action: () => unknown): ReturnType<typeof toExportDxfError> {
  try {
    action();
  } catch (error) {
    return toExportDxfError(error);
  }
  return null;
}

describe("buildExportDxfService", () => {
  it("builds with production defaults and exposes the limits", () => {
    const service = buildExportDxfService(CONFIG, LOGGER);
    expect(service.limits.maxPrimitives).toBe(DEFAULT_MAX_PRIMITIVES);
    expect(service.limits.maxPrimitives).toBe(100_000);
    expect(service.limits.maxOutputBytes).toBe(DEFAULT_MAX_OUTPUT_BYTES);
    expect(service.limits.maxOutputBytes).toBe(64 * 1024 * 1024);
  });

  it("exports the golden plan through the service surface (validated before return)", () => {
    const service = buildExportDxfService(CONFIG, LOGGER);
    const plan = goldenPlan();
    const result = service.exportDxf(plan);
    expect(result.counts.primitives).toBe(8);
    expect(validateDxf(result.text).ok).toBe(true);
    // Service output is the pure serialization's output, verbatim.
    expect(result.text).toBe(dxfOf(plan).text);
  });

  it("enforces the primitive cap (fail closed before any serialization work)", () => {
    const service = buildExportDxfService(CONFIG, LOGGER, { maxPrimitives: 4 });
    const error = capture(() => service.exportDxf(goldenPlan()));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details.primitives).toBe(8);
    expect(error?.details.cap).toBe(4);
    expect(error?.retryable).toBe(false);
  });

  it("enforces the output byte cap (fail closed after serialization, before return)", () => {
    const service = buildExportDxfService(CONFIG, LOGGER, { maxOutputBytes: 64 });
    const error = capture(() => service.exportDxf(goldenPlan()));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details.byteLength).toBeGreaterThan(64);
    expect(error?.details.cap).toBe(64);
  });

  it("invalid limits fail at build time", () => {
    for (const bad of [
      { maxPrimitives: 0 },
      { maxPrimitives: -1 },
      { maxPrimitives: 1.5 },
      { maxOutputBytes: 0 },
      { maxOutputBytes: -1 },
      { maxOutputBytes: 1.5 },
    ]) {
      expect(() => buildExportDxfService(CONFIG, LOGGER, bad)).toThrow();
    }
  });

  it("emits a structured debug record per export (observability, no payload logging)", () => {
    const records: { msg: string; fields: Record<string, unknown> }[] = [];
    const recordingLogger = {
      debug: (msg: string, fields: Record<string, unknown>) => records.push({ msg, fields }),
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as Logger;
    const service = buildExportDxfService(CONFIG, recordingLogger);
    const plan = goldenPlan();
    service.exportDxf(plan);
    expect(records).toHaveLength(1);
    expect(records[0]!.msg).toBe("exportdxf.exported");
    expect(records[0]!.fields.modelId).toBe("model-golden");
    expect(records[0]!.fields.graphDigest).toBe(plan.graphDigest);
    expect(records[0]!.fields.view).toBe("plan");
    expect(records[0]!.fields.primitives).toBe(8);
    expect(records[0]!.fields.bytes).toBeGreaterThan(0);
    // No payload logging: the DXF text itself never appears.
    expect(String(records[0]!.fields.bytes)).not.toContain("LWPOLYLINE");
    expect(Object.keys(records[0]!.fields)).not.toContain("text");
  });
});
