/**
 * HFX-000 — the portable provenance manifest.
 *
 * The `ProvenanceManifest` is the portable provenance chain of ONE provider
 * evaluation lifecycle step: the profile reference (providerId +
 * technologyVersion + the profile digest), the input digests that were
 * executed, the normalized result digest, the benchmark records the
 * evaluation produced, the environment fingerprint (DECLARED, never
 * sensed — the control plane reads no runtime environment) and the
 * AISE-side consumer identity.
 *
 * PORTABLE = the manifest is SELF-CONTAINED JSON, VERIFIABLE BY DIGEST:
 *
 *   - `manifestId` is the sha-256 content address over the canonical JSON
 *     of the whole manifest minus the `manifestId` field itself, so any
 *     holder can re-derive it (`verifyProvenanceManifest`);
 *   - every referenced artifact is pinned by digest (profileDigest,
 *     inputDigests, normalizedResultDigest, benchmarkRecordDigests), so a
 *     holder of the artifacts can verify each link of the chain without
 *     trusting the manifest author;
 *   - the manifest references NOTHING outside itself — no store handles,
 *     no environment senses, no clock stamps.
 *
 * Per ACR-006 ("provider-neutral reconstruction and portable provenance")
 * and the architecture lock ("Provider identity/version/configuration/
 * input digests/diagnostics/limitations belong in provenance"), this is
 * where provider identity lives — never in canonical domain objects.
 */

import { isDigest, sha256Canonical } from "./digest";
import { profileDigestOf, type ProviderProfile } from "./profile";
import { benchmarkRecordDigestOf, type BenchmarkRecord } from "./benchmark";

export const PROVENANCE_MANIFEST_KIND = "provider-provenance-manifest" as const;
export const PROVENANCE_MANIFEST_SCHEMA_VERSION = "provider-provenance/1" as const;

/**
 * The environment fingerprint — DECLARED, NOT SENSED. The control plane
 * never reads the runtime environment (that would break determinism);
 * callers declare the environment the evaluation ran in.
 */
export interface EnvironmentFingerprint {
  readonly declaredRuntime: string;
  readonly declaredPlatform: string;
  readonly codeVersion: string;
  readonly statement: string;
}

/** The AISE-side consumer identity the manifest is sealed for. */
export interface ConsumerIdentity {
  readonly consumer: "AISE";
  readonly surface: string;
}

/** The profile reference carried by the manifest (identity + digest). */
export interface ProfileReference {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly profileDigest: string;
}

/** The portable provenance manifest (self-contained, digest-verifiable). */
export interface ProvenanceManifest {
  readonly kind: typeof PROVENANCE_MANIFEST_KIND;
  readonly schemaVersion: typeof PROVENANCE_MANIFEST_SCHEMA_VERSION;
  readonly manifestId: string;
  readonly profileReference: ProfileReference;
  readonly inputDigests: readonly string[];
  readonly normalizedResultDigest: string;
  readonly benchmarkRecordReferences: readonly string[];
  readonly benchmarkRecordDigests: readonly string[];
  readonly environmentFingerprint: EnvironmentFingerprint;
  readonly consumerIdentity: ConsumerIdentity;
  readonly reproducibilityStatement: string;
}

/* ------------------------------------------------------------------ */
/* Sealing                                                             */
/* ------------------------------------------------------------------ */

export const PROVENANCE_CONSUMER_AISE = "AISE" as const;
export const CONTROL_PLANE_SURFACE = "provider-evaluation-control-plane" as const;

/** The input of `sealProvenanceManifest` (the artifacts to chain). */
export interface SealProvenanceInput {
  readonly profile: ProviderProfile;
  readonly inputDigests: readonly string[];
  readonly normalizedResultDigest: string;
  readonly benchmarkRecords: readonly BenchmarkRecord[];
  readonly environment: EnvironmentFingerprint;
  readonly consumer?: ConsumerIdentity;
  readonly reproducibilityStatement: string;
}

/**
 * Seals the portable provenance manifest over the evaluation artifacts.
 * PURE and deterministic: the same artifacts always seal to the byte-
 * identical manifest (same `manifestId`). The manifest is derived — never
 * hand-authored.
 */
export function sealProvenanceManifest(input: SealProvenanceInput): ProvenanceManifest {
  // The preimage NEVER carries a manifestId field — the content address is
  // derived over the manifest minus its own id (see manifestDigestOf).
  const preimage: Omit<ProvenanceManifest, "manifestId"> = {
    kind: PROVENANCE_MANIFEST_KIND,
    schemaVersion: PROVENANCE_MANIFEST_SCHEMA_VERSION,
    profileReference: {
      providerId: input.profile.providerId,
      technologyVersion: input.profile.technologyVersion,
      profileDigest: manifestProfileDigestOf(input.profile),
    },
    inputDigests: [...input.inputDigests],
    normalizedResultDigest: input.normalizedResultDigest,
    benchmarkRecordReferences: input.benchmarkRecords.map((record) => record.recordId),
    benchmarkRecordDigests: input.benchmarkRecords.map((record) =>
      benchmarkRecordDigestOf(record),
    ),
    environmentFingerprint: input.environment,
    consumerIdentity: input.consumer ?? {
      consumer: PROVENANCE_CONSUMER_AISE,
      surface: CONTROL_PLANE_SURFACE,
    },
    reproducibilityStatement: input.reproducibilityStatement,
  };
  return { ...preimage, manifestId: manifestDigestOf(preimage) };
}

/* ------------------------------------------------------------------ */
/* Identity + verification                                             */
/* ------------------------------------------------------------------ */

/** The profile digest used inside manifests (delegates to profile.ts). */
function manifestProfileDigestOf(profile: ProviderProfile): string {
  return profileDigestOf(profile);
}

/**
 * The digest preimage: the manifest minus its own `manifestId` (every other
 * field is part of the artifact's content). The STRIP is structural —
 * passing a full manifest strips the field at runtime, so re-derivation
 * always hashes exactly the manifest's content.
 */
export function manifestDigestPreimage(
  manifest: Omit<ProvenanceManifest, "manifestId">,
): Record<string, unknown> {
  const { ...rest } = manifest as Record<string, unknown>;
  delete rest["manifestId"];
  return rest;
}

/** Derives the manifest content address (sha-256 over canonical JSON). */
export function manifestDigestOf(manifest: Omit<ProvenanceManifest, "manifestId">): string {
  return sha256Canonical(manifestDigestPreimage(manifest));
}

export const PROVENANCE_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "type-mismatch",
  "digest-format",
  "empty-list",
  "manifest-id-mismatch",
  "record-reference-mismatch",
] as const;
export type ProvenanceValidationFailureKind = (typeof PROVENANCE_VALIDATION_FAILURE_KINDS)[number];

export interface ProvenanceValidationFailure {
  readonly kind: ProvenanceValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type ProvenanceManifestValidation =
  | { readonly ok: true; readonly manifest: ProvenanceManifest }
  | { readonly ok: false; readonly failures: readonly ProvenanceValidationFailure[] };

/**
 * Verifies a portable provenance manifest: shape, digest formats, the
 * reference/digest pairing and — the portability proof — that the
 * `manifestId` re-derives from the manifest's own content. PURE, typed
 * failures, no throws.
 */
export function verifyProvenanceManifest(input: unknown): ProvenanceManifestValidation {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;

  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "a provenance manifest must be a JSON object" },
      ],
    };
  }

  const failures: ProvenanceValidationFailure[] = [];
  const fail = (kind: ProvenanceValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  if (input["kind"] !== PROVENANCE_MANIFEST_KIND) {
    fail("type-mismatch", "kind", `expected the typed seal '${PROVENANCE_MANIFEST_KIND}'`);
  }
  if (input["schemaVersion"] !== PROVENANCE_MANIFEST_SCHEMA_VERSION) {
    fail(
      "type-mismatch",
      "schemaVersion",
      `expected the schema version '${PROVENANCE_MANIFEST_SCHEMA_VERSION}'`,
    );
  }
  if (!isDigest(input["manifestId"])) {
    fail("digest-format", "manifestId", "expected the 64-hex manifest content address");
  }

  const profileReference = input["profileReference"];
  if (isRecord(profileReference)) {
    for (const field of ["providerId", "technologyVersion"] as const) {
      if (!isNonEmptyString(profileReference[field]) || (profileReference[field] as string).length > 256) {
        fail("type-mismatch", `profileReference.${field}`, "expected a non-empty string (max 256)");
      }
    }
    if (!isDigest(profileReference["profileDigest"])) {
      fail(
        "digest-format",
        "profileReference.profileDigest",
        "expected the profile's 64-hex content digest — the manifest pins the exact evaluated profile",
      );
    }
  } else {
    fail("type-mismatch", "profileReference", "expected the profile reference object");
  }

  const inputDigests = input["inputDigests"];
  if (Array.isArray(inputDigests)) {
    if (inputDigests.length === 0) {
      fail("empty-list", "inputDigests", "at least one executed input digest is required");
    }
    for (const [index, entry] of (inputDigests as unknown[]).entries()) {
      if (!isDigest(entry)) {
        fail("digest-format", `inputDigests[${index}]`, "expected a 64-hex input digest");
      }
    }
  } else {
    fail("type-mismatch", "inputDigests", "expected an array of input digests");
  }

  if (!isDigest(input["normalizedResultDigest"])) {
    fail(
      "digest-format",
      "normalizedResultDigest",
      "expected the 64-hex normalized result digest",
    );
  }

  const references = input["benchmarkRecordReferences"];
  const digests = input["benchmarkRecordDigests"];
  if (Array.isArray(references) && Array.isArray(digests)) {
    if (references.length !== digests.length) {
      fail(
        "record-reference-mismatch",
        "benchmarkRecordDigests",
        `the references (${references.length}) and digests (${digests.length}) must pair 1:1`,
      );
    }
    for (const [index, entry] of (references as unknown[]).entries()) {
      if (!isNonEmptyString(entry)) {
        fail("type-mismatch", `benchmarkRecordReferences[${index}]`, "expected a record id string");
      }
    }
    for (const [index, entry] of (digests as unknown[]).entries()) {
      if (!isDigest(entry)) {
        fail("digest-format", `benchmarkRecordDigests[${index}]`, "expected a 64-hex record digest");
      }
    }
  } else {
    fail(
      "type-mismatch",
      "benchmarkRecordReferences",
      "expected parallel arrays of benchmark record references and digests",
    );
  }

  const environment = input["environmentFingerprint"];
  if (isRecord(environment)) {
    for (const field of ["declaredRuntime", "declaredPlatform", "codeVersion", "statement"] as const) {
      if (!isNonEmptyString(environment[field])) {
        fail(
          "type-mismatch",
          `environmentFingerprint.${field}`,
          "the environment fingerprint is DECLARED, not sensed — the field must be a non-empty string",
        );
      }
    }
  } else {
    fail("type-mismatch", "environmentFingerprint", "expected the declared environment fingerprint");
  }

  const consumer = input["consumerIdentity"];
  if (isRecord(consumer)) {
    if (consumer["consumer"] !== PROVENANCE_CONSUMER_AISE) {
      fail(
        "type-mismatch",
        "consumerIdentity.consumer",
        `expected the AISE-side consumer identity ('${PROVENANCE_CONSUMER_AISE}')`,
      );
    }
    if (!isNonEmptyString(consumer["surface"])) {
      fail("type-mismatch", "consumerIdentity.surface", "expected a non-empty consumer surface");
    }
  } else {
    fail("type-mismatch", "consumerIdentity", "expected the consumer identity object");
  }

  if (!isNonEmptyString(input["reproducibilityStatement"])) {
    fail(
      "type-mismatch",
      "reproducibilityStatement",
      "expected a non-empty deterministic reproducibility statement",
    );
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  // The portability proof: the manifestId re-derives from the content.
  const manifest = input as unknown as ProvenanceManifest;
  const derived = manifestDigestOf(manifest);
  if (manifest.manifestId !== derived) {
    return {
      ok: false,
      failures: [
        {
          kind: "manifest-id-mismatch",
          path: "manifestId",
          detail: `the manifestId does not re-derive from the manifest content (derived ${derived}) — a portable manifest is verifiable by digest`,
        },
      ],
    };
  }

  return { ok: true, manifest };
}
