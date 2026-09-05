/**
 * Fail-closed content-bound report validator (AISE-031).
 *
 * The validator re-derives BOTH binding levels:
 * - the report digest over the canonical report body;
 * - EVERY record's `changeId` over its own canonical content
 *   (identity↔content binding — a tampered record with a stale
 *   id, or a fabricated id, is rejected).
 *
 * It also enforces the structural invariants the report contract
 * promises: canonical ordering, kind↔category binding, kind→field
 * presence rules, summary-count honesty, and version-pin shape.
 */
import { canonicalJsonString, sha256Hex } from "@aise/engineering-model";
import { HistoryError } from "./errors.js";
import { reportDigest, type HistoricalChangeReport, type VersionPin } from "./report.js";
import { checkRecordShape, compareRecords, type ChangeRecord } from "./records.js";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Validates a historical change report (fail-closed). */
export function validateHistoricalChangeReport(report: HistoricalChangeReport): void {
  const fail = (message: string, code: "REPORT_INVALID" = "REPORT_INVALID"): never => {
    throw new HistoryError(code, message);
  };

  if (report === null || typeof report !== "object") {
    fail("report must be a record");
  }
  if (report.kind !== "historical-change-report") {
    fail(`report kind must be "historical-change-report": ${String(report.kind)}`);
  }
  if (typeof report.modelId !== "string" || report.modelId.length === 0) {
    fail("report.modelId must be a non-empty string");
  }
  if (!Array.isArray(report.records)) {
    fail("report.records must be an array");
  }
  if (!DIGEST_PATTERN.test(report.digest ?? "")) {
    fail("report.digest must be lowercase sha-256 hex");
  }
  checkPin(report.from, "from");
  checkPin(report.to, "to");
  if (report.from.version >= report.to.version) {
    fail("report version pins must be strictly ascending");
  }
  if (!Array.isArray(report.limitations) || report.limitations.length === 0) {
    fail("report.limitations must be a non-empty array");
  }
  if (report.summary === null || typeof report.summary !== "object") {
    fail("report.summary must be a record");
  }

  // Record-level re-derivation (identity ↔ content binding).
  const seen = new Set<string>();
  for (const record of report.records) {
    checkOneRecord(record);
    if (seen.has(record.changeId)) {
      fail(`duplicate change record identity: ${record.changeId}`);
    }
    seen.add(record.changeId);
  }

  // Canonical ordering.
  for (let index = 1; index < report.records.length; index += 1) {
    if (compareRecords(report.records[index - 1]!, report.records[index]!) > 0) {
      fail(`records are not in canonical order at index ${index}`);
    }
  }

  // Summary honesty.
  const summary = report.summary;
  if (summary.total !== report.records.length) {
    fail(`summary.total (${summary.total}) does not match the record count (${report.records.length})`);
  }
  const byCategoryTotal = (summary.byCategory ?? []).reduce((sum, row) => sum + row.count, 0);
  if (byCategoryTotal !== report.records.length) {
    fail(`summary.byCategory total (${byCategoryTotal}) does not match the record count`);
  }
  const counts = new Map<string, number>();
  for (const record of report.records) {
    counts.set(record.category, (counts.get(record.category) ?? 0) + 1);
  }
  for (const row of summary.byCategory ?? []) {
    if (row.count !== counts.get(row.category)) {
      fail(`summary.byCategory count for "${String(row.category)}" is dishonest`);
    }
  }
  const objectsAdded = report.records.filter((r) => r.kind === "object-added").length;
  const objectsRemoved = report.records.filter((r) => r.kind === "object-removed").length;
  if (summary.objectsAdded !== objectsAdded) {
    fail(`summary.objectsAdded (${summary.objectsAdded}) does not match the records (${objectsAdded})`);
  }
  if (summary.objectsRemoved !== objectsRemoved) {
    fail(`summary.objectsRemoved (${summary.objectsRemoved}) does not match the records (${objectsRemoved})`);
  }
  if (summary.identical !== (report.from.digest === report.to.digest)) {
    fail("summary.identical must reflect the pinned version digests");
  }

  // Digest re-derivation over the canonical body.
  const body = {
    kind: report.kind,
    modelId: report.modelId,
    from: report.from,
    to: report.to,
    records: report.records,
    summary: report.summary,
    limitations: report.limitations,
  };
  if (reportDigest(body) !== report.digest) {
    fail("report digest does not bind the report content");
  }
}

function checkPin(pin: VersionPin, label: string): void {
  if (pin === null || typeof pin !== "object") {
    throw new HistoryError("REPORT_INVALID", `report.${label} must be a version pin`);
  }
  if (!Number.isInteger(pin.version) || pin.version < 1) {
    throw new HistoryError("REPORT_INVALID", `report.${label}.version must be a positive integer`);
  }
  if (!DIGEST_PATTERN.test(pin.digest ?? "")) {
    throw new HistoryError("REPORT_INVALID", `report.${label}.digest must be lowercase sha-256 hex`);
  }
  if (typeof pin.committedAt !== "string" || !RFC3339_PATTERN.test(pin.committedAt)) {
    throw new HistoryError("REPORT_INVALID", `report.${label}.committedAt must be an RFC 3339 instant`);
  }
  if (pin.parentVersion !== undefined && (!Number.isInteger(pin.parentVersion) || pin.parentVersion < 1)) {
    throw new HistoryError("REPORT_INVALID", `report.${label}.parentVersion must be a positive integer when present`);
  }
}

function checkOneRecord(record: ChangeRecord): void {
  if (record === null || typeof record !== "object") {
    throw new HistoryError("REPORT_INVALID", "change records must be records");
  }
  if (!DIGEST_PATTERN.test(record.changeId ?? "")) {
    throw new HistoryError("REPORT_INVALID", "record.changeId must be lowercase sha-256 hex");
  }
  try {
    checkRecordShape(record);
  } catch (error) {
    throw new HistoryError("REPORT_INVALID", `record ${record.changeId} violates its kind contract: ${String((error as Error).message)}`);
  }
  if (typeof record.detail !== "string" || record.detail.length === 0) {
    throw new HistoryError("REPORT_INVALID", "record.detail must be a non-empty string");
  }
  if (record.side !== undefined && record.side !== "from" && record.side !== "to") {
    throw new HistoryError("REPORT_INVALID", "record.side must be 'from' or 'to'");
  }
  if (record.quantityDelta !== undefined && record.quantity === undefined) {
    throw new HistoryError("REPORT_INVALID", "quantityDelta requires the quantity passthrough");
  }
  if (
    record.quantityDelta !== undefined &&
    record.quantity !== undefined &&
    record.quantity.previous.unit !== record.quantity.current.unit
  ) {
    throw new HistoryError("REPORT_INVALID", "no derived delta may accompany differing-unit quantities");
  }
}

/** Re-export for consumers that compute digests directly. */
export { sha256Hex, canonicalJsonString };
