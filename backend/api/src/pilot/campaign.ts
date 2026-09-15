/**
 * AISE-039 — the deterministic multi-project pilot campaign driver.
 *
 * THE CAMPAIGN DRIVES THE REAL MODULES (the loud rule): every non-synthetic
 * project of a pilot environment is EXECUTED through the AISE-035 lab
 * runner — the real end-to-end harness that orchestrates the REAL pipeline
 * modules (missions planner → capture gateway → evidence → reconstruction →
 * semantics → Reality Graph → assurance → verification → gaps → BOQ →
 * case → intervention → impact → execution → outcome/lineage) with its
 * deterministic fixtures and injected clock. The pilot campaign NEVER
 * re-implements a pipeline stage and never mints a second authority: every
 * executed record below is a real module's record, echoed verbatim or
 * summarized with its record ids.
 *
 * MULTI-PROJECT, LARGE + SMALL ICP (§039): a campaign composes MULTIPLE
 * projects across typed ICP environments (at least one LARGE and one SMALL
 * profile in the shipped spec) and every per-project result is inspectable
 * — the campaign aggregate may never hide a per-project critical failure
 * (R17 discipline applied to pilot gates; see gates.ts
 * `campaignAggregateHidingProof`).
 *
 * EVIDENCE BINDING IS VERIFIED, NOT TRUSTED: a recorded session may only
 * claim executed evidence whose run digest equals the project's ACTUAL
 * executed-run digest and whose per-hop record ids are CONTAINED in the
 * run's real hop record ids. A session that claims records a run did not
 * produce is a typed `evidence_binding_mismatch` refusal — this is the
 * load-bearing check behind "adoption metrics come from executed records,
 * never synthetic users alone".
 *
 * SHARED-split honesty: the sandbox has no live pilot users or telemetry
 * collectors; session evidence (walk latency samples, broker outcomes,
 * traversals, audit observations) is represented as DETERMINISTIC RECORDED
 * fixtures bound to the real executed runs — exactly the AISE-035 split
 * (GEMINI-side data as deterministic ground-truth fixtures over the real
 * contracts). Live telemetry ingestion remains a known limitation.
 *
 * DETERMINISM: injected clock, content-derived run digests (sha-256 over a
 * canonical run projection), fixed fixture ids; byte-identical
 * recomputation over the same clock (the reproducibility digest proves it;
 * the ONLY nondeterministic field is `generatedAt`, excluded from the
 * digest).
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  runScenario,
  type LabDegradations,
  type LabHopId,
  type LabScenarioRun,
} from "../lab/runner";
import { scenarioById } from "../lab/scenarios";
import type { MigrationCandidate } from "../adoption/model";
import { sha256Hex } from "../lib/hash";
import {
  PilotError,
  parsePilotSessionRecord,
  sessionEvidenceClass,
  validateIcpProfile,
  type PilotCampaignSpec,
  type PilotDimension,
  type PilotEnvironmentSpec,
  type PilotIcpClass,
  type PilotSessionContext,
  type PilotSessionRecord,
} from "./model";

/* ------------------------------------------------------------------ */
/* Campaign result model                                                */
/* ------------------------------------------------------------------ */

/** The executed-run summary a campaign result carries (real records). */
export interface PilotExecutedRunSummary {
  /** sha-256 over the canonical run projection (see `pilotRunDigest`). */
  readonly runDigest: string;
  readonly hops: readonly {
    readonly hopId: LabHopId;
    readonly outcome: "ok" | "failed" | "notApplicable";
    readonly recordIds: readonly string[];
    readonly detail: string | null;
  }[];
  readonly stoppedAt: LabHopId | null;
  readonly stopReason: { readonly code: string; readonly detail: string } | null;
  /** True iff any hop failed or the run stopped early (critical, R17). */
  readonly criticalExecutionFailure: boolean;
}

/** One project's pilot result: executed run (or honest null) + sessions. */
export interface PilotProjectResult {
  readonly environmentId: string;
  readonly icpClass: PilotIcpClass;
  readonly projectId: string;
  readonly scenarioId: string;
  /** Null iff the project is synthetic-only (an honest loud absence). */
  readonly executed: PilotExecutedRunSummary | null;
  readonly sessions: readonly PilotSessionRecord[];
  /** Environment-level NOT_OBSERVED dimensions (sessions carry their own). */
  readonly notObserved: readonly PilotDimension[];
}

/** The deterministic multi-project pilot campaign result. */
export interface PilotCampaignResult {
  readonly campaignId: string;
  /** Injected-clock timestamp — the ONLY nondeterministic field. */
  readonly generatedAt: string;
  readonly environments: readonly {
    readonly environmentId: string;
    readonly label: string;
    readonly icp: PilotEnvironmentSpec["icp"];
    readonly notObservedDimensions: readonly PilotDimension[];
    readonly projectIds: readonly string[];
  }[];
  readonly projects: readonly PilotProjectResult[];
  readonly targetedWorkflowSteps: readonly { readonly workflowId: string; readonly stepId: string }[];
  readonly adoptionStates: readonly MigrationCandidate[];
  readonly projectedAdoption: PilotCampaignSpec["projectedAdoption"];
  /** sha-256 over canonical campaign JSON with generatedAt stripped. */
  readonly reproducibilityDigest: string;
}

/* ------------------------------------------------------------------ */
/* Run digest (canonical, byte-stable)                                  */
/* ------------------------------------------------------------------ */

/**
 * sha-256 over the canonical JSON of the run's digestible projection:
 * scenario id, every hop (id/outcome/recordIds/detail), the honest stop
 * record and the ground-truth not-observed declarations. The projection
 * is the lab runner's OWN record shape echoed verbatim — no
 * re-interpretation.
 */
export function pilotRunDigest(run: LabScenarioRun): string {
  return sha256Hex(
    canonicalJsonStringify({
      scenarioId: run.scenarioId,
      hops: run.hops.map((hop) => ({
        hopId: hop.hopId,
        outcome: hop.outcome,
        recordIds: hop.recordIds,
        detail: hop.detail,
      })),
      stoppedAt: run.stoppedAt,
      stopReason: run.stopReason,
      notObserved: run.notObserved,
    }),
  );
}

/** The digest preimage: the campaign minus generatedAt and the digest. */
export type PilotCampaignPreimage = Omit<
  PilotCampaignResult,
  "generatedAt" | "reproducibilityDigest"
>;

/** The digest preimage: the campaign minus generatedAt and the digest. */
export function campaignDigestPreimage(campaign: PilotCampaignResult): PilotCampaignPreimage {
  return {
    campaignId: campaign.campaignId,
    environments: campaign.environments,
    projects: campaign.projects,
    targetedWorkflowSteps: campaign.targetedWorkflowSteps,
    adoptionStates: campaign.adoptionStates,
    projectedAdoption: campaign.projectedAdoption,
  };
}

/** sha-256 of the canonical campaign JSON with generatedAt stripped. */
export function campaignDigestOf(campaign: PilotCampaignResult): string {
  return sha256Hex(canonicalJsonStringify(campaignDigestPreimage(campaign)));
}

/* ------------------------------------------------------------------ */
/* The campaign driver                                                  */
/* ------------------------------------------------------------------ */

export interface RunPilotCampaignOptions {
  /** Injected clock (default: the testkit's constant campaign clock). */
  readonly clock?: () => string;
  /**
   * Deliberate execution degradations per project id (the discrimination
   * instruments the lab runner ships — corrupted capture, dropped
   * evidence, injected geometry error). NEVER baselines.
   */
  readonly degradationsByProjectId?: Readonly<Record<string, LabDegradations>>;
}

function summarizeRun(run: LabScenarioRun, runDigest: string): PilotExecutedRunSummary {
  const failedHop = run.hops.some((hop) => hop.outcome === "failed");
  return {
    runDigest,
    hops: run.hops.map((hop) => ({
      hopId: hop.hopId,
      outcome: hop.outcome,
      recordIds: hop.recordIds,
      detail: hop.detail,
    })),
    stoppedAt: run.stoppedAt,
    stopReason: run.stopReason,
    criticalExecutionFailure: failedHop || run.stoppedAt !== null,
  };
}

/** Validate one recorded session against its real execution context. */
function bindSession(
  session: PilotSessionRecord,
  environment: PilotEnvironmentSpec,
  projectId: string,
  executed: { readonly run: LabScenarioRun; readonly runDigest: string } | null,
  campaignId: string,
): PilotSessionRecord {
  if (session.environmentId !== environment.environmentId || session.projectId !== projectId) {
    throw new PilotError(
      "session_context_mismatch",
      `session '${session.sessionId}' claims environment '${session.environmentId}' / project ` +
        `'${session.projectId}' but was recorded under '${environment.environmentId}' / ` +
        `'${projectId}' of campaign '${campaignId}'`,
    );
  }
  for (const evidence of session.evidence) {
    if (evidence.kind === "executed_run") {
      if (executed === null) {
        throw new PilotError(
          "evidence_binding_mismatch",
          `session '${session.sessionId}' claims executed-run evidence but project '${projectId}' ` +
            `contributed NO executed run (synthetic-only project)`,
        );
      }
      if (evidence.runDigest !== executed.runDigest) {
        throw new PilotError(
          "evidence_binding_mismatch",
          `session '${session.sessionId}' binds run digest '${evidence.runDigest}' but project ` +
            `'${projectId}' actually executed '${executed.runDigest}' — a session may never claim ` +
            `records a run did not produce`,
        );
      }
      for (const hop of session.walk) {
        if (hop.sourceHopId === null) {
          continue;
        }
        const realHop = executed.run.hops.find((candidate) => candidate.hopId === hop.sourceHopId);
        if (realHop === undefined) {
          throw new PilotError(
            "evidence_binding_mismatch",
            `session '${session.sessionId}' walk hop '${hop.hopId}' sources pipeline hop ` +
              `'${hop.sourceHopId}' which the executed run never recorded`,
          );
        }
        for (const recordId of hop.recordIds) {
          if (!realHop.recordIds.includes(recordId)) {
            throw new PilotError(
              "evidence_binding_mismatch",
              `session '${session.sessionId}' walk hop '${hop.hopId}' references record ` +
                `'${recordId}' the executed run's '${hop.sourceHopId}' hop did NOT produce`,
            );
          }
        }
      }
    }
  }
  return session;
}

function validateSpec(spec: PilotCampaignSpec): void {
  if (typeof spec.campaignId !== "string" || spec.campaignId.length === 0) {
    throw new PilotError("invalid_campaign_spec", "campaignId must be a non-empty string");
  }
  if (!Array.isArray(spec.environments) || spec.environments.length === 0) {
    throw new PilotError("invalid_campaign_spec", "a campaign needs at least one environment");
  }
  if (typeof spec.sessionRecorder !== "function") {
    throw new PilotError("invalid_campaign_spec", "a campaign needs a session recorder");
  }
  const seenEnvironmentIds = new Set<string>();
  const seenProjectIds = new Set<string>();
  for (const environment of spec.environments) {
    validateIcpProfile(environment.icp);
    if (seenEnvironmentIds.has(environment.environmentId)) {
      throw new PilotError(
        "invalid_campaign_spec",
        `duplicate environment id '${environment.environmentId}'`,
      );
    }
    seenEnvironmentIds.add(environment.environmentId);
    if (!Array.isArray(environment.projects) || environment.projects.length === 0) {
      throw new PilotError(
        "invalid_campaign_spec",
        `environment '${environment.environmentId}' has no projects`,
      );
    }
    for (const project of environment.projects) {
      if (seenProjectIds.has(project.projectId)) {
        throw new PilotError(
          "invalid_campaign_spec",
          `duplicate project id '${project.projectId}'`,
        );
      }
      seenProjectIds.add(project.projectId);
      if (project.synthetic !== true) {
        // Fail fast on an unknown scenario id (the lab's own typed refusal).
        scenarioById(project.scenarioId);
      }
    }
  }
}

/**
 * Run the deterministic multi-project pilot campaign: execute every
 * non-synthetic project's scenario through the REAL lab runner, record
 * the session evidence via the injected recorder, VERIFY every session's
 * evidence bindings against the actual executed runs, and assemble the
 * inspectable per-project result with a reproducibility digest.
 */
export async function runPilotCampaign(
  spec: PilotCampaignSpec,
  options: RunPilotCampaignOptions = {},
): Promise<PilotCampaignResult> {
  validateSpec(spec);
  const now = options.clock ?? ((): string => "2026-05-04T08:00:00.000Z");
  const projects: PilotProjectResult[] = [];
  for (const environment of spec.environments) {
    for (const project of environment.projects) {
      let executed: { readonly run: LabScenarioRun; readonly runDigest: string } | null = null;
      if (project.synthetic === true) {
        executed = null;
      } else {
        const degradations = options.degradationsByProjectId?.[project.projectId];
        const { run } = await runScenario(
          scenarioById(project.scenarioId),
          degradations === undefined ? {} : { degradations },
        );
        executed = { run, runDigest: pilotRunDigest(run) };
      }
      const context: PilotSessionContext = {
        environment,
        project,
        executed,
      };
      const rawSessions = spec.sessionRecorder(context);
      const sessions = rawSessions.map((session) => {
        const parsed = parsePilotSessionRecord(session);
        return bindSession(parsed, environment, project.projectId, executed, spec.campaignId);
      });
      projects.push({
        environmentId: environment.environmentId,
        icpClass: environment.icp.icpClass,
        projectId: project.projectId,
        scenarioId: project.scenarioId,
        executed: executed === null ? null : summarizeRun(executed.run, executed.runDigest),
        sessions,
        notObserved: [...(environment.notObservedDimensions ?? [])].sort(),
      });
    }
  }
  const result = {
    campaignId: spec.campaignId,
    environments: spec.environments.map((environment) => ({
      environmentId: environment.environmentId,
      label: environment.label,
      icp: environment.icp,
      notObservedDimensions: [...(environment.notObservedDimensions ?? [])].sort(),
      projectIds: environment.projects.map((project) => project.projectId),
    })),
    projects,
    targetedWorkflowSteps: spec.targetedWorkflowSteps.map((step) => ({ ...step })),
    adoptionStates: spec.adoptionStates.map((candidate) => candidate),
    projectedAdoption: spec.projectedAdoption,
  } satisfies PilotCampaignPreimage;
  const generatedAt = now();
  const reproducibilityDigest = sha256Hex(canonicalJsonStringify(result));
  return {
    ...result,
    generatedAt,
    reproducibilityDigest,
  };
}

/** Classify a session by its evidence (real vs synthetic), for rollups. */
export function sessionClassOf(session: PilotSessionRecord): "real" | "synthetic" {
  return session.evidence.some((entry) => sessionEvidenceClass(entry) === "synthetic")
    ? "synthetic"
    : "real";
}
