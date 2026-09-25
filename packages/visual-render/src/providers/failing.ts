/**
 * HFX-303 — the FAILING visual provider (the fallback lane's test driver).
 *
 * A deterministic fixture provider that ALWAYS answers with a typed
 * failure from the control plane's CLOSED vocabulary — never an artifact,
 * never a throw, never a silent gap. Its existence proves the fallback
 * lane end-to-end: a provider that fails yields the canonical fallback
 * record (canonical deterministic projections + the typed failure note),
 * and the UI seam renders the canonical panes with the fallback notice.
 *
 * The failure kind is configurable at construction (validated against the
 * closed vocabulary — an invented kind is refused at construction time)
 * and DECLARED in the provider's descriptor, so the failure mode is
 * honest reference data, not a surprise.
 */

import { isFailureKind, type FailureKind } from "@aise/provider-registry";
import type {
  VisualRenderFailure,
  VisualRenderOutcome,
  VisualRenderProvider,
} from "../port";
import {
  VISUAL_LANE_STATEMENT,
  type VisualProviderDescriptor,
} from "../descriptor";

export const FAILING_VISUAL_PROVIDER_ID = "visual-failing-fixture" as const;
export const FAILING_VISUAL_TECHNOLOGY_VERSION = "1.0.0-inrepo-v1" as const;

/** The default failure the fixture reports (an honest out-of-support class). */
export const DEFAULT_FAILING_KIND: FailureKind = "unsupported-data";

/** Construction options of the failing fixture provider. */
export interface FailingVisualProviderOptions {
  /** The closed-vocabulary failure kind to report (default: unsupported-data). */
  readonly failureKind?: FailureKind;
  /** Optional detail override (default: the fixture's honest statement). */
  readonly detail?: string;
}

/**
 * Builds the failing fixture's descriptor for one failure kind — the kind
 * is DECLARED as the provider's failure mode (honest reference data).
 */
export function failingVisualDescriptor(
  failureKind: FailureKind = DEFAULT_FAILING_KIND,
): VisualProviderDescriptor {
  return {
    kind: "visual-provider-descriptor",
    schemaVersion: "visual-provider-descriptor/1",
    providerId: FAILING_VISUAL_PROVIDER_ID,
    technologyVersion: FAILING_VISUAL_TECHNOLOGY_VERSION,
    displayName: "Failing Visual Fixture",
    description:
      "A deterministic fixture provider that always fails with its declared typed failure — " +
      "the fallback lane's test driver. It never renders, never throws and never leaves a gap: " +
      "every refusal yields the canonical fallback record.",
    presentationStyle: {
      name: "none (always fails)",
      statement: "this fixture renders nothing — its purpose is the typed failure the fallback lane consumes",
    },
    capabilities: ["elevation-hypothesis", "material-study", "context-sketch"],
    declaredLimitations: [
      "always fails — this provider exists to drive the fallback lane's drill, it never produces an artifact",
      `its single declared failure mode is '${failureKind}' from the closed provider failure vocabulary`,
      "carries no numeric engineering claims — it renders nothing at all",
    ],
    numericClaimPolicy: "illustrative-only",
    failureModes: [
      {
        kind: failureKind,
        condition: "every render request, unconditionally",
        behavior: "the declared typed failure — the lane falls back to the canonical deterministic views",
      },
    ],
    laneStatement: VISUAL_LANE_STATEMENT,
  };
}

/**
 * Creates the failing fixture provider. The failure kind is validated
 * against the closed vocabulary at construction — an invented kind throws
 * immediately (fail fast on construction, never at render time).
 */
export function createFailingVisualProvider(
  options: FailingVisualProviderOptions = {},
): VisualRenderProvider {
  const failureKind = options.failureKind ?? DEFAULT_FAILING_KIND;
  if (!isFailureKind(failureKind)) {
    throw new Error(
      `the failing visual fixture cannot report the non-closed-vocabulary failure kind '${String(failureKind)}'`,
    );
  }
  const descriptor = failingVisualDescriptor(failureKind);
  const failure: VisualRenderFailure = {
    kind: failureKind,
    detail:
      options.detail ??
      "the failing visual fixture never renders — this typed failure drives the fallback lane (the canonical deterministic views remain the engineering views)",
  };
  return {
    descriptor,
    renderVisual(): VisualRenderOutcome {
      return { ok: false, failure };
    },
  };
}
