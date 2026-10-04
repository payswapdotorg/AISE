/**
 * WORLD-P2 — the SEAM test suite (colocated with `src/seam.ts`).
 *
 * Drills the lane seam: the eight-stage vocabulary, the family/actor
 * vocabularies, the digest discipline (re-exported VERBATIM from the
 * P0-B seam — proven by digest agreement with that package's own
 * helpers), the HFX-000 closed failure vocabulary (imported, never
 * modified — proven by agreement with `@aise/provider-registry`'s own
 * frozen registry), the declared-instant discipline, the non-interference
 * guard, and the content-id sealing discipline.
 */

import { describe, expect, test } from "bun:test";
import {
  canonicalDigestOf as substrateCanonicalDigestOf,
  textDigestOf as substrateTextDigestOf,
} from "@aise/world-understanding-substrate";
import { FAILURE_KINDS, isFailureKind } from "@aise/provider-registry";
import {
  contentIdOf,
  deepFreeze,
  isCanonicalDigest,
  isDeclaredInstant,
  isLayer2Family,
  isLayer2StageName,
  isLaneActorRole,
  LANE_ACTOR_ROLES,
  LAYER2_FAMILIES,
  LAYER2_LANE_ID,
  LAYER2_LANE_STATEMENT,
  LAYER2_STAGE_NAMES,
  laneRefused,
  textDigestOf,
  canonicalDigestOf,
  type LaneOutcome,
} from "./seam";

describe("seam — the lane identity", () => {
  test("the lane id and statement are the committed constants", () => {
    expect(LAYER2_LANE_ID).toBe("layer2-experience");
    expect(LAYER2_LANE_STATEMENT).toContain("TRANSLATED into the AISE evidence/case architecture");
    expect(LAYER2_LANE_STATEMENT).toContain("Procore's domain model is deliberately NOT copied");
  });

  test("the eight lane stages are the directive's Layer-2 target, in order", () => {
    expect([...LAYER2_STAGE_NAMES]).toEqual([
      "PROBLEM",
      "CONTEXT",
      "EVIDENCE",
      "MISSING_EVIDENCE",
      "BOUNDED_REASONING",
      "DETERMINISTIC_CHECKS",
      "ACTION",
      "AUDIT_TRAIL",
    ]);
  });

  test("the closed vocabularies guard their members", () => {
    expect([...LAYER2_FAMILIES]).toEqual(["problem", "evidence", "reasoning", "action"]);
    expect([...LANE_ACTOR_ROLES]).toEqual([
      "engineer",
      "field_engineer",
      "reviewer",
      "system",
      "bounded_agent",
    ]);
    expect(isLayer2StageName("PROBLEM")).toBe(true);
    expect(isLayer2StageName("DELIVERY")).toBe(false);
    expect(isLayer2Family("problem")).toBe(true);
    expect(isLayer2Family("substrate")).toBe(false);
    expect(isLaneActorRole("reviewer")).toBe(true);
    expect(isLaneActorRole("inspector")).toBe(false);
  });
});

describe("seam — the digest discipline is the P0-B seam's, VERBATIM", () => {
  test("canonicalDigestOf agrees with the understanding substrate's own helper", () => {
    const value = { b: 2, a: 1, nested: { z: "x", y: [3, 2, 1] } };
    expect(canonicalDigestOf(value)).toBe(substrateCanonicalDigestOf(value));
    expect(isCanonicalDigest(canonicalDigestOf(value))).toBe(true);
  });

  test("textDigestOf agrees with the understanding substrate's own helper", () => {
    expect(textDigestOf("AISE-WORLD-P2-seam-agreement")).toBe(
      substrateTextDigestOf("AISE-WORLD-P2-seam-agreement"),
    );
  });

  test("digests are deterministic and content-derived — never labels", () => {
    expect(canonicalDigestOf({ a: 1 })).toBe(canonicalDigestOf({ a: 1 }));
    expect(canonicalDigestOf({ a: 1 })).not.toBe(canonicalDigestOf({ a: 2 }));
    /* IFC-GUID-shaped values are 22 chars — never valid canonical digests. */
    expect(isCanonicalDigest("0xScRe4drECQ4DMSqUjd6d")).toBe(false);
  });
});

describe("seam — the HFX-000 failure vocabulary (imported, never modified)", () => {
  test("lane refusals carry kinds from the closed registry only", () => {
    for (const kind of FAILURE_KINDS) {
      const refusal: LaneOutcome<null> = laneRefused("reasoning", kind, "drill");
      expect(refusal.ok).toBe(false);
      if (!refusal.ok) {
        expect(refusal.failure.kind).toBe(kind);
        expect(refusal.failure.family).toBe("reasoning");
        expect(refusal.failure.detail).toBe("drill");
        expect(isFailureKind(refusal.failure.kind)).toBe(true);
      }
    }
  });

  test("every FAILURE_KINDS member is accepted — the registry is used, not narrowed", () => {
    expect(FAILURE_KINDS).toHaveLength(9);
    expect([...FAILURE_KINDS]).toContain("reasoning-failure");
    expect([...FAILURE_KINDS]).toContain("license-blocked");
  });
});

describe("seam — the shared small helpers", () => {
  test("declared instants are ISO-8601 UTC with milliseconds", () => {
    expect(isDeclaredInstant("2026-10-02T08:00:00.000Z")).toBe(true);
    expect(isDeclaredInstant("2026-10-02T08:00:00Z")).toBe(false);
    expect(isDeclaredInstant("not-a-time")).toBe(false);
    expect(isDeclaredInstant(12345)).toBe(false);
  });

  test("deepFreeze structurally freezes handed-in requests (non-interference)", () => {
    const request = { outer: { inner: [1, 2] }, list: [{ id: "a" }] };
    const frozen = deepFreeze(request);
    expect(() => {
      (frozen as { outer: { inner: number[] } }).outer.inner.push(3);
    }).toThrow();
    expect(() => {
      (frozen as { list: { id: string }[] }).list[0]!.id = "b";
    }).toThrow();
  });

  test("contentIdOf seals the record minus its own id field (the house discipline)", () => {
    const record = { value: 42, problemId: "not-the-seal", note: "x" } as Record<string, unknown>;
    const sealed = contentIdOf(record, "problemId");
    expect(isCanonicalDigest(sealed)).toBe(true);
    /* The seal ignores the id field: two records equal outside the id seal identically. */
    const other = { note: "x", value: 42, problemId: "different" } as Record<string, unknown>;
    expect(contentIdOf(other, "problemId")).toBe(sealed);
  });
});
