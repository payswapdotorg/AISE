/**
 * WORLD-P3 — the SEQUENCING family's two in-memory SUBSTITUTION DOUBLES
 * — THE REPLAY-LEDGER DOUBLES (the audit-trail store substrate seam).
 *
 * Both implement the `SolutionReplayLedger` port — the append-only
 * store of the interactive world's replay log. The real ledger (a
 * persisted, server-side audit store in P4) is a future occupant; the
 * doubles prove the ledger CONTRACT implementable and produce
 * byte-identical logs:
 *
 *  - `InMemoryReplayLedgerReferenceDouble` — DIRECT append: each event
 *    is appended through `appendReplayEvent` and the log held as-is;
 *  - `InMemoryReplayLedgerAlternateDouble` — ROUND-TRIP append: the
 *    same appends, but the log is canonical-JSON round-tripped at every
 *    read — proving the log wire record is stable across a store swap
 *    (a future real store answering with the wire bytes is the same
 *    audit trail).
 *
 * HONESTY: both verify the chain BEFORE every append and at every read
 * (a tampered store fails closed with the typed chain refusal — the
 * append-only law is enforced, never assumed).
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { laneRefused, type LaneOutcome, type Layer3Family } from "../seam";
import {
  appendReplayEvent,
  openReplayLog,
  verifyReplayLog,
  REPLAY_LEDGER_PORT_ID,
  type ReplayLedgerCapabilities,
  type SolutionReplayEvent,
  type SolutionReplayLedger,
  type SolutionReplayLog,
} from "./contract";

const FAMILY: Layer3Family = "sequencing";

const SHARED_CAPABILITIES: ReplayLedgerCapabilities = {
  maxEntries: 1000,
  blocked: [
    {
      capability: "persisted audit-trail store",
      reason:
        "in-memory substitution double — the log is held in memory only; the real " +
        "persisted ledger occupant arrives in WORLD-P4/P5 (the wire shape is proven here)",
    },
    {
      capability: "cross-session replay export",
      reason:
        "the P3 ledger serves ONE solution-version session; cross-session history is " +
        "a P5 composition over per-session logs",
    },
  ],
};

/** The reference double: direct append + direct service. */
export class InMemoryReplayLedgerReferenceDouble implements SolutionReplayLedger {
  readonly portId = REPLAY_LEDGER_PORT_ID;
  readonly capabilities: ReplayLedgerCapabilities = SHARED_CAPABILITIES;

  private log: SolutionReplayLog;

  constructor(solutionId: string, versionNumber: number) {
    this.log = openReplayLog(solutionId, versionNumber);
  }

  currentLog(): LaneOutcome<SolutionReplayLog> {
    return verifyThenServe(this.log);
  }

  append(event: SolutionReplayEvent): LaneOutcome<SolutionReplayLog> {
    const next = appendReplayEvent(this.log, event);
    if (!next.ok) {
      return next;
    }
    this.log = next.value;
    return verifyThenServe(this.log);
  }
}

/** The alternate double: round-trip service (the wire-stability proof). */
export class InMemoryReplayLedgerAlternateDouble implements SolutionReplayLedger {
  readonly portId = REPLAY_LEDGER_PORT_ID;
  readonly capabilities: ReplayLedgerCapabilities = SHARED_CAPABILITIES;

  private log: SolutionReplayLog;

  constructor(solutionId: string, versionNumber: number) {
    this.log = openReplayLog(solutionId, versionNumber);
  }

  currentLog(): LaneOutcome<SolutionReplayLog> {
    const served = verifyThenServe(this.log);
    if (!served.ok) {
      return served;
    }
    const roundTripped: unknown = JSON.parse(canonicalJsonStringify(served.value));
    return { ok: true, value: roundTripped as SolutionReplayLog };
  }

  append(event: SolutionReplayEvent): LaneOutcome<SolutionReplayLog> {
    const next = appendReplayEvent(this.log, event);
    if (!next.ok) {
      return next;
    }
    this.log = next.value;
    const served = verifyThenServe(this.log);
    if (!served.ok) {
      return served;
    }
    const roundTripped: unknown = JSON.parse(canonicalJsonStringify(served.value));
    return { ok: true, value: roundTripped as SolutionReplayLog };
  }
}

/** Verify the chain, then serve (the shared fail-closed gate). */
function verifyThenServe(
  log: SolutionReplayLog,
): LaneOutcome<SolutionReplayLog> {
  const verification = verifyReplayLog(log);
  if (!verification.ok) {
    return laneRefused<SolutionReplayLog>(
      FAMILY,
      verification.failure.kind,
      verification.failure.detail,
    );
  }
  return { ok: true, value: log };
}

/** Construct the reference ledger double. */
export function referenceReplayLedgerDouble(
  solutionId: string,
  versionNumber: number,
): SolutionReplayLedger {
  return new InMemoryReplayLedgerReferenceDouble(solutionId, versionNumber);
}

/** Construct the alternate ledger double. */
export function alternateReplayLedgerDouble(
  solutionId: string,
  versionNumber: number,
): SolutionReplayLedger {
  return new InMemoryReplayLedgerAlternateDouble(solutionId, versionNumber);
}
