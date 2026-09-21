/**
 * Derived quantities of a state/version (PROD-022).
 *
 * `deriveStateQuantities(version, stateIndex?)` aggregates the QUANTITY
 * IMPACT effects of the operations 1..stateIndex (default: the final
 * state) into the raw per-operation and per-dimension quantity inventory,
 * each entry carrying FULL traceability:
 *
 *  - the intent id (compile link) and operation id/index it derives from;
 *  - the source state it was computed from (the parent state of the
 *    transition — states[stateIndex - 1]);
 *  - the parameter values + units (verbatim) it was computed from;
 *  - the deterministic calculationRef (formula provenance);
 *  - the read-only geometry/node references the quantity derives from.
 *
 * This is RAW operation/state QUANTITIES ONLY — the work order's explicit
 * boundary: BOQ lines, grouping and navigation belong to PROD-025, which
 * builds `SolutionBoqLineTrace` objects on exactly this inventory. No BOQ
 * line is constructed here.
 */

import type {
  EngineeringOperation,
  SolutionVersion,
  TypedOperationParameter,
} from "@aise/solution-contract";
import type { QuantityDimension, QuantityImpactDirection } from "@aise/solution-contract";

/** One traced quantity entry of the inventory. */
export interface TracedQuantity {
  readonly operationId: string;
  readonly operationIndex: number;
  readonly intentRef: string | undefined;
  readonly operationType: string;
  /** The state the operation was applied FROM (the transition source). */
  readonly sourceStateId: string;
  /** The state the operation produced (the transition target). */
  readonly resultingStateId: string | undefined;
  readonly dimension: QuantityDimension;
  readonly value: number;
  readonly unit: string;
  readonly direction: QuantityImpactDirection;
  readonly calculationRef: string | undefined;
  /** The parameter values + units this quantity was computed from. */
  readonly parameters: readonly TypedOperationParameter[];
  /** Read-only reality references the quantity derives from. */
  readonly affectedNodeRefs: readonly string[];
  readonly geometryRefs: readonly { kind: string; ref: string }[];
}

/** Aggregate total over one (dimension, unit) key. */
export interface QuantityTotal {
  readonly dimension: QuantityDimension;
  readonly unit: string;
  /** Net = added − removed (changed contributes its stated delta sign-free). */
  readonly netValue: number;
  readonly addedValue: number;
  readonly removedValue: number;
  readonly contributingOperationIds: readonly string[];
}

/** The full quantity inventory of one state layer. */
export interface StateQuantityInventory {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly stateIndex: number;
  readonly stateId: string;
  /** Quantities per applied operation, in operation order. */
  readonly perOperation: readonly TracedQuantity[];
  /** Net totals per (dimension, unit), sorted deterministically. */
  readonly totals: readonly QuantityTotal[];
}

/**
 * Derives the raw quantity inventory of one state layer of a version
 * (default: the FINAL state). DETERMINISTIC and read-only: the same
 * version + stateIndex always produce the identical inventory.
 */
export function deriveStateQuantities(
  version: SolutionVersion,
  stateIndex?: number,
): StateQuantityInventory {
  const index =
    stateIndex === undefined ? version.states.length - 1 : Math.max(0, Math.min(stateIndex, version.states.length - 1));
  const state = version.states[index];
  if (state === undefined) {
    // unreachable: index is clamped into range
    throw new Error(`state ${index} missing in version ${version.versionNumber}`);
  }
  const appliedIds = new Set(state.appliedOperationIds);
  const perOperation: TracedQuantity[] = [];
  for (const operation of version.operations) {
    if (!appliedIds.has(operation.operationId)) {
      continue;
    }
    perOperation.push(...tracedQuantitiesOf(operation, version));
  }
  return {
    solutionId: version.solutionId,
    versionNumber: version.versionNumber,
    stateIndex: index,
    stateId: state.stateId,
    perOperation,
    totals: aggregateTotals(perOperation),
  };
}

function tracedQuantitiesOf(
  operation: EngineeringOperation,
  version: SolutionVersion,
): TracedQuantity[] {
  const sourceState = version.states[operation.operationIndex - 1];
  const resultingState = version.states[operation.operationIndex];
  return operation.effects
    .filter((effect) => effect.effectKind === "quantity-impact")
    .map((effect, ordinal) => {
      const quantity = effect.quantity;
      if (quantity === undefined) {
        // invariant-guarded upstream (operation_effect_missing_quantity);
        // unreachable through the engine's own records.
        throw new Error(
          `quantity-impact effect ${ordinal} of operation ${operation.operationId} lacks a quantity`,
        );
      }
      return {
        operationId: operation.operationId,
        operationIndex: operation.operationIndex,
        intentRef: operation.provenance.intentRef,
        operationType: operation.operationType,
        sourceStateId: sourceState?.stateId ?? "",
        resultingStateId: resultingState?.stateId,
        dimension: quantity.dimension,
        value: quantity.value,
        unit: quantity.unit,
        direction: effect.direction ?? "changed",
        calculationRef: quantity.calculationRef,
        parameters: operation.parameters.map((parameter) => ({ ...parameter })),
        affectedNodeRefs: [...effect.affectedNodeRefs],
        geometryRefs: effect.geometryRefs.map((ref) => ({ kind: ref.kind, ref: ref.ref })),
      };
    });
}

function aggregateTotals(quantities: readonly TracedQuantity[]): QuantityTotal[] {
  const buckets = new Map<string, { added: number; removed: number; ops: Set<string> }>();
  for (const quantity of quantities) {
    const key = `${quantity.dimension}\u0000${quantity.unit}`;
    const bucket = buckets.get(key) ?? { added: 0, removed: 0, ops: new Set<string>() };
    if (quantity.direction === "added") {
      bucket.added += quantity.value;
    } else if (quantity.direction === "removed") {
      bucket.removed += quantity.value;
    }
    bucket.ops.add(quantity.operationId);
    buckets.set(key, bucket);
  }
  const totals: QuantityTotal[] = [];
  for (const [key, bucket] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [dimension, unit] = key.split("\u0000");
    totals.push({
      dimension: dimension as QuantityDimension,
      unit: unit ?? "",
      netValue: roundNet(bucket.added - bucket.removed),
      addedValue: roundNet(bucket.added),
      removedValue: roundNet(bucket.removed),
      contributingOperationIds: [...bucket.ops].sort(),
    });
  }
  return totals;
}

function roundNet(value: number): number {
  return Number(value.toFixed(10));
}
