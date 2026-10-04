/**
 * `@aise/world-layer1-experience` — the LANE identity (WORLD-P1).
 *
 * The Layer-1 OpenSpace-parity lane. The 2026-10-02 product directive
 * (docs/TECH-LEAD-HANDOFF.md §1 Layer 1) fixes the lane:
 *
 * ```text
 * CAPTURE → SPATIALIZE → REGISTER → RECONSTRUCT → NAVIGATE → COMPARE → MEASURE → EVIDENCE
 * ```
 *
 * "Success means an engineer can inspect and understand site reality
 * spatially rather than through a records dashboard."
 *
 * WHAT THIS PACKAGE IS: the eight lane stages as substrate-neutral TYPED
 * TRANSFORMS composing the P0 substrate ports with the existing
 * capture/evidence seams —
 *
 *   CAPTURE/SPATIALIZE/REGISTER  → src/capture/   (the capture seam's
 *        `CaptureSessionEnvelope` in; a `SpatializedWorldFragment` with
 *        registration states, spatial coverage and geospatial context
 *        binding out — through the P0-A geospatial port vocabulary);
 *   RECONSTRUCT/NAVIGATE         → src/world/     (a navigable
 *        reconstruction world: layer toggling as typed visibility
 *        predicates over the P0-A scene-composition types; navigation
 *        bookmarks as typed world states);
 *   COMPARE/MEASURE              → src/compare/   (model-vs-capture
 *        comparison as typed aligned pairs + difference classifications
 *        with tolerance-DECLARED verdicts delegating to the P0-B
 *        exact-geometry vocabulary; in-world point/line/area/volume
 *        measurement queries with declared tolerances and units);
 *   EVIDENCE                     → src/evidence/  (every lane output
 *        binds to the Evidence Envelope — capture-derived facts enter as
 *        INFERRED with their provenance chain; "what is actually here?"
 *        and "what changed?" are typed evidence-backed queries, never
 *        bare substrate reads).
 *
 * THE LAWS THIS LANE INHERITS (binding, enforced structurally):
 *
 *  1. IDENTITY QUARANTINE (directive §10; P0-A scene.ts identity law):
 *     substrate-side identifiers — USD object paths, glTF node indices,
 *     Assimp mesh names, Cesium entity ids, IFC GUIDs, OCCT topology
 *     names — are NAMESPACED EXTERNAL LABELS at most (the P0-B seam
 *     vocabulary), never canonical AISE identity. Every canonical
 *     element id in this lane is an AISE-owned stable id; a
 *     substrate-shaped id in an identity field is a typed refusal.
 *  2. GHOST DISTINCTNESS (the P0-A law) carries through EVERY contract:
 *     captured reality and proposed/ghost state are structurally
 *     distinct; a swap can never make proposed state indistinguishable
 *     from captured reality. In this lane capture-derived and
 *     plan-derived nodes are never ghosts, and no stage may mark a
 *     capture node `isGhost`.
 *  3. EPISTEMIC DISCIPLINE (the ANCHOR doctrine truth rules): the truth
 *     vocabulary survives every stage — capture-derived facts enter as
 *     INFERRED (never OBSERVED/CONFIRMED), UNKNOWN/NOT_OBSERVED/OCCLUDED
 *     never imply absence, and no answer is fabricated where evidence is
 *     missing (fail closed instead).
 *  4. TOLERANCES ARE DECLARED, NEVER IMPLICIT (substitution-contract
 *     law 2): comparison and measurement verdicts carry their declared
 *     tolerance VERBATIM; a query without a tolerance declaration is
 *     refused; near-boundary predicates answer `within-tolerance`
 *     instead of a silent boolean (the P0-B discipline, delegated to).
 *  5. UNSUPPORTED IS RECORDED, NEVER COMPUTED (law 3): every refusal is
 *     a typed `LaneFailure` whose kind comes from the CLOSED HFX-000
 *     vocabulary (`@aise/provider-registry` FAILURE_KINDS — imported,
 *     never modified) and is machine-readable evidence.
 *  6. DETERMINISM: no network, no clock reads, no randomness, no I/O in
 *     the contract core. Every instant is a declared input; identical
 *     requests produce byte-identical canonical outputs
 *     (content-addressed digests).
 *  7. NO SUBSTRATE IS AN AUTHORITY (directive §3/§10): Babylon/Cesium/
 *     USD/glTF/Assimp/OCCT/IfcOpenShell and any reconstruction engine are
 *     replaceable implementation technologies BEHIND these contracts.
 *     P1 proves the lane with in-memory substitution doubles; the app
 *     composes these contracts with real substrates in WORLD-P4.
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";

/* ------------------------------------------------------------------ */
/* Lane identity                                                        */
/* ------------------------------------------------------------------ */

export const LAYER1_LANE_ID = "layer1-experience" as const;

export const LAYER1_LANE_STATEMENT =
  "AISE Layer-1 experience lane (WORLD-P1, OpenSpace parity): CAPTURE → SPATIALIZE → " +
  "REGISTER → RECONSTRUCT → NAVIGATE → COMPARE → MEASURE → EVIDENCE as substrate-neutral " +
  "typed transforms composing the P0 substrate ports with the capture/evidence seams. " +
  "The primary experience is a navigable spatial world bound to the Evidence Envelope — " +
  "not a table of records. No substrate is an authority; no substrate id is canonical " +
  "identity; capture-derived facts enter as INFERRED; unsupported is recorded, never computed.";

/** The closed eight-stage vocabulary — the lane's own stage machine. */
export const LANE_STAGES = [
  "capture",
  "spatialize",
  "register",
  "reconstruct",
  "navigate",
  "compare",
  "measure",
  "evidence",
] as const;
export type LaneStage = (typeof LANE_STAGES)[number];

export function isLaneStage(value: unknown): value is LaneStage {
  return typeof value === "string" && (LANE_STAGES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Digest + instant disciplines (determinism law carriers)              */
/* ------------------------------------------------------------------ */

/** 64 lowercase hex characters — the shape of every canonical digest here. */
export const CANONICAL_DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export function isCanonicalDigest(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_DIGEST_PATTERN.test(value);
}

/**
 * sha-256 (lowercase hex) over the WIRE canonical JSON of the value
 * (the house discipline shared with `@aise/world-understanding-substrate`
 * and `@aise/provider-registry`). The same value always digests to the
 * same id; no salt, no clock, no randomness.
 */
export function canonicalDigestOf(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

/** The ISO-8601 UTC instant shape every declared instant must satisfy. */
export const ISO_UTC_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isIsoUtcInstant(value: unknown): value is string {
  return typeof value === "string" && ISO_UTC_INSTANT_PATTERN.test(value);
}

/** 64-hex content-address shape (the Evidence identity shape). */
export const CONTENT_ID_PATTERN = /^[0-9a-f]{64}$/;

export function isContentId(value: unknown): value is string {
  return typeof value === "string" && CONTENT_ID_PATTERN.test(value);
}

/* ------------------------------------------------------------------ */
/* Provider-neutral method identities (the Derivation.method law)        */
/* ------------------------------------------------------------------ */

/**
 * The CLOSED provider-neutral method identities of this lane — the
 * `Derivation.method` values every lane derivation carries (mirroring
 * the P0-B `SUBSTRATE_METHOD_IDENTITIES` discipline). Provider-neutral
 * by construction: no engine name, no substrate version — an occupant
 * of the port (the in-memory double today, a real reconstruction
 * engine in the future) never changes the method identity, only the
 * `methodVersion`.
 */
export const LANE_METHOD_IDENTITIES = [
  "spatialization.capture-session",
  "registration.site-georeference",
  "reconstruction.world-compose",
  "comparison.model-capture",
  "world.measurement",
  "world.evidence-query",
] as const;
export type LaneMethodIdentity = (typeof LANE_METHOD_IDENTITIES)[number];

export function isLaneMethodIdentity(value: unknown): value is LaneMethodIdentity {
  return (
    typeof value === "string" &&
    (LANE_METHOD_IDENTITIES as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ */
/* The epistemic law of capture-derived facts                            */
/* ------------------------------------------------------------------ */

import type { EpistemicStatus } from "@aise/shared-contracts";

/**
 * The epistemic status every CAPTURE-DERIVED fact must enter with
 * (the lane's law #3): a capture session, a spatialization, a
 * registration, a comparison or a measurement produced from capture
 * evidence is a DERIVED CANDIDATE — `INFERRED` — until AISE gates
 * accept it. Never `OBSERVED`, never `CONFIRMED` (that promotion is
 * the Reality Graph's, not this lane's).
 */
export const CAPTURE_DERIVED_EPISTEMIC_STATUS: EpistemicStatus = "INFERRED";

/* ------------------------------------------------------------------ */
/* Lane-recognized acquisition metadata keys                             */
/* ------------------------------------------------------------------ */

/**
 * The acquisition-metadata keys THIS LANE recognizes (the open-map
 * discipline of `@aise/shared-contracts` evidence.ts: producers may add
 * their own keys; consumers must ignore keys they do not understand —
 * these are the keys this consumer understands, ADDING vocabulary
 * without modifying the frozen shared-contracts key table):
 *
 *  - `layer1.pose.x.m` / `layer1.pose.y.m` / `layer1.pose.z.m` — the
 *    device-declared pose of the captured asset in the SITE frame
 *    (metres, string-encoded per the open-map discipline);
 *  - `layer1.volume.min.x.m` … `layer1.volume.max.z.m` — the
 *    device-declared capture VOLUME (world-space AABB of what the
 *    asset observed, metres);
 *  - `layer1.volume.basis` — how the volume was declared (e.g.
 *    `device-fov-declared`, `operator-declared`) — carried into the
 *    coverage basis verbatim.
 *
 * Absent pose keys → the asset is spatially UNPLACED (carried honestly,
 * never guessed). Absent volume keys → the asset contributes NO
 * coverage (a limitation is recorded, never a fabricated bound).
 */
export const LANE_ACQUISITION_METADATA_KEYS = {
  poseX: "layer1.pose.x.m",
  poseY: "layer1.pose.y.m",
  poseZ: "layer1.pose.z.m",
  volumeMinX: "layer1.volume.min.x.m",
  volumeMinY: "layer1.volume.min.y.m",
  volumeMinZ: "layer1.volume.min.z.m",
  volumeMaxX: "layer1.volume.max.x.m",
  volumeMaxY: "layer1.volume.max.y.m",
  volumeMaxZ: "layer1.volume.max.z.m",
  volumeBasis: "layer1.volume.basis",
} as const;

/* ------------------------------------------------------------------ */
/* Substrate-shaped id patterns (the identity-quarantine scan set)      */
/* ------------------------------------------------------------------ */

/**
 * Recognized SUBSTRATE-side id shapes that must NEVER appear in a
 * canonical identity field of this lane (directive §10; the P0-B
 * `IFC_GUID_PATTERN` discipline extended to the Reality substrates):
 *
 *  - the IFC GlobalId shape (22 chars of the IFC base64 alphabet);
 *  - USD/USDZ object-path shape (`/World/...` prim paths);
 *  - glTF node-index shape (`node:12` / `mesh:7` references);
 *  - Assimp mesh-name shape (`aiMesh::...`);
 *  - Cesium entity-id shape (`cesium-entity:...`).
 *
 * These patterns back the identity-quarantine validators: an
 * elementId/subjectId matching one of them is a typed
 * `identity_leak_detected`-class refusal (see failures.ts for the
 * HFX-000 kind mapping).
 */
export const SUBSTRATE_ID_PATTERNS: readonly { readonly name: string; readonly pattern: RegExp }[] =
  [
    { name: "ifc-guid", pattern: /^[0-9A-Za-z_$]{22}$/ },
    { name: "usd-prim-path", pattern: /^\/[A-Za-z][\w]*\/[\w/.:-]*$/ },
    { name: "gltf-node-ref", pattern: /^(node|mesh|material|accessor|buffer):\d+$/ },
    { name: "assimp-mesh-name", pattern: /^aiMesh::/ },
    { name: "cesium-entity-id", pattern: /^cesium-entity:/ },
  ];

/**
 * Does this id LOOK like a substrate-side identifier? (The
 * identity-quarantine tripwire: a canonical id field carrying one of
 * these shapes is a typed refusal — the label vocabulary is where
 * substrate ids belong, never identity.)
 */
export function looksLikeSubstrateId(value: string): string | null {
  for (const entry of SUBSTRATE_ID_PATTERNS) {
    if (entry.pattern.test(value)) {
      return entry.name;
    }
  }
  return null;
}
