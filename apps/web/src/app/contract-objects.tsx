/**
 * PROD-017 — the contract-object PRESENTATION REGISTRY + verbatim renderer.
 *
 * ONE registry drives three things that must never drift apart:
 *
 *  1. the RENDER layer — {@link ContractObjectFields} renders every field
 *     of {@link CONTRACT_PRESENTED_FIELDS} for every object the task-first
 *     flow touches (the semantic-objects audit card: the verbatim,
 *     complete view that preserves direct auditability from consequential
 *     claims/quantities to their source/evidence/version context — the
 *     PROD-017 acceptance);
 *  2. the CONFORMANCE BINDING — `presentedFields` returns exactly this
 *     registry (the conformance harness's C4/C5 checks then verify the
 *     registry covers every schema-required and every authoritative field);
 *  3. the RENDER TESTS — a test asserts the renderer's output contains
 *     every registry field for every committed fixture, so the binding
 *     can never claim more than the UI actually shows.
 *
 * Field lists = the object's schema-required fields PLUS the optional
 * fields this adapter renders whenever present (sourceSystem,
 * readinessDetail, sourceRecordRef, validUntil, reasonDetail, failure,
 * and the per-domain requirement fields). Values are rendered VERBATIM —
 * ids in mono, timestamps as instants, lists as lists, nested objects as
 * labeled lines; nothing is re-derived, summarized or hidden.
 *
 * PURE PRESENTATION: props in, JSX out; no fetching, no clocks, no
 * randomness.
 */

import type { ReactNode } from "react";
import type { AdapterObjectName } from "@aise/adapter-contract";

/* ------------------------------------------------------------------ */
/* The presentation registry                                            */
/* ------------------------------------------------------------------ */

/**
 * The fields this adapter presents per contract object — required fields
 * always, optional fields whenever present in the payload. Sorted per
 * object for stable render order.
 */
export const CONTRACT_PRESENTED_FIELDS: Readonly<Record<AdapterObjectName, readonly string[]>> =
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
  const registry = CONTRACT_PRESENTED_FIELDS as Record<string, readonly string[] | undefined>;
  return registry[objectName] ?? [];
}

/* ------------------------------------------------------------------ */
/* The verbatim renderer                                                */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Render one scalar value verbatim (mono for ids/timestamps/versions). */
function ScalarValue({ value }: { readonly value: unknown }): ReactNode {
  if (value === null || value === undefined) {
    return <span className="pane-foot">—</span>;
  }
  if (typeof value === "boolean") {
    return <span>{value ? "true" : "false"}</span>;
  }
  if (typeof value === "number") {
    return <span>{String(value)}</span>;
  }
  return <span className="mono">{String(value)}</span>;
}

/** Render one field value: scalar, list or nested object — verbatim. */
function FieldValue({ value }: { readonly value: unknown }): ReactNode {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="pane-foot">none</span>;
    }
    return (
      <ul className="notes-list" data-field-kind="list">
        {value.map((entry, index) => (
          <li key={String(index)}>
            {isRecord(entry) ? <NestedObject value={entry} /> : <ScalarValue value={entry} />}
          </li>
        ))}
      </ul>
    );
  }
  if (isRecord(value)) {
    return <NestedObject value={value} />;
  }
  return <ScalarValue value={value} />;
}

/** Render a nested object's own fields as labeled lines (verbatim). */
function NestedObject({ value }: { readonly value: Record<string, unknown> }): ReactNode {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return <span className="pane-foot">{"{}"}</span>;
  }
  return (
    <dl className="fields" data-field-kind="object">
      {entries.map(([key, entryValue]) => (
        <span className="field" key={key}>
          <dt>{key}</dt>
          <dd>
            <FieldValue value={entryValue} />
          </dd>
        </span>
      ))}
    </dl>
  );
}

/**
 * Render every registry field of one contract object VERBATIM. The
 * `objectName` selects the registry list; the payload's own values render
 * (a field absent from the payload renders the honest `—`, an optional
 * field present renders its value). Test-asserted to cover the registry.
 */
export function ContractObjectFields({
  objectName,
  payload,
}: {
  readonly objectName: AdapterObjectName | string;
  readonly payload: unknown;
}): ReactNode {
  if (!isRecord(payload)) {
    return <p className="pane-foot">no {String(objectName)} record</p>;
  }
  const fields = presentedFieldsOf(String(objectName));
  return (
    <dl className="fields" data-contract-object={String(objectName)}>
      {fields.map((field) => (
        <span className="field" key={field} data-field={field}>
          <dt>{field}</dt>
          <dd>
            <FieldValue value={payload[field]} />
          </dd>
        </span>
      ))}
    </dl>
  );
}

/**
 * The semantic-objects audit card body: every object of the task-first
 * view rendered verbatim and complete (the auditability acceptance —
 * consequential claims trace to their source/evidence/version context
 * because the OBJECTS themselves are inspectable, contract version
 * included).
 */
export function SemanticObjectsAudit({
  objects,
}: {
  readonly objects: readonly {
    readonly label: string;
    readonly objectName: string;
    readonly payload: unknown;
  }[];
}): ReactNode {
  return (
    <div className="pane-grid" data-semantic-objects="true">
      {objects.map((entry) => (
        <div className="pane" key={entry.label} data-object={entry.objectName}>
          <div className="pane-head">
            {entry.label}
            <span className="pane-sub mono">{entry.objectName}</span>
          </div>
          <div className="pane-foot">
            <ContractObjectFields objectName={entry.objectName} payload={entry.payload} />
          </div>
        </div>
      ))}
    </div>
  );
}
