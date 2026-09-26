/**
 * GBIM-003 — the AISE-side workspace authority of the spike sandbox
 * (SERVER-ONLY: imports the deterministic identity derivations through
 * `node:crypto`, exactly per the PROD-031 law — the engine executes
 * server-side; the browser renders its outputs verbatim).
 *
 * ARCHITECTURE (charter §2 — non-negotiable):
 *
 *   browser sandbox (presentation adapter)
 *     -> posts EngineeringOperationIntent JSON
 *     -> THIS module: decode -> applyOperation -> validate
 *        -> deriveSolutionBoq -> project to WorkspaceDto
 *     -> the browser renders the projection. NO path exists from a
 *        renderer callback to canonical state except through the typed
 *        intent -> engine pipeline below.
 *
 * The ten GBIM-000 fixture operations are mapped ONTO the Phase 1 engine
 * catalogue where a canonical type exists and are recorded as honest
 * `unsupported` engine refusals where it does not (fail-closed — the
 * engine never fabricates a capability). The mapping table
 * (SPIKE_FIXTURE_MAPPING via buildFixtureMapping) is the single source for
 * both the sandbox and the evidence documents.
 *
 * Spike-only code (NOT production engine code).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  createOperationIntent,
  decodeEngineeringOperationIntent,
  type EngineeringOperationIntent,
  type OperationTarget,
  type TypedOperationParameter,
  type SolutionVersion,
  type SolutionValidationSnapshot,
} from "../../../../packages/solution-contract/src/index";
import { deriveEngineeringOperationId, operationSemanticIdentityOfIntent } from "../../../../packages/solution-contract/src/index";
import { applyOperation, replaySolution, reviseVersion, validateSolutionVersion } from "../../../../packages/solution-engine/src/index";
import { deriveSolutionBoq } from "../../../../packages/solution-boq/src/index";
import type {
  AppliedOperation,
  OperationApplicationResult,
  RefusedOperation,
} from "../../../../packages/solution-engine/src/index";
import type { SolutionBoq } from "../../../../packages/solution-boq/src/index";
import type {
  CanonicalFixture,
  OperationRecordDto,
  QuantityDto,
  WorkspaceDto,
} from "../types";

/* ------------------------------------------------------------------ */
/* Spike identity constants (deterministic demo world)                 */
/* ------------------------------------------------------------------ */

export const SPIKE_SOLUTION_ID = "sol-gbim003-spatial-studio-001";
export const SPIKE_PROJECT_ID = "proj-gbim003-spike";
export const SPIKE_BASELINE_REALITY_VERSION_ID = "rgv-gbim000-fixture-001";
/** Deterministic demo clock — production injects the workspace clock; identity excludes instants. */
export const SPIKE_DEMO_T0 = "2026-09-25T00:00:00.000Z";

export function spikeMaterializeClock(stateIndex: number): string {
  const seconds = stateIndex % 60;
  const minutes = Math.floor(stateIndex / 60) % 60;
  return `2026-09-25T00:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.000Z`;
}

/**
 * Resolves the AISE repo root runtime-neutrally: bun defines
 * `import.meta.dir` (this file lives 4 levels below the repo root); under
 * the Next.js host the clone is `process.cwd()/AISE` (verified by the
 * fixture's presence, so a wrong root can never silently point elsewhere).
 */
function resolveAiseRepoRoot(): string {
  const bunDir = (import.meta as { dir?: string }).dir;
  if (typeof bunDir === "string") {
    return join(bunDir, "..", "..", "..", "..");
  }
  const fixtureRelative = join("docs", "productization-evidence", "GBIM-000", "canonical-fixture.json");
  for (const candidate of [join(process.cwd(), "AISE"), process.cwd()]) {
    if (existsSync(join(candidate, fixtureRelative))) {
      return candidate;
    }
  }
  return join(process.cwd(), "AISE");
}

export const AISE_REPO_ROOT = resolveAiseRepoRoot();
export const CANONICAL_FIXTURE_PATH = join(
  AISE_REPO_ROOT,
  "docs",
  "productization-evidence",
  "GBIM-000",
  "canonical-fixture.json",
);

/* ------------------------------------------------------------------ */
/* Reality-anchoring references (read-only, AISE-owned)                */
/* ------------------------------------------------------------------ */

/** The read-only Reality-Graph node ref of a fixture element. */
export function fixtureNodeRef(elementId: string): string {
  return `rg:GBIM-000-building-001:${elementId}`;
}

/** A deterministic geometry ref of a fixture element's baseline shape. */
export function fixtureGeometryRef(elementId: string): { kind: "plane"; ref: string } {
  return { kind: "plane", ref: `geom-fixture:GBIM-000-building-001:${elementId}` };
}

export function fixtureTargetOf(elementId: string, description: string): OperationTarget {
  return {
    contractVersion: "1.0.0",
    selectorKind: "element",
    nodeRefs: [fixtureNodeRef(elementId)],
    geometryRefs: [fixtureGeometryRef(elementId)],
    units: { linear: "m", angular: "rad" },
    description,
  };
}

/* ------------------------------------------------------------------ */
/* The fixture -> engine mapping (single source of spike truth)        */
/* ------------------------------------------------------------------ */

export interface FixtureOpMapping {
  readonly fixtureOpId: string;
  readonly fixtureType: string;
  readonly targetElementId: string;
  readonly engineType: string | null;
  readonly intent: EngineeringOperationIntent | null;
  readonly mappingNote: string;
}

function p(name: string, value: number, unit: string): TypedOperationParameter {
  return { name, value, unit };
}

function mat(name: string, value: string): TypedOperationParameter {
  return { name, value };
}

function fixtureIntent(input: {
  readonly intentId: string;
  readonly operationType: string;
  readonly elementId: string;
  readonly description: string;
  readonly parameters: readonly TypedOperationParameter[];
}): EngineeringOperationIntent {
  return createOperationIntent({
    intentId: input.intentId,
    operationType: input.operationType,
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: input.parameters,
    target: fixtureTargetOf(input.elementId, input.description),
    dependsOn: [],
    provenance: {
      origin: "imported-template",
      authoredBy: "gbim003-spike:fixture-template",
      authoredAt: SPIKE_DEMO_T0,
      evidenceIds: [],
      derivationNote:
        `GBIM-000 canonical fixture operation replayed through the GBIM-003 spike mapping onto ` +
        `the Phase 1 engine catalogue (${input.operationType})`,
    },
  });
}

/**
 * Builds the ten-operation mapping. Parameters are taken from the fixture
 * (snake_case SI) and normalized to the engine's kebab-case typed
 * parameters with explicit units; every assumption is recorded in the note.
 */
export function buildFixtureMapping(fixture: CanonicalFixture): readonly FixtureOpMapping[] {
  const { geometry } = fixture;
  const room = geometry.room;
  const wall = geometry.wall;
  const door = geometry.doorOpening;
  const window = geometry.windowOpening;
  const footing = geometry.footing;
  const slab = geometry.slab;
  const partition = geometry.partition;

  return [
    {
      fixtureOpId: "op-001",
      fixtureType: "create-wall",
      targetElementId: wall.id,
      engineType: "block-wall-placement",
      intent: fixtureIntent({
        intentId: "intent-gbim003-op-001",
        operationType: "block-wall-placement",
        elementId: wall.id,
        description: `the ${wall.id} perimeter wall of ${room.id}`,
        parameters: [
          p("length", room.length_m, "m"),
          p("height", room.height_m, "m"),
          p("thickness", wall.thickness_m, "m"),
          mat("material", "concrete-block"),
        ],
      }),
      mappingNote:
        `create-wall -> block-wall-placement; length/height from room-001 (${room.length_m}x${room.height_m} m), ` +
        `thickness_m ${wall.thickness_m} -> thickness; material assumed concrete-block (fixture states none)`,
    },
    {
      fixtureOpId: "op-002",
      fixtureType: "create-opening",
      targetElementId: door.id,
      engineType: "opening-creation",
      intent: fixtureIntent({
        intentId: "intent-gbim003-op-002",
        operationType: "opening-creation",
        elementId: door.id,
        description: `the door opening ${door.id} in ${door.hostWall}`,
        parameters: [p("width", door.width_m, "m"), p("height", door.height_m, "m"), mat("material", "door")],
      }),
      mappingNote:
        `create-opening -> opening-creation; ${door.width_m}x${door.height_m} m, material=door; ` +
        `sill_m ${door.sill_m} has NO Phase 1 parameter slot (recorded gap); host relation to wall-001 documented here (no dependency edge — see revision-dependency-gap finding)`,
    },
    {
      fixtureOpId: "op-003",
      fixtureType: "create-door",
      targetElementId: door.id,
      engineType: null,
      intent: null,
      mappingNote:
        "create-door (door leaf placement in an existing opening) has NO Phase 1 engine type — " +
        "exercised as a real intent and refused by the engine's capability negotiation (fail closed)",
    },
    {
      fixtureOpId: "op-004",
      fixtureType: "create-window",
      targetElementId: window.id,
      engineType: "opening-creation",
      intent: fixtureIntent({
        intentId: "intent-gbim003-op-004",
        operationType: "opening-creation",
        elementId: window.id,
        description: `the window opening ${window.id} in ${window.hostWall}`,
        parameters: [p("width", window.width_m, "m"), p("height", window.height_m, "m"), mat("material", "window")],
      }),
      mappingNote:
        `create-window -> opening-creation; ${window.width_m}x${window.height_m} m, material=window; ` +
        `sill_m ${window.sill_m} has NO Phase 1 parameter slot (recorded gap)`,
    },
    {
      fixtureOpId: "op-005",
      fixtureType: "create-column",
      targetElementId: geometry.column.id,
      engineType: null,
      intent: null,
      mappingNote:
        "create-column has NO Phase 1 engine type — exercised as a real intent and refused by " +
        "the engine's capability negotiation (structural-column vertical deferred)",
    },
    {
      fixtureOpId: "op-006",
      fixtureType: "create-footing",
      targetElementId: footing.id,
      engineType: "foundation-placement",
      intent: fixtureIntent({
        intentId: "intent-gbim003-op-006",
        operationType: "foundation-placement",
        elementId: footing.id,
        description: `the ${footing.id} pad footing`,
        parameters: [
          p("length", footing.width_m, "m"),
          p("width", footing.depth_m, "m"),
          p("depth", footing.height_m, "m"),
          mat("material", "plain-concrete"),
        ],
      }),
      mappingNote:
        `create-footing -> foundation-placement; fixture width/depth/height ${footing.width_m}/` +
        `${footing.depth_m}/${footing.height_m} m -> length/width/depth; material assumed plain-concrete`,
    },
    {
      fixtureOpId: "op-007",
      fixtureType: "create-slab",
      targetElementId: slab.id,
      engineType: "slab-placement",
      intent: fixtureIntent({
        intentId: "intent-gbim003-op-007",
        operationType: "slab-placement",
        elementId: slab.id,
        description: `the ${slab.id} ground slab of ${room.id}`,
        parameters: [
          p("length", room.length_m, "m"),
          p("width", room.width_m, "m"),
          p("thickness", slab.thickness_m, "m"),
          mat("material", "plain-concrete"),
        ],
      }),
      mappingNote:
        `create-slab -> slab-placement; ${room.length_m}x${room.width_m} m plan from room-001, ` +
        `thickness_m ${slab.thickness_m}; material assumed plain-concrete`,
    },
    {
      fixtureOpId: "op-008",
      fixtureType: "create-beam",
      targetElementId: geometry.beam.id,
      engineType: null,
      intent: null,
      mappingNote:
        "create-beam has NO Phase 1 engine type — exercised as a real intent and refused by " +
        "the engine's capability negotiation (framing vertical deferred)",
    },
    {
      fixtureOpId: "op-009",
      fixtureType: "create-partition",
      targetElementId: partition.id,
      engineType: "block-wall-placement",
      intent: fixtureIntent({
        intentId: "intent-gbim003-op-009",
        operationType: "block-wall-placement",
        elementId: partition.id,
        description: `the ${partition.id} internal partition spanning ${room.id}`,
        parameters: [
          p("length", room.width_m, "m"),
          p("height", room.height_m, "m"),
          p("thickness", partition.thickness_m, "m"),
          mat("material", "aac-block"),
        ],
      }),
      mappingNote:
        `create-partition -> block-wall-placement; thickness_m ${partition.thickness_m}; ` +
        `length/height derived from the room-001 span (${room.width_m}x${room.height_m} m); material assumed aac-block`,
    },
    {
      fixtureOpId: "op-010",
      fixtureType: "revise-opening",
      targetElementId: window.id,
      engineType: null,
      intent: null,
      mappingNote:
        "revise-opening is demonstrated through the engine's append-only revision path: " +
        "reviseVersion UNDOES the window opening in a NEW version, then the revised opening " +
        "(1.5x1.2 m) is applied through the same createOperationIntent surface — see reviseOpening()",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* AISE-side fixture invariants (the GBIM-000 §3 invariant set)         */
/* ------------------------------------------------------------------ */

/**
 * Validates the GBIM-000 fixture's declared invariants on the AISE side —
 * the layer the Phase 1 engine does not yet model (host-wall existence,
 * wall-thickness sanity, footing support, duplicate fixture op ids). Every
 * violation FAILS CLOSED: the spike refuses to build the workspace.
 */
export function validateFixtureInvariants(fixture: CanonicalFixture): readonly string[] {
  const violations: string[] = [];
  const { geometry, operations } = fixture;
  const room = geometry.room;
  const elementIds = new Set<string>([
    room.id,
    geometry.wall.id,
    geometry.doorOpening.id,
    geometry.windowOpening.id,
    geometry.column?.id,
    geometry.slab?.id,
    geometry.footing?.id,
    geometry.beam?.id,
    geometry.partition?.id,
    geometry.roof?.id,
  ].filter((id): id is string => typeof id === "string"));

  // neg-005 duplicate-operation-identity (fixture level).
  const opIds = new Set<string>();
  for (const operation of operations) {
    if (opIds.has(operation.id)) {
      violations.push(`neg-005 duplicate-operation-identity: fixture operation '${operation.id}' is declared more than once`);
    }
    opIds.add(operation.id);
    if (!elementIds.has(operation.target)) {
      violations.push(`fixture operation '${operation.id}' targets unknown element '${operation.target}'`);
    }
  }

  // neg-003 negative dimensions (fixture level; the engine also guards this).
  const dimensionProbes: readonly [string, number][] = [
    ["room.length_m", room.length_m],
    ["room.width_m", room.width_m],
    ["room.height_m", room.height_m],
    ["wall.thickness_m", geometry.wall.thickness_m],
    ["doorOpening.width_m", geometry.doorOpening.width_m],
    ["doorOpening.height_m", geometry.doorOpening.height_m],
    ["windowOpening.width_m", geometry.windowOpening.width_m],
    ["windowOpening.height_m", geometry.windowOpening.height_m],
    ["column.width_m", geometry.column?.width_m ?? Number.NaN],
    ["slab.thickness_m", geometry.slab?.thickness_m ?? Number.NaN],
    ["footing.width_m", geometry.footing?.width_m ?? Number.NaN],
    ["beam.width_m", geometry.beam?.width_m ?? Number.NaN],
    ["partition.thickness_m", geometry.partition?.thickness_m ?? Number.NaN],
  ];
  for (const [name, value] of dimensionProbes) {
    if (!Number.isFinite(value) || value <= 0) {
      violations.push(`neg-003 negative-dimension: fixture dimension '${name}' is ${value} — dimensions must be finite and strictly positive`);
    }
  }

  // neg-001 impossible wall thickness (AISE fixture layer; the Phase 1
  // engine carries no wall-thickness limit — recorded engine gap).
  const minRoomDimension = Math.min(room.length_m, room.width_m);
  if (geometry.wall.thickness_m >= minRoomDimension) {
    violations.push(
      `neg-001 impossible-wall-thickness: wall thickness ${geometry.wall.thickness_m} m is not smaller than the room's smallest dimension ${minRoomDimension} m`,
    );
  }
  if (geometry.partition.thickness_m >= geometry.wall.thickness_m * 4) {
    violations.push(
      `neg-001 impossible-wall-thickness: partition thickness ${geometry.partition.thickness_m} m exceeds 4x the structural wall thickness ${geometry.wall.thickness_m} m`,
    );
  }

  // neg-002 opening-outside-host-wall: every opening's host must exist.
  for (const opening of [geometry.doorOpening, geometry.windowOpening]) {
    if (!elementIds.has(opening.hostWall)) {
      violations.push(`neg-002 opening-outside-host-wall: opening '${opening.id}' references host wall '${opening.hostWall}' which does not exist`);
    }
    if (opening.width_m > room.length_m || opening.height_m > room.height_m) {
      violations.push(`neg-002 opening-outside-host-wall: opening '${opening.id}' (${opening.width_m}x${opening.height_m} m) does not fit its host context`);
    }
  }

  // neg-004 disconnected-footing: a footing must support a declared
  // vertical element (coarse fixture-level relation; the Phase 1 engine has
  // no connectivity model — recorded engine gap).
  const columnDeclared =
    geometry.column !== undefined &&
    geometry.column !== null &&
    typeof geometry.column.id === "string" &&
    elementIds.has(geometry.column.id);
  if (!columnDeclared) {
    violations.push(`neg-004 disconnected-footing: footing '${geometry.footing.id}' has no declared supported element`);
  }

  return violations;
}

/* ------------------------------------------------------------------ */
/* Workspace construction (deterministic)                              */
/* ------------------------------------------------------------------ */

export interface WorkspaceRecord {
  readonly fixture: CanonicalFixture;
  readonly fixtureSha256: string;
  readonly version: SolutionVersion;
  readonly snapshot: SolutionValidationSnapshot;
  readonly boq: SolutionBoq;
  readonly records: readonly OperationRecordDto[];
  readonly revision: WorkspaceDto["revision"];
}

function quantityDtos(applied: AppliedOperation): readonly QuantityDto[] {
  return applied.quantities.map((quantity) => ({
    name: quantity.label,
    dimension: quantity.dimension,
    value: quantity.value,
    unit: quantity.unit,
    direction: quantity.direction,
    calculation: quantity.calculationRef,
    formula: quantity.formula,
  }));
}

function limitsOf(applied: AppliedOperation): OperationRecordDto["limitsExceeded"] {
  return applied.limitsExceeded.map((limit) => ({
    limitId: limit.limitId,
    parameterName: limit.parameterName,
    detail: limit.detail,
  }));
}

function recordOfApplied(
  mapping: FixtureOpMapping,
  applied: AppliedOperation,
  origin: OperationRecordDto["origin"],
): OperationRecordDto {
  return {
    fixtureOpId: mapping.fixtureOpId,
    fixtureType: mapping.fixtureType,
    targetElementId: mapping.targetElementId,
    engineType: mapping.engineType,
    outcome: "applied",
    negotiationOutcome: applied.negotiation.outcome,
    operationId: String(applied.operation.operationId),
    intentId: String(applied.operation.intentId),
    stateIndex: applied.resultingState.stateIndex,
    versionNumber: applied.operation.versionNumber,
    quantities: quantityDtos(applied),
    reasons: [],
    limitsExceeded: limitsOf(applied),
    mappingNote: mapping.mappingNote,
    origin,
  };
}

function recordOfRefused(mapping: FixtureOpMapping, refused: RefusedOperation): OperationRecordDto {
  return {
    fixtureOpId: mapping.fixtureOpId,
    fixtureType: mapping.fixtureType,
    targetElementId: mapping.targetElementId,
    engineType: mapping.engineType,
    outcome: refused.outcome,
    negotiationOutcome: refused.negotiation.outcome,
    operationId: null,
    intentId: refused.intentId,
    stateIndex: null,
    versionNumber: null,
    quantities: [],
    reasons: refused.reasons.map((reason) => `${reason.code}: ${reason.detail}`),
    limitsExceeded: [],
    mappingNote: mapping.mappingNote,
    origin: "fixture-template",
  };
}

function recordOfPendingRevision(mapping: FixtureOpMapping): OperationRecordDto {
  return {
    fixtureOpId: mapping.fixtureOpId,
    fixtureType: mapping.fixtureType,
    targetElementId: mapping.targetElementId,
    engineType: null,
    outcome: "needs-input",
    negotiationOutcome: "executable",
    operationId: null,
    intentId: null,
    stateIndex: null,
    versionNumber: null,
    quantities: [],
    reasons: ["revised through the append-only revision path on demand (see the Revision action)"],
    limitsExceeded: [],
    mappingNote: mapping.mappingNote,
    origin: "fixture-template",
  };
}

function sha256Of(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function readCanonicalFixture(): { fixture: CanonicalFixture; sha256: string } {
  const raw = readFileSync(CANONICAL_FIXTURE_PATH, "utf8");
  return { fixture: JSON.parse(raw) as CanonicalFixture, sha256: sha256Of(raw) };
}

/** An intent for an unmapped fixture op, exercised against the REAL engine. */
function unsupportedProbeIntent(fixtureOpId: string, fixtureType: string, elementId: string): EngineeringOperationIntent {
  return createOperationIntent({
    intentId: `intent-gbim003-${fixtureOpId}-probe`,
    operationType: fixtureType,
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: [p("length", 1, "m"), p("height", 1, "m"), mat("material", "concrete-block")],
    target: fixtureTargetOf(elementId, `the ${elementId} the fixture names for ${fixtureType}`),
    provenance: {
      origin: "imported-template",
      authoredBy: "gbim003-spike:fixture-template",
      authoredAt: SPIKE_DEMO_T0,
      evidenceIds: [],
      derivationNote: `GBIM-000 fixture operation ${fixtureOpId} (${fixtureType}) probed against the engine capability gate`,
    },
  });
}

/**
 * Builds the deterministic spike workspace: replays the MAPPED fixture
 * operations through the real engine (`replaySolution` — the same code
 * path as production), exercises the unmapped ones as real intents that
 * the engine's capability negotiation refuses (fail closed), then
 * validates and derives the BOQ.
 */
export function buildWorkspaceRecord(): WorkspaceRecord {
  const { fixture, sha256 } = readCanonicalFixture();
  const violations = validateFixtureInvariants(fixture);
  if (violations.length > 0) {
    throw new Error(`AISE fixture invariants failed (fail closed): ${violations.join("; ")}`);
  }
  const mapping = buildFixtureMapping(fixture);

  const replayInput = {
    solutionId: SPIKE_SOLUTION_ID,
    projectId: SPIKE_PROJECT_ID,
    title: "GBIM-003 Spatial Studio spike — fixture room solution",
    problemStatement:
      "Spike sandbox solution replaying the GBIM-000 canonical fixture operations " +
      "through the Phase 1 engine catalogue (evidence-only, not production)",
    domain: REFERENCE_BUILDING_DOMAIN,
    baselineRealityVersionId: SPIKE_BASELINE_REALITY_VERSION_ID,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    materializeClock: spikeMaterializeClock,
    createdAt: SPIKE_DEMO_T0,
  } as const;

  // Single dependency-free pass: the mapping deliberately records the
  // host-wall relation in the mapping NOTE instead of a cross-operation
  // dependency edge — dependency refs are version-pinned content addresses
  // (identity.ts), so a dependency edge would make the record un-revisable
  // (reviseVersion does not remap refs across versions — a recorded spike
  // finding; see check 'revision-dependency-gap'). The dependency gate
  // itself is proven separately in check 'engine-dependency-gate'.
  const mapped = mapping.filter((entry) => entry.intent !== null);
  const intents = mapped.map((entry) => entry.intent as EngineeringOperationIntent);
  const replay = replaySolution({ ...replayInput, intents });
  if (replay.outcome !== "complete") {
    throw new Error(`fixture replay (with dependencies) failed at step ${replay.failedAtStep}`);
  }

  const appliedByFixtureOpId = new Map<string, AppliedOperation>();
  for (const [index, entry] of mapped.entries()) {
    const step = replay.steps[index];
    if (step !== undefined) {
      appliedByFixtureOpId.set(entry.fixtureOpId, step.applied);
    }
  }

  const records: OperationRecordDto[] = [];
  for (const entry of mapping) {
    const applied = appliedByFixtureOpId.get(entry.fixtureOpId);
    if (applied !== undefined) {
      records.push(recordOfApplied(entry, applied, "fixture-template"));
      continue;
    }
    if (entry.fixtureOpId === "op-010") {
      records.push(recordOfPendingRevision(entry));
      continue;
    }
    // No engine type: exercise the REAL intent against the engine and
    // record its fail-closed refusal verbatim.
    const probe = unsupportedProbeIntent(entry.fixtureOpId, entry.fixtureType, entry.targetElementId);
    const result = applyOperation({
      baseline: replay.version,
      intent: probe,
      capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
      materializedAt: spikeMaterializeClock(replay.version.states.length),
    });
    if (result.outcome === "applied") {
      throw new Error(
        `UNEXPECTED: the engine ACCEPTED unmapped fixture op ${entry.fixtureOpId} (${entry.fixtureType}) — the mapping table is stale`,
      );
    }
    records.push(recordOfRefused(entry, result));
  }

  const snapshot = validateSolutionVersion({
    version: replay.version,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    validatedAt: SPIKE_DEMO_T0,
  });
  const boq = deriveSolutionBoq({ version: replay.version, snapshot });

  return { fixture, fixtureSha256: sha256, version: replay.version, snapshot, boq, records, revision: null };
}

/* ------------------------------------------------------------------ */
/* Projection to the browser DTO (rendered verbatim)                   */
/* ------------------------------------------------------------------ */

function projectBoq(boq: SolutionBoq, versionNumber: number): WorkspaceDto["boq"] {
  const sectionTitles = new Map(boq.sections.map((section) => [section.sectionId, section.title]));
  return {
    boqId: boq.boqId,
    versionNumber,
    lines: boq.lines.map((line) => ({
      boqLineId: line.boqLineId,
      sectionId: line.sectionId,
      sectionTitle: sectionTitles.get(line.sectionId) ?? line.sectionId,
      buildingElement: line.buildingElement,
      activity: line.activity,
      direction: line.direction,
      itemDescription: line.itemDescription,
      material: line.material ?? null,
      unit: line.unit,
      quantityValue: line.quantity.value,
      dimension: line.quantity.dimension,
      calculationRef: line.calculationMethod.calculationRef,
      methodSource: line.calculationMethod.methodSource,
      operationRefs: line.contributions.map((contribution) => contribution.operationId),
      assumptionRefs: [...line.assumptionRefs],
    })),
    assumptions: boq.assumptions.map((assumption) => ({
      assumptionId: assumption.assumptionId,
      statement: assumption.statement,
      originKind: assumption.origin.kind,
    })),
  };
}

export function projectWorkspace(record: WorkspaceRecord): WorkspaceDto {
  return {
    fixtureId: record.fixture.fixtureId,
    fixtureSha256: record.fixtureSha256,
    fixture: record.fixture,
    solutionId: record.version.solutionId,
    projectId: SPIKE_PROJECT_ID,
    baselineRealityVersionId: SPIKE_BASELINE_REALITY_VERSION_ID,
    versionNumber: record.version.versionNumber,
    versionStatus: record.version.status,
    createdAt: record.version.createdAt,
    operationRecords: [...record.records],
    stateLayers: record.version.states.map((state) => ({
      stateIndex: state.stateIndex,
      stateId: state.stateId,
      contentDigest: state.contentDigest ?? "",
      appliedOperationIds: [...state.appliedOperationIds],
      materializedAt: state.materializedAt,
    })),
    validation: {
      snapshotId: record.snapshot.snapshotId,
      outcome: record.snapshot.outcome,
      checks: record.snapshot.checks.map((check) => ({
        checkId: check.checkId,
        result: check.result,
        detail: check.detail,
      })),
    },
    boq: projectBoq(record.boq, record.version.versionNumber),
    revision: record.revision,
  };
}

/* ------------------------------------------------------------------ */
/* Preview / apply / revise (ALL mutation flows — the one pipeline)     */
/* ------------------------------------------------------------------ */

function decodeIntentOrMessage(intentJson: unknown): { intent: EngineeringOperationIntent } | { error: string } {
  try {
    return { intent: decodeEngineeringOperationIntent(intentJson) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `intent failed contract decode (fail closed): ${message}` };
  }
}

export interface ApplyOutcome {
  readonly ok: boolean;
  readonly result: OperationApplicationResult | null;
  readonly record: WorkspaceRecord | null;
  readonly message: string;
}

function extendRecordWith(
  record: WorkspaceRecord,
  applied: AppliedOperation,
  origin: OperationRecordDto["origin"],
): WorkspaceRecord {
  const operation = applied.operation;
  const version: SolutionVersion = {
    ...record.version,
    operations: [...record.version.operations, operation],
    states: [...record.version.states, applied.resultingState],
  };
  const snapshot = validateSolutionVersion({
    version,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    validatedAt: SPIKE_DEMO_T0,
  });
  const boq = deriveSolutionBoq({ version, snapshot });
  const record_: OperationRecordDto = {
    fixtureOpId: `user-${operation.operationId.slice(0, 12)}`,
    fixtureType: `authored:${operation.operationType}`,
    targetElementId: operation.target.nodeRefs[0] ?? "unanchored",
    engineType: operation.operationType,
    outcome: "applied",
    negotiationOutcome: applied.negotiation.outcome,
    operationId: String(operation.operationId),
    intentId: String(operation.intentId),
    stateIndex: applied.resultingState.stateIndex,
    versionNumber: operation.versionNumber,
    quantities: quantityDtos(applied),
    reasons: [],
    limitsExceeded: limitsOf(applied),
    mappingNote: "authored in the Spatial Studio sandbox",
    origin,
  };
  return { ...record, version, snapshot, boq, records: [...record.records, record_] };
}

/** Dry-run: applyOperation is pure, so preview = apply + discard. */
export function previewIntent(record: WorkspaceRecord, intentJson: unknown): { preview: import("../types").PreviewDto; result: OperationApplicationResult } {
  const decoded = decodeIntentOrMessage(intentJson);
  if ("error" in decoded) {
    return {
      preview: {
        outcome: "invalid",
        negotiationOutcome: "blocked",
        negotiationReasons: [],
        refusalReasons: [decoded.error],
        quantities: [],
        limitsExceeded: [],
        dryRun: true,
        note: "the intent failed contract decode before reaching the engine — no state, no quantities",
      },
      result: { outcome: "invalid", intentId: "unknown", negotiation: { outcome: "blocked", reasons: [] } as never, reasons: [] },
    };
  }
  const result = applyOperation({
    baseline: record.version,
    intent: decoded.intent,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    materializedAt: spikeMaterializeClock(record.version.states.length),
  });
  if (result.outcome === "applied") {
    return {
      preview: {
        outcome: "applied",
        negotiationOutcome: result.negotiation.outcome,
        negotiationReasons: result.negotiation.reasons.map((reason) => `${reason.code}: ${reason.detail}`),
        refusalReasons: [],
        quantities: quantityDtos(result),
        limitsExceeded: limitsOf(result),
        dryRun: true,
        note:
          "DRY-RUN consequences computed by the AISE solution engine (applyOperation, result discarded). " +
          "The renderer holds no quantity authority — nothing is recorded until Apply.",
      },
      result,
    };
  }
  return {
    preview: {
      outcome: result.outcome,
      negotiationOutcome: result.negotiation.outcome,
      negotiationReasons: result.negotiation.reasons.map((reason) => `${reason.code}: ${reason.detail}`),
      refusalReasons: result.reasons.map((reason) => `${reason.code}: ${reason.detail}`),
      quantities: [],
      limitsExceeded: [],
      dryRun: true,
      note: "the engine refused the operation (fail closed) — no proposed state, no quantities, nothing recorded",
    },
    result,
  };
}

/** Applies a DECODED intent to the current version (the one mutation path). */
export function applyIntentToWorkspace(
  record: WorkspaceRecord,
  intentJson: unknown,
  origin: OperationRecordDto["origin"],
): ApplyOutcome {
  const decoded = decodeIntentOrMessage(intentJson);
  if ("error" in decoded) {
    return { ok: false, result: null, record: null, message: decoded.error };
  }
  const result = applyOperation({
    baseline: record.version,
    intent: decoded.intent,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    materializedAt: spikeMaterializeClock(record.version.states.length),
  });
  if (result.outcome !== "applied") {
    return {
      ok: false,
      result,
      record: null,
      message: `engine refused the operation (fail closed, no state created): ${result.reasons
        .map((reason) => `${reason.code}: ${reason.detail}`)
        .join("; ")}`,
    };
  }
  return {
    ok: true,
    result,
    record: extendRecordWith(record, result, origin),
    message: `applied as operation ${result.operation.operationId} (new proposed state ${result.resultingState.stateIndex})`,
  };
}

/**
 * op-010 revise-opening: the append-only revision path. Undoes the window
 * opening operation in a NEW version (engine `reviseVersion`), then applies
 * the revised 1.5 x 1.2 m opening through the same constructor surface.
 */
export function reviseOpening(
  record: WorkspaceRecord,
  revisedWidth: number,
  revisedHeight: number,
): { record: WorkspaceRecord | null; message: string } {
  const windowRecord = record.records.find((candidate) => candidate.fixtureOpId === "op-004");
  const windowOperationId = windowRecord?.operationId ?? null;
  if (windowOperationId === null) {
    return { record: null, message: "the window opening operation is not present — nothing to revise" };
  }
  const revision = reviseVersion({
    version: record.version,
    revertOperationId: windowOperationId,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    createdAt: SPIKE_DEMO_T0,
    materializeClock: spikeMaterializeClock,
    revisionProvenance: {
      authoredBy: "gbim003-spike:operator",
      reason: "GBIM-000 op-010 revise-opening: widen the window opening per fixture changes",
      authoredAt: SPIKE_DEMO_T0,
    },
  });
  if (revision.outcome !== "revised") {
    return {
      record: null,
      message: `revision refused (fail closed): ${revision.reasons.map((reason) => `${reason.code}: ${reason.detail}`).join("; ")}`,
    };
  }
  const revisedWindow = record.fixture.geometry.windowOpening;
  const revisedIntent = createOperationIntent({
    intentId: "intent-gbim003-op-010-revised",
    operationType: "opening-creation",
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: [
      p("width", revisedWidth, "m"),
      p("height", revisedHeight, "m"),
      mat("material", "window"),
    ],
    target: fixtureTargetOf(revisedWindow.id, `the revised window opening ${revisedWindow.id}`),
    provenance: {
      origin: "direct-manipulation",
      authoredBy: "gbim003-spike:operator",
      authoredAt: SPIKE_DEMO_T0,
      evidenceIds: [],
      derivationNote: "GBIM-000 op-010 revise-opening applied through the revision path (undo + re-apply)",
      interactionDetail: "operator revised the window opening through the inspector's revise action",
    },
  });
  const afterUndo: WorkspaceRecord = {
    ...record,
    version: revision.newVersion,
    records: record.records.map((entry) =>
      entry.operationId === windowOperationId
        ? {
            ...entry,
            outcome: "undone" as const,
            mappingNote: `${entry.mappingNote} — undone by the op-010 revision in version ${revision.newVersion.versionNumber}`,
          }
        : entry,
    ),
  };
  const apply = applyIntentToWorkspace(afterUndo, revisedIntent, "revision");
  if (!apply.ok || apply.record === null) {
    return { record: null, message: `revised opening refused: ${apply.message}` };
  }
  const revisedOperationId =
    apply.result !== null && apply.result.outcome === "applied" ? apply.result.operation.operationId : null;
  const revised: WorkspaceRecord = {
    ...apply.record,
    revision: {
      undoneOperationId: windowOperationId,
      revisedOperationId,
      revisedParameters: [
        { name: "width", value: revisedWidth, unit: "m" },
        { name: "height", value: revisedHeight, unit: "m" },
      ],
      versionNumber: revision.newVersion.versionNumber,
    },
  };
  return {
    record: revised,
    message: `revised in version ${revision.newVersion.versionNumber}: window opening undone, ${revisedWidth} x ${revisedHeight} m opening applied`,
  };
}

/* ------------------------------------------------------------------ */
/* In-memory custody (the spike's "server"; rebuilt deterministically)  */
/* ------------------------------------------------------------------ */

interface SpikeStore {
  record: WorkspaceRecord | null;
}

const globalStore = globalThis as typeof globalThis & { __gbim003SpikeStore?: SpikeStore };
const store: SpikeStore = globalStore.__gbim003SpikeStore ?? { record: null };
globalStore.__gbim003SpikeStore = store;

export function currentWorkspace(): WorkspaceRecord {
  if (store.record === null) {
    store.record = buildWorkspaceRecord();
  }
  return store.record;
}

export function commitWorkspace(record: WorkspaceRecord): void {
  store.record = record;
}

export function resetWorkspace(): WorkspaceRecord {
  store.record = buildWorkspaceRecord();
  return store.record;
}

/* ------------------------------------------------------------------ */
/* Identity derivation service (browser asks the server — PROD-031)     */
/* ------------------------------------------------------------------ */

export function deriveOperationIdOfIntent(
  intentJson: unknown,
  versionContext: { solutionId: string; versionNumber: number; operationIndex: number },
): string {
  const decoded = decodeIntentOrMessage(intentJson);
  if ("error" in decoded) {
    throw new Error(decoded.error);
  }
  return deriveEngineeringOperationId(operationSemanticIdentityOfIntent(decoded.intent, versionContext));
}
