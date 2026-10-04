/**
 * WORLD-P3 — the COORDINATION family's two in-memory SUBSTITUTION
 * DOUBLES — THE CLASH-PREDICATE DOUBLES (the clash-engine substrate
 * seam).
 *
 * Both implement the `ClashPredicateAdapter` port WITHOUT any clash
 * engine — no OCCT, no BVH, no collision runtime: the real clash engine
 * (exact NURBS/swept-surface distance queries over OCCT in the
 * WORLD-P4 sidecar) is BLOCKED with the sidecar-deployment protocol
 * (recorded in the item's CAPABILITY-BOUNDARIES). The doubles prove the
 * clash CONTRACT implementable and — because both classify through the
 * SAME closed verdict table (`classifySeparation`) over the SAME
 * box-separation metric — they produce BYTE-IDENTICAL `ClashReport`
 * records on the committed fixtures:
 *
 *  - `ReferenceClashPredicateDouble` — DIRECT interval arithmetic: each
 *    box pair's per-axis intervals are compared directly and the
 *    separation metric computed in one pass;
 *  - `AlternateClashPredicateDouble` — AXIS-DECOMPOSED round-trip: each
 *    pair's per-axis interval data is canonical-JSON round-tripped
 *    before the same combination — an independent construction path
 *    proving the metric is wire-stable (a real clash engine computing
 *    the same metric through its own representation is substitutable
 *    without semantic change).
 *
 * HONESTY OF THE DOUBLES (no fabrication):
 *
 *  - both validate the FULL clash-request law set BEFORE computing
 *    (declared tolerance, known elements, supported shape kinds, the
 *    P0-B exact-geometry request validation delegation) — fail-closed;
 *  - neither invents pairs, shapes, separations or verdicts: every
 *    number comes from the DECLARED shape proxies by closed-form
 *    arithmetic; every verdict from the closed table;
 *  - the report is content-addressed (deterministic reportId) — the
 *    same request through either double derives the identical id.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { contentIdOf, laneRefused, type LaneOutcome, type Layer3Family } from "../seam";
import type { GeometryShapeDeclaration } from "@aise/world-understanding-substrate";
import {
  CLASH_PREDICATE_PORT_ID,
  classifySeparation,
  boxSeparationMetres,
  validateClashTestRequest,
  type ClashEngineCapabilities,
  type ClashPair,
  type ClashPairVerdict,
  type ClashPredicateAdapter,
  type ClashReport,
  type ClashTestRequest,
  type ClashVerdictKind,
  type CoordinatedSceneAggregate,
} from "./contract";

const FAMILY: Layer3Family = "coordination";

/** The capabilities both doubles declare (honest, closed). */
const SHARED_CAPABILITIES: ClashEngineCapabilities = {
  supportedShapeKinds: ["box"],
  maxPairs: 1000,
  blocked: [
    {
      capability: "exact curved-surface clash distance (NURBS / swept surfaces)",
      reason:
        "in-memory substitution double — closed-form axis-aligned box separation only; " +
        "the real clash-engine occupant (OCCT exact distance queries in the WORLD-P4 " +
        "sidecar) is BLOCKED with the sidecar-deployment protocol (see CAPABILITY-BOUNDARIES)",
    },
    {
      capability: "automatic clash-pair discovery (rule-driven batch detection)",
      reason:
        "the P3 contract computes DECLARED pairs only — pair discovery rules are a future " +
        "occupant capability entering through the same typed request",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* The shared report construction (the semantic content)                */
/* ------------------------------------------------------------------ */

/** Count the verdicts per kind (the machine-readable summary). */
function verdictCountsOf(
  verdicts: readonly ClashPairVerdict[],
): { verdict: ClashVerdictKind; count: number }[] {
  const counts: { verdict: ClashVerdictKind; count: number }[] = [];
  for (const kind of ["clash", "within-tolerance", "clear"] as const) {
    const count = verdicts.filter((verdict) => verdict.verdict === kind).length;
    if (count > 0) {
      counts.push({ verdict: kind, count });
    }
  }
  return counts;
}

/** The canonical report body (the digest projection). */
function reportBody(
  verdicts: readonly ClashPairVerdict[],
  request: ClashTestRequest,
): Record<string, unknown> {
  return {
    verdicts,
    appliedTolerance: request.tolerance,
    units: request.units,
  };
}

/* ------------------------------------------------------------------ */
/* The two doubles                                                      */
/* ------------------------------------------------------------------ */

/**
 * The REFERENCE double: direct interval arithmetic — each pair's
 * separation is computed in one pass over the declared box bounds.
 */
export class ReferenceClashPredicateDouble implements ClashPredicateAdapter {
  readonly portId = CLASH_PREDICATE_PORT_ID;
  readonly capabilities: ClashEngineCapabilities = SHARED_CAPABILITIES;

  detectClashes(
    request: ClashTestRequest,
    aggregate: CoordinatedSceneAggregate,
  ): LaneOutcome<ClashReport> {
    const validation = validateClashTestRequest(request, aggregate);
    if (!validation.ok) {
      return validation;
    }
    if (
      request.pairs.length > (this.capabilities.maxPairs ?? Number.MAX_SAFE_INTEGER)
    ) {
      return laneRefused<ClashReport>(
        FAMILY,
        "resource-exhaustion",
        `the clash request declares ${request.pairs.length} pairs — above the double's declared max ${this.capabilities.maxPairs}`,
      );
    }
    const verdicts: ClashPairVerdict[] = [];
    for (const pair of request.pairs) {
      const separation = boxSeparationMetres(
        pair.shapeA as Extract<GeometryShapeDeclaration, { kind: "box" }>,
        pair.shapeB as Extract<GeometryShapeDeclaration, { kind: "box" }>,
      );
      const verdict = classifySeparation(separation, request.tolerance.linear);
      verdicts.push({
        pairId: pair.pairId,
        elementA: pair.elementA,
        elementB: pair.elementB,
        verdict,
        separationMetres: separation,
        appliedTolerance: request.tolerance,
        withinTolerance: Math.abs(separation) <= request.tolerance.linear,
      });
    }
    const reportId = contentIdOf(reportBody(verdicts, request), "reportId");
    return {
      ok: true,
      value: {
        kind: "coordination-clash-report",
        schemaVersion: "coordination-clash-report/1",
        reportId,
        verdicts,
        appliedTolerance: request.tolerance,
        units: request.units,
        verdictCounts: verdictCountsOf(verdicts),
      },
    };
  }
}

/**
 * The ALTERNATE double: axis-decomposed canonical-JSON round-trip — the
 * same pairs, each pair's per-axis interval table serialized and parsed
 * back before the combination; the same metric, the same table, an
 * independent code path that must produce the byte-identical report.
 */
export class AlternateClashPredicateDouble implements ClashPredicateAdapter {
  readonly portId = CLASH_PREDICATE_PORT_ID;
  readonly capabilities: ClashEngineCapabilities = SHARED_CAPABILITIES;

  detectClashes(
    request: ClashTestRequest,
    aggregate: CoordinatedSceneAggregate,
  ): LaneOutcome<ClashReport> {
    const validation = validateClashTestRequest(request, aggregate);
    if (!validation.ok) {
      return validation;
    }
    if (
      request.pairs.length > (this.capabilities.maxPairs ?? Number.MAX_SAFE_INTEGER)
    ) {
      return laneRefused<ClashReport>(
        FAMILY,
        "resource-exhaustion",
        `the clash request declares ${request.pairs.length} pairs — above the double's declared max ${this.capabilities.maxPairs}`,
      );
    }
    const verdicts: ClashPairVerdict[] = [];
    for (const pair of request.pairs) {
      // Axis decomposition: the per-axis interval table round-tripped
      // through canonical JSON before combination (wire stability).
      const intervalTable = intervalTableOf(pair);
      const roundTripped: {
        readonly axes: readonly {
          readonly aMin: number;
          readonly aMax: number;
          readonly bMin: number;
          readonly bMax: number;
        }[];
      } = JSON.parse(canonicalJsonStringify(intervalTable));
      const separation = separationFromIntervalTable(roundTripped.axes);
      const verdict = classifySeparation(separation, request.tolerance.linear);
      verdicts.push({
        pairId: pair.pairId,
        elementA: pair.elementA,
        elementB: pair.elementB,
        verdict,
        separationMetres: separation,
        appliedTolerance: request.tolerance,
        withinTolerance: Math.abs(separation) <= request.tolerance.linear,
      });
    }
    const reportId = contentIdOf(reportBody(verdicts, request), "reportId");
    return {
      ok: true,
      value: {
        kind: "coordination-clash-report",
        schemaVersion: "coordination-clash-report/1",
        reportId,
        verdicts,
        appliedTolerance: request.tolerance,
        units: request.units,
        verdictCounts: verdictCountsOf(verdicts),
      },
    };
  }
}

/** The per-axis interval table of one pair (the decomposition unit). */
function intervalTableOf(pair: ClashPair): {
  readonly axes: readonly {
    readonly aMin: number;
    readonly aMax: number;
    readonly bMin: number;
    readonly bMax: number;
  }[];
} {
  const a = pair.shapeA as Extract<GeometryShapeDeclaration, { kind: "box" }>;
  const b = pair.shapeB as Extract<GeometryShapeDeclaration, { kind: "box" }>;
  return {
    axes: [
      { aMin: a.min.x, aMax: a.max.x, bMin: b.min.x, bMax: b.max.x },
      { aMin: a.min.y, aMax: a.max.y, bMin: b.min.y, bMax: b.max.y },
      { aMin: a.min.z, aMax: a.max.z, bMin: b.min.z, bMax: b.max.z },
    ],
  };
}

/** The combination step: the separation metric from the interval table. */
function separationFromIntervalTable(
  axes: readonly {
    readonly aMin: number;
    readonly aMax: number;
    readonly bMin: number;
    readonly bMax: number;
  }[],
): number {
  const gapsPerAxis = axes.map(
    (axis) => Math.max(axis.aMin, axis.bMin) - Math.min(axis.aMax, axis.bMax),
  );
  const positiveGaps = gapsPerAxis.filter((gap) => gap > 0);
  if (positiveGaps.length > 0) {
    return Math.min(...positiveGaps);
  }
  return Math.max(...gapsPerAxis);
}

/** Construct the reference double. */
export function referenceClashPredicateDouble(): ClashPredicateAdapter {
  return new ReferenceClashPredicateDouble();
}

/** Construct the alternate double. */
export function alternateClashPredicateDouble(): ClashPredicateAdapter {
  return new AlternateClashPredicateDouble();
}
