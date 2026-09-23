/**
 * HFX-302 — the geometry/validation technology SUBSTITUTION benchmark:
 * the typed vocabulary (types + the tolerance model + pure validators).
 *
 * THE GOVERNED LAYER-3 SUBSTITUTION BENCHMARK the work order demands
 * ("geometry/constraint/validation technology can be changed without
 * changing AISE solution semantics"): for a committed corpus of canonical
 * operation sequences, TWO geometry/validation implementations — the
 * canonical engine as the REFERENCE ORACLE (imported, never modified) and
 * an INDEPENDENT deterministic reimplementation as the SUBSTITUTE
 * CANDIDATE — consume the SAME sequence through the provider-neutral
 * adapter surface (adapter.ts), and their CANONICAL PROJECTIONS (PROD-029's
 * `CanonicalQuantity` / `CanonicalValidationCheck` shapes + this module's
 * `CanonicalTopologyConstraint`) must be SEMANTICALLY COMPATIBLE within the
 * substitute's DECLARED per-dimension tolerances — or the divergence is
 * HONESTLY DECLARED with the PROD-029 comparison kind, or the operation
 * family is recorded as explicitly UNSUPPORTED by the substitute.
 *
 * THE THREE BEHAVIOR-MATRIX CELLS (the closed `SubstitutionExpectation`
 * vocabulary — the negative-case discipline made first-class):
 *
 *  - `compatible`                both lanes execute; every projected
 *                                quantity within the substitute's declared
 *                                per-dimension tolerance, validation
 *                                verdicts AND per-check outcomes equal,
 *                                topology constraints equal, BOQ lines
 *                                within tolerance;
 *  - `declared-incompatible`     both lanes execute; a projection diverges
 *                                and the corpus entry DECLARES the expected
 *                                PROD-029 comparison kind (e.g. the coarse
 *                                grid on a shape whose discretization error
 *                                exceeds the declared tolerance — the
 *                                divergence is the DESIGNED evidence that
 *                                the comparison discriminates);
 *  - `unsupported-by-substitute` the sequence contains an operation family
 *                                outside the substitute's declared
 *                                capabilities: the adapter answers with the
 *                                typed `unsupported` naming the family
 *                                BEFORE execution (fail-closed, never
 *                                computed).
 *
 * GOVERNING DOCTRINE (the three laws, spec/ + PROD-029):
 *   1. SUBSTITUTION IS NOT SEMANTICS CHANGE — a substitute's outputs are
 *      COMPARISON RECORDS, never Solution Graph identity; provider-specific
 *      geometry formats never reach a canonical comparison point (the D26
 *      guard, enforced at the adapter seam).
 *   2. TOLERANCES ARE DECLARED, NEVER IMPLICIT — every quantity comparison
 *      carries the substitute's declared per-dimension tolerance
 *      (`QuantityTolerance`, absolute + relative form); a breach is a
 *      DECLARED-INCOMPATIBLE outcome with the PROD-029 comparison kind,
 *      never rounded away.
 *   3. UNSUPPORTED IS RECORDED, NEVER COMPUTED — the fail-closed capability
 *      gate answers before execution with the family named.
 *
 * REUSE DISCIPLINE: the comparison KINDS and the canonical quantity/check/
 * BOQ row shapes are PROD-029's (`backend/api/src/solution-eval/model.ts` —
 * imported, never modified); this module's only extensions are the DECLARED
 * TOLERANCE WRAP around the quantity/BOQ comparisons and the
 * `topology-constraint` comparison point (the work order's "topology
 * constraints" verification made machine-checkable).
 *
 * House discipline (the equivalence-eval / solution-eval exemplars): pure
 * validators over `unknown`, typed failures with a frozen closed code
 * registry, no zod, no throws inside validators, no clock, no randomness,
 * no I/O.
 */

import {
  BUILDING_OPERATION_TYPES,
  QUANTITY_DIMENSIONS,
  VALIDATION_SNAPSHOT_OUTCOMES,
} from "@aise/solution-contract";
import type {
  BuildingOperationType,
  OperationDependency,
  OperationTarget,
  QuantityDimension,
  TypedOperationParameter,
} from "@aise/solution-contract";
import { isFailureKind } from "@aise/provider-registry";
import type { FailureKind } from "@aise/provider-registry";
import { DIVERGENCE_KIND_BY_POINT } from "../solution-eval/model";
import type {
  CanonicalBoqLine,
  CanonicalQuantity,
  CanonicalValidationCheck,
} from "../solution-eval/model";

/* ------------------------------------------------------------------ */
/* Error codes (transport-level, frozen closed registry)                */
/* ------------------------------------------------------------------ */

export const GEOMETRY_EVAL_ERROR_CODES = Object.freeze([
  "invalid_request",
  "invalid_descriptor",
  "invalid_sequence",
] as const);
export type GeometryEvalErrorCode = (typeof GEOMETRY_EVAL_ERROR_CODES)[number];

/** A typed harness error (caller/wiring bugs — never a benchmark outcome). */
export class GeometryEvalError extends Error {
  readonly code: GeometryEvalErrorCode;
  readonly detail: string;

  constructor(code: GeometryEvalErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "GeometryEvalError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* The three behavior-matrix cells                                      */
/* ------------------------------------------------------------------ */

/**
 * The frozen expectation vocabulary — the three behavior-matrix cells of
 * the substitution benchmark (see the module header). Corpus sequences
 * declare their cell; the harness's observed verdict is checked against
 * the declaration (a flipped or failed expectation is a recorded MISMATCH,
 * never a silent pass).
 */
export const SUBSTITUTION_EXPECTATIONS = Object.freeze([
  "compatible",
  "declared-incompatible",
  "unsupported-by-substitute",
] as const);
export type SubstitutionExpectation = (typeof SUBSTITUTION_EXPECTATIONS)[number];

/** Advisory membership check over the frozen expectation vocabulary. */
export function isSubstitutionExpectation(value: unknown): value is SubstitutionExpectation {
  return (
    typeof value === "string" &&
    (SUBSTITUTION_EXPECTATIONS as readonly string[]).includes(value)
  );
}

/** The canonical worst-of validation outcome vocabulary (the contract's own). */
export type ValidationOutcomeWord = (typeof VALIDATION_SNAPSHOT_OUTCOMES)[number];

/* ------------------------------------------------------------------ */
/* The substitute profile vocabulary                                    */
/* ------------------------------------------------------------------ */

/**
 * The closed substitute-profile vocabulary the corpus's sequences may
 * reference (resolved by the module's registry against the provider
 * constants of substitute.ts / reference.ts):
 *
 *  - `discretized-accumulation-fine`    the independent reimplementation at
 *                                       the fine declared grid (1 cm cells);
 *  - `discretized-accumulation-coarse`  the SAME strategy at a coarser
 *                                       declared grid (0.5 m cells) — the
 *                                       designed-divergence lane;
 *  - `discretized-accumulation-partial` the fine strategy with an honestly
 *                                       REDUCED capability set (the
 *                                       capability-boundary lane: families
 *                                       the substitute deliberately does
 *                                       not declare).
 */
export const GEOMETRY_SUBSTITUTE_PROFILE_IDS = Object.freeze([
  "discretized-accumulation-fine",
  "discretized-accumulation-coarse",
  "discretized-accumulation-partial",
] as const);
export type GeometrySubstituteProfileId = (typeof GEOMETRY_SUBSTITUTE_PROFILE_IDS)[number];

/** Whether a value names one of the module's declared substitute profiles. */
export function isGeometrySubstituteProfileId(
  value: unknown,
): value is GeometrySubstituteProfileId {
  return (
    typeof value === "string" &&
    (GEOMETRY_SUBSTITUTE_PROFILE_IDS as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ */
/* The tolerance model (law 2: declared, never implicit)                */
/* ------------------------------------------------------------------ */

/** The tolerance-model identity stamped into every version-pinned manifest. */
export const TOLERANCE_MODEL_VERSION = "hfx302/quantity-tolerance/1" as const;

/**
 * One declared quantity tolerance: the ABSOLUTE + RELATIVE form. A
 * candidate value is within tolerance iff
 * `|candidate − reference| ≤ absolute + relative × |reference|` (the
 * boundary is inclusive; the reference value is the oracle's magnitude).
 */
export interface QuantityTolerance {
  /** Absolute allowance in the quantity's canonical unit (≥ 0). */
  readonly absolute: number;
  /** Relative allowance as a fraction of the reference magnitude (≥ 0). */
  readonly relative: number;
}

/** The per-dimension declared tolerance table (every dimension declared). */
export type QuantityToleranceTable = Readonly<Record<QuantityDimension, QuantityTolerance>>;

/** Whether both tolerance components are finite and non-negative. */
function isWellFormedTolerance(tolerance: QuantityTolerance): boolean {
  return (
    Number.isFinite(tolerance.absolute) &&
    tolerance.absolute >= 0 &&
    Number.isFinite(tolerance.relative) &&
    tolerance.relative >= 0
  );
}

/**
 * The PURE within-tolerance predicate (law 2). Fail-closed on non-finite
 * inputs: a non-finite reference or candidate value is NEVER within
 * tolerance. The boundary is inclusive.
 */
export function withinQuantityTolerance(
  tolerance: QuantityTolerance,
  referenceValue: number,
  candidateValue: number,
): boolean {
  if (!isWellFormedTolerance(tolerance)) {
    return false;
  }
  if (!Number.isFinite(referenceValue) || !Number.isFinite(candidateValue)) {
    return false;
  }
  const delta = Math.abs(candidateValue - referenceValue);
  return delta <= quantityToleranceEnvelope(tolerance, referenceValue);
}

/**
 * The allowed delta of one comparison: `absolute + relative × |reference|`
 * (the auditable envelope — the tolerance report's numerator).
 */
export function quantityToleranceEnvelope(
  tolerance: QuantityTolerance,
  referenceValue: number,
): number {
  return tolerance.absolute + tolerance.relative * Math.abs(referenceValue);
}

/* ------------------------------------------------------------------ */
/* Resolution declarations (the substitute's declared resolution params) */
/* ------------------------------------------------------------------ */

/** The closed resolution-strategy vocabulary. */
export const RESOLUTION_STRATEGIES = Object.freeze(["closed-form", "discretized-grid"] as const);
export type ResolutionStrategy = (typeof RESOLUTION_STRATEGIES)[number];

/**
 * The declared resolution parameters of a geometry provider. The reference
 * oracle computes CLOSED FORM (no grid); the discretized substitute
 * declares its grid cell size plus the nominal block-module reference data
 * its module-cell counting consumes.
 */
export type ResolutionDeclaration =
  | { readonly strategy: "closed-form" }
  | {
      readonly strategy: "discretized-grid";
      /** The cubic accumulation cell edge (meters, strictly positive). */
      readonly gridCellMeters: number;
      /** Nominal block-module face length including joints (meters). */
      readonly blockModuleLengthMeters: number;
      /** Nominal block-module face height including joints (meters). */
      readonly blockModuleHeightMeters: number;
    };

/* ------------------------------------------------------------------ */
/* The provider descriptor                                              */
/* ------------------------------------------------------------------ */

/** The typed seal of every geometry provider descriptor. */
export const GEOMETRY_PROVIDER_DESCRIPTOR_KIND = "geometry-provider-descriptor" as const;

/** The implementation provenance identity a descriptor declares. */
export interface GeometryProviderProvenance {
  /** The implementation's identity (package or lane name). */
  readonly implementation: string;
  /** The implementation's code version (deterministic reproduction pin). */
  readonly codeVersion: string;
  /** The computation strategy statement (human-auditable). */
  readonly strategy: string;
}

/**
 * ONE geometry/validation implementation candidate's DECLARATION — the
 * substitution benchmark's contract with the adapter:
 *
 *  - `declaredCapabilities` — the operation families the implementation
 *    claims (a SUBSET of the contract's `BUILDING_OPERATION_TYPES`; an
 *    over-declaring descriptor is REJECTED by the validator — capability
 *    honesty, never a claim the adapter cannot gate);
 *  - `resolution` — the declared resolution parameters (closed form or a
 *    discretized grid);
 *  - `tolerances` — the per-dimension declared quantity tolerance table
 *    (law 2: the comparison envelope the substitute is held to);
 *  - `provenance` — the implementation identity every emitted record cites.
 */
export interface GeometryProviderDescriptor {
  readonly kind: typeof GEOMETRY_PROVIDER_DESCRIPTOR_KIND;
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly declaredCapabilities: readonly BuildingOperationType[];
  readonly resolution: ResolutionDeclaration;
  readonly tolerances: QuantityToleranceTable;
  readonly provenance: GeometryProviderProvenance;
}

/* ------------------------------------------------------------------ */
/* Canonical topology constraints (the work order's topology leg)        */
/* ------------------------------------------------------------------ */

/**
 * The canonical topology-constraint kinds both lanes derive over the SAME
 * canonical sequence (each an independently derivable structural fact):
 *
 *  - `target-anchored`           operation i's target anchors to the
 *                                baseline geometry reference `subjectRef`;
 *  - `coated-surface-resolved`   operation i (a coated operation) resolves
 *                                its coated surface from the baseline
 *                                geometry reference `subjectRef` through
 *                                the read-only baseline seam;
 *  - `dependency-backwards`      operation i depends on the operation at
 *                                sequence position `Number(subjectRef)`
 *                                (a backwards dependency edge).
 */
export const TOPOLOGY_CONSTRAINT_KINDS = Object.freeze([
  "target-anchored",
  "coated-surface-resolved",
  "dependency-backwards",
] as const);
export type TopologyConstraintKind = (typeof TOPOLOGY_CONSTRAINT_KINDS)[number];

/** One canonical topology constraint row (the closed comparison shape). */
export interface CanonicalTopologyConstraint {
  /** Deterministic identity: `${kind}#${operationIndex}:${subjectRef}`. */
  readonly constraintId: string;
  readonly kind: TopologyConstraintKind;
  /** The 0-based position of the operation in the canonical sequence. */
  readonly operationIndex: number;
  readonly subjectRef: string;
}

/** Whether an operation family is a COATED (surface) operation. */
export function isCoatedOperationFamily(operationType: string): boolean {
  return operationType === "plaster-application" || operationType === "finish-application";
}

/* ------------------------------------------------------------------ */
/* The corpus sequence (declarative canonical data)                     */
/* ------------------------------------------------------------------ */

/**
 * ONE canonical operation step of a substitution sequence — the declarative
 * form the corpus commits (the harness constructs the contract-valid
 * `EngineeringOperationIntent` EXCLUSIVELY through the contract's
 * `createOperationIntent`, never a hand-rolled intent object).
 */
export interface GeometryOperationStep {
  /** The operation family (one of the contract's `BUILDING_OPERATION_TYPES`). */
  readonly operationType: BuildingOperationType;
  /** Typed parameters with explicit units (numeric values REQUIRE a unit). */
  readonly parameters: readonly TypedOperationParameter[];
  /** The anchored spatial target (read-only references to observed reality). */
  readonly target: OperationTarget;
  /** Precedence/dependency edges (referencing derived operation ids). */
  readonly dependsOn?: readonly OperationDependency[];
  /** Provenance interaction detail the constructed intent carries. */
  readonly stepNote?: string;
}

/**
 * ONE committed corpus sequence: the baseline scene reference, the ORDERED
 * canonical operations BOTH lanes consume, the substitute profile the
 * substitute lane runs, and the expectation cell from the closed
 * three-cell vocabulary.
 */
export interface SubstitutionSequence {
  /** Stable corpus id (e.g. "geo-sub-excavation-core"). */
  readonly sequenceId: string;
  /** The committed baseline scene the harness materializes ONCE per run. */
  readonly baselineSceneId: string;
  /** The ordered canonical operation steps (at least one). */
  readonly steps: readonly GeometryOperationStep[];
  /** The substitute lane's profile (the closed profile vocabulary). */
  readonly substituteProfileId: GeometrySubstituteProfileId;
  /** The declared behavior-matrix cell. */
  readonly expectation: SubstitutionExpectation;
  /**
   * Required iff `expectation` is "declared-incompatible": the
   * closed-vocabulary PROD-029 failure kind the harness MUST record when it
   * catches the divergence (the honest difference is declared up front).
   */
  readonly declaredDivergenceKind?: FailureKind;
  readonly notes?: string;
}

/* ------------------------------------------------------------------ */
/* The comparison vocabulary (PROD-029 kinds + the tolerance wrap)       */
/* ------------------------------------------------------------------ */

/**
 * The canonical comparison points of the substitution benchmark. The
 * quantity/validation/BOQ point kinds are PROD-029's own
 * (`COMPARISON_POINT_KINDS` members, reused by name and divergence kind);
 * `topology-constraint` is HFX-302's extension (the work order's topology
 * verification).
 */
export const SUBSTITUTION_COMPARISON_POINT_KINDS = Object.freeze([
  "quantity-value",
  "validation-verdict",
  "topology-constraint",
  "boq-line",
] as const);
export type SubstitutionComparisonPointKind =
  (typeof SUBSTITUTION_COMPARISON_POINT_KINDS)[number];

/**
 * The closed-vocabulary divergence kind recorded when a comparison point
 * diverges: PROD-029's `DIVERGENCE_KIND_BY_POINT` values for the three
 * shared points (REUSED, never reinvented) + the topology extension (a
 * topology divergence is an engineering-semantics divergence).
 */
export const SUBSTITUTION_DIVERGENCE_KIND_BY_POINT: Readonly<
  Record<SubstitutionComparisonPointKind, FailureKind>
> = Object.freeze({
  "quantity-value": DIVERGENCE_KIND_BY_POINT["quantity-value"],
  "validation-verdict": DIVERGENCE_KIND_BY_POINT["validation-verdict"],
  "topology-constraint": "operation-semantic-failure",
  "boq-line": DIVERGENCE_KIND_BY_POINT["boq-line"],
});

/** One per-quantity comparison row (values ⊕ the declared tolerance wrap). */
export interface QuantityComparisonRow {
  /** The canonical subject: `operation ${index} / ${label}`. */
  readonly subjectId: string;
  readonly label: string;
  readonly dimension: QuantityDimension;
  readonly unit: string;
  readonly direction: string;
  readonly referenceValue: number;
  readonly substitutedValue: number;
  /** The substitute's declared tolerance for this quantity's dimension. */
  readonly tolerance: QuantityTolerance;
  readonly delta: number;
  readonly allowedDelta: number;
  readonly withinTolerance: boolean;
}

/** One per-validation-check comparison row (checkId + outcome equality). */
export interface ValidationCheckComparisonRow {
  readonly subjectId: string;
  readonly checkId: string;
  readonly referenceResult: string;
  readonly substitutedResult: string;
  readonly equal: boolean;
}

/** One per-constraint topology comparison row (set membership equality). */
export interface TopologyComparisonRow {
  readonly subjectId: string;
  readonly kind: TopologyConstraintKind;
  readonly operationIndex: number;
  readonly subjectRef: string;
  /** Present in the reference lane's derived constraint set. */
  readonly inReference: boolean;
  /** Present in the substitute lane's derived constraint set. */
  readonly inSubstituted: boolean;
  readonly equal: boolean;
}

/** One per-BOQ-line comparison row (values ⊕ the declared tolerance wrap). */
export interface BoqLineComparisonRow {
  /** The canonical line key: activity/dimension/unit/direction/material. */
  readonly subjectId: string;
  readonly activity: string;
  readonly dimension: QuantityDimension;
  readonly unit: string;
  readonly direction: string;
  readonly material?: string;
  readonly referenceValue: number;
  readonly substitutedValue: number;
  readonly tolerance: QuantityTolerance;
  readonly delta: number;
  readonly allowedDelta: number;
  readonly withinTolerance: boolean;
}

/** The per-point comparison of one sequence's two lane executions. */
export interface SubstitutionComparison {
  readonly verdict: "compatible" | "declared-incompatible";
  readonly quantityRows: readonly QuantityComparisonRow[];
  readonly checkRows: readonly ValidationCheckComparisonRow[];
  readonly topologyRows: readonly TopologyComparisonRow[];
  readonly boqRows: readonly BoqLineComparisonRow[];
  /** The closed-vocabulary kind of the FIRST diverging point (deterministic order). */
  readonly divergenceKind?: FailureKind;
  /** The distinct kinds of all diverging points (deterministic order). */
  readonly divergenceKinds: readonly FailureKind[];
}

/* ------------------------------------------------------------------ */
/* The lane execution outcomes + the substitution outcome               */
/* ------------------------------------------------------------------ */

/** One operation's projected canonical quantities (the executed lane form). */
export interface OperationQuantityProjection {
  /** The 0-based position of the operation in the canonical sequence. */
  readonly operationIndex: number;
  readonly operationType: string;
  /** PROD-029's canonical quantity rows (the closed comparison shape). */
  readonly quantities: readonly CanonicalQuantity[];
}

/** The executed lane's full canonical projection. */
export interface ExecutedLaneProjection {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly operations: readonly OperationQuantityProjection[];
  readonly validation: {
    readonly outcome: ValidationOutcomeWord;
    readonly checks: readonly CanonicalValidationCheck[];
  };
  readonly topology: readonly CanonicalTopologyConstraint[];
  /** The lane's canonical BOQ-line rows (the harness's BOQ leg, PROD-029 shape). */
  readonly boqLines: readonly CanonicalBoqLine[];
}

/**
 * ONE lane's typed outcome through the adapter:
 *
 *  - `executed`              the provider executed and its outputs passed
 *                            the canonical-boundary projection guard;
 *  - `unsupported-recorded`  the fail-closed capability gate fired BEFORE
 *                            execution (law 3: the family is named, never
 *                            computed);
 *  - `projection-refused`    the provider's output carried provider-specific
 *                            fields into a canonical point (the D26 guard);
 *  - `provider-refused`      the provider's own fail-closed refusal (typed
 *                            reason codes — e.g. an unresolved coated
 *                            surface; BOTH lanes refusing identically is an
 *                            honest compatible outcome, never a crash).
 */
export type LaneExecutionOutcome =
  | { readonly outcome: "executed"; readonly projection: ExecutedLaneProjection }
  | {
      readonly outcome: "unsupported-recorded";
      readonly family: string;
      readonly operationIndex: number;
      readonly detail: string;
    }
  | {
      readonly outcome: "projection-refused";
      readonly refusalKind: "contract-mismatch";
      readonly detail: string;
    }
  | {
      readonly outcome: "provider-refused";
      readonly reasonCodes: readonly string[];
      readonly detail: string;
    };

/** The observed cell of one sequence evaluation (the same three cells). */
export type SubstitutionObservedCell = SubstitutionExpectation;

/** The full outcome record of ONE corpus sequence's evaluation. */
export interface SubstitutionOutcome {
  readonly sequenceId: string;
  readonly expectation: SubstitutionExpectation;
  /** The reference lane's typed outcome (the engine governs both lanes equally). */
  readonly reference: LaneExecutionOutcome;
  /** The substitute lane's typed outcome. */
  readonly substitute: LaneExecutionOutcome;
  /** Present iff both lanes executed: the per-point comparison. */
  readonly comparison: SubstitutionComparison | null;
  readonly observed: SubstitutionObservedCell;
  /** Whether the observed cell matched the corpus declaration. */
  readonly expectationMet: boolean;
}

/* ------------------------------------------------------------------ */
/* Pure validators (fail-closed, typed path'd failures)                 */
/* ------------------------------------------------------------------ */

/** One typed validation failure (path + human-auditable detail). */
export interface GeometryValidationFailure {
  readonly path: string;
  readonly detail: string;
}

/** The result shape of both pure validators. */
export type GeometryValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failures: readonly GeometryValidationFailure[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates an unknown payload as a `GeometryProviderDescriptor`
 * (fail-closed). The CAPABILITY-HONESTY gate: a descriptor over-declaring
 * capabilities OUTSIDE the contract's `BUILDING_OPERATION_TYPES` vocabulary
 * is REJECTED — the adapter can only gate families the canonical operation
 * vocabulary names, so an over-declaring descriptor is a claim the seam
 * cannot honor (never a silent pass).
 */
export function validateGeometryProviderDescriptor(
  value: unknown,
): GeometryValidation<GeometryProviderDescriptor> {
  const failures: GeometryValidationFailure[] = [];
  const fail = (path: string, detail: string): void => {
    failures.push({ path, detail });
  };

  if (!isRecord(value)) {
    return {
      ok: false,
      failures: [{ path: "$", detail: "a geometry provider descriptor must be a JSON object" }],
    };
  }
  if (value["kind"] !== GEOMETRY_PROVIDER_DESCRIPTOR_KIND) {
    fail("kind", `expected the typed seal '${GEOMETRY_PROVIDER_DESCRIPTOR_KIND}'`);
  }
  if (!isNonEmptyString(value["providerId"])) {
    fail("providerId", "must be a non-empty string (the control-plane registry key)");
  }
  if (!isNonEmptyString(value["technologyVersion"])) {
    fail("technologyVersion", "must be a non-empty string");
  }

  /* Declared capabilities: a non-empty, duplicate-free subset of the ten
     canonical families (the capability-honesty gate). */
  const capabilities = value["declaredCapabilities"];
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    fail(
      "declaredCapabilities",
      "must be a non-empty array — a provider declaring no operation families can execute nothing",
    );
  } else {
    const seen = new Set<string>();
    for (const [index, entry] of capabilities.entries()) {
      if (
        typeof entry !== "string" ||
        !(BUILDING_OPERATION_TYPES as readonly string[]).includes(entry)
      ) {
        fail(
          `declaredCapabilities[${index}]`,
          `'${String(entry)}' is not one of the canonical operation families [${BUILDING_OPERATION_TYPES.join(", ")}] — ` +
            "a provider may not over-declare capabilities the adapter cannot gate",
        );
      } else if (seen.has(entry)) {
        fail(`declaredCapabilities[${index}]`, `duplicate family '${entry}'`);
      }
      seen.add(String(entry));
    }
  }

  /* Resolution declaration: closed form or a positive finite grid. */
  const resolution = value["resolution"];
  if (!isRecord(resolution)) {
    fail("resolution", "must be an object (the declared resolution parameters)");
  } else if (resolution["strategy"] === "closed-form") {
    const unknownKeys = Object.keys(resolution).filter((key) => key !== "strategy");
    if (unknownKeys.length > 0) {
      fail(
        "resolution",
        `a closed-form resolution declares no further parameters — unknown field(s) [${unknownKeys.join(", ")}]`,
      );
    }
  } else if (resolution["strategy"] === "discretized-grid") {
    const gridCellMeters = resolution["gridCellMeters"];
    if (!isFiniteNumber(gridCellMeters) || gridCellMeters <= 0) {
      fail("resolution.gridCellMeters", "must be a finite number > 0 (the accumulation cell edge)");
    }
    for (const field of ["blockModuleLengthMeters", "blockModuleHeightMeters"] as const) {
      const moduleValue = resolution[field];
      if (!isFiniteNumber(moduleValue) || moduleValue <= 0) {
        fail(`resolution.${field}`, "must be a finite number > 0 (nominal module reference data)");
      }
    }
  } else {
    fail(
      "resolution.strategy",
      `'${String(resolution["strategy"])}' is not one of the resolution strategies [${RESOLUTION_STRATEGIES.join(", ")}]`,
    );
  }

  /* Tolerances: every dimension declared, every entry well formed. */
  const tolerances = value["tolerances"];
  if (!isRecord(tolerances)) {
    fail("tolerances", "must be an object (the per-dimension declared tolerance table)");
  } else {
    for (const dimension of QUANTITY_DIMENSIONS) {
      const entry = tolerances[dimension];
      if (!isRecord(entry)) {
        fail(
          `tolerances.${dimension}`,
          "must be an object { absolute, relative } — every dimension is declared up front (law 2: tolerances are never implicit)",
        );
        continue;
      }
      if (!isFiniteNumber(entry["absolute"]) || (entry["absolute"] as number) < 0) {
        fail(`tolerances.${dimension}.absolute`, "must be a finite number ≥ 0");
      }
      if (!isFiniteNumber(entry["relative"]) || (entry["relative"] as number) < 0) {
        fail(`tolerances.${dimension}.relative`, "must be a finite number ≥ 0");
      }
    }
  }

  /* Provenance identity. */
  const provenance = value["provenance"];
  if (!isRecord(provenance)) {
    fail("provenance", "must be an object (the implementation provenance identity)");
  } else {
    for (const field of ["implementation", "codeVersion", "strategy"] as const) {
      if (!isNonEmptyString(provenance[field])) {
        fail(`provenance.${field}`, "must be a non-empty string");
      }
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: value as unknown as GeometryProviderDescriptor };
}

/**
 * Validates an unknown payload as a `SubstitutionSequence` (fail-closed):
 * the closed expectation/profile vocabularies, the declared-divergence
 * consistency rule (a kind is REQUIRED iff the cell is
 * declared-incompatible, mirroring PROD-029's scenario discipline), and the
 * structural operation-step rules (canonical families, explicit units on
 * numeric parameters, anchored targets). FULL contract validity is
 * guaranteed by construction (the harness builds every intent through the
 * contract's `createOperationIntent`) and re-asserted by the reference
 * lane's own application — never silently coerced here.
 */
export function validateSubstitutionSequence(
  value: unknown,
): GeometryValidation<SubstitutionSequence> {
  const failures: GeometryValidationFailure[] = [];
  const fail = (path: string, detail: string): void => {
    failures.push({ path, detail });
  };

  if (!isRecord(value)) {
    return {
      ok: false,
      failures: [{ path: "$", detail: "a substitution sequence must be a JSON object" }],
    };
  }
  if (!isNonEmptyString(value["sequenceId"])) {
    fail("sequenceId", "must be a non-empty string");
  }
  if (!isNonEmptyString(value["baselineSceneId"])) {
    fail("baselineSceneId", "must be a non-empty string (the committed baseline scene reference)");
  }

  const steps = value["steps"];
  if (!Array.isArray(steps) || steps.length === 0) {
    fail(
      "steps",
      "must be a non-empty array — a substitution sequence carries at least one operation",
    );
  } else {
    for (const [index, step] of steps.entries()) {
      const path = `steps[${index}]`;
      if (!isRecord(step)) {
        fail(path, "must be an object (one canonical operation step)");
        continue;
      }
      const operationType = step["operationType"];
      if (
        typeof operationType !== "string" ||
        !(BUILDING_OPERATION_TYPES as readonly string[]).includes(operationType)
      ) {
        fail(
          `${path}.operationType`,
          `'${String(operationType)}' is not one of the canonical operation families [${BUILDING_OPERATION_TYPES.join(", ")}]`,
        );
      }
      const parameters = step["parameters"];
      if (!Array.isArray(parameters) || parameters.length === 0) {
        fail(`${path}.parameters`, "must be a non-empty array of typed parameters");
      } else {
        for (const [parameterIndex, parameter] of parameters.entries()) {
          if (!isRecord(parameter)) {
            fail(`${path}.parameters[${parameterIndex}]`, "must be an object");
            continue;
          }
          if (!isNonEmptyString(parameter["name"])) {
            fail(`${path}.parameters[${parameterIndex}].name`, "must be a non-empty string");
          }
          const parameterValue = parameter["value"];
          if (
            typeof parameterValue !== "number" &&
            typeof parameterValue !== "string" &&
            typeof parameterValue !== "boolean"
          ) {
            fail(
              `${path}.parameters[${parameterIndex}].value`,
              "must be a number, a string or a boolean",
            );
          }
          if (typeof parameterValue === "number" && !isNonEmptyString(parameter["unit"])) {
            fail(
              `${path}.parameters[${parameterIndex}]`,
              `the numeric parameter '${String(parameter["name"])}' carries no unit — the explicit-unit law is not negotiable`,
            );
          }
        }
      }
      const target = step["target"];
      if (!isRecord(target)) {
        fail(`${path}.target`, "must be an object (the anchored spatial target)");
      } else {
        if (!isNonEmptyString(target["selectorKind"])) {
          fail(`${path}.target.selectorKind`, "must be a non-empty string");
        }
        const nodeRefs = target["nodeRefs"];
        if (
          !Array.isArray(nodeRefs) ||
          nodeRefs.length === 0 ||
          !nodeRefs.every(isNonEmptyString)
        ) {
          fail(`${path}.target.nodeRefs`, "must be a non-empty array of non-empty strings");
        }
        const geometryRefs = target["geometryRefs"];
        if (
          !Array.isArray(geometryRefs) ||
          geometryRefs.length === 0 ||
          !geometryRefs.every(
            (entry) =>
              isRecord(entry) && isNonEmptyString(entry["kind"]) && isNonEmptyString(entry["ref"]),
          )
        ) {
          fail(`${path}.target.geometryRefs`, "must be a non-empty array of { kind, ref } rows");
        }
        const units = target["units"];
        if (
          !isRecord(units) ||
          !isNonEmptyString(units["linear"]) ||
          !isNonEmptyString(units["angular"])
        ) {
          fail(`${path}.target.units`, "must be { linear: string, angular: string }");
        }
      }
      const dependsOn = step["dependsOn"];
      if (dependsOn !== undefined) {
        if (!Array.isArray(dependsOn)) {
          fail(`${path}.dependsOn`, "must be an array when present");
        } else {
          for (const [edgeIndex, edge] of dependsOn.entries()) {
            if (
              !isRecord(edge) ||
              !isNonEmptyString(edge["operationRef"]) ||
              !isNonEmptyString(edge["dependencyKind"])
            ) {
              fail(
                `${path}.dependsOn[${edgeIndex}]`,
                "must carry non-empty 'operationRef' and 'dependencyKind'",
              );
            }
          }
        }
      }
    }
  }

  const substituteProfileId = value["substituteProfileId"];
  if (!isGeometrySubstituteProfileId(substituteProfileId)) {
    fail(
      "substituteProfileId",
      `'${String(substituteProfileId)}' is not one of the declared substitute profiles [${GEOMETRY_SUBSTITUTE_PROFILE_IDS.join(", ")}]`,
    );
  }

  const expectation = value["expectation"];
  if (!isSubstitutionExpectation(expectation)) {
    fail(
      "expectation",
      `'${String(expectation)}' is not one of the behavior-matrix cells [${SUBSTITUTION_EXPECTATIONS.join(", ")}]`,
    );
  }

  /* The declared-divergence consistency rule (PROD-029's discipline). */
  const declaredDivergenceKind = value["declaredDivergenceKind"];
  if (expectation === "declared-incompatible") {
    if (typeof declaredDivergenceKind !== "string" || !isFailureKind(declaredDivergenceKind)) {
      fail(
        "declaredDivergenceKind",
        "a 'declared-incompatible' sequence MUST declare 'declaredDivergenceKind' from the CLOSED failure vocabulary — the honest difference is declared up front, never discovered silently",
      );
    }
  } else if (declaredDivergenceKind !== undefined) {
    fail(
      "declaredDivergenceKind",
      "only a 'declared-incompatible' sequence may declare 'declaredDivergenceKind'",
    );
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: value as unknown as SubstitutionSequence };
}
