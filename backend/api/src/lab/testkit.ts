/**
 * AISE-035 — Physical Reality Lab testkit: deterministic fixture machinery.
 *
 * LAB HARNESS, NOT PRODUCTION RUNTIME: this module (like the whole lab/) is
 * imported ONLY by lab code and lab tests — it is never wired into server.ts
 * or any production entrypoint. It reuses the BOQ testkit's committed
 * XLSX/ZIP writer (fixture construction over real parse contracts, exactly
 * the way the BOQ module's own tests use it) and the benchmarks module's
 * published LCG noise discipline — importing sibling PUBLIC surfaces and
 * testkits is the contract the work order grants; the lab never modifies
 * them and never re-implements a pipeline stage.
 *
 * Determinism contract (mirrors the house style): every clock is a constant
 * function over fixed ISO instants; every id is content-derived (sha-256) or
 * counter-based; capture fixtures are pure functions of the scenario ground
 * truth + the documented noise policy; no wall clock, no Math.random, no
 * network, no I/O outside temp dirs (tests only).
 *
 * NOISE POLICY (documented, matches the AISE-019 fixture discipline): the
 * lab's simulated flagship-LiDAR device displaces each depth point along the
 * surface's outward unit normal by sigma*N(0,1) with bias 0, drawn from the
 * published LCG (a=1664525, c=1013904223, mod 2^32; Box-Muller) seeded by
 * uint32(sha256(frameAssetId)[0..8]) — consumed in fixed point order. The
 * declared per-plane 1σ (LAB_DEVICE_SIGMA_M) is the ONLY uncertainty ever
 * attached downstream (never fabricated from point counts).
 */

import {
  CONTRACT_VERSION,
  SyncBatchCodec,
  type CaptureSessionEnvelope,
  type DeviceCapabilityProfile,
  type Evidence,
  type SyncBatch,
} from "@aise/shared-contracts";
import { Lcg, seedOf } from "../benchmarks/fixtures";
import { buildXlsx } from "../boq/testkit";
import { sha256Hex } from "../lib/hash";
import { vec, type Plane, type Vec3 } from "../geometry";
import type { LabBoqSpec, LabCaptureAssetSpec, LabScenario } from "./scenarios";
import type { LabGroundTruth, LabSurfaceTruth } from "./groundtruth";

/* ------------------------------------------------------------------ */
/* Fixed clocks (one constant instant per pipeline phase)              */
/* ------------------------------------------------------------------ */

export const LAB_CLOCK = {
  plan: "2026-04-06T08:00:00.000Z",
  capture: "2026-04-06T08:41:12.000Z",
  capturedAt: "2026-04-06T08:30:44.000Z",
  startedAt: "2026-04-06T08:25:00.000Z",
  endedAt: "2026-04-06T08:55:10.000Z",
  evidence: "2026-04-06T09:05:00.000Z",
  reconstruction: "2026-04-06T09:12:30.000Z",
  semantics: "2026-04-06T09:18:00.000Z",
  reality: "2026-04-06T09:24:00.000Z",
  assurance: "2026-04-06T09:30:00.000Z",
  verification: "2026-04-06T09:31:00.000Z",
  changedetection: "2026-04-06T09:33:00.000Z",
  boq: "2026-04-06T09:40:00.000Z",
  gaps: "2026-04-06T09:45:00.000Z",
  caseReview: "2026-04-06T10:02:00.000Z",
  intervention: "2026-04-06T10:10:00.000Z",
  impact: "2026-04-06T10:16:00.000Z",
  executedAt: "2026-04-07T14:00:00.000Z",
  execution: "2026-04-07T14:22:00.000Z",
  postWorkCapture: "2026-04-08T09:03:00.000Z",
  postWorkCapturedAt: "2026-04-08T08:47:21.000Z",
  postWorkStartedAt: "2026-04-08T08:40:00.000Z",
  postWorkEndedAt: "2026-04-08T08:52:33.000Z",
  postWorkEvidence: "2026-04-08T09:05:00.000Z",
  postWorkReconstruction: "2026-04-08T09:09:00.000Z",
  postWorkReality: "2026-04-08T09:14:00.000Z",
  postWorkAssurance: "2026-04-08T09:20:00.000Z",
  postWorkVerification: "2026-04-08T09:21:00.000Z",
  postWorkChangedetection: "2026-04-08T09:23:00.000Z",
  outcome: "2026-04-08T09:30:00.000Z",
  report: "2026-04-08T10:00:00.000Z",
} as const;

/** Constant clock over one fixed instant (byte-stable records). */
export function constantClock(instant: string): () => string {
  return (): string => instant;
}

/* ------------------------------------------------------------------ */
/* Id factories                                                         */
/* ------------------------------------------------------------------ */

/** Counter-based deterministic id factory (allocation order observable). */
export function counterIdFactory(prefix: string): () => string {
  let counter = 0;
  return (): string => `${prefix}-${(counter += 1)}`;
}

/* ------------------------------------------------------------------ */
/* Device model + noise policy                                          */
/* ------------------------------------------------------------------ */

/**
 * The lab's simulated flagship-LiDAR device class (documented 1σ).
 *
 * VALUE RATIONALE (reviewer-verifiable): the geometry library's plane-
 * parallelism tolerance for dimensioning (`PARALLEL_ANGLE_TOLERANCE_RAD` =
 * 1e-4 rad) bounds the acceptable tilt of independently fitted planes. The
 * LS-fit tilt of a plane over a grid of side N spanning L metres under
 * per-point 1σ noise is ≈ σ·√(12/N)/L, so at σ = 0.0002 m even the smallest
 * fixture surface (3.0 m span, 6×6 grid → ≈ 3.9e-5 rad per plane) keeps a
 * two-plane combined tilt well under the tolerance, while plane_fit_rms
 * (≈ σ) and dimension/registration errors (≈ σ/√N) stay NON-TRIVIAL golden
 * metric values.
 */
export const LAB_DEVICE_CLASS = "lab-flagship-lidar-sim" as const;
/** Declared per-plane 1σ (m) of the lab device — the only σ ever attached. */
export const LAB_DEVICE_SIGMA_M = 0.0002;
/** Loud honesty: the lab device is a simulated fixture, not hardware. */
export const LAB_DEVICE_PROVENANCE = "lab-simulated-flagship-lidar-v1" as const;

/**
 * Deterministic device capability profile for mission planning (typed
 * contract object; all 8 domains supported — the flagship tier). Built here
 * because the missions testkit imports `bun:test` and must stay test-only.
 */
export function labDeviceProfile(profileId = "cap-profile-lab-035"): DeviceCapabilityProfile {
  const descriptor = (details: Record<string, string>) => ({
    contractVersion: CONTRACT_VERSION,
    status: "supported" as const,
    details,
    limitations: [],
  });
  return {
    contractVersion: CONTRACT_VERSION,
    profileId,
    capturedAt: LAB_CLOCK.capture,
    deviceIdentity: {
      deviceId: "device-lab-035",
      platform: "android",
      model: "AISE Lab Sim Device",
      osVersion: "15",
      appVersion: "0.5.0",
    },
    device: descriptor({ "battery.level": "96%" }),
    camera: descriptor({ "rear.sensors": "wide,tele" }),
    depth: descriptor({ "lidar": "true", "simulated.provenance": LAB_DEVICE_PROVENANCE }),
    imu: descriptor({ "gyroscope": "true" }),
    tracking: descriptor({ "pose.provider": "ARCore" }),
    compute: descriptor({ "ram.gb": "12" }),
    calibration: descriptor({ "intrinsics.source": "factory" }),
    environment: descriptor({ "illumination": "mixed" }),
  };
}

/* ------------------------------------------------------------------ */
/* Capture fixture construction (GEMINI capture-primary, as fixtures)   */
/* ------------------------------------------------------------------ */

/** One deterministic capture asset: bytes + its real sha-256 content id. */
export interface LabAssetFixture {
  readonly assetId: string;
  readonly bytes: Uint8Array;
  readonly contentId: string;
  readonly byteSize: number;
  readonly mediaType: string;
  readonly method: LabCaptureAssetSpec["method"];
  readonly surfaceId: string | null;
  readonly gridSide: number;
  readonly description: string;
}

/** The exact noiseless grid point (j, k) of a surface truth template. */
function gridPoint(truth: LabSurfaceTruth, j: number, k: number): Vec3 {
  const [ox, oy, oz] = truth.origin;
  const [ux, uy, uz] = truth.uAxis;
  const [vx, vy, vz] = truth.vAxis;
  const u = (j + 0.5) / truth.gridSide;
  const v = (k + 0.5) / truth.gridSide;
  return vec(ox + u * ux + v * vx, oy + u * uy + v * vy, oz + u * uz + v * vz);
}

/**
 * Encode a depth-map exchange-format v1 payload: one `x y z` line per point,
 * fixed 6-decimal formatting (byte-deterministic), `#` header comment.
 */
export function encodeDepthMapFrame(
  surfaceId: string,
  points: readonly Vec3[],
): Uint8Array {
  const lines = [`# aise-lab depth-map frame ${surfaceId} (exchange v1)`];
  for (const point of points) {
    lines.push(
      `${point[0].toFixed(6)} ${point[1].toFixed(6)} ${point[2].toFixed(6)}`,
    );
  }
  return new TextEncoder().encode(lines.join("\n") + "\n");
}

/** Deterministic non-depth asset bytes (photos, documents, measurements). */
function nonDepthBytes(assetId: string, description: string): Uint8Array {
  return new TextEncoder().encode(`aise-lab-asset:${assetId}:${description}`);
}

export interface BuildAssetsOptions {
  /**
   * Deliberate degradations (discrimination instruments, never baselines):
   *   corruptedCaptureAssetId — the frame's bytes become invalid depth-map
   *     text (the reconstruction must fail INPUT_INCOMPATIBLE naming it);
   *   injectedGeometryError — the frame's points are displaced along the
   *     surface normal by offsetM (a mis-registered capture frame).
   */
  readonly corruptedCaptureAssetId?: string;
  readonly injectedGeometryError?: { readonly assetId: string; readonly offsetM: number };
}

/**
 * Build a scenario's full capture-plan asset fixtures: depth frames observe
 * their surface's exact ground-truth grid under the documented noise policy;
 * other assets are deterministic byte payloads. Pure + deterministic.
 */
export function buildCaptureAssets(
  scenario: LabScenario,
  groundTruth: LabGroundTruth,
  plan: readonly LabCaptureAssetSpec[],
  options: BuildAssetsOptions = {},
): readonly LabAssetFixture[] {
  const assets: LabAssetFixture[] = [];
  for (const spec of plan) {
    let bytes: Uint8Array;
    if (spec.surfaceId !== null) {
      const truth = groundTruth.surfaces.find((s) => s.surfaceId === spec.surfaceId);
      if (truth === undefined) {
        throw new Error(`lab capture plan references unknown surface ${spec.surfaceId}`);
      }
      if (options.corruptedCaptureAssetId === spec.assetId) {
        // Deliberate corruption: NOT valid depth-map exchange v1.
        bytes = new TextEncoder().encode(
          `# corrupted frame ${spec.assetId}\nthis is not a depth map\n0 0\n`,
        );
      } else {
        const rng = new Lcg(seedOf(spec.assetId));
        const [nx, ny, nz] = truth.plane.normal;
        const points: Vec3[] = [];
        for (let j = 0; j < truth.gridSide; j += 1) {
          for (let k = 0; k < truth.gridSide; k += 1) {
            const exact = gridPoint(truth, j, k);
            const eps = LAB_DEVICE_SIGMA_M * rng.gaussian();
            const offset =
              options.injectedGeometryError?.assetId === spec.assetId
                ? options.injectedGeometryError.offsetM
                : 0;
            points.push(
              vec(
                exact[0] + nx * (eps + offset),
                exact[1] + ny * (eps + offset),
                exact[2] + nz * (eps + offset),
              ),
            );
          }
        }
        bytes = encodeDepthMapFrame(spec.surfaceId, points);
      }
    } else {
      bytes = nonDepthBytes(spec.assetId, spec.description);
    }
    assets.push({
      assetId: spec.assetId,
      bytes,
      contentId: sha256Hex(bytes),
      byteSize: bytes.length,
      mediaType: spec.mediaType,
      method: spec.method,
      surfaceId: spec.surfaceId,
      gridSide: spec.gridSide,
      description: spec.description,
    });
  }
  return assets;
}

/* ------------------------------------------------------------------ */
/* Real capture-contract documents (SyncBatch over the shared codecs)   */
/* ------------------------------------------------------------------ */

/** Evidence record for one lab asset (open metadata map preserved). */
export function labEvidence(
  asset: LabAssetFixture,
  sessionId: string,
  missionId: string,
  capturedAt: string,
): Evidence {
  return {
    contractVersion: CONTRACT_VERSION,
    contentId: asset.contentId,
    byteSize: asset.byteSize,
    mediaType: asset.mediaType,
    capturedAt,
    acquisitionMethod: asset.method,
    acquisitionMetadata: {
      "mission.id": missionId,
      "session.id": sessionId,
      "device.id": "device-lab-035",
      "capture.kind":
        asset.method === "DEPTH_SENSING"
          ? "depth-map-frame"
          : asset.method === "VISUAL_RECONSTRUCTION"
            ? "photogrammetry-frame"
            : asset.method === "DOCUMENT_REGION"
              ? "document-scan"
              : "field-note",
      "acquisition.sensorId": asset.method === "DEPTH_SENSING" ? "lidar-sim" : "rear-wide",
      "lab.assetId": asset.assetId,
      "lab.provenance": LAB_DEVICE_PROVENANCE,
    },
  };
}

/**
 * Session envelope + sync batch over the REAL shared contracts for a set of
 * lab assets (the GEMINI capture-primary portion as deterministic fixtures).
 */
export function labSyncBatch(input: {
  readonly sessionId: string;
  readonly missionId: string;
  readonly assets: readonly LabAssetFixture[];
  readonly startedAt: string;
  readonly endedAt: string;
  readonly capturedAt: string;
  readonly sequence?: number;
  readonly batchId?: string;
  readonly idempotencyKey?: string;
}): SyncBatch {
  const sequence = input.sequence ?? 1;
  const envelope: CaptureSessionEnvelope = {
    contractVersion: CONTRACT_VERSION,
    sessionId: input.sessionId,
    missionRef: input.missionId,
    deviceIdentity: labDeviceProfile().deviceIdentity,
    capabilityProfile: labDeviceProfile(),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    assets: input.assets.map((asset) =>
      labEvidence(asset, input.sessionId, input.missionId, input.capturedAt),
    ),
  };
  return {
    contractVersion: CONTRACT_VERSION,
    batchId: input.batchId ?? `batch-${input.sessionId}-${sequence}`,
    sessionId: input.sessionId,
    sequence,
    idempotencyKey: input.idempotencyKey ?? `idem-${input.sessionId}-${sequence}`,
    envelope,
    manifest: input.assets.map((asset) => ({
      contentId: asset.contentId,
      byteSize: asset.byteSize,
      mediaType: asset.mediaType,
    })),
  };
}

/** Canonical wire body for one lab batch (validates via the codec). */
export function labBatchBody(batch: SyncBatch): string {
  return SyncBatchCodec.encode(batch);
}

/* ------------------------------------------------------------------ */
/* BOQ fixture workbook (real XLSX over the BOQ testkit's writer)       */
/* ------------------------------------------------------------------ */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the scenario's BOQ fixture as a minimal-but-realistic XLSX package
 * (the proven mapping-test layout: merged banner row 1 whose text carries
 * the section/location hint, header row 2, item rows, TOTAL row — inline
 * strings, deterministic bytes via the BOQ testkit's committed writer).
 */
export function labBoqBytes(boq: LabBoqSpec): Uint8Array {
  const inline = (ref: string, value: string): string =>
    `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
  const number = (ref: string, value: number): string => `<c r="${ref}"><v>${value}</v></c>`;
  const rows: string[] = [
    // Row 1: merged banner title (the detected section title + location hint).
    `<row r="1">${inline("A1", boq.title)}</row>`,
    // Row 2: column headers.
    `<row r="2">${inline("A2", "Item")}${inline("B2", "Description")}${inline("C2", "Unit")}${inline("D2", "Qty")}${inline("E2", "Rate")}${inline("F2", "Remarks")}</row>`,
  ];
  // Item rows from row 3.
  boq.rows.forEach((row, index) => {
    const rowNumber = 3 + index;
    rows.push(
      `<row r="${rowNumber}">` +
        number(`A${rowNumber}`, row.itemId) +
        inline(`B${rowNumber}`, row.description) +
        inline(`C${rowNumber}`, row.unit) +
        number(`D${rowNumber}`, row.quantity) +
        number(`E${rowNumber}`, row.rate) +
        inline(`F${rowNumber}`, row.remarks) +
        "</row>",
    );
  });
  // TOTAL row over the quantity column.
  const totalRow = 3 + boq.rows.length;
  const totalQty = boq.rows.reduce((sum, row) => sum + row.quantity, 0);
  rows.push(`<row r="${totalRow}">${inline(`A${totalRow}`, "TOTAL")}${number(`D${totalRow}`, totalQty)}</row>`);
  const worksheet =
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    rows.join("") +
    "</sheetData>" +
    `<mergeCells count="1"><mergeCell ref="A1:F1"/></mergeCells>` +
    "</worksheet>";
  return buildXlsx({
    worksheet,
    sheetName: boq.sheetName,
  });
}

/* ------------------------------------------------------------------ */
/* Purity                                                               */
/* ------------------------------------------------------------------ */

/** Recursively freeze an object graph (mutation attempts throw). */
export function deepFreeze<T>(value: T): T {
  if (Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.getOwnPropertyNames(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value);
  }
  return value;
}

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "aise-lab-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The lab's plane convention check helper (unit normal or throws). */
export function assertUnitNormal(plane: Plane): void {
  const norm = Math.hypot(plane.normal[0], plane.normal[1], plane.normal[2]);
  if (Math.abs(norm - 1) > 1e-9) {
    throw new Error(`lab fixture plane normal is not unit (|n|=${norm})`);
  }
}
