/**
 * PROD-020 — the desktop adapter's PRESENTED-FIELDS REGISTRY and verbatim
 * line renderer.
 *
 * The desktop viewport's field registry: for every adapter wire object,
 * the top-level fields the high-density review surface (review-layout.ts)
 * actually presents, in stable render order. This registry is what the
 * conformance binding's `presentedFields` reports (C4/C5): every
 * schema-required field AND every authoritative field must be listed —
 * the desktop viewport never hides a grant, a denial, a failure, a
 * blocker or a provenance field.
 *
 * `renderContractObject` is the pure verbatim renderer the desktop panes
 * compose: one line per presented field, `name: value`, values rendered
 * VERBATIM (ids, timestamps, enums, deep JSON for structured fields). It
 * is a PRESENTATION model only — it can never mutate, re-derive or
 * synthesize authoritative content (frozen inputs, deep-copied output).
 *
 * Determinism: pure data + pure functions; no clock, no randomness, no IO.
 */

import type { AdapterObjectName } from "@aise/adapter-contract";

/* ------------------------------------------------------------------ */
/* The presented-fields registry                                        */
/* ------------------------------------------------------------------ */

/**
 * The top-level fields the desktop viewport presents for each adapter
 * wire object (stable render order; ALL schema-required and ALL
 * authoritative fields are presented — the conformance C4/C5 backing).
 */
export const DESKTOP_PRESENTED_FIELDS: Readonly<Record<AdapterObjectName, readonly string[]>> =
  Object.freeze({
    AuthorizationContext: [
      "contractVersion",
      "subjectRef",
      "grantedActions",
      "denials",
      "validUntil",
    ],
    BOQContext: [
      "contractVersion",
      "boqId",
      "revision",
      "sourceSystem",
      "sourceRecordRef",
      "lineItemCount",
      "updatedAt",
    ],
    CapabilityDescriptor: [
      "contractVersion",
      "domain",
      "status",
      "details",
      "limitations",
    ],
    CapabilityNegotiation: [
      "contractVersion",
      "adapterKind",
      "profileRef",
      "requirementsRef",
      "outcome",
      "domainOutcomes",
      "permittedInteractionModes",
    ],
    ClientCapabilityProfile: [
      "contractVersion",
      "profileId",
      "adapterKind",
      "capturedAt",
      "screen",
      "input",
      "sensors",
      "camera",
      "offlineStorage",
      "notifications",
      "deepLinks",
    ],
    EngineeringCaseSummary: [
      "contractVersion",
      "caseId",
      "title",
      "status",
      "observationCount",
      "updatedAt",
    ],
    EvidenceSummary: [
      "contractVersion",
      "subjectKind",
      "subjectRef",
      "totalItems",
      "evidenceContentIds",
      "gaps",
      "summarizedAt",
    ],
    InterventionScenarioSummary: [
      "contractVersion",
      "scenarioId",
      "version",
      "epistemicState",
      "approvalState",
      "updatedAt",
    ],
    NextBestAction: [
      "contractVersion",
      "actionId",
      "taskRef",
      "kind",
      "status",
      "prompt",
      "blockers",
    ],
    OperationResult: [
      "contractVersion",
      "operationId",
      "actionRef",
      "status",
      "failure",
      "resultRefs",
      "completedAt",
    ],
    OutcomeSummary: [
      "contractVersion",
      "outcomeId",
      "epistemicState",
      "comparisonAvailable",
      "postWorkEvidenceContentIds",
      "updatedAt",
    ],
    ProjectContext: [
      "contractVersion",
      "projectId",
      "projectName",
      "userRole",
      "sourceSystem",
      "updatedAt",
    ],
    RealitySummary: [
      "contractVersion",
      "projectId",
      "modelVersion",
      "readinessStatus",
      "readinessDetail",
      "objectCount",
      "updatedAt",
    ],
    TaskCapabilityRequirements: [
      "contractVersion",
      "requirementsId",
      "taskType",
      "screen",
      "input",
      "sensors",
      "camera",
      "offlineStorage",
      "notifications",
      "deepLinks",
    ],
    TaskIntent: [
      "contractVersion",
      "taskId",
      "taskType",
      "intent",
      "projectRef",
      "targetRefs",
      "parameters",
      "createdAt",
    ],
  });

/**
 * The fields this adapter presents for one object (empty for unknown
 * object names — a binding that claims nothing renders nothing, and the
 * conformance C4/C5 checks fail loudly rather than guess).
 */
export function presentedFieldsOf(objectName: string): readonly string[] {
  const registry = DESKTOP_PRESENTED_FIELDS as Record<string, readonly string[] | undefined>;
  return registry[objectName] ?? [];
}

/* ------------------------------------------------------------------ */
/* The verbatim line renderer                                           */
/* ------------------------------------------------------------------ */

/** One rendered line of a desktop object pane. */
export interface RenderedFieldLine {
  /** The presented field name (registry order). */
  readonly field: string;
  /** The verbatim rendered value text. */
  readonly text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Render one scalar value verbatim (structured values as canonical JSON). */
function renderValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return "[unrenderable]";
  }
}

/**
 * Render one adapter wire object into the desktop pane's verbatim line
 * model: every presented field (registry order) becomes one
 * `{ field, text }` line. The payload is NEVER mutated; the output is new
 * data. Fields absent from the payload render as explicit `absent` lines
 * so an omission is visible in the dense viewport (never silently
 * dropped).
 */
export function renderContractObject(
  objectName: string,
  payload: object,
): readonly RenderedFieldLine[] {
  if (!isRecord(payload)) {
    return [];
  }
  const lines: RenderedFieldLine[] = [];
  for (const field of presentedFieldsOf(objectName)) {
    const present = field in payload;
    lines.push({
      field,
      text: present ? renderValue(payload[field]) : "absent",
    });
  }
  return lines;
}
