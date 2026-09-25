/**
 * HFX-303 — the provider-neutral VISUAL-RENDERING PORT.
 *
 * The bounded lane where visual-generation providers (image/3D generation
 * technologies such as Apple SHARP and TRELLIS.2 — future occupants) render
 * SOLUTION STATES for inspection/presentation. The port is the deliverable:
 * real external models plug in behind exactly this interface, under the
 * lane's five binding laws (docs/productization-layer-hardening-work-orders.md
 * §HFX-303):
 *
 *  1. GENERATED VISUALS ARE PRESENTATION, NEVER AUTHORITY. The REQUEST
 *     carries ONLY presentation inputs — the canonical state's IDENTITY plus
 *     its ALREADY-COMPUTED canonical projections (read-only snapshots). No
 *     engine handle, no state object, no write path: a provider CANNOT
 *     change quantities, validation or canonical Solution Graph state through
 *     this interface. Non-interference is structural AND proven by tests.
 *  2. EVERY ARTIFACT CARRIES PROVENANCE: the exact state revision (state id,
 *     index, applied operation ids, content digest), the owning graph's
 *     identity, and the provider profile (id, version, descriptor digest).
 *  3. SWAP IS PRESENTATION-ONLY: replacing the provider changes the artifact
 *     bytes only — the swap drill's canonical byte-comparisons prove it.
 *  4. FALLBACK IS HONEST: a failed or missing generation falls back to the
 *     canonical deterministic 2D/3D views (see fallback.ts) — never a gap.
 *  5. GENERATED DETAILS ARE LABELED: the artifact's label manifest declares
 *     which visual regions EXCEED deterministic geometry and how they are
 *     labeled; the UI seam renders the labels.
 *
 * Failures come from `@aise/provider-registry`'s CLOSED vocabulary (HFX-000,
 * imported, never modified) — a visual provider cannot invent failure kinds.
 *
 * PURE DETERMINISTIC COMPUTATION: no network, no clock, no randomness, no
 * browser APIs, no I/O. Identical requests through the same provider render
 * byte-identical artifacts.
 */

import type { FailureKind } from "@aise/provider-registry";
import type {
  NumericClaimPolicy,
  VisualClass,
  VisualProviderDescriptor,
} from "./descriptor";
import {
  isVisualClass,
  isVisualDigest,
  VISUAL_CLASSES,
  VISUAL_DIGEST_PATTERN,
  VISUAL_LANE_STATEMENT,
} from "./descriptor";
import { verifyVisualArtifact } from "./provenance";

export const VISUAL_ARTIFACT_KIND = "visual-artifact" as const;
export const VISUAL_ARTIFACT_SCHEMA_VERSION = "visual-artifact/1" as const;
export const VISUAL_STATE_REQUEST_KIND = "visual-state-request" as const;

/* ------------------------------------------------------------------ */
/* The request (presentation inputs ONLY)                               */
/* ------------------------------------------------------------------ */

/**
 * The canonical state identity a visual request renders — carried VERBATIM
 * from the canonical domain, never re-derived here. Binds the artifact to
 * the EXACT state revision:
 *
 *  - `solutionId` — the owning graph's id (a solution id or a scenario id);
 *  - `versionRef` — the pinned version identity the state branches from
 *    (a solution version number or a baseline version id);
 *  - `stateId` — the content-derived stable state id (the same id that
 *    feeds the synchronized canonical 2D/3D/BOQ views);
 *  - `stateIndex` — the layer number (0 = baseline overlay);
 *  - `appliedOperationIds` — the ordered operations 1..stateIndex;
 *  - `stateContentDigest` — optional 64-hex content pin over the state's
 *    materialized content (present for engine-materialized states).
 */
export interface CanonicalStateIdentity {
  readonly solutionId: string;
  readonly versionRef: string;
  readonly stateId: string;
  readonly stateIndex: number;
  readonly appliedOperationIds: readonly string[];
  readonly stateContentDigest?: string;
}

/** One shape of a caller-computed canonical projection snapshot. */
export interface CanonicalProjectionShape {
  /** The stable node/operation id the shape projects (the pane join key). */
  readonly nodeId: string;
  /** The geometry record id the shape was projected from, when known. */
  readonly geometryId?: string;
  /** Projected points, verbatim polygon order (screen units). */
  readonly points: readonly (readonly [number, number])[];
  /**
   * The shape's origin vocabulary value, carried VERBATIM from the
   * caller's canonical domain (e.g. "observed" / "proposed-added" /
   * "baseline" / "scenario") — presentation hook, never interpreted here.
   */
  readonly origin?: string;
}

/**
 * A read-only snapshot of ONE already-computed canonical deterministic
 * projection (the caller's projection seam produced it — this lane never
 * derives geometry). `omissions` carry the caller's honest omission
 * reason codes verbatim (the no-second-vocabulary discipline).
 */
export interface CanonicalProjectionSnapshot {
  readonly mode: "plan" | "axonometric";
  readonly shapes: readonly CanonicalProjectionShape[];
  readonly omissions: readonly { readonly nodeId: string; readonly reason: string }[];
}

/**
 * The provider-neutral request: WHICH visual class to render, the canonical
 * state's IDENTITY (never its mutable objects), and the state's
 * ALREADY-COMPUTED canonical projections for reference/drawing. This is
 * everything a visual provider may see — by construction it cannot reach
 * the Solution Graph, the engine, the quantities or the validation state.
 */
export interface VisualStateRequest {
  readonly kind: typeof VISUAL_STATE_REQUEST_KIND;
  readonly visualClass: VisualClass;
  readonly state: CanonicalStateIdentity;
  readonly canonicalProjections: {
    readonly plan: CanonicalProjectionSnapshot;
    readonly axonometric: CanonicalProjectionSnapshot;
  };
}

/* ------------------------------------------------------------------ */
/* The artifact                                                          */
/* ------------------------------------------------------------------ */

/**
 * The generated/hypothetical label manifest: which visual regions EXCEED
 * deterministic geometry and how they are labeled. The UI seam renders
 * every entry; the always-present banner ("GENERATED — HYPOTHETICAL
 * VISUAL, NOT ENGINEERING GEOMETRY") is the pane's law, the per-region
 * labels are this manifest's data.
 */
export interface GeneratedRegionLabel {
  /** Stable region id — the join key to the SVG's data-region-id. */
  readonly regionId: string;
  /** The closed region-kind vocabulary of illustrative additions. */
  readonly regionKind:
    | "hypothesized-finish"
    | "hypothesized-context"
    | "material-study-swatch";
  /** The label text the UI renders for this region. */
  readonly label: string;
  /**
   * `beyond-deterministic-geometry` — the region exceeds what the
   * canonical deterministic projections draw; `within-deterministic-geometry`
   * — a stylistic treatment of canonically drawn content.
   */
  readonly basis: "beyond-deterministic-geometry" | "within-deterministic-geometry";
  readonly detail: string;
}

/** The provider identity block every artifact's provenance carries. */
export interface VisualProviderReference {
  readonly providerId: string;
  readonly technologyVersion: string;
  /** The 64-hex content digest of the provider's descriptor. */
  readonly descriptorDigest: string;
}

/**
 * The provenance of one visual artifact: the EXACT state revision it
 * renders plus the provider profile (id, version, descriptor digest) and
 * the lane statement. An artifact without provenance is not deliverable
 * (work-order law; enforced by verifyVisualArtifact).
 */
export interface VisualProvenance {
  readonly solutionId: string;
  readonly versionRef: string;
  readonly stateId: string;
  readonly stateIndex: number;
  readonly appliedOperationIds: readonly string[];
  readonly stateContentDigest?: string;
  readonly provider: VisualProviderReference;
  readonly laneStatement: string;
}

/**
 * The artifact's comparison against the canonical deterministic geometry
 * (the work order's "compare generated appearance against canonical
 * deterministic geometry where available") — counts only, NEVER numeric
 * engineering claims.
 */
export interface CanonicalComparisonSummary {
  /** How many canonical shapes the request carried. */
  readonly canonicalShapeCount: number;
  /** How many canonical shapes the visual actually drew. */
  readonly renderedCanonicalShapeCount: number;
  /** How many labeled regions exceed deterministic geometry. */
  readonly excessRegionCount: number;
  readonly statement: string;
}

/** The rendered content of one visual artifact (deterministic SVG string). */
export interface VisualArtifactContent {
  readonly mediaType: "image/svg+xml";
  readonly svg: string;
}

/**
 * A rendered visual artifact: the SVG content, the provenance binding the
 * exact state revision + provider profile, the generated/hypothetical label
 * manifest, and the canonical comparison summary. `artifactId` is the
 * sha-256 content address over the canonical JSON of the artifact minus its
 * own id (provenance.ts seals and verifies it).
 */
export interface VisualArtifact {
  readonly kind: typeof VISUAL_ARTIFACT_KIND;
  readonly schemaVersion: typeof VISUAL_ARTIFACT_SCHEMA_VERSION;
  readonly artifactId: string;
  readonly visualClass: VisualClass;
  readonly content: VisualArtifactContent;
  readonly provenance: VisualProvenance;
  readonly labels: readonly GeneratedRegionLabel[];
  readonly canonicalComparison: CanonicalComparisonSummary;
}

/* ------------------------------------------------------------------ */
/* Typed failures + the provider surface                                 */
/* ------------------------------------------------------------------ */

/**
 * A typed visual-render failure — the kind comes from the control plane's
 * CLOSED vocabulary (provider-registry failures.ts), the detail is the
 * provider's honest statement. Never a throw, never a silent gap.
 */
export interface VisualRenderFailure {
  readonly kind: FailureKind;
  readonly detail: string;
}

/** The discriminated outcome of one render. */
export type VisualRenderOutcome =
  | { readonly ok: true; readonly artifact: VisualArtifact }
  | { readonly ok: false; readonly failure: VisualRenderFailure };

/**
 * The provider-neutral port every visual-generation provider implements.
 * `renderVisual` is PURE over the request: it may not mutate the request
 * (the governed lane entry deep-freezes it), may not reach anything beyond
 * the request, and answers either a provenance-bound artifact or a typed
 * failure from the closed vocabulary.
 */
export interface VisualRenderProvider {
  readonly descriptor: VisualProviderDescriptor;
  renderVisual(state: VisualStateRequest): VisualRenderOutcome;
}

/* ------------------------------------------------------------------ */
/* Request validation (pure, typed failures)                             */
/* ------------------------------------------------------------------ */

export const REQUEST_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "type-mismatch",
  "value-out-of-range",
  "vocabulary-violation",
  "digest-format",
] as const;
export type RequestValidationFailureKind =
  (typeof REQUEST_VALIDATION_FAILURE_KINDS)[number];

export interface RequestValidationFailure {
  readonly kind: RequestValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type VisualStateRequestValidation =
  | { readonly ok: true; readonly request: VisualStateRequest }
  | { readonly ok: false; readonly failures: readonly RequestValidationFailure[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStateIdentity(
  value: unknown,
  path: string,
  failures: RequestValidationFailure[],
): void {
  const fail = (
    kind: RequestValidationFailureKind,
    sub: string,
    detail: string,
  ): void => {
    failures.push({ kind, path: `${path}.${sub}`, detail });
  };
  if (!isRecord(value)) {
    failures.push({ kind: "type-mismatch", path, detail: "expected the canonical state identity object" });
    return;
  }
  for (const field of ["solutionId", "versionRef", "stateId"] as const) {
    if (!isNonEmptyString(value[field])) {
      fail("type-mismatch", field, "expected a non-empty string");
    }
  }
  if (
    typeof value["stateIndex"] !== "number" ||
    !Number.isInteger(value["stateIndex"]) ||
    value["stateIndex"] < 0
  ) {
    fail("value-out-of-range", "stateIndex", "expected a non-negative integer layer number");
  }
  const applied = value["appliedOperationIds"];
  if (Array.isArray(applied)) {
    if (applied.length !== value["stateIndex"]) {
      fail(
        "value-out-of-range",
        "appliedOperationIds",
        `expected exactly stateIndex (${String(value["stateIndex"])}) applied operation ids (the layer's operation identity)`,
      );
    }
    for (const [index, entry] of (applied as unknown[]).entries()) {
      if (!isNonEmptyString(entry)) {
        fail("type-mismatch", `appliedOperationIds[${index}]`, "expected a non-empty operation id");
      }
    }
  } else {
    fail("type-mismatch", "appliedOperationIds", "expected an array of applied operation ids");
  }
  const digest = value["stateContentDigest"];
  if (digest !== undefined && !isVisualDigest(digest)) {
    fail("digest-format", "stateContentDigest", "expected the 64-hex state content digest");
  }
}

function validateProjectionSnapshot(
  value: unknown,
  path: string,
  mode: "plan" | "axonometric",
  failures: RequestValidationFailure[],
): void {
  const fail = (
    kind: RequestValidationFailureKind,
    sub: string,
    detail: string,
  ): void => {
    failures.push({ kind, path: `${path}.${sub}`, detail });
  };
  if (!isRecord(value)) {
    failures.push({
      kind: "type-mismatch",
      path,
      detail: `expected the ${mode} canonical projection snapshot object`,
    });
    return;
  }
  if (value["mode"] !== mode) {
    fail("type-mismatch", "mode", `expected the projection mode '${mode}'`);
  }
  const shapes = value["shapes"];
  if (Array.isArray(shapes)) {
    for (const [index, entry] of (shapes as unknown[]).entries()) {
      const shapePath = `${path}.shapes[${index}]`;
      if (!isRecord(entry)) {
        failures.push({ kind: "type-mismatch", path: shapePath, detail: "expected a projected shape object" });
        continue;
      }
      if (!isNonEmptyString(entry["nodeId"])) {
        failures.push({
          kind: "type-mismatch",
          path: `${shapePath}.nodeId`,
          detail: "expected a non-empty stable node id",
        });
      }
      const points = entry["points"];
      if (
        !Array.isArray(points) ||
        points.length < 2 ||
        !points.every(
          (point) =>
            Array.isArray(point) &&
            point.length === 2 &&
            typeof point[0] === "number" &&
            Number.isFinite(point[0]) &&
            typeof point[1] === "number" &&
            Number.isFinite(point[1]),
        )
      ) {
        failures.push({
          kind: "type-mismatch",
          path: `${shapePath}.points`,
          detail: "expected ≥2 finite [x, y] points (a closed contour)",
        });
      }
    }
  } else {
    fail("type-mismatch", "shapes", "expected an array of projected shapes");
  }
  const omissions = value["omissions"];
  if (Array.isArray(omissions)) {
    for (const [index, entry] of (omissions as unknown[]).entries()) {
      if (
        !isRecord(entry) ||
        !isNonEmptyString(entry["nodeId"]) ||
        !isNonEmptyString(entry["reason"])
      ) {
        failures.push({
          kind: "type-mismatch",
          path: `${path}.omissions[${index}]`,
          detail: "expected { nodeId, reason } honest omission entries",
        });
      }
    }
  } else {
    fail("type-mismatch", "omissions", "expected an array of honest omission entries");
  }
}

/**
 * Validates an unknown payload as a `VisualStateRequest`. PURE, typed
 * failures, no throws — the lane's request gate.
 */
export function validateVisualStateRequest(input: unknown): VisualStateRequestValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "a visual state request must be a JSON object" },
      ],
    };
  }
  const failures: RequestValidationFailure[] = [];
  if (input["kind"] !== VISUAL_STATE_REQUEST_KIND) {
    failures.push({
      kind: "type-mismatch",
      path: "kind",
      detail: `expected the typed seal '${VISUAL_STATE_REQUEST_KIND}'`,
    });
  }
  if (!isVisualClass(input["visualClass"])) {
    failures.push({
      kind: "vocabulary-violation",
      path: "visualClass",
      detail: `'${String(input["visualClass"])}' is not in the CLOSED visual-class vocabulary`,
    });
  }
  validateStateIdentity(input["state"], "state", failures);
  const projections = input["canonicalProjections"];
  if (isRecord(projections)) {
    validateProjectionSnapshot(projections["plan"], "canonicalProjections.plan", "plan", failures);
    validateProjectionSnapshot(
      projections["axonometric"],
      "canonicalProjections.axonometric",
      "axonometric",
      failures,
    );
  } else {
    failures.push({
      kind: "type-mismatch",
      path: "canonicalProjections",
      detail: "expected the canonical projection snapshots object",
    });
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, request: input as unknown as VisualStateRequest };
}

/* ------------------------------------------------------------------ */
/* The governed lane entry                                               */
/* ------------------------------------------------------------------ */

/** Deep-freeze an object graph (mutation attempts throw — fail closed). */
export function deepFreezeVisual<T>(value: T): T {
  if (Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreezeVisual(entry);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreezeVisual((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}

/**
 * The GOVERNED render entry — the only way callers should invoke a visual
 * provider. Enforces the lane laws BY CONSTRUCTION:
 *
 *  1. validates the request shape (typed `contract-mismatch` refusal);
 *  2. DEEP-FREEZES the request — a provider that mutates its input throws,
 *     which the lane converts into a typed `contract-mismatch` failure
 *     (fail closed; the caller's canonical projections stay untouched);
 *  3. verifies the returned artifact's own digest (tampered content is
 *     refused — `artifact-id-mismatch`);
 *  4. verifies the artifact's provenance BINDS to the request's exact
 *     state revision (a rogue artifact bound to another state is refused
 *     with `provenance-binding-mismatch`).
 *
 * Everything a provider does beyond drawing — every mutation attempt,
 * every unbound or tampered artifact — is a typed refusal, never a
 * crash, never a silent gap.
 */
export function renderThroughLane(
  provider: VisualRenderProvider,
  request: VisualStateRequest,
): VisualRenderOutcome {
  const validation = validateVisualStateRequest(request);
  if (!validation.ok) {
    return {
      ok: false,
      failure: {
        kind: "contract-mismatch",
        detail: `the visual state request violates the port contract: ${validation.failures
          .map((failure) => `${failure.path} (${failure.kind}): ${failure.detail}`)
          .join("; ")}`,
      },
    };
  }
  const frozen = deepFreezeVisual(structuredClone(validation.request));
  let raw: VisualRenderOutcome;
  try {
    raw = provider.renderVisual(frozen);
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "contract-mismatch",
        detail: `the visual provider threw instead of answering (frozen-input mutation attempt or internal defect): ${
          error instanceof Error ? error.message : String(error)
        } — refused fail-closed, nothing was rendered and nothing was mutated`,
      },
    };
  }
  if (!raw.ok) {
    return raw;
  }
  const verified = verifyVisualArtifact(raw.artifact, validation.request.state);
  if (!verified.ok) {
    return {
      ok: false,
      failure: {
        kind: "contract-mismatch",
        detail: `the provider's artifact failed lane verification: ${verified.failures
          .map((failure) => `${failure.path} (${failure.kind}): ${failure.detail}`)
          .join("; ")}`,
      },
    };
  }
  return { ok: true, artifact: verified.artifact };
}

/**
 * Validates a provider descriptor against the request's visual class:
 * does this provider DECLARE the capability to render this class?
 * (The provider's own honest refusal is the answer otherwise.)
 */
export function providerSupportsClass(
  descriptor: VisualProviderDescriptor,
  visualClass: VisualClass,
): boolean {
  return descriptor.capabilities.includes(visualClass);
}

export const VISUAL_PORT_STATEMENT =
  "the visual-rendering provider port: presentation only — the request carries identity and canonical projections, the artifact carries provenance, and nothing a provider does can reach canonical engineering semantics" as const;

export type { NumericClaimPolicy, VisualClass, VisualProviderDescriptor };
export { VISUAL_CLASSES, VISUAL_LANE_STATEMENT, isVisualDigest, VISUAL_DIGEST_PATTERN };
