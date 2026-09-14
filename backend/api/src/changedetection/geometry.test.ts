/**
 * AISE-033 geometry tests — plane-move measurement against the named
 * tolerances, GEOMETRY_UNRESOLVED honesty (never an implicit "unchanged"),
 * the tolerance-boundary mutation, and the documented edge cases.
 */

import { describe, expect, test } from "bun:test";
import { compareVersions } from "./index";
import type { Plane } from "../geometry";
import { geoTable, sslice, snode } from "./testkit";

const HORIZONTAL: Plane = { normal: [0, 1, 0], d: 0 };

function planePairReport(fromPlane: Plane, toPlane: Plane) {
  return compareVersions(
    sslice("v001", [snode("node-w", "element", [], { kind: "plane", ref: "g1" })]),
    sslice("v002", [snode("node-w", "element", [], { kind: "plane", ref: "g2" })]),
    geoTable([["g1", fromPlane]]),
    geoTable([["g2", toPlane]]),
  );
}

function movedFinding(fromPlane: Plane, toPlane: Plane) {
  return planePairReport(fromPlane, toPlane).matches[0]?.changes[0];
}

describe("plane movement detection", () => {
  test("offset shift beyond tolerance ⇒ GEOMETRY_MOVED with measured Δd, angle and both planes verbatim", () => {
    const finding = movedFinding(HORIZONTAL, { normal: [0, 1, 0], d: 0.05 });
    expect(finding).toEqual({
      code: "GEOMETRY_MOVED",
      deltaD: 0.05,
      angleRad: 0,
      fromRef: { kind: "plane", ref: "g1" },
      toRef: { kind: "plane", ref: "g2" },
      fromPlane: { normal: [0, 1, 0], d: 0 },
      toPlane: { normal: [0, 1, 0], d: 0.05 },
    });
  });

  test("normal deviation beyond tolerance ⇒ GEOMETRY_MOVED with the measured angle", () => {
    const tilt = 0.1;
    const finding = movedFinding(
      { normal: [0, 0, 1], d: 0 },
      { normal: [Math.sin(tilt), 0, Math.cos(tilt)], d: 0 },
    );
    expect(finding?.code).toBe("GEOMETRY_MOVED");
    if (finding?.code === "GEOMETRY_MOVED") {
      expect(finding.angleRad).toBeCloseTo(tilt, 12);
      expect(finding.deltaD).toBe(0);
    }
  });

  test("both deviations within tolerance ⇒ no geometry finding", () => {
    const tilt = 0.001; // < PLANE_ANGLE_TOLERANCE_RAD
    const changes = planePairReport(
      { normal: [0, 0, 1], d: 0 },
      { normal: [Math.sin(tilt), 0, Math.cos(tilt)], d: 0.005 }, // < PLANE_OFFSET_TOLERANCE_M
    ).matches[0]?.changes;
    expect(changes).toEqual([]);
  });

  test("MUTATION: nudging Δd across the tolerance flips the finding", () => {
    expect(movedFinding(HORIZONTAL, { normal: [0, 1, 0], d: 0.009 })).toBeUndefined();
    expect(movedFinding(HORIZONTAL, { normal: [0, 1, 0], d: 0.01 })).toBeUndefined(); // equal ⇒ within
    const flipped = movedFinding(HORIZONTAL, { normal: [0, 1, 0], d: 0.011 });
    expect(flipped?.code).toBe("GEOMETRY_MOVED");
  });

  test("MUTATION: nudging the tilt across the angular tolerance flips the finding", () => {
    const small = movedFinding(
      { normal: [0, 0, 1], d: 0 },
      { normal: [Math.sin(0.009), 0, Math.cos(0.009)], d: 0 },
    );
    expect(small).toBeUndefined();
    const large = movedFinding(
      { normal: [0, 0, 1], d: 0 },
      { normal: [Math.sin(0.011), 0, Math.cos(0.011)], d: 0 },
    );
    expect(large?.code).toBe("GEOMETRY_MOVED");
  });

  test("unnormalized normals are normalized before Δd (d/|n|)", () => {
    const finding = movedFinding({ normal: [0, 2, 0], d: 0 }, { normal: [0, 1, 0], d: 0.05 });
    expect(finding?.code).toBe("GEOMETRY_MOVED");
    if (finding?.code === "GEOMETRY_MOVED") {
      expect(finding.deltaD).toBe(0.05);
      expect(finding.angleRad).toBe(0);
    }
  });

  test("the SAME ref id with different planes per table ⇒ moved (ref stability ≠ geometry stability)", () => {
    const report = compareVersions(
      sslice("v001", [snode("node-w", "element", [], { kind: "plane", ref: "g" })]),
      sslice("v002", [snode("node-w", "element", [], { kind: "plane", ref: "g" })]),
      geoTable([["g", { normal: [0, 1, 0], d: 0 }]]),
      geoTable([["g", { normal: [0, 1, 0], d: 0.05 }]]),
    );
    expect(report.matches[0]?.changes[0]?.code).toBe("GEOMETRY_MOVED");
  });

  test("DOCUMENTED EDGE: flipped normal (same physical plane) ⇒ angle 0, |Δd| = 2·|d|, planes carried verbatim", () => {
    const finding = movedFinding({ normal: [0, 1, 0], d: -2.5 }, { normal: [0, -1, 0], d: 2.5 });
    expect(finding?.code).toBe("GEOMETRY_MOVED");
    if (finding?.code === "GEOMETRY_MOVED") {
      expect(finding.angleRad).toBe(0);
      expect(finding.deltaD).toBe(5);
    }
  });
});

describe("geometry resolution honesty", () => {
  test("ref missing from the from-table ⇒ GEOMETRY_UNRESOLVED 'unresolved-from-ref'", () => {
    const report = compareVersions(
      sslice("v001", [snode("node-w", "element", [], { kind: "plane", ref: "g1" })]),
      sslice("v002", [snode("node-w", "element", [], { kind: "plane", ref: "g2" })]),
      geoTable([]), // from-table lacks g1
      geoTable([["g2", HORIZONTAL]]),
    );
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "GEOMETRY_UNRESOLVED",
        reason: "unresolved-from-ref",
        fromRef: { kind: "plane", ref: "g1" },
        toRef: { kind: "plane", ref: "g2" },
      },
    ]);
  });

  test("ref missing from the to-table ⇒ 'unresolved-to-ref'; both missing ⇒ from-side priority", () => {
    const nodes = [
      sslice("v001", [snode("node-w", "element", [], { kind: "plane", ref: "g1" })]),
      sslice("v002", [snode("node-w", "element", [], { kind: "plane", ref: "g2" })]),
    ];
    const missingTo = compareVersions(nodes[0]!, nodes[1]!, geoTable([["g1", HORIZONTAL]]), geoTable([]));
    expect(missingTo.matches[0]?.changes[0]).toEqual({
      code: "GEOMETRY_UNRESOLVED",
      reason: "unresolved-to-ref",
      fromRef: { kind: "plane", ref: "g1" },
      toRef: { kind: "plane", ref: "g2" },
    });
    const missingBoth = compareVersions(nodes[0]!, nodes[1]!, geoTable([]), geoTable([]));
    expect(missingBoth.matches[0]?.changes[0]?.code).toBe("GEOMETRY_UNRESOLVED");
    if (missingBoth.matches[0]?.changes[0]?.code === "GEOMETRY_UNRESOLVED") {
      expect(missingBoth.matches[0]?.changes[0]?.reason).toBe("unresolved-from-ref");
    }
  });

  test("geometry claim present on the from-side only ⇒ 'missing-geometry-on-to-version' (toRef absent)", () => {
    const report = compareVersions(
      sslice("v001", [snode("node-w", "element", [], { kind: "plane", ref: "g1" })]),
      sslice("v002", [snode("node-w", "element", [])]),
      geoTable([["g1", HORIZONTAL]]),
    );
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "GEOMETRY_UNRESOLVED",
        reason: "missing-geometry-on-to-version",
        fromRef: { kind: "plane", ref: "g1" },
      },
    ]);
  });

  test("geometry claim present on the to-side only ⇒ 'missing-geometry-on-from-version' (fromRef absent)", () => {
    const report = compareVersions(
      sslice("v001", [snode("node-w", "element", [])]),
      sslice("v002", [snode("node-w", "element", [], { kind: "plane", ref: "g2" })]),
      geoTable([]),
      geoTable([["g2", HORIZONTAL]]),
    );
    expect(report.matches[0]?.changes).toEqual([
      {
        code: "GEOMETRY_UNRESOLVED",
        reason: "missing-geometry-on-from-version",
        toRef: { kind: "plane", ref: "g2" },
      },
    ]);
  });

  test("HONESTY DISCRIMINATION: resolvable-and-unchanged is silent; unresolvable is NEVER 'unchanged'", () => {
    // Same fixture, both resolvable, identical planes ⇒ no finding.
    const resolvable = compareVersions(
      sslice("v001", [snode("node-w", "element", [], { kind: "plane", ref: "g" })]),
      sslice("v002", [snode("node-w", "element", [], { kind: "plane", ref: "g" })]),
      geoTable([["g", HORIZONTAL]]),
      geoTable([["g", HORIZONTAL]]),
    );
    expect(resolvable.matches[0]?.changes).toEqual([]);
    // Drop ONLY the to-table entry ⇒ the honest unknown appears.
    const unresolvable = compareVersions(
      sslice("v001", [snode("node-w", "element", [], { kind: "plane", ref: "g" })]),
      sslice("v002", [snode("node-w", "element", [], { kind: "plane", ref: "g" })]),
      geoTable([["g", HORIZONTAL]]),
      geoTable([]),
    );
    expect(unresolvable.matches[0]?.changes[0]?.code).toBe("GEOMETRY_UNRESOLVED");
  });

  test("default (absent) geometry tables ⇒ refs resolve to the honest unknown, never 'unchanged'", () => {
    const report = compareVersions(
      sslice("v001", [snode("node-w", "element", [], { kind: "plane", ref: "g" })]),
      sslice("v002", [snode("node-w", "element", [], { kind: "plane", ref: "g" })]),
    );
    expect(report.matches[0]?.changes[0]?.code).toBe("GEOMETRY_UNRESOLVED");
  });

  test("non-plane geometry kinds ⇒ 'non-plane-geometry-kind' (mesh-to-mesh and plane-to-mesh)", () => {
    const meshMesh = compareVersions(
      sslice("v001", [snode("node-w", "element", [], { kind: "mesh-ref", ref: "m1" })]),
      sslice("v002", [snode("node-w", "element", [], { kind: "mesh-ref", ref: "m1" })]),
    );
    expect(meshMesh.matches[0]?.changes[0]).toEqual({
      code: "GEOMETRY_UNRESOLVED",
      reason: "non-plane-geometry-kind",
      fromRef: { kind: "mesh-ref", ref: "m1" },
      toRef: { kind: "mesh-ref", ref: "m1" },
    });
    const planeMesh = compareVersions(
      sslice("v001", [snode("node-w", "element", [], { kind: "plane", ref: "g" })]),
      sslice("v002", [snode("node-w", "element", [], { kind: "mesh-ref", ref: "m" })]),
      geoTable([["g", HORIZONTAL]]),
      geoTable([["m", HORIZONTAL]]),
    );
    expect(planeMesh.matches[0]?.changes[0]?.code).toBe("GEOMETRY_UNRESOLVED");
    if (planeMesh.matches[0]?.changes[0]?.code === "GEOMETRY_UNRESOLVED") {
      expect(planeMesh.matches[0]?.changes[0]?.reason).toBe("non-plane-geometry-kind");
    }
  });

  test("degenerate zero-length normal ⇒ 'degenerate-plane-normal' (no throw)", () => {
    const finding = movedFinding({ normal: [0, 0, 0], d: 0 }, HORIZONTAL);
    expect(finding).toEqual({
      code: "GEOMETRY_UNRESOLVED",
      reason: "degenerate-plane-normal",
      fromRef: { kind: "plane", ref: "g1" },
      toRef: { kind: "plane", ref: "g2" },
    });
  });

  test("non-finite plane ⇒ 'non-finite-plane' (never a silent clean/NaN comparison)", () => {
    const nanD = movedFinding(HORIZONTAL, { normal: [0, 1, 0], d: Number.NaN });
    expect(nanD?.code).toBe("GEOMETRY_UNRESOLVED");
    if (nanD?.code === "GEOMETRY_UNRESOLVED") {
      expect(nanD.reason).toBe("non-finite-plane");
    }
    const nanNormal = movedFinding(HORIZONTAL, { normal: [Number.NaN, 0, 0], d: 0 });
    expect(nanNormal?.code).toBe("GEOMETRY_UNRESOLVED");
    if (nanNormal?.code === "GEOMETRY_UNRESOLVED") {
      expect(nanNormal.reason).toBe("non-finite-plane");
    }
  });

  test("NO geometry claim on either side ⇒ no geometry finding (absence is not an unresolved comparison)", () => {
    const report = compareVersions(
      sslice("v001", [snode("node-w", "element", [/* no geometry */])]),
      sslice("v002", [snode("node-w", "element", [])]),
      geoTable([["g", HORIZONTAL]]),
      geoTable([["g", HORIZONTAL]]),
    );
    expect(report.matches[0]?.changes).toEqual([]);
    expect(report.stats.geometryMoved).toBe(0);
  });
});
