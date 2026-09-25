/**
 * HFX-401 — the PROMOTION-VOCABULARY MAPPING RECORD (documented, versioned).
 *
 * The work order's scope demands: "Define promotion states: evaluating,
 * benchmark_pass, production_candidate, approved, rejected, retired." The
 * HFX-000 control plane (`packages/provider-registry` — imported, NEVER
 * modified, NEVER extended with new states) already owns the CANONICAL
 * promotion state machine:
 *
 *   registered → evaluation → benchmarked → promoted | rejected
 *   (any non-retired state) → retired   [the explicit retirement event]
 *
 * This module DECLARES the mapping from the work order's promotion
 * vocabulary onto the control plane's states + the HFX-401 gate outcomes —
 * a documented, VERSIONED mapping record. It does NOT invent a second
 * machine: every work-order stage projects onto exactly one control-plane
 * state (plus the scorecard's assessment), and the only transitions that
 * change the control-plane state are the control plane's own lawful events
 * (applied by the Tech Lead; the HFX-401 runner emits event payloads as
 * records and never mutates the registry).
 *
 * The committed form of this record lives at
 * docs/productization-evidence/HFX-401/runs/promotion-vocabulary-mapping.json
 * (regenerated deterministically by `promotionVocabularyMappingJson()`).
 *
 * DETERMINISM: frozen constants; no I/O, no clock, no randomness.
 */

import { PROVIDER_REGISTRY_STATES } from "@aise/provider-registry";
import { WORK_ORDER_STAGES } from "./scorecard";
import type { WorkOrderStage } from "./scorecard";

/** The mapping record's version (a governed change bumps this). */
export const PROMOTION_VOCABULARY_MAPPING_VERSION =
  "hfx-401/promotion-vocabulary-mapping/1" as const;

/** One mapping row: work-order stage ↔ control-plane state ↔ gate condition. */
export interface PromotionVocabularyMappingRow {
  readonly workOrderStage: WorkOrderStage;
  /** The control-plane state the stage projects onto. */
  readonly controlPlaneState: (typeof PROVIDER_REGISTRY_STATES)[number];
  /** The HFX-401 scorecard/gate condition that constitutes the stage. */
  readonly scorecardCondition: string;
  readonly statement: string;
}

/**
 * The six mapping rows. "rejected" carries TWO constituting conditions (a
 * control-plane promotion-decided{rejected} event OR the HFX-401 engine's
 * refusal — both mean the provider is non-production); every other stage
 * projects one-to-one.
 */
export const PROMOTION_VOCABULARY_MAPPING: readonly PromotionVocabularyMappingRow[] = [
  {
    workOrderStage: "evaluating",
    controlPlaneState: "evaluation",
    scorecardCondition: "the provider's evaluation has started; the scorecard's gates are not yet all recorded",
    statement:
      "evaluating ↔ the control plane's `evaluation` state (evaluation-started): the " +
      "provider is registered and its normalized executions are being recorded — the " +
      "scorecard does not exist yet",
  },
  {
    workOrderStage: "benchmark_pass",
    controlPlaneState: "benchmarked",
    scorecardCondition:
      "the committed benchmark corpus is consumed (≥1 attached benchmark record) and the ten gate outcomes are recorded — the scorecard exists",
    statement:
      "benchmark_pass ↔ the control plane's `benchmarked` state (benchmark-recorded + " +
      "provenance-sealed): the benchmark evidence is attached and the HFX-401 scorecard " +
      "records all ten dimensions with evidence pointers",
  },
  {
    workOrderStage: "production_candidate",
    controlPlaneState: "benchmarked",
    scorecardCondition:
      "the scorecard's verdict is productionEligible (EVERY layer-mandatory gate passed and no layer-applicable gate failed)",
    statement:
      "production_candidate ↔ still `benchmarked` in the control plane, but the HFX-401 " +
      "verdict is production-eligible — the provider is a candidate awaiting the " +
      "promotion decision; the decision is the control plane's promotion-decided event " +
      "(the HFX-401 engine emits the payload, the Tech Lead applies it)",
  },
  {
    workOrderStage: "approved",
    controlPlaneState: "promoted",
    scorecardCondition:
      "the HFX-401 engine's approved decision (all mandatory gates pass) + the control-plane promotion-decided{promoted} event applied",
    statement:
      "approved ↔ the control plane's `promoted` state: the HFX-401 engine approved AND " +
      "the control plane's own three gates admitted (license cleared, benchmark record " +
      "attached, provenance manifest sealed) — the event payload is recorded in the " +
      "promotion record",
  },
  {
    workOrderStage: "rejected",
    controlPlaneState: "rejected",
    scorecardCondition:
      "EITHER a control-plane promotion-decided{rejected} event (typed refusals recorded) OR the HFX-401 engine's refusal (any mandatory gate failed or unjustified-NA) — the provider remains non-production either way",
    statement:
      "rejected ↔ the control plane's `rejected` state OR the HFX-401 refusal: a provider " +
      "that fails any mandatory gate remains non-production EVEN IF ITS BENCHMARK SCORE " +
      "IS STRONG and even if the control plane's own three gates would admit it (the " +
      "counterfactual is documented in the refusal record) — there is NO override path",
  },
  {
    workOrderStage: "retired",
    controlPlaneState: "retired",
    scorecardCondition:
      "the explicit provider-retired event applied (the rollback/demotion path) — every historical record naming the provider must remain interpretable",
    statement:
      "retired ↔ the control plane's `retired` state (the explicit provider-retired event — " +
      "the ONLY path out of promoted): the rollback record carries the demotion event " +
      "payload, the fallback provider/config pointer and the historical-replay proof",
  },
];

/**
 * The canonical projection of the mapping record (the committed
 * `promotion-vocabulary-mapping.json` content).
 */
export function promotionVocabularyMappingJson(): unknown {
  return {
    kind: "hfx-401-promotion-vocabulary-mapping",
    schemaVersion: PROMOTION_VOCABULARY_MAPPING_VERSION,
    statement:
      "The HFX-401 work-order promotion vocabulary mapped onto the HFX-000 control " +
      "plane's canonical state machine (packages/provider-registry — imported, never " +
      "modified). This is a DECLARED PROJECTION, not a second machine: the control " +
      "plane's lawful-transition table stays the only state authority, and the HFX-401 " +
      "engine only emits event payloads as records (applying them to the live registry " +
      "is the Tech Lead's call).",
    controlPlaneStates: [...PROVIDER_REGISTRY_STATES],
    workOrderStages: [...WORK_ORDER_STAGES],
    rows: PROMOTION_VOCABULARY_MAPPING.map((row) => ({ ...row })),
  };
}
