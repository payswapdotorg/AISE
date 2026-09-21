/**
 * Deterministic building-operation quantity models (PROD-022).
 *
 * THE QUANTITY CALCULUS of the initial building operation subset. Every
 * model is a PURE, deterministic function from an operation's typed
 * parameters (+ the read-only baseline surface fact where the operation
 * coats an anchored surface) to typed quantities with:
 *
 *  - EXPLICIT UNITS (dimension + canonical output unit, per the contract's
 *    `QuantityDimension` vocabulary — never a bare number);
 *  - CALCULATION PROVENANCE (`calculationRef` naming model+version; the
 *    ACR-005 "units, calculation method" requirement);
 *  - PARAMETER TRACEABILITY (every input's original value+unit preserved);
 *  - a DETERMINISTIC FORMULA STATEMENT (human-auditable, machine-constant).
 *
 * DOCUMENTED FORMULAS (canonical units; parameter units converted exactly):
 *
 *  excavation (v1)
 *    excavated-soil-volume  = depth × width × length            [m3, removed]
 *    excavation-footprint   = width × length                     [m2, removed]
 *    limit: depth ≤ 6 m per operation (Phase 1 building scope)
 *  backfill (v1)
 *    backfill-volume        = depth × width × length            [m3, added]
 *  demolition-removal (v1)
 *    removed-volume         = length × height × thickness        [m3, removed]
 *    removed-face-area      = length × height                   [m2, removed]
 *    (load-bearing review is NOT computable from typed parameters — it stays
 *    a declared capability limitation, never silently dropped)
 *  foundation-placement (v1)
 *    footing-volume         = length × width × depth            [m3, added]
 *    footing-plan-area      = length × width                    [m2, added]
 *  slab-placement (v1)
 *    slab-volume            = length × width × thickness        [m3, added]
 *    slab-plan-area         = length × width                    [m2, added]
 *  block-wall-placement (v1)
 *    wall-volume            = length × height × thickness       [m3, added]
 *    wall-face-area         = length × height                   [m2, added]
 *    block-count            = ceil(height/0.2) × ceil(length/0.4) [count, added]
 *      — nominal module 400 × 200 mm face INCLUDING 10 mm joints; a partial
 *        module at a course end or a partial top course is a whole block.
 *    limit: height ≤ 3 m per operation
 *  opening-creation (v1)
 *    opening-area           = width × height                    [m2, removed]
 *    opening-count          = 1 per operation                   [count, added]
 *  plaster-application (v1) — COATED SURFACE comes from the read-only baseline
 *    plaster-area           = resolved target surface area      [m2, added]
 *    plaster-volume         = area × thickness                  [m3, added]
 *    limit: thickness ≤ 50 mm per coat
 *  finish-application (v1) — same surface discipline as plaster
 *    finish-area            = resolved target surface area      [m2, added]
 *    finish-volume          = area × thickness                  [m3, added]
 *  building-service-installation (v1)
 *    service-run-length     = length                            [m, added]
 *    service-run-count      = 1 per operation                   [count, added]
 *
 * Every formula is the SIMPLEST DEFENSIBLE DETERMINISTIC model for Phase 1
 * (the engineering-model package defines no quantity model yet). The whole
 * set is SWAPPABLE behind the `QuantityModel` interface (`quantityModels`
 * input on apply/replay) — a future engineering model can replace any
 * entry WITHOUT touching the engine core, as long as the replacement stays
 * deterministic. Where a model needs a quantity the engineering model does
 * not yet define (block module size), it ships as versioned reference data
 * here (DEFAULT_BLOCK_MODULE_LENGTH/HEIGHT), never hidden inside code.
 */

import type {
  OperationTarget,
  QuantityDimension,
  QuantityImpactDirection,
  TypedOperationParameter,
} from "@aise/solution-contract";
import { quantityCalculationRef } from "./engine-version";
import type { EngineReason } from "./errors";
import type { BaselineSurfaceArea } from "./baseline";
import { isSurfaceTarget } from "./baseline";
import {
  resolveNumericParameter,
  roundFloat,
  roundUp,
  type ResolvedParameter,
  type UnitResolutionFailure,
} from "./units";

/* ------------------------------------------------------------------ */
/* Engine quantity (typed, traced, provenance-carrying)                 */
/* ------------------------------------------------------------------ */

/** One engine-derived quantity with full parameter traceability. */
export interface EngineQuantity {
  /** Stable quantity label within the operation (e.g. excavated-soil-volume). */
  readonly label: string;
  readonly dimension: QuantityDimension;
  readonly value: number;
  readonly unit: string;
  readonly calculationRef: string;
  /** Deterministic human-auditable formula statement (canonical units). */
  readonly formula: string;
  /** Whether the operation adds, removes or changes this quantity. */
  readonly direction: QuantityImpactDirection;
  /** The parameters this quantity was computed from (value+unit verbatim). */
  readonly parameterTrace: readonly ResolvedParameter[];
}

/* ------------------------------------------------------------------ */
/* The swappable quantity-model interface                               */
/* ------------------------------------------------------------------ */

/** Input to one model's computation. */
export interface QuantityModelInput {
  readonly parameters: readonly TypedOperationParameter[];
  readonly target: OperationTarget;
  /** Resolved baseline surface fact for surface-coated operations. */
  readonly surfaceArea?: BaselineSurfaceArea;
}

/** The model's computation result. */
export type QuantityComputation =
  | { readonly status: "computed"; readonly quantities: readonly EngineQuantity[] }
  | { readonly status: "invalid"; readonly reasons: readonly EngineReason[] }
  | { readonly status: "needs-input"; readonly reasons: readonly EngineReason[] };

/**
 * One operation type's deterministic quantity model — the SWAPPABLE seam.
 * Implementations MUST be pure and deterministic; they never mutate their
 * inputs and never perform I/O.
 */
export interface QuantityModel {
  readonly operationType: string;
  readonly modelVersion: string;
  /** Whether the model needs a resolved baseline surface area. */
  readonly requiresSurfaceArea: boolean;
  compute(input: QuantityModelInput): QuantityComputation;
}

/* ------------------------------------------------------------------ */
/* Failure helpers                                                      */
/* ------------------------------------------------------------------ */

function unitFailuresToReasons(failures: readonly UnitResolutionFailure[]): EngineReason[] {
  return failures.map((failure) => ({
    code: failure.code,
    detail:
      failure.code === "unknown_unit"
        ? `parameter '${failure.parameterName}' carries unit '${failure.unit}', which is not in the engine's unit vocabulary — refuse rather than guess`
        : failure.code === "unit_dimension_mismatch"
          ? `parameter '${failure.parameterName}' carries unit '${failure.unit}' of dimension '${failure.actualDimension}', but the quantity model expects '${failure.expectedDimension}' — dimensionally inconsistent input is refused`
          : failure.code === "parameter_not_numeric"
            ? `parameter '${failure.parameterName}' must be numeric for this quantity model; found ${JSON.stringify(failure.value)}`
            : `parameter '${failure.parameterName}' must be positive; found ${failure.value} ${failure.unit}`,
  }));
}

interface ParameterLookup {
  readonly parameters: readonly TypedOperationParameter[];
  readonly failures: UnitResolutionFailure[];
  /**
   * Resolves a numeric parameter against the model's EXPECTED slot dimension
   * (the only place units are checked — lazily, at the point of use, so an
   * extra parameter the formula does not consume never causes a false
   * refusal; contract invariants already guarantee numeric-parameters-carry-
   * units for valid intents).
   */
  numericResolved(
    name: string,
    slot: "linear" | "area" | "volume",
  ): ResolvedParameter | undefined;
}

function lookupParameters(parameters: readonly TypedOperationParameter[]): ParameterLookup {
  const failures: UnitResolutionFailure[] = [];
  return {
    parameters,
    failures,
    numericResolved: (name, slot) => {
      const parameter = parameters.find((entry) => entry.name === name);
      if (parameter === undefined) {
        return undefined;
      }
      const resolved = resolveNumericParameter(parameter, slot);
      if (!resolved.ok) {
        failures.push(resolved.failure);
        return undefined;
      }
      return resolved.resolved;
    },
  };
}

function requireNumeric(
  lookup: ParameterLookup,
  name: string,
  slot: "linear" | "area" | "volume",
): { ok: true; value: number; resolved: ResolvedParameter } | { ok: false } {
  const resolved = lookup.numericResolved(name, slot);
  if (resolved === undefined) {
    const present = lookup.parameters.find((entry) => entry.name === name) !== undefined;
    if (!present) {
      return { ok: false };
    }
    // present but failed resolution → failure already recorded
    return { ok: false };
  }
  return { ok: true, value: resolved.canonicalValue, resolved };
}

/* ------------------------------------------------------------------ */
/* Surface-area resolution shared by coated operations                  */
/* ------------------------------------------------------------------ */

function resolveCoatedSurfaceArea(input: QuantityModelInput): number | undefined {
  const area = input.surfaceArea;
  if (area === undefined) {
    return undefined;
  }
  // Convert the resolved area to m2 deterministically (like any unit).
  if (area.unit === "m2") {
    return area.value;
  }
  if (area.unit === "cm2") {
    return area.value * 0.0001;
  }
  if (area.unit === "mm2") {
    return area.value * 0.000001;
  }
  return undefined;
}

/** Builds the needs-input reason for an unresolved coated surface. */
export function surfaceAreaUnresolvedReason(target: OperationTarget): EngineReason {
  return {
    code: "surface_area_unresolved",
    detail:
      `the coated surface area of target (selectorKind '${target.selectorKind}', ` +
      `geometryRefs [${target.geometryRefs.map((ref) => ref.ref).join(", ")}], ` +
      `nodeRefs [${target.nodeRefs.join(", ")}]) could not be resolved from the ` +
      `pinned baseline through the read-only geometry resolver — supply the ` +
      `surface area or better anchored geometry; the engine never invents one`,
  };
}

/* ------------------------------------------------------------------ */
/* Reference module constants (versioned reference data, never hidden)   */
/* ------------------------------------------------------------------ */

/** Nominal block-module face length INCLUDING joints (m) — Phase 1 default. */
export const DEFAULT_BLOCK_MODULE_LENGTH = 0.4;
/** Nominal block-module face height INCLUDING joints (m) — Phase 1 default. */
export const DEFAULT_BLOCK_MODULE_HEIGHT = 0.2;

/* ------------------------------------------------------------------ */
/* The Phase 1 reference quantity model set (building operations)       */
/* ------------------------------------------------------------------ */

function model(
  operationType: string,
  modelVersion: string,
  requiresSurfaceArea: boolean,
  compute: (input: QuantityModelInput) => QuantityComputation,
): QuantityModel {
  return { operationType, modelVersion, requiresSurfaceArea, compute };
}

function quantity(
  operationType: string,
  modelVersion: string,
  label: string,
  dimension: QuantityDimension,
  value: number,
  unit: string,
  formula: string,
  direction: QuantityImpactDirection,
  parameterTrace: readonly ResolvedParameter[],
): EngineQuantity {
  return {
    label,
    dimension,
    value: roundFloat(value),
    unit,
    calculationRef: quantityCalculationRef(operationType, modelVersion),
    formula,
    direction,
    parameterTrace,
  };
}

/**
 * The reference Phase 1 BUILDING quantity model set: one model per
 * `BUILDING_OPERATION_TYPES` entry. Deterministic, pure, documented (see
 * the module doc). Swappable per-operation via the `QuantityModel`
 * interface.
 */
export function referenceBuildingQuantityModels(): Readonly<
  Record<string, QuantityModel>
> {
  const set: Record<string, QuantityModel> = {
    excavation: model("excavation", "v1", false, (input) => {
      const lookup = lookupParameters(input.parameters);
      const depth = requireNumeric(lookup, "depth", "linear");
      const width = requireNumeric(lookup, "width", "linear");
      const length = requireNumeric(lookup, "length", "linear");
      if (!depth.ok || !width.ok || !length.ok) {
        return missingOrInvalid(lookup, ["depth", "width", "length"]);
      }
      return {
        status: "computed",
        quantities: [
          quantity(
            "excavation",
            "v1",
            "excavated-soil-volume",
            "volume",
            depth.value * width.value * length.value,
            "m3",
            "depth × width × length",
            "removed",
            [depth.resolved, width.resolved, length.resolved],
          ),
          quantity(
            "excavation",
            "v1",
            "excavation-footprint",
            "area",
            width.value * length.value,
            "m2",
            "width × length",
            "removed",
            [width.resolved, length.resolved],
          ),
        ],
      };
    }),

    backfill: model("backfill", "v1", false, (input) => {
      const lookup = lookupParameters(input.parameters);
      const depth = requireNumeric(lookup, "depth", "linear");
      const width = requireNumeric(lookup, "width", "linear");
      const length = requireNumeric(lookup, "length", "linear");
      if (!depth.ok || !width.ok || !length.ok) {
        return missingOrInvalid(lookup, ["depth", "width", "length"]);
      }
      return {
        status: "computed",
        quantities: [
          quantity(
            "backfill",
            "v1",
            "backfill-volume",
            "volume",
            depth.value * width.value * length.value,
            "m3",
            "depth × width × length",
            "added",
            [depth.resolved, width.resolved, length.resolved],
          ),
        ],
      };
    }),

    "demolition-removal": model("demolition-removal", "v1", false, (input) => {
      const lookup = lookupParameters(input.parameters);
      const length = requireNumeric(lookup, "length", "linear");
      const height = requireNumeric(lookup, "height", "linear");
      const thickness = requireNumeric(lookup, "thickness", "linear");
      if (!length.ok || !height.ok || !thickness.ok) {
        return missingOrInvalid(lookup, ["length", "height", "thickness"]);
      }
      return {
        status: "computed",
        quantities: [
          quantity(
            "demolition-removal",
            "v1",
            "removed-volume",
            "volume",
            length.value * height.value * thickness.value,
            "m3",
            "length × height × thickness",
            "removed",
            [length.resolved, height.resolved, thickness.resolved],
          ),
          quantity(
            "demolition-removal",
            "v1",
            "removed-face-area",
            "area",
            length.value * height.value,
            "m2",
            "length × height",
            "removed",
            [length.resolved, height.resolved],
          ),
        ],
      };
    }),

    "foundation-placement": model("foundation-placement", "v1", false, (input) => {
      const lookup = lookupParameters(input.parameters);
      const length = requireNumeric(lookup, "length", "linear");
      const width = requireNumeric(lookup, "width", "linear");
      const depth = requireNumeric(lookup, "depth", "linear");
      if (!length.ok || !width.ok || !depth.ok) {
        return missingOrInvalid(lookup, ["length", "width", "depth"]);
      }
      return {
        status: "computed",
        quantities: [
          quantity(
            "foundation-placement",
            "v1",
            "footing-volume",
            "volume",
            length.value * width.value * depth.value,
            "m3",
            "length × width × depth",
            "added",
            [length.resolved, width.resolved, depth.resolved],
          ),
          quantity(
            "foundation-placement",
            "v1",
            "footing-plan-area",
            "area",
            length.value * width.value,
            "m2",
            "length × width",
            "added",
            [length.resolved, width.resolved],
          ),
        ],
      };
    }),

    "slab-placement": model("slab-placement", "v1", false, (input) => {
      const lookup = lookupParameters(input.parameters);
      const length = requireNumeric(lookup, "length", "linear");
      const width = requireNumeric(lookup, "width", "linear");
      const thickness = requireNumeric(lookup, "thickness", "linear");
      if (!length.ok || !width.ok || !thickness.ok) {
        return missingOrInvalid(lookup, ["length", "width", "thickness"]);
      }
      return {
        status: "computed",
        quantities: [
          quantity(
            "slab-placement",
            "v1",
            "slab-volume",
            "volume",
            length.value * width.value * thickness.value,
            "m3",
            "length × width × thickness",
            "added",
            [length.resolved, width.resolved, thickness.resolved],
          ),
          quantity(
            "slab-placement",
            "v1",
            "slab-plan-area",
            "area",
            length.value * width.value,
            "m2",
            "length × width",
            "added",
            [length.resolved, width.resolved],
          ),
        ],
      };
    }),

    "block-wall-placement": model("block-wall-placement", "v1", false, (input) => {
      const lookup = lookupParameters(input.parameters);
      const length = requireNumeric(lookup, "length", "linear");
      const height = requireNumeric(lookup, "height", "linear");
      const thickness = requireNumeric(lookup, "thickness", "linear");
      if (!length.ok || !height.ok || !thickness.ok) {
        return missingOrInvalid(lookup, ["length", "height", "thickness"]);
      }
      const courses = roundUp(height.value / DEFAULT_BLOCK_MODULE_HEIGHT);
      const modulesPerCourse = roundUp(length.value / DEFAULT_BLOCK_MODULE_LENGTH);
      return {
        status: "computed",
        quantities: [
          quantity(
            "block-wall-placement",
            "v1",
            "wall-volume",
            "volume",
            length.value * height.value * thickness.value,
            "m3",
            "length × height × thickness",
            "added",
            [length.resolved, height.resolved, thickness.resolved],
          ),
          quantity(
            "block-wall-placement",
            "v1",
            "wall-face-area",
            "area",
            length.value * height.value,
            "m2",
            "length × height",
            "added",
            [length.resolved, height.resolved],
          ),
          quantity(
            "block-wall-placement",
            "v1",
            "block-count",
            "count",
            courses * modulesPerCourse,
            "count",
            `ceil(height / ${DEFAULT_BLOCK_MODULE_HEIGHT}) × ceil(length / ${DEFAULT_BLOCK_MODULE_LENGTH}) — nominal module face incl. joints, partial module counts as a whole block`,
            "added",
            [length.resolved, height.resolved],
          ),
        ],
      };
    }),

    "opening-creation": model("opening-creation", "v1", false, (input) => {
      const lookup = lookupParameters(input.parameters);
      const width = requireNumeric(lookup, "width", "linear");
      const height = requireNumeric(lookup, "height", "linear");
      if (!width.ok || !height.ok) {
        return missingOrInvalid(lookup, ["width", "height"]);
      }
      return {
        status: "computed",
        quantities: [
          quantity(
            "opening-creation",
            "v1",
            "opening-area",
            "area",
            width.value * height.value,
            "m2",
            "width × height",
            "removed",
            [width.resolved, height.resolved],
          ),
          quantity(
            "opening-creation",
            "v1",
            "opening-count",
            "count",
            1,
            "count",
            "one opening per opening-creation operation",
            "added",
            [width.resolved, height.resolved],
          ),
        ],
      };
    }),

    "plaster-application": coatedModel("plaster-application", "plaster"),

    "finish-application": coatedModel("finish-application", "finish"),

    "building-service-installation": model(
      "building-service-installation",
      "v1",
      false,
      (input) => {
        const lookup = lookupParameters(input.parameters);
        const length = requireNumeric(lookup, "length", "linear");
        if (!length.ok) {
          return missingOrInvalid(lookup, ["length"]);
        }
        return {
          status: "computed",
          quantities: [
            quantity(
              "building-service-installation",
              "v1",
              "service-run-length",
              "length",
              length.value,
              "m",
              "length (the run's length, unit-converted exactly)",
              "added",
              [length.resolved],
            ),
            quantity(
              "building-service-installation",
              "v1",
              "service-run-count",
              "count",
              1,
              "count",
              "one service run per building-service-installation operation",
              "added",
              [length.resolved],
            ),
          ],
        };
      },
    ),
  };
  return set;
}

function coatedModel(operationType: "plaster-application" | "finish-application", noun: string): QuantityModel {
  return model(operationType, "v1", true, (input) => {
    if (!isSurfaceTarget(input.target) || input.surfaceArea === undefined) {
      return {
        status: "needs-input",
        reasons: [surfaceAreaUnresolvedReason(input.target)],
      };
    }
    const area = resolveCoatedSurfaceArea(input);
    if (area === undefined) {
      return {
        status: "needs-input",
        reasons: [surfaceAreaUnresolvedReason(input.target)],
      };
    }
    const lookup = lookupParameters(input.parameters);
    const thickness = requireNumeric(lookup, "thickness", "linear");
    if (!thickness.ok) {
      return missingOrInvalid(lookup, ["thickness"]);
    }
    const areaTrace: ResolvedParameter = {
      name: "surface-area",
      canonicalValue: area,
      originalUnit: input.surfaceArea.unit,
      dimension: "area",
      originalValue: input.surfaceArea.value,
    };
    return {
      status: "computed",
      quantities: [
        quantity(
          operationType,
          "v1",
          `${noun}-area`,
          "area",
          area,
          "m2",
          "resolved baseline target surface area (read-only geometry fact)",
          "added",
          [areaTrace],
        ),
        quantity(
          operationType,
          "v1",
          `${noun}-volume`,
          "volume",
          area * thickness.value,
          "m3",
          "surface area × thickness",
          "added",
          [areaTrace, thickness.resolved],
        ),
      ],
    };
  });
}

function missingOrInvalid(
  lookup: ParameterLookup,
  names: readonly string[],
): QuantityComputation {
  if (lookup.failures.length > 0) {
    return { status: "invalid", reasons: unitFailuresToReasons(lookup.failures) };
  }
  const missing = names.filter(
    (name) => lookup.parameters.find((entry) => entry.name === name) === undefined,
  );
  return {
    status: "invalid",
    reasons: [
      {
        code: "missing_parameter_for_model",
        detail:
          `the quantity model for this operation type requires parameters ` +
          `${JSON.stringify(names)}; missing: ${JSON.stringify(missing)} — the ` +
          `operation is refused rather than computed with invented values`,
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Phase 1 quantitative capability limits (deterministic, swappable)     */
/* ------------------------------------------------------------------ */

/** One quantitative Phase 1 limit attached to a parameter. */
export interface OperationLimit {
  readonly parameterName: string;
  readonly maxCanonicalValue: number;
  readonly unit: string;
  readonly limitId: string;
  readonly detail: string;
}

/**
 * The reference Phase 1 quantitative limits — the QUANTITATIVE half of the
 * reference capability profile's declared limitation strings (mirrored as
 * data so validation can evaluate them deterministically). The QUALITATIVE
 * limitations ("load-bearing elements require engineer review") are NOT
 * here: they are not computable from typed parameters and stay surfaced by
 * the capability profile/negotiation reasons (rendered before action).
 */
export const REFERENCE_BUILDING_OPERATION_LIMITS: Readonly<
  Record<string, readonly OperationLimit[]>
> = Object.freeze({
  excavation: [
    {
      parameterName: "depth",
      maxCanonicalValue: 6,
      unit: "m",
      limitId: "excavation-max-depth",
      detail: "maximum excavation depth is 6 m per operation (Phase 1 building scope)",
    },
  ],
  "block-wall-placement": [
    {
      parameterName: "height",
      maxCanonicalValue: 3,
      unit: "m",
      limitId: "block-wall-max-height",
      detail: "maximum wall height is 3 m per operation",
    },
  ],
  "plaster-application": [
    {
      parameterName: "thickness",
      maxCanonicalValue: 0.05,
      unit: "m",
      limitId: "plaster-max-thickness-per-coat",
      detail: "maximum plaster thickness is 50 mm per coat",
    },
  ],
});

/**
 * Evaluates the quantitative limits of one operation. Returns the exceeded
 * limits (empty when within limits) — deterministic, parameter-driven.
 */
export function evaluateOperationLimits(
  operationType: string,
  parameters: readonly TypedOperationParameter[],
  limits: Readonly<Record<string, readonly OperationLimit[]>> = REFERENCE_BUILDING_OPERATION_LIMITS,
): readonly OperationLimit[] {
  const entries = limits[operationType] ?? [];
  const exceeded: OperationLimit[] = [];
  for (const limit of entries) {
    const parameter = parameters.find((entry) => entry.name === limit.parameterName);
    if (parameter === undefined || typeof parameter.value !== "number") {
      continue; // missing parameters are the negotiation's/model's concern
    }
    const resolved = resolveNumericParameter(parameter, "linear");
    if (resolved.ok && resolved.resolved.canonicalValue > limit.maxCanonicalValue) {
      exceeded.push(limit);
    }
  }
  return exceeded;
}
