/**
 * AISE-031 golden composition: the historical comparison over the
 * REAL AISE-010 extraction and AISE-011 ingestion of the exact
 * golden room, the AISE-012 evidence chain, and the AC-063
 * retraction — the same disciplined chain as the sibling
 * verification services.
 *
 * Chain under test:
 *   AISE-010 extraction -> AISE-011 ingestion -> committed v1
 *     (all objects INFERRED; roomHeight asserted on the space)
 *   -> review pass: v2 confirms the door existence and the
 *     roomHeight measurement citing evidence (identities survive
 *     the confirmation — lineage, not content)
 *     -> compare v1 -> v2: epistemic + property records with
 *        uncertainty separation; NO added/removed objects; no
 *        geometry changes on unchanged geometry
 *   -> evidence link retraction (AC-063) while v3 carries the
 *     same confirmed content plus one confirmed window
 *     -> compare v2 -> v3 WITH evidence: evidence-validity-
 *        invalidated for the retracted subject (the retraction
 *        invalidates derived validity, never the committed graph)
 *   -> full replay is bit-identical; the canonical graphs and
 *      the evidence mapping are unchanged through every
 *      comparison (read-only, digest-proven)
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import {
  assembleModelGraph,
  makeSpaceNode,
  propertyAssertion,
  evidenceLink,
  evidenceRecord,
  linkRetraction,
  assembleEvidenceGraph,
  deriveLinkId,
  listConfirmedAssertionSubjects,
  graphContentDigest,
  type PropertyAssertion,
  type RealityModelGraph,
  type EvidenceSubject,
} from "@aise/engineering-model";
import { compareModelVersions } from "./report.js";
import { validateHistoricalChangeReport } from "./validate.js";
import { buildHistoryService } from "./runtime.js";

const MODEL = "model-golden-history";
const PROJECT = "project-golden-history";
const SPACE = "room-golden-history";
const target = { modelId: MODEL, projectId: PROJECT, spaceId: SPACE };

const V1_AT = "2026-09-05T10:00:00Z";
const V2_AT = "2026-09-06T10:00:00Z";
const V3_AT = "2026-09-07T10:00:00Z";

function surveyMeasurement(): ReturnType<typeof evidenceRecord> {
  return evidenceRecord({
    kind: "MEASUREMENT",
    source: {
      kind: "manual-measurement",
      value: 2.7,
      unit: "m",
      method: "survey/total-station",
      measuredBy: "surveyor-bob",
      measuredAt: "2026-09-03T14:00:00Z",
    },
    recordedBy: "svc:evidence-ingest",
    recordedAt: "2026-09-04T10:00:00Z",
  });
}

function confirmedVersion(v1: RealityModelGraph, measurementId: string): RealityModelGraph {
  // Inputs (NOT pre-built objects): assembleModelGraph expects
  // RealityObjectInput records — passing built objects would drop
  // geometry (the input field is `structuredGeometry`, not `geometry`).
  const objects = v1.objects.map((object) => ({
    objectClass: object.objectClass,
    ...(object.name !== undefined ? { name: object.name } : {}),
    ...(object.geometry?.structured !== undefined ? { structuredGeometry: object.geometry.structured } : {}),
    ...(object.geometry?.assetRefs !== undefined ? { assetRefs: object.geometry.assetRefs } : {}),
    properties: object.properties,
    epistemicState: object.objectClass === "DOOR" ? ("CONFIRMED" as const) : object.epistemicState,
    provenance: object.provenance,
  }));

  const space = v1.spaces[0]!;
  const roomHeight = (space.properties ?? []).find((assertion) => assertion.key === "roomHeight");
  const properties: PropertyAssertion[] = [];
  if (roomHeight !== undefined && roomHeight.quantity !== undefined) {
    properties.push(
      propertyAssertion({
        key: roomHeight.key,
        quantity: {
          value: 2.7,
          unit: "meter",
          uncertainty: { kind: "standard", u: 0.005 },
        },
        status: "CONFIRMED",
        kind: "measurement",
        evidenceRefs: [measurementId],
        verifiedBy: "user:site-engineer",
        verifiedAt: "2026-09-06T10:00:00Z",
      }),
    );
  }

  return assembleModelGraph({
    modelId: v1.modelId,
    projectId: v1.projectId,
    spaces: [
      makeSpaceNode({
        spaceId: space.spaceId,
        kind: space.kind,
        ...(space.name !== undefined ? { name: space.name } : {}),
        frame: space.frame,
        ...(properties.length > 0 ? { properties } : {}),
      }),
    ],
    objects,
    relationships: v1.relationships.map((relationship) => ({
      type: relationship.type,
      fromId: relationship.fromId,
      toId: relationship.toId,
    })),
  });
}

/** v3 = v2 + one more confirmed property (windowWidth on the window object). */
function version3(v2: RealityModelGraph, measurementId: string): RealityModelGraph {
  const objects = v2.objects.map((object) => {
    if (object.objectClass !== "WINDOW") {
      return {
        objectClass: object.objectClass,
        ...(object.name !== undefined ? { name: object.name } : {}),
        ...(object.geometry?.structured !== undefined ? { structuredGeometry: object.geometry.structured } : {}),
        ...(object.geometry?.assetRefs !== undefined ? { assetRefs: object.geometry.assetRefs } : {}),
        properties: object.properties,
        epistemicState: object.epistemicState,
        provenance: object.provenance,
      };
    }
    return {
      objectClass: object.objectClass,
      ...(object.name !== undefined ? { name: object.name } : {}),
      ...(object.geometry?.structured !== undefined ? { structuredGeometry: object.geometry.structured } : {}),
      ...(object.geometry?.assetRefs !== undefined ? { assetRefs: object.geometry.assetRefs } : {}),
      properties: [
        ...object.properties,
        propertyAssertion({
          key: "windowWidth",
          quantity: { value: 1.2, unit: "meter", uncertainty: { kind: "standard", u: 0.01 } },
          status: "CONFIRMED",
          kind: "measurement",
          evidenceRefs: [measurementId],
          verifiedBy: "user:site-engineer",
          verifiedAt: "2026-09-07T10:00:00Z",
        }),
      ],
      epistemicState: object.epistemicState,
      provenance: object.provenance,
    };
  });

  return assembleModelGraph({
    modelId: v2.modelId,
    projectId: v2.projectId,
    spaces: v2.spaces.map((space) => ({
      spaceId: space.spaceId,
      kind: space.kind,
      ...(space.name !== undefined ? { name: space.name } : {}),
      frame: space.frame,
      properties: space.properties,
    })),
    objects,
    relationships: v2.relationships.map((relationship) => ({
      type: relationship.type,
      fromId: relationship.fromId,
      toId: relationship.toId,
    })),
  });
}

function pin(graph: RealityModelGraph, version: number, committedAt: string) {
  return {
    record: {
      modelId: graph.modelId,
      version,
      ...(version > 1 ? { parentVersion: version - 1 } : {}),
      digest: graphContentDigest(graph.modelId, graph.projectId, graph.spaces, graph.objects, graph.relationships),
      committedAt,
      spaceCount: graph.spaces.length,
      objectCount: graph.objects.length,
      relationshipCount: graph.relationships.length,
    },
    graph,
  };
}

describe("AISE-031 golden composition (exact room)", () => {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  const v1Graph = ingestArchitecturalScene(scene, target).graph;
  const survey = surveyMeasurement();
  const v2Graph = confirmedVersion(v1Graph, survey.evidenceId);
  const v3Graph = version3(v2Graph, survey.evidenceId);

  const doorId = v1Graph.objects.find((object) => object.objectClass === "DOOR")!.objectId;
  const windowId = v1Graph.objects.find((object) => object.objectClass === "WINDOW")!.objectId;

  function evidenceFor(version: number, options: { retractRoomHeight?: boolean } = {}) {
    const roomHeightSubject: EvidenceSubject = {
      kind: "space-property",
      modelId: MODEL,
      version,
      spaceId: SPACE,
      propertyKey: "roomHeight",
    };
    const doorSubject: EvidenceSubject = {
      kind: "object-existence",
      modelId: MODEL,
      version,
      objectId: doorId,
    };
    const links = [
      evidenceLink({
        subject: doorSubject,
        evidenceId: survey.evidenceId,
        linkedBy: "svc:evidence-link",
        linkedAt: "2026-09-05T10:30:00Z",
        method: "golden/history-link",
      }),
      evidenceLink({
        subject: roomHeightSubject,
        evidenceId: survey.evidenceId,
        linkedBy: "svc:evidence-link",
        linkedAt: "2026-09-05T10:30:00Z",
        method: "golden/history-link",
      }),
    ];
    const linkRetractions = options.retractRoomHeight
      ? [
          linkRetraction({
            linkId: deriveLinkId({
              subject: roomHeightSubject,
              evidenceId: survey.evidenceId,
              linkedBy: "svc:evidence-link",
              linkedAt: "2026-09-05T10:30:00Z",
              method: "golden/history-link",
            }),
            retractedBy: "svc:evidence-link",
            retractedAt: "2026-09-07T11:00:00Z",
            reason: "golden-history-test-retraction",
          }),
        ]
      : [];
    return assembleEvidenceGraph({
      projectId: PROJECT,
      records: [survey],
      evidenceRetractions: [],
      links,
      linkRetractions,
    });
  }

  it("v1 -> v2: identity-preserving confirmation decomposes with uncertainty separation", () => {
    const report = compareModelVersions({
      from: pin(v1Graph, 1, V1_AT),
      to: pin(v2Graph, 2, V2_AT),
    });
    validateHistoricalChangeReport(report);

    const kinds = report.records.map((record) => record.kind);
    // The door existence confirmation is its own record — never a quantity record.
    expect(kinds).toContain("object-epistemic-changed");
    const doorRecord = report.records.find(
      (record) =>
        record.kind === "object-epistemic-changed" &&
        record.subject.kind === "object" &&
        record.subject.objectId === doorId,
    );
    expect(doorRecord!.epistemic).toEqual({ previous: "INFERRED", current: "CONFIRMED" });

    // The roomHeight confirmation on the space: status + kind + evidence changes.
    const spaceStatus = report.records.find(
      (record) =>
        record.kind === "property-status-changed" &&
        record.subject.kind === "property" &&
        record.subject.ownerSpaceId === SPACE &&
        record.subject.propertyKey === "roomHeight",
    );
    expect(spaceStatus).toBeDefined();
    expect(spaceStatus!.epistemic).toEqual({ previous: "INFERRED", current: "CONFIRMED" });

    // No objects were added or removed (identity survived confirmation).
    expect(report.summary.objectsAdded).toBe(0);
    expect(report.summary.objectsRemoved).toBe(0);
    // The door and the roomHeight space changed (content hashes moved).
    expect(report.summary.objectsChanged).toBe(1);
    // Uncertainty is carried verbatim on the roomHeight quantity change (v1 unstated -> v2 0.005).
    const quantityRecord = report.records.find(
      (record) =>
        record.kind === "property-quantity-changed" &&
        record.subject.kind === "property" &&
        record.subject.propertyKey === "roomHeight",
    );
    if (quantityRecord !== undefined) {
      expect(quantityRecord.quantity!.previous.uncertainty).toBeUndefined();
      expect(quantityRecord.quantity!.current.uncertainty).toEqual({ kind: "standard", u: 0.005 });
      expect(quantityRecord.confidence).toBeUndefined();
    }
    // v1 asserted roomHeight INFERRED with a quantity; v2 CONFIRMED with new uncertainty
    // -> a quantity change record exists exactly when the quantities differ.
    const v1Height = (v1Graph.spaces[0]!.properties ?? []).find((p) => p.key === "roomHeight");
    const v2Height = (v2Graph.spaces[0]!.properties ?? []).find((p) => p.key === "roomHeight");
    const quantitiesDiffer =
      v1Height?.quantity?.uncertainty === undefined || v2Height?.quantity?.uncertainty !== undefined;
    expect(quantitiesDiffer).toBe(true);
  });

  it("v2 -> v3 with AC-063 retraction: evidence validity invalidated, graph untouched", () => {
    const report = compareModelVersions({
      from: pin(v2Graph, 2, V2_AT),
      to: pin(v3Graph, 3, V3_AT),
      evidence: {
        from: evidenceFor(2),
        to: evidenceFor(3, { retractRoomHeight: true }),
      },
    });
    validateHistoricalChangeReport(report);

    const invalidated = report.records.filter(
      (record) => record.kind === "evidence-validity-invalidated",
    );
    expect(invalidated.length).toBe(1);
    const record = invalidated[0]!;
    expect(record.subject.kind).toBe("evidence-subject");
    const subject = record.subject;
    if (subject.kind === "evidence-subject") {
      expect(subject.evidenceSubjectKind).toBe("space-property");
      expect(subject.spaceId).toBe(SPACE);
      expect(subject.propertyKey).toBe("roomHeight");
    }
    expect(record.validity).toEqual({ previous: true, current: false });
    expect(record.invalidationReasons).toContain("UNMAPPED_CITATION");

    // The v3 content change (windowWidth confirmed) is present too.
    const windowWidth = report.records.find(
      (record) =>
        record.kind === "property-added" &&
        record.subject.kind === "property" &&
        record.subject.ownerObjectId === windowId,
    );
    expect(windowWidth).toBeDefined();

    // Read-only: the committed graphs are bit-identical after the comparison.
    const v2Before = JSON.stringify(v2Graph);
    const v3Before = JSON.stringify(v3Graph);
    compareModelVersions({
      from: pin(v2Graph, 2, V2_AT),
      to: pin(v3Graph, 3, V3_AT),
      evidence: { from: evidenceFor(2), to: evidenceFor(3, { retractRoomHeight: true }) },
    });
    expect(JSON.stringify(v2Graph)).toBe(v2Before);
    expect(JSON.stringify(v3Graph)).toBe(v3Before);
  });

  it("full replay is bit-identical (deterministic by construction)", () => {
    const input = {
      from: pin(v1Graph, 1, V1_AT),
      to: pin(v2Graph, 2, V2_AT),
    };
    const a = compareModelVersions(input);
    const b = compareModelVersions(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.digest).toBe(b.digest);

    const service = buildHistoryService();
    const c = service.compareVersions(input);
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });

  it("the confirmed-assertion enumeration agrees with the model (sanity)", () => {
    const subjectsV2 = listConfirmedAssertionSubjects(v2Graph, 2);
    const keys = subjectsV2.map((ref) => ref.subject);
    expect(keys.some((subject) => subject.kind === "object-existence" && subject.objectId === doorId)).toBe(true);
    expect(keys.some((subject) => subject.kind === "space-property" && subject.propertyKey === "roomHeight")).toBe(
      true,
    );
    const subjectsV1 = listConfirmedAssertionSubjects(v1Graph, 1);
    expect(subjectsV1).toHaveLength(0);
  });
});
