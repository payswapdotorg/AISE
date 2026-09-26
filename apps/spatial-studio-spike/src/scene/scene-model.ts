/**
 * GBIM-003 — the presentation-grade scene model derivation.
 *
 * Derives renderable element specs from (a) the GBIM-000 canonical fixture
 * (the baseline reality) and (b) the engine's recorded operations (the
 * proposed overlay). This derivation is PRESENTATION-ONLY: positions are
 * deterministic spike conventions documented in
 * docs/productization-evidence/GBIM-003/fixture-mapping.md; no quantity,
 * validation or identity is ever computed here (the engine is the single
 * quantity authority; the browser cut of the contract holds the semantics).
 *
 * `decodeSceneSeedPayload` is the fail-closed guard against malformed
 * provider/renderer payloads (GBIM-000 neg-007): anything that is not a
 * well-formed scene seed list is REJECTED with a typed error and can never
 * reach the canonical side (scene seeds never flow into the engine anyway —
 * this guard protects the presentation surface from corrupting the view of
 * canonical state).
 *
 * Spike-only code (NOT production engine code).
 */

import type { CanonicalFixture, OperationRecordDto, SceneElementSeed } from "../types";

/* ------------------------------------------------------------------ */
/* Deterministic presentation layout (fixture -> boxes, meters)         */
/* ------------------------------------------------------------------ */

/**
 * Layout conventions (room-001 is 8 m along X, 6 m along Z, 3 m tall,
 * origin at room center, y=0 at slab top):
 *   - slab-001: 8 x 0.2 x 6 slab, top face at y=0;
 *   - wall-001: south perimeter wall (z = +2.9), 8 m long;
 *   - door opening at x=-2 (0.9 wide, 2.1 high, sill 0);
 *   - window opening at x=+1.5 (1.2 wide, 1.2 high, sill 0.9);
 *   - partition-001: internal wall across Z at x=0;
 *   - column-001: 0.3 x 0.3 at (3.5, -2.5), full height;
 *   - footing-001: 0.4 x 0.4 x 0.3 pad directly under the column;
 *   - beam-001: 0.25 wide x 0.4 deep spanning Z at x=-3.5 under the roof;
 *   - roof-001: thin plane at y=3.05.
 */
export function buildFixtureSceneSeed(fixture: CanonicalFixture, records: readonly OperationRecordDto[]): readonly SceneElementSeed[] {
  const room = fixture.geometry.room;
  const halfWidth = room.width_m / 2;
  const wallT = fixture.geometry.wall.thickness_m;
  const door = fixture.geometry.doorOpening;
  const window = fixture.geometry.windowOpening;
  const column = fixture.geometry.column;
  const footing = fixture.geometry.footing;
  const slab = fixture.geometry.slab;
  const beam = fixture.geometry.beam;
  const partition = fixture.geometry.partition;

  const engineOpByTarget = new Map<string, OperationRecordDto>();
  for (const record of records) {
    if (record.outcome === "applied" && record.targetElementId !== null) {
      engineOpByTarget.set(record.targetElementId, record);
    }
  }
  const op = (elementId: string): SceneElementSeed["engineOp"] => {
    const record = engineOpByTarget.get(elementId);
    return record === undefined || record.operationId === null || record.engineType === null
      ? null
      : { fixtureOpId: record.fixtureOpId, operationId: record.operationId, engineType: record.engineType };
  };

  const seeds: SceneElementSeed[] = [
    {
      aiseId: fixture.geometry.room.id,
      kind: "room",
      label: `${fixture.geometry.room.id} — 8 × 6 × 3 m room (context)`,
      box: { cx: 0, cy: room.height_m / 2, cz: 0, sx: room.length_m, sy: room.height_m, sz: room.width_m },
      source: "fixture-baseline",
      engineOp: null,
      material: null,
      fixtureRef: fixture.geometry.room.id,
    },
    {
      aiseId: slab.id,
      kind: "slab",
      label: `${slab.id} — 200 mm ground slab`,
      box: { cx: 0, cy: -slab.thickness_m / 2, cz: 0, sx: room.length_m, sy: slab.thickness_m, sz: room.width_m },
      source: "fixture-baseline",
      engineOp: op(slab.id),
      material: "plain-concrete",
      fixtureRef: slab.id,
    },
    {
      aiseId: fixture.geometry.wall.id,
      kind: "wall",
      label: `${fixture.geometry.wall.id} — 200 mm perimeter wall (south)`,
      box: { cx: 0, cy: room.height_m / 2, cz: halfWidth - wallT / 2, sx: room.length_m, sy: room.height_m, sz: wallT },
      source: "fixture-baseline",
      engineOp: op(fixture.geometry.wall.id),
      material: "concrete-block",
      fixtureRef: fixture.geometry.wall.id,
    },
    {
      aiseId: door.id,
      kind: "opening-door",
      label: `${door.id} — 0.9 × 2.1 m door opening (sill 0)`,
      box: {
        cx: -2,
        cy: door.sill_m + door.height_m / 2,
        cz: halfWidth - wallT / 2,
        sx: door.width_m,
        sy: door.height_m,
        sz: wallT + 0.02,
      },
      source: "fixture-baseline",
      engineOp: op(door.id),
      material: "door",
      fixtureRef: door.id,
    },
    {
      aiseId: window.id,
      kind: "opening-window",
      label: `${window.id} — 1.2 × 1.2 m window opening (sill 0.9)`,
      box: {
        cx: 1.5,
        cy: window.sill_m + window.height_m / 2,
        cz: halfWidth - wallT / 2,
        sx: window.width_m,
        sy: window.height_m,
        sz: wallT + 0.02,
      },
      source: "fixture-baseline",
      engineOp: op(window.id),
      material: "window",
      fixtureRef: window.id,
    },
    {
      aiseId: partition.id,
      kind: "partition",
      label: `${partition.id} — 150 mm internal partition`,
      box: { cx: 0, cy: room.height_m / 2, cz: 0, sx: partition.thickness_m, sy: room.height_m, sz: room.width_m - 2 * wallT },
      source: "fixture-baseline",
      engineOp: op(partition.id),
      material: "aac-block",
      fixtureRef: partition.id,
    },
    {
      aiseId: column.id,
      kind: "column",
      label: `${column.id} — 300 × 300 mm column`,
      box: { cx: 3.5, cy: room.height_m / 2, cz: -2.5, sx: column.width_m, sy: room.height_m, sz: column.depth_m },
      source: "fixture-baseline",
      engineOp: op(column.id),
      material: null,
      fixtureRef: column.id,
    },
    {
      aiseId: footing.id,
      kind: "footing",
      label: `${footing.id} — 400 × 400 × 300 mm footing`,
      box: {
        cx: 3.5,
        cy: -slab.thickness_m - footing.height_m / 2,
        cz: -2.5,
        sx: footing.width_m,
        sy: footing.height_m,
        sz: footing.depth_m,
      },
      source: "fixture-baseline",
      engineOp: op(footing.id),
      material: "plain-concrete",
      fixtureRef: footing.id,
    },
    {
      aiseId: beam.id,
      kind: "beam",
      label: `${beam.id} — 250 × 400 mm beam`,
      box: {
        cx: -3.5,
        cy: room.height_m - beam.depth_m / 2,
        cz: 0,
        sx: beam.width_m,
        sy: beam.depth_m,
        sz: room.width_m - 2 * wallT,
      },
      source: "fixture-baseline",
      engineOp: op(beam.id),
      material: null,
      fixtureRef: beam.id,
    },
    {
      aiseId: fixture.geometry.roof.id,
      kind: "roof",
      label: `${fixture.geometry.roof.id} — roof plane`,
      box: { cx: 0, cy: room.height_m + 0.025, cz: 0, sx: room.length_m, sy: 0.05, sz: room.width_m },
      source: "fixture-baseline",
      engineOp: null,
      material: null,
      fixtureRef: fixture.geometry.roof.id,
    },
  ];
  return seeds;
}

/**
 * The proposed overlay: engine-applied operations authored in the sandbox
 * (direct manipulation / agent / revision) become ghost elements anchored
 * at the deterministic spike layout. The AISE reference of an overlay
 * element IS the engine operation id (stable, content-derived).
 */
export interface OverlayPlacement {
  readonly operationId: string;
  readonly label: string;
  readonly engineType: string;
  readonly box: SceneElementSeed["box"];
}

export function overlaySeeds(placements: readonly OverlayPlacement[]): readonly SceneElementSeed[] {
  return placements.map((placement) => ({
    aiseId: `op:${placement.operationId}`,
    kind: "proposed" as const,
    label: placement.label,
    box: placement.box,
    source: "engine-proposed" as const,
    engineOp: { fixtureOpId: "authored", operationId: placement.operationId, engineType: placement.engineType },
    material: null,
    fixtureRef: null,
  }));
}

/* ------------------------------------------------------------------ */
/* Fail-closed scene-payload decoder (GBIM-000 neg-007)                */
/* ------------------------------------------------------------------ */

export type SceneSeedDecodeResult =
  | { ok: true; seeds: readonly SceneElementSeed[] }
  | { ok: false; error: string; rejectedFields: readonly string[] };

const ELEMENT_KINDS: readonly string[] = [
  "room",
  "wall",
  "opening-door",
  "opening-window",
  "column",
  "slab",
  "footing",
  "beam",
  "partition",
  "roof",
  "proposed",
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function checkBox(value: unknown, errors: string[]): void {
  if (typeof value !== "object" || value === null) {
    errors.push("box: missing object");
    return;
  }
  const box = value as Record<string, unknown>;
  const keys = ["cx", "cy", "cz", "sx", "sy", "sz"];
  const extra = Object.keys(box).filter((key) => !keys.includes(key));
  if (extra.length > 0) {
    errors.push(`box: unknown fields [${extra.join(", ")}] — strict shape, no passthrough`);
  }
  for (const key of keys) {
    if (!isFiniteNumber(box[key])) {
      errors.push(`box.${key}: not a finite number`);
    }
  }
  for (const key of ["sx", "sy", "sz"]) {
    if (isFiniteNumber(box[key]) && (box[key] as number) <= 0) {
      errors.push(`box.${key}: non-positive extent`);
    }
  }
}

/**
 * Decodes a scene-seed payload STRICTLY: unknown top-level fields,
 * non-finite extents, unknown kinds or missing AISE references are
 * REJECTED (fail closed) — a malformed provider response can never
 * partially render as if it were canonical truth.
 */
export function decodeSceneSeedPayload(payload: unknown): SceneSeedDecodeResult {
  if (!Array.isArray(payload)) {
    return { ok: false, error: "scene payload is not an array", rejectedFields: ["<root>"] };
  }
  const seeds: SceneElementSeed[] = [];
  const rejected: string[] = [];
  for (const [index, entry] of payload.entries()) {
    if (typeof entry !== "object" || entry === null) {
      rejected.push(`[${index}]`);
      continue;
    }
    const record = entry as Record<string, unknown>;
    const errors: string[] = [];
    const allowed = ["aiseId", "kind", "label", "box", "source", "engineOp", "material", "fixtureRef"];
    const extra = Object.keys(record).filter((key) => !allowed.includes(key));
    if (extra.length > 0) {
      errors.push(`unknown fields [${extra.join(", ")}] — strict shape (malformed-provider-response guard)`);
    }
    if (typeof record.aiseId !== "string" || record.aiseId.length === 0) {
      errors.push("aiseId: missing stable AISE reference");
    }
    if (typeof record.kind !== "string" || !ELEMENT_KINDS.includes(record.kind)) {
      errors.push(`kind: '${String(record.kind)}' is not a known element kind`);
    }
    if (typeof record.label !== "string" || record.label.length === 0) {
      errors.push("label: missing");
    }
    if (record.source !== "fixture-baseline" && record.source !== "engine-proposed") {
      errors.push("source: must be 'fixture-baseline' or 'engine-proposed'");
    }
    checkBox(record.box, errors);
    if (errors.length > 0) {
      rejected.push(`[${index}]: ${errors.join("; ")}`);
      continue;
    }
    seeds.push({
      aiseId: record.aiseId as string,
      kind: record.kind as SceneElementSeed["kind"],
      label: record.label as string,
      box: record.box as SceneElementSeed["box"],
      source: record.source as SceneElementSeed["source"],
      engineOp: null,
      material: typeof record.material === "string" ? record.material : null,
      fixtureRef: typeof record.fixtureRef === "string" ? record.fixtureRef : null,
    });
  }
  if (rejected.length > 0) {
    return {
      ok: false,
      error: `malformed scene payload rejected (fail closed): ${rejected.length} element(s) rejected`,
      rejectedFields: rejected,
    };
  }
  return { ok: true, seeds };
}
