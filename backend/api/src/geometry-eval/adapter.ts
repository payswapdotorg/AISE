/**
 * HFX-302 — the PROVIDER-NEUTRAL GEOMETRY/VALIDATION ADAPTER SURFACE.
 *
 * `executeSequence(provider, scene, operations)` is the ONE seam both
 * implementations consume the SAME canonical operation sequence through
 * (the work order's first acceptance criterion). The adapter enforces the
 * two boundary disciplines BEFORE any comparison can exist:
 *
 *  1. THE FAIL-CLOSED CAPABILITY GATE (Law 3 — unsupported is recorded,
 *     never computed): the FIRST operation whose family is outside the
 *     provider's DECLARED capability set is answered with the typed
 *     `unsupported` outcome naming the family — BEFORE the provider
 *     executes anything. The gate reads exactly the descriptor the
 *     provider declares (validated upstream); there is no execution path
 *     around it.
 *
 *  2. THE CANONICAL-BOUNDARY PROJECTION GUARD (Law 1 — the D26
 *     discipline at this seam): everything a provider contributes to a
 *     comparison is projected STRICTLY onto the canonical shapes — the
 *     quantity rows, validation checks and verdict through PROD-029's own
 *     `projectCanonicalQuantities` / `projectCanonicalValidationChecks` /
 *     `projectCanonicalVerdict` (imported from
 *     backend/api/src/solution-eval — never modified), the topology rows
 *     through this module's `projectCanonicalTopologyConstraints` (the
 *     same closed-shape discipline). A provider output that carries an
 *     unknown field, a non-canonical vocabulary value or a malformed
 *     payload is REFUSED with the typed `contract-mismatch` refusal —
 *     never silently coerced into a canonical comparison.
 *
 * The provider's raw execution output is provider-shaped CANONICAL JSON
 * (the same discipline PROD-029's DeclaredExecution uses): the adapter
 * never inspects provider internals, it only projects + refuses.
 *
 * DETERMINISM: pure functions; no I/O, no clock, no randomness.
 */

import {
  projectCanonicalQuantities,
  projectCanonicalValidationChecks,
  projectCanonicalVerdict,
} from "../solution-eval/model";
import type {
  CanonicalQuantity,
  CanonicalValidationCheck,
  ProjectionRefusal,
} from "../solution-eval/model";
import type { ValidationSnapshotOutcome } from "@aise/solution-contract";
import type { SolutionValidationSnapshot, SolutionVersion } from "@aise/solution-contract";
import { projectCanonicalTopologyConstraints } from "./model";
import type {
  CanonicalTopologyConstraint,
  GeometryProviderDescriptor,
  GeometryScene,
  NeutralOperation,
} from "./model";

/* ------------------------------------------------------------------ */
/* The provider interface (the neutral port)                            */
/* ------------------------------------------------------------------ */

/** The execution input every provider consumes (the neutral canonical form). */
export interface GeometryExecutionInput {
  readonly scene: GeometryScene;
  readonly operations: readonly NeutralOperation[];
}

/**
 * The contract-shaped derivation input pair the BOQ leg flows through
 * the shared seam (`deriveSolutionBoq` — the PROD-025 dependency made
 * real: BOTH lanes' quantities flow through the SAME public derivation,
 * never a private reimplementation of BOQ math). The reference lane's
 * pair is the engine's OWN version + snapshot; the substitute's pair is
 * an evaluation-scoped TRANSIENT construction (its own quantity effects
 * + its own independent snapshot) — consumed by the derivation inside
 * the harness and NEVER emitted as Solution Graph identity (Law 1: a
 * substitute's outputs are comparison records, never identity).
 */
export interface BoqDerivationInput {
  readonly version: SolutionVersion;
  readonly snapshot: SolutionValidationSnapshot;
}

/**
 * The provider's raw execution output — provider-shaped canonical JSON at
 * the four projection points (the D26 discipline: the adapter PROJECTS
 * and REFUSES; it never trusts the payload as canonical) plus the
 * contract-shaped BOQ derivation input pair.
 */
export interface GeometryExecutionOutput {
  /** Canonical-JSON array of the lane's quantity rows. */
  readonly quantitiesJson: string;
  /** Canonical-JSON array of the lane's validation-check rows. */
  readonly checksJson: string;
  /** The lane's worst-of validation verdict (the canonical vocabulary). */
  readonly verdict: string;
  /** Canonical-JSON array of the lane's topology-constraint rows. */
  readonly topologyJson: string;
  /** The BOQ derivation input pair (contract-shaped; see BoqDerivationInput). */
  readonly derivationInput: BoqDerivationInput;
}

/**
 * ONE geometry/validation implementation behind the neutral port. The
 * reference oracle (reference.ts) and the independent reimplementation
 * (substitute.ts) implement THIS interface — and any external
 * geometry/constraint technology later slots into the same port.
 */
export interface GeometryProvider {
  readonly descriptor: GeometryProviderDescriptor;
  execute(input: GeometryExecutionInput): GeometryExecutionOutput;
}

/* ------------------------------------------------------------------ */
/* The adapter's typed outcomes                                          */
/* ------------------------------------------------------------------ */

/** The projected canonical results of one successfully executed lane. */
export interface LaneProjection {
  readonly quantities: readonly CanonicalQuantity[];
  readonly checks: readonly CanonicalValidationCheck[];
  readonly verdict: ValidationSnapshotOutcome;
  readonly topology: readonly CanonicalTopologyConstraint[];
}

export type ProviderExecutionOutcome =
  | {
      readonly outcome: "executed";
      readonly projection: LaneProjection;
      /** The contract-shaped BOQ derivation input pair (the shared seam's input). */
      readonly derivationInput: BoqDerivationInput;
    }
  | {
      /** The fail-closed capability gate (Law 3): the family is named, nothing was computed. */
      readonly outcome: "unsupported";
      readonly family: string;
      readonly detail: string;
    }
  | {
      /** The canonical-boundary projection guard (the D26 discipline at this seam). */
      readonly outcome: "projection-refused";
      readonly refusal: ProjectionRefusal;
    };

/* ------------------------------------------------------------------ */
/* The adapter                                                           */
/* ------------------------------------------------------------------ */

/**
 * Executes ONE canonical operation sequence through ONE provider behind
 * the neutral port. Order of enforcement (both BEFORE any comparison can
 * exist):
 *
 *   1. the fail-closed capability gate — the first operation family
 *      outside the descriptor's declared capabilities answers with the
 *      typed `unsupported` naming the family; the provider NEVER executes;
 *   2. the provider's raw execution;
 *   3. the canonical-boundary projection guard — every projection point
 *      refuses provider-specific shapes with the typed
 *      `contract-mismatch`.
 *
 * PURE and DETERMINISTIC: same provider + scene + operations → the same
 * typed outcome.
 */
export function executeSequence(
  provider: GeometryProvider,
  scene: GeometryScene,
  operations: readonly NeutralOperation[],
): ProviderExecutionOutcome {
  /* 1. The fail-closed capability gate (Law 3). */
  const declared = new Set<string>(provider.descriptor.declaredCapabilities);
  for (const operation of operations) {
    if (!declared.has(operation.operationType)) {
      return {
        outcome: "unsupported",
        family: operation.operationType,
        detail:
          `the operation family '${operation.operationType}' is outside the declared ` +
          `capabilities of provider '${provider.descriptor.providerId}' ` +
          `(${provider.descriptor.declaredCapabilities.length} families declared) — the ` +
          `fail-closed gate records the unsupported family BEFORE execution; the ` +
          `substitute never computes an undeclared operation class`,
      };
    }
  }

  /* 2. The provider's raw execution (provider-shaped canonical JSON). */
  const output = provider.execute({ scene, operations });

  /* 3. The canonical-boundary projection guard (the D26 discipline). */
  const quantities = projectCanonicalQuantities(output.quantitiesJson);
  if (!quantities.ok) {
    return { outcome: "projection-refused", refusal: quantities.refusal };
  }
  const checks = projectCanonicalValidationChecks(output.checksJson);
  if (!checks.ok) {
    return { outcome: "projection-refused", refusal: checks.refusal };
  }
  const verdict = projectCanonicalVerdict("verdict", output.verdict);
  if (!verdict.ok) {
    return { outcome: "projection-refused", refusal: verdict.refusal };
  }
  const topology = projectCanonicalTopologyConstraints(output.topologyJson);
  if (!topology.ok) {
    return { outcome: "projection-refused", refusal: topology.refusal };
  }

  return {
    outcome: "executed",
    projection: {
      quantities: quantities.projected,
      checks: checks.projected,
      verdict: verdict.projected,
      topology: topology.projected,
    },
    derivationInput: output.derivationInput,
  };
}
