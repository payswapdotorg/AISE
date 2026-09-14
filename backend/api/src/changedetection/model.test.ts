/**
 * AISE-033 model tests — the frozen registries, discipline constants and
 * the structural GraphVersion-compatibility contract.
 */

import { describe, expect, test } from "bun:test";
import type { GraphVersion } from "../reality/model";
import { compareVersions } from "./index";
import {
  CHANGE_DETECTION_ID,
  CHANGE_FINDING_CODES,
  CONDITION_PROPERTY_PREFIX,
  GEOMETRY_UNRESOLVED_REASONS,
  PLANE_ANGLE_TOLERANCE_RAD,
  PLANE_OFFSET_TOLERANCE_M,
  SEMANTIC_KIND_PROPERTY_KEY,
} from "./model";
import { geoTable, sslice } from "./testkit";

describe("frozen registries", () => {
  test("CHANGE_FINDING_CODES is frozen, unique and exactly the documented registry", () => {
    expect(Object.isFrozen(CHANGE_FINDING_CODES)).toBe(true);
    expect([...CHANGE_FINDING_CODES]).toEqual([
      "AMBIGUOUS_IDENTITY",
      "GEOMETRY_MOVED",
      "GEOMETRY_UNRESOLVED",
      "KIND_CHANGED",
      "PROPERTY_ADDED",
      "PROPERTY_REMOVED",
      "PROPERTY_CHANGED",
      "SEMANTIC_INCONSISTENCY",
      "CONDITION_CHANGED",
    ]);
    expect(new Set(CHANGE_FINDING_CODES).size).toBe(CHANGE_FINDING_CODES.length);
  });

  test("GEOMETRY_UNRESOLVED_REASONS is frozen, unique and closed", () => {
    expect(Object.isFrozen(GEOMETRY_UNRESOLVED_REASONS)).toBe(true);
    expect([...GEOMETRY_UNRESOLVED_REASONS]).toEqual([
      "missing-geometry-on-from-version",
      "missing-geometry-on-to-version",
      "non-plane-geometry-kind",
      "unresolved-from-ref",
      "unresolved-to-ref",
      "degenerate-plane-normal",
      "non-finite-plane",
    ]);
    expect(new Set(GEOMETRY_UNRESOLVED_REASONS).size).toBe(GEOMETRY_UNRESOLVED_REASONS.length);
  });

  test("discipline constants carry their documented literal values", () => {
    expect(CHANGE_DETECTION_ID).toBe("aise-changedetection/1.0");
    expect(PLANE_OFFSET_TOLERANCE_M).toBe(0.01);
    expect(PLANE_ANGLE_TOLERANCE_RAD).toBe(0.01);
    expect(SEMANTIC_KIND_PROPERTY_KEY).toBe("semantic.kind");
    expect(CONDITION_PROPERTY_PREFIX).toBe("condition.");
  });
});

describe("structural input compatibility", () => {
  // A FULL GraphVersion (the reality model's own interface, all fields) —
  // must be assignable to VersionSnapshotSlice at compile time and accepted
  // at runtime, per the "GraphVersion-compatible snapshots" input contract.
  const fullVersion: GraphVersion = {
    versionId: "v009",
    parentVersionId: "v008",
    createdAt: "2026-02-01T00:00:00Z",
    changeLog: [],
    nodes: [
      {
        nodeId: "node-wall",
        kind: "element",
        epistemicStatus: "OBSERVED",
        properties: [
          { key: "label", value: "Wall", epistemicStatus: "OBSERVED", provenance: [] },
        ],
        geometry: { kind: "plane", ref: "geo:wall:1" },
        provenance: [],
      },
    ],
    relationships: [],
    observations: [],
    tombstones: [],
  };

  test("a full GraphVersion is accepted structurally (same version ⇒ clean)", () => {
    const table = geoTable([["geo:wall:1", { normal: [0, 1, 0], d: 0 }]]);
    const report = compareVersions(fullVersion, fullVersion, table, table);
    expect(report.matches.map((match) => match.nodeId)).toEqual(["node-wall"]);
    expect(report.matches[0]?.changes).toEqual([]);
    expect(report.stats.matched).toBe(1);
    expect(report.generatedBy).toBe(CHANGE_DETECTION_ID);
  });

  test("a bare structural slice (no extra GraphVersion fields) works identically", () => {
    const slice = sslice("v001", [
      { nodeId: "n1", kind: "element", properties: [] },
    ]);
    const report = compareVersions(slice, slice);
    expect(report.stats).toEqual({
      matched: 1,
      ambiguous: 0,
      added: 0,
      removed: 0,
      geometryMoved: 0,
      conditionChanged: 0,
      propertyChanged: 0,
    });
  });
});
