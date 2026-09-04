/**
 * The AISE-016 decision-contract suite: the fail-closed parse
 * of `POST /review/api/decide` bodies.
 *
 * The contract is the write path's first gate — malformed input
 * must NEVER reach canonical code. Every rule is pinned here,
 * including the cross-field rules (CONFIRM needs evidence,
 * PROPOSE carries none, existence cannot be proposed).
 */
import { describe, expect, it } from "vitest";
import { canonicalActor, parseReviewDecisionBody } from "./decision-contract";

describe("valid bodies parse to the typed request", () => {
  it("parses CONFIRM with a registered evidence identity", () => {
    const result = parseReviewDecisionBody({
      modelId: "model-golden-room",
      version: 2,
      entityId: "room-golden-room",
      propertyKey: "roomHeight",
      decision: "CONFIRM",
      evidenceId: "ev-c18c75c36a35371a",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.decision).toBe("CONFIRM");
      expect(result.request.evidenceId).toBe("ev-c18c75c36a35371a");
      expect(result.request.measurement).toBeUndefined();
      expect(result.request.proposal).toBeUndefined();
    }
  });

  it("parses CONFIRM with a full manual measurement", () => {
    const result = parseReviewDecisionBody({
      modelId: "model-golden-room",
      version: 2,
      entityId: "room-golden-room",
      propertyKey: "roomHeight",
      decision: "CONFIRM",
      measurement: {
        value: 2.71,
        unit: "meter",
        method: "survey/laser-tape",
        measuredBy: "surveyor-bob",
        measuredAt: "2026-09-04T14:30:00Z",
        uncertaintyU: 0.01,
        confidence: 0.9,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.measurement?.value).toBe(2.71);
      expect(result.request.measurement?.uncertaintyU).toBe(0.01);
      expect(result.request.measurement?.confidence).toBe(0.9);
    }
  });

  it("parses CONFIRM of object existence (no propertyKey)", () => {
    const result = parseReviewDecisionBody({
      modelId: "model-golden-room",
      version: 2,
      entityId: "obj-door-0001",
      decision: "CONFIRM",
      evidenceId: "ev-abc123",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.propertyKey).toBeUndefined();
    }
  });

  it("parses PROPOSE with a replacement estimate", () => {
    const result = parseReviewDecisionBody({
      modelId: "model-golden-room",
      version: 2,
      entityId: "room-golden-room",
      propertyKey: "roomHeight",
      decision: "PROPOSE",
      proposal: { value: 2.75, unit: "meter", uncertaintyU: 0.05, confidence: 0.6 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.proposal?.value).toBe(2.75);
      expect(result.request.proposal?.unit).toBe("meter");
    }
  });
});

describe("the parse fails closed on every malformed shape", () => {
  it("rejects non-objects outright", () => {
    expect(parseReviewDecisionBody(null).ok).toBe(false);
    expect(parseReviewDecisionBody("x").ok).toBe(false);
    expect(parseReviewDecisionBody([1]).ok).toBe(false);
  });

  it("rejects missing or malformed identifiers", () => {
    const cases: unknown[] = [
      { version: 2, entityId: "e", decision: "PROPOSE", propertyKey: "k", proposal: { value: 1, unit: "meter" } },
      { modelId: "m", entityId: "e", decision: "PROPOSE", propertyKey: "k", proposal: { value: 1, unit: "meter" } },
      { modelId: "m", version: 2, decision: "PROPOSE", propertyKey: "k", proposal: { value: 1, unit: "meter" } },
      { modelId: "m", version: 0, entityId: "e", decision: "PROPOSE", propertyKey: "k", proposal: { value: 1, unit: "meter" } },
      { modelId: "m", version: 2.5, entityId: "e", decision: "PROPOSE", propertyKey: "k", proposal: { value: 1, unit: "meter" } },
      { modelId: "m!", version: 2, entityId: "e", decision: "PROPOSE", propertyKey: "k", proposal: { value: 1, unit: "meter" } },
    ];
    for (const body of cases) {
      const result = parseReviewDecisionBody(body);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    }
  });

  it("rejects unknown decision kinds", () => {
    const result = parseReviewDecisionBody({
      modelId: "m",
      version: 2,
      entityId: "e",
      decision: "APPROVE",
      propertyKey: "k",
      proposal: { value: 1, unit: "meter" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("decision"))).toBe(true);
    }
  });

  it("CONFIRM without evidence is refused (evidence is mandatory)", () => {
    const result = parseReviewDecisionBody({
      modelId: "m",
      version: 2,
      entityId: "e",
      propertyKey: "k",
      decision: "CONFIRM",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("CONFIRM requires evidence"))).toBe(true);
    }
  });

  it("CONFIRM with BOTH evidenceId and measurement is refused (never a guess)", () => {
    const result = parseReviewDecisionBody({
      modelId: "m",
      version: 2,
      entityId: "e",
      propertyKey: "k",
      decision: "CONFIRM",
      evidenceId: "ev-1",
      measurement: { value: 1, unit: "meter", method: "survey/tape", measuredBy: "bob", measuredAt: "2026-09-04T10:00:00Z" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("not both"))).toBe(true);
    }
  });

  it("PROPOSE without propertyKey is refused (existence cannot be proposed)", () => {
    const result = parseReviewDecisionBody({
      modelId: "m",
      version: 2,
      entityId: "e",
      decision: "PROPOSE",
      proposal: { value: 1, unit: "meter" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("existence cannot be proposed"))).toBe(true);
    }
  });

  it("PROPOSE without a proposal payload is refused", () => {
    const result = parseReviewDecisionBody({
      modelId: "m",
      version: 2,
      entityId: "e",
      propertyKey: "k",
      decision: "PROPOSE",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("PROPOSE requires"))).toBe(true);
    }
  });

  it("PROPOSE carrying evidence is refused (a proposal is an estimate by construction)", () => {
    const result = parseReviewDecisionBody({
      modelId: "m",
      version: 2,
      entityId: "e",
      propertyKey: "k",
      decision: "PROPOSE",
      proposal: { value: 1, unit: "meter" },
      evidenceId: "ev-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("carries no evidence"))).toBe(true);
    }
  });

  it("rejects out-of-vocabulary units, bad timestamps, invalid uncertainties and confidences", () => {
    const base = {
      modelId: "m",
      version: 2,
      entityId: "e",
      propertyKey: "k",
      decision: "CONFIRM",
    };
    const badUnit = parseReviewDecisionBody({
      ...base,
      measurement: { value: 1, unit: "furlong", method: "m", measuredBy: "b", measuredAt: "2026-09-04T10:00:00Z" },
    });
    expect(badUnit.ok).toBe(false);

    const badTime = parseReviewDecisionBody({
      ...base,
      measurement: { value: 1, unit: "meter", method: "m", measuredBy: "b", measuredAt: "2026-09-04 10:00" },
    });
    expect(badTime.ok).toBe(false);

    const badU = parseReviewDecisionBody({
      ...base,
      measurement: {
        value: 1,
        unit: "meter",
        method: "m",
        measuredBy: "b",
        measuredAt: "2026-09-04T10:00:00Z",
        uncertaintyU: -1,
      },
    });
    expect(badU.ok).toBe(false);
    if (!badU.ok) {
      expect(badU.errors.some((error) => error.includes("finite positive"))).toBe(true);
    }

    const badConfidence = parseReviewDecisionBody({
      ...base,
      measurement: {
        value: 1,
        unit: "meter",
        method: "m",
        measuredBy: "b",
        measuredAt: "2026-09-04T10:00:00Z",
        confidence: 1.5,
      },
    });
    expect(badConfidence.ok).toBe(false);

    const nonFinite = parseReviewDecisionBody({
      ...base,
      measurement: { value: "tall", unit: "meter", method: "m", measuredBy: "b", measuredAt: "2026-09-04T10:00:00Z" },
    });
    expect(nonFinite.ok).toBe(false);
  });

  it("collects ALL errors together (complete refusal reasons, never one at a time)", () => {
    const result = parseReviewDecisionBody({ decision: "CONFIRM" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // modelId, version, entityId AND the evidence rule all fail together.
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("canonicalActor sanitizes the session identity", () => {
  it("prefixes with user: and truncates to the canonical bound", () => {
    expect(canonicalActor("engineer")).toBe("user:engineer");
    const long = "a".repeat(200);
    expect(canonicalActor(long).length).toBeLessThanOrEqual(120);
  });
});

describe("the typed request is serializable and readonly-shaped", () => {
  it("round-trips a CONFIRM request through JSON without field drift", () => {
    const body = {
      modelId: "model-golden-room",
      version: 2,
      entityId: "room-golden-room",
      propertyKey: "roomHeight",
      decision: "CONFIRM",
      evidenceId: "ev-c18c75c36a35371a",
    };
    const first = parseReviewDecisionBody(body);
    const second = parseReviewDecisionBody(JSON.parse(JSON.stringify(body)));
    expect(first).toEqual(second);
  });
});
