/**
 * PROD-025 — solution-BOQ endpoint model tests (boundary parsers).
 *
 * Proves the shape → typed-code discipline of every request parser: valid
 * shapes parse; wrong shapes, missing fields and wrong types answer the
 * exact typed `SolutionBoqServiceError` codes (fail closed, never a
 * coercion).
 */

import { describe, expect, test } from "bun:test";
import {
  parseGenerateBoqRequest,
  parseLineOperationsRequest,
  parseOperationLinesRequest,
  parseReadbackBoqRequest,
  SolutionBoqServiceError,
} from "./model";
import { generateBody, generatedBoq } from "./testkit";

describe("parseGenerateBoqRequest", () => {
  test("a valid body parses with the optional sourceBoqRef", () => {
    const { version, snapshot } = generateBody();
    const parsed = parseGenerateBoqRequest({
      version,
      snapshot,
      sourceBoqRef: {
        kind: "source-boq-reference",
        importId: "a".repeat(64),
        mediaType: "application/vnd.ms-excel",
        byteSize: 10,
      },
    });
    expect(parsed.version).toBe(version);
    expect(parsed.snapshot).toBe(snapshot);
    expect(parsed.sourceBoqRef).toEqual({
      kind: "source-boq-reference",
      importId: "a".repeat(64),
      mediaType: "application/vnd.ms-excel",
      byteSize: 10,
    });
  });

  test("the sourceBoqRef is optional", () => {
    const { version, snapshot } = generateBody();
    const parsed = parseGenerateBoqRequest({ version, snapshot });
    expect(parsed.sourceBoqRef).toBeUndefined();
  });

  test("a non-object body answers invalid_request", () => {
    expect(() => parseGenerateBoqRequest([])).toThrow(SolutionBoqServiceError);
    expect(() => parseGenerateBoqRequest("nope")).toThrow(/invalid_request/);
  });

  test("a missing version answers invalid_version; a missing snapshot invalid_snapshot", () => {
    const { snapshot } = generateBody();
    expect(() => parseGenerateBoqRequest({ snapshot })).toThrow(/invalid_version/);
    const { version } = generateBody();
    expect(() => parseGenerateBoqRequest({ version })).toThrow(/invalid_snapshot/);
    expect(() => parseGenerateBoqRequest({ version, snapshot, sourceBoqRef: 42 })).toThrow(
      /invalid_source_ref/,
    );
  });
});

describe("parseReadbackBoqRequest", () => {
  test("a generated-BOQ body parses", () => {
    const parsed = parseReadbackBoqRequest({ boq: generatedBoq() });
    expect(parsed.boq).toBeDefined();
  });

  test("a missing/malformed boq answers invalid_boq", () => {
    expect(() => parseReadbackBoqRequest({})).toThrow(/invalid_boq/);
    expect(() => parseReadbackBoqRequest({ boq: [1, 2] })).toThrow(/invalid_boq/);
  });
});

describe("parseLineOperationsRequest", () => {
  test("a valid body parses", () => {
    const boq = generatedBoq();
    const parsed = parseLineOperationsRequest({
      boq,
      boqLineId: boq.lines[0]!.boqLineId,
    });
    expect(parsed.boqLineId).toBe(boq.lines[0]!.boqLineId);
  });

  test("a missing boqLineId answers invalid_boq_line_id", () => {
    expect(() => parseLineOperationsRequest({ boq: generatedBoq() })).toThrow(
      /invalid_boq_line_id/,
    );
    expect(() =>
      parseLineOperationsRequest({ boq: generatedBoq(), boqLineId: "  " }),
    ).toThrow(/invalid_boq_line_id/);
  });

  test("a missing boq answers invalid_boq", () => {
    expect(() => parseLineOperationsRequest({ boqLineId: "x" })).toThrow(/invalid_boq/);
  });
});

describe("parseOperationLinesRequest", () => {
  test("a valid body parses", () => {
    const boq = generatedBoq();
    const parsed = parseOperationLinesRequest({
      boq,
      operationId: boq.operationIds[0]!,
    });
    expect(parsed.operationId).toBe(boq.operationIds[0]!);
  });

  test("a missing operationId answers invalid_operation_id", () => {
    expect(() => parseOperationLinesRequest({ boq: generatedBoq() })).toThrow(
      /invalid_operation_id/,
    );
    expect(() => parseOperationLinesRequest({ boq: generatedBoq(), operationId: 7 })).toThrow(
      /invalid_operation_id/,
    );
  });
});
