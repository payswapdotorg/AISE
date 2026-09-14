/**
 * AISE-026 — Intervention scenario service (the policy engine).
 *
 * Contract (spec/work-orders.md §026; R11; architecture-lock "Authority"
 * #1/#6, "Intervention"):
 *
 *  - The service owns ALL intervention policy over the dumb store: baseline
 *    PINNING (a scenario records the authoritative reality GraphVersion it
 *    branches from and every state materializes from THAT version, even
 *    when newer reality versions exist), append-only steps/states (the
 *    history of applied steps is NEVER rewritten — no update/delete step
 *    exists), the governed status machine (approval requires a RECORDED
 *    Case-domain review reference; terminal scenarios are immutable) and
 *    deterministic materialization (layer N = layer N-1 + step N, through
 *    the SAME pure core a from-scratch replay uses, so incremental and
 *    replayed states agree byte-identically).
 *
 * PROPOSAL ISOLATION (documented loudly — this is the module's defining
 * constraint): the service NEVER receives a writable RealityStore. It
 * reads baseline snapshots ONLY through the injected READ-ONLY
 * `BaselineResolver` interface (or a caller-supplied in-process snapshot
 * at creation). There is NO code path from this module to reality-store
 * writes: the module never imports the reality store (asserted by the
 * import tripwire test), and the resolver interface exposes exactly one
 * READ method. Observed reality is never overwritten by a proposal — the
 * reality authority's bytes are not even reachable from here.
 *
 *  - After creation the service does not touch reality AT ALL: each step
 *    materializes from the LAST STORED STATE (which itself derives from
 *    the pinned baseline), so a scenario cannot drift onto a newer
 *    reality version by construction.
 *
 * Determinism: the service owns NO wall clock and NO randomness — the
 * clock is injected, step ids are content-derived (sha256 over
 * scenarioId + position + canonical step content, EXCLUDING the clock, so
 * the same step at the same position always derives the same id) and
 * state ids are content-derived (see model.deriveStateId). The same
 * operation sequence plus the same clock produces byte-identical files
 * in fresh stores.
 *
 * Single-writer discipline: read-modify-write per call; one service
 * instance per data dir (documented store assumption).
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type { GraphVersion } from "../reality/model";
import {
  InterventionError,
  isTerminalScenarioStatus,
  SCENARIO_TRANSITIONS,
  summarizeScenario,
  validateProjectId,
  validateScenarioId,
  validateBaselineVersionId,
  type AddStepInput,
  type ApprovalReferenceInput,
  type CreateScenarioInput,
  type InterventionScenario,
  type InterventionState,
  type InterventionStep,
  type ScenarioStatus,
  type ScenarioSummary,
} from "./model";
import { applyStep, overlayBaseline } from "./projection";
import type { InterventionStore } from "./store";

/**
 * READ-ONLY baseline resolution — the ONLY shape through which this
 * module can see the Reality Graph. Implementations must return the
 * materialized snapshot for (projectId, versionId) or null when unknown;
 * they must never be backed by anything that mutates reality. (The
 * default HTTP wiring in server.ts adapts the FsRealityStore by calling
 * its read method `getVersion` and nothing else.)
 */
export interface BaselineResolver {
  readonly resolveBaseline: (
    projectId: string,
    versionId: string,
  ) => Promise<GraphVersion | null>;
}

export interface InterventionServiceDeps {
  readonly store: InterventionStore;
  /** Sole source of every timestamp (determinism pin). */
  readonly clock: () => string;
  /** Read-only baseline resolution (see BaselineResolver). Optional only
   *  when every create call supplies an inline baseline snapshot. */
  readonly baselineResolver?: BaselineResolver;
}

/** Deterministic content-derived step id: `step-<16 hex>` (clock-free). */
function deriveStepId(scenarioId: string, stepIndex: number, input: AddStepInput): string {
  return `step-${sha256Hex(
    `${scenarioId}:${String(stepIndex)}:${canonicalJsonStringify({
      kind: input.kind,
      targetNodeId: input.targetNodeId,
      change: input.change,
      ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
      provenance: input.provenance,
    })}`,
  ).slice(0, 16)}`;
}

export class InterventionService {
  private readonly store: InterventionStore;
  private readonly clock: () => string;
  private readonly baselineResolver: BaselineResolver | undefined;

  constructor(deps: InterventionServiceDeps) {
    this.store = deps.store;
    this.clock = deps.clock;
    this.baselineResolver = deps.baselineResolver;
  }

  /* ------------------------------------------------------------ */
  /* Internal helpers                                              */
  /* ------------------------------------------------------------ */

  private async require(scenarioId: string): Promise<InterventionScenario> {
    validateScenarioId(scenarioId);
    const record = await this.store.get(scenarioId);
    if (record === null) {
      throw new InterventionError(
        "scenario_not_found",
        `scenario ${scenarioId} does not exist`,
      );
    }
    return record;
  }

  /** Terminal scenarios are immutable — further mutations refuse. */
  private requireMutable(record: InterventionScenario): void {
    if (isTerminalScenarioStatus(record.status)) {
      throw new InterventionError(
        "scenario_terminal",
        `scenario ${record.scenarioId} is ${record.status} — the scenario is immutable; ` +
          `supersede it with a new scenario instead`,
      );
    }
  }

  /**
   * Resolve the pinned baseline: caller-supplied inline snapshot first,
   * otherwise the injected READ-ONLY resolver. Typed refusal when neither
   * yields the pinned version.
   */
  private async resolvePinnedBaseline(
    input: CreateScenarioInput,
  ): Promise<GraphVersion> {
    const baseline =
      input.baseline !== undefined
        ? input.baseline
        : this.baselineResolver === undefined
          ? null
          : await this.baselineResolver.resolveBaseline(input.projectId, input.baselineVersionId);
    if (baseline === null) {
      throw new InterventionError(
        "baseline_not_found",
        `baseline ${input.baselineVersionId} of project ${input.projectId} could not be resolved ` +
          `(no inline snapshot supplied and the read-only resolver returned none)`,
      );
    }
    if (baseline.versionId !== input.baselineVersionId) {
      throw new InterventionError(
        "baseline_mismatch",
        `resolver returned version ${baseline.versionId} for pin ${input.baselineVersionId} ` +
          `— scenarios must pin and materialize from exactly one baseline version`,
      );
    }
    return baseline;
  }

  /* ------------------------------------------------------------ */
  /* Lifecycle                                                     */
  /* ------------------------------------------------------------ */

  /**
   * Create a scenario PINNED to an authoritative baseline version and
   * materialize layer 0 (the pure PROPOSED overlay of that baseline).
   * The baseline is READ (never written); duplicate ids refuse.
   */
  async createScenario(input: CreateScenarioInput): Promise<InterventionScenario> {
    validateScenarioId(input.scenarioId);
    validateProjectId(input.projectId);
    validateBaselineVersionId(input.baselineVersionId);
    const existing = await this.store.get(input.scenarioId);
    if (existing !== null) {
      throw new InterventionError("scenario_exists", `scenario ${input.scenarioId} already exists`);
    }
    const baseline = await this.resolvePinnedBaseline(input);
    const now = this.clock();
    const record: InterventionScenario = {
      scenarioId: input.scenarioId,
      projectId: input.projectId,
      title: input.title,
      baselineVersionId: input.baselineVersionId,
      createdAt: now,
      updatedAt: now,
      status: "draft",
      steps: [],
      states: [
        overlayBaseline({
          scenarioId: input.scenarioId,
          baselineVersionId: input.baselineVersionId,
          baseline,
          materializedAt: now,
        }),
      ],
      transitions: [{ status: "draft", at: now }],
    };
    await this.store.put(record);
    return record;
  }

  /**
   * Append ONE step and materialize the NEXT state immutably. The step is
   * validated (typed rejections: unknown node refs, missing provenance,
   * unit discipline, duplicate ids); the new layer derives from the LAST
   * STORED STATE — which itself derives from the PINNED baseline — so the
   * materialization can never drift onto a newer reality version. Prior
   * steps and states are never rewritten (append-only).
   */
  async addStep(
    scenarioId: string,
    input: AddStepInput,
  ): Promise<{ step: InterventionStep; state: InterventionState; record: InterventionScenario }> {
    const record = await this.require(scenarioId);
    this.requireMutable(record);
    const now = this.clock();
    const stepIndex = record.steps.length + 1;
    const stepId = deriveStepId(scenarioId, stepIndex, input);
    if (record.steps.some((step) => step.stepId === stepId)) {
      throw new InterventionError(
        "duplicate_step_id",
        `derived step id ${stepId} already exists on scenario ${scenarioId}`,
      );
    }
    const step: InterventionStep = {
      stepId,
      stepIndex,
      kind: input.kind,
      targetNodeId: input.targetNodeId,
      change: input.change,
      ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
      provenance: input.provenance,
      recordedAt: now,
    };
    const previous = record.states[record.states.length - 1];
    if (previous === undefined) {
      throw new InterventionError(
        "invalid_intervention_record",
        `scenario ${scenarioId} has no states — the record is corrupt`,
      );
    }
    // THE materialization: pure fold core over the last stored layer.
    const state = applyStep(previous, step, now);
    const updated: InterventionScenario = {
      ...record,
      steps: [...record.steps, step],
      states: [...record.states, state],
      updatedAt: now,
    };
    await this.store.put(updated);
    return { step, state, record: updated };
  }

  /** The stored record, or null when the scenario id is unknown. */
  async getScenario(scenarioId: string): Promise<InterventionScenario | null> {
    validateScenarioId(scenarioId);
    return this.store.get(scenarioId);
  }

  /** All stored scenarios as list projections (sorted by scenarioId). */
  async listScenarios(): Promise<readonly ScenarioSummary[]> {
    const records = await this.store.list();
    return records.map(summarizeScenario);
  }

  /**
   * One materialized state by layer index (0-based) or `"latest"`.
   * Unknown scenario → `scenario_not_found`; malformed/negative index →
   * `invalid_state_index`; out-of-range index → `state_not_found`.
   */
  async getState(
    scenarioId: string,
    selector: number | "latest",
  ): Promise<InterventionState> {
    const record = await this.require(scenarioId);
    if (selector !== "latest") {
      if (typeof selector !== "number" || !Number.isInteger(selector) || selector < 0) {
        throw new InterventionError(
          "invalid_state_index",
          `state index ${String(selector)} is not a non-negative integer`,
        );
      }
    }
    const index = selector === "latest" ? record.states.length - 1 : selector;
    const state = record.states[index];
    if (state === undefined) {
      throw new InterventionError(
        "state_not_found",
        `state ${selector === "latest" ? "latest" : String(selector)} does not exist on scenario ` +
          `${scenarioId} — available layers are 0..${String(record.states.length - 1)}`,
      );
    }
    return state;
  }

  /**
   * Record a Case-domain review outcome BY REFERENCE, verbatim — this
   * module is NOT an approval authority and never interprets the
   * reference. Exactly ONE reference can be recorded (re-recording is a
   * typed refusal); record it BEFORE transitioning to a terminal status.
   */
  async recordApprovalReference(
    scenarioId: string,
    input: ApprovalReferenceInput,
  ): Promise<InterventionScenario> {
    const record = await this.require(scenarioId);
    this.requireMutable(record);
    if (record.approvalReference !== undefined) {
      throw new InterventionError(
        "approval_reference_exists",
        `scenario ${scenarioId} already carries an approval reference ` +
          `(case ${record.approvalReference.caseId}) — references are recorded once, verbatim`,
      );
    }
    const now = this.clock();
    const updated: InterventionScenario = {
      ...record,
      approvalReference: {
        caseId: input.caseId,
        reviewDecision: input.reviewDecision,
        reviewedAt: input.reviewedAt,
      },
      updatedAt: now,
    };
    await this.store.put(updated);
    return updated;
  }

  /**
   * Governed status transition: draft → under_review → approved/rejected;
   * superseded reachable from draft/under_review. `approved` REQUIRES a
   * recorded approval reference (`approval_reference_required` — R12
   * approval gate; the reference itself is interpreted by nobody here).
   * Terminal statuses admit no transitions; every transition is appended
   * to the audit list.
   */
  async transitionStatus(
    scenarioId: string,
    target: ScenarioStatus,
  ): Promise<InterventionScenario> {
    const record = await this.require(scenarioId);
    if (!(target in SCENARIO_TRANSITIONS)) {
      throw new InterventionError(
        "invalid_status_transition",
        `unknown status "${String(target)}" — must be one of draft|under_review|approved|rejected|superseded`,
      );
    }
    const allowed = SCENARIO_TRANSITIONS[record.status];
    if (!allowed.includes(target)) {
      throw new InterventionError(
        "invalid_status_transition",
        isTerminalScenarioStatus(record.status)
          ? `scenario ${scenarioId} is ${record.status} (terminal) — no transitions out of terminal statuses`
          : `transition ${record.status} → ${target} is not allowed ` +
            `(allowed: ${allowed.length === 0 ? "none" : allowed.join("|")})`,
      );
    }
    if (target === "approved" && record.approvalReference === undefined) {
      throw new InterventionError(
        "approval_reference_required",
        `scenario ${scenarioId} cannot be approved without a recorded approval reference — ` +
          `record one (POST /:id/approval-reference) first; approval is a Case-domain review act`,
      );
    }
    const now = this.clock();
    const updated: InterventionScenario = {
      ...record,
      status: target,
      transitions: [...record.transitions, { status: target, at: now }],
      updatedAt: now,
    };
    await this.store.put(updated);
    return updated;
  }
}
