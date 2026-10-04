/**
 * WORLD-P0-B — the provider-neutral IFC-INTERPRETATION PORT (`src/ifc/`).
 *
 * The contract for IFC/OpenBIM ingestion and semantic extraction: spatial
 * containment hierarchy, element records, property/quantity sets,
 * relationships and classification — mapped INTO AISE contract types via
 * the seam's `AiseMappingBlock`.
 *
 * REFERENCE IMPLEMENTATION NOTE (GBIM-FT-001, the recorded direction —
 * build ON it, do not re-litigate): IfcOpenShell + IFC4 is the recorded
 * desktop/server-side engine decision; `web-ifc` is the browser-runtime
 * alternative. THE CONTRACT IS THE DELIVERABLE: it is implementable by
 * EITHER engine (that is the point of the adapter) — proven here by the
 * in-repo substitution doubles in `doubles.ts`, which interpret a REAL
 * minimal IFC4 STEP file with a tiny deterministic parser and NO
 * substrate at all.
 *
 * LAWS (this port, on top of the seam laws):
 *
 *  1. IFC GUIDs are NAMESPACED EXTERNAL LABELS (`namespace: "ifc-guid"`),
 *     never canonical AISE identity. Candidate ids in the mapping block
 *     are 64-hex content digests; a raw GUID in an id field is a typed
 *     validation failure. IFC never becomes the Reality Graph (§10).
 *  2. The file's `FILE_SCHEMA` must match the request's declared
 *     `schemaIntent` — a mismatch is a typed refusal (`unsupported-data`
 *     through the port; `schema-intent-mismatch` through the validator).
 *  3. EXTRACTION INTENTS ARE HONEST: an intent left off means the
 *     corresponding result arrays MUST be empty; a model lacking the
 *     entities yields empty arrays with recorded omissions — never
 *     fabricated content.
 *  4. OMISSIONS ARE VISIBLE: every STEP entity the adapter did not
 *     interpret is recorded with a closed reason code (geometry
 *     representations are deliberately out of scope for the semantic
 *     contract — the geometry family owns exact geometry).
 * 5. Determinism: same model text + same request → byte-identical
 *    extraction (content-addressed result id).
 */

import {
  deepFreeze,
  canonicalDigestOf,
  isCanonicalDigest,
  isIfcGuidShaped,
  isExternalLabelNamespace,
  providerDescriptorDigestOf,
  refused,
  textDigestOf,
  type AiseMappingBlock,
  type NamespacedExternalLabel,
  type SubstrateOutcome,
  type SubstrateProviderDescriptor,
  type SubstrateResultProvenance,
} from "../seam";
import type { FailureKind } from "@aise/provider-registry";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const IFC_REQUEST_KIND = "ifc-interpretation-request" as const;
export const IFC_REQUEST_SCHEMA_VERSION = "ifc-interpretation-request/1" as const;
export const IFC_RESULT_KIND = "ifc-interpretation-result" as const;
export const IFC_RESULT_SCHEMA_VERSION = "ifc-interpretation-result/1" as const;

/** Closed schema intents (GBIM-FT-001 direction: IFC4 reference). */
export const IFC_SCHEMA_INTENTS = ["IFC4", "IFC2X3"] as const;
export type IfcSchemaIntent = (typeof IFC_SCHEMA_INTENTS)[number];

/**
 * The declared media type of the IFC STEP exchange. IFC STEP files have
 * no IANA-registered type; AISE declares this canonical value on its
 * side of the boundary (open vocabulary, closed here).
 */
export const IFC_SOURCE_MEDIA_TYPE = "application/ifc" as const;

/** Closed spatial-structure roles (the containment hierarchy levels). */
export const IFC_SPATIAL_ROLES = ["project", "site", "building", "storey", "space"] as const;
export type IfcSpatialRole = (typeof IFC_SPATIAL_ROLES)[number];

/** Closed IFC relationship kinds the semantic contract speaks. */
export const IFC_RELATIONSHIP_KINDS = [
  "aggregation",
  "containment",
  "voiding",
  "property-definition",
  "classification",
] as const;
export type IfcRelationshipKind = (typeof IFC_RELATIONSHIP_KINDS)[number];

/** Closed quantity kinds (IFC element quantities). */
export const IFC_QUANTITY_KINDS = ["length", "area", "volume", "count", "weight"] as const;
export type IfcQuantityKind = (typeof IFC_QUANTITY_KINDS)[number];

/** Closed omission reason codes (honest losses). */
export const IFC_OMISSION_KINDS = [
  "unsupported-entity-class",
  "geometry-representation-skipped",
  "attribute-out-of-scope",
] as const;
export type IfcOmissionKind = (typeof IFC_OMISSION_KINDS)[number];

/** The reference-implementation note (GBIM-FT-001 recorded direction). */
export const IFC_REFERENCE_IMPLEMENTATION_NOTE =
  "GBIM-FT-001 recorded direction (docs/geometry-follow-through-work-orders-2026-09-29.md): " +
  "IfcOpenShell + IFC4 ADAPTED behind the provider boundary as the desktop/server-side " +
  "engine; web-ifc as the browser-runtime alternative; never forked, never an authority. " +
  "This contract is engine-neutral; the in-repo doubles prove implementability without " +
  "any engine; real IfcOpenShell/web-ifc adapters are future occupants of the port.";

/* ------------------------------------------------------------------ */
/* The request                                                          */
/* ------------------------------------------------------------------ */

export interface IfcModelSource {
  /** The raw IFC STEP physical file text (ISO 10303-21). */
  readonly stepText: string;
  readonly mediaType: typeof IFC_SOURCE_MEDIA_TYPE;
  readonly fileName: string | null;
}

/** Which semantic extractions the caller asks the adapter to perform. */
export interface IfcExtractionIntents {
  readonly spatialContainment: boolean;
  readonly elementProperties: boolean;
  readonly quantities: boolean;
  readonly relationships: boolean;
  readonly classification: boolean;
}

/**
 * The provider-neutral IFC interpretation request. The AISE gateway has
 * already registered the model file as Evidence; `evidenceContentId` is
 * that DECLARED content address (64-hex) — the adapter never invents
 * evidence identity. `recordedAt` is a declared instant (no clock reads).
 */
export interface IfcInterpretationRequest {
  readonly kind: typeof IFC_REQUEST_KIND;
  readonly schemaVersion: typeof IFC_REQUEST_SCHEMA_VERSION;
  readonly model: IfcModelSource;
  readonly schemaIntent: IfcSchemaIntent;
  readonly intents: IfcExtractionIntents;
  /** Declared evidence content id of the registered model file (64-hex). */
  readonly evidenceContentId: string;
  /** Declared model units (flow into RealityObject seeds). */
  readonly modelUnits: { readonly linear: string; readonly angular: string };
  /** Declared ISO-8601 UTC instant stamped into the mapping seeds. */
  readonly recordedAt: string;
}

/* ------------------------------------------------------------------ */
/* The extraction result                                                */
/* ------------------------------------------------------------------ */

/** One spatial-structure node (containment hierarchy level). */
export interface IfcSpatialNodeRecord {
  readonly role: IfcSpatialRole;
  readonly label: NamespacedExternalLabel;
  readonly name: string | null;
  readonly containedBy: NamespacedExternalLabel | null;
}

/** One physical element observed in the model. */
export interface IfcElementRecord {
  /** The IFC entity class, e.g. `IFCWALL` (validated shape). */
  readonly ifcClass: string;
  readonly label: NamespacedExternalLabel;
  readonly name: string | null;
  readonly containedBy: NamespacedExternalLabel | null;
  readonly classification: string | null;
}

/** One parsed property of a property set mapped to an element. */
export interface IfcPropertyRecord {
  readonly name: string;
  readonly nominal: string | number | boolean;
  readonly unit: string | null;
}

export interface IfcPropertySetRecord {
  /** Property-set name, e.g. `Pset_WallCommon`. */
  readonly name: string;
  /** The element (guid label) the set is mapped to. */
  readonly relates: NamespacedExternalLabel;
  readonly properties: readonly IfcPropertyRecord[];
}

/** One parsed element quantity. */
export interface IfcQuantityRecord {
  readonly name: string;
  readonly quantityKind: IfcQuantityKind;
  readonly value: number;
  readonly unit: string | null;
}

export interface IfcQuantitySetRecord {
  readonly name: string;
  readonly relates: NamespacedExternalLabel;
  readonly quantities: readonly IfcQuantityRecord[];
}

/** One observed relationship edge (aggregation/containment/voiding/…). */
export interface IfcRelationshipRecord {
  readonly kind: IfcRelationshipKind;
  readonly label: NamespacedExternalLabel | null;
  readonly relating: NamespacedExternalLabel;
  readonly related: readonly NamespacedExternalLabel[];
}

/** One honest omission (an entity the adapter did NOT interpret). */
export interface IfcOmissionRecord {
  readonly kind: IfcOmissionKind;
  readonly stepRef: NamespacedExternalLabel;
  readonly entityClass: string;
}

/**
 * The extraction: everything semantic the adapter read from the model,
 * plus the AISE mapping block and the provenance. `resultId` is the
 * 64-hex content digest over the canonical JSON of the result minus its
 * own id (deterministic, re-derivable — the house sealing discipline).
 */
export interface IfcExtractionResult {
  readonly kind: typeof IFC_RESULT_KIND;
  readonly schemaVersion: typeof IFC_RESULT_SCHEMA_VERSION;
  readonly resultId: string;
  /** sha-256 over the raw STEP text bytes. */
  readonly modelDigest: string;
  /** The FILE_SCHEMA identifier actually read from the file. */
  readonly schemaIdentifier: string;
  readonly spatialNodes: readonly IfcSpatialNodeRecord[];
  readonly elements: readonly IfcElementRecord[];
  readonly propertySets: readonly IfcPropertySetRecord[];
  readonly quantitySets: readonly IfcQuantitySetRecord[];
  readonly relationships: readonly IfcRelationshipRecord[];
  readonly omissions: readonly IfcOmissionRecord[];
  readonly aise: AiseMappingBlock;
  readonly provenance: SubstrateResultProvenance;
}

/* ------------------------------------------------------------------ */
/* Typed validation failures                                            */
/* ------------------------------------------------------------------ */

export const IFC_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "missing-field",
  "type-mismatch",
  "value-out-of-range",
  "vocabulary-violation",
  "digest-format",
  "guid-format",
  "label-namespace-violation",
] as const;
export type IfcValidationFailureKind = (typeof IFC_VALIDATION_FAILURE_KINDS)[number];

export interface IfcValidationFailure {
  readonly kind: IfcValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type IfcRequestValidation =
  | { readonly ok: true; readonly request: IfcInterpretationRequest }
  | { readonly ok: false; readonly failures: readonly IfcValidationFailure[] };

export type IfcResultValidation =
  | { readonly ok: true; readonly result: IfcExtractionResult }
  | { readonly ok: false; readonly failures: readonly IfcValidationFailure[] };

/* ------------------------------------------------------------------ */
/* Pure validators                                                      */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const IFC_CLASS_SHAPE = /^IFC[0-9A-Z_]+$/;

/** Validates an unknown payload as an `IfcInterpretationRequest`. PURE. */
export function validateIfcInterpretationRequest(input: unknown): IfcRequestValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [{ kind: "not-an-object", path: "", detail: "the request must be an object" }],
    };
  }
  const failures: IfcValidationFailure[] = [];
  const fail = (kind: IfcValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  if (input["kind"] !== IFC_REQUEST_KIND) {
    fail("vocabulary-violation", "kind", `must be "${IFC_REQUEST_KIND}"`);
  }
  if (input["schemaVersion"] !== IFC_REQUEST_SCHEMA_VERSION) {
    fail("vocabulary-violation", "schemaVersion", `must be "${IFC_REQUEST_SCHEMA_VERSION}"`);
  }

  const model = input["model"];
  if (!isRecord(model)) {
    fail("missing-field", "model", "the model source is required");
  } else {
    if (typeof model["stepText"] !== "string" || model["stepText"].length === 0) {
      fail("type-mismatch", "model.stepText", "the STEP text must be a non-empty string");
    } else if (!/^ISO-10303-21;/.test(model["stepText"])) {
      fail("value-out-of-range", "model.stepText", "the STEP text must begin with the ISO-10303-21 header");
    }
    if (model["mediaType"] !== IFC_SOURCE_MEDIA_TYPE) {
      fail("vocabulary-violation", "model.mediaType", `must be "${IFC_SOURCE_MEDIA_TYPE}"`);
    }
    if (model["fileName"] !== null && !isNonEmptyString(model["fileName"])) {
      fail("type-mismatch", "model.fileName", "must be a non-empty string or null");
    }
  }

  const intent = input["schemaIntent"];
  if (!(IFC_SCHEMA_INTENTS as readonly string[]).includes(intent as string)) {
    fail("vocabulary-violation", "schemaIntent", `must be one of ${IFC_SCHEMA_INTENTS.join(" | ")}`);
  }

  const intents = input["intents"];
  if (!isRecord(intents)) {
    fail("missing-field", "intents", "the extraction intents are required");
  } else {
    for (const flag of ["spatialContainment", "elementProperties", "quantities", "relationships", "classification"] as const) {
      if (typeof intents[flag] !== "boolean") {
        fail("type-mismatch", `intents.${flag}`, "must be a boolean");
      }
    }
  }

  if (!isCanonicalDigest(input["evidenceContentId"])) {
    fail("digest-format", "evidenceContentId", "must be the declared 64-hex evidence content id");
  }

  const units = input["modelUnits"];
  if (!isRecord(units)) {
    fail("missing-field", "modelUnits", "the declared model units are required");
  } else {
    if (!isNonEmptyString(units["linear"])) {
      fail("type-mismatch", "modelUnits.linear", "must be a non-empty unit symbol");
    }
    if (!isNonEmptyString(units["angular"])) {
      fail("type-mismatch", "modelUnits.angular", "must be a non-empty unit symbol");
    }
  }

  if (typeof input["recordedAt"] !== "string" || !ISO_TIMESTAMP.test(input["recordedAt"])) {
    fail("type-mismatch", "recordedAt", "must be an ISO-8601 UTC millisecond instant");
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, request: input as unknown as IfcInterpretationRequest };
}

/** Validates an unknown payload as an `IfcExtractionResult`. PURE. */
export function validateIfcExtractionResult(input: unknown): IfcResultValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [{ kind: "not-an-object", path: "", detail: "the result must be an object" }],
    };
  }
  const failures: IfcValidationFailure[] = [];
  const fail = (kind: IfcValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  if (input["kind"] !== IFC_RESULT_KIND) {
    fail("vocabulary-violation", "kind", `must be "${IFC_RESULT_KIND}"`);
  }
  if (input["schemaVersion"] !== IFC_RESULT_SCHEMA_VERSION) {
    fail("vocabulary-violation", "schemaVersion", `must be "${IFC_RESULT_SCHEMA_VERSION}"`);
  }
  if (!isCanonicalDigest(input["resultId"])) {
    fail("digest-format", "resultId", "must be the 64-hex content-derived result id");
  }
  if (!isCanonicalDigest(input["modelDigest"])) {
    fail("digest-format", "modelDigest", "must be the 64-hex model digest");
  }
  if (!isNonEmptyString(input["schemaIdentifier"])) {
    fail("type-mismatch", "schemaIdentifier", "must be the FILE_SCHEMA identifier");
  }

  const labelValues: string[] = [];
  const checkLabel = (path: string, value: unknown, required: boolean): void => {
    if (value === null) {
      if (required) {
        fail("missing-field", path, "a required external label is null");
      }
      return;
    }
    if (!isRecord(value)) {
      fail("type-mismatch", path, "an external label must be an object");
      return;
    }
    if (!isExternalLabelNamespace(value["namespace"])) {
      fail("label-namespace-violation", `${path}.namespace`, "not a closed external-label namespace");
    }
    if (value["namespace"] === "ifc-guid") {
      if (!isIfcGuidShaped(value["value"])) {
        fail("guid-format", `${path}.value`, "an ifc-guid label must be 22 IFC-base64 characters");
      }
    } else if (!isNonEmptyString(value["value"])) {
      fail("type-mismatch", `${path}.value`, "the label value must be a non-empty string");
    }
    if (typeof value["value"] === "string") {
      labelValues.push(value["value"]);
    }
  };

  const arrays: readonly {
    readonly key: string;
    readonly check: (index: number, entry: Record<string, unknown>) => void;
  }[] = [
    {
      key: "spatialNodes",
      check: (index, entry) => {
        const path = `spatialNodes[${index}]`;
        if (!(IFC_SPATIAL_ROLES as readonly string[]).includes(entry["role"] as string)) {
          fail("vocabulary-violation", `${path}.role`, "not a closed spatial role");
        }
        checkLabel(`${path}.label`, entry["label"], true);
        checkLabel(`${path}.containedBy`, entry["containedBy"], false);
        if (entry["name"] !== null && !isNonEmptyString(entry["name"])) {
          fail("type-mismatch", `${path}.name`, "must be a non-empty string or null");
        }
      },
    },
    {
      key: "elements",
      check: (index, entry) => {
        const path = `elements[${index}]`;
        if (typeof entry["ifcClass"] !== "string" || !IFC_CLASS_SHAPE.test(entry["ifcClass"])) {
          fail("vocabulary-violation", `${path}.ifcClass`, "must be an IFC entity class shape (IFCWALL…)");
        }
        checkLabel(`${path}.label`, entry["label"], true);
        checkLabel(`${path}.containedBy`, entry["containedBy"], false);
        if (entry["name"] !== null && !isNonEmptyString(entry["name"])) {
          fail("type-mismatch", `${path}.name`, "must be a non-empty string or null");
        }
        if (entry["classification"] !== null && !isNonEmptyString(entry["classification"])) {
          fail("type-mismatch", `${path}.classification`, "must be a non-empty string or null");
        }
      },
    },
    {
      key: "propertySets",
      check: (index, entry) => {
        const path = `propertySets[${index}]`;
        if (!isNonEmptyString(entry["name"])) {
          fail("type-mismatch", `${path}.name`, "the property-set name is required");
        }
        checkLabel(`${path}.relates`, entry["relates"], true);
        const properties = entry["properties"];
        if (!Array.isArray(properties)) {
          fail("type-mismatch", `${path}.properties`, "must be an array");
        } else {
          for (let p = 0; p < properties.length; p += 1) {
            const property = properties[p];
            const propertyPath = `${path}.properties[${p}]`;
            if (!isRecord(property)) {
              fail("type-mismatch", propertyPath, "a property record must be an object");
              continue;
            }
            if (!isNonEmptyString(property["name"])) {
              fail("type-mismatch", `${propertyPath}.name`, "the property name is required");
            }
            const nominal = property["nominal"];
            if (typeof nominal !== "string" && typeof nominal !== "number" && typeof nominal !== "boolean") {
              fail("type-mismatch", `${propertyPath}.nominal`, "must be a string, number or boolean");
            }
            if (property["unit"] !== null && !isNonEmptyString(property["unit"])) {
              fail("type-mismatch", `${propertyPath}.unit`, "must be a non-empty string or null");
            }
          }
        }
      },
    },
    {
      key: "quantitySets",
      check: (index, entry) => {
        const path = `quantitySets[${index}]`;
        if (!isNonEmptyString(entry["name"])) {
          fail("type-mismatch", `${path}.name`, "the quantity-set name is required");
        }
        checkLabel(`${path}.relates`, entry["relates"], true);
        const quantities = entry["quantities"];
        if (!Array.isArray(quantities)) {
          fail("type-mismatch", `${path}.quantities`, "must be an array");
        } else {
          for (let q = 0; q < quantities.length; q += 1) {
            const quantity = quantities[q];
            const quantityPath = `${path}.quantities[${q}]`;
            if (!isRecord(quantity)) {
              fail("type-mismatch", quantityPath, "a quantity record must be an object");
              continue;
            }
            if (!isNonEmptyString(quantity["name"])) {
              fail("type-mismatch", `${quantityPath}.name`, "the quantity name is required");
            }
            if (!(IFC_QUANTITY_KINDS as readonly string[]).includes(quantity["quantityKind"] as string)) {
              fail("vocabulary-violation", `${quantityPath}.quantityKind`, "not a closed quantity kind");
            }
            if (typeof quantity["value"] !== "number" || !Number.isFinite(quantity["value"])) {
              fail("type-mismatch", `${quantityPath}.value`, "must be a finite number");
            }
            if (quantity["unit"] !== null && !isNonEmptyString(quantity["unit"])) {
              fail("type-mismatch", `${quantityPath}.unit`, "must be a non-empty string or null");
            }
          }
        }
      },
    },
    {
      key: "relationships",
      check: (index, entry) => {
        const path = `relationships[${index}]`;
        if (!(IFC_RELATIONSHIP_KINDS as readonly string[]).includes(entry["kind"] as string)) {
          fail("vocabulary-violation", `${path}.kind`, "not a closed relationship kind");
        }
        checkLabel(`${path}.label`, entry["label"], false);
        checkLabel(`${path}.relating`, entry["relating"], true);
        const related = entry["related"];
        if (!Array.isArray(related) || related.length === 0) {
          fail("type-mismatch", `${path}.related`, "must be a non-empty array of labels");
        } else {
          for (let r = 0; r < related.length; r += 1) {
            checkLabel(`${path}.related[${r}]`, related[r], true);
          }
        }
      },
    },
    {
      key: "omissions",
      check: (index, entry) => {
        const path = `omissions[${index}]`;
        if (!(IFC_OMISSION_KINDS as readonly string[]).includes(entry["kind"] as string)) {
          fail("vocabulary-violation", `${path}.kind`, "not a closed omission kind");
        }
        checkLabel(`${path}.stepRef`, entry["stepRef"], true);
        if (typeof entry["entityClass"] !== "string" || !IFC_CLASS_SHAPE.test(entry["entityClass"])) {
          fail("vocabulary-violation", `${path}.entityClass`, "must be an IFC entity class shape");
        }
      },
    },
  ];

  for (const array of arrays) {
    const collection = input[array.key];
    if (!Array.isArray(collection)) {
      fail("type-mismatch", array.key, "must be an array");
      continue;
    }
    for (let index = 0; index < collection.length; index += 1) {
      const entry = collection[index];
      if (!isRecord(entry)) {
        fail("type-mismatch", `${array.key}[${index}]`, "each entry must be an object");
        continue;
      }
      array.check(index, entry);
    }
  }

  const provenance = input["provenance"];
  if (!isRecord(provenance)) {
    fail("missing-field", "provenance", "the provenance block is required");
  } else {
    if (!isNonEmptyString(provenance["providerId"])) {
      fail("type-mismatch", "provenance.providerId", "must be a non-empty provider id");
    }
    if (!isNonEmptyString(provenance["technologyVersion"])) {
      fail("type-mismatch", "provenance.technologyVersion", "must be a non-empty version");
    }
    if (!isCanonicalDigest(provenance["providerDescriptorDigest"])) {
      fail("digest-format", "provenance.providerDescriptorDigest", "must be a 64-hex digest");
    }
    if (!isCanonicalDigest(provenance["inputDigest"])) {
      fail("digest-format", "provenance.inputDigest", "must be a 64-hex digest");
    }
    if (!isCanonicalDigest(provenance["parametersDigest"])) {
      fail("digest-format", "provenance.parametersDigest", "must be a 64-hex digest");
    }
  }

  /* The mapping laws (ids, epistemic status, method identity, evidence
   * binding) are enforced by the seam's `validateAiseMappingBlock`,
   * composed into the governed entry and drilled by the substitution
   * tests. The intent-coherence discipline (an intent left off means the
   * corresponding arrays are empty) is a PORT law, exercised by the
   * doubles' tests and the substitution drills. */

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, result: input as unknown as IfcExtractionResult };
}

/* ------------------------------------------------------------------ */
/* The port                                                             */
/* ------------------------------------------------------------------ */

/**
 * The provider-neutral IFC interpretation port. Implementable by
 * IfcOpenShell (desktop/server) or web-ifc (browser runtime) — or by the
 * in-repo substitution doubles. `interpret` is PURE over the request:
 * the governed entry deep-freezes the request, the provider answers
 * either a provenance-bound extraction or a typed refusal from the
 * closed vocabulary.
 */
export interface IfcInterpretationProvider {
  readonly descriptor: SubstrateProviderDescriptor;
  readonly interpret: (request: IfcInterpretationRequest) => SubstrateOutcome<IfcExtractionResult>;
}

/** The AISE-side parameters recorded on the derivation (inspectable). */
export function ifcDerivationParameters(request: IfcInterpretationRequest): Record<string, string> {
  return {
    "ifc.schemaIntent": request.schemaIntent,
    "ifc.mediaType": request.model.mediaType,
    "ifc.modelDigest": textDigestOf(request.model.stepText),
    "ifc.evidenceContentId": request.evidenceContentId,
    "ifc.intents": canonicalJsonStringifyOf(request.intents),
    "ifc.units": `${request.modelUnits.linear};${request.modelUnits.angular}`,
  };
}

function canonicalJsonStringifyOf(value: unknown): string {
  // local alias to keep the parameter map deterministic (sorted keys)
  const json = JSON.stringify(sortKeysDeep(value));
  return json === undefined ? "null" : json;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortKeysDeep(record[key]);
    }
    return out;
  }
  return value;
}

/** The 64-hex digest of the IFC model's STEP text (the input digest). */
export function ifcModelDigestOf(request: IfcInterpretationRequest): string {
  return textDigestOf(request.model.stepText);
}

/** Builds the standard provenance block for an IFC result. */
export function ifcProvenanceOf(
  descriptor: SubstrateProviderDescriptor,
  request: IfcInterpretationRequest,
): SubstrateResultProvenance {
  return {
    providerId: descriptor.providerId,
    technologyVersion: descriptor.technologyVersion,
    providerDescriptorDigest: providerDescriptorDigestOf(descriptor),
    inputDigest: ifcModelDigestOf(request),
    parametersDigest: canonicalDigestOf(ifcDerivationParameters(request)),
    laneStatement: descriptor.laneStatement,
  };
}

/** A typed refusal helper bound to the IFC family. */
export function ifcRefused<T>(kind: FailureKind, detail: string): SubstrateOutcome<T> {
  return refused<T>("ifc", kind, detail);
}

/** The governed entry: validates, freezes, delegates, seals. */
export function interpretThroughIfcPort(
  provider: IfcInterpretationProvider,
  request: IfcInterpretationRequest,
): SubstrateOutcome<IfcExtractionResult> {
  const frozen = deepFreeze(request);
  return provider.interpret(frozen);
}
