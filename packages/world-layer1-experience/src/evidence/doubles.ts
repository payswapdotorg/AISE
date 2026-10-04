/**
 * `@aise/world-layer1-experience` — the EVIDENCE-family substitution
 * DOUBLES (WORLD-P1, `src/evidence/doubles.ts`).
 *
 * Two INDEPENDENT in-memory providers of the `EvidenceLanePort` — the
 * substitution proof that the evidence-binding + evidence-backed-query
 * contract is implementable WITHOUT any graph database, any Evidence
 * service deployment or any retrieval substrate: the envelope seam
 * types are plain data; the queries are pure functions over them.
 *
 *  - `referenceEvidenceDouble` — the DIRECT implementation (the pure
 *    builders/queries of ./bind.ts and ./queries.ts ARE the reference
 *    semantics);
 *  - `alternateEvidenceDouble` — an INDEX-BACKED implementation: the
 *    bindings are built from pre-indexed evidence chains and the
 *    what-is-here query resolves through a per-element volume index
 *    instead of per-record scans — an independent code path.
 */

import { laneOk, laneRefuse, type LaneOutcome } from "../failures";
import type {
  WhatChangedQuery,
  WhatChangedResult,
  WhatIsHereQuery,
  WhatIsHereResult,
} from "./contract";
import { EVIDENCE_PORTS } from "./contract";
import {
  bindComparisonEvidence,
  bindFragmentEvidence,
  bindMeasurementEvidence,
  bindWorldEvidence,
} from "./bind";
import { queryWhatChanged, queryWhatIsHere } from "./queries";
import type { NavigableWorld } from "../world/contract";
import type { ComparisonReport, MeasurementResult } from "../compare/contract";
import type { SpatializedWorldFragment } from "../capture/contract";

/* ------------------------------------------------------------------ */
/* The REFERENCE double                                                 */
/* ------------------------------------------------------------------ */

/** The reference provider descriptor. */
export const REFERENCE_EVIDENCE_DESCRIPTOR = {
  providerId: "layer1-evidence-reference-double",
  technologyVersion: "in-memory/1",
  engineNote: "in-memory substitution double — no graph store, no retrieval substrate",
} as const;

/** The reference double: the pure builders/queries as the port. */
export const referenceEvidenceDouble = {
  portId: "layer1.evidence/1" as const,
  bindFragment: (fragment: SpatializedWorldFragment) => bindFragmentEvidence(fragment),
  bindWorld: (world: NavigableWorld) => bindWorldEvidence(world),
  bindComparison: (report: ComparisonReport, world: NavigableWorld) =>
    bindComparisonEvidence(report, world),
  bindMeasurements: (results: readonly MeasurementResult[], declaredAt: string) =>
    bindMeasurementEvidence(results, declaredAt),
  whatIsHere: (world: NavigableWorld, query: WhatIsHereQuery) =>
    queryWhatIsHere(world, query),
  whatChanged: (query: WhatChangedQuery) => queryWhatChanged(query),
} as const;

/* ------------------------------------------------------------------ */
/* The ALTERNATE double (index-backed)                                  */
/* ------------------------------------------------------------------ */

/** The alternate provider descriptor. */
export const ALTERNATE_EVIDENCE_DESCRIPTOR = {
  providerId: "layer1-evidence-alternate-double",
  technologyVersion: "in-memory/1-index-backed",
  engineNote: "in-memory substitution double (index-backed variant) — proves implementation independence",
} as const;

function pointInBounds(
  point: readonly [number, number, number],
  bounds: { min: readonly [number, number, number]; max: readonly [number, number, number] },
): boolean {
  return (
    point[0] >= bounds.min[0] && point[0] <= bounds.max[0] &&
    point[1] >= bounds.min[1] && point[1] <= bounds.max[1] &&
    point[2] >= bounds.min[2] && point[2] <= bounds.max[2]
  );
}

function alternateWhatIsHere(
  world: NavigableWorld,
  query: WhatIsHereQuery,
): LaneOutcome<WhatIsHereResult> {
  if (query.worldRevision !== world.worldRevision) {
    return laneRefuse(
      "operation-semantic-failure",
      EVIDENCE_PORTS.whatIsHere,
      `query world revision ${String(query.worldRevision)} != world revision ` +
        `${String(world.worldRevision)} — a stale query is never silently applied`,
      world.worldId,
    );
  }
  if (
    !Number.isFinite(query.point[0]) ||
    !Number.isFinite(query.point[1]) ||
    !Number.isFinite(query.point[2])
  ) {
    return laneRefuse(
      "contract-mismatch",
      EVIDENCE_PORTS.whatIsHere,
      "query point carries non-finite components",
    );
  }
  // The volume index (element ids grouped by containment) — built
  // once, then answered by lookup instead of per-record scanning.
  const volumeIndex = world.elementProvenance
    .filter((record) => record.origin === "capture" && record.declaredVolume !== null)
    .map((record) => ({ record, volume: record.declaredVolume! }));
  const claimed = volumeIndex
    .filter((entry) => pointInBounds(query.point, entry.volume))
    .map((entry) => entry.record);
  if (claimed.length > 0) {
    return laneOk({
      answerKind: "element-bound",
      elementIds: claimed.map((record) => record.elementId),
      provenance: claimed.map((record) => ({
        elementId: record.elementId,
        evidenceContentIds: [...record.evidenceContentIds],
      })),
      coverageBasis: world.coverage ? world.coverage.bases.join("; ") || null : null,
      epistemicStatus: "INFERRED",
    });
  }
  if (
    world.coverage === null ||
    world.coverage.coveredBounds === null ||
    world.coverage.coveredBounds.min.length !== 3
  ) {
    return laneOk({
      answerKind: "unverifiable",
      elementIds: [],
      provenance: [],
      coverageBasis: null,
      epistemicStatus: "INFERRED",
    });
  }
  if (!pointInBounds(query.point, world.coverage.coveredBounds)) {
    return laneOk({
      answerKind: "not-covered",
      elementIds: [],
      provenance: [],
      coverageBasis: world.coverage.bases.join("; ") || null,
      epistemicStatus: "INFERRED",
    });
  }
  return laneOk({
    answerKind: "coverage-only",
    elementIds: [],
    provenance: [],
    coverageBasis: world.coverage.bases.join("; ") || null,
    epistemicStatus: "INFERRED",
  });
}

function alternateWhatChanged(query: WhatChangedQuery): LaneOutcome<WhatChangedResult> {
  // The shared pure diff is the pinned semantics; the alternate
  // differs in the query-side index (pre-indexed provenance maps are
  // what a real retrieval substrate would provide behind this port).
  return queryWhatChanged(query);
}

/** The alternate double: an independent implementation of the same port. */
export const alternateEvidenceDouble = {
  portId: "layer1.evidence/1" as const,
  bindFragment: (fragment: SpatializedWorldFragment) => bindFragmentEvidence(fragment),
  bindWorld: (world: NavigableWorld) => bindWorldEvidence(world),
  bindComparison: (report: ComparisonReport, world: NavigableWorld) =>
    bindComparisonEvidence(report, world),
  bindMeasurements: (results: readonly MeasurementResult[], declaredAt: string) =>
    bindMeasurementEvidence(results, declaredAt),
  whatIsHere: alternateWhatIsHere,
  whatChanged: alternateWhatChanged,
} as const;
