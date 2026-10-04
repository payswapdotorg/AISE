/**
 * WORLD-P2 — the ACTION family's two in-memory SUBSTITUTION DOUBLES.
 *
 * Two ports live here, each with a reference/alternate pair:
 *
 *  - the `ActionRecorder` port: `referenceActionRecorderDouble` (direct
 *    record + seal) and `alternateActionRecorderDouble` (canonical-JSON
 *    round-trip before sealing) — BYTE-IDENTICAL actions on the
 *    committed fixtures.
 *  - the `AuditLedger` port: `referenceAuditLedgerDouble` (direct append
 *    through the canonical chain builder) and `alternateAuditLedgerDouble`
 *    (append + immediate full-chain re-derivation, returning the
 *    re-derived trail) — BYTE-IDENTICAL trails on the committed
 *    fixtures, and both refuse a tampered trail on replay verification.
 *
 * The real occupants (the WORLD-P4 wiring over the backend case/action
 * store and persistence) are future occupants; the doubles prove the
 * contracts implementable WITHOUT any store.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  laneRefused,
  type LaneOutcome,
  type LaneProviderDescriptor,
} from "../seam";
import type {
  ActionRecorder,
  AuditLedger,
  AuditRecord,
  AuditTrail,
  RecordActionInput,
} from "./contract";
import {
  buildAuditRecord,
  recordProblemAction,
  verifyAuditReplay,
} from "./contract";

export const REFERENCE_RECORDER_DESCRIPTOR: LaneProviderDescriptor = {
  providerId: "layer2-experience.action.reference-recorder-double",
  family: "action",
  technologyVersion: "action-recorder-reference-double/1.0.0",
  engineNote:
    "in-memory substitution double — direct action record + seal over the committed fixtures; " +
    "no backend case/action store integrated",
  laneStatement:
    "AISE Layer-2 experience lane (WORLD-P2): typed actions with explicit ownership, governed " +
    "status lifecycle and gate-governed consequential actions.",
};

export const ALTERNATE_RECORDER_DESCRIPTOR: LaneProviderDescriptor = {
  providerId: "layer2-experience.action.alternate-recorder-double",
  family: "action",
  technologyVersion: "action-recorder-alternate-double/1.0.0",
  engineNote:
    "in-memory substitution double — canonical-JSON round-trip record + seal over the committed " +
    "fixtures; no backend case/action store integrated",
  laneStatement:
    "AISE Layer-2 experience lane (WORLD-P2): typed actions with explicit ownership, governed " +
    "status lifecycle and gate-governed consequential actions.",
};

export const REFERENCE_LEDGER_DESCRIPTOR: LaneProviderDescriptor = {
  providerId: "layer2-experience.action.reference-ledger-double",
  family: "action",
  technologyVersion: "audit-ledger-reference-double/1.0.0",
  engineNote:
    "in-memory substitution double — direct append through the canonical chain builder; " +
    "no backend persistence integrated",
  laneStatement:
    "AISE Layer-2 experience lane (WORLD-P2): the append-only audit trail — every lane " +
    "transition a who/what/when/why/evidence-bound record with chained digests.",
};

export const ALTERNATE_LEDGER_DESCRIPTOR: LaneProviderDescriptor = {
  providerId: "layer2-experience.action.alternate-ledger-double",
  family: "action",
  technologyVersion: "audit-ledger-alternate-double/1.0.0",
  engineNote:
    "in-memory substitution double — append + full-chain re-derivation (the wire-stability proof); " +
    "no backend persistence integrated",
  laneStatement:
    "AISE Layer-2 experience lane (WORLD-P2): the append-only audit trail — every lane " +
    "transition a who/what/when/why/evidence-bound record with chained digests.",
};

/* ------------------------------------------------------------------ */
/* The action recorder pair                                             */
/* ------------------------------------------------------------------ */

export const referenceActionRecorderDouble: ActionRecorder = {
  descriptor: REFERENCE_RECORDER_DESCRIPTOR,
  record: (input, gate) => recordProblemAction(input, gate),
};

export const alternateActionRecorderDouble: ActionRecorder = {
  descriptor: ALTERNATE_RECORDER_DESCRIPTOR,
  record: (input, gate) => {
    /* The mechanical difference: the input travels through the canonical
     * wire form before recording — a wire-unstable action contract would
     * drift here and the byte-identity assertion would fail. */
    const wireText = canonicalJsonStringify(input);
    const reparsed = JSON.parse(wireText) as RecordActionInput;
    return recordProblemAction(reparsed, gate);
  },
};

/* ------------------------------------------------------------------ */
/* The audit ledger pair                                                */
/* ------------------------------------------------------------------ */

function sealTrail(problemId: string, records: readonly AuditRecord[]): AuditTrail {
  return {
    kind: "layer2-audit-trail",
    schemaVersion: "layer2-audit-trail/1",
    problemId,
    records,
  };
}

export const referenceAuditLedgerDouble: AuditLedger = {
  descriptor: REFERENCE_LEDGER_DESCRIPTOR,
  append: (trail, entry) => {
    const record = buildAuditRecord(trail, entry);
    if (!record.ok) {
      return record;
    }
    return {
      ok: true,
      value: sealTrail(
        entry.problemId,
        trail === null ? [record.value] : [...trail.records, record.value],
      ),
    };
  },
  verifyReplay: (trail) => verifyAuditReplay(trail),
};

export const alternateAuditLedgerDouble: AuditLedger = {
  descriptor: ALTERNATE_LEDGER_DESCRIPTOR,
  append: (trail, entry) => {
    const record = buildAuditRecord(trail, entry);
    if (!record.ok) {
      return record;
    }
    const appended: AuditTrail = sealTrail(
      entry.problemId,
      trail === null ? [record.value] : [...trail.records, record.value],
    );
    /* The mechanical difference: the whole appended trail travels through
     * the canonical wire form and is re-derived from the parsed bytes —
     * proving the trail contract is wire-stable (the same bytes yield the
     * same chained digests). */
    const wireText = canonicalJsonStringify(appended);
    const reparsed = JSON.parse(wireText) as AuditTrail;
    const replay = verifyAuditReplay(reparsed);
    if (!replay.ok) {
      return laneRefused(
        "action",
        "operation-semantic-failure",
        `the re-derived trail failed its own replay verification: ${replay.failures
          .map((failure) => `${failure.kind} at ${failure.sequence} (${failure.detail})`)
          .join("; ")}`,
      );
    }
    return { ok: true, value: reparsed };
  },
  verifyReplay: (trail) => verifyAuditReplay(trail),
};

/* A typed helper for audit-append refusals (used by the lane runner). */
export function ledgerRefused<T>(detail: string): LaneOutcome<T> {
  return laneRefused<T>("action", "contract-mismatch", detail);
}
