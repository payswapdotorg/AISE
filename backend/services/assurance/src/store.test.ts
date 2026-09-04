import { describe, expect, it } from "vitest";
import { AssuranceError } from "./errors.js";
import {
  createInMemoryAssuranceStore,
  deriveAssessmentId,
  emptyMapping,
  type AssuranceStore,
} from "./store.js";
import { taskProfile, type TaskProfileRecord } from "./profile.js";
import { computeReadiness, readinessReportDigest, type ReadinessReport } from "./readiness.js";
import { PROJECT, mappingWith, smallGraph, subjects, lidarEvidence, measurementEvidence } from "./testing.js";

const NOW_SEQUENCE = ["2026-09-06T09:00:00Z", "2026-09-06T10:00:00Z", "2026-09-06T11:00:00Z"];

function storeWithFixedClock(): { store: AssuranceStore; timestamps: string[] } {
  const timestamps: string[] = [];
  let index = 0;
  const store = createInMemoryAssuranceStore({
    now: () => {
      const stamp = NOW_SEQUENCE[index % NOW_SEQUENCE.length]!;
      index += 1;
      timestamps.push(stamp);
      return stamp;
    },
  });
  return { store, timestamps };
}

/** A report computed over the small graph with full support. */
function fullSupportReport(profile: TaskProfileRecord): ReadinessReport {
  const graph = smallGraph({
    roomHeight: {
      key: "roomHeight",
      quantity: { value: 2.7, unit: "meter" as const, uncertainty: { kind: "standard" as const, u: 0.005 } },
      status: "OBSERVED" as const,
      kind: "measurement" as const,
      method: "test/fixture",
    } as never,
  });
  const measurement = measurementEvidence(2.7);
  const lidar = lidarEvidence();
  const mapping = mappingWith(
    [measurement, lidar],
    [
      { subject: subjects(1).roomHeight, evidenceId: measurement.evidenceId },
      { subject: subjects(1).wallExistence, evidenceId: lidar.evidenceId },
    ],
  );
  return computeReadiness({ graph, version: 1, mapping, mappingPresent: true, profile });
}

describe("task-profile persistence", () => {
  it("registers profiles and re-registers identical content idempotently", () => {
    const { store } = storeWithFixedClock();
    const input = { taskId: "task-a", intent: "AS_BUILT" as const, profile: "STANDARD" as const };
    const first = store.registerProfile(PROJECT, input);
    expect(first.status).toBe("created");
    const second = store.registerProfile(PROJECT, { ...input });
    expect(second.status).toBe("exists_identical");
    expect(second.record).toEqual(first.record);
    expect(store.counts(PROJECT).profiles).toBe(1);
  });

  it("conflicts when the same taskId re-registers different content", () => {
    const { store } = storeWithFixedClock();
    const first = store.registerProfile(PROJECT, { taskId: "task-a", intent: "AS_BUILT", profile: "STANDARD" });
    const conflicting = store.registerProfile(PROJECT, { taskId: "task-a", intent: "AS_BUILT", profile: "CRITICAL" });
    expect(conflicting.status).toBe("exists_conflict");
    expect(conflicting.record).toEqual(first.record); // the ORIGINAL is preserved
    expect(store.getProfile(PROJECT, "task-a")?.profile).toBe("STANDARD");
  });

  it("lists profiles in canonical taskId order", () => {
    const { store } = storeWithFixedClock();
    store.registerProfile(PROJECT, { taskId: "task-b", intent: "AS_BUILT", profile: "STANDARD" });
    store.registerProfile(PROJECT, { taskId: "task-a", intent: "AS_BUILT", profile: "LIGHT" });
    store.registerProfile(PROJECT, { taskId: "task-c", intent: "AS_BUILT", profile: "CRITICAL" });
    expect(store.listProfiles(PROJECT).map((profile) => profile.taskId)).toEqual(["task-a", "task-b", "task-c"]);
  });

  it("scopes profiles per project", () => {
    const { store } = storeWithFixedClock();
    store.registerProfile(PROJECT, { taskId: "task-a", intent: "AS_BUILT", profile: "STANDARD" });
    store.registerProfile("project-other", { taskId: "task-a", intent: "AS_BUILT", profile: "CRITICAL" });
    expect(store.getProfile(PROJECT, "task-a")?.profile).toBe("STANDARD");
    expect(store.getProfile("project-other", "task-a")?.profile).toBe("CRITICAL");
  });

  it("validates profiles at the boundary (PROFILE_INVALID)", () => {
    const { store } = storeWithFixedClock();
    expect(() => store.registerProfile(PROJECT, { taskId: "bad id!", intent: "AS_BUILT", profile: "LIGHT" })).toThrowError(
      AssuranceError,
    );
    expect(() => store.registerProfile("bad project!", { taskId: "t", intent: "AS_BUILT", profile: "LIGHT" })).toThrowError(
      /projectId/,
    );
  });

  it("bounds the profile count (BOUNDS_EXCEEDED)", () => {
    const store = createInMemoryAssuranceStore({ maxTaskProfiles: 2 });
    store.registerProfile(PROJECT, { taskId: "t1", intent: "AS_BUILT", profile: "LIGHT" });
    store.registerProfile(PROJECT, { taskId: "t2", intent: "AS_BUILT", profile: "LIGHT" });
    expect(() => store.registerProfile(PROJECT, { taskId: "t3", intent: "AS_BUILT", profile: "LIGHT" })).toThrowError(
      /max 2/,
    );
  });
});

describe("assessment persistence (append-only, idempotent)", () => {
  it("records assessments with store-derived digests and identities", () => {
    const { store } = storeWithFixedClock();
    const profile = taskProfile({ taskId: "task-a", intent: "AS_BUILT", profile: "CRITICAL" });
    const report = fullSupportReport(profile);
    const result = store.recordAssessment(PROJECT, {
      modelId: report.modelId,
      version: report.version,
      taskId: profile.taskId,
      report,
      assessedBy: "svc:test",
    });
    expect(result.status).toBe("recorded");
    expect(result.record.reportDigest).toBe(readinessReportDigest(report)); // re-derived, not caller-supplied
    expect(result.record.assessmentId).toBe(
      deriveAssessmentId(PROJECT, report.modelId, report.version, profile.taskId, result.record.reportDigest),
    );
    expect(result.record.assessedAt).toBe(NOW_SEQUENCE[0]);
  });

  it("is idempotent on identical content (retry discipline)", () => {
    const { store } = storeWithFixedClock();
    const profile = taskProfile({ taskId: "task-a", intent: "AS_BUILT", profile: "STANDARD" });
    const report = fullSupportReport(profile);
    const first = store.recordAssessment(PROJECT, { modelId: report.modelId, version: 1, taskId: "task-a", report, assessedBy: "a" });
    const retry = store.recordAssessment(PROJECT, { modelId: report.modelId, version: 1, taskId: "task-a", report, assessedBy: "someone-else" });
    expect(retry.status).toBe("already_present");
    expect(retry.record).toEqual(first.record); // the original metadata is untouched
    expect(store.counts(PROJECT).assessments).toBe(1);
  });

  it("appends when the content changes (mapping drift) — history preserved", () => {
    const { store } = storeWithFixedClock();
    const profile = taskProfile({ taskId: "task-a", intent: "AS_BUILT", profile: "STANDARD" });
    const before = fullSupportReport(profile);
    // The same graph but a different mapping → different report.
    const after = computeReadiness({
      graph: smallGraph(),
      version: 1,
      mapping: mappingWith([], []),
      mappingPresent: false,
      profile,
    });
    expect(after.mappingDigest).not.toBe(before.mappingDigest);
    const first = store.recordAssessment(PROJECT, { modelId: before.modelId, version: 1, taskId: "task-a", report: before, assessedBy: "a" });
    const second = store.recordAssessment(PROJECT, { modelId: after.modelId, version: 1, taskId: "task-a", report: after, assessedBy: "a" });
    expect(second.status).toBe("recorded");
    expect(second.record.assessmentId).not.toBe(first.record.assessmentId);
    expect(store.counts(PROJECT).assessments).toBe(2);
    // Prior records remain discoverable (append-only).
    expect(store.listAssessments(PROJECT)).toHaveLength(2);
    expect(store.listAssessments(PROJECT)[0]!.report.mappingDigest).toBe(before.mappingDigest);
  });

  it("filters the assessment history", () => {
    const { store } = storeWithFixedClock();
    const profileA = taskProfile({ taskId: "task-a", intent: "AS_BUILT", profile: "STANDARD" });
    const profileB = taskProfile({ taskId: "task-b", intent: "INSPECTION", profile: "LIGHT" });
    const reportA = fullSupportReport(profileA);
    const reportB = fullSupportReport(profileB);
    store.recordAssessment(PROJECT, { modelId: "model-x", version: 1, taskId: "task-a", report: reportA, assessedBy: "a" });
    store.recordAssessment(PROJECT, { modelId: "model-x", version: 2, taskId: "task-a", report: { ...reportA, version: 2 } as ReadinessReport, assessedBy: "a" });
    store.recordAssessment(PROJECT, { modelId: "model-x", version: 1, taskId: "task-b", report: reportB, assessedBy: "a" });
    expect(store.listAssessments(PROJECT, { taskId: "task-a" })).toHaveLength(2);
    expect(store.listAssessments(PROJECT, { taskId: "task-a", version: 2 })).toHaveLength(1);
    expect(store.listAssessments(PROJECT, { modelId: "model-x", version: 1, taskId: "task-b" })).toHaveLength(1);
    expect(store.listAssessments(PROJECT, { version: 9 })).toHaveLength(0);
  });

  it("records are frozen and digest-consistent by construction (tamper-evident)", () => {
    const { store } = storeWithFixedClock();
    const profile = taskProfile({ taskId: "task-a", intent: "AS_BUILT", profile: "STANDARD" });
    const report = fullSupportReport(profile);
    const { record } = store.recordAssessment(PROJECT, { modelId: report.modelId, version: 1, taskId: "task-a", report, assessedBy: "a" });
    // Structurally immutable: in-process tampering is impossible
    // (the read-path digest re-verification is defense in depth
    // for durable stores — exercised through the runtime with an
    // injected corrupt store).
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.report)).toBe(true);
    expect(() => {
      (record as unknown as { verdict: string }).verdict = "MUTATED";
    }).toThrowError(TypeError);
    // Read path is clean for honest storage.
    expect(store.getAssessment(PROJECT, record.assessmentId)?.assessmentId).toBe(record.assessmentId);
    expect(store.getAssessment(PROJECT, "ra-does-not-exist")).toBeUndefined();
  });

  it("bounds the assessment count (BOUNDS_EXCEEDED)", () => {
    const store = createInMemoryAssuranceStore({ maxAssessments: 1 });
    const profileA = taskProfile({ taskId: "task-a", intent: "AS_BUILT", profile: "STANDARD" });
    const profileB = taskProfile({ taskId: "task-b", intent: "AS_BUILT", profile: "LIGHT" });
    const reportA = fullSupportReport(profileA);
    const reportB = fullSupportReport(profileB);
    store.recordAssessment(PROJECT, { modelId: reportA.modelId, version: 1, taskId: "task-a", report: reportA, assessedBy: "a" });
    expect(() =>
      store.recordAssessment(PROJECT, { modelId: reportB.modelId, version: 1, taskId: "task-b", report: reportB, assessedBy: "a" }),
    ).toThrowError(/max 1/);
  });

  it("derives deterministic assessment identities", () => {
    const a = deriveAssessmentId("p", "m", 1, "t", "d".repeat(64));
    const b = deriveAssessmentId("p", "m", 1, "t", "d".repeat(64));
    expect(a).toBe(b);
    expect(a).toMatch(/^ra-[0-9a-f]{64}$/);
    expect(deriveAssessmentId("p", "m", 2, "t", "d".repeat(64))).not.toBe(a);
    expect(deriveAssessmentId("p", "m", 1, "u", "d".repeat(64))).not.toBe(a);
    expect(deriveAssessmentId("p", "m", 1, "t", "e".repeat(64))).not.toBe(a);
  });

  it("emptyMapping is a valid, deterministic mapping state", () => {
    const a = emptyMapping(PROJECT);
    const b = emptyMapping(PROJECT);
    expect(a.digest).toBe(b.digest);
    expect(a.records).toHaveLength(0);
    expect(a.links).toHaveLength(0);
    expect(a.projectId).toBe(PROJECT);
  });
});
