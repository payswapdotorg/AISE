/**
 * AISE-014 test fixtures (test-only module; NOT exported from
 * the package index).
 *
 * Two fixture strategies, mirroring the AISE-012/013 discipline:
 *
 * 1. **Constructor-built graphs** — valid content through the
 *    model's own public constructors (`makeSpaceNode`,
 *    `makeRealityObject`, `assembleModelGraph`). Used for
 *    findings that are semantically contradictory but
 *    structurally constructible (the honest gap QA exists to
 *    cover).
 *
 * 2. **Hand-built frozen literals** — JSON-round-tripped drafts
 *    with a surgical mutation plus a re-derived graph digest.
 *    These bypass constructor-only rules (rank ordering,
 *    geometry constructors) while still passing the whole-graph
 *    boundary validator — exactly the tampering class a
 *    committed-but-contradictory store record represents.
 */
import {
  assembleModelGraph,
  graphContentDigest,
  makeRealityObject,
  makeSpaceNode,
  modelProvenance,
  propertyAssertion,
  type EvidenceGraph,
  type EvidenceSubject,
  type ModelProvenance,
  type PropertyAssertion,
  type RealityModelGraph,
  type RealityObjectInput,
  type StructuredPlanarGeometry,
} from "@aise/engineering-model";
import {
  assembleEvidenceGraph,
  evidenceLink,
  evidenceRecord,
  evidenceSubject,
} from "@aise/engineering-model";

export const MODEL = "model-qa-test";
export const PROJECT = "project-qa-test";
export const SPACE = "room-qa";

const UP = { x: 0, y: 0, z: 1 };
const QUALITY = { pointCount: 100, residualRms: 0.001, residualMaxAbs: 0.005 };

/** Deterministic, distinct content hashes for provenance inputs. */
export const HASHES = Object.freeze({
  floor: "1".repeat(64),
  ceiling: "2".repeat(64),
  wall: "3".repeat(64),
  door: "4".repeat(64),
  window: "5".repeat(64),
});

export function provenanceFor(name: string, contentHash: string): ModelProvenance {
  return modelProvenance(`qa/test/${name}`, { fixture: name }, [
    { kind: "object", serviceId: "aise.semantics", method: "qa/test-source", objectId: `src-${name}`, contentHash, epistemic: "INFERRED" },
  ]);
}

/** A floor/ceiling plane frame at the given height. */
function horizontalFrame(z: number, up: boolean) {
  return {
    planePoint: { x: 0, y: 0, z },
    normal: { x: 0, y: 0, z: up ? 1 : -1 },
    axisU: { x: 1, y: 0, z: 0 },
    axisV: up ? { x: 0, y: 1, z: 0 } : { x: 0, y: -1, z: 0 },
  };
}

/** A wall plane frame on the y=WALL_Y plane (normal +y). */
const WALL_Y = 3;
function wallFrame(y: number) {
  return {
    planePoint: { x: 0, y, z: 1.35 },
    normal: { x: 0, y: 1, z: 0 },
    axisU: { x: -1, y: 0, z: 0 },
    axisV: { x: 0, y: 0, z: 1 },
  };
}

function rect(uMin: number, uMax: number, vMin: number, vMax: number) {
  const center = { x: (uMin + uMax) / 2, y: WALL_Y, z: (vMin + vMax) / 2 };
  return {
    uMin,
    uMax,
    vMin,
    vMax,
    center,
    corners: [
      { x: uMin, y: WALL_Y, z: vMin },
      { x: uMax, y: WALL_Y, z: vMin },
      { x: uMax, y: WALL_Y, z: vMax },
      { x: uMin, y: WALL_Y, z: vMax },
    ],
  };
}

/** A horizontal rectangle at height z (floor z=0, ceiling z=2.7). */
function rectHorizontal(z: number) {
  const center = { x: 0, y: 0, z };
  return {
    uMin: -2,
    uMax: 2,
    vMin: -1.5,
    vMax: 1.5,
    center,
    corners: [
      { x: -2, y: -1.5, z },
      { x: 2, y: -1.5, z },
      { x: 2, y: 1.5, z },
      { x: -2, y: 1.5, z },
    ],
  };
}

function quantity(value: number, unit: "meter" | "square_meter") {
  return { value, unit };
}

/** Standard fixture geometry for the synthetic QA room. */
export const FIXTURE_GEOMETRY = {
  floor: {
    shape: "planar-rectangle" as const,
    frame: horizontalFrame(0, true),
    rectangle: rectHorizontal(0),
    width: quantity(4, "meter"),
    height: quantity(3, "meter"),
    area: quantity(12, "square_meter"),
    elevation: quantity(0, "meter"),
    quality: QUALITY,
  } satisfies StructuredPlanarGeometry,
  ceiling: {
    shape: "planar-rectangle" as const,
    frame: horizontalFrame(2.7, false),
    rectangle: rectHorizontal(2.7),
    width: quantity(4, "meter"),
    height: quantity(3, "meter"),
    area: quantity(12, "square_meter"),
    elevation: quantity(2.7, "meter"),
    quality: QUALITY,
  } satisfies StructuredPlanarGeometry,
  wall: {
    shape: "planar-rectangle" as const,
    frame: wallFrame(WALL_Y),
    rectangle: rect(-2, 2, -1.35, 1.35),
    width: quantity(4, "meter"),
    height: quantity(2.7, "meter"),
    area: quantity(10.8, "square_meter"),
    quality: QUALITY,
  } satisfies StructuredPlanarGeometry,
  door: {
    shape: "planar-rectangle" as const,
    frame: wallFrame(WALL_Y),
    rectangle: rect(-0.5, 0.5, -1.35, 0.65),
    width: quantity(1, "meter"),
    height: quantity(2, "meter"),
    area: quantity(2, "square_meter"),
    headHeight: quantity(2, "meter"),
    quality: QUALITY,
  } satisfies StructuredPlanarGeometry,
  window: {
    shape: "planar-rectangle" as const,
    frame: wallFrame(WALL_Y),
    rectangle: rect(-1.5, -0.5, -0.35, 0.65),
    width: quantity(1, "meter"),
    height: quantity(1, "meter"),
    area: quantity(1, "square_meter"),
    sillHeight: quantity(1, "meter"),
    headHeight: quantity(2, "meter"),
    quality: QUALITY,
  } satisfies StructuredPlanarGeometry,
};

export interface RoomOverrides {
  readonly floor?: Partial<StructuredPlanarGeometry>;
  readonly ceiling?: Partial<StructuredPlanarGeometry>;
  readonly wall?: Partial<StructuredPlanarGeometry>;
  readonly door?: Partial<StructuredPlanarGeometry>;
  readonly window?: Partial<StructuredPlanarGeometry>;
  readonly floorProperties?: readonly PropertyAssertion[];
  readonly objectEpistemic?: "OBSERVED" | "INFERRED" | "CONFIRMED" | "PROPOSED";
  readonly objectProperties?: readonly PropertyAssertion[];
}

function merged(base: StructuredPlanarGeometry, overrides?: Partial<StructuredPlanarGeometry>): StructuredPlanarGeometry {
  return overrides === undefined ? base : ({ ...base, ...overrides } as StructuredPlanarGeometry);
}

/** Builds the synthetic QA room graph through public constructors. */
export function smallRoomGraph(overrides: RoomOverrides = {}): RealityModelGraph {
  const objectProperties = overrides.objectProperties;
  const floorProperties = overrides.floorProperties ?? objectProperties;

  const input = (
    objectClass: "FLOOR" | "CEILING" | "WALL" | "DOOR" | "WINDOW",
    structuredGeometry: StructuredPlanarGeometry,
    name: string,
    hash: string,
    properties?: readonly PropertyAssertion[],
  ): RealityObjectInput => ({
    objectClass,
    structuredGeometry,
    ...(properties !== undefined ? { properties } : {}),
    epistemicState: overrides.objectEpistemic ?? "INFERRED",
    provenance: provenanceFor(name, hash),
  });

  const inputs: readonly RealityObjectInput[] = [
    input("FLOOR", merged(FIXTURE_GEOMETRY.floor, overrides.floor), "floor", HASHES.floor, floorProperties),
    input("CEILING", merged(FIXTURE_GEOMETRY.ceiling, overrides.ceiling), "ceiling", HASHES.ceiling, objectProperties),
    input("WALL", merged(FIXTURE_GEOMETRY.wall, overrides.wall), "wall", HASHES.wall, objectProperties),
    input("DOOR", merged(FIXTURE_GEOMETRY.door, overrides.door), "door", HASHES.door, objectProperties),
    input("WINDOW", merged(FIXTURE_GEOMETRY.window, overrides.window), "window", HASHES.window, objectProperties),
  ];

  // Deterministic identities (the same derivation the graph itself
  // applies; the throwaway builds exist only to obtain objectIds for
  // relationship endpoints).
  const built = inputs.map((objectInput) => makeRealityObject(MODEL, objectInput));
  const door = built[3]!;
  const wall = built[2]!;

  const space = makeSpaceNode({
    spaceId: SPACE,
    kind: "ROOM",
    frame: { up: UP, unit: "meter" },
  });

  const relationships = [
    ...built.map((object) => ({ type: "CONTAINS" as const, fromId: SPACE, toId: object.objectId })),
    { type: "OPENING_IN" as const, fromId: door.objectId, toId: wall.objectId },
    { type: "OPENING_IN" as const, fromId: built[4]!.objectId, toId: wall.objectId },
  ];

  return assembleModelGraph({
    modelId: MODEL,
    projectId: PROJECT,
    spaces: [space],
    objects: inputs,
    relationships,
  });
}

/** The object ids of the fixture room, by class. */
export function roomObjectIds(graph: RealityModelGraph): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const object of graph.objects) {
    ids[object.objectClass.toLowerCase()] = object.objectId;
  }
  return ids;
}

/**
 * Hand-builds a mutated frozen graph: JSON-round-trip the base,
 * apply the mutation, re-derive the digest, deep-freeze. Passes
 * the whole-graph validator exactly when the mutation does not
 * violate ITS rules — constructor-only rules are bypassed.
 */
export function handBuiltGraph(
  base: RealityModelGraph,
  mutate: (draft: {
    modelId: string;
    projectId: string;
    spaces: Array<Record<string, unknown>>;
    objects: Array<Record<string, unknown>>;
    relationships: Array<Record<string, unknown>>;
  }) => void,
  options: { readonly recomputeDigest?: boolean } = {},
): RealityModelGraph {
  const draft = JSON.parse(JSON.stringify(base)) as {
    modelId: string;
    projectId: string;
    spaces: Array<Record<string, unknown>>;
    objects: Array<Record<string, unknown>>;
    relationships: Array<Record<string, unknown>>;
  };
  mutate(draft);
  const spaces = draft.spaces as unknown as Parameters<typeof graphContentDigest>[2];
  const objects = draft.objects as unknown as Parameters<typeof graphContentDigest>[3];
  const relationships = draft.relationships as unknown as Parameters<typeof graphContentDigest>[4];
  const digest =
    options.recomputeDigest === false
      ? base.digest // the caller wants a digest/content mismatch (tamper tests)
      : graphContentDigest(draft.modelId, draft.projectId, spaces, objects, relationships);
  const graph = { ...draft, digest } as unknown as RealityModelGraph;
  return deepFreeze(graph);
}

/** Deep-freezes a JSON-shaped structure (hand-built graphs only). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

// --- Evidence fixture ---------------------------------------------------------------

const SURVEY_SOURCE = {
  kind: "manual-measurement" as const,
  value: 2.7,
  unit: "m" as const,
  method: "survey/total-station",
  measuredBy: "surveyor-bob",
  measuredAt: "2026-09-03T14:00:00Z",
};

export const SURVEY_EVIDENCE_ID = evidenceRecord({
  kind: "MEASUREMENT",
  source: SURVEY_SOURCE,
  recordedBy: "svc:evidence-ingest",
  recordedAt: "2026-09-04T10:00:00Z",
}).evidenceId;

export const OTHER_EVIDENCE_ID = evidenceRecord({
  kind: "HUMAN_OBSERVATION",
  source: {
    kind: "human-observation",
    observer: "user:alice",
    observedAt: "2026-09-03T14:30:00Z",
    statement: "the room height matches the survey target",
  },
  recordedBy: "svc:evidence-ingest",
  recordedAt: "2026-09-04T10:01:00Z",
}).evidenceId;

export const EVIDENCE_RECORDS = Object.freeze([
  evidenceRecord({
    kind: "MEASUREMENT",
    source: SURVEY_SOURCE,
    recordedBy: "svc:evidence-ingest",
    recordedAt: "2026-09-04T10:00:00Z",
  }),
  evidenceRecord({
    kind: "HUMAN_OBSERVATION",
    source: {
      kind: "human-observation",
      observer: "user:alice",
      observedAt: "2026-09-03T14:30:00Z",
      statement: "the room height matches the survey target",
    },
    recordedBy: "svc:evidence-ingest",
    recordedAt: "2026-09-04T10:01:00Z",
  }),
]);

export function spacePropertySubject(propertyKey: string): EvidenceSubject {
  return evidenceSubject({
    kind: "space-property",
    modelId: MODEL,
    version: 1,
    spaceId: SPACE,
    propertyKey,
  });
}

export function objectExistenceSubject(objectId: string): EvidenceSubject {
  return evidenceSubject({
    kind: "object-existence",
    modelId: MODEL,
    version: 1,
    objectId,
  });
}

/** A minimal valid evidence mapping over the fixture records. */
export function smallMapping(options: { readonly linkRoomHeight?: boolean; readonly retractRoomHeightLink?: boolean } = {}): EvidenceGraph {
  const links = [];
  if (options.linkRoomHeight === true) {
    links.push(
      evidenceLink({
        subject: spacePropertySubject("roomHeight"),
        evidenceId: SURVEY_EVIDENCE_ID,
        linkedBy: "svc:review-linker",
        linkedAt: "2026-09-06T11:00:00Z",
      }),
    );
  }
  const linkRetractions =
    options.retractRoomHeightLink === true
      ? [
          {
            linkId: evidenceLink({
              subject: spacePropertySubject("roomHeight"),
              evidenceId: SURVEY_EVIDENCE_ID,
              linkedBy: "svc:review-linker",
              linkedAt: "2026-09-06T11:00:00Z",
            }).linkId,
            retractedBy: "svc:review-linker",
            retractedAt: "2026-09-06T12:00:00Z",
            reason: "review/retract-superseded",
          },
        ]
      : [];
  return assembleEvidenceGraph({
    projectId: PROJECT,
    records: [...EVIDENCE_RECORDS],
    evidenceRetractions: [],
    links,
    linkRetractions,
  });
}

/** A confirmed roomHeight assertion citing the survey evidence. */
export function confirmedRoomHeight(value = 2.7): PropertyAssertion {
  return propertyAssertion({
    key: "roomHeight",
    quantity: { value, unit: "meter", uncertainty: { kind: "standard", u: 0.005 } },
    status: "CONFIRMED",
    kind: "measurement",
    evidenceRefs: [SURVEY_EVIDENCE_ID],
    verifiedBy: "user:site-engineer",
    verifiedAt: "2026-09-06T10:00:00Z",
  });
}
