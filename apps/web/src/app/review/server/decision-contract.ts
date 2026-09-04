/**
 * The AISE-016 review-decision contract: the fail-closed parse
 * and validation of `POST /review/api/decide` request bodies.
 *
 * Every field is validated before ANY canonical constructor or
 * service is touched — malformed input never reaches the
 * governed write path. Validation errors are collected and
 * reported together (honest, complete refusal reasons), never
 * silently coerced.
 *
 * The contract deliberately exposes the minimum the canonical
 * semantics require:
 * - CONFIRM (property or object existence) — evidence is
 *   MANDATORY: either an already-registered evidence identity,
 *   or a new manual measurement that will be registered as
 *   content-pinned evidence and linked to the new version's
 *   assertion subject;
 * - PROPOSE (property only) — a proposed replacement value
 *   (status PROPOSED, kind estimate by construction), with
 *   optional standard uncertainty and/or unitless confidence.
 */

/** Allowed decision kinds (the governed review transitions). */
export type DecisionKind = "CONFIRM" | "PROPOSE";

/** The length-unit vocabulary the review form may submit. */
export const DECISION_LENGTH_UNITS = ["meter", "millimeter", "centimeter", "inch", "foot"] as const;

export type DecisionLengthUnit = (typeof DECISION_LENGTH_UNITS)[number];

/** The parsed, validated decision request (the typed contract). */
export interface ReviewDecisionRequest {
  readonly modelId: string;
  /** The parent committed version the decision derives from. */
  readonly version: number;
  /** Object or space identity the decision targets. */
  readonly entityId: string;
  /** Property key (REQUIRED for PROPOSE; optional for CONFIRM = existence). */
  readonly propertyKey?: string;
  readonly decision: DecisionKind;
  /** CONFIRM only: existing evidence identity to cite and link. */
  readonly evidenceId?: string;
  /** CONFIRM only: a new manual measurement to register as evidence. */
  readonly measurement?: {
    readonly value: number;
    readonly unit: DecisionLengthUnit;
    readonly method: string;
    readonly measuredBy: string;
    readonly measuredAt: string;
    /** Optional standard uncertainty (1σ) in the quantity's unit. */
    readonly uncertaintyU?: number;
    readonly confidence?: number;
  };
  /** PROPOSE only: the proposed replacement estimate. */
  readonly proposal?: {
    readonly value: number;
    readonly unit: DecisionLengthUnit;
    readonly uncertaintyU?: number;
    readonly confidence?: number;
  };
}

/** Parse result: either the typed request or the full error list. */
export type ParseReviewDecisionResult =
  | { readonly ok: true; readonly request: ReviewDecisionRequest }
  | { readonly ok: false; readonly errors: readonly string[] };

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ACTOR_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{1,120}$/;

/** Parses and validates a decide-request body (fail closed). */
export function parseReviewDecisionBody(body: unknown): ParseReviewDecisionResult {
  const errors: string[] = [];

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: ["body must be a JSON object"] };
  }
  const raw = body as Record<string, unknown>;

  const modelId = requireId(raw, "modelId", errors);
  const version = requireVersion(raw, errors);
  const entityId = requireId(raw, "entityId", errors);
  const propertyKey = optionalKey(raw, "propertyKey", errors);

  const decisionRaw = raw["decision"];
  if (decisionRaw !== "CONFIRM" && decisionRaw !== "PROPOSE") {
    errors.push("decision must be \"CONFIRM\" or \"PROPOSE\"");
  }
  const decision = decisionRaw as DecisionKind;

  const evidenceId = optionalId(raw, "evidenceId", errors);
  const measurement = parseMeasurement(raw, errors);
  const proposal = parseProposal(raw, errors);

  // Cross-field rules (fail closed, never guessed).
  if (decisionRaw === "CONFIRM") {
    if (evidenceId === undefined && measurement === undefined) {
      errors.push("CONFIRM requires evidence: \"evidenceId\" (registered) or \"measurement\" (new manual measurement)");
    }
    if (evidenceId !== undefined && measurement !== undefined) {
      errors.push("CONFIRM evidence must be either \"evidenceId\" or \"measurement\", not both");
    }
  }
  if (decisionRaw === "PROPOSE") {
    if (propertyKey === undefined) {
      errors.push("PROPOSE requires \"propertyKey\" (existence cannot be proposed)");
    }
    if (proposal === undefined) {
      errors.push("PROPOSE requires \"proposal\" { value, unit, ... }");
    }
    if (evidenceId !== undefined || measurement !== undefined) {
      errors.push("PROPOSE carries no evidence (a proposal is an estimate by construction)");
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const request: ReviewDecisionRequest = {
    modelId: modelId!,
    version: version!,
    entityId: entityId!,
    ...(propertyKey !== undefined ? { propertyKey } : {}),
    decision,
    ...(evidenceId !== undefined ? { evidenceId } : {}),
    ...(measurement !== undefined ? { measurement } : {}),
    ...(proposal !== undefined ? { proposal } : {}),
  };
  return { ok: true, request };
}

/** Sanitizes the actor identity for canonical verifiedBy/linkedBy fields. */
export function canonicalActor(sessionUser: string): string {
  return `user:${sessionUser}`.slice(0, 120);
}

function requireId(raw: Record<string, unknown>, field: string, errors: string[]): string | undefined {
  const value = raw[field];
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    errors.push(`${field} must be an identifier matching ${ID_PATTERN}`);
    return undefined;
  }
  return value;
}

function optionalId(raw: Record<string, unknown>, field: string, errors: string[]): string | undefined {
  if (raw[field] === undefined) {
    return undefined;
  }
  return requireId(raw, field, errors);
}

function optionalKey(raw: Record<string, unknown>, field: string, errors: string[]): string | undefined {
  const value = raw[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !KEY_PATTERN.test(value)) {
    errors.push(`${field} must be a property key matching ${KEY_PATTERN}`);
    return undefined;
  }
  return value;
}

function requireVersion(raw: Record<string, unknown>, errors: string[]): number | undefined {
  const value = raw["version"];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1_000_000) {
    errors.push("version must be an integer version number ≥ 1");
    return undefined;
  }
  return value;
}

function parseMeasurement(raw: Record<string, unknown>, errors: string[]): ReviewDecisionRequest["measurement"] | undefined {
  const value = raw["measurement"];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push("measurement must be an object");
    return undefined;
  }
  const m = value as Record<string, unknown>;
  const measuredValue = requireFinite(m, "measurement.value", errors);
  const unit = requireUnit(m, "measurement.unit", errors);
  const method = requireActor(m, "measurement.method", errors, 1);
  const measuredBy = requireActor(m, "measurement.measuredBy", errors, 1);
  const measuredAt = requireTimestamp(m, "measurement.measuredAt", errors);
  const uncertaintyU = optionalFiniteU(m, "measurement.uncertaintyU", errors);
  const confidence = optionalConfidence(m, "measurement.confidence", errors);
  if (
    measuredValue === undefined ||
    unit === undefined ||
    method === undefined ||
    measuredBy === undefined ||
    measuredAt === undefined
  ) {
    return undefined;
  }
  return {
    value: measuredValue,
    unit,
    method,
    measuredBy,
    measuredAt,
    ...(uncertaintyU !== undefined ? { uncertaintyU } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
  };
}

function parseProposal(raw: Record<string, unknown>, errors: string[]): ReviewDecisionRequest["proposal"] | undefined {
  const value = raw["proposal"];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push("proposal must be an object");
    return undefined;
  }
  const p = value as Record<string, unknown>;
  const proposedValue = requireFinite(p, "proposal.value", errors);
  const unit = requireUnit(p, "proposal.unit", errors);
  const uncertaintyU = optionalFiniteU(p, "proposal.uncertaintyU", errors);
  const confidence = optionalConfidence(p, "proposal.confidence", errors);
  if (proposedValue === undefined || unit === undefined) {
    return undefined;
  }
  return {
    value: proposedValue,
    unit,
    ...(uncertaintyU !== undefined ? { uncertaintyU } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
  };
}

function requireFinite(raw: Record<string, unknown>, field: string, errors: string[]): number | undefined {
  const key = field.split(".").pop()!;
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${field} must be a finite number`);
    return undefined;
  }
  return value;
}

function optionalFiniteU(raw: Record<string, unknown>, field: string, errors: string[]): number | undefined {
  const key = field.split(".").pop()!;
  if (raw[key] === undefined) {
    return undefined;
  }
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push(`${field} must be a finite positive number (1σ, same unit as the value)`);
    return undefined;
  }
  return value;
}

function optionalConfidence(raw: Record<string, unknown>, field: string, errors: string[]): number | undefined {
  const key = field.split(".").pop()!;
  if (raw[key] === undefined) {
    return undefined;
  }
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    errors.push(`${field} must be a finite number on [0, 1]`);
    return undefined;
  }
  return value;
}

function requireUnit(raw: Record<string, unknown>, field: string, errors: string[]): DecisionLengthUnit | undefined {
  const key = field.split(".").pop()!;
  const value = raw[key];
  if (typeof value !== "string" || !(DECISION_LENGTH_UNITS as readonly string[]).includes(value)) {
    errors.push(`${field} must be one of: ${DECISION_LENGTH_UNITS.join(", ")}`);
    return undefined;
  }
  return value as DecisionLengthUnit;
}

function requireActor(raw: Record<string, unknown>, field: string, errors: string[], minLength: number): string | undefined {
  const key = field.split(".").pop()!;
  const value = raw[key];
  if (typeof value !== "string" || value.length < minLength || !ACTOR_PATTERN.test(value)) {
    errors.push(`${field} must be a short non-empty identity label`);
    return undefined;
  }
  return value;
}

function requireTimestamp(raw: Record<string, unknown>, field: string, errors: string[]): string | undefined {
  const key = field.split(".").pop()!;
  const value = raw[key];
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
    errors.push(`${field} must be an RFC 3339 UTC instant (e.g. 2026-09-04T14:00:00Z)`);
    return undefined;
  }
  return value;
}
