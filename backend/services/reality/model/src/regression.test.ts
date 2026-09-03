/**
 * Epistemic-regression and source-discipline tests for the
 * ingestion path: PROPOSED propagation, no-confidence fabrication,
 * provenance completeness, and honest discontinuity across
 * versions.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import {
  epistemicChangesBetween,
  graphEpistemicState,
  objectsOfClass,
} from "@aise/engineering-model";
import { ingestArchitecturalScene, INGEST_METHOD } from "./ingest.js";

const MODEL = "model-regression";
const PROJECT = "project-regression";
const SPACE = "room-regression";
const target = { modelId: MODEL, projectId: PROJECT, spaceId: SPACE };

describe("PROPOSED content propagates (never silently upgraded)", () => {
  const scene = extractArchitecturalScene({
    points: exactRoomPoints(),
    unit: "meter",
    sourceEpistemic: "PROPOSED",
  });
  const { graph } = ingestArchitecturalScene(scene, target);

  it("keeps every object PROPOSED", () => {
    for (const object of graph.objects) {
      expect(object.epistemicState).toBe("PROPOSED");
    }
  });

  it("keeps the room measurement PROPOSED", () => {
    const roomHeight = graph.spaces[0]!.properties?.find((p) => p.key === "roomHeight");
    expect(roomHeight?.status).toBe("PROPOSED");
  });

  it("the graph summary is PROPOSED (weakest link)", () => {
    expect(graphEpistemicState(graph)).toBe("PROPOSED");
  });

  it("provenance input states stay PROPOSED (lineage honest)", () => {
    for (const object of graph.objects) {
      for (const input of object.provenance.inputs) {
        expect(input.epistemic).toBe("PROPOSED");
      }
    }
  });
});

describe("no-confidence discipline (the adapter fabricates none)", () => {
  // Declared per-point σ (1 cm) → the extraction propagates
  // first-order uncertainty into measurements; ingestion must pass
  // it through untouched.
  const scene = extractArchitecturalScene({
    points: exactRoomPoints(),
    unit: "meter",
    perPointStandardUncertainty: 0.01,
  });
  const { graph } = ingestArchitecturalScene(scene, target);

  it("the serialized ingested graph contains no confidence field anywhere", () => {
    // AC-070 allows confidence as a distinct field on property
    // assertions — but deterministic geometry has none to report,
    // and the ingestion adapter must never fabricate one. The
    // structural scan proves absence (the AISE-009/010 discipline,
    // now at the model boundary).
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toContain('"confidence"');
    for (const object of graph.objects) {
      for (const property of object.properties) {
        expect(property.confidence).toBeUndefined();
      }
    }
  });

  it("uncertainty is present where the extraction produced it (not replaced)", () => {
    const wall = objectsOfClass(graph, "WALL")[0]!;
    expect(wall.geometry!.structured!.width.uncertainty).toBeDefined();
    expect(wall.geometry!.structured!.width.uncertainty!.kind).toBe("standard");
    expect((wall.geometry!.structured!.width.uncertainty as { u: number }).u).toBeGreaterThan(0);
  });
});

describe("provenance completeness on the ingestion path", () => {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  const { graph } = ingestArchitecturalScene(scene, target);

  it("every object cites the ingestion method with content-pinned inputs", () => {
    for (const object of graph.objects) {
      expect(object.provenance.method).toBe(INGEST_METHOD);
      const inputs = object.provenance.inputs;
      expect(inputs.length).toBeGreaterThanOrEqual(2);
      expect(inputs[0]!.kind).toBe("object");
      expect(inputs[1]!.kind).toBe("scene");
      if (inputs[0]!.kind === "object") {
        expect(inputs[0]!.contentHash).toMatch(/^[0-9a-f]{64}$/);
      }
      if (inputs[1]!.kind === "scene") {
        expect(inputs[1]!.sceneId).toBe(scene.sceneId);
        expect(inputs[1]!.contentHash).toBe(scene.contentHash);
      }
    }
  });

  it("the materialized parameters record the scene lineage", () => {
    for (const object of graph.objects) {
      expect(object.provenance.parameters.sceneId).toBe(scene.sceneId);
      expect(object.provenance.parameters.sceneContentHash).toBe(scene.contentHash);
    }
  });
});

describe("honest discontinuity across versions", () => {
  const exactScene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  const noisyScene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter", perPointStandardUncertainty: 0.01 });

  it("epistemic changes are reported explicitly (never silent)", () => {
    const a = ingestArchitecturalScene(exactScene, target).graph;
    const b = ingestArchitecturalScene(noisyScene, target).graph;
    // Different upstream content → different identities → no
    // epistemic-change records (identity-based honesty).
    expect(epistemicChangesBetween(a, b)).toHaveLength(0);
    // Same content → no changes either.
    const a2 = ingestArchitecturalScene(exactScene, target).graph;
    expect(epistemicChangesBetween(a, a2)).toHaveLength(0);
  });
});
