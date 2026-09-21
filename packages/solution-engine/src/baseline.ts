/**
 * Read-only baseline geometry resolution (PROD-022).
 *
 * THE INTERVENTION MODEL'S `BaselineResolver` DISCIPLINE, carried into the
 * solution engine: the ONLY shape through which the engine can see the
 * authoritative Reality Graph is an injected interface exposing exactly ONE
 * READ method. Implementations must never be backed by anything that
 * mutates reality — the engine consumes them strictly read-only (proven by
 * the sabotage tests in mutation.test.ts).
 *
 * What the engine needs from the baseline: SURFACE FACTS for
 * surface-coated operations (plaster/render/finish over a face-set target).
 * The contract's typed parameters carry the coat thickness and material;
 * the COATED AREA belongs to the anchored target's observed geometry, so it
 * resolves through this read-only seam. A resolver answering `null` for a
 * target yields the honest `surface_area_unresolved` needs-input outcome —
 * the engine ASKS (the caller supplies the area or better geometry), it
 * never invents a surface.
 *
 * Areas resolve by GEOMETRY REFERENCE first (the deterministic geometry
 * services' own ids) and may aggregate a whole face-set/surface-region
 * target. Units are explicit (canonical m2; the engine converts
 * deterministically like any other unit).
 */

import type { OperationTarget } from "@aise/solution-contract";

/** One resolved baseline surface fact. */
export interface BaselineSurfaceArea {
  /** Surface area in the stated unit (m2 canonical). */
  readonly value: number;
  readonly unit: string;
}

/**
 * READ-ONLY baseline geometry resolution — the only window into the
 * authoritative Reality Graph this package owns. ONE read method; no write
 * method exists on the interface, so no implementation wired through it can
 * be reached FOR writes through the engine.
 */
export interface BaselineGeometryResolver {
  /**
   * Resolves the total surface area of a surface target (face-set /
   * surface-region), or `null` when the target's area cannot be resolved
   * from the pinned baseline. Pure read: never mutates anything.
   */
  readonly resolveSurfaceArea: (
    target: OperationTarget,
  ) => BaselineSurfaceArea | null;
}

/**
 * A fixed baseline geometry table — the deterministic fixture resolver over
 * committed reference data (the demo world's wall faces, slab region and
 * wall line). Reads ONLY from the frozen table; unknown references answer
 * `null` (the honest unresolved state).
 */
export class TableBaselineGeometryResolver implements BaselineGeometryResolver {
  readonly resolveSurfaceArea: (target: OperationTarget) => BaselineSurfaceArea | null;

  constructor(table: Readonly<Record<string, BaselineSurfaceArea>>) {
    const frozen = Object.freeze({ ...table });
    this.resolveSurfaceArea = (target) => {
      for (const ref of target.geometryRefs) {
        const area = frozen[ref.ref];
        if (area !== undefined) {
          return area;
        }
      }
      return null;
    };
  }
}

/** Whether a target selector selects a SURFACE (coatable) region. */
export function isSurfaceTarget(target: OperationTarget): boolean {
  return target.selectorKind === "face-set" || target.selectorKind === "surface-region";
}
