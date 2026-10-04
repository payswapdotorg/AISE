/**
 * WORLD-P0-B — the shared Understanding-substrate SEAM.
 *
 * The common law-layer under the three family contracts (ifc/ geometry/
 * field/): the namespaced-external-label discipline, the canonical digest
 * discipline, the closed failure vocabulary re-use, the provider
 * descriptor, the per-result provenance block and — the heart of the
 * deliverable — the AISE MAPPING BLOCK: every family result carries its
 * extraction mapped into REAL AISE contract types (`Derivation`,
 * `RealityObject`, `PropertyAssertion`, `Measurement` imported from
 * `@aise/shared-contracts`, proven by decoding the seeds with the shared
 * wire codecs in the tests).
 *
 * THE BINDING LAWS ENCODED HERE (spec/technology-substitution-contract.md
 * §2, the three laws; docs/TECH-LEAD-HANDOFF.md §3/§10; the work order):
 *
 *  1. SUBSTRATE IDS ARE NAMESPACED EXTERNAL LABELS, NEVER CANONICAL AISE
 *     IDENTITY. IFC GUIDs, STEP line refs, OCCT shape names, VTK data
 *     object ids live in `NamespacedExternalLabel` records with a CLOSED
 *     namespace vocabulary. Canonical candidate ids in the AISE mapping
 *     block are 64-hex content-derived digests — a validator REFUSES any
 *     mapping block whose ids equal an external label value
 *     (`external-label-as-canonical-identity`).
 *  2. SUBSTRATE-EXTRACTED VALUES ENTER AS `INFERRED`, NEVER `OBSERVED` /
 *     `CONFIRMED`. A file says so; the site may differ. Extracted BIM
 *     properties, computed geometry and derived field quantities are
 *     derived candidates until AISE gates accept them (the Evidence
 *     Envelope discipline). Uncertainty is never fabricated: it appears
 *     only where a tolerance/declaration backs it.
 *  3. UNSUPPORTED IS RECORDED, NEVER COMPUTED. Every port answers with a
 *     discriminated outcome; refusals use the HFX-000 closed vocabulary
 *     (imported from `@aise/provider-registry`, never modified) and are
 *     machine-readable evidence.
 *  4. TOLERANCES ARE DECLARED, NEVER IMPLICIT — the geometry family
 *     enforces law #2 of the substitution contract concretely: a
 *     computation request without a tolerance declaration is REFUSED
 *     (`tolerance-must-be-declared`), results carry the applied tolerance
 *     VERBATIM, and near-boundary predicates answer `within-tolerance`
 *     instead of a silent boolean. The tolerance decision stays with the
 *     consumer.
 *  5. DETERMINISM: no network, no clock reads, no randomness, no I/O in
 *     the contract core. `recordedAt`/`capturedAt` instants are DECLARED
 *     inputs carried in requests, never sensed. Identical requests
 *     through the same provider produce byte-identical results
 *     (content-addressed by `canonicalDigestOf`).
 *
 * The three substrate technologies named by the directive (IfcOpenShell,
 * OCCT, ParaView/VTK) sit BEHIND these ports as replaceable
 * implementation technology — never authorities (directive §10). The
 * in-repo substitution doubles in each family's `doubles.ts` prove the
 * contracts are implementable WITHOUT the substrate; real engines are
 * future occupants of the ports.
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify, CONTRACT_VERSION } from "@aise/shared-contracts";
import type {
  Derivation,
  Measurement,
  PropertyAssertion,
  RealityObject,
} from "@aise/shared-contracts";
import type { FailureKind } from "@aise/provider-registry";

/* ------------------------------------------------------------------ */
/* Lane identity                                                        */
/* ------------------------------------------------------------------ */

export const UNDERSTANDING_SUBSTRATE_LANE_ID = "understanding-substrate" as const;

export const UNDERSTANDING_LANE_STATEMENT =
  "AISE Understanding-layer substrate lane (WORLD-P0-B): IfcOpenShell/web-ifc IFC " +
  "interpretation, OCCT exact geometry and ParaView/VTK field processing are " +
  "REPLACEABLE implementation technologies behind substrate-neutral typed adapter " +
  "contracts. They never become engineering authorities, their ids never become " +
  "canonical AISE identity, and every output enters AISE as evidence-bound " +
  "derived candidates (epistemic status INFERRED) mapped into the shared contract " +
  "types.";

/** The closed substrate-family vocabulary of this package. */
export const SUBSTRATE_FAMILIES = ["ifc", "geometry", "field"] as const;
export type SubstrateFamily = (typeof SUBSTRATE_FAMILIES)[number];

export function isSubstrateFamily(value: unknown): value is SubstrateFamily {
  return typeof value === "string" && (SUBSTRATE_FAMILIES as readonly string[]).includes(value);
}

/** The closed provider-neutral method identities (the Derivation.method law). */
export const SUBSTRATE_METHOD_IDENTITIES = [
  "interpretation.ifc",
  "geometry.exact",
  "field.scientific",
] as const;
export type SubstrateMethodIdentity = (typeof SUBSTRATE_METHOD_IDENTITIES)[number];

/** The epistemic status substrate-extracted values MUST enter as (law #2). */
export const SUBSTRATE_EXTRACTION_EPISTEMIC_STATUS = "INFERRED" as const;

/* ------------------------------------------------------------------ */
/* Namespaced external labels (law #1)                                  */
/* ------------------------------------------------------------------ */

/**
 * The CLOSED namespace vocabulary of substrate-side identifiers. A label
 * records WHERE an id comes from (which substrate technology); it is
 * provenance data, never identity. Frozen: adding a namespace is a
 * contract change.
 */
export const EXTERNAL_LABEL_NAMESPACES = [
  "ifc-guid",
  "ifc-step-ref",
  "ifc-class",
  "occt-topology",
  "vtk-dataobject",
] as const;
export type ExternalLabelNamespace = (typeof EXTERNAL_LABEL_NAMESPACES)[number];

export function isExternalLabelNamespace(value: unknown): value is ExternalLabelNamespace {
  return (
    typeof value === "string" &&
    (EXTERNAL_LABEL_NAMESPACES as readonly string[]).includes(value)
  );
}

/**
 * A substrate-side identifier carried as NAMESPACED EXTERNAL LABEL: the
 * IFC GlobalId, the STEP entity ref, the OCCT TopoDS name, the VTK data
 * object id. Directive §10: these NEVER become canonical AISE identity.
 */
export interface NamespacedExternalLabel {
  readonly namespace: ExternalLabelNamespace;
  readonly value: string;
}

/**
 * The IFC GlobalId shape: exactly 22 characters of the IFC base64
 * alphabet (0-9 A-Z a-z _ $). Recognized so labels can be shape-checked
 * and so the identity law can catch raw GUIDs smuggled into id fields.
 */
export const IFC_GUID_PATTERN = /^[0-9A-Za-z_$]{22}$/;

export function isIfcGuidShaped(value: unknown): value is string {
  return typeof value === "string" && IFC_GUID_PATTERN.test(value);
}

/** All external-label values carried by one result (the identity-law scan set). */
export function externalLabelValuesOf(labels: readonly NamespacedExternalLabel[]): string[] {
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
 * shared with `@aise/provider-registry`). The same value always digests
 * to the same id; no salt, no clock, no randomness.
 */
export function canonicalDigestOf(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

/** sha-256 (lowercase hex) over the raw UTF-8 bytes of a text payload. */
export function textDigestOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/* ------------------------------------------------------------------ */
/* Closed-vocabulary failures + outcomes (law #3)                       */
/* ------------------------------------------------------------------ */

/**
 * A typed substrate failure: the kind comes from the HFX-000 CLOSED
 * vocabulary (`@aise/provider-registry` FAILURE_KINDS — imported, never
 * modified), the detail is the provider's honest statement. Never a
 * throw, never a silent gap.
 */
export interface SubstrateFailure {
  readonly kind: FailureKind;
  readonly family: SubstrateFamily;
  readonly detail: string;
}

/** The discriminated outcome of one port call. */
export type SubstrateOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: SubstrateFailure };

export function refused<T>(family: SubstrateFamily, kind: FailureKind, detail: string): SubstrateOutcome<T> {
  return { ok: false, failure: { kind, family, detail } };
}

/* ------------------------------------------------------------------ */
/* The provider descriptor (the port occupant identity)                 */
/* ------------------------------------------------------------------ */

/**
 * The identity of one occupant of a family port. The in-repo
 * substitution doubles describe themselves here honestly ("in-memory
 * substitution double — no substrate integrated"); a future IfcOpenShell
 * / OCCT / VTK adapter describes the real engine. The full control-plane
 * `ProviderProfile` for every double is materialized in `profiles.ts`
 * (15/15 mandatory fields, HFX-000).
 */
export interface SubstrateProviderDescriptor {
  readonly providerId: string;
  readonly family: SubstrateFamily;
  readonly technologyVersion: string;
  readonly engineNote: string;
  readonly laneStatement: string;
}

/** The 64-hex content digest of a provider descriptor (provenance pin). */
export function providerDescriptorDigestOf(descriptor: SubstrateProviderDescriptor): string {
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
/* The AISE mapping block (the mapping INTO AISE contract types)        */
/* ------------------------------------------------------------------ */

/**
 * The mapping of one substrate result INTO REAL AISE CONTRACT TYPES
 * (`@aise/shared-contracts`): the `Derivation` that records how the
 * output was derived (provider-neutral method identity, method/engine
 * version, deterministic parameter string map), the `RealityObject`
 * identity seeds for extracted elements (IFC family; empty for geometry/
 * field — no reality identity is fabricated there), the extracted
 * `PropertyAssertion` seeds (IFC properties, geometry predicate
 * verdicts) and the `Measurement` seeds (IFC quantities, exact-geometry
 * computations, field derived quantities).
 *
 * LAWS (validated by `validateAiseMappingBlock` and proven by tests that
 * decode every seed through the shared wire codecs):
 *
 *  - CANDIDATE IDS ARE CONTENT-DERIVED 64-HEX DIGESTS, never raw
 *    substrate labels (law #1). The AISE authority assigns final stable
 *    ids when it accepts a candidate; the content-derived candidate id
 *    stays re-derivable and collision-free across models.
 *  - Epistemic status of every assertion/measurement seed is `INFERRED`
 *    (law #2) — extracted/computed values, never observed facts.
 *  - `derivation.method` comes from the closed
 *    `SUBSTRATE_METHOD_IDENTITIES` vocabulary.
 *  - Every seed's evidence binding cites the request's DECLARED evidence
 *    content id (the AISE gateway registers the raw source as Evidence;
 *    the adapter never invents evidence ids).
 *  - `recordedAt`-derived instants are declared inputs, never clock
 *    reads (law #5).
 */
export interface AiseMappingBlock {
  readonly derivation: Derivation;
  readonly realityObjects: readonly RealityObject[];
  readonly propertyAssertions: readonly PropertyAssertion[];
  readonly measurements: readonly Measurement[];
}

/** The closed vocabulary of AISE-mapping-block validation failure kinds. */
export const MAPPING_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "missing-field",
  "type-mismatch",
  "contract-version-mismatch",
  "digest-format",
  "external-label-as-canonical-identity",
  "epistemic-status-violation",
  "method-identity-violation",
  "evidence-binding-violation",
] as const;
export type MappingValidationFailureKind = (typeof MAPPING_VALIDATION_FAILURE_KINDS)[number];

export interface MappingValidationFailure {
  readonly kind: MappingValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type MappingValidation =
  | { readonly ok: true; readonly block: AiseMappingBlock }
  | { readonly ok: false; readonly failures: readonly MappingValidationFailure[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

/**
 * Validates an unknown payload as an `AiseMappingBlock` and enforces the
 * five mapping laws (id digests, no-label-as-identity, INFERRED status,
 * closed method identity, declared evidence binding). PURE: collects
 * every typed failure, never throws.
 *
 * @param input the mapping block to validate (unknown)
 * @param laws the per-call law inputs: the external-label scan set (every
 *   namespaced label value the surrounding result carries) and the
 *   request's declared evidence content id.
 */
export function validateAiseMappingBlock(
  input: unknown,
  laws: {
    readonly externalLabelValues: readonly string[];
    readonly evidenceContentId: string;
  },
): MappingValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [{ kind: "not-an-object", path: "aise", detail: "the mapping block must be an object" }],
    };
  }
  const failures: MappingValidationFailure[] = [];
  const fail = (kind: MappingValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  const labelSet = new Set(laws.externalLabelValues);

  /* --- derivation ------------------------------------------------- */

  const derivation = input["derivation"];
  if (!isRecord(derivation)) {
    fail("missing-field", "aise.derivation", "the derivation record is required");
  } else {
    const derivationVersion = derivation["contractVersion"];
    if (derivationVersion !== CONTRACT_VERSION) {
      fail(
        "contract-version-mismatch",
        "aise.derivation.contractVersion",
        `must be the shared-contracts family version ${CONTRACT_VERSION} (the seeds decode through the shared wire codecs)`,
      );
    }
    const method = derivation["method"];
    if (
      typeof method !== "string" ||
      !(SUBSTRATE_METHOD_IDENTITIES as readonly string[]).includes(method)
    ) {
      fail("method-identity-violation", "aise.derivation.method", `not a closed method identity: ${String(method)}`);
    }
    const methodVersion = derivation["methodVersion"];
    if (typeof methodVersion !== "string" || methodVersion.trim().length === 0) {
      fail("type-mismatch", "aise.derivation.methodVersion", "must be the provider's non-empty method/engine version identity");
    }
    const derivationId = derivation["derivationId"];
    if (!isCanonicalDigest(derivationId)) {
      fail("digest-format", "aise.derivation.derivationId", "must be a 64-hex content-derived candidate id");
    }
    if (typeof derivationId === "string" && labelSet.has(derivationId)) {
      fail("external-label-as-canonical-identity", "aise.derivation.derivationId", "candidate id equals an external label value");
    }
    const output = derivation["outputContentId"];
    if (!isCanonicalDigest(output)) {
      fail("digest-format", "aise.derivation.outputContentId", "must be a 64-hex content address");
    }
    const inputs = derivation["inputEvidenceContentIds"];
    if (
      !Array.isArray(inputs) ||
      inputs.length !== 1 ||
      inputs[0] !== laws.evidenceContentId
    ) {
      fail(
        "evidence-binding-violation",
        "aise.derivation.inputEvidenceContentIds",
        `must be exactly [${laws.evidenceContentId}] (the request's declared evidence binding)`,
      );
    }
    const params = derivation["parameters"];
    if (!isRecord(params) || Object.keys(params).length === 0) {
      fail("type-mismatch", "aise.derivation.parameters", "must be a non-empty deterministic parameter map");
    }
    if (!isIsoTimestamp(derivation["createdAt"])) {
      fail("type-mismatch", "aise.derivation.createdAt", "must be the declared ISO-8601 UTC instant");
    }
  }

  /* --- seed collections ------------------------------------------- */

  const seedKinds: readonly {
    readonly key: string;
    readonly idField: string;
    readonly evidenceField: string;
    readonly evidenceIsArray: boolean;
  }[] = [
    { key: "realityObjects", idField: "objectId", evidenceField: "units", evidenceIsArray: false },
    { key: "propertyAssertions", idField: "assertionId", evidenceField: "source_evidence", evidenceIsArray: true },
    { key: "measurements", idField: "measurementId", evidenceField: "evidenceContentIds", evidenceIsArray: true },
  ];

  for (const seedKind of seedKinds) {
    const collection = input[seedKind.key];
    if (!Array.isArray(collection)) {
      fail("type-mismatch", `aise.${seedKind.key}`, "must be an array");
      continue;
    }
    for (let index = 0; index < collection.length; index += 1) {
      const seed = collection[index];
      const path = `aise.${seedKind.key}[${index}]`;
      if (!isRecord(seed)) {
        fail("type-mismatch", path, "seed must be an object");
        continue;
      }
      const id = seed[seedKind.idField];
      if (!isCanonicalDigest(id)) {
        fail("digest-format", `${path}.${seedKind.idField}`, "must be a 64-hex content-derived candidate id");
      }
      if (typeof id === "string" && labelSet.has(id)) {
        fail(
          "external-label-as-canonical-identity",
          `${path}.${seedKind.idField}`,
          "candidate id equals an external label value — substrate ids never become canonical identity",
        );
      }
      if (seedKind.key !== "realityObjects") {
        const status = seed["status"];
        if (status !== SUBSTRATE_EXTRACTION_EPISTEMIC_STATUS) {
          fail(
            "epistemic-status-violation",
            `${path}.status`,
            `substrate-extracted values enter as ${SUBSTRATE_EXTRACTION_EPISTEMIC_STATUS}, never ${String(status)}`,
          );
        }
        const subjectRef = seed["subjectRef"];
        if (typeof subjectRef !== "string" || subjectRef.trim().length === 0) {
          fail(
            "type-mismatch",
            `${path}.subjectRef`,
            "must name the AISE-side subject the value asserts about (a declared request subject or a mapped candidate id)",
          );
        }
        if (typeof subjectRef === "string" && labelSet.has(subjectRef)) {
          fail(
            "external-label-as-canonical-identity",
            `${path}.subjectRef`,
            "the subject reference equals an external label value — substrate ids never become AISE-side subjects",
          );
        }
      }
      const seedVersion = seed["contractVersion"];
      if (seedVersion !== CONTRACT_VERSION) {
        fail("contract-version-mismatch", `${path}.contractVersion`, `must be ${CONTRACT_VERSION}`);
      }
      if (seedKind.evidenceIsArray) {
        const evidence = seed[seedKind.evidenceField];
        if (
          !Array.isArray(evidence) ||
          evidence.length !== 1 ||
          evidence[0] !== laws.evidenceContentId
        ) {
          fail(
            "evidence-binding-violation",
            `${path}.${seedKind.evidenceField}`,
            "must cite exactly the request's declared evidence content id",
          );
        }
      }
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, block: input as unknown as AiseMappingBlock };
}

/* ------------------------------------------------------------------ */
/* Deep freeze (the non-interference guard)                             */
/* ------------------------------------------------------------------ */

/**
 * Structurally deep-freezes a value (the visual-render lane discipline):
 * requests handed to a governed port entry are frozen so a provider
 * CANNOT mutate caller state through the interface.
 */
export function deepFreeze<T>(value: T): T {
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
