import { describe, expect, it } from "vitest";
import { compareObjects, compareSpaces, compareRelationships } from "./compare.js";
import { makeRealityObject } from "@aise/engineering-model";
import {
  roomGraph,
  versionRecord,
  versionProducer,
  wallInput,
  wallGeometry,
  heightProperty,
  presenceProperty,
  HASHES,
  MODEL,
  SPACE,
} from "./testing.js";

const V1_AT = "2026-09-05T10:00:00Z";
const V2_AT = "2026-09-06T10:00:00Z";

describe("AISE-031 object comparison", () => {
  it("added/removed objects are identity facts — never a fabricated correspondence", () => {
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, V1_AT);
    const v2 = versionRecord(roomGraph({ objects: [] }), 2, V2_AT);
    const records = compareObjects(v1.graph, v2.graph);
    expect(records).toHaveLength(1);
    expect(records[0]!.kind).toBe("object-removed");
    expect(records[0]!.side).toBe("from");
    expect(records[0]!.detail).toContain("no correspondence");

    const v2b = versionRecord(roomGraph({ objects: [wallInput({ provenanceName: "wall2" })] }), 2, V2_AT);
    const records2 = compareObjects(v1.graph, v2b.graph);
    const kinds = records2.map((record) => record.kind).sort();
    // Different source pin -> different identity: removal + addition, not "moved".
    expect(kinds).toEqual(["object-added", "object-removed"]);
  });

  it("epistemic transitions decompose into their own records (identity preserved)", () => {
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, V1_AT);
    const v2 = versionRecord(roomGraph({ objects: [wallInput({ epistemicState: "CONFIRMED" })] }), 2, V2_AT);
    const records = compareObjects(v1.graph, v2.graph);
    expect(records).toHaveLength(1);
    expect(records[0]!.kind).toBe("object-epistemic-changed");
    expect(records[0]!.epistemic).toEqual({ previous: "INFERRED", current: "CONFIRMED" });
    expect(records[0]!.provenance?.previous?.method).toContain("history/test/wall");
    expect(records[0]!.provenance?.current?.method).toContain("history/test/wall");
  });

  it("name changes decompose (null-able: appearance and disappearance included)", () => {
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, V1_AT);
    const named = versionRecord(roomGraph({ objects: [wallInput({ name: "north wall" })] }), 2, V2_AT);
    const records = compareObjects(v1.graph, named.graph);
    expect(records).toHaveLength(1);
    expect(records[0]!.kind).toBe("object-name-changed");
    expect(records[0]!.name).toEqual({ previous: null, current: "north wall" });
  });

  it("unchanged objects produce no records", () => {
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, V1_AT);
    const v2 = versionRecord(roomGraph({ objects: [wallInput()] }), 2, V2_AT);
    expect(compareObjects(v1.graph, v2.graph)).toHaveLength(0);
  });
});

describe("AISE-031 geometry decomposition", () => {
  it("geometry mechanism added/removed", () => {
    const bare = versionRecord(roomGraph({ objects: [wallInput()] }), 1, V1_AT);
    const withGeometry = versionRecord(roomGraph({ objects: [wallInput({ geometry: wallGeometry({}) })] }), 2, V2_AT);
    const added = compareObjects(bare.graph, withGeometry.graph);
    expect(added.map((record) => record.kind)).toEqual(["geometry-added"]);

    const removed = compareObjects(withGeometry.graph, bare.graph);
    expect(removed.map((record) => record.kind)).toEqual(["geometry-removed"]);
  });

  it("frame, extent and quantity changes decompose with uncertainty passthrough", () => {
    const v1 = versionRecord(
      roomGraph({
        objects: [wallInput({ geometry: wallGeometry({ widthUncertainty: { kind: "standard", u: 0.03 } }) })],
      }),
      1,
      V1_AT,
    );
    const v2 = versionRecord(
      roomGraph({
        objects: [
          wallInput({
            geometry: wallGeometry({
              width: 4.02,
              widthUncertainty: { kind: "standard", u: 0.04 },
              uMin: -2.01,
              uMax: 2.01,
              area: 10.8,
            }),
          }),
        ],
      }),
      2,
      V2_AT,
    );
    const records = compareObjects(v1.graph, v2.graph);
    const kinds = records.map((record) => record.kind).sort();
    expect(kinds).toEqual(["geometry-extent-changed", "geometry-quantity-changed"]);

    const quantityRecord = records.find((record) => record.kind === "geometry-quantity-changed")!;
    // Both sides' uncertainties preserved VERBATIM and separately.
    expect(quantityRecord.quantity!.previous.uncertainty).toEqual({ kind: "standard", u: 0.03 });
    expect(quantityRecord.quantity!.current.uncertainty).toEqual({ kind: "standard", u: 0.04 });
    // The delta combines them by RSS — never folds them into one number.
    expect(quantityRecord.quantityDelta!.combinedUncertainty).toEqual({ kind: "standard", u: 0.05 });
    expect(quantityRecord.quantityDelta!.value).toBeCloseTo(0.02, 12);
    // Confidence is NOT part of the quantity record (separate axis).
    expect(quantityRecord.confidence).toBeUndefined();
  });

  it("quality metrics and asset refs decompose", () => {
    const v1 = versionRecord(
      roomGraph({
        objects: [
          wallInput({
            geometry: wallGeometry({ pointCount: 1200 }),
          }),
        ],
      }),
      1,
      V1_AT,
    );
    const v2 = versionRecord(
      roomGraph({
        objects: [
          wallInput({
            geometry: wallGeometry({ pointCount: 2400 }),
            assetRefs: [{ kind: "point-cloud", contentHash: HASHES.scan, pointCount: 2400, epistemic: "INFERRED" }],
          }),
        ],
      }),
      2,
      V2_AT,
    );
    const records = compareObjects(v1.graph, v2.graph);
    const kinds = records.map((record) => record.kind).sort();
    expect(kinds).toEqual(["geometry-assets-changed", "geometry-quality-changed"]);
    const assets = records.find((record) => record.kind === "geometry-assets-changed")!;
    expect(assets.refs).toEqual({ previous: [], current: [HASHES.scan] });
  });

  it("optional-quantity presence changes are their OWN records (never silently dropped)", () => {
    const withElevation = wallGeometry({
      elevation: { value: 3.1, unit: "meter", uncertainty: { kind: "standard", u: 0.02 } },
    });
    const v1 = versionRecord(
      roomGraph({ objects: [wallInput({ geometry: withElevation })] }),
      1,
      V1_AT,
    );
    const v2 = versionRecord(
      roomGraph({ objects: [wallInput({ geometry: wallGeometry({}) })] }),
      2,
      V2_AT,
    );
    const removedSide = compareObjects(v1.graph, v2.graph);
    expect(removedSide.map((record) => record.kind)).toEqual(["geometry-quantity-removed"]);
    const removed = removedSide[0]!;
    expect(removed.detail).toContain("elevation");
    expect(removed.side).toBe("from");
    // The verbatim snapshot of the side that stated it — uncertainty included,
    // never a fabricated counterpart on the absent side.
    expect(removed.singleQuantity).toEqual({
      value: 3.1,
      unit: "meter",
      uncertainty: { kind: "standard", u: 0.02 },
    });
    expect(removed.quantity).toBeUndefined();
    expect(removed.quantityDelta).toBeUndefined();

    const addedSide = compareObjects(v2.graph, v1.graph);
    expect(addedSide.map((record) => record.kind)).toEqual(["geometry-quantity-added"]);
    const added = addedSide[0]!;
    expect(added.detail).toContain("elevation");
    expect(added.side).toBe("to");
    expect(added.singleQuantity).toEqual({
      value: 3.1,
      unit: "meter",
      uncertainty: { kind: "standard", u: 0.02 },
    });

    // A value change on a BOTH-side-present quantity stays a change record
    // (presence and value changes never mix kinds).
    const v2changed = versionRecord(
      roomGraph({
        objects: [
          wallInput({ geometry: wallGeometry({ elevation: { value: 3.4, unit: "meter" } }) }),
        ],
      }),
      2,
      V2_AT,
    );
    const changed = compareObjects(v1.graph, v2changed.graph);
    expect(changed.map((record) => record.kind)).toEqual(["geometry-quantity-changed"]);
  });
});

describe("AISE-031 property decomposition", () => {
  it("property added/removed", () => {
    const withProp = versionRecord(
      roomGraph({ objects: [wallInput({ properties: [heightProperty({})] })] }),
      1,
      V1_AT,
    );
    const withoutProp = versionRecord(roomGraph({ objects: [wallInput()] }), 2, V2_AT);
    const records = compareObjects(withProp.graph, withoutProp.graph);
    expect(records.map((record) => record.kind)).toEqual(["property-removed"]);

    const added = compareObjects(withoutProp.graph, withProp.graph);
    expect(added.map((record) => record.kind)).toEqual(["property-added"]);
  });

  it("quantity, status, confidence, kind and evidence changes are SEPARATE records", () => {
    const v1 = versionRecord(
      roomGraph({
        objects: [
          wallInput({
            properties: [
              heightProperty({
                value: 2.7,
                uncertainty: { kind: "standard", u: 0.03 },
                status: "INFERRED",
                confidence: 0.5,
                kind: "estimate",
              }),
            ],
          }),
        ],
      }),
      1,
      V1_AT,
    );
    const v2 = versionRecord(
      roomGraph({
        objects: [
          wallInput({
            properties: [
              heightProperty({
                value: 2.72,
                uncertainty: { kind: "standard", u: 0.04 },
                status: "CONFIRMED",
                confidence: 0.9,
                kind: "measurement",
                evidenceRefs: ["ev-1"],
              }),
            ],
          }),
        ],
      }),
      2,
      V2_AT,
    );
    const records = compareObjects(v1.graph, v2.graph);
    const kinds = records.map((record) => record.kind).sort();
    expect(kinds).toEqual([
      "property-confidence-changed",
      "property-evidence-changed",
      "property-kind-changed",
      "property-quantity-changed",
      "property-status-changed",
    ]);

    const quantityRecord = records.find((record) => record.kind === "property-quantity-changed")!;
    expect(quantityRecord.quantityDelta!.value).toBeCloseTo(0.02, 12);
    expect(quantityRecord.quantityDelta!.combinedUncertainty).toEqual({ kind: "standard", u: 0.05 });
    // Epistemic status is NOT on the quantity record.
    expect(quantityRecord.epistemic).toBeUndefined();
    const statusRecord = records.find((record) => record.kind === "property-status-changed")!;
    expect(statusRecord.epistemic).toEqual({ previous: "INFERRED", current: "CONFIRMED" });
    // Confidence is its own record, never on the quantity record.
    const confidenceRecord = records.find((record) => record.kind === "property-confidence-changed")!;
    expect(confidenceRecord.confidence).toEqual({ previous: 0.5, current: 0.9 });
    expect(quantityRecord.confidence).toBeUndefined();
  });

  it("uncertainty-only change is a real change (never collapsed)", () => {
    const v1 = versionRecord(
      roomGraph({ objects: [wallInput({ properties: [heightProperty({ uncertainty: { kind: "standard", u: 0.03 } })] })] }),
      1,
      V1_AT,
    );
    const v2 = versionRecord(
      roomGraph({ objects: [wallInput({ properties: [heightProperty({ uncertainty: { kind: "standard", u: 0.05 } })] })] }),
      2,
      V2_AT,
    );
    const records = compareObjects(v1.graph, v2.graph);
    expect(records).toHaveLength(1);
    expect(records[0]!.kind).toBe("property-quantity-changed");
    expect(records[0]!.quantityDelta!.value).toBe(0);
    expect(records[0]!.quantityDelta!.combinedUncertainty).toEqual({ kind: "standard", u: Math.hypot(0.03, 0.05) });
  });

  it("shape change (quantity <-> presence) decomposes", () => {
    const v1 = versionRecord(
      roomGraph({ objects: [wallInput({ properties: [heightProperty({})] })] }),
      1,
      V1_AT,
    );
    const v2 = versionRecord(
      roomGraph({ objects: [wallInput({ properties: [presenceProperty("roomHeight", "NOT_OBSERVED")] })] }),
      2,
      V2_AT,
    );
    const records = compareObjects(v1.graph, v2.graph);
    expect(records.map((record) => record.kind)).toEqual(["property-shape-changed"]);
    expect(records[0]!.shape).toEqual({ previous: "quantity", current: "presence" });
  });

  it("space properties decompose with the same discipline", () => {
    const v1 = versionRecord(
      roomGraph({ spaceProperties: [heightProperty({ status: "INFERRED" })] }),
      1,
      V1_AT,
    );
    const v2 = versionRecord(
      roomGraph({ spaceProperties: [heightProperty({ status: "CONFIRMED", evidenceRefs: ["ev-1"] })] }),
      2,
      V2_AT,
    );
    const records = compareSpaces(v1, v2);
    const kinds = records.map((record) => record.kind).sort();
    expect(kinds).toEqual(["property-evidence-changed", "property-kind-changed", "property-status-changed"]);
    const status = records.find((record) => record.kind === "property-status-changed")!;
    expect(status.subject).toEqual({ kind: "property", ownerSpaceId: SPACE, propertyKey: "roomHeight" });
    // Space-owned property records carry the compared VERSIONS' producers
    // (the authoritative source-version provenance, not a synthesized one).
    expect(status.provenance?.previous?.method).toBe("history/test/version-commit/v1");
    expect(status.provenance?.current?.method).toBe("history/test/version-commit/v2");
  });
});

describe("AISE-031 space and relationship comparison", () => {
  it("space added/removed/name/parent/frame decompose", () => {
    const v1 = versionRecord(roomGraph({}), 1, V1_AT);
    const v2 = versionRecord(
      roomGraph({
        spaceProperties: undefined,
      }),
      2,
      V2_AT,
    );
    // Same space id, no changes -> no records.
    expect(compareSpaces(v1, v2)).toHaveLength(0);

    const renamed = assembleRenamedSpace();
    const records = compareSpaces(v1, { graph: renamed, producer: versionProducer(2) });
    expect(records.map((record) => record.kind)).toEqual(["space-name-changed"]);
    expect(records[0]!.name).toEqual({ previous: "test room", current: "renamed room" });
    // Authoritative version-producer provenance (both sides pinned, never synthesized).
    expect(records[0]!.provenance?.previous?.method).toBe("history/test/version-commit/v1");
    expect(records[0]!.provenance?.current?.method).toBe("history/test/version-commit/v2");
  });

  it("space added/removed carry the introducing version's producer", () => {
    const v1 = versionRecord(roomGraph({}), 1, V1_AT);
    const introducingProducer = versionProducer(9);
    const spaceless = { ...v1.graph, spaces: [], relationships: [] };

    const added = compareSpaces(
      { graph: spaceless, producer: versionProducer(1) },
      { graph: v1.graph, producer: introducingProducer },
    );
    expect(added.map((record) => record.kind)).toEqual(["space-added"]);
    expect(added[0]!.provenance?.current?.method).toBe("history/test/version-commit/v9");
    expect(added[0]!.provenance?.previous).toBeUndefined();

    const removed = compareSpaces(
      { graph: v1.graph, producer: introducingProducer },
      { graph: spaceless, producer: versionProducer(10) },
    );
    expect(removed.map((record) => record.kind)).toEqual(["space-removed"]);
    expect(removed[0]!.provenance?.previous?.method).toBe("history/test/version-commit/v9");
    expect(removed[0]!.provenance?.current).toBeUndefined();
  });

  it("relationships added/removed (identity-only in v1)", () => {
    const wall = wallInput({});
    const door = wallInput({ objectClass: "DOOR", provenanceName: "door" });
    const wallId = makeRealityObject(MODEL, wall).objectId;
    const doorId = makeRealityObject(MODEL, door).objectId;

    const v1 = versionRecord(
      roomGraph({
        objects: [wall, door],
        relationships: [
          { type: "CONTAINS", fromId: SPACE, toId: wallId },
          { type: "CONTAINS", fromId: SPACE, toId: doorId },
          { type: "OPENING_IN", fromId: doorId, toId: wallId },
        ],
      }),
      1,
      V1_AT,
    );
    const v2 = versionRecord(
      roomGraph({
        objects: [wall],
        relationships: [
          { type: "CONTAINS", fromId: SPACE, toId: wallId },
        ],
      }),
      2,
      V2_AT,
    );
    const records = compareRelationships(v1, v2);
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.kind === "relationship-removed" && record.side === "from")).toBe(true);
    expect(records.some((record) => record.detail.includes("OPENING_IN"))).toBe(true);
    // REQUIRED authoritative provenance: the removed side's version producer.
    for (const record of records) {
      expect(record.provenance?.previous?.method).toBe("history/test/version-commit/v1");
      expect(record.provenance?.current).toBeUndefined();
    }

    const added = compareRelationships(v2, v1);
    expect(added).toHaveLength(2);
    expect(added.every((record) => record.kind === "relationship-added")).toBe(true);
    // The added side carries the CURRENT (introducing) version's producer.
    for (const record of added) {
      expect(record.provenance?.current?.method).toBe("history/test/version-commit/v1");
      expect(record.provenance?.previous).toBeUndefined();
    }
  });
});

function assembleRenamedSpace() {
  // Build the same graph with a renamed space (same identity, different name).
  const graph = roomGraph({});
  return {
    ...graph,
    spaces: graph.spaces.map((space) =>
      space.spaceId === SPACE ? { ...space, name: "renamed room" } : space,
    ),
  };
}
