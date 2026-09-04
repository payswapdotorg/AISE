/**
 * Shared test fixtures for the evidence-layer suite: valid,
 * production-shaped records built through the real public
 * constructors, plus a compact Reality Graph with CONFIRMED and
 * non-confirmed assertions to exercise subjects, links, and the
 * validity projection.
 */
import {
  assembleModelGraph,
  makeRealityObject,
  makeSpaceNode,
  propertyAssertion,
  type EvidenceRecord,
  type EvidenceSubject,
  type PropertyAssertion,
  type RealityModelGraph,
} from "../index.js";
import {
  evidenceRecord,
  evidenceLink,
  type CaptureSource,
  type DocumentSource,
  type EvidenceRecordInput,
  type HumanObservationSource,
  type ManualMeasurementSource,
} from "./index.js";
import { estimateAssertion, objectProvenance, objectRef, planarGeometry } from "../testing.js";

export const MODEL = "model-evidence";
export const PROJECT = "project-evidence";
export const SPACE = "room-evidence";
const RECORDED_AT = "2026-09-04T10:00:00Z";

/** A valid capture source (a DEPTH upload backing a LIDAR record). */
export function captureSource(overrides: Partial<CaptureSource> = {}): CaptureSource {
  return {
    kind: "capture",
    sessionId: "session-0123456789abcdef",
    assetId: "asset-0123456789abcdef",
    packageId: "package-0123456789abcdef",
    assetType: "DEPTH",
    contentHash: "d".repeat(64),
    byteSize: 2048,
    mimeType: "application/octet-stream",
    acquisition: {
      capturedAt: "2026-09-01T09:30:00Z",
      deviceRef: "device-field-01",
      sensorRef: "sensor-lidar-01",
      geolocation: { latitude: 5.6037, longitude: -0.187, altitudeM: 76, accuracyM: 4 },
    },
    ...overrides,
  };
}

/** A valid manual-measurement source (a surveyed height). */
export function measurementSource(
  overrides: Partial<ManualMeasurementSource> = {},
): ManualMeasurementSource {
  return {
    kind: "manual-measurement",
    value: 3.0,
    unit: "m",
    method: "survey/total-station",
    measuredBy: "surveyor-bob",
    measuredAt: "2026-09-03T14:00:00Z",
    ...overrides,
  };
}

/** A valid document source (a spec sheet). */
export function documentSource(overrides: Partial<DocumentSource> = {}): DocumentSource {
  return {
    kind: "document",
    documentId: "doc-fire-rating-01",
    documentHash: "e".repeat(64),
    title: "Fire rating specification",
    issuedBy: "architect-alice",
    issuedAt: "2026-08-20T12:00:00Z",
    ...overrides,
  };
}

/** A valid human-observation source. */
export function observationSource(
  overrides: Partial<HumanObservationSource> = {},
): HumanObservationSource {
  return {
    kind: "human-observation",
    observer: "operator-dan",
    observedAt: "2026-09-01T09:45:00Z",
    statement: "Door leaf observed in the east wall opening",
    ...overrides,
  };
}

/** A valid evidence record input for one kind. */
export function recordInput(
  kind: EvidenceRecordInput["kind"],
  source: EvidenceRecordInput["source"],
  overrides: Partial<EvidenceRecordInput> = {},
): EvidenceRecordInput {
  return {
    kind,
    source,
    recordedBy: "svc:evidence-ingest",
    recordedAt: RECORDED_AT,
    ...overrides,
  };
}

/** A built LIDAR (capture-bound) evidence record. */
export function lidarEvidence(): EvidenceRecord {
  return evidenceRecord(recordInput("LIDAR", captureSource()));
}

/** A built MEASUREMENT (manual) evidence record. */
export function measurementEvidence(): EvidenceRecord {
  return evidenceRecord(recordInput("MEASUREMENT", measurementSource()));
}

/** A built DOCUMENT evidence record. */
export function documentEvidence(): EvidenceRecord {
  return evidenceRecord(recordInput("DOCUMENT", documentSource()));
}

/** A built HUMAN_OBSERVATION evidence record. */
export function observationEvidence(): EvidenceRecord {
  return evidenceRecord(recordInput("HUMAN_OBSERVATION", observationSource()));
}

/** A CONFIRMED measurement property assertion citing evidence. */
export function confirmedAssertion(
  key: string,
  value: number,
  evidenceRefs: readonly string[],
  overrides: Partial<PropertyAssertion> = {},
): PropertyAssertion {
  return propertyAssertion({
    key,
    quantity: { value, unit: "meter", uncertainty: { kind: "standard", u: 0.005 } },
    status: "CONFIRMED",
    kind: "measurement",
    method: "survey/total-station",
    evidenceRefs,
    verifiedBy: "surveyor-bob",
    verifiedAt: "2026-09-04T11:00:00Z",
    ...overrides,
  });
}

export interface SmallGraphFixture {
  readonly graph: RealityModelGraph;
  /** The wall object (INFERRED existence; carries the confirmed fireRating property). */
  readonly wallId: string;
  /** The door object (CONFIRMED existence). */
  readonly doorId: string;
  /** Subject of the wall's fireRating property (CONFIRMED). */
  readonly fireRatingSubject: EvidenceSubject;
  /** Subject of the room's roomHeight property (CONFIRMED). */
  readonly roomHeightSubject: EvidenceSubject;
  /** Subject of the room's coatingThickness property (INFERRED). */
  readonly coatingSubject: EvidenceSubject;
  /** Subject of the door's existence (CONFIRMED). */
  readonly doorSubject: EvidenceSubject;
  /** Subject of the wall's existence (INFERRED). */
  readonly wallSubject: EvidenceSubject;
}

/**
 * A compact graph exercising every subject kind:
 * - space with a CONFIRMED roomHeight (cites the given evidence)
 *   and an INFERRED paintColor;
 * - wall (INFERRED) with a CONFIRMED fireRating citing the given
 *   evidence;
 * - door (CONFIRMED existence).
 *
 * `roomHeightCitations` overrides the roomHeight assertion's
 * citation list (multi-ref assertions); it defaults to
 * `[measurementId]`.
 */
export function smallGraph(
  lidarId: string,
  measurementId: string,
  options: { roomHeightCitations?: readonly string[] } = {},
): SmallGraphFixture {
  const wallInput = {
    objectClass: "WALL" as const,
    structuredGeometry: planarGeometry() as never,
    properties: [confirmedAssertion("fireRating", 60, [lidarId])],
    epistemicState: "INFERRED" as const,
    provenance: objectProvenance(),
  };
  const doorInput = {
    objectClass: "DOOR" as const,
    structuredGeometry: planarGeometry() as never,
    properties: [],
    epistemicState: "CONFIRMED" as const,
    provenance: objectProvenance({
      inputs: [objectRef({ objectId: "door-0123456789abcdef", method: "opening/grid-gap-v1" })],
    }),
  };
  const wall = makeRealityObject(MODEL, wallInput);
  const door = makeRealityObject(MODEL, doorInput);

  const graph = assembleModelGraph({
    modelId: MODEL,
    projectId: PROJECT,
    spaces: [
      makeSpaceNode({
        spaceId: SPACE,
        kind: "ROOM",
        properties: [
          confirmedAssertion(
            "roomHeight",
            3.0,
            options.roomHeightCitations ?? [measurementId],
          ),
          estimateAssertion("coatingThickness", 0.002),
        ],
      }),
    ],
    objects: [wallInput, doorInput],
    relationships: [
      { type: "CONTAINS", fromId: SPACE, toId: wall.objectId },
      { type: "CONTAINS", fromId: SPACE, toId: door.objectId },
      { type: "OPENING_IN", fromId: door.objectId, toId: wall.objectId },
    ],
  });

  return {
    graph,
    wallId: wall.objectId,
    doorId: door.objectId,
    fireRatingSubject: {
      kind: "object-property",
      modelId: MODEL,
      version: 1,
      objectId: wall.objectId,
      propertyKey: "fireRating",
    },
    roomHeightSubject: {
      kind: "space-property",
      modelId: MODEL,
      version: 1,
      spaceId: SPACE,
      propertyKey: "roomHeight",
    },
    coatingSubject: {
      kind: "space-property",
      modelId: MODEL,
      version: 1,
      spaceId: SPACE,
      propertyKey: "coatingThickness",
    },
    doorSubject: {
      kind: "object-existence",
      modelId: MODEL,
      version: 1,
      objectId: door.objectId,
    },
    wallSubject: {
      kind: "object-existence",
      modelId: MODEL,
      version: 1,
      objectId: wall.objectId,
    },
  };
}

/**
 * The shared pre-built fixture: the compact graph citing the
 * standard (deterministic) lidar and measurement evidence
 * identities. Record constructors are deterministic, so the
 * evidence identities a test builds with `lidarEvidence()` /
 * `measurementEvidence()` are identical to the ones this graph
 * cites.
 */
export const fixture: SmallGraphFixture = smallGraph(
  lidarEvidence().evidenceId,
  measurementEvidence().evidenceId,
);

/** A valid link (deterministic identity, fixed actor/instant). */
export function link(
  subject: EvidenceSubject,
  evidenceId: string,
  overrides: { linkedBy?: string; linkedAt?: string; method?: string } = {},
): ReturnType<typeof evidenceLink> {
  return evidenceLink({
    subject,
    evidenceId,
    linkedBy: "svc:review-linker",
    linkedAt: "2026-09-04T12:00:00Z",
    ...overrides,
  });
}

export { RECORDED_AT };
