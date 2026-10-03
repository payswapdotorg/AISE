/**
 * WORLD-P0-A tests — the AISE scene-composition semantics (the USD-inspired
 * strength model, variant/reference/payload arcs, winning-opinion
 * provenance, and the closed-shape refusals).
 */

import { describe, expect, test } from "bun:test";
import {
  composeSceneSpec,
  composedCanonicalJson,
  isCanonicalValue,
  isSpecPath,
  isVariantDecoratedPath,
  variantDecoratedPath,
} from "./composition";
import type { CompositionSpec, SceneLayer } from "./composition";

function stackFixture(): readonly SceneLayer[] {
  return [
    {
      id: "session",
      opinions: [
        { path: "/Site/Wall", field: "material", value: "brick-v2" },
        { path: "/Root/Prop<<lod=low>>", field: "texture", value: "128" },
      ],
    },
    {
      id: "site",
      opinions: [
        { path: "/Site/Wall", field: "material", value: "concrete" },
        { path: "/Site/Wall", field: "heightMm", value: 3000 },
        { path: "/Root/Prop<<lod=high>>", field: "texture", value: "4k" },
        { path: "/Library/Wall", field: "texture", value: "512" },
      ],
    },
    {
      id: "payload-library",
      opinions: [{ path: "/Heavy/Mesh", field: "triangleCount", value: 120_000 }],
    },
  ];
}

describe("layer-stack strength", () => {
  test("the stronger (earlier) layer wins the same field", () => {
    const composed = composeSceneSpec(stackFixture(), { path: "/Site/Wall" }, { loadPayloads: false });
    expect(composed.ok).toBe(true);
    if (!composed.ok) {
      return;
    }
    expect(composed.value.fields["material"]?.value).toBe("brick-v2");
    expect(composed.value.fields["material"]?.provenance.layerId).toBe("session");
  });

  test("a field authored by only the weaker layer still resolves", () => {
    const composed = composeSceneSpec(stackFixture(), { path: "/Site/Wall" }, { loadPayloads: false });
    expect(composed.ok).toBe(true);
    if (!composed.ok) {
      return;
    }
    expect(composed.value.fields["heightMm"]?.value).toBe(3000);
    expect(composed.value.fields["heightMm"]?.provenance.layerId).toBe("site");
  });

  test("composition is deterministic: the same inputs compose to identical canonical JSON", () => {
    const spec: CompositionSpec = {
      path: "/Root/Prop",
      arcs: [{ kind: "variant", set: "lod", selected: "high" }],
    };
    const first = composeSceneSpec(stackFixture(), spec, { loadPayloads: false });
    const second = composeSceneSpec(stackFixture(), spec, { loadPayloads: false });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(composedCanonicalJson(first.value)).toBe(composedCanonicalJson(second.value));
  });
});

describe("variant strength", () => {
  test("the selected variant's opinions resolve from the decorated path", () => {
    const composed = composeSceneSpec(
      stackFixture(),
      { path: "/Root/Prop", arcs: [{ kind: "variant", set: "lod", selected: "high" }] },
      { loadPayloads: false },
    );
    expect(composed.ok).toBe(true);
    if (!composed.ok) {
      return;
    }
    expect(composed.value.fields["texture"]?.value).toBe("4k");
    expect(composed.value.fields["texture"]?.provenance.strength).toBe("variant");
    expect(composed.value.fields["texture"]?.provenance.arcChain).toEqual(["variant:lod=high"]);
  });

  test("selecting the other variant resolves the other opinion (strength, not order)", () => {
    const composed = composeSceneSpec(
      stackFixture(),
      { path: "/Root/Prop", arcs: [{ kind: "variant", set: "lod", selected: "low" }] },
      { loadPayloads: false },
    );
    expect(composed.ok).toBe(true);
    if (!composed.ok) {
      return;
    }
    expect(composed.value.fields["texture"]?.value).toBe("128");
  });

  test("variant opinions beat reference opinions (declared strength order)", () => {
    const stack: readonly SceneLayer[] = [
      {
        id: "one",
        opinions: [
          { path: "/Root/Prop<<lod=high>>", field: "texture", value: "variant-wins" },
          { path: "/Library/Prop", field: "texture", value: "reference-loses" },
        ],
      },
    ];
    const composed = composeSceneSpec(
      stack,
      {
        path: "/Root/Prop",
        arcs: [
          { kind: "variant", set: "lod", selected: "high" },
          { kind: "reference", layerId: "one", targetPath: "/Library/Prop" },
        ],
      },
      { loadPayloads: false },
    );
    expect(composed.ok).toBe(true);
    if (!composed.ok) {
      return;
    }
    expect(composed.value.fields["texture"]?.value).toBe("variant-wins");
  });

  test("local opinions beat variant opinions", () => {
    const stack: readonly SceneLayer[] = [
      {
        id: "one",
        opinions: [
          { path: "/Root/Prop", field: "texture", value: "local-wins" },
          { path: "/Root/Prop<<lod=high>>", field: "texture", value: "variant-loses" },
        ],
      },
    ];
    const composed = composeSceneSpec(
      stack,
      { path: "/Root/Prop", arcs: [{ kind: "variant", set: "lod", selected: "high" }] },
      { loadPayloads: false },
    );
    expect(composed.ok).toBe(true);
    if (!composed.ok) {
      return;
    }
    expect(composed.value.fields["texture"]?.value).toBe("local-wins");
  });

  test("an earlier variant arc beats a later one for the same field", () => {
    const stack: readonly SceneLayer[] = [
      {
        id: "one",
        opinions: [
          { path: "/Root/Prop<<shape=cube>>", field: "sides", value: 6 },
          { path: "/Root/Prop<<shape=sphere>>", field: "sides", value: 0 },
        ],
      },
    ];
    const composed = composeSceneSpec(
      stack,
      {
        path: "/Root/Prop",
        arcs: [
          { kind: "variant", set: "shape", selected: "cube" },
          { kind: "variant", set: "shape", selected: "sphere" },
        ],
      },
      { loadPayloads: false },
    );
    expect(composed.ok).toBe(true);
    if (!composed.ok) {
      return;
    }
    expect(composed.value.fields["sides"]?.value).toBe(6);
  });
});

describe("reference and payload arcs", () => {
  test("a reference arc resolves the target layer's opinions with provenance", () => {
    const composed = composeSceneSpec(
      stackFixture(),
      { path: "/Other/Wall", arcs: [{ kind: "reference", layerId: "site", targetPath: "/Library/Wall" }] },
      { loadPayloads: false },
    );
    expect(composed.ok).toBe(true);
    if (!composed.ok) {
      return;
    }
    expect(composed.value.fields["texture"]?.value).toBe("512");
    expect(composed.value.fields["texture"]?.provenance.strength).toBe("reference");
    expect(composed.value.fields["texture"]?.provenance.arcChain).toEqual([
      "reference:site/Library/Wall",
    ]);
  });

  test("payload arcs are lazy: absent unless opted in", () => {
    const spec: CompositionSpec = {
      path: "/Other/Mesh",
      arcs: [{ kind: "payload", layerId: "payload-library", targetPath: "/Heavy/Mesh" }],
    };
    const off = composeSceneSpec(stackFixture(), spec, { loadPayloads: false });
    const on = composeSceneSpec(stackFixture(), spec, { loadPayloads: true });
    expect(off.ok && on.ok).toBe(true);
    if (!off.ok || !on.ok) {
      return;
    }
    expect(off.value.fields["triangleCount"]).toBeUndefined();
    expect(on.value.fields["triangleCount"]?.value).toBe(120_000);
    expect(on.value.fields["triangleCount"]?.provenance.strength).toBe("payload");
  });

  test("local beats reference when both author the same field", () => {
    const composed = composeSceneSpec(
      stackFixture(),
      {
        path: "/Site/Wall",
        arcs: [{ kind: "reference", layerId: "site", targetPath: "/Site/Wall" }],
      },
      { loadPayloads: false },
    );
    expect(composed.ok).toBe(true);
    if (!composed.ok) {
      return;
    }
    // The reference points at the same path: local strength still wins.
    expect(composed.value.fields["material"]?.value).toBe("brick-v2");
  });
});

describe("closed-shape refusals (contract-mismatch, the offender named)", () => {
  test("an unknown layer id in an arc is refused", () => {
    const outcome = composeSceneSpec(
      stackFixture(),
      { path: "/A", arcs: [{ kind: "reference", layerId: "ghost", targetPath: "/X" }] },
      { loadPayloads: false },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.path).toContain("layerId");
  });

  test("a duplicate layer id is refused", () => {
    const outcome = composeSceneSpec(
      [
        { id: "dup", opinions: [] },
        { id: "dup", opinions: [] },
      ],
      { path: "/A" },
      { loadPayloads: false },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.detail).toContain("unique");
  });

  test("a duplicate (path, field) opinion in one layer is refused", () => {
    const outcome = composeSceneSpec(
      [
        {
          id: "one",
          opinions: [
            { path: "/A", field: "x", value: 1 },
            { path: "/A", field: "x", value: 2 },
          ],
        },
      ],
      { path: "/A" },
      { loadPayloads: false },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.detail).toContain("more than once");
  });

  test("a non-canonical opinion value is refused (canonical-scalar law)", () => {
    const outcome = composeSceneSpec(
      [{ id: "one", opinions: [{ path: "/A", field: "x", value: { deep: "object" } as never }] }],
      { path: "/A" },
      { loadPayloads: false },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.detail).toContain("canonical value");
  });

  test("a spec path violating the closed grammar is refused", () => {
    const outcome = composeSceneSpec(stackFixture(), { path: "no-leading-slash" }, { loadPayloads: false });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.path).toBe("spec.path");
  });

  test("an opinion path violating the closed grammar is refused", () => {
    const outcome = composeSceneSpec(
      [{ id: "one", opinions: [{ path: "bad", field: "x", value: 1 }] }],
      { path: "/A" },
      { loadPayloads: false },
    );
    expect(outcome.ok).toBe(false);
  });
});

describe("the canonical-value guard and path grammar", () => {
  test("canonical values: scalars and scalar arrays pass; objects, NaN, Infinity refuse", () => {
    expect(isCanonicalValue("x")).toBe(true);
    expect(isCanonicalValue(1)).toBe(true);
    expect(isCanonicalValue(true)).toBe(true);
    expect(isCanonicalValue([1, "a", false])).toBe(true);
    expect(isCanonicalValue({})).toBe(false);
    expect(isCanonicalValue(Number.NaN)).toBe(false);
    expect(isCanonicalValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isCanonicalValue([Number.NaN])).toBe(false);
    expect(isCanonicalValue(null)).toBe(false);
    expect(isCanonicalValue([[1]])).toBe(false);
  });

  test("the spec-path grammar", () => {
    expect(isSpecPath("/A")).toBe(true);
    expect(isSpecPath("/A/B/C-9_x")).toBe(true);
    expect(isSpecPath("A/B")).toBe(false);
    expect(isSpecPath("/")).toBe(false);
    expect(isSpecPath("/A//B")).toBe(false);
    expect(isSpecPath("/A/B/")).toBe(false);
    expect(isSpecPath("/A/B!")).toBe(false);
  });

  test("the variant decoration roundtrip", () => {
    const decorated = variantDecoratedPath("/Root/Prop", "lod", "high");
    expect(decorated).toBe("/Root/Prop<<lod=high>>");
    expect(isVariantDecoratedPath(decorated)).toBe(true);
    expect(isVariantDecoratedPath("/Root/Prop")).toBe(false);
  });
});
