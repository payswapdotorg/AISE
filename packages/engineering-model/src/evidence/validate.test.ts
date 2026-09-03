/**
 * Whole-mapping validation tests (the persistence-boundary
 * gate): honest graphs pass; tampered, thawed, and digest-forged
 * graphs fail closed.
 */
import { describe, expect, it } from "vitest";
import { EvidenceError } from "./errors.js";
import { validateEvidenceGraph } from "./validate.js";
import { assembleEvidenceGraph } from "./graph.js";
import { fixture, lidarEvidence, link, measurementEvidence } from "./testing.js";

const PROJECT = "project-evidence";

function honestGraph() {
  const lidar = lidarEvidence();
  const measurement = measurementEvidence();
  return assembleEvidenceGraph({
    projectId: PROJECT,
    records: [lidar, measurement],
    evidenceRetractions: [],
    links: [
      link(fixture.roomHeightSubject, measurement.evidenceId),
      link(fixture.doorSubject, lidar.evidenceId),
    ],
    linkRetractions: [],
  });
}

describe("validateEvidenceGraph (the boundary gate)", () => {
  it("accepts an honestly assembled graph", () => {
    expect(() => validateEvidenceGraph(honestGraph())).not.toThrow();
  });

  it("accepts a re-assembled graph of the same content (determinism)", () => {
    const graph = honestGraph();
    const replay = assembleEvidenceGraph({
      projectId: graph.projectId,
      records: [...graph.records].reverse(),
      evidenceRetractions: graph.evidenceRetractions,
      links: [...graph.links].reverse(),
      linkRetractions: graph.linkRetractions,
    });
    expect(replay.digest).toBe(graph.digest);
    expect(() => validateEvidenceGraph(replay)).not.toThrow();
  });

  it("rejects non-object inputs", () => {
    expect(() => validateEvidenceGraph(null as never)).toThrow(EvidenceError);
    expect(() => validateEvidenceGraph("graph" as never)).toThrow(EvidenceError);
  });

  it("rejects thawed (unfrozen) graphs", () => {
    const graph = honestGraph();
    const thawed = Object.freeze({ ...graph, records: [...graph.records] });
    // The top level is frozen but the records array is not.
    expect(() => validateEvidenceGraph(thawed as never)).toThrow(EvidenceError);
  });

  it("rejects a forged digest (bit drift detection)", () => {
    const graph = honestGraph();
    const forged = Object.freeze({ ...graph, digest: "0".repeat(64) }) as typeof graph;
    expect(() => validateEvidenceGraph(forged)).toThrow(EvidenceError);
  });

  it("rejects a digest borrowed from different content", () => {
    const graph = honestGraph();
    const different = assembleEvidenceGraph({
      projectId: PROJECT,
      records: graph.records,
      evidenceRetractions: [],
      links: [graph.links[0]!],
      linkRetractions: [],
    });
    const tampered = Object.freeze({ ...graph, digest: different.digest }) as typeof graph;
    expect(() => validateEvidenceGraph(tampered)).toThrow(EvidenceError);
  });

  it("rejects content drift behind an honest-looking digest", () => {
    const graph = honestGraph();
    // Replace one link with a different valid link (same identity
    // impossible — use a different subject) but keep the digest:
    // re-assembly derives a different digest → rejected.
    const drifted = Object.freeze({
      ...graph,
      links: Object.freeze([graph.links[0]!, link(fixture.wallSubject, lidarEvidence().evidenceId)]),
    }) as typeof graph;
    expect(() => validateEvidenceGraph(drifted)).toThrow(EvidenceError);
  });
});
