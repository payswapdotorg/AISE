/**
 * AISE-019 — golden capture/device benchmark harness: public surface.
 *
 * HONESTY (read model.ts and fixtures.ts headers before use): fixtures are
 * SYNTHETIC-v1 — synthetic scenes with documented ground truth and injected
 * deterministic noise, NOT physical captures (physical fixtures are
 * AISE-035). A WorldSculpt-branded engine is not shipped (no real inference
 * in this sandbox); the seam accepts it in production via the AISE-012
 * adapter (see engines.ts header).
 *
 * Programmatic API: runBenchmarks(engines, fixtures, options) +
 * BenchmarkReport.assertReproducible. CLI: `bun run src/benchmarks/cli.ts`
 * from backend/api (runs both shipped engines over the golden fixture set,
 * exits 1 on FAIL). No router/server surface (later items wire reporting).
 */

export {
  // provenance + versioning
  FIXTURE_PROVENANCE,
  FIXTURE_VERSION,
  REPORT_SCHEMA_VERSION,
  SEED_POLICY,
  // device classes + noise
  DEVICE_CLASSES,
  DEVICE_NOISE_PROFILES,
  noiseEnvelopeM,
  // metric + failure vocabulary
  METRIC_NAMES,
  BENCHMARK_FAILURE_CODES,
} from "./model";

export type {
  DeviceClass,
  NoiseProfile,
  SyntheticRoom,
  SyntheticBoxObject,
  SyntheticOpening,
  SyntheticScene,
  SurfaceRole,
  GroundTruthSurface,
  GroundTruthDimension,
  GroundTruthObjectVolume,
  GroundTruth,
  GoldenFixture,
  SurfaceObservation,
  EngineCaptureView,
  ReconstructedPlane,
  ReconstructedDimension,
  ReconstructedObjectVolume,
  ReconstructedScene,
  ReconstructionUnderTest,
  MetricName,
  MetricInstance,
  FixtureMetrics,
  BenchmarkFailureCode,
  BenchmarkFailureEntry,
  BenchmarkOutcome,
  FixtureEvaluation,
  EngineBenchmarkSummary,
  GateViolationRef,
  DigestibleReport,
  ReproducibilityCheck,
} from "./model";

// Spec-named helper surface (formerly the BenchmarkReport namespace).
export {
  stripForDigest,
  digestOf,
  assertReproducible,
} from "./model";

export {
  // fixtures
  Lcg,
  seedOf,
  buildFixture,
  observeFixture,
  captureViewOf,
  GOLDEN_FIXTURES,
  fixtureById,
  BOX_FACE_KEYS,
  boxFaceSurfaceIds,
  type FixtureSpec,
  type CaptureProfile,
  type BoxFaceKey,
} from "./fixtures";

export {
  // engines under test
  IDEAL_GEOMETRY_ENGINE,
  PLANE_FIT_ENGINE,
  measurePlanePair,
} from "./engines";

export {
  // discrimination (mutation) engines — instruments, never baselines
  biasedScaleEngine,
  noisyPlaneEngine,
  DEFAULT_NOISY_PLANE_OPTIONS,
  type BiasedScaleOptions,
  type NoisyPlaneOptions,
} from "./discrimination";

export { computeFixtureMetrics } from "./metrics";

export {
  // gates
  GATE_THRESHOLDS,
  GATE_THRESHOLD_VERSION,
  thresholdFor,
  evaluateGates,
  describeGateTable,
  type GateThreshold,
  type GateContext,
} from "./gates";

export {
  // runner
  runBenchmarks,
  type RunBenchmarkOptions,
} from "./runner";

export { renderTextReport } from "./report";
