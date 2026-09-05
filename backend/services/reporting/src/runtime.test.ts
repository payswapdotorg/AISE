/**
 * Reporting service composition tests (AISE-019).
 *
 * Bounded-compute limits flow into the report entry point; the
 * surface exposes the deterministic composition API only and
 * logs per-call observability without payload logging.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import {
  buildReportingService,
  DEFAULT_MAX_GRAPH_OBJECTS,
  DEFAULT_MAX_OUTPUT_BYTES,
} from "./runtime.js";
import { toReportingError } from "./errors.js";
import { siteReportOf, renderSiteReportPdf } from "./report.js";
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

function capture(action: () => unknown): ReturnType<typeof toReportingError> {
  try {
    action();
  } catch (error) {
    return toReportingError(error);
  }
  return null;
}

describe("buildReportingService", () => {
  it("builds with production defaults and exposes the limits", () => {
    const service = buildReportingService(CONFIG, LOGGER);
    expect(service.limits.maxGraphObjects).toBe(DEFAULT_MAX_GRAPH_OBJECTS);
    expect(service.limits.maxGraphObjects).toBe(100_000);
    expect(service.limits.maxOutputBytes).toBe(DEFAULT_MAX_OUTPUT_BYTES);
    expect(service.limits.maxOutputBytes).toBe(64 * 1024 * 1024);
  });

  it("reports the golden graph through the composed surface", () => {
    const service = buildReportingService(CONFIG, LOGGER);
    const graph = goldenGraph();
    const pdf = service.report(graph);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(3);
    expect(pdf.text).toContain("AISE SITE REPORT");
    // Service output is the pure composition's output, verbatim.
    expect(pdf.text).toBe(renderSiteReportPdf(siteReportOf(graph)).text);
  });

  it("exposes the two-step surface (buildReport + renderPdf) with identical output", () => {
    const service = buildReportingService(CONFIG, LOGGER);
    const graph = goldenGraph();
    const report = service.buildReport(graph);
    expect(report.model.modelId).toBe("model-golden");
    expect(service.renderPdf(report).text).toBe(service.report(graph).text);
  });

  it("enforces the graph object cap (fail closed before any composition work)", () => {
    const service = buildReportingService(CONFIG, LOGGER, { maxGraphObjects: 4 });
    const error = capture(() => service.report(goldenGraph()));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details.objects).toBe(8);
    expect(error?.details.cap).toBe(4);
    expect(error?.retryable).toBe(false);
  });

  it("enforces the output byte cap (fail closed after rendering, before return)", () => {
    const service = buildReportingService(CONFIG, LOGGER, { maxOutputBytes: 256 });
    const error = capture(() => service.report(goldenGraph()));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details.byteLength).toBeGreaterThan(256);
    expect(error?.details.cap).toBe(256);
  });

  it("propagates the composition contract errors (version pinning)", () => {
    const service = buildReportingService(CONFIG, LOGGER);
    const error = capture(() => service.report(goldenGraph(), { evidence: undefined, version: 0 }));
    expect(error?.code).toBe("VALIDATION_FAILED");
  });

  it("invalid limits fail at build time", () => {
    for (const bad of [
      { maxGraphObjects: 0 },
      { maxGraphObjects: -1 },
      { maxGraphObjects: 1.5 },
      { maxOutputBytes: 0 },
      { maxOutputBytes: -1 },
      { maxOutputBytes: 1.5 },
    ]) {
      expect(() => buildReportingService(CONFIG, LOGGER, bad)).toThrow();
    }
  });

  it("emits a structured debug record per report (observability, no payload logging)", () => {
    const records: { msg: string; fields: Record<string, unknown> }[] = [];
    const recordingLogger = {
      debug: (msg: string, fields: Record<string, unknown>) => records.push({ msg, fields }),
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as Logger;
    const service = buildReportingService(CONFIG, recordingLogger);
    const graph = goldenGraph();
    service.report(graph);
    expect(records).toHaveLength(1);
    expect(records[0]!.msg).toBe("reporting.reported");
    expect(records[0]!.fields.modelId).toBe("model-golden");
    expect(records[0]!.fields.graphDigest).toBe(graph.digest);
    expect(records[0]!.fields.objects).toBe(8);
    expect(records[0]!.fields.pages).toBeGreaterThanOrEqual(3);
    expect(records[0]!.fields.bytes).toBeGreaterThan(0);
    // No payload logging: the PDF text itself never appears.
    expect(Object.keys(records[0]!.fields)).not.toContain("text");
  });
});
