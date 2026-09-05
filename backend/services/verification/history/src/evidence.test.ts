import { describe, expect, it } from "vitest";
import { compareEvidenceValidity, validityProjection } from "./evidence.js";
import {
  roomGraph,
  versionRecord,
  wallInput,
  heightProperty,
  evidenceGraphFor,
  SPACE,
  SURVEY_EVIDENCE_ID,
  SCAN_EVIDENCE_ID,
} from "./testing.js";

const V1_AT = "2026-09-05T10:00:00Z";
const V2_AT = "2026-09-06T10:00:00Z";

/** A graph whose wall is CONFIRMED with a confirmed roomHeight property. */
function confirmedGraph() {
  const graph = roomGraph({
    objects: [
      wallInput({
        epistemicState: "CONFIRMED",
        properties: [heightProperty({ status: "CONFIRMED", evidenceRefs: [SURVEY_EVIDENCE_ID] })],
      }),
    ],
  });
  return graph;
}

describe("AISE-031 evidence validity comparison", () => {
  it("retracting the supporting link INVALIDATES the derived validity (AC-063 surfaced as a change record)", () => {
    const v1 = versionRecord(confirmedGraph(), 1, V1_AT);
    const v2 = versionRecord(confirmedGraph(), 2, V2_AT);
    const wallId = v1.graph.objects[0]!.objectId;

    const fromEvidence = evidenceGraphFor({ version: 1, objectId: wallId, propertyKey: "roomHeight" });
    const toEvidence = evidenceGraphFor({
      version: 2,
      objectId: wallId,
      propertyKey: "roomHeight",
      retractRoomHeightLink: true,
    });

    const fromProjection = validityProjection(v1.graph, 1, fromEvidence);
    const toProjection = validityProjection(v2.graph, 2, toEvidence);
    expect(fromProjection.invalidatedCount).toBe(0);
    expect(toProjection.invalidatedCount).toBeGreaterThan(0);

    const records = compareEvidenceValidity(fromProjection, toProjection);
    const invalidated = records.filter((record) => record.kind === "evidence-validity-invalidated");
    expect(invalidated.length).toBeGreaterThan(0);
    const record = invalidated[0]!;
    expect(record.validity).toEqual({ previous: true, current: false });
    expect(record.invalidationReasons).toContain("UNMAPPED_CITATION");
    expect(record.subject.kind).toBe("evidence-subject");
    if (record.subject.kind === "evidence-subject") {
      expect(record.subject.propertyKey).toBe("roomHeight");
    }
    expect(record.detail).toContain("never the committed graph");
  });

  it("re-establishing live support RESTORES validity (reasons of the prior invalidation carried)", () => {
    const v1 = versionRecord(confirmedGraph(), 1, V1_AT);
    const v2 = versionRecord(confirmedGraph(), 2, V2_AT);
    const wallId = v1.graph.objects[0]!.objectId;

    const fromEvidence = evidenceGraphFor({
      version: 1,
      objectId: wallId,
      propertyKey: "roomHeight",
      retractRoomHeightLink: true,
    });
    const toEvidence = evidenceGraphFor({ version: 2, objectId: wallId, propertyKey: "roomHeight" });

    const records = compareEvidenceValidity(
      validityProjection(v1.graph, 1, fromEvidence),
      validityProjection(v2.graph, 2, toEvidence),
    );
    const restored = records.filter((record) => record.kind === "evidence-validity-restored");
    expect(restored.length).toBeGreaterThan(0);
    expect(restored[0]!.validity).toEqual({ previous: false, current: true });
    expect(restored[0]!.invalidationReasons).toContain("UNMAPPED_CITATION");
  });

  it("subjects confirmed in only one version are NOT validity changes (first-time confirmation)", () => {
    // v1: INFERRED (nothing confirmed). v2: CONFIRMED.
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, V1_AT);
    const v2 = versionRecord(confirmedGraph(), 2, V2_AT);
    const wallId = v2.graph.objects[0]!.objectId;

    const fromEvidence = evidenceGraphFor({ version: 1, objectId: wallId });
    const toEvidence = evidenceGraphFor({ version: 2, objectId: wallId, propertyKey: "roomHeight" });

    const records = compareEvidenceValidity(
      validityProjection(v1.graph, 1, fromEvidence),
      validityProjection(v2.graph, 2, toEvidence),
    );
    expect(records).toHaveLength(0);
  });

  it("the logical subject key strips the version (same logical assertion across versions)", () => {
    const v1 = versionRecord(confirmedGraph(), 1, V1_AT);
    const v2 = versionRecord(confirmedGraph(), 2, V2_AT);
    const wallId = v1.graph.objects[0]!.objectId;

    const fromProjection = validityProjection(
      v1.graph,
      1,
      evidenceGraphFor({ version: 1, objectId: wallId, propertyKey: "roomHeight" }),
    );
    const toProjection = validityProjection(
      v2.graph,
      2,
      evidenceGraphFor({ version: 2, objectId: wallId, propertyKey: "roomHeight" }),
    );
    // Same evidence state on both versions -> no flips despite version-scoped subjects.
    expect(compareEvidenceValidity(fromProjection, toProjection)).toHaveLength(0);
    void SPACE;
    void SURVEY_EVIDENCE_ID;
    void SCAN_EVIDENCE_ID;
  });
});
