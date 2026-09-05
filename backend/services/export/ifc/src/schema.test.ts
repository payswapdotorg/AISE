/**
 * IFC4X3 subset conformance validator tests (AISE-018 — the
 * `schema-valid` acceptance core).
 *
 * Every validation dimension of `validateIfcSpf` is pinned both
 * ways: a canonical file passes, and each tampering that breaks
 * syntax, entity signature, referential integrity, GUID
 * discipline, unit discipline, header structure, or the canonical
 * id sequence fails with a specific error. This is the test
 * suite the mutation harness relies on (M-validations).
 */
import { describe, expect, it } from "vitest";
import { validateIfcSpf, IFC4X3_SCHEMA_NAME, IFC4X3_ENTITY_SIGNATURES } from "./schema.js";
import { SpfWriter, UNSET, DERIVED, en, list, real, ref, str } from "./spf.js";
import { ifcGuidOf } from "./guid.js";

/** Builds a small, fully valid canonical file to tamper with. */
function validFile(): string {
  const writer = new SpfWriter();
  writer.add("IFCPERSON", [str("AISE"), UNSET, UNSET, UNSET, UNSET, UNSET, UNSET, UNSET]);
  writer.add("IFCORGANIZATION", [UNSET, str("AISE"), UNSET, UNSET, UNSET]);
  writer.add("IFCUNITASSIGNMENT", [list([ref(4)])]);
  writer.add("IFCSIUNIT", [DERIVED, en("LENGTHUNIT"), UNSET, en("METRE")]);
  writer.add("IFCCARTESIANPOINT", [list([real(0), real(0), real(0)])]);
  writer.add("IFCDIRECTION", [list([real(0), real(0), real(1)])]);
  return writer.toFile([
    "FILE_DESCRIPTION(('AISE IFC 4.3 export - deterministic, evidence-aware'),'2;1');",
    "FILE_NAME('m.ifc','1970-01-01T00:00:00Z',('AISE'),('AISE'),'AISE Export IFC 1.0.0','aise','AISE');",
    `FILE_SCHEMA(('${IFC4X3_SCHEMA_NAME}'));`,
  ]);
}

describe("validateIfcSpf — acceptance", () => {
  it("accepts a canonical, well-formed file and reports its entities", () => {
    const result = validateIfcSpf(validFile());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.schema).toBe("IFC4X3_ADD2");
      expect(result.entityCount).toBe(6);
      expect(result.entities.map((entity) => entity.name)).toEqual([
        "IFCPERSON",
        "IFCORGANIZATION",
        "IFCUNITASSIGNMENT",
        "IFCSIUNIT",
        "IFCCARTESIANPOINT",
        "IFCDIRECTION",
      ]);
    }
  });

  it("the signature table declares the exact emitted subset with IFC4X3 attribute counts", () => {
    expect(IFC4X3_ENTITY_SIGNATURES["IFCPROJECT"]).toHaveLength(9);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCSITE"]).toHaveLength(10);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCBUILDING"]).toHaveLength(11);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCSTOREY"]).toHaveLength(9);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCSPACE"]).toHaveLength(9);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCWALL"]).toHaveLength(9);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCSLAB"]).toHaveLength(9);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCCOVERING"]).toHaveLength(9);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCOPENINGELEMENT"]).toHaveLength(8);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCDOOR"]).toHaveLength(11);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCWINDOW"]).toHaveLength(11);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCRELAGGREGATES"]).toHaveLength(6);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCRELCONTAINEDINSPATIALSTRUCTURE"]).toHaveLength(6);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCRELVOIDSELEMENT"]).toHaveLength(6);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCRELFILLSELEMENT"]).toHaveLength(6);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCRELDEFINESBYPROPERTIES"]).toHaveLength(6);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCPROPERTYSET"]).toHaveLength(5);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCPROPERTYSINGLEVALUE"]).toHaveLength(4);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCELEMENTQUANTITY"]).toHaveLength(6);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCQUANTITYLENGTH"]).toHaveLength(5);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCQUANTITYAREA"]).toHaveLength(5);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCOWNERHISTORY"]).toHaveLength(7);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCSIUNIT"]).toHaveLength(4);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCAXIS2PLACEMENT3D"]).toHaveLength(3);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCLOCALPLACEMENT"]).toHaveLength(2);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCGEOMETRICREPRESENTATIONCONTEXT"]).toHaveLength(6);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCSHAPEREPRESENTATION"]).toHaveLength(4);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCPOLYLINE"]).toHaveLength(1);
    expect(IFC4X3_ENTITY_SIGNATURES["IFCGEOMETRICCURVESET"]).toHaveLength(1);
  });
});

describe("validateIfcSpf — structural rejections", () => {
  const file = validFile();

  it("rejects the empty file", () => {
    const result = validateIfcSpf("");
    expect(result.ok).toBe(false);
  });

  it("rejects a missing ISO wrapper", () => {
    const result = validateIfcSpf(file.replace("ISO-10303-21;\n", ""));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.startsWith("syntax:"))).toBe(true);
    }
  });

  it("rejects missing ENDSEC / trailing garbage", () => {
    const truncated = validateIfcSpf(file.replace("ENDSEC;\nEND-ISO-10303-21;\n", ""));
    expect(truncated.ok).toBe(false);
    const trailing = validateIfcSpf(`${file}#99=IFCPERSON($,$,$,$,$,$,$,$);`);
    expect(trailing.ok).toBe(false);
  });

  it("rejects a missing header entity", () => {
    const result = validateIfcSpf(file.replace("FILE_NAME('m.ifc','1970-01-01T00:00:00Z',('AISE'),('AISE'),'AISE Export IFC 1.0.0','aise','AISE');\n", ""));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("FILE_NAME"))).toBe(true);
    }
  });

  it("rejects a FILE_NAME with the wrong arity", () => {
    const result = validateIfcSpf(
      file.replace("'1970-01-01T00:00:00Z',('AISE')", "'1970-01-01T00:00:00Z'"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("FILE_NAME must carry 7"))).toBe(true);
    }
  });

  it("rejects a foreign schema declaration", () => {
    const result = validateIfcSpf(file.replace("IFC4X3_ADD2", "IFC2X3"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("FILE_SCHEMA"))).toBe(true);
    }
  });
});

describe("validateIfcSpf — entity-level rejections", () => {
  const file = validFile();

  it("rejects a wrong attribute count (arity drift)", () => {
    const result = validateIfcSpf(file.replace("#1=IFCPERSON('AISE',$,$,$,$,$,$,$);", "#1=IFCPERSON('AISE',$,$,$,$);"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("IFCPERSON #1 must carry 8"))).toBe(true);
    }
  });

  it("rejects entities outside the emitted subset vocabulary", () => {
    const result = validateIfcSpf(
      file.replace("#1=IFCPERSON('AISE',$,$,$,$,$,$,$);", "#1=IFCBUILDINGELEMENTPROXY('x',$,$,$,$,$,$,$);"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("outside the emitted IFC4X3 subset"))).toBe(true);
    }
  });

  it("rejects a dangling entity reference", () => {
    const result = validateIfcSpf(file.replace("(#4)", "(#44)"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("references undefined entity #44"))).toBe(true);
    }
  });

  it("rejects a duplicate entity id", () => {
    const result = validateIfcSpf(
      file.replace("#5=IFCCARTESIANPOINT", "#4=IFCCARTESIANPOINT"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("duplicate entity id"))).toBe(true);
    }
  });

  it("rejects a non-canonical id sequence (gap)", () => {
    const result = validateIfcSpf(file.replace("#5=IFCCARTESIANPOINT", "#7=IFCCARTESIANPOINT"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("not the canonical sequence"))).toBe(true);
    }
  });

  it("rejects a required attribute written as unset", () => {
    const result = validateIfcSpf(file.replace("#2=IFCORGANIZATION($,'AISE',$,$,$);", "#2=IFCORGANIZATION($,$,$,$,$);"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("attribute 2 is required"))).toBe(true);
    }
  });

  it("rejects a malformed guid (wrong length and bad head)", () => {
    const tampered = file.replace(
      "#1=IFCPERSON('AISE'",
      `#1=IFCPERSON('${ifcGuidOf("seed").slice(0, 21)}`,
    );
    const result = validateIfcSpf(tampered);
    expect(result.ok).toBe(false);
  });

  it("rejects an out-of-vocabulary enumeration in a string attribute position", () => {
    const result = validateIfcSpf(
      file.replace("#5=IFCCARTESIANPOINT((0.,0.,0.));", "#5=IFCCARTESIANPOINT((0.,0.,.X.));"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("list of finite reals"))).toBe(true);
    }
  });

  it("rejects a non-finite real literal", () => {
    const result = validateIfcSpf(
      file.replace("#5=IFCCARTESIANPOINT((0.,0.,0.));", "#5=IFCCARTESIANPOINT((0.,0.,1e999));"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("list of finite reals"))).toBe(true);
    }
  });

  it("rejects an unsupported SI unit token", () => {
    const result = validateIfcSpf(file.replace(".LENGTHUNIT.", ".MASSUNIT."));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("unsupported unit type"))).toBe(true);
    }
    const result2 = validateIfcSpf(file.replace(".METRE.", ".KILOGRAM."));
    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.errors.some((error) => error.includes("unsupported unit name"))).toBe(true);
    }
  });

  it("rejects an SI unit prefix where the exporter declares none", () => {
    const result = validateIfcSpf(
      file.replace("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)", "IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("must not carry a prefix"))).toBe(true);
    }
  });

  it("rejects a list below the declared minimum cardinality", () => {
    const result = validateIfcSpf(file.replace("#6=IFCDIRECTION((0.,0.,1.));", "#6=IFCDIRECTION((1.));"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("at least 2"))).toBe(true);
    }
  });

  it("rejects a non-printable-ASCII string (parity with the writer)", () => {
    const result = validateIfcSpf(file.replace("'AISE'", "'AISÉ'"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("printable ASCII"))).toBe(true);
    }
  });
});

describe("validateIfcSpf — GUID uniqueness", () => {
  it("rejects duplicate IfcGloballyUniqueId values across entities", () => {
    const guid = ifcGuidOf("dup");
    const writer = new SpfWriter();
    writer.add("IFCPROPERTYSET", [str(guid), UNSET, str("A"), UNSET, list([ref(3)])]);
    writer.add("IFCPROPERTYSET", [str(guid), UNSET, str("B"), UNSET, list([ref(3)])]);
    writer.add("IFCPROPERTYSINGLEVALUE", [str("x"), UNSET, str("y"), UNSET]);
    const file = writer.toFile([
      "FILE_DESCRIPTION(('x'),'2;1');",
      "FILE_NAME('m.ifc','1970-01-01T00:00:00Z',('A'),('A'),'A','B','C');",
      `FILE_SCHEMA(('${IFC4X3_SCHEMA_NAME}'));`,
    ]);
    const result = validateIfcSpf(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("duplicate IfcGloballyUniqueId"))).toBe(true);
    }
  });

  it("accepts the same file with distinct GUIDs", () => {
    const writer = new SpfWriter();
    writer.add("IFCPROPERTYSET", [str(ifcGuidOf("a")), UNSET, str("A"), UNSET, list([ref(3)])]);
    writer.add("IFCPROPERTYSET", [str(ifcGuidOf("b")), UNSET, str("B"), UNSET, list([ref(3)])]);
    writer.add("IFCPROPERTYSINGLEVALUE", [str("x"), UNSET, str("y"), UNSET]);
    const file = writer.toFile([
      "FILE_DESCRIPTION(('x'),'2;1');",
      "FILE_NAME('m.ifc','1970-01-01T00:00:00Z',('A'),('A'),'A','B','C');",
      `FILE_SCHEMA(('${IFC4X3_SCHEMA_NAME}'));`,
    ]);
    const result = validateIfcSpf(file);
    if (!result.ok) {
      throw new Error(`expected valid: ${result.errors.join("; ")}`);
    }
    expect(result.entityCount).toBe(3);
  });
});
