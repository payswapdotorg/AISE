/**
 * `@aise/world-layer1-experience` — the typed failure vocabulary
 * (WORLD-P1).
 *
 * LAW 3 of the technology-substitution contract: unsupported is
 * RECORDED, never computed. Every refusal in this lane is a typed,
 * machine-readable `LaneFailure` whose `kind` comes from the CLOSED
 * HFX-000 vocabulary (`@aise/provider-registry` `FAILURE_KINDS` —
 * IMPORTED, never modified, never extended: this file invents no
 * failure kinds). A refusal is evidence: it names the lane port, the
 * honest reason and the subject in hand; it never throws, never
 * returns partial output, never silently downgrades.
 *
 * THE KIND MAPPING (which HFX-000 kind names which lane refusal class):
 *
 *  - `contract-mismatch`       — malformed/missing fields, wrong types,
 *                                non-finite numbers, malformed digests,
 *                                unknown fields the closed shape refuses
 *                                (the validator class);
 *  - `unsupported-data`        — well-formed input outside the lane's
 *                                declared support: a non-spatializable
 *                                asset media type, an unsupported
 *                                registration representation, a
 *                                measurement/comparison without declared
 *                                geometry;
 *  - `operation-semantic-failure` — semantically ill-typed operations:
 *                                a tolerance-less measurement/comparison
 *                                request (tolerances are declared, never
 *                                implicit), a unit mismatch, a
 *                                cross-revision bookmark, a
 *                                ghost-distinctness violation;
 *  - `identity_leak_detected` (substrate vocabulary sibling: the P0-A
 *    closed code) is mirrored here by `contract-mismatch` with the
 *    substrate-id detail — see `looksLikeSubstrateId`; the lane treats
 *    a substrate-shaped canonical id as a contract violation of the
 *    identity law (directive §10) and refuses with the named pattern.
 *  - `retrieval-failure`       — an evidence query for a subject with
 *                                no provenance binding (the
 *                                evidence-backed-query law: never a
 *                                bare substrate read, never a
 *                                fabricated chain);
 *  - `perception-failure` / `reasoning-failure` — reserved for FUTURE
 *    reconstruction-engine occupants of the capture port (a real
 *    engine that misreads its inputs); the P1 in-memory doubles never
 *                                emit them (recorded here for the
 *                                mapping's honesty, not fabricated);
 *  - `resource-exhaustion` / `timeout` — not emitted by the P1
 *                                contract core (no compute budgets, no
 *                                latency budgets at contract level);
 *                                reserved for real substrate occupants;
 *  - `license-blocked`         — not emitted by this lane (no
 *                                substrate is integrated at P1; the
 *                                license matrices live in the P0
 *                                evidence sets).
 */

import type { FailureKind } from "@aise/provider-registry";

/** A typed, machine-readable lane refusal. Never a throw. */
export interface LaneFailure {
  /** From the CLOSED HFX-000 vocabulary — imported, never modified. */
  readonly kind: FailureKind;
  /** Which lane port refused, e.g. `layer1.capture.spatialize`. */
  readonly port: string;
  /** The honest reason (never a stack trace, never fabricated). */
  readonly detail: string;
  /** The AISE element/asset/session id in hand, when one was. */
  readonly subjectId: string | null;
}

/** The discriminated outcome of every lane transform. */
export type LaneOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: LaneFailure };

/** Construct a success outcome. */
export function laneOk<T>(value: T): LaneOutcome<T> {
  return { ok: true, value };
}

/** Construct a typed lane refusal (fail-closed evidence). */
export function laneRefuse<T>(
  kind: FailureKind,
  port: string,
  detail: string,
  subjectId: string | null = null,
): LaneOutcome<T> {
  return { ok: false, failure: { kind, port, detail, subjectId } };
}

/** Type guard: is this lane outcome a refusal? */
export function isLaneRefusal<T>(
  outcome: LaneOutcome<T>,
): outcome is { ok: false; readonly failure: LaneFailure } {
  return outcome.ok === false;
}

/**
 * The identity-quarantine refusal constructor: a substrate-shaped id
 * found in a canonical identity field. Names the matched pattern (the
 * machine-readable evidence) and the field it was found in.
 */
export function identityLeakRefusal<T>(
  port: string,
  field: string,
  value: string,
  matchedPattern: string,
): LaneOutcome<T> {
  return laneRefuse<T>(
    "contract-mismatch",
    port,
    `identity quarantine: ${field} carries a substrate-shaped id (pattern ${matchedPattern}) — ` +
      `substrate ids are namespaced external labels at most, never canonical AISE identity`,
    value,
  );
}
