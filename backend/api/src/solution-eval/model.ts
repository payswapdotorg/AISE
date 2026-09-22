/**
 * PROD-029 — the Layer-3 SUBSTITUTION-EVALUATION model (types + pure
 * validators).
 *
 * The provider-neutral evaluation entry point for Layer 3: the typed
 * vocabulary of a SUBSTITUTION SCENARIO — which Layer-3 seam is under
 * substitution (operation-compiler / engine-execution / validation /
 * boq-derivation), which provider-shaped SUBSTITUTE stands in for the
 * canonical component, which committed baseline fixture the canonical
 * behavior is pinned to, the SUBSTITUTE'S DECLARED RUN (the raw,
 * provider-shaped executions that flow through the provider-registry
 * control plane's normalized I/O), and the comparison criteria (canonical
 * equality of operation identities / state digests / validation verdicts /
 * BOQ lines — or the HONEST difference declaration).
 *
 * GOVERNING DOCTRINE (spec/solution-operation-contract.md,
 * docs/productization-layer-hardening-work-orders.md, HFX-000): a provider
 * is an implementation candidate, NEVER canonical engineering truth. A
 * substituted provider can never change operation semantics, validation
 * verdicts or quantity semantics — if it produces a different canonical
 * result, this model's comparison points RECORD the difference with the
 * right closed-vocabulary failure kind; they never hide it.
 *
 * THE CANONICAL-BOUNDARY GUARD (the D26 gate): provider-specific types must
 * not reach canonical Layer-3 comparison points. Every value a substitute
 * contributes to a comparison is projected STRICTLY onto the canonical
 * shapes declared here (`projectCanonicalIntentSemantics`,
 * `projectCanonicalQuantities`, `projectCanonicalValidationChecks`,
 `projectCanonicalBoqLines`, `isCanonicalDigest`) — a provider output that
 * carries an unknown field, a non-canonical vocabulary value, a
 * provider-specific nested object or a malformed digest is REFUSED with a
 * typed projection failure and recorded as a `contract-mismatch` shape
 * divergence, never silently coerced into a canonical comparison.
 *
 * House discipline (the solution/solution-boq/providers exemplars): pure
 * validators over `unknown`, typed failures with a frozen closed code
 * registry, no zod, no throws inside validators, no clock, no randomness,
 * no I/O.
 */

import {
  QUANTITY_DIMENSIONS,
  QUANTITY_IMPACT_DIRECTIONS,
  VALIDATION_CHECK_RESULTS,
  VALIDATION_SNAPSHOT_OUTCOMES,
} from "@aise/solution-contract";
import { isFailureKind, type FailureKind } from "@aise/provider-registry";

/* ------------------------------------------------------------------ */
/* The Layer-3 seams under substitution                                  */
/* ------------------------------------------------------------------ */

/**
 * The four Layer-3 substitution seams. Each names one canonical component
 * whose committed behavior is the baseline, and whose provider-shaped
 * substitute is evaluated through the control plane.
 */
export const SUBSTITUTION_SEAMS = Object.freeze([
  "operation-compiler",
  "engine-execution",
  "validation",
  "boq-derivation",
] as const);
export type SubstitutionSeam = (typeof SUBSTITUTION_SEAMS)[number];

/** The control-plane capability each seam's substitute must declare. */
export const SEAM_CAPABILITIES: Readonly<Record<SubstitutionSeam, string>> = {
  "operation-compiler": "layer3-operation-compiler",
  "engine-execution": "layer3-engine-execution",
  validation: "layer3-validation",
  "boq-derivation": "layer3-boq-derivation",
};

/** The committed baseline fixtures the harness can pin a scenario to. */
export const BASELINE_FIXTURE_IDS = Object.freeze([
  "command-corpus-slice/1",
  "wall-upgrade-journey/1",
] as const);
export type BaselineFixtureId = (typeof BASELINE_FIXTURE_IDS)[number];

/** The lawful seam ↔ baseline pairing (frozen reference data). */
export const SEAM_BASELINE_PAIRING: Readonly<Record<SubstitutionSeam, BaselineFixtureId>> = {
  "operation-compiler": "command-corpus-slice/1",
  "engine-execution": "wall-upgrade-journey/1",
  validation: "wall-upgrade-journey/1",
  "boq-derivation": "wall-upgrade-journey/1",
};

/* ------------------------------------------------------------------ */
/* Error codes (transport-level, frozen closed registry)                 */
/* ------------------------------------------------------------------ */

export const SOLUTION_EVAL_ERROR_CODES = Object.freeze([
  "invalid_request",
  "invalid_scenario",
  "invalid_registry_log",
  "malformed_json",
  "unknown_route",
] as const);
export type SolutionEvalErrorCode = (typeof SOLUTION_EVAL_ERROR_CODES)[number];

/** A typed transport error (parse-level); evaluation-level refusals are RESULTS, not errors. */
export class SolutionEvalError extends Error {
  readonly code: SolutionEvalErrorCode;
  readonly detail: string;

  constructor(code: SolutionEvalErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "SolutionEvalError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* The substitution scenario                                            */
/* ------------------------------------------------------------------ */

export const SUBSTITUTION_SCENARIO_KIND = "layer3-substitution-scenario" as const;
export const SUBSTITUTION_SCENARIO_SCHEMA_VERSION = "layer3-substitution/1" as const;

/** What the scenario declares the harness must find. */
export const SUBSTITUTION_EXPECTATIONS = Object.freeze([
  "canonical-equality",
  "declared-divergence",
] as const);
export type SubstitutionExpectation = (typeof SUBSTITUTION_EXPECTATIONS)[number];

/** The identity of the substitute (the control-plane registry key). */
export interface SubstituteReference {
  readonly providerId: string;
  readonly technologyVersion: string;
}

/**
 * ONE declared raw provider execution answering ONE canonical seam input
 * (keyed by the input's deterministic key: a corpus utterance id, an
 * operation step index, or the singleton key of a whole-version input).
 * The `execution` payload is provider-shaped raw data — it is normalized
 * through the control plane (`normalizeResult`) at evaluation time and is
 * NEVER trusted as canonical.
 */
export interface DeclaredExecution {
  readonly inputKey: string;
  readonly execution: unknown;
}

/** The substitute's declared run: the seam capability + one execution per canonical input. */
export interface SubstitutedRunDeclaration {
  readonly capability: string;
  readonly executions: readonly DeclaredExecution[];
}

/**
 * A Layer-3 substitution scenario — fully declarative, deterministic data.
 * The harness resolves the substitute's `ProviderProfile` from the registry
 * log (the registration event), computes the baseline path LIVE through the
 * canonical components pinned by `baselineId`, and drives the declared
 * executions through the control plane's normalized I/O.
 */
export interface SubstitutionScenario {
  readonly kind: typeof SUBSTITUTION_SCENARIO_KIND;
  readonly schemaVersion: typeof SUBSTITUTION_SCENARIO_SCHEMA_VERSION;
  readonly scenarioId: string;
  readonly title: string;
  readonly seam: SubstitutionSeam;
  readonly baselineId: BaselineFixtureId;
  readonly substitute: SubstituteReference;
  readonly substitutedRun: SubstitutedRunDeclaration;
  readonly expectation: SubstitutionExpectation;
  /**
   * Required iff `expectation` is "declared-divergence": the closed-vocabulary
   * failure kind the harness MUST record when it catches the divergence. The
   * harness's verdict is checked against this declaration — a substitution
   * that diverges with a different kind than declared fails the benchmark.
   */
  readonly expectedDivergenceKind?: FailureKind;
  readonly note?: string;
}

/* ------------------------------------------------------------------ */
/* Comparison points (the canonical evaluation semantics)                */
/* ------------------------------------------------------------------ */

/** The canonical outputs a substitution is compared over. */
export const COMPARISON_POINT_KINDS = Object.freeze([
  "operation-identity",
  "state-digest",
  "quantity-value",
  "validation-verdict",
  "boq-line",
] as const);
export type ComparisonPointKind = (typeof COMPARISON_POINT_KINDS)[number];

/**
 * The closed-vocabulary failure kind recorded when a comparison point
 * diverges (frozen reference data — the divergence taxonomy):
 *
 *   operation-identity → operation-semantic-failure (the substitute's
 *     operation semantics differ → a different canonical operation identity);
 *   state-digest → operation-semantic-failure (the substitute's state
 *     evolution diverges from the canonical chain);
 *   quantity-value → operation-semantic-failure (wrong quantity semantics —
 *     the closed vocabulary's "wrong units" family);
 *   validation-verdict → reasoning-failure (an incorrect inference/verdict
 *     over the same correctly-perceived inputs);
 *   boq-line → operation-semantic-failure (wrong derived work-item or
 *     quantity semantics for the operation);
 *
 * shape divergence (an unprojectable provider output) is recorded as
 * `contract-mismatch` by the projection guard, independent of this table.
 */
export const DIVERGENCE_KIND_BY_POINT: Readonly<Record<ComparisonPointKind, FailureKind>> = {
  "operation-identity": "operation-semantic-failure",
  "state-digest": "operation-semantic-failure",
  "quantity-value": "operation-semantic-failure",
  "validation-verdict": "reasoning-failure",
  "boq-line": "operation-semantic-failure",
};

/** The recorded result of one canonical comparison point. */
export interface ComparisonPointResult {
  readonly pointKind: ComparisonPointKind;
  /** The canonical subject the point compares (utterance id / step key / line key …). */
  readonly subjectId: string;
  /** The canonical baseline value (a digest, an id, a verdict, a quantity value or a line key). */
  readonly baselineValue: string | number;
  /** The substituted value, or a typed shape-refusal marker. */
  readonly substitutedValue: string | number;
  readonly equal: boolean;
  /** Present iff `equal` is false: the closed-vocabulary kind for THIS point. */
  readonly divergenceKind?: FailureKind;
  readonly detail: string;
}

/** The honest difference declaration (present iff the substitution diverged). */
export interface SubstitutionDivergence {
  /** The closed-vocabulary failure kind of the FIRST diverging point (deterministic order). */
  readonly failureKind: FailureKind;
  /** The distinct failure kinds of all diverging points (deterministic order). */
  readonly failureKinds: readonly FailureKind[];
  readonly points: readonly ComparisonPointResult[];
  readonly detail: string;
}

/* ------------------------------------------------------------------ */
/* Evaluation refusals (typed, closed — no comparison could run)          */
/* ------------------------------------------------------------------ */

export const SUBSTITUTION_REFUSAL_KINDS = Object.freeze([
  /** The scenario is internally inconsistent (seam/baseline/capability/expectation mismatch). */
  "scenario-inconsistent",
  /** The registry log does not replay lawfully. */
  "registry-log-refused",
  /** No registration for the substitute's providerId + technologyVersion. */
  "provider-not-registered",
  /** The substitute's entry is not in the `evaluation` state. */
  "evaluation-not-started",
  /** The profile does not declare the seam's capability (or the run declares another one). */
  "seam-capability-mismatch",
  /** The declared run misses an execution for a canonical seam input. */
  "missing-declared-execution",
  /** A derived registry event was refused by the registry state machine. */
  "registry-event-refused",
] as const);
export type SubstitutionRefusalKind = (typeof SUBSTITUTION_REFUSAL_KINDS)[number];

export interface SubstitutionRefusal {
  readonly kind: SubstitutionRefusalKind;
  readonly detail: string;
}

/** The verdict of one substitution evaluation. */
export const SUBSTITUTION_VERDICTS = Object.freeze([
  "substitution-proven",
  "divergence-recorded",
  "substitution-refused",
] as const);
export type SubstitutionVerdict = (typeof SUBSTITUTION_VERDICTS)[number];

/* ------------------------------------------------------------------ */
/* Canonical comparison shapes (the D26 boundary guard's declared forms)  */
/* ------------------------------------------------------------------ */

/** A canonical parameter row (numeric values REQUIRE a unit). */
export interface CanonicalParameter {
  readonly name: string;
  readonly value: number | string | boolean;
  readonly unit?: string;
}

/** The canonical operation-target projection. */
export interface CanonicalTarget {
  readonly selectorKind: string;
  readonly nodeRefs: readonly string[];
  readonly geometryRefs: readonly { readonly kind: string; readonly ref: string }[];
  readonly units: { readonly linear: string; readonly angular: string };
}

/** One canonical dependency edge. */
export interface CanonicalDependency {
  readonly operationRef: string;
  readonly dependencyKind: string;
}

/**
 * The canonical SEMANTIC projection of an operation intent — exactly the
 * fields the contract's `deriveEngineeringOperationId` consumes (provenance
 * excluded by design). A substitute that wants its compiled intent compared
 * canonically must emit THIS shape; anything else is refused.
 */
export interface CanonicalIntentSemantics {
  readonly operationType: string;
  readonly vertical: string;
  readonly parameters: readonly CanonicalParameter[];
  readonly target: CanonicalTarget;
  readonly dependsOn: readonly CanonicalDependency[];
}

/** One canonical quantity-impact row (the engine's effect quantities). */
export interface CanonicalQuantity {
  readonly label: string;
  readonly dimension: (typeof QUANTITY_DIMENSIONS)[number];
  readonly value: number;
  readonly unit: string;
  readonly direction: (typeof QUANTITY_IMPACT_DIRECTIONS)[number];
  readonly calculationRef: string;
}

/** One canonical validation-check row. */
export interface CanonicalValidationCheck {
  readonly checkId: string;
  readonly result: (typeof VALIDATION_CHECK_RESULTS)[number];
  readonly detail?: string;
}

/** One canonical BOQ-line semantic projection (the comparison payload of a line). */
export interface CanonicalBoqLine {
  readonly activity: string;
  readonly direction: (typeof QUANTITY_IMPACT_DIRECTIONS)[number];
  readonly dimension: (typeof QUANTITY_DIMENSIONS)[number];
  readonly unit: string;
  readonly value: number;
  readonly material?: string;
  readonly calculationRef: string;
}

/** One typed canonical-projection refusal (the boundary guard). */
export interface ProjectionRefusal {
  readonly refusalKind: "contract-mismatch";
  readonly detail: string;
}

export type ProjectionOutcome<T> =
  | { readonly ok: true; readonly projected: T }
  | { readonly ok: false; readonly refusal: ProjectionRefusal };

/* ------------------------------------------------------------------ */
/* Pure helpers                                                          */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** The canonical digest shape: 64 lowercase hex characters (sha-256). */
export function isCanonicalDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function failProjection(detail: string): { ok: false; refusal: ProjectionRefusal } {
  return {
    ok: false,
    refusal: {
      refusalKind: "contract-mismatch",
      detail,
    },
  };
}

/** Parses a provider-declared canonical-JSON string field (typed refusal on malformed JSON). */
function parseCanonicalJsonField(field: string, value: unknown): ProjectionOutcome<unknown> {
  if (!isNonEmptyString(value)) {
    return failProjection(
      `the '${field}' canonical-JSON field must be a non-empty string — a provider may not submit an empty or non-string payload at a canonical comparison point`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return failProjection(
      `the '${field}' field is not parseable canonical JSON — a provider-specific payload cannot be projected onto the canonical comparison shape`,
    );
  }
  return { ok: true, projected: parsed };
}

/* ------------------------------------------------------------------ */
/* The canonical projections (the boundary guard, one per structured form) */
/* ------------------------------------------------------------------ */

function projectParameters(field: string, value: unknown): ProjectionOutcome<readonly CanonicalParameter[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return failProjection(
      `'${field}' must be a non-empty array of canonical parameter rows — an empty or non-array parameter list is not a canonical intent projection`,
    );
  }
  const parameters: CanonicalParameter[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      return failProjection(
        `'${field}[${index}]' must be an object — a provider-specific parameter representation cannot cross the canonical boundary`,
      );
    }
    const unknownKeys = Object.keys(entry).filter(
      (key) => key !== "name" && key !== "value" && key !== "unit",
    );
    if (unknownKeys.length > 0) {
      return failProjection(
        `'${field}[${index}]' carries the unknown field(s) [${unknownKeys.join(", ")}] — provider-specific fields are refused at canonical comparison points (the shape is closed)`,
      );
    }
    const name = entry["name"];
    const parameterValue = entry["value"];
    const unit = entry["unit"];
    if (!isNonEmptyString(name)) {
      return failProjection(`'${field}[${index}].name' must be a non-empty string`);
    }
    if (
      (typeof parameterValue !== "number" || !Number.isFinite(parameterValue)) &&
      typeof parameterValue !== "string" &&
      typeof parameterValue !== "boolean"
    ) {
      return failProjection(
        `'${field}[${index}].value' must be a finite number, a string or a boolean — provider-specific value types cannot cross the canonical boundary`,
      );
    }
    if (unit !== undefined && !isNonEmptyString(unit)) {
      return failProjection(`'${field}[${index}].unit' must be a non-empty string when present`);
    }
    if (typeof parameterValue === "number" && unit === undefined) {
      return failProjection(
        `'${field}[${index}]' is a numeric parameter without a unit — the canonical rule (numeric values REQUIRE a unit) is not negotiable at the comparison boundary`,
      );
    }
    parameters.push({
      name,
      value: parameterValue,
      ...(unit === undefined ? {} : { unit }),
    });
  }
  return { ok: true, projected: parameters };
}

/**
 * Projects a substitute's declared intent semantics onto the canonical
 * semantic shape. REFUSES (typed, as `contract-mismatch`): unknown fields
 * (provider-specific keys), non-canonical parameter rows, numeric values
 * without units, malformed targets/dependencies. This is the D26 boundary
 * guard for the operation-compiler seam.
 */
export function projectCanonicalIntentSemantics(
  semanticsJson: unknown,
): ProjectionOutcome<CanonicalIntentSemantics> {
  const parsed = parseCanonicalJsonField("intentSemanticsJson", semanticsJson);
  if (!parsed.ok) {
    return parsed;
  }
  const value = parsed.projected;
  if (!isRecord(value)) {
    return failProjection(
      "'intentSemanticsJson' must decode to a JSON object — the canonical semantic projection is an object",
    );
  }
  const allowed = ["operationType", "vertical", "parameters", "target", "dependsOn"];
  const unknownKeys = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknownKeys.length > 0) {
    return failProjection(
      `'intentSemanticsJson' carries the unknown field(s) [${unknownKeys.join(", ")}] — ` +
        "provider-specific intent fields are refused at canonical comparison points (the semantic projection is closed)",
    );
  }
  if (!isNonEmptyString(value["operationType"])) {
    return failProjection("'intentSemanticsJson.operationType' must be a non-empty string");
  }
  if (!isNonEmptyString(value["vertical"])) {
    return failProjection("'intentSemanticsJson.vertical' must be a non-empty string");
  }
  const parameters = projectParameters("intentSemanticsJson.parameters", value["parameters"]);
  if (!parameters.ok) {
    return parameters;
  }
  const target = value["target"];
  if (!isRecord(target)) {
    return failProjection("'intentSemanticsJson.target' must be an object");
  }
  const targetKeys = Object.keys(target);
  const unknownTargetKeys = targetKeys.filter(
    (key) => key !== "selectorKind" && key !== "nodeRefs" && key !== "geometryRefs" && key !== "units",
  );
  if (unknownTargetKeys.length > 0) {
    return failProjection(
      `'intentSemanticsJson.target' carries the unknown field(s) [${unknownTargetKeys.join(", ")}] — provider-specific target fields are refused at canonical comparison points`,
    );
  }
  if (!isNonEmptyString(target["selectorKind"])) {
    return failProjection("'intentSemanticsJson.target.selectorKind' must be a non-empty string");
  }
  const nodeRefs = target["nodeRefs"];
  if (!Array.isArray(nodeRefs) || nodeRefs.length === 0 || !nodeRefs.every(isNonEmptyString)) {
    return failProjection(
      "'intentSemanticsJson.target.nodeRefs' must be a non-empty array of non-empty strings",
    );
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
    return failProjection(
      "'intentSemanticsJson.target.geometryRefs' must be a non-empty array of { kind, ref } rows",
    );
  }
  const units = target["units"];
  if (
    !isRecord(units) ||
    !isNonEmptyString(units["linear"]) ||
    !isNonEmptyString(units["angular"])
  ) {
    return failProjection(
      "'intentSemanticsJson.target.units' must be { linear: string, angular: string }",
    );
  }
  const dependsOn = value["dependsOn"];
  if (!Array.isArray(dependsOn)) {
    return failProjection("'intentSemanticsJson.dependsOn' must be an array (possibly empty)");
  }
  const dependencies: CanonicalDependency[] = [];
  for (const [index, entry] of dependsOn.entries()) {
    if (!isRecord(entry)) {
      return failProjection(
        `'intentSemanticsJson.dependsOn[${index}]' must be an object — a provider-specific dependency representation cannot cross the canonical boundary`,
      );
    }
    const dependency = entry as Record<string, unknown>;
    if (!isNonEmptyString(dependency["operationRef"]) || !isNonEmptyString(dependency["dependencyKind"])) {
      return failProjection(
        `'intentSemanticsJson.dependsOn[${index}]' must carry non-empty 'operationRef' and 'dependencyKind'`,
      );
    }
    dependencies.push({
      operationRef: dependency["operationRef"],
      dependencyKind: dependency["dependencyKind"],
    });
  }
  return {
    ok: true,
    projected: {
      operationType: value["operationType"],
      vertical: value["vertical"],
      parameters: parameters.projected,
      target: {
        selectorKind: target["selectorKind"],
        nodeRefs: nodeRefs as readonly string[],
        geometryRefs: geometryRefs as readonly { kind: string; ref: string }[],
        units: { linear: units["linear"], angular: units["angular"] },
      },
      dependsOn: dependencies,
    },
  };
}

/**
 * Projects a substitute's declared effect quantities onto the canonical
 * quantity rows (closed dimension/direction vocabularies, explicit units,
 * calculation references). The D26 boundary guard for the
 * engine-execution seam.
 */
export function projectCanonicalQuantities(
  quantitiesJson: unknown,
): ProjectionOutcome<readonly CanonicalQuantity[]> {
  const parsed = parseCanonicalJsonField("quantitiesJson", quantitiesJson);
  if (!parsed.ok) {
    return parsed;
  }
  const value = parsed.projected;
  if (!Array.isArray(value)) {
    return failProjection(
      "'quantitiesJson' must decode to a JSON array — a provider-specific quantity representation cannot cross the canonical boundary",
    );
  }
  const quantities: CanonicalQuantity[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      return failProjection(`'quantitiesJson[${index}]' must be an object`);
    }
    const unknownKeys = Object.keys(entry).filter(
      (key) =>
        key !== "label" &&
        key !== "dimension" &&
        key !== "value" &&
        key !== "unit" &&
        key !== "direction" &&
        key !== "calculationRef",
    );
    if (unknownKeys.length > 0) {
      return failProjection(
        `'quantitiesJson[${index}]' carries the unknown field(s) [${unknownKeys.join(", ")}] — provider-specific quantity fields are refused at canonical comparison points`,
      );
    }
    const label = entry["label"];
    const dimension = entry["dimension"];
    const quantityValue = entry["value"];
    const unit = entry["unit"];
    const direction = entry["direction"];
    const calculationRef = entry["calculationRef"];
    if (!isNonEmptyString(label)) {
      return failProjection(`'quantitiesJson[${index}].label' must be a non-empty string`);
    }
    if (typeof dimension !== "string" || !(QUANTITY_DIMENSIONS as readonly string[]).includes(dimension)) {
      return failProjection(
        `'quantitiesJson[${index}].dimension' ('${String(dimension)}') is not in the canonical QUANTITY_DIMENSIONS vocabulary — a provider may not invent quantity dimensions`,
      );
    }
    if (!isFiniteNumber(quantityValue)) {
      return failProjection(`'quantitiesJson[${index}].value' must be a finite number`);
    }
    if (!isNonEmptyString(unit)) {
      return failProjection(
        `'quantitiesJson[${index}].unit' must be a non-empty string — a canonical quantity is never a bare number`,
      );
    }
    if (typeof direction !== "string" || !(QUANTITY_IMPACT_DIRECTIONS as readonly string[]).includes(direction)) {
      return failProjection(
        `'quantitiesJson[${index}].direction' ('${String(direction)}') is not in the canonical QUANTITY_IMPACT_DIRECTIONS vocabulary`,
      );
    }
    if (!isNonEmptyString(calculationRef)) {
      return failProjection(
        `'quantitiesJson[${index}].calculationRef' must be a non-empty string — canonical quantity provenance is mandatory`,
      );
    }
    quantities.push({
      label,
      dimension: dimension as CanonicalQuantity["dimension"],
      value: quantityValue,
      unit,
      direction: direction as CanonicalQuantity["direction"],
      calculationRef,
    });
  }
  return { ok: true, projected: quantities };
}

/**
 * Projects a substitute's declared validation checks onto the canonical
 * check rows (closed result vocabulary). The D26 boundary guard for the
 * validation seam.
 */
export function projectCanonicalValidationChecks(
  checksJson: unknown,
): ProjectionOutcome<readonly CanonicalValidationCheck[]> {
  const parsed = parseCanonicalJsonField("checksJson", checksJson);
  if (!parsed.ok) {
    return parsed;
  }
  const value = parsed.projected;
  if (!Array.isArray(value) || value.length === 0) {
    return failProjection(
      "'checksJson' must decode to a non-empty JSON array — a canonical validation snapshot is never silent (checks ≥ 1)",
    );
  }
  const checks: CanonicalValidationCheck[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      return failProjection(`'checksJson[${index}]' must be an object`);
    }
    const unknownKeys = Object.keys(entry).filter(
      (key) => key !== "checkId" && key !== "result" && key !== "detail",
    );
    if (unknownKeys.length > 0) {
      return failProjection(
        `'checksJson[${index}]' carries the unknown field(s) [${unknownKeys.join(", ")}] — provider-specific check fields are refused at canonical comparison points`,
      );
    }
    const checkId = entry["checkId"];
    const result = entry["result"];
    const detail = entry["detail"];
    if (!isNonEmptyString(checkId)) {
      return failProjection(`'checksJson[${index}].checkId' must be a non-empty string`);
    }
    if (typeof result !== "string" || !(VALIDATION_CHECK_RESULTS as readonly string[]).includes(result)) {
      return failProjection(
        `'checksJson[${index}].result' ('${String(result)}') is not in the canonical VALIDATION_CHECK_RESULTS vocabulary — a provider may not invent check results`,
      );
    }
    if (detail !== undefined && !isNonEmptyString(detail)) {
      return failProjection(`'checksJson[${index}].detail' must be a non-empty string when present`);
    }
    checks.push({
      checkId,
      result: result as CanonicalValidationCheck["result"],
      ...(detail === undefined ? {} : { detail }),
    });
  }
  return { ok: true, projected: checks };
}

/**
 * Projects a substitute's declared BOQ lines onto the canonical line
 * semantic rows (closed dimension/direction vocabularies, explicit units,
 * calculation references). The D26 boundary guard for the boq-derivation
 * seam.
 */
export function projectCanonicalBoqLines(
  linesJson: unknown,
): ProjectionOutcome<readonly CanonicalBoqLine[]> {
  const parsed = parseCanonicalJsonField("linesJson", linesJson);
  if (!parsed.ok) {
    return parsed;
  }
  const value = parsed.projected;
  if (!Array.isArray(value) || value.length === 0) {
    return failProjection(
      "'linesJson' must decode to a non-empty JSON array — a canonical solution BOQ carries at least one line",
    );
  }
  const lines: CanonicalBoqLine[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      return failProjection(`'linesJson[${index}]' must be an object`);
    }
    const unknownKeys = Object.keys(entry).filter(
      (key) =>
        key !== "activity" &&
        key !== "direction" &&
        key !== "dimension" &&
        key !== "unit" &&
        key !== "value" &&
        key !== "material" &&
        key !== "calculationRef",
    );
    if (unknownKeys.length > 0) {
      return failProjection(
        `'linesJson[${index}]' carries the unknown field(s) [${unknownKeys.join(", ")}] — provider-specific line fields are refused at canonical comparison points`,
      );
    }
    const activity = entry["activity"];
    const direction = entry["direction"];
    const dimension = entry["dimension"];
    const unit = entry["unit"];
    const lineValue = entry["value"];
    const material = entry["material"];
    const calculationRef = entry["calculationRef"];
    if (!isNonEmptyString(activity)) {
      return failProjection(`'linesJson[${index}].activity' must be a non-empty string`);
    }
    if (typeof direction !== "string" || !(QUANTITY_IMPACT_DIRECTIONS as readonly string[]).includes(direction)) {
      return failProjection(
        `'linesJson[${index}].direction' ('${String(direction)}') is not in the canonical QUANTITY_IMPACT_DIRECTIONS vocabulary`,
      );
    }
    if (typeof dimension !== "string" || !(QUANTITY_DIMENSIONS as readonly string[]).includes(dimension)) {
      return failProjection(
        `'linesJson[${index}].dimension' ('${String(dimension)}') is not in the canonical QUANTITY_DIMENSIONS vocabulary`,
      );
    }
    if (!isNonEmptyString(unit)) {
      return failProjection(
        `'linesJson[${index}].unit' must be a non-empty string — a canonical BOQ quantity is never a bare number`,
      );
    }
    if (!isFiniteNumber(lineValue)) {
      return failProjection(`'linesJson[${index}].value' must be a finite number`);
    }
    if (material !== undefined && !isNonEmptyString(material)) {
      return failProjection(`'linesJson[${index}].material' must be a non-empty string when present`);
    }
    if (!isNonEmptyString(calculationRef)) {
      return failProjection(
        `'linesJson[${index}].calculationRef' must be a non-empty string — canonical BOQ quantity provenance is mandatory`,
      );
    }
    lines.push({
      activity,
      direction: direction as CanonicalBoqLine["direction"],
      dimension: dimension as CanonicalBoqLine["dimension"],
      unit,
      value: lineValue,
      ...(material === undefined ? {} : { material }),
      calculationRef,
    });
  }
  return { ok: true, projected: lines };
}

/** Projects one 64-hex canonical digest field (ids and state digests). */
export function projectCanonicalDigest(
  field: string,
  value: unknown,
): ProjectionOutcome<string> {
  if (!isCanonicalDigest(value)) {
    return failProjection(
      `the '${field}' field must be a 64-lowercase-hex canonical digest — a provider-specific identifier format cannot cross the canonical boundary`,
    );
  }
  return { ok: true, projected: value };
}

/** Projects one canonical snapshot-outcome / check-result vocabulary field. */
export function projectCanonicalVerdict(
  field: string,
  value: unknown,
): ProjectionOutcome<(typeof VALIDATION_SNAPSHOT_OUTCOMES)[number]> {
  if (typeof value !== "string" || !(VALIDATION_SNAPSHOT_OUTCOMES as readonly string[]).includes(value)) {
    return failProjection(
      `the '${field}' field ('${String(value)}') is not in the canonical VALIDATION_SNAPSHOT_OUTCOMES vocabulary — a provider may not invent validation outcomes`,
    );
  }
  return { ok: true, projected: value as (typeof VALIDATION_SNAPSHOT_OUTCOMES)[number] };
}

/* ------------------------------------------------------------------ */
/* Scenario parsing (pure, fail-closed)                                  */
/* ------------------------------------------------------------------ */

function requireNonEmptyString(value: unknown, code: SolutionEvalErrorCode, field: string): string {
  if (!isNonEmptyString(value)) {
    throw new SolutionEvalError(code, `the '${field}' field must be a non-empty string`);
  }
  return value;
}

/**
 * Parses an unknown payload as a `SubstitutionScenario`. Fail-closed, typed
 * refusals (SolutionEvalError); validates the closed vocabularies, the
 * seam/baseline pairing and the expectation/expectedDivergenceKind
 * consistency.
 */
export function parseSubstitutionScenario(payload: unknown): SubstitutionScenario {
  if (!isRecord(payload)) {
    throw new SolutionEvalError("invalid_scenario", "a substitution scenario must be a JSON object");
  }
  if (payload["kind"] !== SUBSTITUTION_SCENARIO_KIND) {
    throw new SolutionEvalError(
      "invalid_scenario",
      `expected the typed seal '${SUBSTITUTION_SCENARIO_KIND}'`,
    );
  }
  if (payload["schemaVersion"] !== SUBSTITUTION_SCENARIO_SCHEMA_VERSION) {
    throw new SolutionEvalError(
      "invalid_scenario",
      `expected the schema version '${SUBSTITUTION_SCENARIO_SCHEMA_VERSION}'`,
    );
  }
  const scenarioId = requireNonEmptyString(payload["scenarioId"], "invalid_scenario", "scenarioId");
  requireNonEmptyString(payload["title"], "invalid_scenario", "title");

  const seam = payload["seam"];
  if (typeof seam !== "string" || !(SUBSTITUTION_SEAMS as readonly string[]).includes(seam)) {
    throw new SolutionEvalError(
      "invalid_scenario",
      `'seam' ('${String(seam)}') is not one of the Layer-3 substitution seams [${SUBSTITUTION_SEAMS.join(", ")}]`,
    );
  }
  const baselineId = payload["baselineId"];
  if (
    typeof baselineId !== "string" ||
    !(BASELINE_FIXTURE_IDS as readonly string[]).includes(baselineId)
  ) {
    throw new SolutionEvalError(
      "invalid_scenario",
      `'baselineId' ('${String(baselineId)}') is not one of the committed baseline fixtures [${BASELINE_FIXTURE_IDS.join(", ")}]`,
    );
  }
  if (SEAM_BASELINE_PAIRING[seam as SubstitutionSeam] !== baselineId) {
    throw new SolutionEvalError(
      "invalid_scenario",
      `baseline '${baselineId}' does not pin the '${seam}' seam (expected '${SEAM_BASELINE_PAIRING[seam as SubstitutionSeam]}')`,
    );
  }

  const substitute = payload["substitute"];
  if (!isRecord(substitute)) {
    throw new SolutionEvalError("invalid_scenario", "'substitute' must be an object");
  }
  const providerId = requireNonEmptyString(substitute["providerId"], "invalid_scenario", "substitute.providerId");
  const technologyVersion = requireNonEmptyString(
    substitute["technologyVersion"],
    "invalid_scenario",
    "substitute.technologyVersion",
  );

  const substitutedRun = payload["substitutedRun"];
  if (!isRecord(substitutedRun)) {
    throw new SolutionEvalError("invalid_scenario", "'substitutedRun' must be an object");
  }
  const capability = requireNonEmptyString(
    substitutedRun["capability"],
    "invalid_scenario",
    "substitutedRun.capability",
  );
  const executions = substitutedRun["executions"];
  if (!Array.isArray(executions) || executions.length === 0) {
    throw new SolutionEvalError(
      "invalid_scenario",
      "'substitutedRun.executions' must be a non-empty array — the declared run answers every canonical seam input",
    );
  }
  for (const [index, entry] of executions.entries()) {
    if (!isRecord(entry)) {
      throw new SolutionEvalError(
        "invalid_scenario",
        `'substitutedRun.executions[${index}]' must be an object`,
      );
    }
    requireNonEmptyString(entry["inputKey"], "invalid_scenario", `substitutedRun.executions[${index}].inputKey`);
  }
  if (capability !== SEAM_CAPABILITIES[seam as SubstitutionSeam]) {
    throw new SolutionEvalError(
      "invalid_scenario",
      `'substitutedRun.capability' ('${capability}') does not name the '${seam}' seam's control-plane capability ('${SEAM_CAPABILITIES[seam as SubstitutionSeam]}')`,
    );
  }

  const expectation = payload["expectation"];
  if (
    typeof expectation !== "string" ||
    !(SUBSTITUTION_EXPECTATIONS as readonly string[]).includes(expectation)
  ) {
    throw new SolutionEvalError(
      "invalid_scenario",
      `'expectation' ('${String(expectation)}') must be 'canonical-equality' or 'declared-divergence'`,
    );
  }
  const expectedDivergenceKind = payload["expectedDivergenceKind"];
  if (expectation === "declared-divergence") {
    if (typeof expectedDivergenceKind !== "string" || !isFailureKind(expectedDivergenceKind)) {
      throw new SolutionEvalError(
        "invalid_scenario",
        "a 'declared-divergence' scenario MUST declare 'expectedDivergenceKind' from the CLOSED failure vocabulary — the honest difference is declared up front, never discovered silently",
      );
    }
  } else if (expectedDivergenceKind !== undefined) {
    throw new SolutionEvalError(
      "invalid_scenario",
      "a 'canonical-equality' scenario must NOT declare 'expectedDivergenceKind'",
    );
  }
  const note = payload["note"];

  const scenario: SubstitutionScenario = {
    kind: SUBSTITUTION_SCENARIO_KIND,
    schemaVersion: SUBSTITUTION_SCENARIO_SCHEMA_VERSION,
    scenarioId,
    title: payload["title"] as string,
    seam: seam as SubstitutionSeam,
    baselineId: baselineId as BaselineFixtureId,
    substitute: { providerId, technologyVersion },
    substitutedRun: {
      capability,
      executions: executions.map((entry) => {
        const record = entry as Record<string, unknown>;
        return { inputKey: record["inputKey"] as string, execution: record["execution"] };
      }),
    },
    expectation: expectation as SubstitutionExpectation,
    ...(expectedDivergenceKind === undefined
      ? {}
      : { expectedDivergenceKind: expectedDivergenceKind as FailureKind }),
    ...(note === undefined ? {} : { note: note as string }),
  };
  return scenario;
}

/** The registry-log request payload parse (an array of control-plane events). */
export function parseRegistryLogPayload(payload: unknown): readonly unknown[] {
  if (!Array.isArray(payload)) {
    throw new SolutionEvalError(
      "invalid_registry_log",
      "the registry log must be a JSON array of provider-registry events",
    );
  }
  return payload;
}
