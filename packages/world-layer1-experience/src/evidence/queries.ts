/**
 * `@aise/world-layer1-experience` — the EVIDENCE-BACKED QUERIES
 * (WORLD-P1, `src/evidence/queries.ts`).
 *
 * "WHAT IS ACTUALLY HERE?" and "WHAT CHANGED?" as typed queries —
 * never bare substrate reads:
 *
 *  - every answer carries the provenance chains it was derived from;
 *  - every answer's epistemic status is INFERRED (capture-derived);
 *  - absence is NEVER fabricated: `not-covered` means "no declared
 *    coverage", `unverifiable` means "no coverage declared at all" —
 *    neither implies nothing exists at the point (the ANCHOR doctrine
 *    law, machine-readable here);
 *  - a query whose subject carries no provenance refuses with a typed
 *    `retrieval-failure` — the honest refusal, never a fabricated
 *    chain.
 */

import { laneOk, laneRefuse, type LaneOutcome } from "../failures";
import type { NavigableWorld } from "../world/contract";
import type {
  ElementChangeKind,
  ElementChangeRecord,
  WhatChangedQuery,
  WhatChangedResult,
  WhatIsHereQuery,
  WhatIsHereResult,
} from "./contract";
import { EVIDENCE_PORTS, ELEMENT_CHANGE_KINDS, isWhatIsHereAnswerKind, WHAT_IS_HERE_ANSWER_KINDS } from "./contract";

/** Point-in-AABB (the declared-volume containment test). */
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

/**
 * EVIDENCE-BACKED QUERY: "what is actually here?" — the honest answer
 * from the world's DECLARED spatial claims (per-element capture
 * volumes, the declared coverage bounds). Never a bare read: the
 * answer names the evidence chains behind every claimed element.
 */
export function queryWhatIsHere(
  world: NavigableWorld,
  query: WhatIsHereQuery,
): LaneOutcome<WhatIsHereResult> {
  // Gate 1: the query is bound to THIS world revision.
  if (query.worldRevision !== world.worldRevision) {
    return laneRefuse(
      "operation-semantic-failure",
      EVIDENCE_PORTS.whatIsHere,
      `query world revision ${String(query.worldRevision)} != world revision ` +
        `${String(world.worldRevision)} — a stale query is never silently applied`,
      world.worldId,
    );
  }
  // Gate 2: the point is finite.
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

  // The claimed elements: CAPTURE-ORIGIN elements whose DECLARED
  // volumes contain the point (declared data only — never a guessed
  // claim; the derived coverage marker is NOT an element claim, and
  // plan elements carry no capture volume).
  const claimed = world.elementProvenance.filter(
    (record) =>
      record.origin === "capture" &&
      record.declaredVolume !== null &&
      pointInBounds(query.point, record.declaredVolume),
  );
  const provenance = claimed.map((record) => ({
    elementId: record.elementId,
    evidenceContentIds: [...record.evidenceContentIds],
  }));

  // The honest answer kind (the closed vocabulary, in decision order):
  // element-bound > unverifiable (no coverage at all) > not-covered
  // (coverage exists but excludes the point) > coverage-only.
  if (claimed.length > 0) {
    return laneOk({
      answerKind: "element-bound",
      elementIds: claimed.map((record) => record.elementId),
      provenance,
      coverageBasis: world.coverage ? world.coverage.bases.join("; ") || null : null,
      epistemicStatus: "INFERRED",
    });
  }
  if (world.coverage === null) {
    return laneOk({
      answerKind: "unverifiable",
      elementIds: [],
      provenance: [],
      coverageBasis: null,
      epistemicStatus: "INFERRED",
    });
  }
  if (world.coverage.coveredBounds === null) {
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

/**
 * EVIDENCE-BACKED QUERY: "what changed?" — the typed difference
 * between two world revisions of the same world, every record paired
 * with both sides' evidence chains. The change kinds are the closed
 * `ELEMENT_CHANGE_KINDS` vocabulary; `moved` means the transform
 * translation changed, `evidence-changed` means the evidence chain
 * changed.
 */
export function queryWhatChanged(
  query: WhatChangedQuery,
): LaneOutcome<WhatChangedResult> {
  const { fromWorld, toWorld } = query;

  // Gate 1: the two worlds are revisions of the SAME world (a
  // cross-world diff would be a fabricated comparison).
  if (fromWorld.worldId !== toWorld.worldId) {
    return laneRefuse(
      "operation-semantic-failure",
      EVIDENCE_PORTS.whatChanged,
      `worlds differ in identity (${fromWorld.worldId} vs ${toWorld.worldId}) — ` +
        "what-changed compares revisions of ONE world",
      toWorld.worldId,
    );
  }
  // Gate 2: the revision direction is forward (old → new).
  if (toWorld.worldRevision <= fromWorld.worldRevision) {
    return laneRefuse(
      "operation-semantic-failure",
      EVIDENCE_PORTS.whatChanged,
      `toWorld revision ${String(toWorld.worldRevision)} must be greater than ` +
        `fromWorld revision ${String(fromWorld.worldRevision)}`,
      toWorld.worldId,
    );
  }

  const fromRecords = new Map(
    fromWorld.elementProvenance.map((record) => [record.elementId, record]),
  );
  const toRecords = new Map(
    toWorld.elementProvenance.map((record) => [record.elementId, record]),
  );
  const fromPositions = new Map(
    fromWorld.scene.nodes.map((node) => {
      const m = node.transform.matrix;
      return [node.elementId, [m[3] ?? 0, m[7] ?? 0, m[11] ?? 0] as const] as const;
    }),
  );
  const toPositions = new Map(
    toWorld.scene.nodes.map((node) => {
      const m = node.transform.matrix;
      return [node.elementId, [m[3] ?? 0, m[7] ?? 0, m[11] ?? 0] as const] as const;
    }),
  );

  const changes: ElementChangeRecord[] = [];
  // Every element in UNION order: old-side order then new-only
  // additions (deterministic, pinned).
  const unionIds: string[] = [
    ...fromWorld.elementProvenance.map((record) => record.elementId),
    ...toWorld.elementProvenance
      .map((record) => record.elementId)
      .filter((elementId) => !fromRecords.has(elementId)),
  ];
  for (const elementId of unionIds) {
    const fromRecord = fromRecords.get(elementId);
    const toRecord = toRecords.get(elementId);
    const fromEvidence = fromRecord ? [...fromRecord.evidenceContentIds] : [];
    const toEvidence = toRecord ? [...toRecord.evidenceContentIds] : [];
    let changeKind: ElementChangeKind;
    if (fromRecord === undefined && toRecord !== undefined) {
      changeKind = "added";
    } else if (fromRecord !== undefined && toRecord === undefined) {
      changeKind = "removed";
    } else {
      const fromPos = fromPositions.get(elementId);
      const toPos = toPositions.get(elementId);
      const moved =
        fromPos !== undefined &&
        toPos !== undefined &&
        (fromPos[0] !== toPos[0] || fromPos[1] !== toPos[1] || fromPos[2] !== toPos[2]);
      const evidenceChanged =
        fromEvidence.join(",") !== toEvidence.join(",");
      changeKind = moved
        ? "moved"
        : evidenceChanged
          ? "evidence-changed"
          : "unchanged";
    }
    changes.push({
      elementId,
      changeKind,
      fromEvidenceContentIds: fromEvidence,
      toEvidenceContentIds: toEvidence,
    });
  }

  const counts = ELEMENT_CHANGE_KINDS.map((kind) => ({
    changeKind: kind,
    count: changes.filter((change) => change.changeKind === kind).length,
  }));

  return laneOk({
    fromWorldRevision: fromWorld.worldRevision,
    toWorldRevision: toWorld.worldRevision,
    changes,
    counts,
  });
}

/** Re-export the answer-kind vocabulary guard (the controlled surface). */
export { isWhatIsHereAnswerKind, WHAT_IS_HERE_ANSWER_KINDS };
