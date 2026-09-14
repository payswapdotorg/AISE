/**
 * AISE-026 — Intervention state projection (THE deterministic engine).
 *
 * Contract (spec/work-orders.md §026; spec/architecture-lock.md
 * "Intervention": "Proposed intervention states cannot mutate
 * authoritative existing reality. Every intervention state is
 * reproducible from scenario inputs and transformations."; R11 —
 * "layer N is a deterministic proposed state"):
 *
 * PURITY: `overlayBaseline`, `applyStep` and `materializeState` are PURE —
 * no wall clock, no randomness, no IO, no mutation of their inputs. The
 * clock enters ONLY as an injected `materializedAt` parameter (excluded
 * from the state id); the same baseline + the same ordered steps always
 * produce byte-identical states (canonical JSON), and re-materializing
 * the same step sequence is idempotent.
 *
 * THE EPISTEMIC OVERWRITE (documented loudly, per the work order): every
 * baseline node/property carried into an intervention state has its
 * epistemic status OVERWRITTEN to PROPOSED — a proposal is not an
 * observation, and the ENTIRE derived layer is proposed. This is a
 * PROJECTION onto a copy: the baseline GraphVersion (the reality
 * authority's record) is never mutated here — inputs are treated as
 * strictly read-only (deep-frozen inputs survive; see the tests). Untouched
 * baseline content is REFERENCED, not re-authored: it keeps its original
 * provenance VERBATIM, is marked `origin: "baseline"` and stays traceable
 * to the pinned `baselineVersionId`; content the scenario touches is
 * marked `baseline_touched`/`scenario` and carries the step ids that
 * touched it (the traceability hook AISE-028 consumes for quantity/cost
 * deltas).
 *
 * PROPOSED REMOVALS ARE TOMBSTONES: a `proposed_removal` step never
 * physically deletes anything. The node leaves the layer's live set, a
 * PROPOSED tombstone records the removal intent (reason verbatim, step
 * id, severed relationship ids), and the baseline node stays verbatim in
 * earlier states and in the reality authority. Relationships referencing
 * the removed node are severed from the live set and recorded on the
 * tombstone — the layer never carries a dangling reference.
 *
 * NOTES CHANGE NO CONTENT: a `note` step annotates a live node of the
 * evolving state but materializes no node/relationship/tombstone change —
 * the layer is re-identified (new stateIndex/stateId/appliedStepIds),
 * not re-authored. Notes are remarks, not model changes.
 *
 * Validation (typed rejections; the boundary parsers re-check the same
 * rules — defense in depth for library callers):
 *   - baseline snapshot versionId must equal the pinned baselineVersionId
 *     (`baseline_mismatch`);
 *   - steps must be numbered 1..n consecutively (`step_sequence_gap`) with
 *     unique ids (`duplicate_step_id`);
 *   - a step's targetNodeId must resolve in the EVOLVING live set
 *     (`unknown_node_ref`, naming the id — including targets removed by an
 *     earlier step); an element_addition target must NOT already exist,
 *     live or tombstoned (`duplicate_node_ref`);
 *   - every step carries provenance (`missing_provenance`) and numeric
 *     payloads carry typed units (`numeric_value_without_unit`).
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type { GraphVersion, ProvenanceRecord, Relationship } from "../reality/model";
import {
  deriveStateId,
  InterventionError,
  type InterventionState,
  type InterventionStateNode,
  type InterventionStateRelationship,
  type InterventionStep,
  type ProposedNode,
  type ProposedProperty,
  type ProposedTombstone,
  type StepPropertyPayload,
} from "./model";

/* ------------------------------------------------------------------ */
/* Ordering (code-unit order — matches canonical JSON key sorting)     */
/* ------------------------------------------------------------------ */

function byNodeId(a: InterventionStateNode, b: InterventionStateNode): number {
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
}

function byRelationshipId(a: InterventionStateRelationship, b: InterventionStateRelationship): number {
  return a.relationshipId < b.relationshipId
    ? -1
    : a.relationshipId > b.relationshipId
      ? 1
      : 0;
}

function byTombstoneNodeId(a: ProposedTombstone, b: ProposedTombstone): number {
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* Step provenance → reality provenance records (deterministic map)    */
/* ------------------------------------------------------------------ */

/**
 * Project a step's provenance into reality `ProvenanceRecord`s: evidence
 * ids become SUPPORTS records, the derivation note becomes a DERIVED_FROM
 * record — all stamped with the step's recordedAt. Deterministic order:
 * evidence ids in the step's order, then the derivation note.
 */
function stepProvenanceRecords(step: InterventionStep): readonly ProvenanceRecord[] {
  const records: ProvenanceRecord[] = [];
  for (const evidenceId of step.provenance.evidenceIds) {
    records.push({ role: "SUPPORTS", evidenceId, recordedAt: step.recordedAt });
  }
  if (step.provenance.derivationNote !== undefined) {
    records.push({
      role: "DERIVED_FROM",
      derivationNote: step.provenance.derivationNote,
      recordedAt: step.recordedAt,
    });
  }
  return records;
}

/** Validate a step payload's numeric-unit discipline (defense in depth). */
function assertPayloadUnit(payload: StepPropertyPayload, where: string): void {
  if (typeof payload.value === "number" && payload.unit === undefined) {
    throw new InterventionError(
      "numeric_value_without_unit",
      `${where}: numeric value ${String(payload.value)} requires a typed unit`,
    );
  }
  if (typeof payload.value !== "number" && payload.unit !== undefined) {
    throw new InterventionError("invalid_property", `${where}: non-numeric values carry no unit`);
  }
}

/** Validate a step's REQUIRED provenance (defense in depth). */
function assertStepProvenance(step: InterventionStep): void {
  const hasEvidence = step.provenance.evidenceIds.length > 0;
  const hasNote = step.provenance.derivationNote !== undefined;
  if (!hasEvidence && !hasNote) {
    throw new InterventionError(
      "missing_provenance",
      `step ${step.stepId} carries no provenance — a non-empty evidenceIds list and/or a derivationNote is required`,
    );
  }
}

function payloadToProposedProperty(
  payload: StepPropertyPayload,
  step: InterventionStep,
): ProposedProperty {
  assertPayloadUnit(payload, `step ${step.stepId} property "${payload.key}"`);
  return {
    key: payload.key,
    value: payload.value,
    ...(payload.unit === undefined ? {} : { unit: payload.unit }),
    // The ONLY representable status: the proposal layer is PROPOSED.
    epistemicStatus: "PROPOSED",
    provenance: stepProvenanceRecords(step),
  };
}

/* ------------------------------------------------------------------ */
/* Baseline overlay (layer 0)                                          */
/* ------------------------------------------------------------------ */

export interface OverlayBaselineInput {
  readonly scenarioId: string;
  /** The PINNED baseline version id. */
  readonly baselineVersionId: string;
  /** The baseline snapshot (treated as strictly read-only). */
  readonly baseline: GraphVersion;
  /** Injected clock; excluded from the state id. */
  readonly materializedAt: string;
}

/**
 * Layer 0: the baseline GraphVersion projected into a PROPOSED overlay.
 * Every node/property is COPIED with its epistemic status overwritten to
 * PROPOSED (original provenance preserved VERBATIM); relationships are
 * carried verbatim (they carry no epistemic status in the reality model).
 * Baseline observations and tombstones are NOT carried — they stay with
 * the reality authority, referenced through the pinned baselineVersionId.
 */
export function overlayBaseline(input: OverlayBaselineInput): InterventionState {
  if (input.baseline.versionId !== input.baselineVersionId) {
    throw new InterventionError(
      "baseline_mismatch",
      `baseline snapshot is ${input.baseline.versionId} but the scenario pins ` +
        `${input.baselineVersionId} — materialization must run against the pinned version`,
    );
  }
  const nodes: InterventionStateNode[] = input.baseline.nodes.map((node) => ({
    nodeId: node.nodeId,
    origin: "baseline",
    appliedStepIds: [],
    node: {
      nodeId: node.nodeId,
      kind: node.kind,
      // THE OVERWRITE: the entire derived layer is proposed.
      epistemicStatus: "PROPOSED",
      properties: node.properties.map((property) => ({
        key: property.key,
        value: property.value,
        ...(property.unit === undefined ? {} : { unit: property.unit }),
        epistemicStatus: "PROPOSED",
        provenance: property.provenance,
      })),
      ...(node.geometry === undefined ? {} : { geometry: node.geometry }),
      provenance: node.provenance,
      ...(node.units === undefined ? {} : { units: node.units }),
    } satisfies ProposedNode,
  }));
  const relationships: InterventionStateRelationship[] = input.baseline.relationships.map(
    (relationship) => ({
      relationshipId: relationship.relationshipId,
      origin: "baseline",
      relationship,
    }),
  );
  const identity = {
    scenarioId: input.scenarioId,
    stateIndex: 0,
    baselineVersionId: input.baselineVersionId,
    appliedStepIds: [] as readonly string[],
    nodes: nodes.sort(byNodeId),
    relationships: relationships.sort(byRelationshipId),
    proposedTombstones: [] as readonly ProposedTombstone[],
  };
  return { ...identity, stateId: deriveStateId(identity), materializedAt: input.materializedAt };
}

/* ------------------------------------------------------------------ */
/* Step application (the fold core)                                    */
/* ------------------------------------------------------------------ */

function liveNode(
  state: InterventionState,
  nodeId: string,
  step: InterventionStep,
): InterventionStateNode {
  const found = state.nodes.find((entry) => entry.nodeId === nodeId);
  if (found === undefined) {
    const tombstoned = state.proposedTombstones.find((stone) => stone.nodeId === nodeId);
    throw new InterventionError(
      "unknown_node_ref",
      tombstoned === undefined
        ? `step ${step.stepId} targets unknown node "${nodeId}" — not in the evolving state`
        : `step ${step.stepId} targets node "${nodeId}" which is already a PROPOSED tombstone ` +
          `(proposed by step ${tombstoned.proposedByStepId})`,
    );
  }
  return found;
}

function markTouched(
  entry: InterventionStateNode,
  step: InterventionStep,
): { origin: InterventionStateNode["origin"]; appliedStepIds: readonly string[] } {
  return {
    origin: entry.origin === "scenario" ? "scenario" : "baseline_touched",
    appliedStepIds: [...entry.appliedStepIds, step.stepId],
  };
}

/** Upsert one property (in-place replace; new keys append — deterministic). */
function upsertProperty(
  properties: readonly ProposedProperty[],
  payload: StepPropertyPayload,
  step: InterventionStep,
): ProposedProperty[] {
  const proposed = payloadToProposedProperty(payload, step);
  const next = properties.map((property) => (property.key === payload.key ? proposed : property));
  if (!properties.some((property) => property.key === payload.key)) {
    next.push(proposed);
  }
  return next;
}

/**
 * Apply ONE step onto a state, producing the NEXT layer. Pure: the input
 * state is never mutated (a new state object graph is built). Layer N is
 * applyStep(layer N-1, step N) — the same core `materializeState` folds,
 * so incremental materialization and from-scratch replay agree by
 * construction.
 */
export function applyStep(
  state: InterventionState,
  step: InterventionStep,
  materializedAt: string,
): InterventionState {
  assertStepProvenance(step);
  const change = step.change;

  if (change.kind === "note") {
    // A note annotates a live node but changes no model content: the
    // layer is re-identified, not re-authored.
    liveNode(state, step.targetNodeId, step);
    return nextIdentity(state, step, state.nodes, state.relationships, state.proposedTombstones, materializedAt);
  }

  if (change.kind === "proposed_removal") {
    // Existence check (throws unknown_node_ref naming the id, including
    // targets already proposed-tombstoned by an earlier step).
    liveNode(state, step.targetNodeId, step);
    const severedIds = state.relationships
      .filter(
        (rel) =>
          rel.relationship.fromNodeId === step.targetNodeId ||
          rel.relationship.toNodeId === step.targetNodeId,
      )
      .map((rel) => rel.relationshipId)
      .sort();
    const tombstone: ProposedTombstone = {
      nodeId: step.targetNodeId,
      reason: change.reason,
      proposedByStepId: step.stepId,
      severedRelationshipIds: severedIds,
    };
    const nodes = state.nodes.filter((entry_) => entry_.nodeId !== step.targetNodeId);
    const relationships = state.relationships.filter(
      (rel) =>
        rel.relationship.fromNodeId !== step.targetNodeId &&
        rel.relationship.toNodeId !== step.targetNodeId,
    );
    return nextIdentity(
      state,
      step,
      nodes,
      relationships,
      [...state.proposedTombstones, tombstone].sort(byTombstoneNodeId),
      materializedAt,
    );
  }

  if (change.kind === "property_change") {
    const entry = liveNode(state, step.targetNodeId, step);
    const touched = markTouched(entry, step);
    const nodes = state.nodes.map((candidate) =>
      candidate.nodeId === step.targetNodeId
        ? {
            nodeId: candidate.nodeId,
            origin: touched.origin,
            appliedStepIds: touched.appliedStepIds,
            node: {
              ...candidate.node,
              properties: upsertProperty(candidate.node.properties, change.property, step),
            },
          }
        : candidate,
    );
    return nextIdentity(state, step, nodes, state.relationships, state.proposedTombstones, materializedAt);
  }

  if (change.kind === "element_modification") {
    const entry = liveNode(state, step.targetNodeId, step);
    const touched = markTouched(entry, step);
    const hasGeometry = change.geometry !== undefined;
    const hasUnits = change.units !== undefined;
    const hasProperties = change.properties !== undefined && change.properties.length > 0;
    if (!hasGeometry && !hasUnits && !hasProperties) {
      throw new InterventionError(
        "invalid_step_payload",
        `step ${step.stepId}: element_modification requires at least one of geometry, units or properties`,
      );
    }
    const nodes = state.nodes.map((candidate) => {
      if (candidate.nodeId !== step.targetNodeId) {
        return candidate;
      }
      let properties = candidate.node.properties;
      if (change.properties !== undefined) {
        for (const payload of change.properties) {
          properties = upsertProperty(properties, payload, step);
        }
      }
      // A geometry or unit swap is a scenario act on the node itself: the
      // step's provenance is APPENDED to the node's provenance (originals
      // preserved verbatim — the audit chain grows, it never rewrites).
      const appendedProvenance = hasGeometry
        ? [...candidate.node.provenance, ...stepProvenanceRecords(step)]
        : candidate.node.provenance;
      return {
        nodeId: candidate.nodeId,
        origin: touched.origin,
        appliedStepIds: touched.appliedStepIds,
        node: {
          ...candidate.node,
          ...(hasGeometry ? { geometry: change.geometry } : {}),
          ...(hasUnits ? { units: change.units } : {}),
          properties,
          ...(hasGeometry ? { provenance: appendedProvenance } : {}),
        },
      };
    });
    return nextIdentity(state, step, nodes, state.relationships, state.proposedTombstones, materializedAt);
  }

  // change.kind === "element_addition"
  if (state.nodes.some((candidate) => candidate.nodeId === step.targetNodeId)) {
    throw new InterventionError(
      "duplicate_node_ref",
      `step ${step.stepId} adds node "${step.targetNodeId}" but that id is already live — ` +
        `modify the existing node instead (explicit step kinds, no silent upsert)`,
    );
  }
  if (state.proposedTombstones.some((stone) => stone.nodeId === step.targetNodeId)) {
    throw new InterventionError(
      "duplicate_node_ref",
      `step ${step.stepId} adds node "${step.targetNodeId}" but that id is already a PROPOSED ` +
        `tombstone — re-adding after a proposed removal is not supported`,
    );
  }
  if (change.parentNodeId !== undefined) {
    liveNode(state, change.parentNodeId, step);
  }
  const provenance = stepProvenanceRecords(step);
  if (provenance.length === 0) {
    // Unreachable after assertStepProvenance; kept as a fail-closed guard.
    throw new InterventionError(
      "missing_provenance",
      `step ${step.stepId} carries no provenance — additions require provenance`,
    );
  }
  const properties = change.node.properties.map((payload) =>
    payloadToProposedProperty(payload, step),
  );
  const authored: InterventionStateNode = {
    nodeId: step.targetNodeId,
    origin: "scenario",
    appliedStepIds: [step.stepId],
    node: {
      nodeId: step.targetNodeId,
      kind: change.node.kind,
      epistemicStatus: "PROPOSED",
      properties,
      ...(change.node.geometry === undefined ? {} : { geometry: change.node.geometry }),
      provenance,
      ...(change.node.units === undefined ? {} : { units: change.node.units }),
    },
  };
  const relationships: InterventionStateRelationship[] = [...state.relationships];
  if (change.parentNodeId !== undefined) {
    const relationshipId = `rel-${sha256Hex(
      `${state.scenarioId}:${step.stepId}:contains`,
    ).slice(0, 16)}`;
    const contains: Relationship = {
      relationshipId,
      fromNodeId: change.parentNodeId,
      toNodeId: step.targetNodeId,
      kind: "contains",
      provenance,
    };
    relationships.push({ relationshipId, origin: "scenario", relationship: contains });
  }
  return nextIdentity(
    state,
    step,
    [...state.nodes, authored],
    relationships,
    state.proposedTombstones,
    materializedAt,
  );
}

function nextIdentity(
  state: InterventionState,
  step: InterventionStep,
  nodes: readonly InterventionStateNode[],
  relationships: readonly InterventionStateRelationship[],
  proposedTombstones: readonly ProposedTombstone[],
  materializedAt: string,
): InterventionState {
  const identity = {
    scenarioId: state.scenarioId,
    stateIndex: state.stateIndex + 1,
    baselineVersionId: state.baselineVersionId,
    appliedStepIds: [...state.appliedStepIds, step.stepId],
    nodes: [...nodes].sort(byNodeId),
    relationships: [...relationships].sort(byRelationshipId),
    proposedTombstones: [...proposedTombstones].sort(byTombstoneNodeId),
  };
  return { ...identity, stateId: deriveStateId(identity), materializedAt };
}

/* ------------------------------------------------------------------ */
/* From-scratch materialization (reproducibility proof)                */
/* ------------------------------------------------------------------ */

export interface MaterializeStateInput {
  readonly scenarioId: string;
  /** The PINNED baseline version id. */
  readonly baselineVersionId: string;
  readonly baseline: GraphVersion;
  /** Steps 1..n in application order (validated: consecutive, unique). */
  readonly steps: readonly InterventionStep[];
  /** Injected clock; excluded from the state id. */
  readonly materializedAt: string;
}

/**
 * Materialize layer N from scratch: baseline + steps 1..N folded through
 * the SAME core (`overlayBaseline` → `applyStep` per step) the service
 * uses incrementally — so a replay from scenario inputs reproduces every
 * stored state byte-identically (lock: "Every intervention state is
 * reproducible from scenario inputs and transformations").
 */
export function materializeState(input: MaterializeStateInput): InterventionState {
  if (input.baseline.versionId !== input.baselineVersionId) {
    throw new InterventionError(
      "baseline_mismatch",
      `baseline snapshot is ${input.baseline.versionId} but the scenario pins ` +
        `${input.baselineVersionId} — materialization must run against the pinned version`,
    );
  }
  const seen = new Set<string>();
  input.steps.forEach((step, index) => {
    if (step.stepIndex !== index + 1) {
      throw new InterventionError(
        "step_sequence_gap",
        `step at position ${String(index + 1)} carries stepIndex ${String(step.stepIndex)} — ` +
          `steps must be numbered 1..${String(input.steps.length)} consecutively`,
      );
    }
    if (seen.has(step.stepId)) {
      throw new InterventionError(
        "duplicate_step_id",
        `step id ${step.stepId} appears more than once in the sequence`,
      );
    }
    seen.add(step.stepId);
  });
  let state = overlayBaseline({
    scenarioId: input.scenarioId,
    baselineVersionId: input.baselineVersionId,
    baseline: input.baseline,
    materializedAt: input.materializedAt,
  });
  for (const step of input.steps) {
    state = applyStep(state, step, input.materializedAt);
  }
  return state;
}

/* ------------------------------------------------------------------ */
/* Canonical serialization (byte-identical replay checks)              */
/* ------------------------------------------------------------------ */

/** Canonical JSON text of one state (determinism assertions in tests). */
export function canonicalStateText(state: InterventionState): string {
  return canonicalJsonStringify(state);
}
