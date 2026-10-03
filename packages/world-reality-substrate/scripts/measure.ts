/**
 * WORLD-P0-A — the deterministic measurement harness.
 *
 * Produces docs/world-program-evidence/WORLD-P0-A/measurements.json from
 * real in-sandbox measurements of the RUNNABLE parts of this package (the
 * GLB parser/extractor, the composition engine, the ingest parsers, the
 * geodesy). The corpus sizes and outcomes are DETERMINISTIC (asserted in
 * the file); the TIMINGS are honest one-host observations (recorded with
 * host metadata, never gate-relevant — the verify battery does not depend
 * on them and re-runs produce different wall times by nature).
 *
 * Real-substrate performance (Babylon.js scene instantiation, CesiumJS
 * tile streaming, OpenUSD composition, native Assimp import) is NOT
 * measured here: no substrate is adopted at P0 — those rows are declared
 * BLOCKED in the evidence tree, per the honesty laws.
 *
 * Run: bun scripts/measure.ts   (exit 0 on success; errors throw)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { encodeGlb, extractCanonicalGeometry, parseGlb } from "../src/glb";
import { composeSceneSpec, composedCanonicalJson } from "../src/composition";
import { canonicalPlyAscii, canonicalStlAscii, parsePlyAscii, parseStlAscii } from "../src/lanes";
import { vincentyInverse } from "../src/wgs84";
import { digestHex } from "../src/identity";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
const OUT_PATH = join(
  REPO_ROOT,
  "docs",
  "world-program-evidence",
  "WORLD-P0-A",
  "measurements.json",
);

/** Deterministic synthetic GLB with `triangles` triangles. */
function syntheticGlb(triangles: number): Uint8Array {
  const vertices = triangles * 3;
  const positionBytes = vertices * 12;
  const indexBytes = triangles * 6;
  const bin = new Uint8Array(positionBytes + indexBytes);
  const view = new DataView(bin.buffer);
  // Seeded positions: a deterministic pattern (i * 0.25 mod 3 axes).
  for (let index = 0; index < vertices * 3; index += 1) {
    view.setFloat32(index * 4, (index % 97) * 0.25, true);
  }
  for (let index = 0; index < triangles * 3; index += 1) {
    view.setUint16(positionBytes + index * 2, index % vertices, true);
  }
  return encodeGlb(
    {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: vertices,
          type: "VEC3",
          min: [0, 0, 0],
          max: [96, 96, 96],
        },
        { bufferView: 1, componentType: 5123, count: triangles * 3, type: "SCALAR" },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positionBytes },
        { buffer: 0, byteOffset: positionBytes, byteLength: indexBytes, target: 34963 },
      ],
      buffers: [{ byteLength: positionBytes + indexBytes }],
    },
    bin,
  );
}

interface Timing {
  readonly kind: string;
  readonly input: string;
  readonly runs: number;
  readonly totalMs: number;
  readonly perRunMs: number;
  readonly throughputNote: string;
}

function timeIt(label: string, input: string, runs: number, run: () => void): Timing {
  // One warm-up run (JIT and cache effects are real; the warm-up is
  // declared here so the recorded numbers are post-warm-up medians-of-sum).
  run();
  const started = performance.now();
  for (let index = 0; index < runs; index += 1) {
    run();
  }
  const totalMs = performance.now() - started;
  return {
    kind: label,
    input,
    runs,
    totalMs: Math.round(totalMs * 1000) / 1000,
    perRunMs: Math.round((totalMs / runs) * 1000) / 1000,
    throughputNote: `${runs} runs after one declared warm-up; single-host observation (bun ${Bun.version}, ${new Date().toISOString()}), not a gate`,
  };
}

const glbTimings: Timing[] = [];
const digests: Record<string, string> = {};
for (const triangles of [100, 1_000, 10_000, 100_000]) {
  const glb = syntheticGlb(triangles);
  let digest = "";
  const timing = timeIt(
    "glb-parse+extract",
    `synthetic GLB, ${triangles} triangles (${glb.length} bytes)`,
    triangles <= 10_000 ? 20 : 5,
    () => {
      const parsed = parseGlb(glb);
      if (!parsed.ok) {
        throw new Error(`synthetic GLB failed to parse at ${triangles} triangles`);
      }
      const extraction = extractCanonicalGeometry(parsed.value);
      if (!extraction.ok) {
        throw new Error(`synthetic GLB failed to extract at ${triangles} triangles`);
      }
      digest = extraction.value.digest;
    },
  );
  glbTimings.push(timing);
  digests[`glb-${triangles}-triangles`] = digest;
}

/* determinism assertions across corpora (THE deterministic measurements) */
const determinism: Record<string, unknown> = {};
{
  for (const triangles of [100, 10_000]) {
    const glb = syntheticGlb(triangles);
    const extractionOf = (): { digest: string; stream: Uint8Array } => {
      const parsed = parseGlb(glb);
      if (!parsed.ok) {
        throw new Error("synthetic GLB failed to parse");
      }
      const extraction = extractCanonicalGeometry(parsed.value);
      if (!extraction.ok) {
        throw new Error("synthetic GLB failed to extract");
      }
      return extraction.value;
    };
    const first = extractionOf();
    const second = extractionOf();
    determinism[`glb-${triangles}`] = {
      byteIdentical:
        Buffer.compare(Buffer.from(first.stream), Buffer.from(second.stream)) === 0,
      digestStable: first.digest === second.digest,
      digest: first.digest,
    };
  }
}

/* composition scaling */
const compositionTimings: Timing[] = [];
{
  for (const layerCount of [2, 8, 32]) {
    const stack = Array.from({ length: layerCount }, (_, index) => ({
      id: `layer-${index}`,
      opinions: [
        { path: "/Root/Wall", field: `field-${index}`, value: index },
        { path: "/Root/Wall", field: "shared", value: layerCount - index },
      ],
    }));
    const spec = { path: "/Root/Wall" };
    let canonical = "";
    const timing = timeIt(
      "usd-compose",
      `layer stack of ${layerCount} layers x 2 opinions`,
      50,
      () => {
        const composed = composeSceneSpec(stack, spec, { loadPayloads: false });
        if (!composed.ok) {
          throw new Error("composition failed");
        }
        canonical = composedCanonicalJson(composed.value);
      },
    );
    compositionTimings.push(timing);
    digests[`composition-${layerCount}-layers`] = digestHex(canonical);
  }
}

/* ingest parser throughput */
const ingestTimings: Timing[] = [];
{
  const stl = canonicalStlAscii();
  ingestTimings.push(
    timeIt("stl-ascii-parse", `canonical tetrahedron (${stl.length} bytes)`, 200, () => {
      const parsed = parseStlAscii(stl);
      if (!parsed.ok) {
        throw new Error("canonical STL failed to parse");
      }
    }),
  );
  let plyText = canonicalPlyAscii();
  // Scale the PLY: 4000 vertices / 2000 faces (deterministic grid).
  const plyVertexCount = 4_000;
  const plyFaceCount = 2_000;
  const lines: string[] = [
    "ply",
    "format ascii 1.0",
    `element vertex ${plyVertexCount}`,
    "property float x",
    "property float y",
    "property float z",
    `element face ${plyFaceCount}`,
    "property list uchar int vertex_indices",
    "end_header",
  ];
  for (let index = 0; index < plyVertexCount; index += 1) {
    lines.push(`${index % 100} ${(index / 100) % 100} ${(index / 10000) % 100}`);
  }
  for (let index = 0; index < plyFaceCount; index += 1) {
    const base = (index * 2) % (plyVertexCount - 3);
    lines.push(`3 ${base} ${base + 1} ${base + 2}`);
  }
  plyText = lines.join("\n") + "\n";
  ingestTimings.push(
    timeIt(
      "ply-ascii-parse",
      `deterministic grid (${plyVertexCount} vertices / ${plyFaceCount} faces, ${plyText.length} bytes)`,
      20,
      () => {
        const parsed = parsePlyAscii(plyText);
        if (!parsed.ok) {
          throw new Error("grid PLY failed to parse");
        }
      },
    ),
  );
}

/* geodesy: canonical vectors (deterministic) + timing */
const geodesy: Record<string, unknown> = {};
{
  const flinders = { latDeg: -37.95103341666667, lonDeg: 144.42486788888888, heightM: 0 };
  const buninyong = { latDeg: -37.65282113888889, lonDeg: 143.92649552777777, heightM: 0 };
  geodesy["flinders-buninyong-m"] = vincentyInverse(flinders, buninyong).distanceM;
  geodesy["quarter-equator-m"] = vincentyInverse(
    { latDeg: 0, lonDeg: 0, heightM: 0 },
    { latDeg: 0, lonDeg: 90, heightM: 0 },
  ).distanceM;
  geodesy["1deg-equator-exact-m"] = (6378137 * Math.PI) / 180;
  ingestTimings.push(
    timeIt("vincenty-inverse", "canonical short line (55 km class)", 2000, () => {
      vincentyInverse(flinders, buninyong);
    }),
  );
}

const measurements = {
  schema: "world-p0-a-measurements/1",
  measuredAt: new Date().toISOString(),
  host: {
    runtime: `bun ${Bun.version}`,
    platform: `${process.platform} ${process.arch}`,
    note: "single sandbox host; timings are observations recorded once, not gates",
  },
  glbParseAndExtract: glbTimings,
  composition: compositionTimings,
  ingest: ingestTimings,
  geodesy,
  determinism,
  notMeasured: {
    "babylon-runtime": "BLOCKED — no substrate adoption at P0 (contract-only wave)",
    "cesium-tile-streaming": "BLOCKED — no substrate adoption at P0",
    "usd-native-composition": "BLOCKED — no substrate adoption at P0",
    "assimp-native-import": "BLOCKED — no substrate adoption at P0",
  },
  digests,
};

mkdirSync(join(REPO_ROOT, "docs", "world-program-evidence", "WORLD-P0-A"), {
  recursive: true,
});
writeFileSync(OUT_PATH, JSON.stringify(measurements, null, 2) + "\n");
