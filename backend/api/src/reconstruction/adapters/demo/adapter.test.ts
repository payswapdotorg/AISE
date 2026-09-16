/**
 * Demo reconstruction provider tests (PROD-009): frozen-contract conformance
 * (the demo adapter is a REAL ReconstructionProvider), descriptor honesty
 * (READY is real local computation; the GENERATED_COMPLETION constraint is
 * carried verbatim; zero network, zero cost) and explicit typed failures.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INPUT_MODALITIES,
  PROVIDER_AVAILABILITY_STATES,
  REPRESENTATION_TYPES,
} from "../../contract";
import { GENERATED_COMPLETION_LABEL } from "../../gateway/model";
import { contentIdOf, makeRequest } from "../../testkit";
import {
  DEMO_GENERATED_COMPLETION_CONSTRAINT,
  DEMO_PROVIDER_ID,
  DEMO_SUPPORTED_OUTPUTS,
  DemoReconstructionProvider,
} from "./adapter";
import {
  DEMO_FIXTURE_SEEDS,
  demoEvidenceBytes,
  demoEvidenceReader,
} from "./fixtures";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const DEMO_IDS = DEMO_FIXTURE_SEEDS.map((seed) => contentIdOf(seed));

function demoRequest(
  evidenceContentIds: readonly string[],
  requestedRepresentations: readonly string[] = ["mesh"],
): ReturnType<typeof makeRequest> {
  return makeRequest({
    evidenceContentIds: [...evidenceContentIds],
    requestedRepresentations: requestedRepresentations as ReturnType<typeof makeRequest>["requestedRepresentations"],
    declaredInputModalities: ["still_image"],
  });
}

function fixtureReader(): ReturnType<typeof demoEvidenceReader> {
  const entries: Record<string, Uint8Array> = {};
  DEMO_FIXTURE_SEEDS.forEach((seed, index) => {
    entries[DEMO_IDS[index]!] = demoEvidenceBytes(seed);
  });
  return demoEvidenceReader(entries);
}

/* ------------------------------------------------------------------ */
/* Frozen-contract conformance                                          */
/* ------------------------------------------------------------------ */

describe("DemoReconstructionProvider: frozen contract conformance", () => {
  test("the descriptor satisfies every required ProviderDescriptor field with valid vocabulary", () => {
    const provider = new DemoReconstructionProvider();
    const descriptor = provider.descriptor;
    expect(typeof descriptor.providerId).toBe("string");
    expect(descriptor.providerId.length).toBeGreaterThan(0);
    expect(typeof descriptor.providerVersion).toBe("string");
    expect(descriptor.providerVersion.length).toBeGreaterThan(0);
    expect(typeof descriptor.adapterVersion).toBe("string");
    expect(descriptor.adapterVersion.length).toBeGreaterThan(0);
    expect(descriptor.supportedInputModalities.length).toBeGreaterThan(0);
    for (const modality of descriptor.supportedInputModalities) {
      expect((INPUT_MODALITIES as readonly string[]).includes(modality)).toBe(true);
    }
    expect(descriptor.supportedOutputModalities.length).toBeGreaterThan(0);
    for (const representation of descriptor.supportedOutputModalities) {
      expect((REPRESENTATION_TYPES as readonly string[]).includes(representation)).toBe(true);
    }
    expect((PROVIDER_AVAILABILITY_STATES as readonly string[]).includes(descriptor.availability)).toBe(true);
  });

  test("execute() answers a typed contract outcome with fully-labeled artifacts", async () => {
    const provider = new DemoReconstructionProvider({ evidenceReader: fixtureReader() });
    const outcome = await provider.execute(demoRequest(DEMO_IDS));
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    expect(outcome.artifacts.length).toBe(1);
    const artifact = outcome.artifacts[0]!;
    expect(artifact.representationType).toBe("mesh");
    expect(artifact.sourceEvidenceIds).toEqual([...DEMO_IDS]);
    expect(artifact.coordinateFrame).toBe("demo-scene-y-up-metric");
    expect(artifact.scaleDeclaration).toBe("metric-meters");
    expect(artifact.parameterDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.modelIdentity).toBe(`${DEMO_PROVIDER_ID}@1.0.0`);
    // Every region carries the generated-completion epistemic label.
    expect(artifact.regions?.length).toBeGreaterThan(0);
    for (const region of artifact.regions ?? []) {
      expect(region.epistemicLabel).toBe(GENERATED_COMPLETION_LABEL);
      expect(region.epistemicLabel).not.toBe("DIRECTLY_OBSERVED");
    }
    expect(artifact.limitations?.length).toBeGreaterThan(0);
  });

  test("one artifact per requested representation, each fully labeled", async () => {
    const provider = new DemoReconstructionProvider({ evidenceReader: fixtureReader() });
    const outcome = await provider.execute(
      demoRequest(DEMO_IDS, ["mesh", "point_cloud", "semantic_candidates"]),
    );
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    expect(outcome.artifacts.map((artifact) => artifact.representationType)).toEqual([
      "mesh",
      "point_cloud",
      "semantic_candidates",
    ]);
    for (const artifact of outcome.artifacts) {
      for (const region of artifact.regions ?? []) {
        expect(region.epistemicLabel).toBe(GENERATED_COMPLETION_LABEL);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Descriptor honesty                                                   */
/* ------------------------------------------------------------------ */

describe("DemoReconstructionProvider: descriptor honesty", () => {
  test("READY is honest real local computation, with the GENERATED_COMPLETION constraint carried verbatim", () => {
    const provider = new DemoReconstructionProvider();
    const descriptor = provider.descriptor;
    expect(descriptor.availability).toBe("READY");
    expect(descriptor.providerId).toBe(DEMO_PROVIDER_ID);
    // The constraint is part of the descriptor, verbatim.
    expect(descriptor.executionRequirements?.constraint).toBe(DEMO_GENERATED_COMPLETION_CONSTRAINT);
    expect(DEMO_GENERATED_COMPLETION_CONSTRAINT).toContain("GENERATED_COMPLETION");
    expect(DEMO_GENERATED_COMPLETION_CONSTRAINT).toContain("never directly observed");
  });

  test("zero network and zero cost are declared (the demo path needs no paid compute)", () => {
    const descriptor = new DemoReconstructionProvider().descriptor;
    expect(descriptor.networkAccessRequirements).toEqual({ inference: "none", paidApis: "none" });
    expect(descriptor.executionRequirements?.gpu).toBe("false");
    expect(descriptor.executionRequirements?.cost).toBe("zero");
    expect(descriptor.executionRequirements?.runtime).toBe("deterministic-in-process");
    expect(descriptor.costLatencyCharacteristics?.status).toBe("zero-cost-demo");
    expect(descriptor.licenseTerms?.gatedWeights).toBe("false");
  });

  test("an operator-disabled provider is reflected honestly (explicit unavailable, not silent)", async () => {
    const provider = new DemoReconstructionProvider({ availability: "UNAVAILABLE" });
    expect(provider.descriptor.availability).toBe("UNAVAILABLE");
    const outcome = await provider.execute(demoRequest(DEMO_IDS));
    expect(outcome).toEqual({
      kind: "failure",
      code: "UNAVAILABLE",
      detail: expect.stringContaining("disabled"),
    });
  });
});

/* ------------------------------------------------------------------ */
/* Explicit typed failures                                              */
/* ------------------------------------------------------------------ */

describe("DemoReconstructionProvider: explicit typed failures", () => {
  test("unsupported requested representations are refused with INPUT_INCOMPATIBLE naming them", async () => {
    const provider = new DemoReconstructionProvider();
    const outcome = await provider.execute(demoRequest(DEMO_IDS, ["mesh", "gaussian_splat"]));
    expect(outcome.kind).toBe("failure");
    if (outcome.kind !== "failure") {
      return;
    }
    expect(outcome.code).toBe("INPUT_INCOMPATIBLE");
    expect(outcome.detail).toContain("gaussian_splat");
    expect(outcome.detail).toContain(DEMO_SUPPORTED_OUTPUTS.join(", "));
  });

  test("unreadable evidence bytes are refused with INPUT_INCOMPATIBLE naming the ids", async () => {
    const provider = new DemoReconstructionProvider({
      evidenceReader: demoEvidenceReader({}), // nothing readable
    });
    const outcome = await provider.execute(demoRequest([DEMO_IDS[0]!]));
    expect(outcome.kind).toBe("failure");
    if (outcome.kind !== "failure") {
      return;
    }
    expect(outcome.code).toBe("INPUT_INCOMPATIBLE");
    expect(outcome.missingEvidenceIds).toEqual([DEMO_IDS[0]!]);
    expect(outcome.detail).toContain(DEMO_IDS[0]!);
  });
});

/* ------------------------------------------------------------------ */
/* Zero network (source-level guarantee)                                */
/* ------------------------------------------------------------------ */

describe("DemoReconstructionProvider: zero-network source guarantee", () => {
  const FORBIDDEN_NETWORK_VOCABULARY = [
    "fetch(",
    "node:http",
    "node:https",
    "XMLHttpRequest",
    "WebSocket",
    "Bun.fetch",
  ];

  test("the demo adapter and fixtures contain no network primitives", () => {
    for (const file of ["adapter.ts", "fixtures.ts"]) {
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      for (const forbidden of FORBIDDEN_NETWORK_VOCABULARY) {
        expect(source.includes(forbidden)).toBe(false);
      }
    }
  });
});
