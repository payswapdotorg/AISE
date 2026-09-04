/**
 * Export-2D service composition tests (AISE-017).
 *
 * Bounded-compute limits flow into the projection entry point;
 * the surface exposes the deterministic projection API only and
 * logs per-call observability without payload logging.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import { buildExport2dService, DEFAULT_MAX_GRAPH_OBJECTS } from "./runtime.js";
import { toExport2dError } from "./errors.js";
import { project2d } from "./project.js";
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

function goldenGraph() {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  return ingestArchitecturalScene(scene, TARGET).graph;
}

describe("buildExport2dService", () => {
  it("builds with production defaults and exposes the limits", () => {
    const service = buildExport2dService(CONFIG, LOGGER);
    expect(service.limits.maxGraphObjects).toBe(DEFAULT_MAX_GRAPH_OBJECTS);
    expect(service.limits.maxGraphObjects).toBe(100_000);
  });

  it("projects the golden graph through the service surface (plan + elevation)", () => {
    const service = buildExport2dService(CONFIG, LOGGER);
    const graph = goldenGraph();
    const plan = service.project(graph, { kind: "plan" });
    expect(plan.counts.objects).toBe(8);
    expect(plan.counts.projected).toBe(8);
    const elevation = service.project(graph, { kind: "elevation", viewDirection: { x: 0, y: 1, z: 0 } });
    expect(elevation.counts.projected).toBe(8);
    // Service output is the pure projection's output, verbatim.
    expect(JSON.stringify(plan)).toBe(JSON.stringify(project2d(graph, { kind: "plan" })));
  });

  it("enforces the graph object cap (fail closed before any projection work)", () => {
    const service = buildExport2dService(CONFIG, LOGGER, { maxGraphObjects: 1 });
    const graph = goldenGraph();
    const error = capture(() => service.project(graph, { kind: "plan" }));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details.objects).toBe(8);
    expect(error?.details.cap).toBe(1);
    expect(error?.retryable).toBe(false);
  });

  it("invalid limits fail at build time", () => {
    for (const bad of [{ maxGraphObjects: 0 }, { maxGraphObjects: -1 }, { maxGraphObjects: 1.5 }]) {
      expect(() => buildExport2dService(CONFIG, LOGGER, bad)).toThrow();
    }
  });

  it("emits a structured debug record per projection (observability, no payload logging)", () => {
    const records: { msg: string; fields: Record<string, unknown> }[] = [];
    const recordingLogger = {
      debug: (msg: string, fields: Record<string, unknown>) => records.push({ msg, fields }),
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as Logger;
    const service = buildExport2dService(CONFIG, recordingLogger);
    const graph = goldenGraph();
    const document = service.project(graph, { kind: "plan" });
    expect(records).toHaveLength(1);
    expect(records[0]!.msg).toBe("export2d.projected");
    expect(records[0]!.fields.modelId).toBe(document.modelId);
    expect(records[0]!.fields.graphDigest).toBe(document.graphDigest);
    expect(records[0]!.fields.view).toBe("plan");
    expect(records[0]!.fields.primitives).toBe(8);
    expect(records[0]!.fields.unprojected).toBe(0);
    // No primitive payload in the log record.
    expect(JSON.stringify(records[0]!.fields)).not.toContain("primitiveId");
  });

  it("fail-closed request validation surfaces through the service unchanged", () => {
    const service = buildExport2dService(CONFIG, LOGGER);
    const error = capture(() =>
      service.project(goldenGraph(), { kind: "elevation", viewDirection: { x: 0, y: 0, z: 1 } }),
    );
    expect(error?.code).toBe("VIEW_DIRECTION_NOT_HORIZONTAL");
  });
});

/** Captures an Export2dError from a throwing call (fail-closed inspection). */
function capture(call: () => unknown): ReturnType<typeof toExport2dError> {
  try {
    call();
    return null;
  } catch (error) {
    const typed = toExport2dError(error);
    expect(typed).not.toBeNull();
    return typed;
  }
}
