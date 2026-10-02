// WORLD-P0-A performance measurement harness (REAL numbers, real runs).
// Method: generate GLB fixtures with known sizes, run the REAL parser
// (packages/world-reality-substrate/src/gltf/parse.ts) via bun, measure
// wall-clock with performance.now(), report bytes/sec and per-op costs.
// This file lives in the evidence tree (reproducibility = part of the
// evidence); it is not workspace source (docs/ is outside the lint/
// boundaries gates by the frozen-record convention).
// Run from the repo root: bun docs/world-program-evidence/WORLD-P0-A/measure.ts
import { parseGlb, validateGltfJson } from "../../../packages/world-reality-substrate/src/gltf/parse";
import { InMemorySceneRuntimeDouble } from "../../../packages/world-reality-substrate/src/babylon/double";
import { InMemoryGeospatialDouble } from "../../../packages/world-reality-substrate/src/cesium/double";
import { InMemoryUsdCompositionDouble } from "../../../packages/world-reality-substrate/src/usd/double";
import { translation } from "../../../packages/world-reality-substrate/src/scene";

function buildFixture(meshCount: number, verticesPerMesh: number, indicesPerMesh: number): Uint8Array {
  const nodes: unknown[] = [];
  const meshes: unknown[] = [];
  const accessors: unknown[] = [];
  for (let i = 0; i < meshCount; i++) {
    meshes.push({ name: `m${i}`, primitives: [{ mode: 4, attributes: { POSITION: 2 * i }, indices: 2 * i + 1 }] });
    nodes.push({ mesh: i });
    accessors.push({ componentType: 5126, count: verticesPerMesh, type: "VEC3", bufferView: 0 });
    accessors.push({ componentType: 5123, count: indicesPerMesh, type: "SCALAR", bufferView: 1 });
  }
  const vb = 12 * verticesPerMesh * meshCount;
  const ib = 2 * indicesPerMesh * meshCount;
  const doc = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    accessors,
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: vb },
      { buffer: 0, byteOffset: vb, byteLength: ib },
    ],
    buffers: [{ byteLength: vb + ib }],
  };
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const jsonPad = (4 - (json.byteLength % 4)) % 4;
  const total = 12 + 8 + json.byteLength + jsonPad; // JSON-only GLB (valid: BIN chunk optional)
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, json.byteLength + jsonPad, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  for (let i = 0; i < jsonPad; i++) out[20 + json.byteLength + i] = 0x20; // space padding per spec
  return out;
}

const results: string[] = [];
const report = (s: string): void => {
  results.push(s);
  console.log(s);
};

report("# WORLD-P0-A measured performance (this sandbox, real runs)");
report(`# runtime: bun ${Bun.version}; ${new Date().toISOString()}`);
report("");

// --- 1. glTF JSON + GLB parse throughput --------------------------------
report("## glTF parse throughput (REAL parser, generated GLB fixtures)");
report("| fixture | JSON bytes | runs | median ms | MB/s | verdict |");
report("|---|---|---|---|---|---|");
for (const [meshes, verts, idx] of [
  [10, 100, 240],
  [50, 400, 1200],
  [200, 1000, 3000],
  [800, 1000, 3000],
] as const) {
  const glb = buildFixture(meshes, verts, idx);
  const runs: number[] = [];
  for (let i = 0; i < 25; i++) {
    const t0 = performance.now();
    const res = parseGlb(glb);
    const t1 = performance.now();
    if (!res.ok) throw new Error("fixture failed to parse — measurement invalid");
    runs.push(t1 - t0);
  }
  runs.sort((a, b) => a - b);
  const median = runs[Math.floor(runs.length / 2)] ?? 0;
  const mbs = (glb.byteLength / 1024 / 1024) / (median / 1000);
  report(`| m${meshes} v${verts} i${idx} | ${glb.byteLength - 28} | 25 | ${median.toFixed(3)} | ${mbs.toFixed(1)} | ok |`);
}
report("");

// --- 2. malformed-asset refusal cost (fail-closed path) ------------------
report("## fail-closed refusal cost (malformed GLB, first-issue fast path)");
{
  const glb = buildFixture(50, 400, 1200);
  const corrupt = new Uint8Array(glb);
  corrupt[0] = 0x58;
  const runs: number[] = [];
  for (let i = 0; i < 25; i++) {
    const t0 = performance.now();
    parseGlb(corrupt);
    runs.push(performance.now() - t0);
  }
  runs.sort((a, b) => a - b);
  report(`- bad-magic refusal median over 25 runs: ${(runs[Math.floor(runs.length / 2)] ?? 0).toFixed(4)} ms`);
}
report("");

// --- 3. contract round-trip costs ----------------------------------------
report("## contract round-trip costs (doubles, 1000 ops unless noted)");
{
  const rt = new InMemorySceneRuntimeDouble();
  const scene = {
    revision: 1,
    nodes: Array.from({ length: 100 }, (_, i) => ({
      elementId: `n${i}`,
      kind: "element" as const,
      parentId: null,
      transform: translation(i, 0, 0),
      geometry: { assetId: "a", partId: "mesh:0", format: "glb" as const },
      material: null,
      layerIds: ["l"],
      isGhost: false,
      evidenceContentIds: [],
      label: null,
    })),
    layers: [{ layerId: "l", name: "L", visibleByDefault: true }],
    siteFrame: { origin: [0, 0, 0] as const, northHeading: 0, units: "metre" as const },
    ghostSummary: null,
  };
  const loaded = rt.loadScene(scene);
  if (!loaded.ok) throw new Error("scene load failed");
  const cam = { position: [1, 2, 3] as const, target: [0, 0, 0] as const, up: [0, 1, 0] as const, fovRadians: 1, mode: "orbit" as const };
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    rt.setCamera(loaded.value, cam);
    rt.getCamera(loaded.value);
  }
  report(`- scene-runtime setCamera+getCamera (100-node scene): ${((performance.now() - t0) / 1000).toFixed(4)} ms/op pair`);

  const t0p = performance.now();
  for (let i = 0; i < 1000; i++) rt.pick(loaded.value, 0.5, 0.5);
  report(`- scene-runtime pick (100-node scene): ${((performance.now() - t0p) / 1000).toFixed(4)} ms/op`);

  const geo = new InMemoryGeospatialDouble();
  const ctx = geo.establishSiteContext(
    { anchor: { latitudeDeg: 5.6037, longitudeDeg: -0.187, heightM: 75 }, accuracyMetres: 0.3, derivedFrom: [] },
    { origin: [0, 0, 0], northHeading: 0, units: "metre" },
  );
  if (!ctx.ok) throw new Error("geo ctx failed");
  const t0g = performance.now();
  for (let i = 0; i < 1000; i++) {
    const g = geo.siteToGeodetic(ctx.value, [12.5, -8.25, 3.75]);
    if (g.ok) geo.geodeticToSite(ctx.value, g.value);
  }
  report(`- geospatial site->geodetic->site round-trip: ${((performance.now() - t0g) / 1000).toFixed(4)} ms/op pair`);

  const usd = new InMemoryUsdCompositionDouble();
  const input = {
    baseScene: scene,
    layers: Array.from({ length: 8 }, (_, i) => ({
      layerId: `L${i}`,
      strength: i,
      overrides: Array.from({ length: 25 }, (_, j) => ({ elementId: `n${j}`, transform: translation(i, j, 0) })),
    })),
    variantSets: [],
    payloads: [],
    timeSamples: [],
    selectedVariants: [],
    loadedPayloadRegions: [],
    evaluateAtSeconds: null,
    pathBindings: scene.nodes.map((n) => ({ usdPath: `/AISE/${n.elementId}`, elementId: n.elementId })),
  };
  const t0u = performance.now();
  const runsU = 200;
  for (let i = 0; i < runsU; i++) usd.compose(input);
  report(`- usd compose (100 nodes, 8 layers x 25 overrides): ${((performance.now() - t0u) / runsU).toFixed(4)} ms/compose`);
}
report("");

// --- 4. validateGltfJson vs parseGlb overhead -----------------------------
report("## JSON-path vs GLB-path overhead (same document)");
{
  const glb = buildFixture(200, 1000, 3000);
  const jsonText = new TextDecoder().decode(glb.subarray(20)).trimEnd();
  const t0 = performance.now();
  for (let i = 0; i < 25; i++) validateGltfJson(jsonText);
  const jsonMs = (performance.now() - t0) / 25;
  const t1 = performance.now();
  for (let i = 0; i < 25; i++) parseGlb(glb);
  const glbMs = (performance.now() - t1) / 25;
  report(`- validateGltfJson median: ${jsonMs.toFixed(3)} ms; parseGlb (container + same JSON): ${glbMs.toFixed(3)} ms; container overhead: ${(glbMs - jsonMs).toFixed(3)} ms`);
}
report("");

// GPU items — declared BLOCKED per the packet
report("## GPU-dependent observations");
report("- ALL GPU-dependent measurements (rendering throughput, frame time, draw-call");
report("  cost, pick latency under a real render loop, sectioning cost on GPU, ghost");
report("  overlay cost) are declared:");
report("  BLOCKED: no GPU measurement protocol in P0 — recorded for WORLD-P1:");
report("  WORLD-P1 protocol: run the Babylon adapter on the WebGL/WebGPU reference");
report("  scene set (10/100/1000-node fixtures above) headless via Babylon NullEngine");
report("  for CPU-side scene-graph costs, then on a real GPU (headless-GL or a desktop");
report("  agent) for frame-time/draw-call measurements; report median/p95 over 25 runs");
report("  per fixture, same table shape as above, ZERO fabricated numbers.");

const here = import.meta.dir;
await Bun.write(`${here}/measurements-raw.txt`, results.join("\n") + "\n");
console.log(`\nwritten: ${here}/measurements-raw.txt`);
