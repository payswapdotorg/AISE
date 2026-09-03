/**
 * Derived measurement construction for query results (AISE-009).
 *
 * Shared discipline for every distance/angle query result:
 *
 * - epistemic state = the WEAKEST input state (never an upgrade),
 *   enforced by `assertNoEpistemicUpgrade` as defense in depth;
 * - provenance = method + parameters + content-pinned entity
 *   inputs, validated before the measurement exists;
 * - uncertainty = propagated first-order where the inputs state
 *   enough to propagate, ABSENT otherwise ("not stated" is never
 *   silently treated as zero — that would fabricate precision).
 */
import { assertNoEpistemicUpgrade, deriveQueryState } from "../epistemic.js";
import { measurementProvenance, type GeometryInputRef, type MeasurementProvenance } from "../provenance.js";
import { canonicalContentHash } from "../canonical.js";
import { validateUncertainty, type Measurement, type Uncertainty } from "../uncertainty.js";
import { type Unit } from "../units.js";
import type { GeometryEntity } from "./entities.js";
import type { EpistemicState } from "@aise/shared-contracts";

/** A query-derived measurement: value + unit + epistemic + provenance + optional uncertainty. */
export interface DerivedMeasurement extends Measurement {
  /** Weakest input state — never an upgrade over any input. */
  readonly epistemic: EpistemicState;
  readonly provenance: MeasurementProvenance;
}

/** Provenance input reference for one entity (content-pinned). */
export function entityInputRef(entity: GeometryEntity): GeometryInputRef {
  const content: Record<string, unknown> = {
    kind: entity.kind,
    point: [entity.point.x, entity.point.y, entity.point.z],
    unit: entity.unit,
    epistemic: entity.epistemic,
  };
  if (entity.kind === "line") {
    content.direction = [entity.direction.x, entity.direction.y, entity.direction.z];
    if (entity.directionStandardUncertainty !== undefined) {
      content.directionStandardUncertainty = entity.directionStandardUncertainty;
    }
  }
  if (entity.kind === "plane") {
    content.normal = [entity.normal.x, entity.normal.y, entity.normal.z];
    if (entity.normalStandardUncertainty !== undefined) {
      content.normalStandardUncertainty = entity.normalStandardUncertainty;
    }
  }
  if (entity.standardUncertainty !== undefined) {
    content.standardUncertainty = entity.standardUncertainty;
  }
  return {
    kind: "entity",
    entityKind: entity.kind,
    contentHash: canonicalContentHash(content),
    epistemic: entity.epistemic,
  };
}

/**
 * Builds the derived measurement: derives the epistemic state
 * (weakest input), guards against upgrade, validates provenance,
 * and validates any stated uncertainty — in that order, every
 * time. This is the single construction path for query results.
 */
export function buildDerivedMeasurement(args: {
  method: string;
  parameters: Readonly<Record<string, unknown>>;
  entities: readonly GeometryEntity[];
  value: number;
  unit: Unit;
  uncertainty?: Uncertainty;
}): DerivedMeasurement {
  const inputStates = args.entities.map((entity) => entity.epistemic);
  const epistemic = deriveQueryState(inputStates);
  assertNoEpistemicUpgrade(epistemic, inputStates);
  if (!Number.isFinite(args.value)) {
    throw new Error(`derived measurement value must be finite: ${String(args.value)}`);
  }
  const provenance = measurementProvenance(
    args.method,
    args.parameters,
    args.entities.map(entityInputRef),
  );
  const uncertainty = args.uncertainty === undefined ? undefined : validateUncertainty(args.uncertainty);
  return {
    value: args.value,
    unit: args.unit,
    ...(uncertainty === undefined ? {} : { uncertainty }),
    epistemic,
    provenance,
  };
}
