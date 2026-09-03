/**
 * Architectural-scene ingestion into the Reality Graph (AISE-011
 * backend).
 *
 * The deterministic bridge from the AISE-010 extraction output
 * (`ArchitecturalScene`) into the canonical engineering model
 * (`RealityModelGraph`). This is the ONLY place the vocabulary
 * mapping happens — an explicit, reviewable, fail-closed adapter:
 *
 * - **Class mapping is 1:1** — WALL/FLOOR/CEILING/DOOR/WINDOW
 *   objects become reality objects of the same class.
 * - **Epistemic pass-through with a guard** — each object carries
 *   its upstream epistemic state unchanged; the no-upgrade guard
 *   (`assertNoEpistemicUpgrade`) runs on every object: ingestion
 *   is a transport, never an authority. Room-level measurements
 *   carry the scene's state.
 * - **Uncertainty passes through; confidence stays absent** — the
 *   AISE-010 objects have no confidence to pass (honest), so
 *   ingested quantities carry uncertainty only, and the adapter
 *   fabricates neither.
 * - **Geometric quantities live in the structured geometry** (one
 *   source of truth); property assertions are not fabricated for
 *   them. Room-level measurements become property assertions on
 *   the target space (a room measurement is a space-level fact).
 * - **Relationships** — CONTAINS (target space → every object) and
 *   OPENING_IN (door/window → parent wall, from the scene's parent
 *   references, which cite walls by their upstream identity).
 * - **Identity is lineage** — each object's model identity derives
 *   from its provenance source pin (the upstream semantics
 *   object), never from mutable content; the adapter derives the
 *   same ids the model constructor derives (single derivation
 *   rule, asserted by tests).
 * - **Honest accounting** — unclassified clusters and residual
 *   points are NOT objects; they are reported in the ingest
 *   report. The scene remains fully discoverable through each
 *   object's provenance (content-pinned inputs).
 * - **The declared scene frame** (up axis + unit) becomes the
 *   target space's declared coordinate frame — a declaration
 *   recorded, never an inference.
 */
import {
  assertNoEpistemicUpgrade,
  assembleModelGraph,
  deriveObjectId,
  modelProvenance,
  propertyAssertion,
  type EpistemicState,
  type ModelUncertainty,
  type PropertyAssertion,
  type Quantity,
  type RealityModelGraph,
  type RealityObjectInput,
  type RelationshipInput,
  type StructuredPlanarGeometryInput,
} from "@aise/engineering-model";
import type { ArchitecturalObject, ArchitecturalScene } from "@aise/backend-semantics";
import type { Uncertainty } from "@aise/backend-geometry";
import { RealityModelError } from "./errors.js";

/** Method label for the scene→graph ingestion. */
export const INGEST_METHOD = "ingest/architectural-scene-v1";

/** The declared target of an ingestion. */
export interface IngestionTarget {
  readonly modelId: string;
  readonly projectId: string;
  /** The space the scene belongs to (caller-declared, never inferred). */
  readonly spaceId: string;
  /** Kind of the target space (default "ROOM"). */
  readonly spaceKind?: "SITE" | "FACILITY" | "BUILDING" | "LEVEL" | "ROOM";
  /** Human-facing space name (optional). */
  readonly spaceName?: string;
}

/** Honest accounting of what the scene contained beyond objects. */
export interface IngestionReport {
  readonly sceneId: string;
  readonly sceneEpistemicState: EpistemicState;
  readonly ingestedObjectCount: number;
  readonly unclassifiedSegmentCount: number;
  readonly residualPointCount: number;
}

/** The ingestion result: the canonical graph + the report. */
export interface IngestionResult {
  readonly graph: RealityModelGraph;
  readonly report: IngestionReport;
}

/**
 * Derives the model object identity for one scene object (the
 * single derivation rule: source pin + modelId + class — the same
 * rule the model constructor applies to the adapter's provenance).
 */
function modelObjectIdOf(target: IngestionTarget, sceneObject: ArchitecturalObject): string {
  return deriveObjectId({
    modelId: target.modelId,
    objectClass: sceneObject.kind,
    sourceServiceId: sceneObject.provenance.serviceId,
    sourceMethod: sceneObject.provenance.method,
    sourceObjectId: sceneObject.objectId,
    sourceContentHash: sceneObject.contentHash,
  });
}

/**
 * Ingests one architectural scene into a complete model-version
 * graph for `target`. Deterministic: the same scene and target
 * produce the identical graph (identical digest).
 */
export function ingestArchitecturalScene(
  scene: ArchitecturalScene,
  target: IngestionTarget,
): IngestionResult {
  if (scene === null || typeof scene !== "object" || scene.kind !== "architectural-scene") {
    throw new RealityModelError("INGESTION_INVALID", "ingest input must be an architectural scene", {
      details: { field: "scene.kind", value: String((scene as { kind?: unknown })?.kind) },
    });
  }
  if (scene.objects.length === 0) {
    throw new RealityModelError(
      "INGESTION_INVALID",
      "a scene with no extracted objects has nothing to ingest — commit nothing rather than an empty graph",
      { details: { field: "scene.objects", value: "empty" } },
    );
  }

  const objects: RealityObjectInput[] = scene.objects.map((sceneObject) =>
    toObjectInput(scene, sceneObject),
  );

  // Model identities for relationship endpoints (the same rule the
  // model constructor applies — asserted by the id-consistency test).
  const idBySceneObjectId = new Map<string, string>();
  for (const sceneObject of scene.objects) {
    idBySceneObjectId.set(sceneObject.objectId, modelObjectIdOf(target, sceneObject));
  }

  const relationships: RelationshipInput[] = [];
  for (const sceneObject of scene.objects) {
    relationships.push({
      type: "CONTAINS",
      fromId: target.spaceId,
      toId: idBySceneObjectId.get(sceneObject.objectId)!,
    });
    if (sceneObject.parentObjectId !== undefined) {
      const parentModelId = idBySceneObjectId.get(sceneObject.parentObjectId);
      if (parentModelId === undefined) {
        throw new RealityModelError(
          "REFERENTIAL_INTEGRITY",
          `scene object ${sceneObject.objectId} references parent ${sceneObject.parentObjectId} which is not part of the scene`,
          { details: { field: "parentObjectId", value: sceneObject.parentObjectId } },
        );
      }
      relationships.push({
        type: "OPENING_IN",
        fromId: idBySceneObjectId.get(sceneObject.objectId)!,
        toId: parentModelId,
      });
    }
  }

  const spaceProperties = roomPropertiesOf(scene);

  const graph = assembleModelGraph({
    modelId: target.modelId,
    projectId: target.projectId,
    spaces: [
      {
        spaceId: target.spaceId,
        kind: target.spaceKind ?? "ROOM",
        ...(target.spaceName !== undefined ? { name: target.spaceName } : {}),
        frame: { up: { ...scene.frame.up }, unit: scene.frame.unit },
        ...(spaceProperties.length > 0 ? { properties: spaceProperties } : {}),
      },
    ],
    objects,
    relationships,
  });

  return {
    graph,
    report: {
      sceneId: scene.sceneId,
      sceneEpistemicState: scene.epistemicState,
      ingestedObjectCount: scene.objects.length,
      unclassifiedSegmentCount: scene.unclassified.length,
      residualPointCount: scene.residualPointCount,
    },
  };
}

/** Maps one scene object to a model object input (deterministic, guarded). */
function toObjectInput(scene: ArchitecturalScene, sceneObject: ArchitecturalObject): RealityObjectInput {
  // The no-upgrade guard: ingestion is transport, not authority.
  assertNoEpistemicUpgrade(
    sceneObject.epistemicState,
    sceneObject.epistemicState,
    `ingest ${sceneObject.objectId}`,
  );

  const structured = toStructuredGeometry(sceneObject);

  return {
    objectClass: sceneObject.kind,
    structuredGeometry: structured,
    properties: [],
    epistemicState: sceneObject.epistemicState,
    provenance: modelProvenance(
      INGEST_METHOD,
      {
        sceneId: scene.sceneId,
        sceneContentHash: scene.contentHash,
        sceneEpistemic: scene.epistemicState,
        frameUnit: scene.frame.unit,
        objectClass: sceneObject.kind,
      },
      [
        {
          kind: "object",
          serviceId: sceneObject.provenance.serviceId,
          method: sceneObject.provenance.method,
          objectId: sceneObject.objectId,
          contentHash: sceneObject.contentHash,
          epistemic: sceneObject.epistemicState,
        },
        {
          kind: "scene",
          sceneId: scene.sceneId,
          contentHash: scene.contentHash,
          epistemic: scene.epistemicState,
        },
      ],
    ),
  };
}

/** Room-level measurements become property assertions on the target space. */
function roomPropertiesOf(scene: ArchitecturalScene): readonly PropertyAssertion[] {
  if (scene.room === null || scene.room === undefined) {
    return [];
  }
  if (scene.room.roomHeight !== undefined) {
    return [
      propertyAssertion({
        key: "roomHeight",
        quantity: {
          value: scene.room.roomHeight.value,
          unit: scene.room.roomHeight.unit,
          ...(scene.room.roomHeight.uncertainty !== undefined
            ? { uncertainty: toModelUncertainty(scene.room.roomHeight.uncertainty) }
            : {}),
        },
        status: scene.epistemicState,
        kind: "estimate",
        method: scene.provenance.method,
      }),
    ];
  }
  return [];
}

/** Maps the scene's structured rectangle into model geometry quantities. */
function toStructuredGeometry(sceneObject: ArchitecturalObject): StructuredPlanarGeometryInput {
  const geometry = sceneObject.geometry;
  return {
    shape: "planar-rectangle",
    frame: {
      planePoint: { ...geometry.frame.planePoint },
      normal: { ...geometry.frame.normal },
      axisU: { ...geometry.frame.axisU },
      axisV: { ...geometry.frame.axisV },
    },
    rectangle: {
      uMin: geometry.rectangle.uMin,
      uMax: geometry.rectangle.uMax,
      vMin: geometry.rectangle.vMin,
      vMax: geometry.rectangle.vMax,
      center: { ...geometry.rectangle.center },
      corners: geometry.rectangle.corners.map((corner) => ({ ...corner })),
    },
    width: toQuantity(geometry.width),
    height: toQuantity(geometry.height),
    area: toQuantity(geometry.area),
    ...(sceneObject.elevation !== undefined ? { elevation: toQuantity(sceneObject.elevation) } : {}),
    ...(sceneObject.sillHeight !== undefined ? { sillHeight: toQuantity(sceneObject.sillHeight) } : {}),
    ...(sceneObject.headHeight !== undefined ? { headHeight: toQuantity(sceneObject.headHeight) } : {}),
    quality: {
      pointCount: sceneObject.quality.pointCount,
      residualRms: sceneObject.quality.residualRms,
      residualMaxAbs: sceneObject.quality.residualMaxAbs,
    },
  };
}

/** The upstream measurement shape (length/angle measurements AND area measurements). */
interface UpstreamQuantity {
  readonly value: number;
  readonly unit:
    | "meter" | "millimeter" | "centimeter" | "inch" | "foot"
    | "square_meter" | "square_millimeter" | "square_centimeter" | "square_inch" | "square_foot"
    | "radian" | "degree" | "gon";
  readonly uncertainty?: Uncertainty;
}

/** Maps an AISE-009/010 measurement into a model quantity (explicit vocabulary mapping). */
function toQuantity(measurement: UpstreamQuantity): Quantity {
  return {
    value: measurement.value,
    unit: measurement.unit,
    ...(measurement.uncertainty !== undefined
      ? { uncertainty: toModelUncertainty(measurement.uncertainty) }
      : {}),
  };
}

/** Maps the upstream uncertainty union onto the model's (structurally identical) union. */
function toModelUncertainty(uncertainty: Uncertainty): ModelUncertainty {
  switch (uncertainty.kind) {
    case "standard":
      return { kind: "standard", u: uncertainty.u };
    case "expanded":
      return { kind: "expanded", U: uncertainty.U, coverageFactor: uncertainty.coverageFactor };
    case "tolerance":
      return {
        kind: "tolerance",
        lowerOffset: uncertainty.lowerOffset,
        upperOffset: uncertainty.upperOffset,
      };
  }
}
