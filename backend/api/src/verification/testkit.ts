/**
 * AISE-023 test kit — deterministic fixture builders for the verification
 * tests (house style: colocated, no I/O, no clock, no randomness; the
 * `shuffled` helper is a seeded LCG so order-insensitivity tests are
 * themselves deterministic).
 *
 * The SYNTHETIC STOREY is the canonical clean fixture: a fully rooted
 * project→site→building→storey→space→elements hierarchy with typed-unit
 * numeric properties carrying 1σ, valid property provenance closing
 * against a valid evidence fact set, coherent semantic.kind projections
 * and a hosted opening. `runVerification` over it yields ZERO findings.
 *
 * Evidence ids are readable short strings, NOT 64-hex content addresses:
 * the verifier checks set MEMBERSHIP only (form validation of evidence ids
 * is AISE-016's write-time duty) — this also documents that boundary.
 */

import type { EvidenceFact, ReadinessReport, DimensionOutcome } from "../assurance";
import type { EvidenceMethod } from "@aise/shared-contracts";
import type { ProvenanceRecord, RelKind } from "../reality/model";
import type { VerificationNode, VerificationProperty, VerificationInput } from "./model";

const RECORDED_AT = "2026-01-01T00:00:00Z";

/** Provenance record citing derivation only (no evidence claim). */
function derived(note: string): ProvenanceRecord[] {
  return [{ role: "DERIVED_FROM", derivationNote: note, recordedAt: RECORDED_AT }];
}

/** Provenance record citing evidence with a SUPPORTS role. */
function supports(evidenceId: string): ProvenanceRecord[] {
  return [{ role: "SUPPORTS", evidenceId, recordedAt: RECORDED_AT }];
}

/** The shared recordedAt for every fixture provenance record. */
export const FIXTURE_RECORDED_AT = RECORDED_AT;

/**
 * Property builder. Defaults: derivation-note provenance, OBSERVED status;
 * `unit`/`sigma`/`evidenceId` attach the corresponding field (evidenceId is
 * shorthand that overrides `provenance` with a SUPPORTS record).
 */
export function vprop(
  key: string,
  value: string | number | boolean,
  options?: {
    unit?: string;
    epistemicStatus?: VerificationProperty["epistemicStatus"];
    sigma?: number;
    evidenceId?: string;
    provenance?: readonly ProvenanceRecord[];
  },
): VerificationProperty {
  return {
    key,
    value,
    ...(options?.unit !== undefined ? { unit: options.unit } : {}),
    epistemicStatus: options?.epistemicStatus ?? "OBSERVED",
    provenance: options?.provenance ?? derived("test fixture"),
    ...(options?.sigma !== undefined ? { uncertainty: { sigma: options.sigma } } : {}),
    ...(options?.evidenceId !== undefined ? { provenance: supports(options.evidenceId) } : {}),
  };
}

export function vnode(
  nodeId: string,
  kind: VerificationNode["kind"],
  epistemicStatus: VerificationNode["epistemicStatus"],
  properties: readonly VerificationProperty[],
): VerificationNode {
  return { nodeId, kind, epistemicStatus, properties, provenance: derived("test fixture") };
}

export function vrel(relationshipId: string, kind: RelKind, fromNodeId: string, toNodeId: string) {
  return { relationshipId, kind, fromNodeId, toNodeId, provenance: derived("test fixture") };
}

function ev(evidenceId: string, method: EvidenceMethod, invalidated = false, linkedNodeIds: readonly string[] = []): EvidenceFact {
  return { evidenceId, method, invalidated, linkedNodeIds };
}

/**
 * The canonical clean fixture — the synthetic storey. Every mutation test
 * clones (via runVerification over a rebuilt input) and flips exactly ONE
 * field. Property→evidence wiring (each cited exactly once, so single-field
 * mutations trip exactly one finding):
 *   wall-north.width → ev-wall-north   wall-east.height → ev-wall-east
 *   floor.area (CONFIRMED) → ev-floor  door.width → ev-door
 *   storey.elevation → ev-storey
 */
export function syntheticStorey(): VerificationInput {
  const nodes: readonly VerificationNode[] = [
    vnode("node-project-1", "project", "CONFIRMED", [
      vprop("name", "Synthetic Storey Project", { epistemicStatus: "CONFIRMED" }),
    ]),
    vnode("node-site-1", "site", "CONFIRMED", [
      vprop("name", "Site 7", { epistemicStatus: "CONFIRMED" }),
    ]),
    vnode("node-building-1", "building", "CONFIRMED", [
      vprop("name", "Building A", { epistemicStatus: "CONFIRMED" }),
    ]),
    vnode("node-storey-1", "storey", "CONFIRMED", [
      vprop("name", "Ground floor", { epistemicStatus: "CONFIRMED" }),
      vprop("elevation", 3.0, { unit: "m", sigma: 0.01, evidenceId: "ev-storey" }),
    ]),
    vnode("node-space-living", "space", "CONFIRMED", [
      vprop("name", "Living room", { epistemicStatus: "CONFIRMED" }),
    ]),
    vnode("node-wall-north", "element", "OBSERVED", [
      vprop("label", "Wall North"),
      vprop("semantic.kind", "wall", { epistemicStatus: "INFERRED" }),
      vprop("width", 4.2, { unit: "m", sigma: 0.01, evidenceId: "ev-wall-north" }),
    ]),
    vnode("node-wall-east", "element", "OBSERVED", [
      vprop("label", "Wall East"),
      vprop("semantic.kind", "wall", { epistemicStatus: "INFERRED" }),
      vprop("height", 2.7, { unit: "m", sigma: 0.02, evidenceId: "ev-wall-east" }),
    ]),
    vnode("node-floor-1", "element", "OBSERVED", [
      vprop("label", "Floor"),
      vprop("semantic.kind", "floor", { epistemicStatus: "INFERRED" }),
      vprop("area", 24.5, { unit: "m2", epistemicStatus: "CONFIRMED", sigma: 0.05, evidenceId: "ev-floor" }),
    ]),
    vnode("node-door-1", "opening", "OBSERVED", [
      vprop("label", "Door 01"),
      vprop("semantic.kind", "door", { epistemicStatus: "INFERRED" }),
      vprop("width", 0.9, { unit: "m", sigma: 0.01, evidenceId: "ev-door" }),
    ]),
  ];
  const relationships = [
    vrel("rel-contains-site", "contains", "node-project-1", "node-site-1"),
    vrel("rel-contains-building", "contains", "node-site-1", "node-building-1"),
    vrel("rel-contains-storey", "contains", "node-building-1", "node-storey-1"),
    vrel("rel-contains-space", "contains", "node-storey-1", "node-space-living"),
    vrel("rel-contains-wall-north", "contains", "node-space-living", "node-wall-north"),
    vrel("rel-contains-wall-east", "contains", "node-space-living", "node-wall-east"),
    vrel("rel-contains-floor", "contains", "node-space-living", "node-floor-1"),
    vrel("rel-contains-door", "contains", "node-space-living", "node-door-1"),
    vrel("rel-opens-door", "opens-into", "node-door-1", "node-wall-north"),
  ];
  const evidenceFacts = [
    ev("ev-storey", "DOCUMENT_REGION", false, ["node-storey-1"]),
    ev("ev-wall-north", "DEPTH_SENSING", false, ["node-wall-north"]),
    ev("ev-wall-east", "DEPTH_SENSING", false, ["node-wall-east"]),
    ev("ev-floor", "MANUAL_MEASUREMENT", false, ["node-floor-1"]),
    ev("ev-door", "CALIBRATED_REFERENCE", false, ["node-door-1"]),
  ];
  return { graphSnapshot: { nodes, relationships }, evidenceFacts };
}

/* ------------------------------------------------------------------ */
/* Readiness report fixtures (hand-built AISE-022 projections)          */
/* ------------------------------------------------------------------ */

function dimension(dimensionId: string, critical: boolean, outcome: DimensionOutcome["outcome"]): DimensionOutcome {
  return {
    dimensionId,
    critical,
    outcome,
    basis: {
      kind: "coverage",
      minCoverageFraction: 1,
      nodesTotal: 9,
      nodesCovered: 9,
      measuredCoverageFraction: 1,
    },
  };
}

/**
 * A hand-built readiness report over two dimensions: `dim-cov`
 * (non-critical) and `dim-geo` (critical). Only the fields the verifier
 * cross-references are varied — the basis is deterministic filler.
 */
export function report(
  readiness: ReadinessReport["readiness"],
  dimCov: DimensionOutcome["outcome"],
  dimGeo: DimensionOutcome["outcome"],
): ReadinessReport {
  return {
    profileId: "profile-dimensional-survey",
    profileVersion: "assurance-1",
    taskKind: "dimensional_survey",
    readiness,
    dimensions: [dimension("dim-cov", false, dimCov), dimension("dim-geo", true, dimGeo)],
    gaps: [],
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                                */
/* ------------------------------------------------------------------ */

/** Deterministic seeded shuffle (LCG) for order-insensitivity tests. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (1103515245 * state + 12345) >>> 0;
    const j = state % (i + 1);
    const swap = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = swap;
  }
  return copy;
}

/** Recursively freeze a value (purity tests: the runner must not mutate). */
export function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value);
  }
  return value;
}
