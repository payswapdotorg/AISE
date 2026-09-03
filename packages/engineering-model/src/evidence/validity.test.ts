/**
 * Verification-validity projection tests (AC-062/AC-063 — the
 * CRITICAL semantics core).
 *
 * The binding rule under test: a CONFIRMED assertion is
 * verification-VALID iff (a) at least one live link attaches
 * evidence to its subject and (b) every cited evidence reference
 * is covered by that live support. Retraction of evidence or of
 * a link flips the projection to INVALIDATED; the canonical
 * graph is never modified.
 */
import { describe, expect, it } from "vitest";
import {
  assertionSupport,
  computeVersionValidity,
  listConfirmedAssertionSubjects,
} from "./validity.js";
import { assembleEvidenceGraph } from "./graph.js";
import { evidenceRetraction, linkRetraction } from "./links.js";
import {
  fixture,
  lidarEvidence,
  link,
  measurementEvidence,
  observationEvidence,
  smallGraph,
} from "./testing.js";

const PROJECT = "project-evidence";

function mapping(
  records: readonly ReturnType<typeof lidarEvidence>[],
  links: readonly ReturnType<typeof link>[],
  evidenceRetractions: readonly ReturnType<typeof evidenceRetraction>[] = [],
  linkRetractions: readonly ReturnType<typeof linkRetraction>[] = [],
) {
  return assembleEvidenceGraph({
    projectId: PROJECT,
    records,
    evidenceRetractions,
    links,
    linkRetractions,
  });
}

/** The fixture graph cites [lidar] for fireRating and [measurement] for roomHeight. */
function happyMapping() {
  const lidar = lidarEvidence();
  const measurement = measurementEvidence();
  const observation = observationEvidence();
  return {
    lidar,
    measurement,
    evidence: mapping(
      [lidar, measurement, observation],
      [
        link(fixture.fireRatingSubject, lidar.evidenceId),
        link(fixture.roomHeightSubject, measurement.evidenceId),
        link(fixture.doorSubject, observation.evidenceId),
      ],
    ),
  };
}

describe("enumeration of CONFIRMED assertions", () => {
  it("finds every CONFIRMED assertion with its citations", () => {
    const refs = listConfirmedAssertionSubjects(fixture.graph, 1);
    const keys = refs.map((ref) => `${ref.subject.kind}:${ref.subject.propertyKey ?? ref.subject.objectId ?? ref.subject.spaceId}`);
    // door existence + fireRating + roomHeight (CONFIRMED);
    // coatingThickness and wall existence are not CONFIRMED.
    expect(refs).toHaveLength(3);
    expect(keys).toContain(`object-existence:${fixture.doorId}`);
    expect(refs.map((ref) => ref.description)).toContain('space "room-evidence" property "roomHeight"');
    const fireRating = refs.find((ref) => ref.subject.kind === "object-property")!;
    expect(fireRating.citedEvidenceRefs).toEqual([lidarEvidence().evidenceId]);
  });

  it("is version-scoped (subjects pin the version)", () => {
    const refs = listConfirmedAssertionSubjects(fixture.graph, 7);
    expect(refs.every((ref) => ref.subject.version === 7)).toBe(true);
  });
});

describe("the validity rule (AC-062 binding)", () => {
  it("VALID: live links cover every citation and support is non-empty", () => {
    const { evidence } = happyMapping();
    const report = computeVersionValidity(fixture.graph, 1, evidence);
    expect(report.confirmedAssertionCount).toBe(3);
    expect(report.validCount).toBe(3);
    expect(report.invalidatedCount).toBe(0);
    expect(report.invalidatedSubjects).toEqual([]);
    const roomHeight = report.entries.find(
      (entry) => entry.subject.propertyKey === "roomHeight",
    )!;
    expect(roomHeight.valid).toBe(true);
    expect(roomHeight.liveSupportingEvidence).toEqual([measurementEvidence().evidenceId]);
  });

  it("INVALIDATED: no mapping at all (verified assertion without provenance)", () => {
    const empty = mapping([], []);
    const report = computeVersionValidity(fixture.graph, 1, empty);
    expect(report.validCount).toBe(0);
    expect(report.invalidatedCount).toBe(3);
    for (const entry of report.entries) {
      expect(entry.invalidationReasons).toContain("NO_LIVE_SUPPORT");
    }
  });

  it("INVALIDATED: cited evidence registered but never linked (unmapped citation)", () => {
    // Registration without the link: the producer's claim is not
    // attested by the authoritative mapping.
    const lidar = lidarEvidence();
    const measurement = measurementEvidence();
    const evidence = mapping(
      [lidar, measurement],
      [link(fixture.roomHeightSubject, measurement.evidenceId)], // fireRating's citation never mapped
    );
    const report = computeVersionValidity(fixture.graph, 1, evidence);
    const fireRating = report.entries.find(
      (entry) => entry.subject.propertyKey === "fireRating",
    )!;
    expect(fireRating.valid).toBe(false);
    expect(fireRating.invalidationReasons).toContain("NO_LIVE_SUPPORT");
    expect(fireRating.invalidationReasons).toContain("UNMAPPED_CITATION");
  });

  it("INVALIDATED: live link exists but does not cover the citation", () => {
    // The wrong evidence is attached: support is non-empty, the
    // citation is not covered → still invalidated.
    const lidar = lidarEvidence();
    const measurement = measurementEvidence();
    const evidence = mapping(
      [lidar, measurement],
      [link(fixture.roomHeightSubject, lidar.evidenceId)], // wrong evidence
    );
    const report = computeVersionValidity(fixture.graph, 1, evidence);
    const roomHeight = report.entries.find(
      (entry) => entry.subject.propertyKey === "roomHeight",
    )!;
    expect(roomHeight.valid).toBe(false);
    expect(roomHeight.invalidationReasons).toEqual(["UNMAPPED_CITATION"]);
    expect(roomHeight.liveSupportingEvidence).toEqual([lidar.evidenceId]);
  });

  it("INVALIDATED: partially covered citations (multi-ref assertions)", () => {
    // Build a graph whose roomHeight cites TWO refs; only one mapped.
    const lidar = lidarEvidence();
    const measurement = measurementEvidence();
    const twoRefGraph = fixtureGraphWithCitations([measurement.evidenceId, lidar.evidenceId]);
    const evidence = mapping(
      [lidar, measurement],
      [
        link(fixture.roomHeightSubject, measurement.evidenceId),
        link(fixture.roomHeightSubject, lidar.evidenceId),
      ],
    );
    const bothMapped = computeVersionValidity(twoRefGraph.graph, 1, evidence);
    expect(bothMapped.entries.find((entry) => entry.subject.propertyKey === "roomHeight")!.valid).toBe(true);

    const partial = mapping(
      [lidar, measurement],
      [link(fixture.roomHeightSubject, measurement.evidenceId)],
    );
    const report = computeVersionValidity(twoRefGraph.graph, 1, partial);
    const roomHeight = report.entries.find(
      (entry) => entry.subject.propertyKey === "roomHeight",
    )!;
    expect(roomHeight.valid).toBe(false);
    expect(roomHeight.invalidationReasons).toEqual(["UNMAPPED_CITATION"]);
  });

  it("object-existence CONFIRMED: valid with any live support, no citations required", () => {
    const observation = observationEvidence();
    const evidence = mapping([observation], [link(fixture.doorSubject, observation.evidenceId)]);
    const report = computeVersionValidity(fixture.graph, 1, evidence);
    const door = report.entries.find((entry) => entry.subject.kind === "object-existence")!;
    expect(door.valid).toBe(true);
    expect(door.citedEvidenceRefs).toEqual([]);
  });
});

describe("retraction invalidates (AC-063)", () => {
  it("retracting the LINK invalidates the verification state", () => {
    const { lidar, measurement, evidence } = happyMapping();
    const observation = observationEvidence();
    const retracted = mapping(
      [lidar, measurement, observation],
      [
        link(fixture.fireRatingSubject, lidar.evidenceId),
        link(fixture.roomHeightSubject, measurement.evidenceId),
        link(fixture.doorSubject, observation.evidenceId),
      ],
      [],
      [
        linkRetraction({
          linkId: link(fixture.fireRatingSubject, lidar.evidenceId).linkId,
          retractedBy: "user:reviewer",
          retractedAt: "2026-09-06T09:00:00Z",
          reason: "support removed at review",
        }),
      ],
    );
    expect(retracted.digest).not.toBe(evidence.digest);
    const report = computeVersionValidity(fixture.graph, 1, retracted);
    const fireRating = report.entries.find(
      (entry) => entry.subject.propertyKey === "fireRating",
    )!;
    expect(fireRating.valid).toBe(false);
    expect(fireRating.invalidationReasons).toContain("NO_LIVE_SUPPORT");
    expect(report.invalidatedCount).toBe(1);
  });

  it("retracting the EVIDENCE invalidates every supported assertion", () => {
    const { lidar, measurement } = happyMapping();
    const observation = observationEvidence();
    const retracted = mapping(
      [lidar, measurement, observation],
      [
        link(fixture.fireRatingSubject, lidar.evidenceId),
        link(fixture.roomHeightSubject, measurement.evidenceId),
        link(fixture.doorSubject, observation.evidenceId),
      ],
      [
        evidenceRetraction({
          evidenceId: lidar.evidenceId,
          retractedBy: "user:reviewer",
          retractedAt: "2026-09-06T09:00:00Z",
          reason: "source retracted upstream",
        }),
      ],
    );
    const report = computeVersionValidity(fixture.graph, 1, retracted);
    const fireRating = report.entries.find(
      (entry) => entry.subject.propertyKey === "fireRating",
    )!;
    expect(fireRating.valid).toBe(false);
    // The retraction is surfaced, never silently dropped.
    expect(fireRating.retractedSupportingEvidence).toEqual([lidar.evidenceId]);
    expect(fireRating.liveSupportingEvidence).toEqual([]);
    // roomHeight survives: its evidence is untouched.
    const roomHeight = report.entries.find(
      (entry) => entry.subject.propertyKey === "roomHeight",
    )!;
    expect(roomHeight.valid).toBe(true);
  });

  it("non-CONFIRMED assertions are never validity-graded (no false invalidation)", () => {
    const { evidence } = happyMapping();
    const report = computeVersionValidity(fixture.graph, 1, evidence);
    const subjects = report.entries.map((entry) => entry.subject);
    expect(subjects).not.toContain(fixture.coatingSubject);
    expect(subjects).not.toContain(fixture.wallSubject);
  });
});

describe("the projection never mutates the graph (no second authority)", () => {
  it("graph content and digest are bit-identical before and after projection", () => {
    const { evidence } = happyMapping();
    const before = fixture.graph.digest;
    computeVersionValidity(fixture.graph, 1, evidence);
    assertionSupport(fixture.graph, 1, evidence);
    expect(fixture.graph.digest).toBe(before);
    expect(Object.isFrozen(fixture.graph)).toBe(true);
    // The CONFIRMED status stands in the graph — the report is
    // the derived verification state, history is immutable.
    const roomHeight = fixture.graph.spaces[0]!.properties!.find(
      (assertion) => assertion.key === "roomHeight",
    )!;
    expect(roomHeight.status).toBe("CONFIRMED");
  });
});

describe("assertionSupport (the completeness view)", () => {
  it("reports every assertion subject with live support and passthrough status", () => {
    const { evidence } = happyMapping();
    const support = assertionSupport(fixture.graph, 1, evidence);
    // 3 objects (wall, door existences) + 1 object property (fireRating)
    // + 2 space properties (roomHeight, coatingThickness).
    expect(support).toHaveLength(5);
    const roomHeight = support.find((entry) => entry.subject.propertyKey === "roomHeight")!;
    expect(roomHeight.status).toBe("CONFIRMED");
    expect(roomHeight.liveSupportingEvidence).toEqual([measurementEvidence().evidenceId]);
    const coating = support.find((entry) => entry.subject.propertyKey === "coatingThickness")!;
    expect(coating.status).toBe("INFERRED");
    expect(coating.liveSupportingEvidence).toEqual([]);
    const wall = support.find((entry) => entry.subject.kind === "object-existence" && entry.subject.objectId === fixture.wallId)!;
    expect(wall.status).toBe("INFERRED");
  });

  it("live support excludes retracted evidence and retracted links", () => {
    const lidar = lidarEvidence();
    const measurement = measurementEvidence();
    const evidence = mapping(
      [lidar, measurement],
      [
        link(fixture.fireRatingSubject, lidar.evidenceId),
        link(fixture.roomHeightSubject, measurement.evidenceId),
      ],
      [evidenceRetraction({ evidenceId: lidar.evidenceId, retractedBy: "u", retractedAt: "2026-09-06T09:00:00Z", reason: "r" })],
    );
    const support = assertionSupport(fixture.graph, 1, evidence);
    const fireRating = support.find((entry) => entry.subject.propertyKey === "fireRating")!;
    expect(fireRating.liveSupportingEvidence).toEqual([]);
  });
});

/** Rebuilds the fixture graph with a custom roomHeight citation list. */
function fixtureGraphWithCitations(citations: readonly string[]) {
  return smallGraph(lidarEvidence().evidenceId, measurementEvidence().evidenceId, {
    roomHeightCitations: citations,
  });
}
