import { describe, expect, it } from "vitest";
import { compareModelVersions, HISTORICAL_CHANGE_LIMITATIONS } from "./report.js";
import { isHistoryError } from "./errors.js";
import {
  roomGraph,
  versionRecord,
  wallInput,
  heightProperty,
  wallGeometry,
  evidenceGraphFor,
  deepClone,
  MODEL,
} from "./testing.js";
import { makeRealityObject, propertyAssertion } from "@aise/engineering-model";
import { validateHistoricalChangeReport } from "./validate.js";
import { graphContentDigest } from "@aise/engineering-model";

const V1_AT = "2026-09-05T10:00:00Z";
const V2_AT = "2026-09-06T10:00:00Z";

function simplePair() {
  const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, V1_AT);
  const v2 = versionRecord(
    roomGraph({ objects: [wallInput({ epistemicState: "CONFIRMED", properties: [heightProperty({ status: "CONFIRMED" })] })] }),
    2,
    V2_AT,
  );
  return { from: v1, to: v2 };
}

describe("AISE-031 comparison boundary (fail-closed)", () => {
  it("rejects cross-model comparisons", () => {
    const { from } = simplePair();
    const foreign = versionRecord(
      roomGraph({ objects: [wallInput()], modelId: "other-model" }),
      2,
      V2_AT,
    );
    try {
      compareModelVersions({ from, to: foreign });
      expect.unreachable();
    } catch (error) {
      expect(isHistoryError(error)).toBe(true);
      expect((error as { code: string }).code).toBe("MODEL_MISMATCH");
    }
  });

  it("rejects non-ascending version comparisons", () => {
    const { from, to } = simplePair();
    try {
      compareModelVersions({ from: to, to: from });
      expect.unreachable();
    } catch (error) {
      expect((error as { code: string }).code).toBe("VERSION_INVALID");
    }
  });

  it("rejects a tampered version pin (digest pin mismatch)", () => {
    const { from, to } = simplePair();
    const tamperedRecord = { ...to.record, digest: "0".repeat(64) };
    try {
      compareModelVersions({ from, to: { record: tamperedRecord, graph: to.graph, producer: to.producer } });
      expect.unreachable();
    } catch (error) {
      expect((error as { code: string }).code).toBe("DIGEST_MISMATCH");
    }
  });

  it("rejects a tampered graph (content re-validation fails closed)", () => {
    const { from, to } = simplePair();
    const clone = deepClone(to.graph);
    const tamperedGraph = {
      ...clone,
      objects: clone.objects.map((object) => ({ ...object, epistemicState: "PROPOSED" as const })),
    };
    try {
      compareModelVersions({ from, to: { record: to.record, graph: tamperedGraph, producer: to.producer } });
      expect.unreachable();
    } catch (error) {
      expect(isHistoryError(error)).toBe(true);
    }
  });

  it("rejects a MISSING version producer (provenance is mandatory, never defaulted)", () => {
    const { from, to } = simplePair();
    try {
      compareModelVersions({ from, to: { record: to.record, graph: to.graph } as never });
      expect.unreachable();
    } catch (error) {
      expect(isHistoryError(error)).toBe(true);
      expect((error as { code: string }).code).toBe("INPUT_INVALID");
      expect((error as { message: string }).message).toContain("producer");
    }
  });

  it("rejects a MALFORMED version producer (fail-closed ModelProvenance validation)", () => {
    const { from, to } = simplePair();
    const malformed = { ...deepClone(to.producer), methodVersion: "not-semver" };
    try {
      compareModelVersions({ from, to: { record: to.record, graph: to.graph, producer: malformed } });
      expect.unreachable();
    } catch (error) {
      expect(isHistoryError(error)).toBe(true);
      expect((error as { code: string }).code).toBe("INPUT_INVALID");
      expect((error as { message: string }).message).toContain("producer");
    }
  });

  it("rejects asymmetric evidence input", () => {
    const { from, to } = simplePair();
    const wallId = to.graph.objects[0]!.objectId;
    try {
      compareModelVersions({
        from,
        to,
        evidence: { from: evidenceGraphFor({ version: 1, objectId: wallId }) } as never,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as { code: string }).code).toBe("EVIDENCE_ASYMMETRIC");
    }
  });

  it("rejects malformed input shapes", () => {
    try {
      compareModelVersions(null as never);
      expect.unreachable();
    } catch (error) {
      expect((error as { code: string }).code).toBe("INPUT_INVALID");
    }
  });
});

describe("AISE-031 report determinism and honesty", () => {
  it("is deterministic: identical inputs produce a bit-identical report", () => {
    const { from, to } = simplePair();
    const a = compareModelVersions({ from, to });
    const b = compareModelVersions({ from, to });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.digest).toBe(b.digest);
  });

  it("input ORDER does not matter (canonical graph order is normalized by the model)", () => {
    const wallA = wallInput({ provenanceName: "a" });
    const wallB = wallInput({ provenanceName: "b", epistemicState: "CONFIRMED" });
    const v1a = versionRecord(roomGraph({ objects: [wallA, wallB] }), 1, V1_AT);
    const v1b = versionRecord(roomGraph({ objects: [wallB, wallA] }), 1, V1_AT);
    // assembleModelGraph canonicalizes order, so both graphs are identical.
    expect(graphContentDigest(v1a.graph.modelId, v1a.graph.projectId, v1a.graph.spaces, v1a.graph.objects, v1a.graph.relationships)).toBe(
      graphContentDigest(v1b.graph.modelId, v1b.graph.projectId, v1b.graph.spaces, v1b.graph.objects, v1b.graph.relationships),
    );
  });

  it("the comparison is READ-ONLY: inputs are bit-identical before and after", () => {
    const { from, to } = simplePair();
    const fromBefore = JSON.stringify(from.graph);
    const toBefore = JSON.stringify(to.graph);
    compareModelVersions({ from, to });
    expect(JSON.stringify(from.graph)).toBe(fromBefore);
    expect(JSON.stringify(to.graph)).toBe(toBefore);
  });

  it("summary counts are honest and records are canonically ordered", () => {
    const { from, to } = simplePair();
    const report = compareModelVersions({ from, to });
    expect(report.modelId).toBe(MODEL);
    expect(report.summary.total).toBe(report.records.length);
    expect(report.summary.objectsChanged).toBe(1);
    expect(report.summary.objectsAdded).toBe(0);
    expect(report.summary.objectsRemoved).toBe(0);
    expect(report.summary.identical).toBe(false);
    expect(report.from.version).toBe(1);
    expect(report.to.version).toBe(2);
    expect(report.from.digest).toBe(from.record.digest);
    const total = report.summary.byCategory.reduce((sum, row) => sum + row.count, 0);
    expect(total).toBe(report.records.length);
    // Epistemic + property records are present for the confirmation change.
    const kinds = report.records.map((record) => record.kind);
    expect(kinds).toContain("object-epistemic-changed");
    expect(kinds).toContain("property-added");
  });

  it("identical versions produce an empty report with identical=true", () => {
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, V1_AT);
    const v2 = versionRecord(roomGraph({ objects: [wallInput()] }), 2, V2_AT);
    const report = compareModelVersions({ from: v1, to: v2 });
    expect(report.records).toHaveLength(0);
    expect(report.summary.identical).toBe(true);
    expect(report.summary.objectsChanged).toBe(0);
  });

  it("documents its limitations honestly (non-decomposed fields never silently identical)", () => {
    expect(HISTORICAL_CHANGE_LIMITATIONS.length).toBeGreaterThanOrEqual(8);
    expect(HISTORICAL_CHANGE_LIMITATIONS.some((line) => line.includes("identical"))).toBe(true);
    // Method-only metadata change: no records, but identical=false (digests differ).
    const v1 = versionRecord(
      roomGraph({
        objects: [
          wallInput({
            geometry: wallGeometry({}),
            properties: [heightProperty({ status: "INFERRED", kind: "estimate" })],
          }),
        ],
      }),
      1,
      V1_AT,
    );
    // v2: same assertion content, but verifiedBy/verifiedAt cannot change on INFERRED;
    // instead exercise the documented case with confidence flip on the same axis.
    const v2 = versionRecord(
      roomGraph({
        objects: [
          wallInput({
            geometry: wallGeometry({}),
            properties: [heightProperty({ status: "INFERRED", kind: "estimate", confidence: 0.7 })],
          }),
        ],
      }),
      2,
      V2_AT,
    );
    const report = compareModelVersions({ from: v1, to: v2 });
    expect(report.records.map((record) => record.kind)).toEqual(["property-confidence-changed"]);
    expect(report.summary.identical).toBe(false);
  });

  it("a non-decomposed change (assertion method label) is never silently identical", () => {
    // v1/v2 differ ONLY in the roomHeight derivation-method label (AC-061 metadata):
    // no decomposed records, but the pinned digests differ -> identical must be false.
    const v1 = versionRecord(
      roomGraph({
        objects: [wallInput({ properties: [heightProperty({ status: "INFERRED", kind: "estimate" })] })],
      }),
      1,
      V1_AT,
    );
    const withMethod = (method: string) =>
      roomGraph({
        objects: [
          wallInput({
            properties: [
              propertyAssertion({
                key: "roomHeight",
                quantity: { value: 2.7, unit: "meter" },
                status: "INFERRED",
                kind: "estimate",
                method,
              }),
            ],
          }),
        ],
      });
    const v1m = versionRecord(withMethod("derived/v1"), 1, V1_AT);
    const v2m = versionRecord(withMethod("derived/v2"), 2, V2_AT);
    const report = compareModelVersions({ from: v1m, to: v2m });
    expect(report.records).toHaveLength(0);
    expect(report.summary.identical).toBe(false);
    expect(report.summary.objectsChanged).toBe(1);
    // The same graph on both sides IS identical.
    const same = compareModelVersions({ from: v1, to: versionRecord(roomGraph({ objects: [wallInput({ properties: [heightProperty({ status: "INFERRED", kind: "estimate" })] })] }), 2, V2_AT) });
    expect(same.summary.identical).toBe(true);
    void v1m;
  });

  it("added AND removed records both state the no-correspondence discipline", () => {
    const v1 = versionRecord(roomGraph({ objects: [wallInput()] }), 1, V1_AT);
    const v2 = versionRecord(
      roomGraph({ objects: [wallInput({ provenanceName: "different-pin" })] }),
      2,
      V2_AT,
    );
    const report = compareModelVersions({ from: v1, to: v2 });
    // New source pin -> new identity: object AND its containment relationship are
    // removed and re-added. Both object records carry the no-correspondence discipline.
    const objectRecords = report.records.filter((record) => record.category === "object");
    expect(objectRecords.map((record) => record.kind).sort()).toEqual(["object-added", "object-removed"]);
    for (const record of objectRecords) {
      expect(record.detail).toContain("no correspondence");
    }
    // The relationship records now REQUIRE and carry the authoritative version producers.
    const relationshipRecords = report.records.filter((record) => record.category === "relationship");
    expect(relationshipRecords.map((record) => record.kind).sort()).toEqual([
      "relationship-added",
      "relationship-removed",
    ]);
    for (const record of relationshipRecords) {
      if (record.kind === "relationship-added") {
        expect(record.provenance?.current?.method).toBe("history/test/version-commit/v2");
      } else {
        expect(record.provenance?.previous?.method).toBe("history/test/version-commit/v1");
      }
    }
  });

  it("records are canonically ordered across objects (independent of graph class-rank order)", () => {
    // Find a deterministic fixture pair where the graph's class-rank order
    // disagrees with objectId order, so generation order would differ from
    // canonical order without the explicit sort.
    let wallName = "";
    let ceilingName = "";
    let wallId = "";
    let ceilingId = "";
    for (let index = 0; index < 200; index += 1) {
      const wall = wallInput({ provenanceName: `order-wall-${index}` });
      const ceiling = wallInput({ objectClass: "CEILING", provenanceName: `order-ceiling-${index}` });
      const candidateWallId = makeRealityObject(MODEL, wall).objectId;
      const candidateCeilingId = makeRealityObject(MODEL, ceiling).objectId;
      // Graph canonical order is (class rank, objectId): CEILING(1) ranks BEFORE WALL(2).
      // We need the WALL id to sort BEFORE the CEILING id so generation order
      // (ceiling first) disagrees with canonical record order (wall first).
      if (candidateWallId < candidateCeilingId) {
        wallName = `order-wall-${index}`;
        ceilingName = `order-ceiling-${index}`;
        wallId = candidateWallId;
        ceilingId = candidateCeilingId;
        break;
      }
    }
    expect(wallName).not.toBe("");
    expect(wallId < ceilingId).toBe(true);

    const v1 = versionRecord(
      roomGraph({
        objects: [wallInput({ provenanceName: wallName }), wallInput({ objectClass: "CEILING", provenanceName: ceilingName })],
      }),
      1,
      V1_AT,
    );
    const v2 = versionRecord(
      roomGraph({
        objects: [
          wallInput({ provenanceName: wallName, epistemicState: "CONFIRMED" }),
          wallInput({ objectClass: "CEILING", provenanceName: ceilingName, epistemicState: "CONFIRMED" }),
        ],
      }),
      2,
      V2_AT,
    );
    const report = compareModelVersions({ from: v1, to: v2 });
    expect(report.records).toHaveLength(2);
    // Canonical order: the smaller objectId first, regardless of class rank.
    const first = report.records[0]!;
    const second = report.records[1]!;
    expect(first.subject.kind === "object" && first.subject.objectId).toBe(wallId);
    expect(second.subject.kind === "object" && second.subject.objectId).toBe(ceilingId);
    // The validator enforces the same order.
    expect(() => validateHistoricalChangeReport(report)).not.toThrow();
  });

  it("the record cap fails closed (never truncated)", () => {
    // 2600 objects x (epistemic + name) changes = 5200 records > the 5000 cap.
    const count = 2600;
    const objectsV1 = Array.from({ length: count }, (_, index) =>
      wallInput({ provenanceName: `cap-${index}` }),
    );
    const objectsV2 = objectsV1.map((input, index) => ({
      ...input,
      epistemicState: "CONFIRMED" as const,
      name: `renamed-${index}`,
    }));
    const from = versionRecord(roomGraph({ objects: objectsV1 }), 1, V1_AT);
    const to = versionRecord(roomGraph({ objects: objectsV2 }), 2, V2_AT);
    try {
      compareModelVersions({ from, to });
      expect.unreachable();
    } catch (error) {
      expect(isHistoryError(error)).toBe(true);
      expect((error as { code: string }).code).toBe("LIMIT_EXCEEDED");
    }
  });
});
