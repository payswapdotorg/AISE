/**
 * The idempotent demo seed (PROD-005).
 *
 * Seeds ONE deterministic golden-journey sample per core namespace
 * (evidence, case, mission) into an ALREADY-MIGRATED database:
 *
 *   - every fixture is a schema-valid contract object, INLINE here and
 *     validated through the SAME zod schemas / model parsers the domain
 *     uses at its boundaries (a schema drift breaks the seed loudly at
 *     run time instead of writing garbage rows);
 *   - every fixture is CONTENT-HASH KEYED: the seed marker's key is
 *     `seed:v1:<sha256 of the fixture's canonical JSON>`, so editing a
 *     fixture in a later build seeds the NEW shape under a NEW key while
 *     an unchanged fixture never re-runs;
 *   - the run is IDEMPOTENT AND HONEST: a marker that is already present
 *     means "this exact payload was seeded" → skip, write NOTHING. A
 *     marker that is ABSENT while the domain record EXISTS means the id
 *     was taken by real user state → KEEP the user state (the seed never
 *     overwrites) and write no marker, so the conflict is re-evaluated on
 *     every run until resolved;
 *   - the whole run is ONE transaction (the executor's JOIN semantics make
 *     the store-internal transactions join it): a failure mid-seed leaves
 *     no partial demo state and no orphan markers.
 *
 * All ids are `demo-`-prefixed (evidence content ids are content-addressed
 * 64-hex by contract — theirs derive deterministically from fixed seed
 * strings), all timestamps are fixed constants. No wall-clock, no
 * randomness, no network beyond the executor itself.
 */

import {
  canonicalJsonStringify,
  CONTRACT_VERSION,
  EvidenceSchema,
  CaptureMissionSchema,
  type CaptureMission,
  type Evidence,
} from "@aise/shared-contracts";
import { parseCaseRecord, type EngineeringCase } from "../cases/model";
import { sha256Hex } from "../lib/hash";
import type { PgExecutor } from "./executor";
import { insertSeedMarkerIfAbsentSql, selectSeedMarkerSql } from "./sql";
import { PgCaseStore } from "./stores/cases";
import { PgEvidenceStore } from "./stores/evidence";
import { PgMissionStore } from "./stores/missions";

/** Marker namespace (bump on a seed-content format change). */
export const DEMO_SEED_MARKER_VERSION = "seed:v1";

/** Fixed fixture timestamps (byte-stable across runs and builds). */
export const DEMO_SEED_CAPTURED_AT = "2026-01-15T09:36:12.000Z";
export const DEMO_SEED_CREATED_AT = "2026-01-15T10:00:00.000Z";

/** Deterministic demo evidence content id (contract: 64 lowercase hex). */
export function demoEvidenceContentId(): string {
  return sha256Hex("aise-demo-seed:evidence:welcome-photo");
}

/* ------------------------------------------------------------------ */
/* Fixtures (inline — testkits are test support and never imported)     */
/* ------------------------------------------------------------------ */

/** One schema-valid demo evidence record (the golden journey's photo). */
export function demoEvidence(): Evidence {
  const record: Evidence = {
    contractVersion: CONTRACT_VERSION,
    contentId: demoEvidenceContentId(),
    byteSize: 2048,
    mediaType: "image/jpeg",
    capturedAt: DEMO_SEED_CAPTURED_AT,
    acquisitionMethod: "STILL_IMAGERY",
    acquisitionMetadata: {
      "mission.id": "demo-mission-1",
      "session.id": "demo-session-1",
      "device.id": "demo-device-1",
      "capture.kind": "still",
      "acquisition.sensorId": "rear-wide",
    },
  };
  return EvidenceSchema.parse(record) as Evidence;
}

/** One model-valid demo engineering case linked to the demo evidence. */
export function demoCase(evidenceContentId: string): EngineeringCase {
  const record: EngineeringCase = {
    caseId: "demo-case-1",
    title: "Demo: damp ingress, north elevation",
    status: "open",
    createdAt: DEMO_SEED_CREATED_AT,
    updatedAt: DEMO_SEED_CREATED_AT,
    observations: [],
    hypotheses: [],
    missingEvidence: [],
    links: { nodeIds: ["demo-node-north-wall"], evidenceIds: [evidenceContentId], captureSessionIds: [] },
    history: [],
  };
  return parseCaseRecord(record);
}

/** One schema-valid demo capture mission (revision 0, draft). */
export function demoMission(): CaptureMission {
  const record: CaptureMission = {
    contractVersion: CONTRACT_VERSION,
    missionId: "demo-mission-1",
    state: "draft",
    intent: "Demo: document the north elevation for the damp-ingress case.",
    assurance: { summary: "Demo: photographs sufficient to orient the case, no metric claim." },
    requiredEvidence: [
      {
        requirementId: "demo-requirement-1",
        description: "Demo: one wide photograph of the affected wall.",
        preferredMethod: "STILL_IMAGERY",
        fallbackMethods: [],
      },
    ],
    steps: [
      {
        contractVersion: CONTRACT_VERSION,
        stepId: "demo-step-1",
        sequence: 0,
        title: "Photograph the north wall",
        instructions: "Demo: stand 3 m from the wall, wide field of view, ambient light.",
        method: "STILL_IMAGERY",
        requirementRefs: ["demo-requirement-1"],
        mandatory: true,
      },
    ],
    referenceControls: [],
    revision: 0,
    createdAt: DEMO_SEED_CREATED_AT,
    updatedAt: DEMO_SEED_CREATED_AT,
  };
  return CaptureMissionSchema.parse(record) as CaptureMission;
}

/* ------------------------------------------------------------------ */
/* Markers                                                              */
/* ------------------------------------------------------------------ */

/** The content-hash marker key for one seeded payload. */
export function seedMarkerKey(canonical: string): string {
  return `${DEMO_SEED_MARKER_VERSION}:${sha256Hex(canonical)}`;
}

/* ------------------------------------------------------------------ */
/* Runner                                                               */
/* ------------------------------------------------------------------ */

export type SeedKind = "evidence" | "case" | "mission";

export type SeedAction =
  /** Marker absent, record absent → written now. */
  | "seeded"
  /** Marker present → this exact payload already seeded; nothing written. */
  | "skipped-marker"
  /** Marker absent but the record id is taken by real state → user wins. */
  | "kept-existing";

export interface SeedItemOutcome {
  readonly kind: SeedKind;
  readonly id: string;
  readonly action: SeedAction;
}

/** Deterministic outcome report (evidence for transcripts and tests). */
export interface SeedOutcome {
  readonly items: readonly SeedItemOutcome[];
}

interface SeedSpec {
  readonly kind: SeedKind;
  readonly id: string;
  readonly canonical: string;
  /** True when the domain record already exists (user state check). */
  readonly exists: (tx: PgExecutor) => Promise<boolean>;
  /** Write the record through the production store twin. */
  readonly write: (tx: PgExecutor) => Promise<void>;
}

/** Marker payload: what was seeded, keyed to the payload's content hash. */
function markerPayload(spec: SeedSpec): string {
  return canonicalJsonStringify({
    marker: "aise-demo-seed",
    version: DEMO_SEED_MARKER_VERSION,
    kind: spec.kind,
    id: spec.id,
    contentSha256: sha256Hex(spec.canonical),
  });
}

/** Seed one item under the marker contract (module header). */
async function seedOne(tx: PgExecutor, spec: SeedSpec): Promise<SeedItemOutcome> {
  const key = seedMarkerKey(spec.canonical);
  const marker = await tx.execute<{ canonical: string }>(selectSeedMarkerSql(), [key]);
  if (marker.length > 0) {
    return { kind: spec.kind, id: spec.id, action: "skipped-marker" };
  }
  if (await spec.exists(tx)) {
    return { kind: spec.kind, id: spec.id, action: "kept-existing" };
  }
  await spec.write(tx);
  const payload = markerPayload(spec);
  await tx.execute(insertSeedMarkerIfAbsentSql(), [key, payload, payload]);
  return { kind: spec.kind, id: spec.id, action: "seeded" };
}

/**
 * Run the demo seed. Requires the schema to exist (run `runMigrations`
 * first — the CLI does). All-or-nothing: one transaction for the whole
 * run. Never throws a connection string (the executor's error wrapping
 * already swept it).
 */
export async function runSeed(executor: PgExecutor): Promise<SeedOutcome> {
  const evidence = demoEvidence();
  const demoCaseRecord = demoCase(evidence.contentId);
  const mission = demoMission();

  const specs: readonly SeedSpec[] = [
    {
      kind: "evidence",
      id: evidence.contentId,
      canonical: canonicalJsonStringify(evidence),
      exists: async (tx) =>
        (await new PgEvidenceStore(tx).getEvidenceRecord(evidence.contentId)) !== null,
      write: async (tx) => {
        await new PgEvidenceStore(tx).putEvidenceRecord(evidence);
      },
    },
    {
      kind: "case",
      id: demoCaseRecord.caseId,
      canonical: canonicalJsonStringify(demoCaseRecord),
      exists: async (tx) => (await new PgCaseStore(tx).get(demoCaseRecord.caseId)) !== null,
      write: async (tx) => {
        await new PgCaseStore(tx).put(demoCaseRecord);
      },
    },
    {
      kind: "mission",
      id: mission.missionId,
      canonical: canonicalJsonStringify(mission),
      exists: async (tx) => (await new PgMissionStore(tx).get(mission.missionId)) !== null,
      write: async (tx) => {
        await new PgMissionStore(tx).save(mission);
      },
    },
  ];

  return executor.transaction(async (tx) => {
    const items: SeedItemOutcome[] = [];
    for (const spec of specs) {
      items.push(await seedOne(tx, spec));
    }
    return { items };
  });
}
