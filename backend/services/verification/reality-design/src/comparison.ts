/**
 * AISE-029 deterministic Reality-vs-Design comparison.
 *
 * This module is deliberately read-only: it consumes normalized snapshots
 * from the authoritative Reality Graph and a design reference, then emits
 * provenance-linked comparison facts. It never mutates or becomes the
 * canonical model authority.
 */

export type ComparisonStatus =
  | "PASS"
  | "MISMATCH"
  | "INSUFFICIENT_EVIDENCE"
  | "AMBIGUOUS";

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
  readonly size: number;
  readonly sizeUncertainty?: number;
  readonly provenance: readonly EvidenceRef[];
}

export interface RealityElement {
  readonly realityId: string;
  readonly kind: string;
  readonly position: Point3;
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
  "A missing provenance input produces INSUFFICIENT_EVIDENCE for the affected comparison rather than an inferred success.",
]);

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function assertFinitePoint(point: Point3, label: string): void {
  if (!finite(point.x) || !finite(point.y) || !finite(point.z)) {
    throw new Error(`${label} contains non-finite coordinates`);
  }
}

function assertEvidence(evidence: readonly EvidenceRef[], label: string): void {
  if (evidence.length === 0) {
    throw new Error(`${label} has no provenance evidence`);
  }
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
  if (ua < 0 || ub < 0 || !finite(ua) || !finite(ub)) {
    throw new Error("uncertainty must be finite and non-negative");
  }
  return Math.hypot(ua, ub);
}

function canonicalize<T>(value: T): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Compares normalized design/reference and authoritative reality snapshots.
 *
 * The function is deterministic and fail-closed. A report with ambiguous
 * correspondence, missing provenance, or explicit geometric disagreement
 * never becomes PASS.
 */
export async function compareRealityToDesign(input: ComparisonInput): Promise<ComparisonReport> {
  const correspondenceTolerance = input.correspondenceTolerance ?? 0.25;
  const ambiguityMargin = input.ambiguityMargin ?? 0.05;
  const positionTolerance = input.positionTolerance ?? 0.05;
  const sizeTolerance = input.sizeTolerance ?? 0.05;
  for (const [name, value] of Object.entries({ correspondenceTolerance, ambiguityMargin, positionTolerance, sizeTolerance })) {
    if (!finite(value) || value < 0) {
      throw new Error(`${name} must be finite and non-negative`);
    }
  }
  if (input.unit.trim().length === 0) {
    throw new Error("unit is required");
  }

  const designIds = new Set<string>();
  const realityIds = new Set<string>();
  let insufficientEvidence = false;
  for (const element of input.design) {
    if (designIds.has(element.designId)) throw new Error(`duplicate design id: ${element.designId}`);
    designIds.add(element.designId);
    assertFinitePoint(element.position, `design ${element.designId}`);
    if (!finite(element.size) || element.size <= 0) throw new Error(`invalid design size: ${element.designId}`);
    assertEvidence(element.provenance, `design ${element.designId}`);
  }
  for (const element of input.reality) {
    if (realityIds.has(element.realityId)) throw new Error(`duplicate reality id: ${element.realityId}`);
    realityIds.add(element.realityId);
    assertFinitePoint(element.position, `reality ${element.realityId}`);
    if (!finite(element.size) || element.size <= 0) throw new Error(`invalid reality size: ${element.realityId}`);
    assertEvidence(element.provenance, `reality ${element.realityId}`);
  }

  const matchedReality = new Set<string>();
  const correspondences: Correspondence[] = [];
  const mismatches: Mismatch[] = [];
  const unmatchedDesign: string[] = [];
  const unmatchedReality: string[] = [];

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
    if (candidates.length > 1 && candidates[1]!.distance - candidates[0]!.distance <= ambiguityMargin) {
      correspondences.push({
        designId: design.designId,
        realityId: candidates[0]!.reality.realityId,
        distance: candidates[0]!.distance,
        score: candidates[0]!.distance,
        evidence: [...design.provenance, ...candidates[0]!.reality.provenance],
      });
      insufficientEvidence = true;
      mismatches.push({
        designId: design.designId,
        realityId: candidates[0]!.reality.realityId,
        kind: "position",
        observedDifference: candidates[1]!.distance - candidates[0]!.distance,
        allowedDifference: ambiguityMargin,
        evidence: [...design.provenance, ...candidates[0]!.reality.provenance, ...candidates[1]!.reality.provenance],
      });
      matchedReality.add(candidates[0]!.reality.realityId);
      continue;
    }

    const reality = candidates[0]!.reality;
    matchedReality.add(reality.realityId);
    const evidence = [...design.provenance, ...reality.provenance];
    correspondences.push({
      designId: design.designId,
      realityId: reality.realityId,
      distance: candidates[0]!.distance,
      score: candidates[0]!.distance,
      evidence,
    });

    const positionAllowed = positionTolerance + combinedUncertainty(undefined, reality.sizeUncertainty);
    if (candidates[0]!.distance > positionAllowed) {
      mismatches.push({
        designId: design.designId,
        realityId: reality.realityId,
        kind: "position",
        observedDifference: candidates[0]!.distance,
        allowedDifference: positionAllowed,
        evidence,
      });
    }

    const sizeDifference = Math.abs(design.size - reality.size);
    const sizeAllowed = sizeTolerance + combinedUncertainty(design.sizeUncertainty, reality.sizeUncertainty);
    if (sizeDifference > sizeAllowed) {
      mismatches.push({
        designId: design.designId,
        realityId: reality.realityId,
        kind: "size",
        observedDifference: sizeDifference,
        allowedDifference: sizeAllowed,
        evidence,
      });
    }
  }

  for (const reality of sortedReality) {
    if (!matchedReality.has(reality.realityId)) unmatchedReality.push(reality.realityId);
  }

  const status: ComparisonStatus = insufficientEvidence
    ? "INSUFFICIENT_EVIDENCE"
    : unmatchedDesign.length > 0 || unmatchedReality.length > 0 || mismatches.length > 0
      ? "MISMATCH"
      : "PASS";

  const body = {
    kind: "reality-design-comparison",
    unit: input.unit,
    status,
    correspondences,
    mismatches,
    unmatchedDesign: [...unmatchedDesign].sort(),
    unmatchedReality: [...unmatchedReality].sort(),
    limitations: LIMITATIONS,
  };
  const digest = await sha256Hex(canonicalize(body));
  return Object.freeze({ ...body, digest });
}

/** Recomputes and validates the content-bound report digest. */
export async function validateComparisonReport(report: ComparisonReport): Promise<void> {
  if (report.kind !== "reality-design-comparison") throw new Error("invalid comparison kind");
  if (!/^[0-9a-f]{64}$/.test(report.digest)) throw new Error("invalid comparison digest");
  const body = {
    kind: report.kind,
    unit: report.unit,
    status: report.status,
    correspondences: report.correspondences,
    mismatches: report.mismatches,
    unmatchedDesign: [...report.unmatchedDesign].sort(),
    unmatchedReality: [...report.unmatchedReality].sort(),
    limitations: report.limitations,
  };
  const expected = await sha256Hex(canonicalize(body));
  if (expected !== report.digest) throw new Error("comparison digest does not bind report content");
}

/** Computes the content digest without changing the report. */
export async function comparisonDigest(report: Omit<ComparisonReport, "digest">): Promise<string> {
  return sha256Hex(canonicalize({
    kind: report.kind,
    unit: report.unit,
    status: report.status,
    correspondences: report.correspondences,
    mismatches: report.mismatches,
    unmatchedDesign: [...report.unmatchedDesign].sort(),
    unmatchedReality: [...report.unmatchedReality].sort(),
    limitations: report.limitations,
  }));
}
