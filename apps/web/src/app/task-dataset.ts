/**
 * PROD-017 — the task-first adapter's committed DEMO task-flow dataset.
 *
 * The demo world of the task-first flow (the same discipline as
 * `demo.ts`: a committed, explicitly-badged stand-in for server records
 * shown when the live task-flow objects are not served on this origin —
 * never presented as live authority). The VALUES are the PROD-016
 * committed fixture corpus (the sanctioned, versioned corpus of
 * `packages/adapter-contract/fixtures/`) — carried VERBATIM, never
 * re-authored: one honest task world (project `proj-7f3a2b`, task
 * `task-2c9f01`) whose objects exercise exactly the contract semantics the
 * adapter must render:
 *
 *  - an ACTIONABLE and a BLOCKED NextBestAction (the blocked one is the
 *    journey's current step: capability-blocked + authorization-denied —
 *    the two blocked reasons the browser must surface verbatim);
 *  - an AuthorizationContext with grants AND typed denials;
 *  - an EvidenceSummary with declared gaps (MISSING + WEAK);
 *  - a RealitySummary with an honest partial readiness statement;
 *  - a BOQContext from an external source system (ERP — the incumbent
 *    stays the system of record);
 *  - an EngineeringCaseSummary under review;
 *  - an InterventionScenarioSummary in the PROPOSED epistemic state;
 *  - an OutcomeSummary in the OBSERVED epistemic state with post-work
 *    evidence ids;
 *  - an OperationResult FAILED with a typed provider-unavailable failure
 *    and one SUCCEEDED with result refs.
 *
 * The dataset is decoded through the CONTRACT decoders at assembly (a test
 * asserts this) — so even the demo world proves the seam, and drift from
 * the contract is a test failure, not a silent rendering.
 *
 * Determinism: pure constants; no clock, no randomness, no IO.
 */

import {
  REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS,
  type TaskCapabilityRequirements,
} from "@aise/adapter-contract";
import {
  decodeAuthorizationContextAtSeam,
  decodeBOQContextAtSeam,
  decodeEngineeringCaseSummaryAtSeam,
  decodeEvidenceSummaryAtSeam,
  decodeInterventionScenarioSummaryAtSeam,
  decodeNextBestActionAtSeam,
  decodeOperationResultAtSeam,
  decodeOutcomeSummaryAtSeam,
  decodeProjectContextAtSeam,
  decodeRealitySummaryAtSeam,
  decodeTaskRequirementsAtSeam,
  type ContractDecode,
  type TaskFlowBundle,
} from "./task-contract";

/* ------------------------------------------------------------------ */
/* The corpus project's stable ids (the demo task world)                */
/* ------------------------------------------------------------------ */

/** The demo task-journey project (the PROD-016 corpus project). */
export const DEMO_TASK_PROJECT_ID = "proj-7f3a2b";

/** The demo task-journey's task id (the corpus field-capture task). */
export const DEMO_TASK_ID = "task-2c9f01";

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

/** The journey's CURRENT step: the server-stated BLOCKED action (verbatim). */
const NEXT_BEST_ACTION_BLOCKED_WIRE = {
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

/** The corpus's ACTIONABLE exemplar (the alternate branch of the same task). */
const NEXT_BEST_ACTION_ACTIONABLE_WIRE = {
  contractVersion: "1.0.0",
  actionId: "action-8ba1",
  taskRef: "task-2c9f01",
  kind: "capture-evidence",
  status: "actionable",
  prompt:
    "Capture a depth scan of the cracked masonry on level 2 with the reference scale bar placed along the crack, then submit the mission batch for review.",
  blockers: [],
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

/** The server-owned requirements of the demo task (the corpus reference set). */
const TASK_REQUIREMENTS_WIRE: TaskCapabilityRequirements =
  REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS;

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
  resultRefs: ["mission-batch-9917", "evidence-f08d256a", "mission-step-42"],
  completedAt: "2026-01-15T12:40:00.000Z",
} as const;

/* ------------------------------------------------------------------ */
/* Assembly (decoded through the contract — the seam discipline)        */
/* ------------------------------------------------------------------ */

/** The demo task-journey project's joined bundle (the current task view). */
export function demoTaskFlowBundle(): TaskFlowBundle {
  return {
    context: expectDecoded(decodeProjectContextAtSeam(PROJECT_CONTEXT_WIRE)),
    reality: expectDecoded(decodeRealitySummaryAtSeam(REALITY_SUMMARY_WIRE)),
    evidence: expectDecoded(decodeEvidenceSummaryAtSeam(EVIDENCE_SUMMARY_WIRE)),
    boq: expectDecoded(decodeBOQContextAtSeam(BOQ_CONTEXT_WIRE)),
    caseSummary: expectDecoded(decodeEngineeringCaseSummaryAtSeam(CASE_SUMMARY_WIRE)),
    scenario: expectDecoded(decodeInterventionScenarioSummaryAtSeam(SCENARIO_SUMMARY_WIRE)),
    outcome: expectDecoded(decodeOutcomeSummaryAtSeam(OUTCOME_SUMMARY_WIRE)),
    nextBestAction: expectDecoded(
      decodeNextBestActionAtSeam(NEXT_BEST_ACTION_BLOCKED_WIRE),
    ),
    authorization: expectDecoded(
      decodeAuthorizationContextAtSeam(AUTHORIZATION_CONTEXT_WIRE),
    ),
    requirements: expectDecoded(decodeTaskRequirementsAtSeam(TASK_REQUIREMENTS_WIRE)),
  };
}

/** The corpus's actionable next-best-action exemplar (decoded). */
export function demoActionableNextBestAction() {
  return expectDecoded(decodeNextBestActionAtSeam(NEXT_BEST_ACTION_ACTIONABLE_WIRE));
}

/** The corpus's failed operation-result exemplar (decoded). */
export function demoFailedOperationResult() {
  return expectDecoded(decodeOperationResultAtSeam(OPERATION_RESULT_FAILED_WIRE));
}

/** The corpus's succeeded operation-result exemplar (decoded). */
export function demoSucceededOperationResult() {
  return expectDecoded(decodeOperationResultAtSeam(OPERATION_RESULT_SUCCEEDED_WIRE));
}

/** The demo authorization context (decoded) — the W-R1 render input. */
export function demoAuthorizationContext() {
  return expectDecoded(decodeAuthorizationContextAtSeam(AUTHORIZATION_CONTEXT_WIRE));
}

/**
 * A committed constant ALWAYS decodes — the only failure mode is a defect
 * in this file or the contract itself. Throwing here (at module init or
 * first call) surfaces that defect loudly in every test and the browser
 * console; the renderer never sees a half-decoded bundle.
 */
function expectDecoded<T>(result: ContractDecode<T>): T {
  if (!result.ok) {
    throw new Error(
      `the committed demo task dataset failed contract decode: ${result.failure.objectName}: ${result.failure.detail}`,
    );
  }
  return result.value;
}
