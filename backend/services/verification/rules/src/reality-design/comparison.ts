/** AISE-029 deterministic Reality-vs-Design comparison; read-only verification facts. */
import { createHash } from "node:crypto";

export type ComparisonStatus = "PASS" | "MISMATCH" | "INSUFFICIENT_EVIDENCE" | "AMBIGUOUS";
export interface EvidenceRef { readonly contentHash: string; readonly label: string; readonly epistemic: "OBSERVED" | "INFERRED" | "CONFIRMED" | "PROPOSED"; }
export interface Point3 { readonly x: number; readonly y: number; readonly z: number; }
export interface DesignElement { readonly designId: string; readonly kind: string; readonly position: Point3; readonly positionUncertainty?: number; readonly size: number; readonly sizeUncertainty?: number; readonly provenance: readonly EvidenceRef[]; }
export interface RealityElement { readonly realityId: string; readonly kind: string; readonly position: Point3; readonly positionUncertainty?: number; readonly size: number; readonly sizeUncertainty?: number; readonly provenance: readonly EvidenceRef[]; }
export interface ComparisonInput { readonly unit: string; readonly design: readonly DesignElement[]; readonly reality: readonly RealityElement[]; readonly correspondenceTolerance?: number; readonly ambiguityMargin?: number; readonly positionTolerance?: number; readonly sizeTolerance?: number; }
export interface Correspondence { readonly designId: string; readonly realityId: string; readonly distance: number; readonly score: number; readonly evidence: readonly EvidenceRef[]; }
export type MismatchKind = "position" | "size" | "kind";
export interface Mismatch { readonly designId?: string; readonly realityId?: string; readonly kind: MismatchKind; readonly observedDifference: number; readonly allowedDifference: number; readonly evidence: readonly EvidenceRef[]; }
export interface ComparisonReport { readonly kind: "reality-design-comparison"; readonly unit: string; readonly status: ComparisonStatus; readonly digest: string; readonly correspondences: readonly Correspondence[]; readonly mismatches: readonly Mismatch[]; readonly unmatchedDesign: readonly string[]; readonly unmatchedReality: readonly string[]; readonly limitations: readonly string[]; }

export const REALITY_DESIGN_LIMITATIONS = Object.freeze([
  "Correspondence is deterministic geometric matching by kind and position; no semantic identity is inferred.",
  "Ambiguous correspondence is fail-closed and is never coerced into a match.",
  "Reported mismatches are comparison facts only and do not mutate canonical Reality Graph or design authority.",
  "Position and size comparisons use only the uncertainty attached to that measured quantity.",
  "Missing provenance is rejected at the input boundary rather than converted into success.",
]);

const finite = (v: number, label: string) => { if (!Number.isFinite(v)) throw new Error(`${label} must be finite`); };
const pointCheck = (p: Point3, label: string) => { finite(p.x, `${label}.x`); finite(p.y, `${label}.y`); finite(p.z, `${label}.z`); };
const evidenceCheck = (e: readonly EvidenceRef[], label: string) => { if (!e.length) throw new Error(`${label} has no provenance evidence`); for (const x of e) if (!x.contentHash.length || !x.label.length) throw new Error(`${label} contains malformed provenance`); };
const dist = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const combinedUncertainty = (a: number | undefined, b: number | undefined) => { const ua = a ?? 0; const ub = b ?? 0; if (ua < 0 || ub < 0 || !Number.isFinite(ua) || !Number.isFinite(ub)) throw new Error("uncertainty must be finite and non-negative"); return Math.hypot(ua, ub); };
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") { const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)); return `{${entries.map(([k,v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`; }
  return JSON.stringify(value);
}
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const bodyOf = (r: Omit<ComparisonReport, "digest">) => ({ kind: r.kind, unit: r.unit, status: r.status, correspondences: r.correspondences, mismatches: r.mismatches, unmatchedDesign: [...r.unmatchedDesign].sort(), unmatchedReality: [...r.unmatchedReality].sort(), limitations: r.limitations });

/** Deterministic, read-only, fail-closed comparison of design and reality snapshots. */
export function compareRealityToDesign(input: ComparisonInput): ComparisonReport {
  const correspondenceTolerance = input.correspondenceTolerance ?? 0.25;
  const ambiguityMargin = input.ambiguityMargin ?? 0.05;
  const positionTolerance = input.positionTolerance ?? 0.05;
  const sizeTolerance = input.sizeTolerance ?? 0.05;
  for (const [name, value] of Object.entries({ correspondenceTolerance, ambiguityMargin, positionTolerance, sizeTolerance })) if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and non-negative`);
  if (!input.unit.trim()) throw new Error("unit is required");

  const designIds = new Set<string>(); const realityIds = new Set<string>();
  for (const e of input.design) { if (designIds.has(e.designId)) throw new Error(`duplicate design id: ${e.designId}`); designIds.add(e.designId); pointCheck(e.position, `design ${e.designId}.position`); finite(e.size, `design ${e.designId}.size`); if (e.size <= 0) throw new Error(`design ${e.designId}.size must be positive`); if (e.positionUncertainty !== undefined && (e.positionUncertainty < 0 || !Number.isFinite(e.positionUncertainty))) throw new Error(`invalid design position uncertainty: ${e.designId}`); if (e.sizeUncertainty !== undefined && (e.sizeUncertainty < 0 || !Number.isFinite(e.sizeUncertainty))) throw new Error(`invalid design size uncertainty: ${e.designId}`); evidenceCheck(e.provenance, `design ${e.designId}`); }
  for (const e of input.reality) { if (realityIds.has(e.realityId)) throw new Error(`duplicate reality id: ${e.realityId}`); realityIds.add(e.realityId); pointCheck(e.position, `reality ${e.realityId}.position`); finite(e.size, `reality ${e.realityId}.size`); if (e.size <= 0) throw new Error(`reality ${e.realityId}.size must be positive`); if (e.positionUncertainty !== undefined && (e.positionUncertainty < 0 || !Number.isFinite(e.positionUncertainty))) throw new Error(`invalid reality position uncertainty: ${e.realityId}`); if (e.sizeUncertainty !== undefined && (e.sizeUncertainty < 0 || !Number.isFinite(e.sizeUncertainty))) throw new Error(`invalid reality size uncertainty: ${e.realityId}`); evidenceCheck(e.provenance, `reality ${e.realityId}`); }

  const matched = new Set<string>(); const correspondences: Correspondence[] = []; const mismatches: Mismatch[] = []; const unmatchedDesign: string[] = []; const unmatchedReality: string[] = []; let ambiguous = false;
  const designs = [...input.design].sort((a,b) => a.designId.localeCompare(b.designId)); const realities = [...input.reality].sort((a,b) => a.realityId.localeCompare(b.realityId));
  for (const d of designs) {
    const candidates = realities.filter(r => !matched.has(r.realityId) && r.kind === d.kind).map(r => ({ reality:r, distance:dist(d.position,r.position) })).filter(c => c.distance <= correspondenceTolerance).sort((a,b) => a.distance-b.distance || a.reality.realityId.localeCompare(b.reality.realityId));
    if (!candidates.length) { unmatchedDesign.push(d.designId); continue; }
    if (candidates.length > 1 && candidates[1]!.distance - candidates[0]!.distance <= ambiguityMargin) {
      ambiguous = true; unmatchedDesign.push(d.designId);
      mismatches.push({ designId:d.designId, kind:"position", observedDifference:candidates[1]!.distance-candidates[0]!.distance, allowedDifference:ambiguityMargin, evidence:[...d.provenance,...candidates[0]!.reality.provenance,...candidates[1]!.reality.provenance] });
      continue;
    }
    const r = candidates[0]!.reality; matched.add(r.realityId); const evidence = [...d.provenance,...r.provenance];
    correspondences.push({ designId:d.designId, realityId:r.realityId, distance:candidates[0]!.distance, score:candidates[0]!.distance, evidence });
    const pAllowed = positionTolerance + combinedUncertainty(d.positionUncertainty,r.positionUncertainty); if (candidates[0]!.distance > pAllowed) mismatches.push({ designId:d.designId,realityId:r.realityId,kind:"position",observedDifference:candidates[0]!.distance,allowedDifference:pAllowed,evidence });
    const sd = Math.abs(d.size-r.size); const sAllowed = sizeTolerance + combinedUncertainty(d.sizeUncertainty,r.sizeUncertainty); if (sd > sAllowed) mismatches.push({ designId:d.designId,realityId:r.realityId,kind:"size",observedDifference:sd,allowedDifference:sAllowed,evidence });
  }
  for (const r of realities) if (!matched.has(r.realityId)) unmatchedReality.push(r.realityId);
  const status: ComparisonStatus = ambiguous ? "AMBIGUOUS" : unmatchedDesign.length || unmatchedReality.length || mismatches.length ? "MISMATCH" : "PASS";
  const body: Omit<ComparisonReport,"digest"> = { kind:"reality-design-comparison", unit:input.unit, status, correspondences, mismatches, unmatchedDesign:[...unmatchedDesign].sort(), unmatchedReality:[...unmatchedReality].sort(), limitations:REALITY_DESIGN_LIMITATIONS };
  return Object.freeze({ ...body, digest:hash(canonicalize(bodyOf(body))) });
}

/** Fail-closed content-bound report validator. */
export function validateComparisonReport(report: ComparisonReport): void {
  if (report.kind !== "reality-design-comparison" || !/^[0-9a-f]{64}$/.test(report.digest)) throw new Error("invalid comparison report");
  if (hash(canonicalize(bodyOf(report))) !== report.digest) throw new Error("comparison digest does not bind report content");
}
export function comparisonDigest(report: Omit<ComparisonReport,"digest">): string { return hash(canonicalize(bodyOf(report))); }
