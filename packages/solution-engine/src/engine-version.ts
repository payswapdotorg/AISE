/**
 * Engine identity and version constants (PROD-022).
 *
 * The deterministic engine identity declared in every validation snapshot it
 * produces (`SolutionValidationSnapshot.engine`) and in every quantity
 * `calculationRef` prefix. The engine KIND mirrors the reference capability
 * profile's `engineKind` ("aise-solution-engine") so snapshots and profiles
 * agree on WHO computed.
 */

/** The deterministic solution engine kind (mirrors the reference profile). */
export const SOLUTION_ENGINE_KIND = "aise-solution-engine";

/** This engine implementation's version (bump on semantic change). */
export const SOLUTION_ENGINE_VERSION = "1.0.0";

/**
 * The canonical calculation-reference prefix of every quantity this engine
 * derives: `<kind>/<quantity-model>/<operation-type>/<vN>`. The versioned tail
 * lets a quantity-model swap be distinguished from a model bug.
 */
export function quantityCalculationRef(operationType: string, modelVersion: string): string {
  return `${SOLUTION_ENGINE_KIND}/quantity/${operationType}/${modelVersion}`;
}

/** Deterministic transition-identity derivation input (content-addressed). */
export interface TransitionIdentityInput {
  readonly kind: "apply" | "undo";
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly operationIndex: number;
  readonly operationId: string;
  readonly parentStateId?: string;
  readonly resultingStateId?: string;
  readonly revertedOperationId?: string;
}
