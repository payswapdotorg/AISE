import { describe, expect, it } from "vitest";
import { loadConfig } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import type { AiseConfig } from "@aise/backend-config";
import { buildAssuranceService } from "./runtime.js";
import type { AssuranceService } from "./runtime.js";
import { createInMemoryAssuranceStore, type AssuranceStore } from "./store.js";
import type { AssuranceError } from "./errors.js";
import { taskProfile } from "./profile.js";
import { computeReadiness, type ReadinessReport } from "./readiness.js";
import {
  MODEL,
  PROJECT,
  SPACE,
  lidarEvidence,
  mappingWith,
  measurementEvidence,
  smallGraph,
  subjects,
  wallHeight,
} from "./testing.js";
import { propertyAssertion, type RealityModelGraph } from "@aise/engineering-model";

function testConfig(): AiseConfig {
  const result = loadConfig({ AISE_ENV: "test", AISE_LOG_LEVEL: "error" });
  if (!result.ok) {
    throw new Error("test config must load");
  }
  return result.config;
}

interface Harness {
  readonly service: AssuranceService;
  readonly graphs: Map<string, RealityModelGraph>;
  readonly mapping: { graph: ReturnType<typeof mappingWith> | undefined; present: boolean };
}

function harness(options: { mappingPresent?: boolean; store?: AssuranceStore; maxAssertions?: number } = {}): Harness {
  const graphs = new Map<string, RealityModelGraph>();
  const graph = smallGraph();
  graphs.set(`${MODEL}:1`, graph);
  const mappingHolder: { graph: ReturnType<typeof mappingWith> | undefined; present: boolean } = {
    graph:
      options.mappingPresent === false
        ? undefined
        : mappingWith([lidarEvidence()], [{ subject: subjects(1).wallExistence, evidenceId: lidarEvidence().evidenceId }]),
    present: options.mappingPresent !== false,
  };
  const service = buildAssuranceService(
    testConfig(),
    createLogger({ level: "error", module: "assurance-test" }),
    {
      modelReader: {
        getModelGraph: (modelId, version) => graphs.get(`${modelId}:${version}`),
      },
      evidenceReader: {
        getMapping: (projectId) => (projectId === PROJECT ? mappingHolder.graph : undefined),
      },
      ...(options.store !== undefined ? { store: options.store } : {}),
      ...(options.maxAssertions !== undefined ? { maxAssertions: options.maxAssertions } : {}),
    },
  );
  return { service, graphs, mapping: mappingHolder };
}

function measuredGraph(): RealityModelGraph {
  return smallGraph({
    roomHeight: propertyAssertion({
      key: "roomHeight",
      quantity: { value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 0.005 } },
      status: "OBSERVED",
      kind: "measurement",
      method: "test/fixture",
    }),
  });
}

describe("service wiring (profiles)", () => {
  it("registers, lists, and resolves task profiles", () => {
    const { service } = harness();
    const result = service.registerTaskProfile(PROJECT, { taskId: "task-plan", intent: "AS_BUILT", profile: "STANDARD" });
    expect(result.status).toBe("created");
    expect(service.getTaskProfile(PROJECT, "task-plan")?.profile).toBe("STANDARD");
    service.registerTaskProfile(PROJECT, { taskId: "task-aaa", intent: "INSPECTION", profile: "LIGHT" });
    expect(service.listTaskProfiles(PROJECT).map((profile) => profile.taskId)).toEqual(["task-aaa", "task-plan"]);
    expect(service.listTaskProfiles("project-none")).toEqual([]);
  });
});

describe("assessModelVersion (the fail-closed boundary)", () => {
  it("assesses a committed version and records the report", () => {
    const { service, graphs } = harness();
    service.registerTaskProfile(PROJECT, { taskId: "task-plan", intent: "AS_BUILT", profile: "CRITICAL" });
    graphs.set(`${MODEL}:1`, measuredGraph());
    const { status, record, report } = service.assessModelVersion(PROJECT, {
      modelId: MODEL,
      version: 1,
      taskId: "task-plan",
      assessedBy: "svc:test",
    });
    expect(status).toBe("recorded");
    expect(report.modelId).toBe(MODEL);
    expect(report.version).toBe(1);
    expect(record.assessedBy).toBe("svc:test");
    expect(record.reportDigest).toBeDefined();
    expect(service.assessmentHistory(PROJECT, { modelId: MODEL, version: 1, taskId: "task-plan" })).toHaveLength(1);
  });

  it("throws TASK_NOT_FOUND for unregistered tasks", () => {
    const { service } = harness();
    expect(() =>
      service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "ghost", assessedBy: "svc" }),
    ).toThrowError(/not registered/);
  });

  it("throws MODEL_NOT_FOUND for unknown versions", () => {
    const { service } = harness();
    service.registerTaskProfile(PROJECT, { taskId: "t", intent: "AS_BUILT", profile: "LIGHT" });
    expect(() =>
      service.assessModelVersion(PROJECT, { modelId: MODEL, version: 9, taskId: "t", assessedBy: "svc" }),
    ).toThrowError(/not committed/);
    expect(() =>
      service.assessModelVersion(PROJECT, { modelId: "model-ghost", version: 1, taskId: "t", assessedBy: "svc" }),
    ).toThrowError(/not committed/);
  });

  it("throws PROJECT_MISMATCH when the model belongs to another project", () => {
    const { service } = harness();
    service.registerTaskProfile(PROJECT, { taskId: "t", intent: "AS_BUILT", profile: "LIGHT" });
    // The other project has its own registration of the task, so
    // the profile lookup succeeds and the model scoping check is
    // what fires.
    service.registerTaskProfile("project-other", { taskId: "t", intent: "AS_BUILT", profile: "LIGHT" });
    expect(() =>
      service.assessModelVersion("project-other", { modelId: MODEL, version: 1, taskId: "t", assessedBy: "svc" }),
    ).toThrowError(/belongs to project/);
  });

  it("throws GRAPH_INVALID (with causeCode) on a tampered graph", () => {
    const { service, graphs } = harness();
    service.registerTaskProfile(PROJECT, { taskId: "t", intent: "AS_BUILT", profile: "LIGHT" });
    graphs.set(`${MODEL}:1`, Object.freeze({ ...smallGraph(), digest: "0".repeat(64) }) as RealityModelGraph);
    try {
      service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t", assessedBy: "svc" });
      expect.unreachable("must throw");
    } catch (error) {
      const assuranceError = error as AssuranceError;
      expect(assuranceError.code).toBe("GRAPH_INVALID");
      expect(assuranceError.causeCode).toBeDefined();
    }
  });

  it("treats an absent mapping as honest zero coverage (NO_EVIDENCE_MAPPING)", () => {
    const { service } = harness({ mappingPresent: false });
    service.registerTaskProfile(PROJECT, { taskId: "t", intent: "AS_BUILT", profile: "LIGHT" });
    const { report } = service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t", assessedBy: "svc" });
    const coverage = report.dimensions.find((dimension) => dimension.dimension === "evidence-coverage")!;
    expect(coverage.findings.some((finding) => finding.code === "NO_EVIDENCE_MAPPING")).toBe(true);
    expect(report.verdict).toBe("READY"); // LIGHT: advisory
  });

  it("is idempotent: re-assessment of unchanged inputs is already_present", () => {
    const { service } = harness();
    service.registerTaskProfile(PROJECT, { taskId: "t", intent: "AS_BUILT", profile: "STANDARD" });
    const first = service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t", assessedBy: "a" });
    const second = service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t", assessedBy: "b" });
    expect(first.status).toBe("recorded");
    expect(second.status).toBe("already_present");
    expect(second.record.assessedBy).toBe("a"); // original metadata preserved
    expect(service.assessmentHistory(PROJECT, { modelId: MODEL, version: 1, taskId: "t" })).toHaveLength(1);
  });

  it("bounds the assessed assertion count (BOUNDS_EXCEEDED)", () => {
    const { service } = harness({ maxAssertions: 2 });
    service.registerTaskProfile(PROJECT, { taskId: "t", intent: "AS_BUILT", profile: "LIGHT" });
    expect(() =>
      service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t", assessedBy: "svc" }),
    ).toThrowError(/max 2/); // the small graph has 3 assertions
  });
});

describe("latestAssessment (staleness honesty)", () => {
  it("reports stale when the mapping has moved on since the assessment", () => {
    const { service, mapping } = harness();
    service.registerTaskProfile(PROJECT, { taskId: "t", intent: "AS_BUILT", profile: "STANDARD" });
    service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t", assessedBy: "a" });
    expect(service.latestAssessment(PROJECT, MODEL, 1, "t")?.stale).toBe(false);
    // The evidence mapping changes (a retraction upstream, new
    // mapping snapshot): the pinned mapping digest no longer
    // matches the current one.
    mapping.graph = mappingWith([measurementEvidence(2.7)], [
      { subject: subjects(1).roomHeight, evidenceId: measurementEvidence(2.7).evidenceId },
    ]);
    const stale = service.latestAssessment(PROJECT, MODEL, 1, "t");
    expect(stale?.stale).toBe(true);
    // Re-assessment records a NEW record (append-only history)…
    const recheck = service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t", assessedBy: "b" });
    expect(recheck.status).toBe("recorded");
    // …and the latest is fresh again; the older record remains
    // discoverable.
    expect(service.latestAssessment(PROJECT, MODEL, 1, "t")?.stale).toBe(false);
    expect(service.assessmentHistory(PROJECT, { modelId: MODEL, version: 1, taskId: "t" })).toHaveLength(2);
  });

  it("reports stale when a mapping appears after an assessment of absence", () => {
    const { service, mapping } = harness({ mappingPresent: false });
    service.registerTaskProfile(PROJECT, { taskId: "t", intent: "AS_BUILT", profile: "LIGHT" });
    service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t", assessedBy: "a" });
    mapping.graph = mappingWith([lidarEvidence()], [{ subject: subjects(1).wallExistence, evidenceId: lidarEvidence().evidenceId }]);
    expect(service.latestAssessment(PROJECT, MODEL, 1, "t")?.stale).toBe(true);
  });

  it("returns undefined when nothing was assessed yet", () => {
    const { service } = harness();
    expect(service.latestAssessment(PROJECT, MODEL, 1, "never")).toBeUndefined();
  });

  it("fails closed on tampered stored records (RECORD_INVALID, injected corrupt store)", () => {
    const realStore = createInMemoryAssuranceStore();
    const { service, graphs } = harness({ store: realStore });
    service.registerTaskProfile(PROJECT, { taskId: "t", intent: "AS_BUILT", profile: "LIGHT" });
    service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t", assessedBy: "a" });
    // A corrupt (or lying) store hands back a record whose digest
    // does not match its report: the read path fails closed.
    const corruptStore: AssuranceStore = {
      ...realStore,
      listAssessments: (projectId, filter) =>
        realStore
          .listAssessments(projectId, filter)
          .map((record) => ({ ...record, reportDigest: "0".repeat(64) })),
    };
    const corruptHarness = harness({ store: corruptStore });
    void graphs;
    expect(() =>
      corruptHarness.service.latestAssessment(PROJECT, MODEL, 1, "t"),
    ).toThrowError(/integrity/i);
  });
});

describe("no-second-authority (the service writes nothing it reads)", () => {
  it("graph and mapping digests are bit-identical across every assurance operation", () => {
    const { service, graphs, mapping } = harness();
    const graph = graphs.get(`${MODEL}:1`)!;
    const mappingBefore = mapping.graph!;
    const graphDigestBefore = graph.digest;
    const mappingDigestBefore = mappingBefore.digest;

    service.registerTaskProfile(PROJECT, { taskId: "t-light", intent: "AS_BUILT", profile: "LIGHT" });
    service.registerTaskProfile(PROJECT, { taskId: "t-critical", intent: "AS_BUILT", profile: "CRITICAL", uncertaintyBudget: { lengthM: 0.05 } });
    service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t-light", assessedBy: "a" });
    service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t-critical", assessedBy: "a" });
    service.latestAssessment(PROJECT, MODEL, 1, "t-light");
    service.assessmentHistory(PROJECT, { modelId: MODEL, version: 1, taskId: "t-critical" });
    service.listTaskProfiles(PROJECT);

    expect(graph.digest).toBe(graphDigestBefore);
    expect(mappingBefore.digest).toBe(mappingDigestBefore);
    // The service never claims epistemic authority: the graph's
    // own content (states, assertions) is untouched.
    expect(graph.objects.every((object) => object.epistemicState === "INFERRED")).toBe(true);
    const space = graph.spaces.find((node) => node.spaceId === SPACE)!;
    expect((space.properties ?? []).every((assertion) => assertion.status === "INFERRED")).toBe(true);
    void wallHeight;
  });

  it("the service surface exposes no graph/mapping mutation path", () => {
    const { service } = harness();
    const surface = Object.keys(service).sort();
    // Read/compute-only verbs; no commit/ingest/link/retract.
    for (const verb of surface) {
      expect(verb).not.toMatch(/commit|ingest|link|retract|write|mutate|update/i);
    }
    expect(surface).toContain("assessModelVersion");
    expect(surface).toContain("registerTaskProfile");
  });
});

describe("deterministic service-level behavior", () => {
  it("two services over identical inputs produce identical report digests", () => {
    const a = harness();
    const b = harness();
    a.service.registerTaskProfile(PROJECT, { taskId: "t", intent: "AS_BUILT", profile: "STANDARD" });
    b.service.registerTaskProfile(PROJECT, { taskId: "t", intent: "AS_BUILT", profile: "STANDARD" });
    const first = a.service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t", assessedBy: "x" });
    const second = b.service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t", assessedBy: "y" });
    // assessedBy differs (record metadata) but the REPORT is identical.
    expect(first.record.reportDigest).toBe(second.record.reportDigest);
    expect(first.report).toEqual(second.report);
  });

  it("reports carry no timestamps (bit-identity across clock changes)", () => {
    const { service, graphs } = harness();
    service.registerTaskProfile(PROJECT, { taskId: "t", intent: "AS_BUILT", profile: "LIGHT" });
    graphs.set(`${MODEL}:1`, measuredGraph());
    const { report } = service.assessModelVersion(PROJECT, { modelId: MODEL, version: 1, taskId: "t", assessedBy: "a" });
    expect(JSON.stringify(report)).not.toMatch(/assessedAt|timestamp|Date/);
    const report2: ReadinessReport = computeReadiness({
      graph: measuredGraph(),
      version: 1,
      mapping: mappingWith([lidarEvidence()], [{ subject: subjects(1).wallExistence, evidenceId: lidarEvidence().evidenceId }]),
      mappingPresent: true,
      profile: taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "LIGHT" }),
    });
    void report2;
  });
});
