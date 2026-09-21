/**
 * Bidirectional BOQ trace tests (PROD-021).
 *
 * Proves the work order's acceptance criterion "BOQ trace objects are
 * bidirectional and version-pinned":
 *  - BOQ line → contributing operations AND operation → created/changed
 *    lines BOTH resolve over the committed trace-set fixture, and the
 *    round trip closes (line → operations → lines includes the line);
 *  - unknown ids answer explicitly (undefined / empty), never silently;
 *  - every line trace in the set pins the set's solution/version/snapshot;
 *  - trace identity is version-pinned by construction (same boqLineId,
 *    different version → different traceId);
 *  - the multi-contribution line (demolition + plaster) resolves both
 *    contributors.
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeSolutionVersion,
  decodeSolutionBoqTraceSet,
  deriveSolutionBoqLineTraceId,
  resolveLinesForOperation,
  resolveOperationsForLine,
  findContribution,
} from "./index";

const FIXTURE = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(import.meta.dir, "..", "fixtures", path), "utf8")) as Record<
    string,
    unknown
  >;

const traceSet = decodeSolutionBoqTraceSet(FIXTURE("trace/SolutionBoqTraceSet.valid.json"));
const version1 = decodeSolutionVersion(FIXTURE("solution/SolutionVersion.valid.json"));

const lineDemolition = "boq-line-demo-0001";
const lineBlockWall = "boq-line-demo-0002";
const linePlaster = "boq-line-demo-0003";

const opDemolition = version1.operations[0]?.operationId ?? "";
const opBlockWall = version1.operations[1]?.operationId ?? "";
const opPlaster = version1.operations[2]?.operationId ?? "";

describe("BOQ line → contributing solution steps", () => {
  test("the demolition line resolves to the demolition operation", () => {
    const contributions = resolveOperationsForLine(traceSet, lineDemolition);
    expect(contributions).toBeDefined();
    expect(contributions?.map((c) => c.operationId)).toEqual([opDemolition]);
    expect(contributions?.[0]?.contributionKind).toBe("created");
  });

  test("the plaster line resolves BOTH contributors (demolition removed + plaster created)", () => {
    const contributions = resolveOperationsForLine(traceSet, linePlaster);
    expect(contributions).toBeDefined();
    expect(contributions?.map((c) => c.operationId)).toEqual([opDemolition, opPlaster]);
    expect(contributions?.[0]?.contributionKind).toBe("removed");
    expect(contributions?.[1]?.contributionKind).toBe("created");
  });

  test("an unknown line id resolves to undefined — explicit, never a silent empty list", () => {
    expect(resolveOperationsForLine(traceSet, "boq-line-unknown-9999")).toBeUndefined();
  });
});

describe("operation → generated/affected BOQ lines", () => {
  test("the demolition operation resolves to the demolition AND plaster lines (it contributes to both)", () => {
    const lines = resolveLinesForOperation(traceSet, opDemolition);
    expect(lines.map((line) => line.boqLineId)).toEqual([lineDemolition, linePlaster]);
  });

  test("the block-wall operation resolves to exactly the block-wall line", () => {
    const lines = resolveLinesForOperation(traceSet, opBlockWall);
    expect(lines.map((line) => line.boqLineId)).toEqual([lineBlockWall]);
  });

  test("the plaster operation resolves to exactly the plaster line", () => {
    const lines = resolveLinesForOperation(traceSet, opPlaster);
    expect(lines.map((line) => line.boqLineId)).toEqual([linePlaster]);
  });

  test("an operation contributing to no line resolves to an explicit empty list", () => {
    expect(resolveLinesForOperation(traceSet, "op-unknown-9999")).toEqual([]);
  });

  test("findContribution surfaces the per-line contribution detail", () => {
    const plasterLine = traceSet.lineTraces.find((line) => line.boqLineId === linePlaster);
    expect(plasterLine).toBeDefined();
    const contribution = findContribution(plasterLine!, opDemolition);
    expect(contribution?.contributionKind).toBe("removed");
    expect(findContribution(plasterLine!, opBlockWall)).toBeUndefined();
  });
});

describe("the round trip closes in both directions", () => {
  test("for every line: line → contributions → lines INCLUDES the original line", () => {
    for (const line of traceSet.lineTraces) {
      const contributions = resolveOperationsForLine(traceSet, line.boqLineId);
      expect(contributions).toBeDefined();
      for (const contribution of contributions ?? []) {
        const back = resolveLinesForOperation(traceSet, contribution.operationId);
        expect(back.some((candidate) => candidate.boqLineId === line.boqLineId)).toBe(true);
      }
    }
  });

  test("for every operation of the version that contributes: operation → lines → contributions INCLUDES the operation", () => {
    for (const operation of version1.operations) {
      const lines = resolveLinesForOperation(traceSet, operation.operationId);
      for (const line of lines) {
        const contributions = resolveOperationsForLine(traceSet, line.boqLineId);
        expect(
          contributions?.some(
            (contribution) => contribution.operationId === operation.operationId,
          ),
        ).toBe(true);
      }
    }
  });
});

describe("version pinning", () => {
  test("every line trace pins the trace set's solutionId, versionNumber and validation snapshot", () => {
    for (const line of traceSet.lineTraces) {
      expect(line.solutionId).toBe(traceSet.solutionId);
      expect(line.versionNumber).toBe(traceSet.versionNumber);
      expect(line.validationSnapshotRef).toBe(traceSet.validationSnapshotRef);
    }
  });

  test("every contributing operation id exists in the pinned solution version's operation sequence", () => {
    const operationIds = new Set(version1.operations.map((operation) => operation.operationId));
    for (const line of traceSet.lineTraces) {
      for (const contribution of line.contributingOperations) {
        expect(operationIds.has(contribution.operationId)).toBe(true);
      }
    }
  });

  test("trace identity is version-pinned: the same line id under another version derives another trace id", () => {
    const v1 = deriveSolutionBoqLineTraceId({
      solutionId: traceSet.solutionId,
      versionNumber: 1,
      boqLineId: linePlaster,
    });
    const v2 = deriveSolutionBoqLineTraceId({
      solutionId: traceSet.solutionId,
      versionNumber: 2,
      boqLineId: linePlaster,
    });
    expect(v2).not.toBe(v1);
    const committedTraceId = traceSet.lineTraces.find((line) => line.boqLineId === linePlaster)
      ?.traceId;
    if (committedTraceId === undefined) {
      throw new Error("the plaster line trace is missing from the committed fixture");
    }
    expect(v1).toBe(committedTraceId);
  });

  test("the committed fixture's line traces carry genuine derived trace identities", () => {
    for (const line of traceSet.lineTraces) {
      expect(
        deriveSolutionBoqLineTraceId({
          solutionId: line.solutionId,
          versionNumber: line.versionNumber,
          boqLineId: line.boqLineId,
        }),
      ).toBe(line.traceId);
    }
  });
});

describe("quantities and provenance on the generated lines", () => {
  test("every line's quantity carries an explicit unit and calculation reference", () => {
    for (const line of traceSet.lineTraces) {
      expect(line.quantity.unit).toBeTruthy();
      expect(line.quantity.calculationRef).toBeTruthy();
    }
  });

  test("the plaster line's quantity is the deterministic 30 mm over the affected faces", () => {
    const plaster = traceSet.lineTraces.find((line) => line.boqLineId === linePlaster);
    expect(plaster?.quantity.dimension).toBe("area");
    expect(plaster?.quantity.value).toBe(12.5);
    expect(plaster?.quantity.unit).toBe("m2");
  });
});
