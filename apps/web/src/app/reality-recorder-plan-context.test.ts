/**
 * ANCHOR-003a — the plan-context seam's pure-logic tests (deterministic:
 * no network, no clock — `recordedAt` is injected; every defect is
 * asserted BY NAME, the create-forms discipline).
 *
 * What is pinned here:
 *  - the carried typed shape IS the anchoring contract's own: the closed
 *    plan-context kind vocabulary is reused verbatim (no second-enum
 *    drift), and every built/rebuilt record is validated by the
 *    CONTRACT'S OWN planContextSchema;
 *  - the rasterToScene HANDEDNESS convention ROUND-TRIPS: draft → the
 *    contract-validated record → the annotation change record → the
 *    typed reader → the identical record (scale, world origin and the
 *    east-right/north-up literals survive losslessly in both directions);
 *  - the negatives FAIL CLOSED with the kind/digest/media type NAMED and
 *    ZERO side effects (pure functions — nothing to coerce, nothing to
 *    write): an unknown plan-context kind is refused with the kind named;
 *    a wrong digest is refused; non-image content is refused by name;
 *    wrong-handedness declarations are refused by name;
 *  - the plan-raster list filter reads the register honestly (invalidated
 *    excluded; image + DOCUMENT_REGION only; captions from the record's
 *    own fields);
 *  - the annotation change record is the governed wire shape exactly:
 *    the stable node id, kind annotation, PROPOSED, ten typed properties
 *    (numbers with their typed units, strings unitless) and the SUPPORTS
 *    evidence + DERIVED_FROM note provenance.
 */

import { describe, expect, test } from "bun:test";
import {
  PLAN_CONTEXT_ANNOTATION_NODE_ID,
  PLAN_CONTEXT_KIND_OPTIONS,
  PLAN_CONTEXT_PROPERTY_KEYS,
  PLAN_IMPORT_ACQUISITION_METHOD,
  PLAN_RASTER_PX_UNIT,
  PLAN_RASTER_SCALE_UNIT,
  activePlanContextChangeRecord,
  activePlanContextOfVersion,
  planBytesPath,
  planContextOfAnnotationNode,
  planContextRecord,
  planImageUploadDefect,
  planRasterOptionsFromLive,
  validatePlanImportDraft,
  type AnnotationNodeLike,
  type PlanImportDraft,
  type PlanRasterSourceItem,
} from "./reality-recorder";
// The contract's own modules (never the barrel index — see the note in
// reality-recorder.ts: the barrel re-exports the supervised runner).
import { PLAN_CONTEXT_KINDS } from "../../../../packages/anchoring-contract/src/vocabularies";
import { planContextSchema } from "../../../../packages/anchoring-contract/src/request";

const PLAN_BYTES = "a1".repeat(32); // 64-hex sha-256 content address
const AT = "2026-09-30T14:00:00.000Z";

/** A minimal VALID declaration draft (the upload's own record prefilled). */
function validDraft(): PlanImportDraft {
  return {
    kind: "plan-raster",
    planId: "plan-riverside-ground-floor",
    imageContentId: PLAN_BYTES,
    imageMediaType: "image/png",
    bytesPath: planBytesPath(PLAN_BYTES),
    pixelsPerMeter: "200",
    worldOriginX: "1280",
    worldOriginY: "720",
    xDirection: "east-right",
    yDirection: "north-up",
  };
}

/** One register item fixture (record fields only). */
function registerItem(
  overrides: Partial<PlanRasterSourceItem["evidence"]> & { invalidation?: PlanRasterSourceItem["invalidation"] },
): PlanRasterSourceItem {
  return {
    evidence: {
      contentId: PLAN_BYTES,
      acquisitionMethod: "DOCUMENT_REGION",
      mediaType: "image/png",
      byteSize: 2048,
      capturedAt: "2026-09-30T13:00:00.000Z",
      ...overrides,
    },
    invalidation: overrides.invalidation ?? null,
  };
}

describe("ANCHOR-003a the carried typed shape IS the contract's own (pinned)", () => {
  test("the plan-context kind vocabulary is reused verbatim from the anchoring contract", () => {
    expect(PLAN_CONTEXT_KIND_OPTIONS).toBe(PLAN_CONTEXT_KINDS);
    expect([...PLAN_CONTEXT_KINDS]).toEqual(["plan-raster"]);
  });

  test("the active plan context rides ONE stable annotation node id", () => {
    expect(PLAN_CONTEXT_ANNOTATION_NODE_ID).toBe("active-plan-context");
  });

  test("the annotation's property keys are the closed ten-key list", () => {
    expect([...PLAN_CONTEXT_PROPERTY_KEYS]).toEqual([
      "plan.kind",
      "plan.planId",
      "plan.contentId",
      "plan.mediaType",
      "plan.bytesPath",
      "raster.pixelsPerMeter",
      "raster.xDirection",
      "raster.yDirection",
      "raster.worldOriginPx.x",
      "raster.worldOriginPx.y",
    ]);
  });

  test("the plan lane's honest acquisition method is DOCUMENT_REGION", () => {
    expect(PLAN_IMPORT_ACQUISITION_METHOD).toBe("DOCUMENT_REGION");
  });

  test("the bytes path is the content-addressed store's own addressing convention", () => {
    expect(planBytesPath(PLAN_BYTES)).toBe(`/v1/capture/assets/${PLAN_BYTES}`);
  });
});

describe("ANCHOR-003a the plan-raster list reads the register honestly", () => {
  test("an uninvalidated image document is listed with a caption from its own fields", () => {
    const options = planRasterOptionsFromLive([registerItem({})]);
    expect(options.length).toBe(1);
    expect(options[0]!.contentId).toBe(PLAN_BYTES);
    expect(options[0]!.mediaType).toBe("image/png");
    expect(options[0]!.caption).toBe(
      "DOCUMENT_REGION · image/png · 2048 bytes · 2026-09-30T13:00:00.000Z",
    );
  });

  test("invalidated records are excluded (never offered for a new activation)", () => {
    const options = planRasterOptionsFromLive([
      registerItem({ invalidation: { reason: "superseded", invalidatedAt: AT } }),
    ]);
    expect(options.length).toBe(0);
  });

  test("non-image documents are excluded by name of what they are", () => {
    const options = planRasterOptionsFromLive([registerItem({ mediaType: "application/pdf" })]);
    expect(options.length).toBe(0);
  });

  test("photo registrations (STILL_IMAGERY) are excluded — the plan lane is drawings only", () => {
    const options = planRasterOptionsFromLive([registerItem({ acquisitionMethod: "STILL_IMAGERY" })]);
    expect(options.length).toBe(0);
  });
});

describe("ANCHOR-003a the pre-upload gate (fail closed BEFORE side effects)", () => {
  test("an image media type passes the gate (null — no defect)", () => {
    expect(planImageUploadDefect("image/png")).toBeNull();
    expect(planImageUploadDefect("image/jpeg")).toBeNull();
  });

  test("a NON-IMAGE media type is refused BY NAME before any upload", () => {
    const defect = planImageUploadDefect("application/pdf");
    expect(defect).not.toBeNull();
    expect(defect!).toContain("the plan lane imports raster images only");
    expect(defect!).toContain('"application/pdf"');
    expect(defect!).toContain("zero side effects");
  });

  test("an empty media type (unknown content) is refused by name too", () => {
    const defect = planImageUploadDefect("application/octet-stream");
    expect(defect).not.toBeNull();
    expect(defect!).toContain('"application/octet-stream"');
  });
});

describe("ANCHOR-003a validatePlanImportDraft (every defect NAMED)", () => {
  test("the minimal valid draft produces zero defects", () => {
    expect(validatePlanImportDraft(validDraft())).toEqual([]);
  });

  test("an UNKNOWN plan-context kind is refused WITH THE KIND NAMED", () => {
    const defects = validatePlanImportDraft({ ...validDraft(), kind: "plan-cad" });
    expect(
      defects.some(
        (defect) =>
          defect.includes('plan-context kind "plan-cad" is not in the closed plan-context vocabulary') &&
          defect.includes("plan-raster"),
      ),
    ).toBe(true);
  });

  test("a WRONG DIGEST is refused by name (not 64-hex)", () => {
    const defects = validatePlanImportDraft({ ...validDraft(), imageContentId: "not-a-digest" });
    expect(
      defects.some((defect) => defect.includes("must be a 64-hex sha-256 content address")),
    ).toBe(true);
  });

  test("an uppercase digest is refused (lowercase hex is the contract's own rule)", () => {
    const defects = validatePlanImportDraft({ ...validDraft(), imageContentId: "A1".repeat(32) });
    expect(defects.some((defect) => defect.includes("64-hex"))).toBe(true);
  });

  test("NON-IMAGE content is refused with the media type named", () => {
    const defects = validatePlanImportDraft({ ...validDraft(), imageMediaType: "application/pdf" });
    expect(
      defects.some(
        (defect) =>
          defect.includes('media type "application/pdf" is not an image media type') &&
          defect.includes("raster images only"),
      ),
    ).toBe(true);
  });

  test("a wrong-handedness declaration is refused BY NAME on both axes", () => {
    const xDefects = validatePlanImportDraft({ ...validDraft(), xDirection: "west-left" });
    expect(
      xDefects.some(
        (defect) =>
          defect.includes('raster x direction "west-left" is not the closed literal "east-right"') &&
          defect.includes("handedness law"),
      ),
    ).toBe(true);
    const yDefects = validatePlanImportDraft({ ...validDraft(), yDirection: "south-down" });
    expect(
      yDefects.some(
        (defect) =>
          defect.includes('raster y direction "south-down" is not the closed literal "north-up"') &&
          defect.includes("handedness law"),
      ),
    ).toBe(true);
  });

  test("a non-positive or non-numeric raster scale is refused by name", () => {
    for (const bad of ["0", "-5", "abc", ""]) {
      const defects = validatePlanImportDraft({ ...validDraft(), pixelsPerMeter: bad });
      expect(defects.some((defect) => defect.includes("pixels per meter must be a finite positive number"))).toBe(
        true,
      );
    }
  });

  test("a non-numeric world origin component is refused by name", () => {
    const defects = validatePlanImportDraft({ ...validDraft(), worldOriginX: "center" });
    expect(defects.some((defect) => defect.includes("world origin x must be a finite number"))).toBe(true);
  });

  test("an empty plan id and an empty bytes path are refused by name", () => {
    const defects = validatePlanImportDraft({ ...validDraft(), planId: "  ", bytesPath: "" });
    expect(defects.some((defect) => defect.includes("plan id must be 1..256 characters"))).toBe(true);
    expect(defects.some((defect) => defect.includes("plan bytes path must be 1..256 characters"))).toBe(true);
  });
});

describe("ANCHOR-003a planContextRecord (the contract-validated declaration)", () => {
  test("a valid draft maps to the contract's PlanContext and passes the CONTRACT'S OWN schema", () => {
    const result = planContextRecord(validDraft());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.kind).toBe("plan-raster");
    expect(result.record.planId).toBe("plan-riverside-ground-floor");
    expect(result.record.imageContentId).toBe(PLAN_BYTES);
    expect(result.record.imageMediaType).toBe("image/png");
    expect(result.record.bytesPath).toBe(`/v1/capture/assets/${PLAN_BYTES}`);
    expect(result.record.rasterToScene).toEqual({
      pixelsPerMeter: 200,
      xDirection: "east-right",
      yDirection: "north-up",
      worldOriginPx: [1280, 720],
    });
    // The contract's own schema accepts it verbatim (the typed shape is
    // carried from the contract — never reinvented here).
    expect(planContextSchema.safeParse(result.record).success).toBe(true);
  });

  test("a defective draft refuses the mapping (ok:false with the SAME named defects)", () => {
    const result = planContextRecord({ ...validDraft(), kind: "plan-sketch", imageContentId: "zz" });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.defects.some((defect) => defect.includes('plan-context kind "plan-sketch"'))).toBe(true);
    expect(result.defects.some((defect) => defect.includes("64-hex"))).toBe(true);
  });
});

describe("ANCHOR-003a activePlanContextChangeRecord (the governed wire shape)", () => {
  test("the annotation upsert carries the stable id, kind annotation, PROPOSED, ten typed properties and stamped provenance", () => {
    const record = planContextRecord(validDraft());
    expect(record.ok).toBe(true);
    if (!record.ok) {
      return;
    }
    const change = activePlanContextChangeRecord(record.record, AT);
    expect(change.op).toBe("upsert-node");
    expect(change.node.nodeId).toBe(PLAN_CONTEXT_ANNOTATION_NODE_ID);
    expect(change.node.kind).toBe("annotation");
    expect(change.node.epistemicStatus).toBe("PROPOSED");
    expect(change.node.properties.length).toBe(10);
    const byKey = new Map(change.node.properties.map((property) => [property.key, property]));
    expect(byKey.get("plan.kind")!.value).toBe("plan-raster");
    expect(byKey.get("plan.contentId")!.value).toBe(PLAN_BYTES);
    const scale = byKey.get("raster.pixelsPerMeter")!;
    expect(scale.value).toBe(200);
    expect(scale.unit).toBe(PLAN_RASTER_SCALE_UNIT);
    const originX = byKey.get("raster.worldOriginPx.x")!;
    expect(originX.value).toBe(1280);
    expect(originX.unit).toBe(PLAN_RASTER_PX_UNIT);
    // Strings carry NO unit (the engine's own rule: units are for numbers only).
    for (const key of ["plan.kind", "plan.planId", "plan.contentId", "plan.mediaType", "plan.bytesPath", "raster.xDirection", "raster.yDirection"]) {
      expect(byKey.get(key)!.unit).toBeUndefined();
    }
    // The provenance: one SUPPORTS record naming the plan raster's evidence
    // id + one DERIVED_FROM note; stamped onto the node AND every property.
    const expectedProvenance = [
      { role: "SUPPORTS", evidenceId: PLAN_BYTES, recordedAt: AT },
      {
        role: "DERIVED_FROM",
        derivationNote: expect.stringContaining("ANCHOR-003a plan-context declaration"),
        recordedAt: AT,
      },
    ];
    expect(change.node.provenance).toEqual(expectedProvenance);
    expect(byKey.get("plan.kind")!.provenance).toEqual(expectedProvenance);
  });
});

describe("ANCHOR-003a the typed reader (planContextOfAnnotationNode) — the read seam", () => {
  function annotationFromDraft(): AnnotationNodeLike {
    const record = planContextRecord(validDraft());
    expect(record.ok).toBe(true);
    if (!record.ok) {
      throw new Error("fixture draft must be valid");
    }
    const change = activePlanContextChangeRecord(record.record, AT);
    return change.node;
  }

  test("THE HANDEDNESS CONVENTION ROUND-TRIPS: record → annotation → reader → the identical record", () => {
    const record = planContextRecord(validDraft());
    expect(record.ok).toBe(true);
    if (!record.ok) {
      return;
    }
    const change = activePlanContextChangeRecord(record.record, AT);
    const read = planContextOfAnnotationNode(change.node);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(read.record).toEqual(record.record);
    expect(read.record.rasterToScene).toEqual(record.record.rasterToScene);
    // And the rebuilt record still passes the contract's own schema.
    expect(planContextSchema.safeParse(read.record).success).toBe(true);
  });

  test("a NON-ANNOTATION node is refused with the node and kind named", () => {
    const annotation = annotationFromDraft();
    const read = planContextOfAnnotationNode({ ...annotation, kind: "element" });
    expect(read.ok).toBe(false);
    if (read.ok) {
      return;
    }
    expect(
      read.defects.some(
        (defect) =>
          defect.includes(`node "active-plan-context" is not an annotation node`) &&
          defect.includes('kind "element"'),
      ),
    ).toBe(true);
  });

  test("a missing property is refused with the property key named", () => {
    const annotation = annotationFromDraft();
    const read = planContextOfAnnotationNode({
      ...annotation,
      properties: annotation.properties.filter((property) => property.key !== "plan.bytesPath"),
    });
    expect(read.ok).toBe(false);
    if (read.ok) {
      return;
    }
    expect(read.defects.some((defect) => defect.includes('missing the required property "plan.bytesPath"'))).toBe(
      true,
    );
  });

  test("an UNKNOWN plan-context kind on the wire is refused WITH THE KIND NAMED", () => {
    const annotation = annotationFromDraft();
    const read = planContextOfAnnotationNode({
      ...annotation,
      properties: annotation.properties.map((property) =>
        property.key === "plan.kind" ? { ...property, value: "plan-cad" } : property,
      ),
    });
    expect(read.ok).toBe(false);
    if (read.ok) {
      return;
    }
    expect(
      read.defects.some(
        (defect) =>
          defect.includes('plan-context kind "plan-cad" is not in the closed plan-context vocabulary') &&
          defect.includes("plan-raster"),
      ),
    ).toBe(true);
  });

  test("a WRONG DIGEST on the wire is refused with the found value named", () => {
    const annotation = annotationFromDraft();
    const read = planContextOfAnnotationNode({
      ...annotation,
      properties: annotation.properties.map((property) =>
        property.key === "plan.contentId" ? { ...property, value: "deadbeef" } : property,
      ),
    });
    expect(read.ok).toBe(false);
    if (read.ok) {
      return;
    }
    expect(read.defects.some((defect) => defect.includes("not a 64-hex sha-256 content address"))).toBe(true);
    expect(read.defects.some((defect) => defect.includes('"deadbeef"'))).toBe(true);
  });

  test("a WRONG-HANDEDNESS annotation is refused with the literal named", () => {
    const annotation = annotationFromDraft();
    const read = planContextOfAnnotationNode({
      ...annotation,
      properties: annotation.properties.map((property) =>
        property.key === "raster.yDirection" ? { ...property, value: "south-down" } : property,
      ),
    });
    expect(read.ok).toBe(false);
    if (read.ok) {
      return;
    }
    expect(
      read.defects.some(
        (defect) =>
          defect.includes('the declared raster y direction must be the closed literal "north-up"') &&
          defect.includes('"south-down"'),
      ),
    ).toBe(true);
  });

  test("a NON-IMAGE media type on the wire is refused with the value named", () => {
    const annotation = annotationFromDraft();
    const read = planContextOfAnnotationNode({
      ...annotation,
      properties: annotation.properties.map((property) =>
        property.key === "plan.mediaType" ? { ...property, value: "text/plain" } : property,
      ),
    });
    expect(read.ok).toBe(false);
    if (read.ok) {
      return;
    }
    expect(read.defects.some((defect) => defect.includes("not an image media type"))).toBe(true);
    expect(read.defects.some((defect) => defect.includes('"text/plain"'))).toBe(true);
  });
});

describe("ANCHOR-003a activePlanContextOfVersion (the per-version read)", () => {
  test("no version (404) is the honest empty state — active null, never an error", () => {
    expect(activePlanContextOfVersion(null)).toEqual({ ok: true, active: null });
  });

  test("a version without the annotation node is the honest empty state", () => {
    const result = activePlanContextOfVersion({
      versionId: "v003",
      nodes: [{ nodeId: "site-1", kind: "site", properties: [] }],
    });
    expect(result).toEqual({ ok: true, active: null });
  });

  test("a version carrying the annotation reads the record back (the round-trip at the version level)", () => {
    const record = planContextRecord(validDraft());
    expect(record.ok).toBe(true);
    if (!record.ok) {
      return;
    }
    const change = activePlanContextChangeRecord(record.record, AT);
    const result = activePlanContextOfVersion({
      versionId: "v004",
      nodes: [{ nodeId: "site-1", kind: "site", properties: [] }, change.node],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.active).toEqual(record.record);
  });

  test("a malformed active node is refused with named defects (never coerced)", () => {
    const result = activePlanContextOfVersion({
      versionId: "v005",
      nodes: [{ nodeId: PLAN_CONTEXT_ANNOTATION_NODE_ID, kind: "annotation", properties: [] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.defects.some((defect) => defect.includes('missing the required property "plan.kind"'))).toBe(
      true,
    );
  });
});
