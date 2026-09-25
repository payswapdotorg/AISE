/**
 * HFX-302 — the geometry/validation technology SUBSTITUTION evaluation
 * model (types + pure validators + the tolerance calculus).
 *
 * The governed Layer-3 substitution benchmark the work order demands
 * ("geometry/constraint/validation technology can be changed without
 * changing AISE solution semantics" —
 * docs/productization-layer-hardening-work-orders.md §HFX-302, parent
 * PROD-029): for a committed corpus of canonical operation sequences, TWO
 * geometry/validation implementations — the canonical engine as the
 * REFERENCE ORACLE (wrapped, never modified) and an INDEPENDENT
 * deterministic REIMPLEMENTATION as the substitute candidate — consume the
 * SAME sequence through a provider-neutral adapter surface, and their
 * canonical projections (quantities with units, validation checks +
 * verdict, topology constraints, BOQ lines) must be SEMANTICALLY
 * COMPATIBLE within the substitute's DECLARED per-dimension tolerances —
 * or the divergence is HONESTLY DECLARED with the PROD-029 closed-vocabulary
 * comparison kind, or the operation family is recorded as explicitly
 * UNSUPPORTED by the substitute (typed, never computed).
 *
 * THE THREE LAWS this vocabulary enforces:
 *
 *  1. SUBSTITUTION IS NOT SEMANTICS CHANGE. The canonical engine stays THE
 *     identity authority; a substitute's outputs are COMPARISON RECORDS,
 *     never Solution Graph identity. Provider-specific geometry formats
 *     never reach a canonical comparison point (the D26 guard discipline
 *     at this module's own adapter seam — see adapter.ts).
 *  2. TOLERANCES ARE DECLARED, NEVER IMPLICIT. Every quantity/BOQ value
 *     comparison carries the substitute's declared per-dimension tolerance
 *     (`QuantityTolerance`: absolute + relative form); a breach is a
 *     DECLARED-INCOMPATIBLE outcome with the PROD-029 comparison kind —
 *     never rounded away, never hidden.
 *  3. UNSUPPORTED IS RECORDED, NEVER COMPUTED. An operation family outside
 *     the substitute's declared capabilities is answered with a typed
 *     `unsupported` naming the family BEFORE execution (fail-closed — see
 *     adapter.ts), and the corpus exercises it with committed fixtures.
 *
 * VOCABULARY REUSE DISCIPLINE: the comparison-kind vocabulary is
 * PROD-029's (backend/api/src/solution-eval/model.ts — imported, never
 * modified): `GEOMETRY_DIVERGENCE_KIND_BY_POINT` below takes every value
 * from PROD-029's own `DIVERGENCE_KIND_BY_POINT` table. The ONLY
 * extensions this module owns are (a) the DECLARED TOLERANCE WRAP around
 * the quantity/BOQ comparisons and (b) the topology-constraint and
 * per-validation-check comparison points (the work order's "topology
 * constraints" + "validation status" demands), whose divergence kinds are
 * ALSO drawn from PROD-029's table (the state-evolution and validation
 * families respectively) — never a parallel vocabulary.
 *
 * House discipline (the equivalence-eval / solution-eval exemplars): pure
 * validators over committed data, typed failures with a frozen closed code
 * registry, no zod, no throws inside validators, no clock, no randomness,
 * no I/O.
 */

import { BUILDING_OPERATION_TYPES } from "@aise/solution-contract";
import type {
  BuildingOperationType,
  QuantityDimension,
  SpatialSelectorKind,
  TargetGeometryRefKind,
} from "@aise/solution-contract";
import { isFailureKind, type FailureKind } from "@aise/provider-registry";
import { DIVERGENCE_KIND_BY_POINT } from "../solution-eval/model";

/* ------------------------------------------------------------------ */
/* Error codes (transport-level, frozen closed registry)                */
/* ------------------------------------------------------------------ */

export const GEOMETRY_EVAL_ERROR_CODES = Object.freeze([
  "invalid_sequence",
  "invalid_provider",
  "invalid_scene",
  "invalid_request",
] as const);
export type GeometryEvalErrorCode = (typeof GEOMETRY_EVAL_ERROR_CODES)[number];

/** A typed evaluation error (caller/wiring bugs; benchmark outcomes are values, never errors). */
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
/* The behavior-matrix cells (the closed expectation vocabulary)        */
/* ------------------------------------------------------------------ */

/**
 * The three behavior-matrix cells of the substitution benchmark:
 *
 *  - `compatible`                both lanes execute; every projected
 *                                quantity within the substitute's declared
 *                                tolerance; validation verdicts AND
 *                                per-check outcomes equal; topology
 *                                constraints equal; BOQ lines within
 *                                tolerance;
 *  - `declared-incompatible`     both lanes execute; a projection
 *                                diverges and the corpus entry DECLARES
 *                                the expected comparison kind + the
 *                                tolerance breach (the designed evidence
 *                                that the comparison discriminates);
 *  - `unsupported-by-substitute` the sequence contains an operation
 *                                family outside the substitute's declared
 *                                capabilities: the adapter's fail-closed
 *                                gate answers with the typed `unsupported`
 *                                naming the family BEFORE execution; the
 *                                reference lane may still execute (the
 *                                engine governs both lanes equally).
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

/* ------------------------------------------------------------------ */
/* The declared tolerance model (Law 2 — declared, never implicit)      */
/* ------------------------------------------------------------------ */

/** The quantity dimensions the tolerance table must declare. */
export const TOLERANCE_DIMENSIONS = Object.freeze([
  "length",
  "area",
  "volume",
  "count",
] as const);
export type ToleranceDimension = (typeof TOLERANCE_DIMENSIONS)[number];

/**
 * ONE declared per-dimension tolerance: the ABSOLUTE term (canonical
 * unit) plus the RELATIVE term (fraction of the reference value). A value
 * is within tolerance iff |candidate − reference| ≤ max(absolute,
 * relative × |reference|) — the pure `evaluateQuantityTolerance`
 * predicate. Integer `count` quantities admit NO tolerance (exact
 * equality only — a count mismatch is a semantic divergence, never noise).
 */
export interface QuantityTolerance {
  readonly dimension: ToleranceDimension;
  /** Absolute allowance in the dimension's canonical unit (≥ 0). */
  readonly absolute: number;
  /** Relative allowance as a fraction of the reference value (≥ 0). */
  readonly relative: number;
}

/** The observed tolerance evaluation of one compared value pair. */
export interface ToleranceEvaluation {
  readonly within: boolean;
  readonly referenceValue: number;
  readonly candidateValue: number;
  readonly absoluteDelta: number;
  /** |Δ| / |reference| (defined as |Δ| when the reference is 0). */
  readonly relativeDelta: number;
  /** The effective allowance actually granted (max of the two terms). */
  readonly allowedAbsolute: number;
  /** Which declared term granted the allowance (the larger term). */
  readonly allowedBy: "absolute" | "relative";
}

/**
 * The pure within-tolerance predicate (Law 2). DETERMINISTIC, total over
 * finite inputs: `relative` is a fraction, `absolute` is in the canonical
 * unit; the reference of 0 is allowed (the absolute term alone governs).
 */
export function evaluateQuantityTolerance(
  tolerance: QuantityTolerance,
  referenceValue: number,
  candidateValue: number,
): ToleranceEvaluation {
  const absoluteDelta = Math.abs(candidateValue - referenceValue);
  const relativeTerm = tolerance.relative * Math.abs(referenceValue);
  const allowedAbsolute = Math.max(tolerance.absolute, relativeTerm);
  const allowedBy: "absolute" | "relative" =
    tolerance.absolute >= relativeTerm ? "absolute" : "relative";
  return {
    within: absoluteDelta <= allowedAbsolute,
    referenceValue,
    candidateValue,
    absoluteDelta,
    relativeDelta: referenceValue === 0 ? absoluteDelta : absoluteDelta / Math.abs(referenceValue),
    allowedAbsolute,
    allowedBy,
  };
}

/** The tolerance-model identity stamped into every version-pinned manifest. */
export const TOLERANCE_MODEL_VERSION = "hfx-302/quantity-tolerance/1" as const;

/* ------------------------------------------------------------------ */
/* The provider-neutral geometry provider descriptor                    */
/* ------------------------------------------------------------------ */

/** The two implementation lanes a descriptor can declare. */
export const GEOMETRY_IMPLEMENTATION_KINDS = Object.freeze([
  "canonical-engine-reference",
  "independent-reimplementation",
] as const);
export type GeometryImplementationKind = (typeof GEOMETRY_IMPLEMENTATION_KINDS)[number];

/**
 * The discretization resolution a substitute DECLARES (per measure class).
 * Absent on the reference lane (closed-form computation needs no grid).
 * Present only on discretizing reimplementations.
 */
export interface GeometryResolution {
  /** The macro-shape cell size (m) — volumes/areas/lengths of excavations, walls, slabs. */
  readonly macroCellMeters: number;
  /** The thin-coat cell size (m) — plaster/finish thickness axes. */
  readonly coatCellMeters: number;
}

/**
 * The provider-neutral descriptor of ONE geometry/validation
 * implementation candidate: identity, the DECLARED capabilities (the
 * supported operation-family set — the adapter's fail-closed gate reads
 * exactly this), the declared discretization resolution, the declared
 * per-dimension tolerance table and the implementation kind.
 *
 * CAPABILITY HONESTY: `declaredCapabilities` must be a subset of the
 * documented v1 operation-family vocabulary (the contract's
 * `BUILDING_OPERATION_TYPES` — the ten Phase 1 families). A descriptor
 * over-declaring a family OUTSIDE that vocabulary is REJECTED by
 * `validateGeometryProviderDescriptor` (the adapter cannot gate what the
 * closed vocabulary does not name — the sabotage twin asserts this).
 */
export interface GeometryProviderDescriptor {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly displayName: string;
  readonly description?: string;
  readonly declaredCapabilities: readonly BuildingOperationType[];
  /** Present iff the implementation discretizes (absent = closed-form). */
  readonly resolution?: GeometryResolution;
  readonly tolerances: Readonly<Record<ToleranceDimension, QuantityTolerance>>;
  readonly implementation: GeometryImplementationKind;
}

/** One structural validation finding of a provider descriptor. */
export interface ProviderDescriptorValidationFailure {
  readonly path: string;
  readonly detail: string;
}

export type ProviderDescriptorValidation =
  | { readonly ok: true; readonly descriptor: GeometryProviderDescriptor }
  | {
      readonly ok: false;
      readonly failures: readonly ProviderDescriptorValidationFailure[];
    };

/**
 * Validates one provider descriptor (fail-closed; both committed lanes and
 * any ad-hoc candidate pass through THIS validator before execution).
 * Checks: non-empty identity fields, the closed implementation vocabulary,
 * a non-empty unique capability set drawn from the TEN documented families
 * (over-declaration is rejected — the adapter cannot gate an unnamed
 * family), a lawful resolution (positive cells, coat ≤ macro) when
 * present, and the complete per-dimension tolerance table (count is
 * EXACT; every absolute/relative term finite and ≥ 0).
 */
export function validateGeometryProviderDescriptor(
  value: unknown,
): ProviderDescriptorValidation {
  const failures: ProviderDescriptorValidationFailure[] = [];
  const fail = (path: string, detail: string): void => {
    failures.push({ path, detail });
  };
  const isNonEmptyString = (candidate: unknown): candidate is string =>
    typeof candidate === "string" && candidate.trim().length > 0;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      failures: [
        { path: "$", detail: "a geometry provider descriptor must be a JSON object" },
      ],
    };
  }
  const record = value as Record<string, unknown>;

  if (!isNonEmptyString(record["providerId"])) {
    fail("providerId", "must be a non-empty string (the control-plane lane identity)");
  }
  if (!isNonEmptyString(record["technologyVersion"])) {
    fail("technologyVersion", "must be a non-empty string");
  }
  if (!isNonEmptyString(record["displayName"])) {
    fail("displayName", "must be a non-empty string");
  }
  if (
    record["description"] !== undefined &&
    !isNonEmptyString(record["description"])
  ) {
    fail("description", "must be a non-empty string when present");
  }

  const implementation = record["implementation"];
  if (
    typeof implementation !== "string" ||
    !(GEOMETRY_IMPLEMENTATION_KINDS as readonly string[]).includes(implementation)
  ) {
    fail(
      "implementation",
      `'${String(implementation)}' is not one of the implementation kinds [${GEOMETRY_IMPLEMENTATION_KINDS.join(", ")}]`,
    );
  }

  const capabilities = record["declaredCapabilities"];
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    fail(
      "declaredCapabilities",
      "must be a non-empty array — a provider declaring NO operation families is not a substitution candidate",
    );
  } else {
    const seen = new Set<string>();
    for (const [index, entry] of capabilities.entries()) {
      if (typeof entry !== "string") {
        fail(`declaredCapabilities[${index}]`, "must be a string (an operation family)");
        continue;
      }
      if (!(BUILDING_OPERATION_TYPES as readonly string[]).includes(entry)) {
        fail(
          `declaredCapabilities[${index}]`,
          `'${entry}' is outside the documented v1 operation-family vocabulary ` +
            `[${BUILDING_OPERATION_TYPES.join(", ")}] — the adapter cannot gate a capability the closed ` +
            `vocabulary does not name (over-declaration is rejected, never best-efforted)`,
        );
        continue;
      }
      if (seen.has(entry)) {
        fail(`declaredCapabilities[${index}]`, `'${entry}' is declared more than once`);
      }
      seen.add(entry);
    }
  }

  const resolution = record["resolution"];
  if (resolution !== undefined) {
    if (typeof resolution !== "object" || resolution === null || Array.isArray(resolution)) {
      fail("resolution", "must be an object when present (the declared discretization)");
    } else {
      const resolutionRecord = resolution as Record<string, unknown>;
      const macro = resolutionRecord["macroCellMeters"];
      const coat = resolutionRecord["coatCellMeters"];
      if (
        typeof macro !== "number" ||
        !Number.isFinite(macro) ||
        macro <= 0 ||
        macro > 1
      ) {
        fail(
          "resolution.macroCellMeters",
          "must be a finite number in (0, 1] metres — a macro cell outside the Phase 1 magnitude range is refused",
        );
      }
      if (
        typeof coat !== "number" ||
        !Number.isFinite(coat) ||
        coat <= 0 ||
        coat > 1
      ) {
        fail(
          "resolution.coatCellMeters",
          "must be a finite number in (0, 1] metres — a coat cell outside the Phase 1 magnitude range is refused",
        );
      }
      if (
        typeof macro === "number" &&
        Number.isFinite(macro) &&
        typeof coat === "number" &&
        Number.isFinite(coat) &&
        coat > macro
      ) {
        fail(
          "resolution",
          "coatCellMeters must be ≤ macroCellMeters — a thin-coat discretization finer than the macro grid is the declared design",
        );
      }
    }
  }

  const tolerances = record["tolerances"];
  if (typeof tolerances !== "object" || tolerances === null || Array.isArray(tolerances)) {
    fail("tolerances", "must be an object (the declared per-dimension tolerance table)");
  } else {
    const table = tolerances as Record<string, unknown>;
    for (const dimension of TOLERANCE_DIMENSIONS) {
      const entry = table[dimension];
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        fail(
          `tolerances.${dimension}`,
          "must be an object { dimension, absolute, relative } — the declared table must cover every quantity dimension",
        );
        continue;
      }
      const toleranceRecord = entry as Record<string, unknown>;
      if (toleranceRecord["dimension"] !== dimension) {
        fail(
          `tolerances.${dimension}.dimension`,
          `must be the literal '${dimension}' (the row's own dimension)`,
        );
      }
      const absolute = toleranceRecord["absolute"];
      if (typeof absolute !== "number" || !Number.isFinite(absolute) || absolute < 0) {
        fail(`tolerances.${dimension}.absolute`, "must be a finite number ≥ 0 (canonical unit)");
      }
      const relative = toleranceRecord["relative"];
      if (typeof relative !== "number" || !Number.isFinite(relative) || relative < 0) {
        fail(`tolerances.${dimension}.relative`, "must be a finite number ≥ 0 (a fraction)");
      }
      if (dimension === "count") {
        const countAbsolute = toleranceRecord["absolute"];
        const countRelative = toleranceRecord["relative"];
        if (countAbsolute !== 0 || countRelative !== 0) {
          fail(
            `tolerances.count`,
            "integer count quantities admit NO tolerance (exact equality only) — a declared count tolerance would let a block-count mismatch pass silently",
          );
        }
      }
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return {
    ok: true,
    descriptor: {
      providerId: record["providerId"] as string,
      technologyVersion: record["technologyVersion"] as string,
      displayName: record["displayName"] as string,
      ...(isNonEmptyString(record["description"])
        ? { description: record["description"] as string }
        : {}),
      declaredCapabilities: [
        ...(record["declaredCapabilities"] as readonly BuildingOperationType[]),
      ],
      ...(resolution === undefined
        ? {}
        : { resolution: resolution as GeometryResolution }),
      tolerances: record["tolerances"] as Readonly<
        Record<ToleranceDimension, QuantityTolerance>
      >,
      implementation: implementation as GeometryImplementationKind,
    },
  };
}

/* ------------------------------------------------------------------ */
/* The canonical operation record (the neutral sequence vocabulary)     */
/* ------------------------------------------------------------------ */

/**
 * One typed parameter of a neutral corpus operation: numeric values
 * (dimensions) REQUIRE an explicit unit and must be strictly positive;
 * string values carry named choices (e.g. material) WITHOUT units — the
 * contract's own explicit-unit law, mirrored at the neutral vocabulary.
 */
export interface NeutralParameter {
  readonly name: string;
  readonly value: number | string;
  readonly unit?: string;
}

/** One backwards dependency edge, by 1-based operation index. */
export interface NeutralDependency {
  readonly dependsOnOperationIndex: number;
  readonly dependencyKind: "completion-before";
}

/**
 * ONE canonical operation of a substitution sequence — the neutral,
 * provider-agnostic record BOTH lanes consume (the reference lane lifts it
 * into a contract `EngineeringOperationIntent` through
 * `createOperationIntent`; the substitute lane reads it directly). Numeric
 * parameters REQUIRE units (the explicit-unit law); targets are anchored
 * (node + geometry refs — never raw provider geometry).
 */
export interface NeutralOperation {
  readonly operationType: BuildingOperationType;
  readonly parameters: readonly NeutralParameter[];
  readonly targetSelectorKind: SpatialSelectorKind;
  readonly targetNodeRefs: readonly string[];
  readonly targetGeometryRefs: readonly { readonly kind: TargetGeometryRefKind; readonly ref: string }[];
  readonly dependsOn?: readonly NeutralDependency[];
}

/* ------------------------------------------------------------------ */
/* The baseline scene (the deterministic world both lanes execute on)   */
/* ------------------------------------------------------------------ */

/**
 * The committed baseline scene: the solution identity, the pinned
 * deterministic instants (identity excludes them) and the READ-ONLY
 * baseline geometry table (surface facts — the coated-surface discipline:
 * the surface fact comes from the pinned baseline, never invented).
 */
export interface GeometryScene {
  readonly sceneId: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly baselineRealityVersionId: string;
  readonly projectId: string;
  readonly title: string;
  readonly problemStatement: string;
  readonly createdAt: string;
  readonly materializedAt: string;
  readonly validatedAt: string;
  readonly authoredAt: string;
  readonly baselineGeometry: Readonly<
    Record<string, { readonly value: number; readonly unit: string }>
  >;
}

/* ------------------------------------------------------------------ */
/* The substitution sequence (the corpus entry)                         */
/* ------------------------------------------------------------------ */

/**
 * ONE corpus entry: an ordered canonical operation sequence + the baseline
 * scene it runs against + the substitute PROFILE it evaluates (the
 * committed profile id — see registry.ts) + the declared expectation cell
 * from the closed three-cell vocabulary.
 */
export interface SubstitutionSequence {
  readonly sequenceId: string;
  readonly title?: string;
  readonly baselineSceneId: string;
  readonly operations: readonly NeutralOperation[];
  readonly substituteProfileId: string;
  readonly expectation: SubstitutionExpectation;
  /**
   * Required iff `expectation` is "declared-incompatible": the
   * closed-vocabulary comparison kind (PROD-029's failure vocabulary,
   * reused) the harness MUST record when it catches the divergence.
   */
  readonly declaredDifferenceKind?: FailureKind;
  readonly notes?: string;
}

/** One structural validation finding of a substitution sequence. */
export interface SequenceValidationFailure {
  readonly path: string;
  readonly detail: string;
}

export type SequenceValidation =
  | { readonly ok: true; readonly sequence: SubstitutionSequence }
  | { readonly ok: false; readonly failures: readonly SequenceValidationFailure[] };

/**
 * Validates one committed sequence (fail-closed; the corpus and any ad-hoc
 * sequence pass through THIS validator before evaluation). Checks: unique
 * non-empty id, a known scene reference, ≥ 1 operation, every operation
 * typed/anchored/positively-dimensioned with backwards-only dependency
 * edges, a known substitute profile id, the closed expectation vocabulary
 * and the declared-difference consistency rule (declared-incompatible
 * REQUIRES a closed-vocabulary kind; every other cell must NOT declare
 * one).
 */
export function validateSubstitutionSequence(
  value: unknown,
  knownProfileIds: readonly string[],
  knownSceneIds: readonly string[],
): SequenceValidation {
  const failures: SequenceValidationFailure[] = [];
  const fail = (path: string, detail: string): void => {
    failures.push({ path, detail });
  };
  const isNonEmptyString = (candidate: unknown): candidate is string =>
    typeof candidate === "string" && candidate.trim().length > 0;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      failures: [{ path: "$", detail: "a substitution sequence must be a JSON object" }],
    };
  }
  const record = value as Record<string, unknown>;

  if (!isNonEmptyString(record["sequenceId"])) {
    fail("sequenceId", "must be a non-empty string");
  }
  if (record["title"] !== undefined && !isNonEmptyString(record["title"])) {
    fail("title", "must be a non-empty string when present");
  }
  if (!isNonEmptyString(record["baselineSceneId"])) {
    fail("baselineSceneId", "must be a non-empty string");
  } else if (!knownSceneIds.includes(record["baselineSceneId"])) {
    fail(
      "baselineSceneId",
      `'${record["baselineSceneId"]}' is not one of the committed baseline scenes [${knownSceneIds.join(", ")}]`,
    );
  }

  const operations = record["operations"];
  if (!Array.isArray(operations) || operations.length === 0) {
    fail("operations", "must be a non-empty array — an empty sequence is not a substitution scenario");
  } else {
    for (const [index, entry] of operations.entries()) {
      const path = `operations[${index}]`;
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        fail(path, "must be an object (a neutral canonical operation)");
        continue;
      }
      const operation = entry as Record<string, unknown>;
      const operationType = operation["operationType"];
      if (
        typeof operationType !== "string" ||
        !(BUILDING_OPERATION_TYPES as readonly string[]).includes(operationType)
      ) {
        fail(
          `${path}.operationType`,
          `'${String(operationType)}' is outside the documented v1 operation-family vocabulary [${BUILDING_OPERATION_TYPES.join(", ")}]`,
        );
      }
      if (!isNonEmptyString(operation["targetSelectorKind"])) {
        fail(`${path}.targetSelectorKind`, "must be a non-empty string");
      }
      const nodeRefs = operation["targetNodeRefs"];
      if (
        !Array.isArray(nodeRefs) ||
        nodeRefs.length === 0 ||
        !nodeRefs.every(isNonEmptyString)
      ) {
        fail(
          `${path}.targetNodeRefs`,
          "must be a non-empty array of non-empty strings (an anchored target names reality nodes)",
        );
      }
      const geometryRefs = operation["targetGeometryRefs"];
      if (
        !Array.isArray(geometryRefs) ||
        geometryRefs.length === 0 ||
        !geometryRefs.every(
          (ref) =>
            typeof ref === "object" &&
            ref !== null &&
            !Array.isArray(ref) &&
            isNonEmptyString((ref as Record<string, unknown>)["kind"]) &&
            isNonEmptyString((ref as Record<string, unknown>)["ref"]),
        )
      ) {
        fail(
          `${path}.targetGeometryRefs`,
          "must be a non-empty array of { kind, ref } rows (an anchored target names geometry references)",
        );
      }
      const parameters = operation["parameters"];
      if (!Array.isArray(parameters) || parameters.length === 0) {
        fail(
          `${path}.parameters`,
          "must be a non-empty array — a parameterless operation is not representable",
        );
      } else {
        for (const [parameterIndex, parameterEntry] of parameters.entries()) {
          const parameterPath = `${path}.parameters[${parameterIndex}]`;
          if (
            typeof parameterEntry !== "object" ||
            parameterEntry === null ||
            Array.isArray(parameterEntry)
          ) {
            fail(parameterPath, "must be an object { name, value, unit? }");
            continue;
          }
          const parameter = parameterEntry as Record<string, unknown>;
          if (!isNonEmptyString(parameter["name"])) {
            fail(`${parameterPath}.name`, "must be a non-empty string");
          }
          const parameterValue = parameter["value"];
          if (typeof parameterValue === "number") {
            if (!Number.isFinite(parameterValue) || parameterValue <= 0) {
              fail(
                `${parameterPath}.value`,
                "must be a finite number > 0 (non-positive dimensions are deterministic geometry violations)",
              );
            }
            if (!isNonEmptyString(parameter["unit"])) {
              fail(
                `${parameterPath}.unit`,
                "must be a non-empty string — a numeric parameter is never a bare number (the explicit-unit law)",
              );
            }
          } else if (typeof parameterValue === "string") {
            if (parameterValue.trim().length === 0) {
              fail(`${parameterPath}.value`, "must be a non-empty string when a string value");
            }
            if (parameter["unit"] !== undefined) {
              fail(
                `${parameterPath}.unit`,
                "must be absent for string values (named choices carry no unit)",
              );
            }
          } else {
            fail(
              `${parameterPath}.value`,
              "must be a number (with a unit) or a string (a named choice) — the neutral vocabulary carries no other value type",
            );
          }
        }
      }
      const dependsOn = operation["dependsOn"];
      if (dependsOn !== undefined) {
        if (!Array.isArray(dependsOn)) {
          fail(`${path}.dependsOn`, "must be an array when present");
        } else {
          for (const [dependencyIndex, dependencyEntry] of dependsOn.entries()) {
            const dependencyPath = `${path}.dependsOn[${dependencyIndex}]`;
            if (
              typeof dependencyEntry !== "object" ||
              dependencyEntry === null ||
              Array.isArray(dependencyEntry)
            ) {
              fail(dependencyPath, "must be an object { dependsOnOperationIndex, dependencyKind }");
              continue;
            }
            const dependency = dependencyEntry as Record<string, unknown>;
            const referenced = dependency["dependsOnOperationIndex"];
            if (
              typeof referenced !== "number" ||
              !Number.isInteger(referenced) ||
              referenced < 1 ||
              referenced >= index + 1
            ) {
              fail(
                dependencyPath,
                `dependsOnOperationIndex must be an integer in [1, ${index}] — dependency edges point BACKWARDS in the sequence (self/forward edges are refused)`,
              );
            }
            if (dependency["dependencyKind"] !== "completion-before") {
              fail(
                `${dependencyPath}.dependencyKind`,
                "must be the literal 'completion-before' (the Phase 1 dependency vocabulary)",
              );
            }
          }
        }
      }
    }
  }

  if (!isNonEmptyString(record["substituteProfileId"])) {
    fail("substituteProfileId", "must be a non-empty string");
  } else if (!knownProfileIds.includes(record["substituteProfileId"])) {
    fail(
      "substituteProfileId",
      `'${record["substituteProfileId"]}' is not one of the committed substitute profiles [${knownProfileIds.join(", ")}]`,
    );
  }

  const expectation = record["expectation"];
  if (!isSubstitutionExpectation(expectation)) {
    fail(
      "expectation",
      `'${String(expectation)}' must be one of the closed behavior-matrix cells [${SUBSTITUTION_EXPECTATIONS.join(", ")}]`,
    );
  }
  const declaredDifferenceKind = record["declaredDifferenceKind"];
  if (expectation === "declared-incompatible") {
    if (typeof declaredDifferenceKind !== "string" || !isFailureKind(declaredDifferenceKind)) {
      fail(
        "declaredDifferenceKind",
        "a declared-incompatible sequence MUST declare 'declaredDifferenceKind' from the CLOSED PROD-029 failure vocabulary — the honest difference is declared up front, never discovered silently",
      );
    }
  } else if (declaredDifferenceKind !== undefined) {
    fail(
      "declaredDifferenceKind",
      "only a declared-incompatible sequence may declare 'declaredDifferenceKind'",
    );
  }
  if (record["notes"] !== undefined && !isNonEmptyString(record["notes"])) {
    fail("notes", "must be a non-empty string when present");
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return {
    ok: true,
    sequence: value as SubstitutionSequence,
  };
}

/* ------------------------------------------------------------------ */
/* The canonical topology-constraint projection (the boundary-guarded)  */
/* ------------------------------------------------------------------ */

/**
 * The closed topology-constraint vocabulary — the topological facts of a
 * building operation sequence BOTH lanes derive independently (the
 * reference from the engine-applied operations; the substitute from its
 * own accumulated state):
 *
 *  - `coat-anchors-baseline-surface` a plaster/finish coat anchors to the
 *    read-only baseline surface geometry (the COATED-SURFACE discipline);
 *  - `opening-hosted-by-element`     an opening-creation is hosted by the
 *    target element (the wall/slab that contains it);
 *  - `backfill-pairs-excavation`     a backfill pairs a prior excavation
 *    over the same target geometry (the earthworks pairing).
 */
export const TOPOLOGY_CONSTRAINT_KINDS = Object.freeze([
  "coat-anchors-baseline-surface",
  "opening-hosted-by-element",
  "backfill-pairs-excavation",
] as const);
export type TopologyConstraintKind = (typeof TOPOLOGY_CONSTRAINT_KINDS)[number];

/** One canonical topology-constraint row (the comparison payload). */
export interface CanonicalTopologyConstraint {
  readonly constraintId: string;
  readonly kind: TopologyConstraintKind;
  readonly subjectRefs: readonly string[];
  readonly statement: string;
}

/* ------------------------------------------------------------------ */
/* The comparison points (PROD-029's, extended per the work order)      */
/* ------------------------------------------------------------------ */

/**
 * The canonical comparison points of the geometry substitution benchmark.
 * `quantity-value`, `validation-verdict` and `boq-line` are PROD-029's own
 * point kinds; `validation-check` (the per-check comparison — "the checks
 * compare, not just the worst-of verdict") and `topology-constraint` (the
 * work order's topology demand) are this module's declared extensions.
 */
export const GEOMETRY_COMPARISON_POINTS = Object.freeze([
  "quantity-value",
  "validation-check",
  "validation-verdict",
  "topology-constraint",
  "boq-line",
] as const);
export type GeometryComparisonPointKind = (typeof GEOMETRY_COMPARISON_POINTS)[number];

/**
 * The closed-vocabulary divergence kind recorded when a comparison point
 * diverges. EVERY value is drawn from PROD-029's own
 * `DIVERGENCE_KIND_BY_POINT` table — the quantity/BOQ legs take the
 * operation-semantic family, the validation legs the reasoning family,
 * and the topology leg the state-evolution (state-digest) family. No
 * parallel vocabulary exists in this module.
 */
export const GEOMETRY_DIVERGENCE_KIND_BY_POINT: Readonly<
  Record<GeometryComparisonPointKind, FailureKind>
> = Object.freeze({
  "quantity-value": DIVERGENCE_KIND_BY_POINT["quantity-value"],
  "validation-check": DIVERGENCE_KIND_BY_POINT["validation-verdict"],
  "validation-verdict": DIVERGENCE_KIND_BY_POINT["validation-verdict"],
  "topology-constraint": DIVERGENCE_KIND_BY_POINT["state-digest"],
  "boq-line": DIVERGENCE_KIND_BY_POINT["boq-line"],
});

/* ------------------------------------------------------------------ */
/* The projection refusal types (the boundary guard's typed answer)     */
/* ------------------------------------------------------------------ */

/** One typed canonical-projection refusal (the boundary guard). */
export interface ProjectionRefusal {
  readonly refusalKind: "contract-mismatch";
  readonly detail: string;
}

export type ProjectionOutcome<T> =
  | { readonly ok: true; readonly projected: T }
  | { readonly ok: false; readonly refusal: ProjectionRefusal };

function failProjection(detail: string): { ok: false; refusal: ProjectionRefusal } {
  return {
    ok: false,
    refusal: {
      refusalKind: "contract-mismatch",
      detail,
    },
  };
}

/* ------------------------------------------------------------------ */
/* The canonical topology projection (the boundary guard at this seam)  */
/* ------------------------------------------------------------------ */

/**
 * Projects a provider's declared topology constraints onto the canonical
 * topology rows. REFUSES (typed, as `contract-mismatch` — the D26
 * discipline asserted at THIS seam): unknown fields (provider-specific
 * keys), non-canonical kind values, empty subject lists, malformed rows.
 * The canonical row set is CLOSED: {constraintId, kind, subjectRefs,
 * statement} — nothing else crosses the boundary.
 */
export function projectCanonicalTopologyConstraints(
  topologyJson: unknown,
): ProjectionOutcome<readonly CanonicalTopologyConstraint[]> {
  if (typeof topologyJson !== "string" || topologyJson.trim().length === 0) {
    return failProjection(
      "'topologyJson' must be a non-empty canonical-JSON string — a provider may not submit an empty or non-string payload at a canonical comparison point",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(topologyJson) as unknown;
  } catch {
    return failProjection(
      "'topologyJson' is not parseable canonical JSON — a provider-specific payload cannot cross the canonical boundary",
    );
  }
  if (!Array.isArray(parsed)) {
    return failProjection(
      "'topologyJson' must decode to a JSON array — a provider-specific topology representation cannot cross the canonical boundary",
    );
  }
  const constraints: CanonicalTopologyConstraint[] = [];
  for (const [index, entry] of parsed.entries()) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return failProjection(`'topologyJson[${index}]' must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const unknownKeys = Object.keys(record).filter(
      (key) =>
        key !== "constraintId" && key !== "kind" && key !== "subjectRefs" && key !== "statement",
    );
    if (unknownKeys.length > 0) {
      return failProjection(
        `'topologyJson[${index}]' carries the unknown field(s) [${unknownKeys.join(", ")}] — ` +
          "provider-specific topology fields are refused at canonical comparison points (the shape is closed)",
      );
    }
    const constraintId = record["constraintId"];
    const kind = record["kind"];
    const subjectRefs = record["subjectRefs"];
    const statement = record["statement"];
    if (typeof constraintId !== "string" || constraintId.trim().length === 0) {
      return failProjection(`'topologyJson[${index}].constraintId' must be a non-empty string`);
    }
    if (
      typeof kind !== "string" ||
      !(TOPOLOGY_CONSTRAINT_KINDS as readonly string[]).includes(kind)
    ) {
      return failProjection(
        `'topologyJson[${index}].kind' ('${String(kind)}') is not in the canonical TOPOLOGY_CONSTRAINT_KINDS vocabulary — a provider may not invent topology constraint kinds`,
      );
    }
    if (
      !Array.isArray(subjectRefs) ||
      subjectRefs.length === 0 ||
      !subjectRefs.every((ref) => typeof ref === "string" && ref.trim().length > 0)
    ) {
      return failProjection(
        `'topologyJson[${index}].subjectRefs' must be a non-empty array of non-empty strings (the constraint's read-only reality references)`,
      );
    }
    if (typeof statement !== "string" || statement.trim().length === 0) {
      return failProjection(
        `'topologyJson[${index}].statement' must be a non-empty string (the human-auditable constraint statement)`,
      );
    }
    constraints.push({
      constraintId,
      kind: kind as TopologyConstraintKind,
      subjectRefs: subjectRefs as readonly string[],
      statement,
    });
  }
  return { ok: true, projected: constraints };
}

/* ------------------------------------------------------------------ */
/* Misc pure helpers (shared by the adapter/harness)                    */
/* ------------------------------------------------------------------ */

/**
 * Resolves the declared tolerance row for ANY contract quantity
 * dimension. The four table rows cover length/area/volume/count — every
 * dimension of the Phase 1 quantity calculus; an out-of-table dimension
 * resolves to the EXACT tolerance (fail-closed, never invented slack).
 */
export function toleranceFor(
  descriptor: GeometryProviderDescriptor,
  dimension: QuantityDimension,
): QuantityTolerance {
  const row = descriptor.tolerances[dimension as ToleranceDimension];
  if (row !== undefined) {
    return row;
  }
  return { dimension: "count", absolute: 0, relative: 0 };
}
