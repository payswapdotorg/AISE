/**
 * AISE-031 test fixtures (test-only module; NOT exported from
 * the package index). Controlled, deterministic graphs and
 * version records for exercising the comparison surface.
 */
import {
  assembleModelGraph,
  graphContentDigest,
  makeSpaceNode,
  modelProvenance,
  propertyAssertion,
  makeRealityObject,
  evidenceLink,
  evidenceRecord,
  linkRetraction,
  assembleEvidenceGraph,
  deriveLinkId,
  type EvidenceGraph,
  type EvidenceSubject,
  type ModelProvenance,
  type PropertyAssertion,
  type RealityModelGraph,
  type RealityObjectInput,
  type StructuredPlanarGeometryInput,
} from "@aise/engineering-model";

export const MODEL = "history-test";
export const PROJECT = "project-history-test";
export const SPACE = "room-history";

export const HASHES = Object.freeze({
  wall: "a".repeat(64),
  door: "b".repeat(64),
  window: "c".repeat(64),
  scan: "d".repeat(64),
  survey: "e".repeat(64),
});

export function provenanceFor(name: string, contentHash: string): ModelProvenance {
  return modelProvenance(`history/test/${name}`, { fixture: name }, [
    {
      kind: "object",
      serviceId: "aise.semantics",
      method: "history/test-source",
      objectId: `src-${name}`,
      contentHash,
      epistemic: "INFERRED",
    },
  ]);
}

/** A wall frame on the y=3 plane (normal +y). */
function wallFrame(y = 3) {
  return {
    planePoint: { x: 0, y, z: 1.35 },
    normal: { x: 0, y: 1, z: 0 },
    axisU: { x: -1, y: 0, z: 0 },
    axisV: { x: 0, y: 0, z: 1 },
  };
}

function wallRect(uMin: number, uMax: number, vMin: number, vMax: number) {
  const center = { x: (uMin + uMax) / 2, y: 3, z: (vMin + vMax) / 2 };
  return {
    uMin,
    uMax,
    vMin,
    vMax,
    center,
    corners: [
      { x: uMin, y: 3, z: vMin },
      { x: uMax, y: 3, z: vMin },
      { x: uMax, y: 3, z: vMax },
      { x: uMin, y: 3, z: vMax },
    ],
  };
}

/** Structured wall geometry with controllable dimensions/uncertainty. */
export function wallGeometry(overrides: {
  width?: number;
  height?: number;
  area?: number;
  widthUncertainty?: { kind: "standard"; u: number };
  pointCount?: number;
  uMin?: number;
  uMax?: number;
  vMin?: number;
  vMax?: number;
  planeY?: number;
}): StructuredPlanarGeometryInput {
  const width = overrides.width ?? 4;
  const height = overrides.height ?? 2.7;
  const uMin = overrides.uMin ?? -2;
  const uMax = overrides.uMax ?? 2;
  return {
    shape: "planar-rectangle",
    frame: wallFrame(overrides.planeY ?? 3),
    rectangle: wallRect(uMin, uMax, overrides.vMin ?? 0, overrides.vMax ?? 2.7),
    width: {
      value: width,
      unit: "meter",
      ...(overrides.widthUncertainty !== undefined ? { uncertainty: overrides.widthUncertainty } : {}),
    },
    height: { value: height, unit: "meter" },
    area: { value: overrides.area ?? width * height, unit: "square_meter" },
    quality: {
      pointCount: overrides.pointCount ?? 1200,
      residualRms: 0.0031,
      residualMaxAbs: 0.012,
    },
  } as StructuredPlanarGeometryInput;
}

export interface WallOverrides {
  readonly epistemicState?: "OBSERVED" | "INFERRED" | "CONFIRMED" | "PROPOSED";
  readonly name?: string;
  readonly objectClass?: "WALL" | "DOOR" | "WINDOW" | "FLOOR" | "CEILING";
  readonly geometry?: StructuredPlanarGeometryInput;
  readonly assetRefs?: readonly { kind: "point-cloud"; contentHash: string; pointCount: number; epistemic: "INFERRED" }[];
  readonly properties?: readonly PropertyAssertion[];
  readonly provenanceName?: string;
}

/** One controllable wall object input. */
export function wallInput(overrides: WallOverrides = {}): RealityObjectInput {
  const input: RealityObjectInput = {
    objectClass: overrides.objectClass ?? "WALL",
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    ...(overrides.geometry !== undefined ? { structuredGeometry: overrides.geometry } : {}),
    ...(overrides.assetRefs !== undefined ? { assetRefs: overrides.assetRefs } : {}),
    ...(overrides.properties !== undefined ? { properties: overrides.properties } : {}),
    epistemicState: overrides.epistemicState ?? "INFERRED",
    provenance: provenanceFor(overrides.provenanceName ?? "wall", HASHES.wall),
  };
  return input;
}

/** Height measurement property with controllable value/uncertainty/status. */
export function heightProperty(overrides: {
  value?: number;
  unit?: "meter";
  uncertainty?: { kind: "standard"; u: number };
  status?: "OBSERVED" | "INFERRED" | "CONFIRMED" | "PROPOSED";
  confidence?: number;
  kind?: "measurement" | "estimate";
  evidenceRefs?: readonly string[];
}): PropertyAssertion {
  const status = overrides.status ?? "INFERRED";
  // Lock §3: only directly-supported states (OBSERVED/CONFIRMED) may
  // carry kind "measurement"; INFERRED/PROPOSED values are estimates.
  const kind = overrides.kind ?? (status === "OBSERVED" || status === "CONFIRMED" ? "measurement" : "estimate");
  // CONFIRMED assertions require evidence refs + verifier + instant.
  const confirmed = status === "CONFIRMED";
  return propertyAssertion({
    key: "roomHeight",
    quantity: {
      value: overrides.value ?? 2.7,
      unit: overrides.unit ?? "meter",
      ...(overrides.uncertainty !== undefined ? { uncertainty: overrides.uncertainty } : {}),
    },
    status,
    kind,
    ...(overrides.confidence !== undefined ? { confidence: overrides.confidence } : {}),
    ...(overrides.evidenceRefs !== undefined
      ? { evidenceRefs: overrides.evidenceRefs }
      : confirmed
        ? { evidenceRefs: ["ev-confirm00000001"] }
        : {}),
    ...(confirmed ? { verifiedBy: "user:site-engineer", verifiedAt: "2026-09-06T10:00:00Z" } : {}),
  });
}

/** Presence-style (valueless) assertion. */
export function presenceProperty(
  key: string,
  presence: "UNKNOWN" | "NOT_OBSERVED" | "OCCLUDED" | "CONFIRMED_ABSENT",
): PropertyAssertion {
  return propertyAssertion({ key, presence, status: "INFERRED" });
}

export interface GraphOverrides {
  readonly modelId?: string;
  readonly objects?: readonly RealityObjectInput[];
  readonly spaceProperties?: readonly PropertyAssertion[];
  readonly relationships?: readonly { type: "CONTAINS" | "OPENING_IN"; fromId: string; toId: string }[];
}

/** A controlled small room graph (1 space + objects + relationships). */
export function roomGraph(overrides: GraphOverrides = {}): RealityModelGraph {
  const modelId = overrides.modelId ?? MODEL;
  const objects = overrides.objects ?? [wallInput()];
  // Referential integrity: every object must be CONTAINED by the space.
  // Object ids are deterministic (lineage-pinned), so they can be derived
  // up-front via makeRealityObject.
  const objectIds = objects.map((input) => makeRealityObject(modelId, input).objectId);
  const containment = objectIds.map((objectId) => ({
    type: "CONTAINS" as const,
    fromId: SPACE,
    toId: objectId,
  }));
  const relationships = overrides.relationships ?? containment;
  return assembleModelGraph({
    modelId,
    projectId: PROJECT,
    spaces: [
      makeSpaceNode({
        spaceId: SPACE,
        kind: "ROOM",
        name: "test room",
        frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" },
        ...(overrides.spaceProperties !== undefined ? { properties: overrides.spaceProperties } : {}),
      }),
    ],
    objects,
    relationships,
  });
}

/** Builds a version record for a graph (test store substitute — deterministic). */
export function versionRecord(graph: RealityModelGraph, version: number, committedAt: string): {
  record: { modelId: string; version: number; parentVersion?: number; digest: string; committedAt: string; spaceCount: number; objectCount: number; relationshipCount: number };
  graph: RealityModelGraph;
} {
  const record = {
    modelId: graph.modelId,
    version,
    ...(version > 1 ? { parentVersion: version - 1 } : {}),
    digest: graphContentDigest(graph.modelId, graph.projectId, graph.spaces, graph.objects, graph.relationships),
    committedAt,
    spaceCount: graph.spaces.length,
    objectCount: graph.objects.length,
    relationshipCount: graph.relationships.length,
  };
  return Object.freeze({ record, graph });
}

/** Deep clone for tamper tests (structuredClone keeps frozen-ness off). */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// --- Evidence fixtures -----------------------------------------------------

export const SURVEY_EVIDENCE_ID = evidenceRecord({
  kind: "MEASUREMENT",
  source: {
    kind: "manual-measurement",
    value: 2.7,
    unit: "m",
    method: "survey/total-station",
    measuredBy: "surveyor-bob",
    measuredAt: "2026-09-03T14:00:00Z",
  },
  recordedBy: "svc:evidence-ingest",
  recordedAt: "2026-09-04T10:00:00Z",
}).evidenceId;

export const SCAN_EVIDENCE_ID = evidenceRecord({
  kind: "LIDAR",
  source: {
    kind: "capture",
    sessionId: "session-history001",
    assetId: "asset-history0001",
    packageId: "package-history001",
    assetType: "DEPTH",
    contentHash: "d".repeat(64),
    byteSize: 2048,
    acquisition: { capturedAt: "2026-09-01T09:30:00Z" },
  },
  recordedBy: "svc:evidence-ingest",
  recordedAt: "2026-09-04T10:00:00Z",
}).evidenceId;

export const EVIDENCE_RECORDS = Object.freeze([
  evidenceRecord({
    kind: "MEASUREMENT",
    source: {
      kind: "manual-measurement",
      value: 2.7,
      unit: "m",
      method: "survey/total-station",
      measuredBy: "surveyor-bob",
      measuredAt: "2026-09-03T14:00:00Z",
    },
    recordedBy: "svc:evidence-ingest",
    recordedAt: "2026-09-04T10:00:00Z",
  }),
  evidenceRecord({
    kind: "LIDAR",
    source: {
      kind: "capture",
      sessionId: "session-history001",
      assetId: "asset-history0001",
      packageId: "package-history001",
      assetType: "DEPTH",
      contentHash: "d".repeat(64),
      byteSize: 2048,
      acquisition: { capturedAt: "2026-09-01T09:30:00Z" },
    },
    recordedBy: "svc:evidence-ingest",
    recordedAt: "2026-09-04T10:00:00Z",
  }),
]);

export function subjectFor(objectId: string, version: number, propertyKey?: string): EvidenceSubject {
  const subject = {
    kind: propertyKey === undefined ? ("object-existence" as const) : ("object-property" as const),
    modelId: MODEL,
    version,
    objectId,
    ...(propertyKey !== undefined ? { propertyKey } : {}),
  };
  return subject;
}

export function spaceSubject(spaceId: string, version: number, propertyKey: string): EvidenceSubject {
  return {
    kind: "space-property",
    modelId: MODEL,
    version,
    spaceId,
    propertyKey,
  };
}

function link(objectId: string, version: number, evidenceId: string, propertyKey?: string) {
  return evidenceLink({
    subject: propertyKey === undefined ? subjectFor(objectId, version) : subjectFor(objectId, version, propertyKey),
    evidenceId,
    linkedBy: "svc:evidence-link",
    linkedAt: "2026-09-05T10:00:00Z",
    method: "history/test-link",
  });
}

/** An evidence graph with links to the given version's subjects. */
export function evidenceGraphFor(options: {
  version: number;
  objectId: string;
  propertyKey?: string;
  retractRoomHeightLink?: boolean;
}): EvidenceGraph {
  const links = [
    link(options.objectId, options.version, SCAN_EVIDENCE_ID),
    ...(options.propertyKey !== undefined
      ? [link(options.objectId, options.version, SURVEY_EVIDENCE_ID, options.propertyKey)]
      : []),
  ];
  const retractions =
    options.retractRoomHeightLink && options.propertyKey !== undefined
      ? [
          linkRetraction({
            linkId: deriveLinkId({
              subject: subjectFor(options.objectId, options.version, options.propertyKey),
              evidenceId: SURVEY_EVIDENCE_ID,
              linkedBy: "svc:evidence-link",
              linkedAt: "2026-09-05T10:00:00Z",
              method: "history/test-link",
            }),
            retractedBy: "svc:evidence-link",
            retractedAt: "2026-09-06T10:00:00Z",
            reason: "history-test-retraction",
          }),
        ]
      : [];
  return assembleEvidenceGraph({
    projectId: PROJECT,
    records: [...EVIDENCE_RECORDS],
    evidenceRetractions: [],
    links,
    linkRetractions: retractions,
  });
}
