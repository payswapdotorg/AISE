/**
 * Deterministic mission-planner test fixtures (AISE-007) — TEST SUPPORT
 * ONLY, never imported by production modules.
 *
 * Device profiles are built as typed contract objects and round-tripped
 * through `encodeDeviceCapabilityProfile`, so fixtures are always
 * schema-valid wire documents (all 8 capability domains required). All
 * timestamps are fixed constants; the clock is constant; identifiers come
 * from a counter. No wall-clock, no randomness, no network — the verify
 * gate stays deterministic.
 */

import { expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalJsonStringify,
  CONTRACT_VERSION,
  decodeCaptureMission,
  decodeCaptureMissionStrict,
  decodeCaptureStepStrict,
  decodeEvidenceGapStrict,
  decodeReferenceControlStrict,
  encodeDeviceCapabilityProfile,
  CaptureMissionCodec,
  type CapabilityDescriptor,
  type CapabilityStatus,
  type CaptureMission,
  type DeviceCapabilityProfile,
} from "@aise/shared-contracts";
import { createMissionPlanner, type CapabilityDomain, type MissionPlanner } from "./planner";

/* ------------------------------------------------------------------ */
/* Fixed determinism                                                    */
/* ------------------------------------------------------------------ */

export const FIXED_NOW = "2026-01-15T11:00:00.000Z";
export const FIXED_CAPTURED_AT = "2026-01-15T10:36:12.000Z";
export const FIXED_LATER = "2026-01-15T12:30:00.000Z";

/** Injected clock: constant, so missions are byte-stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Counter-based id factory: deterministic, allocation order observable. */
export function counterIdFactory(prefix: string): () => string {
  let counter = 0;
  return () => `${prefix}-${(counter += 1)}`;
}

/** A planner with fully deterministic injections (ids prefixed per fixture). */
export function deterministicPlanner(idPrefix = "id"): MissionPlanner {
  return createMissionPlanner({ clock: fixedClock, idFactory: counterIdFactory(idPrefix) });
}

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-missions-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* Device capability profile fixtures (all 8 domains)                   */
/* ------------------------------------------------------------------ */

export type TestCapabilityDomain = CapabilityDomain;

export type DomainStatusOverrides = Partial<Record<TestCapabilityDomain, CapabilityStatus>>;

function descriptor(
  status: CapabilityStatus,
  details: Record<string, string>,
  limitations: string[],
): CapabilityDescriptor {
  return { contractVersion: CONTRACT_VERSION, status, details, limitations };
}

/**
 * A schema-valid profile with all 8 domains, defaulting to `supported` and
 * taking per-domain status overrides (with representative material
 * limitations for degraded/unavailable domains). Round-tripped through the
 * capability codec so fixtures are exactly what real clients would send.
 */
export function makeProfile(
  overrides: DomainStatusOverrides = {},
  profileId = "cap-profile-test-007",
): DeviceCapabilityProfile {
  const status = (domain: TestCapabilityDomain): CapabilityStatus =>
    overrides[domain] ?? "supported";
  const profile: DeviceCapabilityProfile = {
    contractVersion: CONTRACT_VERSION,
    profileId,
    capturedAt: FIXED_CAPTURED_AT,
    deviceIdentity: {
      deviceId: "device-test-007",
      platform: "android",
      model: "Test Device",
      osVersion: "15",
      appVersion: "0.4.0",
    },
    device: descriptor(status("device"), { "battery.level": "90%" }, []),
    camera: descriptor(
      status("camera"),
      { "rear.sensors": "wide" },
      status("camera") === "degraded"
        ? ["Rear camera output is soft beyond 2 m in low light"]
        : status("camera") === "unavailable"
          ? ["No usable camera sensor this session"]
          : [],
    ),
    depth: descriptor(
      status("depth"),
      { "lidar": status("depth") === "supported" ? "true" : "false" },
      status("depth") === "degraded"
        ? ["Depth from stereo disparity degrades beyond 3.5 m"]
        : status("depth") === "unavailable"
          ? ["No depth sensor available on this device"]
          : [],
    ),
    imu: descriptor(status("imu"), { "gyroscope": "true" }, []),
    tracking: descriptor(
      status("tracking"),
      { "pose.provider": "ARCore" },
      status("tracking") === "unavailable" ? ["ARCore pose tracking unavailable"] : [],
    ),
    compute: descriptor(status("compute"), { "ram.gb": "8" }, []),
    calibration: descriptor(
      status("calibration"),
      { "intrinsics.source": "factory" },
      status("calibration") === "degraded"
        ? ["Camera intrinsics not re-verified this session"]
        : status("calibration") === "unavailable"
          ? ["No calibrated reference workflow available"]
          : [],
    ),
    environment: descriptor(status("environment"), { "illumination": "mixed" }, []),
  };
  return JSON.parse(encodeDeviceCapabilityProfile(profile)) as DeviceCapabilityProfile;
}

/** Flagship device: every domain supported. */
export const FLAGSHIP_PROFILE: DeviceCapabilityProfile = makeProfile();
/** Mid-range device: no depth sensing; everything else supported. */
export const MIDRANGE_NO_DEPTH_PROFILE: DeviceCapabilityProfile = makeProfile({
  depth: "unavailable",
});
/** Low-end device: degraded camera, no depth, no tracking, degraded calibration. */
export const LOWEND_PROFILE: DeviceCapabilityProfile = makeProfile({
  camera: "degraded",
  depth: "unavailable",
  tracking: "unavailable",
  calibration: "degraded",
});
/** Camera- and tracking-dead device (drives reconstruction escalation). */
export const CAMERA_AND_TRACKING_DEAD_PROFILE: DeviceCapabilityProfile = makeProfile({
  camera: "unavailable",
  tracking: "unavailable",
});

/* ------------------------------------------------------------------ */
/* Fixed planning inputs                                                */
/* ------------------------------------------------------------------ */

export const DIMENSIONAL_INTENT = "Measure the room dimensions for the handover survey";
export const RECONSTRUCTION_INTENT = "Reconstruct the as-built model of the plant room";
export const CONDITION_INTENT = "Inspect the defect on the west wall";
export const GENERAL_INTENT = "Document the kitchen for the handover appendix";

/** The FIXED assurance target — must never vary with the device. */
export const FIXED_ASSURANCE = {
  summary: "Room dimensions to ±20 mm at 95% confidence",
  assuranceProfileRef: "assurance-profile-dim-20mm",
} as const;

/* ------------------------------------------------------------------ */
/* Contract validation helpers                                          */
/* ------------------------------------------------------------------ */

/** The CaptureMission schema's own top-level fields (for strict validation). */
const MISSION_SCHEMA_KEYS = [
  "assurance",
  "contractVersion",
  "createdAt",
  "intent",
  "missionId",
  "referenceControls",
  "requiredEvidence",
  "revision",
  "state",
  "steps",
  "updatedAt",
] as const;

/**
 * The schema-field projection of a mission: the fields the CaptureMission
 * wire contract defines (assurance plucked to its known keys). Used to run
 * the STRICT codec validation over everything the contract schema knows —
 * planner passthrough extensions (capabilitySnapshot / evidenceGaps /
 * planning / escalation) are open wire fields by design and are validated by
 * the full encode/decode round-trip below.
 */
export function schemaProjection(mission: CaptureMission): Record<string, unknown> {
  const projection: Record<string, unknown> = {};
  for (const key of MISSION_SCHEMA_KEYS) {
    projection[key] = mission[key];
  }
  projection["assurance"] = {
    summary: mission.assurance.summary,
    ...(mission.assurance.assuranceProfileRef === undefined
      ? {}
      : { assuranceProfileRef: mission.assurance.assuranceProfileRef }),
  };
  return projection;
}

/**
 * Validate one planned mission with the contract codecs: strict-decodes every
 * schema-defined object (mission projection, steps, reference controls,
 * evidence gaps) and requires the full document (extensions included) to
 * round-trip through encode/decode byte-identically.
 */
export function assertMissionContractValid(mission: CaptureMission): void {
  // 1. Strict codec validation of everything the schema defines.
  expect(() => decodeCaptureMissionStrict(schemaProjection(mission))).not.toThrow();
  for (const step of mission.steps) {
    expect(() => decodeCaptureStepStrict(step)).not.toThrow();
  }
  for (const control of mission.referenceControls) {
    expect(() => decodeReferenceControlStrict(control)).not.toThrow();
  }
  const gaps = (mission as { evidenceGaps?: unknown }).evidenceGaps;
  if (Array.isArray(gaps)) {
    for (const gap of gaps) {
      expect(() => decodeEvidenceGapStrict(gap)).not.toThrow();
    }
  }
  // 2. Full-document canonical round-trip (passthrough extensions preserved).
  const encoded = CaptureMissionCodec.encode(mission);
  const decoded = decodeCaptureMission(JSON.parse(encoded));
  expect(CaptureMissionCodec.encode(decoded)).toBe(encoded);
}

/** Canonical JSON text of a mission (byte comparisons in tests). */
export function canonicalMissionText(mission: CaptureMission): string {
  return canonicalJsonStringify(mission);
}
