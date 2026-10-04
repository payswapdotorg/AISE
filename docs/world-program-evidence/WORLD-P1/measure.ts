/**
 * WORLD-P1 — the contract-level PERFORMANCE MEASUREMENT HARNESS.
 *
 * The harness IS the method (the P0-A discipline): it generates the
 * realistic fixture corpora, runs the REAL lane transforms (the pure
 * contract functions of `@aise/world-layer1-experience`) and writes
 * `measurements-raw.txt`. Re-run from the repo root with:
 *
 *   bun docs/world-program-evidence/WORLD-P1/measure.ts
 *
 * ZERO fabricated numbers: every number in PERFORMANCE-OBSERVATIONS.md
 * comes from the run recorded in measurements-raw.txt.
 *
 * Measured surfaces (the P1 lane's contract core — no substrate, no
 * GPU, no network):
 *
 *  1. SPATIALIZE throughput on generated capture sessions (N assets,
 *     N/2 with declared poses+volumes, the rest omitted or unplaced);
 *  2. REGISTER latency on the fixture hypotheses;
 *  3. RECONSTRUCT (world composition) on generated fragment sets
 *     (10/100/1000 placed assets + 100 plan elements);
 *  4. NAVIGATE: layer-toggle resolution + bookmark capture/resolve
 *     round-trips on the composed worlds;
 *  5. COMPARE: tolerance-declared comparison on generated pair sets;
 *  6. MEASURE: the five query kinds over the composed worlds;
 *  7. EVIDENCE: what-is-here + what-changed over the worlds;
 *  8. FAIL-CLOSED cost: refusal latency vs the happy path.
 */

import {
  spatializeCaptureSession,
  registerCaptureFragment,
  composeReconstructionWorld,
  applyLayerToggles,
  captureNavigationBookmark,
  compareModelToCapture,
  runMeasurementQueries,
  queryWhatIsHere,
  queryWhatChanged,
  bindWorldEvidence,
  type NavigableWorld,
  type CaptureSessionEnvelope,
  type ComparisonRequest,
} from "../../../packages/world-layer1-experience/src/index";
import {
  FIXTURE_SITE_FRAME,
  FIXTURE_SPATIALIZATION_REQUEST,
  FIXTURE_REGISTRATION_REQUEST,
  FIXTURE_PLAN_MODEL,
  FIXTURE_CAPTURE_SESSION,
  FIXTURE_TOLERANCE,
  FIXTURE_NEAR_BOUNDARY_BAND,
  FIXTURE_UNITS,
  fixtureContentIdOf,
} from "../../../packages/world-layer1-experience/src/fixtures";
import { CONTRACT_VERSION } from "../../../packages/shared-contracts/src/index";

/* ------------------------------------------------------------------ */
/* Corpus generation                                                    */
/* ------------------------------------------------------------------ */

function generatedSession(n: number): CaptureSessionEnvelope {
  const assets = [];
  for (let i = 0; i < n; i++) {
    const spatial = i % 2 === 0;
    const pose = spatial ? [i, i % 10, 2] : null;
    const volume = spatial
      ? {
          "layer1.volume.min.x.m": String(i - 2),
          "layer1.volume.min.y.m": String((i % 10) - 2),
          "layer1.volume.min.z.m": "0",
          "layer1.volume.max.x.m": String(i + 2),
          "layer1.volume.max.y.m": String((i % 10) + 2),
          "layer1.volume.max.z.m": "6",
          "layer1.volume.basis": "generated-harness",
        }
      : {};
    assets.push({
      contractVersion: CONTRACT_VERSION,
      contentId: fixtureContentIdOf(`harness-asset-${i}`),
      byteSize: 1_000_000,
      mediaType: i % 3 === 0 ? "audio/ogg" : "image/jpeg",
      capturedAt: "2026-10-04T00:00:00.000Z",
      acquisitionMethod: i % 3 === 0 ? "VOICE_NOTE" : "STILL_IMAGERY",
      acquisitionMetadata: {
        ...(pose
          ? {
              "layer1.pose.x.m": String(pose[0]),
              "layer1.pose.y.m": String(pose[1]),
              "layer1.pose.z.m": String(pose[2]),
            }
          : {}),
        ...volume,
      },
    });
  }
  return {
    ...FIXTURE_CAPTURE_SESSION,
    sessionId: `session-harness-${n}`,
    assets,
  };
}

function registeredFragmentFor(assetCount: number) {
  const spatialized = spatializeCaptureSession({
    envelope: generatedSession(assetCount),
    siteFrame: FIXTURE_SITE_FRAME,
    declaredAt: "2026-10-04T00:00:00.000Z",
  });
  if (!spatialized.ok) throw new Error(spatialized.failure.detail);
  const hypotheses = spatialized.value.assets.slice(0, 2).map((asset, index) => ({
    ...FIXTURE_REGISTRATION_REQUEST.hypotheses[index]!,
    evidenceContentId: asset.evidenceContentId,
  }));
  const registered = registerCaptureFragment({
    fragment: spatialized.value,
    hypotheses,
    candidateAnchor: { latitudeDeg: 47.3769, longitudeDeg: 8.5417, heightM: 408 },
    declaredAccuracyMetres: 0.5,
    declaredAt: "2026-10-04T00:00:00.000Z",
  });
  if (!registered.ok) throw new Error(registered.failure.detail);
  return registered.value.fragment;
}

function composedWorldFor(assetCount: number, planElements: number, revision: number) {
  const plan = {
    ...FIXTURE_PLAN_MODEL,
    elements: Array.from({ length: planElements }, (_, i) => ({
      ...FIXTURE_PLAN_MODEL.elements[0]!,
      elementId: `plan-harness-${i}`,
      translation: [i, i % 20, 0] as const,
    })),
  };
  const outcome = composeReconstructionWorld({
    fragments: [registeredFragmentFor(assetCount)],
    planModel: plan,
    siteFrame: FIXTURE_SITE_FRAME,
    georeference: null,
    worldRevision: revision,
    declaredAt: "2026-10-04T00:00:00.000Z",
  });
  if (!outcome.ok) throw new Error(outcome.failure.detail);
  return outcome.value;
}

function comparisonRequestFor(pairs: number, worldRevision: number): ComparisonRequest {
  return {
    worldRevision,
    pairs: Array.from({ length: pairs }, (_, i) => ({
      modelElementId: `plan-harness-${i}`,
      captureElementId: `capture-harness-${i}`,
      modelShape: {
        kind: "box" as const,
        name: null,
        min: { x: i, y: 0, z: 0 },
        max: { x: i + 2, y: 4, z: 3 },
      },
      captureShape: {
        kind: "box" as const,
        name: null,
        min: { x: i, y: 1, z: 0 },
        max: { x: i + 2, y: 5, z: 3 },
      },
    })),
    unpairedModelElementIds: [],
    unpairedCaptureElementIds: [],
    tolerance: FIXTURE_TOLERANCE,
    nearBoundaryBand: FIXTURE_NEAR_BOUNDARY_BAND,
    units: FIXTURE_UNITS,
    declaredAt: "2026-10-04T00:00:00.000Z",
  };
}

/* ------------------------------------------------------------------ */
/* Measurement helpers                                                  */
/* ------------------------------------------------------------------ */

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function measure(label: string, runs: number, op: () => void): string {
  // warmup (JIT)
  for (let i = 0; i < 3; i++) op();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    op();
    samples.push(performance.now() - start);
  }
  return `${label} | runs=${runs} | median=${median(samples).toFixed(4)} ms`;
}

/* ------------------------------------------------------------------ */
/* The run                                                              */
/* ------------------------------------------------------------------ */

const lines: string[] = [];
function emit(line: string): void {
  lines.push(line);
}

emit("WORLD-P1 contract-level performance measurements (REAL run)");
emit(`recorded: ${new Date().toISOString()}`);
emit("sandbox: AISE station (bun " + Bun.version + ", Linux x64, no GPU, no substrate)");
emit("");

emit("== 1. SPATIALIZE (generated capture sessions, N assets) ==");
for (const n of [10, 100, 1000]) {
  const request = {
    envelope: generatedSession(n),
    siteFrame: FIXTURE_SITE_FRAME,
    declaredAt: "2026-10-04T00:00:00.000Z",
  };
  emit(measure(`spatialize N=${n}`, 25, () => void spatializeCaptureSession(request)));
}
emit("");

emit("== 2. REGISTER (fixture hypotheses, 2 admitted) ==");
emit(measure("register", 25, () => void registerCaptureFragment(FIXTURE_REGISTRATION_REQUEST)));
emit("");

emit("== 3. RECONSTRUCT (world composition; placed assets + 100 plan elements) ==");
const worlds = new Map<number, NavigableWorld>();
for (const n of [10, 100, 1000]) {
  const world = composedWorldFor(n, 100, 1);
  worlds.set(n, world);
  emit(
    measure(
      `compose assets=${n} plan=100 nodes=${world.scene.nodes.length}`,
      25,
      () => void composeReconstructionWorld({
        fragments: [registeredFragmentFor(n)],
        planModel: {
          ...FIXTURE_PLAN_MODEL,
          elements: Array.from({ length: 100 }, (_, i) => ({
            ...FIXTURE_PLAN_MODEL.elements[0]!,
            elementId: `plan-harness-${i}`,
            translation: [i, i % 20, 0] as const,
          })),
        },
        siteFrame: FIXTURE_SITE_FRAME,
        georeference: null,
        worldRevision: 1,
        declaredAt: "2026-10-04T00:00:00.000Z",
      }),
    ),
  );
}
emit("");

emit("== 4. NAVIGATE (layer toggles + bookmark round-trip) ==");
for (const n of [10, 100, 1000]) {
  const world = worlds.get(n)!;
  emit(
    measure(`layer-toggles nodes=${world.scene.nodes.length}`, 100, () =>
      void applyLayerToggles(world, [
        { layerId: "plan-model", visible: false },
        { layerId: "coverage", visible: true },
      ]),
    ),
  );
}
{
  const world = worlds.get(1000)!;
  const view = applyLayerToggles(world, []);
  if (!view.ok) throw new Error(view.failure.detail);
  emit(
    measure("bookmark capture+resolve (1000-node world)", 100, () => {
      const bookmark = captureNavigationBookmark(
        world,
        view.value,
        {
          position: [10, 10, 10] as const,
          target: [0, 0, 0] as const,
          up: [0, 0, 1] as const,
          fovRadians: Math.PI / 4,
          mode: "orbit" as const,
        },
        null,
        [],
        "harness",
        "2026-10-04T00:00:00.000Z",
      );
      if (!bookmark.ok) throw new Error(bookmark.failure.detail);
    }),
  );
}
emit("");

emit("== 5. COMPARE (tolerance-declared comparison, N pairs) ==");
for (const n of [10, 100, 1000]) {
  const request = comparisonRequestFor(n, 1);
  emit(measure(`compare pairs=${n}`, 25, () => void compareModelToCapture(request)));
}
emit("");

emit("== 6. MEASURE (the five query kinds over the composed worlds) ==");
for (const n of [10, 100, 1000]) {
  const world = worlds.get(n)!;
  const first = world.elementProvenance[0]!.elementId;
  const second = world.elementProvenance[1]?.elementId ?? first;
  const queries = [
    {
      queryId: "h-point",
      kind: "point" as const,
      elementId: first,
      tolerance: FIXTURE_TOLERANCE,
      units: FIXTURE_UNITS,
    },
    {
      queryId: "h-line",
      kind: "line" as const,
      fromElementId: first,
      toElementId: second,
      tolerance: FIXTURE_TOLERANCE,
      units: FIXTURE_UNITS,
    },
    {
      queryId: "h-area",
      kind: "area" as const,
      elementId: first,
      declaredPolygon: {
        kind: "polygon" as const,
        name: null,
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 4, y: 0, z: 0 },
          { x: 4, y: 4, z: 0 },
          { x: 0, y: 4, z: 0 },
        ],
      },
      tolerance: FIXTURE_TOLERANCE,
      units: FIXTURE_UNITS,
    },
    {
      queryId: "h-volume",
      kind: "volume" as const,
      elementId: first,
      declaredBox: {
        kind: "box" as const,
        name: null,
        min: { x: 0, y: 0, z: 0 },
        max: { x: 3, y: 4, z: 5 },
      },
      tolerance: FIXTURE_TOLERANCE,
      units: FIXTURE_UNITS,
    },
    {
      queryId: "h-contain",
      kind: "point-in-region" as const,
      pointElementId: first,
      regionElementId: second,
      declaredPoint: { kind: "point" as const, name: null, at: { x: 2, y: 1, z: 0 } },
      declaredRegionPolygon: {
        kind: "polygon" as const,
        name: null,
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 8, y: 0, z: 0 },
          { x: 8, y: 8, z: 0 },
          { x: 0, y: 8, z: 0 },
        ],
      },
      tolerance: FIXTURE_TOLERANCE,
      units: FIXTURE_UNITS,
    },
  ];
  emit(
    measure(`measure 5 queries nodes=${world.scene.nodes.length}`, 100, () =>
      void runMeasurementQueries(world, queries),
    ),
  );
}
emit("");

emit("== 7. EVIDENCE (what-is-here + what-changed + world binding) ==");
for (const n of [10, 100, 1000]) {
  const world = worlds.get(n)!;
  emit(
    measure(`what-is-here nodes=${world.scene.nodes.length}`, 100, () =>
      void queryWhatIsHere(world, { point: [2, 1, 1], worldRevision: 1 }),
    ),
  );
}
{
  const worldA = worlds.get(1000)!;
  const worldB = composedWorldFor(1000, 101, 2);
  emit(
    measure("what-changed (1000→1001 nodes)", 25, () =>
      void queryWhatChanged({ fromWorld: worldA, toWorld: worldB }),
    ),
  );
  emit(measure("bind-world (1000-node world)", 25, () => void bindWorldEvidence(worldA)));
}
emit("");

emit("== 8. FAIL-CLOSED cost (refusal vs happy path) ==");
{
  const badInstant = spatializeCaptureSession({
    ...FIXTURE_SPATIALIZATION_REQUEST,
    declaredAt: "not-an-instant",
  });
  if (badInstant.ok) throw new Error("expected refusal");
  emit(
    measure("spatialize refusal (bad instant, fast path)", 100, () =>
      void spatializeCaptureSession({
        ...FIXTURE_SPATIALIZATION_REQUEST,
        declaredAt: "not-an-instant",
      }),
    ),
  );
  const tolless = compareModelToCapture({
    ...comparisonRequestFor(100, 1),
    tolerance: { linear: 0, angular: 0 },
  });
  if (tolless.ok) throw new Error("expected refusal");
  emit(
    measure("compare refusal (tolerance-less, 100 pairs scanned first)", 25, () =>
      void compareModelToCapture({
        ...comparisonRequestFor(100, 1),
        tolerance: { linear: 0, angular: 0 },
      }),
    ),
  );
}
emit("");
emit("END");

const report = lines.join("\n") + "\n";
const outPath = new URL("./measurements-raw.txt", import.meta.url);
await Bun.write(outPath, report);
console.log(report);
