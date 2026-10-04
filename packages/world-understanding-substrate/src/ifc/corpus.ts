/**
 * WORLD-P0-B — the deterministic IFC corpus (`src/ifc/`).
 *
 * A REAL minimal IFC4 STEP physical file (ISO 10303-21), hand-authored
 * and committed as an in-repo fixture (the house discipline: no network,
 * no vendored third-party dataset). It carries exactly the semantic
 * content the interpretation contract speaks:
 *
 *  - the spatial containment hierarchy (project → site → building →
 *    storey) expressed with IFCRELAGGREGATES edges;
 *  - elements (a wall, a slab, a door, and the wall's opening element)
 *    contained in the storey via IFCRELCONTAINEDINSPATIALSTRUCTURE;
 *  - the wall voided by the opening via IFCRELVOIDSELEMENT;
 *  - a property set (Pset_WallCommon) mapped via
 *    IFCRELDEFINESBYPROPERTIES (booleans + a real measure);
 *  - base quantities (Qto_WallBaseQuantities: length/area/volume)
 *    mapped via IFCRELDEFINESBYPROPERTIES on the quantity side;
 *  - a classification association (OmniClass wall code) via
 *    IFCCLASSIFICATION / IFCCLASSIFICATIONREFERENCE /
 *    IFCRELASSOCIATESCLASSIFICATION;
 *  - the wall carries a product-definition-shape reference — the
 *    geometry-representation the doubles must record as a SKIPPED
 *    omission (geometry is the exact-geometry family's lane, not the
 *    semantic contract's);
 *  - uninterpreted entities (units, owner history, placements, contexts,
 *    shape representations) that the doubles must record as honest
 *    unsupported-entity-class OMISSIONS.
 *
 * The GUIDs are arbitrary shape-valid 22-character IFC base64 strings
 * (fixture data — they do not need to decode to real timestamps).
 *
 * IFC4 attribute orders followed (the doubles consume exactly these
 * positions; every entity's attribute count matches the IFC4 schema):
 *   - elements/spatial nodes: GlobalId=0, OwnerHistory=1, Name=2;
 *   - IFCRELAGGREGATES/CONTAINEDIN/VOIDS/DEFINESBYPROPERTIES/
 *     ASSOCIATESCLASSIFICATION: RelatedObjects=4, Related target=5
 *     (relating side of the edge);
 *   - IFCPROPERTYSET: Name=2, HasProperties=4;
 *   - IFCELEMENTQUANTITY: Name=2, MethodOfMeasurement=4, Units=5,
 *     Quantities=6;
 *   - IFCPROPERTYSINGLEVALUE: Name=0, NominalValue=2;
 *   - IFCQUANTITY{LENGTH,AREA,VOLUME}: Name=0, Unit=2, Value=3;
 *   - IFCCLASSIFICATIONREFERENCE: Identification=0.
 */

import { textDigestOf } from "../seam";
import type {
  IfcInterpretationRequest,
  IfcQuantityKind,
  IfcRelationshipKind,
  IfcSpatialRole,
} from "./contract";

/* ------------------------------------------------------------------ */
/* The fixture model                                                    */
/* ------------------------------------------------------------------ */

/**
 * The minimal IFC4 model. Statements are one per line in this fixture
 * for review clarity; the reference double's statement scanner handles
 * multi-line and whitespace variants (the alternate double's splitter
 * proves the same text parses through an independent code path).
 */
export const MINIMAL_IFC4_STEP_TEXT = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('AISE WORLD-P0-B minimal semantic IFC4 fixture'),'2;1');
FILE_NAME('minimal-semantic-model.ifc','2026-10-02T00:00:00',('worker-b'),('AISE'),
  'AISE world-understanding-substrate in-repo deterministic fixture','AISE','WORLD-P0-B');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0xScRe4drECQ4DMSqUjd6d',#2,'Minimal Project',$,$,$,$,(#3),#4);
#2=IFCOWNERHISTORY($,$,$,.ADDED.,$,$,$,0);
#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#5,$);
#4=IFCUNITASSIGNMENT((#6,#7,#8));
#5=IFCAXIS2PLACEMENT3D(#9,$,$);
#9=IFCCARTESIANPOINT((0.,0.,0.));
#6=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#7=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#8=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#10=IFCSITE('2YBbeV$z5DZAMc0nC4rd6d',#2,'Site Alpha',$,$,$,$,$,.ELEMENT.,(0,0,0,0),(0,0,0,0),0.,$,$);
#11=IFCBUILDING('2FC50d1t5EQBcVMletRjdx',#2,'Building A',$,$,$,$,$,.ELEMENT.,$,$,$);
#12=IFCBUILDINGSTOREY('0vSTM8sWbCCwxCMX1XCK2l',#2,'Ground Floor',$,$,$,$,$,.ELEMENT.,0.);
#13=IFCWALL('2FC50d1t5EQBcVMletRj35',#2,'Wall-001',$,$,#14,#18,$,.SOLIDWALL.);
#14=IFCLOCALPLACEMENT($,#5);
#15=IFCSLAB('0YvSMV0000000000000080',#2,'Slab-001',$,$,#14,$,$,.FLOOR.);
#16=IFCOPENINGELEMENT('3xScRe4drECQ4DMSqUjd6c',#2,'Opening-001',$,$,#14,$,$);
#17=IFCDOOR('3xScRe4drECQ4DMSqUjd6e',#2,'Door-001',$,$,#14,$,$,2.1,1.0,.DOOR.,$,$);
#18=IFCPRODUCTDEFINITIONSHAPE($,$,(#19));
#19=IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',());
#20=IFCRELAGGREGATES('1xScRe4drECQ4DMSqUjdA1',#2,$,$,#1,(#10));
#21=IFCRELAGGREGATES('1xScRe4drECQ4DMSqUjdA2',#2,$,$,#10,(#11));
#22=IFCRELAGGREGATES('1xScRe4drECQ4DMSqUjdA3',#2,$,$,#11,(#12));
#23=IFCRELCONTAINEDINSPATIALSTRUCTURE('1xScRe4drECQ4DMSqUjdB1',#2,$,$,(#13,#15,#16,#17),#12);
#24=IFCRELVOIDSELEMENT('1xScRe4drECQ4DMSqUjdC1',#2,$,$,#13,#16);
#30=IFCPROPERTYSET('1xScRe4drECQ4DMSqUjdD1',#2,'Pset_WallCommon',$,(#31,#32,#33));
#31=IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);
#32=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.F.),$);
#33=IFCPROPERTYSINGLEVALUE('ThermalTransmittance',$,IFCREAL(0.35),$);
#34=IFCRELDEFINESBYPROPERTIES('1xScRe4drECQ4DMSqUjdD2',#2,$,$,(#13),#30);
#35=IFCELEMENTQUANTITY('1xScRe4drECQ4DMSqUjdE1',#2,'Qto_WallBaseQuantities',$,'Baseline rule',$,(#36,#37,#38));
#36=IFCQUANTITYLENGTH('NetLength',$,$,6.);
#37=IFCQUANTITYAREA('NetArea',$,$,12.5);
#38=IFCQUANTITYVOLUME('NetVolume',$,$,2.875);
#39=IFCRELDEFINESBYPROPERTIES('1xScRe4drECQ4DMSqUjdE2',#2,$,$,(#13),#35);
#40=IFCCLASSIFICATION($,$,$,'OmniClass','AISE fixture classification table','https://www.csiresources.org/standards/omniclass',$);
#41=IFCCLASSIFICATIONREFERENCE('23.27.10.11.11.24.11','Walls',$,#40,$);
#42=IFCRELASSOCIATESCLASSIFICATION('1xScRe4drECQ4DMSqUjdF1',#2,$,$,(#13),#41);
ENDSEC;
END-ISO-10303-21;
`;

/** The declared evidence content id of the registered fixture model. */
export const MINIMAL_IFC4_EVIDENCE_CONTENT_ID = textDigestOf(
  "AISE-WORLD-P0-B-ifc-fixture-evidence-binding",
);

/** The declared units the AISE side maps this model's values into. */
export const MINIMAL_IFC4_MODEL_UNITS = { linear: "m", angular: "rad" } as const;

/** The declared recording instant (deterministic — no clock reads). */
export const MINIMAL_IFC4_RECORDED_AT = "2026-10-02T00:00:00.000Z" as const;

/* ------------------------------------------------------------------ */
/* The requests                                                         */
/* ------------------------------------------------------------------ */

function baseRequest(): IfcInterpretationRequest {
  return {
    kind: "ifc-interpretation-request",
    schemaVersion: "ifc-interpretation-request/1",
    model: {
      stepText: MINIMAL_IFC4_STEP_TEXT,
      mediaType: "application/ifc",
      fileName: "minimal-semantic-model.ifc",
    },
    schemaIntent: "IFC4",
    intents: {
      spatialContainment: true,
      elementProperties: true,
      quantities: true,
      relationships: true,
      classification: true,
    },
    evidenceContentId: MINIMAL_IFC4_EVIDENCE_CONTENT_ID,
    modelUnits: MINIMAL_IFC4_MODEL_UNITS,
    recordedAt: MINIMAL_IFC4_RECORDED_AT,
  };
}

/** The full-intents request over the minimal model. */
export const FULL_INTENTS_REQUEST: IfcInterpretationRequest = baseRequest();

/** Spatial containment only (every other intent off). */
export const SPATIAL_ONLY_REQUEST: IfcInterpretationRequest = {
  ...baseRequest(),
  intents: {
    spatialContainment: true,
    elementProperties: false,
    quantities: false,
    relationships: false,
    classification: false,
  },
};

/** No intents at all — every extraction array must come back empty. */
export const NO_INTENTS_REQUEST: IfcInterpretationRequest = {
  ...baseRequest(),
  intents: {
    spatialContainment: false,
    elementProperties: false,
    quantities: false,
    relationships: false,
    classification: false,
  },
};

/** A schema-intent mismatch request (asks IFC2X3 of an IFC4 file). */
export const INTENT_MISMATCH_REQUEST: IfcInterpretationRequest = {
  ...baseRequest(),
  schemaIntent: "IFC2X3",
};

/** Not STEP text at all — for the malformed-input refusal path. */
export const NOT_STEP_REQUEST: IfcInterpretationRequest = {
  ...baseRequest(),
  model: {
    ...baseRequest().model,
    stepText: "this is not a STEP file",
  },
};

/* ------------------------------------------------------------------ */
/* The expected semantic facts (drilled by tests, hand-derived)         */
/* ------------------------------------------------------------------ */

/** The spatial containment tree, in STEP statement order. */
export const EXPECTED_SPATIAL_TREE: readonly {
  readonly role: IfcSpatialRole;
  readonly guid: string;
  readonly name: string | null;
  readonly containedBy: string | null;
}[] = [
  { role: "project", guid: "0xScRe4drECQ4DMSqUjd6d", name: "Minimal Project", containedBy: null },
  { role: "site", guid: "2YBbeV$z5DZAMc0nC4rd6d", name: "Site Alpha", containedBy: "0xScRe4drECQ4DMSqUjd6d" },
  { role: "building", guid: "2FC50d1t5EQBcVMletRjdx", name: "Building A", containedBy: "2YBbeV$z5DZAMc0nC4rd6d" },
  { role: "storey", guid: "0vSTM8sWbCCwxCMX1XCK2l", name: "Ground Floor", containedBy: "2FC50d1t5EQBcVMletRjdx" },
];

/** The elements, in STEP statement order. */
export const EXPECTED_ELEMENTS: readonly {
  readonly ifcClass: string;
  readonly guid: string;
  readonly name: string;
  readonly containedBy: string;
}[] = [
  { ifcClass: "IFCWALL", guid: "2FC50d1t5EQBcVMletRj35", name: "Wall-001", containedBy: "0vSTM8sWbCCwxCMX1XCK2l" },
  { ifcClass: "IFCSLAB", guid: "0YvSMV0000000000000080", name: "Slab-001", containedBy: "0vSTM8sWbCCwxCMX1XCK2l" },
  { ifcClass: "IFCOPENINGELEMENT", guid: "3xScRe4drECQ4DMSqUjd6c", name: "Opening-001", containedBy: "0vSTM8sWbCCwxCMX1XCK2l" },
  { ifcClass: "IFCDOOR", guid: "3xScRe4drECQ4DMSqUjd6e", name: "Door-001", containedBy: "0vSTM8sWbCCwxCMX1XCK2l" },
];

/** The wall's classification code (OmniClass 23 wall). */
export const EXPECTED_WALL_CLASSIFICATION = "23.27.10.11.11.24.11";

/** The wall's Pset_WallCommon values (name → nominal). */
export const EXPECTED_WALL_PROPERTIES: readonly {
  readonly name: string;
  readonly nominal: string | number | boolean;
}[] = [
  { name: "IsExternal", nominal: true },
  { name: "LoadBearing", nominal: false },
  { name: "ThermalTransmittance", nominal: 0.35 },
];

/** The wall's base quantities (name → value; units from the IFCSIUNIT table). */
export const EXPECTED_WALL_QUANTITIES: readonly {
  readonly name: string;
  readonly quantityKind: IfcQuantityKind;
  readonly value: number;
  readonly unit: string | null;
}[] = [
  { name: "NetLength", quantityKind: "length", value: 6, unit: "m" },
  { name: "NetArea", quantityKind: "area", value: 12.5, unit: "m2" },
  { name: "NetVolume", quantityKind: "volume", value: 2.875, unit: "m3" },
];

/** The relationship edge count by kind. */
export const EXPECTED_RELATIONSHIP_COUNTS: readonly {
  readonly kind: IfcRelationshipKind;
  readonly count: number;
}[] = [
  { kind: "aggregation", count: 3 },
  { kind: "containment", count: 1 },
  { kind: "voiding", count: 1 },
  { kind: "property-definition", count: 2 },
  { kind: "classification", count: 1 },
];

/**
 * Entity classes the doubles do NOT interpret (recorded as
 * unsupported-entity-class omissions), in STEP statement order.
 */
export const EXPECTED_OMITTED_CLASSES: readonly string[] = [
  "IFCOWNERHISTORY",
  "IFCGEOMETRICREPRESENTATIONCONTEXT",
  "IFCUNITASSIGNMENT",
  "IFCAXIS2PLACEMENT3D",
  "IFCCARTESIANPOINT",
  "IFCSIUNIT",
  "IFCLOCALPLACEMENT",
  "IFCPRODUCTDEFINITIONSHAPE",
  "IFCSHAPEREPRESENTATION",
  "IFCCLASSIFICATION",
  "IFCCLASSIFICATIONREFERENCE",
];

/**
 * Entities whose GEOMETRY representation the doubles skip (the wall is
 * the only element carrying a product-definition-shape reference).
 */
export const EXPECTED_SKIPPED_REPRESENTATION_COUNT = 1;

/** The fixture's FILE_SCHEMA identifier. */
export const EXPECTED_SCHEMA_IDENTIFIER = "IFC4";
