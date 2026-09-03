/**
 * Geometric entities for deterministic measurement queries
 * (AISE-009).
 *
 * Entities are the *inputs* to distance/angle queries. Every entity
 * carries:
 *
 * - **an explicit length unit** — coordinates are meaningless
 *   without it, and there is no implicit default;
 * - **a declared epistemic state** — who vouches for this
 *   geometry. `OBSERVED` is an input declaration (survey control
 *   data), never something this package infers; the conservative
 *   default is `INFERRED`. Query results derive their state from
 *   their inputs (weakest link) and fits are always INFERRED;
 * - **optional positional uncertainty** — isotropic per-axis 1σ in
 *   the entity's unit; absent means "not stated", never zero.
 *
 * Lines and planes are carried as point + direction/normal; the
 * direction/normal is normalized at construction (orientation and
 * sign are the caller's — signed semantics are defined per query
 * and documented there).
 */
import { GeometryError } from "../errors.js";
import { assertSourceEpistemicState } from "../epistemic.js";
import { assertLengthUnit, type LengthUnit } from "../units.js";
import { assertFiniteNumber, validateGeomPoint, vec3Normalize, type GeomPoint } from "../validate.js";
import { type EpistemicState } from "@aise/shared-contracts";

/** A measurement-capable 3D point. */
export interface PointEntity {
  readonly kind: "point";
  readonly point: GeomPoint;
  readonly unit: LengthUnit;
  readonly epistemic: EpistemicState;
  /** Isotropic per-axis 1σ of the position (in `unit`), if stated. */
  readonly standardUncertainty?: number;
}

/** An infinite line: point + unit direction. */
export interface LineEntity {
  readonly kind: "line";
  readonly point: GeomPoint;
  readonly direction: { readonly x: number; readonly y: number; readonly z: number };
  readonly unit: LengthUnit;
  readonly epistemic: EpistemicState;
  /** 1σ of `point` (isotropic, in `unit`), if stated. */
  readonly standardUncertainty?: number;
  /** 1σ (radians) of the direction, if stated. */
  readonly directionStandardUncertainty?: number;
}

/** A plane: point + unit normal. */
export interface PlaneEntity {
  readonly kind: "plane";
  readonly point: GeomPoint;
  readonly normal: { readonly x: number; readonly y: number; readonly z: number };
  readonly unit: LengthUnit;
  readonly epistemic: EpistemicState;
  /** 1σ of `point` (isotropic, in `unit`), if stated. */
  readonly standardUncertainty?: number;
  /** 1σ (radians) of the normal direction, if stated. */
  readonly normalStandardUncertainty?: number;
}

/** Any query entity. */
export type GeometryEntity = PointEntity | LineEntity | PlaneEntity;

/** Options shared by entity constructors. */
export interface EntityOptions {
  /** Length unit of the coordinates (required, no default). */
  readonly unit: LengthUnit;
  /** Declared epistemic state of the source (default INFERRED). */
  readonly epistemic?: EpistemicState;
  /** 1σ of the anchor point (isotropic, in `unit`), if stated. */
  readonly standardUncertainty?: number;
}

function validateEntityOptions(options: EntityOptions): {
  unit: LengthUnit;
  epistemic: EpistemicState;
  standardUncertainty?: number;
} {
  const unit = assertLengthUnit(options.unit);
  const epistemic = assertSourceEpistemicState(options.epistemic ?? "INFERRED");
  let standardUncertainty: number | undefined;
  if (options.standardUncertainty !== undefined) {
    standardUncertainty = assertFiniteNumber(options.standardUncertainty, "standardUncertainty");
    if (standardUncertainty <= 0) {
      throw new GeometryError(
        "UNCERTAINTY_INVALID",
        `standardUncertainty must be > 0 (or omitted): ${String(options.standardUncertainty)}`,
        { details: { value: String(options.standardUncertainty) } },
      );
    }
  }
  return { unit, epistemic, standardUncertainty };
}

/** Constructs a validated point entity (directionless). */
export function definePoint(point: GeomPoint, options: EntityOptions): PointEntity {
  const validated = validateGeomPoint(point, "point");
  const base = validateEntityOptions(options);
  return {
    kind: "point",
    point: validated,
    unit: base.unit,
    epistemic: base.epistemic,
    ...(base.standardUncertainty === undefined ? {} : { standardUncertainty: base.standardUncertainty }),
  };
}

/** Constructs a validated line entity (direction normalized). */
export function defineLine(
  point: GeomPoint,
  direction: { readonly x: number; readonly y: number; readonly z: number },
  options: EntityOptions & {
    /** 1σ (radians) of the direction, if stated. */
    readonly directionStandardUncertainty?: number;
  },
): LineEntity {
  const validated = validateGeomPoint(point, "line.point");
  const base = validateEntityOptions(options);
  const unitDirection = vec3Normalize(direction, "line.direction");
  let directionStandardUncertainty: number | undefined;
  if (options.directionStandardUncertainty !== undefined) {
    directionStandardUncertainty = assertFiniteNumber(
      options.directionStandardUncertainty,
      "directionStandardUncertainty",
    );
    if (directionStandardUncertainty <= 0) {
      throw new GeometryError(
        "UNCERTAINTY_INVALID",
        `directionStandardUncertainty must be > 0 (or omitted): ${String(options.directionStandardUncertainty)}`,
        { details: { value: String(options.directionStandardUncertainty) } },
      );
    }
  }
  return {
    kind: "line",
    point: validated,
    direction: unitDirection,
    unit: base.unit,
    epistemic: base.epistemic,
    ...(base.standardUncertainty === undefined ? {} : { standardUncertainty: base.standardUncertainty }),
    ...(directionStandardUncertainty === undefined
      ? {}
      : { directionStandardUncertainty }),
  };
}

/** Constructs a validated plane entity (normal normalized). */
export function definePlane(
  point: GeomPoint,
  normal: { readonly x: number; readonly y: number; readonly z: number },
  options: EntityOptions & {
    /** 1σ (radians) of the normal, if stated. */
    readonly normalStandardUncertainty?: number;
  },
): PlaneEntity {
  const validated = validateGeomPoint(point, "plane.point");
  const base = validateEntityOptions(options);
  const unitNormal = vec3Normalize(normal, "plane.normal");
  let normalStandardUncertainty: number | undefined;
  if (options.normalStandardUncertainty !== undefined) {
    normalStandardUncertainty = assertFiniteNumber(
      options.normalStandardUncertainty,
      "normalStandardUncertainty",
    );
    if (normalStandardUncertainty <= 0) {
      throw new GeometryError(
        "UNCERTAINTY_INVALID",
        `normalStandardUncertainty must be > 0 (or omitted): ${String(options.normalStandardUncertainty)}`,
        { details: { value: String(options.normalStandardUncertainty) } },
      );
    }
  }
  return {
    kind: "plane",
    point: validated,
    normal: unitNormal,
    unit: base.unit,
    epistemic: base.epistemic,
    ...(base.standardUncertainty === undefined ? {} : { standardUncertainty: base.standardUncertainty }),
    ...(normalStandardUncertainty === undefined ? {} : { normalStandardUncertainty }),
  };
}
