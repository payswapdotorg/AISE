/**
 * Pg twin for the engineering case store (PROD-005).
 *
 * `PgCaseStore` implements the EXACT `CaseStore` interface the Fs and
 * In-memory twins implement (cases/store.ts — read it before changing
 * anything here): whole-record rewrites of the rebuildable case projection
 * (the append-only `history` discipline is enforced by the SERVICE above the
 * store, never here), reads validated through `parseCaseRecord`, list sorted
 * by caseId.
 *
 * Table mapping (v001): `case_records` (record_key = caseId) — whole-record
 * UPSERT; `canonical` holds the BYTE-EXACT canonical JSON the Fs twin writes
 * to `<dataDir>/cases/<sha256(caseId)>.json`, so round-trips are identical.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { CaseError, parseCaseRecord, type EngineeringCase } from "../../cases/model";
import type { CaseStore } from "../../cases/store";
import type { PgExecutor } from "../executor";
import { PG_TABLES } from "../sql";
import { RecordTable } from "./records";

/** Parse one stored record text: invalid JSON is a typed rejection (the Fs discipline). */
function parseCaseText(text: string): EngineeringCase {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CaseError("invalid_case_record", "case row is not valid JSON");
  }
  return parseCaseRecord(value);
}

export class PgCaseStore implements CaseStore {
  private readonly table: RecordTable;

  constructor(executor: PgExecutor) {
    this.table = new RecordTable(executor, PG_TABLES.caseRecords);
  }

  async put(record: EngineeringCase): Promise<void> {
    await this.table.upsert(record.caseId, canonicalJsonStringify(record));
  }

  async get(caseId: string): Promise<EngineeringCase | null> {
    const canonical = await this.table.selectCanonical(caseId);
    return canonical === null ? null : parseCaseText(canonical);
  }

  async list(): Promise<EngineeringCase[]> {
    const texts = await this.table.listCanonical();
    const records = texts.map((text) => parseCaseText(text));
    // Deterministic order: sorted by caseId (the Fs twin's order).
    return records.sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0));
  }
}
