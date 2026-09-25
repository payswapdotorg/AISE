/**
 * HFX-303 — the CONTROL-PLANE PROFILES of the visual lane's providers.
 *
 * Every lane provider is ALSO representable by the HFX-000 control
 * plane's machine-readable `ProviderProfile` (all fifteen mandatory
 * fields — imported from `@aise/provider-registry`, never modified), so
 * the visual providers ride the SAME registration → evaluation →
 * execution → normalized result → benchmark → provenance → promotion
 * pipeline as every other AISE provider. The lane's capability id is
 * `solution-state-visual-rendering`; the profiles are deterministic
 * reference data (no clock, no network, no randomness) and validate
 * through the control plane's own `validateProviderProfile`.
 */

import {
  toLicenseDeclaration,
  type ProviderProfile,
} from "@aise/provider-registry";

/** The visual lane's capability id (the control-plane capability string). */
export const VISUAL_LANE_CAPABILITY = "solution-state-visual-rendering" as const;

/** The in-repo lane id these profiles declare (mirrors the eval lanes). */
export const VISUAL_LANE_ID = "deterministic-inhouse-visual-lane" as const;

/* ------------------------------------------------------------------ */
/* Shared declared contracts                                            */
/* ------------------------------------------------------------------ */

/**
 * The declared INPUT contract of a visual provider (the control-plane
 * view of `VisualStateRequest` — expressed with the closed contract field
 * vocabulary; the full structural type is the lane's own port.ts).
 */
function visualInputContract() {
  return {
    contractId: "visual-state-request/1",
    modality: "text" as const,
    fields: [
      {
        name: "visualClass",
        type: "string" as const,
        required: true,
        description: "the closed-vocabulary visual class to render",
        minLength: 1,
        maxLength: 64,
      },
      {
        name: "solutionId",
        type: "string" as const,
        required: true,
        description: "the owning solution/scenario graph id of the rendered state",
        minLength: 1,
        maxLength: 256,
      },
      {
        name: "versionRef",
        type: "string" as const,
        required: true,
        description: "the pinned version identity the state branches from",
        minLength: 1,
        maxLength: 256,
      },
      {
        name: "stateId",
        type: "string" as const,
        required: true,
        description: "the content-derived stable state id (the pane synchronization anchor)",
        minLength: 1,
        maxLength: 256,
      },
      {
        name: "stateIndex",
        type: "integer" as const,
        required: true,
        description: "the layer number (0 = baseline overlay)",
        min: 0,
        max: 100000,
      },
      {
        name: "stateContentDigest",
        type: "string" as const,
        required: false,
        description: "optional 64-hex content pin over the state's materialized content",
        minLength: 64,
        maxLength: 64,
      },
      {
        name: "canonicalProjectionShapeCount",
        type: "integer" as const,
        required: true,
        description: "how many shapes the canonical plan projection snapshot carries",
        min: 0,
        max: 100000,
      },
    ],
  };
}

/** The declared OUTPUT contract of a visual provider. */
function visualOutputContract() {
  return {
    contractId: "visual-artifact/1",
    modality: "image" as const,
    fields: [
      {
        name: "artifactId",
        type: "string" as const,
        required: true,
        description: "the 64-hex content address over the artifact's canonical JSON",
        minLength: 64,
        maxLength: 64,
      },
      {
        name: "svg",
        type: "string" as const,
        required: true,
        description: "the deterministic SVG rendering of the state (presentation only)",
        minLength: 1,
        maxLength: 1048576,
      },
      {
        name: "excessRegionCount",
        type: "integer" as const,
        required: true,
        description: "how many labeled regions exceed deterministic geometry",
        min: 0,
        max: 1024,
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The three profiles                                                   */
/* ------------------------------------------------------------------ */

function visualProfileBase(): Omit<
  ProviderProfile,
  "providerId" | "technologyVersion" | "displayName" | "description" | "license" | "failureModes"
> {
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    capabilities: [VISUAL_LANE_CAPABILITY],
    supportedModalities: ["text", "image"],
    computeProfile: {
      accelerator: "none",
      minimumCores: 1,
      recommendedCores: 1,
      offlineCapable: true,
      statement: "deterministic in-repo SVG computation — no accelerator, fully offline",
    },
    memoryProfile: {
      minimumMiB: 16,
      recommendedMiB: 32,
      statement: "declared fixture memory envelope (no environment is sensed)",
    },
    latencyProfile: {
      expectedMsP50: 0.5,
      expectedMsP95: 1,
      timeoutMs: 5000,
      statement: "declared fixture latencies — no wall-clock measurement exists in the lane",
    },
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "n/a",
      quotaPolicy: "deterministic local computation, no quota, canonical fallback always available",
    },
    inputContract: visualInputContract(),
    outputContract: visualOutputContract(),
    provenanceContract: {
      providerIdentityRequired: true,
      configurationDigestRequired: true,
      inputDigestRequired: true,
      nativePayloadPolicy: "none",
    },
    uncertaintyCharacteristics: {
      calibration: "none-declared",
      confidenceSeparateFromMeasurementUncertainty: true,
      notes:
        "a generated visual carries NO confidence and NO measurement uncertainty — it is presentation " +
        "only and never substitutes for measurement; its illustrative regions are labeled, not scored",
    },
    benchmarkResults: [],
  };
}

/** The reference hypothesis-renderer's control-plane profile. */
export function referenceVisualProfile(): ProviderProfile {
  return {
    ...visualProfileBase(),
    providerId: "visual-hypothesis-reference",
    technologyVersion: "1.0.0-inrepo-v1",
    displayName: "Reference Hypothesis Renderer (visual lane)",
    description:
      "Deterministic in-repo reference implementation of a bounded visual provider: a light " +
      "hypothesis-study rendering of the canonical plan projection with a declared hatched " +
      "hypothesized-finish band beyond deterministic geometry.",
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse: "presentation-only solution-state visualization behind the AISE visual-rendering provider port",
      intendedUseCleared: true,
    }),
    failureModes: [
      {
        kind: "unsupported-data",
        condition: "a request whose visual class is not among the declared capabilities",
        behavior: "explicit unsupported-data refusal — never a fabricated rendering",
      },
      {
        kind: "contract-mismatch",
        condition: "a request that violates the visual state request contract",
        behavior: "typed refusal carried from the lane's request gate — never a silent coercion",
      },
    ],
  };
}

/** The alternate blueprint renderer's control-plane profile. */
export function alternateVisualProfile(): ProviderProfile {
  return {
    ...visualProfileBase(),
    providerId: "visual-blueprint-alternate",
    technologyVersion: "1.0.0-inrepo-v1",
    displayName: "Blueprint Alternate Renderer (visual lane)",
    description:
      "An independent second deterministic in-repo renderer with a visibly different presentation " +
      "style — the swap lane's proof that provider replacement is presentation-only.",
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse: "presentation-only solution-state visualization behind the AISE visual-rendering provider port",
      intendedUseCleared: true,
    }),
    failureModes: [
      {
        kind: "unsupported-data",
        condition: "a request whose visual class is not among the declared capabilities (e.g. material-study)",
        behavior: "explicit unsupported-data refusal — never a fabricated rendering",
      },
      {
        kind: "contract-mismatch",
        condition: "a request that violates the visual state request contract",
        behavior: "typed refusal carried from the lane's request gate — never a silent coercion",
      },
    ],
  };
}

/** The failing fixture provider's control-plane profile. */
export function failingVisualProfile(): ProviderProfile {
  return {
    ...visualProfileBase(),
    providerId: "visual-failing-fixture",
    technologyVersion: "1.0.0-inrepo-v1",
    displayName: "Failing Visual Fixture (visual lane)",
    description:
      "A deterministic fixture provider that always fails with its declared typed failure — " +
      "the fallback lane's test driver. It never renders and never leaves a gap.",
    license: toLicenseDeclaration({
      identifier: "fixture-permissive-1.0",
      commercialUse: true,
      intendedUse: "driving the visual lane's fallback drill only — never a production rendering path",
      intendedUseCleared: true,
    }),
    failureModes: [
      {
        kind: "unsupported-data",
        condition: "every render request, unconditionally",
        behavior: "the declared typed failure — the lane falls back to the canonical deterministic views",
      },
    ],
  };
}
