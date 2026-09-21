/**
 * PROD-025 — uncertainty and unresolved-assumption propagation suite.
 *
 * Proves:
 *  - a review-needed validation finding (Phase 1 limit exceedance)
 *    propagates into the BOQ as an explicit assumption, carried by the
 *    affected lines through their identity-stable assumptionRefs, with the
 *    check detail VERBATIM in the statement;
 *  - an unknown-capability finding propagates the same way;
 *  - a STATED effect-quantity uncertainty is carried verbatim on the line
 *    quantity (absent = not stated — never zero, never fabricated);
 *  - conflicting uncertainty statements across a merged line's
 *    contributions carry the FIRST stated AND an uncertainty-conflict
 *    assumption documenting every statement (nothing dropped);
 *  - a pass-only snapshot with no stated uncertainties yields NO
 *    assumptions and NO uncertainty fields.
 */

import { describe, expect, test } from "bun:test";
import { deriveSolutionBoq } from "./index";
import {
  contractIntent,
  plasterPassIntent,
  replayWorld,
  reviewNeededWorld,
  twoPassWorld,
  unknownOutcomeWorld,
  validateWorld,
  wallUpgradeWorld,
  withStatedUncertainties,
} from "./testkit";

describe("unresolved validation checks propagate as explicit assumptions", () => {
  test("a review-needed Phase 1 limit exceedance reaches every line", () => {
    const world = reviewNeededWorld();
    expect(world.snapshot.outcome).toBe("review-needed");
    const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    expect(boq.assumptions.length).toBe(1);
    const assumption = boq.assumptions[0]!;
    expect(assumption.origin).toEqual({
      kind: "validation-check",
      checkId: "operation.phase1-limits",
      result: "review-needed",
    });
    // the check's deterministic detail is carried VERBATIM
    const check = world.snapshot.checks.find((entry) => entry.checkId === "operation.phase1-limits");
    expect(assumption.statement).toContain(check?.detail ?? "");
    // BOQ-wide: every line references the assumption in its identity-stable payload
    for (const line of boq.lines) {
      expect(line.assumptionRefs).toContain(assumption.assumptionId);
    }
    // and the snapshot echo surfaces the non-pass outcome
    expect(boq.validationSnapshot.outcome).toBe("review-needed");
  });

  test("an unknown-capability finding propagates (never conflated with fail)", () => {
    const world = unknownOutcomeWorld();
    expect(world.snapshot.outcome).toBe("unknown");
    const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    const unknownAssumptions = boq.assumptions.filter(
      (assumption) =>
        assumption.origin.kind === "validation-check" && assumption.origin.result === "unknown",
    );
    expect(unknownAssumptions.length).toBe(1);
    const unknownOrigin = unknownAssumptions[0]?.origin;
    expect(
      unknownOrigin?.kind === "validation-check" &&
        unknownOrigin.checkId === "operation.capability-declared",
    ).toBe(true);
    for (const line of boq.lines) {
      expect(line.assumptionRefs).toContain(unknownAssumptions[0]!.assumptionId);
    }
  });
});

describe("stated uncertainty propagates verbatim (never fabricated)", () => {
  const world = twoPassWorld();
  const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });

  test("a single stated uncertainty is carried verbatim on the line quantity", () => {
    // the two-pass world states ±0.5 m2 (pass 1) and CONFLICTING ±0.2 m2
    // (pass 2): the merged line carries the FIRST stated (±0.5) verbatim…
    const plasterArea = boq.lines.find(
      (line) => line.activity === "plaster-application" && line.quantity.dimension === "area",
    );
    expect(plasterArea?.quantity.uncertainty).toEqual({ kind: "DIMENSIONAL", plusMinus: 0.5 });
    expect(plasterArea?.trace.quantity.uncertainty).toEqual({ kind: "DIMENSIONAL", plusMinus: 0.5 });
    // …and the conflict is documented entry-wise, never silently dropped
    const conflicts = boq.assumptions.filter(
      (assumption) => assumption.origin.kind === "uncertainty-conflict",
    );
    expect(conflicts.length).toBe(2); // the area line and the volume line
    const conflictIds = new Set(conflicts.map((assumption) => assumption.assumptionId));
    // the area line references EXACTLY its own conflict assumption
    const areaLineConflicts = (plasterArea?.assumptionRefs ?? []).filter((id) =>
      conflictIds.has(id),
    );
    expect(areaLineConflicts.length).toBe(1);
    const areaConflict = conflicts.find(
      (assumption) => assumption.assumptionId === areaLineConflicts[0],
    );
    // the conflict statement documents BOTH stated statements (±0.5 and ±0.2)
    expect(areaConflict?.statement).toContain("0.5");
    expect(areaConflict?.statement).toContain("0.2");
    expect(areaConflict?.affectedOperationIds.length).toBe(2);
    // non-plaster lines reference NO conflict assumption
    for (const line of boq.lines) {
      if (line.activity !== "plaster-application") {
        expect(
          line.assumptionRefs.filter((id) => conflictIds.has(id)).length,
        ).toBe(0);
      }
    }
  });

  test("non-plaster lines carry no fabricated uncertainty (absent = not stated)", () => {
    for (const line of boq.lines) {
      if (line.activity !== "plaster-application") {
        expect(line.quantity.uncertainty).toBeUndefined();
      }
    }
  });

  test("identical statements across contributions carry once, without conflict entries", () => {
    // rebuild the two-pass world with IDENTICAL statements on both passes
    const replayed = replayWorld(
      [
        contractIntent("valid-demolition-removal"),
        contractIntent("valid-block-wall-placement"),
        plasterPassIntent("intent-boq-two-pass-0001", "geo-wall-faces-002", 30),
        plasterPassIntent("intent-boq-two-pass-0002", "geo-wall-line-003", 30),
      ],
      1,
    );
    const identical = withStatedUncertainties(replayed, [
      {
        intentRef: "intent-boq-two-pass-0001",
        area: { kind: "DIMENSIONAL", plusMinus: 0.5 },
        volume: { kind: "DIMENSIONAL", plusMinus: 0.015 },
      },
      {
        intentRef: "intent-boq-two-pass-0002",
        area: { kind: "DIMENSIONAL", plusMinus: 0.5 },
        volume: { kind: "DIMENSIONAL", plusMinus: 0.015 },
      },
    ]);
    const snapshot = validateWorld(identical);
    const identicalBoq = deriveSolutionBoq({ version: identical, snapshot });
    expect(
      identicalBoq.assumptions.filter(
        (assumption) => assumption.origin.kind === "uncertainty-conflict",
      ).length,
    ).toBe(0);
    const plasterArea = identicalBoq.lines.find(
      (line) => line.activity === "plaster-application" && line.quantity.dimension === "area",
    );
    expect(plasterArea?.quantity.uncertainty).toEqual({ kind: "DIMENSIONAL", plusMinus: 0.5 });
  });
});

describe("a clean pass snapshot carries no assumptions", () => {
  test("no non-pass checks, no stated uncertainties → no assumption entries", () => {
    const world = wallUpgradeWorld();
    const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });
    expect(boq.assumptions).toEqual([]);
    for (const line of boq.lines) {
      expect(line.assumptionRefs).toEqual([]);
      expect(line.quantity.uncertainty).toBeUndefined();
    }
  });
});
