/**
 * WORLD-P0-A tests — the technology-substitution-contract THREE LAWS
 * proven across ALL FIVE Reality-layer ports at once (the packet's
 * substitution-proof artifact).
 *
 * Law 1 (substitution is not semantics change): the doubles' semantics
 * are deterministic and round-trip stable — a real substrate adapter
 * must produce the same observable semantics (the doubles are the
 * declared reference).
 *
 * Law 2 (tolerances are declared, never implicit): every double that
 * produces numeric output declares its tolerance; round-trips stay
 * within it; nothing is averaged away.
 *
 * Law 3 (unsupported is recorded, never computed): every double
 * declares its BLOCKED capabilities with reasons and refuses outside
 * them with typed codes — no fabricated output anywhere.
 */

import { describe, expect, test } from "bun:test";
import { InMemorySceneRuntimeDouble } from "./babylon/double";
import { InMemoryGeospatialDouble } from "./cesium/double";
import { InMemoryUsdCompositionDouble } from "./usd/double";
import { InMemoryGltfDeliveryDouble } from "./gltf/double";
import { InMemoryAssimpIngestDouble } from "./assimp/double";
import type { ComposedScene, SceneNode } from "./scene";
import { translation } from "./scene";
import { isRefusal } from "./errors";

function oneNodeScene(): ComposedScene {
  const node: SceneNode = {
    elementId: "wall-1",
    kind: "element",
    parentId: null,
    transform: translation(1, 2, 3),
    geometry: { assetId: "a", partId: "mesh:0", format: "glb" },
    material: null,
    layerIds: ["l1"],
    isGhost: false,
    evidenceContentIds: [],
    label: "Wall 1",
  };
  return {
    revision: 1,
    nodes: [node],
    layers: [{ layerId: "l1", name: "L", visibleByDefault: true }],
    siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    ghostSummary: null,
  };
}

describe("law 1 — substitution is not semantics change", () => {
  test("scene runtime: two fresh doubles produce identical observable behavior", () => {
    const a = new InMemorySceneRuntimeDouble();
    const b = new InMemorySceneRuntimeDouble();
    for (const rt of [a, b]) {
      const loaded = rt.loadScene(oneNodeScene());
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) continue;
      const camera = {
        position: [4, 5, 6] as const,
        target: [0, 0, 0] as const,
        up: [0, 1, 0] as const,
        fovRadians: 1.1,
        mode: "fly" as const,
      };
      expect(rt.setCamera(loaded.value, camera).ok).toBe(true);
      const got = rt.getCamera(loaded.value);
      expect(got.ok).toBe(true);
      if (got.ok) expect(got.value).toEqual(camera);
      const bounds = rt.getWorldBounds(loaded.value);
      expect(bounds.ok).toBe(true);
      if (bounds.ok) {
        expect(bounds.value.min).toEqual([0, 1, 2]);
        expect(bounds.value.max).toEqual([2, 3, 4]);
      }
    }
  });

  test("usd composition: identical inputs compose identically across instances", () => {
    const input = {
      baseScene: oneNodeScene(),
      layers: [
        { layerId: "L1", strength: 2, overrides: [{ elementId: "wall-1", transform: translation(9, 9, 9) }] },
      ],
      variantSets: [],
      payloads: [],
      timeSamples: [],
      selectedVariants: [],
      loadedPayloadRegions: [],
      evaluateAtSeconds: null,
      pathBindings: [{ usdPath: "/AISE/wall_1", elementId: "wall-1" }],
    };
    const r1 = new InMemoryUsdCompositionDouble().compose(input);
    const r2 = new InMemoryUsdCompositionDouble().compose(input);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.composedScene).toEqual(r2.value.composedScene);
      expect(r1.value.opinionProvenance).toEqual(r2.value.opinionProvenance);
    }
  });

  test("gltf delivery: the real parser is shared truth — both doubles validate identically", () => {
    const json = JSON.stringify({
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ mode: 4, attributes: { POSITION: 0 } }] }],
      accessors: [{ componentType: 5126, count: 3, type: "VEC3", bufferView: 0 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
      buffers: [{ byteLength: 36 }],
    });
    const bytes = new TextEncoder().encode(json);
    const d1 = new InMemoryGltfDeliveryDouble();
    const d2 = new InMemoryGltfDeliveryDouble();
    const r1 = d1.deliver({ assetId: "x", format: "gltf-json", bytes });
    const r2 = d2.deliver({ assetId: "x", format: "gltf-json", bytes });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.asset.totalVertexCount).toBe(r2.value.asset.totalVertexCount);
      expect(r1.value.partIds).toEqual(r2.value.partIds);
    }
  });
});

describe("law 2 — tolerances are declared, never implicit", () => {
  test("geospatial: the declared tolerance is positive, finite, and honored by round-trips", () => {
    const geo = new InMemoryGeospatialDouble();
    const tol = geo.capabilities.declaredToleranceMetres;
    expect(Number.isFinite(tol)).toBe(true);
    expect(tol).toBeGreaterThan(0);
    const ctx = geo.establishSiteContext(
      {
        anchor: { latitudeDeg: 51.5074, longitudeDeg: -0.1278, heightM: 11 },
        accuracyMetres: 0.2,
        derivedFrom: [],
      },
      { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    );
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return;
    // property: round-trip drift stays under the DECLARED tolerance across a grid
    for (let x = -100; x <= 100; x += 25) {
      for (let y = -100; y <= 100; y += 50) {
        const g = geo.siteToGeodetic(ctx.value, [x, y, 0]);
        expect(g.ok).toBe(true);
        if (!g.ok) continue;
        const back = geo.geodeticToSite(ctx.value, g.value);
        expect(back.ok).toBe(true);
        if (!back.ok) continue;
        const drift = Math.hypot(back.value[0] - x, back.value[1] - y, back.value[2] - 0);
        expect(drift).toBeLessThan(tol);
      }
    }
  });

  test("no double hides a real difference behind an average: refusals carry exact values", () => {
    const ing = new InMemoryAssimpIngestDouble();
    const res = ing.ingest({
      sourceId: "s",
      declaredFamily: "stl",
      bytes: new TextEncoder().encode("x"),
      unitScaleToMetre: 1,
    });
    expect(isRefusal(res)).toBe(true);
    if (isRefusal(res)) {
      // the refusal states the exact family and reason — no fuzzy language
      expect(res.failure.detail).toContain("stl");
    }
  });
});

describe("law 3 — unsupported is recorded, never computed", () => {
  const doubles = [
    { name: "babylon.scene-runtime", cap: new InMemorySceneRuntimeDouble().capabilities.blocked },
    { name: "cesium.geospatial", cap: new InMemoryGeospatialDouble().capabilities.blocked },
    { name: "usd.composition", cap: new InMemoryUsdCompositionDouble().capabilities.blocked },
    { name: "gltf.runtime-asset", cap: new InMemoryGltfDeliveryDouble().capabilities.blocked },
    { name: "assimp.ingest", cap: new InMemoryAssimpIngestDouble().capabilities.blocked },
  ];

  test("every double declares at least one BLOCKED capability with a reason", () => {
    for (const d of doubles) {
      expect(d.cap.length).toBeGreaterThan(0);
      for (const b of d.cap) {
        expect(b.capability.length).toBeGreaterThan(0);
        expect(b.reason.length).toBeGreaterThan(10);
      }
    }
  });

  test("every GPU/native-only path points at the WORLD-P1 measurement protocol", () => {
    for (const d of doubles) {
      for (const b of d.cap) {
        if (/gpu|render|stream|native|sidecar|parse$/i.test(b.capability) || b.reason.includes("GPU")) {
          expect(b.reason).toContain("WORLD-P1");
        }
      }
    }
  });

  test("the doubles refuse outside their declared surface with typed codes — zero fabricated output", () => {
    // scene runtime: bad scene
    const rt = new InMemorySceneRuntimeDouble();
    expect(isRefusal(rt.loadScene({
      ...oneNodeScene(),
      nodes: [{ ...oneNodeScene().nodes[0]!, elementId: "dup" }, { ...oneNodeScene().nodes[0]!, elementId: "dup" }],
    }))).toBe(true);
    // geospatial: bad anchor
    const geo = new InMemoryGeospatialDouble();
    expect(
      isRefusal(
        geo.establishSiteContext(
          { anchor: { latitudeDeg: 999, longitudeDeg: 0, heightM: 0 }, accuracyMetres: 1, derivedFrom: [] },
          { origin: [0, 0, 0], northHeading: 0, units: "metre" },
        ),
      ),
    ).toBe(true);
    // usd: identity leak
    const usd = new InMemoryUsdCompositionDouble();
    expect(
      isRefusal(
        usd.compose({
          baseScene: oneNodeScene(),
          layers: [{ layerId: "L", strength: 1, overrides: [{ elementId: "unknown", transform: translation(0, 0, 0) }] }],
          variantSets: [],
          payloads: [],
          timeSamples: [],
          selectedVariants: [],
          loadedPayloadRegions: [],
          evaluateAtSeconds: null,
          pathBindings: [],
        }),
      ),
    ).toBe(true);
    // gltf: malformed
    const gltf = new InMemoryGltfDeliveryDouble();
    expect(isRefusal(gltf.deliver({ assetId: "x", format: "gltf-json", bytes: new TextEncoder().encode("nope") }))).toBe(true);
    // assimp: unsupported family
    const ing = new InMemoryAssimpIngestDouble();
    expect(
      isRefusal(ing.ingest({ sourceId: "s", declaredFamily: "fbx", bytes: new Uint8Array(1), unitScaleToMetre: 1 })),
    ).toBe(true);
  });
});

describe("the whole package is substrate-free (the physical substitution proof)", () => {
  test("no substrate module is imported anywhere in the package source", async () => {
    const pkgRoot = new URL(".", import.meta.url).pathname;
    const files = [
      "scene.ts", "errors.ts", "index.ts",
      "babylon/contract.ts", "babylon/double.ts",
      "cesium/contract.ts", "cesium/double.ts",
      "usd/contract.ts", "usd/double.ts",
      "gltf/contract.ts", "gltf/double.ts", "gltf/parse.ts",
      "assimp/contract.ts", "assimp/double.ts",
    ];
    for (const f of files) {
      const text = await Bun.file(pkgRoot + f).text();
      expect(text).not.toContain("from \"@babylonjs");
      expect(text).not.toContain("from \"cesium");
      expect(text).not.toContain("from \"@cesium");
      expect(text).not.toContain("from \"@pxr");
      expect(text).not.toContain("require(\"assimp");
      expect(text).not.toContain("from \"three");
    }
  });
});
