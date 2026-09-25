/**
 * HFX-303 tests — the port contract for ALL providers: the governed lane
 * entry (request validation, freeze, verification, binding), determinism,
 * honest refusals, and the by-construction impossibility of interference.
 */

import { describe, expect, test } from "bun:test";
import {
  renderThroughLane,
  validateVisualStateRequest,
  providerSupportsClass,
  deepFreezeVisual,
  type VisualArtifact,
  type VisualRenderProvider,
  type VisualStateRequest,
} from "./port";
import { verifyVisualArtifact } from "./provenance";
import { sealVisualArtifact } from "./provenance";
import { buildVisualCorpus, type VisualCorpusCase } from "./corpus";
import { createReferenceVisualProvider } from "./providers/reference";
import { createAlternateVisualProvider } from "./providers/alternate";
import { createFailingVisualProvider } from "./providers/failing";
import { FAILURE_KINDS } from "@aise/provider-registry";

const corpus = buildVisualCorpus();
const baselineCase = corpus.find((entry) => entry.caseId === "demo-world-baseline");
const multiOpCase = corpus.find((entry) => entry.caseId === "demo-world-multi-operation");
const edgeCase = corpus.find((entry) => entry.caseId === "edge-empty-projection");

if (baselineCase === undefined || multiOpCase === undefined || edgeCase === undefined) {
  throw new Error("the visual corpus is missing an expected case");
}

const providers: readonly { key: string; provider: VisualRenderProvider }[] = [
  { key: "reference", provider: createReferenceVisualProvider() },
  { key: "alternate", provider: createAlternateVisualProvider() },
  { key: "failing", provider: createFailingVisualProvider() },
];

describe("the port contract for ALL providers", () => {
  test("every corpus request passes the lane's request gate", () => {
    for (const corpusCase of corpus) {
      const validation = validateVisualStateRequest(corpusCase.request);
      expect(validation.ok).toBe(true);
    }
  });

  test("the reference and alternate providers render byte-identical artifacts for identical requests", () => {
    for (const provider of [createReferenceVisualProvider(), createAlternateVisualProvider()]) {
      const first = renderThroughLane(provider, multiOpCase.request);
      const second = renderThroughLane(provider, multiOpCase.request);
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) continue;
      expect(first.artifact).toEqual(second.artifact);
      expect(first.artifact.artifactId).toBe(second.artifact.artifactId);
      expect(first.artifact.content.svg).toBe(second.artifact.content.svg);
    }
  });

  test("the failing provider ALWAYS answers a typed closed-vocabulary failure — never an artifact, never a throw", () => {
    for (const corpusCase of corpus) {
      const failingProvider = providers[2];
      if (failingProvider === undefined) throw new Error("missing failing fixture");
      const outcome = renderThroughLane(failingProvider.provider, corpusCase.request);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) continue;
      expect(FAILURE_KINDS.includes(outcome.failure.kind)).toBe(true);
      expect(outcome.failure.detail.length).toBeGreaterThan(0);
    }
  });

  test("a visual class outside a provider's declared capabilities is an honest unsupported-data refusal", () => {
    // The alternate provider does not declare material-study.
    const request: VisualStateRequest = {
      ...structuredClone(multiOpCase.request),
      visualClass: "material-study",
    };
    const outcome = renderThroughLane(createAlternateVisualProvider(), request);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("unsupported-data");
    expect(providerSupportsClass(createAlternateVisualProvider().descriptor, "material-study")).toBe(false);
    expect(providerSupportsClass(createAlternateVisualProvider().descriptor, "context-sketch")).toBe(true);
  });

  test("artifacts carry provenance binding the EXACT state revision (id, index, applied ids, digest)", () => {
    for (const corpusCase of corpus) {
      for (const provider of [
        createReferenceVisualProvider(),
        createAlternateVisualProvider(),
      ]) {
        const outcome = renderThroughLane(provider, corpusCase.request);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) continue;
        const artifact = outcome.artifact;
        expect(artifact.provenance.stateId).toBe(corpusCase.request.state.stateId);
        expect(artifact.provenance.stateIndex).toBe(corpusCase.request.state.stateIndex);
        expect(artifact.provenance.appliedOperationIds).toEqual(
          corpusCase.request.state.appliedOperationIds,
        );
        expect(artifact.provenance.solutionId).toBe(corpusCase.request.state.solutionId);
        expect(artifact.provenance.versionRef).toBe(corpusCase.request.state.versionRef);
        expect(artifact.provenance.stateContentDigest).toBe(
          corpusCase.request.state.stateContentDigest,
        );
        // The standalone verifier agrees (binding + digest).
        const verified = verifyVisualArtifact(artifact, corpusCase.request.state);
        expect(verified.ok).toBe(true);
      }
    }
  });

  test("swap changes presentation only: the two renderers produce DIFFERENT artifacts over the same state", () => {
    const reference = renderThroughLane(createReferenceVisualProvider(), multiOpCase.request);
    const alternate = renderThroughLane(createAlternateVisualProvider(), multiOpCase.request);
    expect(reference.ok).toBe(true);
    expect(alternate.ok).toBe(true);
    if (!reference.ok || !alternate.ok) return;
    expect(reference.artifact.artifactId).not.toBe(alternate.artifact.artifactId);
    expect(reference.artifact.content.svg).not.toBe(alternate.artifact.content.svg);
    // ...while the provenance block binds the SAME state revision.
    expect(reference.artifact.provenance.stateId).toBe(alternate.artifact.provenance.stateId);
    expect(reference.artifact.provenance.appliedOperationIds).toEqual(
      alternate.artifact.provenance.appliedOperationIds,
    );
  });

  test("the generated/hypothetical label manifest: every beyond-geometry region is labeled", () => {
    const reference = renderThroughLane(createReferenceVisualProvider(), multiOpCase.request);
    expect(reference.ok).toBe(true);
    if (!reference.ok) return;
    const artifact = reference.artifact;
    expect(artifact.labels.length).toBeGreaterThan(0);
    for (const label of artifact.labels) {
      expect(label.basis).toBe("beyond-deterministic-geometry");
      expect(label.label).toContain("GENERATED");
      // The SVG carries the region join key.
      expect(artifact.content.svg).toContain(`data-region-id="${label.regionId}"`);
    }
    expect(artifact.canonicalComparison.excessRegionCount).toBe(
      artifact.labels.filter((label) => label.basis === "beyond-deterministic-geometry").length,
    );
    // Every canonical shape is drawn (node-id join keys present).
    for (const shape of multiOpCase.request.canonicalProjections.plan.shapes) {
      expect(artifact.content.svg).toContain(`data-node-id="${shape.nodeId}"`);
    }
  });

  test("the honest EMPTY case: no canonical shapes → no illustrative additions, an empty notice, zero excess regions", () => {
    for (const provider of [
      createReferenceVisualProvider(),
      createAlternateVisualProvider(),
    ]) {
      const outcome = renderThroughLane(provider, edgeCase.request);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) continue;
      expect(outcome.artifact.labels).toEqual([]);
      expect(outcome.artifact.canonicalComparison.canonicalShapeCount).toBe(0);
      expect(outcome.artifact.canonicalComparison.excessRegionCount).toBe(0);
      // NO illustrative region is drawn (region join keys absent).
      expect(outcome.artifact.content.svg).not.toContain("reference-hypothesized-finish-band");
      expect(outcome.artifact.content.svg).not.toContain("alt-context-sketch-margin");
      // The honest empty notice IS drawn (each provider in its own wording).
      expect(/no deterministic geometry/i.test(outcome.artifact.content.svg)).toBe(true);
    }
  });

  test("no numeric engineering claims ride the rendered text content (tolerance-free law)", () => {
    for (const corpusCase of corpus) {
      for (const provider of [
        createReferenceVisualProvider(),
        createAlternateVisualProvider(),
      ]) {
        const outcome = renderThroughLane(provider, corpusCase.request);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) continue;
        const texts = [
          ...outcome.artifact.content.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g),
        ].map((match) => match[1] ?? "");
        for (const text of texts) {
          expect(/\d/.test(text)).toBe(false);
        }
      }
    }
  });
});

describe("the governed lane entry (renderThroughLane)", () => {
  test("a MALFORMED request is refused with a typed contract-mismatch — never rendered", () => {
    const broken = structuredClone(multiOpCase.request) as unknown as Record<string, unknown>;
    broken["visualClass"] = "not-a-class";
    const outcome = renderThroughLane(createReferenceVisualProvider(), broken as unknown as VisualStateRequest);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("visualClass");
  });

  test("a provider that MUTATES its frozen input is refused fail-closed and the caller's data is untouched", () => {
    const rogue: VisualRenderProvider = {
      descriptor: createReferenceVisualProvider().descriptor,
      renderVisual(state) {
        const shapes = state.canonicalProjections.plan.shapes;
        const first = shapes[0];
        if (first !== undefined) {
          (first.points[0] as [number, number])[0] = 999;
        }
        return createReferenceVisualProvider().renderVisual(state);
      },
    };
    const requestSnapshot = structuredClone(multiOpCase.request);
    const outcome = renderThroughLane(rogue, multiOpCase.request);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("threw");
    // The caller's request is BYTE-IDENTICAL to its snapshot.
    expect(multiOpCase.request).toEqual(requestSnapshot);
  });

  test("a provider that THROWS is converted into a typed refusal — never a crash", () => {
    const thrower: VisualRenderProvider = {
      descriptor: createReferenceVisualProvider().descriptor,
      renderVisual(): never {
        throw new Error("internal provider defect");
      },
    };
    const outcome = renderThroughLane(thrower, multiOpCase.request);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
  });

  test("a rogue artifact bound to ANOTHER state revision is refused (provenance binding)", () => {
    // Build a perfectly valid artifact — for the WRONG state.
    const real = renderThroughLane(createReferenceVisualProvider(), baselineCase.request);
    expect(real.ok).toBe(true);
    if (!real.ok) return;
    const misbound = sealVisualArtifact({
      visualClass: real.artifact.visualClass,
      content: real.artifact.content,
      labels: real.artifact.labels,
      canonicalComparison: real.artifact.canonicalComparison,
      state: multiOpCase.request.state, // the wrong state
      provider: real.artifact.provenance.provider,
    });
    const rogue: VisualRenderProvider = {
      descriptor: createReferenceVisualProvider().descriptor,
      renderVisual: () => ({ ok: true, artifact: misbound }),
    };
    const outcome = renderThroughLane(rogue, baselineCase.request);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("provenance-binding-mismatch");
  });

  test("a TAMPERED artifact (content edited after sealing) is refused (digest re-derivation)", () => {
    const real = renderThroughLane(createReferenceVisualProvider(), baselineCase.request);
    expect(real.ok).toBe(true);
    if (!real.ok) return;
    const tampered = structuredClone(real.artifact) as unknown as {
      content: { svg: string };
    };
    tampered.content.svg = tampered.content.svg.replace("<svg", "<svg data-tamper=\"1\"");
    const rogue: VisualRenderProvider = {
      descriptor: createReferenceVisualProvider().descriptor,
      renderVisual: () => ({ ok: true, artifact: tampered as unknown as VisualArtifact }),
    };
    const outcome = renderThroughLane(rogue, baselineCase.request);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.detail).toContain("artifact-id-mismatch");
  });

  test("deepFreezeVisual freezes nested graphs — mutation attempts throw", () => {
    const frozen = deepFreezeVisual(structuredClone(multiOpCase.request));
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.canonicalProjections.plan.shapes)).toBe(true);
    expect(() => {
      (frozen as unknown as Record<string, unknown>)["visualClass"] = "context-sketch";
    }).toThrow();
  });
});

describe("corpus determinism (the fixture-stability discipline)", () => {
  test("rebuilding the corpus reproduces byte-identical canonical bytes and state identities", () => {
    const rebuilt = buildVisualCorpus();
    expect(rebuilt.length).toBe(corpus.length);
    for (const [index, corpusCase] of rebuilt.entries()) {
      const original = corpus[index];
      if (original === undefined) throw new Error(`missing original case at ${String(index)}`);
      expect(corpusCase.caseId).toBe(original.caseId);
      expect(corpusCase.canonicalStateBytes).toBe(original.canonicalStateBytes);
      expect(corpusCase.canonicalVersionBytes).toBe(original.canonicalVersionBytes);
      expect(corpusCase.canonicalQuantitiesBytes).toBe(original.canonicalQuantitiesBytes);
      expect(corpusCase.canonicalValidationBytes).toBe(original.canonicalValidationBytes);
      expect(JSON.stringify(corpusCase.request)).toBe(JSON.stringify(original.request));
    }
  });

  test("the corpus covers the mandated case classes (demo world, multi-operation, edge/boundary)", () => {
    const ids = corpus.map((corpusCase) => corpusCase.caseId);
    expect(ids).toContain("demo-world-baseline");
    expect(ids).toContain("demo-world-multi-operation");
    expect(ids).toContain("edge-empty-projection");
    expect(multiOpCase.request.state.appliedOperationIds.length).toBeGreaterThanOrEqual(3);
    expect(edgeCase.request.canonicalProjections.plan.shapes).toEqual([]);
    expect(edgeCase.request.canonicalProjections.plan.omissions.length).toBe(1);
  });
});

export type { VisualCorpusCase };
