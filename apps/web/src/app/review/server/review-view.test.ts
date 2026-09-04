/**
 * The AISE-016 review view suite: the traceability acceptance.
 *
 * "Every consequential displayed assertion can trace to
 * evidence/authority": the projection must expose, for every
 * property, the epistemic passthrough AND the authoritative
 * per-citation validity; for every entity, its live evidence
 * support; for the version, the readiness reports and the
 * authority digests the view was computed from.
 */
import { describe, expect, it } from "vitest";
import { projectReviewWorkspace, reviewableModels } from "./review-view";
import { ReviewViewError } from "./review-view";
import { applyDecision, reviewStore } from "./review-store";
import type { ReviewDecisionRequest } from "./decision-contract";
import { getVersion } from "@/server/model-store";

const MODEL = "model-golden-room";

describe("the review workspace projection of the golden v2", () => {
  it("serves the golden model with the authority trace anchors", () => {
    expect(reviewableModels()).toEqual([MODEL]);
    const view = projectReviewWorkspace(MODEL, 2);
    expect(view.modelId).toBe(MODEL);
    expect(view.projectId).toBe("project-golden-room");
    expect(view.version).toBe(2);
    expect(view.versions).toEqual([1, 2]);
    expect(view.graphDigest).toBe(getVersion(MODEL, 2)!.graph.digest);
    expect(view.mappingDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("projects spaces + objects as selectable entities with epistemic passthrough", () => {
    const view = projectReviewWorkspace(MODEL, 2);
    // 1 space + 8 objects.
    expect(view.entities.length).toBe(9);
    const space = view.entities.find((entity) => entity.entityKind === "space")!;
    expect(space.entityId).toBe("room-golden-room");
    const objects = view.entities.filter((entity) => entity.entityKind === "object");
    expect(objects.length).toBe(8);
    // Epistemic composition is honest, never collapsed.
    expect(view.epistemicSummary.objects).toEqual({ INFERRED: 7, CONFIRMED: 1 });
    for (const object of objects) {
      expect(["INFERRED", "CONFIRMED"]).toContain(object.epistemicState);
    }
  });

  it("every v2 object existence has live LIDAR support (the seed's links)", () => {
    const view = projectReviewWorkspace(MODEL, 2);
    const lidar = view.evidence.find((entry) => entry.kind === "LIDAR")!;
    for (const object of view.entities.filter((entity) => entity.entityKind === "object")) {
      expect(object.existenceSupport).toEqual([lidar.evidenceId]);
    }
  });

  it("the roomHeight citation trace shows the honest UNMAPPED_CITATION (fail-visible, never hidden)", () => {
    const view = projectReviewWorkspace(MODEL, 2);
    const space = view.entities.find((entity) => entity.entityKind === "space")!;
    const roomHeight = space.properties.find((property) => property.key === "roomHeight")!;
    expect(roomHeight.status).toBe("CONFIRMED");
    expect(roomHeight.kind).toBe("measurement");
    expect(roomHeight.value).toBe(2.7);
    expect(roomHeight.unit).toBe("meter");
    expect(roomHeight.uncertainty).toBe("± 0.005 (1σ)");
    expect(roomHeight.evidenceRefs).toBeDefined();
    expect(roomHeight.evidenceRefs!.length).toBe(1);
    // The AISE-015 mirrored citation is NOT the registered identity → UNMAPPED.
    const survey = view.evidence.find((entry) => entry.kind === "MEASUREMENT")!;
    expect(roomHeight.evidenceRefs![0]).not.toBe(survey.evidenceId);
    expect(roomHeight.citationTraces.length).toBe(1);
    expect(roomHeight.citationTraces[0]!.status).toBe("UNMAPPED_CITATION");
    // The validity summary surfaces the invalidated subject.
    expect(view.validitySummary.confirmedAssertionCount).toBe(2);
    expect(view.validitySummary.invalidatedCount).toBe(1);
    expect(view.validitySummary.validCount).toBe(1);
  });

  it("INFERRED properties report their live support honestly (may be none)", () => {
    const view = projectReviewWorkspace(MODEL, 2);
    const object = view.entities.find(
      (entity) => entity.entityKind === "object" && entity.epistemicState === "INFERRED",
    )!;
    // v1-derived quantity properties are INFERRED estimates without links:
    // the projection reports live support count 0 and no fabricated traces.
    for (const property of object.properties) {
      if (property.status === "INFERRED") {
        expect(property.citationTraces).toEqual([]);
        expect(property.liveSupportCount).toBe(0);
      }
    }
  });

  it("the evidence inventory carries verbatim source pins (the human trace)", () => {
    const view = projectReviewWorkspace(MODEL, 2);
    expect(view.evidence.length).toBe(2);
    const lidar = view.evidence.find((entry) => entry.kind === "LIDAR")!;
    expect(lidar.sourceKind).toBe("capture");
    expect(lidar.sourceSummary).toContain("session-golden000001");
    expect(lidar.sourceSummary).toContain("asset-golden0000001");
    expect(lidar.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(lidar.retracted).toBe(false);

    const survey = view.evidence.find((entry) => entry.kind === "MEASUREMENT")!;
    expect(survey.sourceSummary).toContain("2.7 m");
    expect(survey.sourceSummary).toContain("surveyor-bob");
    expect(survey.sourceSummary).toContain("2026-09-03T14:00:00Z");
    expect(survey.recordedBy).toBe("svc:web-review-seed");
  });

  it("the readiness reports are task-profiled with per-dimension verdicts", () => {
    const view = projectReviewWorkspace(MODEL, 2);
    expect(view.readiness.length).toBe(3);
    expect(view.taskProfiles.length).toBe(3);
    for (const report of view.readiness) {
      expect(report.dimensions.length).toBeGreaterThan(0);
      for (const dimension of report.dimensions) {
        expect(["PASS", "FAIL", "REPORTED", "NOT_APPLICABLE"]).toContain(dimension.verdict);
      }
      // NOT_READY reports carry their blocking dimensions (the why).
      if (report.verdict === "NOT_READY") {
        expect(report.blockingDimensions.length).toBeGreaterThan(0);
      }
    }
    // The critical compliance task is the strictest profile.
    const comply = view.readiness.find((report) => report.taskId === "task-comply")!;
    expect(comply.profile).toBe("CRITICAL");
    expect(comply.intent).toBe("AS_BUILT");
  });
});

describe("the projection after a governed decision (the corrected view)", () => {
  it("a CONFIRM decision resolves the citation trace to VALID in the new version's view", () => {
    const survey = reviewStore()
      .evidence.listEvidence("project-golden-room")
      .find((entry) => entry.record.kind === "MEASUREMENT")!.record;

    const request: ReviewDecisionRequest = {
      modelId: MODEL,
      version: 2,
      entityId: "room-golden-room",
      propertyKey: "roomHeight",
      decision: "CONFIRM",
      evidenceId: survey.evidenceId,
    };
    const outcome = applyDecision(request, "reviewer", "2026-09-04T15:00:00Z");

    const view = projectReviewWorkspace(MODEL, outcome.newVersion);
    expect(view.version).toBe(3);
    expect(view.versions).toEqual([1, 2, 3]);

    const space = view.entities.find((entity) => entity.entityKind === "space")!;
    const roomHeight = space.properties.find((property) => property.key === "roomHeight")!;
    expect(roomHeight.citationTraces).toEqual([{ evidenceId: survey.evidenceId, status: "VALID" }]);
    expect(roomHeight.liveSupportCount).toBe(1);
    expect(roomHeight.supportingEvidence).toEqual([survey.evidenceId]);

    // The corrected version's validity summary is clean.
    expect(view.validitySummary.invalidatedCount).toBe(0);
    expect(view.validitySummary.validCount).toBe(2);

    // The governed correction resolves the readiness blockers: the
    // compliance task becomes READY (confirmed-validity PASS).
    const comply = view.readiness.find((report) => report.taskId === "task-comply")!;
    expect(comply.verdict).toBe("READY");
    expect(comply.blockingDimensions).toEqual([]);
    const validity = comply.dimensions.find((dimension) => dimension.dimension === "confirmed-validity")!;
    expect(validity.verdict).toBe("PASS");

    // v2's honest drift stays visible in v2's own view (immutable history).
    const v2View = projectReviewWorkspace(MODEL, 2);
    const v2Height = v2View.entities
      .find((entity) => entity.entityKind === "space")!
      .properties.find((property) => property.key === "roomHeight")!;
    expect(v2Height.citationTraces[0]!.status).toBe("UNMAPPED_CITATION");
    // ... and v2's readiness verdicts stand (the history is not rewritten).
    const v2Comply = v2View.readiness.find((report) => report.taskId === "task-comply")!;
    expect(v2Comply.verdict).toBe("NOT_READY");
  });
});

describe("the projection fails closed on unknown versions", () => {
  it("throws the typed ReviewViewError (never a fabricated empty view)", () => {
    expect(() => projectReviewWorkspace(MODEL, 99)).toThrow(ReviewViewError);
    try {
      projectReviewWorkspace(MODEL, 99);
    } catch (error) {
      expect((error as ReviewViewError).code).toBe("unknown_version");
    }
  });
});
