/**
 * WORLD-P0-C tests — the SEAM laws (the shared law layer under the four
 * family contracts).
 */

import { describe, expect, test } from "bun:test";
import {
  CANONICAL_DIGEST_PATTERN,
  FREECAD_NAME_PATTERN,
  SIMULATED_PROGRESS_EPISTEMIC_STATUS,
  SOLUTION_EXTERNAL_LABEL_NAMESPACES,
  SOLUTION_LANE_STATEMENT,
  SOLUTION_SUBSTRATE_FAMILIES,
  SOLUTION_SUBSTRATE_LANE_ID,
  SOLUTION_SUBSTRATE_METHOD_IDENTITIES,
  canonicalDigestOf,
  deepFreeze,
  externalLabelCollisions,
  externalLabelValuesOf,
  isCanonicalDigest,
  isFreecadNameShaped,
  isSolutionExternalLabelNamespace,
  isSolutionSubstrateFamily,
  providerDescriptorDigestOf,
  refused,
  textDigestOf,
  type NamespacedExternalLabel,
  type SubstrateProviderDescriptor,
} from "./seam";
import { FAILURE_KINDS } from "@aise/provider-registry";

describe("the seam — lane identity + closed vocabularies", () => {
  test("the lane identity and statement are pinned", () => {
    expect(SOLUTION_SUBSTRATE_LANE_ID).toBe("solution-substrate");
    expect(SOLUTION_LANE_STATEMENT).toContain("WORLD-P0-C");
    expect(SOLUTION_LANE_STATEMENT).toContain("never engineering authorities");
  });

  test("the substrate-family vocabulary is closed over the four families", () => {
    expect(SOLUTION_SUBSTRATE_FAMILIES).toEqual(["scene", "cad", "simulation", "desktop"]);
    for (const family of SOLUTION_SUBSTRATE_FAMILIES) {
      expect(isSolutionSubstrateFamily(family)).toBe(true);
    }
    expect(isSolutionSubstrateFamily("ifc")).toBe(false);
    expect(isSolutionSubstrateFamily("babylon")).toBe(false);
    expect(isSolutionSubstrateFamily("reality")).toBe(false);
  });

  test("the method-identity vocabulary is closed", () => {
    expect(SOLUTION_SUBSTRATE_METHOD_IDENTITIES).toEqual([
      "solution.scene-usage",
      "cad.parametric",
      "simulation.execution",
      "desktop.shell",
    ]);
  });

  test("the external-label namespace vocabulary is closed over the Solution-lane substrates", () => {
    expect(SOLUTION_EXTERNAL_LABEL_NAMESPACES).toEqual([
      "freecad-document",
      "freecad-object",
      "usd-path",
      "gltf-part",
      "sidecar-process",
    ]);
    for (const namespace of SOLUTION_EXTERNAL_LABEL_NAMESPACES) {
      expect(isSolutionExternalLabelNamespace(namespace)).toBe(true);
    }
    // the P0-B namespaces are NOT this lane's namespaces (frozen separately)
    expect(isSolutionExternalLabelNamespace("ifc-guid")).toBe(false);
    expect(isSolutionExternalLabelNamespace("occt-topology")).toBe(false);
    expect(isSolutionExternalLabelNamespace("vtk-dataobject")).toBe(false);
  });

  test("simulated progress enters as PROPOSED — never CONFIRMED", () => {
    expect(SIMULATED_PROGRESS_EPISTEMIC_STATUS).toBe("PROPOSED");
  });
});

describe("the seam — FreeCAD name shapes (the CAD external labels)", () => {
  test("FreeCAD-shaped names are recognized", () => {
    expect(FREECAD_NAME_PATTERN.test("Sketch")).toBe(true);
    expect(FREECAD_NAME_PATTERN.test("Pad_lintel")).toBe(true);
    expect(FREECAD_NAME_PATTERN.test("Doc-1.2")).toBe(true);
    expect(isFreecadNameShaped("Sketch001")).toBe(true);
  });

  test("path-like and empty names are refused", () => {
    expect(isFreecadNameShaped("")).toBe(false);
    expect(isFreecadNameShaped("/usr/bin/freecad")).toBe(false);
    expect(isFreecadNameShaped("has space")).toBe(false);
    expect(isFreecadNameShaped(".hidden")).toBe(false);
  });
});

describe("the seam — the canonical digest discipline", () => {
  test("digests are 64-hex and deterministic", () => {
    const value = { b: 2, a: 1, nested: { z: [1, 2, 3] } };
    const d1 = canonicalDigestOf(value);
    const d2 = canonicalDigestOf({ a: 1, b: 2, nested: { z: [1, 2, 3] } });
    expect(d1).toMatch(CANONICAL_DIGEST_PATTERN);
    expect(d1).toBe(d2); // key order does not matter (canonical JSON)
    expect(canonicalDigestOf({ a: 1 })).not.toBe(canonicalDigestOf({ a: 2 }));
    expect(isCanonicalDigest(d1)).toBe(true);
    expect(isCanonicalDigest("not-a-digest")).toBe(false);
  });

  test("text digests are raw-byte sha-256", () => {
    expect(textDigestOf("AISE")).toBe(textDigestOf("AISE"));
    expect(textDigestOf("AISE")).not.toBe(textDigestOf("AISF"));
    expect(textDigestOf("")).toMatch(CANONICAL_DIGEST_PATTERN);
  });
});

describe("the seam — the closed failure vocabulary (law 3)", () => {
  test("refusals carry a kind from the HFX-000 closed vocabulary, never an invented one", () => {
    const outcome = refused("cad", "contract-mismatch", "the detail");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(FAILURE_KINDS).toContain(outcome.failure.kind);
      expect(outcome.failure.family).toBe("cad");
      expect(outcome.failure.detail).toBe("the detail");
    }
  });

  test("every family can refuse through the same shape", () => {
    for (const family of SOLUTION_SUBSTRATE_FAMILIES) {
      const outcome = refused(family, "unsupported-data", `from ${family}`);
      expect(outcome.ok).toBe(false);
    }
  });
});

describe("the seam — provider descriptors + provenance pins", () => {
  const descriptor: SubstrateProviderDescriptor = {
    providerId: "solution-substrate.test.provider",
    family: "cad",
    technologyVersion: "test/1.0.0",
    engineNote: "a test descriptor",
    laneStatement: SOLUTION_LANE_STATEMENT,
  };

  test("the descriptor digest is content-derived and stable", () => {
    const d1 = providerDescriptorDigestOf(descriptor);
    const d2 = providerDescriptorDigestOf({ ...descriptor });
    expect(d1).toBe(d2);
    expect(d1).toMatch(CANONICAL_DIGEST_PATTERN);
    expect(providerDescriptorDigestOf({ ...descriptor, technologyVersion: "test/2.0.0" })).not.toBe(d1);
  });
});

describe("the seam — the non-interference guard", () => {
  test("deepFreeze freezes nested request state", () => {
    const request = {
      modelId: "m1",
      nested: { list: [{ id: "a" }] },
    };
    deepFreeze(request);
    expect(() => {
      (request as { modelId: string }).modelId = "mutated";
    }).toThrow();
    expect(() => {
      request.nested.list.push({ id: "b" } as never);
    }).toThrow();
  });
});

describe("the seam — the identity-law guard (law 1)", () => {
  test("external label values never pass as canonical ids", () => {
    const labels: NamespacedExternalLabel[] = [
      { namespace: "freecad-document", value: "LintelDoc" },
      { namespace: "freecad-object", value: "Sketch_wall_profile" },
      { namespace: "gltf-part", value: "mesh:0" },
    ];
    const values = externalLabelValuesOf(labels);
    expect(values).toEqual(["LintelDoc", "Sketch_wall_profile", "mesh:0"]);
    // a smuggled id collides and is caught
    expect(externalLabelCollisions(["model-lintel-001", "mesh:0"], values)).toEqual(["mesh:0"]);
    // clean ids pass
    expect(externalLabelCollisions(["model-lintel-001", "feature-pad-001"], values)).toEqual([]);
  });
});
