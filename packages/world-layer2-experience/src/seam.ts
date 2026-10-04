/**
 * WORLD-P2 — the Layer-2 experience-lane SEAM.
 *
 * The shared law layer under the four family contracts (problem/ evidence/
 * reasoning/ action/): the lane statement and the eight-stage lane identity,
 * the actor discipline (the "who" of the audit trail), the digest discipline
 * (re-exported VERBATIM from the P0-B understanding-substrate seam — this
 * lane COMPOSES that substrate, it never re-defines its surfaces), the typed
 * outcome shape with the HFX-000 closed failure vocabulary (imported from
 * `@aise/provider-registry`, never modified), and the non-interference guard.
 *
 * THE LANE (directive, docs/TECH-LEAD-HANDOFF.md §1 Layer 2):
 *
 *   QUESTION / ISSUE → CONTEXT → EVIDENCE → MISSING-EVIDENCE DETECTION
 *   → BOUNDED REASONING → DETERMINISTIC CHECKS → ACTION / NEXT STEP
 *   → AUDIT TRAIL
 *
 * THE BINDING TRANSLATION LAW (directive §7 P2): "Do not copy Procore's
 * domain model. Translate useful workflow behavior into the AISE
 * evidence/case architecture." AISE problems/cases — NOT Procore issues;
 * the AISE evidence/case architecture is the only domain model here.
 *
 * THE NINE LANE LAWS (binding on every family, enforced by the family
 * validators and drilled by the colocated test suites):
 *
 *   1. EPISTEMIC LAW: substrate-extracted candidates and bounded-reasoning
 *      outputs are INFERRED, NEVER OBSERVED/CONFIRMED. A file says so; an
 *      LLM proposes so; the site may differ. Observation and confirmation
 *      authority stays with the evidence-bound human/assurance process.
 *   2. IDENTITY LAW: substrate object ids (IFC GUIDs, STEP refs, OCCT
 *      topology names, VTK dataobject ids) are NAMESPACED EXTERNAL LABELS,
 *      never canonical AISE identity (directive §10). Canonical ids in this
 *      lane are 64-hex content-derived digests; scene element ids are
 *      STABLE AISE-side ids (the P0-A scene-composition law).
 *   3. EVIDENCE-ENVELOPE LAW: raw evidence is immutable and
 *      content-addressed (its content address IS its identity); an
 *      observation REQUIRES non-empty evidence ids; invalidated evidence is
 *      recorded and discounted, never silently deleted; facts and
 *      inferences live in separate typed collections, never merged.
 *   4. FAIL-CLOSED READINESS LAW: missing evidence answers with typed gaps
 *      and a worst-of readiness verdict; absent requirement inputs answer
 *      INSUFFICIENT_DATA, never a vacuous READY; UNKNOWN never implies
 *      absence (spec/architecture-lock.md "Truth and uncertainty").
 *   5. NO-LLM-AUTHORITY LAW: an LLM is a replaceable reasoning substrate,
 *      never an engineering authority. Bounded-reasoning outputs are
 *      advisory INFERRED claims with recorded prompt/context provenance;
 *      the deterministic solution engine and verification seams stay the
 *      only engineering authorities; a reasoning output can never upgrade
 *      or flip an engine-owned verdict.
 *   6. REFUSAL LAW: unsupported/insufficient is RECORDED, never computed
 *      (HFX-000 closed failure vocabulary through the ports; the
 *      bounded-reasoning refusal registry mirrors AISE-029's frozen codes).
 *      A wrong-but-confident answer is the failure mode this lane exists
 *      to prevent.
 *   7. OWNERSHIP LAW: every action carries explicit ownership (owner,
 *      assigned-by, assigned-at as declared instants); an unowned
 *      consequential action is refused.
 *   8. AUDIT LAW: the audit trail is append-only with chained digests;
 *      every lane transition is one auditable who/what/when/why/
 *      evidence-bound record; replay is deterministic and byte-identical.
 *   9. DETERMINISM LAW: no network, no clock reads, no randomness, no I/O
 *      in the contract core. All instants are DECLARED inputs carried in
 *      requests, never sensed. Identical inputs through the same double
 *      produce byte-identical content-addressed outputs.
 */

import type { FailureKind } from "@aise/provider-registry";
import {
  canonicalDigestOf,
  deepFreeze,
  isCanonicalDigest,
  textDigestOf,
} from "@aise/world-understanding-substrate";

/* The digest + freeze disciplines are the P0-B seam's — re-exported
 * VERBATIM, never re-defined (this lane composes that substrate). */
export { canonicalDigestOf, textDigestOf, isCanonicalDigest, deepFreeze };

/* ------------------------------------------------------------------ */
/* Lane identity                                                        */
/* ------------------------------------------------------------------ */

export const LAYER2_LANE_ID = "layer2-experience" as const;

export const LAYER2_LANE_STATEMENT =
  "AISE Layer-2 experience lane (WORLD-P2): the Procore-parity workflow behavior — " +
  "issue/case context, evidence-linked observations, documents/drawings/RFI/submittal-like " +
  "information continuity, action ownership/status, audit history, bounded AI retrieval/action " +
  "and explicit readiness/missing-evidence tasks — TRANSLATED into the AISE evidence/case " +
  "architecture: PROBLEM → CONTEXT → EVIDENCE → MISSING-EVIDENCE DETECTION → BOUNDED " +
  "REASONING → DETERMINISTIC CHECKS → ACTION → AUDIT TRAIL. Procore's domain model is " +
  "deliberately NOT copied; the AISE Evidence Envelope, epistemic states, deterministic " +
  "verification and refusal rules are the only domain model.";

/** The eight lane stages, in order (the directive's Layer-2 target). */
export const LAYER2_STAGE_NAMES = [
  "PROBLEM",
  "CONTEXT",
  "EVIDENCE",
  "MISSING_EVIDENCE",
  "BOUNDED_REASONING",
  "DETERMINISTIC_CHECKS",
  "ACTION",
  "AUDIT_TRAIL",
] as const;
export type Layer2StageName = (typeof LAYER2_STAGE_NAMES)[number];

export function isLayer2StageName(value: unknown): value is Layer2StageName {
  return (
    typeof value === "string" &&
    (LAYER2_STAGE_NAMES as readonly string[]).includes(value)
  );
}

/** The closed family vocabulary of this package. */
export const LAYER2_FAMILIES = ["problem", "evidence", "reasoning", "action"] as const;
export type Layer2Family = (typeof LAYER2_FAMILIES)[number];

export function isLayer2Family(value: unknown): value is Layer2Family {
  return (
    typeof value === "string" &&
    (LAYER2_FAMILIES as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ */
/* The actor discipline (the WHO of the audit trail)                    */
/* ------------------------------------------------------------------ */

/**
 * Closed actor-role vocabulary. The ownership translation of the
 * incumbent's assignee/inspector workflow behavior: AISE actors are typed
 * identities with a role; authority-bearing roles (REVIEWER) are governed
 * by the review records, never assumed.
 */
export const LANE_ACTOR_ROLES = [
  "engineer",
  "field_engineer",
  "reviewer",
  "system",
  "bounded_agent",
] as const;
export type LaneActorRole = (typeof LANE_ACTOR_ROLES)[number];

export function isLaneActorRole(value: unknown): value is LaneActorRole {
  return (
    typeof value === "string" &&
    (LANE_ACTOR_ROLES as readonly string[]).includes(value)
  );
}

/**
 * One actor identity: a typed who. `actorId` is an AISE-side stable id
 * (never a substrate id); `role` comes from the closed vocabulary. The
 * BOUNDED_AGENT role marks the bounded AI acting — it may propose, never
 * decide (the no-LLM-authority law).
 */
export interface LaneActor {
  readonly actorId: string;
  readonly role: LaneActorRole;
}

/* ------------------------------------------------------------------ */
/* The provider descriptor + outcome (the port-occupant discipline)     */
/* ------------------------------------------------------------------ */

/**
 * The identity of one occupant of a lane family port — the same structural
 * discipline as the P0-B `SubstrateProviderDescriptor`: the in-repo
 * substitution doubles describe themselves honestly ("in-memory
 * substitution double — no substrate integrated"); a future real occupant
 * (the real app wiring, the real LLM adapter, the real assurance seam)
 * describes itself here.
 */
export interface LaneProviderDescriptor {
  readonly providerId: string;
  readonly family: Layer2Family;
  readonly technologyVersion: string;
  readonly engineNote: string;
  readonly laneStatement: string;
}

/** The 64-hex content digest of a provider descriptor (provenance pin). */
export function laneProviderDescriptorDigestOf(
  descriptor: LaneProviderDescriptor,
): string {
  return canonicalDigestOf(descriptor);
}

/** A typed lane failure: HFX-000 closed kind + family + honest detail. */
export interface LaneFailure {
  readonly kind: FailureKind;
  readonly family: Layer2Family;
  readonly detail: string;
}

/** The discriminated outcome of one lane port call. */
export type LaneOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: LaneFailure };

/** A typed refusal bound to one lane family (law #6). */
export function laneRefused<T>(
  family: Layer2Family,
  kind: FailureKind,
  detail: string,
): LaneOutcome<T> {
  return { ok: false, failure: { kind, family, detail } };
}

/* ------------------------------------------------------------------ */
/* Shared small helpers                                                */
/* ------------------------------------------------------------------ */

/** ISO-8601 UTC instant with milliseconds (the declared-instant shape). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isDeclaredInstant(value: unknown): value is string {
  return typeof value === "string" && ISO_INSTANT.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.length > 0)
  );
}

/**
 * The house sealing discipline (from the P0-B seam): the content-derived
 * 64-hex id of a record — sha-256 over the canonical JSON of the record
 * with its own id field removed. Re-derivable, collision-free across
 * fixtures, never a substrate label.
 */
export function contentIdOf(
  record: Record<string, unknown>,
  idField: string,
): string {
  const clone: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (key !== idField) {
      clone[key] = record[key];
    }
  }
  return canonicalDigestOf(clone);
}
