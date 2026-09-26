/**
 * GBIM-003 — shared DTO types of the Spatial Studio spike sandbox.
 *
 * These types are the PRESENTATION-ADAPTER contract of the spike: the
 * browser sandbox NEVER holds canonical AISE objects as authority — it
 * renders the engine's outputs verbatim through these projection DTOs
 * (charter §2: provider/renderer output is never Reality/Solution Graph
 * authority; renderer object ids are external references only).
 *
 * Spike-only code (NOT production engine code). Lives behind the provider
 * boundary; nothing here enters the canonical engine.
 */

/* ------------------------------------------------------------------ */
/* Canonical fixture (GBIM-000) — consumed verbatim from the pinned file */
/* ------------------------------------------------------------------ */

/** The GBIM-000 canonical fixture as typed by the spike (provider-neutral, SI). */
export interface CanonicalFixture {
  readonly schemaVersion: number;
  readonly fixtureId: string;
  readonly domain: string;
  readonly units: string;
  readonly canonicalAuthority: string;
  readonly geometry: {
    readonly room: { readonly id: string; readonly length_m: number; readonly width_m: number; readonly height_m: number };
    readonly wall: { readonly id: string; thickness_m: number; host: string };
    readonly doorOpening: FixtureOpening;
    readonly windowOpening: FixtureOpening;
    readonly column: { readonly id: string; width_m: number; depth_m: number };
    readonly slab: { readonly id: string; thickness_m: number };
    readonly footing: { readonly id: string; width_m: number; depth_m: number; height_m: number };
    readonly beam: { readonly id: string; width_m: number; depth_m: number };
    readonly partition: { readonly id: string; thickness_m: number };
    readonly roof: { readonly id: string; type: string };
  };
  readonly operations: readonly FixtureOperation[];
  readonly invariants: readonly string[];
  readonly negativeCases: readonly {
    readonly id: string;
    readonly kind: string;
    readonly change: Record<string, unknown>;
  }[];
}

export interface FixtureOpening {
  readonly id: string;
  readonly hostWall: string;
  readonly width_m: number;
  readonly height_m: number;
  readonly sill_m: number;
}

export interface FixtureOperation {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly host?: string;
  readonly changes?: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Engine output projections (rendered verbatim, never recomputed)      */
/* ------------------------------------------------------------------ */

/** One engine-derived quantity, with its calculation citation. */
export interface QuantityDto {
  readonly name: string;
  readonly dimension: string;
  readonly value: number;
  readonly unit: string;
  readonly direction: string;
  readonly calculation: string;
  readonly formula: string;
}

/** One recorded fixture-operation resolution against the engine. */
export interface OperationRecordDto {
  readonly fixtureOpId: string;
  readonly fixtureType: string;
  readonly targetElementId: string;
  readonly engineType: string | null;
  readonly outcome: "applied" | "unsupported" | "invalid" | "needs-input" | "undone";
  readonly negotiationOutcome: string;
  readonly operationId: string | null;
  readonly intentId: string | null;
  readonly stateIndex: number | null;
  readonly versionNumber: number | null;
  readonly quantities: readonly QuantityDto[];
  readonly reasons: readonly string[];
  readonly limitsExceeded: readonly { readonly limitId: string; readonly parameterName: string; readonly detail: string }[];
  readonly mappingNote: string;
  readonly origin: "fixture-template" | "direct-manipulation" | "agent" | "revision";
}

/** A proposed-state layer of the solution version (identity echo only). */
export interface StateLayerDto {
  readonly stateIndex: number;
  readonly stateId: string;
  readonly contentDigest: string;
  readonly appliedOperationIds: readonly string[];
  readonly materializedAt: string;
}

export interface ValidationCheckDto {
  readonly checkId: string;
  readonly result: string;
  readonly detail: string;
}

export interface BoqLineDto {
  readonly boqLineId: string;
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly buildingElement: string;
  readonly activity: string;
  readonly direction: string;
  readonly itemDescription: string;
  readonly material: string | null;
  readonly unit: string;
  readonly quantityValue: number;
  readonly dimension: string;
  readonly calculationRef: string;
  readonly methodSource: string;
  readonly operationRefs: readonly string[];
  readonly assumptionRefs: readonly string[];
}

export interface BoqAssumptionDto {
  readonly assumptionId: string;
  readonly statement: string;
  readonly originKind: string;
}

export interface BoqDto {
  readonly boqId: string;
  readonly versionNumber: number;
  readonly lines: readonly BoqLineDto[];
  readonly assumptions: readonly BoqAssumptionDto[];
}

/* ------------------------------------------------------------------ */
/* The workspace projection the sandbox renders                         */
/* ------------------------------------------------------------------ */

export interface WorkspaceDto {
  readonly fixtureId: string;
  readonly fixtureSha256: string;
  readonly fixture: CanonicalFixture;
  readonly solutionId: string;
  readonly projectId: string;
  readonly baselineRealityVersionId: string;
  readonly versionNumber: number;
  readonly versionStatus: string;
  readonly createdAt: string;
  readonly operationRecords: readonly OperationRecordDto[];
  readonly stateLayers: readonly StateLayerDto[];
  readonly validation: {
    readonly snapshotId: string;
    readonly outcome: string;
    readonly checks: readonly ValidationCheckDto[];
  };
  readonly boq: BoqDto;
  readonly revision: {
    readonly undoneOperationId: string | null;
    readonly revisedOperationId: string | null;
    readonly revisedParameters: readonly { readonly name: string; readonly value: string | number; readonly unit?: string }[];
    readonly versionNumber: number | null;
  } | null;
}

/* ------------------------------------------------------------------ */
/* Scene model (presentation-grade derivation — NOT quantity authority) */
/* ------------------------------------------------------------------ */

export type SceneElementKind =
  | "room"
  | "wall"
  | "opening-door"
  | "opening-window"
  | "column"
  | "slab"
  | "footing"
  | "beam"
  | "partition"
  | "roof"
  | "proposed";

/** One renderable element spec. `aiseId` is the STABLE AISE reference. */
export interface SceneElementSeed {
  readonly aiseId: string;
  readonly kind: SceneElementKind;
  readonly label: string;
  readonly box: {
    readonly cx: number;
    readonly cy: number;
    readonly cz: number;
    readonly sx: number;
    readonly sy: number;
    readonly sz: number;
  };
  readonly source: "fixture-baseline" | "engine-proposed";
  readonly engineOp: {
    readonly fixtureOpId: string;
    readonly operationId: string;
    readonly engineType: string;
  } | null;
  readonly material: string | null;
  readonly fixtureRef: string | null;
}

/* ------------------------------------------------------------------ */
/* Preview / apply / agent DTOs                                        */
/* ------------------------------------------------------------------ */

export interface PreviewDto {
  readonly outcome: "applied" | "invalid" | "unsupported" | "needs-input";
  readonly negotiationOutcome: string;
  readonly negotiationReasons: readonly string[];
  readonly refusalReasons: readonly string[];
  readonly quantities: readonly QuantityDto[];
  readonly limitsExceeded: readonly { readonly limitId: string; readonly parameterName: string; readonly detail: string }[];
  readonly dryRun: boolean;
  readonly note: string;
}

export interface ApplyResultDto {
  readonly ok: boolean;
  readonly operationId: string | null;
  readonly stateId: string | null;
  readonly message: string;
  readonly workspace: WorkspaceDto | null;
  readonly refusalReasons: readonly string[];
}

export interface AgentCompileDto {
  readonly kind: string;
  readonly utterance: string;
  readonly normalizedCommandText: string | null;
  readonly intent: unknown | null;
  readonly detail: string;
  readonly questions: readonly string[];
  readonly reasonCode: string | null;
}

export interface IdentityRequestIntent {
  readonly intent: unknown;
  readonly operationIndex: number;
}

export interface IdentityResultDto {
  readonly ids: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Client-side sandbox state (presentation state ONLY)                  */
/* ------------------------------------------------------------------ */

export interface SandboxViewState {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly sectionEnabled: boolean;
  readonly sectionHeightM: number;
  readonly selectedAiseId: string | null;
  readonly hoveredAiseId: string | null;
}

export interface PlacementPoint {
  readonly x: number;
  readonly z: number;
}

export interface StagingDraft {
  readonly componentKind: "wall" | "door" | "window" | "column" | "footing" | "slab" | "beam" | "partition";
  readonly points: readonly PlacementPoint[];
  readonly parameterValues: Record<string, string>;
}

export type SandboxMode = "studio-3d" | "plan-2d" | "boq" | "agent" | "evidence";
