/**
 * Shared reconstruction internals (AISE-026 → AISE-027).
 *
 * The pure code motion of the pipe-network internals out of
 * `network.ts` so the AISE-027 topology reconstruction reuses the
 * EXACT same canonicalization, pipe building, junction derivation
 * and pipe-network digest code (bit-identical composition — the
 * topology's pipe sub-representation is the AISE-026
 * representation, never a divergent copy).
 *
 * Not exported through the package index: this module is the
 * package's internal shared core.
 */
import { compareGeomPoints, type GeomPoint } from "@aise/backend-geometry";
import {
  canonicalJsonString,
  sha256Hex,
  modelProvenance,
  type EpistemicState,
  type ModelUnit,
  type Quantity,
} from "@aise/engineering-model";
import { MepError } from "./errors.js";
import type { PointCluster } from "./cluster.js";
import { distanceToSegment, type CylinderFit } from "./fit.js";
import type { MepJunction, MepPipe } from "./network.js";

/** The frozen length-unit vocabulary accepted for point coordinates. */
const LENGTH_UNITS: readonly string[] = Object.freeze([
  "meter",
  "millimeter",
  "centimeter",
  "inch",
  "foot",
]);

/** Diameter relation tolerance: |dA−dB| ≤ this fraction of the larger. */
export const DIAMETER_RELATION_FRACTION = 0.25;

/**
 * Canonicalizes the input points: validate (finite), copy, sort.
 *
 * The input's emission order never matters — the canonical order is
 * the sorted order. Fail-closed on non-finite coordinates BEFORE any
 * output.
 */
export function canonicalizeInput(points: readonly GeomPoint[]): {
  canonical: GeomPoint[];
  inputContentHash: string;
} {
  const canonical: GeomPoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      throw new MepError("NON_FINITE_INPUT", "point coordinates must be finite", {
        details: { point: `${point.x},${point.y},${point.z}` },
      });
    }
    canonical.push({ x: point.x, y: point.y, z: point.z });
  }
  canonical.sort(compareGeomPoints);
  return { canonical, inputContentHash: sha256Hex(canonicalJsonString(canonical)) };
}

/** Asserts the unit is in the frozen length vocabulary (fail-closed). */
export function assertLengthUnit(unit: string): string {
  if (!LENGTH_UNITS.includes(unit)) {
    throw new MepError("VALIDATION_FAILED", `unit must be one of ${LENGTH_UNITS.join(", ")}: ${unit}`, {
      details: { unit },
    });
  }
  return unit;
}

/** Asserts a numeric option is finite > 0 (fail-closed). */
export function assertPositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new MepError("OPTION_INVALID", `${field} must be finite > 0: ${String(value)}`, {
      details: { field, value: String(value) },
    });
  }
}

/** The unassigned record of one refused cluster (honest refusal). */
export function unassignedOf(
  cluster: PointCluster,
  reason: "insufficient-points" | "non-slender-cluster" | "unconnected-cluster",
): { pointCount: number; contentHash: string; reason: "insufficient-points" | "non-slender-cluster" | "unconnected-cluster" } {
  return { pointCount: cluster.points.length, contentHash: clusterHash(cluster), reason };
}

/** Content hash of one cluster's canonical member order. */
export function clusterHash(cluster: PointCluster): string {
  return sha256Hex(canonicalJsonString(cluster.points as unknown[]));
}

/** The pipe content hash over its canonical content (the AISE-011 lineage). */
export function pipeContentHashOf(
  centerline: { readonly start: { readonly x: number; readonly y: number; readonly z: number }; readonly end: { readonly x: number; readonly y: number; readonly z: number } },
  diameterValue: number,
  pointCount: number,
): string {
  return sha256Hex(canonicalJsonString([centerline.start, centerline.end, diameterValue, pointCount]));
}

/** Builds one `MepPipe` from a fitted cluster (the AISE-026 builder). */
export function pipeOf(
  fit: CylinderFit,
  unit: string,
  sourceEpistemic: EpistemicState,
  perPointSigma: number | undefined,
  inputContentHash: string,
  inputPointCount: number,
): MepPipe {
  // Uncertainties: standard-error estimates; ABSENT for noise-free
  // inputs (absent means not stated, never zero).
  const diameterError = standardError(fit);
  const diameterUncertainty = diameterError > 1e-12 ? diameterError : undefined;
  const lengthUncertainty =
    perPointSigma !== undefined && perPointSigma > 0 && fit.pointCount > 0
      ? (2 * perPointSigma) / Math.sqrt(fit.pointCount)
      : undefined;
  const pipe: Omit<MepPipe, "pipeId" | "contentHash"> = {
    centerline: { start: fit.start, end: fit.end },
    axis: fit.axis,
    diameter: {
      value: canonicalNumber(fit.diameter),
      unit: unit as ModelUnit,
      ...(diameterUncertainty !== undefined ? { uncertainty: { kind: "standard", u: diameterUncertainty } } : {}),
    },
    length: {
      value: canonicalNumber(fit.length),
      unit: unit as ModelUnit,
      ...(lengthUncertainty !== undefined ? { uncertainty: { kind: "standard", u: lengthUncertainty } } : {}),
    },
    epistemic: sourceEpistemic,
    residuals: fit.residuals,
    pointCount: fit.pointCount,
    provenance: modelProvenance("mep/pipe-fit-v1", { inputContentHash, pointCount: fit.pointCount }, [
      { kind: "point-set", contentHash: inputContentHash, pointCount: inputPointCount, epistemic: sourceEpistemic },
    ]),
  };
  const contentHash = pipeContentHashOf(pipe.centerline, pipe.diameter.value, pipe.pointCount);
  return {
    ...pipe,
    contentHash,
    pipeId: `mep-pipe-${contentHash.slice(0, 16)}`,
  };
}

/** 2·std(r)/√N — the standard error of the RMS-radius diameter estimate. */
export function standardError(fit: CylinderFit): number {
  // std of the radial distances is not carried by the fit; the RMS
  // and max bound it. Honest v1: use the RMS as the scale (for
  // shell-sampled clusters this approximates the radius spread;
  // documented in the limitations).
  if (fit.pointCount < 2) {
    return 0;
  }
  return (2 * fit.residuals.rms) / Math.sqrt(fit.pointCount);
}

/** Derives the endpoint-to-centerline junctions (the AISE-026 rules). */
export function junctionsOf(pipes: readonly MepPipe[], joinTolerance: number): MepJunction[] {
  // Raw hits: one pipe's endpoint near another pipe's centerline.
  interface Hit {
    readonly pipeIndex: number;
    readonly endpointIndex: 0 | 1;
    readonly nearIndex: number;
    readonly distance: number;
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
  }
  const hits: Hit[] = [];
  for (let a = 0; a < pipes.length; a += 1) {
    const pipe = pipes[a]!;
    for (const endpointIndex of [0, 1] as const) {
      const endpoint = endpointIndex === 0 ? pipe.centerline.start : pipe.centerline.end;
      for (let b = 0; b < pipes.length; b += 1) {
        if (a === b) {
          continue;
        }
        const near = pipes[b]!;
        const { distance, closest } = distanceToSegment(
          endpoint,
          near.centerline.start,
          near.centerline.end,
        );
        if (distance <= joinTolerance) {
          hits.push({ pipeIndex: a, endpointIndex, nearIndex: b, distance, position: closest });
        }
      }
    }
  }
  // Group by unordered pipe pair; one junction per pair (deterministic:
  // the first hit in canonical (pipeIndex, endpointIndex) order wins;
  // kind = coupled when both pipes contribute endpoints).
  const byPair = new Map<string, Hit[]>();
  for (const hit of hits) {
    const key = hit.pipeIndex < hit.nearIndex ? `${hit.pipeIndex}:${hit.nearIndex}` : `${hit.nearIndex}:${hit.pipeIndex}`;
    const bucket = byPair.get(key);
    if (bucket === undefined) {
      byPair.set(key, [hit]);
    } else {
      bucket.push(hit);
    }
  }
  const junctions: MepJunction[] = [];
  const pairOrder = (key: string): [number, number] => {
    const [a, b] = key.split(":").map(Number);
    return [a!, b!];
  };
  for (const [key, pairHits] of [...byPair.entries()].sort((x, y) => {
    const [xa, xb] = pairOrder(x[0] as string);
    const [ya, yb] = pairOrder(y[0] as string);
    return xa - ya || xb - yb;
  })) {
    const [aIndex, bIndex] = key.split(":").map(Number);
    const first = pairHits[0]!;
    const bothEnds = pairHits.some((hit) => hit.pipeIndex !== first.pipeIndex);
    const pipe = pipes[first.pipeIndex]!;
    const near = pipes[first.nearIndex]!;
    junctions.push({
      pipeId: pipe.pipeId,
      endpointIndex: first.endpointIndex,
      nearPipeId: near.pipeId,
      position: first.position,
      distance: canonicalNumber(first.distance),
      kind: bothEnds ? "coupled" : "branch",
      diameterRelation:
        Math.abs(pipe.diameter.value - near.diameter.value) <=
        DIAMETER_RELATION_FRACTION * Math.max(pipe.diameter.value, near.diameter.value)
          ? "compatible"
          : "mismatch",
    });
    void aIndex;
    void bIndex;
  }
  return junctions;
}

/** The pipe-network digest over the ordered pipe representation (AISE-026). */
export function networkDigest(network: {
  kind: "mep-pipe-network";
  unit: string;
  inputContentHash: string;
  sourceEpistemic: EpistemicState;
  pipes: readonly MepPipe[];
  junctions: readonly MepJunction[];
  unassigned: readonly { contentHash: string }[];
}): string {
  return sha256Hex(
    canonicalJsonString({
      kind: network.kind,
      unit: network.unit,
      inputContentHash: network.inputContentHash,
      sourceEpistemic: network.sourceEpistemic,
      pipes: network.pipes.map((pipe) => pipe.contentHash),
      junctions: network.junctions.map((junction) => [
        junction.pipeId,
        junction.endpointIndex,
        junction.nearPipeId,
        junction.kind,
        junction.diameterRelation,
      ]),
      unassigned: network.unassigned.map((entry) => entry.contentHash),
    }),
  );
}

/** +0 normalization (byte-stable canonical numbers). */
export function canonicalNumber(value: number): number {
  return value === 0 ? 0 : value;
}

/** Quantity helper: value + unit + optional standard uncertainty. */
export function quantityOf(
  value: number,
  unit: string,
  standardUncertainty: number | undefined,
): Quantity {
  return {
    value: canonicalNumber(value),
    unit: unit as ModelUnit,
    ...(standardUncertainty !== undefined ? { uncertainty: { kind: "standard", u: canonicalNumber(standardUncertainty) } } : {}),
  };
}
