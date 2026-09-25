/**
 * HFX-303 — the GENERATED-VISUAL pane module's input model.
 *
 * ⚠⚠⚠ NO BROWSER-SIDE AUTHORITY (the viewer's frozen invariant, carried
 * into the generated pane) ⚠⚠⚠
 *
 * STRUCTURAL MIRRORS of `@aise/visual-render`'s `VisualArtifact` and
 * `VisualFallbackRecord` (packages/visual-render/src/port.ts +
 * fallback.ts): same field names, same JSON shapes, defined LOCALLY —
 * the AISE-027 viewer convention (model.ts mirrors the AISE-026 backend
 * shapes the same way). A real artifact serialized over the wire by the
 * lane satisfies these types as-is (structural typing); the compat test
 * (compat.test.ts) proves it end-to-end by rendering the viewer from a
 * LIVE package artifact.
 *
 * THE GENERATED PANE'S LAWS (the work order's acceptance criteria):
 *  - the artifact is PRESENTATION ONLY — it can never change quantities,
 *    validation or canonical Solution Graph state (proven package-side;
 *    the pane adds no write path, no fetch, no browser API);
 *  - the "GENERATED — HYPOTHETICAL VISUAL, NOT ENGINEERING GEOMETRY"
 *    banner is ALWAYS rendered (the labeling criterion);
 *  - every label-manifest region is rendered with its label;
 *  - the provenance block renders the exact state revision, the applied
 *    operation ids and the provider id/version/digest;
 *  - a fallback record renders the canonical-fallback notice — the
 *    canonical 2D/3D panes remain the engineering views, never a gap.
 */

/* ------------------------------------------------------------------ */
/* The structural mirror of the lane's VisualArtifact                    */
/* ------------------------------------------------------------------ */

/** The provider identity block of the artifact's provenance. */
export interface GeneratedVisualProviderReference {
  readonly providerId: string;
  readonly technologyVersion: string;
  /** The 64-hex content digest of the provider's descriptor. */
  readonly descriptorDigest: string;
}

/** The provenance of one generated visual artifact (wire mirror). */
export interface GeneratedVisualProvenance {
  readonly solutionId: string;
  readonly versionRef: string;
  readonly stateId: string;
  readonly stateIndex: number;
  readonly appliedOperationIds: readonly string[];
  readonly stateContentDigest?: string;
  readonly provider: GeneratedVisualProviderReference;
  readonly laneStatement: string;
}

/** One generated/hypothetical region label of the artifact's manifest. */
export interface GeneratedRegionLabelMirror {
  readonly regionId: string;
  readonly regionKind: string;
  readonly label: string;
  readonly basis: string;
  readonly detail: string;
}

/**
 * A rendered visual artifact as it arrives over the wire (server-side
 * lane output). Structural mirror of the package's `VisualArtifact`.
 */
export interface GeneratedVisualArtifact {
  readonly kind: "visual-artifact";
  readonly schemaVersion: "visual-artifact/1";
  readonly artifactId: string;
  readonly visualClass: string;
  readonly content: {
    readonly mediaType: "image/svg+xml";
    readonly svg: string;
  };
  readonly provenance: GeneratedVisualProvenance;
  readonly labels: readonly GeneratedRegionLabelMirror[];
  readonly canonicalComparison: {
    readonly canonicalShapeCount: number;
    readonly renderedCanonicalShapeCount: number;
    readonly excessRegionCount: number;
    readonly statement: string;
  };
}

/* ------------------------------------------------------------------ */
/* The structural mirror of the lane's VisualFallbackRecord              */
/* ------------------------------------------------------------------ */

/** Why the lane fell back (wire mirror of the fallback reason). */
export type GeneratedVisualFallbackReason =
  | {
      readonly reasonKind: "provider-failure";
      readonly failure: { readonly kind: string; readonly detail: string };
    }
  | {
      readonly reasonKind: "provider-absent";
      readonly detail: string;
    };

/**
 * The canonical fallback record as it arrives over the wire: the state it
 * presents canonically, the typed reason, the content digests of the
 * canonical projections the UI keeps rendering, and the fallback
 * statement. Structural mirror of the package's `VisualFallbackRecord`.
 */
export interface GeneratedVisualFallbackRecord {
  readonly kind: "visual-fallback-record";
  readonly schemaVersion: "visual-fallback/1";
  readonly fallbackId: string;
  readonly visualClass: string;
  readonly state: {
    readonly solutionId: string;
    readonly versionRef: string;
    readonly stateId: string;
    readonly stateIndex: number;
    readonly appliedOperationIds: readonly string[];
    readonly stateContentDigest?: string;
  };
  readonly reason: GeneratedVisualFallbackReason;
  readonly canonicalProjectionDigests: {
    readonly plan: string;
    readonly axonometric: string;
  };
  readonly statement: string;
}

/* ------------------------------------------------------------------ */
/* Shape validation (fail closed on malformed wire data)                */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Minimal fail-closed shape check for a wire artifact (the viewer never
 * REPAIRS malformed data — it refuses to render the pane).
 */
export function isGeneratedVisualArtifact(value: unknown): value is GeneratedVisualArtifact {
  if (!isRecord(value)) return false;
  if (value["kind"] !== "visual-artifact" || value["schemaVersion"] !== "visual-artifact/1") {
    return false;
  }
  if (!isNonEmptyString(value["artifactId"])) return false;
  const content = value["content"];
  if (!isRecord(content) || !isNonEmptyString(content["svg"])) return false;
  const provenance = value["provenance"];
  if (!isRecord(provenance) || !isNonEmptyString(provenance["stateId"])) return false;
  const provider = provenance["provider"];
  return isRecord(provider) && isNonEmptyString(provider["providerId"]);
}

/**
 * Minimal fail-closed shape check for a wire fallback record.
 */
export function isGeneratedVisualFallbackRecord(
  value: unknown,
): value is GeneratedVisualFallbackRecord {
  if (!isRecord(value)) return false;
  if (
    value["kind"] !== "visual-fallback-record" ||
    value["schemaVersion"] !== "visual-fallback/1"
  ) {
    return false;
  }
  if (!isNonEmptyString(value["fallbackId"])) return false;
  const reason = value["reason"];
  return (
    isRecord(reason) &&
    (reason["reasonKind"] === "provider-failure" || reason["reasonKind"] === "provider-absent")
  );
}
