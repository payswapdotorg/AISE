/**
 * `@aise/visual-render` — public API (HFX-303).
 *
 * THE BOUNDED VISUAL-SOLUTION PROVIDER LANE: the provider-neutral port
 * where visual-generation providers (image/3D generation technologies
 * such as Apple SHARP and TRELLIS.2 — future occupants) render solution
 * states for inspection/presentation — STRICTLY as visualization or
 * hypothesis-rendering aids, never engineering geometry authority.
 *
 * THE FIVE LANE LAWS (docs/productization-layer-hardening-work-orders.md
 * §HFX-303, each proven by tests + runner records):
 *
 *  1. generated visuals can never change quantities, validation or
 *     canonical Solution Graph state — the request carries presentation
 *     inputs ONLY (state identity + already-computed canonical
 *     projections, cloned and frozen); non-interference is structural and
 *     drill-proven;
 *  2. every visual artifact is linked to a solution/state revision and
 *     provider profile — the provenance binds the exact state revision,
 *     is content-addressed, and tampered/unbound artifacts are REFUSED;
 *  3. provider replacement changes presentation only — the swap drill's
 *     canonical byte-comparisons prove it;
 *  4. missing/failed visual generation falls back to the canonical
 *     deterministic 2D/3D views, with the fallback itself recorded;
 *  5. generated details are labeled as generated/hypothetical where they
 *     exceed deterministic geometry — the artifact's label manifest is
 *     the render contract's labeling source.
 *
 * THE PROVIDERS ARE IN-REPO DETERMINISTIC FIXTURES (a reference
 * hypothesis-renderer, an independent alternate renderer and an
 * always-failing fixture) that evidence the LANE — no external model is
 * integrated, nothing is downloaded, zero new dependencies; real
 * visual-generation models are future occupants of the port this package
 * proves. The failure vocabulary, profile shape and provenance manifest
 * are IMPORTED from `@aise/provider-registry` (HFX-000's control plane)
 * and never modified.
 *
 * ENTRY POINTS:
 *   "."       — this barrel: the port (descriptor, request/artifact types,
 *               the governed render entry, provenance sealing/verification,
 *               the fallback policy, the three providers, the control-plane
 *               profiles);
 *   "./corpus" — the deterministic demo corpus (engine replays + canonical
 *               projections) the eval runner drills;
 *   "./lane"   — the lane-side JSON worker the tools runner spawns.
 *
 * PURE DETERMINISTIC COMPUTATION: no network, no clock reads, no
 * randomness, no browser APIs, no I/O in the core. The exported surface
 * is functions + frozen constants ONLY (the house package discipline).
 */

/* The descriptor ------------------------------------------------------- */

export {
  DESCRIPTOR_VALIDATION_FAILURE_KINDS,
  NUMERIC_CLAIM_POLICIES,
  VISUAL_CLASSES,
  VISUAL_DESCRIPTOR_SCHEMA_VERSION,
  VISUAL_DIGEST_PATTERN,
  VISUAL_LANE_STATEMENT,
  VISUAL_PROVIDER_DESCRIPTOR_KIND,
  descriptorDigestOf,
  isVisualClass,
  isVisualDigest,
  isVisualProviderDescriptor,
  validateVisualProviderDescriptor,
} from "./descriptor";
export type {
  DescriptorValidationFailure,
  DescriptorValidationFailureKind,
  NumericClaimPolicy,
  PresentationStyleDeclaration,
  VisualClass,
  VisualDescriptorValidation,
  VisualFailureModeDeclaration,
  VisualProviderDescriptor,
} from "./descriptor";

/* The port -------------------------------------------------------------- */

export {
  REQUEST_VALIDATION_FAILURE_KINDS,
  VISUAL_ARTIFACT_KIND,
  VISUAL_ARTIFACT_SCHEMA_VERSION,
  VISUAL_PORT_STATEMENT,
  VISUAL_STATE_REQUEST_KIND,
  deepFreezeVisual,
  providerSupportsClass,
  renderThroughLane,
  validateVisualStateRequest,
} from "./port";
export type {
  CanonicalComparisonSummary,
  CanonicalProjectionShape,
  CanonicalProjectionSnapshot,
  CanonicalStateIdentity,
  GeneratedRegionLabel,
  VisualArtifact,
  VisualArtifactContent,
  VisualProviderReference,
  VisualRenderFailure,
  VisualRenderOutcome,
  VisualRenderProvider,
  VisualStateRequest,
  VisualStateRequestValidation,
  RequestValidationFailure,
  RequestValidationFailureKind,
} from "./port";

/* Provenance ------------------------------------------------------------ */

export {
  ARTIFACT_VALIDATION_FAILURE_KINDS,
  VISUAL_LANE_CONSUMER_SURFACE,
  VISUAL_LANE_REPRODUCIBILITY_STATEMENT,
  providerReferenceOf,
  sealLaneProvenanceManifest,
  sealVisualArtifact,
  verifyVisualArtifact,
  visualOutcomeDigestOf,
  visualRequestDigestOf,
} from "./provenance";
export type {
  ArtifactValidationFailure,
  ArtifactValidationFailureKind,
  SealLaneProvenanceInput,
  SealVisualArtifactInput,
  VisualArtifactValidation,
} from "./provenance";

/* The fallback policy --------------------------------------------------- */

export {
  FALLBACK_VALIDATION_FAILURE_KINDS,
  VISUAL_FALLBACK_KIND,
  VISUAL_FALLBACK_SCHEMA_VERSION,
  VISUAL_FALLBACK_STATEMENT,
  canonicalProjectionDigestOf,
  fallbackForMissingProvider,
  fallbackForOutcome,
  fallbackForProviderFailure,
  verifyVisualFallbackRecord,
} from "./fallback";
export type {
  FallbackValidationFailure,
  FallbackValidationFailureKind,
  VisualFallbackReason,
  VisualFallbackRecord,
  VisualFallbackValidation,
} from "./fallback";

/* The three in-repo lane providers --------------------------------------- */

export {
  ALTERNATE_VISUAL_PROVIDER_ID,
  ALTERNATE_VISUAL_TECHNOLOGY_VERSION,
  alternateVisualDescriptor,
  createAlternateVisualProvider,
} from "./providers/alternate";
export {
  DEFAULT_FAILING_KIND,
  FAILING_VISUAL_PROVIDER_ID,
  FAILING_VISUAL_TECHNOLOGY_VERSION,
  createFailingVisualProvider,
  failingVisualDescriptor,
} from "./providers/failing";
export {
  REFERENCE_VISUAL_PROVIDER_ID,
  REFERENCE_VISUAL_TECHNOLOGY_VERSION,
  createReferenceVisualProvider,
  referenceVisualDescriptor,
} from "./providers/reference";
export type { FailingVisualProviderOptions } from "./providers/failing";

/* The control-plane profiles --------------------------------------------- */

export {
  VISUAL_LANE_CAPABILITY,
  VISUAL_LANE_ID,
  alternateVisualProfile,
  failingVisualProfile,
  referenceVisualProfile,
} from "./profiles";
