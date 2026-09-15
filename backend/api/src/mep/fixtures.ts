/**
 * AISE-034 — controlled MEP verification fixtures (deterministic).
 *
 * Worked examples a reviewer can verify BY HAND: every fixture is a small
 * building-services network (one per family plus a deliberately corrupted
 * mixed network) whose expected validation report is spelled out below in
 * comments AND exported as data (`expected`), so the test suite asserts
 * against hand-computed results, not against the implementation's own
 * output.
 *
 * DETERMINISM: fixed seed strings for evidence content ids (sha-256), one
 * fixed provenance timestamp, no clock, no randomness, no I/O. Every
 * fixture function returns freshly constructed, deep-frozen records — two
 * calls produce byte-identical canonical JSON.
 *
 * These fixtures are PRODUCTION module data (like the benchmark fixtures):
 * the verification suite of later Work Items can reuse them. They are not
 * test-only testkit helpers.
 */

import type { ProvenanceRole } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type { ProvenanceRecord } from "../reality/model";
import {
  defineCableTray,
  defineDuctSegment,
  defineEquipment,
  defineMepConnection,
  defineMepSystem,
  definePipeSegment,
  type AbsenceKind,
  type MepConnection,
  type MepGeometryLink,
  type MepPropertyAssertion,
  type MepQuantity,
  type MepSystem,
} from "./model";
import type { TopologyStats } from "./topology";

/* ------------------------------------------------------------------ */
/* Fixture support (internal, deterministic)                            */
/* ------------------------------------------------------------------ */

/** Single fixed provenance timestamp for every fixture record. */
const FIXTURE_RECORDED_AT = "2026-01-20T08:00:00.000Z";

/** Deterministic valid evidence content id (64 lowercase hex) from a seed. */
function fixtureEvidenceId(seed: string): string {
  return sha256Hex(`aise-mep-fixture:${seed}`);
}

/** A valid provenance record for fixture data. */
function prov(seed: string, role: ProvenanceRole = "SUPPORTS"): ProvenanceRecord {
  return { role, evidenceId: fixtureEvidenceId(seed), recordedAt: FIXTURE_RECORDED_AT };
}

/** An id-only geometry reference into the Reality Graph. */
function geometryReferenced(realityNodeId: string): MepGeometryLink {
  return { link: "referenced", realityNodeId, sourceArtifactId: `artifact-${realityNodeId}` };
}

/** An honest typed geometry omission. */
function geometryOmitted(omission: AbsenceKind, detail: string): MepGeometryLink {
  return { link: "omitted", omission, detail };
}

/** A known nominal size in mm (no uncertainty). */
function dn(value: number): MepQuantity {
  return { presence: "PRESENT", value, unit: "mm" };
}

/** A known nominal size in mm with a DIMENSIONAL tolerance (± mm). */
function dnTolerance(value: number, plusMinus: number): MepQuantity {
  return {
    presence: "PRESENT",
    value,
    unit: "mm",
    uncertainty: { kind: "DIMENSIONAL", plusMinus },
  };
}

/** A nominal size that is honestly absent (typed absence + detail). */
function absentSize(presence: AbsenceKind, detail: string): MepQuantity {
  return { presence, detail };
}

/** A minimal valid typed property assertion. */
function property(
  key: string,
  value: string | number | boolean,
  method: string,
  seed: string,
  extra: Partial<Pick<MepPropertyAssertion, "unit" | "confidence" | "uncertainty" | "epistemicStatus">> = {},
): MepPropertyAssertion {
  return {
    key,
    value,
    ...(typeof value === "number" ? { unit: extra.unit ?? "m" } : {}),
    epistemicStatus: extra.epistemicStatus ?? "INFERRED",
    ...(extra.confidence === undefined ? {} : { confidence: extra.confidence }),
    ...(extra.uncertainty === undefined ? {} : { uncertainty: extra.uncertainty }),
    method,
    provenance: [prov(seed)],
  };
}

/* ------------------------------------------------------------------ */
/* Expected-report shapes (hand-computed summaries)                     */
/* ------------------------------------------------------------------ */

/** One expected finding: which connection, which code (canonical order). */
export interface FixtureFinding {
  readonly connectionId: string;
  readonly code: string;
}

/** One expected component: sorted members + sorted connection ids. */
export interface FixtureComponent {
  readonly members: readonly string[];
  readonly connections: readonly string[];
}

/** The hand-computed expectation for a fixture's validation report. */
export interface FixtureExpected {
  readonly violations: readonly FixtureFinding[];
  readonly indeterminates: readonly FixtureFinding[];
  readonly components: readonly FixtureComponent[];
  readonly stats: TopologyStats;
}

/** A controlled fixture: the system plus its hand-computed expectation. */
export interface MepFixture {
  readonly system: MepSystem;
  readonly expected: FixtureExpected;
}

function connection(
  connectionId: string,
  from: MepConnection["from"],
  to: MepConnection["to"],
  seed: string,
  epistemicStatus: MepConnection["epistemicStatus"] = "INFERRED",
): MepConnection {
  return defineMepConnection({
    connectionId,
    from,
    to,
    epistemicStatus,
    provenance: [prov(seed)],
  });
}

/* ------------------------------------------------------------------ */
/* Fixture 1 — clean domestic-water pipe network                       */
/* ------------------------------------------------------------------ */

/**
 * HAND COMPUTATION (worked example):
 *
 *   eq-pump-1.out ──c1──> pipe-1.a   pipe-1.b ──c2──> eq-valve-1.in
 *   eq-valve-1.out ──c3──> pipe-2.a  pipe-2.b ──c4──> eq-cap-1.in
 *
 * Every connection: class water=water, direction out→in (a_to_b segments:
 * a=in, b=out; pump/valve outlets are "out", their inlets "in"), service
 * domestic_cold_water on both sides, diameter 25 mm = 25 mm (|Δ|=0 ≤ 1).
 * Not a power connection anywhere → no voltage check.
 * → 0 violations, 0 indeterminates, 1 component of 5 primitives, stats
 *   {5 primitives, 4 connections, 0, 0, 1}.
 */
export function cleanPipeNetwork(): MepFixture {
  const system = defineMepSystem({
    systemId: "fixture-pipe-clean",
    primitives: [
      defineEquipment({
        primitiveId: "eq-pump-1",
        equipmentKind: "pump",
        terminals: [
          {
            terminalId: "in",
            direction: "inlet",
            portClass: "water",
            service: "domestic_cold_water",
            nominalSize: dn(25),
          },
          {
            terminalId: "out",
            direction: "outlet",
            portClass: "water",
            service: "domestic_cold_water",
            nominalSize: dn(25),
          },
        ],
        epistemicStatus: "INFERRED",
        provenance: [prov("pump-1")],
        geometry: geometryReferenced("rn-eq-pump-1"),
      }),
      definePipeSegment({
        primitiveId: "pipe-1",
        service: "domestic_cold_water",
        nominalSize: dn(25),
        flow: "a_to_b",
        epistemicStatus: "OBSERVED",
        provenance: [prov("pipe-1")],
        geometry: geometryReferenced("rn-pipe-1"),
        properties: [
          property("measured_length", 3.42, "laser distance meter, two-point measurement", "pipe-1-length", {
            epistemicStatus: "OBSERVED",
            confidence: { kind: "PROBABILISTIC", value: 0.9 },
            uncertainty: { kind: "DIMENSIONAL", plusMinus: 0.05 },
          }),
        ],
      }),
      defineEquipment({
        primitiveId: "eq-valve-1",
        equipmentKind: "valve",
        terminals: [
          {
            terminalId: "in",
            direction: "inlet",
            portClass: "water",
            service: "domestic_cold_water",
            nominalSize: dn(25),
          },
          {
            terminalId: "out",
            direction: "outlet",
            portClass: "water",
            service: "domestic_cold_water",
            nominalSize: dn(25),
          },
        ],
        epistemicStatus: "INFERRED",
        provenance: [prov("valve-1")],
        geometry: geometryReferenced("rn-eq-valve-1"),
      }),
      definePipeSegment({
        primitiveId: "pipe-2",
        service: "domestic_cold_water",
        nominalSize: dn(25),
        flow: "a_to_b",
        epistemicStatus: "INFERRED",
        provenance: [prov("pipe-2")],
        // Honest omission: run above a finished ceiling — geometry not seen.
        geometry: geometryOmitted("OCCLUDED", "run above finished ceiling, not visible to capture"),
        properties: [property("insulated", true, "thermal-imaging survey interpretation", "pipe-2-insulation")],
      }),
      defineEquipment({
        primitiveId: "eq-cap-1",
        equipmentKind: "cap",
        terminals: [
          {
            terminalId: "in",
            direction: "inlet",
            portClass: "water",
            service: "domestic_cold_water",
            nominalSize: dn(25),
          },
        ],
        epistemicStatus: "INFERRED",
        provenance: [prov("cap-1")],
        geometry: geometryReferenced("rn-eq-cap-1"),
      }),
    ],
    connections: [
      connection("c1", { equipmentId: "eq-pump-1", terminalId: "out" }, { segmentId: "pipe-1", port: "a" }, "c1"),
      connection("c2", { segmentId: "pipe-1", port: "b" }, { equipmentId: "eq-valve-1", terminalId: "in" }, "c2"),
      connection("c3", { equipmentId: "eq-valve-1", terminalId: "out" }, { segmentId: "pipe-2", port: "a" }, "c3"),
      connection("c4", { segmentId: "pipe-2", port: "b" }, { equipmentId: "eq-cap-1", terminalId: "in" }, "c4", "OBSERVED"),
    ],
  });
  return {
    system,
    expected: {
      violations: [],
      indeterminates: [],
      components: [
        {
          members: ["eq-cap-1", "eq-pump-1", "eq-valve-1", "pipe-1", "pipe-2"],
          connections: ["c1", "c2", "c3", "c4"],
        },
      ],
      stats: { primitiveCount: 5, connectionCount: 4, violationCount: 0, indeterminateCount: 0, componentCount: 1 },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Fixture 2 — clean supply-air duct network                           */
/* ------------------------------------------------------------------ */

/**
 * HAND COMPUTATION (worked example):
 *
 *   eq-ahu-1.out ──d1──> duct-1.a  duct-1.b ──d2──> eq-vav-1.in (400 mm)
 *   eq-vav-1.out (250 mm) ──d3──> duct-2.a  duct-2.b ──d4──> eq-diff-1.in
 *
 * The VAV box has DIFFERENT terminal diameters (in 400, out 250) — that is
 * a reducer, not a mismatch: connections compare their own two endpoints
 * pairwise (400=400 on d2, 250=250 on d3/d4). Class air=air, direction
 * out→in, service supply_air everywhere, no power → no voltage check.
 * → 0 violations, 0 indeterminates, 1 component of 5, stats {5, 4, 0, 0, 1}.
 */
export function cleanDuctNetwork(): MepFixture {
  const system = defineMepSystem({
    systemId: "fixture-duct-clean",
    primitives: [
      defineEquipment({
        primitiveId: "eq-ahu-1",
        equipmentKind: "air_handler",
        terminals: [
          {
            terminalId: "out",
            direction: "outlet",
            portClass: "air",
            service: "supply_air",
            nominalSize: dn(400),
          },
        ],
        epistemicStatus: "INFERRED",
        provenance: [prov("ahu-1")],
        geometry: geometryReferenced("rn-eq-ahu-1"),
      }),
      defineDuctSegment({
        primitiveId: "duct-1",
        service: "supply_air",
        nominalSize: dn(400),
        flow: "a_to_b",
        epistemicStatus: "INFERRED",
        provenance: [prov("duct-1")],
        geometry: geometryReferenced("rn-duct-1"),
      }),
      defineEquipment({
        primitiveId: "eq-vav-1",
        equipmentKind: "vav_box",
        terminals: [
          {
            terminalId: "in",
            direction: "inlet",
            portClass: "air",
            service: "supply_air",
            nominalSize: dn(400),
          },
          {
            terminalId: "out",
            direction: "outlet",
            portClass: "air",
            service: "supply_air",
            nominalSize: dn(250),
          },
        ],
        epistemicStatus: "INFERRED",
        provenance: [prov("vav-1")],
        geometry: geometryReferenced("rn-eq-vav-1"),
      }),
      defineDuctSegment({
        primitiveId: "duct-2",
        service: "supply_air",
        nominalSize: dn(250),
        flow: "a_to_b",
        epistemicStatus: "INFERRED",
        provenance: [prov("duct-2")],
        geometry: geometryReferenced("rn-duct-2"),
      }),
      defineEquipment({
        primitiveId: "eq-diff-1",
        equipmentKind: "diffuser",
        terminals: [
          {
            terminalId: "in",
            direction: "inlet",
            portClass: "air",
            service: "supply_air",
            nominalSize: dn(250),
          },
        ],
        epistemicStatus: "INFERRED",
        provenance: [prov("diff-1")],
        geometry: geometryReferenced("rn-eq-diff-1"),
      }),
    ],
    connections: [
      connection("d1", { equipmentId: "eq-ahu-1", terminalId: "out" }, { segmentId: "duct-1", port: "a" }, "d1"),
      connection("d2", { segmentId: "duct-1", port: "b" }, { equipmentId: "eq-vav-1", terminalId: "in" }, "d2"),
      connection("d3", { equipmentId: "eq-vav-1", terminalId: "out" }, { segmentId: "duct-2", port: "a" }, "d3"),
      connection("d4", { segmentId: "duct-2", port: "b" }, { equipmentId: "eq-diff-1", terminalId: "in" }, "d4"),
    ],
  });
  return {
    system,
    expected: {
      violations: [],
      indeterminates: [],
      components: [
        {
          members: ["duct-1", "duct-2", "eq-ahu-1", "eq-diff-1", "eq-vav-1"],
          connections: ["d1", "d2", "d3", "d4"],
        },
      ],
      stats: { primitiveCount: 5, connectionCount: 4, violationCount: 0, indeterminateCount: 0, componentCount: 1 },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Fixture 3 — clean power cable-tray network (one honest indeterminate) */
/* ------------------------------------------------------------------ */

/**
 * HAND COMPUTATION (worked example):
 *
 *   eq-db-1.out ──t1──> tray-1.a  tray-1.b ──t2──> eq-jb-1.in
 *   eq-jb-1.out ──t3──> tray-2.a
 *
 * All endpoints class power, service power, direction out→in, width
 * 300 mm = 300 mm on t2/t3, voltage LV = LV on every power connection.
 * The DB terminal has NO containment size (NOT_OBSERVED — a lug has no
 * tray width), so t1's size check cannot run: exactly ONE indeterminate
 * (diameter_indeterminate), which is the honest report, not a violation.
 * → 0 violations, 1 indeterminate (t1), 1 component of 4, stats {4, 3, 0, 1, 1}.
 */
export function cleanTrayNetwork(): MepFixture {
  const system = defineMepSystem({
    systemId: "fixture-tray-clean",
    primitives: [
      defineEquipment({
        primitiveId: "eq-db-1",
        equipmentKind: "distribution_board",
        voltageClass: "LV",
        terminals: [
          {
            terminalId: "out",
            direction: "outlet",
            portClass: "power",
            service: "power",
            nominalSize: absentSize("NOT_OBSERVED", "distribution board lug — no containment size"),
            voltageClass: "LV",
          },
        ],
        epistemicStatus: "INFERRED",
        provenance: [prov("db-1")],
        geometry: geometryReferenced("rn-eq-db-1"),
      }),
      defineCableTray({
        primitiveId: "tray-1",
        service: "power",
        nominalSize: dn(300),
        flow: "a_to_b",
        voltageClass: "LV",
        epistemicStatus: "INFERRED",
        provenance: [prov("tray-1")],
        geometry: geometryReferenced("rn-tray-1"),
      }),
      defineEquipment({
        primitiveId: "eq-jb-1",
        equipmentKind: "junction_box",
        terminals: [
          {
            terminalId: "in",
            direction: "inlet",
            portClass: "power",
            service: "power",
            nominalSize: dn(300),
            voltageClass: "LV",
          },
          {
            terminalId: "out",
            direction: "outlet",
            portClass: "power",
            service: "power",
            nominalSize: dn(300),
            voltageClass: "LV",
          },
        ],
        epistemicStatus: "INFERRED",
        provenance: [prov("jb-1")],
        geometry: geometryReferenced("rn-eq-jb-1"),
      }),
      defineCableTray({
        primitiveId: "tray-2",
        service: "power",
        nominalSize: dn(300),
        flow: "a_to_b",
        voltageClass: "LV",
        epistemicStatus: "INFERRED",
        provenance: [prov("tray-2")],
        geometry: geometryReferenced("rn-tray-2"),
      }),
    ],
    connections: [
      connection("t1", { equipmentId: "eq-db-1", terminalId: "out" }, { segmentId: "tray-1", port: "a" }, "t1"),
      connection("t2", { segmentId: "tray-1", port: "b" }, { equipmentId: "eq-jb-1", terminalId: "in" }, "t2"),
      connection("t3", { equipmentId: "eq-jb-1", terminalId: "out" }, { segmentId: "tray-2", port: "a" }, "t3"),
    ],
  });
  return {
    system,
    expected: {
      violations: [],
      indeterminates: [{ connectionId: "t1", code: "diameter_indeterminate" }],
      components: [
        {
          members: ["eq-db-1", "eq-jb-1", "tray-1", "tray-2"],
          connections: ["t1", "t2", "t3"],
        },
      ],
      stats: { primitiveCount: 4, connectionCount: 3, violationCount: 0, indeterminateCount: 1, componentCount: 1 },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Fixture 4 — deliberately corrupted mixed network                    */
/* ------------------------------------------------------------------ */

/**
 * HAND COMPUTATION (worked example — every finding derived by hand):
 *
 * Primitives (flow a_to_b ⇒ port a = in, port b = out; b_to_a mirrored:
 *   port a = out, port b = in):
 *   pipe-w-1 (DCW,25,a_to_b)      pipe-g-1 (gas,25,b_to_a: a=out,b=in)
 *   pipe-w-2 (DCW,25,a_to_b)      pipe-w-3 (DCW,25,a_to_b)
 *   pipe-d25 (DCW,25,a_to_b)      pipe-d32 (DCW,32,a_to_b)
 *   pipe-heat-1 (heating_supply,25,a_to_b)
 *   pipe-unk-service (UNKNOWN service,25,a_to_b)
 *   pipe-unk-flow (DCW,25,flow UNKNOWN)
 *   pipe-sigma-a (DCW,108±2,a_to_b)  pipe-sigma-b (DCW,110±1,a_to_b)
 *   pipe-sigma-c (DCW,115±0.5,a_to_b) pipe-bidi-1 (DCW,25,bidirectional)
 *   tray-lv-1 (power,300,LV,a_to_b)  tray-mv-1 (power,300,MV,a_to_b)
 *   tray-lv-unk (power,300,voltage UNKNOWN,a_to_b)
 *   eq-pump-x (pump; in: inlet/water/DCW/25)
 *   eq-occluded-1 (sensor; t: bidirectional/portClass OCCLUDED/service
 *                  NOT_OBSERVED/size UNKNOWN/voltage NOT_OBSERVED)
 *
 * Connections and their hand-derived findings (tolerance = 1 mm):
 *   x-class          pipe-g-1.a (out,gas) → eq-pump-x:in (inlet,water,DCW)
 *       class gas≠water → port_class_mismatch; service gas≠DCW →
 *       service_mismatch. (2 violations — every violation is reported.)
 *   x-double-1       pipe-w-3.b (out) → eq-pump-x:in — all checks pass,
 *       but eq-pump-x:in was already used by x-class →
 *       endpoint_double_connected (reported at the SECOND connection in
 *       canonical order).
 *   x-direction      pipe-w-2.a (in) → pipe-w-3.a (in): in→in →
 *       port_direction_mismatch.
 *   x-service        pipe-heat-1.b (out) → pipe-w-1.a (in): class ✓,
 *       direction ✓, diameter 25=25 ✓, heating_supply≠DCW →
 *       service_mismatch.
 *   x-diameter       pipe-d25.b (out) → pipe-d32.a (in): |25−32|=7 > 1,
 *       point bounds [25,25]/[32,32] are 7 mm apart > 1 →
 *       diameter_mismatch.
 *   x-dangling       pipe-d32.b (out) → pipe-missing:a — no such primitive
 *       → dangling_endpoint (attribute checks skipped: hop unvalidatable).
 *   x-self           pipe-d25.a (in) → pipe-d25.a (in) → self_connection
 *       (short-circuits the remaining checks).
 *   x-voltage        tray-lv-1.b (out,LV) → tray-mv-1.a (in,MV): power
 *       connection, LV≠MV → voltage_class_mismatch.
 *   x-voltage-unknown tray-lv-unk.b (out,UNKNOWN) → tray-lv-1.a (in,LV):
 *       power connection, voltage UNKNOWN → voltage_class_indeterminate.
 *   x-sigma          pipe-sigma-a.b (out,108±2) → pipe-sigma-b.a (in,110±1):
 *       |Δ|=2 > 1 (nominal mismatch) but bounds [106,110] and [109,111]
 *       overlap (distance 0 ≤ 1) → diameter_within_uncertainty.
 *   x-sigma-hard     pipe-sigma-c.b (out,115±0.5) → pipe-sigma-a.a (in,108±2):
 *       |Δ|=7 > 1; bounds [114.5,115.5] and [106,110] are 114.5−110=4.5 mm
 *       apart > 1 → diameter_mismatch.
 *   x-unknown-service pipe-unk-service.b (out, service UNKNOWN) →
 *       pipe-heat-1.a (in, heating_supply): class not derivable (service
 *       UNKNOWN) → port_class_indeterminate; service UNKNOWN →
 *       service_indeterminate. (direction ✓, diameter 25=25 ✓)
 *   x-unknown-flow   pipe-unk-flow.b (direction UNKNOWN) → pipe-bidi-1.a
 *       (bidirectional): direction not established →
 *       port_direction_indeterminate. (class/service/diameter all ✓)
 *   x-occluded       eq-occluded-1:t (bidirectional, portClass OCCLUDED,
 *       service NOT_OBSERVED, size UNKNOWN) → pipe-bidi-1.b (bidirectional):
 *       direction ✓; port_class_indeterminate + service_indeterminate +
 *       diameter_indeterminate — the three absence values are DISTINCT
 *       and each unvalidatable check is reported separately.
 *
 * Structural components (dangling connections do not join anything):
 *   {eq-occluded-1, pipe-bidi-1, pipe-unk-flow}    [x-occluded, x-unknown-flow]
 *   {eq-pump-x, pipe-g-1, pipe-w-2, pipe-w-3}     [x-class, x-direction, x-double-1]
 *   {pipe-d25, pipe-d32}                           [x-diameter, x-self]
 *   {pipe-heat-1, pipe-unk-service, pipe-w-1}     [x-service, x-unknown-service]
 *   {pipe-sigma-a, pipe-sigma-b, pipe-sigma-c}     [x-sigma, x-sigma-hard]
 *   {tray-lv-1, tray-lv-unk, tray-mv-1}            [x-voltage, x-voltage-unknown]
 * → 10 violations, 8 indeterminates, 6 components; stats {18, 14, 10, 8, 6}.
 */
export function mismatchedNetwork(): MepFixture {
  const pipe = (
    primitiveId: string,
    service: Parameters<typeof definePipeSegment>[0]["service"],
    nominalSize: MepQuantity,
    flow: Parameters<typeof definePipeSegment>[0]["flow"],
    extra: { voltageClass?: Parameters<typeof definePipeSegment>[0]["voltageClass"] } = {},
  ) =>
    definePipeSegment({
      primitiveId,
      service,
      nominalSize,
      flow,
      epistemicStatus: "INFERRED",
      provenance: [prov(primitiveId)],
      geometry: geometryReferenced(`rn-${primitiveId}`),
      ...(extra.voltageClass === undefined ? {} : { voltageClass: extra.voltageClass }),
    });

  const system = defineMepSystem({
    systemId: "fixture-mixed-corrupted",
    primitives: [
      pipe("pipe-w-1", "domestic_cold_water", dn(25), "a_to_b"),
      pipe("pipe-g-1", "gas", dn(25), "b_to_a"),
      pipe("pipe-w-2", "domestic_cold_water", dn(25), "a_to_b"),
      pipe("pipe-w-3", "domestic_cold_water", dn(25), "a_to_b"),
      pipe("pipe-d25", "domestic_cold_water", dn(25), "a_to_b"),
      pipe("pipe-d32", "domestic_cold_water", dn(32), "a_to_b"),
      pipe("pipe-heat-1", "heating_supply", dn(25), "a_to_b"),
      pipe("pipe-unk-service", "UNKNOWN", dn(25), "a_to_b"),
      pipe("pipe-unk-flow", "domestic_cold_water", dn(25), "UNKNOWN"),
      pipe("pipe-sigma-a", "domestic_cold_water", dnTolerance(108, 2), "a_to_b"),
      pipe("pipe-sigma-b", "domestic_cold_water", dnTolerance(110, 1), "a_to_b"),
      pipe("pipe-sigma-c", "domestic_cold_water", dnTolerance(115, 0.5), "a_to_b"),
      pipe("pipe-bidi-1", "domestic_cold_water", dn(25), "bidirectional"),
      defineCableTray({
        primitiveId: "tray-lv-1",
        service: "power",
        nominalSize: dn(300),
        flow: "a_to_b",
        voltageClass: "LV",
        epistemicStatus: "INFERRED",
        provenance: [prov("tray-lv-1")],
        geometry: geometryReferenced("rn-tray-lv-1"),
      }),
      defineCableTray({
        primitiveId: "tray-mv-1",
        service: "power",
        nominalSize: dn(300),
        flow: "a_to_b",
        voltageClass: "MV",
        epistemicStatus: "INFERRED",
        provenance: [prov("tray-mv-1")],
        geometry: geometryReferenced("rn-tray-mv-1"),
      }),
      defineCableTray({
        primitiveId: "tray-lv-unk",
        service: "power",
        nominalSize: dn(300),
        flow: "a_to_b",
        voltageClass: "UNKNOWN",
        epistemicStatus: "INFERRED",
        provenance: [prov("tray-lv-unk")],
        geometry: geometryReferenced("rn-tray-lv-unk"),
      }),
      defineEquipment({
        primitiveId: "eq-pump-x",
        equipmentKind: "pump",
        terminals: [
          {
            terminalId: "in",
            direction: "inlet",
            portClass: "water",
            service: "domestic_cold_water",
            nominalSize: dn(25),
          },
        ],
        epistemicStatus: "INFERRED",
        provenance: [prov("pump-x")],
        geometry: geometryReferenced("rn-eq-pump-x"),
      }),
      defineEquipment({
        primitiveId: "eq-occluded-1",
        equipmentKind: "sensor",
        terminals: [
          {
            terminalId: "t",
            direction: "bidirectional",
            portClass: "OCCLUDED",
            service: "NOT_OBSERVED",
            nominalSize: absentSize("UNKNOWN", "sensor terminal behind bulkhead"),
            voltageClass: "NOT_OBSERVED",
          },
        ],
        epistemicStatus: "INFERRED",
        provenance: [prov("occluded-1")],
        geometry: geometryOmitted("OCCLUDED", "sensor obstructed by bulkhead"),
      }),
    ],
    connections: [
      connection("x-class", { segmentId: "pipe-g-1", port: "a" }, { equipmentId: "eq-pump-x", terminalId: "in" }, "x-class"),
      connection("x-double-1", { segmentId: "pipe-w-3", port: "b" }, { equipmentId: "eq-pump-x", terminalId: "in" }, "x-double-1"),
      connection("x-direction", { segmentId: "pipe-w-2", port: "a" }, { segmentId: "pipe-w-3", port: "a" }, "x-direction"),
      connection("x-service", { segmentId: "pipe-heat-1", port: "b" }, { segmentId: "pipe-w-1", port: "a" }, "x-service"),
      connection("x-diameter", { segmentId: "pipe-d25", port: "b" }, { segmentId: "pipe-d32", port: "a" }, "x-diameter"),
      connection("x-dangling", { segmentId: "pipe-d32", port: "b" }, { segmentId: "pipe-missing", port: "a" }, "x-dangling"),
      connection("x-self", { segmentId: "pipe-d25", port: "a" }, { segmentId: "pipe-d25", port: "a" }, "x-self"),
      connection("x-voltage", { segmentId: "tray-lv-1", port: "b" }, { segmentId: "tray-mv-1", port: "a" }, "x-voltage"),
      connection("x-voltage-unknown", { segmentId: "tray-lv-unk", port: "b" }, { segmentId: "tray-lv-1", port: "a" }, "x-voltage-unknown"),
      connection("x-sigma", { segmentId: "pipe-sigma-a", port: "b" }, { segmentId: "pipe-sigma-b", port: "a" }, "x-sigma"),
      connection("x-sigma-hard", { segmentId: "pipe-sigma-c", port: "b" }, { segmentId: "pipe-sigma-a", port: "a" }, "x-sigma-hard"),
      connection("x-unknown-service", { segmentId: "pipe-unk-service", port: "b" }, { segmentId: "pipe-heat-1", port: "a" }, "x-unknown-service"),
      connection("x-unknown-flow", { segmentId: "pipe-unk-flow", port: "b" }, { segmentId: "pipe-bidi-1", port: "a" }, "x-unknown-flow"),
      connection("x-occluded", { equipmentId: "eq-occluded-1", terminalId: "t" }, { segmentId: "pipe-bidi-1", port: "b" }, "x-occluded"),
    ],
  });
  return {
    system,
    expected: {
      violations: [
        { connectionId: "x-class", code: "port_class_mismatch" },
        { connectionId: "x-class", code: "service_mismatch" },
        { connectionId: "x-dangling", code: "dangling_endpoint" },
        { connectionId: "x-diameter", code: "diameter_mismatch" },
        { connectionId: "x-direction", code: "port_direction_mismatch" },
        { connectionId: "x-double-1", code: "endpoint_double_connected" },
        { connectionId: "x-self", code: "self_connection" },
        { connectionId: "x-service", code: "service_mismatch" },
        { connectionId: "x-sigma-hard", code: "diameter_mismatch" },
        { connectionId: "x-voltage", code: "voltage_class_mismatch" },
      ],
      indeterminates: [
        { connectionId: "x-occluded", code: "port_class_indeterminate" },
        { connectionId: "x-occluded", code: "service_indeterminate" },
        { connectionId: "x-occluded", code: "diameter_indeterminate" },
        { connectionId: "x-sigma", code: "diameter_within_uncertainty" },
        { connectionId: "x-unknown-flow", code: "port_direction_indeterminate" },
        { connectionId: "x-unknown-service", code: "port_class_indeterminate" },
        { connectionId: "x-unknown-service", code: "service_indeterminate" },
        { connectionId: "x-voltage-unknown", code: "voltage_class_indeterminate" },
      ],
      components: [
        { members: ["eq-occluded-1", "pipe-bidi-1", "pipe-unk-flow"], connections: ["x-occluded", "x-unknown-flow"] },
        { members: ["eq-pump-x", "pipe-g-1", "pipe-w-2", "pipe-w-3"], connections: ["x-class", "x-direction", "x-double-1"] },
        { members: ["pipe-d25", "pipe-d32"], connections: ["x-diameter", "x-self"] },
        { members: ["pipe-heat-1", "pipe-unk-service", "pipe-w-1"], connections: ["x-service", "x-unknown-service"] },
        { members: ["pipe-sigma-a", "pipe-sigma-b", "pipe-sigma-c"], connections: ["x-sigma", "x-sigma-hard"] },
        { members: ["tray-lv-1", "tray-lv-unk", "tray-mv-1"], connections: ["x-voltage", "x-voltage-unknown"] },
      ],
      stats: { primitiveCount: 18, connectionCount: 14, violationCount: 10, indeterminateCount: 8, componentCount: 6 },
    },
  };
}
