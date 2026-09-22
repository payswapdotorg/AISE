/**
 * HFX-000 — the portable provenance manifest tests.
 *
 * Proves: sealing is deterministic, the manifest is SELF-CONTAINED and
 * VERIFIABLE BY DIGEST (the manifestId re-derives from the content),
 * referenced artifacts are pinned by digest, tampering is detected, and
 * the typed failure paths (never a throw).
 */

import { describe, expect, test } from "bun:test";
import {
  manifestDigestOf,
  sealProvenanceManifest,
  verifyProvenanceManifest,
} from "./provenance";
import type { ProvenanceManifest } from "./provenance";
import { providerResultDigestOf, inputDigestOf, normalizeResult } from "./io";
import { deriveBenchmarkRecordId } from "./benchmark";
import {
  referenceEnvironment,
  referenceInput,
  referenceProviderProfileV1,
  referenceProviderProfileV2,
  runReferenceBenchmark,
  executeReferenceProvider,
} from "./testkit";

function sealedV1(): ProvenanceManifest {
  const profile = referenceProviderProfileV1();
  const input = referenceInput();
  const inputDigest = inputDigestOf(input);
  const normalized = normalizeResult(executeReferenceProvider(profile, input), profile, {
    inputDigest,
  });
  if (!normalized.ok) {
    throw new Error("v1 normalization failed");
  }
  const body = runReferenceBenchmark(profile);
  const record = { ...body, recordId: deriveBenchmarkRecordId(body) };
  return sealProvenanceManifest({
    profile,
    inputDigests: [inputDigest],
    normalizedResultDigest: providerResultDigestOf(normalized.result),
    benchmarkRecords: [record],
    environment: referenceEnvironment(),
    reproducibilityStatement: "v1 test world: fully determined by the sealed artifacts",
  });
}

describe("sealing (deterministic)", () => {
  test("identical artifacts seal to the byte-identical manifest", () => {
    expect(sealedV1()).toEqual(sealedV1());
    expect(sealedV1().manifestId).toBe(sealedV1().manifestId);
  });

  test("the manifest pins the profile reference, input digests, result digest and record digests", () => {
    const manifest = sealedV1();
    expect(manifest.profileReference.providerId).toBe("fixture-depth-provider");
    expect(manifest.profileReference.technologyVersion).toBe("1.0.0-fixture-v1");
    expect(manifest.profileReference.profileDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.inputDigests).toHaveLength(1);
    expect(manifest.normalizedResultDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.benchmarkRecordReferences).toHaveLength(1);
    expect(manifest.benchmarkRecordDigests).toHaveLength(1);
    expect(manifest.consumerIdentity).toEqual({
      consumer: "AISE",
      surface: "provider-evaluation-control-plane",
    });
    expect(manifest.environmentFingerprint.statement).toContain("declared, not sensed");
  });

  test("v1 and v2 seal to different manifests (profile + result + record differ)", () => {
    const profileV2 = referenceProviderProfileV2();
    const input = referenceInput();
    const inputDigest = inputDigestOf(input);
    const normalized = normalizeResult(executeReferenceProvider(profileV2, input), profileV2, {
      inputDigest,
    });
    if (!normalized.ok) {
      throw new Error("v2 normalization failed");
    }
    const body = runReferenceBenchmark(profileV2);
    const record = { ...body, recordId: deriveBenchmarkRecordId(body) };
    const v2 = sealProvenanceManifest({
      profile: profileV2,
      inputDigests: [inputDigest],
      normalizedResultDigest: providerResultDigestOf(normalized.result),
      benchmarkRecords: [record],
      environment: referenceEnvironment(),
      reproducibilityStatement: "v2 test world: fully determined by the sealed artifacts",
    });
    expect(v2.manifestId).not.toBe(sealedV1().manifestId);
  });
});

describe("verification (portable = self-contained, verifiable by digest)", () => {
  test("a sealed manifest verifies: the manifestId re-derives from the content", () => {
    const verification = verifyProvenanceManifest(sealedV1());
    expect(verification.ok).toBe(true);
  });

  test("the manifest digest re-derivation is explicit and structural", () => {
    const manifest = sealedV1();
    const { manifestId, ...content } = manifest;
    expect(manifestDigestOf(content)).toBe(manifestId);
  });

  test("a tampered statement breaks the manifestId (tamper detection)", () => {
    const manifest = sealedV1();
    const tampered = {
      ...manifest,
      reproducibilityStatement: "quietly rewritten after sealing",
    };
    const verification = verifyProvenanceManifest(tampered);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.failures[0]?.kind).toBe("manifest-id-mismatch");
    }
  });

  test("a tampered referenced digest breaks verification", () => {
    const manifest = sealedV1();
    const tampered = {
      ...manifest,
      normalizedResultDigest: "f".repeat(64),
    };
    const verification = verifyProvenanceManifest(tampered);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.failures[0]?.kind).toBe("manifest-id-mismatch");
    }
  });

  test("unpaired references/digests are a typed record-reference-mismatch failure", () => {
    const manifest = sealedV1();
    const tampered = {
      ...manifest,
      benchmarkRecordReferences: [...manifest.benchmarkRecordReferences, "extra-id"],
    };
    const verification = verifyProvenanceManifest(tampered);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(
        verification.failures.some((f) => f.kind === "record-reference-mismatch"),
      ).toBe(true);
    }
  });

  test("an empty inputDigests list is a typed empty-list failure", () => {
    const manifest = sealedV1();
    const tampered = { ...manifest, inputDigests: [] };
    const verification = verifyProvenanceManifest(tampered);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.failures.some((f) => f.kind === "empty-list")).toBe(true);
    }
  });

  test("a wrong consumer identity is a typed type-mismatch failure", () => {
    const manifest = sealedV1();
    const tampered = {
      ...manifest,
      consumerIdentity: { consumer: "not-AISE", surface: "somewhere-else" },
    };
    const verification = verifyProvenanceManifest(tampered);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(
        verification.failures.some((f) => f.path === "consumerIdentity.consumer"),
      ).toBe(true);
    }
  });

  test("a non-object payload answers not-an-object (typed, no throw)", () => {
    for (const payload of [null, 1, "manifest", []]) {
      const verification = verifyProvenanceManifest(payload);
      expect(verification.ok).toBe(false);
      if (!verification.ok) {
        expect(verification.failures[0]?.kind).toBe("not-an-object");
      }
    }
  });
});
