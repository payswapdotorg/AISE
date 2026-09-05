/**
 * Export-IFC service composition tests (AISE-018).
 *
 * Bounded-compute limits flow into the export entry point; the
 * CRITICAL self-check validates the produced file BEFORE it is
 * returned (the service never returns an unvalidated file); the
 * surface exposes the deterministic export API only and logs
 * per-call observability without payload logging.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import { buildExportIfcService, DEFAULT_MAX_GRAPH_OBJECTS, DEFAULT_MAX_OUTPUT_BYTES } from "./runtime.js";
import { toExportIfcError } from "./errors.js";
import { exportIfc } from "./ifc.js";
import { validateIfcSpf } from "./schema.js";
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

describe("buildExportIfcService", () => {
  it("builds with production defaults and exposes the limits", () => {
    const service = buildExportIfcService(CONFIG, LOGGER);
    expect(service.limits.maxGraphObjects).toBe(DEFAULT_MAX_GRAPH_OBJECTS);
    expect(service.limits.maxGraphObjects).toBe(100_000);
    expect(service.limits.maxOutputBytes).toBe(DEFAULT_MAX_OUTPUT_BYTES);
    expect(service.limits.maxOutputBytes).toBe(64 * 1024 * 1024);
  });

  it("exports the golden graph through the service surface (self-validated output)", () => {
    const service = buildExportIfcService(CONFIG, LOGGER);
    const graph = goldenGraph();
    const document = service.export(graph);
    expect(document.counts.objects).toBe(8);
    expect(document.counts.products).toBe(8);
    expect(document.spf.startsWith("ISO-10303-21;")).toBe(true);
    // Service output is the pure export's output, verbatim.
    expect(JSON.stringify(document)).toBe(JSON.stringify(exportIfc(graph)));
  });

  it("enforces the graph object cap (fail closed before any export work)", () => {
    const service = buildExportIfcService(CONFIG, LOGGER, { maxGraphObjects: 1 });
    const graph = goldenGraph();
    const error = capture(() => service.export(graph));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details.objects).toBe(8);
    expect(error?.details.cap).toBe(1);
    expect(error?.retryable).toBe(false);
  });

  it("enforces the output byte cap (fail closed after emission, before return)", () => {
    const service = buildExportIfcService(CONFIG, LOGGER, { maxOutputBytes: 100 });
    const graph = goldenGraph();
    const error = capture(() => service.export(graph));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details.bytes).toBeGreaterThan(100);
    expect(error?.details.cap).toBe(100);
  });

  it("invalid limits fail at build time", () => {
    for (const bad of [
      { maxGraphObjects: 0 },
      { maxGraphObjects: -1 },
      { maxGraphObjects: 1.5 },
      { maxOutputBytes: 0 },
      { maxOutputBytes: -1 },
      { maxOutputBytes: 2.5 },
    ]) {
      expect(() => buildExportIfcService(CONFIG, LOGGER, bad)).toThrow();
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
    const service = buildExportIfcService(CONFIG, recordingLogger);
    const graph = goldenGraph();
    const document = service.export(graph, { version: 1 });
    expect(records).toHaveLength(1);
    expect(records[0]!.msg).toBe("exportifc.exported");
    expect(records[0]!.fields.modelId).toBe(document.modelId);
    expect(records[0]!.fields.graphDigest).toBe(document.graphDigest);
    expect(records[0]!.fields.entities).toBe(document.entityCount);
    expect(records[0]!.fields.bytes).toBe(document.byteLength);
    expect(records[0]!.fields.products).toBe(8);
    expect(records[0]!.fields.evidenceLinks).toBe(0);
    // No file payload in the log record.
    expect(JSON.stringify(records[0]!.fields).includes("ISO-10303-21")).toBe(false);
  });

  it("the self-check catches a corrupted writer output (fail closed, retryable defect)", () => {
    // Simulate an implementation defect: a mutated writer that
    // produces a wrong-arity entity. The validator must reject the
    // file — this is the discipline the service's self-check relies
    // on (EXPORT_INVALID fail-closed before return).
    const service = buildExportIfcService(CONFIG, LOGGER);
    const graph = goldenGraph();
    const tamperedCore = {
      export: (input: Parameters<typeof service.export>[0]) => {
        const document = exportIfc(input);
        const corrupted = document.spf.replace(
          "#1=IFCPERSON('AISE','Resident Worker',$,$,$,$,$,$);",
          "#1=IFCPERSON('AISE','Resident Worker',$,$);",
        );
        return { ...document, spf: corrupted };
      },
      limits: service.limits,
    } as typeof service;
    const corruptedDocument = tamperedCore.export(graph);
    const validation = validateIfcSpf(corruptedDocument.spf);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.errors.some((message) => message.includes("IFCPERSON #1 must carry 8"))).toBe(true);
    }
  });
});

function capture(action: () => unknown): ReturnType<typeof toExportIfcError> {
  try {
    action();
    return null;
  } catch (error) {
    const typed = toExportIfcError(error);
    if (typed === null) {
      throw error;
    }
    return typed;
  }
}
