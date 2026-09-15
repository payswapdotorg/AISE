/**
 * Pg twin for the gap-analysis store (PROD-005).
 *
 * `PgGapAnalysisStore` implements the EXACT `GapAnalysisStore` interface the
 * Fs and In-memory twins implement (gaps/store.ts — read it before changing
 * anything here): write-once analysis records (the domain has NO update path
 * — a re-analysis is a NEW record under a NEW id), reads validated through
 * `parseGapAnalysisRecord`, list sorted by analysisId.
 *
 * Table mapping (v001): `gap_analysis_records` (record_key = analysisId) —
 * insert-if-absent. A re-put of the SAME id with byte-identical canonical
 * content is an idempotent no-op (re-normalization / seed replays); a
 * conflicting re-put is refused with the domain's own `analysis_exists`
 * error — the service above already refuses id reuse, so this is defense in
 * depth, never a rewrite.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { GapAnalysisError, parseGapAnalysisRecord, type GapAnalysisRecord } from "../../gaps/model";
import type { GapAnalysisStore } from "../../gaps/store";
import type { PgExecutor } from "../executor";
import { PG_TABLES } from "../sql";
import { RecordTable } from "./records";

/** Parse one stored record text: invalid content is a typed rejection (the Fs discipline). */
function parseAnalysisText(text: string): GapAnalysisRecord {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new GapAnalysisError("invalid_analysis_record", "analysis row is not valid JSON");
  }
  return parseGapAnalysisRecord(value);
}

export class PgGapAnalysisStore implements GapAnalysisStore {
  private readonly table: RecordTable;

  constructor(executor: PgExecutor) {
    this.table = new RecordTable(executor, PG_TABLES.gapAnalysisRecords);
  }

  async put(record: GapAnalysisRecord): Promise<void> {
    const canonical = canonicalJsonStringify(record);
    const outcome = await this.table.insertIfAbsent(record.analysisId, canonical);
    if (!outcome.wrote && outcome.canonical !== canonical) {
      throw new GapAnalysisError(
        "analysis_exists",
        `analysis '${record.analysisId}' already exists with different content (write-once)`,
      );
    }
  }

  async get(analysisId: string): Promise<GapAnalysisRecord | null> {
    const canonical = await this.table.selectCanonical(analysisId);
    return canonical === null ? null : parseAnalysisText(canonical);
  }

  async list(): Promise<GapAnalysisRecord[]> {
    const texts = await this.table.listCanonical();
    const records = texts.map((text) => parseAnalysisText(text));
    // Deterministic order: sorted by analysisId (the Fs twin's order).
    return records.sort((a, b) =>
      a.analysisId < b.analysisId ? -1 : a.analysisId > b.analysisId ? 1 : 0,
    );
  }
}
