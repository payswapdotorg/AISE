/**
 * Deterministic Reality Graph test fixtures (AISE-016) — TEST SUPPORT ONLY,
 * never imported by production modules.
 *
 * All ids are fixed seed strings (evidence ids are derived via sha-256), all
 * timestamps are fixed constants, the clock is a constant function. No
 * wall-clock, no randomness, no network — the verify gate stays deterministic.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EpistemicStatus } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type {
  AcquisitionRef,
  ChangeRecord,
  InterventionRef,
  NodeKind,
  ObservationRecord,
  ProvenanceRecord,
  PropertyRecord,
  RealityNode,
  Relationship,
} from "./model";

export const FIXED_NOW = "2026-01-19T09:00:00.000Z";
export const FIXED_LATER = "2026-01-19T09:30:00.000Z";
export const FIXED_EVEN_LATER = "2026-01-19T10:15:00.000Z";
export const OBSERVED_AT = "2026-01-18T14:05:00.000Z";

/** Injected clock: constant, so version bytes are stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-reality-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Deterministic valid evidence content id (64 lowercase hex) from a seed. */
export function evidenceIdOf(seed: string): string {
  return sha256Hex(`aise-reality-test:${seed}`);
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

export function makeProvenance(
  overrides: Partial<ProvenanceRecord> = {},
): ProvenanceRecord {
  return {
    role: "SUPPORTS",
    evidenceId: evidenceIdOf("default"),
    recordedAt: FIXED_NOW,
    ...overrides,
  };
}

export interface PropertyOptions {
  readonly unit?: string;
  readonly epistemicStatus?: EpistemicStatus;
  readonly provenance?: ProvenanceRecord[];
}

export function makeProperty(
  key: string,
  value: string | number | boolean,
  options: PropertyOptions = {},
): PropertyRecord {
  return {
    key,
    value,
    ...(typeof value === "number" ? { unit: options.unit ?? "m" } : {}),
    epistemicStatus: options.epistemicStatus ?? "INFERRED",
    provenance: options.provenance ?? [makeProvenance()],
  };
}

export interface NodeOptions {
  readonly kind?: NodeKind;
  readonly epistemicStatus?: EpistemicStatus;
  readonly properties?: PropertyRecord[];
  readonly provenance?: ProvenanceRecord[];
  readonly geometry?: RealityNode["geometry"];
  readonly units?: RealityNode["units"];
  readonly acquisitionRef?: AcquisitionRef;
  readonly interventionRef?: InterventionRef;
}

export function makeNode(nodeId: string, options: NodeOptions = {}): RealityNode {
  return {
    nodeId,
    kind: options.kind ?? "element",
    epistemicStatus: options.epistemicStatus ?? "INFERRED",
    properties: options.properties ?? [],
    ...(options.geometry === undefined ? {} : { geometry: options.geometry }),
    ...(options.units === undefined
      ? {}
      : { units: options.units ?? { linear: "m", angular: "deg" } }),
    ...(options.acquisitionRef === undefined ? {} : { acquisitionRef: options.acquisitionRef }),
    ...(options.interventionRef === undefined ? {} : { interventionRef: options.interventionRef }),
    provenance: options.provenance ?? [makeProvenance({ role: "DERIVED_FROM", sourceArtifactId: "artifact-001" })],
  };
}

export function makeRelationship(
  relationshipId: string,
  fromNodeId: string,
  toNodeId: string,
  kind: Relationship["kind"] = "contains",
  provenance: ProvenanceRecord[] = [makeProvenance()],
): Relationship {
  return { relationshipId, fromNodeId, toNodeId, kind, provenance };
}

export interface ObservationOptions {
  readonly observedAt?: string;
  readonly evidenceIds?: string[];
  readonly properties?: PropertyRecord[];
  readonly observer?: string;
  readonly note?: string;
}

export function makeObservation(
  observationId: string,
  nodeId: string,
  options: ObservationOptions = {},
): ObservationRecord {
  return {
    observationId,
    nodeId,
    observedAt: options.observedAt ?? OBSERVED_AT,
    evidenceIds: options.evidenceIds ?? [evidenceIdOf("obs-1")],
    properties:
      options.properties ??
      [makeProperty("note-count", 1, { epistemicStatus: "OBSERVED", unit: "count" })],
    ...(options.observer === undefined ? {} : { observer: options.observer }),
    ...(options.note === undefined ? {} : { note: options.note }),
  };
}

/**
 * The R6 hierarchy smoke fixture: project → site → building → storey →
 * space → element, wired with "contains" relationships (ids in reverse order
 * on purpose: materialization must sort deterministically regardless of the
 * caller's ordering).
 */
export function hierarchyChangeSet(): ChangeRecord[] {
  const provenance = [makeProvenance({ role: "SUPPORTS", evidenceId: evidenceIdOf("survey") })];
  const nodes: RealityNode[] = [
    makeNode("wall-1", {
      kind: "element",
      epistemicStatus: "INFERRED",
      properties: [makeProperty("height", 2.7, { unit: "m" })],
      provenance,
    }),
    makeNode("space-1", { kind: "space", epistemicStatus: "INFERRED", provenance }),
    makeNode("storey-1", { kind: "storey", epistemicStatus: "OBSERVED", provenance }),
    makeNode("bldg-1", { kind: "building", epistemicStatus: "OBSERVED", provenance }),
    makeNode("site-1", { kind: "site", epistemicStatus: "OBSERVED", provenance }),
    makeNode("proj-1", { kind: "project", epistemicStatus: "CONFIRMED", provenance }),
  ];
  const relationships: Relationship[] = [
    makeRelationship("rel-space-wall", "space-1", "wall-1", "contains", provenance),
    makeRelationship("rel-storey-space", "storey-1", "space-1", "contains", provenance),
    makeRelationship("rel-bldg-storey", "bldg-1", "storey-1", "contains", provenance),
    makeRelationship("rel-site-bldg", "site-1", "bldg-1", "contains", provenance),
    makeRelationship("rel-proj-site", "proj-1", "site-1", "contains", provenance),
  ];
  const changes: ChangeRecord[] = nodes.map((node) => ({ op: "upsert-node", node }));
  for (const relationship of relationships) {
    changes.push({ op: "upsert-relationship", relationship });
  }
  return changes;
}
