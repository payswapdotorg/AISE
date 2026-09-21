/**
 * Engine typed outcomes and machine-readable reasons (PROD-022).
 *
 * FAIL CLOSED, ALWAYS: every refusal the engine produces is one of the three
 * fail-closed outcomes of the work order — `invalid`, `unsupported` or
 * `needs-input` — and every one carries MACHINE-READABLE reasons (a stable
 * code + deterministic detail). There is no code path that silently drops,
 * best-efforts or reinterprets an operation the engine cannot apply.
 *
 * REASON-CODE MAPPING (documented in the package README):
 *
 *  - `invalid`          — the intent/inputs violate a contract invariant, a
 *                         unit rule or a dependency rule the engine enforces
 *                         (codes: intent_invariant_violation, unknown_unit,
 *                         unit_dimension_mismatch, parameter_not_numeric,
 *                         parameter_not_positive, missing_parameter_for_model,
 *                         dependency_not_applied, operation_index_mismatch,
 *                         baseline_mismatch, duplicate_operation_in_state).
 *  - `unsupported`      — negotiation answered `unsupported` (definitively
 *                         not supported by the capability profile; codes
 *                         negotiation-unsupported, mirrored verbatim).
 *  - `needs-input`      — the intent is UNDER-SPECIFIED or a required input
 *                         is UNRESOLVED: negotiation `blocked` (missing
 *                         parameters — ASK, never invent), negotiation
 *                         `unknown` (capability undetermined — probing
 *                         required; never conflated with unsupported), or a
 *                         surface-coated operation whose target surface area
 *                         the read-only baseline resolver could not resolve
 *                         (surface_area_unresolved).
 */

/** The three fail-closed outcomes plus `applied`. */
export const ENGINE_APPLICATION_OUTCOMES = Object.freeze([
  "applied",
  "invalid",
  "unsupported",
  "needs-input",
] as const);
export type EngineApplicationOutcome = (typeof ENGINE_APPLICATION_OUTCOMES)[number];

/** The engine's machine-readable reason codes (never empty on refusal). */
export const ENGINE_REASON_CODES = Object.freeze([
  // invalid: contract invariant / unit / dependency rule violations
  "intent_invariant_violation",
  "unknown_unit",
  "unit_dimension_mismatch",
  "parameter_not_numeric",
  "parameter_not_positive",
  "missing_parameter_for_model",
  "dependency_not_applied",
  "operation_index_mismatch",
  "baseline_mismatch",
  "duplicate_operation_in_state",
  // unsupported: definitive capability refusals (negotiation-mirrored)
  "capability_unsupported",
  // needs-input: under-specified or unresolvable inputs
  "missing_required_parameter",
  "capability_undetermined",
  "surface_area_unresolved",
  // versioned revision (undo) refusals
  "version_terminal",
  "unknown_operation_to_revert",
  "revision_not_appendable",
] as const);
export type EngineReasonCode = (typeof ENGINE_REASON_CODES)[number];

/** One machine-readable reason: stable code + deterministic detail. */
export interface EngineReason {
  readonly code: EngineReasonCode;
  readonly detail: string;
}

/** Outcome result flavors for version-level operations. */
export const ENGINE_REVISION_OUTCOMES = Object.freeze(["revised", "invalid"] as const);
export type EngineRevisionOutcome = (typeof ENGINE_REVISION_OUTCOMES)[number];

export const ENGINE_REPLAY_OUTCOMES = Object.freeze(["complete", "failed"] as const);
export type EngineReplayOutcome = (typeof ENGINE_REPLAY_OUTCOMES)[number];
