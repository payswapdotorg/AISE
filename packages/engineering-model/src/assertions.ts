/**
 * Property assertions for the Reality Graph core (AISE-011).
 *
 * A property assertion is the canonical representation of ONE
 * engineering statement about an entity (architecture §6):
 *
 * ```text
 * value + unit + status + confidence? + uncertainty? +
 * source_evidence[] + method + verified_by + verified_at
 * ```
 *
 * The constructor is fail-closed and runs on the producing path
 * (the established AISE-009/010 discipline). It enforces:
 *
 * - **Exactly one of value / presence** — an assertion either
 *   asserts a quantity or records what is known about observation
 *   itself (`NOT_OBSERVED`, `OCCLUDED`, `CONFIRMED_ABSENT`). A
 *   value together with a presence state is contradictory and
 *   rejected. `UNKNOWN` alone asserts nothing and is likewise
 *   rejected — an assertion that knows nothing has no business
 *   existing (fail closed rather than encode noise).
 * - **Estimates vs measurements** (architecture-lock §3,
 *   AC-072) — `kind: "measurement"` requires status `OBSERVED` or
 *   `CONFIRMED` (directly supported). `INFERRED`/`PROPOSED`
 *   values are estimates by construction. The silent upgrade of
 *   an estimate into a measurement is structurally impossible.
 * - **CONFIRMED requires provenance** (AC-062) — a confirmed
 *   assertion must cite evidence references and a verifier
 *   identity; `verifiedAt` is required and must be a plausible
 *   RFC 3339 UTC instant.
 * - **CONFIRMED_ABSENT requires affirmative evidence**
 *   (architecture-lock §2) — the strongest negative claim needs
 *   the strongest support: status `CONFIRMED`, non-empty evidence
 *   references. `UNKNOWN`, `NOT_OBSERVED`, and `OCCLUDED` can
 *   never masquerade as confirmed absence.
 * - **Confidence never substitutes uncertainty** (AC-071) — the
 *   two fields are structurally distinct: `confidence` is a
 *   unitless probability on [0, 1]; `uncertainty` is a metrological
 *   record in the quantity's unit. No code path converts one into
 *   the other; absence of one never implies the other.
 */
import { EngineeringModelError } from "./errors.js";
import {
  assertValidEpistemicState,
  assertValidPresence,
  type EpistemicState,
  type ModelPresence,
} from "./epistemic.js";
import {
  assertValidUnit,
  quantityMayBeMeasurement,
  validateUncertainty,
  type MeasurementKind,
  type ModelUnit,
  type ModelUncertainty,
} from "./quantities.js";

const PROPERTY_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const EVIDENCE_REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

/** One canonical property assertion about a model entity. */
export interface PropertyAssertion {
  /** Property name (e.g. "roomHeight", "fireRating"). */
  readonly key: string;
  /**
   * The asserted quantity. Exactly one of `quantity` /
   * `presence` is set: an assertion carries a value OR records
   * observation status, never both, never neither.
   */
  readonly quantity?: {
    readonly value: number;
    readonly unit: ModelUnit;
    readonly uncertainty?: ModelUncertainty;
  };
  /** Presence state for valueless assertions. */
  readonly presence?: ModelPresence;
  /** Epistemic status of THIS assertion (preserved, never collapsed). */
  readonly status: EpistemicState;
  /**
   * `measurement` (directly supported) vs `estimate` (derived) —
   * required when a quantity is asserted; structurally bound to
   * the epistemic status.
   */
  readonly kind?: MeasurementKind;
  /** Model probability on [0, 1] — a SEPARATE axis from uncertainty. */
  readonly confidence?: number;
  /** Derivation method label (AC-061: derived values record the method). */
  readonly method?: string;
  /**
   * Evidence references (identities into the evidence subsystem —
   * AISE-012 binds them). Required for CONFIRMED assertions.
   */
  readonly evidenceRefs?: readonly string[];
  /** Who or what verified this assertion (required for CONFIRMED). */
  readonly verifiedBy?: string;
  /** RFC 3339 UTC verification instant (required for CONFIRMED). */
  readonly verifiedAt?: string;
}

/** Constructor input (the assertion record itself; validated on construction). */
export type PropertyAssertionInput = PropertyAssertion;

/** Builds and validates a property assertion (fail closed). */
export function propertyAssertion(assertion: PropertyAssertionInput): PropertyAssertion {
  const field = `property "${assertion.key ?? String(assertion.key)}"`;

  if (typeof assertion.key !== "string" || !PROPERTY_KEY_PATTERN.test(assertion.key)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `${field}: key must match ${PROPERTY_KEY_PATTERN}`,
      { details: { field: "key", value: String(assertion.key) } },
    );
  }

  assertValidEpistemicState(assertion.status, `${field}.status`);

  const hasQuantity = assertion.quantity !== undefined;
  const hasPresence = assertion.presence !== undefined;

  if (hasQuantity && hasPresence) {
    throw new EngineeringModelError(
      "PRESENCE_INVALID",
      `${field}: an assertion carries a quantity OR a presence state, never both`,
      { details: { field: "presence", value: String(assertion.presence) } },
    );
  }
  if (!hasQuantity && !hasPresence) {
    throw new EngineeringModelError(
      "PRESENCE_INVALID",
      `${field}: an assertion must carry a quantity or a presence state — an assertion that records nothing cannot exist`,
      { details: { field: "key", value: assertion.key } },
    );
  }
  if (hasPresence && assertion.presence === "UNKNOWN") {
    throw new EngineeringModelError(
      "PRESENCE_INVALID",
      `${field}: presence "UNKNOWN" asserts nothing — do not record it as an assertion`,
      { details: { field: "presence", value: "UNKNOWN" } },
    );
  }

  if (hasQuantity) {
    const quantity = assertion.quantity!;
    if (!Number.isFinite(quantity.value)) {
      throw new EngineeringModelError(
        "VALUE_INVALID",
        `${field}.value must be finite: ${String(quantity.value)}`,
        { details: { field: "value", value: String(quantity.value) } },
      );
    }
    assertValidUnit(quantity.unit, `${field}.unit`);
    if (quantity.uncertainty !== undefined) {
      validateUncertainty(quantity.uncertainty, `${field}.uncertainty`);
    }
    if (assertion.kind !== undefined && assertion.kind !== "measurement" && assertion.kind !== "estimate") {
      throw new EngineeringModelError(
        "MEASUREMENT_KIND_INVALID",
        `${field}.kind must be "measurement" or "estimate": ${String(assertion.kind)}`,
        { details: { field: "kind", value: String(assertion.kind) } },
      );
    }
    if (assertion.kind === "measurement" && !quantityMayBeMeasurement(assertion.status)) {
      throw new EngineeringModelError(
        "MEASUREMENT_KIND_INVALID",
        `${field}: kind "measurement" requires status OBSERVED or CONFIRMED — a ${assertion.status} value is an estimate (no silent estimate→measurement upgrade)`,
        { details: { field: "kind", value: assertion.kind, status: assertion.status } },
      );
    }
  } else if (assertion.kind !== undefined) {
    throw new EngineeringModelError(
      "MEASUREMENT_KIND_INVALID",
      `${field}.kind applies only to quantities — a valueless assertion is not an estimate or a measurement`,
      { details: { field: "kind", value: String(assertion.kind) } },
    );
  }

  if (assertion.confidence !== undefined) {
    if (!Number.isFinite(assertion.confidence) || assertion.confidence < 0 || assertion.confidence > 1) {
      throw new EngineeringModelError(
        "VALUE_INVALID",
        `${field}.confidence must be a finite number on [0, 1]: ${String(assertion.confidence)}`,
        { details: { field: "confidence", value: String(assertion.confidence) } },
      );
    }
  }

  if (assertion.method !== undefined && (typeof assertion.method !== "string" || assertion.method.length === 0)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `${field}.method must be a non-empty string when present`,
      { details: { field: "method", value: String(assertion.method) } },
    );
  }

  const evidenceRefs = validateEvidenceRefs(assertion.evidenceRefs, field);

  // Presence checks run BEFORE the CONFIRMED provenance checks so the
  // more specific negative-knowledge error wins (architecture-lock §2).
  if (hasPresence && assertion.presence === "CONFIRMED_ABSENT") {
    // The architecture's negative-knowledge rule: only affirmative
    // evidence may upgrade absence into confirmed absence.
    if (assertion.status !== "CONFIRMED" || evidenceRefs.length === 0) {
      throw new EngineeringModelError(
        "PRESENCE_INVALID",
        `${field}: CONFIRMED_ABSENT requires affirmative evidence — status CONFIRMED and at least one evidence reference (UNKNOWN/NOT_OBSERVED/OCCLUDED must never become confirmed absence)`,
        { details: { field: "presence", value: "CONFIRMED_ABSENT", status: assertion.status } },
      );
    }
  } else if (hasPresence) {
    assertValidPresence(assertion.presence!, `${field}.presence`);
  }

  if (assertion.status === "CONFIRMED") {
    if (evidenceRefs.length === 0) {
      throw new EngineeringModelError(
        "PROVENANCE_INCOMPLETE",
        `${field}: a CONFIRMED assertion requires evidence references (a verified assertion without provenance is rejected)`,
        { details: { field: "evidenceRefs", value: "empty" } },
      );
    }
    if (typeof assertion.verifiedBy !== "string" || assertion.verifiedBy.length === 0) {
      throw new EngineeringModelError(
        "PROVENANCE_INCOMPLETE",
        `${field}: a CONFIRMED assertion requires verifiedBy`,
        { details: { field: "verifiedBy", value: String(assertion.verifiedBy) } },
      );
    }
    if (typeof assertion.verifiedAt !== "string" || !TIMESTAMP_PATTERN.test(assertion.verifiedAt)) {
      throw new EngineeringModelError(
        "PROVENANCE_INCOMPLETE",
        `${field}: a CONFIRMED assertion requires verifiedAt as an RFC 3339 UTC timestamp`,
        { details: { field: "verifiedAt", value: String(assertion.verifiedAt) } },
      );
    }
  } else {
    if (assertion.verifiedBy !== undefined || assertion.verifiedAt !== undefined) {
      throw new EngineeringModelError(
        "MODEL_INVALID",
        `${field}: verification fields require status CONFIRMED (status is ${assertion.status})`,
        { details: { field: "status", value: assertion.status } },
      );
    }
  }

  return { ...assertion };
}

function validateEvidenceRefs(
  evidenceRefs: readonly string[] | undefined,
  field: string,
): readonly string[] {
  if (evidenceRefs === undefined) {
    return [];
  }
  if (!Array.isArray(evidenceRefs)) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `${field}.evidenceRefs must be an array of evidence identities`,
      { details: { field: "evidenceRefs" } },
    );
  }
  for (const ref of evidenceRefs) {
    if (typeof ref !== "string" || !EVIDENCE_REF_PATTERN.test(ref)) {
      throw new EngineeringModelError(
        "MODEL_INVALID",
        `${field}.evidenceRefs entries must match ${EVIDENCE_REF_PATTERN}: ${String(ref)}`,
        { details: { field: "evidenceRefs", value: String(ref) } },
      );
    }
  }
  if (new Set(evidenceRefs).size !== evidenceRefs.length) {
    throw new EngineeringModelError(
      "MODEL_INVALID",
      `${field}.evidenceRefs must be duplicate-free`,
      { details: { field: "evidenceRefs" } },
    );
  }
  return evidenceRefs;
}
