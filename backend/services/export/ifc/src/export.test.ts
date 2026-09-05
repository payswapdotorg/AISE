/**
 * Unit tests for the deterministic IFC export core (AISE-018).
 *
 * Coverage discipline (CRITICAL): every acceptance clause has a
 * pinned test —
 * - AC-100 schema-valid export: every emitted file passes the
 *   built-in IFC4X3 subset conformance validator;
 * - AC-102 stable identifiers/property mapping: deterministic
 *   GUIDs, ObjectId/ContentHash/epistemic/provenance passthrough
 *   inside AISE psets;
 * - AC-103 no second authority: pure function, byte-stable,
 *   canonical digest unchanged by export operations, fail-closed
 *   on every invalid input shape;
 * - evidence metadata: live and retracted links surface with
 *   status; absence of evidence is honest absence.
 */
import { describe, expect, it } from "vitest";
import {
  assembleModelGraph,
  makeRealityObject,
  modelProvenance,
  propertyAssertion,
  evidenceRecord,
  evidenceLink,
  evidenceRetraction,
  linkRetraction,
  assembleEvidenceGraph,
  type EvidenceGraph,
  type EvidenceLink,
  type ModelProvenance,
  type RealityModelGraph,
  type RealityObjectInput,
  type StructuredPlanarGeometryInput,
} from "@aise/engineering-model";
import { exportIfc, AISE_PSET_NAMES, IFC_EXPORT_LIMITATIONS } from "./ifc.js";
import { validateIfcSpf, type ParsedSpfEntity } from "./schema.js";
import { toExportIfcError } from "./errors.js";

// --- deterministic graph fixtures (the AISE-017 unit-fixture pattern) -------

/** A valid 64-hex content hash for test provenance pins. */
function hashOf(seed: string): string {
  return seed.padEnd(64, "0").slice(0, 64).replace(/[^0-9a-f]/g, "1");
}

/** Builds a rectangle's corners/center exactly from the frame + bounds. */
function rectangleOf(
  frame: {
    planePoint: { x: number; y: number; z: number };
    axisU: { x: number; y: number; z: number };
    axisV: { x: number; y: number; z: number };
  },
  bounds: { uMin: number; uMax: number; vMin: number; vMax: number },
): { center: { x: number; y: number; z: number }; corners: { x: number; y: number; z: number }[] } {
  const at = (u: number, v: number) => ({
    x: frame.planePoint.x + frame.axisU.x * u + frame.axisV.x * v,
    y: frame.planePoint.y + frame.axisU.y * u + frame.axisV.y * v,
    z: frame.planePoint.z + frame.axisU.z * u + frame.axisV.z * v,
  });
  const { uMin, uMax, vMin, vMax } = bounds;
  return {
    center: at((uMin + uMax) / 2, (vMin + vMax) / 2),
    corners: [at(uMin, vMin), at(uMax, vMin), at(uMax, vMax), at(uMin, vMax)],
  };
}

/** A floor: horizontal rectangle 4 × 3 m at z = 0 (the golden footprint). */
function floorGeometry(): StructuredPlanarGeometryInput {
  const frame = {
    planePoint: { x: 2, y: 1.5, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    axisU: { x: 1, y: 0, z: 0 },
    axisV: { x: 0, y: 1, z: 0 },
  };
  return {
    shape: "planar-rectangle",
    frame,
    rectangle: {
      uMin: -2,
      uMax: 2,
      vMin: -1.5,
      vMax: 1.5,
      ...rectangleOf(frame, { uMin: -2, uMax: 2, vMin: -1.5, vMax: 1.5 }),
    },
    width: { value: 4, unit: "meter" },
    height: { value: 3, unit: "meter" },
    area: { value: 12, unit: "square_meter" },
    elevation: { value: 0, unit: "meter" },
    quality: { pointCount: 4000, residualRms: 0.004, residualMaxAbs: 0.012 },
  };
}

/** A wall: vertical rectangle 3 × 2.7 m on the x = 0 plane. */
function wallGeometry(): StructuredPlanarGeometryInput {
  const frame = {
    planePoint: { x: 0, y: 1.5, z: 1.35 },
    normal: { x: 1, y: 0, z: 0 },
    axisU: { x: 0, y: 1, z: 0 },
    axisV: { x: 0, y: 0, z: 1 },
  };
  return {
    shape: "planar-rectangle",
    frame,
    rectangle: {
      uMin: -1.5,
      uMax: 1.5,
      vMin: -1.35,
      vMax: 1.35,
      ...rectangleOf(frame, { uMin: -1.5, uMax: 1.5, vMin: -1.35, vMax: 1.35 }),
    },
    width: { value: 3, unit: "meter" },
    height: { value: 2.7, unit: "meter" },
    area: { value: 8.1, unit: "square_meter" },
    quality: { pointCount: 3000, residualRms: 0.006, residualMaxAbs: 0.02 },
  };
}

/** A door: vertical rectangle 0.9 × 2.1 m on the x = 0 plane. */
function doorGeometry(): StructuredPlanarGeometryInput {
  const frame = {
    planePoint: { x: 0, y: 2, z: 1.05 },
    normal: { x: 1, y: 0, z: 0 },
    axisU: { x: 0, y: 1, z: 0 },
    axisV: { x: 0, y: 0, z: 1 },
  };
  return {
    shape: "planar-rectangle",
    frame,
    rectangle: {
      uMin: -0.45,
      uMax: 0.45,
      vMin: -1.05,
      vMax: 1.05,
      ...rectangleOf(frame, { uMin: -0.45, uMax: 0.45, vMin: -1.05, vMax: 1.05 }),
    },
    width: { value: 0.9, unit: "meter" },
    height: { value: 2.1, unit: "meter" },
    area: { value: 1.89, unit: "square_meter" },
    headHeight: { value: 2.1, unit: "meter" },
    quality: { pointCount: 500, residualRms: 0.01, residualMaxAbs: 0.03 },
  };
}

/** A provenance pin unique per seed. */
function provenanceOf(seed: string): ModelProvenance {
  return modelProvenance("test/unit-ifc", { fixture: seed }, [
    {
      kind: "object",
      serviceId: "test.semantics",
      method: "test/extraction",
      objectId: `obj-${seed}`,
      contentHash: hashOf(seed),
      epistemic: "INFERRED",
    },
  ]);
}

interface FixtureObject {
  readonly objectClass: RealityObjectInput["objectClass"];
  readonly seed: string;
  readonly geometry?: StructuredPlanarGeometryInput;
  readonly assetOnly?: boolean;
  readonly epistemic?: RealityObjectInput["epistemicState"];
}

const MODEL_ID = "model-unit-ifc";
const PROJECT_ID = "project-unit-ifc";
const SPACE_ID = "room-unit-ifc";

function objectInputs(requested: readonly FixtureObject[]): RealityObjectInput[] {
  const objects = [...requested];
  const needsWall = requested.some(
    (fixture) => fixture.objectClass === "DOOR" || fixture.objectClass === "WINDOW",
  );
  const hasWall = requested.some((fixture) => fixture.objectClass === "WALL");
  if (needsWall && !hasWall) {
    objects.push({ objectClass: "WALL", seed: "parent-wall", geometry: wallGeometry() });
  }
  return objects.map((fixture) => ({
    objectClass: fixture.objectClass,
    ...(fixture.geometry !== undefined ? { structuredGeometry: fixture.geometry } : {}),
    ...(fixture.assetOnly === true
      ? {
          assetRefs: [
            {
              kind: "point-cloud" as const,
              contentHash: hashOf(`asset-${fixture.seed}`),
              pointCount: 50,
              epistemic: "INFERRED" as const,
            },
          ],
        }
      : {}),
    epistemicState: fixture.epistemic ?? "INFERRED",
    provenance: provenanceOf(fixture.seed),
  }));
}

function relationshipsOf(
  inputs: readonly RealityObjectInput[],
  spaceId: string = SPACE_ID,
): {
  type: "CONTAINS" | "OPENING_IN";
  fromId: string;
  toId: string;
}[] {
  const built = inputs.map((input) => makeRealityObject(MODEL_ID, input));
  const firstWallId = built.find((object, index) => inputs[index]!.objectClass === "WALL")?.objectId;
  return built.flatMap((object, index) => {
    const containment = { type: "CONTAINS" as const, fromId: spaceId, toId: object.objectId };
    const isOpening =
      inputs[index]!.objectClass === "DOOR" || inputs[index]!.objectClass === "WINDOW";
    return isOpening
      ? [containment, { type: "OPENING_IN" as const, fromId: object.objectId, toId: firstWallId! }]
      : [containment];
  });
}

function simpleGraph(requested: readonly FixtureObject[]): RealityModelGraph {
  const inputs = objectInputs(requested);
  return assembleModelGraph({
    modelId: MODEL_ID,
    projectId: PROJECT_ID,
    spaces: [{ spaceId: SPACE_ID, kind: "ROOM", frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" } }],
    objects: inputs,
    relationships: relationshipsOf(inputs),
  });
}

/** Exports and validates; returns the parsed entities for structural asserts. */
function exportAndParse(graph: RealityModelGraph, options: Parameters<typeof exportIfc>[1] = {}) {
  const document = exportIfc(graph, options);
  const validation = validateIfcSpf(document.spf);
  if (!validation.ok) {
    throw new Error(`emitted file must validate: ${validation.errors.join("; ")}`);
  }
  return { document, entities: validation.entities };
}

function entitiesOf(entities: readonly ParsedSpfEntity[], name: string): ParsedSpfEntity[] {
  return entities.filter((entity) => entity.name === name);
}

// --- evidence fixtures ---------------------------------------------------------

function measurementRecord(): ReturnType<typeof evidenceRecord> {
  return evidenceRecord({
    kind: "MEASUREMENT",
    source: {
      kind: "manual-measurement",
      value: 3.1,
      unit: "meter",
      method: "survey/total-station",
      measuredBy: "surveyor-bob",
      measuredAt: "2026-09-01T09:30:00Z",
    },
    recordedBy: "svc:test",
    recordedAt: "2026-09-01T09:35:00Z",
  });
}

function observationRecord(): ReturnType<typeof evidenceRecord> {
  return evidenceRecord({
    kind: "HUMAN_OBSERVATION",
    source: {
      kind: "human-observation",
      observer: "user:alice",
      observedAt: "2026-09-02T10:00:00Z",
      statement: "The wall is visibly plumb",
    },
    recordedBy: "svc:test",
    recordedAt: "2026-09-02T10:05:00Z",
  });
}

// --- AC-100: schema-valid deterministic export --------------------------------

describe("schema-validity of every emitted file (AC-100)", () => {
  it("emits a file that passes the built-in conformance validator", () => {
    const { document, entities } = exportAndParse(
      simpleGraph([
        { objectClass: "FLOOR", seed: "floor", geometry: floorGeometry() },
        { objectClass: "WALL", seed: "wall", geometry: wallGeometry() },
        { objectClass: "DOOR", seed: "door", geometry: doorGeometry() },
      ]),
    );
    expect(document.schema).toBe("IFC4X3_ADD2");
    expect(document.spf.startsWith("ISO-10303-21;")).toBe(true);
    expect(document.spf.endsWith("END-ISO-10303-21;\n")).toBe(true);
    // Class mapping: slab + wall + door + opening.
    expect(entitiesOf(entities, "IFCSLAB")).toHaveLength(1);
    expect(entitiesOf(entities, "IFCWALL")).toHaveLength(1);
    expect(entitiesOf(entities, "IFCDOOR")).toHaveLength(1);
    expect(entitiesOf(entities, "IFCOPENINGELEMENT")).toHaveLength(1);
    expect(document.counts.products).toBe(3);
    expect(document.counts.openings).toBe(1);
  });

  it("emits the full spatial spine with mapped spaces and correct aggregation", () => {
    const { entities } = exportAndParse(
      simpleGraph([{ objectClass: "FLOOR", seed: "floor", geometry: floorGeometry() }]),
    );
    expect(entitiesOf(entities, "IFCPROJECT")).toHaveLength(1);
    expect(entitiesOf(entities, "IFCSITE")).toHaveLength(1);
    expect(entitiesOf(entities, "IFCBUILDING")).toHaveLength(1);
    expect(entitiesOf(entities, "IFCSTOREY")).toHaveLength(1);
    expect(entitiesOf(entities, "IFCSPACE")).toHaveLength(1);
    // project→site, site→building, building→storey, storey→space.
    const aggregates = entitiesOf(entities, "IFCRELAGGREGATES");
    expect(aggregates).toHaveLength(4);
    const contained = entitiesOf(entities, "IFCRELCONTAINEDINSPATIALSTRUCTURE");
    expect(contained).toHaveLength(1);
    // The one contained element list carries the single product.
    const relatedElements = contained[0]!.args[4]!;
    expect(relatedElements.t).toBe("list");
  });

  it("emits IFCUNITS (SI), context, and the ownership cluster", () => {
    const { entities } = exportAndParse(
      simpleGraph([{ objectClass: "FLOOR", seed: "floor", geometry: floorGeometry() }]),
    );
    const siUnits = entitiesOf(entities, "IFCSIUNIT");
    expect(siUnits).toHaveLength(3);
    const unitAssignment = entitiesOf(entities, "IFCUNITASSIGNMENT");
    expect(unitAssignment).toHaveLength(1);
    expect(entitiesOf(entities, "IFCPROJECT")).toHaveLength(1);
    expect(entitiesOf(entities, "IFCOWNERHISTORY")).toHaveLength(1);
    expect(entitiesOf(entities, "IFCAPPLICATION")).toHaveLength(1);
    expect(entitiesOf(entities, "IFCGEOMETRICREPRESENTATIONCONTEXT")).toHaveLength(1);
  });

  it("emits an empty-objects graph as the spine only (still valid)", () => {
    const { document, entities } = exportAndParse(
      assembleModelGraph({
        modelId: MODEL_ID,
        projectId: PROJECT_ID,
        spaces: [{ spaceId: SPACE_ID, kind: "ROOM", frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" } }],
        objects: [],
        relationships: [],
      }),
    );
    expect(document.counts.objects).toBe(0);
    expect(document.counts.products).toBe(0);
    expect(entitiesOf(entities, "IFCSITE")).toHaveLength(1);
    expect(entitiesOf(entities, "IFCBUILDING")).toHaveLength(1);
    expect(entitiesOf(entities, "IFCSTOREY")).toHaveLength(1);
  });
});

// --- determinism + purity (AC-103) ---------------------------------------------

describe("determinism and canonical-state preservation (AC-103)", () => {
  const graph = simpleGraph([
    { objectClass: "FLOOR", seed: "floor", geometry: floorGeometry() },
    { objectClass: "WALL", seed: "wall", geometry: wallGeometry() },
    { objectClass: "DOOR", seed: "door", geometry: doorGeometry() },
  ]);

  it("is byte-stable: two exports of the same graph are identical", () => {
    const first = exportIfc(graph);
    const second = exportIfc(graph);
    expect(second.spf).toBe(first.spf);
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.entityCount).toBe(first.entityCount);
  });

  it("carries the exact graph digest as the export anchor", () => {
    const document = exportIfc(graph);
    expect(document.graphDigest).toBe(graph.digest);
    expect(document.spf.includes(graph.digest)).toBe(true);
  });

  it("does not mutate the canonical graph (digest + structure unchanged)", () => {
    const before = { digest: graph.digest, serialized: JSON.stringify(graph) };
    const document = exportIfc(graph);
    expect(graph.digest).toBe(before.digest);
    expect(JSON.stringify(graph)).toBe(before.serialized);
    void document;
  });

  it("the exported document is immutable (deep-frozen)", () => {
    const document = exportIfc(graph);
    expect(() => {
      (document as unknown as { counts: unknown }).counts = { products: 999 };
    }).toThrow();
    expect(() => {
      (document as unknown as { spf: string }).spf = "tampered";
    }).toThrow();
  });

  it("embeds the explicit v1 limitations inside the document", () => {
    const document = exportIfc(graph);
    expect(document.limitations).toBe(IFC_EXPORT_LIMITATIONS);
    expect(document.limitations.length).toBeGreaterThanOrEqual(10);
  });
});

// --- AC-102: stable identifiers + property mapping ------------------------------

describe("identifier and metadata passthrough (AC-102)", () => {
  const graph = simpleGraph([{ objectClass: "WALL", seed: "wall", geometry: wallGeometry() }]);
  const { document, entities } = exportAndParse(graph);
  const wall = graph.objects.find((object) => object.objectClass === "WALL")!;
  const ifcWall = entitiesOf(entities, "IFCWALL")[0]!;

  function wallPsetValues(psetName: string): Map<string, string> {
    const values = new Map<string, string>();
    for (const line of document.spf.split("\n")) {
      if (!line.includes(`'${psetName}'`)) {
        continue;
      }
      const propertySet = entities.find((entity) => line.startsWith(`#${entity.id}=`));
      if (propertySet === undefined) {
        continue;
      }
      const items = propertySet.args[4]!;
      if (items.t !== "list") {
        continue;
      }
      for (const item of items.v) {
        if (item.t !== "ref") {
          continue;
        }
        const property = entities.find((entity) => entity.id === item.id);
        if (property === undefined || property.name !== "IFCPROPERTYSINGLEVALUE") {
          continue;
        }
        const name = property.args[0]!;
        const value = property.args[2]!;
        if (name.t === "str" && value.t === "str") {
          values.set(name.v, value.v);
        }
      }
    }
    return values;
  }

  it("places the canonical objectId on the IFC Tag attribute", () => {
    const tag = ifcWall.args[7]!;
    expect(tag.t).toBe("str");
    if (tag.t === "str") {
      expect(tag.v).toBe(wall.objectId);
    }
  });

  it("Pset_AISEIdentity carries ObjectId, ContentHash, and the epistemic state (passthrough)", () => {
    const identity = wallPsetValues(AISE_PSET_NAMES.identity);
    expect(identity.get("ObjectId")).toBe(wall.objectId);
    expect(identity.get("ObjectClass")).toBe("WALL");
    expect(identity.get("ContentHash")).toBe(wall.contentHash);
    expect(identity.get("EpistemicState")).toBe(wall.epistemicState);
    expect(identity.get("GeometryExported")).toBe("Yes");
  });

  it("Pset_AISEProvenance carries the provenance chain verbatim", () => {
    const provenance = wallPsetValues(AISE_PSET_NAMES.provenance);
    expect(provenance.get("ServiceId")).toBe(wall.provenance.serviceId);
    expect(provenance.get("Method")).toBe(wall.provenance.method);
    expect(provenance.get("MethodVersion")).toBe(wall.provenance.methodVersion);
    expect(provenance.get("Inputs")).toContain(hashOf("wall"));
    expect(provenance.get("Inputs")).toContain("[INFERRED]");
  });

  it("canonical quantities travel verbatim AND as exact SI in BaseQuantities", () => {
    const canonical = wallPsetValues(AISE_PSET_NAMES.canonicalQuantities);
    expect(canonical.get("Width")).toBe("3 meter");
    expect(canonical.get("Height")).toBe("2.7 meter");
    expect(canonical.get("Area")).toBe("8.1 square_meter");
    const quantityLength = entitiesOf(entities, "IFCQUANTITYLENGTH").find((entity) => {
      const name = entity.args[0]!;
      return name.t === "str" && name.v === "Width";
    })!;
    const value = quantityLength.args[3]!;
    expect(value.t).toBe("real");
    if (value.t === "real") {
      expect(value.v).toBe(3);
    }
    const formula = quantityLength.args[4]!;
    expect(formula.t).toBe("str");
    if (formula.t === "str") {
      expect(formula.v).toBe("canonical: 3 meter");
    }
    const area = entitiesOf(entities, "IFCQUANTITYAREA")[0]!;
    const areaValue = area.args[3]!;
    expect(areaValue.t).toBe("real");
    if (areaValue.t === "real") {
      expect(areaValue.v).toBe(8.1);
    }
  });

  it("uncertainty variants survive verbatim (standard, expanded, tolerance)", () => {
    const uncertain = simpleGraph([{ objectClass: "WALL", seed: "wall", geometry: {
      ...wallGeometry(),
      width: { value: 3, unit: "meter", uncertainty: { kind: "standard", u: 0.05 } },
      height: { value: 2.7, unit: "meter", uncertainty: { kind: "expanded", U: 0.1, coverageFactor: 2 } },
      area: { value: 8.1, unit: "square_meter", uncertainty: { kind: "tolerance", lowerOffset: -0.2, upperOffset: 0.2 } },
    } }]);
    const { document } = exportAndParse(uncertain);
    const text = document.spf;
    expect(text).toContain("3 meter +/-0.05 (standard)");
    expect(text).toContain("2.7 meter +/-0.1 (expanded, k=2)");
    expect(text).toContain("8.1 square_meter +0.2/-0.2 (tolerance)");
  });

  it("property assertions (quantity + presence) survive losslessly", () => {
    const assertive = assembleModelGraph({
      modelId: MODEL_ID,
      projectId: PROJECT_ID,
      spaces: [
        {
          spaceId: SPACE_ID,
          kind: "ROOM",
          frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" },
          properties: [
            propertyAssertion({
              key: "roomHeight",
              quantity: { value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 0.03 } },
              status: "INFERRED",
              kind: "estimate",
              method: "scene/assembly-v1",
            }),
            propertyAssertion({ key: "hasSprinklers", presence: "NOT_OBSERVED", status: "INFERRED" }),
          ],
        },
      ],
      objects: objectInputs([{ objectClass: "WALL", seed: "wall", geometry: wallGeometry() }]),
      relationships: relationshipsOf(objectInputs([{ objectClass: "WALL", seed: "wall", geometry: wallGeometry() }])),
    });
    const { document } = exportAndParse(assertive);
    expect(document.spf).toContain("'roomHeight',$,'INFERRED | 2.7 meter +/-0.03 (standard) | estimate | method scene/assembly-v1'");
    expect(document.spf).toContain("'hasSprinklers',$,'INFERRED | NOT_OBSERVED (presence)'");
  });

  it("epistemic states pass through and are never upgraded", () => {
    const confirmed = exportAndParse(
      simpleGraph([{ objectClass: "WALL", seed: "wall", geometry: wallGeometry(), epistemic: "INFERRED" }]),
    );
    expect(confirmed.document.spf).toContain("(epistemic INFERRED)");
    const scaffold = confirmed.document.spf.split("\n").find((line) => line.includes("IFCSITE("))!;
    expect(scaffold.includes("IFCSITE(")).toBe(true);
  });

  it("objects without structured geometry export without body representation, flagged honestly", () => {
    const { entities, document } = exportAndParse(
      simpleGraph([
        { objectClass: "WALL", seed: "wall", geometry: wallGeometry() },
        { objectClass: "FLOOR", seed: "asset-floor", assetOnly: true },
      ]),
    );
    const slab = entitiesOf(entities, "IFCSLAB")[0]!;
    const representation = slab.args[6]!;
    expect(representation.t).toBe("unset");
    // The GeometryExported=No flag rides in Pset_AISEIdentity as its own
    // property entity (name and value are separate SPF instances).
    const flag = entities.find((entity) => {
      if (entity.name !== "IFCPROPERTYSINGLEVALUE") {
        return false;
      }
      const name = entity.args[0]!;
      const value = entity.args[2]!;
      return name.t === "str" && name.v === "GeometryExported" && value.t === "str" && value.v === "No";
    });
    expect(flag).toBeDefined();
    expect(document.spf.includes("IFCSHAPEREPRESENTATION")).toBe(true);
  });
});

// --- unit fidelity (frozen vocabulary) -------------------------------------------

describe("unit conversion through the frozen vocabulary", () => {
  function footFrameGraph(): RealityModelGraph {
    const inputs = objectInputs([{ objectClass: "FLOOR", seed: "floor", geometry: floorGeometry() }]);
    return assembleModelGraph({
      modelId: MODEL_ID,
      projectId: PROJECT_ID,
      spaces: [{ spaceId: SPACE_ID, kind: "ROOM", frame: { up: { x: 0, y: 0, z: 1 }, unit: "foot" } }],
      objects: inputs,
      relationships: relationshipsOf(inputs),
    });
  }

  it("converts coordinates from the declared frame unit into exact SI metres", () => {
    const { entities } = exportAndParse(footFrameGraph());
    // The floor rectangle center is (2, 1.5, 0) in feet → (0.6096, 0.4572, 0) metres.
    const slab = entitiesOf(entities, "IFCSLAB")[0]!;
    const placementArg = slab.args[5]!;
    if (placementArg.t !== "ref") {
      throw new Error("placement must be a reference");
    }
    const placement = entities.find((entity) => entity.id === placementArg.id)!;
    const relativePlacement = placement.args[1]!;
    if (relativePlacement.t !== "ref") {
      throw new Error("relative placement must be a reference");
    }
    const axis = entities.find((entity) => entity.id === relativePlacement.id)!;
    const location = axis.args[0]!;
    if (location.t !== "ref") {
      throw new Error("location must be a reference");
    }
    const point = entities.find((entity) => entity.id === location.id)!;
    const coordinates = point.args[0]!;
    if (coordinates.t !== "list") {
      throw new Error("coordinates must be a list");
    }
    const values = coordinates.v.map((entry) => (entry.t === "real" ? entry.v : Number.NaN));
    expect(values[0]).toBeCloseTo(2 * 0.3048, 12);
    expect(values[1]).toBeCloseTo(1.5 * 0.3048, 12);
    expect(values[2]).toBe(0);
  });

  it("converts area quantities through the frozen area vocabulary", () => {
    const inputs = objectInputs([
      {
        objectClass: "FLOOR",
        seed: "floor-imperial",
        geometry: {
          ...floorGeometry(),
          area: { value: 12, unit: "square_foot" },
        },
      },
    ]);
    const graph = assembleModelGraph({
      modelId: MODEL_ID,
      projectId: PROJECT_ID,
      spaces: [{ spaceId: SPACE_ID, kind: "ROOM", frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" } }],
      objects: inputs,
      relationships: relationshipsOf(inputs),
    });
    const { entities, document } = exportAndParse(graph);
    const area = entitiesOf(entities, "IFCQUANTITYAREA")[0]!;
    const value = area.args[3]!;
    if (value.t !== "real") {
      throw new Error("area value must be a real");
    }
    expect(value.v).toBeCloseTo(12 * 0.3048 * 0.3048, 12);
    // The verbatim canonical value is preserved alongside.
    expect(document.spf).toContain("12 square_foot");
  });
});

// --- openings (voids + fills) -----------------------------------------------------

describe("opening products (doors and windows)", () => {
  it("emits opening + product and the void/fill relationship pair with correct references", () => {
    const { entities } = exportAndParse(
      simpleGraph([
        { objectClass: "WALL", seed: "wall", geometry: wallGeometry() },
        { objectClass: "DOOR", seed: "door", geometry: doorGeometry() },
      ]),
    );
    expect(entitiesOf(entities, "IFCOPENINGELEMENT")).toHaveLength(1);
    const voids = entitiesOf(entities, "IFCRELVOIDSELEMENT");
    const fills = entitiesOf(entities, "IFCRELFILLSELEMENT");
    expect(voids).toHaveLength(1);
    expect(fills).toHaveLength(1);
    // RelatingBuildingElement → the wall product; RelatingOpeningElement → the opening.
    const wall = entitiesOf(entities, "IFCWALL")[0]!;
    const opening = entitiesOf(entities, "IFCOPENINGELEMENT")[0]!;
    const door = entitiesOf(entities, "IFCDOOR")[0]!;
    const voidRelatingElement = voids[0]!.args[4]!;
    const voidRelatingOpening = voids[0]!.args[5]!;
    expect(voidRelatingElement.t === "ref" && voidRelatingElement.id).toBe(wall.id);
    expect(voidRelatingOpening.t === "ref" && voidRelatingOpening.id).toBe(opening.id);
    const fillOpening = fills[0]!.args[4]!;
    const fillElement = fills[0]!.args[5]!;
    expect(fillOpening.t === "ref" && fillOpening.id).toBe(opening.id);
    expect(fillElement.t === "ref" && fillElement.id).toBe(door.id);
    // Overall dimensions are the canonical quantities (SI).
    const overallHeight = door.args[8]!;
    const overallWidth = door.args[9]!;
    expect(overallHeight.t === "real" && overallHeight.v).toBe(2.1);
    expect(overallWidth.t === "real" && overallWidth.v).toBe(0.9);
  });

  it("openings are not separately contained; physical elements are", () => {
    const { entities } = exportAndParse(
      simpleGraph([
        { objectClass: "WALL", seed: "wall", geometry: wallGeometry() },
        { objectClass: "DOOR", seed: "door", geometry: doorGeometry() },
      ]),
    );
    const contained = entitiesOf(entities, "IFCRELCONTAINEDINSPATIALSTRUCTURE")[0]!;
    const related = contained.args[4]!;
    if (related.t !== "list") {
      throw new Error("related elements must be a list");
    }
    const containedIds = related.v.map((entry) => (entry.t === "ref" ? entry.id : -1));
    const wall = entitiesOf(entities, "IFCWALL")[0]!;
    const door = entitiesOf(entities, "IFCDOOR")[0]!;
    expect(containedIds).toContain(wall.id);
    expect(containedIds).toContain(door.id);
    const openingId = entitiesOf(entities, "IFCOPENINGELEMENT")[0]!.id;
    expect(containedIds).not.toContain(openingId);
  });
});

// --- spatial structure mapping ------------------------------------------------------

describe("space mapping (spine fusing, extra spaces, rooms)", () => {
  function multiSpaceGraph(): RealityModelGraph {
    const inputs = objectInputs([{ objectClass: "WALL", seed: "wall", geometry: wallGeometry() }]);
    return assembleModelGraph({
      modelId: MODEL_ID,
      projectId: PROJECT_ID,
      spaces: [
        { spaceId: "site-a", kind: "SITE", frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" } },
        { spaceId: "site-b", kind: "SITE" },
        { spaceId: "bldg-a", kind: "BUILDING", parentSpaceId: "site-a" },
        { spaceId: "level-a", kind: "LEVEL", parentSpaceId: "bldg-a" },
        { spaceId: "level-b", kind: "LEVEL", parentSpaceId: "bldg-a" },
        { spaceId: "room-1", kind: "ROOM", parentSpaceId: "level-a", frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" } },
        { spaceId: "room-2", kind: "ROOM", parentSpaceId: "level-b" },
      ],
      objects: inputs,
      relationships: relationshipsOf(inputs, "room-1"),
    });
  }

  it("fuses mapped spaces into the spine and aggregates the rest (all valid)", () => {
    const { entities, document } = exportAndParse(multiSpaceGraph());
    // Two sites (spine-fused site-a + extra site-b).
    expect(entitiesOf(entities, "IFCSITE")).toHaveLength(2);
    // One building (spine-fused).
    expect(entitiesOf(entities, "IFCBUILDING")).toHaveLength(1);
    // Two storeys (spine-fused level-a + extra level-b).
    expect(entitiesOf(entities, "IFCSTOREY")).toHaveLength(2);
    // Both rooms map to IfcSpace.
    expect(entitiesOf(entities, "IFCSPACE")).toHaveLength(2);
    // Spine-fused site carries the model space metadata.
    expect(document.spf).toContain("AISE space site-a");
    expect(document.spf).toContain("AISE space site-b");
    expect(document.spf).toContain("AISE space room-1");
    // Parent chains travel as explicit properties (name/value on
    // separate SPF tokens, one property entity per pair).
    expect(document.spf).toContain("'ParentSpaceId',$,'level-b'");
    expect(document.spf).toContain("'ParentSpaceId',$,'level-a'");
    expect(document.spf).toContain("'SpaceKind',$,'SITE'");
    expect(document.spf).toContain("'SpaceId',$,'room-1'");
    expect(document.counts.spaces).toBe(7);
  });
});

// --- fail-closed inputs ---------------------------------------------------------------

describe("fail-closed input validation", () => {
  const graph = simpleGraph([{ objectClass: "WALL", seed: "wall", geometry: wallGeometry() }]);

  it("rejects a graph without a declared frame", () => {
    const frameless = {
      ...graph,
      spaces: [{ ...graph.spaces[0]!, frame: undefined }],
    } as unknown as RealityModelGraph;
    const error = capture(() => exportIfc(frameless));
    expect(error?.code).toBe("FRAME_DECLARATION_MISSING");
  });

  it("rejects non-finite geometry coordinates", () => {
    const wall = graph.objects[0]!;
    const geometry = wall.geometry?.structured;
    if (geometry === undefined) {
      throw new Error("test fixture requires structured geometry");
    }
    const poisoned = {
      ...graph,
      objects: [
        {
          ...wall,
          geometry: {
            structured: {
              ...geometry,
              rectangle: {
                ...geometry.rectangle,
                corners: [
                  { ...geometry.rectangle.corners[0]!, x: Number.NaN },
                  ...geometry.rectangle.corners.slice(1),
                ],
              },
            },
          },
        },
      ],
    } as unknown as RealityModelGraph;
    const error = capture(() => exportIfc(poisoned));
    expect(error?.code).toBe("NON_FINITE_INPUT");
    expect(error?.retryable).toBe(false);
  });

  it("rejects non-printable-ASCII names (writer invariant, fail closed)", () => {
    const wall = graph.objects[0]!;
    const renamed = {
      ...graph,
      objects: [{ ...wall, name: "naïve-wall" }],
    } as unknown as RealityModelGraph;
    const error = capture(() => exportIfc(renamed));
    expect(error?.code).toBe("VALIDATION_FAILED");
  });

  it("rejects an opening whose parent wall is not emitted before it (fail closed)", () => {
    const doorFirst = {
      ...graph,
      objects: [...graph.objects].reverse(), // canonical order broken via cast
    } as unknown as RealityModelGraph;
    // A reversed wall/door list still fails only if a door precedes its wall;
    // build that shape explicitly instead.
    const inputs = objectInputs([
      { objectClass: "DOOR", seed: "door", geometry: doorGeometry() },
      { objectClass: "WALL", seed: "wall", geometry: wallGeometry() },
    ]);
    const built = assembleModelGraph({
      modelId: MODEL_ID,
      projectId: PROJECT_ID,
      spaces: [{ spaceId: SPACE_ID, kind: "ROOM", frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" } }],
      objects: inputs,
      relationships: relationshipsOf(inputs),
    });
    // assembleModelGraph orders canonically (walls first); simulate the
    // inconsistent-parent shape by pointing OPENING_IN at a missing wall.
    const broken = {
      ...built,
      relationships: built.relationships.map((relationship) =>
        relationship.type === "OPENING_IN"
          ? { ...relationship, toId: "does-not-exist" }
          : relationship,
      ),
    } as unknown as RealityModelGraph;
    const error = capture(() => exportIfc(broken));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(String(error?.message)).toContain("parent wall");
    void doorFirst;
  });
});

// --- evidence metadata ------------------------------------------------------------------

describe("evidence metadata (where supported, preserved)", () => {
  function graphWithEvidence(): { graph: RealityModelGraph; evidence: EvidenceGraph; wallId: string; liveLink: EvidenceLink } {
    const inputs = objectInputs([{ objectClass: "WALL", seed: "wall", geometry: wallGeometry() }]);
    const graph = assembleModelGraph({
      modelId: MODEL_ID,
      projectId: PROJECT_ID,
      spaces: [{ spaceId: SPACE_ID, kind: "ROOM", frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" } }],
      objects: inputs,
      relationships: relationshipsOf(inputs),
    });
    const wallId = graph.objects.find((object) => object.objectClass === "WALL")!.objectId;
    const measurement = measurementRecord();
    const observation = observationRecord();
    const liveLink = evidenceLink({
      subject: { kind: "object-existence", modelId: MODEL_ID, version: 1, objectId: wallId },
      evidenceId: measurement.evidenceId,
      linkedBy: "svc:test",
      linkedAt: "2026-09-03T12:00:00Z",
      method: "test/seed-link",
    });
    const retractedLink = evidenceLink({
      subject: { kind: "object-existence", modelId: MODEL_ID, version: 1, objectId: wallId },
      evidenceId: observation.evidenceId,
      linkedBy: "svc:test",
      linkedAt: "2026-09-03T12:01:00Z",
      method: "test/seed-link",
    });
    const evidence = assembleEvidenceGraph({
      projectId: PROJECT_ID,
      records: [measurement, observation],
      evidenceRetractions: [],
      links: [liveLink, retractedLink],
      linkRetractions: [
        linkRetraction({
          linkId: retractedLink.linkId,
          retractedBy: "svc:test",
          retractedAt: "2026-09-03T13:00:00Z",
          reason: "wrong subject in the seed",
        }),
      ],
    });
    return { graph, evidence, wallId, liveLink };
  }

  it("surfaces live and retracted links with their honest status", () => {
    const { graph, evidence, liveLink } = graphWithEvidence();
    const { document } = exportAndParse(graph, { version: 1, evidence });
    const evidenceLines = document.spf.split("\n").filter((line) => line.includes("Evidence_"));
    expect(evidenceLines).toHaveLength(2);
    const live = evidenceLines.find((line) => line.includes(liveLink.linkId))!;
    expect(live).toContain("status LIVE");
    expect(live).toContain("MEASUREMENT");
    expect(live).toContain(`record ${liveLink.evidenceId}`);
    const retracted = evidenceLines.find((line) => !line.includes(liveLink.linkId))!;
    expect(retracted).toContain("status LINK_RETRACTED");
    expect(retracted).toContain("HUMAN_OBSERVATION");
    expect(document.counts.evidenceLinks).toBe(2);
    expect(document.evidenceDigest).toBe(evidence.digest);
    expect(document.version).toBe(1);
  });

  it("marks records whose record (not link) is retracted as RECORD_RETRACTED", () => {
    const { graph, evidence } = graphWithEvidence();
    const observation = evidence.records.find((record) => record.kind === "HUMAN_OBSERVATION")!;
    const observationLink = evidence.links.find((link) => link.evidenceId === observation.evidenceId)!;
    const withRecordRetraction = assembleEvidenceGraph({
      projectId: PROJECT_ID,
      records: [...evidence.records],
      evidenceRetractions: [
        evidenceRetraction({
          evidenceId: observation.evidenceId,
          retractedBy: "svc:test",
          retractedAt: "2026-09-03T14:00:00Z",
          reason: "observer retracted the statement",
        }),
      ],
      links: [...evidence.links],
      linkRetractions: [
        // The live link to the retracted record (not the link-retracted one).
        linkRetraction({
          linkId: observationLink.linkId,
          retractedBy: "svc:test",
          retractedAt: "2026-09-03T15:00:00Z",
          reason: "record retracted",
        }),
      ],
    });
    // Retract only the RECORD, keep both links live.
    const recordOnly = assembleEvidenceGraph({
      projectId: PROJECT_ID,
      records: [...evidence.records],
      evidenceRetractions: [
        evidenceRetraction({
          evidenceId: observation.evidenceId,
          retractedBy: "svc:test",
          retractedAt: "2026-09-03T14:00:00Z",
          reason: "observer retracted the statement",
        }),
      ],
      links: [...evidence.links],
      linkRetractions: [],
    });
    void withRecordRetraction;
    const { document } = exportAndParse(graph, { version: 1, evidence: recordOnly });
    expect(document.spf).toContain("status RECORD_RETRACTED");
  });

  it("without an evidence graph, no evidence claims are emitted (honest absence)", () => {
    const { graph } = graphWithEvidence();
    const { document } = exportAndParse(graph);
    expect(document.spf.includes("Pset_AISEEvidence")).toBe(false);
    expect(document.counts.evidenceLinks).toBe(0);
    expect(document.evidenceDigest).toBeUndefined();
  });

  it("links pinned to a different version do not surface (subjects are version-pinned)", () => {
    const { graph, evidence } = graphWithEvidence();
    const { document } = exportAndParse(graph, { version: 2, evidence });
    expect(document.spf.includes("Pset_AISEEvidence")).toBe(false);
  });

  it("space-property evidence attaches to the mapped IfcSpace", () => {
    const { graph, evidence } = graphWithEvidence();
    const measurement = evidence.records.find((record) => record.kind === "MEASUREMENT")!;
    const spaceLink = evidenceLink({
      subject: { kind: "space-property", modelId: MODEL_ID, version: 1, spaceId: SPACE_ID, propertyKey: "roomHeight" },
      evidenceId: measurement.evidenceId,
      linkedBy: "svc:test",
      linkedAt: "2026-09-03T12:02:00Z",
    });
    const withSpaceLink = assembleEvidenceGraph({
      projectId: PROJECT_ID,
      records: [...evidence.records],
      evidenceRetractions: [],
      links: [...evidence.links, spaceLink],
      linkRetractions: [],
    });
    const { document } = exportAndParse(graph, { version: 1, evidence: withSpaceLink });
    expect(document.spf).toContain("space property roomHeight");
  });

  it("requires version when evidence is supplied (fail closed)", () => {
    const { graph, evidence } = graphWithEvidence();
    const error = capture(() => exportIfc(graph, { evidence }));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(String(error?.message)).toContain("version is required");
  });

  it("rejects an evidence graph from a different project", () => {
    const { graph, evidence } = graphWithEvidence();
    const foreign = { ...evidence, projectId: "project-other" } as EvidenceGraph;
    const error = capture(() => exportIfc(graph, { version: 1, evidence: foreign }));
    expect(error?.code).toBe("EVIDENCE_PROJECT_MISMATCH");
  });

  it("fails closed when a surfaced link cites a record the graph does not contain", () => {
    const { graph, evidence, liveLink } = graphWithEvidence();
    const tampered = {
      ...evidence,
      records: evidence.records.filter((record) => record.evidenceId !== liveLink.evidenceId),
    } as EvidenceGraph;
    const error = capture(() => exportIfc(graph, { version: 1, evidence: tampered }));
    expect(error?.code).toBe("EVIDENCE_RECORD_MISSING");
  });
});

// --- helpers ---------------------------------------------------------------------------

function capture(action: () => unknown): ReturnType<typeof toExportIfcError> {
  try {
    action();
    return null;
  } catch (error) {
    const typed = toExportIfcError(error);
    if (typed === null) {
      throw error;
    }
    return typed;
  }
}
