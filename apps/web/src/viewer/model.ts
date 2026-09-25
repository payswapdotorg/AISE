/**
 * AISE-027 — synchronized intervention viewer: STRUCTURAL INPUT MODEL.
 *
 * ⚠⚠⚠ NO BROWSER-SIDE AUTHORITY (frozen invariant, spec/architecture-lock.md
 * "Authority" #8: UI state is never canonical; #6: intervention states are
 * proposals until supported by post-execution evidence) ⚠⚠⚠
 *
 * ⚠⚠⚠ STRICTLY READ-ONLY OVER AUTHORITATIVE REALITY (work order §027:
 * "Verify state alignment and no mutation of authoritative reality";
 * lock "Intervention": "Proposed intervention states cannot mutate
 * authoritative existing reality.") ⚠⚠⚠
 *
 * Everything in this module is READ-ONLY DISPLAY DATA. The viewer NEVER
 * fetches, NEVER computes engineering truth, NEVER materializes states,
 * NEVER records steps and NEVER writes anything back. All facts arrive
 * fully assembled by the server inside `ViewerInput`: one intervention
 * SCENARIO RECORD (AISE-026 — steps + immutable materialized states, every
 * node already PROPOSED), the geometry records resolved for the state
 * nodes' refs (AISE-020/021 structural convention), the currently viewed
 * LAYER index and the currently selected node id. The rendered HTML —
 * including the 3D/2D/BOQ panes and the Next/Previous navigation — is a
 * PROJECTION of that input, nothing more. Navigating layers changes ONLY
 * which immutable state the three panes project; it never touches data.
 *
 * BOUNDARY MATRIX (tools/lib/boundaries.ts): apps may import apps/packages
 * ONLY — apps/web CANNOT import backend/api sources. Therefore the types
 * below are STRUCTURAL MIRRORS of the backend shapes (AISE-026
 * `InterventionScenario` family — model.ts of backend/api/src/intervention):
 * same field names, same JSON shapes, defined locally. A real backend
 * scenario record serialized over the wire satisfies these types as-is
 * (structural typing); the AUTHORITATIVE state materialization, state-id
 * derivation and step policies stay in the backend (AISE-026). Following
 * the AISE-021/AISE-024 sibling convention, this module — and every module
 * of `apps/web/src/viewer/` — is SELF-CONTAINED: it deliberately imports
 * NOTHING (the axonometric formulas and formatting primitives are local,
 * documented copies of the AISE-021 conventions).
 *
 * SYNCHRONIZED STABLE IDS (the §027 acceptance core, mirroring
 * spec/domain-model.md "Intervention semantics": "The same state ID feeds
 * 3D, 2D, BOQ and report projections."): every materialized state carries
 * the AISE-026 content-derived `stateId` (sha256 over the canonical state
 * identity — the backend's authority, carried VERBATIM here and NEVER
 * re-derived). The viewer derives ONE `ViewerFrame` per rendered layer —
 * {scenarioId, baselineVersionId, stateIndex, stateId, appliedStepIds} —
 * and ALL THREE panes (3D, 2D, BOQ) are projected from that ONE frame's
 * ONE state object, so the panes cannot desynchronize by construction.
 * Node-level identity is the SAME stable `nodeId` in all three panes (the
 * R5/§011 "Selecting a physical element … or BOQ item synchronizes the
 * other views" anchor).
 *
 * NO SECOND VOCABULARY: node kinds, step kinds, scenario statuses, state
 * node/relationship origins and geometry-ref kinds are AISE-026/016
 * vocabularies, typed HERE as plain `string` and carried VERBATIM — never
 * re-validated, never re-derived (a duplicate frozen vocabulary in the
 * viewer would be a second canonical model). The ONLY frozen vocabularies
 * defined locally are the viewer's OWN presentation vocabularies: the
 * projection omission reason codes (mirroring the AISE-021 wireframe codes
 * — same strings, documented attribution) and the navigation directions.
 */

/* ------------------------------------------------------------------ */
/* Structural mirror of the AISE-026 proposal layer (PROPOSED only)     */
/* ------------------------------------------------------------------ */

/**
 * A property assertion inside an intervention state — structural mirror of
 * AISE-026 `ProposedProperty`. `epistemicStatus` is the LITERAL `"PROPOSED"`:
 * representing OBSERVED/INFERRED/CONFIRMED inside a proposal layer is a
 * COMPILE ERROR here exactly as it is in the backend model (a proposal is
 * not an observation — the epistemic seal is preserved end-to-end, from
 * the backend type through the wire into the viewer's own types).
 */
export interface ViewerProposedProperty {
  readonly key: string;
  readonly value: string | number | boolean;
  /** REQUIRED for numeric values; absent for non-numeric (026 discipline). */
  readonly unit?: string;
  readonly epistemicStatus: "PROPOSED";
  /** Carried verbatim; never interpreted by the viewer. */
  readonly provenance: readonly unknown[];
}

/**
 * A node inside an intervention state — structural mirror of AISE-026
 * `ProposedNode`. ALWAYS PROPOSED (literal type); `kind` is AISE-026/016's
 * `NodeKind` vocabulary carried verbatim (string here — no second
 * vocabulary). No `acquisitionRef`/`interventionRef`: acquisition is a
 * reality fact and the layer identity lives on the state header.
 */
export interface ViewerProposedNode {
  readonly nodeId: string;
  readonly kind: string;
  readonly epistemicStatus: "PROPOSED";
  readonly properties: readonly ViewerProposedProperty[];
  readonly geometry?: ViewerGeometryRef;
  /** Carried verbatim; never interpreted by the viewer. */
  readonly provenance: readonly unknown[];
  readonly units?: ViewerUnitDeclaration;
}

/**
 * One node of a materialized state with its traceability metadata —
 * structural mirror of AISE-026 `InterventionStateNode`. `origin` is 026's
 * `STATE_NODE_ORIGINS` vocabulary (baseline | baseline_touched | scenario)
 * carried verbatim; `appliedStepIds` names the steps that touched the node.
 */
export interface ViewerStateNode {
  readonly nodeId: string;
  readonly origin: string;
  readonly appliedStepIds: readonly string[];
  readonly node: ViewerProposedNode;
}

/**
 * One relationship of a materialized state — structural mirror of AISE-026
 * `InterventionStateRelationship` (relationship body structurally minimal).
 */
export interface ViewerStateRelationship {
  readonly relationshipId: string;
  readonly origin: string;
  readonly relationship: {
    readonly relationshipId: string;
    readonly fromNodeId: string;
    readonly toNodeId: string;
    readonly kind: string;
    readonly provenance: readonly unknown[];
  };
}

/**
 * A PROPOSED tombstone — structural mirror of AISE-026 `ProposedTombstone`.
 * Proposed removals never physically delete anything; the viewer renders
 * them as proposed-removal BOQ rows, never as facts.
 */
export interface ViewerProposedTombstone {
  readonly nodeId: string;
  readonly reason: string;
  readonly proposedByStepId: string;
  readonly severedRelationshipIds: readonly string[];
}

/**
 * MATERIALIZED layer N — structural mirror of AISE-026 `InterventionState`.
 * `stateId` is the backend's content-derived sha256 (carried VERBATIM, the
 * synchronized stable id all panes resolve to); `materializedAt` is the
 * 026-injected clock and is EXCLUDED from state identity — the viewer
 * renders state IDENTITY only and deliberately does not display it.
 */
export interface ViewerInterventionState {
  readonly stateId: string;
  readonly scenarioId: string;
  /** Layer number: 0 = pure baseline overlay; N = after step N. */
  readonly stateIndex: number;
  /** Always the scenario's PINNED baseline version. */
  readonly baselineVersionId: string;
  /** Steps 1..stateIndex in application order (step ids). */
  readonly appliedStepIds: readonly string[];
  readonly nodes: readonly ViewerStateNode[];
  readonly relationships: readonly ViewerStateRelationship[];
  readonly proposedTombstones: readonly ViewerProposedTombstone[];
  readonly materializedAt: string;
}

/**
 * A step's provenance — structural mirror of AISE-026 `StepProvenance`
 * (non-empty evidenceIds and/or a derivationNote, carried VERBATIM and
 * never interpreted here).
 */
export interface ViewerStepProvenance {
  readonly evidenceIds: readonly string[];
  readonly derivationNote?: string;
}

/**
 * One ordered, already-recorded step — structural DISPLAY SLICE of
 * AISE-026 `InterventionStep`: the same field names for everything the
 * viewer renders (id, position, kind, target, rationale, provenance,
 * clock). The step's `change` payload is deliberately NOT mirrored — it
 * is display-irrelevant here, and structural typing keeps wire
 * compatibility (a serialized 026 step record satisfies this slice as-is;
 * extra fields are ignored). `kind` is 026's `STEP_KINDS` vocabulary
 * carried verbatim.
 */
export interface ViewerInterventionStep {
  readonly stepId: string;
  readonly stepIndex: number;
  readonly kind: string;
  readonly targetNodeId: string;
  /** Free-text rationale, carried VERBATIM. */
  readonly rationale?: string;
  readonly provenance: ViewerStepProvenance;
  readonly recordedAt: string;
}

/**
 * A recorded Case-domain review outcome — structural mirror of AISE-026
 * `ApprovalReference`, rendered VERBATIM and NEVER interpreted (the review
 * vocabulary belongs to the Engineering Case domain, AISE-025).
 */
export interface ViewerApprovalReference {
  readonly caseId: string;
  readonly reviewDecision: string;
  readonly reviewedAt: string;
}

/**
 * The intervention scenario record — structural mirror of AISE-026
 * `InterventionScenario`. `states[N]` = layer N; states.length ===
 * steps.length + 1 (026 invariant, re-checked by the viewer's alignment
 * guard). `status` is 026's `SCENARIO_STATUSES` vocabulary, verbatim.
 */
export interface ViewerScenario {
  readonly scenarioId: string;
  readonly projectId: string;
  readonly title: string;
  readonly baselineVersionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: string;
  readonly steps: readonly ViewerInterventionStep[];
  readonly states: readonly ViewerInterventionState[];
  readonly approvalReference?: ViewerApprovalReference;
  readonly transitions: readonly { status: string; at: string }[];
}

/* ------------------------------------------------------------------ */
/* Geometry records (AISE-020/021 structural convention)               */
/* ------------------------------------------------------------------ */

/** 3D world vector in metres. */
export type Vec3 = readonly [number, number, number];

/** 2D screen/drawing point. */
export type Point2D = readonly [number, number];

/** Plane n̂·x + d = 0 (structural mirror of the geometry module). */
export interface Plane {
  readonly normal: Vec3;
  readonly d: number;
}

/**
 * Geometry explicitly resolved for one geometry-ref id — structural mirror
 * of the AISE-020/021 `PlaneGeometryRecord`: unit normal + offset, the
 * plane offset's physical 1σ when the producer knows it (absent/null =
 * unknown — never 0) and the 3D boundary polygon in world metres when
 * known. Server-assembled; the viewer NEVER derives geometry.
 */
export interface PlaneGeometryRecord {
  readonly geometryId: string;
  readonly kind: "plane";
  readonly plane: Plane;
  readonly offsetSigma?: number | null;
  readonly boundaryPolygon?: readonly Vec3[];
}

/** A pure polygon record (structural mirror of AISE-020/021). */
export interface PolygonGeometryRecord {
  readonly geometryId: string;
  readonly kind: "polygon";
  readonly polygon: readonly Vec3[];
}

export type GeometryRecord = PlaneGeometryRecord | PolygonGeometryRecord;

/** Reference to geometry owned elsewhere (structural mirror of 016/026). */
export interface ViewerGeometryRef {
  readonly kind: string;
  readonly ref: string;
  readonly sourceArtifactId?: string;
}

/** Units of a node's geometry and numeric properties (016/026 mirror). */
export interface ViewerUnitDeclaration {
  readonly linear: string;
  readonly angular: string;
}

/* ------------------------------------------------------------------ */
/* Optional generated-visual inputs (HFX-303 — structural mirrors)      */
/* ------------------------------------------------------------------ */

/*
 * The generated-visual pane's wire inputs are STRUCTURAL MIRRORS of the
 * visual-render lane's artifact/fallback records (same field names, same
 * JSON shapes, defined locally in generated/model.ts — the AISE-027
 * mirror discipline; the compat test proves a live package artifact
 * satisfies them as-is). They are imported TYPE-ONLY: zero runtime
 * surface, zero effect on renders that do not carry them.
 */
import type {
  GeneratedVisualArtifact,
  GeneratedVisualFallbackRecord,
} from "./generated/model";
export type { GeneratedVisualArtifact, GeneratedVisualFallbackRecord };

/* ------------------------------------------------------------------ */
/* 3D view parameters (presentation only)                              */
/* ------------------------------------------------------------------ */

/**
 * Orthographic axonometric view parameters (radians). Presentation-only:
 * they change the PROJECTION of the wireframe, never any data.
 */
export interface ViewParams {
  /** Rotation of the model about the vertical (z) axis. */
  readonly azimuthRad: number;
  /** Viewing elevation above the horizontal plane. */
  readonly elevationRad: number;
}

/* ------------------------------------------------------------------ */
/* Honest projection omissions (presentation vocabulary)               */
/* ------------------------------------------------------------------ */

/**
 * Stable omission reason codes for the 3D and 2D panes — the SAME strings
 * as AISE-021's `WIREFRAME_OMISSION_REASONS` (documented attribution, no
 * second vocabulary): a node that was a projection candidate but produced
 * no drawn geometry is OMITTED with one of these codes — geometry is never
 * guessed, interpolated or completed.
 */
export const PROJECTION_OMISSION_REASONS = Object.freeze([
  "geometry-ref-absent",
  "geometry-kind-not-projectable",
  "geometry-unresolved",
  "boundary-absent",
  "degenerate-projection",
] as const);
export type ProjectionOmissionReason = (typeof PROJECTION_OMISSION_REASONS)[number];

/** A node that was a candidate but produced no projected geometry. */
export interface ProjectionOmission {
  readonly nodeId: string;
  readonly reason: ProjectionOmissionReason;
}

/* ------------------------------------------------------------------ */
/* Pane projection models (all derived from ONE state)                 */
/* ------------------------------------------------------------------ */

/** One projected shape of ONE state node in a pane (2D plan or 3D wireframe). */
export interface ProjectedShape {
  /** STABLE node id — identical across the 3D, 2D and BOQ panes. */
  readonly nodeId: string;
  /** The geometry record id the shape was projected from. */
  readonly geometryId: string;
  /** Projected points, verbatim polygon order, closed contours. */
  readonly points: readonly Point2D[];
  /** 026 origin vocabulary value, carried verbatim (presentation hook). */
  readonly origin: string;
}

/** The deterministic projection of one state into one geometric pane. */
export interface PaneProjection {
  readonly shapes: readonly ProjectedShape[];
  readonly omissions: readonly ProjectionOmission[];
}

/** One BOQ pane row: a live state node's proposed quantities, verbatim. */
export interface BoqRow {
  readonly nodeId: string;
  readonly kind: string;
  readonly origin: string;
  readonly appliedStepIds: readonly string[];
  readonly properties: readonly ViewerProposedProperty[];
}

/** One BOQ pane proposed-removal row (a 026 proposed tombstone, verbatim). */
export interface BoqRemovalRow {
  readonly nodeId: string;
  readonly reason: string;
  readonly proposedByStepId: string;
}

/** The BOQ pane projection of one state (rows + removals, node-id sorted). */
export interface BoqProjection {
  readonly rows: readonly BoqRow[];
  readonly removals: readonly BoqRemovalRow[];
}

/* ------------------------------------------------------------------ */
/* The synchronized navigation frame (THE §027 acceptance object)      */
/* ------------------------------------------------------------------ */

/** Navigation directions across layers (the viewer's own vocabulary). */
export const NAVIGATION_DIRECTIONS = Object.freeze(["next", "previous"] as const);
export type NavigationDirection = (typeof NAVIGATION_DIRECTIONS)[number];

/**
 * The ONE identity frame all three panes of a rendered layer share — the
 * §027 synchronization anchor: {scenarioId, baselineVersionId, stateIndex,
 * stateId, appliedStepIds} resolved from ONE scenario record. Panes are
 * always projected from the frame's state object, so a pane-level
 * stateId/scenarioId/step-identity disagreement is unrepresentable.
 */
export interface ViewerFrame {
  readonly scenarioId: string;
  readonly projectId: string;
  readonly baselineVersionId: string;
  readonly stateIndex: number;
  readonly stateId: string;
  /** Steps 1..stateIndex in application order (the layer's step identity). */
  readonly appliedStepIds: readonly string[];
  /** Total layers in the scenario (states.length — always ≥ 1). */
  readonly stateCount: number;
  readonly atFirst: boolean;
  readonly atLast: boolean;
}

/* ------------------------------------------------------------------ */
/* Viewer input (server-assembled, read-only)                          */
/* ------------------------------------------------------------------ */

/**
 * EVERYTHING the viewer renders. Assembled entirely server-side (see
 * read.ts's `loadViewerInput` over the injected READ-ONLY reader); the
 * browser never fetches, never derives and never mutates it. There is
 * deliberately NO field for the baseline `GraphVersion` and NO write
 * surface: the viewer holds proposed states only, and authoritative
 * reality is never in its hands to mutate.
 *
 * HFX-303 (OPTIONAL generated-visual fields): `generatedVisual` and
 * `generatedVisualFallback` are ABSENT in every existing input — a
 * render without them is BIT-IDENTICAL to the pre-HFX-303 viewer
 * (golden-tested). When present they attach the visual lane's output as
 * READ-ONLY presentation: a rendered hypothesis visual (with its
 * provenance + label manifest) or the honest fallback record. They can
 * never change the canonical panes, the quantities or any state — the
 * generated pane is presentation only (see generated/model.ts).
 */
export interface ViewerInput {
  /** The full AISE-026 scenario record (steps + immutable states). */
  readonly scenario: ViewerScenario;
  /** Geometry records resolved for the states' geometry refs. */
  readonly geometries: readonly GeometryRecord[];
  /** The currently viewed LAYER index (default 0 — the baseline overlay). */
  readonly stateIndex?: number;
  /** The currently selected stable node id (presentation only). */
  readonly selectedNodeId?: string;
  /** Axonometric view parameters for the 3D pane (default when absent). */
  readonly view?: ViewParams;
  /**
   * OPTIONAL (HFX-303): a generated visual artifact for the viewed
   * state, produced server-side through the visual-rendering provider
   * port. Presentation only — never authority. Absent = no pane.
   */
  readonly generatedVisual?: GeneratedVisualArtifact;
  /**
   * OPTIONAL (HFX-303): the honest fallback record when visual
   * generation failed or no provider was configured. The canonical
   * panes remain; this adds the recorded notice. Absent = no notice.
   */
  readonly generatedVisualFallback?: GeneratedVisualFallbackRecord;
}
