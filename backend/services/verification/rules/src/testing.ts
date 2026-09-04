/**
 * Shared deterministic test fixtures (AISE-021 suites).
 *
 * Small hand-built graphs and mappings exercising every rule
 * kind and gate with minimal content. All constructors are
 * deterministic; the golden room chain lives in golden.test.ts
 * (the real AISE-004→010→011→012→013 composition).
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

export const MODEL = "model-rules-test";
export const PROJECT = "project-rules-test";
export const SPACE = "space-rules-test";

const PRODUCER = modelProvenance("test/fixture-rules-v1", { fixture: "rulesSmallGraph" }, [
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

/** A room-height property assertion (configurable). */
export function roomHeight(overrides: Partial<Parameters<typeof propertyAssertion>[0]> = {}): PropertyAssertion {
  return propertyAssertion({
    key: "roomHeight",
    quantity: { value: 3.0, unit: "meter" },
    status: "INFERRED",
    kind: "estimate",
    method: "test/fixture",
    ...overrides,
  });
}

/** A wall-width property assertion (configurable). */
export function wallWidth(overrides: Partial<Parameters<typeof propertyAssertion>[0]> = {}): PropertyAssertion {
  return propertyAssertion({
    key: "wallWidth",
    quantity: { value: 0.9, unit: "meter" },
    status: "INFERRED",
    kind: "estimate",
    method: "test/fixture",
    ...overrides,
  });
}

/**
 * The small graph: one space (roomHeight) + one WALL object
 * (wallWidth). Configurable per test.
 */
export function smallGraph(options: {
  roomHeight?: PropertyAssertion;
  wallProperties?: readonly PropertyAssertion[];
} = {}): RealityModelGraph {
  const height: PropertyAssertion = options.roomHeight ?? roomHeight();
  return assembleModelGraph({
    modelId: MODEL,
    projectId: PROJECT,
    spaces: [
      makeSpaceNode({
        spaceId: SPACE,
        kind: "ROOM",
        name: "test room",
        frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" },
        properties: [height],
      }),
    ],
    objects: [
      makeRealityObject(MODEL, {
        objectClass: "WALL",
        name: "wall-1",
        properties: options.wallProperties ?? [wallWidth()],
        epistemicState: "INFERRED",
        provenance: PRODUCER,
      }),
    ],
    relationships: [{ type: "CONTAINS", fromId: SPACE, toId: WALL_ID }],
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

/** Subject helpers pinned to the small graph (version-parametric). */
export function subjects(version: number): {
  roomHeight: EvidenceSubject;
  wallWidth: EvidenceSubject;
} {
  return {
    roomHeight: { kind: "space-property", modelId: MODEL, version, spaceId: SPACE, propertyKey: "roomHeight" },
    wallWidth: { kind: "object-property", modelId: MODEL, version, objectId: WALL_ID, propertyKey: "wallWidth" },
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
