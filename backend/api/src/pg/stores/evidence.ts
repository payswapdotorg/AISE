/**
 * Pg twin for the evidence store (PROD-005).
 *
 * `PgEvidenceStore` implements the EXACT `EvidenceStore` interface the Fs and
 * In-memory twins implement (evidence/store.ts — read it before changing
 * anything here): immutable write-once evidence records, appended (never
 * rewritten) invalidation records, and append-only provenance journals.
 *
 * Table mapping (v001):
 *   evidence_records      (record_key = contentId) — write-once records;
 *   evidence_invalidations (record_key = contentId) — appended invalidations
 *                         (invalidated ≠ deleted — the record row is never
 *                         touched, exactly like the Fs .invalidated.json file);
 *   evidence_links        — append-only journal (BIGSERIAL insertion order =
 *                         the Fs JSONL line order);
 *   evidence_derivations  — append-only journal (one logical journal per
 *                         derivationId in the Fs twin; the global insertion
 *                         sequence preserves the same per-id relative order).
 *
 * Round-trip discipline: every row's `canonical` column holds the BYTE-EXACT
 * canonical JSON the Fs twin writes, and every read returns it verbatim.
 */

import { canonicalJsonStringify, type Derivation, type Evidence, type ProvenanceLink } from "@aise/shared-contracts";
import { sha256Hex } from "../../lib/hash";
import type {
  EvidenceInvalidationInfo,
  EvidenceStore,
} from "../../evidence/store";
import type { PgExecutor } from "../executor";
import { insertJournalSql, listJournalSql, PG_TABLES } from "../sql";
import { parseCanonicalJson, RecordTable } from "./records";

/** Journal key for one subject|object pair (mirrors the Fs twin's filename). */
function linkJournalKey(link: ProvenanceLink): string {
  return sha256Hex(`${link.subjectKind}:${link.subjectId}|${link.evidenceContentId}`);
}

/** Journal key for one derivation (mirrors the Fs twin's filename). */
function derivationJournalKey(derivation: Derivation): string {
  return sha256Hex(derivation.derivationId);
}

export class PgEvidenceStore implements EvidenceStore {
  private readonly records: RecordTable;
  private readonly invalidations: RecordTable;

  constructor(private readonly executor: PgExecutor) {
    this.records = new RecordTable(executor, PG_TABLES.evidenceRecords);
    this.invalidations = new RecordTable(executor, PG_TABLES.evidenceInvalidations);
  }

  async getEvidenceRecord(contentId: string): Promise<Evidence | null> {
    const canonical = await this.records.selectCanonical(contentId);
    return canonical === null ? null : (parseCanonicalJson(canonical, "evidence record") as Evidence);
  }

  async putEvidenceRecord(evidence: Evidence): Promise<boolean> {
    const outcome = await this.records.insertIfAbsent(
      evidence.contentId,
      canonicalJsonStringify(evidence),
    );
    return outcome.wrote;
  }

  async getInvalidation(contentId: string): Promise<EvidenceInvalidationInfo | null> {
    const canonical = await this.invalidations.selectCanonical(contentId);
    return canonical === null
      ? null
      : (parseCanonicalJson(canonical, "evidence invalidation") as EvidenceInvalidationInfo);
  }

  async putInvalidation(info: EvidenceInvalidationInfo): Promise<boolean> {
    const outcome = await this.invalidations.insertIfAbsent(
      info.contentId,
      canonicalJsonStringify(info),
    );
    return outcome.wrote;
  }

  async appendLink(link: ProvenanceLink): Promise<void> {
    const canonical = canonicalJsonStringify(link);
    await this.executor.execute(insertJournalSql(PG_TABLES.evidenceLinks), [
      linkJournalKey(link),
      canonical,
      canonical,
    ]);
  }

  async appendDerivation(derivation: Derivation): Promise<void> {
    const canonical = canonicalJsonStringify(derivation);
    await this.executor.execute(insertJournalSql(PG_TABLES.evidenceDerivations), [
      derivationJournalKey(derivation),
      canonical,
      canonical,
    ]);
  }

  async listLinks(): Promise<ProvenanceLink[]> {
    const rows = await this.executor.execute<{ canonical: string }>(
      listJournalSql(PG_TABLES.evidenceLinks),
    );
    return rows.map((row) => parseCanonicalJson(row.canonical, "provenance link") as ProvenanceLink);
  }

  async listDerivations(): Promise<Derivation[]> {
    const rows = await this.executor.execute<{ canonical: string }>(
      listJournalSql(PG_TABLES.evidenceDerivations),
    );
    return rows.map((row) => parseCanonicalJson(row.canonical, "derivation") as Derivation);
  }

  async listEvidenceRecords(): Promise<Evidence[]> {
    const texts = await this.records.listCanonical();
    const records = texts.map((text) => parseCanonicalJson(text, "evidence record") as Evidence);
    // Deterministic order: sorted by content id (the Fs twin's order).
    return records.sort((a, b) =>
      a.contentId < b.contentId ? -1 : a.contentId > b.contentId ? 1 : 0,
    );
  }
}
