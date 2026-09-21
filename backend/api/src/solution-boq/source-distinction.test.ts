/**
 * PROD-025 — source vs generated BOQ: the NON-OVERWRITE sabotage suite
 * (backend level — the only zone that can see BOTH the source BOQ module
 * and the solution-BOQ package).
 *
 * Proves over the REAL source-BOQ model (`backend/api/src/boq/model.ts`):
 *  - a solution BOQ generated WITH a reference to a source BOQ record
 *    leaves the source record's canonical bytes BYTE-IDENTICAL (before vs
 *    after generation; after generating TWICE; after readback/navigation);
 *  - the generated BOQ embeds ONLY the source's identity (importId) — the
 *    source document's parsed content (sheets/rows/cells/parse) is
 *    structurally absent from the generated BOQ's canonical bytes;
 *  - the typed distinction is enforced at the boundary: a source
 *    `BoqRecord` is rejected by every generated-BOQ endpoint (422
 *    invalid_boq) and by the package's type guard; a generated BOQ is not
 *    a valid `BoqRecord` (different field inventory — no importId/format);
 *  - no exported function of the service accepts a source BOQ record or
 *    returns a modified one (the sabotage: attempt every write-shaped
 *    call and assert the typed refusals).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { BoqRecord } from "../boq/model";
import { isSolutionGeneratedBoq } from "@aise/solution-boq";
import { SolutionBoqService } from "./service";
import { generateBody } from "./testkit";

const service = new SolutionBoqService();

/** A committed-shape SOURCE BOQ record (the BOQ Lens import envelope). */
function sourceBoqRecord(): BoqRecord {
  return {
    importId: "c0ffee0000000000000000000000000000000000000000000000000000000000",
    source: {
      contentId: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef1234",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      byteSize: 4096,
    },
    format: "xlsx",
    parse: {
      status: "parsed",
      document: {
        sheets: [
          {
            name: "Substructure",
            dimension: "A1:F20",
            rows: [
              {
                rowNumber: 1,
                cells: [
                  {
                    ref: "A1",
                    column: "A",
                    row: 1,
                    value: "Item",
                    type: "string",
                    raw: "Item",
                  },
                ],
              },
            ],
            mergedRanges: [],
            sections: [],
          },
        ],
      },
    },
  };
}

describe("generating a solution BOQ never overwrites the source BOQ", () => {
  test("the source record's bytes are identical before and after generation", () => {
    const record = sourceBoqRecord();
    const before = canonicalJsonStringify(record);
    const { version, snapshot } = generateBody();
    const generated = service.generate({
      version,
      snapshot,
      sourceBoqRef: {
        kind: "source-boq-reference",
        importId: record.importId,
        mediaType: record.source.mediaType,
        byteSize: record.source.byteSize,
      },
    });
    const after = canonicalJsonStringify(record);
    expect(after).toBe(before);
    // the generated BOQ references the source by identity only
    expect(generated.boq.sourceBoqRef?.importId).toBe(record.importId);
  });

  test("generating TWICE (and reading back + navigating) still leaves it identical", () => {
    const record = sourceBoqRecord();
    const before = canonicalJsonStringify(record);
    const { version, snapshot } = generateBody();
    const sourceBoqRef = {
      kind: "source-boq-reference" as const,
      importId: record.importId,
      mediaType: record.source.mediaType,
      byteSize: record.source.byteSize,
    };
    const first = service.generate({ version, snapshot, sourceBoqRef });
    const second = service.generate({ version, snapshot, sourceBoqRef });
    // determinism: the same generation twice is byte-identical
    expect(canonicalJsonStringify(second.boq)).toBe(canonicalJsonStringify(first.boq));
    // readback + both navigations over the generated BOQ
    service.readback({ boq: first.boq });
    service.lineOperations({ boq: first.boq, boqLineId: first.boq.lines[0]!.boqLineId });
    service.operationLines({ boq: first.boq, operationId: first.boq.operationIds[0]! });
    expect(canonicalJsonStringify(record)).toBe(before);
  });

  test("the generated BOQ embeds ONLY the source identity — no document content", () => {
    const record = sourceBoqRecord();
    const { version, snapshot } = generateBody();
    const generated = service.generate({
      version,
      snapshot,
      sourceBoqRef: {
        kind: "source-boq-reference",
        importId: record.importId,
        mediaType: record.source.mediaType,
        byteSize: record.source.byteSize,
      },
    });
    const text = canonicalJsonStringify(generated.boq);
    expect(text.includes(record.importId)).toBe(true); // the identity IS referenced
    // the source document's parsed content is structurally ABSENT
    expect(text.includes('"sheets"')).toBe(false);
    expect(text.includes('"rows"')).toBe(false);
    expect(text.includes('"cells"')).toBe(false);
    expect(text.includes('"parse"')).toBe(false);
    expect(text.includes('"format"')).toBe(false);
    expect(text.includes(record.source.contentId)).toBe(false);
  });
});

describe("the typed distinction is enforced at the boundary", () => {
  test("a source BoqRecord is NEVER a solution-generated BOQ", () => {
    const record = sourceBoqRecord();
    expect(isSolutionGeneratedBoq(record)).toBe(false);
    expect(isSolutionGeneratedBoq(JSON.parse(JSON.stringify(record)))).toBe(false);
  });

  test("a generated BOQ is not a valid BoqRecord (different field inventory)", () => {
    const { version, snapshot } = generateBody();
    const generated = service.generate({ version, snapshot });
    const record = generated.boq as unknown as Partial<BoqRecord>;
    expect(record.importId).toBeUndefined(); // no source import identity
    expect(record.format).toBeUndefined();
    expect(record.parse).toBeUndefined();
    expect(record.source).toBeUndefined();
  });

  test("every generated-BOQ endpoint refuses a source BoqRecord payload (the sabotage)", () => {
    const record = sourceBoqRecord();
    // the readback endpoint: the typed seal refuses the source record
    expect(() => service.readback({ boq: record })).toThrow(/invalid_boq/);
    // the navigation endpoints: same typed refusal
    expect(() =>
      service.lineOperations({ boq: record, boqLineId: "any" }),
    ).toThrow(/invalid_boq/);
    expect(() =>
      service.operationLines({ boq: record, operationId: "any" }),
    ).toThrow(/invalid_boq/);
    // the generate endpoint: a source record is not a version/snapshot either
    expect(() => service.generate({ version: record, snapshot: record })).toThrow(
      /invalid_version/,
    );
  });

  test("no service method returns a modified source record (write-back is unrepresentable)", () => {
    const record = sourceBoqRecord();
    const before = canonicalJsonStringify(record);
    // attempt every write-shaped call the surface offers; every one either
    // refuses the source record (typed) or never touches it
    expect(() => service.readback({ boq: record })).toThrow();
    expect(() => service.lineOperations({ boq: record, boqLineId: "x" })).toThrow();
    expect(() => service.operationLines({ boq: record, operationId: "x" })).toThrow();
    expect(() =>
      service.generate({
        version: record,
        snapshot: record,
        sourceBoqRef: {
          kind: "source-boq-reference",
          importId: record.importId,
          mediaType: record.source.mediaType,
          byteSize: record.source.byteSize,
        },
      }),
    ).toThrow();
    expect(canonicalJsonStringify(record)).toBe(before);
  });
});
