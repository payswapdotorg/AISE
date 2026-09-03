/**
 * Shared test fixtures for the engineering-model suite: valid,
 * production-shaped records built through the real public
 * constructors, so tests exercise validated content instead of
 * hand-mocked shapes.
 */
import {
  modelProvenance,
  type ModelInputRef,
  type ModelProvenance,
  type ObjectInputRef,
  type PropertyAssertion,
  type SceneInputRef,
} from "./index.js";

/** A valid content hash (64 lowercase hex — deterministic, fixed for tests). */
export const HASH_A = "a".repeat(64);
export const HASH_B = "b".repeat(64);
export const HASH_C = "c".repeat(64);

/** A valid upstream object reference (the identity source pin). */
export function objectRef(overrides: Partial<ObjectInputRef> = {}): ObjectInputRef {
  return {
    kind: "object",
    serviceId: "aise.semantics",
    method: "structure/wall-rectangle-v1",
    objectId: "wall-0123456789abcdef",
    contentHash: HASH_A,
    epistemic: "INFERRED",
    ...overrides,
  };
}

/** A valid scene input reference. */
export function sceneRef(overrides: Partial<SceneInputRef> = {}): SceneInputRef {
  return {
    kind: "scene",
    sceneId: "scene-0123456789abcdef",
    contentHash: HASH_B,
    epistemic: "INFERRED",
    ...overrides,
  };
}

/**
 * A provenance record; defaults follow the identity convention
 * (object pin first). Tests deliberately violating the convention
 * pass their own `inputs` — the model rejects them at runtime.
 */
export function objectProvenance(overrides: {
  method?: string;
  parameters?: Record<string, unknown>;
  inputs?: readonly ModelInputRef[];
} = {}): ModelProvenance {
  return modelProvenance(
    overrides.method ?? "ingest/architectural-scene-v1",
    overrides.parameters ?? { sceneId: "scene-0123456789abcdef", frameUnit: "meter" },
    overrides.inputs ?? [objectRef(), sceneRef()],
  );
}

/** A valid standard uncertainty (1σ). */
export function standardUncertainty(u: number): { kind: "standard"; u: number } {
  return { kind: "standard", u };
}

/** A valid quantity (value + meter + 1σ uncertainty). */
export function quantity(value: number, u?: number): {
  value: number;
  unit: "meter";
  uncertainty?: { kind: "standard"; u: number };
} {
  return u === undefined
    ? { value, unit: "meter" as const }
    : { value, unit: "meter" as const, uncertainty: { kind: "standard" as const, u } };
}

/** A valid property assertion (estimate, INFERRED, with method). */
export function estimateAssertion(
  key: string,
  value: number,
  overrides: Partial<PropertyAssertion> = {},
): PropertyAssertion {
  return {
    key,
    quantity: quantity(value, 0.01),
    status: "INFERRED",
    kind: "estimate",
    method: "test/estimate-v1",
    ...overrides,
  };
}

/** A unit orthonormal frame on the z = 0 plane (u = x, v = y, n = z). */
export function xyPlaneFrame(): {
  planePoint: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  axisU: { x: number; y: number; z: number };
  axisV: { x: number; y: number; z: number };
} {
  return {
    planePoint: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    axisU: { x: 1, y: 0, z: 0 },
    axisV: { x: 0, y: 1, z: 0 },
  };
}

/** A valid structured planar geometry: a 4 × 2.7 m rectangle on the z = 0 plane. */
export function planarGeometry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const width = 4;
  const height = 2.7;
  return {
    shape: "planar-rectangle",
    frame: xyPlaneFrame(),
    rectangle: {
      uMin: 0,
      uMax: width,
      vMin: 0,
      vMax: height,
      center: { x: width / 2, y: height / 2, z: 0 },
      corners: [
        { x: 0, y: 0, z: 0 },
        { x: width, y: 0, z: 0 },
        { x: width, y: height, z: 0 },
        { x: 0, y: height, z: 0 },
      ],
    },
    width: quantity(width, 0.02),
    height: quantity(height, 0.02),
    area: { value: width * height, unit: "square_meter" as const, uncertainty: standardUncertainty(0.1) },
    quality: { pointCount: 400, residualRms: 0.005, residualMaxAbs: 0.02 },
    ...overrides,
  };
}
