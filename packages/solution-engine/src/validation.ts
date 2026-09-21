/**
 * Deterministic solution validation (PROD-022) — the server-side `Validate`
 * of ACR-005.
 *
 * `validateSolutionVersion(input)` runs the DETERMINISTIC checks the engine
 * supports over a solution version and produces a CONTRACT-SHAPED
 * `SolutionValidationSnapshot`:
 *
 *  - the explicit findings (`checks`: pass | fail | unknown |
 *    review-needed, never empty, every detail deterministic);
 *  - the worst-of `outcome` via the CONTRACT's own
 *    `validationOutcomeWorstOf` helper (fail > review-needed > unknown >
 *    pass — invariant-checked);
 *  - `inputDigest` pinning the sha-256 of the validated version's CANONICAL
 *    JSON bytes — the snapshot certifies exactly those bytes;
 *  - the engine identity (kind `aise-solution-engine`, this version);
 *  - `snapshotId` via the CONTRACT's `deriveValidationSnapshotId`;
 *  - `validatedAt` injected by the caller (deterministic; excluded from
 *    identity).
 *
 * THE CHECK INVENTORY (Phase 1 supported checks — deterministic, each
 * documented; the ACR-005 list of "unknown" or future checks is honestly
 * NOT claimed):
 *
 *  1. `operation.contract-invariants` — the contract's own cross-field
 *     invariant checkers over every operation, every state and the version
 *     container (typed-unit parameters, anchored targets, provenance,
 *     state-layer alignment, validated-requires-snapshot...). Any finding
 *     → FAIL naming the operation/index.
 *  2. `geometry.dimensions-positive` — every numeric parameter of every
 *     operation is strictly positive (a non-positive dimension is a
 *     deterministic geometry violation).
 *  3. `units.quantity-units-typed` — every numeric parameter's unit is in
 *     the engine's unit vocabulary AND every quantity-impact effect
 *     carries an explicit unit (unknown/missing units fail closed).
 *  4. `operation.ordering-dependencies` — every dependency edge points
 *     BACKWARDS in the sequence (an earlier operation); backwards-only
 *     edges are acyclic by construction. Forward/self edges → FAIL.
 *  5. `quantities.calculation-refs` — every quantity-impact effect
 *     references its deterministic calculation (non-empty calculationRef).
 *  6. `operation.capability-declared` — every operation's type is declared
 *     by the engine capability profile for its vertical: `supported` (or
 *     `degraded` — executing with limitations) → PASS (detail surfaces the
 *     degradation); `undeclared`/`unavailable` → FAIL (the version
 *     contains operations this engine cannot execute — it cannot be a
 *     validated executable proposal); profile status `unknown` → UNKNOWN
 *     (capability undetermined — the frozen honesty discipline: never
 *     conflated with fail, never guessed).
 *  7. `operation.phase1-limits` — the quantitative Phase 1 limits
 *     (max excavation depth 6 m; max wall height 3 m; max plaster
 *     thickness 50 mm per coat): within limits → PASS; exceeded →
 *     REVIEW-NEEDED (deterministic engineer-review flag — the engine can
 *     compute the quantities but the declared Phase 1 scope is exceeded).
 *
 * Qualitative limitations ("load-bearing elements require engineer review
 * before removal") are NOT validation checks: they are not computable from
 * typed parameters and remain surfaced by the capability profile and
 * negotiation reasons (rendered before any consequential action) — never
 * silently dropped, never fabricated into a pass.
 */

import { createHash } from "node:crypto";
import {
  SOLUTION_CONTRACT_VERSION,
  checkEngineeringOperation,
  checkProposedState,
  checkSolutionVersion,
  deriveValidationSnapshotId,
  validationOutcomeWorstOf,
  type OperationCapabilityProfile,
  type SolutionValidationSnapshot,
  type SolutionVersion,
  type ValidationCheck,
  type ValidationCheckResult,
} from "@aise/solution-contract";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { SOLUTION_ENGINE_KIND, SOLUTION_ENGINE_VERSION } from "./engine-version";
import { UNIT_VOCABULARY } from "./units";
import {
  evaluateOperationLimits,
  type OperationLimit,
} from "./quantity-models";
import type { EngineOptions } from "./apply";

function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

export interface ValidateVersionInput extends EngineOptions {
  readonly version: SolutionVersion;
  /** The engine-owned capability profile the version is validated against. */
  readonly capabilityProfile: OperationCapabilityProfile;
  /** Deterministic validation instant (excluded from snapshot identity). */
  readonly validatedAt: string;
}

/**
 * Deterministically validates one solution version and produces the
 * contract-shaped validation snapshot. PURE: same version + profile +
 * instant → byte-identical snapshot (same canonical serialization, same
 * snapshotId).
 */
export function validateSolutionVersion(input: ValidateVersionInput): SolutionValidationSnapshot {
  const checks: ValidationCheck[] = [];

  /* 1. Contract invariants (operations, states, version container). */
  const contractFindings = collectContractFindings(input.version);
  checks.push({
    checkId: "operation.contract-invariants",
    result: contractFindings.length === 0 ? "pass" : "fail",
    detail:
      contractFindings.length === 0
        ? `all ${input.version.operations.length} operations, ${input.version.states.length} ` +
          `states and the version container satisfy every contract invariant ` +
          `(typed-unit parameters, anchored targets, provenance, layer alignment)`
        : `contract invariant violations: ${contractFindings.join("; ")}`,
  });

  /* 2. Geometry dimensions positive. */
  const nonPositive = collectNonPositiveDimensions(input.version);
  checks.push({
    checkId: "geometry.dimensions-positive",
    result: nonPositive.length === 0 ? "pass" : "fail",
    detail:
      nonPositive.length === 0
        ? "every numeric operation parameter is strictly positive"
        : `non-positive dimensions: ${nonPositive.join("; ")}`,
  });

  /* 3. Units typed + in vocabulary; effect quantities carry units. */
  const unitProblems = collectUnitProblems(input.version);
  checks.push({
    checkId: "units.quantity-units-typed",
    result: unitProblems.length === 0 ? "pass" : "fail",
    detail:
      unitProblems.length === 0
        ? "every numeric parameter and effect quantity carries an explicit, engine-known unit"
        : `unit violations: ${unitProblems.join("; ")}`,
  });

  /* 4. Dependency ordering (backwards edges only). */
  const orderingProblems = collectOrderingProblems(input.version);
  checks.push({
    checkId: "operation.ordering-dependencies",
    result: orderingProblems.length === 0 ? "pass" : "fail",
    detail:
      orderingProblems.length === 0
        ? "dependency edges point backwards in the sequence; no cycles"
        : `dependency violations: ${orderingProblems.join("; ")}`,
  });

  /* 5. Calculation references. */
  const missingRefs = collectMissingCalculationRefs(input.version);
  checks.push({
    checkId: "quantities.calculation-refs",
    result: missingRefs.length === 0 ? "pass" : "fail",
    detail:
      missingRefs.length === 0
        ? "every quantity effect references its deterministic calculation"
        : `missing calculation references: ${missingRefs.join("; ")}`,
  });

  /* 6. Capability declared (honest unknown vs fail). */
  checks.push(checkCapabilityDeclared(input.version, input.capabilityProfile));

  /* 7. Quantitative Phase 1 limits (review-needed on exceedance). */
  checks.push(checkPhase1Limits(input.version, input.limits));

  const outcome = validationOutcomeWorstOf(checks.map((check) => check.result));
  const inputDigest = sha256Hex(input.version);
  return {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    snapshotId: deriveValidationSnapshotId({
      solutionId: input.version.solutionId,
      versionNumber: input.version.versionNumber,
      inputDigest,
      engineKind: SOLUTION_ENGINE_KIND,
      engineVersion: SOLUTION_ENGINE_VERSION,
      outcome,
    }),
    solutionId: input.version.solutionId,
    versionNumber: input.version.versionNumber,
    outcome,
    checks,
    inputDigest,
    engine: { kind: SOLUTION_ENGINE_KIND, version: SOLUTION_ENGINE_VERSION },
    validatedAt: input.validatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Check collectors (pure, deterministic)                               */
/* ------------------------------------------------------------------ */

function collectContractFindings(version: SolutionVersion): string[] {
  const findings: string[] = [];
  for (const operation of version.operations) {
    for (const finding of checkEngineeringOperation(operation)) {
      findings.push(
        `operation ${operation.operationIndex} (${operation.operationType}): ` +
          `${finding.code} — ${finding.detail}`,
      );
    }
  }
  for (const state of version.states) {
    for (const finding of checkProposedState(state)) {
      findings.push(`state ${state.stateIndex}: ${finding.code} — ${finding.detail}`);
    }
  }
  for (const finding of checkSolutionVersion(version)) {
    findings.push(`version: ${finding.code} — ${finding.detail}`);
  }
  return findings;
}

function collectNonPositiveDimensions(version: SolutionVersion): string[] {
  const problems: string[] = [];
  for (const operation of version.operations) {
    for (const parameter of operation.parameters) {
      if (typeof parameter.value === "number" && parameter.value <= 0) {
        problems.push(
          `operation ${operation.operationIndex} (${operation.operationType}): ` +
            `parameter '${parameter.name}' = ${parameter.value} ${parameter.unit ?? ""}`.trim(),
        );
      }
    }
  }
  return problems;
}

function collectUnitProblems(version: SolutionVersion): string[] {
  const problems: string[] = [];
  for (const operation of version.operations) {
    for (const parameter of operation.parameters) {
      if (typeof parameter.value === "number") {
        if (typeof parameter.unit !== "string" || parameter.unit.trim() === "") {
          problems.push(
            `operation ${operation.operationIndex}: parameter '${parameter.name}' ` +
              `has numeric value without an explicit unit`,
          );
        } else if (UNIT_VOCABULARY[parameter.unit] === undefined) {
          problems.push(
            `operation ${operation.operationIndex}: parameter '${parameter.name}' ` +
              `carries unknown unit '${parameter.unit}'`,
          );
        }
      }
    }
    for (const [index, effect] of operation.effects.entries()) {
      if (effect.effectKind === "quantity-impact") {
        const quantity = effect.quantity;
        if (
          quantity === undefined ||
          typeof quantity.unit !== "string" ||
          quantity.unit.trim() === ""
        ) {
          problems.push(
            `operation ${operation.operationIndex} effect ${index}: ` +
              `quantity-impact without a typed unit`,
          );
        }
      }
    }
  }
  return problems;
}

function collectOrderingProblems(version: SolutionVersion): string[] {
  const problems: string[] = [];
  const indexById = new Map<string, number>();
  for (const operation of version.operations) {
    indexById.set(operation.operationId, operation.operationIndex);
  }
  for (const operation of version.operations) {
    for (const dependency of operation.dependsOn) {
      const referenced = indexById.get(dependency.operationRef);
      if (referenced === undefined) {
        problems.push(
          `operation ${operation.operationIndex}: dependency ` +
            `'${dependency.operationRef}' does not resolve inside this version`,
        );
      } else if (referenced >= operation.operationIndex) {
        problems.push(
          `operation ${operation.operationIndex}: dependency on operation ${referenced} ` +
            `is not backwards (self or forward edge)`,
        );
      }
    }
  }
  return problems;
}

function collectMissingCalculationRefs(version: SolutionVersion): string[] {
  const problems: string[] = [];
  for (const operation of version.operations) {
    for (const [index, effect] of operation.effects.entries()) {
      if (
        effect.effectKind === "quantity-impact" &&
        (effect.quantity?.calculationRef === undefined ||
          effect.quantity.calculationRef.trim() === "")
      ) {
        problems.push(
          `operation ${operation.operationIndex} effect ${index}: ` +
            `quantity-impact without a calculation reference`,
        );
      }
    }
  }
  return problems;
}

function checkCapabilityDeclared(
  version: SolutionVersion,
  profile: OperationCapabilityProfile,
): ValidationCheck {
  const undeclared: string[] = [];
  const undetermined: string[] = [];
  const degraded: string[] = [];
  for (const operation of version.operations) {
    const vertical = operation.domain.vertical;
    const domainEntry = profile.domains.find((entry) => entry.domain.vertical === vertical);
    if (domainEntry === undefined || domainEntry.status === "unavailable") {
      undeclared.push(
        `operation ${operation.operationIndex} (${operation.operationType}) in vertical ` +
          `'${vertical}' — the engine profile declares no available capability for it`,
      );
      continue;
    }
    if (domainEntry.status === "unknown") {
      undetermined.push(
        `vertical '${vertical}' capability is undetermined (profile status unknown)`,
      );
      continue;
    }
    const operationEntry = domainEntry.operations.find(
      (entry) => entry.operationType === operation.operationType,
    );
    if (operationEntry === undefined || operationEntry.status === "unavailable") {
      undeclared.push(
        `operation ${operation.operationIndex} (${operation.operationType}) — the engine ` +
          `profile declares no available capability for it in vertical '${vertical}'`,
      );
      continue;
    }
    if (operationEntry.status === "unknown") {
      undetermined.push(
        `operation type '${operation.operationType}' capability is undetermined ` +
          `(profile status unknown; probing required)`,
      );
      continue;
    }
    if (operationEntry.status === "degraded") {
      degraded.push(
        `operation ${operation.operationIndex} (${operation.operationType}) executes ` +
          `with declared limitations: ${operationEntry.limitations.join("; ")}`,
      );
    }
  }
  let result: ValidationCheckResult;
  let detail: string;
  if (undeclared.length > 0) {
    result = "fail";
    detail =
      `the version contains operations the engine cannot execute: ` +
      `${undeclared.join("; ")} — a validated executable proposal cannot contain them`;
  } else if (undetermined.length > 0) {
    result = "unknown";
    detail =
      `capability undetermined for: ${undetermined.join("; ")} — never conflated ` +
      `with unsupported; probing is required before these can be certified`;
  } else if (degraded.length > 0) {
    result = "pass";
    detail =
      `all ${version.operations.length} operations are declared executable; ` +
      `degraded entries surfaced: ${degraded.join("; ")}`;
  } else {
    result = "pass";
    detail =
      `all ${version.operations.length} operations are declared supported by ` +
      `engine profile '${profile.profileId}' for their verticals`;
  }
  return { checkId: "operation.capability-declared", result, detail };
}

function checkPhase1Limits(
  version: SolutionVersion,
  limits?: Readonly<Record<string, readonly OperationLimit[]>>,
): ValidationCheck {
  const exceeded: string[] = [];
  for (const operation of version.operations) {
    for (const limit of evaluateOperationLimits(
      operation.operationType,
      operation.parameters,
      limits,
    )) {
      exceeded.push(
        `operation ${operation.operationIndex} (${operation.operationType}): ${limit.detail}`,
      );
    }
  }
  return {
    checkId: "operation.phase1-limits",
    result: exceeded.length === 0 ? "pass" : "review-needed",
    detail:
      exceeded.length === 0
        ? "every operation is within the quantitative Phase 1 limits"
        : `quantitative Phase 1 limits exceeded — engineer review required: ` +
          `${exceeded.join("; ")}`,
  };
}
