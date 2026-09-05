/**
 * CRITICAL golden IFC export test (AISE-018).
 *
 * The full deterministic composition: golden capture points →
 * AISE-010 extraction → AISE-011 ingestion → AISE-018 IFC export,
 * over the canonical golden room WITH the evidence recipe (LIDAR
 * capture supporting every object existence; survey measurement
 * supporting the room height; one retracted human observation).
 * Every pinned number is the output of the REAL chain (no mocks,
 * no shortcuts) — the same discipline the backend golden suites
 * and AISE-017's golden projection pin.
 *
 * Determinism pinning discipline (the AISE-017 golden precedent):
 * the upstream extraction chain is bit-stable PER RUNTIME (the
 * fixture and the committed AISE-022 baseline therefore pin
 * tolerances), so this suite pins the EXPORT's structure exactly
 * (entity counts, statuses, derivations), quantity values by
 * tolerance, and byte-stability against repeat exports of the SAME
 * graph — never raw digests of freshly re-built chains.
 *
 * Pins (REQ-011 acceptance over the canonical golden room):
 * - AC-100: the emitted STEP physical file is schema-valid
 *   (built-in IFC4X3 subset conformance validator) and carries
 *   the complete spatial/product/relationship structure;
 * - AC-102: stable identifiers — deterministic GUIDs (verified
 *   against the documented derivation rule and stable across
 *   repeat exports) with the canonical objectIds on Tag and in
 *   Pset_AISEIdentity;
 * - AC-103: byte-stable deterministic export (repeated exports of
 *   the same graph agree byte-for-byte; structural pins frozen) and
 *   canonical model state unchanged by the export (digest equality,
 *   immutable graph);
 * - evidence/epistemic metadata preserved: LIDAR + survey LIVE
 *   links and the retracted observation surface with honest
 *   statuses; all epistemic states pass through INFERRED (never
 *   upgraded).
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import {
  assembleEvidenceGraph,
  evidenceLink,
  evidenceRecord,
  linkRetraction,
  sha256Hex,
  type EvidenceGraph,
  type RealityModelGraph,
} from "@aise/engineering-model";
import { exportIfc } from "./ifc.js";
import { validateIfcSpf, type ParsedSpfEntity } from "./schema.js";
import { ifcGuidOf } from "./guid.js";

const TARGET = { modelId: "model-golden", projectId: "project-golden", spaceId: "room-golden" };

/** The canonical golden v1 graph (the ingestion chain, exactly as the web store seeds it). */
function goldenGraph(): RealityModelGraph {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  return ingestArchitecturalScene(scene, TARGET).graph;
}

/** A valid 64-hex content hash for evidence pins. */
function hashOf(seed: string): string {
  return sha256Hex(seed);
}

/** The golden evidence recipe: LIDAR coverage + survey height + retracted observation. */
function goldenEvidence(graph: RealityModelGraph): EvidenceGraph {
  const lidar = evidenceRecord({
    kind: "LIDAR",
    source: {
      kind: "capture",
      sessionId: "sess-golden",
      assetId: "asset-golden",
      packageId: "pkg-golden",
      assetType: "DEPTH",
      contentHash: hashOf("golden-lidar-asset"),
      byteSize: 2048,
      acquisition: { capturedAt: "2026-09-01T09:30:00Z", deviceRef: "device-1" },
    },
    recordedBy: "svc:golden-seed",
    recordedAt: "2026-09-01T09:35:00Z",
  });
  const survey = evidenceRecord({
    kind: "MEASUREMENT",
    source: {
      kind: "manual-measurement",
      value: 2.7,
      unit: "meter",
      method: "survey/total-station",
      measuredBy: "surveyor-bob",
      measuredAt: "2026-09-01T09:30:00Z",
    },
    recordedBy: "svc:golden-seed",
    recordedAt: "2026-09-01T09:36:00Z",
  });
  const observation = evidenceRecord({
    kind: "HUMAN_OBSERVATION",
    source: {
      kind: "human-observation",
      observer: "user:alice",
      observedAt: "2026-09-02T10:00:00Z",
      statement: "The door is visibly present",
    },
    recordedBy: "svc:golden-seed",
    recordedAt: "2026-09-02T10:05:00Z",
  });

  const door = graph.objects.find((object) => object.objectClass === "DOOR")!;
  const links = [
    // The LIDAR covers every object existence of the exported version.
    ...graph.objects.map((object) =>
      evidenceLink({
        subject: { kind: "object-existence", modelId: TARGET.modelId, version: 1, objectId: object.objectId },
        evidenceId: lidar.evidenceId,
        linkedBy: "svc:golden-seed",
        linkedAt: "2026-09-03T13:01:00Z",
        method: "golden/seed-link",
      }),
    ),
    // The survey measurement supports the room height assertion.
    evidenceLink({
      subject: {
        kind: "space-property",
        modelId: TARGET.modelId,
        version: 1,
        spaceId: TARGET.spaceId,
        propertyKey: "roomHeight",
      },
      evidenceId: survey.evidenceId,
      linkedBy: "svc:golden-seed",
      linkedAt: "2026-09-03T13:02:00Z",
      method: "golden/seed-link",
    }),
    // A retracted human observation on the door (retractions stand, visibly).
    evidenceLink({
      subject: { kind: "object-existence", modelId: TARGET.modelId, version: 1, objectId: door.objectId },
      evidenceId: observation.evidenceId,
      linkedBy: "svc:golden-seed",
      linkedAt: "2026-09-03T13:03:00Z",
      method: "golden/seed-link",
    }),
  ];
  const retracted = links[links.length - 1]!;
  return assembleEvidenceGraph({
    projectId: TARGET.projectId,
    records: [lidar, survey, observation],
    evidenceRetractions: [],
    links,
    linkRetractions: [
      linkRetraction({
        linkId: retracted.linkId,
        retractedBy: "user:alice",
        retractedAt: "2026-09-03T14:00:00Z",
        reason: "observation was about a different door",
      }),
    ],
  });
}

function entitiesNamed(entities: readonly ParsedSpfEntity[], name: string): ParsedSpfEntity[] {
  return entities.filter((entity) => entity.name === name);
}

describe("golden room IFC export (real chain, with evidence)", () => {
  const graph = goldenGraph();
  const evidence = goldenEvidence(graph);
  const document = exportIfc(graph, { version: 1, evidence });
  const validation = validateIfcSpf(document.spf);
  const entities = validation.ok ? validation.entities : [];

  it("emits a schema-valid IFC 4.3 file (AC-100)", () => {
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      throw new Error(`golden export must validate: ${validation.errors.join("; ")}`);
    }
    expect(validation.schema).toBe("IFC4X3_ADD2");
    expect(document.schema).toBe("IFC4X3_ADD2");
    expect(document.spf.startsWith("ISO-10303-21;\nHEADER;\n")).toBe(true);
    expect(document.spf.endsWith("END-ISO-10303-21;\n")).toBe(true);
  });

  it("carries the complete canonical structure (pinned entity counts)", () => {
    expect(entitiesNamed(entities, "IFCPROJECT")).toHaveLength(1);
    expect(entitiesNamed(entities, "IFCSITE")).toHaveLength(1);
    expect(entitiesNamed(entities, "IFCBUILDING")).toHaveLength(1);
    expect(entitiesNamed(entities, "IFCSTOREY")).toHaveLength(1);
    expect(entitiesNamed(entities, "IFCSPACE")).toHaveLength(1);
    expect(entitiesNamed(entities, "IFCWALL")).toHaveLength(4);
    expect(entitiesNamed(entities, "IFCSLAB")).toHaveLength(1);
    expect(entitiesNamed(entities, "IFCCOVERING")).toHaveLength(1);
    expect(entitiesNamed(entities, "IFCDOOR")).toHaveLength(1);
    expect(entitiesNamed(entities, "IFCWINDOW")).toHaveLength(1);
    expect(entitiesNamed(entities, "IFCOPENINGELEMENT")).toHaveLength(2);
    expect(entitiesNamed(entities, "IFCRELAGGREGATES")).toHaveLength(4);
    expect(entitiesNamed(entities, "IFCRELCONTAINEDINSPATIALSTRUCTURE")).toHaveLength(1);
    expect(entitiesNamed(entities, "IFCRELVOIDSELEMENT")).toHaveLength(2);
    expect(entitiesNamed(entities, "IFCRELFILLSELEMENT")).toHaveLength(2);
    expect(entitiesNamed(entities, "IFCGEOMETRICREPRESENTATIONCONTEXT")).toHaveLength(1);
    // Every object with structured geometry carries one body curve set;
    // door/window openings SHARE the product's representation entity
    // (the same face rectangle — one shape, two referencing products).
    expect(entitiesNamed(entities, "IFCGEOMETRICCURVESET")).toHaveLength(8);
    expect(entitiesNamed(entities, "IFCSHAPEREPRESENTATION")).toHaveLength(8);
    expect(entitiesNamed(entities, "IFCPRODUCTDEFINITIONSHAPE")).toHaveLength(8);
    expect(entitiesNamed(entities, "IFCPOLYLINE")).toHaveLength(8);
    expect(document.counts.objects).toBe(8);
    expect(document.counts.products).toBe(8);
    expect(document.counts.openings).toBe(2);
    expect(document.counts.spaces).toBe(1);
  });

  it("is byte-stable and structurally content-pinned (AC-103 determinism)", () => {
    const repeat = exportIfc(graph, { version: 1, evidence });
    expect(repeat.spf).toBe(document.spf);
    expect(repeat.contentHash).toBe(document.contentHash);
    expect(repeat.entityCount).toBe(document.entityCount);
    // The pinned golden structure (frozen expected values — the
    // AISE-017 golden discipline: the upstream extraction is
    // bit-stable PER RUNTIME, so the golden test pins the export's
    // structure and same-graph byte-stability, never raw digests).
    expect(document.entityCount).toBe(GOLDEN_IFC_ENTITY_COUNT);
    expect(document.counts.objects).toBe(8);
    expect(document.counts.evidenceLinks).toBe(10);
  });

  it("anchors the exact canonical graph digest and evidence digest", () => {
    expect(document.graphDigest).toBe(graph.digest);
    expect(document.spf).toContain(graph.digest);
    expect(document.evidenceDigest).toBe(evidence.digest);
    expect(document.version).toBe(1);
  });

  it("preserves the canonical model state (AC-103: export mutates nothing)", () => {
    const before = { digest: graph.digest, serialized: JSON.stringify(graph) };
    exportIfc(graph, { version: 1, evidence });
    exportIfc(graph);
    expect(graph.digest).toBe(before.digest);
    expect(JSON.stringify(graph)).toBe(before.serialized);
  });

  it("emits stable identifiers: deterministic GUIDs, derivation-rule-verified (AC-102)", () => {
    // Repeat export of the SAME graph: identical GUIDs (byte-stable
    // identity — the same object re-exports to the same GUID).
    const repeat = exportIfc(graph, { version: 1, evidence });
    const walls = document.spf.match(/#(\d+)=IFCWALL\('([^']+)'/g) ?? [];
    const repeatWalls = repeat.spf.match(/#(\d+)=IFCWALL\('([^']+)'/g) ?? [];
    expect(walls).toHaveLength(4);
    expect(repeatWalls).toHaveLength(4);
    for (let index = 0; index < walls.length; index += 1) {
      expect(walls[index]!.split("'")[1]).toBe(repeatWalls[index]!.split("'")[1]);
    }
    // The GUID derivation is the documented seed rule, verified against
    // THIS graph's own object identities (guid, then Tag=objectId).
    const wallGuids = [...document.spf.matchAll(/IFCWALL\('([^']+)',#\d+,'([^']+)'/g)].map(
      (match) => [match[1]!, match[2]!] as const,
    );
    expect(wallGuids).toHaveLength(4);
    expect(new Set(wallGuids.map(([guid]) => guid)).size).toBe(4);
    for (const object of graph.objects.filter((candidate) => candidate.objectClass === "WALL")) {
      const pair = wallGuids.find(([, name]) => name === object.objectId);
      expect(pair).toBeDefined();
      expect(pair![0]).toBe(ifcGuidOf(`${TARGET.modelId}:object:${object.objectId}`));
    }
    // The canonical objectId rides on the Tag attribute AND in the
    // identity pset (the explicit round-trip mapping).
    const wallEntity = entitiesNamed(entities, "IFCWALL")[0]!;
    const tag = wallEntity.args[7]!;
    expect(tag.t === "str" && tag.v.startsWith("ro-")).toBe(true);
    if (tag.t === "str") {
      expect(document.spf).toContain(`'ObjectId',$,'${tag.v}'`);
      expect(document.spf).toContain(
        `'ContentHash',$,'${
          graph.objects.find((object) => object.objectId === tag.v)!.contentHash
        }'`,
      );
    }
  });

  it("projects the golden room walls exactly (SI metre coordinates)", () => {
    // The wall on the x = 0 plane: center (0, 1.5, 1.35) — tolerance
    // pins matching the AISE-017 golden discipline (extraction
    // numerics are runtime-stable, not bit-pinned).
    const wallCenters: Array<[number, number, number]> = [];
    for (const wall of entitiesNamed(entities, "IFCWALL")) {
      const center = centerOfWall(entities, wall);
      wallCenters.push(center);
    }
    expect(wallCenters).toHaveLength(4);
    const x0 = wallCenters.find((center) => Math.abs(center[0]) < 1e-6);
    const x4 = wallCenters.find((center) => Math.abs(center[0] - 4) < 1e-6);
    expect(x0).toBeDefined();
    expect(x4).toBeDefined();
    expect(x0![1]).toBeCloseTo(1.5, 6);
    expect(x0![2]).toBeCloseTo(1.35, 6);
    expect(x4![2]).toBeCloseTo(1.35, 6);
  });

  it("carries the canonical quantities with unit and uncertainty structure (tolerance pins)", () => {
    // The AISE-017 lesson: the extracted door gap is 0.85 m-class
    // (NOT the nominal 0.9 m) and carries its extracted standard
    // uncertainty. The upstream extraction is bit-stable per
    // runtime (the AISE-022 baseline therefore pins tolerances),
    // so numeric pins use tolerances — structural and fidelity
    // pins stay exact.
    const baseQuantityOf = (entityName: string): Map<string, number> => {
      const product = entitiesNamed(entities, entityName)[0]!;
      const rels = entitiesNamed(entities, "IFCRELDEFINESBYPROPERTIES").filter((candidate) => {
        const related = candidate.args[4]!;
        return related.t === "list" && related.v.some((entry) => entry.t === "ref" && entry.id === product.id);
      });
      const elementQuantity = rels.flatMap((rel) => {
        const definition = rel.args[5]!;
        if (definition.t !== "ref") {
          return [];
        }
        const resolved = entities.find((entity) => entity.id === definition.id);
        return resolved !== undefined && resolved.name === "IFCELEMENTQUANTITY" ? [resolved] : [];
      })[0];
      if (elementQuantity === undefined) {
        throw new Error(`missing BaseQuantities element quantity for ${entityName}`);
      }
      const quantities = elementQuantity.args[5]!;
      if (quantities.t !== "list") {
        throw new Error("quantities must be a list");
      }
      const values = new Map<string, number>();
      for (const item of quantities.v) {
        if (item.t !== "ref") {
          continue;
        }
        const quantity = entities.find((entity) => entity.id === item.id)!;
        const name = quantity.args[0]!;
        const value = quantity.args[3]!;
        if (name.t === "str" && value.t === "real") {
          values.set(name.v, value.v);
        }
      }
      return values;
    };
    // Dimension pins use the AISE-010 exact-room ACCEPTANCE
    // (±0.11 m — grid quantization bounds the extraction's dimension
    // error): the door gap is 0.9 m-class, the window 1.2 m-class,
    // the room 4.0 × 3.0 m. Whichever bit-exact variant the runtime
    // extraction produces, these hold — the same discipline as the
    // committed AISE-022 baseline.
    const acceptance = (value: number, expected: number): void => {
      expect(Math.abs(value - expected)).toBeLessThanOrEqual(0.11);
    };
    acceptance(baseQuantityOf("IFCDOOR").get("Width")!, 0.9);
    acceptance(baseQuantityOf("IFCWINDOW").get("Width")!, 1.2);
    acceptance(baseQuantityOf("IFCSLAB").get("Width")!, 4);
    acceptance(baseQuantityOf("IFCSLAB").get("Height")!, 3);
    // Fidelity structure: quantity entities and canonical units are
    // structural (unit fidelity is pinned exactly in the unit tests
    // over deterministic hand-built fixtures).
    expect(document.spf).toContain(" square_meter");
    expect(entitiesNamed(entities, "IFCQUANTITYAREA")).toHaveLength(8);
    expect(entitiesNamed(entities, "IFCQUANTITYLENGTH").length).toBeGreaterThan(12);
  });

  it("passes epistemic states through without upgrade (all golden objects are INFERRED)", () => {
    const epistemicLines = document.spf
      .split("\n")
      .filter((line) => line.includes("(epistemic INFERRED)"));
    expect(epistemicLines).toHaveLength(8);
    expect(document.spf.includes("CONFIRMED |")).toBe(false);
    expect(document.spf.includes("'EpistemicState',$,'CONFIRMED'")).toBe(false);
    expect(document.spf.includes("'EpistemicState',$,'INFERRED'")).toBe(true);
  });

  it("surfaces the golden evidence recipe with honest statuses (live AND retracted)", () => {
    const statusLive = document.spf.split("\n").filter((line) => line.includes("status LIVE"));
    const statusRetracted = document.spf
      .split("\n")
      .filter((line) => line.includes("status LINK_RETRACTED"));
    // 8 object-existence links (LIDAR) + 1 roomHeight link (survey) live.
    expect(statusLive).toHaveLength(9);
    expect(statusRetracted).toHaveLength(1);
    // The LIDAR capture source pin is fully traceable (the record's
    // canonical content hash, not the asset hash).
    const lidarRecord = evidence.records.find((record) => record.kind === "LIDAR")!;
    const lidarLine = statusLive.find((line) => line.includes("LIDAR"))!;
    expect(lidarLine).toContain("capture sess-golden/asset-golden (DEPTH, 2048 bytes)");
    expect(lidarLine).toContain(`hash ${lidarRecord.contentHash}`);
    // The survey measurement supports the room height assertion.
    const surveyLine = statusLive.find((line) => line.includes("MEASUREMENT"))!;
    expect(surveyLine).toContain("2.7 meter by surveyor-bob via survey/total-station");
    expect(surveyLine).toContain("space property roomHeight");
    // The retracted observation stays visible as retracted.
    expect(statusRetracted[0]!).toContain("HUMAN_OBSERVATION");
    expect(statusRetracted[0]!).toContain("The door is visibly present");
    expect(document.counts.evidenceLinks).toBe(10);
  });

  it("carries the space property assertion and the explicit limitations", () => {
    expect(document.spf).toContain("'roomHeight'");
    // The room height assertion: INFERRED | 2.7 m-class value + unit,
    // estimate + method — prefix-pinned (extraction numerics are
    // runtime-stable, tolerance-pinned per the AISE-022 discipline).
    const roomHeight = entities.find((entity) => {
      if (entity.name !== "IFCPROPERTYSINGLEVALUE") {
        return false;
      }
      const name = entity.args[0]!;
      return name.t === "str" && name.v === "roomHeight";
    });
    expect(roomHeight).toBeDefined();
    const roomHeightValue = roomHeight!.args[2]!;
    if (roomHeightValue.t === "str") {
      expect(roomHeightValue.v.startsWith("INFERRED | 2.7")).toBe(true);
      expect(roomHeightValue.v).toContain("meter");
      expect(roomHeightValue.v).toContain("estimate");
      expect(roomHeightValue.v).toContain("method");
    }
    expect(document.limitations.length).toBeGreaterThanOrEqual(10);
  });
});

/** Resolves one wall product's placement center (SI metre, storey-relative). */
function centerOfWall(
  entities: readonly ParsedSpfEntity[],
  wall: ParsedSpfEntity,
): [number, number, number] {
  const placementArg = wall.args[5]!;
  if (placementArg.t !== "ref") {
    throw new Error("wall placement must be a reference");
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
  return [values[0]!, values[1]!, values[2]!];
}

// The frozen golden structure of the canonical export (pinned by
// the first green run; every change that alters the export's
// STRUCTURE must update these pins deliberately — that is the
// regression contract). Numeric values are pinned by tolerance
// (the upstream extraction is bit-stable per runtime — the same
// discipline as the AISE-017 golden projection and the AISE-022
// committed baseline).
const GOLDEN_IFC_ENTITY_COUNT = 386;
