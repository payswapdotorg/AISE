/**
 * WORLD-P5 — the measurement CORPUS generator (shared by the Node and
 * browser legs of the measurement protocol).
 *
 * THE LAW (the P1 fixture discipline): every coordinate is INTEGER-
 * EXACT (IEEE-754 exact fixtures — the substitution-double
 * byte-identity discipline), every box is DECLARED (never invented),
 * every id is AISE-shaped (never a substrate id), and the generation
 * is DETERMINISTIC (no clock, no randomness — the same corpus
 * rebuilds byte-identically in Node and in the browser bundle, which
 * is what makes the two legs measure the SAME world).
 *
 * Browser-safe: ZERO imports (pure data generation over inline P0-A
 * scene-composition shapes).
 */

export interface FixtureBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface ViewportFixture {
  readonly nodeCount: number;
  /** The ComposedScene the adapter ingests (ingested-mesh references). */
  readonly scene: {
    readonly revision: number;
    readonly nodes: readonly {
      readonly elementId: string;
      readonly kind: "element";
      readonly parentId: null;
      readonly transform: { readonly matrix: readonly number[] };
      readonly geometry: {
        readonly assetId: string;
        readonly partId: string;
        readonly format: "ingested-mesh";
      };
      readonly material: null;
      readonly layerIds: readonly string[];
      readonly isGhost: boolean;
      readonly evidenceContentIds: readonly string[];
      readonly label: string | null;
    }[];
    readonly layers: readonly {
      readonly layerId: string;
      readonly name: string;
      readonly visibleByDefault: boolean;
    }[];
    readonly siteFrame: {
      readonly origin: readonly [number, number, number];
      readonly northHeading: number;
      readonly units: "metre";
    };
    readonly ghostSummary: null;
  };
  /** The declared boxes by assetId (the geometry resolver's table). */
  readonly boxes: ReadonlyMap<string, FixtureBox>;
  /** The measurement camera (sees the whole grid). */
  readonly camera: {
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
    readonly up: readonly [number, number, number];
    readonly fovRadians: number;
    readonly mode: "orbit";
  };
}

const LAYERS = [
  { layerId: "capture-reality", name: "Captured reality", visibleByDefault: true },
  { layerId: "plan-model", name: "Plan / BIM model", visibleByDefault: true },
  { layerId: "coverage", name: "Capture coverage", visibleByDefault: true },
  { layerId: "annotations", name: "Annotations", visibleByDefault: true },
] as const;

/**
 * One fixture: N nodes laid out as a deterministic 20×20 grid of
 * 2 m integer boxes spaced 3 m apart (stacked in z every 400 nodes),
 * layer membership cycling over the four declared layers, each node
 * carrying a 64-hex-style evidence digest.
 */
export function viewportFixture(nodeCount: number): ViewportFixture {
  const nodes: ViewportFixture["scene"]["nodes"] = [];
  const boxes = new Map<string, FixtureBox>();
  for (let i = 0; i < nodeCount; i++) {
    const gx = (i % 20) * 3;
    const gy = (Math.floor(i / 20) % 20) * 3;
    const gz = Math.floor(i / 400) * 3;
    const elementId = `fixture-el-${String(i)}`;
    const assetId = `fixture-box-${String(i)}`;
    nodes.push({
      elementId,
      kind: "element",
      parentId: null,
      transform: {
        matrix: [
          1, 0, 0, gx,
          0, 1, 0, gy,
          0, 0, 1, gz,
          0, 0, 0, 1,
        ],
      },
      geometry: { assetId, partId: "part-001", format: "ingested-mesh" },
      material: null,
      layerIds: [LAYERS[i % 4]!.layerId],
      isGhost: false,
      evidenceContentIds: [
        // a stable 64-hex-style digest per node (declared data)
        (String(i).padStart(4, "0") + "a5e").padEnd(64, "0").slice(0, 64),
      ],
      label: `fixture element ${String(i)}`,
    });
    boxes.set(assetId, {
      min: [gx, gy, gz],
      max: [gx + 2, gy + 2, gz + 2],
    });
  }
  return {
    nodeCount,
    scene: {
      revision: 1,
      nodes,
      layers: LAYERS.map((l) => ({ ...l })),
      siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
      ghostSummary: null,
    },
    boxes,
    camera: {
      position: [30, -42, 48],
      target: [30, 30, 1],
      up: [0, 0, 1],
      fovRadians: 0.9,
      mode: "orbit",
    },
  };
}

/** The fixture sizes the protocol pins (the P0-A/P1 sizes). */
export const FIXTURE_SIZES = [10, 100, 1000] as const;
