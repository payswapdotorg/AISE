/**
 * AISE-034 topology tests — typed connectivity rules: the compatibility
 * matrix (class / direction / service / diameter / voltage), refusals that
 * name both endpoints, honest indeterminacy (UNKNOWN terminal states),
 * uncertainty-aware nominal-size comparison (hand-checkable arithmetic),
 * graph-integrity findings (dangling / self / double-connection), canonical
 * report ordering, components, stats, purity.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  defineCableTray,
  defineEquipment,
  defineMepConnection,
  defineMepSystem,
  definePipeSegment,
  DIAMETER_MATCH_TOLERANCE_MM,
  type MepConnection,
  type MepEndpointRef,
  type MepEquipmentTerminal,
  type MepPrimitive,
  type MepQuantity,
  type MepSegmentDraft,
  type MepSystem,
  validateTopology,
  type TopologyReport,
} from "./index";
import { deepFreeze, jsonEquals, knownSize, makeProvenance } from "./testkit";

/* ------------------------------------------------------------------ */
/* Test builders                                                        */
/* ------------------------------------------------------------------ */

function pipe(
  segmentId: string,
  options: {
    service?: MepSegmentDraft["service"];
    size?: MepQuantity;
    flow?: MepSegmentDraft["flow"];
    voltageClass?: MepSegmentDraft["voltageClass"];
    properties?: MepSegmentDraft["properties"];
  } = {},
): MepPrimitive {
  return definePipeSegment({
    primitiveId: segmentId,
    service: options.service ?? "domestic_cold_water",
    nominalSize: options.size ?? knownSize(25),
    flow: options.flow ?? "a_to_b",
    epistemicStatus: "INFERRED",
    provenance: [makeProvenance()],
    geometry: { link: "referenced", realityNodeId: `rn-${segmentId}` },
    ...(options.voltageClass === undefined ? {} : { voltageClass: options.voltageClass }),
    ...(options.properties === undefined ? {} : { properties: options.properties }),
  });
}

function tray(
  segmentId: string,
  options: { voltageClass?: MepSegmentDraft["voltageClass"]; size?: MepQuantity } = {},
): MepPrimitive {
  return defineCableTray({
    primitiveId: segmentId,
    service: "power",
    nominalSize: options.size ?? knownSize(300),
    flow: "a_to_b",
    ...(options.voltageClass === undefined ? {} : { voltageClass: options.voltageClass }),
    epistemicStatus: "INFERRED",
    provenance: [makeProvenance()],
    geometry: { link: "referenced", realityNodeId: `rn-${segmentId}` },
  });
}

function equipment(
  primitiveId: string,
  terminals: readonly MepEquipmentTerminal[],
): MepPrimitive {
  return defineEquipment({
    primitiveId,
    equipmentKind: "valve",
    terminals,
    epistemicStatus: "INFERRED",
    provenance: [makeProvenance()],
    geometry: { link: "referenced", realityNodeId: `rn-${primitiveId}` },
  });
}

function conn(connectionId: string, from: MepEndpointRef, to: MepEndpointRef): MepConnection {
  return defineMepConnection({
    connectionId,
    from,
    to,
    epistemicStatus: "INFERRED",
    provenance: [makeProvenance()],
  });
}

function system(
  primitives: readonly MepPrimitive[],
  connections: readonly MepConnection[],
  systemId = "sys",
): MepSystem {
  return defineMepSystem({ systemId, primitives, connections });
}

function validate(primitives: readonly MepPrimitive[], connections: readonly MepConnection[]): TopologyReport {
  return validateTopology(system(primitives, connections));
}

function findingSummary(report: TopologyReport): { connectionId: string; code: string }[] {
  return [
    ...report.violations.map((v) => ({ connectionId: v.connectionId, code: v.code })),
    ...report.indeterminates.map((v) => ({ connectionId: v.connectionId, code: v.code })),
  ];
}

const terminal = (
  terminalId: string,
  overrides: Partial<MepEquipmentTerminal> = {},
): MepEquipmentTerminal => ({
  terminalId,
  direction: "inlet",
  portClass: "water",
  service: "domestic_cold_water",
  nominalSize: knownSize(25),
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* Clean connectivity                                                   */
/* ------------------------------------------------------------------ */

describe("clean connectivity", () => {
  test("two compatible connected pipes produce no findings and one component", () => {
    const report = validate(
      [pipe("p1"), pipe("p2")],
      [conn("c1", { segmentId: "p1", port: "b" }, { segmentId: "p2", port: "a" })],
    );
    expect(report.violations).toHaveLength(0);
    expect(report.indeterminates).toHaveLength(0);
    expect(report.components).toEqual([
      { primitiveIds: ["p1", "p2"], connectionIds: ["c1"] },
    ]);
    expect(report.stats).toEqual({
      primitiveCount: 2,
      connectionCount: 1,
      violationCount: 0,
      indeterminateCount: 0,
      componentCount: 1,
    });
  });

  test("direction complementarity matrix: out→in, in→out, bidi↔bidi are clean", () => {
    const outIn = validate(
      [pipe("p1"), pipe("p2")],
      [conn("c1", { segmentId: "p1", port: "b" }, { segmentId: "p2", port: "a" })],
    );
    expect(outIn.violations).toHaveLength(0);
    const inOut = validate(
      [pipe("p1"), pipe("p2")],
      [conn("c1", { segmentId: "p1", port: "a" }, { segmentId: "p2", port: "b" })],
    );
    expect(inOut.violations).toHaveLength(0);
    const bidi = validate(
      [pipe("p1", { flow: "bidirectional" }), pipe("p2", { flow: "bidirectional" })],
      [conn("c1", { segmentId: "p1", port: "a" }, { segmentId: "p2", port: "b" })],
    );
    expect(bidi.violations).toHaveLength(0);
  });

  test("direction mismatches: out→out, in→in and bidi→directional all refuse", () => {
    for (const [fromPort, toPort] of [
      ["b", "b"],
      ["a", "a"],
    ] as const) {
      const report = validate(
        [pipe("p1"), pipe("p2")],
        [conn("c1", { segmentId: "p1", port: fromPort }, { segmentId: "p2", port: toPort })],
      );
      expect(report.violations.map((v) => v.code)).toEqual(["port_direction_mismatch"]);
    }
    const bidiCase = validate(
      [pipe("p1", { flow: "bidirectional" }), pipe("p2")],
      [conn("c1", { segmentId: "p1", port: "a" }, { segmentId: "p2", port: "a" })],
    );
    expect(bidiCase.violations.map((v) => v.code)).toEqual(["port_direction_mismatch"]);
  });
});

/* ------------------------------------------------------------------ */
/* Compatibility refusals name both endpoints                           */
/* ------------------------------------------------------------------ */

describe("compatibility refusals name both endpoints", () => {
  test("port_class_mismatch names both endpoint labels and both classes", () => {
    const report = validate(
      [pipe("water-pipe"), pipe("gas-pipe", { service: "gas", flow: "b_to_a" })],
      [conn("c1", { segmentId: "water-pipe", port: "b" }, { segmentId: "gas-pipe", port: "b" })],
    );
    const violation = report.violations.find((v) => v.code === "port_class_mismatch");
    expect(violation).toBeDefined();
    expect(violation?.detail.includes("water-pipe")).toBe(true);
    expect(violation?.detail.includes("gas-pipe")).toBe(true);
    expect(violation?.detail.includes("water")).toBe(true);
    expect(violation?.detail.includes("gas")).toBe(true);
  });

  test("service_mismatch names both services and both endpoints (same class)", () => {
    const report = validate(
      [pipe("hot-pipe", { service: "heating_supply" }), pipe("cold-pipe")],
      [conn("c1", { segmentId: "hot-pipe", port: "b" }, { segmentId: "cold-pipe", port: "a" })],
    );
    expect(report.violations.map((v) => v.code)).toEqual(["service_mismatch"]);
    const violation = report.violations[0];
    expect(violation?.detail.includes("heating_supply")).toBe(true);
    expect(violation?.detail.includes("domestic_cold_water")).toBe(true);
    expect(violation?.detail.includes("hot-pipe")).toBe(true);
    expect(violation?.detail.includes("cold-pipe")).toBe(true);
  });

  test("diameter_mismatch names both values and the tolerance", () => {
    const report = validate(
      [pipe("small", { size: knownSize(25) }), pipe("large", { size: knownSize(32) })],
      [conn("c1", { segmentId: "small", port: "b" }, { segmentId: "large", port: "a" })],
    );
    expect(report.violations.map((v) => v.code)).toEqual(["diameter_mismatch"]);
    const violation = report.violations[0];
    expect(violation?.detail.includes("25")).toBe(true);
    expect(violation?.detail.includes("32")).toBe(true);
    expect(violation?.detail.includes(`${DIAMETER_MATCH_TOLERANCE_MM}`)).toBe(true);
  });

  test("voltage_class_mismatch names both classes on a power connection", () => {
    const report = validate(
      [tray("lv-tray", { voltageClass: "LV" }), tray("mv-tray", { voltageClass: "MV" })],
      [conn("c1", { segmentId: "lv-tray", port: "b" }, { segmentId: "mv-tray", port: "a" })],
    );
    expect(report.violations.map((v) => v.code)).toEqual(["voltage_class_mismatch"]);
    const violation = report.violations[0];
    expect(violation?.detail.includes("LV")).toBe(true);
    expect(violation?.detail.includes("MV")).toBe(true);
  });

  test("a medium mismatch reports EVERY violation (class and service), not first-only", () => {
    const sameMedium = validate(
      [pipe("gas-pipe", { service: "gas", flow: "b_to_a" })],
      [conn("c1", { segmentId: "gas-pipe", port: "b" }, { segmentId: "gas-pipe", port: "a" })],
    );
    // gas↔gas on the same run: class and service match, and the looped
    // run b_to_a has b (in) → a (out): complementary.
    expect(sameMedium.violations).toHaveLength(0);
    const mixed = validate(
      [
        pipe("gas-pipe", { service: "gas", flow: "b_to_a" }),
        equipment("eq", [terminal("in")]),
      ],
      [conn("c1", { segmentId: "gas-pipe", port: "a" }, { equipmentId: "eq", terminalId: "in" })],
    );
    expect(mixed.violations.map((v) => v.code)).toEqual([
      "port_class_mismatch",
      "service_mismatch",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Diameter semantics (hand-checkable arithmetic)                       */
/* ------------------------------------------------------------------ */

describe("nominal-size semantics with measurement uncertainty", () => {
  test("sizes within the tolerance are compatible (25 vs 25.5, tolerance 1)", () => {
    const report = validate(
      [pipe("a", { size: knownSize(25) }), pipe("b", { size: knownSize(25.5) })],
      [conn("c1", { segmentId: "a", port: "b" }, { segmentId: "b", port: "a" })],
    );
    expect(report.violations).toHaveLength(0);
    expect(report.indeterminates).toHaveLength(0);
  });

  test("a nominal mismatch inside the stated uncertainties is indeterminate, not a violation", () => {
    // HAND: |108−110| = 2 > 1; bounds [106,110] and [109,111] overlap
    // (distance 0 ≤ 1) → cannot honestly assert the mismatch.
    const report = validate(
      [
        pipe("a", { size: { presence: "PRESENT", value: 108, unit: "mm", uncertainty: { kind: "DIMENSIONAL", plusMinus: 2 } } }),
        pipe("b", { size: { presence: "PRESENT", value: 110, unit: "mm", uncertainty: { kind: "DIMENSIONAL", plusMinus: 1 } } }),
      ],
      [conn("c1", { segmentId: "a", port: "b" }, { segmentId: "b", port: "a" })],
    );
    expect(report.indeterminates.map((v) => v.code)).toEqual(["diameter_within_uncertainty"]);
    expect(report.violations).toHaveLength(0);
    expect(report.indeterminates[0]?.detail.includes("[106, 110]")).toBe(true);
    expect(report.indeterminates[0]?.detail.includes("[109, 111]")).toBe(true);
  });

  test("the same nominal mismatch WITHOUT uncertainties is a violation (bounds are points)", () => {
    const report = validate(
      [pipe("a", { size: knownSize(108) }), pipe("b", { size: knownSize(110) })],
      [conn("c1", { segmentId: "a", port: "b" }, { segmentId: "b", port: "a" })],
    );
    expect(report.violations.map((v) => v.code)).toEqual(["diameter_mismatch"]);
  });

  test("a mismatch beyond the stated bounds is a violation despite uncertainties", () => {
    // HAND: bounds [114.5,115.5] and [106,110] are 4.5 mm apart > 1.
    const report = validate(
      [
        pipe("a", { size: { presence: "PRESENT", value: 108, unit: "mm", uncertainty: { kind: "DIMENSIONAL", plusMinus: 2 } } }),
        pipe("c", { size: { presence: "PRESENT", value: 115, unit: "mm", uncertainty: { kind: "DIMENSIONAL", plusMinus: 0.5 } } }),
      ],
      [conn("c1", { segmentId: "c", port: "b" }, { segmentId: "a", port: "a" })],
    );
    expect(report.violations.map((v) => v.code)).toEqual(["diameter_mismatch"]);
    expect(report.violations[0]?.detail.includes("4.5")).toBe(true);
  });

  test("an absent nominal size is indeterminate and the absence kind is named", () => {
    for (const kind of ["UNKNOWN", "NOT_OBSERVED", "OCCLUDED"] as const) {
      const report = validate(
        [pipe("a", { size: { presence: kind, detail: "why" } }), pipe("b")],
        [conn("c1", { segmentId: "a", port: "b" }, { segmentId: "b", port: "a" })],
      );
      expect(report.indeterminates.map((v) => v.code)).toEqual(["diameter_indeterminate"]);
      expect(report.indeterminates[0]?.detail.includes(kind)).toBe(true);
      expect(report.violations).toHaveLength(0);
    }
  });

  test("INTERVAL uncertainties act as hard bounds in the comparison", () => {
    // HAND: [107.9, 108.1] vs [109.9, 110.1]: gap = 109.9 − 108.1 = 1.8 > 1
    // → violation; values are 108 vs 110 (nominal |Δ| = 2 > 1).
    const report = validate(
      [
        pipe("a", { size: { presence: "PRESENT", value: 108, unit: "mm", uncertainty: { kind: "INTERVAL", lower: 107.9, upper: 108.1 } } }),
        pipe("b", { size: { presence: "PRESENT", value: 110, unit: "mm", uncertainty: { kind: "INTERVAL", lower: 109.9, upper: 110.1 } } }),
      ],
      [conn("c1", { segmentId: "a", port: "b" }, { segmentId: "b", port: "a" })],
    );
    expect(report.violations.map((v) => v.code)).toEqual(["diameter_mismatch"]);
  });

  test("confidence values never affect topology validation (uncertainty does)", () => {
    const highConfidenceProperty = {
      key: "survey_note",
      value: "high confidence survey",
      epistemicStatus: "OBSERVED" as const,
      confidence: { kind: "PROBABILISTIC" as const, value: 0.99 },
      method: "surveyor statement",
      provenance: [makeProvenance()],
    };
    const lowConfidenceProperty = {
      ...highConfidenceProperty,
      confidence: { kind: "PROBABILISTIC" as const, value: 0.1 },
    };
    const withHigh = validate(
      [pipe("a", { properties: [highConfidenceProperty] }), pipe("b")],
      [conn("c1", { segmentId: "a", port: "b" }, { segmentId: "b", port: "a" })],
    );
    const withLow = validate(
      [pipe("a", { properties: [lowConfidenceProperty] }), pipe("b")],
      [conn("c1", { segmentId: "a", port: "b" }, { segmentId: "b", port: "a" })],
    );
    // Confidence is belief support — identical topology outcome.
    expect(jsonEquals(withHigh, withLow)).toBe(true);
    // Whereas measurement uncertainty genuinely changes the verdict.
    const withUncertainty = validate(
      [
        pipe("a", { size: { presence: "PRESENT", value: 25, unit: "mm", uncertainty: { kind: "DIMENSIONAL", plusMinus: 5 } } }),
        pipe("b", { size: knownSize(29) }),
      ],
      [conn("c1", { segmentId: "a", port: "b" }, { segmentId: "b", port: "a" })],
    );
    expect(withUncertainty.indeterminates.map((v) => v.code)).toEqual([
      "diameter_within_uncertainty",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Voltage semantics                                                    */
/* ------------------------------------------------------------------ */

describe("voltage-class semantics", () => {
  test("equal voltage classes are clean; unequal classes refuse", () => {
    const clean = validate(
      [tray("t1", { voltageClass: "LV" }), tray("t2", { voltageClass: "LV" })],
      [conn("c1", { segmentId: "t1", port: "b" }, { segmentId: "t2", port: "a" })],
    );
    expect(clean.violations).toHaveLength(0);
    const mismatched = validate(
      [tray("t1", { voltageClass: "ELV" }), tray("t2", { voltageClass: "LV" })],
      [conn("c1", { segmentId: "t1", port: "b" }, { segmentId: "t2", port: "a" })],
    );
    expect(mismatched.violations.map((v) => v.code)).toEqual(["voltage_class_mismatch"]);
  });

  test("UNKNOWN and unasserted voltage classes are indeterminate (distinctly reported)", () => {
    const unknownCase = validate(
      [tray("t1", { voltageClass: "UNKNOWN" }), tray("t2", { voltageClass: "LV" })],
      [conn("c1", { segmentId: "t1", port: "b" }, { segmentId: "t2", port: "a" })],
    );
    expect(unknownCase.indeterminates.map((v) => v.code)).toEqual(["voltage_class_indeterminate"]);
    expect(unknownCase.indeterminates[0]?.detail.includes("UNKNOWN")).toBe(true);
    const unassertedCase = validate(
      [tray("t1"), tray("t2", { voltageClass: "LV" })],
      [conn("c1", { segmentId: "t1", port: "b" }, { segmentId: "t2", port: "a" })],
    );
    expect(unassertedCase.indeterminates.map((v) => v.code)).toEqual([
      "voltage_class_indeterminate",
    ]);
    expect(unassertedCase.indeterminates[0]?.detail.includes("unasserted")).toBe(true);
  });

  test("voltage check applies only to power-class connections", () => {
    // Water pipes carrying (odd but legal) voltage-class assertions: the
    // voltage rule does not apply to non-power classes.
    const report = validate(
      [pipe("p1", { voltageClass: "LV" }), pipe("p2", { voltageClass: "MV" })],
      [conn("c1", { segmentId: "p1", port: "b" }, { segmentId: "p2", port: "a" })],
    );
    expect(report.violations).toHaveLength(0);
    expect(report.indeterminates).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Graph integrity findings                                             */
/* ------------------------------------------------------------------ */

describe("graph integrity findings", () => {
  test("dangling endpoint names the missing reference and the reason", () => {
    const report = validate(
      [pipe("p1")],
      [conn("c1", { segmentId: "p1", port: "b" }, { segmentId: "ghost", port: "a" })],
    );
    expect(report.violations.map((v) => v.code)).toEqual(["dangling_endpoint"]);
    expect(report.violations[0]?.detail.includes("ghost")).toBe(true);
    expect(report.components).toEqual([{ primitiveIds: ["p1"], connectionIds: [] }]);
  });

  test("a segment reference to an equipment id is dangling (typed reason)", () => {
    const report = validate(
      [pipe("p1"), equipment("eq", [terminal("in")])],
      [conn("c1", { segmentId: "p1", port: "b" }, { segmentId: "eq", port: "a" })],
    );
    expect(report.violations.map((v) => v.code)).toEqual(["dangling_endpoint"]);
    expect(report.violations[0]?.detail.includes("equipment, not a segment")).toBe(true);
  });

  test("a missing equipment terminal is dangling", () => {
    const report = validate(
      [pipe("p1"), equipment("eq", [terminal("in")])],
      [conn("c1", { segmentId: "p1", port: "b" }, { equipmentId: "eq", terminalId: "out" })],
    );
    expect(report.violations.map((v) => v.code)).toEqual(["dangling_endpoint"]);
    expect(report.violations[0]?.detail.includes('"out"')).toBe(true);
  });

  test("self connection refuses with self_connection and no follow-on findings", () => {
    const report = validate(
      [pipe("p1")],
      [conn("c1", { segmentId: "p1", port: "a" }, { segmentId: "p1", port: "a" })],
    );
    expect(report.violations.map((v) => v.code)).toEqual(["self_connection"]);
    expect(report.indeterminates).toHaveLength(0);
  });

  test("double-connected endpoint refuses naming both connection ids", () => {
    const report = validate(
      [pipe("p1"), pipe("p2"), equipment("eq", [terminal("in")])],
      [
        conn("c-first", { segmentId: "p1", port: "b" }, { equipmentId: "eq", terminalId: "in" }),
        conn("c-second", { segmentId: "p2", port: "b" }, { equipmentId: "eq", terminalId: "in" }),
      ],
    );
    expect(report.violations.map((v) => v.code)).toEqual(["endpoint_double_connected"]);
    const violation = report.violations[0];
    expect(violation?.connectionId).toBe("c-second");
    expect(violation?.detail.includes("c-first")).toBe(true);
    expect(violation?.detail.includes("c-second")).toBe(true);
  });

  test("equipment typed in/out terminals participate in direction checks", () => {
    const equipmentWithOutlet = equipment("eq", [
      terminal("in", { direction: "inlet" }),
      terminal("out", { direction: "outlet" }),
    ]);
    const clean = validate(
      [pipe("p1"), equipmentWithOutlet],
      [conn("c1", { equipmentId: "eq", terminalId: "out" }, { segmentId: "p1", port: "a" })],
    );
    expect(clean.violations).toHaveLength(0);
    const mismatched = validate(
      [pipe("p1"), equipmentWithOutlet],
      [conn("c1", { equipmentId: "eq", terminalId: "out" }, { segmentId: "p1", port: "b" })],
    );
    expect(mismatched.violations.map((v) => v.code)).toEqual(["port_direction_mismatch"]);
  });

  test("terminal portClass/service absences are reported per unvalidatable check", () => {
    const occludedEquipment = equipment("eq", [
      terminal("t", {
        direction: "bidirectional",
        portClass: "OCCLUDED",
        service: "NOT_OBSERVED",
        nominalSize: { presence: "UNKNOWN" },
      }),
    ]);
    const report = validate(
      [occludedEquipment, pipe("p1", { flow: "bidirectional" })],
      [conn("c1", { equipmentId: "eq", terminalId: "t" }, { segmentId: "p1", port: "a" })],
    );
    expect(report.violations).toHaveLength(0);
    expect(report.indeterminates.map((v) => v.code)).toEqual([
      "port_class_indeterminate",
      "service_indeterminate",
      "diameter_indeterminate",
    ]);
    expect(report.indeterminates[0]?.detail.includes("OCCLUDED")).toBe(true);
    expect(report.indeterminates[1]?.detail.includes("NOT_OBSERVED")).toBe(true);
    expect(report.indeterminates[2]?.detail.includes("UNKNOWN")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Determinism, ordering, purity                                        */
/* ------------------------------------------------------------------ */

describe("determinism, canonical ordering and purity", () => {
  test("report ordering is canonical: connection id order decides regardless of listing", () => {
    const p1 = pipe("p1");
    const p2 = pipe("p2");
    const p3 = pipe("p3");
    const p4 = pipe("p4");
    const early = conn("z-conn", { segmentId: "p1", port: "b" }, { segmentId: "p2", port: "a" });
    const late = conn("a-conn", { segmentId: "p3", port: "a" }, { segmentId: "p4", port: "a" });
    // z-conn: b (out) → a (in) is CLEAN; a-conn: a (in) → a (in) mismatches.
    const report = validate([p1, p2, p3, p4], [early, late]);
    expect(report.violations.map((v) => v.connectionId)).toEqual(["a-conn"]);
    // Hand-built (non-parsed) system listing connections in UNSORTED order
    // (z-conn before a-conn): the walk still reports in canonical id order.
    const unsortedSystem: MepSystem = {
      systemId: "manual",
      primitives: [p2, p1, p4, p3],
      connections: [early, late],
    };
    const unsortedReport = validateTopology(unsortedSystem);
    expect(jsonEquals(unsortedReport, report)).toBe(true);
  });

  test("findings on one connection keep the fixed check sequence (class before service)", () => {
    const report = validate(
      [
        pipe("gas", { service: "gas", flow: "b_to_a" }),
        equipment("eq", [terminal("in")]),
      ],
      [conn("c1", { segmentId: "gas", port: "a" }, { equipmentId: "eq", terminalId: "in" })],
    );
    expect(report.violations.map((v) => v.code)).toEqual([
      "port_class_mismatch",
      "service_mismatch",
    ]);
  });

  test("validation is pure: a deep-frozen input system is byte-identical afterwards", () => {
    const frozenSystem = deepFreeze(
      system(
        [pipe("p1"), pipe("p2", { size: knownSize(32) })],
        [conn("c1", { segmentId: "p1", port: "b" }, { segmentId: "p2", port: "a" })],
      ),
    );
    const before = canonicalJsonStringify(frozenSystem);
    const report = validateTopology(frozenSystem);
    expect(canonicalJsonStringify(frozenSystem)).toBe(before);
    expect(report.violations.map((v) => v.code)).toEqual(["diameter_mismatch"]);
    // The report itself is deeply frozen.
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.violations)).toBe(true);
    expect(Object.isFrozen(report.components)).toBe(true);
  });

  test("components: isolated primitives are singletons; members and connections sorted", () => {
    const report = validate(
      [pipe("iso-1"), pipe("b-pair"), pipe("a-pair"), pipe("iso-2")],
      [conn("c-pair", { segmentId: "b-pair", port: "b" }, { segmentId: "a-pair", port: "a" })],
    );
    expect(report.components).toEqual([
      { primitiveIds: ["a-pair", "b-pair"], connectionIds: ["c-pair"] },
      { primitiveIds: ["iso-1"], connectionIds: [] },
      { primitiveIds: ["iso-2"], connectionIds: [] },
    ]);
    expect(report.stats).toEqual({
      primitiveCount: 4,
      connectionCount: 1,
      violationCount: 0,
      indeterminateCount: 0,
      componentCount: 3,
    });
  });

  test("repeated validation of the same system is byte-identical", () => {
    const target = system(
      [pipe("p1"), pipe("p2", { size: knownSize(40) }), tray("t1", { voltageClass: "LV" })],
      [
        conn("c1", { segmentId: "p1", port: "b" }, { segmentId: "p2", port: "a" }),
        conn("c2", { segmentId: "t1", port: "a" }, { segmentId: "t1", port: "a" }),
      ],
    );
    const first = validateTopology(target);
    const second = validateTopology(target);
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
    expect(findingSummary(first)).toEqual([
      { connectionId: "c1", code: "diameter_mismatch" },
      { connectionId: "c2", code: "self_connection" },
    ]);
  });
});
