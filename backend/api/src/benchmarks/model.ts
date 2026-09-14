/**
 * AISE-019 — golden capture/device benchmark harness: data model.
 *
 * HONESTY CONSTRAINT (documented loudly, per work order): this sandbox has NO
 * physical lab — physical fixtures are AISE-035's mission. Every fixture this
 * module can produce is SYNTHETIC-WITH-DOCUMENTED-GROUND-TRUTH: synthetic
 * scenes (points/planes with exact coordinates) plus injected deterministic
 * noise patterns, labeled `fixtureProvenance: "synthetic-v1"`. They are NEVER
 * physical captures and must never be presented as such. The harness, metrics,
 * regression gates and reporting machinery are production-quality; the fixture
 * SET is synthetic until 035 contributes physical data.
 *
 * Determinism contract: fixtures are code-defined constants; observation
 * sampling is a pure function of the fixture (fixed-seed LCG — see
 * fixtures.ts); metric math is pure. The ONLY nondeterministic field in a
 * BenchmarkReport is `generatedAt` (injected clock), which is excluded from
 * the reproducibility digest.
 *
 * Device classes mirror AISE-006's capability profiles (documented mapping):
 *   flagship_lidar    ~ FLAGSHIP_PROFILE (LiDAR + full capability tier)
 *   midrange_no_depth ~ MIDRANGE_NO_DEPTH_PROFILE (no depth sensing)
 *   lowend_minimal    ~ LOWEND_PROFILE (degraded camera/calibration, no depth
 *                       or tracking)
 *   emulator_like     ~ emulated/CI capture tier (no shipped 006 profile; the
 *                       weakest tier, used e.g. by the AISE-012 deterministic
 *                       simulation backend)
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type { Plane, Vec3 } from "../geometry";

/* ------------------------------------------------------------------ */
/* Provenance + versioning                                             */
/* ------------------------------------------------------------------ */

/** Fixture provenance label: SYNTHETIC scenes with documented ground truth. */
export const FIXTURE_PROVENANCE = "synthetic-v1" as const;
/** Fixture schema version (bump when fixture structure changes). */
export const FIXTURE_VERSION = "1" as const;
/** Benchmark report schema version. */
export const REPORT_SCHEMA_VERSION = "benchmark-report/1" as const;

/**
 * Seed policy for deterministic noise: seed = uint32(sha256(fixtureId)[0..8])
 * -> LCG(a=1664525, c=1013904223, mod 2^32); Box-Muller gaussian draws
 * consumed in fixed surface/point order. NO Math.random anywhere.
 */
export const SEED_POLICY =
  "seed = uint32(sha256(fixtureId)[0..8]) -> LCG(a=1664525, c=1013904223, mod 2^32); Box-Muller gaussian draws in fixed surface/point order";

/* ------------------------------------------------------------------ */
/* Device classes                                                      */
/* ------------------------------------------------------------------ */

export const DEVICE_CLASSES = [
  "flagship_lidar",
  "midrange_no_depth",
  "lowend_minimal",
  "emulator_like",
] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

/** Deterministic perturbation profile of a device class (meters). */
export interface NoiseProfile {
  readonly deviceClass: DeviceClass;
  /** 1σ random noise magnitude applied along surface normals. */
  readonly sigmaM: number;
  /** Systematic bias applied along surface outward normals. */
  readonly biasM: number;
  /** Documented seed policy (this constant). */
  readonly seedPolicy: string;
}

/**
 * Per-class noise profiles (work-order values): flagship 2mm 1σ; midrange
 * 8mm; lowend 25mm; emulator 30mm systematic bias + 15mm noise.
 */
export const DEVICE_NOISE_PROFILES: Readonly<Record<DeviceClass, NoiseProfile>> = {
  flagship_lidar: {
    deviceClass: "flagship_lidar",
    sigmaM: 0.002,
    biasM: 0,
    seedPolicy: SEED_POLICY,
  },
  midrange_no_depth: {
    deviceClass: "midrange_no_depth",
    sigmaM: 0.008,
    biasM: 0,
    seedPolicy: SEED_POLICY,
  },
  lowend_minimal: {
    deviceClass: "lowend_minimal",
    sigmaM: 0.025,
    biasM: 0,
    seedPolicy: SEED_POLICY,
  },
  emulator_like: {
    deviceClass: "emulator_like",
    sigmaM: 0.015,
    biasM: 0.03,
    seedPolicy: SEED_POLICY,
  },
};

/** Noise envelope of a class: sqrt(sigma² + bias²) — used by gate rationales. */
export function noiseEnvelopeM(profile: NoiseProfile): number {
  return Math.sqrt(profile.sigmaM * profile.sigmaM + profile.biasM * profile.biasM);
}

/* ------------------------------------------------------------------ */
/* Synthetic scenes + ground truth                                     */
/* ------------------------------------------------------------------ */

/** Axis-aligned rectangular room: x = width, y = depth, z = height. */
export interface SyntheticRoom {
  readonly widthM: number;
  readonly depthM: number;
  readonly heightM: number;
}

/** Axis-aligned box object with exact corners. */
export interface SyntheticBoxObject {
  readonly objectId: string;
  readonly label: string;
  readonly minCorner: Vec3;
  readonly maxCorner: Vec3;
}

/** Rectangular opening on a wall (exact center/size, meters). */
export interface SyntheticOpening {
  readonly openingId: string;
  readonly kind: "door" | "window";
  readonly onSurfaceId: string;
  /** Opening rectangle center (on the wall surface). */
  readonly center: Vec3;
  readonly widthM: number;
  readonly heightM: number;
}

export interface SyntheticScene {
  readonly sceneId: string;
  readonly description: string;
  readonly room: SyntheticRoom;
  readonly objects: readonly SyntheticBoxObject[];
  readonly openings: readonly SyntheticOpening[];
}

export type SurfaceRole = "floor" | "ceiling" | "wall" | "object_face";

/** One exactly-known surface: plane + rectangular sampling parametrization. */
export interface GroundTruthSurface {
  readonly surfaceId: string;
  readonly role: SurfaceRole;
  /** Exact plane (unit normal + offset; dot(normal, x) + d = 0). */
  readonly plane: Plane;
  /** Exact noiseless sample points ON the plane (grid, cutout-aware). */
  readonly points: readonly Vec3[];
}

/** One exactly-known linear dimension (separation of two parallel surfaces). */
export interface GroundTruthDimension {
  readonly dimensionId: string;
  readonly label: string;
  readonly valueM: number;
  readonly surfaceA: string;
  readonly surfaceB: string;
}

export interface GroundTruthObjectVolume {
  readonly objectId: string;
  readonly volumeM3: number;
}

export interface GroundTruth {
  readonly surfaces: readonly GroundTruthSurface[];
  readonly dimensions: readonly GroundTruthDimension[];
  readonly objectVolumes: readonly GroundTruthObjectVolume[];
}

/* ------------------------------------------------------------------ */
/* Golden fixtures                                                     */
/* ------------------------------------------------------------------ */

export interface GoldenFixture {
  readonly fixtureId: string;
  readonly fixtureVersion: typeof FIXTURE_VERSION;
  /** Loud honesty label: synthetic-v1 fixtures are NOT physical captures. */
  readonly fixtureProvenance: typeof FIXTURE_PROVENANCE;
  readonly deviceClass: DeviceClass;
  readonly scene: SyntheticScene;
  readonly groundTruth: GroundTruth;
  readonly noise: NoiseProfile;
}

/** Noised observation of one surface (the synthetic "capture"). */
export interface SurfaceObservation {
  readonly surfaceId: string;
  readonly points: readonly Vec3[];
}

/**
 * The ground-truth-blind view an honest engine may consume: noised
 * observations plus measurement REQUESTS (identifiers + surface pairing —
 * structure, never values). Exact values live only in `fixture.groundTruth`.
 */
export interface EngineCaptureView {
  readonly fixtureId: string;
  readonly deviceClass: DeviceClass;
  readonly noise: NoiseProfile;
  readonly observations: readonly SurfaceObservation[];
  readonly measurementRequests: readonly {
    readonly dimensionId: string;
    readonly label: string;
    readonly surfaceA: string;
    readonly surfaceB: string;
  }[];
  readonly objects: readonly {
    readonly objectId: string;
    readonly label: string;
    /** Face surface ids in fixed order: xmin, xmax, ymin, ymax, zmin, zmax. */
    readonly faceSurfaceIds: readonly string[];
  }[];
}

/* ------------------------------------------------------------------ */
/* Reconstruction-under-test seam                                      */
/* ------------------------------------------------------------------ */

export interface ReconstructedPlane {
  readonly surfaceId: string;
  readonly plane: Plane;
}

export interface ReconstructedDimension {
  readonly dimensionId: string;
  readonly measuredM: number;
}

export interface ReconstructedObjectVolume {
  readonly objectId: string;
  readonly measuredVolumeM3: number;
}

export interface ReconstructedScene {
  readonly planes: readonly ReconstructedPlane[];
  readonly dimensions: readonly ReconstructedDimension[];
  readonly objectVolumes: readonly ReconstructedObjectVolume[];
  readonly notes: readonly string[];
}

/**
 * The seam every engine under test must conform to. SYNC by design (work
 * order): the harness stays deterministic and CLI-runnable. Production
 * wiring (a later item) adapts async ReconstructionProviders (e.g. the
 * AISE-012 WorldSculpt adapter) by pre-resolving per-fixture requests into
 * this sync seam; the harness measures ANY function conforming to it. A
 * WorldSculpt-branded engine is deliberately NOT shipped here — this sandbox
 * has no real inference (see engines.ts header).
 */
export interface ReconstructionUnderTest {
  readonly providerId: string;
  readonly version: string;
  reconstruct(fixture: GoldenFixture): ReconstructedScene;
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

export const METRIC_NAMES = [
  "scale_error",
  "plane_fit_rms",
  "registration_error",
  "dimension_error",
  "object_volume_error",
] as const;
export type MetricName = (typeof METRIC_NAMES)[number];

export interface MetricInstance {
  readonly metric: MetricName;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly value: number;
  readonly unit: "ratio" | "m";
  /** dimension_error is signed for diagnosis; gates evaluate |value|. */
  readonly signed: boolean;
  readonly detail: string;
}

export interface FixtureMetrics {
  readonly fixtureId: string;
  readonly deviceClass: DeviceClass;
  readonly metrics: readonly MetricInstance[];
  /**
   * Mean per metric name — INFORMATIONAL ONLY. Gates never evaluate
   * aggregates (R17: aggregate metrics may not hide critical-class
   * regressions); gate evaluation is per-instance.
   */
  readonly aggregates: Readonly<Record<MetricName, number>>;
}

/* ------------------------------------------------------------------ */
/* Failure behavior                                                    */
/* ------------------------------------------------------------------ */

export const BENCHMARK_FAILURE_CODES = [
  "ENGINE_EXCEPTION",
  "INVALID_RECONSTRUCTION",
  "MISSING_RECONSTRUCTION",
] as const;
export type BenchmarkFailureCode = (typeof BENCHMARK_FAILURE_CODES)[number];

export interface BenchmarkFailureEntry {
  readonly engineId: string;
  readonly engineVersion: string;
  readonly fixtureId: string;
  readonly deviceClass: DeviceClass;
  readonly code: BenchmarkFailureCode;
  readonly detail: string;
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

export type BenchmarkOutcome = "PASS" | "FAIL" | "PASS_WITH_NOTES";

export type FixtureEvaluation =
  | { readonly kind: "metrics"; readonly metrics: FixtureMetrics }
  | { readonly kind: "failure"; readonly failure: BenchmarkFailureEntry };

export interface EngineBenchmarkSummary {
  readonly providerId: string;
  readonly version: string;
  readonly overall: BenchmarkOutcome;
  readonly fixtureEvaluations: readonly FixtureEvaluation[];
  readonly violations: readonly GateViolationRef[];
  readonly failureEntries: readonly BenchmarkFailureEntry[];
}

/** A gate violation, enriched with engine/fixture context (R17-visible). */
export interface GateViolationRef {
  readonly engineId: string;
  readonly engineVersion: string;
  readonly fixtureId: string;
  readonly deviceClass: DeviceClass;
  readonly metric: MetricName;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly value: number;
  readonly threshold: number;
  readonly critical: boolean;
  readonly detail: string;
}

export interface BenchmarkReport {
  readonly schemaVersion: typeof REPORT_SCHEMA_VERSION;
  /** Loud honesty: fixtures are synthetic-v1, NOT physical captures. */
  readonly fixtureProvenance: typeof FIXTURE_PROVENANCE;
  /** Injected-clock timestamp — the ONLY nondeterministic field. */
  readonly generatedAt: string;
  readonly gateThresholdVersion: string;
  readonly engineCount: number;
  readonly fixtureCount: number;
  readonly engines: readonly EngineBenchmarkSummary[];
  /**
   * R17 RULE (exact): FAIL iff ANY critical gate violation OR any failure
   * entry (a crashed fixture contributes no metrics — absence may not hide
   * critical-class regressions); PASS_WITH_NOTES iff non-critical violations
   * only; PASS otherwise. Critical violations are ALSO listed separately in
   * `criticalViolations` at top level — aggregates never gate.
   */
  readonly overall: BenchmarkOutcome;
  readonly criticalViolations: readonly GateViolationRef[];
  readonly nonCriticalViolations: readonly GateViolationRef[];
  readonly failureEntries: readonly BenchmarkFailureEntry[];
  /** sha256 over canonical report JSON with timestamp+digest stripped. */
  readonly reproducibilityDigest: string;
}

/* ------------------------------------------------------------------ */
/* Reproducibility helpers (namespace merged with BenchmarkReport)     */
/* ------------------------------------------------------------------ */

/** The digest preimage: the report minus timestamp and digest. */
export type DigestibleReport = Omit<BenchmarkReport, "generatedAt" | "reproducibilityDigest">;

export interface ReproducibilityCheck {
  readonly reproducible: boolean;
  readonly digestA: string;
  readonly digestB: string;
  readonly structuralMatch: boolean;
}

/** Explicit field copy — never the timestamp, never the digest. */
export function stripForDigest(report: BenchmarkReport): DigestibleReport {
    return {
      schemaVersion: report.schemaVersion,
      fixtureProvenance: report.fixtureProvenance,
      gateThresholdVersion: report.gateThresholdVersion,
      engineCount: report.engineCount,
    fixtureCount: report.fixtureCount,
    engines: report.engines,
    overall: report.overall,
    criticalViolations: report.criticalViolations,
    nonCriticalViolations: report.nonCriticalViolations,
    failureEntries: report.failureEntries,
  };
}

/** sha256 of the canonical report JSON with timestamp+digest stripped. */
export function digestOf(report: BenchmarkReport): string {
  return sha256Hex(canonicalJsonStringify(stripForDigest(report)));
}

/**
 * Assert two reports are reproducible: identical digests AND identical
 * canonical structure with timestamp+digest stripped. Timestamps may
 * differ — they are excluded from the digest by design.
 */
export function assertReproducible(
    reportA: BenchmarkReport,
    reportB: BenchmarkReport,
  ): ReproducibilityCheck {
    const digestA = digestOf(reportA);
    const digestB = digestOf(reportB);
  const structuralMatch =
    canonicalJsonStringify(stripForDigest(reportA)) ===
    canonicalJsonStringify(stripForDigest(reportB));
  return { reproducible: digestA === digestB && structuralMatch, digestA, digestB, structuralMatch };
}
