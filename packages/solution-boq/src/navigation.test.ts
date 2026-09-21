/**
 * PROD-025 — bidirectional navigation suite.
 *
 * Proves (over the committed fixture worlds):
 *  - BOQ line → contributing operations: resolved through the CONTRACT's
 *    `resolveOperationsForLine`, enriched with each operation's geometry
 *    TARGET refs, reality node refs and resulting proposed state (the
 *    solution step);
 *  - operation → generated/modified/removed lines: resolved through the
 *    CONTRACT's `resolveLinesForOperation`, with the contribution kind;
 *  - the ROUND TRIP closes for every line (line → ops → lines recovers
 *    the original line — version-pinned by the trace set);
 *  - unknown ids answer EXPLICITLY (undefined), a KNOWN operation without
 *    lines answers an honest EMPTY array (never a silent guess);
 *  - navigation is version-pinned: a v1 operation id navigates nowhere in
 *    the v2 BOQ (operations are version-pinned identities).
 */

import { describe, expect, test } from "bun:test";
import {
  resolveLinesForOperation,
  resolveOperationsForLine,
} from "@aise/solution-contract";
import {
  assertBoqNavigationRoundTrip,
  deriveSolutionBoq,
  navigateLineToOperations,
  navigateOperationToLines,
} from "./index";
import { lineLessOpWorld, versionPairWorld, wallUpgradeWorld } from "./testkit";

describe("BOQ line → contributing solution steps", () => {
  const world = wallUpgradeWorld();
  const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });

  test("every line navigates to its operation with geometry target refs and the solution step", () => {
    for (const line of boq.lines) {
      const navigation = navigateLineToOperations(boq, line.boqLineId);
      expect(navigation).toBeDefined();
      expect(navigation?.contributions.length).toBeGreaterThanOrEqual(1);
      for (const contribution of navigation?.contributions ?? []) {
        const operation = world.version.operations.find(
          (entry) => entry.operationId === contribution.operationId,
        );
        expect(operation).toBeDefined();
        // the operation → geometry target refs (read-only reality anchors)
        expect(contribution.geometryRefs).toEqual(operation!.target.geometryRefs);
        expect(contribution.nodeRefs).toEqual(operation!.target.nodeRefs);
        // the resulting proposed state = states[operationIndex] (the step)
        expect(contribution.resultingStateRef).toBe(
          world.version.states[contribution.operationIndex]!.stateId,
        );
      }
    }
  });

  test("the resolution runs through the CONTRACT's resolver (trace set)", () => {
    for (const line of boq.lines) {
      const contractAnswer = resolveOperationsForLine(boq.traceSet, line.boqLineId);
      const navigation = navigateLineToOperations(boq, line.boqLineId);
      expect(navigation?.contributions.map((c) => c.operationId)).toEqual(
        contractAnswer?.map((c) => c.operationId),
      );
    }
  });

  test("an unknown line id answers undefined — explicit, never a guess", () => {
    expect(navigateLineToOperations(boq, "boq-line-does-not-exist")).toBeUndefined();
    expect(resolveOperationsForLine(boq.traceSet, "boq-line-does-not-exist")).toBeUndefined();
  });
});

describe("solution step → generated/affected BOQ lines (reverse navigation)", () => {
  const world = wallUpgradeWorld();
  const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });

  test("every quantity-carrying operation reveals the lines it generated", () => {
    for (const operation of world.version.operations) {
      const lines = navigateOperationToLines(boq, operation.operationId);
      expect(lines).toBeDefined();
      expect(lines?.length).toBeGreaterThanOrEqual(1);
      for (const entry of lines ?? []) {
        expect(
          entry.line.contributions.some(
            (contribution) => contribution.operationId === operation.operationId,
          ),
        ).toBe(true);
        expect(["created", "modified", "removed"]).toContain(entry.contributionKind);
      }
    }
  });

  test("the reverse resolution runs through the CONTRACT's resolver", () => {
    const demolition = world.version.operations[0];
    const contractAnswer = resolveLinesForOperation(boq.traceSet, demolition!.operationId);
    const lines = navigateOperationToLines(boq, demolition!.operationId);
    expect(lines?.map((entry) => entry.line.boqLineId)).toEqual(
      contractAnswer.map((trace) => trace.boqLineId),
    );
    // the demolition contributes 'removed' quantity to its two lines
    expect(lines?.every((entry) => entry.contributionKind === "removed")).toBe(true);
  });

  test("a KNOWN operation without quantity effects answers an honest EMPTY array", () => {
    const stripped = lineLessOpWorld();
    const strippedBoq = deriveSolutionBoq({
      version: stripped.version,
      snapshot: stripped.snapshot,
    });
    const backfill = stripped.version.operations.find(
      (operation) => operation.operationType === "backfill",
    );
    expect(backfill).toBeDefined();
    // known to the BOQ's version (navigation completeness inventory)…
    expect(strippedBoq.operationIds.includes(backfill!.operationId)).toBe(true);
    // …but contributes to no line — the honest empty answer
    expect(navigateOperationToLines(strippedBoq, backfill!.operationId)).toEqual([]);
  });

  test("an operation id UNKNOWN to the BOQ's version answers undefined", () => {
    expect(navigateOperationToLines(boq, "op-does-not-exist")).toBeUndefined();
  });
});

describe("the round trip closes", () => {
  const world = wallUpgradeWorld();
  const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });

  test("line → operations → lines recovers the original line, for every line", () => {
    assertBoqNavigationRoundTrip(boq); // throws on any broken hop
    for (const line of boq.lines) {
      const contributions = resolveOperationsForLine(boq.traceSet, line.boqLineId) ?? [];
      for (const contribution of contributions) {
        const back = resolveLinesForOperation(boq.traceSet, contribution.operationId);
        expect(back.some((trace) => trace.boqLineId === line.boqLineId)).toBe(true);
      }
    }
  });

  test("the reverse round trip: every resolved line of an operation round-trips back", () => {
    for (const operation of world.version.operations) {
      const lines = navigateOperationToLines(boq, operation.operationId) ?? [];
      for (const entry of lines) {
        const back = navigateLineToOperations(boq, entry.line.boqLineId);
        expect(
          back?.contributions.some(
            (contribution) => contribution.operationId === operation.operationId,
          ),
        ).toBe(true);
      }
    }
  });
});

describe("navigation is version-pinned", () => {
  const pair = versionPairWorld();
  const v1Boq = deriveSolutionBoq({ version: pair.v1.version, snapshot: pair.v1.snapshot });
  const v2Boq = deriveSolutionBoq({ version: pair.v2.version, snapshot: pair.v2.snapshot });

  test("a v1 operation id navigates NOWHERE in the v2 BOQ (and vice versa)", () => {
    for (const operation of pair.v1.version.operations) {
      expect(v2Boq.operationIds.includes(operation.operationId)).toBe(false);
      expect(navigateOperationToLines(v2Boq, operation.operationId)).toBeUndefined();
    }
    for (const operation of pair.v2.version.operations) {
      expect(v1Boq.operationIds.includes(operation.operationId)).toBe(false);
      expect(navigateOperationToLines(v1Boq, operation.operationId)).toBeUndefined();
    }
  });

  test("the same semantic line under v2 carries v2's operations only", () => {
    const v1Plaster = v1Boq.lines.find(
      (line) => line.activity === "plaster-application" && line.quantity.dimension === "area",
    );
    const v2Plaster = v2Boq.lines.find(
      (line) => line.activity === "plaster-application" && line.quantity.dimension === "area",
    );
    expect(v1Plaster?.contributions.length).toBe(1);
    expect(v2Plaster?.contributions.length).toBe(2);
    const v1OpIds = new Set(
      pair.v1.version.operations.map((operation) => operation.operationId),
    );
    for (const contribution of v2Plaster?.contributions ?? []) {
      expect(v1OpIds.has(contribution.operationId)).toBe(false);
    }
  });
});
