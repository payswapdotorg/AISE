/**
 * Evidence-graph assembly tests: integrity rules, canonical
 * ordering, digest determinism, live-state computation.
 */
import { describe, expect, it } from "vitest";
import { EvidenceError } from "./errors.js";
import {
  assembleEvidenceGraph,
  isEvidenceLive,
  liveEvidenceForSubject,
  liveLinks,
  liveLinksForSubject,
  liveRecords,
  subjectsForEvidence,
  type AssembleEvidenceGraphInput,
} from "./graph.js";
import {
  documentEvidence,
  fixture,
  lidarEvidence,
  link,
  measurementEvidence,
  observationEvidence,
} from "./testing.js";
import { linkRetraction, evidenceRetraction } from "./links.js";

const PROJECT = "project-evidence";

function mappingInput(
  overrides: Partial<AssembleEvidenceGraphInput> = {},
): AssembleEvidenceGraphInput {
  const lidar = lidarEvidence();
  const measurement = measurementEvidence();
  return {
    projectId: PROJECT,
    records: [lidar, measurement],
    evidenceRetractions: [],
    links: [link(fixture.roomHeightSubject, measurement.evidenceId)],
    linkRetractions: [],
    ...overrides,
  };
}

describe("assembly (the happy path)", () => {
  it("assembles a valid mapping with canonical ordering and a digest", () => {
    const graph = assembleEvidenceGraph(mappingInput());
    expect(graph.projectId).toBe(PROJECT);
    expect(graph.records).toHaveLength(2);
    expect(graph.links).toHaveLength(1);
    expect(graph.digest).toMatch(/^[0-9a-f]{64}$/);
    // Canonical record order: by evidenceId.
    const ids = graph.records.map((record) => record.evidenceId);
    expect([...ids].sort()).toEqual(ids);
  });

  it("deep-freezes the mapping (immutable by construction)", () => {
    const graph = assembleEvidenceGraph(mappingInput());
    expect(Object.isFrozen(graph)).toBe(true);
    expect(Object.isFrozen(graph.records)).toBe(true);
    expect(Object.isFrozen(graph.links)).toBe(true);
    expect(() => {
      (graph.records as unknown as unknown[]).push({});
    }).toThrow(TypeError);
  });

  it("is digest-invariant to input order (permutation invariance)", () => {
    const input = mappingInput({
      records: [measurementEvidence(), lidarEvidence()],
    });
    expect(assembleEvidenceGraph(input).digest).toBe(
      assembleEvidenceGraph(mappingInput()).digest,
    );
  });

  it("is fully deterministic (bit-identical for the same input)", () => {
    expect(assembleEvidenceGraph(mappingInput()).digest).toBe(
      assembleEvidenceGraph(mappingInput()).digest,
    );
  });

  it("the digest changes when any event is added", () => {
    const base = assembleEvidenceGraph(mappingInput());
    const withLink = assembleEvidenceGraph(
      mappingInput({
        links: [
          link(fixture.roomHeightSubject, measurementEvidence().evidenceId),
          link(fixture.doorSubject, lidarEvidence().evidenceId),
        ],
      }),
    );
    const withRetraction = assembleEvidenceGraph(
      mappingInput({
        linkRetractions: [
          linkRetraction({
            linkId: link(fixture.roomHeightSubject, measurementEvidence().evidenceId).linkId,
            retractedBy: "user:reviewer",
            retractedAt: "2026-09-05T09:00:00Z",
            reason: "wrong evidence",
          }),
        ],
      }),
    );
    expect(withLink.digest).not.toBe(base.digest);
    expect(withRetraction.digest).not.toBe(base.digest);
  });
});

describe("integrity rules (fail closed)", () => {
  it("rejects duplicate record identities", () => {
    expect(() =>
      assembleEvidenceGraph(mappingInput({ records: [lidarEvidence(), lidarEvidence()] })),
    ).toThrow(EvidenceError);
  });

  it("rejects duplicate link identities", () => {
    const theLink = link(fixture.roomHeightSubject, measurementEvidence().evidenceId);
    expect(() =>
      assembleEvidenceGraph(mappingInput({ links: [theLink, theLink] })),
    ).toThrow(EvidenceError);
  });

  it("rejects links citing unregistered evidence", () => {
    expect(() =>
      assembleEvidenceGraph(mappingInput({ links: [link(fixture.doorSubject, "ev-unknown00000000")] })),
    ).toThrow(EvidenceError);
  });

  it("rejects retractions of unknown evidence", () => {
    expect(() =>
      assembleEvidenceGraph(
        mappingInput({
          evidenceRetractions: [
            evidenceRetraction({
              evidenceId: "ev-unknown00000000",
              retractedBy: "user:reviewer",
              retractedAt: "2026-09-05T09:00:00Z",
              reason: "r",
            }),
          ],
        }),
      ),
    ).toThrow(EvidenceError);
  });

  it("rejects retractions of unknown links", () => {
    expect(() =>
      assembleEvidenceGraph(
        mappingInput({
          linkRetractions: [
            linkRetraction({
              linkId: "lnk-unknown00000000",
              retractedBy: "user:reviewer",
              retractedAt: "2026-09-05T09:00:00Z",
              reason: "r",
            }),
          ],
        }),
      ),
    ).toThrow(EvidenceError);
  });

  it("rejects duplicate evidence retractions (retraction is final)", () => {
    const retraction = evidenceRetraction({
      evidenceId: lidarEvidence().evidenceId,
      retractedBy: "user:reviewer",
      retractedAt: "2026-09-05T09:00:00Z",
      reason: "r",
    });
    expect(() =>
      assembleEvidenceGraph(mappingInput({ evidenceRetractions: [retraction, retraction] })),
    ).toThrow(EvidenceError);
  });

  it("rejects duplicate link retractions", () => {
    const theLink = link(fixture.roomHeightSubject, measurementEvidence().evidenceId);
    const retraction = linkRetraction({
      linkId: theLink.linkId,
      retractedBy: "user:reviewer",
      retractedAt: "2026-09-05T09:00:00Z",
      reason: "r",
    });
    expect(() =>
      assembleEvidenceGraph(mappingInput({ links: [theLink], linkRetractions: [retraction, retraction] })),
    ).toThrow(EvidenceError);
  });

  it("rejects a retraction that precedes the event it retracts", () => {
    expect(() =>
      assembleEvidenceGraph(
        mappingInput({
          evidenceRetractions: [
            evidenceRetraction({
              evidenceId: lidarEvidence().evidenceId,
              retractedBy: "user:reviewer",
              retractedAt: "2026-01-01T00:00:00Z",
              reason: "before registration",
            }),
          ],
        }),
      ),
    ).toThrow(EvidenceError);
  });

  it("rejects a record whose contentHash does not match its content", () => {
    const tampered = { ...lidarEvidence(), contentHash: "0".repeat(64) };
    expect(() => assembleEvidenceGraph(mappingInput({ records: [tampered] }))).toThrow(
      EvidenceError,
    );
  });

  it("rejects malformed project ids", () => {
    expect(() => assembleEvidenceGraph(mappingInput({ projectId: "bad project" }))).toThrow(
      EvidenceError,
    );
  });
});

describe("live-state computation", () => {
  const lidar = lidarEvidence();
  const measurement = measurementEvidence();
  const document = documentEvidence();
  const observation = observationEvidence();

  const graph = assembleEvidenceGraph({
    projectId: PROJECT,
    records: [lidar, measurement, document, observation],
    evidenceRetractions: [
      evidenceRetraction({
        evidenceId: document.evidenceId,
        retractedBy: "user:reviewer",
        retractedAt: "2026-09-05T09:00:00Z",
        reason: "superseded",
      }),
    ],
    links: [
      link(fixture.roomHeightSubject, measurement.evidenceId),
      link(fixture.fireRatingSubject, lidar.evidenceId),
      link(fixture.doorSubject, observation.evidenceId),
      link(fixture.wallSubject, document.evidenceId),
    ],
    linkRetractions: [
      linkRetraction({
        linkId: link(fixture.fireRatingSubject, lidar.evidenceId).linkId,
        retractedBy: "user:reviewer",
        retractedAt: "2026-09-06T09:00:00Z",
        reason: "support removed",
      }),
    ],
  });

  it("liveLinks excludes retracted links; liveRecords excludes retracted evidence", () => {
    expect(liveLinks(graph)).toHaveLength(3);
    expect(liveRecords(graph)).toHaveLength(3);
    expect(isEvidenceLive(graph, document.evidenceId)).toBe(false);
    expect(isEvidenceLive(graph, lidar.evidenceId)).toBe(true);
  });

  it("liveEvidenceForSubject resolves through live links to live evidence only", () => {
    // fireRating's only link was retracted → no live evidence.
    expect(liveEvidenceForSubject(graph, fixture.fireRatingSubject)).toHaveLength(0);
    // wall's link is live but its evidence is retracted → excluded.
    expect(liveEvidenceForSubject(graph, fixture.wallSubject)).toHaveLength(0);
    // roomHeight: live link + live evidence.
    const support = liveEvidenceForSubject(graph, fixture.roomHeightSubject);
    expect(support.map((record) => record.evidenceId)).toEqual([measurement.evidenceId]);
  });

  it("liveLinksForSubject returns the live links only", () => {
    expect(liveLinksForSubject(graph, fixture.fireRatingSubject)).toHaveLength(0);
    expect(liveLinksForSubject(graph, fixture.roomHeightSubject)).toHaveLength(1);
  });

  it("subjectsForEvidence inverts the live mapping (deduplicated, ordered)", () => {
    expect(subjectsForEvidence(graph, observation.evidenceId)).toEqual([fixture.doorSubject]);
    expect(subjectsForEvidence(graph, lidar.evidenceId)).toEqual([]);
    expect(subjectsForEvidence(graph, document.evidenceId)).toEqual([]);
  });
});
