/**
 * Evidence store tests: append-only, boundary-verifying
 * persistence — the store does not trust the caller (the AISE-008
 * lesson applied to evidence). Identity re-derivation, capture
 * binding verification against the injected upload reader, subject
 * resolution against the injected model reader, idempotent
 * replay, and live-state reads.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import {
  evidenceLink,
  evidenceRecord,
  type EvidenceLink,
  type EvidenceRecord,
  type EvidenceSubject,
} from "@aise/engineering-model";
import { EvidenceServiceError } from "./errors.js";
import type { CaptureUploadReader, CaptureUploadView } from "./capture.js";
import { createInMemoryEvidenceStore, type EvidenceStore, type ModelGraphReader } from "./store.js";

const MODEL = "model-store";
const PROJECT = "project-store";
const SPACE = "room-store";
const EVIDENCE = "ev-abcdef0123456789";

// ---------------------------------------------------------------------------
// The committed model graph subjects resolve against (the real
// AISE-010 → AISE-011 chain, deterministic).
// ---------------------------------------------------------------------------

const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
const target = { modelId: MODEL, projectId: PROJECT, spaceId: SPACE };
const { graph } = ingestArchitecturalScene(scene, target);

const doorId = graph.objects.find((object) => object.objectClass === "DOOR")!.objectId;

const doorSubject: EvidenceSubject = { kind: "object-existence", modelId: MODEL, version: 1, objectId: doorId };
const roomHeightSubject: EvidenceSubject = { kind: "space-property", modelId: MODEL, version: 1, spaceId: SPACE, propertyKey: "roomHeight" };

const modelReader: ModelGraphReader = {
  getModelGraph: (modelId, version) => (modelId === MODEL && version === 1 ? graph : undefined),
};

// ---------------------------------------------------------------------------
// The capture reader (the AISE-004 boundary view, injected).
// ---------------------------------------------------------------------------

const UPLOAD_SESSION = "session-0123456789abcdef";
const UPLOAD_ASSET = "asset-0123456789abcdef";
const UPLOAD: CaptureUploadView = {
  projectId: PROJECT,
  sessionId: UPLOAD_SESSION,
  assetId: UPLOAD_ASSET,
  packageId: "package-0123456789abcdef",
  assetType: "DEPTH",
  receivedHash: "d".repeat(64),
  byteSize: 2048,
  acquisition: { capturedAt: "2026-09-01T09:30:00Z" },
};

function captureReader(uploads: readonly CaptureUploadView[] = [UPLOAD]): CaptureUploadReader {
  const byKey = new Map(uploads.map((upload) => [`${upload.sessionId}/${upload.assetId}`, upload]));
  return {
    getUpload: (sessionId, assetId) => byKey.get(`${sessionId}/${assetId}`),
  };
}

// ---------------------------------------------------------------------------
// Clock and builders
// ---------------------------------------------------------------------------

const FIRST_TICK = "2026-09-04T12:00:00Z";
let tick = 0;
function makeStore(options: { captureReader?: CaptureUploadReader; modelReader?: ModelGraphReader } = {}): EvidenceStore {
  tick = 0;
  return createInMemoryEvidenceStore({
    now: () => {
      tick += 1;
      return `2026-09-04T12:${String(tick).padStart(2, "0")}:00Z`;
    },
    ...(options.captureReader !== undefined ? { captureReader: options.captureReader } : {}),
    ...(options.modelReader !== undefined ? { modelReader: options.modelReader } : {}),
  });
}

/** A valid capture-bound LIDAR record for the standard upload. */
function lidarRecord(overrides: Record<string, unknown> = {}): EvidenceRecord {
  return evidenceRecord({
    kind: "LIDAR",
    source: {
      kind: "capture",
      sessionId: UPLOAD_SESSION,
      assetId: UPLOAD_ASSET,
      packageId: UPLOAD.packageId,
      assetType: "DEPTH",
      contentHash: UPLOAD.receivedHash,
      byteSize: UPLOAD.byteSize,
      acquisition: UPLOAD.acquisition,
    },
    recordedBy: "svc:evidence-ingest",
    recordedAt: FIRST_TICK,
    ...overrides,
  });
}

/** A valid standalone measurement record (no capture binding). */
function measurementRecord(value = 3.0): EvidenceRecord {
  return evidenceRecord({
    kind: "MEASUREMENT",
    source: {
      kind: "manual-measurement",
      value,
      unit: "m",
      method: "survey/total-station",
      measuredBy: "surveyor-bob",
      measuredAt: "2026-09-03T14:00:00Z",
    },
    recordedBy: "svc:evidence-ingest",
    recordedAt: FIRST_TICK,
  });
}

function link(subject: EvidenceSubject, evidenceId: string, overrides: Partial<EvidenceLink> = {}): EvidenceLink {
  return evidenceLink({
    subject,
    evidenceId,
    linkedBy: "svc:review-linker",
    linkedAt: FIRST_TICK,
    ...overrides,
  });
}

function errorOf(action: () => unknown): EvidenceServiceError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(EvidenceServiceError);
    return error as EvidenceServiceError;
  }
  throw new Error("expected the action to throw");
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe("registerEvidence (the store does not trust the caller)", () => {
  it("creates, then reports identical re-registration (idempotent)", () => {
    const store = makeStore({ modelReader });
    const record = measurementRecord();
    expect(store.registerEvidence(PROJECT, record)).toEqual({ status: "created" });
    expect(store.registerEvidence(PROJECT, record)).toEqual({ status: "exists_identical" });
  });

  it("rejects a forged identity (re-derived, never trusted)", () => {
    const store = makeStore({ modelReader });
    const record = measurementRecord();
    const forged = { ...record, evidenceId: "ev-0000000000000000" };
    expect(errorOf(() => store.registerEvidence(PROJECT, forged)).code).toBe("IDENTITY_COLLISION");
    expect(store.listEvidence(PROJECT)).toHaveLength(0);
  });

  it("rejects a forged content hash (bit-drift detection)", () => {
    const store = makeStore({ modelReader });
    const record = measurementRecord();
    const forged = { ...record, contentHash: "0".repeat(64) };
    expect(errorOf(() => store.registerEvidence(PROJECT, forged)).code).toBe("IDENTITY_COLLISION");
  });

  it("reports a conflicting re-registration of the same identity (never merged)", () => {
    const store = makeStore({ modelReader });
    // A document's pin is its documentId; the title is content.
    // Same pin + drifted content → same identity, different content
    // hash → conflict, never a silent merge.
    const document = (title: string): EvidenceRecord =>
      evidenceRecord({
        kind: "DOCUMENT",
        source: {
          kind: "document",
          documentId: "doc-fire-rating-01",
          documentHash: "e".repeat(64),
          title,
          issuedBy: "architect-alice",
          issuedAt: "2026-08-20T12:00:00Z",
        },
        recordedBy: "svc:evidence-ingest",
        recordedAt: FIRST_TICK,
      });
    expect(store.registerEvidence(PROJECT, document("Fire rating specification"))).toEqual({ status: "created" });
    expect(store.registerEvidence(PROJECT, document("Revised title"))).toEqual({ status: "exists_conflict" });
    expect(store.listEvidence(PROJECT)).toHaveLength(1);
    expect(store.getEvidence(PROJECT, document("Fire rating specification").evidenceId)?.record.contentHash).toBe(
      document("Fire rating specification").contentHash,
    );
  });

  it("rejects malformed project ids", () => {
    const store = makeStore({ modelReader });
    expect(errorOf(() => store.registerEvidence("bad project", measurementRecord())).code).toBe("EVIDENCE_INVALID");
  });

  it("isolates projects (tenant boundary)", () => {
    const store = makeStore({ modelReader });
    const record = measurementRecord();
    store.registerEvidence(PROJECT, record);
    expect(store.registerEvidence("project-other", record)).toEqual({ status: "created" });
    expect(store.listEvidence(PROJECT)).toHaveLength(1);
    expect(store.listEvidence("project-other")).toHaveLength(1);
  });
});

describe("capture-boundary verification (the binding is checked, not claimed)", () => {
  it("rejects capture-bound records when no upload reader is configured", () => {
    const store = makeStore();
    expect(errorOf(() => store.registerEvidence(PROJECT, lidarRecord())).code).toBe("CAPTURE_BINDING_INVALID");
  });

  it("rejects bindings to unknown uploads", () => {
    const store = makeStore({ modelReader, captureReader: captureReader([]) });
    expect(errorOf(() => store.registerEvidence(PROJECT, lidarRecord())).code).toBe("CAPTURE_UPLOAD_NOT_FOUND");
  });

  it("rejects cross-project uploads (tenant integrity)", () => {
    const foreign = { ...UPLOAD, projectId: "project-other" };
    const store = makeStore({ modelReader, captureReader: captureReader([foreign]) });
    expect(errorOf(() => store.registerEvidence(PROJECT, lidarRecord())).code).toBe("PROJECT_MISMATCH");
  });

  it("rejects every binding-field disagreement with the ingestion record", () => {
    const drifts: readonly (readonly [string, CaptureUploadView])[] = [
      ["hash", { ...UPLOAD, receivedHash: "e".repeat(64) }],
      ["byteSize", { ...UPLOAD, byteSize: 9999 }],
      ["packageId", { ...UPLOAD, packageId: "package-fedcba9876543210" }],
      ["capturedAt", { ...UPLOAD, acquisition: { capturedAt: "2026-08-01T09:30:00Z" } }],
      ["assetType", { ...UPLOAD, assetType: "PHOTO" as const }],
    ];
    for (const [label, drifted] of drifts) {
      const store = makeStore({ modelReader, captureReader: captureReader([drifted]) });
      const error = errorOf(() => store.registerEvidence(PROJECT, lidarRecord()));
      expect(error.code, `drift: ${label}`).toBe("CAPTURE_BINDING_INVALID");
      expect(store.listEvidence(PROJECT)).toHaveLength(0);
    }
  });

  it("accepts the genuine binding and registers the record", () => {
    const store = makeStore({ modelReader, captureReader: captureReader() });
    expect(store.registerEvidence(PROJECT, lidarRecord())).toEqual({ status: "created" });
    expect(store.getEvidence(PROJECT, lidarRecord().evidenceId)?.record.kind).toBe("LIDAR");
  });

  it("standalone records need no upload reader", () => {
    const store = makeStore();
    expect(store.registerEvidence(PROJECT, measurementRecord())).toEqual({ status: "created" });
  });
});

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

describe("addLink (subject verification is mandatory)", () => {
  it("adds a link to a registered subject and reports idempotent replay", () => {
    const store = makeStore({ modelReader });
    const record = measurementRecord();
    store.registerEvidence(PROJECT, record);
    const theLink = link(doorSubject, record.evidenceId);
    expect(store.addLink(PROJECT, theLink)).toEqual({ status: "added" });
    expect(store.addLink(PROJECT, theLink)).toEqual({ status: "already_present" });
    expect(store.listLinks(PROJECT)).toHaveLength(1);
  });

  it("rejects links without a configured model reader", () => {
    const store = makeStore();
    const record = measurementRecord();
    store.registerEvidence(PROJECT, record);
    expect(errorOf(() => store.addLink(PROJECT, link(doorSubject, record.evidenceId))).code).toBe("SUBJECT_INVALID");
  });

  it("rejects links to uncommitted model versions", () => {
    const store = makeStore({ modelReader });
    const record = measurementRecord();
    store.registerEvidence(PROJECT, record);
    const future: EvidenceSubject = { kind: "object-existence", modelId: MODEL, version: 7, objectId: doorId };
    expect(errorOf(() => store.addLink(PROJECT, link(future, record.evidenceId))).code).toBe("MODEL_VERSION_NOT_FOUND");
  });

  it("rejects subjects that do not resolve in the committed graph", () => {
    const store = makeStore({ modelReader });
    const record = measurementRecord();
    store.registerEvidence(PROJECT, record);
    const ghost: EvidenceSubject = { kind: "object-existence", modelId: MODEL, version: 1, objectId: "ro-ghost0000000000" };
    expect(errorOf(() => store.addLink(PROJECT, link(ghost, record.evidenceId))).code).toBe("SUBJECT_NOT_FOUND");

    const missingProperty: EvidenceSubject = { kind: "space-property", modelId: MODEL, version: 1, spaceId: SPACE, propertyKey: "doesNotExist" };
    expect(errorOf(() => store.addLink(PROJECT, link(missingProperty, record.evidenceId))).code).toBe("SUBJECT_NOT_FOUND");
  });

  it("rejects cross-project models (tenant integrity)", () => {
    const graphOfOther = ingestArchitecturalScene(scene, { modelId: "model-other", projectId: "project-other", spaceId: SPACE });
    const reader: ModelGraphReader = {
      getModelGraph: (modelId, version) =>
        modelId === MODEL
          ? graph
          : modelId === "model-other" && version === 1
            ? graphOfOther.graph
            : undefined,
    };
    const store = makeStore({ modelReader: reader });
    const record = measurementRecord();
    store.registerEvidence(PROJECT, record);
    const foreign: EvidenceSubject = { kind: "object-existence", modelId: "model-other", version: 1, objectId: graphOfOther.graph.objects[0]!.objectId };
    expect(errorOf(() => store.addLink(PROJECT, link(foreign, record.evidenceId))).code).toBe("PROJECT_MISMATCH");
  });

  it("rejects links to unregistered evidence", () => {
    const store = makeStore({ modelReader });
    expect(errorOf(() => store.addLink(PROJECT, link(doorSubject, EVIDENCE))).code).toBe("EVIDENCE_NOT_FOUND");
  });

  it("rejects links to retracted evidence (retraction is final)", () => {
    const store = makeStore({ modelReader });
    const record = measurementRecord();
    store.registerEvidence(PROJECT, record);
    store.retractEvidence(PROJECT, record.evidenceId, { retractedBy: "user:reviewer", reason: "r" });
    expect(errorOf(() => store.addLink(PROJECT, link(doorSubject, record.evidenceId))).code).toBe("EVIDENCE_RETRACTED");
  });

  it("rejects a retracted link identity — re-attachment is a new event", () => {
    const store = makeStore({ modelReader });
    const record = measurementRecord();
    store.registerEvidence(PROJECT, record);
    const first = link(doorSubject, record.evidenceId);
    store.addLink(PROJECT, first);
    store.retractLink(PROJECT, first.linkId, { retractedBy: "user:reviewer", reason: "wrong subject" });
    // Replaying the SAME event cannot resurrect it.
    expect(errorOf(() => store.addLink(PROJECT, first)).code).toBe("IDENTITY_COLLISION");
    // A deliberate re-attachment is a NEW event (different instant → different identity).
    const reattached = link(doorSubject, record.evidenceId, { linkedAt: "2026-09-04T13:00:00Z" });
    expect(store.addLink(PROJECT, reattached)).toEqual({ status: "added" });
    expect(store.counts(PROJECT)).toEqual({ records: 1, links: 2, evidenceRetractions: 0, linkRetractions: 1 });
  });
});

// ---------------------------------------------------------------------------
// Retractions
// ---------------------------------------------------------------------------

describe("retractions (append-only; final)", () => {
  function stocked(): EvidenceStore {
    const store = makeStore({ modelReader });
    const record = measurementRecord();
    store.registerEvidence(PROJECT, record);
    store.addLink(PROJECT, link(doorSubject, record.evidenceId));
    return store;
  }

  it("retracts evidence once, then reports already_retracted", () => {
    const store = stocked();
    const record = measurementRecord();
    expect(store.retractEvidence(PROJECT, record.evidenceId, { retractedBy: "user:reviewer", reason: "r" })).toEqual({ status: "retracted" });
    expect(store.retractEvidence(PROJECT, record.evidenceId, { retractedBy: "user:reviewer", reason: "r" })).toEqual({ status: "already_retracted" });
    expect(store.getEvidence(PROJECT, record.evidenceId)?.retraction?.reason).toBe("r");
  });

  it("retracts links once, then reports already_retracted", () => {
    const store = stocked();
    const theLink = link(doorSubject, measurementRecord().evidenceId);
    expect(store.retractLink(PROJECT, theLink.linkId, { retractedBy: "user:reviewer", reason: "r" })).toEqual({ status: "retracted" });
    expect(store.retractLink(PROJECT, theLink.linkId, { retractedBy: "user:reviewer", reason: "r" })).toEqual({ status: "already_retracted" });
  });

  it("reports not_found for unknown ids", () => {
    const store = stocked();
    expect(store.retractEvidence(PROJECT, EVIDENCE, { retractedBy: "u", reason: "r" })).toEqual({ status: "not_found" });
    expect(store.retractLink(PROJECT, "lnk-unknown00000000", { retractedBy: "u", reason: "r" })).toEqual({ status: "not_found" });
  });

  it("rejects a retraction that precedes the event it retracts", () => {
    const store = stocked();
    const record = measurementRecord();
    expect(
      errorOf(() =>
        store.retractEvidence(PROJECT, record.evidenceId, {
          retractedBy: "user:reviewer",
          reason: "r",
          retractedAt: "2026-01-01T00:00:00Z",
        }),
      ).code,
    ).toBe("RETRACTION_INVALID");
  });

  it("uses the injected clock when no instant is supplied", () => {
    const store = stocked();
    const record = measurementRecord();
    store.retractEvidence(PROJECT, record.evidenceId, { retractedBy: "user:reviewer", reason: "r" });
    expect(store.getEvidence(PROJECT, record.evidenceId)?.retraction?.retractedAt).toBe("2026-09-04T12:01:00Z");
  });
});

// ---------------------------------------------------------------------------
// Live-state reads and snapshots
// ---------------------------------------------------------------------------

describe("live-state reads (retractions remove; history remains)", () => {
  function mapping() {
    const store = makeStore({ modelReader, captureReader: captureReader() });
    const lidar = lidarRecord();
    const measurement = measurementRecord();
    store.registerEvidence(PROJECT, lidar);
    store.registerEvidence(PROJECT, measurement);
    store.addLink(PROJECT, link(doorSubject, lidar.evidenceId));
    const heightLink = link(roomHeightSubject, measurement.evidenceId);
    store.addLink(PROJECT, heightLink);
    // Retract the height LINK (not the evidence).
    store.retractLink(PROJECT, heightLink.linkId, { retractedBy: "user:reviewer", reason: "review" });
    // Retract the lidar EVIDENCE (not the link).
    store.retractEvidence(PROJECT, lidar.evidenceId, { retractedBy: "user:reviewer", reason: "upstream" });
    return { store, lidar, measurement };
  }

  it("linksForSubject excludes retracted links", () => {
    const { store } = mapping();
    expect(store.linksForSubject(PROJECT, roomHeightSubject).map((l) => l.linkId)).toEqual([]);
  });

  it("evidenceForSubject excludes retracted evidence behind live links", () => {
    const { store } = mapping();
    // The door's link is live, but its evidence is retracted → no live support.
    expect(store.evidenceForSubject(PROJECT, doorSubject).map((r) => r.evidenceId)).toEqual([]);
  });

  it("subjectsForEvidence returns only subjects with live support", () => {
    const { store, lidar, measurement } = mapping();
    expect(store.subjectsForEvidence(PROJECT, lidar.evidenceId)).toEqual([]);
    expect(store.subjectsForEvidence(PROJECT, measurement.evidenceId)).toEqual([]);
  });

  it("the snapshot is the canonical frozen graph and validates at the boundary", () => {
    const { store } = mapping();
    const snapshot = store.snapshot(PROJECT);
    expect(snapshot).toBeDefined();
    expect(Object.isFrozen(snapshot)).toBe(true);
    // History remains: both links and both records are in the mapping.
    expect(snapshot!.records).toHaveLength(2);
    expect(snapshot!.links).toHaveLength(2);
    expect(snapshot!.evidenceRetractions).toHaveLength(1);
    expect(snapshot!.linkRetractions).toHaveLength(1);
  });

  it("the snapshot is deterministic (rebuild yields the identical digest)", () => {
    const { store } = mapping();
    const first = store.snapshot(PROJECT)!;
    const second = store.snapshot(PROJECT)!;
    expect(second.digest).toBe(first.digest);
  });
});
