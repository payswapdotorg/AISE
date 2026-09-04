import { describe, expect, it } from "vitest";
import { buildModelQaService, runModelQa, DEFAULT_QA_LIMITS } from "./runtime.js";
import { ModelQaError } from "./errors.js";
import { confirmedRoomHeight, handBuiltGraph, smallMapping, smallRoomGraph } from "./testing.js";
import type { ReadinessContextInput } from "./inputs.js";
import { graphContentDigest } from "@aise/engineering-model";

const PROFILE = "CRITICAL" as const;
const graph = smallRoomGraph();

describe("the pure run (runModelQa)", () => {
  it("produces a deterministic, frozen report", () => {
    const r1 = runModelQa({ graph, version: 1, profile: PROFILE });
    const r2 = runModelQa({ graph, version: 1, profile: PROFILE });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(Object.isFrozen(r1)).toBe(true);
  });

  it("is read-only: the graph digest is unchanged by the run", () => {
    const before = graph.digest;
    const report = runModelQa({ graph, version: 1, profile: PROFILE });
    expect(graph.digest).toBe(before);
    expect(report.modelDigest).toBe(before);
    const reDerived = graphContentDigest(graph.modelId, graph.projectId, graph.spaces, graph.objects, graph.relationships);
    expect(reDerived).toBe(before);
  });

  it("fails closed on unknown models / versions via the service (MODEL_NOT_FOUND)", () => {
    const service = buildModelQaService({ modelReader: { getModelGraph: () => undefined } });
    expect(() => service.runQa({ modelId: "model-x", version: 1, profile: PROFILE })).toThrowError(
      expect.objectContaining({ code: "MODEL_NOT_FOUND" }),
    );
  });

  it("BOUNDS_EXCEEDED fires on oversized graphs (injectable limits)", () => {
    expect(() =>
      runModelQa({ graph, version: 1, profile: PROFILE, __limits: { maxObjects: 2 } } as never),
    ).toThrowError(expect.objectContaining({ code: "BOUNDS_EXCEEDED" }));
    expect(() =>
      runModelQa({ graph, version: 1, profile: PROFILE, __limits: { maxSpaces: 0 } } as never),
    ).toThrowError(expect.objectContaining({ code: "BOUNDS_EXCEEDED" }));
    expect(() =>
      runModelQa({ graph, version: 1, profile: PROFILE, __limits: { maxRelationships: 2 } } as never),
    ).toThrowError(expect.objectContaining({ code: "BOUNDS_EXCEEDED" }));
  });

  it("validation runs BEFORE bounds (content failures surface first)", () => {
    const tampered = handBuiltGraph(
      graph,
      (draft) => {
        (draft.objects[0]! as { contentHash: string }).contentHash = "f".repeat(64);
      },
      { recomputeDigest: false },
    );
    expect(() =>
      runModelQa({ graph: tampered, version: 1, profile: PROFILE, __limits: { maxObjects: 1 } } as never),
    ).toThrowError(expect.objectContaining({ code: "GRAPH_INVALID" }));
  });

  it("DEFAULT_QA_LIMITS are generous and frozen", () => {
    expect(DEFAULT_QA_LIMITS.maxObjects).toBe(20_000);
    expect(Object.isFrozen(DEFAULT_QA_LIMITS)).toBe(true);
  });
});

describe("the composed service (buildModelQaService)", () => {
  it("composes over the three reader ports and records the profile (AC-110)", () => {
    const mapping = smallMapping({ linkRoomHeight: true });
    const readiness: ReadinessContextInput = {
      taskId: "task-comply",
      verdict: "READY",
      assuranceProfile: "CRITICAL",
      modelId: graph.modelId,
      version: 1,
      graphDigest: graph.digest,
      mappingDigest: mapping.digest,
    };
    const service = buildModelQaService({
      modelReader: { getModelGraph: (modelId, version) => (modelId === graph.modelId && version === 1 ? graph : undefined) },
      evidenceReader: { getMapping: (projectId) => (projectId === graph.projectId ? mapping : undefined) },
      readinessReader: { getReadiness: (modelId, version) => (modelId === graph.modelId && version === 1 ? readiness : undefined) },
    });
    const report = service.runQa({ modelId: graph.modelId, version: 1, profile: "CRITICAL" });
    expect(report.profile).toBe("CRITICAL");
    expect(report.outcome).toBe("PASS");
    expect(report.mappingDigest).toBe(mapping.digest);
    expect(report.readiness?.verdict).toBe("READY");
    expect(service.kind).toBe("model-qa");
    expect(service.checkSuiteVersion).toBe("qa/model-qa-v1");
  });

  it("ports are optional: no evidence reader → unsupported confirmations only", () => {
    const withConfirmation = handBuiltGraph(graph, (draft) => {
      (draft.spaces[0]! as { properties?: unknown[] }).properties = [confirmedRoomHeight()];
    });
    const service = buildModelQaService({
      modelReader: { getModelGraph: () => withConfirmation },
    });
    const report = service.runQa({ modelId: withConfirmation.modelId, version: 1, profile: "STANDARD" });
    expect(report.findings.map((f) => f.code)).toContain("CONFIRMATION_UNSUPPORTED");
    expect(report.mappingDigest).toBeUndefined();
  });

  it("wraps unexpected internal failures into INTERNAL_ERROR (never masks validation)", () => {
    const service = buildModelQaService({
      modelReader: {
        getModelGraph: () => {
          throw new Error("port blew up");
        },
      },
    });
    expect(() => service.runQa({ modelId: "m", version: 1, profile: PROFILE })).toThrowError(ModelQaError);
  });

  it("service-level determinism matches pure-level determinism", () => {
    const service = buildModelQaService({ modelReader: { getModelGraph: () => graph } });
    const r1 = service.runQa({ modelId: graph.modelId, version: 1, profile: "HIGH_ASSURANCE" });
    const r2 = runModelQa({ graph, version: 1, profile: "HIGH_ASSURANCE" });
    expect(r1.digest).toBe(r2.digest);
    expect(r1.reportId).toBe(r2.reportId);
  });

  it("the view is rebuilt per run — no cross-run state", () => {
    let calls = 0;
    const mutated = handBuiltGraph(graph, (draft) => {
      (draft.objects[0]! as { geometry: { structured: { width: { value: number } } } }).geometry.structured.width.value = 99;
    });
    const service = buildModelQaService({
      modelReader: {
        getModelGraph: (modelId, version) => {
          void modelId;
          void version;
          return calls++ === 0 ? graph : mutated;
        },
      },
    });
    const first = service.runQa({ modelId: graph.modelId, version: 1, profile: PROFILE });
    const second = service.runQa({ modelId: graph.modelId, version: 1, profile: PROFILE });
    expect(first.outcome).toBe("PASS");
    expect(second.findings.map((f) => f.code)).toContain("GEOMETRY_EXTENTS_MISMATCH");
  });
});

describe("profile flows end-to-end (the fixed policy over real findings)", () => {
  const unsupported = handBuiltGraph(graph, (draft) => {
    (draft.spaces[0]! as { properties?: unknown[] }).properties = [confirmedRoomHeight()];
  });

  it("LIGHT: insufficient evidence is advisory — outcome is still recorded", () => {
    const report = runModelQa({ graph: unsupported, version: 1, profile: "LIGHT" });
    expect(report.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(report.counts.blocking).toBe(0);
  });

  it("CRITICAL: insufficient evidence blocks", () => {
    const report = runModelQa({ graph: unsupported, version: 1, profile: "CRITICAL" });
    expect(report.counts.blocking).toBe(1);
    expect(report.findings[0]!.blocking).toBe(true);
  });

  it("a contradiction blocks at every profile", () => {
    const contradictory = smallRoomGraph({ floor: { area: { value: 99, unit: "square_meter" as const } } });
    for (const profile of ["LIGHT", "STANDARD", "HIGH_ASSURANCE", "CRITICAL"] as const) {
      const report = runModelQa({ graph: contradictory, version: 1, profile });
      expect(report.counts.blocking).toBeGreaterThan(0);
      expect(report.outcome).toBe("CONTRADICTION");
    }
  });
});
