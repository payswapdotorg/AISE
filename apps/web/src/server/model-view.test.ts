/**
 * The AISE-015 model-view suite: the read-only projection over
 * the seeded golden model — epistemic passthrough (AC-082), SI
 * normalization, digest pinning, determinism.
 */
import { describe, expect, it } from "vitest";
import { getVersion, listModels, listVersions } from "./model-store";
import { projectModelVersion } from "./model-view";

describe("the seeded authoritative store (deterministic golden chain)", () => {
  it("carries the golden model with two versions", () => {
    expect(listModels()).toEqual([{ modelId: "model-golden-room", projectId: "project-golden-room" }]);
    const versions = listVersions("model-golden-room");
    expect(versions.map((version) => version.version)).toEqual([1, 2]);
    expect(versions.every((version) => version.digest.match(/^[0-9a-f]{64}$/))).toBe(true);
  });

  it("unknown models/versions read as absent (never fabricated)", () => {
    expect(listVersions("model-other")).toEqual([]);
    expect(getVersion("model-other", 1)).toBeUndefined();
    expect(getVersion("model-golden-room", 99)).toBeUndefined();
  });

  it("v1 and v2 have distinct, stable digests (deterministic seeding)", () => {
    const v1 = getVersion("model-golden-room", 1)!;
    const v2 = getVersion("model-golden-room", 2)!;
    expect(v1.record.digest).not.toBe(v2.record.digest);
    // Replay: the store is deterministic per process.
    const again = getVersion("model-golden-room", 1)!;
    expect(again.record.digest).toBe(v1.record.digest);
  });
});

describe("the read-only view projection (AC-082 epistemic passthrough)", () => {
  it("v1: all objects INFERRED, the roomHeight estimate passes through with its epistemic state", () => {
    const v1 = getVersion("model-golden-room", 1)!;
    const view = projectModelVersion(v1.graph, 1);
    expect(view.objects).toHaveLength(8);
    expect(view.epistemicSummary.objects).toEqual({ INFERRED: 8 }); // raw extraction: every object INFERRED
  });

  it("v2: the CONFIRMED roomHeight measurement passes through exactly (AC-082)", () => {
    const v2 = getVersion("model-golden-room", 2)!;
    const view = projectModelVersion(v2.graph, 2);
    const space = view.spaces[0]!;
    const roomHeight = space.properties.find((property) => property.key === "roomHeight")!;
    expect(roomHeight.status).toBe("CONFIRMED");
    expect(roomHeight.kind).toBe("measurement");
    expect(roomHeight.value).toBe(2.7);
    expect(roomHeight.unit).toBe("meter");
    expect(roomHeight.uncertainty).toContain("0.005");
    expect(roomHeight.evidenceRefs?.length).toBe(1);
    // The epistemic summary distinguishes states honestly:
    // the review confirmed the DOOR object (v2), everything else INFERRED.
    expect(view.epistemicSummary.objects).toEqual({ INFERRED: 7, CONFIRMED: 1 });
  });

  it("geometry views carry SI-normalized values and world-space corners", () => {
    const v2 = getVersion("model-golden-room", 2)!;
    const view = projectModelVersion(v2.graph, 2);
    const floor = view.objects.find((object) => object.objectClass === "FLOOR")!;
    expect(floor.geometry?.widthM).toBeCloseTo(4, 9);
    expect(floor.geometry?.heightM).toBeCloseTo(3, 9);
    expect(floor.geometry?.areaM2).toBeCloseTo(12, 6);
    expect(floor.geometry?.corners).toHaveLength(4);
    const ceiling = view.objects.find((object) => object.objectClass === "CEILING")!;
    expect(ceiling.geometry?.elevationM).toBeCloseTo(2.7, 9);
    const window = view.objects.find((object) => object.objectClass === "WINDOW")!;
    expect(window.geometry?.sillM).toBeCloseTo(0.9, 9);
  });

  it("the projection is deterministic (bit-identical on replay)", () => {
    const v2 = getVersion("model-golden-room", 2)!;
    const a = JSON.stringify(projectModelVersion(v2.graph, 2));
    const b = JSON.stringify(projectModelVersion(v2.graph, 2));
    expect(a).toBe(b);
  });
});
