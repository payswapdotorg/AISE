/**
 * POST-004B (POST-003 Defect 1) — the M-record header honesty pin: the
 * `chromiumAvailable` field's render contract for the run-record header.
 *
 * The M journey runs NO browser legs by design (it cites the committed
 * E2B station transcripts), so its record states that by-design fact
 * instead of the old hardcoded `false` — which read as "chromium:
 * UNAVAILABLE — the browser legs fell back…" even on Chromium-capable
 * stations (the W journey's live Chromium runs minutes earlier). The
 * suite pins three things:
 *
 *  1. the "none-by-design" value renders the by-design header;
 *  2. the BOOLEAN values render BYTE-IDENTICALLY to the legacy W/X
 *     strings (the W and X journeys' headers are unchanged — a
 *     strictly-additive union value, never a rewording of their lanes);
 *  3. the field never alters a journey OUTCOME (verdict + status counts
 *     are identical across all three values for the same steps).
 */

import { describe, expect, test } from "bun:test";
import {
  renderRunRecord,
  runPasses,
  statusCounts,
  type RunRecord,
  type StepRecord,
} from "./classes";

/** One fixture step (PASS / deterministic — enough for the verdict checks). */
const STEP: StepRecord = {
  id: "t.step",
  name: "one fixture step",
  status: "PASS",
  evidenceClass: "deterministic",
  classNote: "fixture",
  lines: ["fixture proof line"],
};

/** A minimal run record with the header field as the only variable. */
function record(
  chromiumAvailable: RunRecord["chromiumAvailable"],
): RunRecord {
  return {
    journeyId: "t",
    baseUrl: "(fixture — no serve)",
    baseSource: "local-serve",
    repoSha: "0".repeat(40),
    startedAt: "2026-09-26T00:00:00Z",
    chromiumAvailable,
    sections: [{ id: "t", title: "T — fixture", steps: [STEP] }],
  };
}

describe("POST-004B — the M-record header honesty (Defect 1)", () => {
  test("\"none-by-design\" states the journey has no browser legs BY DESIGN", () => {
    const html = renderRunRecord(record("none-by-design"));
    expect(html).toContain(
      "- chromium: not applicable — this journey has no browser legs by design (its evidence is the committed transcripts; the station's Chromium capability is never claimed as this journey's evidence)",
    );
    // the misleading legacy claims are absent for the by-design journey.
    expect(html).not.toContain("UNAVAILABLE — the browser legs fell back");
    expect(html).not.toContain("the live legs ran in a real headless Chromium");
  });

  test("boolean true renders BYTE-IDENTICALLY to the legacy live-Chromium header (W's lane unchanged)", () => {
    const html = renderRunRecord(record(true));
    expect(html).toContain(
      "- chromium: available — the live legs ran in a real headless Chromium",
    );
    expect(html).not.toContain("not applicable");
  });

  test("boolean false renders BYTE-IDENTICALLY to the legacy fallback header (X's lane unchanged)", () => {
    const html = renderRunRecord(record(false));
    expect(html).toContain(
      "- chromium: UNAVAILABLE — the browser legs fell back to their deterministic proofs (the Class column says so per leg; a live run is never fabricated)",
    );
    expect(html).not.toContain("not applicable");
  });

  test("the header field never alters a journey OUTCOME (verdict + status counts identical)", () => {
    const outcomes = (["none-by-design", true, false] as const).map((value) => {
      const rendered = record(value);
      return {
        passes: runPasses(rendered),
        counts: statusCounts(rendered),
      };
    });
    for (const outcome of outcomes) {
      expect(outcome.passes).toBe(true);
      expect(outcome.counts).toEqual({ pass: 1, fail: 0, blocked: 0 });
    }
  });
});
