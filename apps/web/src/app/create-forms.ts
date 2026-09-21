/**
 * PROD-010 — the brokered CREATE-action descriptors + draft validators of
 * the product web shell's write path (PURE LOGIC — no React, no fetch).
 *
 * WRITE HONESTY (the golden-journey discipline):
 *
 *  - Every write panel's submit control is offered ONLY through the
 *    AISE-040 actions broker: an explicit ALLOWED decision of the frozen
 *    AISE-036 permission (`identity:write`, `intervention:write`,
 *    `case:write` — the vocabulary VERBATIM) enables it; any refusal is
 *    DISABLED with the reason named; an absent authorization port or an
 *    unformable target is the honest `unavailable` state; a port that
 *    THROWS surfaces as the explicit `ask-failed` state (this wrapper never
 *    swallows a wiring failure into a fake decision either).
 *  - Draft validators MIRROR the server contracts (the backend parsers stay
 *    the authority — the client-side check names defects BEFORE the write,
 *    it never replaces the server's): the vNNN baseline rule, the five
 *    per-kind required step fields, the typed-unit rule (`numeric values
 *    REQUIRE a unit; non-numeric values carry none`), the missing-provenance
 *    discipline, the AISE-025 case-review decision vocabulary and the
 *    governed scenario-status transition table — all mirrored VERBATIM.
 *
 * Determinism: pure functions of their inputs; no clock, no randomness,
 * no IO. The fetch transport lives in api.ts; the panels (round 2) wire
 * the two together.
 */

import {
  pairConnectorAction,
  resolveConnectorActionOffer,
  validateConnectorActionDescriptor,
  type ConnectorActionDescriptor,
  type ConnectorActionOfferState,
  type ShellAddress,
  type ShellAuthorizationPort,
  type ShellConnectorAction,
  type ShellPermissionTarget,
} from "../shell";
import { TASK_TYPES } from "@aise/adapter-contract";
import type { TaskIntent } from "@aise/adapter-contract";

/* ------------------------------------------------------------------ */
/* The frozen vocabulary mirrors (VERBATIM from the owning authorities) */
/* ------------------------------------------------------------------ */

/** AISE-026 step kinds (the intervention model's frozen vocabulary). */
export const STEP_KINDS = Object.freeze([
  "property_change",
  "element_addition",
  "element_modification",
  "proposed_removal",
  "note",
] as const);
export type StepKindValue = (typeof STEP_KINDS)[number];

/** AISE-026 scenario statuses (frozen vocabulary). */
export const SCENARIO_STATUSES = Object.freeze([
  "draft",
  "under_review",
  "approved",
  "rejected",
  "superseded",
] as const);
export type ScenarioStatusValue = (typeof SCENARIO_STATUSES)[number];

/**
 * The governed transition table — VERBATIM mirror of the intervention
 * model's `SCENARIO_TRANSITIONS` (the single authority; this mirror only
 * drives which options the status panel OFFERS).
 */
export const SCENARIO_TRANSITIONS: Readonly<Record<ScenarioStatusValue, readonly ScenarioStatusValue[]>> =
  Object.freeze({
    draft: Object.freeze(["under_review", "superseded"] as const),
    under_review: Object.freeze(["approved", "rejected", "superseded"] as const),
    approved: Object.freeze([] as const),
    rejected: Object.freeze([] as const),
    superseded: Object.freeze([] as const),
  });

/** The statuses from which no further transition is possible. */
export const TERMINAL_SCENARIO_STATUSES: readonly ScenarioStatusValue[] = Object.freeze([
  "approved",
  "rejected",
  "superseded",
]);

/** The allowed next statuses of a current status (empty when terminal). */
export function allowedScenarioTransitions(status: string): readonly ScenarioStatusValue[] {
  const table = SCENARIO_TRANSITIONS as Record<string, readonly ScenarioStatusValue[] | undefined>;
  return table[status] ?? [];
}

/** AISE-025 case-review decisions (the Case domain's frozen vocabulary). */
export const CASE_REVIEW_DECISIONS = Object.freeze([
  "approved",
  "rejected",
  "needs_more_evidence",
] as const);
export type CaseReviewDecision = (typeof CASE_REVIEW_DECISIONS)[number];

/** The reality baseline version shape (`vNNN` sequence ids). */
const VERSION_ID = /^v\d{3,}$/;
const CONTENT_ID = /^[0-9a-f]{64}$/;
const ISO_UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/* ------------------------------------------------------------------ */
/* Brokered create-action descriptors (AISE-040, reused not forked)     */
/* ------------------------------------------------------------------ */

/**
 * Build one record-creation action descriptor for the AISE-040 broker. The
 * `requiredPermission` is the frozen AISE-036 vocabulary VERBATIM (the
 * deployment's wiring decided which permission gates which action). The
 * connector-action KIND vocabulary is frozen at four values (AISE-037
 * capability names + the shell's own `open-record` presentation kind);
 * creation actions use `open-record` — the shell's own presentation kind
 * for app-authored record acts (documented attribution; no second kind
 * vocabulary is invented here).
 */
export function createRecordAction(options: {
  readonly actionId: string;
  readonly label: string;
  readonly permission: string;
  readonly initiateUrl?: string | null;
  readonly sourceModule?:
    | "context"
    | "reality"
    | "boq"
    | "evidence"
    | "case"
    | "integration"
    | "identity";
}): ConnectorActionDescriptor {
  const descriptor: ConnectorActionDescriptor = {
    actionId: options.actionId,
    kind: "open-record",
    label: {
      value: options.label,
      source: { module: options.sourceModule ?? "identity", recordId: options.actionId },
    },
    requiredPermission: options.permission,
    initiateUrl: options.initiateUrl ?? null,
  };
  return validateConnectorActionDescriptor(descriptor);
}

/** The tri-state plus the explicit ask-failed state (the wrapper's own). */
export type CreateActionOfferState =
  | ConnectorActionOfferState
  | { readonly kind: "ask-failed"; readonly detail: string };

/** One brokered create-action offer (action + state). */
export interface CreateActionOffer {
  readonly action: ShellConnectorAction;
  readonly state: CreateActionOfferState;
}

/** Everything one authorization question needs (the panel assembles it). */
export interface CreateActionQuestion {
  /** The injected authorization port (absent → unavailable, never guessed). */
  readonly authorization?: ShellAuthorizationPort;
  readonly descriptor: ConnectorActionDescriptor;
  /** The panel's stable binding id (the AISE-040 pairing requirement). */
  readonly bindingId: string;
  /** Where the user returns (every offer carries the return path). */
  readonly returnTo: ShellAddress;
  readonly principalId: string;
  readonly target: ShellPermissionTarget | null;
}

/**
 * Resolve one create-action offer through the AISE-040 broker (reused, not
 * forked): absent port / null target → the honest `unavailable` state; a
 * decision → allowed (grant relayed) or refused (reason named); a port (or
 * pairing) that THROWS → the explicit `ask-failed` state — this wrapper
 * never lets a wiring failure crash a panel and never turns it into a
 * fake decision.
 */
export async function resolveCreateActionOffer(
  question: CreateActionQuestion,
): Promise<CreateActionOffer> {
  try {
    const action = pairConnectorAction(
      question.descriptor,
      question.bindingId,
      question.returnTo,
    );
    const offer = await resolveConnectorActionOffer(
      question.authorization,
      action,
      question.principalId,
      question.target,
    );
    return { action, state: offer.state };
  } catch (error) {
    return {
      action: {
        descriptor: question.descriptor,
        bindingId: question.bindingId,
        returnTo: question.returnTo,
      },
      state: {
        kind: "ask-failed",
        detail: error instanceof Error ? error.message : "the authorization port failed",
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Draft validators (server contracts mirrored, defects NAMED)          */
/* ------------------------------------------------------------------ */

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

/** Parse a comma-separated id field into a de-duplicated id list. */
export function idListFromField(field: string): readonly string[] {
  return [
    ...new Set(
      field
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ];
}

/** A new-project draft (identity: POST /v1/identity/…/projects). */
export interface NewProjectDraft {
  readonly organizationId: string;
  readonly projectId: string;
  readonly name: string;
  /** The acting principal (the identity contract's `actor`). */
  readonly actor: string;
}

/** Validate a project draft against the identity contract (defects named). */
export function validateNewProjectDraft(draft: NewProjectDraft): readonly string[] {
  const defects: string[] = [];
  boundedId(draft.organizationId, "organizationId", defects);
  boundedId(draft.projectId, "projectId", defects);
  boundedId(draft.name, "name", defects);
  boundedId(draft.actor, "actor", defects);
  return defects;
}

/** A new-scenario draft (intervention: POST /v1/interventions). */
export interface NewScenarioDraft {
  readonly scenarioId: string;
  readonly projectId: string;
  readonly title: string;
  /** The PINNED reality baseline (a `vNNN` sequence id). */
  readonly baselineVersionId: string;
}

/** Validate a scenario draft against the intervention contract. */
export function validateNewScenarioDraft(draft: NewScenarioDraft): readonly string[] {
  const defects: string[] = [];
  boundedId(draft.scenarioId, "scenarioId", defects);
  boundedId(draft.projectId, "projectId", defects);
  boundedId(draft.title, "title", defects);
  if (!nonEmpty(draft.baselineVersionId)) {
    defects.push("baselineVersionId must be a non-empty vNNN version id");
  } else if (!VERSION_ID.test(draft.baselineVersionId)) {
    defects.push(`baselineVersionId "${draft.baselineVersionId}" is not a vNNN sequence id`);
  }
  return defects;
}

/** A new-case draft (cases: POST /v1/cases — BODY-scoped auth namespace). */
export interface NewCaseDraft {
  readonly caseId: string;
  /** The auth body scope (top-level projectId — required on the live wire). */
  readonly projectId: string;
  readonly title: string;
  /** Rides the wire unpersisted (the cases core parse carries it). */
  readonly summary?: string;
  /** Rides the wire unpersisted (the cases core parse carries it). */
  readonly createdBy?: string;
  readonly nodeIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly captureSessionIds: readonly string[];
}

/** Validate a case draft against the cases contract. */
export function validateNewCaseDraft(draft: NewCaseDraft): readonly string[] {
  const defects: string[] = [];
  boundedId(draft.caseId, "caseId", defects);
  boundedId(draft.projectId, "projectId", defects);
  boundedId(draft.title, "title", defects);
  if (draft.summary !== undefined && draft.summary.trim().length === 0) {
    defects.push("summary must be non-empty text when provided");
  }
  if (draft.createdBy !== undefined && draft.createdBy.trim().length === 0) {
    defects.push("createdBy must be a non-empty id when provided");
  }
  for (const [field, ids] of [
    ["nodeIds", draft.nodeIds],
    ["evidenceIds", draft.evidenceIds],
    ["captureSessionIds", draft.captureSessionIds],
  ] as const) {
    if (!Array.isArray(ids)) {
      defects.push(`${field} must be an array`);
    } else if (!ids.every((id) => nonEmpty(id))) {
      defects.push(`${field} entries must be non-empty strings`);
    }
  }
  return defects;
}

/** The exact POST /v1/cases wire body (summary/createdBy omitted when blank). */
export interface CreateCaseRequestBody {
  readonly caseId: string;
  readonly projectId: string;
  readonly title: string;
  readonly summary?: string;
  readonly createdBy?: string;
  readonly links: {
    readonly nodeIds: readonly string[];
    readonly evidenceIds: readonly string[];
    readonly captureSessionIds: readonly string[];
  };
}

/** Assemble the exact POST /v1/cases body from a VALID case draft. */
export function createCaseRequestBody(draft: NewCaseDraft): CreateCaseRequestBody {
  return {
    caseId: draft.caseId,
    projectId: draft.projectId,
    title: draft.title,
    ...(nonEmpty(draft.summary) ? { summary: draft.summary } : {}),
    ...(nonEmpty(draft.createdBy) ? { createdBy: draft.createdBy } : {}),
    links: {
      nodeIds: [...draft.nodeIds],
      evidenceIds: [...draft.evidenceIds],
      captureSessionIds: [...draft.captureSessionIds],
    },
  };
}

/** An approval-reference draft (POST /v1/interventions/:id/approval-reference). */
export interface ApprovalReferenceDraft {
  readonly caseId: string;
  /** The AISE-025 case-review decision vocabulary, VERBATIM. */
  readonly reviewDecision: string;
  readonly reviewedAt: string;
}

/** Validate an approval-reference draft (vocabulary + ISO timestamp named). */
export function validateApprovalReferenceDraft(draft: ApprovalReferenceDraft): readonly string[] {
  const defects: string[] = [];
  boundedId(draft.caseId, "caseId", defects);
  if (
    typeof draft.reviewDecision !== "string" ||
    !(CASE_REVIEW_DECISIONS as readonly string[]).includes(draft.reviewDecision)
  ) {
    defects.push(`reviewDecision must be one of ${CASE_REVIEW_DECISIONS.join("|")}`);
  }
  if (!nonEmpty(draft.reviewedAt)) {
    defects.push("reviewedAt must be a non-empty string");
  } else if (!ISO_UTC_MS.test(draft.reviewedAt)) {
    defects.push("reviewedAt must be an ISO-8601 UTC timestamp (milliseconds)");
  }
  return defects;
}

/* ------------------------------------------------------------------ */
/* The typed-unit line parser (`key = value unit`)                      */
/* ------------------------------------------------------------------ */

/** One parsed step property (the intervention `StepPropertyPayload` mirror). */
export interface StepPropertyDraft {
  readonly key: string;
  readonly value: string | number | boolean;
  /** REQUIRED for numeric values; absent for non-numeric. */
  readonly unit?: string;
}

function isNumericToken(token: string): boolean {
  return /^[-+]?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$/.test(token) && Number.isFinite(Number(token));
}

/**
 * Parse `key = value unit` lines into step properties (the typed-unit rule
 * mirrored VERBATIM): a NUMERIC value REQUIRES a trailing unit (a lone
 * number is a NAMED defect — `numeric value X requires a typed unit`); a
 * boolean (`true`/`false`) or text value carries NO unit. Empty lines are
 * skipped; every defect names its line.
 */
export function parseStepPropertyLines(
  lines: string,
): { readonly ok: true; readonly properties: readonly StepPropertyDraft[] } | { readonly ok: false; readonly defects: readonly string[] } {
  const properties: StepPropertyDraft[] = [];
  const defects: string[] = [];
  const rows = lines.split("\n");
  for (let index = 0; index < rows.length; index += 1) {
    const line = (rows[index] ?? "").trim();
    if (line.length === 0) {
      continue;
    }
    const where = `line ${String(index + 1)}`;
    const equals = line.indexOf("=");
    if (equals < 0) {
      defects.push(`${where}: expected "key = value unit"`);
      continue;
    }
    const key = line.slice(0, equals).trim();
    if (key.length === 0 || key.length > 256) {
      defects.push(`${where}: key must be 1..256 characters`);
      continue;
    }
    const right = line.slice(equals + 1).trim();
    if (right.length === 0) {
      defects.push(`${where}: value must not be empty`);
      continue;
    }
    const tokens = right.split(/\s+/);
    if (isNumericToken(tokens[0] ?? "")) {
      if (tokens.length === 1) {
        defects.push(`${where}: numeric value ${tokens[0]} requires a typed unit`);
        continue;
      }
      properties.push({
        key,
        value: Number(tokens[0]),
        unit: tokens.slice(1).join(" "),
      });
      continue;
    }
    if (tokens[0] === "true" || tokens[0] === "false") {
      if (tokens.length > 1) {
        // The one detectable half of the server's other rule: a boolean
        // value carries no unit (`invalid_property` server-side).
        defects.push(`${where}: boolean value ${tokens[0]} carries no unit`);
        continue;
      }
      properties.push({ key, value: tokens[0] === "true" });
      continue;
    }
    properties.push({ key, value: right });
  }
  return defects.length === 0 ? { ok: true, properties } : { ok: false, defects };
}

/* ------------------------------------------------------------------ */
/* The append-step draft (ALL five per-kind required fields)            */
/* ------------------------------------------------------------------ */

/**
 * One append-step draft. The per-kind payload fields mirror the backend's
 * FLAT wire body exactly: `property_change` requires ONE property line;
 * `element_addition` requires a node kind (+ optional parent host) and its
 * property lines; `element_modification` requires at least one property
 * line (geometry/units are not captured by this draft — the panel offers
 * the properties leg); `proposed_removal` requires a reason; `note`
 * requires text.
 */
export interface AppendStepDraft {
  readonly kind: StepKindValue;
  readonly targetNodeId: string;
  /** `key = value unit` lines (required for property_change/element_modification). */
  readonly propertyLines?: string;
  /** element_addition: the new node's kind (reality NodeKind, verbatim). */
  readonly nodeKind?: string;
  /** element_addition: optional host node (materializes a contains edge). */
  readonly parentNodeId?: string;
  /** proposed_removal: never silent. */
  readonly reason?: string;
  /** note text. */
  readonly text?: string;
  /** Optional free-text rationale (carried verbatim). */
  readonly rationale?: string;
  /** Provenance evidence ids (64-hex content addresses). */
  readonly provenanceEvidenceIds: readonly string[];
  /** Provenance derivation note (evidence or note — one is REQUIRED). */
  readonly provenanceDerivationNote?: string;
}

/**
 * Validate an append-step draft against the intervention contract: the
 * five per-kind required fields, the typed-unit rule (via
 * {@link parseStepPropertyLines}), the 64-hex evidence ids and the
 * missing-provenance discipline — every defect NAMED, never thrown.
 */
export function validateAppendStepDraft(draft: AppendStepDraft): readonly string[] {
  const defects: string[] = [];
  if (!(STEP_KINDS as readonly string[]).includes(draft.kind)) {
    defects.push(`kind must be one of ${STEP_KINDS.join("|")}`);
    return defects;
  }
  boundedId(draft.targetNodeId, "targetNodeId", defects);

  let propertyCount = 0;
  if (nonEmpty(draft.propertyLines)) {
    const parsed = parseStepPropertyLines(draft.propertyLines);
    if (!parsed.ok) {
      defects.push(...parsed.defects);
    } else {
      propertyCount = parsed.properties.length;
      const seenKeys = new Set<string>();
      for (const property of parsed.properties) {
        if (seenKeys.has(property.key)) {
          defects.push(`duplicate property key "${property.key}"`);
        }
        seenKeys.add(property.key);
      }
    }
  }

  if (draft.kind === "property_change") {
    if (propertyCount !== 1) {
      defects.push("property_change requires exactly one `key = value unit` line");
    }
  } else if (draft.kind === "element_addition") {
    if (!nonEmpty(draft.nodeKind)) {
      defects.push("element_addition requires a node kind");
    }
    if (draft.parentNodeId !== undefined && !nonEmpty(draft.parentNodeId)) {
      defects.push("parentNodeId must be a non-empty id when provided");
    }
  } else if (draft.kind === "element_modification") {
    if (propertyCount < 1) {
      defects.push("element_modification requires at least one `key = value unit` line");
    }
  } else if (draft.kind === "proposed_removal") {
    if (!nonEmpty(draft.reason)) {
      defects.push("proposed_removal requires a non-empty reason (a removal is never silent)");
    }
  } else if (!nonEmpty(draft.text)) {
    defects.push("note requires a non-empty text");
  }

  if (draft.rationale !== undefined && !nonEmpty(draft.rationale)) {
    defects.push("rationale must be non-empty text when provided");
  }
  for (const evidenceId of draft.provenanceEvidenceIds) {
    if (typeof evidenceId !== "string" || !CONTENT_ID.test(evidenceId)) {
      defects.push("provenance evidence ids must be 64-hex content addresses");
      break;
    }
  }
  if (draft.provenanceEvidenceIds.length === 0 && !nonEmpty(draft.provenanceDerivationNote)) {
    defects.push(
      "a step requires provenance — a non-empty evidence list and/or a derivation note",
    );
  }
  return defects;
}

/** The FLAT POST /v1/interventions/:id/steps wire body (exact shape). */
export type AppendStepRequestBody = {
  readonly kind: "property_change";
  readonly targetNodeId: string;
  readonly property: { readonly key: string; readonly value: string | number | boolean; readonly unit?: string };
  readonly rationale?: string;
  readonly provenance: {
    readonly evidenceIds: readonly string[];
    readonly derivationNote?: string;
  };
} | {
  readonly kind: "element_addition";
  readonly targetNodeId: string;
  readonly node: {
    readonly kind: string;
    readonly properties: readonly { readonly key: string; readonly value: string | number | boolean; readonly unit?: string }[];
  };
  readonly parentNodeId?: string;
  readonly rationale?: string;
  readonly provenance: {
    readonly evidenceIds: readonly string[];
    readonly derivationNote?: string;
  };
} | {
  readonly kind: "element_modification";
  readonly targetNodeId: string;
  readonly properties: readonly { readonly key: string; readonly value: string | number | boolean; readonly unit?: string }[];
  readonly rationale?: string;
  readonly provenance: {
    readonly evidenceIds: readonly string[];
    readonly derivationNote?: string;
  };
} | {
  readonly kind: "proposed_removal";
  readonly targetNodeId: string;
  readonly reason: string;
  readonly rationale?: string;
  readonly provenance: {
    readonly evidenceIds: readonly string[];
    readonly derivationNote?: string;
  };
} | {
  readonly kind: "note";
  readonly targetNodeId: string;
  readonly text: string;
  readonly rationale?: string;
  readonly provenance: {
    readonly evidenceIds: readonly string[];
    readonly derivationNote?: string;
  };
};

/**
 * Assemble the EXACT flat wire body from a VALID draft (validate first —
 * this function is fail-closed: an invalid draft is a typed defects result,
 * never a half-shaped request).
 */
export function appendStepRequestBody(
  draft: AppendStepDraft,
): { readonly ok: true; readonly body: AppendStepRequestBody } | { readonly ok: false; readonly defects: readonly string[] } {
  const defects = validateAppendStepDraft(draft);
  if (defects.length > 0) {
    return { ok: false, defects };
  }
  const parsed = parseStepPropertyLines(draft.propertyLines ?? "");
  const properties = parsed.ok ? parsed.properties : [];
  const provenance = {
    evidenceIds: [...draft.provenanceEvidenceIds],
    ...(nonEmpty(draft.provenanceDerivationNote)
      ? { derivationNote: draft.provenanceDerivationNote }
      : {}),
  };
  const common = {
    targetNodeId: draft.targetNodeId,
    ...(nonEmpty(draft.rationale) ? { rationale: draft.rationale } : {}),
    provenance,
  };
  if (draft.kind === "property_change") {
    const property = properties[0];
    if (property === undefined) {
      return {
        ok: false,
        defects: ["property_change requires exactly one `key = value unit` line"],
      };
    }
    return {
      ok: true,
      body: {
        kind: draft.kind,
        ...common,
        property: {
          key: property.key,
          value: property.value,
          ...(property.unit === undefined ? {} : { unit: property.unit }),
        },
      },
    };
  }
  if (draft.kind === "element_addition") {
    return {
      ok: true,
      body: {
        kind: draft.kind,
        ...common,
        node: {
          kind: draft.nodeKind ?? "",
          properties: properties.map((property) => ({
            key: property.key,
            value: property.value,
            ...(property.unit === undefined ? {} : { unit: property.unit }),
          })),
        },
        ...(nonEmpty(draft.parentNodeId) ? { parentNodeId: draft.parentNodeId } : {}),
      },
    };
  }
  if (draft.kind === "element_modification") {
    return {
      ok: true,
      body: {
        kind: draft.kind,
        ...common,
        properties: properties.map((property) => ({
          key: property.key,
          value: property.value,
          ...(property.unit === undefined ? {} : { unit: property.unit }),
        })),
      },
    };
  }
  if (draft.kind === "proposed_removal") {
    return { ok: true, body: { kind: draft.kind, ...common, reason: draft.reason ?? "" } };
  }
  return { ok: true, body: { kind: draft.kind, ...common, text: draft.text ?? "" } };
}

/* ------------------------------------------------------------------ */
/* Picker helpers                                                       */
/* ------------------------------------------------------------------ */

/** One target-node picker option (label from record fields only). */
export interface StateNodeOption {
  readonly nodeId: string;
  readonly label: string;
}

/**
 * Target-node picker labels from a materialized state's OWN nodes (order
 * verbatim; the label joins the node's id and kind — record fields only,
 * nothing invented).
 */
export function stateNodeOptions(
  state:
    | {
        readonly nodes: readonly {
          readonly nodeId: string;
          readonly node: { readonly kind: string };
        }[];
      }
    | null
    | undefined,
): readonly StateNodeOption[] {
  if (state === null || state === undefined) {
    return [];
  }
  return state.nodes.map((entry) => ({
    nodeId: entry.nodeId,
    label: `${entry.nodeId} — ${entry.node.kind}`,
  }));
}

/** How the Projects surface's resource is keyed (the Settings precedent). */
export type ProjectsLoadMode = "live" | "demo";

/**
 * The Projects resource key: mode + acting principal. The registry list is
 * requester-guarded, so the key CHANGES when the acting principal changes
 * (a sign-in re-loads instead of showing the previous principal's answer).
 */
export function projectsResourceKey(mode: ProjectsLoadMode, principalId: string): string {
  return `projects:${mode}:${principalId}`;
}

/* ------------------------------------------------------------------ */
/* PROD-017 — TaskIntent authoring (W-R3, the client-authored object)  */
/* ------------------------------------------------------------------ */

/**
 * The ONE semantic object this adapter legitimately AUTHORS (PROD-016):
 * the user's typed task intent. Authoring an intent is NOT authority —
 * the server validates, plans and answers it; the builders below emit
 * wire objects that decode/round-trip through `@aise/adapter-contract`'s
 * own TaskIntent codec (asserted by tests — drift is a failure, never a
 * silent payload).
 *
 * Ids and instants are CALLER-SUPPLIED (the app's typed-id convention —
 * the same discipline as every other id/timestamp field in this shell:
 * pure modules take them as parameters; panels read them from inputs).
 * Determinism: no clock, no randomness.
 */

/** The advisory task-type vocabulary (open; carried verbatim from the contract). */

/** Options every TaskIntent builder shares (caller-supplied identity). */
export interface TaskIntentIdentity {
  /** Client-assigned stable task id (`task-…`). */
  readonly taskId: string;
  /** ISO-8601 UTC milliseconds — the instant the intent was authored. */
  readonly createdAt: string;
}

/** Validate the shared identity fields (defects named, never thrown). */
export function validateTaskIntentIdentity(identity: TaskIntentIdentity): readonly string[] {
  const defects: string[] = [];
  boundedId(identity.taskId, "taskId", defects);
  if (!nonEmpty(identity.createdAt)) {
    defects.push("createdAt must be a non-empty string");
  } else if (!ISO_UTC_MS.test(identity.createdAt)) {
    defects.push("createdAt must be an ISO-8601 UTC timestamp (milliseconds)");
  }
  return defects;
}

/** True when the task type is one of the contract's advisory well-known values. */
export function isAdvisoryTaskType(taskType: string): boolean {
  return (TASK_TYPES as readonly string[]).includes(taskType);
}

/** The task-selection draft of the task-first landing (W-R3's entry form). */
export interface TaskSelectionDraft {
  readonly projectRef: string;
  /** Open vocabulary; advisory well-known values come from the contract. */
  readonly taskType: string;
  /** Natural-language statement of what the user needs to do. */
  readonly intent: string;
  /** Stable ids of the entities the task concerns (may be empty). */
  readonly targetRefs: readonly string[];
  /** Inspectable parameters as an open string map. */
  readonly parameters: Readonly<Record<string, string>>;
}

/** Validate a task-selection draft (defects named, never thrown). */
export function validateTaskSelectionDraft(draft: TaskSelectionDraft): readonly string[] {
  const defects: string[] = [];
  boundedId(draft.projectRef, "projectRef", defects);
  if (!nonEmpty(draft.taskType)) {
    defects.push("taskType must be a non-empty string");
  } else if (draft.taskType !== draft.taskType.trim()) {
    defects.push("taskType must not carry surrounding whitespace");
  }
  if (!nonEmpty(draft.intent)) {
    defects.push("intent must be a non-empty statement of what you need to do");
  } else if (draft.intent.length > 2000) {
    defects.push("intent must be at most 2000 characters");
  }
  if (!Array.isArray(draft.targetRefs)) {
    defects.push("targetRefs must be an array");
  } else if (!draft.targetRefs.every((id) => nonEmpty(id))) {
    defects.push("targetRefs entries must be non-empty strings");
  }
  if (typeof draft.parameters !== "object" || draft.parameters === null) {
    defects.push("parameters must be an object");
  } else if (
    !Object.entries(draft.parameters).every(
      ([key, value]) => nonEmpty(key) && typeof value === "string",
    )
  ) {
    defects.push("parameters must be a string→string map with non-empty keys");
  }
  return defects;
}

/** Assemble the typed TaskIntent wire object from a VALID selection draft. */
export function taskIntentFromSelection(
  draft: TaskSelectionDraft,
  identity: TaskIntentIdentity,
): TaskIntent {
  return {
    contractVersion: "1.0.0",
    taskId: identity.taskId,
    taskType: draft.taskType,
    intent: draft.intent,
    projectRef: draft.projectRef,
    targetRefs: [...draft.targetRefs],
    parameters: { ...draft.parameters },
    createdAt: identity.createdAt,
  };
}

/** The TaskIntent a new-project draft authors (task-first framing of the write). */
export function taskIntentFromNewProjectDraft(
  draft: NewProjectDraft,
  identity: TaskIntentIdentity,
): TaskIntent {
  return {
    contractVersion: "1.0.0",
    taskId: identity.taskId,
    taskType: "project-administration",
    intent: `Create the project ${draft.name} in organization ${draft.organizationId}.`,
    projectRef: draft.projectId,
    targetRefs: [draft.projectId],
    parameters: {
      organizationId: draft.organizationId,
      name: draft.name,
      actor: draft.actor,
    },
    createdAt: identity.createdAt,
  };
}

/** The TaskIntent a new-scenario draft authors. */
export function taskIntentFromNewScenarioDraft(
  draft: NewScenarioDraft,
  identity: TaskIntentIdentity,
): TaskIntent {
  return {
    contractVersion: "1.0.0",
    taskId: identity.taskId,
    taskType: "solution-authoring",
    intent: `Propose an intervention scenario "${draft.title}" over the pinned reality baseline ${draft.baselineVersionId}.`,
    projectRef: draft.projectId,
    targetRefs: [draft.scenarioId],
    parameters: {
      baselineVersionId: draft.baselineVersionId,
    },
    createdAt: identity.createdAt,
  };
}

/** The TaskIntent a new-case draft authors. */
export function taskIntentFromNewCaseDraft(
  draft: NewCaseDraft,
  identity: TaskIntentIdentity,
): TaskIntent {
  return {
    contractVersion: "1.0.0",
    taskId: identity.taskId,
    taskType: "engineering-case-review",
    intent: `Open the engineering case "${draft.title}" linking the observed nodes and evidence.`,
    projectRef: draft.projectId,
    targetRefs: [draft.caseId],
    parameters: {
      nodeCount: String(draft.nodeIds.length),
      evidenceCount: String(draft.evidenceIds.length),
      captureSessionCount: String(draft.captureSessionIds.length),
    },
    createdAt: identity.createdAt,
  };
}

/** The TaskIntent an approval-reference draft authors. */
export function taskIntentFromApprovalReferenceDraft(
  draft: ApprovalReferenceDraft,
  scenarioId: string,
  identity: TaskIntentIdentity,
): TaskIntent {
  return {
    contractVersion: "1.0.0",
    taskId: identity.taskId,
    taskType: "intervention-review",
    intent: `Record the case review decision ${draft.reviewDecision} for scenario ${scenarioId}.`,
    projectRef: scenarioId,
    targetRefs: [scenarioId, draft.caseId],
    parameters: {
      reviewDecision: draft.reviewDecision,
    },
    createdAt: identity.createdAt,
  };
}
