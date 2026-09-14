/**
 * AISE-027 — the READ-ONLY data-access seam (no mutation of authoritative
 * reality — the §027 acceptance surface).
 *
 * ⚠⚠⚠ THE VIEWER HAS NO WRITE PATH, BY TYPE AND BY TEST ⚠⚠⚠
 *
 *  - `InterventionReader` is the ONLY way viewer input is assembled, and
 *    it exposes EXACTLY two members — `readScenario` and `readState` —
 *    both READS. There is no create/append/approve/transition member, no
 *    write flag, no "save" anywhere in this package: the type is the
 *    tripwire (an unused `@ts-expect-error` directive in the tests is
 *    itself a compile error, so the seam cannot silently grow a writer).
 *    `READER_MEMBERS` is the frozen, exhaustive member registry.
 *  - The HTTP request builders mirror the AISE-026 route surface
 *    (GET /v1/interventions/:id and GET /v1/interventions/:id/states/:index
 *    — see backend/api/src/intervention/router.ts, read as reference) and
 *    are ALWAYS `method: "GET"`: the literal type has no other method. No
 *    fetch is performed here — the caller injects the transport through
 *    `InterventionReader`; the viewer never touches the network.
 *  - `loadViewerInput` reads the scenario record and the addressed state,
 *    then CROSS-CHECKS that the two reads agree (same scenario, same
 *    layer, same stateId, verbatim-equal content) — the §027 "state
 *    alignment" guarantee enforced at the seam. A disagreement is a typed
 *    error, never a silent re-synchronization.
 *  - The baseline `GraphVersion` is NEVER read here: the viewer consumes
 *    AISE-026's already-materialized PROPOSED states only. Authoritative
 *    reality is not in the viewer's hands to mutate — the scenario record
 *    and its states are treated as strictly read-only data (deep-frozen
 *    inputs survive; see the tests).
 *
 * Determinism: no clock, no randomness, no IO beyond the injected reader;
 * the same reader responses → byte-identical assembled input.
 */

import { ViewerError } from "./errors";
import { stableStringify } from "./format";
import type {
  GeometryRecord,
  ViewParams,
  ViewerInput,
  ViewerInterventionState,
  ViewerScenario,
} from "./model";
import { verifyStateAlignment } from "./sync";

/* ------------------------------------------------------------------ */
/* The read-only seam                                                  */
/* ------------------------------------------------------------------ */

/**
 * THE injected read-only intervention source. Exactly two members, both
 * reads — the complete seam vocabulary is pinned by `READER_MEMBERS`.
 * Returns null when the addressed record does not exist (the caller's
 * 404); never throws for absence.
 */
export interface InterventionReader {
  /** Read one full scenario record (steps + immutable states), or null. */
  readonly readScenario: (scenarioId: string) => Promise<ViewerScenario | null>;
  /** Read one materialized state layer of a scenario, or null. */
  readonly readState: (
    scenarioId: string,
    stateIndex: number,
  ) => Promise<ViewerInterventionState | null>;
}

/** The exhaustive, frozen member registry of the read-only seam. */
export const READER_MEMBERS = Object.freeze(["readScenario", "readState"] as const);

/* ------------------------------------------------------------------ */
/* HTTP request builders (AISE-026 route surface; ALWAYS GET)           */
/* ------------------------------------------------------------------ */

/** A read-only viewer HTTP request — the method is the LITERAL "GET". */
export interface ViewerGetRequest {
  readonly method: "GET";
  readonly url: string;
}

/** Builder for GET /v1/interventions/:id (the scenario record read). */
export function scenarioReadRequest(scenarioId: string, baseUrl = ""): ViewerGetRequest {
  return {
    method: "GET",
    url: `${baseUrl}/v1/interventions/${encodeURIComponent(scenarioId)}`,
  };
}

/**
 * Builder for GET /v1/interventions/:id/states/:index (the state read).
 * `selector` is a non-negative layer index or the literal `"latest"`
 * (both accepted by the AISE-026 route).
 */
export function stateReadRequest(
  scenarioId: string,
  selector: number | "latest",
  baseUrl = "",
): ViewerGetRequest {
  return {
    method: "GET",
    url: `${baseUrl}/v1/interventions/${encodeURIComponent(scenarioId)}/states/${String(selector)}`,
  };
}

/* ------------------------------------------------------------------ */
/* Input assembly over the seam                                        */
/* ------------------------------------------------------------------ */

/** What `loadViewerInput` returns: the input + the verified read-back state. */
export interface LoadedViewerInput {
  /** The assembled, render-ready viewer input (current layer resolved). */
  readonly input: ViewerInput;
  /** The read-back state, cross-checked against the record (alignment). */
  readonly state: ViewerInterventionState;
}

/** Options for `loadViewerInput`. */
export interface LoadViewerOptions {
  /** The scenario to load (stable caller-supplied id). */
  readonly scenarioId: string;
  /** The layer to view: a non-negative index or "latest" (default 0). */
  readonly stateSelector?: number | "latest";
  /**
   * Server-assembled geometry records for the states' geometry refs (the
   * geometry resolution authority stays with the server/AISE-020; the
   * viewer only receives resolved records).
   */
  readonly geometries?: readonly GeometryRecord[];
  /** Presentation-only selection and 3D view parameters, passed through. */
  readonly selectedNodeId?: string;
  readonly view?: ViewParams;
}

/** Validate the load options shape (typed invalid_input). */
function requireOptions(options: LoadViewerOptions): void {
  if (typeof options.scenarioId !== "string" || options.scenarioId.length === 0) {
    throw new ViewerError("invalid_input", "scenarioId must be a non-empty string");
  }
  const selector = options.stateSelector ?? 0;
  if (selector !== "latest" && (!Number.isInteger(selector) || selector < 0)) {
    throw new ViewerError(
      "invalid_input",
      "stateSelector must be a non-negative integer or \"latest\"",
    );
  }
}

/**
 * Assemble the viewer input over the injected READ-ONLY reader:
 *
 *  1. read the scenario record (null ⇒ typed `scenario_not_found`);
 *  2. resolve the layer selector ("latest" ⇒ last layer) against the
 *     record — an out-of-range index is typed `state_index_out_of_range`;
 *  3. read the addressed state through the seam (null ⇒ typed
 *     `state_not_found`);
 *  4. CROSS-CHECK the two reads: the read-back state must be the record's
 *     layer N verbatim (same stateId, then byte-equal content via
 *     order-insensitive canonical text) — a disagreement is typed
 *     `state_scenario_mismatch` / `state_sequence_mismatch`, NEVER a
 *     silent re-synchronization;
 *  5. return the assembled `ViewerInput` (scenario + geometries + the
 *     resolved layer index + presentation options).
 */
export async function loadViewerInput(
  reader: InterventionReader,
  options: LoadViewerOptions,
): Promise<LoadedViewerInput> {
  requireOptions(options);
  const scenario = await reader.readScenario(options.scenarioId);
  if (scenario === null) {
    throw new ViewerError(
      "scenario_not_found",
      `scenario ${options.scenarioId} was not resolved by the reader`,
    );
  }
  if (scenario.states.length === 0) {
    throw new ViewerError(
      "invalid_input",
      `scenario ${scenario.scenarioId} carries no states`,
    );
  }
  const selector = options.stateSelector ?? 0;
  const stateIndex = selector === "latest" ? scenario.states.length - 1 : selector;
  if (stateIndex >= scenario.states.length) {
    throw new ViewerError(
      "state_index_out_of_range",
      `state selector ${String(selector)} is outside 0..${String(scenario.states.length - 1)} of scenario ${scenario.scenarioId}`,
    );
  }
  const readBack = await reader.readState(options.scenarioId, stateIndex);
  if (readBack === null) {
    throw new ViewerError(
      "state_not_found",
      `state layer ${String(stateIndex)} of scenario ${options.scenarioId} was not resolved by the reader`,
    );
  }
  // Cross-check the two reads against each other and against the record.
  if (readBack.scenarioId !== scenario.scenarioId) {
    throw new ViewerError(
      "state_scenario_mismatch",
      `read-back state ${readBack.stateId} belongs to scenario ${readBack.scenarioId}, not ${scenario.scenarioId}`,
    );
  }
  const recorded = scenario.states[stateIndex] as ViewerInterventionState;
  if (readBack.stateId !== recorded.stateId || readBack.stateIndex !== recorded.stateIndex) {
    throw new ViewerError(
      "state_sequence_mismatch",
      `read-back state ${readBack.stateId} (layer ${String(readBack.stateIndex)}) disagrees with the record's layer ${String(stateIndex)} state ${recorded.stateId}`,
    );
  }
  if (stableStringify(readBack) !== stableStringify(recorded)) {
    throw new ViewerError(
      "state_sequence_mismatch",
      `read-back state ${readBack.stateId} differs in content from the record's layer ${String(stateIndex)} state`,
    );
  }
  verifyStateAlignment(scenario, recorded);
  const input: ViewerInput = {
    scenario,
    geometries: options.geometries ?? [],
    stateIndex,
    ...(options.selectedNodeId === undefined ? {} : { selectedNodeId: options.selectedNodeId }),
    ...(options.view === undefined ? {} : { view: options.view }),
  };
  return { input, state: readBack };
}
