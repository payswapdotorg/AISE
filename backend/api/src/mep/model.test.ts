/**
 * AISE-034 model tests — vocabularies, constructors, the boundary-parser
 * refusal matrix (every refusal typed and distinct), the property-assertion
 * discipline (units, method, provenance, confidence vs uncertainty), the
 * honest-absence discrimination (UNKNOWN vs NOT_OBSERVED vs OCCLUDED),
 * deep-frozen purity, determinism (content ids) and byte-identical
 * serialization/reparse round-trips.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  ABSENCE_KINDS,
  ALL_MEP_SERVICES,
  defineCableTray,
  defineDuctSegment,
  defineEquipment,
  defineMepConnection,
  defineMepSystem,
  definePipeSegment,
  EQUIPMENT_KINDS,
  FAMILY_SERVICES,
  isMepError,
  MEP_FAMILIES,
  MepError,
  mepPrimitiveContentId,
  mepSystemContentId,
  parseMepConnection,
  parseMepPrimitive,
  parseMepSystem,
  PIPE_SERVICES,
  PORT_CLASSES,
  SERVICE_PORT_CLASSES,
  VOLTAGE_CLASSES,
  type MepConnectionDraft,
  type MepEquipmentDraft,
  type MepErrorCode,
  type MepSegmentDraft,
} from "./index";
import { deepFreeze, evidenceIdOf, FIXED_NOW, knownSize, makeProvenance } from "./testkit";

/* ------------------------------------------------------------------ */
/* Test helpers                                                         */
/* ------------------------------------------------------------------ */

function pipeDraft(overrides: Partial<MepSegmentDraft> = {}): MepSegmentDraft & { family: "pipe" } {
  return {
    primitiveId: "pipe-1",
    service: "domestic_cold_water",
    nominalSize: knownSize(25),
    flow: "a_to_b",
    epistemicStatus: "INFERRED",
    provenance: [makeProvenance()],
    geometry: { link: "referenced", realityNodeId: "rn-pipe-1" },
    family: "pipe",
    ...overrides,
  };
}

function equipmentDraft(
  overrides: Partial<MepEquipmentDraft> = {},
): MepEquipmentDraft & { family: "equipment" } {
  return {
    primitiveId: "eq-1",
    equipmentKind: "pump",
    terminals: [
      {
        terminalId: "in",
        direction: "inlet",
        portClass: "water",
        service: "domestic_cold_water",
        nominalSize: knownSize(25),
      },
    ],
    epistemicStatus: "INFERRED",
    provenance: [makeProvenance()],
    geometry: { link: "referenced", realityNodeId: "rn-eq-1" },
    family: "equipment",
    ...overrides,
  };
}

/** Assert that fn() refuses with the exact typed code (and detail content). */
function expectRefusal(
  fn: () => unknown,
  code: MepErrorCode,
  detailIncludes?: string,
): MepError {
  let caught: unknown = undefined;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught instanceof MepError).toBe(true);
  expect(isMepError(caught)).toBe(true);
  const mepError = caught as MepError;
  expect(mepError.code).toBe(code);
  if (detailIncludes !== undefined) {
    expect(mepError.detail.includes(detailIncludes)).toBe(true);
  }
  return mepError;
}

/** Recursively assert that a produced record is deep-frozen. */
function assertDeeplyFrozen(value: unknown): void {
  if (Array.isArray(value)) {
    expect(Object.isFrozen(value)).toBe(true);
    for (const item of value) {
      assertDeeplyFrozen(item);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const key of Object.getOwnPropertyNames(value)) {
      assertDeeplyFrozen((value as Record<string, unknown>)[key]);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Vocabularies                                                         */
/* ------------------------------------------------------------------ */

describe("MEP vocabularies", () => {
  test("every vocabulary is frozen at runtime", () => {
    for (const vocabulary of [
      MEP_FAMILIES,
      PIPE_SERVICES,
      ALL_MEP_SERVICES,
      PORT_CLASSES,
      VOLTAGE_CLASSES,
      EQUIPMENT_KINDS,
      ABSENCE_KINDS,
    ]) {
      expect(Object.isFrozen(vocabulary)).toBe(true);
    }
  });

  test("SERVICE_PORT_CLASSES is total over every MEP service and frozen", () => {
    expect(Object.isFrozen(SERVICE_PORT_CLASSES)).toBe(true);
    for (const service of ALL_MEP_SERVICES) {
      const portClass = SERVICE_PORT_CLASSES[service];
      expect((PORT_CLASSES as readonly string[]).includes(portClass)).toBe(true);
    }
  });

  test("FAMILY_SERVICES maps each family to its own closed vocabulary", () => {
    expect(FAMILY_SERVICES.pipe).toBe(PIPE_SERVICES);
    expect(FAMILY_SERVICES.cable_tray).toHaveLength(5);
    expect(FAMILY_SERVICES.equipment).toBe(ALL_MEP_SERVICES);
  });
});

/* ------------------------------------------------------------------ */
/* Constructors                                                         */
/* ------------------------------------------------------------------ */

describe("constructors", () => {
  test("definePipeSegment preserves every field and stamps family pipe", () => {
    const pipe = definePipeSegment(pipeDraft());
    expect(pipe.family).toBe("pipe");
    expect(pipe.primitiveId).toBe("pipe-1");
    expect(pipe.service).toBe("domestic_cold_water");
    expect(pipe.nominalSize).toEqual({ presence: "PRESENT", value: 25, unit: "mm" });
    expect(pipe.flow).toBe("a_to_b");
    expect(pipe.epistemicStatus).toBe("INFERRED");
    expect(pipe.provenance).toHaveLength(1);
    expect(pipe.geometry).toEqual({ link: "referenced", realityNodeId: "rn-pipe-1" });
  });

  test("defineDuctSegment and defineCableTray stamp their families", () => {
    const duct = defineDuctSegment({
      ...pipeDraft({ primitiveId: "duct-1" }),
      service: "supply_air",
    });
    expect(duct.family).toBe("duct");
    expect(duct.service).toBe("supply_air");
    const tray = defineCableTray({
      ...pipeDraft({ primitiveId: "tray-1" }),
      service: "power",
      voltageClass: "LV",
    });
    expect(tray.family).toBe("cable_tray");
    expect(tray.voltageClass).toBe("LV");
  });

  test("defineEquipment builds typed in/out terminals and freezes deeply", () => {
    const draft = equipmentDraft({
      terminals: [
        {
          terminalId: "in",
          direction: "inlet",
          portClass: "water",
          service: "domestic_cold_water",
          nominalSize: knownSize(25),
        },
        {
          terminalId: "out",
          direction: "outlet",
          portClass: "water",
          service: "domestic_cold_water",
          nominalSize: knownSize(25),
        },
      ],
    });
    const equipment = defineEquipment(draft);
    expect(equipment.family).toBe("equipment");
    expect(equipment.equipmentKind).toBe("pump");
    expect(equipment.terminals.map((t) => t.direction)).toEqual(["inlet", "outlet"]);
    assertDeeplyFrozen(equipment);
  });

  test("defineMepSystem canonicalizes to id-sorted order", () => {
    const pipeA = definePipeSegment(pipeDraft({ primitiveId: "a-pipe" }));
    const pipeB = definePipeSegment(pipeDraft({ primitiveId: "b-pipe" }));
    const conn = defineMepConnection({
      connectionId: "c1",
      from: { segmentId: "b-pipe", port: "b" },
      to: { segmentId: "a-pipe", port: "a" },
      epistemicStatus: "INFERRED",
      provenance: [makeProvenance()],
    });
    const system = defineMepSystem({
      systemId: "sys",
      primitives: [pipeB, pipeA],
      connections: [conn],
    });
    expect(system.primitives.map((p) => p.primitiveId)).toEqual(["a-pipe", "b-pipe"]);
    expect(system.connections[0]?.connectionId).toBe("c1");
  });

  test("constructors share the parse path (bad service refuses typed)", () => {
    expectRefusal(
      () => definePipeSegment(pipeDraft({ service: "supply_air" })),
      "invalid_service",
      "pipe service",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Boundary-parser refusal matrix                                       */
/* ------------------------------------------------------------------ */

describe("boundary parser refusal matrix", () => {
  test("non-object primitive refuses with invalid_primitive", () => {
    expectRefusal(() => parseMepPrimitive("pipe"), "invalid_primitive");
    expectRefusal(() => parseMepPrimitive(null), "invalid_primitive");
  });

  test("malformed family refuses with invalid_family naming the vocabulary", () => {
    expectRefusal(
      () => parseMepPrimitive({ ...pipeDraft(), family: "conduit" }),
      "invalid_family",
      "pipe|duct|cable_tray|equipment",
    );
  });

  test("non-vocabulary pipe service refuses with invalid_service naming family vocabulary and value", () => {
    const error = expectRefusal(
      () => parseMepPrimitive({ ...pipeDraft(), service: "supply_air" }),
      "invalid_service",
    );
    expect(error.detail.includes("supply_air")).toBe(true);
    expect(error.detail.includes("domestic_cold_water")).toBe(true);
  });

  test("non-vocabulary duct and tray services refuse with invalid_service", () => {
    expectRefusal(
      () => parseMepPrimitive({ ...pipeDraft(), family: "duct", service: "domestic_cold_water" }),
      "invalid_service",
    );
    expectRefusal(
      () => parseMepPrimitive({ ...pipeDraft(), family: "cable_tray", service: "supply_air" }),
      "invalid_service",
    );
  });

  test("negative nominal size refuses with invalid_nominal_size", () => {
    expectRefusal(
      () => parseMepPrimitive(pipeDraft({ nominalSize: knownSize(-5) })),
      "invalid_nominal_size",
    );
  });

  test("zero, non-finite and unit-less nominal sizes refuse with invalid_nominal_size", () => {
    expectRefusal(
      () => parseMepPrimitive(pipeDraft({ nominalSize: knownSize(0) })),
      "invalid_nominal_size",
    );
    expectRefusal(
      () =>
        parseMepPrimitive(
          pipeDraft({ nominalSize: { presence: "PRESENT", value: Number.NaN, unit: "mm" } }),
        ),
      "invalid_nominal_size",
    );
    expectRefusal(
      () =>
        parseMepPrimitive(
          pipeDraft({ nominalSize: { presence: "PRESENT", value: Number.POSITIVE_INFINITY, unit: "mm" } }),
        ),
      "invalid_nominal_size",
    );
    expectRefusal(
      () =>
        parseMepPrimitive(
          pipeDraft({ nominalSize: { presence: "PRESENT", value: 25, unit: "cm" } }),
        ),
      "invalid_nominal_size",
      '"mm"',
    );
  });

  test("malformed presence discriminator refuses with invalid_quantity", () => {
    expectRefusal(
      () => parseMepPrimitive(pipeDraft({ nominalSize: { presence: "MAYBE" } as never })),
      "invalid_quantity",
      "PRESENT|UNKNOWN|NOT_OBSERVED|OCCLUDED",
    );
    expectRefusal(() => parseMepPrimitive(pipeDraft({ nominalSize: 25 as never })), "invalid_quantity");
  });

  test("bogus absence value refuses with invalid_absence (geometry) / invalid_quantity (presence)", () => {
    // A bogus presence discriminator is a malformed quantity, not an absence:
    expectRefusal(
      () => parseMepPrimitive(pipeDraft({ nominalSize: { presence: "MISSING" } as never })),
      "invalid_quantity",
      "PRESENT|UNKNOWN|NOT_OBSERVED|OCCLUDED",
    );
    expectRefusal(
      () =>
        parseMepPrimitive(
          pipeDraft({ geometry: { link: "omitted", omission: "UNSEEN" } as never }),
        ),
      "invalid_absence",
      "UNKNOWN|NOT_OBSERVED|OCCLUDED",
    );
  });

  test("missing geometry link refuses with missing_geometry_link (absence must be stated)", () => {
    const draft: Record<string, unknown> = { ...pipeDraft() };
    delete draft["geometry"];
    expectRefusal(() => parseMepPrimitive(draft), "missing_geometry_link");
  });

  test("malformed geometry link refuses with invalid_geometry_link / invalid_id", () => {
    expectRefusal(
      () => parseMepPrimitive(pipeDraft({ geometry: { link: "maybe" } as never })),
      "invalid_geometry_link",
    );
    expectRefusal(
      () => parseMepPrimitive(pipeDraft({ geometry: { link: "referenced" } as never })),
      "invalid_id",
      "realityNodeId",
    );
  });

  test("numeric property without unit refuses with numeric_property_without_unit", () => {
    const draft = pipeDraft({
      properties: [
        {
          key: "length",
          value: 3.2,
          epistemicStatus: "OBSERVED",
          method: "tape measure",
          provenance: [makeProvenance()],
        },
      ],
    });
    expectRefusal(() => parseMepPrimitive(draft), "numeric_property_without_unit");
  });

  test("unit on a non-numeric property refuses with invalid_property", () => {
    const draft = pipeDraft({
      properties: [
        {
          key: "insulated",
          value: true,
          unit: "m",
          epistemicStatus: "INFERRED",
          method: "survey interpretation",
          provenance: [makeProvenance()],
        } as never,
      ],
    });
    expectRefusal(() => parseMepPrimitive(draft), "invalid_property");
  });

  test("property without derivation method refuses with missing_method", () => {
    const draft = pipeDraft({
      properties: [
        {
          key: "length",
          value: 3.2,
          unit: "m",
          epistemicStatus: "OBSERVED",
          provenance: [makeProvenance()],
        } as never,
      ],
    });
    expectRefusal(() => parseMepPrimitive(draft), "missing_method");
  });

  test("empty provenance refuses with missing_provenance; source-less record with invalid_provenance", () => {
    expectRefusal(() => parseMepPrimitive(pipeDraft({ provenance: [] })), "missing_provenance");
    expectRefusal(
      () =>
        parseMepPrimitive(
          pipeDraft({
            provenance: [{ role: "SUPPORTS", recordedAt: FIXED_NOW }],
          }),
        ),
      "invalid_provenance",
      "names no source",
    );
  });

  test("non-hex evidence id refuses with invalid_evidence_id", () => {
    expectRefusal(
      () =>
        parseMepPrimitive(
          pipeDraft({
            provenance: [
              { role: "SUPPORTS", evidenceId: "not-hex-at-all", recordedAt: FIXED_NOW },
            ],
          }),
        ),
      "invalid_evidence_id",
    );
  });

  test("invalid epistemic status refuses with invalid_epistemic_status", () => {
    expectRefusal(
      () => parseMepPrimitive(pipeDraft({ epistemicStatus: "GUARANTEED" as never })),
      "invalid_epistemic_status",
    );
  });

  test("invalid provenance timestamp refuses with invalid_timestamp", () => {
    expectRefusal(
      () =>
        parseMepPrimitive(
          pipeDraft({
            provenance: [
              { role: "SUPPORTS", evidenceId: evidenceIdOf("t"), recordedAt: "2026-01-21T09:00:00Z" },
            ],
          }),
        ),
      "invalid_timestamp",
    );
  });

  test("invalid equipment kind refuses with invalid_equipment_kind", () => {
    expectRefusal(
      () => parseMepPrimitive(equipmentDraft({ equipmentKind: "flux_capacitor" as never })),
      "invalid_equipment_kind",
    );
  });

  test("invalid terminal direction and port class refuse with their own codes", () => {
    const badDirection = equipmentDraft({
      terminals: [
        {
          terminalId: "in",
          direction: "sideways" as never,
          portClass: "water",
          service: "domestic_cold_water",
          nominalSize: knownSize(25),
        },
      ],
    });
    expectRefusal(() => parseMepPrimitive(badDirection), "invalid_terminal_direction");
    const badPortClass = equipmentDraft({
      terminals: [
        {
          terminalId: "in",
          direction: "inlet",
          portClass: "plasma" as never,
          service: "domestic_cold_water",
          nominalSize: knownSize(25),
        },
      ],
    });
    expectRefusal(() => parseMepPrimitive(badPortClass), "invalid_port_class");
  });

  test("invalid voltage class and flow refuse with their own codes", () => {
    expectRefusal(
      () => parseMepPrimitive(pipeDraft({ voltageClass: "ULTRA" as never })),
      "invalid_voltage_class",
    );
    expectRefusal(
      () => parseMepPrimitive(pipeDraft({ flow: "north" as never })),
      "invalid_flow",
    );
  });

  test("duplicate terminal ids refuse with duplicate_terminal_id", () => {
    const terminal = {
      terminalId: "in",
      direction: "inlet" as const,
      portClass: "water" as const,
      service: "domestic_cold_water" as const,
      nominalSize: knownSize(25),
    };
    expectRefusal(
      () => parseMepPrimitive(equipmentDraft({ terminals: [terminal, terminal] })),
      "duplicate_terminal_id",
    );
  });

  test("duplicate property keys refuse with duplicate_property_key", () => {
    const property = {
      key: "length",
      value: 3.2,
      unit: "m",
      epistemicStatus: "OBSERVED" as const,
      method: "tape measure",
      provenance: [makeProvenance()],
    };
    expectRefusal(
      () => parseMepPrimitive(pipeDraft({ properties: [property, property] })),
      "duplicate_property_key",
    );
  });

  test("duplicate primitive/connection ids in a system refuse with their own codes", () => {
    const pipe = definePipeSegment(pipeDraft());
    expectRefusal(
      () => parseMepSystem({ systemId: "sys", primitives: [pipe, pipe], connections: [] }),
      "duplicate_primitive_id",
    );
    const conn = defineMepConnection({
      connectionId: "c1",
      from: { segmentId: "pipe-1", port: "a" },
      to: { segmentId: "pipe-1", port: "b" },
      epistemicStatus: "INFERRED",
      provenance: [makeProvenance()],
    });
    expectRefusal(
      () =>
        parseMepSystem({
          systemId: "sys",
          primitives: [pipe],
          connections: [conn, conn],
        }),
      "duplicate_connection_id",
    );
  });

  test("malformed endpoint references refuse with invalid_endpoint_ref", () => {
    const base: MepConnectionDraft = {
      connectionId: "c1",
      from: { segmentId: "pipe-1", port: "a" },
      to: { segmentId: "pipe-2", port: "b" },
      epistemicStatus: "INFERRED",
      provenance: [makeProvenance()],
    };
    expectRefusal(
      () =>
        parseMepConnection({
          ...base,
          to: { segmentId: "pipe-2", port: "c" },
        }),
      "invalid_endpoint_ref",
      '"a" or "b"',
    );
    expectRefusal(
      () =>
        parseMepConnection({
          ...base,
          to: { segmentId: "pipe-2", equipmentId: "eq-1", terminalId: "in" },
        }),
      "invalid_endpoint_ref",
      "mutually exclusive",
    );
    expectRefusal(
      () => parseMepConnection({ ...base, to: {} as never }),
      "invalid_endpoint_ref",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Uncertainty / confidence discipline                                  */
/* ------------------------------------------------------------------ */

describe("uncertainty and confidence discipline", () => {
  function draftWithProperty(extra: Record<string, unknown>): MepSegmentDraft {
    return pipeDraft({
      properties: [
        {
          key: "length",
          value: 3.2,
          unit: "m",
          epistemicStatus: "OBSERVED",
          method: "tape measure",
          provenance: [makeProvenance()],
          ...extra,
        } as never,
      ],
    });
  }

  test("uncertainty per-kind policy is enforced (DIMENSIONAL/STATISTICAL/INTERVAL)", () => {
    expectRefusal(
      () => parseMepPrimitive(draftWithProperty({ uncertainty: { kind: "DIMENSIONAL" } })),
      "invalid_uncertainty",
      "plusMinus",
    );
    expectRefusal(
      () =>
        parseMepPrimitive(
          draftWithProperty({ uncertainty: { kind: "STATISTICAL", plusMinus: 0.05 } }),
        ),
      "invalid_uncertainty",
      "level",
    );
    expectRefusal(
      () =>
        parseMepPrimitive(
          draftWithProperty({ uncertainty: { kind: "INTERVAL", lower: 4, upper: 3 } }),
        ),
      "invalid_uncertainty",
      "exceed upper",
    );
    const valid = parseMepPrimitive(
      draftWithProperty({ uncertainty: { kind: "INTERVAL", lower: 3.1, upper: 3.3 } }),
    );
    expect(valid.properties[0]?.uncertainty).toEqual({ kind: "INTERVAL", lower: 3.1, upper: 3.3 });
  });

  test("PROBABILISTIC confidence above 1 refuses; 1 is accepted", () => {
    expectRefusal(
      () =>
        parseMepPrimitive(
          draftWithProperty({ confidence: { kind: "PROBABILISTIC", value: 1.5 } }),
        ),
      "invalid_confidence",
      "[0,1]",
    );
    const valid = parseMepPrimitive(
      draftWithProperty({ confidence: { kind: "PROBABILISTIC", value: 1 } }),
    );
    expect(valid.properties[0]?.confidence).toEqual({ kind: "PROBABILISTIC", value: 1 });
  });

  test("a confidence object in the uncertainty slot is refused (never conflated)", () => {
    const error = expectRefusal(
      () =>
        parseMepPrimitive(
          draftWithProperty({ uncertainty: { kind: "PROBABILISTIC", value: 0.9 } }),
        ),
      "invalid_uncertainty",
    );
    expect(error.detail.includes("confidence is never measurement uncertainty")).toBe(true);
  });

  test("an uncertainty object in the confidence slot is refused (never conflated)", () => {
    const error = expectRefusal(
      () =>
        parseMepPrimitive(
          draftWithProperty({ confidence: { kind: "DIMENSIONAL", plusMinus: 0.05 } }),
        ),
      "invalid_confidence",
    );
    expect(error.detail.includes("measurement uncertainty is never confidence")).toBe(true);
  });

  test("measurement uncertainty applies only to numeric property values", () => {
    expectRefusal(
      () =>
        parseMepPrimitive(
          pipeDraft({
            properties: [
              {
                key: "insulated",
                value: true,
                epistemicStatus: "INFERRED",
                method: "survey",
                provenance: [makeProvenance()],
                uncertainty: { kind: "DIMENSIONAL", plusMinus: 1 },
              } as never,
            ],
          }),
        ),
      "invalid_uncertainty",
      "numeric",
    );
  });

  test("nominal-size uncertainty follows the same per-kind policy", () => {
    expectRefusal(
      () =>
        parseMepPrimitive(
          pipeDraft({
            nominalSize: {
              presence: "PRESENT",
              value: 25,
              unit: "mm",
              uncertainty: { kind: "STATISTICAL", plusMinus: 2 },
            },
          }),
        ),
      "invalid_uncertainty",
      "level",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Honest absence discrimination                                        */
/* ------------------------------------------------------------------ */

describe("honest absence discrimination", () => {
  test("UNKNOWN, NOT_OBSERVED and OCCLUDED survive parsing distinctly (never coerced)", () => {
    for (const kind of ["UNKNOWN", "NOT_OBSERVED", "OCCLUDED"] as const) {
      const pipe = parseMepPrimitive(
        pipeDraft({
          service: kind,
          nominalSize: { presence: kind, detail: `service ${kind}` },
          geometry: { link: "omitted", omission: kind, detail: `geometry ${kind}` },
        }),
      );
      expect(pipe.family).toBe("pipe");
      if (pipe.family !== "pipe") {
        throw new Error("fixture expected a pipe primitive");
      }
      expect(pipe.service).toBe(kind);
      expect(pipe.nominalSize.presence).toBe(kind);
      expect(pipe.geometry).toEqual({
        link: "omitted",
        omission: kind,
        detail: `geometry ${kind}`,
      });
    }
  });

  test("unasserted voltage class stays distinct from typed absences", () => {
    const unasserted = parseMepPrimitive(pipeDraft());
    expect(unasserted.voltageClass).toBeUndefined();
    const unknown = parseMepPrimitive(pipeDraft({ voltageClass: "UNKNOWN" }));
    expect(unknown.voltageClass).toBe("UNKNOWN");
    const observed = parseMepPrimitive(pipeDraft({ voltageClass: "LV" }));
    expect(observed.voltageClass).toBe("LV");
  });
});

/* Helper: read an arbitrary (possibly absent) key off a frozen record. */
function optionalKey(record: object, key: string): unknown {
  return (record as unknown as Record<string, unknown>)[key];
}

/* ------------------------------------------------------------------ */
/* Purity, determinism, serialization round-trips                       */
/* ------------------------------------------------------------------ */

describe("purity, determinism and round-trips", () => {
  test("parse output is deep-frozen and the input draft is never mutated", () => {
    const frozenDraft = deepFreeze(pipeDraft({ note: "frozen input" }));
    const pipe = definePipeSegment(frozenDraft);
    assertDeeplyFrozen(pipe);
    expect(JSON.parse(JSON.stringify(frozenDraft))).toEqual(JSON.parse(JSON.stringify(pipeDraft({ note: "frozen input" }))));
  });

  test("content ids are stable per content and sensitive to content changes", () => {
    const a1 = definePipeSegment(pipeDraft());
    const a2 = definePipeSegment(pipeDraft());
    const b = definePipeSegment(pipeDraft({ nominalSize: knownSize(32) }));
    expect(mepPrimitiveContentId(a1)).toBe(mepPrimitiveContentId(a2));
    expect(mepPrimitiveContentId(a1)).not.toBe(mepPrimitiveContentId(b));
    expect(mepPrimitiveContentId(a1)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("serialization/reparse round-trip is byte-identical (primitive)", () => {
    const pipe = definePipeSegment(
      pipeDraft({
        properties: [
          {
            key: "measured_length",
            value: 3.42,
            unit: "m",
            epistemicStatus: "OBSERVED",
            method: "laser distance meter",
            confidence: { kind: "PROBABILISTIC", value: 0.9 },
            uncertainty: { kind: "DIMENSIONAL", plusMinus: 0.05 },
            provenance: [makeProvenance()],
          },
        ],
      }),
    );
    const canonical = canonicalJsonStringify(pipe);
    const reparsed = parseMepPrimitive(JSON.parse(canonical));
    expect(canonicalJsonStringify(reparsed)).toBe(canonical);
  });

  test("serialization/reparse round-trip is byte-identical (equipment, connection, system)", () => {
    const equipment = defineEquipment(equipmentDraft());
    const connection = defineMepConnection({
      connectionId: "c1",
      from: { equipmentId: "eq-1", terminalId: "in" },
      to: { segmentId: "pipe-1", port: "a" },
      epistemicStatus: "INFERRED",
      provenance: [makeProvenance()],
    });
    const pipe = definePipeSegment(pipeDraft());
    const system = defineMepSystem({
      systemId: "sys-1",
      primitives: [pipe, equipment],
      connections: [connection],
    });
    for (const value of [equipment, connection, system]) {
      const canonical = canonicalJsonStringify(value);
      const reparsed =
        value === system
          ? parseMepSystem(JSON.parse(canonical))
          : value === connection
            ? parseMepConnection(JSON.parse(canonical))
            : parseMepPrimitive(JSON.parse(canonical));
      expect(canonicalJsonStringify(reparsed)).toBe(canonical);
    }
    expect(mepSystemContentId(system)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("systems canonicalize: shuffled input listings produce identical bytes", () => {
    const pipeA = definePipeSegment(pipeDraft({ primitiveId: "a-pipe" }));
    const pipeB = definePipeSegment(pipeDraft({ primitiveId: "b-pipe" }));
    const connection = defineMepConnection({
      connectionId: "c1",
      from: { segmentId: "a-pipe", port: "b" },
      to: { segmentId: "b-pipe", port: "a" },
      epistemicStatus: "INFERRED",
      provenance: [makeProvenance()],
    });
    const forward = defineMepSystem({
      systemId: "sys",
      primitives: [pipeA, pipeB],
      connections: [connection],
    });
    const shuffled = defineMepSystem({
      systemId: "sys",
      primitives: [pipeB, pipeA],
      connections: [connection],
    });
    expect(canonicalJsonStringify(shuffled)).toBe(canonicalJsonStringify(forward));
    expect(mepSystemContentId(shuffled)).toBe(mepSystemContentId(forward));
  });

  test("parse ignores unknown keys (open shapes, forward compatibility)", () => {
    const raw: Record<string, unknown> = { ...pipeDraft(), family: "pipe", futureField: 42 };
    const pipe = parseMepPrimitive(raw);
    expect(optionalKey(pipe, "futureField")).toBeUndefined();
    expect(pipe.family).toBe("pipe");
  });
});
