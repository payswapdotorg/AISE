/**
 * PROD-018 — the CONSEQUENTIAL-BOUNDARY LABEL MODEL (pure logic).
 *
 * Uncertainty/provenance/verification visibility at the consequential
 * boundaries the competitor simulation demands (quantities, validations,
 * outcomes): the composition collects the labels the EXISTING contracts
 * and records already carry — mapping/interpretation confidence, source
 * cell refs, source-of-record identity, epistemic states, approval
 * states, operation failures, post-work evidence — and presents them AT
 * the boundary where they become consequential.
 *
 * THE HONESTY RULE: a label is rendered ONLY when a record states it.
 * The model NEVER invents, estimates, upgrades or summarizes a label:
 * each entry carries its recorded basis, and an absent record renders
 * the explicit empty state (the caller's honest-empty discipline).
 *
 * Determinism: pure functions; no clock, no randomness, no IO, no React.
 */

import type { BoqLensItem } from "../boqlens";
import type {
  BOQContext,
  InterventionScenarioSummary,
  OperationResult,
  OutcomeSummary,
} from "../app/task-contract";
import type {
  ComparisonSummaryRecord,
  ExecutionSummaryRecord,
} from "../app/api";
import { plural, shortId } from "../app/format";

/* ------------------------------------------------------------------ */
/* Label shapes                                                         */
/* ------------------------------------------------------------------ */

/** The boundary kinds the composition surfaces labels at. */
export type BoundaryKind = "quantity" | "validation" | "outcome";

/** What a boundary label states (the label families of the records). */
export type BoundaryLabelFamily =
  | "uncertainty"
  | "provenance"
  | "verification"
  | "epistemic";

/** One boundary label: the statement + the recorded basis it came from. */
export interface BoundaryLabel {
  readonly family: BoundaryLabelFamily;
  readonly text: string;
  readonly basis: string;
}

/** One boundary's composed label set (may be empty — the honest empty state). */
export interface BoundaryLabelSet {
  readonly boundary: BoundaryKind;
  readonly labels: readonly BoundaryLabel[];
}

/* ------------------------------------------------------------------ */
/* The quantity boundary (a BOQ line becomes cost-consequential)         */
/* ------------------------------------------------------------------ */

/**
 * The labels of ONE QUANTITY BOUNDARY: the BOQ row the cost statement
 * rests on. Carried verbatim from the records:
 *
 *  - UNCERTAINTY: the mapping confidence, the interpretation confidence
 *    (each with its recorded method), the unresolved/uncertain states;
 *  - PROVENANCE: the source cell refs, the dictionary/normalizer
 *    versions, the source-of-record identity (the incumbent system stays
 *    the authority for its own scope), the import's revision;
 *  - EPISTEMIC: the derived status of interpretation and mapping
 *    (derived markers — the lens never states a source fact as derived
 *    truth).
 */
export function quantityBoundaryLabels(
  item: BoqLensItem,
  boq: BOQContext | null,
): BoundaryLabelSet {
  const labels: BoundaryLabel[] = [];
  const mapping = item.mapping ?? null;
  const interpretation = item.interpretation ?? null;

  if (mapping !== null) {
    labels.push({
      family: "uncertainty",
      text: `mapping ${mapping.status} — confidence ${mapping.confidence} (method ${mapping.method})`,
      basis: `the mapping record ${mapping.entryId}`,
    });
  } else {
    labels.push({
      family: "uncertainty",
      text: "no mapping record — the row's quantity is not linked to any reality element",
      basis: "the lens input carries no mapping entry for this row",
    });
  }
  if (interpretation !== null) {
    const description = interpretation.description;
    if (description === null) {
      labels.push({
        family: "uncertainty",
        text: "no interpretation description record — the row's reading is not interpreted",
        basis: `the interpretation record for ${item.descriptionCellRef ?? "(no cell ref)"}`,
      });
    } else if (description.conceptCode === undefined) {
      labels.push({
        family: "uncertainty",
        text: `interpretation unresolved — confidence ${description.confidence}`,
        basis: `the interpretation record for ${item.descriptionCellRef ?? "(no cell ref)"}`,
      });
    } else {
      labels.push({
        family: "uncertainty",
        text: `interpretation ${description.conceptCode} — confidence ${description.confidence} (method ${description.method})`,
        basis: `the interpretation record for ${item.descriptionCellRef ?? "(no cell ref)"}`,
      });
    }
  }
  const cellRefs = [
    item.descriptionCellRef,
    item.unitCellRef,
    item.quantity?.cellRef ?? null,
    item.rate?.cellRef ?? null,
    item.amount?.cellRef ?? null,
  ].filter((entry): entry is string => entry !== null);
  if (cellRefs.length > 0) {
    labels.push({
      family: "provenance",
      text: `source cells ${cellRefs.join(", ")}`,
      basis: "the row's own cell references (the verbatim source anchors)",
    });
  }
  if (mapping?.provenance.dictionaryVersion !== undefined) {
    labels.push({
      family: "provenance",
      text: `dictionary ${mapping.provenance.dictionaryVersion} · normalizer ${mapping.provenance.normalizerVersion ?? "—"} · matched on ${mapping.provenance.matchedOn ?? "—"}`,
      basis: `the mapping record ${mapping.entryId}'s provenance`,
    });
  }
  if (boq !== null) {
    const source =
      boq.sourceRecordRef === undefined
        ? boq.sourceSystem
        : `${boq.sourceSystem} ${boq.sourceRecordRef}`;
    labels.push({
      family: "provenance",
      text: `source of record: ${source} · revision ${String(boq.revision)} — the incumbent stays the authority for its own scope`,
      basis: `the BOQContext of ${boq.boqId} (server-owned contract object)`,
    });
  }
  labels.push({
    family: "epistemic",
    text: "interpretation and mapping are DERIVED records — original wording is preserved verbatim and never overwritten",
    basis: "the BOQ Lens discipline (the lens never writes back)",
  });
  return { boundary: "quantity", labels };
}

/* ------------------------------------------------------------------ */
/* The validation boundary (a proposal/operation becomes approved)       */
/* ------------------------------------------------------------------ */

/**
 * The labels of ONE VALIDATION BOUNDARY: the intervention proposal and
 * the operation result that gate execution. Carried verbatim: the
 * scenario's epistemic state (PROPOSED stays PROPOSED), its approval
 * state, the operation's status and typed failure (when one is recorded).
 */
export function validationBoundaryLabels(
  scenario: InterventionScenarioSummary | null,
  operation: OperationResult | null,
): BoundaryLabelSet {
  const labels: BoundaryLabel[] = [];
  if (scenario !== null) {
    labels.push({
      family: "epistemic",
      text: `scenario v${String(scenario.version)} is ${scenario.epistemicState} — a proposal, never observed reality`,
      basis: `the InterventionScenarioSummary ${scenario.scenarioId}`,
    });
    labels.push({
      family: "verification",
      text: `approval ${scenario.approvalState} — a review decision, not an observed fact`,
      basis: `the InterventionScenarioSummary ${scenario.scenarioId}`,
    });
  }
  if (operation !== null) {
    labels.push({
      family: "verification",
      text: `operation ${operation.operationId} — ${operation.status}`,
      basis: `the OperationResult ${operation.operationId} (server-authoritative)`,
    });
    if (operation.failure !== undefined) {
      labels.push({
        family: "verification",
        text: `typed failure ${operation.failure.code}: ${operation.failure.detail}`,
        basis: `the OperationResult ${operation.operationId}'s failure record`,
      });
    }
  }
  return { boundary: "validation", labels };
}

/* ------------------------------------------------------------------ */
/* The outcome boundary (work becomes an observed outcome)              */
/* ------------------------------------------------------------------ */

/**
 * The labels of ONE OUTCOME BOUNDARY: the post-work evidence that turns
 * executed work into an OBSERVED outcome. Carried verbatim: the outcome's
 * epistemic state, its post-work evidence content ids, the comparison
 * availability, and the live execution/comparison summaries' own counts.
 */
export function outcomeBoundaryLabels(
  outcome: OutcomeSummary | null,
  execution: ExecutionSummaryRecord | null,
  comparison: ComparisonSummaryRecord | null,
): BoundaryLabelSet {
  const labels: BoundaryLabel[] = [];
  if (outcome !== null) {
    labels.push({
      family: "epistemic",
      text: `outcome ${outcome.outcomeId} is ${outcome.epistemicState} — observed only with post-work evidence`,
      basis: `the OutcomeSummary ${outcome.outcomeId}`,
    });
    if (outcome.postWorkEvidenceContentIds.length > 0) {
      labels.push({
        family: "provenance",
        text: `post-work evidence ${outcome.postWorkEvidenceContentIds
          .map((id) => shortId(id))
          .join(", ")}`,
        basis: `the OutcomeSummary ${outcome.outcomeId}'s postWorkEvidenceContentIds`,
      });
    }
    labels.push({
      family: "verification",
      text: outcome.comparisonAvailable
        ? "a before/after comparison is recorded as available for this outcome"
        : "no before/after comparison is recorded for this outcome",
      basis: `the OutcomeSummary ${outcome.outcomeId}'s comparisonAvailable (carried verbatim)`,
    });
  }
  if (execution !== null) {
    labels.push({
      family: "verification",
      text: `execution ${execution.executionRecordId}: ${plural(execution.executedStepCount, "step")} · ${plural(execution.evidenceCount, "evidence record")} · ${plural(execution.outcomeCount, "outcome")}`,
      basis: `the executions namespace's summary record ${execution.executionRecordId}`,
    });
  }
  if (comparison !== null) {
    labels.push({
      family: "verification",
      text: `comparison ${comparison.comparisonId}: ${plural(comparison.totalEntries, "entry", "entries")} · ${plural(comparison.discrepancies, "discrepancy", "discrepancies")} (design ${comparison.designSourceRecordId}${comparison.designRevision === null ? "" : ` rev ${comparison.designRevision}`} vs reality ${comparison.versionId})`,
      basis: `the comparisons namespace's summary record ${comparison.comparisonId}`,
    });
  }
  return { boundary: "outcome", labels };
}
