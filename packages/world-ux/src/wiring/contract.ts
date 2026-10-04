/**
 * WORLD-P4 — the wiring family contract: the typed ports that bind a
 * world station ROUTE to the composed lane state (seam laws #4–#10).
 *
 * THE BINDING MODEL: a route mounts a world station by supplying
 * SOURCES — one typed read function per lane projection the HUD and
 * surface consume. Every source returns the unified
 * `WorldUxOutcome<T>`; a source's refusal surfaces as the panel's
 * UNAVAILABLE state (law #3) or refuses the station composition when
 * the world itself is unavailable (the scene is the station — without
 * it there is nothing to explain).
 *
 * THE PROOF OCCUPANTS (law #10): the in-memory substitution doubles
 * (`src/wiring/doubles.ts`) implement every source by composing the
 * REAL lane fixtures end-to-end — the P1 fixture world, the P2 lane
 * run (`runLayer2Lane` over the committed scenario), the P3 lane run
 * (`runInteractiveSolutionLane` over the default kit) — with ZERO
 * substrate installed. The reference and alternate kits produce
 * byte-identical station models (the substitution law).
 *
 * THE LIVE WIRING (P3 wiring notes):
 *   - #4 the Objective panel's clash problems come from the P3
 *     coordination family's conflict records (bound to P2 problems) —
 *     the `clashConflicts` source;
 *   - #3 an authored command whose provenance violates
 *     `missing_operation_provenance` refuses the station composition
 *     (the ghost source's command is validated by the surface
 *     family's provenance guard);
 *   - #5 ghost-removed element ids stay resolvable (the surface
 *     family's status index).
 */

import type {
  EngineeringProblem,
  MissingEvidenceReport,
  ProblemAction,
  DeterministicCheckGateVerdict,
} from "@aise/world-layer2-experience";
import type {
  CoordinationConflictRecord,
  QuantityConsequenceProjection,
  SequencedExecution,
} from "@aise/world-layer3-experience";
import type { NavigableWorld } from "@aise/world-layer1-experience";
import type { CameraState } from "@aise/world-reality-substrate";
import {
  deepFreeze,
  isDeclaredInstant,
  canonicalDigestOf,
  worldUxRefused,
  type WorldUxOutcome,
} from "../seam";
import type {
  HudConstraintObservation,
  HudModel,
  HudAssemblyInput,
} from "../hud/contract";
import { assembleHud } from "../hud/contract";
import type { GhostOverlayInput, StationSceneModel } from "../surface/contract";
import { composeStationScene } from "../surface/contract";
import type { HudOperatorSummary } from "../hud/contract";

/* ------------------------------------------------------------------ */
/* The station sources (the route-binding ports)                        */
/* ------------------------------------------------------------------ */

/**
 * The complete source set a world station route binds. Every source
 * is a pure read of composed lane state — no source may mutate any
 * lane record (law #1) or fabricate a value (law #3).
 */
export interface WorldStationSources {
  /** The P1 navigable world (the station's scene base). REQUIRED. */
  readonly world: () => WorldUxOutcome<NavigableWorld>;
  /** The P2 primary engineering problem (the Objective panel). */
  readonly primaryProblem: () => WorldUxOutcome<EngineeringProblem | null>;
  /**
   * The P3 coordination family's conflict records — the LIVE
   * clash→problem bindings (wiring note #4), or null when no
   * coordination source is bound.
   */
  readonly clashConflicts: () =>
    WorldUxOutcome<readonly CoordinationConflictRecord[] | null>;
  /** The P2 missing-evidence report (the Evidence panel). */
  readonly evidenceReport: () => WorldUxOutcome<MissingEvidenceReport | null>;
  /**
   * The governed constraint observations derived from real lane
   * records (the Constraints panel), or null when unbound.
   */
  readonly constraintObservations: () =>
    WorldUxOutcome<readonly HudConstraintObservation[] | null>;
  /** The active lane operator (the Agent panel), or null when idle. */
  readonly activeOperator: () => WorldUxOutcome<HudOperatorSummary | null>;
  /** The P2 bounded actions (the Agent panel), or null when unbound. */
  readonly actions: () => WorldUxOutcome<readonly ProblemAction[] | null>;
  /** The P2 deterministic check gate (the Validation panel). */
  readonly checkGate: () => WorldUxOutcome<DeterministicCheckGateVerdict | null>;
  /** The P3 replay verification (the Validation panel), or null. */
  readonly replayVerified: () => WorldUxOutcome<boolean | null>;
  /**
   * The P3 live quantity-consequence projection (the Cost/BOQ panel —
   * a VIEW; the BOQ Graph stays the only quantity authority), or null
   * when no proposed operation is selected.
   */
  readonly quantityConsequence: () =>
    WorldUxOutcome<QuantityConsequenceProjection | null>;
  /** The P3 sequencing playback (the Timeline panel), or null. */
  readonly executionSequence: () => WorldUxOutcome<SequencedExecution | null>;
  /**
   * The P3 authored ghost overlay (the proposed state presented in
   * the world), or null when no proposal is active.
   */
  readonly ghostOverlay: () => WorldUxOutcome<GhostOverlayInput | null>;
}

/** The station binding's composition context (declared, never clocked). */
export interface WorldStationBindingContext {
  /** The station scope label (e.g. the project id — presentation). */
  readonly scopeLabel: string;
  /** The declared composition instant (law #9 — never a clock read). */
  readonly composedAt: string;
  /** The initial camera state (the P0-A typed camera). */
  readonly initialCamera: CameraState;
}

/* ------------------------------------------------------------------ */
/* The composed station model                                           */
/* ------------------------------------------------------------------ */

/**
 * The composed world station: the complete deterministic state one
 * station route renders — the station scene + the assembled HUD +
 * the initial camera + the station identity (a content digest of the
 * composed state — law #9).
 */
export interface WorldStationModel {
  /** Content-derived station identity (deterministic). */
  readonly stationId: string;
  readonly scopeLabel: string;
  readonly composedAt: string;
  readonly scene: StationSceneModel;
  readonly hud: HudModel;
  readonly initialCamera: CameraState;
}

/* ------------------------------------------------------------------ */
/* The deterministic binding                                            */
/* ------------------------------------------------------------------ */

/**
 * Bind a world station: compose the sources into the complete station
 * model. THE CONTROLLED ENTRY POINT of the wiring family.
 *
 * Fail-closed discipline:
 *   - an unavailable WORLD source refuses the whole binding (the
 *     scene is the station — without it there is nothing to explain);
 *   - an unavailable HUD source refuses the binding too: the station
 *     presents either the honest world or a typed refusal — never a
 *     partial station with silently-missing panels (law #3: the
 *     UNAVAILABLE panel state is for a source that ANSWERED with a
 *     refusal the panel can honestly carry; a poisoned source shape
 *     is a contract-mismatch refusal of the binding);
 *   - the ghost overlay's authored command passes the provenance
 *     guard (wiring note #3 — `missing_operation_provenance` fails
 *     closed inside `composeStationScene`);
 *   - the composition is DETERMINISTIC: the same sources produce the
 *     byte-identical station model (law #9).
 *
 * PURE (the sources are invoked as reads; no I/O, no clock, no
 * randomness here).
 */
export function bindWorldStation(
  sources: WorldStationSources,
  context: WorldStationBindingContext,
): WorldUxOutcome<WorldStationModel> {
  if (typeof context.scopeLabel !== "string" || context.scopeLabel.length === 0) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      "contract-mismatch",
      "wiring: station binding requires a non-empty scopeLabel",
    );
  }
  if (!isDeclaredInstant(context.composedAt)) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      "contract-mismatch",
      "wiring: station binding requires a declared ISO-8601 UTC composedAt instant",
    );
  }

  /* The scene base — REQUIRED (the world is the station). */
  const worldOutcome = sources.world();
  if (!worldOutcome.ok) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      worldOutcome.failure.kind,
      `wiring: station binding refused — the world source is unavailable: ${worldOutcome.failure.detail}`,
    );
  }
  const world = worldOutcome.value;

  /* The ghost overlay (optional — null when no proposal is active). */
  const ghostOutcome = sources.ghostOverlay();
  if (!ghostOutcome.ok) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      ghostOutcome.failure.kind,
      `wiring: station binding refused — the ghost overlay source is poisoned: ${ghostOutcome.failure.detail}`,
    );
  }
  const sceneOutcome = composeStationScene(world.scene, ghostOutcome.value);
  if (!sceneOutcome.ok) {
    return sceneOutcome;
  }

  /* The HUD sources — every panel input composed from its source. */
  const primaryProblemOutcome = sources.primaryProblem();
  if (!primaryProblemOutcome.ok) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      primaryProblemOutcome.failure.kind,
      `wiring: station binding refused — the primary problem source is poisoned: ${primaryProblemOutcome.failure.detail}`,
    );
  }
  const clashConflictsOutcome = sources.clashConflicts();
  if (!clashConflictsOutcome.ok) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      clashConflictsOutcome.failure.kind,
      `wiring: station binding refused — the clash conflicts source is poisoned: ${clashConflictsOutcome.failure.detail}`,
    );
  }
  const evidenceOutcome = sources.evidenceReport();
  if (!evidenceOutcome.ok) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      evidenceOutcome.failure.kind,
      `wiring: station binding refused — the evidence report source is poisoned: ${evidenceOutcome.failure.detail}`,
    );
  }
  const constraintsOutcome = sources.constraintObservations();
  if (!constraintsOutcome.ok) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      constraintsOutcome.failure.kind,
      `wiring: station binding refused — the constraint observations source is poisoned: ${constraintsOutcome.failure.detail}`,
    );
  }
  const operatorOutcome = sources.activeOperator();
  if (!operatorOutcome.ok) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      operatorOutcome.failure.kind,
      `wiring: station binding refused — the active operator source is poisoned: ${operatorOutcome.failure.detail}`,
    );
  }
  const actionsOutcome = sources.actions();
  if (!actionsOutcome.ok) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      actionsOutcome.failure.kind,
      `wiring: station binding refused — the actions source is poisoned: ${actionsOutcome.failure.detail}`,
    );
  }
  const checkGateOutcome = sources.checkGate();
  if (!checkGateOutcome.ok) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      checkGateOutcome.failure.kind,
      `wiring: station binding refused — the check gate source is poisoned: ${checkGateOutcome.failure.detail}`,
    );
  }
  const replayOutcome = sources.replayVerified();
  if (!replayOutcome.ok) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      replayOutcome.failure.kind,
      `wiring: station binding refused — the replay verification source is poisoned: ${replayOutcome.failure.detail}`,
    );
  }
  const consequenceOutcome = sources.quantityConsequence();
  if (!consequenceOutcome.ok) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      consequenceOutcome.failure.kind,
      `wiring: station binding refused — the quantity consequence source is poisoned: ${consequenceOutcome.failure.detail}`,
    );
  }
  const sequenceOutcome = sources.executionSequence();
  if (!sequenceOutcome.ok) {
    return worldUxRefused<WorldStationModel>(
      "wiring",
      sequenceOutcome.failure.kind,
      `wiring: station binding refused — the execution sequence source is poisoned: ${sequenceOutcome.failure.detail}`,
    );
  }

  const hudInput: HudAssemblyInput = {
    objective: {
      primaryProblem: primaryProblemOutcome.value,
      clashConflicts: clashConflictsOutcome.value,
    },
    evidence: { report: evidenceOutcome.value },
    constraints: { observations: constraintsOutcome.value },
    agent: {
      activeOperator: operatorOutcome.value,
      actions: actionsOutcome.value,
    },
    validation: {
      checkGate: checkGateOutcome.value,
      replayVerified: replayOutcome.value,
    },
    costBoq: { projection: consequenceOutcome.value },
    timeline: { sequence: sequenceOutcome.value },
  };
  const hudOutcome = assembleHud(hudInput);
  if (!hudOutcome.ok) {
    return hudOutcome;
  }

  /* The station identity: a content digest over the composed state
   * (law #9 — deterministic, never a clock/random value). */
  const stationId = canonicalDigestOf({
    scope: context.scopeLabel,
    worldId: world.worldId,
    worldRevision: world.worldRevision,
    ghostSummary: sceneOutcome.value.ghostSummary,
    panels: hudPanelProjectionDigests(hudOutcome.value),
  });

  return {
    ok: true,
    value: deepFreeze({
      stationId,
      scopeLabel: context.scopeLabel,
      composedAt: context.composedAt,
      scene: sceneOutcome.value,
      hud: hudOutcome.value,
      initialCamera: context.initialCamera,
    }),
  };
}

/** The per-panel content digests (the identity's HUD projection). */
function hudPanelProjectionDigests(hud: HudModel): Record<string, unknown> {
  return {
    objective: {
      state: hud.objective.contentState,
      problemId: hud.objective.data?.primaryProblem?.problemId ?? null,
      clashCount: hud.objective.data?.clashProblems.length ?? 0,
    },
    evidence: {
      state: hud.evidence.contentState,
      reportId: hud.evidence.data?.reportId ?? null,
    },
    constraints: {
      state: hud.constraints.contentState,
      count: hud.constraints.data?.constraintCount ?? 0,
    },
    agent: {
      state: hud.agent.contentState,
      operator: hud.agent.data?.activeOperator?.operatorId ?? null,
    },
    validation: {
      state: hud.validation.contentState,
      gate: hud.validation.data?.checkGateId ?? null,
    },
    costBoq: {
      state: hud.costBoq.contentState,
      projection: hud.costBoq.data?.projectionId ?? null,
    },
    timeline: {
      state: hud.timeline.contentState,
      trajectory: hud.timeline.data?.trajectoryId ?? null,
    },
  };
}
