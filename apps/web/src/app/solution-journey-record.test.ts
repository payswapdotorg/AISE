/**
 * PROD-031 — the COMMITTED SEEDED JOURNEY RECORD parity tests (the
 * browser mount's record source, §4.6: "choose the design that keeps ONE
 * record — no second serialization").
 *
 * THE CHOICE (documented in docs/productization-evidence/PROD-031): the
 * browser mount renders the composed surface from the COMMITTED record —
 * the seeded journey's output serialized ONCE by the committed generator
 * (`solution-journey-record.generate.ts`). The record's identity fields
 * (operation ids, state ids, the journeyId seal) are engine derivations
 * (sha-256 over canonical JSON through `node:crypto`) that a plain browser
 * cannot recompute, and the backend has no composed-journey route (the
 * runner lives in apps/web — the backend zone may not import it, the
 * frozen AISE-001 boundary), so committed data is the honest source.
 *
 * These tests pin BOTH sides of the parity:
 *
 *  - the committed JSON deep-equals the LIVE Node run of the ONE runner
 *    (the same call `seededJourneyResource()` makes — a drift in the
 *    world/script/engine fails here; the fix is re-running the generator);
 *  - the committed JSON's canonical serialization is IDENTICAL to the
 *    live record's (the JSON round-trip is lossless for this data — no
 *    second serialization exists anywhere);
 *  - the record the browser mount will render carries the committed
 *    world pins + the twelve-step shape (the PROD-026 behavior contract).
 *
 * Deterministic: committed files + the pure runner only.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "../../../../packages/shared-contracts/src/index";
import { runComposedJourney, seededJourneyWorld } from "./solution-journey";
import type { ComposedJourneyRecord } from "./solution-journey";
import committedRecordJson from "./solution-journey-record.json" with { type: "json" };

const committed = committedRecordJson as unknown as ComposedJourneyRecord;

describe("PROD-031 the committed seeded journey record (the browser mount's record source)", () => {
  test("deep-equals the LIVE Node run of the ONE runner (no drift, no second record)", async () => {
    const live = (await runComposedJourney(seededJourneyWorld(), "mixed")).record;
    expect(committed).toEqual(live);
  });

  test("its canonical serialization is IDENTICAL to the live record's (the round-trip is lossless)", async () => {
    const live = (await runComposedJourney(seededJourneyWorld(), "mixed")).record;
    expect(canonicalJsonStringify(committed)).toBe(canonicalJsonStringify(live));
  });

  test("the committed file itself is the generator's byte-exact output shape (pretty JSON + trailing newline)", () => {
    const text = readFileSync(
      join(import.meta.dir, "solution-journey-record.json"),
      "utf8",
    );
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toEqual(committed);
  });

  test("carries the committed demo world pins and the twelve-step journey shape (the PROD-026 contract)", () => {
    expect(committed.world.projectId).toBe("proj-demo-001");
    expect(committed.world.caseId).toBe("case-demo-wall-001");
    expect(committed.world.solutionId).toBe("solution-demo-001");
    expect(committed.world.baselineRealityVersionId).toBe("rgv-demo-0007");
    expect(committed.steps).toHaveLength(12);
    expect(committed.mode).toBe("mixed");
    // The observed-reality seal: the scene digest is identical before and
    // after the whole journey, and every proposed state carries the
    // PROPOSED seal over the pinned baseline.
    expect(committed.seal.observedSceneDigestBefore).toBe(committed.seal.observedSceneDigestAfter);
    expect(committed.seal.everyStateSealedProposed).toBe(true);
    expect(committed.seal.sealedStateCount).toBeGreaterThan(0);
    // The BOQ + the revised BOQ are present (the trace panel + the
    // revision record render from them).
    expect(committed.boq.lines.length).toBeGreaterThan(0);
    expect(committed.revisedBoq).not.toBeNull();
    expect(committed.boqTraceSet.lineTraces.length).toBeGreaterThan(0);
    // The journeyId seal is a sha-256 hex digest (the engine derivation,
    // committed — never recomputed browser-side).
    expect(committed.journeyId).toMatch(/^[0-9a-f]{64}$/);
  });
});
