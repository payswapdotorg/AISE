/**
 * Deterministic Execution/Outcome test fixtures (AISE-031) — TEST SUPPORT
 * ONLY, never imported by production modules.
 *
 * All ids are fixed seed strings (evidence/state/step ids derive via
 * sha-256), all timestamps are fixed constants, clocks are constant or
 * fixed-sequence functions. No wall-clock, no randomness, no network — the
 * verify gate stays deterministic.
 *
 * Deliberately imports NO sibling module (not even types): the read-only
 * authority contexts are plain `InterventionContext` / `CaseContext`
 * objects — MY module's projection types. Tests that want the REAL
 * authorities behind the resolvers construct real Case/Intervention
 * services in the test file and adapt them with the production read-only
 * adapters (see service.test.ts / lineage.test.ts).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "../lib/hash";
import type {
  CaseContext,
  InterventionContext,
  RecordExecutionInput,
  RecordOutcomeInput,
} from "./model";
import type {
  CaseContextResolver,
  EvidenceMembershipResolver,
  ExecutionService,
  InterventionContextResolver,
} from "./service";

export const FIXED_NOW = "2026-03-02T09:00:00.000Z";
export const FIXED_LATER = "2026-03-02T09:30:00.000Z";
export const FIXED_EVEN_LATER = "2026-03-02T10:15:00.000Z";
export const FIXED_EXECUTED = "2026-03-01T16:00:00.000Z";
export const FIXED_APPROVAL = "2026-02-28T11:00:00.000Z";

/** Injected clock: constant, so execution bytes are stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Deterministic advancing clock: returns steps[i] on the i-th call. */
export function makeSequenceClock(steps: readonly string[]): () => string {
  let calls = 0;
  const last = steps.length - 1;
  return (): string => {
    const value = steps[Math.min(calls, last)];
    calls += 1;
    return value ?? steps[last] ?? FIXED_NOW;
  };
}

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-execution-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Deterministic valid evidence id (64 lowercase hex) from a seed. */
export function evidenceIdOf(seed: string): string {
  return sha256Hex(`aise-execution-test:${seed}`);
}

/** Deterministic realistic intervention step id (`step-<16 hex>`). */
export function stepIdOf(seed: string): string {
  return `step-${sha256Hex(`aise-execution-test-step:${seed}`).slice(0, 16)}`;
}

/** Deterministic realistic intervention state id (64 hex). */
export function stateIdOf(seed: string): string {
  return sha256Hex(`aise-execution-test-state:${seed}`);
}

export const EV_WORK_PHOTOS = evidenceIdOf("work-photos");
export const EV_FIRE_CERT = evidenceIdOf("fire-certificate");
export const EV_POSTWORK_SCAN = evidenceIdOf("postwork-scan");
export const EV_POSTWORK_PHOTO = evidenceIdOf("postwork-photo");
export const EV_THERMAL_CHECK = evidenceIdOf("thermal-check");

export const KNOWN_EVIDENCE: readonly string[] = [
  EV_WORK_PHOTOS,
  EV_FIRE_CERT,
  EV_POSTWORK_SCAN,
  EV_POSTWORK_PHOTO,
  EV_THERMAL_CHECK,
];

export const SESSION_WORK_1 = "session-work-42";
export const SESSION_POSTWORK_1 = "session-postwork-43";
export const SESSION_POSTWORK_2 = "session-postwork-44";

export const CASE_ID = "case-office-refit";
export const SCENARIO_ID = "scenario-office-refit";
export const EXECUTION_ID = "execution-office-refit-1";

/* ------------------------------------------------------------------ */
/* Canonical read-only authority contexts (plain projections)           */
/* ------------------------------------------------------------------ */

export const STEP_FIRE_ID = stepIdOf("fire-rating");
export const STEP_PARTITION_ID = stepIdOf("partition");
export const STEP_REMOVE_ID = stepIdOf("remove-wall-east");

export const STATE_0_ID = stateIdOf("layer-0");
export const STATE_1_ID = stateIdOf("layer-1");
export const STATE_2_ID = stateIdOf("layer-2");
export const STATE_3_ID = stateIdOf("layer-3");

/** The canonical APPROVED scenario context (the 3-step office refit). */
export function buildApprovedScenarioContext(): InterventionContext {
  return {
    scenarioId: SCENARIO_ID,
    status: "approved",
    title: "Office refit — fire upgrade, partition and demolition",
    baselineVersionId: "v001",
    approvalReference: {
      caseId: CASE_ID,
      reviewDecision: "approved",
      reviewedAt: FIXED_APPROVAL,
    },
    steps: [
      { stepId: STEP_FIRE_ID, stepIndex: 1 },
      { stepId: STEP_PARTITION_ID, stepIndex: 2 },
      { stepId: STEP_REMOVE_ID, stepIndex: 3 },
    ],
    states: [
      { stateId: STATE_0_ID, stateIndex: 0, appliedStepIds: [] },
      { stateId: STATE_1_ID, stateIndex: 1, appliedStepIds: [STEP_FIRE_ID] },
      {
        stateId: STATE_2_ID,
        stateIndex: 2,
        appliedStepIds: [STEP_FIRE_ID, STEP_PARTITION_ID],
      },
      {
        stateId: STATE_3_ID,
        stateIndex: 3,
        appliedStepIds: [STEP_FIRE_ID, STEP_PARTITION_ID, STEP_REMOVE_ID],
      },
    ],
  };
}

/** Same scenario, but NOT approved (governed-path fixture). */
export function buildScenarioContextWithStatus(status: string): InterventionContext {
  return { ...buildApprovedScenarioContext(), status };
}

/** The canonical engineering case context (the issue end of the chain). */
export function buildCaseContext(): CaseContext {
  return {
    caseId: CASE_ID,
    status: "under_review",
    title: "Office refit — fire compartment non-compliance",
    observations: [
      {
        observationId: "obs-0000abcd1111eeee",
        statement: "The north compartment wall carries a measured fire rating of REI60.",
        evidenceIds: [evidenceIdOf("baseline-photo"), evidenceIdOf("fire-report")],
      },
      {
        observationId: "obs-0000ffff2222dddd",
        statement: "The open floor plan has no rated partition at the planned office split.",
        evidenceIds: [evidenceIdOf("layout-scan")],
      },
    ],
    hypotheses: [
      {
        hypothesisId: "hyp-0000aaaa3333cccc",
        statement:
          "Upgrading the compartment line to REI90 and adding a rated partition resolves the compliance finding.",
        epistemicStatus: "INFERRED",
        confidence: "medium",
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic fake resolvers (read-only, map-backed)                 */
/* ------------------------------------------------------------------ */

/** Fixed intervention context resolver over explicit contexts. */
export function makeInterventionContextResolver(
  contexts: readonly InterventionContext[],
): InterventionContextResolver {
  const byId = new Map(contexts.map((context) => [context.scenarioId, context]));
  return {
    resolveInterventionContext: async (scenarioId) => byId.get(scenarioId) ?? null,
  };
}

/** Fixed case context resolver over explicit contexts. */
export function makeCaseContextResolver(
  contexts: readonly CaseContext[],
): CaseContextResolver {
  const byId = new Map(contexts.map((context) => [context.caseId, context]));
  return {
    resolveCaseContext: async (caseId) => byId.get(caseId) ?? null,
  };
}

/** Fixed evidence membership resolver over an explicit known-id set. */
export function makeEvidenceMembershipResolver(
  known: readonly string[],
): EvidenceMembershipResolver {
  const knownSet = new Set(known);
  return {
    evidenceExists: async (contentId) => knownSet.has(contentId),
  };
}

/** The canonical resolver triple over the canonical contexts. */
export function canonicalResolvers(): {
  interventionContextResolver: InterventionContextResolver;
  caseContextResolver: CaseContextResolver;
  evidenceMembershipResolver: EvidenceMembershipResolver;
} {
  return {
    interventionContextResolver: makeInterventionContextResolver([
      buildApprovedScenarioContext(),
    ]),
    caseContextResolver: makeCaseContextResolver([buildCaseContext()]),
    evidenceMembershipResolver: makeEvidenceMembershipResolver(KNOWN_EVIDENCE),
  };
}

/* ------------------------------------------------------------------ */
/* Canonical lifecycle inputs                                           */
/* ------------------------------------------------------------------ */

/** The canonical execution input (full 3-step state-3 execution). */
export const CANONICAL_EXECUTION: RecordExecutionInput = {
  executionRecordId: EXECUTION_ID,
  caseId: CASE_ID,
  scenarioId: SCENARIO_ID,
  stateId: STATE_3_ID,
  executedStepIds: [STEP_FIRE_ID, STEP_PARTITION_ID, STEP_REMOVE_ID],
  evidenceIds: [EV_WORK_PHOTOS, EV_FIRE_CERT],
  captureSessionIds: [SESSION_WORK_1],
  executedAt: FIXED_EXECUTED,
};

/** The canonical outcome input (post-work scan + capture session). */
export const CANONICAL_OUTCOME: RecordOutcomeInput = {
  caseId: CASE_ID,
  statement:
    "Post-work scan confirms the REI90 compartment line and the new rated partition; wall-east is removed.",
  evidenceIds: [EV_POSTWORK_SCAN, EV_POSTWORK_PHOTO],
  captureSessionIds: [SESSION_POSTWORK_1],
  measurementRefs: ["meas-postwork-1"],
};

/**
 * The full happy-path lifecycle over an ExecutionService wired with the
 * canonical resolvers: record the execution, then the post-work outcome.
 */
export async function runExecutionLifecycle(
  service: ExecutionService,
): Promise<{ executionRecordId: string; outcomeId: string }> {
  const record = await service.recordExecution(CANONICAL_EXECUTION);
  const outcome = await service.recordOutcome(record.executionRecordId, CANONICAL_OUTCOME);
  return { executionRecordId: record.executionRecordId, outcomeId: outcome.outcomeId };
}

/* ------------------------------------------------------------------ */
/* Purity helpers                                                       */
/* ------------------------------------------------------------------ */

/** Recursively freeze an object graph (mutation attempts throw). */
export function deepFreeze<T>(value: T): T {
  if (Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}
