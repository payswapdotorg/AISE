/**
 * Shared deterministic test fixtures (AISE-013 suites).
 *
 * Small hand-built graphs and mappings exercising every
 * readiness dimension with minimal content. All constructors
 * are deterministic; the golden room chain lives in
 * golden.test.ts (the real AISE-004→013 composition).
 */
import {
  assembleEvidenceGraph,
  assembleModelGraph,
  evidenceLink,
  evidenceRecord,
  makeRealityObject,
  makeSpaceNode,
  modelProvenance,
  propertyAssertion,
  type EvidenceGraph,
  type EvidenceSubject,
  type PropertyAssertion,
  type RealityModelGraph,
} from "@aise/engineering-model";

export const MODEL = "model-test";
export const PROJECT = "project-test";
export const SPACE = "space-test";
export const WALL = "obj-wall-0001";
export const DOOR = "obj-door-0001"; // (placeholder — object ids are lineage-derived; use WALL_ID)

const PRODUCER = modelProvenance("test/fixture-v1", { fixture: "smallGraph" }, [
  {
    kind: "object",
    serviceId: "aise.semantics",
    method: "scene/assembly-v1",
    objectId: "upstream-wall-0001",
    contentHash: "a".repeat(64),
    epistemic: "INFERRED" as const,
  },
]);

/** The deterministic WALL object (identity derived from the pinned producer). */
const WALL_OBJECT = makeRealityObject(MODEL, {
  objectClass: "WALL",
  name: "wall-1",
  epistemicState: "INFERRED",
  provenance: PRODUCER,
});

/** The wall's derived identity (stable — identity is lineage). */
export const WALL_ID = WALL_OBJECT.objectId;

/** A wall-height property assertion (configurable). */
export function wallHeight(overrides: Partial<Parameters<typeof propertyAssertion>[0]> = {}): PropertyAssertion {
  return propertyAssertion({
    key: "wallHeight",
    quantity: { value: 2.4, unit: "meter" },
    status: "INFERRED",
    kind: "estimate",
    method: "test/fixture",
    ...overrides,
  });
}

/**
 * The small graph: one space (roomHeight) + one WALL object
 * (wallHeight). 2 existence-free property assertions + 1 object
 * existence = 3 assertion subjects.
 */
export function smallGraph(options: {
  roomHeight?: PropertyAssertion;
  wallProperties?: readonly PropertyAssertion[];
  extraObjects?: readonly ReturnType<typeof makeRealityObject>[];
  spaceEpistemicProperties?: readonly PropertyAssertion[];
} = {}): RealityModelGraph {
  const roomHeight: PropertyAssertion =
    options.roomHeight ??
    propertyAssertion({
      key: "roomHeight",
      quantity: { value: 3.0, unit: "meter" },
      status: "INFERRED",
      kind: "estimate",
      method: "test/fixture",
    });
  return assembleModelGraph({
    modelId: MODEL,
    projectId: PROJECT,
    spaces: [
      makeSpaceNode({
        spaceId: SPACE,
        kind: "ROOM",
        name: "test room",
        frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" },
        properties: [roomHeight, ...(options.spaceEpistemicProperties ?? [])],
      }),
    ],
    objects: [
      makeRealityObject(MODEL, {
        objectClass: "WALL",
        name: "wall-1",
        properties: options.wallProperties ?? [wallHeight()],
        epistemicState: "INFERRED",
        provenance: PRODUCER,
      }),
      ...(options.extraObjects ?? []),
    ],
    relationships: [
      { type: "CONTAINS", fromId: SPACE, toId: WALL_ID },
      ...(options.extraObjects ?? []).map((object) => ({
        type: "CONTAINS" as const,
        fromId: SPACE,
        toId: object.objectId,
      })),
    ],
  });
}

/** A manual-measurement evidence record (deterministic). */
export function measurementEvidence(value: number, unit = "m"): ReturnType<typeof evidenceRecord> {
  return evidenceRecord({
    kind: "MEASUREMENT",
    source: {
      kind: "manual-measurement",
      value,
      unit,
      method: "test/tape-v1",
      measuredBy: "user:test-surveyor",
      measuredAt: "2026-09-01T10:00:00Z",
    },
    recordedBy: "svc:test",
    recordedAt: "2026-09-01T11:00:00Z",
  });
}

/** A LIDAR-style capture evidence record (deterministic). */
export function lidarEvidence(): ReturnType<typeof evidenceRecord> {
  return evidenceRecord({
    kind: "LIDAR",
    source: {
      kind: "capture",
      sessionId: "session-test-0001",
      assetId: "asset-test-0001",
      packageId: "package-test-001",
      assetType: "DEPTH",
      contentHash: "b".repeat(64),
      byteSize: 4096,
      acquisition: { capturedAt: "2026-09-01T09:00:00Z" },
    },
    recordedBy: "svc:test",
    recordedAt: "2026-09-01T09:30:00Z",
  });
}

/** Subject helpers pinned to the small graph (version-parametric). */
export function subjects(version: number): {
  wallExistence: EvidenceSubject;
  roomHeight: EvidenceSubject;
  wallHeight: EvidenceSubject;
} {
  return {
    wallExistence: { kind: "object-existence", modelId: MODEL, version, objectId: WALL_ID },
    roomHeight: { kind: "space-property", modelId: MODEL, version, spaceId: SPACE, propertyKey: "roomHeight" },
    wallHeight: { kind: "object-property", modelId: MODEL, version, objectId: WALL_ID, propertyKey: "wallHeight" },
  };
}

/** Builds a mapping with the given live links (deterministic). */
export function mappingWith(
  records: readonly ReturnType<typeof evidenceRecord>[],
  links: readonly { subject: EvidenceSubject; evidenceId: string }[],
): EvidenceGraph {
  return assembleEvidenceGraph({
    projectId: PROJECT,
    records: [...records],
    evidenceRetractions: [],
    links: links.map((link, index) =>
      evidenceLink({
        subject: link.subject,
        evidenceId: link.evidenceId,
        linkedBy: "svc:test-linker",
        linkedAt: `2026-09-02T10:${String(index).padStart(2, "0")}:00Z`,
        method: "test/link-v1",
      }),
    ),
    linkRetractions: [],
  });
}

/** The empty mapping (projects with no evidence). */
export function emptyTestMapping(): EvidenceGraph {
  return assembleEvidenceGraph({
    projectId: PROJECT,
    records: [],
    evidenceRetractions: [],
    links: [],
    linkRetractions: [],
  });
}
