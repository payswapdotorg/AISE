/**
 * @aise/benchmarks — the AISE-022 golden-capture benchmark
 * harness.
 *
 * Versioned representative capture/ground-truth fixtures and
 * automated scoring (architecture REQ-014, AC-130–132):
 * repeatable benchmark runs over the full reconstruction chain
 * (AISE-008 → AISE-010 → AISE-011), ground-truth comparison
 * with the fixtures' own acceptance tolerances, regression
 * reporting against a committed, integrity-verified baseline,
 * and critical-class analysis (headroom + degradation).
 *
 * Public surface:
 * - errors   — typed, fail-closed BenchmarkError
 * - units    — exact SI factors (length/area scoring)
 * - cases    — the case registry (v1: exact/noisy/outlier golden
 *   rooms), metric specs, criticality classes, tolerance rules
 * - observe  — deterministic observed-value extraction from the
 *   ingested Reality Graph (MISSING when an observable is absent)
 * - scoring  — per-metric PASS/FAIL/MISSING + margin
 * - critical — headroom, critical-class metrics, degradation
 * - report   — the deterministic, versioned, digest-pinned report
 * - baseline — baseline parse/verify/serialize + regression
 *   comparison (the AC-132 versioned-result discipline)
 * - run      — the pure, repeatable run (runBenchmark)
 * - main     — the CLI (npm run benchmark)
 */
export {
  BenchmarkError,
  isBenchmarkError,
  type BenchmarkErrorDetails,
  type BenchmarkErrorCode,
} from "./errors.js";

export {
  AREA_SI_FACTORS,
  LENGTH_SI_FACTORS,
  isLengthUnit,
  lengthToSiMeters,
  type BenchAreaUnit,
  type BenchLengthUnit,
} from "./units.js";

export {
  BENCHMARK_CASES,
  BENCHMARK_SUITE_VERSION,
  analysisCases,
  caseById,
  gatingCases,
  toleranceFor,
  type BenchmarkCase,
  type CaseClass,
  type MetricObservable,
  type MetricSpec,
  type ToleranceKind,
} from "./cases.js";

export {
  observeGraph,
  type Observation,
} from "./observe.js";

export {
  scoreCase,
  scoreMetric,
  type CaseResult,
  type MetricResult,
  type MetricVerdict,
} from "./scoring.js";

export {
  CRITICAL_MARGIN_THRESHOLD,
  analyzeCritical,
  type CaseHeadroom,
  type CriticalAnalysis,
  type CriticalMetric,
  type DegradationRow,
} from "./critical.js";

export {
  benchmarkReportDigest,
  buildBenchmarkReport,
  deriveBenchmarkId,
  type BenchmarkCounts,
  type BenchmarkReport,
  type BenchmarkReportInput,
  type BenchmarkVerdict,
} from "./report.js";

export {
  REGRESSION_DRIFT_EPSILON,
  compareWithBaseline,
  parseBaseline,
  serializeBaseline,
  type RegressionReport,
  type RegressionRow,
} from "./baseline.js";

export { runBenchmark } from "./run.js";
