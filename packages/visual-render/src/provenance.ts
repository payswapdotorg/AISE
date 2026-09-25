/**
 * HFX-303 — visual artifact PROVENANCE: construction + verification.
 *
 * The work order's law: "Every visual artifact is linked to a
 * solution/state revision and provider profile." This module makes the
 * linkage MACHINE-CHECKABLE:
 *
 *  - `sealVisualArtifact` derives the artifact — the `artifactId` is the
 *    sha-256 content address over the canonical JSON of the artifact minus
 *    its own id, so ANY holder can re-derive it (the HFX-000 manifest
 *    discipline, applied to the lane's artifact);
 *  - `verifyVisualArtifact` re-derives the digest and REFUSES an artifact
 *    whose provenance does not bind to the exact state revision: a tampered
 *    provenance field (stateId, appliedOperationIds, provider digest, …)
 *    breaks the content address → typed refusal; an artifact presented for
 *    state X whose provenance names state Y → typed binding refusal;
 *  - `sealLaneProvenanceManifest` seals the control plane's PORTABLE
 *    `ProvenanceManifest` (imported from `@aise/provider-registry`, never
 *    modified) over one lane render execution — the HFX-000 provenance
 *    vocabulary reused EXACTLY.
 *
 * PURE DETERMINISTIC COMPUTATION: no network, no clock (the environment
 * fingerprint is DECLARED, never sensed), no randomness.
 */

import {
  sealProvenanceManifest,
  type EnvironmentFingerprint,
  type ProvenanceManifest,
  type ProviderProfile,
} from "@aise/provider-registry";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { createHash } from "node:crypto";
import type {
  CanonicalComparisonSummary,
  CanonicalStateIdentity,
  GeneratedRegionLabel,
  VisualArtifact,
  VisualArtifactContent,
  VisualClass,
  VisualProviderReference,
  VisualRenderFailure,
  VisualStateRequest,
} from "./port";
import {
  descriptorDigestOf,
  isVisualClass,
  isVisualDigest,
  VISUAL_LANE_STATEMENT,
  type VisualProviderDescriptor,
} from "./descriptor";

/* ------------------------------------------------------------------ */
/* Sealing                                                              */
/* ------------------------------------------------------------------ */

/** The input of `sealVisualArtifact` (the artifact minus its own id). */
export interface SealVisualArtifactInput {
  readonly visualClass: VisualClass;
  readonly content: VisualArtifactContent;
  readonly labels: readonly GeneratedRegionLabel[];
  readonly canonicalComparison: CanonicalComparisonSummary;
  readonly state: CanonicalStateIdentity;
  readonly provider: VisualProviderReference;
}

/** sha-256 over the canonical JSON of the artifact's content (minus its id). */
function artifactDigestOf(
  artifact: Omit<VisualArtifact, "artifactId">,
): string {
  const { ...rest } = artifact as Record<string, unknown>;
  delete rest["artifactId"];
  return createHash("sha256")
    .update(canonicalJsonStringify(rest), "utf8")
    .digest("hex");
}

/**
 * Derives the provenance-bound artifact: the caller supplies the rendered
 * content, the label manifest, the comparison summary, the EXACT state
 * identity the artifact renders and the provider reference; the sealer
 * constructs the provenance block (carrying the lane statement verbatim)
 * and content-addresses the whole artifact. PURE: identical inputs seal to
 * the byte-identical artifact.
 */
export function sealVisualArtifact(input: SealVisualArtifactInput): VisualArtifact {
  const preimage: Omit<VisualArtifact, "artifactId"> = {
    kind: "visual-artifact",
    schemaVersion: "visual-artifact/1",
    visualClass: input.visualClass,
    content: input.content,
    provenance: {
      solutionId: input.state.solutionId,
      versionRef: input.state.versionRef,
      stateId: input.state.stateId,
      stateIndex: input.state.stateIndex,
      appliedOperationIds: [...input.state.appliedOperationIds],
      ...(input.state.stateContentDigest === undefined
        ? {}
        : { stateContentDigest: input.state.stateContentDigest }),
      provider: {
        providerId: input.provider.providerId,
        technologyVersion: input.provider.technologyVersion,
        descriptorDigest: input.provider.descriptorDigest,
      },
      laneStatement: VISUAL_LANE_STATEMENT,
    },
    labels: [...input.labels],
    canonicalComparison: input.canonicalComparison,
  };
  return { ...preimage, artifactId: artifactDigestOf(preimage) };
}

/* ------------------------------------------------------------------ */
/* Verification                                                         */
/* ------------------------------------------------------------------ */

export const ARTIFACT_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "type-mismatch",
  "digest-format",
  "vocabulary-violation",
  "label-manifest-inconsistent",
  "artifact-id-mismatch",
  "provenance-binding-mismatch",
] as const;
export type ArtifactValidationFailureKind =
  (typeof ARTIFACT_VALIDATION_FAILURE_KINDS)[number];

export interface ArtifactValidationFailure {
  readonly kind: ArtifactValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type VisualArtifactValidation =
  | { readonly ok: true; readonly artifact: VisualArtifact }
  | { readonly ok: false; readonly failures: readonly ArtifactValidationFailure[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Verifies a visual artifact: shape, vocabularies, the label-manifest
 * consistency, the artifactId re-derivation (the tamper proof) and — when
 * `expectedState` is provided — the provenance BINDING to that exact state
 * revision (stateId, stateIndex, appliedOperationIds, solutionId,
 * versionRef, stateContentDigest). PURE, typed failures, no throws.
 */
export function verifyVisualArtifact(
  input: unknown,
  expectedState?: CanonicalStateIdentity,
): VisualArtifactValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "a visual artifact must be a JSON object" },
      ],
    };
  }

  const failures: ArtifactValidationFailure[] = [];
  const fail = (kind: ArtifactValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  if (input["kind"] !== "visual-artifact") {
    fail("type-mismatch", "kind", "expected the typed seal 'visual-artifact'");
  }
  if (input["schemaVersion"] !== "visual-artifact/1") {
    fail("type-mismatch", "schemaVersion", "expected the schema version 'visual-artifact/1'");
  }
  if (!isVisualDigest(input["artifactId"])) {
    fail("digest-format", "artifactId", "expected the 64-hex artifact content address");
  }
  if (!isVisualClass(input["visualClass"])) {
    fail("vocabulary-violation", "visualClass", "not in the CLOSED visual-class vocabulary");
  }

  const content = input["content"];
  if (isRecord(content)) {
    if (content["mediaType"] !== "image/svg+xml") {
      fail("type-mismatch", "content.mediaType", "expected the media type 'image/svg+xml'");
    }
    if (!isNonEmptyString(content["svg"]) || !content["svg"].startsWith("<svg")) {
      fail("type-mismatch", "content.svg", "expected a non-empty SVG document string");
    }
  } else {
    fail("type-mismatch", "content", "expected the rendered content object");
  }

  const provenance = input["provenance"];
  if (isRecord(provenance)) {
    for (const field of ["solutionId", "versionRef", "stateId"] as const) {
      if (!isNonEmptyString(provenance[field])) {
        fail("type-mismatch", `provenance.${field}`, "expected a non-empty string — an artifact without provenance is not deliverable");
      }
    }
    if (
      typeof provenance["stateIndex"] !== "number" ||
      !Number.isInteger(provenance["stateIndex"]) ||
      provenance["stateIndex"] < 0
    ) {
      fail("type-mismatch", "provenance.stateIndex", "expected a non-negative integer");
    }
    const applied = provenance["appliedOperationIds"];
    if (Array.isArray(applied)) {
      if (applied.length !== provenance["stateIndex"]) {
        fail("label-manifest-inconsistent", "provenance.appliedOperationIds", "expected exactly stateIndex applied operation ids");
      }
      for (const [index, entry] of (applied as unknown[]).entries()) {
        if (!isNonEmptyString(entry)) {
          fail("type-mismatch", `provenance.appliedOperationIds[${index}]`, "expected a non-empty operation id");
        }
      }
    } else {
      fail("type-mismatch", "provenance.appliedOperationIds", "expected an array of applied operation ids");
    }
    if (
      provenance["stateContentDigest"] !== undefined &&
      !isVisualDigest(provenance["stateContentDigest"])
    ) {
      fail("digest-format", "provenance.stateContentDigest", "expected the 64-hex state content digest");
    }
    const provider = provenance["provider"];
    if (isRecord(provider)) {
      for (const field of ["providerId", "technologyVersion"] as const) {
        if (!isNonEmptyString(provider[field])) {
          fail("type-mismatch", `provenance.provider.${field}`, "expected a non-empty string");
        }
      }
      if (!isVisualDigest(provider["descriptorDigest"])) {
        fail(
          "digest-format",
          "provenance.provider.descriptorDigest",
          "expected the provider descriptor's 64-hex content digest — the artifact pins the exact provider profile",
        );
      }
    } else {
      fail("type-mismatch", "provenance.provider", "expected the provider reference object");
    }
    if (provenance["laneStatement"] !== VISUAL_LANE_STATEMENT) {
      fail("vocabulary-violation", "provenance.laneStatement", "the provenance must carry the lane's binding statement VERBATIM");
    }
  } else {
    fail("type-mismatch", "provenance", "expected the provenance object");
  }

  const labels = input["labels"];
  const regionIds = new Set<string>();
  if (Array.isArray(labels)) {
    for (const [index, entry] of (labels as unknown[]).entries()) {
      const labelPath = `labels[${index}]`;
      if (isRecord(entry)) {
        if (!isNonEmptyString(entry["regionId"])) {
          fail("type-mismatch", `${labelPath}.regionId`, "expected a non-empty region id");
        } else if (regionIds.has(entry["regionId"])) {
          fail("label-manifest-inconsistent", `${labelPath}.regionId`, `duplicate region id '${entry["regionId"]}'`);
        } else {
          regionIds.add(entry["regionId"]);
        }
        if (
          entry["regionKind"] !== "hypothesized-finish" &&
          entry["regionKind"] !== "hypothesized-context" &&
          entry["regionKind"] !== "material-study-swatch"
        ) {
          fail("vocabulary-violation", `${labelPath}.regionKind`, "not in the CLOSED region-kind vocabulary");
        }
        if (!isNonEmptyString(entry["label"])) {
          fail("type-mismatch", `${labelPath}.label`, "expected a non-empty label text");
        }
        if (
          entry["basis"] !== "beyond-deterministic-geometry" &&
          entry["basis"] !== "within-deterministic-geometry"
        ) {
          fail("vocabulary-violation", `${labelPath}.basis`, "not in the CLOSED label-basis vocabulary");
        }
        if (!isNonEmptyString(entry["detail"])) {
          fail("type-mismatch", `${labelPath}.detail`, "expected a non-empty detail");
        }
      } else {
        fail("type-mismatch", labelPath, "expected a generated-region label object");
      }
    }
  } else {
    fail("type-mismatch", "labels", "expected the generated/hypothetical label manifest array");
  }

  const comparison = input["canonicalComparison"];
  if (isRecord(comparison)) {
    for (const field of [
      "canonicalShapeCount",
      "renderedCanonicalShapeCount",
      "excessRegionCount",
    ] as const) {
      if (
        typeof comparison[field] !== "number" ||
        !Number.isInteger(comparison[field]) ||
        comparison[field] < 0
      ) {
        fail("type-mismatch", `canonicalComparison.${field}`, "expected a non-negative integer count");
      }
    }
    if (!isNonEmptyString(comparison["statement"])) {
      fail("type-mismatch", "canonicalComparison.statement", "expected a non-empty statement");
    }
    if (
      Array.isArray(labels) &&
      typeof comparison["excessRegionCount"] === "number" &&
      (labels as unknown[]).filter(
        (entry) =>
          isRecord(entry) && entry["basis"] === "beyond-deterministic-geometry",
      ).length !== comparison["excessRegionCount"]
    ) {
      fail(
        "label-manifest-inconsistent",
        "canonicalComparison.excessRegionCount",
        "the excess-region count must equal the manifest's beyond-deterministic-geometry entries — the manifest IS the count source",
      );
    }
  } else {
    fail("type-mismatch", "canonicalComparison", "expected the canonical comparison summary object");
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  const artifact = input as unknown as VisualArtifact;

  // The tamper proof: the artifactId re-derives from the artifact's content.
  const derived = artifactDigestOf(artifact);
  if (artifact.artifactId !== derived) {
    return {
      ok: false,
      failures: [
        {
          kind: "artifact-id-mismatch",
          path: "artifactId",
          detail: `the artifactId does not re-derive from the artifact content (derived ${derived}) — a tampered provenance or content field breaks the content address`,
        },
      ],
    };
  }

  // The binding proof: the provenance names EXACTLY the expected state revision.
  if (expectedState !== undefined) {
    const bindingFailures: ArtifactValidationFailure[] = [];
    const mismatchDetail = (field: string, actual: unknown, expected: unknown): string =>
      `the artifact renders state '${String(actual)}' but was requested for '${String(expected)}' — an artifact that does not bind to the exact state revision is not deliverable`;
    const expectScalar = (field: keyof CanonicalStateIdentity, actual: unknown): void => {
      if (actual !== expectedState[field]) {
        bindingFailures.push({
          kind: "provenance-binding-mismatch",
          path: `provenance.${field}`,
          detail: mismatchDetail(String(field), actual, expectedState[field]),
        });
      }
    };
    expectScalar("solutionId", artifact.provenance.solutionId);
    expectScalar("versionRef", artifact.provenance.versionRef);
    expectScalar("stateId", artifact.provenance.stateId);
    expectScalar("stateIndex", artifact.provenance.stateIndex);
    expectScalar("stateContentDigest", artifact.provenance.stateContentDigest);
    // The applied-operation SEQUENCE binds element-wise in order (arrays
    // never compare by identity).
    const expectedApplied = expectedState.appliedOperationIds;
    const actualApplied = artifact.provenance.appliedOperationIds;
    const appliedEqual =
      actualApplied.length === expectedApplied.length &&
      actualApplied.every((id, index) => id === expectedApplied[index]);
    if (!appliedEqual) {
      bindingFailures.push({
        kind: "provenance-binding-mismatch",
        path: "provenance.appliedOperationIds",
        detail: mismatchDetail(
          "appliedOperationIds",
          actualApplied.join(","),
          expectedApplied.join(","),
        ),
      });
    }
    if (bindingFailures.length > 0) {
      return { ok: false, failures: bindingFailures };
    }
  }

  return { ok: true, artifact };
}

/* ------------------------------------------------------------------ */
/* The control-plane provenance manifest (HFX-000 vocabulary)            */
/* ------------------------------------------------------------------ */

/** The AISE-side consumer surface of the visual lane's manifests. */
export const VISUAL_LANE_CONSUMER_SURFACE = "visual-solution-rendering-lane" as const;

/** The lane's default reproducibility statement. */
export const VISUAL_LANE_REPRODUCIBILITY_STATEMENT =
  "deterministic in-repo visual rendering — the same request through the same provider version renders the byte-identical artifact (no clock, no randomness, no network)" as const;

/** The input of `sealLaneProvenanceManifest`. */
export interface SealLaneProvenanceInput {
  /** The provider's CONTROL-PLANE profile (profiles.ts). */
  readonly profile: ProviderProfile;
  /** The request that was rendered (digested into the manifest). */
  readonly request: VisualStateRequest;
  /** The render outcome (the artifact id or the typed failure). */
  readonly outcome: { readonly ok: true; readonly artifact: VisualArtifact } | { readonly ok: false; readonly failure: VisualRenderFailure };
  /** DECLARED environment fingerprint — never sensed. */
  readonly environment: EnvironmentFingerprint;
  readonly reproducibilityStatement?: string;
}

/** The request digest an execution manifest chains (canonical JSON). */
export function visualRequestDigestOf(request: VisualStateRequest): string {
  return createHash("sha256")
    .update(canonicalJsonStringify(request), "utf8")
    .digest("hex");
}

/** The outcome digest an execution manifest chains (canonical JSON). */
export function visualOutcomeDigestOf(
  outcome: SealLaneProvenanceInput["outcome"],
): string {
  return createHash("sha256")
    .update(
      canonicalJsonStringify(
        outcome.ok
          ? { status: "ok", artifactId: outcome.artifact.artifactId }
          : { status: "failed", failure: outcome.failure },
      ),
      "utf8",
    )
    .digest("hex");
}

/**
 * Seals the control plane's portable `ProvenanceManifest` over ONE lane
 * render execution: the provider profile reference (id + version + profile
 * digest), the request digest, the outcome digest, the DECLARED
 * environment and the AISE visual-lane consumer identity. The HFX-000
 * provenance vocabulary, imported and reused EXACTLY.
 */
export function sealLaneProvenanceManifest(
  input: SealLaneProvenanceInput,
): ProvenanceManifest {
  return sealProvenanceManifest({
    profile: input.profile,
    inputDigests: [visualRequestDigestOf(input.request)],
    normalizedResultDigest: visualOutcomeDigestOf(input.outcome),
    benchmarkRecords: [],
    environment: input.environment,
    consumer: {
      consumer: "AISE",
      surface: VISUAL_LANE_CONSUMER_SURFACE,
    },
    reproducibilityStatement:
      input.reproducibilityStatement ?? VISUAL_LANE_REPRODUCIBILITY_STATEMENT,
  });
}

/** The provider reference block of a descriptor (id + version + digest). */
export function providerReferenceOf(
  descriptor: VisualProviderDescriptor,
): VisualProviderReference {
  return {
    providerId: descriptor.providerId,
    technologyVersion: descriptor.technologyVersion,
    descriptorDigest: descriptorDigestOf(descriptor),
  };
}
