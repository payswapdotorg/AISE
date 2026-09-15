/**
 * AISE-039 — Production pilot hardening: the MODEL.
 *
 * Contract (spec/work-orders.md §039: "Run multi-project pilot across large
 * and small ICP environments, performance/security/usability hardening,
 * release criteria and regression suite. Acceptance requires adoption
 * metrics plus technical gates; no claims based on simulated users alone.";
 * spec/requirements.md R17 — aggregate metrics may never hide critical-class
 * regressions; R19 — AISE usable as the primary project interface with
 * incumbents connected as systems of record where required):
 *
 * AUTHORITY DISCIPLINE (the loud parts first):
 *
 *  - THIS MODULE IS A PILOT HARNESS, NOT AN AUTHORITY. It computes pilot
 *   campaigns, adoption metrics, technical gates and release readiness over
 *   the REAL pipeline modules; it never mints engineering truth, never
 *   blesses a release (the evaluation REPORTS readiness — approval is a
 *   separate act by a separate actor, refused on self-approval), and never
 *   re-implements a pipeline stage.
 *  - ADOPTION METRICS COME FROM EXECUTED RECORDS, NEVER SYNTHETIC USERS
 *   ALONE (the CRITICAL acceptance): a pilot session's evidence is REAL iff
 *   it is bound to a campaign-EXECUTED end-to-end run (the lab runner's
 *   real-module hops, verified by run digest AND per-hop record-id
 *   containment), to adoption-module migration-state records, to recorded
 *   shell-broker authorized-action outcomes, or to recorded deep-link/
 *   return-path traversals. A synthetic projection (a projected user count,
 *   a generated activity stream) is a DISTINCT evidence class that can
 *   never satisfy a metric: metrics over synthetic-only evidence are typed
 *   UNKNOWN with the missing real-evidence requirement named — never a
 *   number, never defaulted.
 *  - NOT_OBSERVED IS FIRST-CLASS: pilot dimensions that were not observed
 *   (environment-level declarations unioned with session-level records)
 *   propagate honestly end-to-end (environment → session → metric → gate →
 *   release) as typed UNKNOWN/NOT_OBSERVED values; nothing silently
 *   defaults to zero or PASS.
 *  - THE VOCABULARIES ARE IMPORTED, NOT REDEFINED: permissions come from
 *   the AISE-036 identity registry (`PERMISSIONS`), audit actions/outcomes
 *   from the identity audit vocabulary, migration states from the AISE-041
 *   adoption model. The shell-broker decision vocabulary (allowed/refused/
 *   unavailable + unavailable reasons) and the connector action kinds are
 *   the AISE-040 shell's frozen vocabularies, mirrored here BY VALUE with
 *   attribution because the workspace boundary rules forbid backend→apps
 *   imports: this module records broker OUTCOMES as evidence (recorded
 *   telemetry over the shell's semantics) and never computes authorization
 *   itself — the identity module stays the authorization authority and the
 *   shell broker stays its relayer.
 *  - TYPED REFUSALS, EVERY FAILURE MODE DISTINCT: `PILOT_ERROR_CODES` is a
 *   frozen registry (unknown vocabularies, invalid records, evidence
 *   binding mismatches, release-log discipline violations); a refused input
 *   never falls through to a silent default.
 *
 * DETERMINISM: no wall clock, no randomness, no I/O. All ids are
 * caller-provided fixture ids or content-derived (sha-256 over canonical
 * JSON); every timestamp comes from an injected clock, so the same campaign
 * over the same clock produces byte-identical records.
 */

import {
  AUDIT_ACTIONS,
  AUDIT_OUTCOMES,
  isPermission,
  PERMISSIONS,
  type AuditAction,
  type AuditOutcome,
  type Permission,
} from "../identity/model";
import { MIGRATION_STATES, type MigrationCandidate, type MigrationState } from "../adoption/model";
import { LAB_HOP_IDS, type LabHopId, type LabScenarioRun } from "../lab/runner";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";

/* ------------------------------------------------------------------ */
/* Typed refusal registry                                              */
/* ------------------------------------------------------------------ */

/**
 * THE frozen pilot refusal registry. Every failure mode is DISTINCT — a
 * refusal names its code and detail; nothing is a blanket error.
 */
export const PILOT_ERROR_CODES = Object.freeze([
  "unknown_walk_hop",
  "unknown_evidence_kind",
  "unknown_icp_class",
  "unknown_gate_id",
  "unknown_metric_id",
  "unknown_dimension",
  "unknown_broker_decision",
  "unknown_broker_unavailable_reason",
  "unknown_connector_action_kind",
  "unknown_permission",
  "unknown_audit_action",
  "unknown_audit_outcome",
  "unknown_migration_state",
  "invalid_latency_sample",
  "invalid_session_record",
  "invalid_traversal_record",
  "invalid_icp_profile",
  "invalid_campaign_spec",
  "invalid_gate_tables",
  "invalid_release_criteria",
  "evidence_binding_mismatch",
  "session_context_mismatch",
  "unknown_evaluation",
  "approval_of_blocked_evaluation",
  "self_approval_refused",
  "duplicate_log_entry",
] as const satisfies readonly string[]);
export type PilotErrorCode = (typeof PILOT_ERROR_CODES)[number];

/** The pilot module's typed error (mirrors the sibling module discipline). */
export class PilotError extends Error {
  readonly code: PilotErrorCode;
  readonly detail: string;

  constructor(code: PilotErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "PilotError";
    this.code = code;
    this.detail = detail;
  }
}

/** Type guard for PilotError (never a bare throw from this module). */
export function isPilotError(value: unknown): value is PilotError {
  return value instanceof PilotError;
}

/* ------------------------------------------------------------------ */
/* ICP scale profiles (typed environment data)                         */
/* ------------------------------------------------------------------ */

/** The two shipped ICP classes the §039 pilot must span. */
export const PILOT_ICP_CLASSES = Object.freeze(["large", "small"] as const);
export type PilotIcpClass = (typeof PILOT_ICP_CLASSES)[number];

function isIcpClass(value: unknown): value is PilotIcpClass {
  return typeof value === "string" && (PILOT_ICP_CLASSES as readonly string[]).includes(value);
}

/**
 * A typed ICP environment profile — the scale axes §039 names (spaces/
 * storeys, evidence volume, user roles, incumbent integrations). The
 * profile DESCRIBES the pilot environment; the campaign's executed
 * scenario is the targeted workflow slice driven through the real
 * modules (no claim is made that the whole environment was executed).
 */
export interface PilotIcpProfile {
  readonly icpClass: PilotIcpClass;
  readonly label: string;
  readonly spaces: number;
  readonly storeys: number;
  readonly evidenceVolume: number;
  readonly userRoleCount: number;
  readonly incumbentIntegrations: number;
}

function isIcpProfileShape(value: unknown): value is PilotIcpProfile {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PilotIcpProfile>;
  return (
    typeof candidate.label === "string" &&
    typeof candidate.spaces === "number" &&
    typeof candidate.storeys === "number" &&
    typeof candidate.evidenceVolume === "number" &&
    typeof candidate.userRoleCount === "number" &&
    typeof candidate.incumbentIntegrations === "number"
  );
}

/** Validate an ICP profile (positive integer axes, known class). */
export function validateIcpProfile(profile: PilotIcpProfile): PilotIcpProfile {
  if (!isIcpProfileShape(profile)) {
    throw new PilotError("invalid_icp_profile", "not an ICP profile object");
  }
  if (!isIcpClass(profile.icpClass)) {
    throw new PilotError(
      "unknown_icp_class",
      `'${String(profile.icpClass)}' is not one of ${PILOT_ICP_CLASSES.join(" | ")}`,
    );
  }
  const axes: readonly [keyof PilotIcpProfile, number][] = [
    ["spaces", profile.spaces],
    ["storeys", profile.storeys],
    ["evidenceVolume", profile.evidenceVolume],
    ["userRoleCount", profile.userRoleCount],
    ["incumbentIntegrations", profile.incumbentIntegrations],
  ];
  for (const [axis, value] of axes) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new PilotError(
        "invalid_icp_profile",
        `axis '${String(axis)}' must be a positive integer (got ${String(value)})`,
      );
    }
  }
  return profile;
}

/* ------------------------------------------------------------------ */
/* Pilot dimensions (the NOT_OBSERVED propagation vocabulary)           */
/* ------------------------------------------------------------------ */

/**
 * THE not-observed dimension registry: the pilot dimensions whose absence
 * must propagate honestly (environment → session → metric → gate →
 * release). A dimension not in this list is a typed refusal, never a
 * silently ignored string.
 */
export const PILOT_DIMENSIONS = Object.freeze([
  "walk-latency",
  "authorized-actions",
  "audit-events",
  "return-path",
  "adoption-states",
] as const satisfies readonly string[]);
export type PilotDimension = (typeof PILOT_DIMENSIONS)[number];

function isDimension(value: unknown): value is PilotDimension {
  return typeof value === "string" && (PILOT_DIMENSIONS as readonly string[]).includes(value);
}

function validateDimensions(
  dimensions: readonly unknown[],
  code: PilotErrorCode,
  what: string,
): readonly PilotDimension[] {
  const validated: PilotDimension[] = [];
  for (const dimension of dimensions) {
    if (!isDimension(dimension)) {
      throw new PilotError(
        code,
        `${what} declares unknown pilot dimension '${String(dimension)}' — known: ${PILOT_DIMENSIONS.join(" | ")}`,
      );
    }
    validated.push(dimension);
  }
  return validated;
}

/* ------------------------------------------------------------------ */
/* The R19 walk vocabulary                                              */
/* ------------------------------------------------------------------ */

/**
 * THE primary-interface walk (R19's targeted workflow): discover project
 * context, inspect evidence/BOQ/reality, initiate authorized actions and
 * return to incumbent records — all from AISE. Order is fixed; a session's
 * walk is the recorded traversal of these hops.
 */
export const PILOT_WALK_HOPS = Object.freeze([
  "context_discover",
  "reality_inspect",
  "boq_inspect",
  "evidence_inspect",
  "action_initiate",
  "return_incumbent",
] as const satisfies readonly string[]);
export type PilotWalkHopId = (typeof PILOT_WALK_HOPS)[number];

function isWalkHop(value: unknown): value is PilotWalkHopId {
  return typeof value === "string" && (PILOT_WALK_HOPS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Session evidence: the real-vs-synthetic distinction (CRITICAL)       */
/* ------------------------------------------------------------------ */

/**
 * THE evidence-kind registry. The first four kinds are REAL (bound to
 * records the real modules produced); `synthetic_projection` is the honest
 * marker for simulated-only claims (projected users, generated activity)
 * that can NEVER satisfy an adoption metric on their own.
 */
export const PILOT_EVIDENCE_KINDS = Object.freeze([
  "executed_run",
  "adoption_state",
  "broker_outcome",
  "deep_link_traversal",
  "synthetic_projection",
] as const satisfies readonly string[]);
export type PilotEvidenceKind = (typeof PILOT_EVIDENCE_KINDS)[number];

/** The two evidence classes a metric may be computed from (real only). */
export const PILOT_EVIDENCE_CLASSES = Object.freeze(["real", "synthetic"] as const);
export type PilotEvidenceClass = (typeof PILOT_EVIDENCE_CLASSES)[number];

/**
 * EXECUTED evidence: the session's activity drove a campaign-executed
 * end-to-end run. `runDigest` binds the session to the run's content
 * digest; `hopRecordIds` binds every pipeline-sourced walk hop to the
 * REAL record ids that run's hop produced (validated by containment at
 * campaign assembly — a session may never claim records a run did not
 * produce).
 */
export interface PilotExecutedEvidence {
  readonly kind: "executed_run";
  readonly runDigest: string;
  /** Per source pipeline hop: the real record ids the walk hop observed. */
  readonly hopRecordIds: Readonly<Partial<Record<LabHopId, readonly string[]>>>;
}

/**
 * ADOPTION-STATE evidence: the session's activity is bound to an
 * adoption-module migration-state record (candidate ids resolved against
 * the campaign's recorded candidates).
 */
export interface PilotAdoptionStateEvidence {
  readonly kind: "adoption_state";
  readonly candidateIds: readonly string[];
}

/**
 * BROKER-OUTCOME evidence: recorded shell-broker authorized-action
 * outcomes (the AISE-040 tri-state, recorded verbatim — see
 * `PilotAuthorizedActionRecord`).
 */
export interface PilotBrokerOutcomeEvidence {
  readonly kind: "broker_outcome";
  readonly actionIds: readonly string[];
}

/**
 * DEEP-LINK-TRAVERSAL evidence: recorded shell deep-link/return-path
 * traversals (the AISE-040 breadcrumb session model, recorded verbatim).
 */
export interface PilotDeepLinkTraversalEvidence {
  readonly kind: "deep_link_traversal";
  readonly traversalIds: readonly string[];
}

/**
 * SYNTHETIC-ONLY evidence: a projected/simulated claim with NO real-module
 * binding. Honest by construction — it names its generator and projected
 * user count and can never be summed into a computed metric.
 */
export interface PilotSyntheticEvidence {
  readonly kind: "synthetic_projection";
  readonly generator: string;
  readonly projectedUsers: number;
  readonly note: string;
}

export type PilotSessionEvidence =
  | PilotExecutedEvidence
  | PilotAdoptionStateEvidence
  | PilotBrokerOutcomeEvidence
  | PilotDeepLinkTraversalEvidence
  | PilotSyntheticEvidence;

/** Classify session evidence: only `synthetic_projection` is synthetic. */
export function sessionEvidenceClass(evidence: PilotSessionEvidence): PilotEvidenceClass {
  return evidence.kind === "synthetic_projection" ? "synthetic" : "real";
}

/** A synthetic-only adoption projection (never a metric substitute). */
export interface PilotProjectedAdoption {
  readonly generator: string;
  readonly projectedUsers: number;
  readonly projectedCoverage: number;
  readonly note: string;
}

/* ------------------------------------------------------------------ */
/* Shell-broker outcome records (AISE-040 vocabulary, by value)         */
/* ------------------------------------------------------------------ */

/**
 * The connector-action kinds, carried VERBATIM from the AISE-040 shell's
 * frozen `CONNECTOR_ACTION_KINDS` (apps/web/src/shell/model.ts). Mirrored
 * BY VALUE with attribution because the workspace boundary matrix forbids
 * backend→apps imports: this is recorded-evidence vocabulary, not a second
 * canonical model — the shell owns the broker semantics.
 */
export const PILOT_CONNECTOR_ACTION_KINDS = Object.freeze([
  "export-derived",
  "import-entities",
  "import-documents",
  "open-record",
] as const satisfies readonly string[]);
export type PilotConnectorActionKind = (typeof PILOT_CONNECTOR_ACTION_KINDS)[number];

function isConnectorActionKind(value: unknown): value is PilotConnectorActionKind {
  return (
    typeof value === "string" &&
    (PILOT_CONNECTOR_ACTION_KINDS as readonly string[]).includes(value)
  );
}

/** The shell broker's tri-state decision kinds (AISE-040, verbatim). */
export const PILOT_BROKER_DECISIONS = Object.freeze(["allowed", "refused", "unavailable"] as const);
export type PilotBrokerDecision = (typeof PILOT_BROKER_DECISIONS)[number];

/**
 * The shell broker's unavailable reasons (AISE-040, verbatim): why a
 * decision is UNKNOWN (distinct from a refusal, which names its own code).
 */
export const PILOT_BROKER_UNAVAILABLE_REASONS = Object.freeze([
  "authorization-port-absent",
  "authorization-target-unknown",
] as const satisfies readonly string[]);
export type PilotBrokerUnavailableReason = (typeof PILOT_BROKER_UNAVAILABLE_REASONS)[number];

/**
 * One RECORDED shell-broker authorized-action outcome (the §040 tri-state
 * as evidence): the required permission (identity registry, verbatim), the
 * held permission that was paired (null unless the decision is `allowed`
 * — an unavailable or refused offer carries no grant), the identity
 * refusal code when refused, the honest unavailable reason when the
 * decision could not be formed, and the return-path address every offer
 * carries (the shell never strands the user).
 */
export interface PilotAuthorizedActionRecord {
  readonly actionId: string;
  readonly actionKind: PilotConnectorActionKind;
  readonly requiredPermission: Permission;
  /** The grant the broker paired (identity registry, verbatim); null unless allowed. */
  readonly heldPermission: Permission | null;
  readonly decision: PilotBrokerDecision;
  /** Present iff decision is refused (an AISE-036 authorization refusal code). */
  readonly refusalCode?: string;
  /** Present iff decision is unavailable (an AISE-040 unavailable reason). */
  readonly unavailableReason?: PilotBrokerUnavailableReason;
  /** The return-path AISE address (every offer carries one — AISE-040). */
  readonly returnToAddress: string;
  readonly occurredAt: string;
}

/* ------------------------------------------------------------------ */
/* Traversal records (deep links + return paths)                        */
/* ------------------------------------------------------------------ */

/**
 * One RECORDED shell traversal: an internal deep-link navigation
 * (aise→aise over an `aise-shell://` address) or an external round trip
 * (aise→incumbent, with `returnedViaReturnPath` recording whether the user
 * came back through the recorded return path — the R19 acceptance).
 */
export interface PilotTraversalRecord {
  readonly traversalId: string;
  readonly fromModule: "aise" | "incumbent";
  readonly toModule: "aise" | "incumbent";
  /** True iff an external trip returned via its return path; null otherwise. */
  readonly returnedViaReturnPath: boolean | null;
  /** The recorded address, verbatim (opaque — no second address codec here). */
  readonly address: string;
  readonly occurredAt: string;
}

/** An external round trip (outbound to an incumbent system). */
export function isExternalTrip(traversal: {
  readonly fromModule: string;
  readonly toModule: string;
}): boolean {
  return traversal.fromModule === "aise" && traversal.toModule === "incumbent";
}

/* ------------------------------------------------------------------ */
/* Audit-event records (identity vocabulary, verbatim)                  */
/* ------------------------------------------------------------------ */

/**
 * One RECORDED identity audit observation over a pilot session (the
 * AISE-036 audit vocabulary — append-only in the identity authority;
 * recorded here as session evidence only).
 */
export interface PilotAuditEventRecord {
  readonly action: AuditAction;
  readonly outcome: AuditOutcome;
  readonly detail: string | null;
  readonly occurredAt: string;
}

/* ------------------------------------------------------------------ */
/* The pilot session record                                             */
/* ------------------------------------------------------------------ */

/** One walk hop: outcome, RECORDED latency sample, and real record ids. */
export interface PilotSessionHop {
  readonly hopId: PilotWalkHopId;
  readonly outcome: "ok" | "failed" | "notApplicable";
  /** The executed pipeline hop this walk hop observed (null for traversals). */
  readonly sourceHopId: LabHopId | null;
  /** Recorded latency sample (ms); null iff not applicable / not observed. */
  readonly latencyMs: number | null;
  /** Real record ids (subset of the source hop's executed record ids). */
  readonly recordIds: readonly string[];
  readonly detail: string | null;
}

/**
 * One recorded pilot session: a principal's R19 walk over one project,
 * with the session's evidence bindings, recorded broker outcomes,
 * traversals and audit observations, plus first-class NOT_OBSERVED
 * dimensions.
 */
export interface PilotSessionRecord {
  readonly sessionId: string;
  readonly environmentId: string;
  readonly projectId: string;
  readonly principalId: string;
  readonly occurredAt: string;
  readonly walk: readonly PilotSessionHop[];
  readonly authorizedActions: readonly PilotAuthorizedActionRecord[];
  readonly traversals: readonly PilotTraversalRecord[];
  readonly auditEvents: readonly PilotAuditEventRecord[];
  readonly adoptionStateRefs: readonly string[];
  readonly evidence: readonly PilotSessionEvidence[];
  /** Session-level NOT_OBSERVED dimensions (unioned with the environment's). */
  readonly notObserved: readonly PilotDimension[];
}

/* ------------------------------------------------------------------ */
/* Campaign vocabularies (spec + result shapes)                         */
/* ------------------------------------------------------------------ */

/** One project of a pilot environment (bound to its executed scenario). */
export interface PilotProjectSpec {
  readonly projectId: string;
  /** The lab scenario this project executes (the real end-to-end slice). */
  readonly scenarioId: string;
  /** When true the project contributes NO executed run (synthetic-only). */
  readonly synthetic?: boolean;
}

/** One pilot environment: an ICP profile + its projects. */
export interface PilotEnvironmentSpec {
  readonly environmentId: string;
  readonly label: string;
  readonly icp: PilotIcpProfile;
  /** Environment-level NOT_OBSERVED dimensions (propagate to every session). */
  readonly notObservedDimensions?: readonly PilotDimension[];
  readonly projects: readonly PilotProjectSpec[];
}

/** One targeted incumbent workflow step (the adoption universe). */
export interface PilotTargetedStepRef {
  readonly workflowId: string;
  readonly stepId: string;
}

/** The context a session recorder receives (pure, per project). */
export interface PilotSessionContext {
  readonly environment: PilotEnvironmentSpec;
  readonly project: PilotProjectSpec;
  /** The campaign-executed run + its digest; null for synthetic projects. */
  readonly executed: { readonly run: LabScenarioRun; readonly runDigest: string } | null;
}

/** A deterministic session recorder (the testkit ships one). */
export type PilotSessionRecorder = (context: PilotSessionContext) => readonly PilotSessionRecord[];

/** The pilot campaign specification (pure data + the injected recorder). */
export interface PilotCampaignSpec {
  readonly campaignId: string;
  readonly environments: readonly PilotEnvironmentSpec[];
  readonly sessionRecorder: PilotSessionRecorder;
  readonly targetedWorkflowSteps: readonly PilotTargetedStepRef[];
  /** Adoption-module migration-state records (AISE-041 vocabulary). */
  readonly adoptionStates: readonly MigrationCandidate[];
  /** Synthetic-only projection, when recorded (never a metric substitute). */
  readonly projectedAdoption?: PilotProjectedAdoption;
}

/** Validate a migration state against the adoption vocabulary (verbatim). */
export function validateMigrationState(state: string): MigrationState {
  if (!(MIGRATION_STATES as readonly string[]).includes(state)) {
    throw new PilotError(
      "unknown_migration_state",
      `'${state}' is not an AISE-041 migration state (${MIGRATION_STATES.join(" | ")})`,
    );
  }
  return state as MigrationState;
}

/* ------------------------------------------------------------------ */
/* Gate vocabularies                                                    */
/* ------------------------------------------------------------------ */

/** The technical gate ids §039 names (performance / security / usability). */
export const PILOT_GATE_IDS = Object.freeze([
  "performance.hop_latency",
  "performance.latency_regression",
  "security.permission_coverage",
  "security.audit_coverage",
  "security.scope_minimality",
  "usability.broker_outcome_distribution",
  "usability.context_switch_distribution",
  "usability.return_path_integrity",
] as const satisfies readonly string[]);
export type PilotGateId = (typeof PILOT_GATE_IDS)[number];

function isGateId(value: unknown): value is PilotGateId {
  return typeof value === "string" && (PILOT_GATE_IDS as readonly string[]).includes(value);
}

/** A gate's honest status (UNKNOWN is first-class — never a silent PASS). */
export const PILOT_GATE_STATUSES = Object.freeze(["PASS", "FAIL", "UNKNOWN"] as const);
export type PilotGateStatus = (typeof PILOT_GATE_STATUSES)[number];

/** One typed gate violation (inspectable evidence, R17 discipline). */
export interface PilotGateViolation {
  readonly gateId: PilotGateId;
  readonly code: string;
  readonly critical: boolean;
  readonly projectId: string | null;
  readonly sessionId: string | null;
  readonly detail: string;
}

/** A first-class not-observed marker on a gate. */
export interface PilotNotObserved {
  readonly dimension: PilotDimension;
  readonly detail: string;
}

/** One per-project gate rollup row (every project visible — R17). */
export interface PilotGateProjectRollup {
  readonly projectId: string;
  readonly status: PilotGateStatus;
  readonly violationCount: number;
  readonly criticalViolationCount: number;
}

/** The uniform gate result shape every evaluator emits. */
export interface PilotGateResult {
  readonly gateId: PilotGateId;
  readonly status: PilotGateStatus;
  readonly critical: boolean;
  /** The versioned table this result was computed under. */
  readonly tableVersion: string;
  readonly violations: readonly PilotGateViolation[];
  readonly notObserved: PilotNotObserved | null;
  readonly perProject: readonly PilotGateProjectRollup[];
  /** Gate-specific inspectable evidence rows (labelled, typed values). */
  readonly evidence: readonly PilotEvidenceField[];
}

export interface PilotEvidenceField {
  readonly label: string;
  readonly value: string | number | boolean | null;
}

/* ------------------------------------------------------------------ */
/* Adoption-metric vocabulary                                           */
/* ------------------------------------------------------------------ */

/** The adoption metric ids (every one requires executed-record evidence). */
export const PILOT_ADOPTION_METRIC_IDS = Object.freeze([
  "primary_interface_adoption_rate",
  "authorized_action_success_rate",
  "return_path_completion_rate",
  "context_switches_per_session",
  "workflow_migration_coverage",
  "distinct_pilot_principals",
] as const satisfies readonly string[]);
export type PilotAdoptionMetricId = (typeof PILOT_ADOPTION_METRIC_IDS)[number];

function isMetricId(value: unknown): value is PilotAdoptionMetricId {
  return typeof value === "string" && (PILOT_ADOPTION_METRIC_IDS as readonly string[]).includes(value);
}

/** The typed unknown reasons (every failure mode DISTINCT). */
export const PILOT_METRIC_UNKNOWN_REASONS = Object.freeze([
  "synthetic_only_evidence",
  "insufficient_real_evidence",
  "dimension_not_observed",
  "no_adoption_state_records",
] as const satisfies readonly string[]);
export type PilotMetricUnknownReason = (typeof PILOT_METRIC_UNKNOWN_REASONS)[number];

/* ------------------------------------------------------------------ */
/* Boundary parser: the single validation path for session records      */
/* ------------------------------------------------------------------ */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isHex64(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function parseEvidence(value: unknown): PilotSessionEvidence {
  if (value === null || typeof value !== "object") {
    throw new PilotError("invalid_session_record", "session evidence entry is not an object");
  }
  const candidate = value as Partial<PilotSessionEvidence>;
  switch (candidate.kind) {
    case "executed_run": {
      const record = value as PilotExecutedEvidence;
      if (!isHex64(record.runDigest)) {
        throw new PilotError(
          "invalid_session_record",
          `executed_run evidence requires a 64-hex run digest (got '${String(record.runDigest)}')`,
        );
      }
      const hopRecordIds: Partial<Record<LabHopId, readonly string[]>> = {};
      for (const [hopId, ids] of Object.entries(record.hopRecordIds ?? {})) {
        if (!(LAB_HOP_IDS as readonly string[]).includes(hopId)) {
          throw new PilotError(
            "unknown_walk_hop",
            `executed_run evidence references unknown pipeline hop '${hopId}'`,
          );
        }
        if (!isStringArray(ids)) {
          throw new PilotError(
            "invalid_session_record",
            `executed_run evidence hop '${hopId}' record ids must be strings`,
          );
        }
        hopRecordIds[hopId as LabHopId] = ids;
      }
      return { kind: "executed_run", runDigest: record.runDigest, hopRecordIds };
    }
    case "adoption_state": {
      const record = value as PilotAdoptionStateEvidence;
      if (!isStringArray(record.candidateIds)) {
        throw new PilotError(
          "invalid_session_record",
          "adoption_state evidence requires a string array of candidate ids",
        );
      }
      return { kind: "adoption_state", candidateIds: record.candidateIds };
    }
    case "broker_outcome": {
      const record = value as PilotBrokerOutcomeEvidence;
      if (!isStringArray(record.actionIds)) {
        throw new PilotError(
          "invalid_session_record",
          "broker_outcome evidence requires a string array of action ids",
        );
      }
      return { kind: "broker_outcome", actionIds: record.actionIds };
    }
    case "deep_link_traversal": {
      const record = value as PilotDeepLinkTraversalEvidence;
      if (!isStringArray(record.traversalIds)) {
        throw new PilotError(
          "invalid_session_record",
          "deep_link_traversal evidence requires a string array of traversal ids",
        );
      }
      return { kind: "deep_link_traversal", traversalIds: record.traversalIds };
    }
    case "synthetic_projection": {
      const record = value as PilotSyntheticEvidence;
      if (
        !isNonEmptyString(record.generator) ||
        typeof record.projectedUsers !== "number" ||
        !isNonEmptyString(record.note)
      ) {
        throw new PilotError(
          "invalid_session_record",
          "synthetic_projection evidence requires generator, projectedUsers and note",
        );
      }
      return {
        kind: "synthetic_projection",
        generator: record.generator,
        projectedUsers: record.projectedUsers,
        note: record.note,
      };
    }
    default:
      throw new PilotError(
        "unknown_evidence_kind",
        `'${String(candidate.kind)}' is not a pilot evidence kind (${PILOT_EVIDENCE_KINDS.join(" | ")})`,
      );
  }
}

function parseAuthorizedAction(value: unknown): PilotAuthorizedActionRecord {
  if (value === null || typeof value !== "object") {
    throw new PilotError("invalid_session_record", "authorized action entry is not an object");
  }
  const record = value as Partial<PilotAuthorizedActionRecord>;
  if (!isNonEmptyString(record.actionId) || !isNonEmptyString(record.occurredAt)) {
    throw new PilotError(
      "invalid_session_record",
      "authorized action requires actionId and occurredAt",
    );
  }
  if (!isConnectorActionKind(record.actionKind)) {
    throw new PilotError(
      "unknown_connector_action_kind",
      `'${String(record.actionKind)}' is not an AISE-040 connector action kind (${PILOT_CONNECTOR_ACTION_KINDS.join(" | ")})`,
    );
  }
  if (!isPermission(record.requiredPermission)) {
    throw new PilotError(
      "unknown_permission",
      `'${String(record.requiredPermission)}' is not in the AISE-036 identity permission registry`,
    );
  }
  if (record.heldPermission !== null && record.heldPermission !== undefined) {
    if (!isPermission(record.heldPermission)) {
      throw new PilotError(
        "unknown_permission",
        `'${String(record.heldPermission)}' is not in the AISE-036 identity permission registry`,
      );
    }
  }
  if (!(PILOT_BROKER_DECISIONS as readonly string[]).includes(String(record.decision))) {
    throw new PilotError(
      "unknown_broker_decision",
      `'${String(record.decision)}' is not an AISE-040 broker decision (${PILOT_BROKER_DECISIONS.join(" | ")})`,
    );
  }
  const decision = record.decision as PilotBrokerDecision;
  const heldPermission =
    record.heldPermission === undefined || record.heldPermission === null
      ? null
      : record.heldPermission;
  if (decision === "allowed" && heldPermission === null) {
    throw new PilotError(
      "invalid_session_record",
      `allowed action '${record.actionId}' must carry the satisfying grant (heldPermission)`,
    );
  }
  if (decision !== "allowed" && heldPermission !== null) {
    throw new PilotError(
      "invalid_session_record",
      `${decision} action '${record.actionId}' carries no grant (heldPermission must be null)`,
    );
  }
  if (decision === "refused" && !isNonEmptyString(record.refusalCode)) {
    throw new PilotError(
      "invalid_session_record",
      `refused action '${record.actionId}' must name the AISE-036 refusal code`,
    );
  }
  if (
    decision === "unavailable" &&
    !(PILOT_BROKER_UNAVAILABLE_REASONS as readonly string[]).includes(
      String(record.unavailableReason),
    )
  ) {
    throw new PilotError(
      "unknown_broker_unavailable_reason",
      `unavailable action '${record.actionId}' requires an AISE-040 unavailable reason (${PILOT_BROKER_UNAVAILABLE_REASONS.join(" | ")})`,
    );
  }
  if (!isNonEmptyString(record.returnToAddress)) {
    throw new PilotError(
      "invalid_session_record",
      `action '${record.actionId}' must carry its return-path address (the AISE-040 no-stranding contract)`,
    );
  }
  return {
    actionId: record.actionId,
    actionKind: record.actionKind,
    requiredPermission: record.requiredPermission,
    heldPermission,
    decision,
    ...(record.refusalCode === undefined ? {} : { refusalCode: record.refusalCode }),
    ...(record.unavailableReason === undefined
      ? {}
      : { unavailableReason: record.unavailableReason }),
    returnToAddress: record.returnToAddress,
    occurredAt: record.occurredAt,
  };
}

function parseTraversal(value: unknown): PilotTraversalRecord {
  if (value === null || typeof value !== "object") {
    throw new PilotError("invalid_traversal_record", "traversal entry is not an object");
  }
  const record = value as Partial<PilotTraversalRecord>;
  const moduleValues = ["aise", "incumbent"] as const;
  for (const field of ["fromModule", "toModule"] as const) {
    const fieldValue = record[field];
    if (
      typeof fieldValue !== "string" ||
      !(moduleValues as readonly string[]).includes(fieldValue)
    ) {
      throw new PilotError(
        "invalid_traversal_record",
        `traversal '${String(record.traversalId)}' ${field} must be 'aise' or 'incumbent'`,
      );
    }
  }
  if (
    !isNonEmptyString(record.traversalId) ||
    !isNonEmptyString(record.address) ||
    !isNonEmptyString(record.occurredAt)
  ) {
    throw new PilotError(
      "invalid_traversal_record",
      "traversal requires traversalId, address and occurredAt",
    );
  }
  const external = record.fromModule === "aise" && record.toModule === "incumbent";
  if (external && typeof record.returnedViaReturnPath !== "boolean") {
    throw new PilotError(
      "invalid_traversal_record",
      `external trip '${record.traversalId}' must record returnedViaReturnPath (true|false)`,
    );
  }
  if (
    !external &&
    record.returnedViaReturnPath !== null &&
    record.returnedViaReturnPath !== undefined
  ) {
    throw new PilotError(
      "invalid_traversal_record",
      `non-external traversal '${record.traversalId}' must not carry returnedViaReturnPath`,
    );
  }
  return {
    traversalId: record.traversalId,
    fromModule: record.fromModule as "aise" | "incumbent",
    toModule: record.toModule as "aise" | "incumbent",
    returnedViaReturnPath:
      record.returnedViaReturnPath === undefined ? null : record.returnedViaReturnPath,
    address: record.address,
    occurredAt: record.occurredAt,
  };
}

function parseAuditEvent(value: unknown): PilotAuditEventRecord {
  if (value === null || typeof value !== "object") {
    throw new PilotError("invalid_session_record", "audit event entry is not an object");
  }
  const record = value as Partial<PilotAuditEventRecord>;
  if (!(AUDIT_ACTIONS as readonly string[]).includes(String(record.action))) {
    throw new PilotError(
      "unknown_audit_action",
      `'${String(record.action)}' is not in the AISE-036 audit action registry`,
    );
  }
  if (!(AUDIT_OUTCOMES as readonly string[]).includes(String(record.outcome))) {
    throw new PilotError(
      "unknown_audit_outcome",
      `'${String(record.outcome)}' is not an AISE-036 audit outcome (${AUDIT_OUTCOMES.join(" | ")})`,
    );
  }
  if (!isNonEmptyString(record.occurredAt)) {
    throw new PilotError("invalid_session_record", "audit event requires occurredAt");
  }
  return {
    action: record.action as AuditAction,
    outcome: record.outcome as AuditOutcome,
    detail: record.detail === undefined ? null : record.detail,
    occurredAt: record.occurredAt,
  };
}

function parseSessionHop(value: unknown): PilotSessionHop {
  if (value === null || typeof value !== "object") {
    throw new PilotError("invalid_session_record", "walk hop entry is not an object");
  }
  const record = value as Partial<PilotSessionHop>;
  if (!isWalkHop(record.hopId)) {
    throw new PilotError(
      "unknown_walk_hop",
      `'${String(record.hopId)}' is not a pilot walk hop (${PILOT_WALK_HOPS.join(" | ")})`,
    );
  }
  const outcomes = ["ok", "failed", "notApplicable"] as const;
  if (!outcomes.includes(record.outcome as (typeof outcomes)[number])) {
    throw new PilotError(
      "invalid_session_record",
      `walk hop '${String(record.hopId)}' outcome must be ok | failed | notApplicable`,
    );
  }
  if (record.sourceHopId !== null && record.sourceHopId !== undefined) {
    if (!(LAB_HOP_IDS as readonly string[]).includes(String(record.sourceHopId))) {
      throw new PilotError(
        "unknown_walk_hop",
        `walk hop '${String(record.hopId)}' sources unknown pipeline hop '${String(record.sourceHopId)}'`,
      );
    }
  }
  if (record.latencyMs !== null && record.latencyMs !== undefined) {
    if (
      typeof record.latencyMs !== "number" ||
      !Number.isFinite(record.latencyMs) ||
      record.latencyMs <= 0
    ) {
      throw new PilotError(
        "invalid_latency_sample",
        `walk hop '${String(record.hopId)}' latency sample must be a positive finite number of ms`,
      );
    }
  }
  if (!isStringArray(record.recordIds)) {
    throw new PilotError(
      "invalid_session_record",
      `walk hop '${String(record.hopId)}' record ids must be strings`,
    );
  }
  return {
    hopId: record.hopId,
    outcome: record.outcome as "ok" | "failed" | "notApplicable",
    sourceHopId: record.sourceHopId === undefined ? null : record.sourceHopId,
    latencyMs: record.latencyMs === undefined ? null : record.latencyMs,
    recordIds: record.recordIds,
    detail: record.detail === undefined || record.detail === null ? null : record.detail,
  };
}

/**
 * THE single validation path for a pilot session record (in-process ==
 * wire): strict structural + vocabulary validation with typed refusals.
 * Evidence BINDING (run digest / record-id containment) is validated at
 * campaign assembly, where the executed run is in hand.
 */
export function parsePilotSessionRecord(value: unknown): PilotSessionRecord {
  if (value === null || typeof value !== "object") {
    throw new PilotError("invalid_session_record", "session record is not an object");
  }
  const record = value as Partial<PilotSessionRecord>;
  for (const field of [
    "sessionId",
    "environmentId",
    "projectId",
    "principalId",
    "occurredAt",
  ] as const) {
    if (!isNonEmptyString(record[field])) {
      throw new PilotError(
        "invalid_session_record",
        `session field '${field}' must be a non-empty string`,
      );
    }
  }
  if (!Array.isArray(record.walk) || record.walk.length === 0) {
    throw new PilotError("invalid_session_record", "session walk must be a non-empty array of hops");
  }
  const seenHopIds = new Set<string>();
  const walk = record.walk.map((hop: unknown) => {
    const parsed = parseSessionHop(hop);
    if (seenHopIds.has(parsed.hopId)) {
      throw new PilotError(
        "invalid_session_record",
        `session '${String(record.sessionId)}' repeats walk hop '${parsed.hopId}'`,
      );
    }
    seenHopIds.add(parsed.hopId);
    return parsed;
  });
  if (!Array.isArray(record.authorizedActions)) {
    throw new PilotError("invalid_session_record", "session authorizedActions must be an array");
  }
  if (!Array.isArray(record.traversals)) {
    throw new PilotError("invalid_session_record", "session traversals must be an array");
  }
  if (!Array.isArray(record.auditEvents)) {
    throw new PilotError("invalid_session_record", "session auditEvents must be an array");
  }
  if (!isStringArray(record.adoptionStateRefs)) {
    throw new PilotError(
      "invalid_session_record",
      "session adoptionStateRefs must be a string array",
    );
  }
  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    throw new PilotError(
      "invalid_session_record",
      `session '${String(record.sessionId)}' carries no evidence — a session must declare its evidence kind`,
    );
  }
  const parsedEvidence = record.evidence.map(parseEvidence);
  const hasExecuted = parsedEvidence.some((entry) => entry.kind === "executed_run");
  const hasSynthetic = parsedEvidence.some((entry) => entry.kind === "synthetic_projection");
  if (hasSynthetic && parsedEvidence.length > 1) {
    throw new PilotError(
      "invalid_session_record",
      `session '${String(record.sessionId)}' mixes synthetic evidence with real evidence — a synthetic projection is exclusive`,
    );
  }
  if (hasExecuted) {
    const executed = parsedEvidence.find(
      (entry) => entry.kind === "executed_run",
    ) as PilotExecutedEvidence;
    for (const hop of walk) {
      if (hop.sourceHopId === null) {
        continue;
      }
      const allowed = executed.hopRecordIds[hop.sourceHopId] ?? [];
      for (const id of hop.recordIds) {
        if (!allowed.includes(id)) {
          throw new PilotError(
            "evidence_binding_mismatch",
            `walk hop '${hop.hopId}' references record '${id}' absent from the session's executed evidence for pipeline hop '${hop.sourceHopId}'`,
          );
        }
      }
    }
  }
  const notObserved = validateDimensions(
    record.notObserved ?? [],
    "unknown_dimension",
    `session '${String(record.sessionId)}'`,
  );
  return {
    sessionId: record.sessionId!,
    environmentId: record.environmentId!,
    projectId: record.projectId!,
    principalId: record.principalId!,
    occurredAt: record.occurredAt!,
    walk,
    authorizedActions: record.authorizedActions.map(parseAuthorizedAction),
    traversals: record.traversals.map(parseTraversal),
    auditEvents: record.auditEvents.map(parseAuditEvent),
    adoptionStateRefs: record.adoptionStateRefs,
    evidence: parsedEvidence,
    notObserved,
  };
}

/* ------------------------------------------------------------------ */
/* NOT_OBSERVED propagation helper                                      */
/* ------------------------------------------------------------------ */

/**
 * The dimensions a session did not observe: the environment's declared
 * NOT_OBSERVED dimensions UNION the session's own record (pure).
 */
export function sessionNotObservedOf(
  environment: PilotEnvironmentSpec,
  session: PilotSessionRecord,
): readonly PilotDimension[] {
  const merged = new Set<PilotDimension>([
    ...(environment.notObservedDimensions ?? []),
    ...session.notObserved,
  ]);
  return [...merged].sort();
}

/** Was `dimension` observed by this (environment, session) pair? */
export function dimensionObserved(
  environment: PilotEnvironmentSpec,
  session: PilotSessionRecord,
  dimension: PilotDimension,
): boolean {
  return !sessionNotObservedOf(environment, session).includes(dimension);
}

/* ------------------------------------------------------------------ */
/* Misc shared helpers                                                  */
/* ------------------------------------------------------------------ */

/** Content digest over canonical JSON (the pilot id discipline). */
export function pilotDigestOf(value: unknown): string {
  return sha256Hex(canonicalJsonStringify(value));
}

/** Content-derived id: `<prefix>-<first 16 hex of the digest>`. */
export function pilotIdOf(prefix: string, digest: string): string {
  return `${prefix}-${digest.slice(0, 16)}`;
}

/** Validate a gate id (typed refusal on unknown). */
export function validateGateId(value: string): PilotGateId {
  if (!isGateId(value)) {
    throw new PilotError(
      "unknown_gate_id",
      `'${value}' is not a pilot gate id (${PILOT_GATE_IDS.join(" | ")})`,
    );
  }
  return value;
}

/** Validate a metric id (typed refusal on unknown). */
export function validateMetricId(value: string): PilotAdoptionMetricId {
  if (!isMetricId(value)) {
    throw new PilotError(
      "unknown_metric_id",
      `'${value}' is not a pilot adoption metric id (${PILOT_ADOPTION_METRIC_IDS.join(" | ")})`,
    );
  }
  return value;
}

/** The identity permission registry, re-exported for gate consumers. */
export { PERMISSIONS as PILOT_IDENTITY_PERMISSIONS };
