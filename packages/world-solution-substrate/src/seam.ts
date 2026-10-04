/**
 * WORLD-P0-C — the shared Solution-substrate SEAM.
 *
 * The common law-layer under the four family contracts of this package
 * (scene/ cad/ simulation/ desktop/): the namespaced-external-label
 * discipline for the Solution lane's substrates, the canonical digest
 * discipline, the closed failure vocabulary re-use (HFX-000, imported —
 * never modified), the provider descriptor, the per-result provenance
 * block and the deterministic non-interference guard. It deliberately
 * mirrors the seam discipline of the sibling packages
 * (`@aise/world-understanding-substrate` seam.ts, WORLD-P0-B) so all
 * three P0 substrate lanes enforce the same substitution laws — but it
 * is DEFINED HERE for the Solution lane and imports NOTHING from the
 * siblings at the seam level: the family contracts are where the
 * sibling PORT TYPES are consumed.
 *
 * THE BINDING LAWS ENCODED HERE (spec/technology-substitution-contract.md
 * §2 the three laws; docs/TECH-LEAD-HANDOFF.md §3/§10 prohibitions; the
 * 2026-10-02 directive; spec/world-program.md gates):
 *
 *  1. SUBSTRATE IDS ARE NAMESPACED EXTERNAL LABELS, NEVER CANONICAL AISE
 *     IDENTITY. FreeCAD document/object names, USD object paths, glTF
 *     part labels and sidecar process tokens live in
 *     `NamespacedExternalLabel` records with a CLOSED namespace
 *     vocabulary. Canonical ids in this lane are AISE-side ids (Solution
 *     Graph ids, element ids, model ids) or 64-hex content-derived
 *     digests; a validator REFUSES any id field that equals an external
 *     label value.
 *  2. THE CANONICAL SOLUTION GRAPH STAYS THE ONLY AUTHORITY. Every
 *     substrate result is a DERIVED PROJECTION: simulation trajectories,
 *     CAD geometry and shell state never write back to the Solution
 *     Graph, never carry `CONFIRMED` semantics, and simulated progress
 *     enters the Outcome lane as `PROPOSED` with simulation provenance
 *     (a simulation substrate NEVER replaces the deterministic solution
 *     engine as authority — directive §10).
 *  3. UNSUPPORTED IS RECORDED, NEVER COMPUTED. Every port answers with a
 *     discriminated outcome; refusals use the HFX-000 closed vocabulary
 *     (imported from `@aise/provider-registry`, never modified) and are
 *     machine-readable evidence. Negatives fail closed.
 *  4. TOLERANCES ARE DECLARED, NEVER IMPLICIT. Exact-geometry comparison
 *     requests built by this lane's CAD family delegate to the P0-B
 *     exact-geometry port vocabulary and REQUIRE the declared tolerance;
 *     near-boundary verdicts stay with the consumer.
 *  5. DETERMINISM: no network, no clock reads, no randomness, no I/O in
 *     the contract core. Instants (`recordedAt` and friends) are
 *     DECLARED inputs, never sensed. Identical requests through the
 *     same provider produce byte-identical, content-addressed results.
 *  6. THE GHOST-DISTINCTNESS LAW HOLDS END-TO-END: proposed/what-if
 *     geometry is presented as ghost state, structurally distinct from
 *     captured reality, at every layer of the usage composition (the
 *     P0-A scene law carried through the Solution lane).
 *  7. THE SHELL IS A THIN HOST: the desktop shell owns presentation and
 *     platform interaction ONLY — never canonical engineering state
 *     (the PROD-020 / ACR-004 discipline the existing Electron thin
 *     shell already follows).
 *  8. NO SECOND DESKTOP AUTHORITY: platform-specific rendering or
 *     storage must never create platform-specific engineering truth
 *     (directive §6 cross-platform identity law).
 *
 * The four substrate technologies this package names (FreeCAD as the
 * parametric CAD reference implementation; Tauri and the existing
 * Electron thin shell as the desktop shell candidates; Babylon/OCCT/IFC/
 * USD/glTF as the composed sibling ports) sit BEHIND these contracts as
 * replaceable implementation technology — never authorities (directive
 * §10). The in-repo substitution doubles in each family's `doubles.ts`
 * prove the contracts are implementable WITHOUT the substrate; real
 * engines are future occupants of the ports.
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { FailureKind } from "@aise/provider-registry";

/* ------------------------------------------------------------------ */
/* Lane identity                                                        */
/* ------------------------------------------------------------------ */

export const SOLUTION_SUBSTRATE_LANE_ID = "solution-substrate" as const;

export const SOLUTION_LANE_STATEMENT =
  "AISE Solution-layer + desktop substrate lane (WORLD-P0-C): the scene-usage " +
  "contract composing the P0-A reality ports, the parametric CAD contract " +
  "(FreeCAD the reference), the execution-simulation contract over the canonical " +
  "Solution Graph + EngineeringOperation vocabulary, and the desktop shell " +
  "integration contract are substrate-NEUTRAL typed adapter contracts. Their " +
  "substrates (FreeCAD, Tauri/Electron, Babylon/OCCT/IfcOpenShell/USD/glTF via " +
  "the sibling ports) are REPLACEABLE implementation technologies behind the " +
  "ports — never engineering authorities; their ids never become canonical AISE " +
  "identity; the canonical Solution Graph stays the only solution authority; " +
  "simulated progress enters the Outcome lane as PROPOSED, never CONFIRMED.";

/** The closed substrate-family vocabulary of this package. */
export const SOLUTION_SUBSTRATE_FAMILIES = [
  "scene",
  "cad",
  "simulation",
  "desktop",
] as const;
export type SolutionSubstrateFamily = (typeof SOLUTION_SUBSTRATE_FAMILIES)[number];

export function isSolutionSubstrateFamily(
  value: unknown,
): value is SolutionSubstrateFamily {
  return (
    typeof value === "string" &&
    (SOLUTION_SUBSTRATE_FAMILIES as readonly string[]).includes(value)
  );
}

/** The closed provider-neutral method identities of this lane. */
export const SOLUTION_SUBSTRATE_METHOD_IDENTITIES = [
  "solution.scene-usage",
  "cad.parametric",
  "simulation.execution",
  "desktop.shell",
] as const;
export type SolutionSubstrateMethodIdentity =
  (typeof SOLUTION_SUBSTRATE_METHOD_IDENTITIES)[number];

/**
 * The epistemic status simulated progress MUST enter the Outcome lane as
 * (law 2): `PROPOSED` — a simulation trajectory is a projection of a
 * proposed solution, never an observed/confirmed outcome. Representing
 * `CONFIRMED` (or `OBSERVED`/`INFERRED`) inside a simulated-progress
 * capture record is a typed contract violation.
 */
export const SIMULATED_PROGRESS_EPISTEMIC_STATUS = "PROPOSED" as const;

/* ------------------------------------------------------------------ */
/* Namespaced external labels (law 1)                                   */
/* ------------------------------------------------------------------ */

/**
 * The CLOSED namespace vocabulary of Solution-lane substrate-side
 * identifiers. A label records WHERE an id comes from (which substrate
 * technology); it is provenance data, never identity. Frozen: adding a
 * namespace is a contract change.
 */
export const SOLUTION_EXTERNAL_LABEL_NAMESPACES = [
  /** A FreeCAD document name (`App.newDocument(name)` — the doc's Name). */
  "freecad-document",
  /** A FreeCAD object name (`doc.addObject(type, name)` — the object's Name). */
  "freecad-object",
  /** A USD object path carried by a P0-A composition source. */
  "usd-path",
  /** A glTF part label ("mesh:N" / "mesh:N/primitive:M") scoped to an asset. */
  "gltf-part",
  /** A sidecar process identity (executable/spec identity — NOT the handle). */
  "sidecar-process",
] as const;
export type SolutionExternalLabelNamespace =
  (typeof SOLUTION_EXTERNAL_LABEL_NAMESPACES)[number];

export function isSolutionExternalLabelNamespace(
  value: unknown,
): value is SolutionExternalLabelNamespace {
  return (
    typeof value === "string" &&
    (SOLUTION_EXTERNAL_LABEL_NAMESPACES as readonly string[]).includes(value)
  );
}

/**
 * A Solution-lane substrate-side identifier carried as NAMESPACED EXTERNAL
 * LABEL: the FreeCAD document/object name, the USD object path, the glTF
 * part label, the sidecar process identity. Directive §10: these NEVER
 * become canonical AISE identity.
 */
export interface NamespacedExternalLabel {
  readonly namespace: SolutionExternalLabelNamespace;
  readonly value: string;
}

/**
 * A FreeCAD object/document name shape: non-empty, printable, no path
 * separators (FreeCAD names are per-document unique labels like
 * `Sketch` / `Pad` — carried as external labels, never identity).
 */
export const FREECAD_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

export function isFreecadNameShaped(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    FREECAD_NAME_PATTERN.test(value)
  );
}

/** All external-label values carried by one result (the identity-law scan set). */
export function externalLabelValuesOf(
  labels: readonly NamespacedExternalLabel[],
): string[] {
  return labels.map((label) => label.value);
}

/* ------------------------------------------------------------------ */
/* Canonical digest discipline                                          */
/* ------------------------------------------------------------------ */

/** 64 lowercase hex characters — the shape of every canonical digest here. */
export const CANONICAL_DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export function isCanonicalDigest(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_DIGEST_PATTERN.test(value);
}

/**
 * sha-256 (lowercase hex) over the WIRE canonical JSON of the value
 * (sorted keys, 2-space indent, trailing newline — the house discipline
 * shared with the sibling substrate lanes). The same value always
 * digests to the same id; no salt, no clock, no randomness.
 */
export function canonicalDigestOf(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

/** sha-256 (lowercase hex) over the raw UTF-8 bytes of a text payload. */
export function textDigestOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/* ------------------------------------------------------------------ */
/* Closed-vocabulary failures + outcomes (law 3)                        */
/* ------------------------------------------------------------------ */

/**
 * A typed substrate failure: the kind comes from the HFX-000 CLOSED
 * vocabulary (`@aise/provider-registry` FAILURE_KINDS — imported, never
 * modified), the detail is the provider's honest statement. Never a
 * throw, never a silent gap.
 */
export interface SubstrateFailure {
  readonly kind: FailureKind;
  readonly family: SolutionSubstrateFamily;
  readonly detail: string;
}

/** The discriminated outcome of one port call. */
export type SubstrateOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: SubstrateFailure };

export function refused<T>(
  family: SolutionSubstrateFamily,
  kind: FailureKind,
  detail: string,
): SubstrateOutcome<T> {
  return { ok: false, failure: { kind, family, detail } };
}

/* ------------------------------------------------------------------ */
/* The provider descriptor (the port occupant identity)                 */
/* ------------------------------------------------------------------ */

/**
 * The identity of one occupant of a family port. The in-repo
 * substitution doubles describe themselves here honestly ("in-memory
 * substitution double — no substrate integrated"); a future FreeCAD
 * adapter, Tauri shell or execution-simulation engine describes the real
 * technology. Provenance continuity across a swap is testable from the
 * descriptor digest.
 */
export interface SubstrateProviderDescriptor {
  readonly providerId: string;
  readonly family: SolutionSubstrateFamily;
  readonly technologyVersion: string;
  readonly engineNote: string;
  readonly laneStatement: string;
}

/** The 64-hex content digest of a provider descriptor (provenance pin). */
export function providerDescriptorDigestOf(
  descriptor: SubstrateProviderDescriptor,
): string {
  return canonicalDigestOf(descriptor);
}

/* ------------------------------------------------------------------ */
/* Per-result provenance                                                */
/* ------------------------------------------------------------------ */

/**
 * The provenance block every family result carries: WHO computed it
 * (provider descriptor digest), WHAT went in (input digest), WHICH
 * declared parameters (parameters digest) and the lane statement.
 * Provenance continuity across a swap is testable from this block.
 */
export interface SubstrateResultProvenance {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly providerDescriptorDigest: string;
  readonly inputDigest: string;
  readonly parametersDigest: string;
  readonly laneStatement: string;
}

/* ------------------------------------------------------------------ */
/* Deep freeze (the non-interference guard)                             */
/* ------------------------------------------------------------------ */

/**
 * Structurally deep-freezes a value: requests handed to a governed port
 * entry are frozen so a provider CANNOT mutate caller state through the
 * interface.
 *
 * Typed arrays (the byte payloads of asset sources) are passed through
 * UNTOUCHED: `Object.freeze` throws on typed-array index properties in
 * strict mode, and the byte payloads are read-only inputs to every
 * conforming adapter (the doubles never mutate them — asserted by the
 * non-interference tests).
 */
export function deepFreeze<T>(value: T): T {
  if (ArrayBuffer.isView(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const element of value) {
      deepFreeze(element);
    }
    Object.freeze(value);
    return value;
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* The identity-law guard (law 1, shared enforcement)                   */
/* ------------------------------------------------------------------ */

/**
 * Fail-closed identity-law check: a candidate canonical id (an AISE-side
 * id or a content digest) must NEVER equal any external label value the
 * surrounding interaction carried. Returns the violating label values
 * (empty = clean) so family contracts can refuse with the exact
 * smuggled id named in the detail.
 */
export function externalLabelCollisions(
  candidateIds: readonly string[],
  labelValues: readonly string[],
): string[] {
  const labelSet = new Set(labelValues);
  return candidateIds.filter((id) => labelSet.has(id));
}
