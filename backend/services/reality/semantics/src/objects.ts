/**
 * Architectural object model and constructors (AISE-010).
 *
 * The structured output of architectural object extraction:
 * `ArchitecturalObject` (wall/floor/ceiling/door/window) and
 * `ArchitecturalScene`. Every constructor is fail-closed and runs
 * ON THE PRODUCING PATH (not just at consumption):
 *
 * - **Provenance** — every object cites method, materialized
 *   parameters, and content-pinned inputs (cluster point set, and
 *   the parent wall object for openings). `PROVENANCE_INCOMPLETE`
 *   on any gap.
 * - **Epistemic honesty** — recognition is inference: an object may
 *   never carry OBSERVED or CONFIRMED (the guard rejects states
 *   that outrank INFERRED). PROPOSED content propagates as
 *   PROPOSED (no upgrade). The scene state is the weakest of its
 *   objects and the source cloud — never an upgrade.
 * - **No confidence fabrication** — the serialized object must not
 *   contain a "confidence" field anywhere (structural scan at
 *   construction): deterministic geometry has no confidence to
 *   report; if a consumer wants one it must come from an evidence
 *   process (AISE-013), never be fabricated here.
 * - **Deterministic identity** — object ids are content-derived
 *   (`wall-<16hex>` etc.) from the canonical serialization of the
 *   object's content (id and contentHash excluded), and scene ids
 *   from the scene content. The same extraction always produces
 *   the same ids; id collisions fail closed
 *   (`IDENTITY_COLLISION`).
 * - **No child-id cycles** — walls carry opening COUNTS and
 *   unclassified gap data (no child ids); doors/windows reference
 *   their parent wall by id. The dependency direction is strictly
 *   child→parent, so content hashing is well-founded.
 */
import { SemanticsError } from "./errors.js";
import {
  assertExtractionMaxRank,
  assertNoEpistemicUpgrade,
  deriveCompositeState,
  epistemicRank,
  EXTRACTION_EPISTEMIC_STATE,
} from "./epistemic.js";
import {
  validateExtractionProvenance,
  type ExtractionProvenance,
} from "./provenance.js";
import type { UnclassifiedGap } from "./openings.js";
import type { StructuredRectangle } from "./structure.js";
import {
  canonicalContentHash,
  canonicalJsonString,
  type LengthUnit,
  type Measurement,
  type Vec3,
} from "@aise/backend-geometry";
import type { EpistemicState } from "@aise/shared-contracts";

/** The architectural object kinds extracted in v1. */
export type ObjectKind = "WALL" | "FLOOR" | "CEILING" | "DOOR" | "WINDOW";

/** Deterministic quality metrics of the underlying plane fit (no confidence). */
export interface ObjectQualityMetrics {
  /** Number of cluster points supporting the object. */
  readonly pointCount: number;
  /** RMS of the signed perpendicular residuals (input unit). */
  readonly residualRms: number;
  /** Max |signed residual| (input unit). */
  readonly residualMaxAbs: number;
}

/** A cluster that was segmented but not classified (reported, never dropped). */
export interface UnclassifiedSegment {
  readonly clusterId: string;
  readonly pointCount: number;
  readonly contentHash: string;
  readonly reason: string;
}

/** One extracted architectural object. */
export interface ArchitecturalObject {
  /** Deterministic content-derived identity (`wall-<hex16>` etc.). */
  readonly objectId: string;
  readonly kind: ObjectKind;
  /** Structured geometry: frame, oriented rectangle, dimensions, area. */
  readonly geometry: StructuredRectangle;
  /** Floor/ceiling: height of the plane point along the scene up axis. */
  readonly elevation?: Measurement;
  /** Window: sill height above the parent wall bottom. */
  readonly sillHeight?: Measurement;
  /** Door/window: head height above the parent wall bottom. */
  readonly headHeight?: Measurement;
  readonly quality: ObjectQualityMetrics;
  /** Walls: opening summary — counts and unclassified gaps (child ids live on the children). */
  readonly openings?: {
    readonly doorCount: number;
    readonly windowCount: number;
    readonly unclassified: readonly UnclassifiedGap[];
  };
  /** Doors/windows: parent wall object id. */
  readonly parentObjectId?: string;
  /** Never above INFERRED (guarded); PROPOSED content propagates as PROPOSED. */
  readonly epistemicState: EpistemicState;
  /** Canonical content hash of the object content (identity input). */
  readonly contentHash: string;
  readonly provenance: ExtractionProvenance;
}

/** The assembled extraction result for one scene (cloud). */
export interface ArchitecturalScene {
  readonly kind: "architectural-scene";
  /** Deterministic content-derived identity (`scene-<hex16>`). */
  readonly sceneId: string;
  /** The declared scene frame (up axis + coordinate unit). */
  readonly frame: { readonly up: Vec3; readonly unit: LengthUnit };
  /** Objects in canonical order (kind rank, then objectId). */
  readonly objects: readonly ArchitecturalObject[];
  /** Segmented but unclassified clusters, with reasons. */
  readonly unclassified: readonly UnclassifiedSegment[];
  /** Points that joined no cluster (never silently dropped). */
  readonly residualPointCount: number;
  readonly residualPointsContentHash: string;
  /** Room-level measurements when both floor and ceiling were recognized. */
  readonly room: {
    readonly floorElevation?: Measurement;
    readonly ceilingElevation?: Measurement;
    readonly roomHeight?: Measurement;
  } | null;
  /** Weakest of object states and the source cloud state (never an upgrade). */
  readonly epistemicState: EpistemicState;
  readonly contentHash: string;
  readonly provenance: ExtractionProvenance;
}

/** Canonical kind rank for object ordering (FLOOR → CEILING → WALL → DOOR → WINDOW). */
function kindRank(kind: ObjectKind): number {
  switch (kind) {
    case "FLOOR":
      return 0;
    case "CEILING":
      return 1;
    case "WALL":
      return 2;
    case "DOOR":
      return 3;
    case "WINDOW":
      return 4;
  }
}

/** Canonical object sort: kind rank, then objectId. */
export function compareObjects(a: ArchitecturalObject, b: ArchitecturalObject): number {
  const byKind = kindRank(a.kind) - kindRank(b.kind);
  if (byKind !== 0) {
    return byKind;
  }
  return a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0;
}

/**
 * Fail-closed structural scan: the canonical serialization of the
 * content must not contain the string "confidence" anywhere — a
 * confidence score cannot substitute for measurement uncertainty
 * (architecture-lock §3), and deterministic extraction has no
 * confidence to report.
 */
function assertNoConfidenceField(content: unknown, label: string): void {
  const serialized = canonicalJsonString(content);
  if (serialized.includes("confidence")) {
    throw new SemanticsError(
      "VALIDATION_FAILED",
      `${label}: extracted content must not carry a "confidence" field — confidence cannot substitute for uncertainty and is not produced by deterministic extraction`,
      { details: { label } },
    );
  }
}

/** Object content for identity hashing (everything except id and contentHash). */
function objectContent(object: Omit<ArchitecturalObject, "objectId" | "contentHash">): unknown {
  return {
    kind: object.kind,
    geometry: object.geometry,
    ...(object.elevation !== undefined ? { elevation: object.elevation } : {}),
    ...(object.sillHeight !== undefined ? { sillHeight: object.sillHeight } : {}),
    ...(object.headHeight !== undefined ? { headHeight: object.headHeight } : {}),
    quality: object.quality,
    ...(object.openings !== undefined ? { openings: object.openings } : {}),
    ...(object.parentObjectId !== undefined ? { parentObjectId: object.parentObjectId } : {}),
    epistemicState: object.epistemicState,
    provenance: object.provenance,
  };
}

/** Input for the surface object constructor. */
export interface SurfaceObjectInput {
  readonly kind: "WALL" | "FLOOR" | "CEILING";
  readonly geometry: StructuredRectangle;
  readonly quality: ObjectQualityMetrics;
  readonly elevation?: Measurement;
  readonly openings?: {
    readonly doorCount: number;
    readonly windowCount: number;
    readonly unclassified: readonly UnclassifiedGap[];
  };
  readonly provenance: ExtractionProvenance;
  readonly epistemicState?: EpistemicState;
}

/** Input for the opening object constructor. */
export interface OpeningObjectInput {
  readonly kind: "DOOR" | "WINDOW";
  readonly geometry: StructuredRectangle;
  readonly quality: ObjectQualityMetrics;
  readonly sillHeight?: Measurement;
  readonly headHeight?: Measurement;
  readonly parentObjectId: string;
  readonly provenance: ExtractionProvenance;
  readonly epistemicState?: EpistemicState;
}

/**
 * Builds one surface object (wall/floor/ceiling) with all gates:
 * provenance validation, epistemic rank guard, no-confidence scan,
 * deterministic content-derived identity. The producing code
 * validates its own output before returning it.
 */
export function makeSurfaceObject(input: SurfaceObjectInput): ArchitecturalObject {
  const epistemicState = input.epistemicState ?? EXTRACTION_EPISTEMIC_STATE;
  assertExtractionMaxRank(epistemicState, input.kind);
  validateExtractionProvenance(input.provenance);
  const content = objectContent({
    kind: input.kind,
    geometry: input.geometry,
    quality: input.quality,
    ...(input.elevation !== undefined ? { elevation: input.elevation } : {}),
    ...(input.openings !== undefined ? { openings: input.openings } : {}),
    epistemicState,
    provenance: input.provenance,
  });
  assertNoConfidenceField(content, `${input.kind.toLowerCase()} object`);
  const contentHash = canonicalContentHash(content);
  return {
    objectId: `${input.kind.toLowerCase()}-${contentHash.slice(0, 16)}`,
    kind: input.kind,
    geometry: input.geometry,
    ...(input.elevation !== undefined ? { elevation: input.elevation } : {}),
    ...(input.openings !== undefined ? { openings: input.openings } : {}),
    quality: input.quality,
    epistemicState,
    contentHash,
    provenance: input.provenance,
  };
}

/**
 * Builds one opening object (door/window) with all gates plus the
 * parent lineage (parent wall id + content hash pinned in
 * provenance inputs by the caller).
 */
export function makeOpeningObject(input: OpeningObjectInput): ArchitecturalObject {
  const epistemicState = input.epistemicState ?? EXTRACTION_EPISTEMIC_STATE;
  assertExtractionMaxRank(epistemicState, input.kind);
  validateExtractionProvenance(input.provenance);
  const content = objectContent({
    kind: input.kind,
    geometry: input.geometry,
    quality: input.quality,
    ...(input.sillHeight !== undefined ? { sillHeight: input.sillHeight } : {}),
    ...(input.headHeight !== undefined ? { headHeight: input.headHeight } : {}),
    parentObjectId: input.parentObjectId,
    epistemicState,
    provenance: input.provenance,
  });
  assertNoConfidenceField(content, `${input.kind.toLowerCase()} object`);
  const contentHash = canonicalContentHash(content);
  return {
    objectId: `${input.kind.toLowerCase()}-${contentHash.slice(0, 16)}`,
    kind: input.kind,
    geometry: input.geometry,
    ...(input.sillHeight !== undefined ? { sillHeight: input.sillHeight } : {}),
    ...(input.headHeight !== undefined ? { headHeight: input.headHeight } : {}),
    quality: input.quality,
    parentObjectId: input.parentObjectId,
    epistemicState,
    contentHash,
    provenance: input.provenance,
  };
}

/** Input for scene assembly. */
export interface SceneAssemblyInput {
  readonly frame: { up: Vec3; unit: LengthUnit };
  readonly objects: readonly ArchitecturalObject[];
  readonly unclassified: readonly UnclassifiedSegment[];
  readonly residualPointCount: number;
  readonly residualPointsContentHash: string;
  readonly room: {
    readonly floorElevation?: Measurement;
    readonly ceilingElevation?: Measurement;
    readonly roomHeight?: Measurement;
  } | null;
  /** Epistemic state of the source cloud (input declaration). */
  readonly sourceEpistemic: EpistemicState;
  /** Minimum architecturally possible floor–ceiling separation (defense in depth). */
  readonly minFloorCeilingSeparation: number;
  readonly provenance: ExtractionProvenance;
}

/**
 * Assembles the final scene with all consistency guards:
 *
 * - unique object ids and content hashes (`IDENTITY_COLLISION`);
 * - canonical object ordering;
 * - parent references resolve to WALL objects (`GEOMETRY_CONTRADICTION`);
 * - floor strictly below ceiling with architectural separation
 *   (`GEOMETRY_CONTRADICTION`);
 * - every object at or below INFERRED rank; scene state is the
 *   weakest of objects and the source cloud (no upgrade);
 * - provenance completeness for the scene;
 * - no-confidence scan over the whole scene serialization.
 */
export function assembleScene(input: SceneAssemblyInput): ArchitecturalScene {
  validateExtractionProvenance(input.provenance);

  const objects = [...input.objects].sort(compareObjects);
  const seenIds = new Set<string>();
  const seenHashes = new Set<string>();
  const wallIds = new Set<string>();
  for (const object of objects) {
    if (seenIds.has(object.objectId)) {
      throw new SemanticsError(
        "IDENTITY_COLLISION",
        `two objects share the deterministic id ${object.objectId} — the input is not a faithful set of distinct observations`,
        { details: { objectId: object.objectId } },
      );
    }
    seenIds.add(object.objectId);
    if (seenHashes.has(object.contentHash)) {
      throw new SemanticsError(
        "IDENTITY_COLLISION",
        `two objects share identical content (hash ${object.contentHash})`,
        { details: { contentHash: object.contentHash } },
      );
    }
    seenHashes.add(object.contentHash);
    assertExtractionMaxRank(object.epistemicState, object.objectId);
    validateExtractionProvenance(object.provenance);
    if (object.kind === "WALL") {
      wallIds.add(object.objectId);
    }
  }
  for (const object of objects) {
    if (object.parentObjectId !== undefined && !wallIds.has(object.parentObjectId)) {
      throw new SemanticsError(
        "GEOMETRY_CONTRADICTION",
        `${object.objectId} references parent ${object.parentObjectId} which is not a recognized wall object`,
        { details: { objectId: object.objectId, parentObjectId: object.parentObjectId } },
      );
    }
  }

  if (input.room !== null) {
    const floor = input.room.floorElevation;
    const ceiling = input.room.ceilingElevation;
    if (floor !== undefined && ceiling !== undefined) {
      if (floor.value >= ceiling.value) {
        throw new SemanticsError(
          "GEOMETRY_CONTRADICTION",
          `floor elevation (${floor.value}) must be strictly below ceiling elevation (${ceiling.value})`,
          { details: { floorElevation: String(floor.value), ceilingElevation: String(ceiling.value) } },
        );
      }
      if (ceiling.value - floor.value < input.minFloorCeilingSeparation) {
        throw new SemanticsError(
          "GEOMETRY_CONTRADICTION",
          `floor–ceiling separation ${ceiling.value - floor.value} is below the architectural minimum ${input.minFloorCeilingSeparation}`,
          {
            details: {
              separation: String(ceiling.value - floor.value),
              minimum: String(input.minFloorCeilingSeparation),
            },
          },
        );
      }
    }
  }

  const objectStates = objects.map((object) => object.epistemicState);
  const sceneState = deriveCompositeState([...objectStates, input.sourceEpistemic, EXTRACTION_EPISTEMIC_STATE]);
  assertNoEpistemicUpgrade(sceneState, [...objectStates, input.sourceEpistemic]);
  if (epistemicRank(sceneState) > epistemicRank(EXTRACTION_EPISTEMIC_STATE)) {
    throw new SemanticsError(
      "EPISTEMIC_STATE_INVALID",
      `scene state "${sceneState}" outranks the extraction ceiling ${EXTRACTION_EPISTEMIC_STATE}`,
      { details: { sceneState } },
    );
  }

  const content = {
    kind: "architectural-scene" as const,
    frame: input.frame,
    objects: objects.map((object) => ({ objectId: object.objectId, contentHash: object.contentHash })),
    unclassified: [...input.unclassified].sort((a, b) =>
      a.clusterId < b.clusterId ? -1 : a.clusterId > b.clusterId ? 1 : 0,
    ),
    residualPointCount: input.residualPointCount,
    residualPointsContentHash: input.residualPointsContentHash,
    ...(input.room !== null ? { room: input.room } : {}),
    epistemicState: sceneState,
    provenance: input.provenance,
  };
  assertNoConfidenceField(content, "scene");
  const contentHash = canonicalContentHash(content);

  return {
    kind: "architectural-scene",
    sceneId: `scene-${contentHash.slice(0, 16)}`,
    frame: input.frame,
    objects,
    unclassified: content.unclassified,
    residualPointCount: input.residualPointCount,
    residualPointsContentHash: input.residualPointsContentHash,
    room: input.room,
    epistemicState: sceneState,
    contentHash,
    provenance: input.provenance,
  };
}
