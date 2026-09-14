import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { InMemoryCaptureStore } from "../capture/store";
import {
  EvidenceServiceError,
  captureStoreContentResolver,
  createEvidenceService,
  type EvidenceContentResolver,
  type EvidenceService,
  type EvidenceServiceErrorCode,
} from "./service";
import { FsEvidenceStore, InMemoryEvidenceStore, type EvidenceStore } from "./store";
import {
  FIXED_NOW,
  contentIdOf,
  fixedClock,
  makeDerivation,
  makeEvidence,
  makeLink,
  neverResolver,
  setResolver,
  withTempDir,
} from "./testkit";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function makeService(
  store: EvidenceStore,
  contentResolver?: EvidenceContentResolver,
): EvidenceService {
  return createEvidenceService({
    store,
    clock: fixedClock,
    ...(contentResolver === undefined ? {} : { contentResolver }),
  });
}

/** Assert a typed service rejection with code (and optional detail text). */
async function expectEvidenceError(
  promise: Promise<unknown>,
  code: EvidenceServiceErrorCode,
  detailContains?: string,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(EvidenceServiceError);
  const error = caught as EvidenceServiceError;
  expect(error.code).toBe(code);
  if (detailContains !== undefined) {
    expect(error.detail).toContain(detailContains);
  }
}

/** Deterministic content ids for the shared policy suite. */
const ID_A = contentIdOf("policy-a");
const ID_B = contentIdOf("policy-b");
const ID_C = contentIdOf("policy-c");
const ID_UNKNOWN = contentIdOf("policy-unknown");

const evidenceA = makeEvidence("policy-a");
const evidenceB = makeEvidence("policy-b");
const evidenceC = makeEvidence("policy-c");

/* ------------------------------------------------------------------ */
/* Shared policy suite (identical behavior for every store)            */
/* ------------------------------------------------------------------ */

function servicePolicy(name: string, makeStore: () => EvidenceStore): void {
  test(`${name}: registers evidence verbatim and idempotently`, async () => {
    const service = makeService(makeStore());
    const first = await service.registerEvidence(evidenceA);
    expect(first.kind).toBe("registered");
    expect(first.evidence).toEqual(evidenceA);
    expect(first.invalidation).toBeNull();

    const again = await service.registerEvidence(evidenceA);
    expect(again.kind).toBe("idempotent");
    expect(again.evidence).toEqual(evidenceA);

    // Key order is not content: a reordered but equal document is identical.
    const reordered: typeof evidenceA = {
      mediaType: evidenceA.mediaType,
      capturedAt: evidenceA.capturedAt,
      acquisitionMethod: evidenceA.acquisitionMethod,
      acquisitionMetadata: evidenceA.acquisitionMetadata,
      byteSize: evidenceA.byteSize,
      contentId: evidenceA.contentId,
      contractVersion: evidenceA.contractVersion,
    };
    const shuffled = await service.registerEvidence(reordered);
    expect(shuffled.kind).toBe("idempotent");
  });

  test(`${name}: rejects a conflicting re-registration with any differing field`, async () => {
    const service = makeService(makeStore());
    await service.registerEvidence(evidenceA);

    await expectEvidenceError(
      service.registerEvidence({ ...evidenceA, byteSize: evidenceA.byteSize + 1 }),
      "evidence_conflict",
      ID_A,
    );
    await expectEvidenceError(
      service.registerEvidence({
        ...evidenceA,
        acquisitionMetadata: { ...evidenceA.acquisitionMetadata, "capture.kind": "video" },
      }),
      "evidence_conflict",
    );
    // The conflict detail never echoes the conflicting VALUES.
    let conflict: unknown;
    try {
      await service.registerEvidence({ ...evidenceA, mediaType: "video/mp4" });
    } catch (error) {
      conflict = error;
    }
    expect((conflict as EvidenceServiceError).detail).not.toContain("video/mp4");
    // The original record is retained verbatim.
    expect((await service.getEvidence(ID_A))?.evidence).toEqual(evidenceA);
  });

  test(`${name}: appends invalidation, never deletes, and rejects double invalidation`, async () => {
    const service = makeService(makeStore());
    await service.registerEvidence(evidenceA);

    const view = await service.invalidateEvidence(ID_A, "subject left the frame");
    // The passthrough invalidation field is exactly { reason, invalidatedAt }.
    expect(view.invalidation).toEqual({
      reason: "subject left the frame",
      invalidatedAt: FIXED_NOW,
    });
    // Invalidated ≠ deleted: the record is still fully readable.
    expect(view.evidence).toEqual(evidenceA);
    expect(view.derivations).toEqual({ inputsOf: [], derivedFrom: [] });
    expect(view.provenance).toEqual({ asSubject: [], asObject: [] });

    await expectEvidenceError(
      service.invalidateEvidence(ID_A, "second attempt"),
      "already_invalidated",
    );
    await expectEvidenceError(service.invalidateEvidence(ID_UNKNOWN, "nope"), "evidence_not_found");
    await expectEvidenceError(service.invalidateEvidence(ID_B, "   "), "invalid_reason");
  });

  test(`${name}: lists evidence, excluding invalidated records by default`, async () => {
    const service = makeService(makeStore());
    await service.registerEvidence(evidenceA);
    await service.registerEvidence(evidenceB);
    await service.invalidateEvidence(ID_A, "blurred frame");

    const active = await service.listEvidence();
    expect(active.map((item) => item.evidence.contentId)).toEqual([ID_B]);
    expect(active[0]?.invalidation).toBeNull();

    const all = await service.listEvidence({ includeInvalidated: true });
    expect(all.map((item) => item.evidence.contentId)).toEqual([ID_A, ID_B].sort());
    const invalidatedItem = all.find((item) => item.evidence.contentId === ID_A);
    expect(invalidatedItem?.invalidation?.reason).toBe("blurred frame");
  });

  test(`${name}: enforces provenance closure on links, naming the missing id`, async () => {
    const service = makeService(makeStore());
    await service.registerEvidence(evidenceA);
    await service.registerEvidence(evidenceB);

    // Missing OBJECT evidence.
    await expectEvidenceError(
      service.addProvenanceLink(makeLink("measurement", "meas-1", ID_UNKNOWN)),
      "provenance_closure",
      ID_UNKNOWN,
    );
    // Missing SUBJECT evidence (subjectKind "evidence").
    await expectEvidenceError(
      service.addProvenanceLink(makeLink("evidence", ID_UNKNOWN, ID_A)),
      "provenance_closure",
      ID_UNKNOWN,
    );
    // Subject of kind "evidence" that is not even a content id.
    await expectEvidenceError(
      service.addProvenanceLink(makeLink("evidence", "not-a-content-id", ID_A)),
      "provenance_closure",
      "not-a-content-id",
    );
    // Foreign subject kinds (owned by other authorities) need no subject record.
    const foreign = await service.addProvenanceLink(
      makeLink("measurement", "meas-1", ID_A, "SUPPORTS"),
    );
    expect(foreign.kind).toBe("linked");

    // Exact duplicate links are idempotent no-ops.
    const duplicate = await service.addProvenanceLink(
      makeLink("measurement", "meas-1", ID_A, "SUPPORTS"),
    );
    expect(duplicate.kind).toBe("duplicate");
    expect((await service.getEvidence(ID_A))?.provenance.asObject).toHaveLength(1);
  });

  test(`${name}: reads links in both directions`, async () => {
    const service = makeService(makeStore());
    await service.registerEvidence(evidenceA);
    await service.registerEvidence(evidenceB);

    const supports = makeLink("measurement", "meas-1", ID_A, "SUPPORTS");
    const derivedFrom = makeLink("evidence", ID_B, ID_A, "DERIVED_FROM");
    await service.addProvenanceLink(supports);
    await service.addProvenanceLink(derivedFrom);

    const readA = await service.getEvidence(ID_A);
    expect(readA?.provenance.asObject).toEqual([supports, derivedFrom].sort((a, b) =>
      canonicalJsonStringify(a).localeCompare(canonicalJsonStringify(b)),
    ));
    expect(readA?.provenance.asSubject).toEqual([]);

    const readB = await service.getEvidence(ID_B);
    expect(readB?.provenance.asSubject).toEqual([derivedFrom]);
    expect(readB?.provenance.asObject).toEqual([]);
  });

  test(`${name}: enforces derivation closure for inputs and output`, async () => {
    const service = makeService(makeStore());
    await service.registerEvidence(evidenceA);
    await service.registerEvidence(evidenceB);

    await expectEvidenceError(
      service.recordDerivation(makeDerivation("d-x", ID_B, [ID_A, ID_UNKNOWN])),
      "provenance_closure",
      ID_UNKNOWN,
    );
    await expectEvidenceError(
      service.recordDerivation(makeDerivation("d-x", ID_UNKNOWN, [ID_A])),
      "provenance_closure",
      ID_UNKNOWN,
    );
    const ok = await service.recordDerivation(
      makeDerivation("d-ok", ID_B, [ID_A]),
    );
    expect(ok.kind).toBe("recorded");
    expect(ok.derivation.method).toBe("reconstruction.worldsculpt");
  });

  test(`${name}: rejects derivation cycles, including self and long cycles`, async () => {
    const service = makeService(makeStore());
    await service.registerEvidence(evidenceA);
    await service.registerEvidence(evidenceB);
    await service.registerEvidence(evidenceC);

    await service.recordDerivation(makeDerivation("d-1", ID_B, [ID_A]));
    // A→B stored; B→A would close the cycle.
    await expectEvidenceError(
      service.recordDerivation(makeDerivation("d-2", ID_A, [ID_B])),
      "derivation_cycle",
    );
    // Self-cycle: the output listed as its own input.
    await expectEvidenceError(
      service.recordDerivation(makeDerivation("d-3", ID_A, [ID_A])),
      "derivation_cycle",
    );
    // Longer cycle: A→B stored, B→C stored, C→A would close it.
    await service.recordDerivation(makeDerivation("d-4", ID_C, [ID_B]));
    await expectEvidenceError(
      service.recordDerivation(makeDerivation("d-5", ID_A, [ID_C])),
      "derivation_cycle",
    );
    // Multi-input derivations that stay acyclic are fine.
    const fanIn = await service.recordDerivation(
      makeDerivation("d-6", ID_C, [ID_A, ID_B]),
    );
    expect(fanIn.kind).toBe("recorded");
  });

  test(`${name}: derivation retries are idempotent; same id with different content conflicts`, async () => {
    const service = makeService(makeStore());
    await service.registerEvidence(evidenceA);
    await service.registerEvidence(evidenceB);

    const derivation = makeDerivation("d-dup", ID_B, [ID_A]);
    expect((await service.recordDerivation(derivation)).kind).toBe("recorded");
    expect((await service.recordDerivation(derivation)).kind).toBe("duplicate");

    await expectEvidenceError(
      service.recordDerivation(
        makeDerivation("d-dup", ID_B, [ID_A], { methodVersion: "9.9.9" }),
      ),
      "derivation_conflict",
    );
    // The journal still holds exactly one entry for the derivation id.
    expect((await service.getEvidence(ID_B))?.derivations.derivedFrom).toHaveLength(1);
  });

  test(`${name}: chain reads return inputs-of and derived-from correctly`, async () => {
    const service = makeService(makeStore());
    await service.registerEvidence(evidenceA);
    await service.registerEvidence(evidenceB);
    await service.registerEvidence(evidenceC);
    const dOne = makeDerivation("d-one", ID_B, [ID_A]);
    const dTwo = makeDerivation("d-two", ID_C, [ID_B]);
    const dThree = makeDerivation("d-three", ID_C, [ID_A, ID_B]);
    await service.recordDerivation(dOne);
    await service.recordDerivation(dTwo);
    await service.recordDerivation(dThree);

    const readA = await service.getEvidence(ID_A);
    expect(readA?.derivations.inputsOf).toEqual([dOne, dThree].sort((a, b) =>
      canonicalJsonStringify(a).localeCompare(canonicalJsonStringify(b)),
    ));
    expect(readA?.derivations.derivedFrom).toEqual([]);

    const readB = await service.getEvidence(ID_B);
    expect(readB?.derivations.inputsOf).toEqual([dTwo, dThree].sort((a, b) =>
      canonicalJsonStringify(a).localeCompare(canonicalJsonStringify(b)),
    ));
    expect(readB?.derivations.derivedFrom).toEqual([dOne]);

    const readC = await service.getEvidence(ID_C);
    expect(readC?.derivations.inputsOf).toEqual([]);
    expect(readC?.derivations.derivedFrom).toEqual([dTwo, dThree].sort((a, b) =>
      canonicalJsonStringify(a).localeCompare(canonicalJsonStringify(b)),
    ));
  });

  test(`${name}: reads surface upstream invalidations transitively`, async () => {
    const service = makeService(makeStore());
    await service.registerEvidence(evidenceA);
    await service.registerEvidence(evidenceB);
    await service.registerEvidence(evidenceC);
    await service.recordDerivation(makeDerivation("d-up-1", ID_B, [ID_A]));
    await service.recordDerivation(makeDerivation("d-up-2", ID_C, [ID_B]));

    await service.invalidateEvidence(ID_A, "camera bump corrupted the frame");
    const info = { contentId: ID_A, reason: "camera bump corrupted the frame", invalidatedAt: FIXED_NOW };

    const readB = await service.getEvidence(ID_B);
    expect(readB?.invalidation).toBeNull();
    expect(readB?.upstreamInvalidations).toEqual([info]);

    const readC = await service.getEvidence(ID_C);
    expect(readC?.upstreamInvalidations).toEqual([info]);

    // Registrations that REFERENCE invalidated evidence remain allowed.
    const derived = makeDerivation("d-up-3", ID_C, [ID_A, ID_B]);
    expect((await service.recordDerivation(derived)).kind).toBe("recorded");

    // Provenance links to invalidated evidence remain allowed too, and an
    // evidence→evidence link surfaces the object's invalidation upstream.
    const link = makeLink("evidence", ID_B, ID_A, "DERIVED_FROM");
    expect((await service.addProvenanceLink(link)).kind).toBe("linked");
    const readBLinked = await service.getEvidence(ID_B);
    expect(readBLinked?.upstreamInvalidations).toEqual([info]);
  });

  test(`${name}: unknown reads return null and views start empty`, async () => {
    const service = makeService(makeStore());
    expect(await service.getEvidence(ID_UNKNOWN)).toBeNull();
    await service.registerEvidence(evidenceA);
    const view = await service.getEvidence(ID_A);
    expect(view?.upstreamInvalidations).toEqual([]);
    expect(view?.evidence.acquisitionMetadata["mission.id"]).toBe("mission-2026-000042");
  });
}

describe("evidence service policy (in-memory store)", () => {
  servicePolicy("memory", () => new InMemoryEvidenceStore());
});

describe("evidence service policy (file-system store)", () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const dir of roots) {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  servicePolicy("fs", () => {
    const dir = mkdtempSync(join(tmpdir(), "aise-evidence-policy-"));
    roots.push(dir);
    return new FsEvidenceStore(dir);
  });
});

/* ------------------------------------------------------------------ */
/* Content pinning gate                                                */
/* ------------------------------------------------------------------ */

describe("content pinning gate", () => {
  test("rejects unpinned content and accepts pinned content", async () => {
    const store = new InMemoryEvidenceStore();
    const pinned = makeEvidence("pin-ok");
    const unpinned = makeEvidence("pin-missing");
    const service = makeService(store, setResolver(new Set([pinned.contentId])));

    await expectEvidenceError(
      service.registerEvidence(unpinned),
      "content_not_pinned",
      unpinned.contentId,
    );
    expect(await store.getEvidenceRecord(unpinned.contentId)).toBeNull();

    const ok = await service.registerEvidence(pinned);
    expect(ok.kind).toBe("registered");
  });

  test("adapts the AISE-004 capture store as the pinning resolver", async () => {
    const bytes = new TextEncoder().encode("aise-evidence-pinned-asset");
    const contentId = sha256Hex(bytes);
    const captureStore = new InMemoryCaptureStore();
    await captureStore.putAsset(contentId, bytes, "image/jpeg", FIXED_NOW);

    const store = new InMemoryEvidenceStore();
    const service = makeService(store, captureStoreContentResolver(captureStore));
    const evidence = makeEvidence("pin-capture", { contentId });

    expect((await service.registerEvidence(evidence)).kind).toBe("registered");
    await expectEvidenceError(
      service.registerEvidence(makeEvidence("pin-capture-other")),
      "content_not_pinned",
    );
  });

  test("the gate applies to NEW registrations only (idempotency first)", async () => {
    const store = new InMemoryEvidenceStore();
    const evidence = makeEvidence("pin-order");
    await makeService(store, setResolver(new Set([evidence.contentId]))).registerEvidence(
      evidence,
    );
    // A second service with an empty resolver re-registers identically: the
    // immutable-record gate decides before the pinning gate.
    const again = await makeService(store, neverResolver).registerEvidence(evidence);
    expect(again.kind).toBe("idempotent");
  });

  test("without a resolver the gate is absent", async () => {
    const service = makeService(new InMemoryEvidenceStore());
    expect((await service.registerEvidence(makeEvidence("pin-absent"))).kind).toBe(
      "registered",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Immutability on disk                                                */
/* ------------------------------------------------------------------ */

/** Snapshot every file under `root` as relative-path → bytes. */
function snapshotTree(root: string): Map<string, string> {
  const snapshot = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        snapshot.set(relative(root, path), readFileSync(path, "utf8"));
      }
    }
  };
  walk(root);
  return snapshot;
}

describe("immutability and determinism (FsEvidenceStore)", () => {
  test("register + link + derivation: no later operation rewrites any file", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "data");
      const evidenceDir = join(dataDir, "evidence");
      const service = makeService(new FsEvidenceStore(dataDir));
      const a = makeEvidence("immutable-a");
      const b = makeEvidence("immutable-b");
      await service.registerEvidence(a);
      await service.registerEvidence(b);
      await service.addProvenanceLink(makeLink("measurement", "meas-1", a.contentId));
      await service.recordDerivation(makeDerivation("d-imm", b.contentId, [a.contentId]));

      const recordA = join("records", `${sha256Hex(a.contentId)}.json`);
      const before = snapshotTree(evidenceDir);
      expect(before.size).toBe(4); // two records + one link + one derivation journal

      // Idempotent retries, duplicate appends and reads: zero byte changes.
      await service.registerEvidence(a);
      await service.addProvenanceLink(makeLink("measurement", "meas-1", a.contentId));
      await service.recordDerivation(makeDerivation("d-imm", b.contentId, [a.contentId]));
      await service.getEvidence(a.contentId);
      await service.listEvidence({ includeInvalidated: true });
      expect(snapshotTree(evidenceDir)).toEqual(before);

      // Invalidation appends a separate file; record bytes stay unchanged.
      await service.invalidateEvidence(a.contentId, "flagged for removal");
      const after = snapshotTree(evidenceDir);
      expect(after.size).toBe(5);
      expect(after.get(recordA)).toBe(before.get(recordA));
      // The record is still fully readable with the invalidation attached.
      const view = await service.getEvidence(a.contentId);
      expect(view?.evidence).toEqual(a);
      expect(view?.invalidation?.reason).toBe("flagged for removal");
    });
  });

  test("same operations + same clock -> byte-identical persisted state", async () => {
    const runScenario = async (dataDir: string): Promise<Map<string, string>> => {
      const service = makeService(new FsEvidenceStore(dataDir));
      const a = makeEvidence("determinism-a");
      const b = makeEvidence("determinism-b");
      const c = makeEvidence("determinism-c");
      await service.registerEvidence(a);
      await service.registerEvidence(b);
      await service.registerEvidence(c);
      await service.addProvenanceLink(makeLink("measurement", "meas-9", a.contentId));
      await service.addProvenanceLink(makeLink("evidence", b.contentId, a.contentId, "DERIVED_FROM"));
      await service.recordDerivation(makeDerivation("d-det-1", b.contentId, [a.contentId]));
      await service.recordDerivation(makeDerivation("d-det-2", c.contentId, [a.contentId, b.contentId]));
      await service.invalidateEvidence(a.contentId, "identical replay");
      await service.getEvidence(a.contentId);
      await service.getEvidence(c.contentId);
      await service.listEvidence();
      await service.listEvidence({ includeInvalidated: true });
      return snapshotTree(join(dataDir, "evidence"));
    };

    await withTempDir(async (first) => {
      await withTempDir(async (second) => {
        const one = await runScenario(join(first, "data"));
        const two = await runScenario(join(second, "data"));
        expect(one.size).toBeGreaterThan(0);
        expect(two).toEqual(one);
      });
    });
  });
});
