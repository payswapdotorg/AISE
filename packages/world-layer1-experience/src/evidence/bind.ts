/**
 * `@aise/world-layer1-experience` — the EVIDENCE BINDERS
 * (WORLD-P1, `src/evidence/bind.ts`).
 *
 * The builders that bind every lane output to the EVIDENCE ENVELOPE
 * through the existing shared-contracts seam types (`Derivation`,
 * `ProvenanceLink` — imported, never redefined):
 *
 *  - `bindFragmentEvidence`   — the spatialized fragment (subject kind
 *    `world_fragment`, DERIVED_FROM every asset's evidence content id);
 *  - `bindWorldEvidence`      — the composed world (subject kind
 *    `reality_object`, one link per capture/plan element);
 *  - `bindComparisonEvidence` — the comparison report (subject kind
 *    `comparison_verdict`, DERIVED_FROM the paired elements' evidence);
 *  - `bindMeasurementEvidence` — the measurement results (subject kind
 *    `measurement`, DERIVED_FROM the measured elements' evidence).
 *
 * THE EPISTEMIC LAW: every binding enters as INFERRED — a
 * capture-derived fact is a derived candidate until AISE gates accept
 * it (the lane never promotes; promotion is the Reality Graph's).
 *
 * DETERMINISM: the derivations carry the lane's method identities and
 * the subjects' declared instants; ids are content-derived where the
 * builder mints them (no randomness, no clock).
 */

import { laneOk, laneRefuse, type LaneOutcome } from "../failures";
import type { EvidenceEnvelopeBinding } from "./contract";
import { EVIDENCE_PORTS } from "./contract";
import type { SpatializedWorldFragment } from "../capture/contract";
import type { NavigableWorld } from "../world/contract";
import type { ComparisonReport, MeasurementResult } from "../compare/contract";
import type { Derivation, ProvenanceLink } from "@aise/shared-contracts";

/** The shared-contracts contract version stamp the builders emit. */
const CONTRACT_VERSION = "1.1.0";

function link(
  subjectKind: string,
  subjectId: string,
  evidenceContentId: string,
  role: ProvenanceLink["role"],
): ProvenanceLink {
  return {
    contractVersion: CONTRACT_VERSION,
    subjectKind,
    subjectId,
    evidenceContentId,
    role,
  };
}

/** EVIDENCE: bind a spatialized fragment to the envelope. */
export function bindFragmentEvidence(
  fragment: SpatializedWorldFragment,
): LaneOutcome<EvidenceEnvelopeBinding> {
  if (fragment.evidenceContentIds.length === 0) {
    return laneRefuse(
      "contract-mismatch",
      EVIDENCE_PORTS.bindFragment,
      "fragment carries no evidence content ids — nothing to bind",
      fragment.fragmentId,
    );
  }
  const derivation: Derivation = {
    ...fragment.derivation,
    method: "spatialization.capture-session",
  };
  const links = fragment.evidenceContentIds.map((contentId) =>
    link("world_fragment", fragment.fragmentId, contentId, "DERIVED_FROM"),
  );
  return laneOk({
    subjectKind: "world_fragment",
    subjectId: fragment.fragmentId,
    links,
    derivation,
    epistemicStatus: "INFERRED",
  });
}

/** EVIDENCE: bind a composed world to the envelope (per-element links). */
export function bindWorldEvidence(
  world: NavigableWorld,
): LaneOutcome<EvidenceEnvelopeBinding> {
  const bindable = world.elementProvenance.filter(
    (record) => record.evidenceContentIds.length > 0,
  );
  if (bindable.length === 0) {
    return laneRefuse(
      "retrieval-failure",
      EVIDENCE_PORTS.bindWorld,
      "world carries no evidence-backed elements — a binding would be an empty chain " +
        "(never a fabricated one)",
      world.worldId,
    );
  }
  const links: ProvenanceLink[] = [];
  for (const record of bindable) {
    for (const contentId of record.evidenceContentIds) {
      links.push(link("reality_object", record.elementId, contentId, "DERIVED_FROM"));
    }
  }
  return laneOk({
    subjectKind: "reality_object",
    subjectId: world.worldId,
    links,
    derivation: { ...world.derivation, method: "reconstruction.world-compose" },
    epistemicStatus: "INFERRED",
  });
}

/** EVIDENCE: bind a comparison report to the envelope. */
export function bindComparisonEvidence(
  report: ComparisonReport,
  world: NavigableWorld,
): LaneOutcome<EvidenceEnvelopeBinding> {
  // The evidence chain of a verdict: the UNION of the paired elements'
  // provenance chains (never a fabricated chain — unprovenanced
  // elements refuse).
  const evidenceContentIds: string[] = [];
  for (const verdict of report.verdicts) {
    for (const elementId of [verdict.modelElementId, verdict.captureElementId]) {
      const record = world.elementProvenance.find(
        (candidate) => candidate.elementId === elementId,
      );
      if (!record) {
        return laneRefuse(
          "retrieval-failure",
          EVIDENCE_PORTS.bindComparison,
          `verdict element has no provenance in the world: ${elementId} — ` +
            "a comparison binding requires real chains",
          elementId,
        );
      }
      for (const contentId of record.evidenceContentIds) {
        if (!evidenceContentIds.includes(contentId)) evidenceContentIds.push(contentId);
      }
    }
  }
  const links = evidenceContentIds.map((contentId) =>
    link("comparison_verdict", report.reportId, contentId, "DERIVED_FROM"),
  );
  const derivation: Derivation = {
    contractVersion: CONTRACT_VERSION,
    derivationId: `derive-comparison-${report.reportId.slice(0, 12)}`,
    outputContentId: report.reportId,
    inputEvidenceContentIds: [...evidenceContentIds],
    method: "comparison.model-capture",
    methodVersion: "layer1-contract/1",
    parameters: {
      "comparison.worldRevision": String(report.worldRevision),
      "comparison.tolerance.linear": String(report.appliedTolerance.linear),
      "comparison.tolerance.angular": String(report.appliedTolerance.angular),
    },
    createdAt: world.derivation.createdAt,
  };
  return laneOk({
    subjectKind: "comparison_verdict",
    subjectId: report.reportId,
    links,
    derivation,
    epistemicStatus: "INFERRED",
  });
}

/** EVIDENCE: bind measurement results to the envelope.
 *
 * The binding instant is a DECLARED input (the lane's measurement
 * results carry tolerances/units, not instants — the caller declares
 * the binding instant; the builder never reads a clock).
 */
export function bindMeasurementEvidence(
  results: readonly MeasurementResult[],
  declaredAt: string,
): LaneOutcome<EvidenceEnvelopeBinding> {
  if (results.length === 0) {
    return laneRefuse(
      "contract-mismatch",
      EVIDENCE_PORTS.bindMeasurements,
      "no measurement results to bind",
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(declaredAt)) {
    return laneRefuse(
      "contract-mismatch",
      EVIDENCE_PORTS.bindMeasurements,
      `declaredAt is not an ISO-8601 UTC instant: ${String(declaredAt)}`,
    );
  }
  const evidenceContentIds: string[] = [];
  for (const result of results) {
    for (const contentId of result.evidenceContentIds) {
      if (!evidenceContentIds.includes(contentId)) evidenceContentIds.push(contentId);
    }
  }
  if (evidenceContentIds.length === 0) {
    return laneRefuse(
      "retrieval-failure",
      EVIDENCE_PORTS.bindMeasurements,
      "measurements carry no evidence content ids — a binding would be an empty chain",
    );
  }
  const subjectId = `measurements-${results[0]!.queryId}-${results.length}`;
  const links = evidenceContentIds.map((contentId) =>
    link("measurement", subjectId, contentId, "DERIVED_FROM"),
  );
  return laneOk({
    subjectKind: "measurement",
    subjectId,
    links,
    derivation: {
      contractVersion: CONTRACT_VERSION,
      derivationId: `derive-measurements-${subjectId}`,
      outputContentId: subjectId,
      inputEvidenceContentIds: [...evidenceContentIds],
      method: "world.measurement",
      methodVersion: "layer1-contract/1",
      parameters: { "measurement.count": String(results.length) },
      createdAt: declaredAt,
    },
    epistemicStatus: "INFERRED",
  });
}
