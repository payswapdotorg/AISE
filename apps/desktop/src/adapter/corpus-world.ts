/**
 * PROD-020 — the desktop adapter's CORPUS WORLD.
 *
 * The committed PROD-016 fixture-corpus task world (project `proj-7f3a2b`,
 * task `task-2c9f01`) as in-memory wire values — carried VERBATIM from
 * `packages/adapter-contract/fixtures/`, never re-authored, and PINNED by
 * tests (corpus-world.test.ts) against `loadCommittedFixtures()` so drift
 * from the committed corpus is a test failure, not a silent rendering.
 *
 * This is the stub-transport body set the journey/adapter tests use (the
 * same discipline as the browser adapter's golden-journey stubs: "what a
 * contract-serving deployment answers"). The PRODUCT never fabricates
 * server data — the live client renders honest unavailable states when
 * the deployment does not serve the adapter objects (see client.ts).
 *
 * Determinism: pure constants; no clock, no randomness, no IO.
 */

import type { TaskFlowBundle } from "./seam";
import { decodeTaskFlowBundleAtSeam, type ContractDecode } from "./seam";

/** The corpus task-journey project (the PROD-016 corpus project). */
export const CORPUS_PROJECT_ID = "proj-7f3a2b";

/** The corpus task-journey's task id. */
export const CORPUS_TASK_ID = "task-2c9f01";

/* ------------------------------------------------------------------ */
/* The wire values (the committed PROD-016 corpus, verbatim)            */
/* ------------------------------------------------------------------ */

const PROJECT_CONTEXT_WIRE = {
  contractVersion: "1.0.0",
  projectId: "proj-7f3a2b",
  projectName: "Riverside Block B Refurbishment",
  userRole: "field-operator",
  sourceSystem: "aise-internal",
  updatedAt: "2026-01-15T09:20:00.000Z",
} as const;

const REALITY_SUMMARY_WIRE = {
  contractVersion: "1.0.0",
  projectId: "proj-7f3a2b",
  modelVersion: 14,
  readinessStatus: "partial",
  readinessDetail:
    "Level 2 masonry reconstruction is task-ready for crack documentation; level 1 remains not-ready pending coverage of the east elevation.",
  objectCount: 218,
  updatedAt: "2026-01-15T10:05:00.000Z",
} as const;

const EVIDENCE_SUMMARY_WIRE = {
  contractVersion: "1.0.0",
  subjectKind: "engineering_case",
  subjectRef: "case-91ab",
  totalItems: 3,
  evidenceContentIds: [
    "f08d256aa75518620f5814c1ab6639876b8d3dc50028bc567ba3c4c39c225712",
    "60dbb33388e68f526c58a7b6595a72a33475bcb95f9706f0ceafe94e7488680b",
    "234de3783bf00bd0e2a1b21d1f16d6cafb10b629ed027e57c526712ec68e46cd",
  ],
  gaps: [
    {
      gapId: "gap-4471",
      kind: "MISSING",
      description:
        "No calibrated reference dimension was captured for the cracked masonry area; a scale reference or manual measurement is required before dimension assertions can be grounded.",
    },
    {
      gapId: "gap-4472",
      kind: "WEAK",
      description:
        "The single oblique photo of the wall base is too low-angle to support the crack-width comparison the case relies on.",
    },
  ],
  summarizedAt: "2026-01-15T10:00:00.000Z",
} as const;

const BOQ_CONTEXT_WIRE = {
  contractVersion: "1.0.0",
  boqId: "boq-import-33d",
  revision: 2,
  sourceSystem: "erp",
  sourceRecordRef: "ERP-BOQ-2026-0042",
  lineItemCount: 1284,
  updatedAt: "2026-01-14T16:30:00.000Z",
} as const;

const CASE_SUMMARY_WIRE = {
  contractVersion: "1.0.0",
  caseId: "case-91ab",
  title: "Level 2 masonry cracking — diagnosis pending reference dimensions",
  status: "under-review",
  observationCount: 7,
  updatedAt: "2026-01-15T09:45:00.000Z",
} as const;

const SCENARIO_SUMMARY_WIRE = {
  contractVersion: "1.0.0",
  scenarioId: "scenario-55c1",
  version: 3,
  epistemicState: "PROPOSED",
  approvalState: "pending-review",
  updatedAt: "2026-01-15T11:00:00.000Z",
} as const;

const OUTCOME_SUMMARY_WIRE = {
  contractVersion: "1.0.0",
  outcomeId: "outcome-77e2",
  epistemicState: "OBSERVED",
  comparisonAvailable: true,
  postWorkEvidenceContentIds: [
    "196b5ab5d99835a2a14dce2348d3a29c0a21226d65bb0ce8a088fcfcd37c0e43",
    "556f8ba4f8de534de3547f0bcac85d7ecfade9b45e7edebef3ba8b7deb6991fe",
  ],
  updatedAt: "2026-01-16T14:20:00.000Z",
} as const;

const NEXT_BEST_ACTION_WIRE = {
  contractVersion: "1.0.0",
  actionId: "action-8ba2",
  taskRef: "task-2c9f01",
  kind: "capture-evidence",
  status: "blocked",
  prompt:
    "Depth capture cannot start: this device profile does not satisfy the depth-capture requirement, and the operator is not authorized to submit reality writes on this project.",
  blockers: [
    {
      reasonCode: "capability-blocked",
      detail:
        "The negotiated capability outcome is blocked: camera requirement unmet (required any of [depth]; profile declares [still, video]). Capture can proceed after switching to a depth-capable device or escalating to a specialist instrument.",
    },
    {
      reasonCode: "authorization-denied",
      detail:
        "The server's authorization context denies `reality:write` for this principal (reason: missing-permission). Request the project engineer to grant the field-operator role before retrying.",
    },
  ],
} as const;

const AUTHORIZATION_CONTEXT_WIRE = {
  contractVersion: "1.0.0",
  subjectRef: "principal-field-12",
  grantedActions: [
    "reality:read",
    "evidence:read",
    "evidence:submit",
    "boq:read",
    "case:read",
  ],
  denials: [
    {
      action: "reality:write",
      reasonCode: "missing-permission",
      reasonDetail:
        "The field-operator role on this project does not carry reality:write; ask the project engineer to grant it or perform the write under an engineer session.",
    },
    {
      action: "settings:tenant-admin",
      reasonCode: "forbidden-role",
      reasonDetail: "Tenant administration requires the admin role.",
    },
  ],
} as const;

const TASK_REQUIREMENTS_WIRE = {
  contractVersion: "1.0.0",
  requirementsId: "requirements-field-depth-capture",
  taskType: "field-capture",
  camera: {
    requireAny: ["depth"],
    blocking: true,
  },
  input: {
    requireAny: ["camera-scan", "touch"],
    blocking: true,
  },
  offlineStorage: {
    minMode: "bounded-queue",
    minQueueBoundBytes: 104857600,
    blocking: false,
  },
} as const;

const OPERATION_RESULT_FAILED_WIRE = {
  contractVersion: "1.0.0",
  operationId: "operation-3fa9",
  actionRef: "action-8ba1",
  status: "failed",
  failure: {
    code: "provider-unavailable",
    detail:
      "The reconstruction provider is currently unavailable; the submitted evidence batch is preserved and the operation can be retried once the provider answers again.",
  },
  resultRefs: [],
  completedAt: "2026-01-15T12:40:00.000Z",
} as const;

const OPERATION_RESULT_SUCCEEDED_WIRE = {
  contractVersion: "1.0.0",
  operationId: "operation-3fa9",
  actionRef: "action-8ba1",
  status: "succeeded",
  resultRefs: [
    "mission-batch-9917",
    "evidence-f08d256a",
    "mission-step-42",
  ],
  completedAt: "2026-01-15T12:40:00.000Z",
} as const;

const TASK_INTENT_WIRE = {
  contractVersion: "1.0.0",
  taskId: "task-2c9f01",
  taskType: "field-capture",
  intent: "Capture depth evidence of the cracked masonry on level 2 so the engineering case can be diagnosed.",
  projectRef: "proj-7f3a2b",
  targetRefs: ["case-91ab", "node-wall-12"],
  parameters: {
    priority: "high",
    area: "level-2",
  },
  createdAt: "2026-01-15T09:25:00.000Z",
} as const;

/* ------------------------------------------------------------------ */
/* The joined bundle (decoded through the seam at assembly)             */
/* ------------------------------------------------------------------ */

/**
 * The corpus task-flow bundle wire object (the joined-endpoint body the
 * stub transport answers for the corpus project's task flow).
 */
export const CORPUS_TASK_FLOW_WIRE = {
  context: PROJECT_CONTEXT_WIRE,
  reality: REALITY_SUMMARY_WIRE,
  evidence: EVIDENCE_SUMMARY_WIRE,
  boq: BOQ_CONTEXT_WIRE,
  caseSummary: CASE_SUMMARY_WIRE,
  scenario: SCENARIO_SUMMARY_WIRE,
  outcome: OUTCOME_SUMMARY_WIRE,
  nextBestAction: NEXT_BEST_ACTION_WIRE,
  authorization: AUTHORIZATION_CONTEXT_WIRE,
  requirements: TASK_REQUIREMENTS_WIRE,
} as const;

/** The corpus authorization-context wire body (the joined authorization answer). */
export const CORPUS_AUTHORIZATION_WIRE = AUTHORIZATION_CONTEXT_WIRE;

/** The corpus failed operation result (the provider-unavailable scenario). */
export const CORPUS_OPERATION_RESULT_FAILED_WIRE = OPERATION_RESULT_FAILED_WIRE;

/** The corpus succeeded operation result (the answered-retry scenario). */
export const CORPUS_OPERATION_RESULT_SUCCEEDED_WIRE = OPERATION_RESULT_SUCCEEDED_WIRE;

/** The corpus TaskIntent (the field-capture intent of task-2c9f01). */
export const CORPUS_TASK_INTENT_WIRE = TASK_INTENT_WIRE;

/**
 * The corpus task-flow bundle DECODED through the adapter's seam (the
 * tests consume decoded contract objects, proving the seam on the corpus
 * world too). Never throws: a corpus drift surfaces as a test failure on
 * the callers' expectations.
 */
export function corpusTaskFlowBundle(): ContractDecode<TaskFlowBundle> {
  return decodeTaskFlowBundleAtSeam(CORPUS_TASK_FLOW_WIRE);
}
