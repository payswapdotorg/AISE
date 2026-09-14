/**
 * AISE-027 — typed intervention viewer error (the ONLY error vocabulary of
 * the viewer). Stable codes, never bare string errors — mirrors the
 * WorkspaceError/BoqLensError convention of the sibling apps/web modules
 * and the typed backend error registries.
 *
 * Codes are grouped by meaning:
 *   invalid_input             — malformed viewer input (shape, not semantics)
 *   scenario_not_found        — the injected reader resolved no scenario
 *   state_not_found           — the injected reader resolved no state
 *   state_index_out_of_range  — navigation/selection beyond the layer list
 *   state_scenario_mismatch   — a state whose scenarioId disagrees with the
 *                               scenario record (alignment violation)
 *   state_sequence_mismatch   — states[i].stateIndex/appliedStepIds/baseline
 *                               pin disagree with the record (alignment
 *                               violation — never silently re-synchronized)
 */

export const VIEWER_ERROR_CODES = [
  "invalid_input",
  "scenario_not_found",
  "state_not_found",
  "state_index_out_of_range",
  "state_scenario_mismatch",
  "state_sequence_mismatch",
] as const;
export type ViewerErrorCode = (typeof VIEWER_ERROR_CODES)[number];

/** Typed rejection carrying a stable code. */
export class ViewerError extends Error {
  readonly code: ViewerErrorCode;
  readonly detail: string;

  constructor(code: ViewerErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ViewerError";
    this.code = code;
    this.detail = detail;
  }
}
