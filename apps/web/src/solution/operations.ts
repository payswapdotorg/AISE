/**
 * PROD-024 — MANIPULATION → TYPED OPERATION MAPPING + THE ONE SUBMISSION
 * PATH of the interactive solution workspace — the NODE-SIDE FACADE
 * (PROD-031's cut).
 *
 * THE CONVERGENCE LAW (§4.2 of the work order): EVERY user manipulation —
 * direct-manipulation control, timeline action, fallback-path action or
 * confirmed agent proposal — produces the SAME typed
 * `EngineeringOperationIntent` objects the agent path produces (built
 * through the contract's ONE constructor surface `createOperationIntent`)
 * and flows through THE ONE submission path `submitIntent`, which calls
 * the solution ENGINE service and renders ONLY engine-computed states.
 * See `./operations-core` (the browser-safe core) for the full law.
 *
 * PROD-031 (the browser-safe cut): every controller lives in the
 * crypto-free core `./operations-core` and is re-exported here UNCHANGED,
 * so every existing consumer (the co-located tests, the workspace barrel,
 * the composed journey runner) keeps importing `./operations` with the
 * SAME surface. This facade adds exactly the two Node-context helpers
 * whose implementations need `node:crypto` transitively (through the
 * engine package and the contract barrel's identity derivations) and are
 * therefore NOT part of the browser mount's chunk graph:
 *
 *  - `openWorkspace` WITHOUT an injected baseline state — the local
 *    engine fallback (the workspace's own `materializeBaselineState`,
 *    called in-process where the engine evaluates: the deterministic
 *    gate, the server-side renders); the core's `openWorkspace` (with the
 *    REQUIRED injected `baselineState`) and `openWorkspaceThroughService`
 *    (the service-port leg) are the injection points the browser mount
 *    uses;
 *  - `operationIdentityOf` — the contract's own identity derivation, the
 *    equivalence-test proof helper.
 */

import type { ProposedState } from "../../../../packages/solution-contract/src/index";
import {
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
} from "../../../../packages/solution-contract/src/index";
import { materializeBaselineState } from "../../../../packages/solution-engine/src/index";
import { openWorkspace as openWorkspaceOverBaseline } from "./operations-core";
import type { OpenWorkspaceInput } from "./operations-core";
import type { SolutionWorkspaceState } from "./model";
import type { EngineeringOperationIntent } from "../../../../packages/solution-contract/src/index";

/* The full controller surface (the crypto-free core, re-exported BY NAME —
 * a star re-export here made the bundler merge this facade into the chunk
 * shared with the browser mount, dragging the engine/identity derivations
 * into the browser graph's chunk; the explicit names keep this facade in
 * the Node-side chunk where its crypto-dependent imports belong). */
export {
  steppedWorkspaceClock,
  defaultWorkspaceClock,
  manipulationActionsForElement,
  buildDirectManipulationIntent,
  targetOfElement,
  openWorkspaceThroughService,
  submitIntent,
  stepTimeline,
  reviseOperation,
  validateCurrentVersion,
  agentSessionContextOf,
  applyAgentDecision,
} from "./operations-core";
export type {
  WorkspaceClock,
  WorkspaceDeps,
  ManipulationAction,
  ManipulationParameterField,
  ManipulationDraft,
  OpenWorkspaceInput,
} from "./operations-core";

/* ------------------------------------------------------------------ */
/* Opening the workspace (the Node default: the local engine baseline)  */
/* ------------------------------------------------------------------ */

/**
 * Opens the workspace: materializes the baseline overlay (layer 0) through
 * the ENGINE's `materializeBaselineState` and records the `inspect` step.
 * Version 1 starts as an empty draft over the pinned observed reality.
 *
 * THE NODE DEFAULT: this leg executes the engine IN-PROCESS (fine wherever
 * the module graph evaluates — the deterministic gate, the server-side
 * renders, a future polyfilled build). The browser mount instead opens
 * through the service port (`openWorkspaceThroughService` of the core:
 * the backend engine executes over the mounted routes), never through
 * this fallback.
 */
export function openWorkspace(
  input: Omit<OpenWorkspaceInput, "baselineState"> & { readonly baselineState?: ProposedState },
): SolutionWorkspaceState {
  const baselineState =
    input.baselineState ??
    materializeBaselineState({
      solutionId: input.solutionId,
      versionNumber: 1,
      baselineRealityVersionId: input.baselineRealityVersionId,
      materializedAt: input.materializedAt,
    });
  return openWorkspaceOverBaseline({ ...input, baselineState });
}

/* ------------------------------------------------------------------ */
/* Identity equivalence helpers (the convergence-law proofs)            */
/* ------------------------------------------------------------------ */

/**
 * The deterministic operation identity of an intent at a version context
 * — the CONTRACT's own derivation (used by the equivalence tests: the
 * same semantics from direct manipulation and the agent is the SAME
 * operation).
 */
export function operationIdentityOf(
  intent: EngineeringOperationIntent,
  context: { readonly solutionId: string; readonly versionNumber: number; readonly operationIndex: number },
): string {
  return deriveEngineeringOperationId(operationSemanticIdentityOfIntent(intent, context));
}

/** Re-exported for consumers assembling domain descriptors. */
export type { SolutionDomainDescriptor } from "./operations-core";
