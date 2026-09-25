/**
 * HFX-303 tests — provenance binding + tamper rejection: the artifact
 * content address, the exact-state-revision binding, the negative cases,
 * and the control-plane provenance manifest sealing.
 */

import { describe, expect, test } from "bun:test";
import { verifyProvenanceManifest, type EnvironmentFingerprint } from "@aise/provider-registry";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  providerReferenceOf,
  sealLaneProvenanceManifest,
  sealVisualArtifact,
  verifyVisualArtifact,
  visualOutcomeDigestOf,
  visualRequestDigestOf,
} from "./provenance";
import { renderThroughLane } from "./port";
import { buildVisualCorpus } from "./corpus";
import { createReferenceVisualProvider } from "./providers/reference";
import { referenceVisualProfile } from "./profiles";

const corpus = buildVisualCorpus();
const multiOpCase = corpus.find((entry) => entry.caseId === "demo-world-multi-operation");
if (multiOpCase === undefined) {
  throw new Error("the visual corpus is missing the multi-operation case");
}

/** Re-resolves one corpus case inside test closures (narrowing helper). */
function requireCase(caseId: string): (typeof corpus)[number] {
  const found = corpus.find((entry) => entry.caseId === caseId);
  if (found === undefined) {
    throw new Error(`the visual corpus is missing the '${caseId}' case`);
  }
  return found;
}

function renderedArtifact() {
  const outcome = renderThroughLane(createReferenceVisualProvider(), requireCase("demo-world-multi-operation").request);
  if (!outcome.ok) {
    throw new Error(`the reference provider refused the corpus case: ${outcome.failure.detail}`);
  }
  return outcome.artifact;
}

describe("provenance binding (every artifact linked to a state revision + provider profile)", () => {
  test("the artifact's provenance carries the FULL state revision + provider identity", () => {
    const artifact = renderedArtifact();
    expect(artifact.provenance.stateId).toBe(multiOpCase.state.stateId);
    expect(artifact.provenance.stateIndex).toBe(multiOpCase.state.stateIndex);
    expect(artifact.provenance.appliedOperationIds).toEqual([...multiOpCase.state.appliedOperationIds]);
    expect(artifact.provenance.stateContentDigest).toBe(multiOpCase.state.contentDigest);
    expect(artifact.provenance.solutionId).toBe(multiOpCase.state.solutionId);
    const provider = artifact.provenance.provider;
    expect(provider.providerId).toBe("visual-hypothesis-reference");
    expect(provider.technologyVersion).toBe("1.0.0-inrepo-v1");
    expect(provider.descriptorDigest).toBe(
      providerReferenceOf(createReferenceVisualProvider().descriptor).descriptorDigest,
    );
  });

  test("sealing is DETERMINISTIC: identical inputs seal to the identical artifact id", () => {
    const artifact = renderedArtifact();
    const resealed = sealVisualArtifact({
      visualClass: artifact.visualClass,
      content: artifact.content,
      labels: artifact.labels,
      canonicalComparison: artifact.canonicalComparison,
      state: multiOpCase.request.state,
      provider: artifact.provenance.provider,
    });
    expect(resealed.artifactId).toBe(artifact.artifactId);
  });

  test("the standalone verifier accepts the artifact bound to its exact state", () => {
    const artifact = renderedArtifact();
    expect(verifyVisualArtifact(artifact).ok).toBe(true);
    expect(verifyVisualArtifact(artifact, multiOpCase.request.state).ok).toBe(true);
  });
});

describe("tamper rejection (the negative cases)", () => {
  test("a TAMPERED stateId in the provenance is rejected (artifact-id mismatch)", () => {
    const artifact = renderedArtifact();
    const tampered = structuredClone(artifact) as unknown as {
      provenance: { stateId: string };
    };
    tampered.provenance.stateId = "ff".repeat(32);
    const validation = verifyVisualArtifact(tampered);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.failures[0]?.kind).toBe("artifact-id-mismatch");
  });

  test("a TAMPERED applied-operation sequence is rejected", () => {
    const artifact = renderedArtifact();
    const tampered = structuredClone(artifact) as unknown as {
      provenance: { appliedOperationIds: string[] };
    };
    tampered.provenance.appliedOperationIds = [
      ...tampered.provenance.appliedOperationIds.slice(1),
      "op-forged",
    ];
    const validation = verifyVisualArtifact(tampered);
    expect(validation.ok).toBe(false);
  });

  test("a TAMPERED provider descriptor digest is rejected", () => {
    const artifact = renderedArtifact();
    const tampered = structuredClone(artifact) as unknown as {
      provenance: { provider: { descriptorDigest: string } };
    };
    tampered.provenance.provider.descriptorDigest = "ab".repeat(32);
    expect(verifyVisualArtifact(tampered).ok).toBe(false);
  });

  test("a TAMPERED svg body is rejected", () => {
    const artifact = renderedArtifact();
    const tampered = structuredClone(artifact) as unknown as {
      content: { svg: string };
    };
    tampered.content.svg += "<rect x=\"0\" y=\"0\" width=\"1\" height=\"1\"/>";
    expect(verifyVisualArtifact(tampered).ok).toBe(false);
  });

  test("a TAMPERED label manifest is rejected", () => {
    const artifact = renderedArtifact();
    const tampered = structuredClone(artifact) as unknown as {
      labels: { label: string }[];
    };
    if (tampered.labels[0] !== undefined) {
      tampered.labels[0].label = "quietly authoritative geometry";
    }
    expect(verifyVisualArtifact(tampered).ok).toBe(false);
  });

  test("an artifact presented for the WRONG state revision is rejected (binding mismatch)", () => {
    const artifact = renderedArtifact();
    const otherCase = corpus.find((entry) => entry.caseId === "demo-world-baseline");
    if (otherCase === undefined) throw new Error("missing baseline case");
    const validation = verifyVisualArtifact(artifact, otherCase.request.state);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(
      validation.failures.every((failure) => failure.kind === "provenance-binding-mismatch"),
    ).toBe(true);
    expect(validation.failures.some((failure) => failure.path === "provenance.stateId")).toBe(true);
    expect(validation.failures.some((failure) => failure.path === "provenance.stateIndex")).toBe(true);
  });

  test("shape violations are collected as typed failures (never throws)", () => {
    expect(verifyVisualArtifact(null).ok).toBe(false);
    expect(verifyVisualArtifact({ kind: "visual-artifact" }).ok).toBe(false);
    expect(
      verifyVisualArtifact({
        ...renderedArtifact(),
        labels: "not-an-array",
      }).ok,
    ).toBe(false);
    expect(
      verifyVisualArtifact({
        ...renderedArtifact(),
        canonicalComparison: {
          ...renderedArtifact().canonicalComparison,
          excessRegionCount: 99,
        },
      }).ok,
    ).toBe(false);
  });
});

describe("the control-plane provenance manifest (HFX-000 vocabulary, reused exactly)", () => {
  const declaredEnvironment: EnvironmentFingerprint = {
    declaredRuntime: "bun",
    declaredPlatform: "in-repo-deterministic",
    codeVersion: "hfx-303-visual-render-lane",
    statement: "the lane's declared evaluation environment — never sensed",
  };

  test("a render execution seals a VERIFIABLE portable provenance manifest", () => {
    const artifact = renderedArtifact();
    const manifest = sealLaneProvenanceManifest({
      profile: referenceVisualProfile(),
      request: multiOpCase.request,
      outcome: { ok: true, artifact },
      environment: declaredEnvironment,
    });
    expect(manifest.profileReference.providerId).toBe("visual-hypothesis-reference");
    expect(manifest.consumerIdentity.surface).toBe("visual-solution-rendering-lane");
    expect(manifest.inputDigests).toEqual([visualRequestDigestOf(multiOpCase.request)]);
    expect(manifest.normalizedResultDigest).toBe(
      visualOutcomeDigestOf({ ok: true, artifact }),
    );
    const verification = verifyProvenanceManifest(manifest);
    expect(verification.ok).toBe(true);
  });

  test("a FAILED render execution seals an equally verifiable manifest (the failure is chained, not hidden)", () => {
    const manifest = sealLaneProvenanceManifest({
      profile: referenceVisualProfile(),
      request: multiOpCase.request,
      outcome: {
        ok: false,
        failure: { kind: "unsupported-data", detail: "class not declared" },
      },
      environment: declaredEnvironment,
    });
    expect(verifyProvenanceManifest(manifest).ok).toBe(true);
    expect(manifest.normalizedResultDigest).toBe(
      visualOutcomeDigestOf({
        ok: false,
        failure: { kind: "unsupported-data", detail: "class not declared" },
      }),
    );
  });

  test("the request digest is stable over the canonical serialization", () => {
    const first = visualRequestDigestOf(multiOpCase.request);
    const second = visualRequestDigestOf(
      JSON.parse(canonicalJsonStringify(multiOpCase.request)) as typeof multiOpCase.request,
    );
    expect(first).toBe(second);
  });
});
