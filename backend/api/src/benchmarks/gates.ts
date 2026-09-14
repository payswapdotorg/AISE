/**
 * AISE-019 — regression gates (versioned thresholds, "gates-1").
 *
 * GATE RULE (exact): a metric instance violates its gate iff
 * `Math.abs(value) > threshold` (STRICT comparison). The absolute value is
 * evaluated uniformly so signed metrics (dimension_error) cannot evade a
 * gate by regressing in the negative direction.
 *
 * R17 discipline: gates evaluate PER-INSTANCE metric values — never the
 * informational aggregates. Critical violations are reported SEPARATELY and
 * at TOP LEVEL in the report (criticalViolations) and force overall FAIL;
 * non-critical violations alone yield PASS_WITH_NOTES.
 *
 * Threshold rationale: each threshold is anchored to the class noise
 * envelope sqrt(σ² + bias²) (DEVICE_NOISE_PROFILES) at a documented multiple
 * with engineering headroom for the deterministic shipped engines; critical
 * flags mark metrics whose regression invalidates the class's engineering
 * use (LiDAR-class dimensional work). Bumping this table is a governed
 * change: ship a new GATE_THRESHOLD_VERSION and keep the old table for
 * historical comparison.
 */

import { noiseEnvelopeM, DEVICE_NOISE_PROFILES } from "./model";
import type { DeviceClass, GateViolationRef, MetricInstance, MetricName } from "./model";

export const GATE_THRESHOLD_VERSION = "gates-1" as const;

export interface GateThreshold {
  readonly metric: MetricName;
  readonly deviceClass: DeviceClass;
  readonly threshold: number;
  readonly critical: boolean;
  readonly rationale: string;
}

/**
 * The versioned threshold table: one entry per (metric × device class).
 * scale_error, dimension_error and object_volume_error on flagship_lidar are
 * CRITICAL (a LiDAR-class device regressing past these invalidates
 * dimensional engineering use); every other class gates are non-critical
 * review thresholds, as are flagship plane_fit_rms/registration_error
 * (surface-quality regressions, flagged loudly but not engineering-invalid).
 */
export const GATE_THRESHOLDS: readonly GateThreshold[] = [
  // scale_error (relative)
  { metric: "scale_error", deviceClass: "flagship_lidar", threshold: 0.01, critical: true, rationale: "1% scale error invalidates LiDAR-class dimensional engineering use" },
  { metric: "scale_error", deviceClass: "midrange_no_depth", threshold: 0.025, critical: false, rationale: "photogrammetry-tier scale drift; flagged for review" },
  { metric: "scale_error", deviceClass: "lowend_minimal", threshold: 0.05, critical: false, rationale: "low-end tier: coarse scale tolerance" },
  { metric: "scale_error", deviceClass: "emulator_like", threshold: 0.05, critical: false, rationale: "emulated capture tier: coarse scale tolerance" },
  // plane_fit_rms (m) — ~2x the class noise envelope
  { metric: "plane_fit_rms", deviceClass: "flagship_lidar", threshold: 0.004, critical: true, rationale: "2x the 2mm 1σ flagship noise envelope" },
  { metric: "plane_fit_rms", deviceClass: "midrange_no_depth", threshold: 0.016, critical: false, rationale: "2x the 8mm midrange noise envelope" },
  { metric: "plane_fit_rms", deviceClass: "lowend_minimal", threshold: 0.05, critical: false, rationale: "2x the 25mm low-end noise envelope" },
  { metric: "plane_fit_rms", deviceClass: "emulator_like", threshold: 0.07, critical: false, rationale: "2x the emulator noise envelope sqrt(15mm² + 30mm²)" },
  // registration_error (m) — ~2.5x the class noise envelope
  { metric: "registration_error", deviceClass: "flagship_lidar", threshold: 0.005, critical: true, rationale: "2.5x the 2mm flagship noise envelope" },
  { metric: "registration_error", deviceClass: "midrange_no_depth", threshold: 0.02, critical: false, rationale: "2.5x the 8mm midrange noise envelope" },
  { metric: "registration_error", deviceClass: "lowend_minimal", threshold: 0.06, critical: false, rationale: "2.4x the 25mm low-end noise envelope" },
  { metric: "registration_error", deviceClass: "emulator_like", threshold: 0.08, critical: false, rationale: "2.5x the emulator registration bias envelope" },
  // dimension_error (m, absolute value evaluated)
  { metric: "dimension_error", deviceClass: "flagship_lidar", threshold: 0.02, critical: true, rationale: "20mm absolute dimension error invalidates LiDAR-class work" },
  { metric: "dimension_error", deviceClass: "midrange_no_depth", threshold: 0.04, critical: false, rationale: "midrange absolute dimension tolerance" },
  { metric: "dimension_error", deviceClass: "lowend_minimal", threshold: 0.1, critical: false, rationale: "low-end absolute dimension tolerance" },
  { metric: "dimension_error", deviceClass: "emulator_like", threshold: 0.12, critical: false, rationale: "emulator systematic-bias dimension tolerance (2x30mm walls + headroom)" },
  // object_volume_error (relative)
  { metric: "object_volume_error", deviceClass: "flagship_lidar", threshold: 0.05, critical: true, rationale: "5% object volume error invalidates LiDAR-class quantity takeoff" },
  { metric: "object_volume_error", deviceClass: "midrange_no_depth", threshold: 0.15, critical: false, rationale: "midrange object volume tolerance" },
  { metric: "object_volume_error", deviceClass: "lowend_minimal", threshold: 0.4, critical: false, rationale: "low-end object volume tolerance" },
  { metric: "object_volume_error", deviceClass: "emulator_like", threshold: 0.5, critical: false, rationale: "emulator object volume tolerance (systematic bias inflates small boxes)" },
];

const THRESHOLD_INDEX = new Map<string, GateThreshold>(
  GATE_THRESHOLDS.map((entry) => [`${entry.metric}@${entry.deviceClass}`, entry]),
);

/** Threshold lookup. Throws (internal invariant) on an incomplete table. */
export function thresholdFor(metric: MetricName, deviceClass: DeviceClass): GateThreshold {
  const entry = THRESHOLD_INDEX.get(`${metric}@${deviceClass}`);
  if (!entry) {
    throw new Error(
      `benchmark gate table incomplete: no threshold for ${metric} on ${deviceClass}`,
    );
  }
  return entry;
}

export interface GateContext {
  readonly engineId: string;
  readonly engineVersion: string;
  readonly fixtureId: string;
  readonly deviceClass: DeviceClass;
}

/** Evaluate every metric instance against its (metric, deviceClass) gate. */
export function evaluateGates(
  metrics: readonly MetricInstance[],
  context: GateContext,
): readonly GateViolationRef[] {
  const violations: GateViolationRef[] = [];
  for (const instance of metrics) {
    const gate = thresholdFor(instance.metric, context.deviceClass);
    if (Math.abs(instance.value) > gate.threshold) {
      violations.push({
        engineId: context.engineId,
        engineVersion: context.engineVersion,
        fixtureId: context.fixtureId,
        deviceClass: context.deviceClass,
        metric: instance.metric,
        subjectId: instance.subjectId,
        subjectLabel: instance.subjectLabel,
        value: instance.value,
        threshold: gate.threshold,
        critical: gate.critical,
        detail: `${instance.detail} — |${instance.value}| > ${gate.threshold} (${gate.rationale})`,
      });
    }
  }
  return violations;
}

/**
 * Human-readable threshold summary (deterministic; used by the text report).
 * Includes each class's noise envelope for context.
 */
export function describeGateTable(): string[] {
  return GATE_THRESHOLDS.map((entry) => {
    const envelope = noiseEnvelopeM(DEVICE_NOISE_PROFILES[entry.deviceClass]);
    return `${entry.metric} @ ${entry.deviceClass}: ${entry.critical ? "CRITICAL" : "non-critical"} at ${entry.threshold} (class noise envelope ${envelope.toFixed(4)}m) — ${entry.rationale}`;
  });
}
