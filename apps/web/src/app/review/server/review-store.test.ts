/**
 * The AISE-016 governed write-path suite: the review-decision
 * arc from the honest UNMAPPED_CITATION state to a corrected,
 * evidence-linked committed version.
 *
 * The pinned arc (the acceptance core):
 * 1. the seed registers the golden evidence (LIDAR + survey) and
 *    links it to the v2 subjects;
 * 2. v2's roomHeight cites an identity the evidence subsystem
 *    does NOT attest (the AISE-015 mirrored derivation) → the
 *    validity projection flags UNMAPPED_CITATION — the honest
 *    state, visible, never hidden;
 * 3. a governed CONFIRM decision (citing the REAL registered
 *    evidence) commits a NEW version whose citation is linked
 *    and valid — the correction is a model change, not a UI
 *    mutation;
 * 4. the parent versions stay bit-identical (immutable history);
 * 5. PROPOSE commits a PROPOSED estimate with no evidence;
 * 6. every failure mode fails closed with a typed error.
 */
import { describe, expect, it } from "vitest";
import { applyDecision, readinessReports, reviewStore, seedReviewComposition } from "./review-store";
import { ReviewDecisionError } from "./review-store";
import type { ReviewDecisionRequest } from "./decision-contract";
import { getVersion, listVersions } from "@/server/model-store";

const MODEL = "model-golden-room";

/** A well-formed CONFIRM-with-measurement request. */
function confirmMeasurementRequest(overrides: Partial<ReviewDecisionRequest> = {}): ReviewDecisionRequest {
  return {
    modelId: MODEL,
    version: 2,
    entityId: "room-golden-room",
    propertyKey: "roomHeight",
    decision: "CONFIRM",
    measurement: {
      value: 2.71,
      unit: "meter",
      method: "survey/laser-tape",
      measuredBy: "surveyor-bob",
      measuredAt: "2026-09-04T14:30:00Z",
      uncertaintyU: 0.01,
      confidence: 0.9,
    },
    ...overrides,
  };
}

describe("the seeded review composition (the golden chain)", () => {
  it("seeds deterministically: golden v1/v2 committed, evidence registered, links live", () => {
    const composition = seedReviewComposition();
    expect(getVersion(MODEL, 1)).toBeDefined();
    expect(getVersion(MODEL, 2)).toBeDefined();

    const evidence = composition.evidence;
    const records = evidence.listEvidence("project-golden-room");
    // LIDAR capture + survey measurement.
    expect(records.length).toBe(2);
    const kinds = records.map((entry) => entry.record.kind).sort();
    expect(kinds).toEqual(["LIDAR", "MEASUREMENT"]);

    // The survey measurement record is content-pinned: the real identity.
    const survey = records.find((entry) => entry.record.kind === "MEASUREMENT")!.record;
    expect(survey.evidenceId).toMatch(/^ev-[0-9a-f]{16}$/);
    expect(survey.source.kind).toBe("manual-measurement");

    // Every v2 object existence has a live link to the LIDAR evidence.
    const v2 = getVersion(MODEL, 2)!;
    for (const object of v2.graph.objects) {
      const support = evidence.evidenceForSubject("project-golden-room", {
        kind: "object-existence",
        modelId: MODEL,
        version: 2,
        objectId: object.objectId,
      });
      expect(support.length).toBe(1);
    }
  });

  it("the seed composition is idempotent (same evidence identities across fresh seeds)", () => {
    const first = seedReviewComposition();
    const second = seedReviewComposition();
    const ids = (composition: ReturnType<typeof seedReviewComposition>) =>
      composition.evidence
        .listEvidence("project-golden-room")
        .map((entry) => entry.record.evidenceId)
        .sort();
    expect(ids(second)).toEqual(ids(first));
  });
});

describe("the honest UNMAPPED_CITATION state (the fixture drift is visible)", () => {
  it("v2's roomHeight citation is NOT attested by the mapping (INVALIDATED, UNMAPPED_CITATION)", () => {
    const validity = reviewStore().evidence.computeVersionValidity(MODEL, 2);
    expect(validity.confirmedAssertionCount).toBe(2);
    const roomHeight = validity.entries.find(
      (entry) => entry.subject.kind === "space-property" && entry.subject.propertyKey === "roomHeight",
    );
    expect(roomHeight).toBeDefined();
    expect(roomHeight!.valid).toBe(false);
    expect(roomHeight!.invalidationReasons).toContain("UNMAPPED_CITATION");
    // The DOOR existence IS valid (the seed's LIDAR links).
    const door = validity.entries.find((entry) => entry.subject.kind === "object-existence");
    expect(door!.valid).toBe(true);
  });

  it("readiness over v2 reflects the honest state (task-profiled, deterministic)", () => {
    const reports = readinessReports(MODEL, 2);
    expect(reports.length).toBe(3);
    const taskIds = reports.map((report) => report.taskId);
    expect(taskIds).toEqual(["task-explore", "task-document", "task-comply"]);
    for (const report of reports) {
      expect(report.modelId).toBe(MODEL);
      expect(report.version).toBe(2);
      expect(["READY", "NOT_READY"]).toContain(report.verdict);
    }
    // The honest verdicts: the UNMAPPED_CITATION blocks the documentation
    // and compliance tasks (confirmed-validity FAIL); exploration is READY.
    const explore = reports.find((report) => report.taskId === "task-explore")!;
    expect(explore.verdict).toBe("READY");
    const document = reports.find((report) => report.taskId === "task-document")!;
    expect(document.verdict).toBe("NOT_READY");
    expect(document.blockingDimensions).toEqual(["confirmed-validity"]);
    const comply = reports.find((report) => report.taskId === "task-comply")!;
    expect(comply.verdict).toBe("NOT_READY");
    expect(comply.blockingDimensions).toEqual(["confirmed-validity"]);
    const validity = comply.dimensions.find((dimension) => dimension.dimension === "confirmed-validity")!;
    expect(validity.verdict).toBe("FAIL");
  });
});

describe("the governed write path: CONFIRM resolves the citation through a new version", () => {
  it("commits a new version whose roomHeight cites the REAL registered evidence (linked, valid)", () => {
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
    expect(outcome.status).toBe("committed");
    expect(outcome.parentVersion).toBe(2);
    expect(outcome.newVersion).toBe(3);
    expect(outcome.evidenceId).toBe(survey.evidenceId);
    expect(outcome.decision).toBe("CONFIRM");

    // The new version's roomHeight cites the real evidence and is VALID.
    const v3 = getVersion(MODEL, 3)!;
    const space = v3.graph.spaces[0]!;
    const height = (space.properties ?? []).find((assertion) => assertion.key === "roomHeight")!;
    expect(height.status).toBe("CONFIRMED");
    expect(height.evidenceRefs).toEqual([survey.evidenceId]);
    expect(height.verifiedBy).toBe("user:reviewer");
    expect(height.verifiedAt).toBe("2026-09-04T15:00:00Z");

    const validity = reviewStore().evidence.computeVersionValidity(MODEL, 3);
    const roomHeight = validity.entries.find(
      (entry) => entry.subject.kind === "space-property" && entry.subject.propertyKey === "roomHeight",
    )!;
    expect(roomHeight.valid).toBe(true);
    expect(validity.invalidatedCount).toBe(0);
  });

  it("CONFIRM with a new manual measurement registers content-pinned evidence and links it", () => {
    const headBefore = Math.max(...listVersions(MODEL).map((entry) => entry.version));
    const outcome = applyDecision(confirmMeasurementRequest(), "reviewer", "2026-09-04T15:30:00Z");
    expect(outcome.status).toBe("committed");
    expect(outcome.newVersion).toBe(headBefore + 1);
    expect(outcome.parentVersion).toBe(2);
    expect(outcome.evidenceId).toMatch(/^ev-[0-9a-f]{16}$/);

    // The measurement became registered evidence (content-pinned).
    const stored = reviewStore().evidence.getEvidence("project-golden-room", outcome.evidenceId!);
    expect(stored).toBeDefined();
    expect(stored!.record.source.kind).toBe("manual-measurement");
    expect(stored!.record.recordedBy).toBe("user:reviewer");

    // The new version's roomHeight carries the measured value with the stated uncertainty.
    const version = getVersion(MODEL, outcome.newVersion)!;
    const height = (version.graph.spaces[0]!.properties ?? []).find(
      (assertion) => assertion.key === "roomHeight",
    )!;
    expect(height.quantity?.value).toBe(2.71);
    expect(height.quantity?.uncertainty).toEqual({ kind: "standard", u: 0.01 });
    expect(height.confidence).toBe(0.9);
    expect(height.evidenceRefs).toEqual([outcome.evidenceId]);
  });

  it("the parent versions stay bit-identical (immutable history — no in-place edits)", () => {
    const v1 = getVersion(MODEL, 1)!;
    const v2 = getVersion(MODEL, 2)!;
    // The digests were recorded by the AISE-015 seed (before any decision).
    expect(v2.record.digest).toBe(v2.graph.digest);
    expect(v1.record.digest).toBe(v1.graph.digest);
    // The chain only ever grows.
    const versions = listVersions(MODEL).map((entry) => entry.version);
    expect(versions).toEqual([1, 2, 3, 4]);
  });

  it("the exact same decision is idempotent (already_present, honest reporting)", () => {
    const request = confirmMeasurementRequest();
    const first = applyDecision(request, "reviewer", "2026-09-04T15:30:00Z");
    // Identical request + actor + now → identical derived content → the same version.
    const second = applyDecision(request, "reviewer", "2026-09-04T15:30:00Z");
    expect(second.newVersion).toBe(first.newVersion);
    expect(second.digest).toBe(first.digest);
    expect(listVersions(MODEL).length).toBe(4);
  });
});

describe("the governed write path: PROPOSE commits an estimate (no evidence)", () => {
  it("commits a PROPOSED replacement estimate with the canonical pairing", () => {
    const headBefore = Math.max(...listVersions(MODEL).map((entry) => entry.version));
    const request: ReviewDecisionRequest = {
      modelId: MODEL,
      version: 2,
      entityId: "room-golden-room",
      propertyKey: "roomHeight",
      decision: "PROPOSE",
      proposal: { value: 2.75, unit: "meter", uncertaintyU: 0.05, confidence: 0.6 },
    };
    const outcome = applyDecision(request, "engineer", "2026-09-04T16:00:00Z");
    expect(outcome.decision).toBe("PROPOSE");
    expect(outcome.evidenceId).toBeUndefined();
    expect(outcome.newVersion).toBe(headBefore + 1);

    const version = getVersion(MODEL, outcome.newVersion)!;
    const height = (version.graph.spaces[0]!.properties ?? []).find(
      (assertion) => assertion.key === "roomHeight",
    )!;
    expect(height.status).toBe("PROPOSED");
    expect(height.kind).toBe("estimate");
    expect(height.quantity?.value).toBe(2.75);
    expect(height.quantity?.uncertainty).toEqual({ kind: "standard", u: 0.05 });
    expect(height.confidence).toBe(0.6);
    expect(height.evidenceRefs).toBeUndefined();
    expect(height.verifiedBy).toBeUndefined();
  });
});

describe("every failure mode fails closed (typed errors, never a guess)", () => {
  it("unknown model / version / entity / property / evidence", () => {
    const expectCode = (request: ReviewDecisionRequest, code: string) => {
      try {
        applyDecision(request, "reviewer", "2026-09-04T17:00:00Z");
        expect.unreachable(`expected ReviewDecisionError ${code}`);
      } catch (error) {
        expect(error).toBeInstanceOf(ReviewDecisionError);
        expect((error as ReviewDecisionError).code).toBe(code);
      }
    };
    const base = confirmMeasurementRequest();
    expectCode({ ...base, modelId: "model-nope" }, "unknown_model");
    expectCode({ ...base, version: 99 }, "unknown_version");
    expectCode({ ...base, entityId: "entity-nope" }, "unknown_entity");
    expectCode({ ...base, propertyKey: "nopeKey" }, "unknown_property");
    expectCode(
      {
        modelId: MODEL,
        version: 2,
        entityId: "room-golden-room",
        propertyKey: "roomHeight",
        decision: "CONFIRM",
        evidenceId: "ev-doesnotexist",
      },
      "unknown_evidence",
    );
  });

  it("existence confirmation on a SPACE is refused (spaces carry properties, not existence)", () => {
    const lidar = reviewStore()
      .evidence.listEvidence("project-golden-room")
      .find((entry) => entry.record.kind === "LIDAR")!.record;
    try {
      applyDecision(
        {
          modelId: MODEL,
          version: 2,
          entityId: "room-golden-room",
          decision: "CONFIRM",
          evidenceId: lidar.evidenceId,
        },
        "reviewer",
        "2026-09-04T17:00:00Z",
      );
      expect.unreachable("expected ReviewDecisionError");
    } catch (error) {
      expect((error as ReviewDecisionError).code).toBe("invalid_decision");
      expect((error as ReviewDecisionError).httpStatus).toBe(400);
      expect((error as ReviewDecisionError).message).toContain("existence confirmation targets objects");
    }
  });

  it("existence confirmation of an OBJECT commits a CONFIRMED epistemic flip with the evidence link", () => {
    const lidar = reviewStore()
      .evidence.listEvidence("project-golden-room")
      .find((entry) => entry.record.kind === "LIDAR")!.record;
    const v2 = getVersion(MODEL, 2)!;
    const inferred = v2.graph.objects.find((object) => object.epistemicState === "INFERRED")!;

    const outcome = applyDecision(
      {
        modelId: MODEL,
        version: 2,
        entityId: inferred.objectId,
        decision: "CONFIRM",
        evidenceId: lidar.evidenceId,
      },
      "reviewer",
      "2026-09-04T17:30:00Z",
    );
    expect(outcome.status).toBe("committed");
    const version = getVersion(MODEL, outcome.newVersion)!;
    const confirmed = version.graph.objects.find((object) => object.objectId === inferred.objectId)!;
    expect(confirmed.epistemicState).toBe("CONFIRMED");
    // The other objects keep their epistemic states (targeted change only).
    expect(
      version.graph.objects.filter((object) => object.epistemicState === "INFERRED").length,
    ).toBe(v2.graph.objects.filter((object) => object.epistemicState === "INFERRED").length - 1);
  });
});
