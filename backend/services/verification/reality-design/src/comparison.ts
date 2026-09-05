/**
 * AISE-029 deterministic Reality-vs-Design comparison.
 *
 * Read-only comparison facts over normalized snapshots from the authoritative
 * Reality Graph and a design reference. This module never mutates or becomes
 * canonical model authority.
 */
import { createHash } from "node:crypto";

export type ComparisonStatus = "PASS" | "MISMATCH" | "INSUFFICIENT_EVIDENCE" | "AMBIGUOUS";

export interface EvidenceRef {
  readonly contentHash: string;
  readonly label: string;
  readonly epistemic: "OBSERVED" | "INFERRED" | "CONFIRMED" | "PROPOSED";
}

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DesignElement {
  readonly designId: string;
  readonly kind: string;
  readonly position: Point3;
  readonly positionUncertainty?: number;
  readonly size: number;
  readonly sizeUncertainty?: number;
  readonly provenance: readonly EvidenceRef[];
}

export interface RealityElement {
  readonly realityId: string;
  readonly kind: string;
  readonly position: Point3;
  readonly positionUncertainty?: number;
  readonly size: number;
  readonly sizeUncertainty?: number;
  readonly provenance: readonly EvidenceRef[];
}

export interface ComparisonInput {
  readonly unit: string;
  readonly design: readonly DesignElement[];
  readonly reality: readonly RealityElement[];
  readonly correspondenceTolerance?: number;
  readonly ambiguityMargin?: number;
  readonly positionTolerance?: number;
  readonly sizeTolerance?: number;
}

export interface Correspondence {
  readonly designId: string;
  readonly realityId: string;
  readonly distance: number;
  readonly score: number;
  readonly evidence: readonly EvidenceRef[];
}

export type MismatchKind = "position" | "size" | "kind";

export interface Mismatch {
  readonly designId?: string;
  readonly realityId?: string;
  readonly kind: MismatchKind;
  readonly observedDifference: number;
  readonly allowedDifference: number;
  readonly evidence: readonly EvidenceRef[];
}

export interface ComparisonReport {
  readonly kind: "reality-design-comparison";
  readonly unit: string;
  readonly status: ComparisonStatus;
  readonly digest: string;
  readonly correspondences: readonly Correspondence[];
  readonly mismatches: readonly Mismatch[];
  readonly unmatchedDesign: readonly string[];
  readonly unmatchedReality: readonly string[];
  readonly limitations: readonly string[];
}

const LIMITATIONS = Object.freeze([
  "Correspondence is deterministic geometric matching by kind and position; no semantic identity is inferred when evidence is absent.",
  "Ambiguous correspondence is fail-closed and is never coerced into a match.",
  "Reported mismatches are comparison facts only and do not mutate the canonical Reality Graph or design authority.",
  "Position and size comparisons carry input uncertainty; uncertainty does not become confidence and never silently upgrades epistemic state.",
  "Missing provenance is rejected at the input boundary rather than converted to a successful comparison.",
]);

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertPoint(point: Point3, label: string): void {
  assertFinite(point.x, `${label}.x`);
  assertFinite(point.y, `${label}.y`);
  assertFinite(point.z, `${label}.z`);
}

function assertEvidence(evidence: readonly EvidenceRef[], label: string): void {
  if (evidence.length === 0) throw new Error(`${label} has no provenance evidence`);
  for (const item of evidence) {
    if (item.contentHash.length === 0 || item.label.length === 0) {
      throw new Error(`${label} contains malformed provenance`);
    }
  }
}

function distance(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function combinedUncertainty(a: number | undefined, b: number | undefined): number {
  const ua = a ?? 0;
  const ub = b ?? 0;
  if (ua < 0 || ub < 0 || !Number.isFinite(ua) || !Number.isFinite(ub)) {
    throw new Error("uncertainty must be finite and non-negative");
  }
  return Math.hypot(ua, ub);
}

/** Canonical JSON for deterministic hashing, including recursively sorted object keys. */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",`)}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function reportBody(report: Omit<ComparisonReport, "digest">): object {
  return {
    kind: report.kind,
    unit: report.unit,
    status: report.status,
    correspondences: report.correspondences,
    mismatches: report.mismatches,
    unmatchedDesign: [...report.unmatchedDesign].sort(),
    unmatchedReality: [...report.unmatchedReality].sort(),
    limitations: report.limitations,
  };
}

/**
 * Compares normalized design/reference and authoritative reality snapshots.
 * Critical ambiguity fails closed as AMBIGUOUS; explicit disagreement is MISMATCH.
 */
export function compareRealityToDesign(input: ComparisonInput): ComparisonReport {
  const correspondenceTolerance = input.correspondenceTolerance ?? 0.25;
  const ambiguityMargin = input.ambiguityMargin ?? 0.05;
  const positionTolerance = input.positionTolerance ?? 0.05;
  const sizeTolerance = input.sizeTolerance ?? 0.05;
  for (const [name, value] of Object.entries({ correspondenceTolerance, ambiguityMargin, positionTolerance, sizeTolerance })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and non-negative`);
  }
  if (input.unit.trim().length === 0) throw new Error("unit is required");

  const designIds = new Set<string>();
  const realityIds = new Set<string>();
  for (const element of input.design) {
    if (designIds.has(element.designId)) throw new Error(`duplicate design id: ${element.designId}`);
    designIds.add(element.designId);
    assertPoint(element.position, `design ${element.designId}.position`);
    assertFinite(element.size, `design ${element.designId}.size`);
    if (element.size <= 0) throw new Error(`design ${element.designId}.size must be positive`);
    if (element.positionUncertainty !== undefined && (element.positionUncertainty < 0 || !Number.isFinite(element.positionUncertainty))) throw new Error(`invalid design position uncertainty: ${element.designId}`);
    if (element.sizeUncertainty !== undefined && (element.sizeUncertainty < 0 || !Number.isFinite(element.sizeUncertainty))) throw new Error(`invalid design size uncertainty: ${element.designId}`);
    assertEvidence(element.provenance, `design ${element.designId}`);
  }
  for (const element of input.reality) {
    if (realityIds.has(element.realityId)) throw new Error(`duplicate reality id: ${element.realityId}`);
    realityIds.add(element.realityId);
    assertPoint(element.position, `reality ${element.realityId}.position`);
    assertFinite(element.size, `reality ${element.realityId}.size`);
    if (element.size <= 0) throw new Error(`reality ${element.realityId}.size must be positive`);
    if (element.positionUncertainty !== undefined && (element.positionUncertainty < 0 || !Number.isFinite(element.positionUncertainty))) throw new Error(`invalid reality position uncertainty: ${element.realityId}`);
    if (element.sizeUncertainty !== undefined && (element.sizeUncertainty < 0 || !Number.isFinite(element.sizeUncertainty))) throw new Error(`invalid reality size uncertainty: ${element.realityId}`);
    assertEvidence(element.provenance, `reality ${element.realityId}`);
  }

  const matchedReality = new Set<string>();
  const correspondences: Correspondence[] = [];
  const mismatches: Mismatch[] = [];
  const unmatchedDesign: string[] = [];
  const unmatchedReality: string[] = [];
  let ambiguous = false;

  const sortedDesign = [...input.design].sort((a, b) => a.designId.localeCompare(b.designId));
  const sortedReality = [...input.reality].sort((a, b) => a.realityId.localeCompare(b.realityId));

  for (const design of sortedDesign) {
    const candidates = sortedReality
      .filter((reality) => !matchedReality.has(reality.realityId) && reality.kind === design.kind)
      .map((reality) => ({ reality, distance: distance(design.position, reality.position) }))
      .filter((candidate) => candidate.distance <= correspondenceTolerance)
      .sort((a, b) => a.distance - b.distance || a.reality.realityId.localeCompare(b.reality.realityId));

    if (candidates.length === 0) {
      unmatchedDesign.push(design.designId);
      continue;
    }

    const evidence = [...design.provenance, ...candidates[0]!.reality.provenance];
    if (candidates.length > 1 && candidates[1]!.distance - candidates[0]!.distance <= ambiguityMargin) {
      ambiguous = true;
      mismatches.push({
        designId: design.designId,
        realityId: candidates[0]!.reality.realityId,
        kind: "position",
        observedDifference: candidates[1]!.distance - candidates[0]!.distance,
        allowedDifference: ambiguityMargin,
        evidence: [...evidence, ...candidates[1]!.reality.provenance],
      });
      continue;
    }

    const reality = candidates[0]!.reality;
    matchedReality.add(reality.realityId);
    correspondences.push({
      designId: design.designId,
      realityId: reality.realityId,
      distance: candidates[0]!.distance,
      score: candidates[0]!.distance,
      evidence,
    });

    const positionAllowed = positionTolerance + combinedUncertainty(design.positionUncertainty, reality.positionUncertainty);
    if (candidates[0]!.distance > positionAllowed) {
      mismatches.push({ designId: design.designId, realityId: reality.realityId, kind: "position", observedDifference: candidates[0]!.distance, allowedDifference: positionAllowed, evidence });
    }

    const sizeDifference = Math.abs(design.size - reality.size);
    const sizeAllowed = sizeTolerance + combinedUncertainty(design.sizeUncertainty, reality.sizeUncertainty);
    if (sizeDifference > sizeAllowed) {
      mismatches.push({ designId: design.designId, realityId: reality.realityId, kind: "size", observedDifference: sizeDifference, allowedDifference: sizeAllowed, evidence });
    }
  }

  for (const reality of sortedReality) {
    if (!matchedReality.has(reality.realityId) && !correspondences.some((item) => item.realityId === reality.realityId)) unmatchedReality.push(reality.realityId);
  }

  const status: ComparisonStatus = ambiguous
    ? "AMBIGUOUS"
    : unmatchedDesign.length > 0 || unmatchedReality.length > 0 || mismatches.length > 0
      ? "MISMATCH"
      : "PASS";
  const body: Omit<ComparisonReport, "digest"> = {
    kind: "reality-design-comparison",
    unit: input.unit,
    status,
    correspondences,
    mismatches,
    unmatchedDesign: [...unmatchedDesign].sort(),
    unmatchedReality: [...unmatchedReality].sort(),
    limitations: LIMITATIONS,
  };
  return Object.freeze({ ...body, digest: sha256Hex(canonicalize(reportBody(body))) });
}

/** Recomputes and validates the content-bound report digest. */
export function validateComparisonReport(report: ComparisonReport): void {
  if (report.kind !== "reality-design-comparison") throw new Error("invalid comparison kind");
  if (!/^[0-9a-f]{64}$/.test(report.digest)) throw new Error("invalid comparison digest");
  const expected = sha256Hex(canonicalize(reportBody(report)));
  if (expected !== report.digest) throw new Error("comparison digest does not bind report content");
}

/** Computes the deterministic digest for a report body. */
export function comparisonDigest(report: Omit<ComparisonReport, "digest">): string {
  return sha256Hex(canonicalize(reportBody(report)));
}
