/**
 * WORLD-P4 — the seam tests: the closed vocabularies, the unified
 * lane-failure presentation (the recorded P4 seam decision) and the
 * digest discipline.
 */

import { describe, expect, test } from "bun:test";
import {
  WORLD_UX_LANE_ID,
  HUD_PANEL_IDS,
  HUD_PANEL_ORDER,
  HUD_PANEL_TITLES,
  HUD_CONTENT_STATES,
  WORLD_UX_FAMILIES,
  isHudPanelId,
  isHudContentState,
  isWorldUxFamily,
  unifyLayer1Failure,
  unifyFamilyLaneFailure,
  isWorldUxFailure,
  worldUxOk,
  worldUxRefused,
  isWorldUxRefusal,
  canonicalDigestOf,
  textDigestOf,
  isCanonicalDigest,
  canonicalJsonStringify,
  deepFreeze,
  isDeclaredInstant,
} from "./seam";

describe("the closed vocabularies", () => {
  test("the lane identity is the world program's P4 key", () => {
    expect(WORLD_UX_LANE_ID).toBe("world-ux");
  });

  test("the seven HUD panel ids are exactly the handoff §4 set", () => {
    expect(HUD_PANEL_IDS).toEqual([
      "objective",
      "evidence",
      "constraints",
      "agent",
      "validation",
      "cost-boq",
      "timeline",
    ]);
    expect(HUD_PANEL_ORDER).toEqual(HUD_PANEL_IDS);
  });

  test("every panel id has a display title (presentation, never identity)", () => {
    for (const panelId of HUD_PANEL_IDS) {
      expect(HUD_PANEL_TITLES[panelId].length).toBeGreaterThan(0);
      expect(isHudPanelId(panelId)).toBe(true);
    }
    expect(isHudPanelId("objective")).toBe(true);
    expect(isHudPanelId("Objectives")).toBe(false);
    expect(isHudPanelId("")).toBe(false);
    expect(isHudPanelId(7)).toBe(false);
  });

  test("the honest content states are the closed three", () => {
    expect(HUD_CONTENT_STATES).toEqual(["POPULATED", "EMPTY", "UNAVAILABLE"]);
    expect(isHudContentState("POPULATED")).toBe(true);
    expect(isHudContentState("populated")).toBe(false);
    expect(isHudContentState("LOADING")).toBe(false);
  });

  test("the package families are the closed four", () => {
    expect(WORLD_UX_FAMILIES).toEqual(["hud", "surface", "wiring", "station"]);
    expect(isWorldUxFamily("hud")).toBe(true);
    expect(isWorldUxFamily("hud-panel")).toBe(false);
  });
});

describe("the UNIFIED lane-failure presentation (the recorded P4 seam decision)", () => {
  test("a P2/P3-shaped failure is carried through with kind + detail VERBATIM", () => {
    const unified = unifyFamilyLaneFailure({
      kind: "reasoning-failure",
      family: "layer2.reasoning",
      detail: "the bounded reasoner refused: INSUFFICIENT_EVIDENCE",
    });
    expect(unified).toEqual({
      kind: "reasoning-failure",
      family: "layer2.reasoning",
      detail: "the bounded reasoner refused: INSUFFICIENT_EVIDENCE",
    });
  });

  test("a P1-shaped failure maps onto the family shape with port as family and subject appended", () => {
    const unified = unifyLayer1Failure({
      kind: "contract-mismatch",
      port: "layer1.capture.spatialize",
      detail: "the media type is not spatializable",
      subjectId: "asset-001",
    });
    expect(unified.kind).toBe("contract-mismatch");
    expect(unified.family).toBe("layer1.capture.spatialize");
    expect(unified.detail).toBe(
      "the media type is not spatializable [subject: asset-001]",
    );
  });

  test("a P1-shaped failure without a subject keeps the detail VERBATIM (no suffix)", () => {
    const unified = unifyLayer1Failure({
      kind: "timeout",
      port: "layer1.compare.measure",
      detail: "the measurement query timed out",
      subjectId: null,
    });
    expect(unified.detail).toBe("the measurement query timed out");
    expect(unified.family).toBe("layer1.compare.measure");
  });

  test("the type guard refuses shapes outside the closed failure vocabulary", () => {
    expect(isWorldUxFailure({ kind: "reasoning-failure", family: "f", detail: "d" })).toBe(true);
    expect(isWorldUxFailure({ kind: "invented-failure", family: "f", detail: "d" })).toBe(false);
    expect(isWorldUxFailure({ kind: "timeout", family: "", detail: "d" })).toBe(false);
    expect(isWorldUxFailure(null)).toBe(false);
    expect(isWorldUxFailure("timeout")).toBe(false);
  });
});

describe("the typed outcome", () => {
  test("ok carries the value; refusals carry the family-bound failure", () => {
    expect(worldUxOk(42)).toEqual({ ok: true, value: 42 });
    const refusal = worldUxRefused<string>("hud", "timeout", "too slow");
    expect(isWorldUxRefusal(refusal)).toBe(true);
    if (!isWorldUxRefusal(refusal)) throw new Error("unreachable");
    expect(refusal.failure.family).toBe("hud");
    expect(isWorldUxRefusal(worldUxOk("x"))).toBe(false);
  });
});

describe("the digest + freeze discipline", () => {
  test("canonical JSON is key-sorted and whitespace-free (the digest input law)", () => {
    expect(canonicalJsonStringify({ b: 1, a: [2, { z: 3, y: 4 }] })).toBe(
      '{"a":[2,{"y":4,"z":3}],"b":1}',
    );
  });

  test("the digest is deterministic and representation-independent", () => {
    expect(canonicalDigestOf({ a: 1, b: 2 })).toBe(canonicalDigestOf({ b: 2, a: 1 }));
    expect(canonicalDigestOf({ a: 1 })).not.toBe(canonicalDigestOf({ a: 2 }));
    expect(textDigestOf("aise")).toBe(textDigestOf("aise"));
    expect(textDigestOf("aise")).not.toBe(textDigestOf("aisf"));
  });

  test("the 64-hex canonical digest guard", () => {
    expect(isCanonicalDigest("a".repeat(64))).toBe(true);
    expect(isCanonicalDigest("A".repeat(64))).toBe(false);
    expect(isCanonicalDigest("a".repeat(63))).toBe(false);
    expect(isCanonicalDigest(null)).toBe(false);
  });

  test("deepFreeze freezes nested records and arrays", () => {
    const frozen = deepFreeze({ list: [{ inner: 1 }] });
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.list)).toBe(true);
    expect(Object.isFrozen(frozen.list[0])).toBe(true);
  });

  test("the declared-instant guard (never a clock read)", () => {
    expect(isDeclaredInstant("2026-09-16T12:00:00.000Z")).toBe(true);
    expect(isDeclaredInstant("2026-09-16T12:00:00Z")).toBe(false);
    expect(isDeclaredInstant("2026-09-16 12:00:00.000Z")).toBe(false);
  });
});
