import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalizeJson, canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { FsEvidenceStore, InMemoryEvidenceStore, type EvidenceStore } from "./store";
import {
  FIXED_NOW,
  contentIdOf,
  fixedClock,
  makeDerivation,
  makeEvidence,
  makeLink,
} from "./testkit";

/** Deterministic ordering helper: canonical-JSON sort of contract objects. */
function canonicalOrder<T>(values: readonly T[]): T[] {
  return [...values].sort((a, b) =>
    canonicalJsonStringify(a).localeCompare(canonicalJsonStringify(b)),
  );
}

/**
 * Shared behavioral suite: every EvidenceStore implementation must satisfy it
 * identically — the interface is the contract, the implementations are
 * interchangeable. Registers one test per behavior into the ENCLOSING scope.
 * Journal-list order across FILES is store-specific, so list assertions
 * compare canonically sorted arrays.
 */
function storeBehavior(name: string, factory: () => EvidenceStore): void {
  test(`${name}: writes an evidence record once and never rewrites it`, async () => {
    const store = factory();
    const evidence = makeEvidence("store-once");

    expect(await store.putEvidenceRecord(evidence)).toBe(true);
    expect(await store.getEvidenceRecord(evidence.contentId)).toEqual(evidence);

    // A second put is refused and the record is retained verbatim.
    expect(await store.putEvidenceRecord(evidence)).toBe(false);
    expect(await store.getEvidenceRecord(evidence.contentId)).toEqual(evidence);

    const conflicting = { ...evidence, byteSize: evidence.byteSize + 1 };
    expect(await store.putEvidenceRecord(conflicting)).toBe(false);
    expect((await store.getEvidenceRecord(evidence.contentId))?.byteSize).toBe(
      evidence.byteSize,
    );
  });

  test(`${name}: returns null for unknown records and invalidations`, async () => {
    const store = factory();
    const unknown = contentIdOf("never-registered");
    expect(await store.getEvidenceRecord(unknown)).toBeNull();
    expect(await store.getInvalidation(unknown)).toBeNull();
    expect(await store.listLinks()).toEqual([]);
    expect(await store.listDerivations()).toEqual([]);
    expect(await store.listEvidenceRecords()).toEqual([]);
  });

  test(`${name}: appends one invalidation, never a second`, async () => {
    const store = factory();
    const evidence = makeEvidence("store-invalidate");
    await store.putEvidenceRecord(evidence);

    expect(await store.getInvalidation(evidence.contentId)).toBeNull();
    expect(
      await store.putInvalidation({
        contentId: evidence.contentId,
        reason: "operator rejected the frame",
        invalidatedAt: fixedClock(),
      }),
    ).toBe(true);
    expect(await store.getInvalidation(evidence.contentId)).toEqual({
      contentId: evidence.contentId,
      reason: "operator rejected the frame",
      invalidatedAt: FIXED_NOW,
    });
    expect(
      await store.putInvalidation({
        contentId: evidence.contentId,
        reason: "different reason",
        invalidatedAt: fixedClock(),
      }),
    ).toBe(false);
    expect((await store.getInvalidation(evidence.contentId))?.reason).toBe(
      "operator rejected the frame",
    );
  });

  test(`${name}: journals links and derivations in append order`, async () => {
    const store = factory();
    const first = makeEvidence("store-link-1");
    const second = makeEvidence("store-link-2");
    await store.putEvidenceRecord(first);
    await store.putEvidenceRecord(second);

    const linkOne = makeLink("evidence", first.contentId, second.contentId, "DERIVED_FROM");
    const linkTwo = makeLink("measurement", "meas-1", first.contentId, "SUPPORTS");
    await store.appendLink(linkOne);
    await store.appendLink(linkTwo);
    expect(canonicalOrder(await store.listLinks())).toEqual(
      canonicalOrder([linkOne, linkTwo]),
    );

    const derivation = makeDerivation("derivation-1", second.contentId, [first.contentId]);
    await store.appendDerivation(derivation);
    expect(await store.listDerivations()).toEqual([derivation]);

    // Appends never rewrite earlier lines: re-appending an identical link
    // appends a second journal line (dedupe is service policy, not store).
    await store.appendLink(linkOne);
    const links = await store.listLinks();
    expect(links).toHaveLength(3);
    expect(canonicalOrder(links)).toEqual(canonicalOrder([linkOne, linkTwo, linkOne]));
  });

  test(`${name}: lists evidence records sorted by content id`, async () => {
    const store = factory();
    const unsorted = ["zeta", "alpha", "mid"];
    for (const seed of unsorted) {
      await store.putEvidenceRecord(makeEvidence(seed));
    }
    const listed = await store.listEvidenceRecords();
    expect(listed.map((record) => record.contentId)).toEqual(
      unsorted.map((seed) => contentIdOf(seed)).sort(),
    );
  });
}

describe("InMemoryEvidenceStore", () => {
  storeBehavior("InMemoryEvidenceStore", () => new InMemoryEvidenceStore());
});

describe("FsEvidenceStore", () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const dir of roots) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Each test gets a fresh temporary root; nothing leaks between cases.
  storeBehavior("FsEvidenceStore", () => {
    const dir = mkdtempSync(join(tmpdir(), "aise-evidence-store-"));
    roots.push(dir);
    return new FsEvidenceStore(dir);
  });
});

describe("FsEvidenceStore file layout", () => {
  test("roots at <dataDir>/evidence with deterministic subdirectories", () => {
    const root = mkdtempSync(join(tmpdir(), "aise-evidence-layout-"));
    try {
      const dataDir = join(root, "nested", "data");
      new FsEvidenceStore(dataDir);
      expect(existsSync(join(dataDir, "evidence", "records"))).toBe(true);
      expect(existsSync(join(dataDir, "evidence", "links"))).toBe(true);
      expect(existsSync(join(dataDir, "evidence", "derivations"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("record and invalidation files live at hashed, canonical paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "aise-evidence-files-"));
    try {
      const store = new FsEvidenceStore(root);
      const evidence = makeEvidence("layout-record");
      await store.putEvidenceRecord(evidence);

      const recordPath = store.recordPath(evidence.contentId);
      expect(recordPath).toBe(
        join(root, "evidence", "records", `${sha256Hex(evidence.contentId)}.json`),
      );
      // Canonical JSON bytes: sorted keys, 2-space indent, trailing newline.
      expect(readFileSync(recordPath, "utf8")).toBe(canonicalJsonStringify(evidence));

      await store.putInvalidation({
        contentId: evidence.contentId,
        reason: "layout check",
        invalidatedAt: fixedClock(),
      });
      const invalidationPath = store.invalidationPath(evidence.contentId);
      expect(invalidationPath).toBe(`${recordPath.replace(/\.json$/, "")}.invalidated.json`);
      expect(readFileSync(invalidationPath, "utf8")).toBe(
        canonicalJsonStringify({
          contentId: evidence.contentId,
          reason: "layout check",
          invalidatedAt: FIXED_NOW,
        }),
      );

      // Invalidation never touches the immutable record file.
      expect(readFileSync(recordPath, "utf8")).toBe(canonicalJsonStringify(evidence));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("link and derivation journals are single-line canonical JSONL", async () => {
    const root = mkdtempSync(join(tmpdir(), "aise-evidence-journals-"));
    try {
      const store = new FsEvidenceStore(root);
      const subject = makeEvidence("journal-subject");
      const object = makeEvidence("journal-object");
      await store.putEvidenceRecord(subject);
      await store.putEvidenceRecord(object);

      const link = makeLink("evidence", subject.contentId, object.contentId);
      await store.appendLink(link);
      const linkPath = store.linkPath(link);
      expect(linkPath).toBe(
        join(
          root,
          "evidence",
          "links",
          `${sha256Hex(`${link.subjectKind}:${link.subjectId}|${link.evidenceContentId}`)}.jsonl`,
        ),
      );
      const linkLines = readFileSync(linkPath, "utf8").split("\n").filter((line) => line !== "");
      expect(linkLines.length).toBe(1);
      expect(JSON.parse(linkLines[0] ?? "")).toEqual(link);
      // Single line, canonical key order (sorted, compact).
      expect(linkLines[0]).toBe(JSON.stringify(canonicalizeJson(link)));
      // Same pair, second role: second line in the SAME journal file.
      const secondRole = makeLink(
        "evidence",
        subject.contentId,
        object.contentId,
        "CONTRADICTS",
      );
      await store.appendLink(secondRole);
      expect(
        readFileSync(linkPath, "utf8").split("\n").filter((line) => line !== "").length,
      ).toBe(2);

      const derivation = makeDerivation("journal-derivation", object.contentId, [
        subject.contentId,
      ]);
      await store.appendDerivation(derivation);
      const derivationPath = store.derivationPath(derivation);
      expect(derivationPath).toBe(
        join(
          root,
          "evidence",
          "derivations",
          `${sha256Hex(derivation.derivationId)}.jsonl`,
        ),
      );
      expect(JSON.parse(readFileSync(derivationPath, "utf8"))).toEqual(derivation);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
