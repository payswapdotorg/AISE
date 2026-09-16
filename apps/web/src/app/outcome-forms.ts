/**
 * PROD-010 — the OUTCOME-LOOP drafts of the product web shell's write path
 * (PURE LOGIC — no React, no fetch).
 *
 * The three write legs of the golden journey's outcome loop, each with its
 * draft validator (server contracts mirrored, defects NAMED before the
 * write) and its EXACT request-body assembly:
 *
 *  - ExecutionDraft  → POST /v1/executions (record the execution of an
 *    APPROVED intervention scenario state; state/evidence are 64-hex
 *    content addresses; executedAt is ISO-UTC-milliseconds; the executed
 *    steps are the scenario's REAL step ids — unknown refs are named);
 *  - OutcomeDraft    → POST /v1/executions/:id/outcomes (one OBSERVED
 *    post-work outcome: the case is FIXED to the execution's — a mismatch
 *    is named client-side, mirroring `outcome_case_mismatch`; evidence is
 *    REQUIRED, mirroring `outcome_without_evidence`; outcomes are ALWAYS
 *    OBSERVED — the body never carries an epistemicStatus);
 *  - ComparisonDraft → POST /v1/comparisons (the EXACT nested body:
 *    sourceOfRecord FIVE required fields + items[].properties REQUIRED
 *    possibly empty + optional tolerances/coverage OMITTED when absent),
 *    fed by line-based parsers (design items `id | target | label |
 *    key = value unit`; tolerances; coverage annotations with the frozen
 *    UNKNOWN|NOT_OBSERVED|OCCLUDED vocabulary).
 *
 * Permissions (documented honestly): the frozen AISE-036 vocabulary has no
 * `execution:`/`comparison:` permissions — the execution/outcome loop rides
 * `intervention:write` and the comparison run rides `boq:write`, per the
 * deployment's wiring decision. The brokered descriptors reuse round-1's
 * create-forms helpers (exported there, never forked).
 *
 * Determinism: pure functions of their inputs; no clock, no randomness,
 * no IO. `actor`/`observedAt` ride the wire UNPARSED (the probe contract —
 * the current core parse does not persist them; a backend decision).
 */

import type { ConnectorActionDescriptor } from "../shell";
import {
  createRecordAction,
  idListFromField,
  parseStepPropertyLines,
  type StepPropertyDraft,
} from "./create-forms";

// Re-exported for the outcome-loop panels (round 1's machinery, not forked).
export { createRecordAction, resolveCreateActionOffer } from "./create-forms";
export type {
  CreateActionOffer,
  CreateActionOfferState,
  CreateActionQuestion,
} from "./create-forms";
export type { ConnectorActionDescriptor } from "../shell";

/** The record-execution action (intervention:write — documented honestly). */
export function recordExecutionAction(): ConnectorActionDescriptor {
  return createRecordAction({
    actionId: "record-execution",
    label: "Record execution",
    permission: "intervention:write",
    sourceModule: "case",
  });
}

/** The record-outcome action (intervention:write — documented honestly). */
export function recordOutcomeAction(): ConnectorActionDescriptor {
  return createRecordAction({
    actionId: "record-outcome",
    label: "Record OBSERVED outcome",
    permission: "intervention:write",
    sourceModule: "case",
  });
}

/** The run-comparison action (boq:write — documented honestly). */
export function runComparisonAction(): ConnectorActionDescriptor {
  return createRecordAction({
    actionId: "run-comparison",
    label: "Run reality-vs-design comparison",
    permission: "boq:write",
    sourceModule: "boq",
  });
}

/* ------------------------------------------------------------------ */
/* Shared vocabulary mirrors                                            */
/* ------------------------------------------------------------------ */

const CONTENT_ID = /^[0-9a-f]{64}$/;
const ISO_UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

/** The frozen capture-coverage annotation vocabulary (AISE-033/026 seam). */
export const COVERAGE_OBSERVATION_STATUSES = Object.freeze([
  "UNKNOWN",
  "NOT_OBSERVED",
  "OCCLUDED",
] as const);
export type CoverageObservationStatus = (typeof COVERAGE_OBSERVATION_STATUSES)[number];

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function boundedId(value: string | undefined, field: string, defects: string[]): void {
  if (!nonEmpty(value)) {
    defects.push(`${field} must be a non-empty string`);
  } else if (value.length > 256) {
    defects.push(`${field} must be 1..256 characters`);
  }
}

function contentIdList(
  ids: readonly string[] | undefined,
  field: string,
  defects: string[],
): void {
  if (!Array.isArray(ids)) {
    defects.push(`${field} must be an array`);
    return;
  }
  if (!ids.every((id) => typeof id === "string" && CONTENT_ID.test(id))) {
    defects.push(`${field} entries must be 64-hex content addresses`);
  }
}

/* ------------------------------------------------------------------ */
/* ExecutionDraft                                                       */
/* ------------------------------------------------------------------ */

/** One execution draft (scenario/state context comes from the viewed layer). */
export interface ExecutionDraft {
  readonly executionRecordId: string;
  readonly caseId: string;
  readonly scenarioId: string;
  /** The materialized intervention state's 64-hex content id. */
  readonly stateId: string;
  /** The scenario's REAL step ids (picked, never hand-invented). */
  readonly executedStepIds: readonly string[];
  /** REQUIRED non-empty: 64-hex evidence content addresses. */
  readonly evidenceIds: readonly string[];
  readonly captureSessionIds?: readonly string[];
  /** ISO-8601 UTC, millisecond precision. */
  readonly executedAt: string;
  /** Rides the wire unparsed (the probe contract). */
  readonly actor?: string;
}

/**
 * The step refs the draft selects that the scenario does NOT carry —
 * named BEFORE the write (mirroring the server's `unknown_step_ref`).
 */
export function unknownStepRefs(
  availableStepIds: readonly string[],
  selectedStepIds: readonly string[],
): readonly string[] {
  const known = new Set(availableStepIds);
  return selectedStepIds.filter((stepId) => !known.has(stepId));
}

/**
 * Validate an execution draft against the execution contract: 64-hex
 * state/evidence, ISO-UTC-ms executedAt, REQUIRED non-empty steps
 * (`execution_without_steps` mirrored), optional capture ids and actor.
 */
export function validateExecutionDraft(draft: ExecutionDraft): readonly string[] {
  const defects: string[] = [];
  boundedId(draft.executionRecordId, "executionRecordId", defects);
  boundedId(draft.caseId, "caseId", defects);
  boundedId(draft.scenarioId, "scenarioId", defects);
  if (!nonEmpty(draft.stateId)) {
    defects.push("stateId must be the 64-hex content id of a materialized state");
  } else if (!CONTENT_ID.test(draft.stateId)) {
    defects.push("stateId must be the 64-hex content id of a materialized state");
  }
  if (!Array.isArray(draft.executedStepIds) || draft.executedStepIds.length === 0) {
    defects.push(
      "executedStepIds is required and must be non-empty — an execution must name the steps it executes",
    );
  } else if (!draft.executedStepIds.every((id) => nonEmpty(id))) {
    defects.push("executedStepIds entries must be non-empty strings");
  }
  if (!Array.isArray(draft.evidenceIds) || draft.evidenceIds.length === 0) {
    defects.push("evidenceIds must be a NON-EMPTY array of evidence content ids");
  } else {
    contentIdList(draft.evidenceIds, "evidenceIds", defects);
  }
  if (draft.captureSessionIds !== undefined) {
    if (!draft.captureSessionIds.every((id) => nonEmpty(id))) {
      defects.push("captureSessionIds entries must be non-empty strings");
    }
  }
  if (!nonEmpty(draft.executedAt)) {
    defects.push("executedAt must be an ISO-8601 UTC timestamp (milliseconds)");
  } else if (!ISO_UTC_MS.test(draft.executedAt)) {
    defects.push("executedAt must be an ISO-8601 UTC timestamp (milliseconds)");
  }
  if (draft.actor !== undefined && !nonEmpty(draft.actor)) {
    defects.push("actor must be a non-empty id when provided");
  }
  return defects;
}

/** The exact POST /v1/executions wire body (optionals omitted when absent). */
export interface RecordExecutionRequestBody {
  readonly executionRecordId: string;
  readonly caseId: string;
  readonly scenarioId: string;
  readonly stateId: string;
  readonly executedStepIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly captureSessionIds?: readonly string[];
  readonly executedAt: string;
  readonly actor?: string;
}

/** Assemble the exact POST /v1/executions body from a VALID draft. */
export function recordExecutionRequestBody(draft: ExecutionDraft): RecordExecutionRequestBody {
  return {
    executionRecordId: draft.executionRecordId,
    caseId: draft.caseId,
    scenarioId: draft.scenarioId,
    stateId: draft.stateId,
    executedStepIds: [...draft.executedStepIds],
    evidenceIds: [...draft.evidenceIds],
    ...(draft.captureSessionIds !== undefined && draft.captureSessionIds.length > 0
      ? { captureSessionIds: [...draft.captureSessionIds] }
      : {}),
    executedAt: draft.executedAt,
    ...(nonEmpty(draft.actor) ? { actor: draft.actor } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* OutcomeDraft                                                         */
/* ------------------------------------------------------------------ */

/**
 * One OBSERVED post-work outcome draft. The case is FIXED to the
 * execution's — pass the execution's caseId to
 * {@link validateOutcomeDraft} and a mismatch is NAMED client-side
 * (mirroring the server's `outcome_case_mismatch`). Evidence is REQUIRED
 * (`outcome_without_evidence`); the body NEVER carries an epistemicStatus
 * (outcomes are always OBSERVED — record an interpretation on the case).
 */
export interface OutcomeDraft {
  readonly caseId: string;
  readonly statement: string;
  readonly evidenceIds: readonly string[];
  readonly captureSessionIds?: readonly string[];
  readonly measurementRefs?: readonly string[];
  /** Rides the wire unparsed (ISO-UTC-ms when present). */
  readonly observedAt?: string;
  /** Rides the wire unparsed. */
  readonly actor?: string;
}

/** Validate an outcome draft (case fixed to the execution's when known). */
export function validateOutcomeDraft(
  draft: OutcomeDraft,
  executionCaseId?: string,
): readonly string[] {
  const defects: string[] = [];
  boundedId(draft.caseId, "caseId", defects);
  if (executionCaseId !== undefined && draft.caseId !== executionCaseId) {
    defects.push(
      `outcome_case_mismatch: the outcome's case ${draft.caseId} must equal the execution's case ${executionCaseId}`,
    );
  }
  if (!nonEmpty(draft.statement)) {
    defects.push("statement must be a non-empty string");
  }
  if (!Array.isArray(draft.evidenceIds) || draft.evidenceIds.length === 0) {
    defects.push("evidenceIds must be a NON-EMPTY array of evidence content ids");
  } else {
    contentIdList(draft.evidenceIds, "evidenceIds", defects);
  }
  for (const [field, ids] of [
    ["captureSessionIds", draft.captureSessionIds],
    ["measurementRefs", draft.measurementRefs],
  ] as const) {
    if (ids !== undefined && !ids.every((id) => nonEmpty(id))) {
      defects.push(`${field} entries must be non-empty strings`);
    }
  }
  if (draft.observedAt !== undefined) {
    if (!nonEmpty(draft.observedAt) || !ISO_UTC_MS.test(draft.observedAt)) {
      defects.push("observedAt must be an ISO-8601 UTC timestamp (milliseconds)");
    }
  }
  if (draft.actor !== undefined && !nonEmpty(draft.actor)) {
    defects.push("actor must be a non-empty id when provided");
  }
  return defects;
}

/** The exact POST /v1/executions/:id/outcomes wire body. */
export interface RecordOutcomeRequestBody {
  readonly caseId: string;
  readonly statement: string;
  readonly evidenceIds: readonly string[];
  readonly captureSessionIds?: readonly string[];
  readonly measurementRefs?: readonly string[];
  readonly observedAt?: string;
  readonly actor?: string;
}

/** Assemble the exact outcome body from a VALID draft (never an epistemicStatus). */
export function recordOutcomeRequestBody(draft: OutcomeDraft): RecordOutcomeRequestBody {
  return {
    caseId: draft.caseId,
    statement: draft.statement,
    evidenceIds: [...draft.evidenceIds],
    ...(draft.captureSessionIds !== undefined && draft.captureSessionIds.length > 0
      ? { captureSessionIds: [...draft.captureSessionIds] }
      : {}),
    ...(draft.measurementRefs !== undefined && draft.measurementRefs.length > 0
      ? { measurementRefs: [...draft.measurementRefs] }
      : {}),
    ...(nonEmpty(draft.observedAt) ? { observedAt: draft.observedAt } : {}),
    ...(nonEmpty(draft.actor) ? { actor: draft.actor } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Line-based parsers (design items, tolerances, coverage)              */
/* ------------------------------------------------------------------ */

/** One design item as it rides the comparison wire. */
export interface DesignItemWire {
  readonly designItemId: string;
  readonly label?: string;
  readonly targetNodeId?: string;
  readonly properties: readonly {
    readonly key: string;
    readonly value: string | number | boolean;
    readonly unit?: string;
  }[];
}

/**
 * Parse design-item lines — `id | target | label | key = value unit` — into
 * wire items. Extra pipe segments carry additional property lines
 * (`id | target | label | k = 1 mm | k2 = red`); an EMPTY target segment
 * (or `-`) leaves targetNodeId absent (the honest `unmapped_design_item`
 * omission is the server's); the typed-unit rule applies (numeric values
 * REQUIRE a unit — a lone number is a NAMED defect); duplicate item ids
 * are named (mirroring `duplicate_design_item`); properties may be EMPTY
 * (object-level comparison).
 */
export function parseDesignItemLines(
  lines: string,
): { readonly ok: true; readonly items: readonly DesignItemWire[] } | { readonly ok: false; readonly defects: readonly string[] } {
  const items: DesignItemWire[] = [];
  const defects: string[] = [];
  const seenIds = new Set<string>();
  const rows = lines.split("\n");
  for (let index = 0; index < rows.length; index += 1) {
    const line = (rows[index] ?? "").trim();
    if (line.length === 0) {
      continue;
    }
    const where = `line ${String(index + 1)}`;
    const segments = line.split("|");
    if (segments.length < 4) {
      // The properties separator is REQUIRED (the wire item's properties
      // field is required, possibly empty — the trailing pipe is the
      // explicit empty declaration; a bare 3-segment line is a shape defect).
      defects.push(`${where}: expected "id | target | label | key = value unit"`);
      continue;
    }
    const designItemId = (segments[0] ?? "").trim();
    if (designItemId.length === 0 || designItemId.length > 256) {
      defects.push(`${where}: designItemId must be 1..256 characters`);
      continue;
    }
    if (seenIds.has(designItemId)) {
      defects.push(`${where}: duplicate design item id "${designItemId}"`);
      continue;
    }
    seenIds.add(designItemId);
    const target = (segments[1] ?? "").trim();
    const label = (segments[2] ?? "").trim();
    const parsed = parseStepPropertyLines(segments.slice(3).join("\n"));
    const properties: readonly StepPropertyDraft[] = parsed.ok ? parsed.properties : [];
    if (!parsed.ok) {
      defects.push(
        ...parsed.defects.map((defect) =>
          `${where}: ${defect.replace(/^line \d+: /, "property: ")}`,
        ),
      );
      continue;
    }
    const seenKeys = new Set<string>();
    for (const property of properties) {
      if (seenKeys.has(property.key)) {
        defects.push(`${where}: duplicate property key "${property.key}"`);
      }
      seenKeys.add(property.key);
    }
    items.push({
      designItemId,
      ...(label.length > 0 ? { label } : {}),
      ...(target.length > 0 && target !== "-" ? { targetNodeId: target } : {}),
      properties: properties.map((property) => ({
        key: property.key,
        value: property.value,
        ...(property.unit === undefined ? {} : { unit: property.unit }),
      })),
    });
  }
  if (items.length === 0 && defects.length === 0) {
    defects.push("designReference.items must be a NON-EMPTY array — no items carry no scope");
  }
  return defects.length === 0 ? { ok: true, items } : { ok: false, defects };
}

/** The tolerances as they ride the comparison wire. */
export interface TolerancesWire {
  readonly byKey: Readonly<Record<string, number>>;
  readonly default: number | null;
}

/**
 * Parse tolerance lines — `key = 5` (absolute, in the property's unit), the
 * reserved key `default` setting the default tolerance. Negative or
 * non-finite values and duplicate keys are NAMED defects.
 */
export function parseToleranceLines(
  lines: string,
): { readonly ok: true; readonly tolerances: TolerancesWire } | { readonly ok: false; readonly defects: readonly string[] } {
  const byKey: Record<string, number> = {};
  let defaultTolerance: number | null = null;
  const defects: string[] = [];
  const seen = new Set<string>();
  const rows = lines.split("\n");
  for (let index = 0; index < rows.length; index += 1) {
    const line = (rows[index] ?? "").trim();
    if (line.length === 0) {
      continue;
    }
    const where = `line ${String(index + 1)}`;
    const equals = line.indexOf("=");
    if (equals < 0) {
      defects.push(`${where}: expected "key = tolerance"`);
      continue;
    }
    const key = line.slice(0, equals).trim();
    if (key.length === 0 || key.length > 256) {
      defects.push(`${where}: tolerance key must be 1..256 characters`);
      continue;
    }
    if (seen.has(key)) {
      defects.push(`${where}: duplicate tolerance key "${key}"`);
      continue;
    }
    seen.add(key);
    const raw = line.slice(equals + 1).trim();
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      defects.push(`${where}: tolerance for "${key}" must be a finite number >= 0`);
      continue;
    }
    if (key === "default") {
      defaultTolerance = value;
    } else {
      byKey[key] = value;
    }
  }
  return defects.length === 0 ? { ok: true, tolerances: { byKey, default: defaultTolerance } } : { ok: false, defects };
}

/** One coverage annotation as it rides the comparison wire. */
export interface CoverageAnnotationWire {
  readonly targetNodeId: string;
  readonly observationStatus: CoverageObservationStatus;
  readonly evidenceIds: readonly string[];
}

/**
 * Parse coverage-annotation lines — `targetNodeId STATUS evidenceId` (the
 * evidence ids comma-separated; at least one REQUIRED, mirroring
 * `coverage_without_evidence`; all 64-hex; duplicates named) — with the
 * frozen UNKNOWN|NOT_OBSERVED|OCCLUDED vocabulary carried VERBATIM.
 */
export function parseCoverageLines(
  lines: string,
): { readonly ok: true; readonly coverage: readonly CoverageAnnotationWire[] } | { readonly ok: false; readonly defects: readonly string[] } {
  const coverage: CoverageAnnotationWire[] = [];
  const defects: string[] = [];
  const seenTargets = new Set<string>();
  const rows = lines.split("\n");
  for (let index = 0; index < rows.length; index += 1) {
    const line = (rows[index] ?? "").trim();
    if (line.length === 0) {
      continue;
    }
    const where = `line ${String(index + 1)}`;
    const tokens = line.split(/\s+/);
    const targetNodeId = tokens[0] ?? "";
    if (targetNodeId.length === 0 || targetNodeId.length > 256) {
      defects.push(`${where}: coverage targetNodeId must be 1..256 characters`);
      continue;
    }
    if (seenTargets.has(targetNodeId)) {
      defects.push(`${where}: duplicate coverage annotation for target ${targetNodeId}`);
      continue;
    }
    seenTargets.add(targetNodeId);
    const status = tokens[1] ?? "";
    if (!(COVERAGE_OBSERVATION_STATUSES as readonly string[]).includes(status)) {
      defects.push(
        `${where}: observationStatus must be one of ${COVERAGE_OBSERVATION_STATUSES.join("|")}`,
      );
      continue;
    }
    const evidenceIds = idListFromField(tokens.slice(2).join(","));
    if (evidenceIds.length === 0) {
      defects.push(
        `${where}: coverage annotation for ${targetNodeId} requires a NON-EMPTY evidence list`,
      );
      continue;
    }
    if (!evidenceIds.every((id) => CONTENT_ID.test(id))) {
      defects.push(`${where}: coverage evidence ids must be 64-hex content addresses`);
      continue;
    }
    coverage.push({
      targetNodeId,
      observationStatus: status as CoverageObservationStatus,
      evidenceIds,
    });
  }
  return defects.length === 0 ? { ok: true, coverage } : { ok: false, defects };
}

/* ------------------------------------------------------------------ */
/* ComparisonDraft                                                      */
/* ------------------------------------------------------------------ */

/** One reality-vs-design comparison draft (line-based inputs). */
export interface ComparisonDraft {
  readonly comparisonId: string;
  readonly projectId: string;
  readonly versionId: string;
  readonly designTitle?: string;
  /** sourceOfRecord — the FIVE required fields, verbatim incumbent identity. */
  readonly systemClass: string;
  readonly systemInstanceId: string;
  readonly sourceRecordId: string;
  readonly revision: string;
  readonly retrievedAt: string;
  readonly designItemLines: string;
  readonly toleranceLines?: string;
  readonly coverageLines?: string;
}

/** Validate a comparison draft (five fields + items + optional sections). */
export function validateComparisonDraft(draft: ComparisonDraft): readonly string[] {
  const defects: string[] = [];
  boundedId(draft.comparisonId, "comparisonId", defects);
  boundedId(draft.projectId, "realityRef.projectId", defects);
  boundedId(draft.versionId, "realityRef.versionId", defects);
  if (nonEmpty(draft.designTitle) && (draft.designTitle ?? "").length > 256) {
    defects.push("designReference.title must be 1..256 characters");
  }
  boundedId(draft.systemClass, "sourceOfRecord.systemClass", defects);
  if (nonEmpty(draft.systemClass) && draft.systemClass.length > 64) {
    defects.push("sourceOfRecord.systemClass must be <= 64 characters");
  }
  boundedId(draft.systemInstanceId, "sourceOfRecord.systemInstanceId", defects);
  boundedId(draft.sourceRecordId, "sourceOfRecord.sourceRecordId", defects);
  boundedId(draft.revision, "sourceOfRecord.revision", defects);
  if (!nonEmpty(draft.retrievedAt)) {
    defects.push("sourceOfRecord.retrievedAt must be an ISO-8601 UTC timestamp (milliseconds)");
  } else if (!ISO_UTC_MS.test(draft.retrievedAt)) {
    defects.push("sourceOfRecord.retrievedAt must be an ISO-8601 UTC timestamp (milliseconds)");
  }
  const items = parseDesignItemLines(draft.designItemLines);
  if (!items.ok) {
    defects.push(...items.defects);
  }
  if (nonEmpty(draft.toleranceLines)) {
    const tolerances = parseToleranceLines(draft.toleranceLines ?? "");
    if (!tolerances.ok) {
      defects.push(...tolerances.defects);
    }
  }
  if (nonEmpty(draft.coverageLines)) {
    const coverage = parseCoverageLines(draft.coverageLines ?? "");
    if (!coverage.ok) {
      defects.push(...coverage.defects);
    }
  }
  return defects;
}

/** The exact POST /v1/comparisons wire body (nested; optionals omitted). */
export interface RunComparisonRequestBody {
  readonly comparisonId: string;
  readonly realityRef: { readonly projectId: string; readonly versionId: string };
  readonly designReference: {
    readonly title?: string;
    readonly sourceOfRecord: {
      readonly systemClass: string;
      readonly systemInstanceId: string;
      readonly sourceRecordId: string;
      readonly revision: string;
      readonly retrievedAt: string;
    };
    readonly items: readonly DesignItemWire[];
  };
  readonly tolerances?: TolerancesWire;
  readonly coverage?: readonly CoverageAnnotationWire[];
}

/**
 * Assemble the EXACT nested POST /v1/comparisons body from a VALID draft:
 * tolerances/coverage are OMITTED when their lines are absent; the five
 * sourceOfRecord fields and items[].properties always ride.
 */
export function runComparisonRequestBody(draft: ComparisonDraft): RunComparisonRequestBody {
  const items = parseDesignItemLines(draft.designItemLines);
  const parsedItems = items.ok ? items.items : [];
  const tolerances = nonEmpty(draft.toleranceLines)
    ? parseToleranceLines(draft.toleranceLines ?? "")
    : undefined;
  const coverage = nonEmpty(draft.coverageLines)
    ? parseCoverageLines(draft.coverageLines ?? "")
    : undefined;
  return {
    comparisonId: draft.comparisonId,
    realityRef: { projectId: draft.projectId, versionId: draft.versionId },
    designReference: {
      ...(nonEmpty(draft.designTitle) ? { title: draft.designTitle } : {}),
      sourceOfRecord: {
        systemClass: draft.systemClass,
        systemInstanceId: draft.systemInstanceId,
        sourceRecordId: draft.sourceRecordId,
        revision: draft.revision,
        retrievedAt: draft.retrievedAt,
      },
      items: parsedItems,
    },
    ...(tolerances !== undefined && tolerances.ok ? { tolerances: tolerances.tolerances } : {}),
    ...(coverage !== undefined && coverage.ok ? { coverage: coverage.coverage } : {}),
  };
}
