/**
 * WORLD-P0-B — the IFC substitution DOUBLES (`src/ifc/`).
 *
 * Two INDEPENDENT in-memory providers of the `IfcInterpretationProvider`
 * port — the substitution proof that the contract is implementable WITHOUT
 * IfcOpenShell and WITHOUT web-ifc (P0 defines contracts, not integration;
 * the real engines are future occupants of the port):
 *
 *  - `referenceIfcDouble` — a statement-SCANNING parser (line-accumulating
 *    scanner + regex statement shape + depth-tracking attribute splitter);
 *  - `alternateIfcDouble` — a character-TOKENIZING parser (single-pass
 *    state machine over the whole text, no regex, explicit paren/string
 *    state tracking, independent attribute descent).
 *
 * Both interpret the SAME committed IFC4 STEP fixture
 * (`MINIMAL_IFC4_STEP_TEXT`) and MUST produce byte-identical canonical
 * extraction content at every comparison point (spatial nodes, elements,
 * property sets, quantity sets, relationships, omissions, model digest,
 * schema identifier, and the AISE mapping seeds) — only the provider
 * identity (provenance/methodVersion) differs, exactly as an IfcOpenShell
 * adapter and a web-ifc adapter would differ. That equivalence is asserted
 * by `doubles.test.ts` (the substitution-contract §4.2 semantic-equivalence
 * requirement, at this lane's comparison points).
 *
 * INTENT SEMANTICS (the honest-intents law, made precise):
 *  - `spatialContainment` governs the `spatialNodes`/`elements` arrays AND
 *    the containment fill (`containedBy`) — walking the aggregation and
 *    containment edges is this intent's own semantics, independent of the
 *    `relationships` output array;
 *  - `relationships` governs ONLY the `relationships` output array (the
 *    recorded edges);
 *  - `elementProperties`/`quantities` govern the property/quantity set
 *    arrays (walking the definitions and the IFCRELDEFINESBYPROPERTIES
 *    bindings is those intents' own semantics);
 *  - `classification` governs the element classification fill;
 *  - omissions record classes the double NEVER interprets — an intent left
 *    off does NOT turn a supported class into an omission (it was not
 *    requested, which is different from unsupported).
 *
 * HONESTY OF THE DOUBLES (no fabrication):
 *
 *  - the doubles read the fixture's REAL STEP statements — attribute
 *    positions consumed are documented per entity below and match the
 *    IFC4 entity attribute order for the entities the fixture uses;
 *  - every entity class the doubles do NOT interpret is recorded as an
 *    `IfcOmissionRecord` (`unsupported-entity-class`; the wall's
 *    product-definition-shape as `geometry-representation-skipped` —
 *    geometry is the exact-geometry family's lane; the classification
 *    reference as `attribute-out-of-scope` — its Identification attribute
 *    is consulted verbatim for element classification, nothing else);
 *  - quantity units are DECLARED inputs (the request's `modelUnits`),
 *    never invented: length → `linear`, area → `linear2`, volume →
 *    `linear3` (unit symbols composed from the declared linear unit);
 *  - no clock, no randomness, no network: `createdAt`/`measuredAt` are
 *    the request's declared `recordedAt`.
 */

import {
  UNDERSTANDING_LANE_STATEMENT,
  canonicalDigestOf,
  deepFreeze,
  textDigestOf,
  type AiseMappingBlock,
  type NamespacedExternalLabel,
  type SubstrateOutcome,
  type SubstrateProviderDescriptor,
} from "../seam";
import type { Derivation, Measurement, PropertyAssertion, RealityObject } from "@aise/shared-contracts";
import { CONTRACT_VERSION } from "@aise/shared-contracts";
import {
  IFC_RESULT_KIND,
  IFC_RESULT_SCHEMA_VERSION,
  ifcDerivationParameters,
  ifcModelDigestOf,
  ifcProvenanceOf,
  ifcRefused,
  validateIfcInterpretationRequest,
  type IfcElementRecord,
  type IfcExtractionResult,
  type IfcInterpretationProvider,
  type IfcInterpretationRequest,
  type IfcOmissionRecord,
  type IfcPropertyRecord,
  type IfcPropertySetRecord,
  type IfcQuantityKind,
  type IfcQuantityRecord,
  type IfcQuantitySetRecord,
  type IfcRelationshipRecord,
  type IfcSpatialNodeRecord,
} from "./contract";

/* ------------------------------------------------------------------ */
/* The two provider descriptors                                         */
/* ------------------------------------------------------------------ */

/** The reference double's port-occupant identity. */
export const REFERENCE_IFC_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "understanding-substrate.ifc.reference-double",
  family: "ifc",
  technologyVersion: "ifc-reference-double/1.0.0",
  engineNote:
    "in-memory substitution double — statement-scanning STEP parser; NO substrate " +
    "integrated (P0 defines contracts; IfcOpenShell/web-ifc are future occupants)",
  laneStatement: UNDERSTANDING_LANE_STATEMENT,
};

/** The alternate double's port-occupant identity (independent code path). */
export const ALTERNATE_IFC_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "understanding-substrate.ifc.alternate-double",
  family: "ifc",
  technologyVersion: "ifc-alternate-double/1.0.0",
  engineNote:
    "in-memory substitution double — character-tokenizing STEP parser; NO substrate " +
    "integrated (P0 defines contracts; IfcOpenShell/web-ifc are future occupants)",
  laneStatement: UNDERSTANDING_LANE_STATEMENT,
};

/* ------------------------------------------------------------------ */
/* The closed entity-class tables (shared LAW, not shared code)         */
/* ------------------------------------------------------------------ */

/**
 * The spatial-structure classes the doubles interpret, mapped to the
 * contract's closed spatial roles. Attribute positions consumed per class
 * (IFC4 attribute order): GlobalId=attr0, OwnerHistory=attr1, Name=attr2.
 */
const SPATIAL_CLASS_TO_ROLE: Readonly<Record<string, "project" | "site" | "building" | "storey" | "space">> = {
  IFCPROJECT: "project",
  IFCSITE: "site",
  IFCBUILDING: "building",
  IFCBUILDINGSTOREY: "storey",
  IFCSPACE: "space",
};

/**
 * The physical-element classes the doubles interpret, mapped to AISE-side
 * lower_snake_case RealityObject kinds (a documented mechanical mapping —
 * the kind vocabulary is open on the AISE side, the class vocabulary is
 * closed on the file side). Attribute positions consumed per class:
 * GlobalId=attr0, OwnerHistory=attr1, Name=attr2.
 */
const ELEMENT_CLASS_TO_KIND: Readonly<Record<string, string>> = {
  IFCWALL: "wall",
  IFCWALLSTANDARDCASE: "wall_standard_case",
  IFCSLAB: "slab",
  IFCROOF: "roof",
  IFCDOOR: "door",
  IFCWINDOW: "window",
  IFCOPENINGELEMENT: "opening_element",
  IFCBEAM: "beam",
  IFCCOLUMN: "column",
  IFCMEMBER: "member",
  IFCPLATE: "plate",
  IFCSTAIR: "stair",
  IFCRAILING: "railing",
  IFCFURNISHINGELEMENT: "furnishing_element",
  IFCFLOWTERMINAL: "flow_terminal",
  IFCFLOWSEGMENT: "flow_segment",
  IFCDISTRIBUTIONELEMENT: "distribution_element",
};

/** The relationship classes the doubles interpret. */
const RELATIONSHIP_CLASSES: readonly string[] = [
  "IFCRELAGGREGATES",
  "IFCRELCONTAINEDINSPATIALSTRUCTURE",
  "IFCRELVOIDSELEMENT",
  "IFCRELDEFINESBYPROPERTIES",
  "IFCRELASSOCIATESCLASSIFICATION",
];

/** The property/quantity definition classes the doubles interpret. */
const PROPERTY_CLASSES: readonly string[] = [
  "IFCPROPERTYSET",
  "IFCELEMENTQUANTITY",
  "IFCPROPERTYSINGLEVALUE",
  "IFCQUANTITYLENGTH",
  "IFCQUANTITYAREA",
  "IFCQUANTITYVOLUME",
  "IFCQUANTITYCOUNT",
  "IFCQUANTITYWEIGHT",
];

/** Quantity classes → the closed quantity kinds. */
const QUANTITY_CLASS_TO_KIND: Readonly<Record<string, IfcQuantityKind>> = {
  IFCQUANTITYLENGTH: "length",
  IFCQUANTITYAREA: "area",
  IFCQUANTITYVOLUME: "volume",
  IFCQUANTITYCOUNT: "count",
  IFCQUANTITYWEIGHT: "weight",
};

/** A guid-shaped namespaced label (the identity-law carrier). */
function guidLabel(guid: string): NamespacedExternalLabel {
  return { namespace: "ifc-guid", value: guid };
}

/** A STEP-entity-ref namespaced label (no-GuidId entities). */
function stepRefLabel(ref: string): NamespacedExternalLabel {
  return { namespace: "ifc-step-ref", value: ref };
}

/** The label of a statement ref (guid when it has one, else the step ref). */
function labelOfStatement(guid: string | null, ref: string): NamespacedExternalLabel {
  return guid === null ? stepRefLabel(`#${ref}`) : guidLabel(guid);
}

/* ------------------------------------------------------------------ */
/* The unit derivation (DECLARED inputs — law: tolerances/units declared) */
/* ------------------------------------------------------------------ */

/**
 * Derives a quantity's unit symbol from the request's DECLARED model
 * units: length → linear, area → linear squared, volume → linear cubed;
 * count/weight → null (unitless in this contract's scope). The file's
 * IFCSIUNIT entities are honestly recorded as uninterpreted omissions;
 * units are a declared AISE-side input, never adapter-invented.
 */
export function quantityUnitOf(kind: IfcQuantityKind, linearUnit: string): string | null {
  switch (kind) {
    case "length":
      return linearUnit;
    case "area":
      return `${linearUnit}2`;
    case "volume":
      return `${linearUnit}3`;
    case "count":
    case "weight":
      return null;
  }
}

/* ================================================================== */
/* PART 1 — the REFERENCE double (statement-scanning parser)           */
/* ================================================================== */

/** One parsed STEP statement (the reference parser's shape). */
interface RefStatement {
  readonly ref: string;
  readonly entity: string;
  readonly attrs: readonly string[];
}

/**
 * The reference scanner: line-accumulating statement collection. Handles
 * one-per-line fixtures AND multi-line statements (a statement is complete
 * when its text ends with `;`). Returns null when the text has no
 * well-formed DATA section or an unterminated statement.
 */
function refScanStatements(stepText: string): string[] | null {
  const dataStart = stepText.indexOf("DATA;");
  const dataEnd = stepText.lastIndexOf("ENDSEC;");
  if (dataStart < 0 || dataEnd < 0 || dataEnd < dataStart) {
    return null;
  }
  const body = stepText.slice(dataStart + "DATA;".length, dataEnd);
  const statements: string[] = [];
  let buffer = "";
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    buffer = buffer.length === 0 ? line : `${buffer} ${line}`;
    if (buffer.endsWith(";")) {
      statements.push(buffer.slice(0, -1).trim());
      buffer = "";
    }
  }
  if (buffer.trim().length > 0) {
    return null; // unterminated statement — malformed
  }
  return statements.filter((s) => s.length > 0);
}

/** The reference statement shape check (regex). */
const REF_STATEMENT_SHAPE = /^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*)\)$/;

/**
 * The reference attribute splitter: comma-splitting at paren depth 0 with
 * single-quote string awareness (STEP strings escape `'` as `''`).
 */
function refSplitAttributes(blob: string): string[] {
  const attrs: string[] = [];
  let depth = 0;
  let inString = false;
  let current = "";
  for (const ch of blob) {
    if (inString) {
      current += ch;
      if (ch === "'") {
        inString = false;
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      attrs.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) {
    attrs.push(current.trim());
  }
  return attrs;
}

/** Reference value interpretation (STEP literal → JS value). */
function refValue(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "$" || trimmed === "*") {
    return null;
  }
  if (trimmed === ".T.") {
    return true;
  }
  if (trimmed === ".F.") {
    return false;
  }
  const typed = /^([A-Z0-9_]+)\((.*)\)$/.exec(trimmed);
  if (typed) {
    return refValue(typed[2]!);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return refSplitAttributes(trimmed.slice(1, -1))
      .filter((part) => part.length > 0)
      .map((part) => refValue(part));
  }
  if (trimmed.startsWith("#")) {
    return trimmed;
  }
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    return Number.isFinite(asNumber) ? asNumber : trimmed;
  }
  return trimmed;
}

/** Reference attr accessor (raw attribute text → interpreted value). */
function refAttr(statement: RefStatement, index: number): unknown {
  const raw = statement.attrs[index];
  return raw === undefined ? null : refValue(raw);
}

/** Reference list-of-refs accessor (returns raw `#N` strings). */
function refRefList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === "string" && v.startsWith("#"));
}

/** Reference string accessor. */
function refString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** The reference parser's internal semantic accumulation. */
interface RefExtraction {
  readonly spatialNodes: IfcSpatialNodeRecord[];
  readonly elements: IfcElementRecord[];
  readonly propertySets: IfcPropertySetRecord[];
  readonly quantitySets: IfcQuantitySetRecord[];
  readonly relationships: IfcRelationshipRecord[];
  readonly omissions: IfcOmissionRecord[];
  readonly schemaIdentifier: string;
}

/** Reads the FILE_SCHEMA identifier from the header. */
function refReadSchemaIdentifier(stepText: string): string | null {
  const match = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'\s*\)\s*\)/.exec(stepText);
  return match ? match[1]! : null;
}

/** The reference interpretation over the parsed statement table. */
function refInterpret(stepText: string, intents: IfcInterpretationRequest["intents"]): RefExtraction | null {
  const rawStatements = refScanStatements(stepText);
  if (rawStatements === null) {
    return null;
  }
  const schemaIdentifier = refReadSchemaIdentifier(stepText);
  if (schemaIdentifier === null) {
    return null;
  }

  /* Pass A — parse every statement into the table. */
  const table = new Map<string, RefStatement>();
  const order: string[] = [];
  for (const raw of rawStatements) {
    const match = REF_STATEMENT_SHAPE.exec(raw);
    if (!match) {
      return null; // not shape-checkable at all — malformed
    }
    const statement: RefStatement = {
      ref: match[1]!,
      entity: match[2]!,
      attrs: refSplitAttributes(match[3]!),
    };
    table.set(statement.ref, statement);
    order.push(statement.ref);
  }

  /* Pass B — guid table + consulted classification codes. */
  const guidByRef = new Map<string, string>();
  for (const ref of order) {
    const statement = table.get(ref)!;
    const guid = refString(refAttr(statement, 0));
    if (guid !== null && isIfcGuidShapedCheck(guid)) {
      guidByRef.set(ref, guid);
    }
  }
  const classificationCodeByRef = new Map<string, string>();
  if (intents.classification) {
    for (const ref of order) {
      const statement = table.get(ref)!;
      if (statement.entity === "IFCCLASSIFICATIONREFERENCE") {
        const identification = refString(refAttr(statement, 0));
        if (identification !== null) {
          classificationCodeByRef.set(ref, identification);
        }
      }
    }
  }

  /* Pass C — definition tables (property/quantity sets + their members). */
  const psetsByRef = new Map<string, { name: string; propertyRefs: string[] }>();
  const qsetsByRef = new Map<string, { name: string; quantityRefs: string[] }>();
  const singleValuesByRef = new Map<string, { name: string; nominal: unknown }>();
  const quantitiesByRef = new Map<string, { name: string; kind: IfcQuantityKind; value: number }>();
  const definesByProperties: { relatedRefs: string[]; relatingRef: string }[] = [];
  for (const ref of order) {
    const statement = table.get(ref)!;
    const entity = statement.entity;
    if (entity === "IFCPROPERTYSET" && intents.elementProperties) {
      const name = refString(refAttr(statement, 2));
      if (name === null) {
        return null;
      }
      psetsByRef.set(ref, { name, propertyRefs: refRefList(refAttr(statement, 4)) });
    } else if (entity === "IFCELEMENTQUANTITY" && intents.quantities) {
      const name = refString(refAttr(statement, 2));
      if (name === null) {
        return null;
      }
      /* IFC4: Quantities is attribute 6 (after MethodOfMeasurement=4,
       * Units=5) — the fixture follows the schema order. */
      qsetsByRef.set(ref, { name, quantityRefs: refRefList(refAttr(statement, 6)) });
    } else if (entity === "IFCPROPERTYSINGLEVALUE" && intents.elementProperties) {
      const name = refString(refAttr(statement, 0));
      if (name === null) {
        return null;
      }
      singleValuesByRef.set(ref, { name, nominal: refAttr(statement, 2) });
    } else if (entity in QUANTITY_CLASS_TO_KIND && intents.quantities) {
      const name = refString(refAttr(statement, 0));
      const value = refAttr(statement, 3);
      if (name === null || typeof value !== "number") {
        return null;
      }
      quantitiesByRef.set(ref, { name, kind: QUANTITY_CLASS_TO_KIND[entity]!, value });
    }
  }

  /* Pass D — relationship walk: fill containment/classification, record
   * edges into the relationships array only when that intent is on. */
  const spatialNodes: IfcSpatialNodeRecord[] = [];
  const elements: IfcElementRecord[] = [];
  const relationships: IfcRelationshipRecord[] = [];
  const containedByGuid = new Map<string, string>();
  const classificationByGuid = new Map<string, string>();
  const omissions: IfcOmissionRecord[] = [];
  const omissionsPush = (statement: RefStatement, ref: string): void => {
    omissions.push({
      kind:
        statement.entity === "IFCPRODUCTDEFINITIONSHAPE"
          ? "geometry-representation-skipped"
          : statement.entity === "IFCCLASSIFICATIONREFERENCE"
            ? "attribute-out-of-scope"
            : "unsupported-entity-class",
      stepRef: stepRefLabel(`#${ref}`),
      entityClass: statement.entity,
    });
  };

  for (const ref of order) {
    const statement = table.get(ref)!;
    const entity = statement.entity;
    const ownGuid = guidByRef.get(ref) ?? null;

    if (entity === "IFCRELAGGREGATES") {
      const relatingRef = refString(refAttr(statement, 4));
      const relatedRefs = refRefList(refAttr(statement, 5));
      if (relatingRef === null || relatedRefs.length === 0) {
        return null;
      }
      if (intents.relationships) {
        relationships.push({
          kind: "aggregation",
          label: ownGuid === null ? null : guidLabel(ownGuid),
          relating: labelOfStatement(guidByRef.get(relatingRef.slice(1)) ?? null, relatingRef.slice(1)),
          related: relatedRefs.map((r) => labelOfStatement(guidByRef.get(r.slice(1)) ?? null, r.slice(1))),
        });
      }
      if (intents.spatialContainment) {
        for (const r of relatedRefs) {
          const childGuid = guidByRef.get(r.slice(1));
          const parentGuid = guidByRef.get(relatingRef.slice(1));
          if (childGuid !== undefined) {
            containedByGuid.set(childGuid, parentGuid ?? r);
          }
        }
      }
      continue;
    }

    if (entity === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
      const relatedRefs = refRefList(refAttr(statement, 4));
      const relatingRef = refString(refAttr(statement, 5));
      if (relatingRef === null || relatedRefs.length === 0) {
        return null;
      }
      if (intents.relationships) {
        relationships.push({
          kind: "containment",
          label: ownGuid === null ? null : guidLabel(ownGuid),
          relating: labelOfStatement(guidByRef.get(relatingRef.slice(1)) ?? null, relatingRef.slice(1)),
          related: relatedRefs.map((r) => labelOfStatement(guidByRef.get(r.slice(1)) ?? null, r.slice(1))),
        });
      }
      if (intents.spatialContainment) {
        for (const r of relatedRefs) {
          const elementGuid = guidByRef.get(r.slice(1));
          const storeyGuid = guidByRef.get(relatingRef.slice(1));
          if (elementGuid !== undefined) {
            containedByGuid.set(elementGuid, storeyGuid ?? r);
          }
        }
      }
      continue;
    }

    if (entity === "IFCRELVOIDSELEMENT") {
      const relatingRef = refString(refAttr(statement, 4));
      const relatedRef = refString(refAttr(statement, 5));
      if (relatingRef === null || relatedRef === null) {
        return null;
      }
      if (intents.relationships) {
        relationships.push({
          kind: "voiding",
          label: ownGuid === null ? null : guidLabel(ownGuid),
          relating: labelOfStatement(guidByRef.get(relatingRef.slice(1)) ?? null, relatingRef.slice(1)),
          related: [labelOfStatement(guidByRef.get(relatedRef.slice(1)) ?? null, relatedRef.slice(1))],
        });
      }
      continue;
    }

    if (entity === "IFCRELDEFINESBYPROPERTIES") {
      const relatedRefs = refRefList(refAttr(statement, 4));
      const relatingRef = refString(refAttr(statement, 5));
      if (relatingRef === null || relatedRefs.length === 0) {
        return null;
      }
      if (intents.relationships) {
        relationships.push({
          kind: "property-definition",
          label: ownGuid === null ? null : guidLabel(ownGuid),
          relating: labelOfStatement(guidByRef.get(relatingRef.slice(1)) ?? null, relatingRef.slice(1)),
          related: relatedRefs.map((r) => labelOfStatement(guidByRef.get(r.slice(1)) ?? null, r.slice(1))),
        });
      }
      definesByProperties.push({ relatedRefs, relatingRef });
      continue;
    }

    if (entity === "IFCRELASSOCIATESCLASSIFICATION") {
      const relatedRefs = refRefList(refAttr(statement, 4));
      const relatingRef = refString(refAttr(statement, 5));
      if (relatingRef === null || relatedRefs.length === 0) {
        return null;
      }
      if (intents.relationships) {
        relationships.push({
          kind: "classification",
          label: ownGuid === null ? null : guidLabel(ownGuid),
          relating: labelOfStatement(guidByRef.get(relatingRef.slice(1)) ?? null, relatingRef.slice(1)),
          related: relatedRefs.map((r) => labelOfStatement(guidByRef.get(r.slice(1)) ?? null, r.slice(1))),
        });
      }
      if (intents.classification) {
        const code = classificationCodeByRef.get(relatingRef.slice(1));
        if (code !== undefined) {
          for (const r of relatedRefs) {
            const elementGuid = guidByRef.get(r.slice(1));
            if (elementGuid !== undefined) {
              classificationByGuid.set(elementGuid, code);
            }
          }
        }
      }
      continue;
    }

    if (entity in SPATIAL_CLASS_TO_ROLE || entity in ELEMENT_CLASS_TO_KIND) {
      continue; // handled in the node/element pass below
    }
    if (RELATIONSHIP_CLASSES.includes(entity) || PROPERTY_CLASSES.includes(entity)) {
      continue; // handled above (or intent-gated off — not an omission)
    }

    /* Uninterpreted entity — the honest omission (the wall's
     * product-definition-shape lands here as geometry-representation-skipped;
     * the classification reference as attribute-out-of-scope; everything
     * else as unsupported-entity-class). */
    omissionsPush(statement, ref);
  }

  /* Pass E — nodes and elements (in statement order), filled. */
  if (intents.spatialContainment) {
    for (const ref of order) {
      const statement = table.get(ref)!;
      const guid = guidByRef.get(ref);
      if (guid === undefined) {
        continue;
      }
      if (statement.entity in SPATIAL_CLASS_TO_ROLE) {
        const containerGuid = containedByGuid.get(guid);
        spatialNodes.push({
          role: SPATIAL_CLASS_TO_ROLE[statement.entity]!,
          label: guidLabel(guid),
          name: refString(refAttr(statement, 2)),
          containedBy: containerGuid === undefined ? null : guidLabel(containerGuid),
        });
      } else if (statement.entity in ELEMENT_CLASS_TO_KIND) {
        const containerGuid = containedByGuid.get(guid);
        const classification = classificationByGuid.get(guid) ?? null;
        elements.push({
          ifcClass: statement.entity,
          label: guidLabel(guid),
          name: refString(refAttr(statement, 2)),
          containedBy: containerGuid === undefined ? null : guidLabel(containerGuid),
          classification,
        });
      }
    }
  }

  /* Pass F — materialize property/quantity sets. */
  const propertySets: IfcPropertySetRecord[] = [];
  const quantitySets: IfcQuantitySetRecord[] = [];
  for (const binding of definesByProperties) {
    const pset = psetsByRef.get(binding.relatingRef.slice(1));
    if (pset !== undefined) {
      const properties: IfcPropertyRecord[] = [];
      for (const propertyRef of pset.propertyRefs) {
        const single = singleValuesByRef.get(propertyRef.slice(1));
        if (single === undefined) {
          continue;
        }
        const nominal = single.nominal;
        if (typeof nominal === "string" || typeof nominal === "number" || typeof nominal === "boolean") {
          properties.push({ name: single.name, nominal, unit: null });
        }
      }
      for (const targetRef of binding.relatedRefs) {
        const targetGuid = guidByRef.get(targetRef.slice(1));
        if (targetGuid !== undefined) {
          propertySets.push({ name: pset.name, relates: guidLabel(targetGuid), properties });
        }
      }
    }
    const qset = qsetsByRef.get(binding.relatingRef.slice(1));
    if (qset !== undefined) {
      const quantities: IfcQuantityRecord[] = [];
      for (const quantityRef of qset.quantityRefs) {
        const quantity = quantitiesByRef.get(quantityRef.slice(1));
        if (quantity === undefined) {
          continue;
        }
        quantities.push({
          name: quantity.name,
          quantityKind: quantity.kind,
          value: quantity.value,
          unit: null, // units set by the caller from DECLARED model units
        });
      }
      for (const targetRef of binding.relatedRefs) {
        const targetGuid = guidByRef.get(targetRef.slice(1));
        if (targetGuid !== undefined) {
          quantitySets.push({ name: qset.name, relates: guidLabel(targetGuid), quantities });
        }
      }
    }
  }

  return { spatialNodes, elements, propertySets, quantitySets, relationships, omissions, schemaIdentifier };
}

/** Shape check: 22 IFC base64 characters (a local re-check, no import cycle). */
function isIfcGuidShapedCheck(value: string): boolean {
  return /^[0-9A-Za-z_$]{22}$/.test(value);
}

/* ================================================================== */
/* The AISE-side mapping builder (SHARED law code)                      */
/* ================================================================== */

/**
 * Builds the `AiseMappingBlock` from interpreted extraction records.
 *
 * This builder is SHARED between the two doubles ON PURPOSE: the mapping
 * discipline into AISE contract types (content-derived candidate ids,
 * INFERRED epistemic status, declared evidence binding, closed method
 * identity) is AISE LAW dictated by the seam — engines differ in PARSING,
 * never in mapping law. The real IfcOpenShell and web-ifc adapters will
 * parse with different engines and obey this same mapping discipline; the
 * doubles prove exactly that shape.
 */
function buildIfcAiseMapping(
  extraction: {
    spatialNodes: readonly IfcSpatialNodeRecord[];
    elements: readonly IfcElementRecord[];
    propertySets: readonly IfcPropertySetRecord[];
    quantitySets: readonly IfcQuantitySetRecord[];
    relationships: readonly IfcRelationshipRecord[];
    omissions: readonly IfcOmissionRecord[];
  },
  request: IfcInterpretationRequest,
  methodVersion: string,
): AiseMappingBlock {
  const inputDigest = ifcModelDigestOf(request);
  const parameters = ifcDerivationParameters(request);
  const parametersDigest = canonicalDigestOf(parameters);

  const derivation: Derivation = {
    contractVersion: CONTRACT_VERSION,
    derivationId: canonicalDigestOf({
      candidate: "derivation",
      family: "ifc",
      method: "interpretation.ifc",
      inputDigest,
      parametersDigest,
      evidenceContentId: request.evidenceContentId,
    }),
    outputContentId: canonicalDigestOf({
      spatialNodes: extraction.spatialNodes,
      elements: extraction.elements,
      propertySets: extraction.propertySets,
      quantitySets: extraction.quantitySets,
      relationships: extraction.relationships,
      omissions: extraction.omissions,
    }),
    inputEvidenceContentIds: [request.evidenceContentId],
    method: "interpretation.ifc",
    methodVersion,
    parameters,
    createdAt: request.recordedAt,
  };

  /* Reality-object seeds: one per spatial node + one per element. The
   * candidate id is a content digest over {family, guid label, kind} —
   * NEVER the guid itself (law #1). */
  const objectIdByGuid = new Map<string, string>();
  const realityObjects: RealityObject[] = [];
  for (const node of extraction.spatialNodes) {
    const objectId = canonicalDigestOf({
      candidate: "reality-object",
      family: "ifc",
      labelNamespace: node.label.namespace,
      labelValue: node.label.value,
      kind: node.role,
    });
    objectIdByGuid.set(node.label.value, objectId);
    realityObjects.push({
      contractVersion: CONTRACT_VERSION,
      objectId,
      version: 1,
      kind: node.role,
      units: { linear: request.modelUnits.linear, angular: request.modelUnits.angular },
    });
  }
  for (const element of extraction.elements) {
    const kind = ELEMENT_CLASS_TO_KIND[element.ifcClass] ?? element.ifcClass.toLowerCase();
    const objectId = canonicalDigestOf({
      candidate: "reality-object",
      family: "ifc",
      labelNamespace: element.label.namespace,
      labelValue: element.label.value,
      kind,
    });
    objectIdByGuid.set(element.label.value, objectId);
    realityObjects.push({
      contractVersion: CONTRACT_VERSION,
      objectId,
      version: 1,
      kind,
      units: { linear: request.modelUnits.linear, angular: request.modelUnits.angular },
    });
  }

  /* Property-assertion seeds (IFC properties → INFERRED candidates). */
  const propertyAssertions: PropertyAssertion[] = [];
  for (const pset of extraction.propertySets) {
    const subjectRef = objectIdByGuid.get(pset.relates.value);
    if (subjectRef === undefined) {
      continue;
    }
    for (const property of pset.properties) {
      propertyAssertions.push({
        contractVersion: CONTRACT_VERSION,
        assertionId: canonicalDigestOf({
          candidate: "property-assertion",
          family: "ifc",
          subject: subjectRef,
          propertySet: pset.name,
          property: property.name,
          value: property.nominal,
        }),
        subjectRef,
        property: property.name,
        value: property.nominal,
        unit: property.unit,
        status: "INFERRED",
        method: "interpretation.ifc",
        source_evidence: [request.evidenceContentId],
        verified_by: null,
        verified_at: null,
      });
    }
  }

  /* Measurement seeds (IFC quantities → INFERRED candidates, units from
   * the DECLARED model units). */
  const measurements: Measurement[] = [];
  for (const qset of extraction.quantitySets) {
    const subjectRef = objectIdByGuid.get(qset.relates.value);
    if (subjectRef === undefined) {
      continue;
    }
    for (const quantity of qset.quantities) {
      measurements.push({
        contractVersion: CONTRACT_VERSION,
        measurementId: canonicalDigestOf({
          candidate: "measurement",
          family: "ifc",
          subject: subjectRef,
          quantitySet: qset.name,
          quantity: quantity.name,
          value: quantity.value,
        }),
        subjectRef,
        quantity: quantity.quantityKind,
        value: quantity.value,
        unit: quantityUnitOf(quantity.quantityKind, request.modelUnits.linear),
        status: "INFERRED",
        method: "interpretation.ifc",
        evidenceContentIds: [request.evidenceContentId],
        measuredAt: request.recordedAt,
      });
    }
  }

  return { derivation, realityObjects, propertyAssertions, measurements };
}

/* ================================================================== */
/* The shared governed assembly (validate → interpret → seal)           */
/* ================================================================== */

/**
 * The governed assembly both doubles share: request validation (typed
 * `contract-mismatch` refusal), parsing (per-double), the schema-intent
 * law (typed `unsupported-data` refusal with both identifiers named),
 * DECLARED-unit fill, the mapping block, the provenance and the sealed
 * result id (content digest over the result minus its own id).
 */
function doubleInterpret(
  descriptor: SubstrateProviderDescriptor,
  request: IfcInterpretationRequest,
  interpretFn: (stepText: string, intents: IfcInterpretationRequest["intents"]) => RefExtraction | AltExtraction | null,
): SubstrateOutcome<IfcExtractionResult> {
  const validation = validateIfcInterpretationRequest(request);
  if (!validation.ok) {
    return ifcRefused(
      "contract-mismatch",
      `request validation refused: ${validation.failures
        .map((failure) => `${failure.path} (${failure.kind}): ${failure.detail}`)
        .join("; ")}`,
    );
  }
  const frozen = deepFreeze(request);
  const extraction = interpretFn(frozen.model.stepText, frozen.intents);
  if (extraction === null) {
    return ifcRefused(
      "unsupported-data",
      "malformed-step: the text carries no well-formed DATA section or a statement cannot be parsed",
    );
  }
  if (extraction.schemaIdentifier !== frozen.schemaIntent) {
    return ifcRefused(
      "unsupported-data",
      `schema-intent-mismatch: the file declares FILE_SCHEMA ${JSON.stringify(
        extraction.schemaIdentifier,
      )}, the request declares ${JSON.stringify(frozen.schemaIntent)} — the AISE side decides, the adapter refuses`,
    );
  }

  /* Units are DECLARED inputs (the IFCSIUNIT entities are honestly
   * omitted); fill them on the quantity records now. */
  const quantitySets = extraction.quantitySets.map((qset) => ({
    ...qset,
    quantities: qset.quantities.map((quantity) => ({
      ...quantity,
      unit: quantityUnitOf(quantity.quantityKind, frozen.modelUnits.linear),
    })),
  }));

  const aise = buildIfcAiseMapping(
    { ...extraction, quantitySets },
    frozen,
    descriptor.technologyVersion,
  );
  const provenance = ifcProvenanceOf(descriptor, frozen);
  const body = {
    kind: IFC_RESULT_KIND,
    schemaVersion: IFC_RESULT_SCHEMA_VERSION,
    modelDigest: textDigestOf(frozen.model.stepText),
    schemaIdentifier: extraction.schemaIdentifier,
    spatialNodes: extraction.spatialNodes,
    elements: extraction.elements,
    propertySets: extraction.propertySets,
    quantitySets,
    relationships: extraction.relationships,
    omissions: extraction.omissions,
    aise,
    provenance,
  };
  const result: IfcExtractionResult = { ...body, resultId: canonicalDigestOf(body) };
  return { ok: true, value: result };
}

/* The two governed providers. */
export const referenceIfcDouble: IfcInterpretationProvider = {
  descriptor: REFERENCE_IFC_DOUBLE_DESCRIPTOR,
  interpret: (request) => doubleInterpret(REFERENCE_IFC_DOUBLE_DESCRIPTOR, request, refInterpret),
};

export const alternateIfcDouble: IfcInterpretationProvider = {
  descriptor: ALTERNATE_IFC_DOUBLE_DESCRIPTOR,
  interpret: (request) => doubleInterpret(ALTERNATE_IFC_DOUBLE_DESCRIPTOR, request, altInterpret),
};

/* ================================================================== */
/* PART 2 — the ALTERNATE double (character-tokenizing parser)          */
/* ================================================================== */

/**
 * The alternate statement record: attributes are EAGERLY interpreted
 * values (the reference splits raw strings and interprets per access —
 * the architectural difference between the two parsers).
 */
interface AltStatement {
  readonly ref: string;
  readonly entity: string;
  readonly attrs: readonly unknown[];
}

/** The alternate parser's semantic accumulation (same shape as RefExtraction). */
interface AltExtraction {
  readonly spatialNodes: IfcSpatialNodeRecord[];
  readonly elements: IfcElementRecord[];
  readonly propertySets: IfcPropertySetRecord[];
  readonly quantitySets: IfcQuantitySetRecord[];
  readonly relationships: IfcRelationshipRecord[];
  readonly omissions: IfcOmissionRecord[];
  readonly schemaIdentifier: string;
}

/**
 * The alternate tokenizer: ONE character-level state machine over the
 * DATA body — statements terminate at `;` only at paren depth 0 outside
 * strings (handles multi-line and whitespace variants with no line
 * splitting at all). Returns null on unterminated trailing text.
 */
function altTokenizeStatements(stepText: string): string[] | null {
  const dataStart = stepText.indexOf("DATA;");
  const dataEnd = stepText.lastIndexOf("ENDSEC;");
  if (dataStart < 0 || dataEnd <= dataStart) {
    return null;
  }
  const body = stepText.slice(dataStart + "DATA;".length, dataEnd);
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  for (const ch of body) {
    if (inString) {
      current += ch;
      if (ch === "'") {
        inString = false;
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      current += ch;
      continue;
    }
    if (ch === ";" && depth === 0) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) {
    return null; // unterminated statement — malformed
  }
  return statements;
}

/** Cursor for the alternate's recursive descent. */
interface AltCursor {
  i: number;
}

function altSkipSpaces(text: string, cursor: AltCursor): void {
  while (cursor.i < text.length && text[cursor.i] === " ") {
    cursor.i += 1;
  }
}

function altIsNameChar(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch === "_";
}

function altReadString(text: string, cursor: AltCursor): string {
  cursor.i += 1; // consume opening quote
  let out = "";
  for (;;) {
    if (cursor.i >= text.length) {
      return out; // unterminated string — treated as end (malformed upstream)
    }
    const ch = text[cursor.i]!;
    if (ch === "'") {
      if (text[cursor.i + 1] === "'") {
        out += "'";
        cursor.i += 2;
        continue;
      }
      cursor.i += 1;
      return out;
    }
    out += ch;
    cursor.i += 1;
  }
}

function altReadList(text: string, cursor: AltCursor): unknown[] {
  cursor.i += 1; // consume (
  const items: unknown[] = [];
  for (;;) {
    altSkipSpaces(text, cursor);
    if (cursor.i >= text.length) {
      return items;
    }
    const ch = text[cursor.i]!;
    if (ch === ")") {
      cursor.i += 1;
      return items;
    }
    if (ch === ",") {
      cursor.i += 1;
      continue;
    }
    items.push(altParseValue(text, cursor));
  }
}

const ALT_NUMBER_SHAPE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * The alternate recursive-descent value parser: interprets ONE STEP value
 * at the cursor and advances it. Typed wrappers (`IFCREAL(0.35)`) are
 * unwrapped recursively; enums (`.METRE.`) are returned as bare text
 * (consulted only by intent-gated paths that read them as strings).
 */
function altParseValue(text: string, cursor: AltCursor): unknown {
  altSkipSpaces(text, cursor);
  if (cursor.i >= text.length) {
    return null;
  }
  const ch = text[cursor.i]!;
  if (ch === "$" || ch === "*") {
    cursor.i += 1;
    return null;
  }
  if (text.startsWith(".T.", cursor.i)) {
    cursor.i += 3;
    return true;
  }
  if (text.startsWith(".F.", cursor.i)) {
    cursor.i += 3;
    return false;
  }
  if (ch === "'") {
    return altReadString(text, cursor);
  }
  if (ch === "(") {
    return altReadList(text, cursor);
  }
  if (ch === "#") {
    let end = cursor.i + 1;
    while (end < text.length && text[end]! >= "0" && text[end]! <= "9") {
      end += 1;
    }
    const ref = text.slice(cursor.i, end);
    cursor.i = end;
    return ref;
  }
  if (ch === ".") {
    let end = cursor.i + 1;
    while (end < text.length && text[end]! !== "." && text[end]! !== "," && text[end]! !== ")") {
      end += 1;
    }
    const token = text.slice(cursor.i, end);
    cursor.i = Math.min(end + 1, text.length); // consume the closing dot
    return token;
  }
  /* Name (typed wrapper or bare token, possibly numeric — the token
   * character set includes `.` so decimal literals like `0.35`, `12.5`,
   * `1.0E-5` are consumed whole; delimiters `,` `)` `(` `'` whitespace
   * terminate the token). */
  let end = cursor.i;
  while (
    end < text.length &&
    (altIsNameChar(text[end]!) || text[end] === "." || text[end] === "-" || text[end] === "+")
  ) {
    end += 1;
  }
  const name = text.slice(cursor.i, end);
  cursor.i = end;
  if (name.length === 0) {
    return null;
  }
  altSkipSpaces(text, cursor);
  if (text[cursor.i] === "(") {
    cursor.i += 1; // consume the wrapper's opening paren
    const inner = altParseValue(text, cursor);
    altSkipSpaces(text, cursor);
    if (text[cursor.i] === ")") {
      cursor.i += 1;
    }
    return inner;
  }
  if (ALT_NUMBER_SHAPE.test(name)) {
    const asNumber = Number(name);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }
  }
  return name;
}

/** Parses one raw statement (no regex): `#N=ENTITY(value,value,...)`. */
function altParseStatement(text: string): AltStatement | null {
  if (!text.startsWith("#")) {
    return null;
  }
  let i = 1;
  while (i < text.length && text[i]! >= "0" && text[i]! <= "9") {
    i += 1;
  }
  const ref = text.slice(1, i);
  if (ref.length === 0) {
    return null;
  }
  while (i < text.length && text[i] === " ") {
    i += 1;
  }
  if (text[i] !== "=") {
    return null;
  }
  i += 1;
  while (i < text.length && text[i] === " ") {
    i += 1;
  }
  const entityStart = i;
  while (i < text.length && altIsNameChar(text[i]!)) {
    i += 1;
  }
  const entity = text.slice(entityStart, i);
  if (entity.length === 0 || text[i] !== "(") {
    return null;
  }
  if (!text.endsWith(")")) {
    return null;
  }
  const inner = text.slice(i + 1, text.length - 1);
  const cursor: AltCursor = { i: 0 };
  const attrs: unknown[] = [];
  for (;;) {
    altSkipSpaces(inner, cursor);
    if (cursor.i >= inner.length) {
      break;
    }
    if (inner[cursor.i] === ",") {
      cursor.i += 1;
      continue;
    }
    attrs.push(altParseValue(inner, cursor));
  }
  return { ref, entity, attrs };
}

/** Reads the FILE_SCHEMA identifier (the alternate's own scan). */
function altReadSchemaIdentifier(stepText: string): string | null {
  const marker = "FILE_SCHEMA";
  const at = stepText.indexOf(marker);
  if (at < 0) {
    return null;
  }
  const cursor: AltCursor = { i: at + marker.length };
  altSkipSpaces(stepText, cursor);
  if (stepText[cursor.i] !== "(") {
    return null;
  }
  cursor.i += 1;
  const parsed = altParseValue(stepText, cursor); // the inner (list)
  if (!Array.isArray(parsed) || parsed.length === 0 || typeof parsed[0] !== "string") {
    return null;
  }
  return parsed[0];
}

/** The alternate interpretation — same LAWS, independent mechanics. */
function altInterpret(stepText: string, intents: IfcInterpretationRequest["intents"]): AltExtraction | null {
  const rawStatements = altTokenizeStatements(stepText);
  if (rawStatements === null) {
    return null;
  }
  const schemaIdentifier = altReadSchemaIdentifier(stepText);
  if (schemaIdentifier === null) {
    return null;
  }

  /* Parse every statement eagerly (values interpreted at parse time). */
  const table = new Map<string, AltStatement>();
  const order: string[] = [];
  for (const raw of rawStatements) {
    const statement = altParseStatement(raw);
    if (statement === null) {
      return null;
    }
    table.set(statement.ref, statement);
    order.push(statement.ref);
  }

  const attr = (ref: string, index: number): unknown => table.get(ref)!.attrs[index] ?? null;
  const guidOf = (ref: string): string | null => {
    const value = attr(ref, 0);
    return typeof value === "string" && isIfcGuidShapedCheck(value) ? value : null;
  };
  const refsOf = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string" && v.startsWith("#"))
      : [];
  const stringOf = (value: unknown): string | null => (typeof value === "string" ? value : null);

  const guidByRef = new Map<string, string>();
  for (const ref of order) {
    const guid = guidOf(ref);
    if (guid !== null) {
      guidByRef.set(ref, guid);
    }
  }

  /* Classification codes (intent-gated consultation of attr0). */
  const classificationCodeByRef = new Map<string, string>();
  if (intents.classification) {
    for (const ref of order) {
      if (table.get(ref)!.entity === "IFCCLASSIFICATIONREFERENCE") {
        const identification = stringOf(attr(ref, 0));
        if (identification !== null) {
          classificationCodeByRef.set(ref, identification);
        }
      }
    }
  }

  /* Definition tables. */
  const psetsByRef = new Map<string, { name: string; propertyRefs: string[] }>();
  const qsetsByRef = new Map<string, { name: string; quantityRefs: string[] }>();
  const singlesByRef = new Map<string, { name: string; nominal: unknown }>();
  const quantitiesByRef = new Map<string, { name: string; kind: IfcQuantityKind; value: number }>();
  const defines: { relatedRefs: string[]; relatingRef: string }[] = [];
  for (const ref of order) {
    const entity = table.get(ref)!.entity;
    if (entity === "IFCPROPERTYSET" && intents.elementProperties) {
      const name = stringOf(attr(ref, 2));
      if (name === null) {
        return null;
      }
      psetsByRef.set(ref, { name, propertyRefs: refsOf(attr(ref, 4)) });
    } else if (entity === "IFCELEMENTQUANTITY" && intents.quantities) {
      const name = stringOf(attr(ref, 2));
      if (name === null) {
        return null;
      }
      /* IFC4: Quantities is attribute 6 (after MethodOfMeasurement=4,
       * Units=5) — the fixture follows the schema order. */
      qsetsByRef.set(ref, { name, quantityRefs: refsOf(attr(ref, 6)) });
    } else if (entity === "IFCPROPERTYSINGLEVALUE" && intents.elementProperties) {
      const name = stringOf(attr(ref, 0));
      if (name === null) {
        return null;
      }
      singlesByRef.set(ref, { name, nominal: attr(ref, 2) });
    } else if (entity in QUANTITY_CLASS_TO_KIND && intents.quantities) {
      const name = stringOf(attr(ref, 0));
      const value = attr(ref, 3);
      if (name === null || typeof value !== "number") {
        return null;
      }
      quantitiesByRef.set(ref, { name, kind: QUANTITY_CLASS_TO_KIND[entity]!, value });
    }
  }

  /* Relationship walk + omission recording. */
  const spatialNodes: IfcSpatialNodeRecord[] = [];
  const elements: IfcElementRecord[] = [];
  const relationships: IfcRelationshipRecord[] = [];
  const omissions: IfcOmissionRecord[] = [];
  const containedByGuid = new Map<string, string>();
  const classificationByGuid = new Map<string, string>();

  for (const ref of order) {
    const entity = table.get(ref)!.entity;
    const ownGuid = guidByRef.get(ref) ?? null;
    const deref = (value: string | null): NamespacedExternalLabel =>
      value === null
        ? stepRefLabel("#?")
        : labelOfStatement(guidByRef.get(value.slice(1)) ?? null, value.slice(1));

    if (entity === "IFCRELAGGREGATES") {
      const relatingRef = stringOf(attr(ref, 4));
      const relatedRefs = refsOf(attr(ref, 5));
      if (relatingRef === null || relatedRefs.length === 0) {
        return null;
      }
      if (intents.relationships) {
        relationships.push({
          kind: "aggregation",
          label: ownGuid === null ? null : guidLabel(ownGuid),
          relating: deref(relatingRef),
          related: relatedRefs.map(deref),
        });
      }
      if (intents.spatialContainment) {
        for (const r of relatedRefs) {
          const childGuid = guidByRef.get(r.slice(1));
          const parentGuid = guidByRef.get(relatingRef.slice(1));
          if (childGuid !== undefined) {
            containedByGuid.set(childGuid, parentGuid ?? r);
          }
        }
      }
      continue;
    }

    if (entity === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
      const relatedRefs = refsOf(attr(ref, 4));
      const relatingRef = stringOf(attr(ref, 5));
      if (relatingRef === null || relatedRefs.length === 0) {
        return null;
      }
      if (intents.relationships) {
        relationships.push({
          kind: "containment",
          label: ownGuid === null ? null : guidLabel(ownGuid),
          relating: deref(relatingRef),
          related: relatedRefs.map(deref),
        });
      }
      if (intents.spatialContainment) {
        for (const r of relatedRefs) {
          const elementGuid = guidByRef.get(r.slice(1));
          const storeyGuid = guidByRef.get(relatingRef.slice(1));
          if (elementGuid !== undefined) {
            containedByGuid.set(elementGuid, storeyGuid ?? r);
          }
        }
      }
      continue;
    }

    if (entity === "IFCRELVOIDSELEMENT") {
      const relatingRef = stringOf(attr(ref, 4));
      const relatedRef = stringOf(attr(ref, 5));
      if (relatingRef === null || relatedRef === null) {
        return null;
      }
      if (intents.relationships) {
        relationships.push({
          kind: "voiding",
          label: ownGuid === null ? null : guidLabel(ownGuid),
          relating: deref(relatingRef),
          related: [deref(relatedRef)],
        });
      }
      continue;
    }

    if (entity === "IFCRELDEFINESBYPROPERTIES") {
      const relatedRefs = refsOf(attr(ref, 4));
      const relatingRef = stringOf(attr(ref, 5));
      if (relatingRef === null || relatedRefs.length === 0) {
        return null;
      }
      if (intents.relationships) {
        relationships.push({
          kind: "property-definition",
          label: ownGuid === null ? null : guidLabel(ownGuid),
          relating: deref(relatingRef),
          related: relatedRefs.map(deref),
        });
      }
      defines.push({ relatedRefs, relatingRef });
      continue;
    }

    if (entity === "IFCRELASSOCIATESCLASSIFICATION") {
      const relatedRefs = refsOf(attr(ref, 4));
      const relatingRef = stringOf(attr(ref, 5));
      if (relatingRef === null || relatedRefs.length === 0) {
        return null;
      }
      if (intents.relationships) {
        relationships.push({
          kind: "classification",
          label: ownGuid === null ? null : guidLabel(ownGuid),
          relating: deref(relatingRef),
          related: relatedRefs.map(deref),
        });
      }
      if (intents.classification) {
        const code = classificationCodeByRef.get(relatingRef.slice(1));
        if (code !== undefined) {
          for (const r of relatedRefs) {
            const elementGuid = guidByRef.get(r.slice(1));
            if (elementGuid !== undefined) {
              classificationByGuid.set(elementGuid, code);
            }
          }
        }
      }
      continue;
    }

    if (entity in SPATIAL_CLASS_TO_ROLE || entity in ELEMENT_CLASS_TO_KIND) {
      continue; // nodes/elements below
    }
    if (RELATIONSHIP_CLASSES.includes(entity) || PROPERTY_CLASSES.includes(entity)) {
      continue; // handled above (or intent-gated off)
    }

    omissions.push({
      kind:
        entity === "IFCPRODUCTDEFINITIONSHAPE"
          ? "geometry-representation-skipped"
          : entity === "IFCCLASSIFICATIONREFERENCE"
            ? "attribute-out-of-scope"
            : "unsupported-entity-class",
      stepRef: stepRefLabel(`#${ref}`),
      entityClass: entity,
    });
  }

  /* Nodes and elements (statement order), filled. */
  if (intents.spatialContainment) {
    for (const ref of order) {
      const statement = table.get(ref)!;
      const guid = guidByRef.get(ref);
      if (guid === undefined) {
        continue;
      }
      const containerGuid = containedByGuid.get(guid);
      if (statement.entity in SPATIAL_CLASS_TO_ROLE) {
        spatialNodes.push({
          role: SPATIAL_CLASS_TO_ROLE[statement.entity]!,
          label: guidLabel(guid),
          name: stringOf(attr(ref, 2)),
          containedBy: containerGuid === undefined ? null : guidLabel(containerGuid),
        });
      } else if (statement.entity in ELEMENT_CLASS_TO_KIND) {
        elements.push({
          ifcClass: statement.entity,
          label: guidLabel(guid),
          name: stringOf(attr(ref, 2)),
          containedBy: containerGuid === undefined ? null : guidLabel(containerGuid),
          classification: classificationByGuid.get(guid) ?? null,
        });
      }
    }
  }

  /* Materialize property/quantity sets from the definitions walk. */
  const propertySets: IfcPropertySetRecord[] = [];
  const quantitySets: IfcQuantitySetRecord[] = [];
  for (const binding of defines) {
    const pset = psetsByRef.get(binding.relatingRef.slice(1));
    if (pset !== undefined) {
      const properties: IfcPropertyRecord[] = [];
      for (const propertyRef of pset.propertyRefs) {
        const single = singlesByRef.get(propertyRef.slice(1));
        if (single === undefined) {
          continue;
        }
        const nominal = single.nominal;
        if (typeof nominal === "string" || typeof nominal === "number" || typeof nominal === "boolean") {
          properties.push({ name: single.name, nominal, unit: null });
        }
      }
      for (const targetRef of binding.relatedRefs) {
        const targetGuid = guidByRef.get(targetRef.slice(1));
        if (targetGuid !== undefined) {
          propertySets.push({ name: pset.name, relates: guidLabel(targetGuid), properties });
        }
      }
    }
    const qset = qsetsByRef.get(binding.relatingRef.slice(1));
    if (qset !== undefined) {
      const quantities: IfcQuantityRecord[] = [];
      for (const quantityRef of qset.quantityRefs) {
        const quantity = quantitiesByRef.get(quantityRef.slice(1));
        if (quantity === undefined) {
          continue;
        }
        quantities.push({
          name: quantity.name,
          quantityKind: quantity.kind,
          value: quantity.value,
          unit: null, // filled by the shared assembly from DECLARED units
        });
      }
      for (const targetRef of binding.relatedRefs) {
        const targetGuid = guidByRef.get(targetRef.slice(1));
        if (targetGuid !== undefined) {
          quantitySets.push({ name: qset.name, relates: guidLabel(targetGuid), quantities });
        }
      }
    }
  }

  return { spatialNodes, elements, propertySets, quantitySets, relationships, omissions, schemaIdentifier };
}
