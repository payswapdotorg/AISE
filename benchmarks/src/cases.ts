/**
 * The benchmark case registry (AISE-022): versioned
 * representative capture/ground-truth fixtures, their metric
 * specifications, tolerances and criticality classes.
 *
 * v1 cases are the three deterministic golden rooms (the AISE-010
 * HIGH_ASSURANCE benchmark fixtures, the ground-truth set the
 * extraction is already pinned against):
 *
 * - **exact-room** — the noise-free room: GATING at CRITICAL.
 *   The tightest tolerances (grid quantization only); every
 *   metric must PASS for the benchmark to pass.
 * - **noisy-room** — the same room with seeded σ = 0.01 m noise:
 *   GATING at HIGH_ASSURANCE (looser tolerances, still gated).
 * - **outlier-room** — 5% gross outliers: ANALYSIS class. Its
 *   degradation (wall fragmentation, ceiling inflation) is
 *   EXPECTED and is exactly what the critical-class analysis
 *   quantifies; it is reported with full scoring — never
 *   silently skipped — but does not gate the run. Physical
 *   capture sets and their classes arrive with later work
 *   (AC-133; the program's dogfood stage).
 *
 * Tolerances are REUSED from the fixtures' own acceptance rules
 * (`EXACT/NOISY/OUTLIER_ROOM_ACCEPTANCE`) — the benchmark does
 * not invent a second tolerance authority. Metric specs bind
 * ground-truth fields to the graph observables `observe.ts`
 * extracts; counts are exact (tolerance 0).
 */
import {
  exactRoomPoints,
  noisyRoomPoints,
  outlierRoomPoints,
  roomGroundTruth,
  EXACT_ROOM_ACCEPTANCE,
  NOISY_ROOM_ACCEPTANCE,
  OUTLIER_ROOM_ACCEPTANCE,
  type RoomAcceptance,
} from "@aise/backend-semantics/fixtures/golden";
import type { GeomPoint } from "@aise/backend-geometry";
import { BenchmarkError } from "./errors.js";

/**
 * The benchmark suite version (AC-132: benchmark results are
 * versioned). Bump when the case set, metric specs, scoring or
 * report semantics change.
 */
export const BENCHMARK_SUITE_VERSION = "golden-captures/v1.0.0";

/** The criticality class of one case. */
export type CaseClass =
  /** Gates the run at CRITICAL assurance (tightest tolerances). */
  | "GATING_CRITICAL"
  /** Gates the run at HIGH_ASSURANCE (degradation-tolerant). */
  | "GATING_HIGH_ASSURANCE"
  /** Reported and quantified; never silently skipped; does not gate. */
  | "ANALYSIS";

/** What a metric observes (the `observe.ts` extractor key). */
export type MetricObservable =
  | "count:FLOOR"
  | "count:CEILING"
  | "count:WALL"
  | "count:DOOR"
  | "count:WINDOW"
  | "floor-width"
  | "floor-depth"
  | "ceiling-elevation"
  | "room-height"
  | "door-width"
  | "door-height"
  | "window-width"
  | "window-height"
  | "window-sill"
  | "wall-height";

/** How a metric's tolerance is selected (from the fixture acceptance). */
export type ToleranceKind = "dimension" | "elevation" | "exact-count";

/** One metric specification. */
export interface MetricSpec {
  readonly metricId: string;
  readonly observable: MetricObservable;
  /** Ground-truth value (SI: metres / counts). */
  readonly expected: number;
  readonly toleranceKind: ToleranceKind;
}

/** One benchmark case. */
export interface BenchmarkCase {
  readonly caseId: string;
  readonly description: string;
  readonly caseClass: CaseClass;
  /** The golden capture points (deterministic). */
  readonly points: readonly GeomPoint[];
  /** The fixture's acceptance rules (the single tolerance authority). */
  readonly acceptance: RoomAcceptance;
  readonly metrics: readonly MetricSpec[];
}

const COUNT_METRICS: readonly MetricSpec[] = [
  { metricId: "count-floor", observable: "count:FLOOR", expected: roomGroundTruth.objectCounts.floors, toleranceKind: "exact-count" },
  { metricId: "count-ceiling", observable: "count:CEILING", expected: roomGroundTruth.objectCounts.ceilings, toleranceKind: "exact-count" },
  { metricId: "count-wall", observable: "count:WALL", expected: roomGroundTruth.objectCounts.walls, toleranceKind: "exact-count" },
  { metricId: "count-door", observable: "count:DOOR", expected: roomGroundTruth.objectCounts.doors, toleranceKind: "exact-count" },
  { metricId: "count-window", observable: "count:WINDOW", expected: roomGroundTruth.objectCounts.windows, toleranceKind: "exact-count" },
];

const ROOM_METRICS: readonly MetricSpec[] = [
  { metricId: "floor-width", observable: "floor-width", expected: roomGroundTruth.width, toleranceKind: "dimension" },
  { metricId: "floor-depth", observable: "floor-depth", expected: roomGroundTruth.depth, toleranceKind: "dimension" },
  { metricId: "ceiling-elevation", observable: "ceiling-elevation", expected: roomGroundTruth.floorToCeilingHeight, toleranceKind: "elevation" },
  { metricId: "room-height", observable: "room-height", expected: roomGroundTruth.floorToCeilingHeight, toleranceKind: "elevation" },
  { metricId: "wall-height", observable: "wall-height", expected: roomGroundTruth.floorToCeilingHeight, toleranceKind: "dimension" },
];

const OPENING_METRICS: readonly MetricSpec[] = [
  { metricId: "door-width", observable: "door-width", expected: roomGroundTruth.door.width, toleranceKind: "dimension" },
  { metricId: "door-height", observable: "door-height", expected: roomGroundTruth.door.height, toleranceKind: "dimension" },
  { metricId: "window-width", observable: "window-width", expected: roomGroundTruth.window.width, toleranceKind: "dimension" },
  { metricId: "window-height", observable: "window-height", expected: roomGroundTruth.window.height, toleranceKind: "dimension" },
  { metricId: "window-sill", observable: "window-sill", expected: roomGroundTruth.window.sill, toleranceKind: "elevation" },
];

const ALL_METRICS: readonly MetricSpec[] = [...COUNT_METRICS, ...ROOM_METRICS, ...OPENING_METRICS];

/** The v1 case registry (frozen; deterministic fixtures). */
export const BENCHMARK_CASES: readonly BenchmarkCase[] = Object.freeze([
  {
    caseId: "exact-room",
    description:
      "the noise-free 4.0 × 3.0 × 2.7 m golden room (0.05 m grid sampling; floor, ceiling, four walls, one door, one window) — GATING at CRITICAL (grid quantization only)",
    caseClass: "GATING_CRITICAL",
    points: exactRoomPoints(),
    acceptance: EXACT_ROOM_ACCEPTANCE,
    metrics: ALL_METRICS,
  },
  {
    caseId: "noisy-room",
    description:
      "the same room with seeded Gaussian noise σ = 0.01 m (Box–Muller from the AISE-009 deterministic RNG, seed recorded in the fixture) — GATING at HIGH_ASSURANCE",
    caseClass: "GATING_HIGH_ASSURANCE",
    points: noisyRoomPoints(),
    acceptance: NOISY_ROOM_ACCEPTANCE,
    metrics: ALL_METRICS,
  },
  {
    caseId: "outlier-room",
    description:
      "the exact room with every 20th point displaced by 0.5 m (5% deterministic gross outliers) — ANALYSIS class: expected degradation, fully scored and quantified, never silently skipped, never gating",
    caseClass: "ANALYSIS",
    points: outlierRoomPoints(),
    acceptance: OUTLIER_ROOM_ACCEPTANCE,
    metrics: ALL_METRICS,
  },
]);

/** The tolerance (SI metres) a metric spec resolves to for a case. */
export function toleranceFor(
  benchmarkCase: BenchmarkCase,
  toleranceKind: ToleranceKind,
): number {
  switch (toleranceKind) {
    case "exact-count":
      return 0;
    case "dimension":
      return benchmarkCase.acceptance.dimensionTolerance;
    case "elevation":
      return benchmarkCase.acceptance.elevationTolerance;
  }
}

/** Case lookup by id (fail closed). */
export function caseById(caseId: string): BenchmarkCase {
  const found = BENCHMARK_CASES.find((benchmarkCase) => benchmarkCase.caseId === caseId);
  if (found === undefined) {
    throw new BenchmarkError("BENCH_INPUT_INVALID", `unknown benchmark case: ${String(caseId)}`, {
      details: { field: "caseId", value: String(caseId) },
    });
  }
  return found;
}

/** The gating cases (those whose verdict gates the run). */
export function gatingCases(): readonly BenchmarkCase[] {
  return BENCHMARK_CASES.filter(
    (benchmarkCase) =>
      benchmarkCase.caseClass === "GATING_CRITICAL" || benchmarkCase.caseClass === "GATING_HIGH_ASSURANCE",
  );
}

/** The analysis cases (reported and quantified, never gating). */
export function analysisCases(): readonly BenchmarkCase[] {
  return BENCHMARK_CASES.filter((benchmarkCase) => benchmarkCase.caseClass === "ANALYSIS");
}
