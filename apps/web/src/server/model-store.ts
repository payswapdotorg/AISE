/**
 * The web app's authoritative model source (AISE-015).
 *
 * The browser NEVER holds canonical state — every model byte the
 * browser sees is derived here, server-side, from the canonical
 * AISE-011 Reality Graph library. The web server composes the
 * same in-process reality-model store the backend services use
 * and exposes READ operations only (list, versions, one
 * version): there is no write path anywhere in this module.
 *
 * Seeding (documented v1 limitation, the AISE-001 in-memory
 * precedent): the store is populated at process start through
 * the real deterministic ingestion chain — the golden capture
 * points → AISE-010 extraction → AISE-011 ingestion → v1; the
 * reviewed confirmation pass → v2 — exactly the composition the
 * backend test suites pin. The store binds to durable ingestion
 * when that layer arrives; the read surface will not change.
 */
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import {
  createInMemoryRealityModelStore,
  ingestArchitecturalScene,
} from "@aise/backend-reality-model";
import { assembleModelGraph, canonicalContentHash, makeSpaceNode, propertyAssertion, modelProvenance } from "@aise/engineering-model";
import type {
  PropertyAssertion,
  RealityModelGraph,
} from "@aise/engineering-model";
import type { RealityModelStore, StoredModelVersion } from "@aise/backend-reality-model";

const MODEL_ID = "model-golden-room";
const PROJECT_ID = "project-golden-room";
const SPACE_ID = "room-golden-room";
const target = { modelId: MODEL_ID, projectId: PROJECT_ID, spaceId: SPACE_ID };

/** The measurement evidence identity the reviewed v2 cites (deterministic fixture). */
const SURVEY_EVIDENCE_ID = surveyEvidenceId();

let store: RealityModelStore | undefined;

/** The process-local authoritative store (lazily seeded, deterministic). */
export function modelStore(): RealityModelStore {
  if (store === undefined) {
    store = seed();
  }
  return store;
}

/** Lists the readable models. */
export function listModels(): readonly { modelId: string; projectId: string }[] {
  return [
    {
      modelId: MODEL_ID,
      projectId: PROJECT_ID,
    },
  ];
}

/** The full version history of one model (ascending). */
export function listVersions(modelId: string): readonly { version: number; digest: string; committedAt: string }[] {
  if (modelId !== MODEL_ID) {
    return [];
  }
  return modelStore()
    .listVersions(modelId)
    .map((record) => ({ version: record.version, digest: record.digest, committedAt: record.committedAt }));
}

/** One committed version (the canonical graph), or undefined. */
export function getVersion(modelId: string, version: number): StoredModelVersion | undefined {
  if (modelId !== MODEL_ID) {
    return undefined;
  }
  return modelStore().getVersion(modelId, version);
}

/** Seeds the store through the deterministic golden chain. */
function seed(): RealityModelStore {
  const fresh = createInMemoryRealityModelStore({ now: () => "2026-09-04T12:00:00Z" });

  // v1: the raw extraction (all INFERRED, no evidence).
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  const v1 = ingestArchitecturalScene(scene, target).graph;
  const create = fresh.createModel({ modelId: MODEL_ID, projectId: PROJECT_ID });
  if (create.status !== "created") {
    throw new Error("golden model registration must create cleanly");
  }
  const v1Producer = modelProvenance("web/seed-v1", { sceneId: scene.sceneId }, [
    { kind: "scene", sceneId: scene.sceneId, contentHash: scene.contentHash, epistemic: scene.epistemicState },
  ]);
  const commitV1 = fresh.commitModelVersion(MODEL_ID, v1, v1Producer);
  if (commitV1.status !== "committed" || commitV1.version !== 1) {
    throw new Error("golden v1 must commit as version 1");
  }

  // v2: the reviewed confirmation pass (CONFIRMED roomHeight
  // measurement citing the survey evidence; the door CONFIRMED).
  const v2 = reviewedVersion(v1);
  const v2Producer = modelProvenance("web/seed-v2-review", { sceneId: scene.sceneId, evidenceIds: SURVEY_EVIDENCE_ID }, [
    { kind: "scene", sceneId: scene.sceneId, contentHash: scene.contentHash, epistemic: scene.epistemicState },
  ]);
  const commitV2 = fresh.commitModelVersion(MODEL_ID, v2, v2Producer);
  if (commitV2.status !== "committed" || commitV2.version !== 2) {
    throw new Error("golden v2 must commit as version 2");
  }
  return fresh;
}

/** The reviewed v2: inputs, not built objects (the AISE-014 lesson). */
function reviewedVersion(v1: RealityModelGraph): RealityModelGraph {
  const objects = v1.objects.map((object) => ({
    objectClass: object.objectClass,
    ...(object.name !== undefined ? { name: object.name } : {}),
    ...(object.geometry?.structured !== undefined ? { structuredGeometry: object.geometry.structured } : {}),
    properties: object.properties,
    epistemicState: object.objectClass === "DOOR" ? ("CONFIRMED" as const) : object.epistemicState,
    provenance: object.provenance,
  }));

  const space = v1.spaces[0]!;
  const height = (space.properties ?? []).find((assertion) => assertion.key === "roomHeight");
  const properties: PropertyAssertion[] = [];
  if (height !== undefined) {
    properties.push(
      propertyAssertion({
        key: height.key,
        quantity: {
          value: 2.7,
          unit: "meter",
          uncertainty: { kind: "standard", u: 0.005 },
        },
        status: "CONFIRMED",
        kind: "measurement",
        evidenceRefs: [SURVEY_EVIDENCE_ID],
        verifiedBy: "user:site-engineer",
        verifiedAt: "2026-09-06T10:00:00Z",
      }),
    );
  }

  return assembleModelGraph({
    modelId: v1.modelId,
    projectId: v1.projectId,
    spaces: [
      makeSpaceNode({
        spaceId: space.spaceId,
        kind: space.kind,
        ...(space.name !== undefined ? { name: space.name } : {}),
        frame: space.frame,
        ...(properties.length > 0 ? { properties } : {}),
      }),
    ],
    objects,
    relationships: v1.relationships.map((relationship) => ({
      type: relationship.type,
      fromId: relationship.fromId,
      toId: relationship.toId,
    })),
  });
}

/** The deterministic survey evidence identity (mirrors the AISE-012 derivation: content-pinned). */
function surveyEvidenceId(): string {
  const record = {
    kind: "MEASUREMENT",
    source: {
      kind: "manual-measurement",
      value: 2.7,
      unit: "m",
      method: "survey/total-station",
      measuredBy: "surveyor-bob",
      measuredAt: "2026-09-03T14:00:00Z",
    },
  };
  return `ev-${canonicalContentHash(record).slice(0, 16)}`;
}
