/**
 * Solution contract invariant checks (PROD-021).
 *
 * THE CROSS-FIELD SEMANTIC INVARIANTS of the solution contract, as PURE
 * typed checker functions. The repo's contract-package discipline keeps the
 * WIRE SCHEMAS plain (`.passthrough()` zod objects — see the codec engine
 * and the strict-decode schema walker of `@aise/shared-contracts`), so the
 * invariants that need more than one field ship HERE, mirroring the
 * boundary-parser discipline of the intervention model (AISE-026's
 * `missing_provenance` / `numeric_value_without_unit` /
 * `invalid_epistemic_status` codes).
 *
 * Every checker is PURE and DETERMINISTIC: it reads a decoded value and
 * returns structured findings (code + path + detail) — it never mutates,
 * never throws, never performs I/O. The dispatcher
 * `checkSolutionContractObject` maps a wire-object name to its checker so
 * corpus tests can prove every VALID fixture passes every invariant.
 *
 * The checks are the contract's semantic teeth:
 *
 *  - `numeric_parameter_without_unit` — the frozen typed-unit discipline;
 *  - `unanchored_operation_target` — an operation must anchor to observed
 *    reality through at least one node or geometry reference;
 *  - `missing_operation_provenance` — attribution is never optional
 *    (evidence ids, a derivation note or the exact agent command);
 *  - `self_referencing_operation_dependency` — precedence edges never loop
 *    on the operation itself;
 *  - `proposed_state_index_mismatch` — states[N] follows operations 1..N;
 *  - `solution_version_state_count_mismatch` / state-index alignment;
 *  - `validated_version_without_snapshot` — BOQ generation gate;
 *  - `version_one_with_parent` — version lineage starts at 1;
 *  - `superseded_solution_without_successor` — superseding names its
 *    successor;
 *  - `validation_outcome_not_worst_of_checks` — the deterministic verdict;
 *  - `operation_effect_missing_ref` / `operation_effect_missing_quantity`
 *    — every effect is complete;
 *  - `trace_set_version_pin_mismatch` / `trace_set_snapshot_pin_mismatch`
 *    — BOQ traces never float across versions or snapshots;
 *  - `duplicate_operation_type_capability` / `duplicate_profile_vertical`
 *    — negotiation stays deterministic.
 */

import type { EngineeringOperationIntent } from "./intent";
import type {
  EngineeringOperation,
  OperationProvenance,
  OperationTarget,
} from "./operation";
import type { ProposedState } from "./state";
import type { SolutionValidationSnapshot, ValidationCheckResult } from "./validation";
import type { OperationCapabilityProfile } from "./capability";
import type { Solution, SolutionVersion } from "./solution";
import type { SolutionBoqLineTrace, SolutionBoqTraceSet } from "./trace";
import { validationOutcomeWorstOf } from "./validation";

/* ------------------------------------------------------------------ */
/* Findings                                                             */
/* ------------------------------------------------------------------ */

export const SOLUTION_CONTRACT_INVARIANT_CODES = [
  "numeric_parameter_without_unit",
  "unanchored_operation_target",
  "missing_operation_provenance",
  "self_referencing_operation_dependency",
  "proposed_state_index_mismatch",
  "solution_version_state_count_mismatch",
  "solution_version_state_index_mismatch",
  "validated_version_without_snapshot",
  "version_one_with_parent",
  "superseded_solution_without_successor",
  "validation_outcome_not_worst_of_checks",
  "operation_effect_missing_ref",
  "operation_effect_missing_quantity",
  "trace_set_version_pin_mismatch",
  "trace_set_snapshot_pin_mismatch",
  "duplicate_operation_type_capability",
  "duplicate_profile_vertical",
] as const;
export type SolutionContractInvariantCode =
  (typeof SOLUTION_CONTRACT_INVARIANT_CODES)[number];

/** One structured invariant finding. */
export interface SolutionContractInvariantFinding {
  readonly code: SolutionContractInvariantCode;
  /** JSON pointer-ish path inside the checked object. */
  readonly path: ReadonlyArray<string | number>;
  readonly detail: string;
}

function finding(
  code: SolutionContractInvariantCode,
  path: ReadonlyArray<string | number>,
  detail: string,
): SolutionContractInvariantFinding {
  return { code, path: [...path], detail };
}

/* ------------------------------------------------------------------ */
/* Parameter / target / provenance / dependency checks                  */
/* ------------------------------------------------------------------ */

/** Numeric parameters REQUIRE an explicit unit; non-numeric carry none. */
export function checkTypedOperationParameters(
  parameters: readonly { name: string; value: unknown; unit?: unknown }[],
): readonly SolutionContractInvariantFinding[] {
  const findings: SolutionContractInvariantFinding[] = [];
  for (const [index, parameter] of parameters.entries()) {
    if (
      typeof parameter.value === "number" &&
      (typeof parameter.unit !== "string" || parameter.unit.trim() === "")
    ) {
      findings.push(
        finding(
          "numeric_parameter_without_unit",
          ["parameters", index],
          `parameter '${parameter.name}' has numeric value ${parameter.value} ` +
            `without an explicit unit`,
        ),
      );
    }
  }
  return findings;
}

/** A target must anchor to reality via ≥1 nodeRef or ≥1 geometryRef. */
export function checkOperationTarget(
  target: OperationTarget,
): readonly SolutionContractInvariantFinding[] {
  if (target.nodeRefs.length === 0 && target.geometryRefs.length === 0) {
    return [
      finding(
        "unanchored_operation_target",
        ["target"],
        "an operation target must anchor to observed reality: at least one " +
          "nodeRef or geometryRef is required",
      ),
    ];
  }
  return [];
}

/** Provenance requires evidence ids, a derivation note or the command text. */
export function checkOperationProvenance(
  provenance: OperationProvenance,
): readonly SolutionContractInvariantFinding[] {
  const hasEvidence = provenance.evidenceIds.length > 0;
  const hasNote =
    typeof provenance.derivationNote === "string" && provenance.derivationNote.length > 0;
  const hasCommand =
    typeof provenance.commandText === "string" && provenance.commandText.length > 0;
  if (!hasEvidence && !hasNote && !hasCommand) {
    return [
      finding(
        "missing_operation_provenance",
        ["provenance"],
        "provenance requires a non-empty evidenceIds list, a derivation " +
          "note or the exact agent command text",
      ),
    ];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Intent and operation checks                                          */
/* ------------------------------------------------------------------ */

/** The full invariant set of an operation INTENT. */
export function checkEngineeringOperationIntent(
  intent: EngineeringOperationIntent,
): readonly SolutionContractInvariantFinding[] {
  return [
    ...checkTypedOperationParameters(intent.parameters),
    ...checkOperationTarget(intent.target),
    ...checkOperationProvenance(intent.provenance),
  ];
}

/** The full invariant set of a recorded OPERATION. */
export function checkEngineeringOperation(
  operation: EngineeringOperation,
): readonly SolutionContractInvariantFinding[] {
  const findings: SolutionContractInvariantFinding[] = [
    ...checkTypedOperationParameters(operation.parameters),
    ...checkOperationTarget(operation.target),
    ...checkOperationProvenance(operation.provenance),
  ];
  for (const [index, dependency] of operation.dependsOn.entries()) {
    if (dependency.operationRef === operation.operationId) {
      findings.push(
        finding(
          "self_referencing_operation_dependency",
          ["dependsOn", index],
          `operation '${operation.operationId}' depends on itself`,
        ),
      );
    }
  }
  for (const [index, effect] of operation.effects.entries()) {
    if (effect.effectKind === "state-transition" && effect.resultingStateRef === undefined) {
      findings.push(
        finding(
          "operation_effect_missing_ref",
          ["effects", index],
          "state-transition effect requires resultingStateRef",
        ),
      );
    }
    if (
      effect.effectKind === "quantity-impact" &&
      (effect.quantity === undefined || effect.direction === undefined)
    ) {
      findings.push(
        finding(
          "operation_effect_missing_quantity",
          ["effects", index],
          "quantity-impact effect requires a quantity and a direction",
        ),
      );
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Proposed state / solution / version checks                           */
/* ------------------------------------------------------------------ */

/** states[N] must list exactly N applied operations, in order. */
export function checkProposedState(
  state: ProposedState,
): readonly SolutionContractInvariantFinding[] {
  if (state.appliedOperationIds.length !== state.stateIndex) {
    return [
      finding(
        "proposed_state_index_mismatch",
        ["appliedOperationIds"],
        `stateIndex ${state.stateIndex} requires ${state.stateIndex} applied ` +
          `operation ids; found ${state.appliedOperationIds.length}`,
      ),
    ];
  }
  return [];
}

/** A superseded solution must name its successor. */
export function checkSolution(
  solution: Solution,
): readonly SolutionContractInvariantFinding[] {
  if (solution.status === "superseded" && solution.supersededBy === undefined) {
    return [
      finding(
        "superseded_solution_without_successor",
        ["supersededBy"],
        "a superseded solution must name the solution that supersedes it",
      ),
    ];
  }
  return [];
}

/**
 * The version-consistency invariants: state count (operations + 1), state
 * index alignment, validated-requires-snapshot, version-1-has-no-parent.
 */
export function checkSolutionVersion(
  version: SolutionVersion,
): readonly SolutionContractInvariantFinding[] {
  const findings: SolutionContractInvariantFinding[] = [];
  if (version.states.length !== version.operations.length + 1) {
    findings.push(
      finding(
        "solution_version_state_count_mismatch",
        ["states"],
        `states.length must equal operations.length + 1 (layer 0 is the ` +
          `baseline overlay); found ${version.states.length} states for ` +
          `${version.operations.length} operations`,
      ),
    );
  }
  for (const [index, state] of version.states.entries()) {
    if (state.stateIndex !== index) {
      findings.push(
        finding(
          "solution_version_state_index_mismatch",
          ["states", index],
          `states[${index}] must carry stateIndex ${index}; found ${state.stateIndex}`,
        ),
      );
    }
  }
  if (version.status === "validated" && version.validationSnapshotRef === undefined) {
    findings.push(
      finding(
        "validated_version_without_snapshot",
        ["validationSnapshotRef"],
        "a validated version must declare its validation snapshot (a " +
          "solution BOQ may be generated only from a declared snapshot)",
      ),
    );
  }
  if (version.versionNumber === 1 && version.parentVersionNumber !== undefined) {
    findings.push(
      finding(
        "version_one_with_parent",
        ["parentVersionNumber"],
        "version 1 has no parent version (lineage starts at 1)",
      ),
    );
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Validation snapshot check                                            */
/* ------------------------------------------------------------------ */

/** The outcome must equal the deterministic worst-of the check results. */
export function checkSolutionValidationSnapshot(
  snapshot: SolutionValidationSnapshot,
): readonly SolutionContractInvariantFinding[] {
  const worst = validationOutcomeWorstOf(
    snapshot.checks.map((check) => check.result as ValidationCheckResult),
  );
  if (snapshot.outcome !== worst) {
    return [
      finding(
        "validation_outcome_not_worst_of_checks",
        ["outcome"],
        `outcome must be the worst-of the checks (${worst}); found ${snapshot.outcome}`,
      ),
    ];
  }
  return findingsForChecks(snapshot);
}

/** A snapshot never fabricates findings: pass checks carry deterministic detail. */
function findingsForChecks(
  snapshot: SolutionValidationSnapshot,
): readonly SolutionContractInvariantFinding[] {
  const findings: SolutionContractInvariantFinding[] = [];
  for (const [index, check] of snapshot.checks.entries()) {
    if (typeof check.detail !== "string" || check.detail.trim().length === 0) {
      findings.push(
        finding(
          "validation_outcome_not_worst_of_checks",
          ["checks", index, "detail"],
          `check '${check.checkId}' carries an empty detail — validation is never silent`,
        ),
      );
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Capability profile checks                                            */
/* ------------------------------------------------------------------ */

/** Unique verticals; unique operation types per vertical. */
export function checkOperationCapabilityProfile(
  profile: OperationCapabilityProfile,
): readonly SolutionContractInvariantFinding[] {
  const findings: SolutionContractInvariantFinding[] = [];
  const verticals = new Set<string>();
  for (const [domainIndex, domainEntry] of profile.domains.entries()) {
    const vertical = domainEntry.domain.vertical;
    if (verticals.has(vertical)) {
      findings.push(
        finding(
          "duplicate_profile_vertical",
          ["domains", domainIndex],
          `vertical '${vertical}' is declared more than once`,
        ),
      );
    }
    verticals.add(vertical);
    const types = new Set<string>();
    for (const [operationIndex, entry] of domainEntry.operations.entries()) {
      if (types.has(entry.operationType)) {
        findings.push(
          finding(
            "duplicate_operation_type_capability",
            ["domains", domainIndex, "operations", operationIndex],
            `operation type '${entry.operationType}' is declared more than once ` +
              `for vertical '${vertical}'`,
          ),
        );
      }
      types.add(entry.operationType);
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* BOQ trace checks                                                     */
/* ------------------------------------------------------------------ */

/** A line trace carries its own completeness (schema covers the minimum). */
export function checkSolutionBoqLineTrace(
  trace: SolutionBoqLineTrace,
): readonly SolutionContractInvariantFinding[] {
  const findings: SolutionContractInvariantFinding[] = [];
  const operationIds = new Set<string>();
  for (const [index, contribution] of trace.contributingOperations.entries()) {
    if (operationIds.has(contribution.operationId)) {
      findings.push(
        finding(
          "trace_set_version_pin_mismatch",
          ["contributingOperations", index],
          `duplicate contribution of operation '${contribution.operationId}'`,
        ),
      );
    }
    operationIds.add(contribution.operationId);
  }
  return findings;
}

/** Every line trace pins the set's solution/version/snapshot. */
export function checkSolutionBoqTraceSet(
  traceSet: SolutionBoqTraceSet,
): readonly SolutionContractInvariantFinding[] {
  const findings: SolutionContractInvariantFinding[] = [];
  for (const [index, line] of traceSet.lineTraces.entries()) {
    if (
      line.solutionId !== traceSet.solutionId ||
      line.versionNumber !== traceSet.versionNumber
    ) {
      findings.push(
        finding(
          "trace_set_version_pin_mismatch",
          ["lineTraces", index],
          `line trace '${line.boqLineId}' pins solution '${line.solutionId}' ` +
            `version ${line.versionNumber}; the trace set pins ` +
            `'${traceSet.solutionId}' version ${traceSet.versionNumber}`,
        ),
      );
    }
    if (line.validationSnapshotRef !== traceSet.validationSnapshotRef) {
      findings.push(
        finding(
          "trace_set_snapshot_pin_mismatch",
          ["lineTraces", index],
          `line trace '${line.boqLineId}' references snapshot ` +
            `'${line.validationSnapshotRef}'; the trace set was generated ` +
            `from '${traceSet.validationSnapshotRef}'`,
        ),
      );
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* The registry-driven dispatcher                                       */
/* ------------------------------------------------------------------ */

/**
 * Runs the invariant checks of one wire object by name. Returns an empty
 * list for objects without cross-field invariants (and unknown names —
 * schema-level validation is the codec's job). PURE; consumes the value
 * read-only.
 */
export function checkSolutionContractObject(
  objectName: string,
  value: unknown,
): readonly SolutionContractInvariantFinding[] {
  switch (objectName) {
    case "EngineeringOperationIntent":
      return checkEngineeringOperationIntent(value as EngineeringOperationIntent);
    case "EngineeringOperation":
      return checkEngineeringOperation(value as EngineeringOperation);
    case "OperationTarget":
      return checkOperationTarget(value as OperationTarget);
    case "ProposedState":
      return checkProposedState(value as ProposedState);
    case "Solution":
      return checkSolution(value as Solution);
    case "SolutionVersion":
      return checkSolutionVersion(value as SolutionVersion);
    case "SolutionValidationSnapshot":
      return checkSolutionValidationSnapshot(value as SolutionValidationSnapshot);
    case "OperationCapabilityProfile":
      return checkOperationCapabilityProfile(value as OperationCapabilityProfile);
    case "SolutionBoqLineTrace":
      return checkSolutionBoqLineTrace(value as SolutionBoqLineTrace);
    case "SolutionBoqTraceSet":
      return checkSolutionBoqTraceSet(value as SolutionBoqTraceSet);
    default:
      return [];
  }
}
