/**
 * AISE-039 — pilot testkit: deterministic fixture machinery.
 *
 * HARNESS, NOT PRODUCTION RUNTIME: imported only by pilot code and pilot
 * tests — never wired into server.ts or any production entrypoint. It
 * reuses the AISE-035 lab's discipline (constant clocks, counter-free
 * content-stable ids, deep-frozen fixtures) and binds every recorded
 * session to the REAL executed-run records the campaign driver produced.
 *
 * THE SHARED-SPLIT HONESTY (loud): this sandbox has no live pilot users,
 * telemetry collectors or incumbent systems. The session evidence below —
 * walk latency samples, shell-broker outcomes (the AISE-040 tri-state as
 * recorded telemetry), deep-link/return-path traversals, audit
 * observations — is DETERMINISTIC RECORDED FIXTURES bound to the real
 * executed runs (run digest + per-hop record-id containment), exactly the
 * AISE-035 split (GEMINI-side capture data as deterministic ground-truth
 * fixtures over the real contracts). The synthetic-only variants name
 * their generators and can never satisfy an adoption metric.
 *
 * LATENCY SAMPLES ARE RECORDED TELEMETRY, NOT MEASUREMENTS: no wall clock
 * exists in this harness (determinism discipline); the walk-hop latency
 * values are fixture data recorded against the real executions, with a
 * documented deterministic variation (base + ordinal offset). Live
 * telemetry ingestion is a known limitation.
 *
 * DETERMINISM: fixed clocks, pure recorders, no randomness, no I/O.
 */

import type {
  AdoptionEvent,
  MigrationCandidate,
  MigrationState,
  RollbackPlan,
} from "../adoption/model";
import type { LabHopId, LabScenarioRun } from "../lab/runner";
import { deepFreeze } from "../lab/testkit";
import type { Permission } from "../identity/model";
import type { PilotCampaignResult } from "./campaign";
import { runPilotCampaign, type RunPilotCampaignOptions } from "./campaign";
import type {
  PilotAdoptionMetricId,
  PilotAuthorizedActionRecord,
  PilotAuditEventRecord,
  PilotCampaignSpec,
  PilotDimension,
  PilotEnvironmentSpec,
  PilotEvidenceField,
  PilotIcpProfile,
  PilotProjectedAdoption,
  PilotSessionContext,
  PilotSessionEvidence,
  PilotSessionHop,
  PilotSessionRecord,
  PilotTargetedStepRef,
  PilotTraversalRecord,
  PilotWalkHopId,
} from "./model";

/* ------------------------------------------------------------------ */
/* Fixed clocks (constant instants)                                     */
/* ------------------------------------------------------------------ */

export const PILOT_CLOCK = deepFreeze({
  campaign: "2026-05-04T08:00:00.000Z",
  adoptionProposed: "2026-04-20T10:00:00.000Z",
  adoptionAdvanced: "2026-04-27T09:30:00.000Z",
  adoptionPiloted: "2026-05-02T14:00:00.000Z",
  releaseEvaluated: "2026-05-10T09:00:00.000Z",
  releaseApproved: "2026-05-10T11:30:00.000Z",
  /** Recorded session instants (one per session ordinal, 30 min apart). */
  sessions: [
    "2026-05-04T09:00:00.000Z",
    "2026-05-04T09:30:00.000Z",
    "2026-05-04T10:00:00.000Z",
    "2026-05-04T10:30:00.000Z",
    "2026-05-04T11:00:00.000Z",
    "2026-05-04T11:30:00.000Z",
  ],
  /** Recorded action/traversal instants (offset from the session instant). */
  action: "2026-05-04T09:05:00.000Z",
  traversal: "2026-05-04T09:10:00.000Z",
});

/** Constant clock over one fixed instant (byte-stable records). */
export function pilotConstantClock(instant: string): () => string {
  return (): string => instant;
}

/* ------------------------------------------------------------------ */
/* ICP profiles + environments                                          */
/* ------------------------------------------------------------------ */

/** LARGE ICP profile: a regional general-contractor portfolio. */
export const PILOT_ICP_LARGE_CONTRACTOR: PilotIcpProfile = deepFreeze({
  icpClass: "large",
  label: "large ICP — regional general contractor (multi-storey, ERP+BIM+PM incumbents)",
  spaces: 120,
  storeys: 4,
  evidenceVolume: 4500,
  userRoleCount: 12,
  incumbentIntegrations: 6,
});

/** SMALL ICP profile: a boutique surveying consultancy. */
export const PILOT_ICP_SMALL_CONSULTANCY: PilotIcpProfile = deepFreeze({
  icpClass: "small",
  label: "small ICP — boutique surveying consultancy (single-storey, ERP incumbent)",
  spaces: 6,
  storeys: 1,
  evidenceVolume: 180,
  userRoleCount: 3,
  incumbentIntegrations: 2,
});

/** The shipped LARGE environment: two executed projects. */
export function pilotEnvironmentLarge(): PilotEnvironmentSpec {
  return {
    environmentId: "pilot-env-large-contractor",
    label: "Pilot environment — large ICP contractor",
    icp: PILOT_ICP_LARGE_CONTRACTOR,
    projects: [
      {
        projectId: "pilot-large-centralblock",
        scenarioId: "lab-floor-gf-boq",
      },
      {
        projectId: "pilot-large-northwing-repair",
        scenarioId: "lab-room-204-repair",
      },
    ],
  };
}

/** The shipped SMALL environment (optionally with NOT_OBSERVED dims). */
export function pilotEnvironmentSmall(
  notObservedDimensions: readonly PilotDimension[] = [],
): PilotEnvironmentSpec {
  return {
    environmentId: "pilot-env-small-consultancy",
    label: "Pilot environment — small ICP consultancy",
    icp: PILOT_ICP_SMALL_CONSULTANCY,
    ...(notObservedDimensions.length === 0 ? {} : { notObservedDimensions }),
    projects: [
      {
        projectId: "pilot-small-northwing",
        scenarioId: "lab-room-104-defect",
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Recorded latency telemetry (deterministic fixture table)             */
/* ------------------------------------------------------------------ */

/**
 * The recorded walk-hop latency table (ms): base + ordinal offset. The
 * values sit inside the shipped performance budgets with engineering
 * headroom; the recorder's degradation options multiply them per hop to
 * simulate RECORDED regressions (never to fake a pass).
 */
const WALK_LATENCY_TABLE: Readonly<Record<PilotWalkHopId, { base: number; step: number }>> =
  deepFreeze({
    context_discover: { base: 640, step: 40 },
    reality_inspect: { base: 1350, step: 60 },
    boq_inspect: { base: 1080, step: 30 },
    evidence_inspect: { base: 720, step: 25 },
    action_initiate: { base: 1900, step: 80 },
    return_incumbent: { base: 860, step: 20 },
  });

/* ------------------------------------------------------------------ */
/* The deterministic session recorder                                   */
/* ------------------------------------------------------------------ */

/** Recorder degradations (deliberate instruments, never baselines). */
export interface PilotRecorderOptions {
  /** Multiply recorded latencies per walk hop (e.g. 2.0 → over budget). */
  readonly latencyMultiplierByHopId?: Readonly<Partial<Record<PilotWalkHopId, number>>>;
  /** Multiply ALL hop latencies of one project's sessions (per-project instrument). */
  readonly latencyMultiplierByProjectId?: Readonly<Record<string, number>>;
  /** Strand the first external trip of THIS project (no return recorded). */
  readonly strandExternalTripInProjectId?: string;
  /** Every broker decision refused (code: missing_permission). */
  readonly refuseAllActions?: boolean;
  /** Over-scope the first allowed action of each project's first session. */
  readonly overscopeOneAction?: boolean;
  /** Drop the authorization.refused audit observations. */
  readonly dropAuditRefusals?: boolean;
  /** Skip every action requiring this permission (coverage instrument). */
  readonly skipActionsWithPermission?: Permission;
  /** Every broker decision unavailable (authorization-port-absent). */
  readonly allActionsUnavailable?: boolean;
  /** Sessions per project (default: large 4, small 2). */
  readonly sessionCountPerProject?: number;
  /** Extra (returned) external round trips per session (switch-budget instrument). */
  readonly extraExternalTripsPerSession?: number;
}

/** The walk-hop → pipeline-hop binding table (the R19 walk over real hops). */
const WALK_SOURCE_HOPS: Readonly<Record<PilotWalkHopId, LabHopId | null>> = deepFreeze({
  context_discover: "mission",
  reality_inspect: "reality",
  boq_inspect: "boq",
  evidence_inspect: "evidence",
  action_initiate: null, // resolved per run (execution → case → boq preference)
  return_incumbent: null,
});

function actionSourceHopOf(run: LabScenarioRun): LabHopId | null {
  for (const candidate of ["execution", "case", "intervention", "boq"] as const) {
    const hop = run.hops.find((entry) => entry.hopId === candidate);
    if (hop !== undefined && hop.outcome === "ok") {
      return candidate;
    }
  }
  return null;
}

function hopOutcomeOf(
  run: LabScenarioRun,
  sourceHopId: LabHopId | null,
): "ok" | "failed" | "notApplicable" {
  if (sourceHopId === null) {
    return "notApplicable";
  }
  const hop = run.hops.find((entry) => entry.hopId === sourceHopId);
  if (hop === undefined) {
    return "notApplicable";
  }
  return hop.outcome;
}

function latencyOf(
  hopId: PilotWalkHopId,
  ordinal: number,
  multiplier: number | undefined,
): number {
  const table = WALK_LATENCY_TABLE[hopId];
  const raw = table.base + table.step * ordinal;
  return Math.round(raw * (multiplier ?? 1));
}

function authorizedActionsOf(
  sessionId: string,
  projectId: string,
  run: LabScenarioRun,
  ordinal: number,
  isLastSession: boolean,
  options: PilotRecorderOptions,
): readonly PilotAuthorizedActionRecord[] {
  const boqAvailable = hopOutcomeOf(run, "boq") === "ok";
  const caseAvailable = hopOutcomeOf(run, "case") === "ok";
  const interventionAvailable = hopOutcomeOf(run, "intervention") === "ok";
  const actions: PilotAuthorizedActionRecord[] = [];
  const push = (action: PilotAuthorizedActionRecord): void => {
    if (
      options.skipActionsWithPermission !== undefined &&
      action.requiredPermission === options.skipActionsWithPermission
    ) {
      return;
    }
    actions.push(action);
  };
  const occurredAt = PILOT_CLOCK.action;

  const openReality: PilotAuthorizedActionRecord = {
    actionId: `${sessionId}-open-reality`,
    actionKind: "open-record",
    requiredPermission: "reality:read",
    heldPermission: "reality:read",
    decision: "allowed",
    returnToAddress: `aise-shell://reality?p=${projectId}`,
    occurredAt,
  };
  push(openReality);

  if (boqAvailable) {
    push({
      actionId: `${sessionId}-open-boq`,
      actionKind: "open-record",
      requiredPermission: "boq:read",
      heldPermission: "boq:read",
      decision: "allowed",
      returnToAddress: `aise-shell://boq?p=${projectId}`,
      occurredAt,
    });
    // The export alternates allowed/refused by session parity: the odd
    // ordinals record a refusal (insufficient granularity — the deployment
    // holds only boq:read for a boq:write requirement; the refusal carries
    // NO grant, exactly the shell broker's tri-state shape).
    const exportAllowed = ordinal % 2 === 0;
    push({
      actionId: `${sessionId}-export-boq`,
      actionKind: "export-derived",
      requiredPermission: "boq:write",
      heldPermission: exportAllowed ? "boq:write" : null,
      decision: exportAllowed ? "allowed" : "refused",
      ...(exportAllowed ? {} : { refusalCode: "insufficient_granularity" }),
      returnToAddress: `aise-shell://boq?p=${projectId}`,
      occurredAt,
    });
  }

  push({
    actionId: `${sessionId}-import-documents`,
    actionKind: "import-documents",
    requiredPermission: "evidence:read",
    heldPermission: "evidence:read",
    decision: "allowed",
    returnToAddress: `aise-shell://evidence?p=${projectId}`,
    occurredAt,
  });

  if (caseAvailable) {
    push({
      actionId: `${sessionId}-open-case`,
      actionKind: "open-record",
      requiredPermission: "case:read",
      heldPermission: "case:read",
      decision: "allowed",
      returnToAddress: `aise-shell://case?p=${projectId}`,
      occurredAt,
    });
  }

  if (interventionAvailable) {
    push({
      actionId: `${sessionId}-initiate-intervention`,
      actionKind: "import-entities",
      requiredPermission: "intervention:write",
      heldPermission: "intervention:write",
      decision: "allowed",
      returnToAddress: `aise-shell://case?p=${projectId}`,
      occurredAt,
    });
  }

  // The LAST session of each project records one UNAVAILABLE decision
  // (the authorization port was absent in that deployment slice) — the
  // honest unknown, never counted as a refusal.
  if (isLastSession) {
    push({
      actionId: `${sessionId}-open-erp-record`,
      actionKind: "open-record",
      requiredPermission: "reality:read",
      heldPermission: null,
      decision: "unavailable",
      unavailableReason: "authorization-port-absent",
      returnToAddress: `aise-shell://context?p=${projectId}`,
      occurredAt,
    });
  }

  if (options.refuseAllActions === true) {
    for (const action of actions) {
      (action as { heldPermission: Permission | null }).heldPermission = null;
      (action as { decision: PilotAuthorizedActionRecord["decision"] }).decision = "refused";
      (action as { refusalCode?: string }).refusalCode = "missing_permission";
      delete (action as { unavailableReason?: PilotAuthorizedActionRecord["unavailableReason"] })
        .unavailableReason;
    }
    return actions;
  }

  if (options.allActionsUnavailable === true) {
    for (const action of actions) {
      (action as { heldPermission: Permission | null }).heldPermission = null;
      (action as { decision: PilotAuthorizedActionRecord["decision"] }).decision = "unavailable";
      (action as { unavailableReason?: PilotAuthorizedActionRecord["unavailableReason"] })
        .unavailableReason = "authorization-port-absent";
      delete (action as { refusalCode?: string }).refusalCode;
    }
    return actions;
  }

  if (options.overscopeOneAction === true && ordinal === 0) {
    // The first allowed action of the project's first session holds the
    // coarser admin granularity for its read requirement.
    const first = actions.find((action) => action.decision === "allowed");
    if (first !== undefined) {
      (first as { heldPermission: Permission | null }).heldPermission = "reality:admin";
    }
  }

  return actions;
}

function auditEventsOf(
  sessionId: string,
  actions: readonly PilotAuthorizedActionRecord[],
  options: PilotRecorderOptions,
): readonly PilotAuditEventRecord[] {
  const events: PilotAuditEventRecord[] = [];
  for (const action of actions) {
    if (action.decision === "allowed") {
      events.push({
        action: "authorization.allowed",
        outcome: "allowed",
        detail: `pilot session ${sessionId} action ${action.actionId}`,
        occurredAt: action.occurredAt,
      });
    } else if (action.decision === "refused") {
      if (options.dropAuditRefusals === true) {
        continue;
      }
      events.push({
        action: "authorization.refused",
        outcome: "refused",
        detail: `pilot session ${sessionId} action ${action.actionId} (${action.refusalCode ?? "refused"})`,
        occurredAt: action.occurredAt,
      });
    }
    // Unavailable decisions record NO audit event (no decision was made).
  }
  return events;
}

function traversalsOf(
  sessionId: string,
  projectId: string,
  run: LabScenarioRun,
  hasExternalTrip: boolean,
  strand: boolean,
  extraExternalTrips: number,
): readonly PilotTraversalRecord[] {
  const traversals: PilotTraversalRecord[] = [];
  const occurredAt = PILOT_CLOCK.traversal;
  traversals.push({
    traversalId: `${sessionId}-nav-reality`,
    fromModule: "aise",
    toModule: "aise",
    returnedViaReturnPath: null,
    address: `aise-shell://reality?p=${projectId}`,
    occurredAt,
  });
  const boqHop = run.hops.find((entry) => entry.hopId === "boq");
  if (boqHop !== undefined && boqHop.outcome === "ok" && boqHop.recordIds.length > 0) {
    traversals.push({
      traversalId: `${sessionId}-nav-boq`,
      fromModule: "aise",
      toModule: "aise",
      returnedViaReturnPath: null,
      address: `aise-shell://boq?p=${projectId}&i=${boqHop.recordIds[0]}`,
      occurredAt,
    });
  }
  const caseHop = run.hops.find((entry) => entry.hopId === "case");
  if (caseHop !== undefined && caseHop.outcome === "ok" && caseHop.recordIds.length > 0) {
    traversals.push({
      traversalId: `${sessionId}-nav-case`,
      fromModule: "aise",
      toModule: "aise",
      returnedViaReturnPath: null,
      address: `aise-shell://case?p=${projectId}&c=${caseHop.recordIds[0]}`,
      occurredAt,
    });
  }
  if (hasExternalTrip) {
    traversals.push({
      traversalId: `${sessionId}-ext-erp`,
      fromModule: "aise",
      toModule: "incumbent",
      returnedViaReturnPath: !strand,
      address: `https://incumbent.example/erp/records?project=${projectId}`,
      occurredAt,
    });
    if (!strand) {
      traversals.push({
        traversalId: `${sessionId}-ret-context`,
        fromModule: "incumbent",
        toModule: "aise",
        returnedViaReturnPath: null,
        address: `aise-shell://context?p=${projectId}`,
        occurredAt,
      });
    }
  }
  for (let extra = 0; extra < extraExternalTrips; extra += 1) {
    traversals.push({
      traversalId: `${sessionId}-ext-extra-${extra}`,
      fromModule: "aise",
      toModule: "incumbent",
      returnedViaReturnPath: true,
      address: `https://incumbent.example/pm/records?project=${projectId}&trip=${extra}`,
      occurredAt,
    });
    traversals.push({
      traversalId: `${sessionId}-ret-extra-${extra}`,
      fromModule: "incumbent",
      toModule: "aise",
      returnedViaReturnPath: null,
      address: `aise-shell://context?p=${projectId}`,
      occurredAt,
    });
  }
  return traversals;
}

function syntheticSessionsOf(
  context: PilotSessionContext,
  options: PilotRecorderOptions,
): readonly PilotSessionRecord[] {
  const count = options.sessionCountPerProject ?? 1;
  const sessions: PilotSessionRecord[] = [];
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const sessionId = `session-synthetic-${context.project.projectId}-${ordinal + 1}`;
    const walk: PilotSessionHop[] = (
      Object.keys(WALK_LATENCY_TABLE) as PilotWalkHopId[]
    ).map((hopId) => ({
      hopId,
      outcome: "ok" as const,
      sourceHopId: null,
      latencyMs: latencyOf(hopId, ordinal, options.latencyMultiplierByHopId?.[hopId]),
      recordIds: [],
      detail: "generated activity (synthetic — no executed-record binding)",
    }));
    sessions.push({
      sessionId,
      environmentId: context.environment.environmentId,
      projectId: context.project.projectId,
      principalId: `projected-user-${ordinal + 1}`,
      occurredAt: PILOT_CLOCK.sessions[ordinal] ?? PILOT_CLOCK.campaign,
      walk,
      authorizedActions: [],
      traversals: [],
      auditEvents: [],
      adoptionStateRefs: [],
      evidence: [
        {
          kind: "synthetic_projection",
          generator: "projected-activity-v1",
          projectedUsers: 250,
          note:
            "generated activity stream — a simulated-user projection that can never satisfy an " +
            "adoption metric (AISE-039 §039 acceptance)",
        },
      ],
      notObserved: [],
    });
  }
  return sessions;
}

/**
 * THE shipped deterministic session recorder: builds per-project sessions
 * whose evidence binds to the REAL executed run (run digest + verbatim
 * per-hop record ids), with recorded broker outcomes, traversals, audit
 * observations and adoption-state references.
 */
export function pilotSessionRecorder(
  options: PilotRecorderOptions = {},
): (context: PilotSessionContext) => readonly PilotSessionRecord[] {
  return (context: PilotSessionContext): readonly PilotSessionRecord[] => {
    if (context.executed === null) {
      return syntheticSessionsOf(context, options);
    }
    const { run, runDigest } = context.executed;
    const count =
      options.sessionCountPerProject ??
      (context.environment.icp.icpClass === "large" ? 4 : 2);
    const projectLatencyMultiplier =
      options.latencyMultiplierByProjectId?.[context.project.projectId];
    const actionSourceHop = actionSourceHopOf(run);
    const extraExternalTrips = options.extraExternalTripsPerSession ?? 0;
    const sessions: PilotSessionRecord[] = [];
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      const sessionId = `session-${context.project.projectId}-${ordinal + 1}`;
      const isLastSession = ordinal === count - 1;
      const hasExternalTrip = !isLastSession;
      const strand =
        options.strandExternalTripInProjectId === context.project.projectId && ordinal === 0;
      const actions = authorizedActionsOf(
        sessionId,
        context.project.projectId,
        run,
        ordinal,
        isLastSession,
        options,
      );
      const traversals = traversalsOf(
        sessionId,
        context.project.projectId,
        run,
        hasExternalTrip,
        strand,
        extraExternalTrips,
      );
      const auditEvents = auditEventsOf(sessionId, actions, options);
      const hopRecordIds: Partial<Record<LabHopId, readonly string[]>> = {};
      const walk: PilotSessionHop[] = [];
      for (const hopId of Object.keys(WALK_SOURCE_HOPS) as PilotWalkHopId[]) {
        const defaultSource = WALK_SOURCE_HOPS[hopId];
        const sourceHopId =
          hopId === "action_initiate" ? actionSourceHop : defaultSource;
        let outcome: "ok" | "failed" | "notApplicable";
        let recordIds: readonly string[] = [];
        if (hopId === "return_incumbent") {
          const externalIds = traversals
            .filter((traversal) => traversal.fromModule === "aise" && traversal.toModule === "incumbent")
            .map((traversal) => traversal.traversalId);
          outcome = hasExternalTrip || externalIds.length > 0 ? "ok" : "notApplicable";
          recordIds = externalIds;
        } else {
          outcome = hopOutcomeOf(run, sourceHopId);
          if (outcome === "ok" && sourceHopId !== null) {
            const hop = run.hops.find((entry) => entry.hopId === sourceHopId);
            recordIds = hop === undefined ? [] : hop.recordIds;
            hopRecordIds[sourceHopId] = recordIds;
          }
        }
        walk.push({
          hopId,
          outcome,
          sourceHopId,
          latencyMs:
            outcome === "notApplicable"
              ? null
              : latencyOf(
                  hopId,
                  ordinal,
                  (options.latencyMultiplierByHopId?.[hopId] ?? 1) *
                    (projectLatencyMultiplier ?? 1),
                ),
          recordIds,
          detail:
            outcome === "notApplicable"
              ? hopId === "return_incumbent"
                ? "no external round trip in this session (the whole workflow stayed in AISE)"
                : `the executed run's '${String(sourceHopId)}' hop was not applicable for this project`
              : null,
        });
      }
      const evidence: readonly PilotSessionEvidence[] = [
        { kind: "executed_run", runDigest, hopRecordIds },
        { kind: "adoption_state", candidateIds: PILOT_TARGETED_CANDIDATE_IDS },
        { kind: "broker_outcome", actionIds: actions.map((action) => action.actionId) },
        { kind: "deep_link_traversal", traversalIds: traversals.map((t) => t.traversalId) },
      ];
      sessions.push({
        sessionId,
        environmentId: context.environment.environmentId,
        projectId: context.project.projectId,
        principalId: `user-pilot-${ordinal + 1}`,
        occurredAt: PILOT_CLOCK.sessions[ordinal] ?? PILOT_CLOCK.campaign,
        walk,
        authorizedActions: actions,
        traversals,
        auditEvents,
        adoptionStateRefs: PILOT_TARGETED_CANDIDATE_IDS,
        evidence,
        notObserved: [],
      });
    }
    return sessions;
  };
}

/* ------------------------------------------------------------------ */
/* Adoption-state fixtures (AISE-041 vocabulary records)                */
/* ------------------------------------------------------------------ */

/** The targeted incumbent workflow steps (the adoption universe). */
export const PILOT_TARGETED_WORKFLOW_STEPS: readonly PilotTargetedStepRef[] = deepFreeze([
  { workflowId: "wf-incumbent-erp", stepId: "step-boq-takeoff" },
  { workflowId: "wf-incumbent-erp", stepId: "step-defect-inspection" },
  { workflowId: "wf-incumbent-pm", stepId: "step-repair-approval" },
  { workflowId: "wf-incumbent-pm", stepId: "step-progress-report" },
]);

const PILOT_TARGETED_CANDIDATE_IDS: readonly string[] = deepFreeze([
  "cand-pilot-boq-takeoff",
  "cand-pilot-defect-inspection",
  "cand-pilot-repair-approval",
  "cand-pilot-progress-report",
]);

function candidateEvent(
  ordinal: number,
  eventType: AdoptionEvent["eventType"],
  actor: string,
  occurredAt: string,
  recordDigest: string,
  transition?: { readonly from: MigrationState; readonly to: MigrationState },
): AdoptionEvent {
  return {
    eventId: `evt-pilot-${ordinal}`,
    eventType,
    occurredAt,
    actor,
    recordDigest,
    ...(transition === undefined ? {} : { transition }),
  };
}

function rollbackPlanOf(candidateId: string): RollbackPlan {
  return {
    planId: `plan-${candidateId}`,
    description: `Restore the incumbent step for ${candidateId} (the reversibility precondition)`,
    restorationSteps: [
      "Re-point the team to the incumbent workflow step",
      "Verify the incumbent system of record is current",
      "Retire the AISE-side replacement boundary",
    ],
    owner: "pilot-operator",
    state: "active",
    recordedBy: "pilot-recorder",
    recordedAt: PILOT_CLOCK.adoptionProposed,
  };
}

/**
 * Build ONE adoption-module migration-state record (the AISE-041
 * `MigrationCandidate` shape, as deterministic pilot fixture records whose
 * pilot-outcome evidence references the campaign's executed projects).
 */
export function pilotMigrationCandidate(input: {
  readonly candidateId: string;
  readonly workflowId: string;
  readonly stepId: string;
  readonly state: "evaluating" | "piloted";
  readonly boundary: string;
}): MigrationCandidate {
  const digest = (state: string): string =>
    simpleDigest(`${input.candidateId}:${input.workflowId}:${input.stepId}:${state}`);
  const history: AdoptionEvent[] = [
    candidateEvent(
      1,
      "candidate_proposed",
      "pilot-recorder",
      PILOT_CLOCK.adoptionProposed,
      digest("proposed"),
    ),
  ];
  const rollbackPlans: RollbackPlan[] = [rollbackPlanOf(input.candidateId)];
  const evaluationEvidenceIds = [`pilot-evidence:${input.candidateId}:evaluation`];
  history.push(
    candidateEvent(
      2,
      "candidate_advanced",
      "pilot-recorder",
      PILOT_CLOCK.adoptionAdvanced,
      digest("evaluating"),
      { from: "proposed", to: "evaluating" },
    ),
  );
  if (input.state === "piloted") {
    history.push(
      candidateEvent(
        3,
        "candidate_advanced",
        "pilot-recorder",
        PILOT_CLOCK.adoptionPiloted,
        digest(input.state),
        { from: "evaluating", to: "piloted" },
      ),
    );
  }
  const pilotOutcomeEvidenceIds =
    input.state === "piloted" ? [`pilot-evidence:${input.candidateId}:pilot-outcome`] : undefined;
  return {
    candidateId: input.candidateId,
    workflowId: input.workflowId,
    stepId: input.stepId,
    aiseReplacementBoundary: input.boundary,
    rationale: `AISE-039 pilot: ${input.boundary}`,
    state: input.state,
    recordedBy: "pilot-recorder",
    createdAt: PILOT_CLOCK.adoptionProposed,
    updatedAt:
      input.state === "evaluating"
        ? PILOT_CLOCK.adoptionAdvanced
        : PILOT_CLOCK.adoptionPiloted,
    history,
    rollbackPlans,
    evaluationEvidenceIds,
    ...(pilotOutcomeEvidenceIds === undefined ? {} : { pilotOutcomeEvidenceIds }),
  };
}

/** The shipped adoption-state records (3 piloted, 1 evaluating). */
export function pilotAdoptionStates(): readonly MigrationCandidate[] {
  return [
    pilotMigrationCandidate({
      candidateId: "cand-pilot-boq-takeoff",
      workflowId: "wf-incumbent-erp",
      stepId: "step-boq-takeoff",
      state: "piloted",
      boundary: "AISE BOQ import/normalization/mapping replaces the manual takeoff step",
    }),
    pilotMigrationCandidate({
      candidateId: "cand-pilot-defect-inspection",
      workflowId: "wf-incumbent-erp",
      stepId: "step-defect-inspection",
      state: "piloted",
      boundary: "AISE condition inspection (mission→evidence→case) replaces the spreadsheet round",
    }),
    pilotMigrationCandidate({
      candidateId: "cand-pilot-repair-approval",
      workflowId: "wf-incumbent-pm",
      stepId: "step-repair-approval",
      state: "piloted",
      boundary: "AISE governed intervention (case→intervention→execution→outcome) replaces the PM approval chain",
    }),
    pilotMigrationCandidate({
      candidateId: "cand-pilot-progress-report",
      workflowId: "wf-incumbent-pm",
      stepId: "step-progress-report",
      state: "evaluating",
      boundary: "AISE impact reporting replaces the weekly manual progress report",
    }),
  ];
}

function simpleDigest(input: string): string {
  // Deterministic non-cryptographic fixture digest for adoption-event
  // recordDigest fields (the adoption module's own sha-256 discipline
  // applies to ITS records; these are pilot fixture records).
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").repeat(8);
}

/* ------------------------------------------------------------------ */
/* The synthetic-only projection                                        */
/* ------------------------------------------------------------------ */

/** The recorded synthetic-only projection (the honest non-evidence). */
export const PILOT_PROJECTED_ADOPTION: PilotProjectedAdoption = deepFreeze({
  generator: "projected-activity-v1",
  projectedUsers: 250,
  projectedCoverage: 0.9,
  note:
    "a simulated-user projection recorded for comparison only — §039 forbids adoption claims " +
    "based on simulated users alone",
});

/* ------------------------------------------------------------------ */
/* Campaign spec builders                                               */
/* ------------------------------------------------------------------ */

export interface PilotSpecOptions {
  readonly recorder?: PilotRecorderOptions;
  /** NOT_OBSERVED dimensions to declare on the SMALL environment. */
  readonly smallEnvNotObserved?: readonly PilotDimension[];
  /** NOT_OBSERVED dimensions to declare on EVERY environment. */
  readonly allEnvNotObserved?: readonly PilotDimension[];
  /** Synthetic-only variant: no project contributes an executed run. */
  readonly syntheticOnly?: boolean;
  /** Mixed variant: the SMALL environment's project is synthetic-only. */
  readonly mixedSynthetic?: boolean;
}

function buildSpec(options: PilotSpecOptions): PilotCampaignSpec {
  const recorder = pilotSessionRecorder(options.recorder ?? {});
  const syntheticAll = options.syntheticOnly === true;
  const syntheticSmall = options.mixedSynthetic === true;
  const large: PilotEnvironmentSpec = {
    environmentId: "pilot-env-large-contractor",
    label: "Pilot environment — large ICP contractor",
    icp: PILOT_ICP_LARGE_CONTRACTOR,
    ...(options.allEnvNotObserved === undefined
      ? {}
      : { notObservedDimensions: options.allEnvNotObserved }),
    projects: [
      {
        projectId: "pilot-large-centralblock",
        scenarioId: "lab-floor-gf-boq",
        ...(syntheticAll ? { synthetic: true } : {}),
      },
      {
        projectId: "pilot-large-northwing-repair",
        scenarioId: "lab-room-204-repair",
        ...(syntheticAll ? { synthetic: true } : {}),
      },
    ],
  };
  const small: PilotEnvironmentSpec = {
    environmentId: "pilot-env-small-consultancy",
    label: "Pilot environment — small ICP consultancy",
    icp: PILOT_ICP_SMALL_CONSULTANCY,
    ...(options.smallEnvNotObserved === undefined && options.allEnvNotObserved === undefined
      ? {}
      : {
          notObservedDimensions: [
            ...new Set([...(options.allEnvNotObserved ?? []), ...(options.smallEnvNotObserved ?? [])]),
          ].sort(),
        }),
    projects: [
      {
        projectId: "pilot-small-northwing",
        scenarioId: "lab-room-104-defect",
        ...(syntheticAll || syntheticSmall ? { synthetic: true } : {}),
      },
    ],
  };
  return {
    campaignId: syntheticAll
      ? "pilot-campaign-synthetic-projection"
      : syntheticSmall
        ? "pilot-campaign-mixed-evidence"
        : "pilot-campaign-production-hardening",
    environments: [large, small],
    sessionRecorder: recorder,
    targetedWorkflowSteps: PILOT_TARGETED_WORKFLOW_STEPS,
    adoptionStates: pilotAdoptionStates(),
    ...(syntheticAll || syntheticSmall ? { projectedAdoption: PILOT_PROJECTED_ADOPTION } : {}),
  };
}

/** The shipped multi-project pilot campaign spec (large + small ICP). */
export function shippedPilotCampaignSpec(options: PilotSpecOptions = {}): PilotCampaignSpec {
  return buildSpec(options);
}

/** A synthetic-only campaign spec (every project a projection). */
export function syntheticOnlyPilotCampaignSpec(): PilotCampaignSpec {
  return buildSpec({ syntheticOnly: true });
}

/** A mixed campaign spec (small ICP synthetic-only, large executed). */
export function mixedPilotCampaignSpec(options: PilotSpecOptions = {}): PilotCampaignSpec {
  return buildSpec({ ...options, mixedSynthetic: true });
}

/* ------------------------------------------------------------------ */
/* Convenience runners                                                  */
/* ------------------------------------------------------------------ */

/** Run the shipped pilot campaign (the dogfood entrypoint). */
export async function runShippedPilotCampaign(
  options: {
    readonly recorder?: PilotRecorderOptions;
    readonly campaign?: RunPilotCampaignOptions;
    readonly smallEnvNotObserved?: readonly PilotDimension[];
    readonly allEnvNotObserved?: readonly PilotDimension[];
  } = {},
): Promise<PilotCampaignResult> {
  return runPilotCampaign(
    shippedPilotCampaignSpec({
      recorder: options.recorder,
      ...(options.smallEnvNotObserved === undefined
        ? {}
        : { smallEnvNotObserved: options.smallEnvNotObserved }),
      ...(options.allEnvNotObserved === undefined
        ? {}
        : { allEnvNotObserved: options.allEnvNotObserved }),
    }),
    options.campaign,
  );
}

/* ------------------------------------------------------------------ */
/* Assertion helpers (tests + report consumers)                         */
/* ------------------------------------------------------------------ */

/** Look up an evidence field value by label (null when absent). */
export function evidenceField(
  fields: readonly PilotEvidenceField[],
  label: string,
): string | number | boolean | null {
  return fields.find((field) => field.label === label)?.value ?? null;
}

/** The metric ids the shipped release criteria threshold (test helper). */
export const PILOT_THRESHOLDED_METRIC_IDS: readonly PilotAdoptionMetricId[] = deepFreeze([
  "primary_interface_adoption_rate",
  "authorized_action_success_rate",
  "return_path_completion_rate",
  "context_switches_per_session",
  "workflow_migration_coverage",
  "distinct_pilot_principals",
]);
