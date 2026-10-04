/**
 * WORLD-P3 — the QUANTIFY family's two in-memory SUBSTITUTION DOUBLES
 * — THE BOQ-GRAPH VIEW DOUBLES (the BOQ-store substrate seam).
 *
 * Both implement the `BoqGraphViewAdapter` port — the READ-ONLY
 * resolution of one solution version's derived BOQ. The store behind
 * the port is a replaceable substrate (P4 wires the real store/
 * transport over the backend seam; the P2-style lane discipline), and
 * the BOQ GRAPH ITSELF is not a substrate — it is the AUTHORITY the
 * port serves read-only (the BOQ-authority law). The doubles:
 *
 *  - `InMemoryBoqGraphReferenceDouble` — DIRECT service: the fixture
 *    BOQs (derived through the REAL `deriveSolutionBoq` seam at corpus
 *    build time) are held in a table and served by identity;
 *  - `InMemoryBoqGraphAlternateDouble` — ROUND-TRIP service: the same
 *    table, but every served BOQ is canonical-JSON round-tripped at
 *    serve time — proving the BOQ wire record is stable across a store
 *    swap (a future real store answering with the wire bytes serves
 *    the same authority).
 *
 * Byte-identity: on the committed fixtures both doubles serve
 * byte-identical `SolutionBoq` records (canonical-JSON equality
 * asserted by the tests), and both answer `null` for unknown versions
 * (honest absence — never a fabricated BOQ).
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { SolutionBoq } from "@aise/solution-boq";
import { laneRefused, type LaneOutcome, type Layer3Family } from "../seam";
import type { BoqGraphViewAdapter, BoqGraphViewCapabilities, BoqVersionRequest } from "./contract";

const FAMILY: Layer3Family = "quantify";

/** The capabilities both doubles declare (honest, closed). */
const SHARED_CAPABILITIES: BoqGraphViewCapabilities = {
  maxServedVersions: 100,
  blocked: [
    {
      capability: "persisted multi-project BOQ store",
      reason:
        "in-memory substitution double — the fixture BOQs derived through the REAL " +
        "deriveSolutionBoq seam at corpus-build time are held in a table; the real " +
        "store/transport occupant arrives in WORLD-P4",
    },
    {
      capability: "BOQ version history navigation",
      reason:
        "the P3 view port resolves ONE version per request — history browsing is a " +
        "P4 composition over repeated resolutions",
    },
  ],
};

interface BoqTableEntry {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly boq: SolutionBoq;
}

function keyOf(request: BoqVersionRequest): string {
  return `${request.solutionId}::v${request.versionNumber}`;
}

/* ------------------------------------------------------------------ */
/* The reference double: direct service                                */
/* ------------------------------------------------------------------ */

export class InMemoryBoqGraphReferenceDouble implements BoqGraphViewAdapter {
  readonly portId = "quantify.boq-graph-view/1" as const;
  readonly capabilities: BoqGraphViewCapabilities = SHARED_CAPABILITIES;

  private readonly table: Map<string, BoqTableEntry>;

  constructor(boqs: readonly SolutionBoq[]) {
    this.table = new Map(
      boqs.map((boq) => [
        `${boq.solutionId}::v${boq.versionNumber}`,
        { solutionId: boq.solutionId, versionNumber: boq.versionNumber, boq },
      ] as const),
    );
  }

  resolveBoqVersion(request: BoqVersionRequest): LaneOutcome<SolutionBoq | null> {
    const entry = this.table.get(keyOf(request));
    return { ok: true, value: entry?.boq ?? null };
  }
}

/* ------------------------------------------------------------------ */
/* The alternate double: round-trip service                            */
/* ------------------------------------------------------------------ */

export class InMemoryBoqGraphAlternateDouble implements BoqGraphViewAdapter {
  readonly portId = "quantify.boq-graph-view/1" as const;
  readonly capabilities: BoqGraphViewCapabilities = SHARED_CAPABILITIES;

  private readonly table: Map<string, BoqTableEntry>;

  constructor(boqs: readonly SolutionBoq[]) {
    this.table = new Map(
      boqs.map((boq) => [
        `${boq.solutionId}::v${boq.versionNumber}`,
        { solutionId: boq.solutionId, versionNumber: boq.versionNumber, boq },
      ] as const),
    );
  }

  resolveBoqVersion(request: BoqVersionRequest): LaneOutcome<SolutionBoq | null> {
    const entry = this.table.get(keyOf(request));
    if (entry === undefined) {
      return { ok: true, value: null };
    }
    const roundTripped: unknown = JSON.parse(canonicalJsonStringify(entry.boq));
    return { ok: true, value: roundTripped as SolutionBoq };
  }
}

/** Construct the reference double over the fixture BOQs. */
export function referenceBoqGraphViewDouble(
  boqs: readonly SolutionBoq[],
): BoqGraphViewAdapter {
  return new InMemoryBoqGraphReferenceDouble(boqs);
}

/** Construct the alternate double over the fixture BOQs. */
export function alternateBoqGraphViewDouble(
  boqs: readonly SolutionBoq[],
): BoqGraphViewAdapter {
  return new InMemoryBoqGraphAlternateDouble(boqs);
}

/**
 * The honest refusal helper shared by future real stores: a request
 * with a malformed version context is refused, never silently nulled.
 */
export function refuseMalformedBoqVersionRequest(
  request: BoqVersionRequest,
): LaneOutcome<SolutionBoq | null> {
  if (
    typeof request.solutionId !== "string" ||
    request.solutionId.trim().length === 0 ||
    !Number.isInteger(request.versionNumber) ||
    request.versionNumber < 1
  ) {
    return laneRefused<SolutionBoq | null>(
      FAMILY,
      "contract-mismatch",
      "a BOQ version request requires a non-empty solutionId and a positive integer versionNumber",
    );
  }
  return { ok: true, value: null };
}
