/**
 * The deterministic version-to-version decomposition (AISE-031).
 *
 * Compares two committed graphs of the SAME model and decomposes
 * every identity-preserving content change into change records:
 * object existence/epistemic/class/name, structured geometry
 * (frame/extent/quantities/quality/assets), property assertions
 * (shape/quantity/status/presence/confidence/kind/evidence refs),
 * spaces, and relationships. Added/removed entities produce
 * identity-fact records only — no correspondence is ever inferred
 * (AISE-011 identity discipline: identity is lineage, so a
 * re-extraction yields removal+addition, never "moved").
 *
 * Uncertainty discipline: quantities pass through verbatim with
 * their per-side uncertainty; deltas are derived only for
 * same-unit pairs; combined uncertainty only when both sides
 * state standard uncertainties. Confidence (a model probability)
 * is reported on its own axis and never folded into uncertainty.
 */
import type {
  ModelProvenance,
  PropertyAssertion,
  RealityModelGraph,
  RealityObject,
  SpaceNode,
  StructuredPlanarGeometry,
} from "@aise/engineering-model";
import type { ProvenanceSummary, QuantitySnapshot } from "./records.js";
import { makeChange, type ChangeRecord } from "./records.js";
import { deriveQuantityDelta, formatQuantity, quantityEquals } from "./quantities.js";

function summaryOf(provenance: ModelProvenance): ProvenanceSummary {
  return {
    serviceId: provenance.serviceId,
    method: provenance.method,
    methodVersion: provenance.methodVersion,
  };
}

function quantityOf(quantity: { value: number; unit: QuantitySnapshot["unit"]; uncertainty?: QuantitySnapshot["uncertainty"] }): QuantitySnapshot {
  const snapshot: QuantitySnapshot = { value: quantity.value, unit: quantity.unit };
  return quantity.uncertainty !== undefined ? { ...snapshot, uncertainty: quantity.uncertainty } : snapshot;
}

/** Compares the object sets of two graphs (added/removed + per-object decomposition). */
export function compareObjects(previous: RealityModelGraph, current: RealityModelGraph): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  const previousById = new Map(previous.objects.map((object) => [object.objectId, object] as const));
  const currentById = new Map(current.objects.map((object) => [object.objectId, object] as const));

  for (const [objectId, object] of currentById) {
    const before = previousById.get(objectId);
    if (before === undefined) {
      records.push(
        makeChange({
          category: "object",
          kind: "object-added",
          subject: { kind: "object", objectId },
          side: "to",
          provenance: { current: summaryOf(object.provenance) },
          detail: `object "${objectId}" (${object.objectClass}) added: identity introduced in the later version; no correspondence to a removed object is inferred`,
        }),
      );
    } else if (before.contentHash !== object.contentHash) {
      records.push(...objectRecords(before, object));
    }
  }
  for (const [objectId, object] of previousById) {
    if (!currentById.has(objectId)) {
      records.push(
        makeChange({
          category: "object",
          kind: "object-removed",
          subject: { kind: "object", objectId },
          side: "from",
          provenance: { previous: summaryOf(object.provenance) },
          detail: `object "${objectId}" (${object.objectClass}) removed: identity absent from the later version; no correspondence to an added object is inferred`,
        }),
      );
    }
  }
  return records;
}

/** Decomposes one identity-preserving object content change. */
function objectRecords(before: RealityObject, after: RealityObject): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  const objectId = after.objectId;
  const provenance = { previous: summaryOf(before.provenance), current: summaryOf(after.provenance) };

  if (before.epistemicState !== after.epistemicState) {
    records.push(
      makeChange({
        category: "object",
        kind: "object-epistemic-changed",
        subject: { kind: "object", objectId },
        epistemic: { previous: before.epistemicState, current: after.epistemicState },
        provenance,
        detail: `object "${objectId}" (${after.objectClass}) existence state: ${before.epistemicState} -> ${after.epistemicState}`,
      }),
    );
  }
  const nameBefore = before.name ?? null;
  const nameAfter = after.name ?? null;
  if (nameBefore !== nameAfter) {
    records.push(
      makeChange({
        category: "object",
        kind: "object-name-changed",
        subject: { kind: "object", objectId },
        name: { previous: nameBefore, current: nameAfter },
        provenance,
        detail: `object "${objectId}" name: ${JSON.stringify(nameBefore)} -> ${JSON.stringify(nameAfter)}`,
      }),
    );
  }
  records.push(...geometryRecords(objectId, before, after, provenance));
  records.push(...propertyRecords(objectId, before, after, provenance));
  return records;
}

/** Decomposes the structured-geometry mechanism of one changed object. */
function geometryRecords(
  objectId: string,
  before: RealityObject,
  after: RealityObject,
  provenance: { previous: ProvenanceSummary; current: ProvenanceSummary },
): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  const subject = { kind: "object", objectId } as const;
  const structuredBefore = before.geometry?.structured;
  const structuredAfter = after.geometry?.structured;

  if (structuredBefore === undefined && structuredAfter !== undefined) {
    records.push(
      makeChange({
        category: "geometry",
        kind: "geometry-added",
        subject,
        provenance,
        detail: `object "${objectId}" gained structured planar geometry (shape ${structuredAfter.shape})`,
      }),
    );
    return records;
  }
  if (structuredBefore !== undefined && structuredAfter === undefined) {
    records.push(
      makeChange({
        category: "geometry",
        kind: "geometry-removed",
        subject,
        provenance,
        detail: `object "${objectId}" lost structured planar geometry (was shape ${structuredBefore.shape})`,
      }),
    );
    return records;
  }
  if (structuredBefore !== undefined && structuredAfter !== undefined) {
    records.push(...structuredGeometryRecords(objectId, structuredBefore, structuredAfter, provenance));
  }

  const assetsBefore = (before.geometry?.assetRefs ?? []).map((asset) => asset.contentHash).sort();
  const assetsAfter = (after.geometry?.assetRefs ?? []).map((asset) => asset.contentHash).sort();
  if (JSON.stringify(assetsBefore) !== JSON.stringify(assetsAfter)) {
    records.push(
      makeChange({
        category: "geometry",
        kind: "geometry-assets-changed",
        subject,
        refs: { previous: assetsBefore, current: assetsAfter },
        provenance,
        detail: `object "${objectId}" content-pinned geometry asset set changed: ${assetsBefore.length} -> ${assetsAfter.length} reference(s)`,
      }),
    );
  }
  return records;
}

/** Frame/extent/quantity/quality decomposition of two structured geometries. */
function structuredGeometryRecords(
  objectId: string,
  before: StructuredPlanarGeometry,
  after: StructuredPlanarGeometry,
  provenance: { previous: ProvenanceSummary; current: ProvenanceSummary },
): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  const subject = { kind: "object", objectId } as const;

  const frameEquals =
    JSON.stringify(before.frame) === JSON.stringify(after.frame);
  if (!frameEquals) {
    records.push(
      makeChange({
        category: "geometry",
        kind: "geometry-frame-changed",
        subject,
        frame: {
          previous: {
            planePoint: before.frame.planePoint,
            normal: before.frame.normal,
            axisU: before.frame.axisU,
            axisV: before.frame.axisV,
          },
          current: {
            planePoint: after.frame.planePoint,
            normal: after.frame.normal,
            axisU: after.frame.axisU,
            axisV: after.frame.axisV,
          },
        },
        provenance,
        detail: `object "${objectId}" geometry plane frame changed (plane point / normal / in-plane axes)`,
      }),
    );
  }

  const extentEquals =
    before.rectangle.uMin === after.rectangle.uMin &&
    before.rectangle.uMax === after.rectangle.uMax &&
    before.rectangle.vMin === after.rectangle.vMin &&
    before.rectangle.vMax === after.rectangle.vMax;
  if (!extentEquals) {
    records.push(
      makeChange({
        category: "geometry",
        kind: "geometry-extent-changed",
        subject,
        extent: {
          previous: {
            uMin: before.rectangle.uMin,
            uMax: before.rectangle.uMax,
            vMin: before.rectangle.vMin,
            vMax: before.rectangle.vMax,
          },
          current: {
            uMin: after.rectangle.uMin,
            uMax: after.rectangle.uMax,
            vMin: after.rectangle.vMin,
            vMax: after.rectangle.vMax,
          },
        },
        provenance,
        detail: `object "${objectId}" rectangle extents changed along the in-plane axes`,
      }),
    );
  }

  for (const [label, quantityBefore, quantityAfter] of [
    ["width", before.width, after.width],
    ["height", before.height, after.height],
    ["area", before.area, after.area],
    ["elevation", before.elevation, after.elevation],
    ["sillHeight", before.sillHeight, after.sillHeight],
    ["headHeight", before.headHeight, after.headHeight],
  ] as const) {
    if (quantityBefore === undefined || quantityAfter === undefined) {
      continue;
    }
    const previousQuantity = quantityOf(quantityBefore);
    const currentQuantity = quantityOf(quantityAfter);
    if (!quantityEquals(previousQuantity, currentQuantity)) {
      const delta = deriveQuantityDelta(previousQuantity, currentQuantity);
      records.push(
        makeChange({
          category: "geometry",
          kind: "geometry-quantity-changed",
          subject,
          quantity: { previous: previousQuantity, current: currentQuantity },
          ...(delta !== undefined ? { quantityDelta: delta } : {}),
          provenance,
          detail: `object "${objectId}" geometry ${label}: ${formatQuantity(previousQuantity)} -> ${formatQuantity(currentQuantity)}${delta !== undefined ? ` (delta ${JSON.stringify(delta.value)} ${delta.unit})` : " (units differ; no derived delta)"}`,
        }),
      );
    }
  }

  const qualityEquals =
    before.quality.pointCount === after.quality.pointCount &&
    before.quality.residualRms === after.quality.residualRms &&
    before.quality.residualMaxAbs === after.quality.residualMaxAbs;
  if (!qualityEquals) {
    records.push(
      makeChange({
        category: "geometry",
        kind: "geometry-quality-changed",
        subject,
        quality: {
          previous: {
            pointCount: before.quality.pointCount,
            residualRms: before.quality.residualRms,
            residualMaxAbs: before.quality.residualMaxAbs,
          },
          current: {
            pointCount: after.quality.pointCount,
            residualRms: after.quality.residualRms,
            residualMaxAbs: after.quality.residualMaxAbs,
          },
        },
        provenance,
        detail: `object "${objectId}" geometry fit-quality metrics changed (support/residuals)`,
      }),
    );
  }
  return records;
}

/** Decomposes the property assertions of one changed object. */
function propertyRecords(
  objectId: string,
  before: RealityObject,
  after: RealityObject,
  provenance: { previous: ProvenanceSummary; current: ProvenanceSummary },
): ChangeRecord[] {
  return assertionRecords(
    { kind: "property", ownerObjectId: objectId },
    before.properties,
    after.properties,
    provenance,
    `object "${objectId}"`,
  );
}

/** Shared property-assertion decomposition (object- and space-owned). */
function assertionRecords(
  subject: { kind: "property"; ownerObjectId?: string; ownerSpaceId?: string },
  before: readonly PropertyAssertion[],
  after: readonly PropertyAssertion[],
  provenance: { previous: ProvenanceSummary; current: ProvenanceSummary },
  ownerLabel: string,
): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  const beforeByKey = new Map(before.map((assertion) => [assertion.key, assertion] as const));
  const afterByKey = new Map(after.map((assertion) => [assertion.key, assertion] as const));

  for (const [key, assertion] of afterByKey) {
    if (!beforeByKey.has(key)) {
      records.push(
        makeChange({
          category: "property",
          kind: "property-added",
          subject: { ...subject, propertyKey: key },
          provenance,
          detail: `${ownerLabel} property "${key}" added (status ${assertion.status})`,
        }),
      );
    }
  }
  for (const [key, assertion] of beforeByKey) {
    if (!afterByKey.has(key)) {
      records.push(
        makeChange({
          category: "property",
          kind: "property-removed",
          subject: { ...subject, propertyKey: key },
          provenance,
          detail: `${ownerLabel} property "${key}" removed (was status ${assertion.status})`,
        }),
      );
    }
  }
  for (const [key, before_] of beforeByKey) {
    const after_ = afterByKey.get(key);
    if (after_ === undefined) continue;
    records.push(
      ...assertionPairRecords({ ...subject, propertyKey: key }, before_, after_, provenance, ownerLabel, key),
    );
  }
  return records;
}

/** Decomposes one identity-preserving property-assertion change. */
function assertionPairRecords(
  subject: { kind: "property"; ownerObjectId?: string; ownerSpaceId?: string; propertyKey: string },
  before: PropertyAssertion,
  after: PropertyAssertion,
  provenance: { previous: ProvenanceSummary; current: ProvenanceSummary },
  ownerLabel: string,
  key: string,
): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  const label = `${ownerLabel} property "${key}"`;

  const shapeBefore = before.quantity !== undefined ? "quantity" : "presence";
  const shapeAfter = after.quantity !== undefined ? "quantity" : "presence";
  if (shapeBefore !== shapeAfter) {
    records.push(
      makeChange({
        category: "property",
        kind: "property-shape-changed",
        subject,
        shape: { previous: shapeBefore, current: shapeAfter },
        provenance,
        detail: `${label} assertion shape: ${shapeBefore} -> ${shapeAfter}`,
      }),
    );
  }

  if (before.quantity !== undefined && after.quantity !== undefined) {
    const previousQuantity = quantityOf(before.quantity);
    const currentQuantity = quantityOf(after.quantity);
    if (!quantityEquals(previousQuantity, currentQuantity)) {
      const delta = deriveQuantityDelta(previousQuantity, currentQuantity);
      records.push(
        makeChange({
          category: "property",
          kind: "property-quantity-changed",
          subject,
          quantity: { previous: previousQuantity, current: currentQuantity },
          ...(delta !== undefined ? { quantityDelta: delta } : {}),
          provenance,
          detail: `${label} quantity: ${formatQuantity(previousQuantity)} -> ${formatQuantity(currentQuantity)}${delta !== undefined ? ` (delta ${JSON.stringify(delta.value)} ${delta.unit}; uncertainties preserved per side)` : " (units differ; no derived delta)"}`,
        }),
      );
    }
  }

  if (before.status !== after.status) {
    records.push(
      makeChange({
        category: "property",
        kind: "property-status-changed",
        subject,
        epistemic: { previous: before.status, current: after.status },
        provenance,
        detail: `${label} epistemic status: ${before.status} -> ${after.status}`,
      }),
    );
  }

  if (before.presence !== undefined && after.presence !== undefined && before.presence !== after.presence) {
    records.push(
      makeChange({
        category: "property",
        kind: "property-presence-changed",
        subject,
        presence: { previous: before.presence, current: after.presence },
        provenance,
        detail: `${label} presence: ${before.presence} -> ${after.presence}`,
      }),
    );
  }

  const confidenceBefore = before.confidence ?? null;
  const confidenceAfter = after.confidence ?? null;
  if (confidenceBefore !== confidenceAfter) {
    records.push(
      makeChange({
        category: "property",
        kind: "property-confidence-changed",
        subject,
        confidence: { previous: confidenceBefore, current: confidenceAfter },
        provenance,
        detail: `${label} confidence (model probability, AC-070 axis): ${JSON.stringify(confidenceBefore)} -> ${JSON.stringify(confidenceAfter)} — separate from quantity uncertainty`,
      }),
    );
  }

  if (before.kind !== undefined && after.kind !== undefined && before.kind !== after.kind) {
    records.push(
      makeChange({
        category: "property",
        kind: "property-kind-changed",
        subject,
        measurementKind: { previous: before.kind, current: after.kind },
        provenance,
        detail: `${label} measurement kind: ${before.kind} -> ${after.kind}`,
      }),
    );
  }

  const refsBefore = [...(before.evidenceRefs ?? [])].sort();
  const refsAfter = [...(after.evidenceRefs ?? [])].sort();
  if (JSON.stringify(refsBefore) !== JSON.stringify(refsAfter)) {
    records.push(
      makeChange({
        category: "property",
        kind: "property-evidence-changed",
        subject,
        refs: { previous: refsBefore, current: refsAfter },
        provenance,
        detail: `${label} cited evidence set changed: ${refsBefore.length} -> ${refsAfter.length} reference(s)`,
      }),
    );
  }
  return records;
}

/** Compares the space sets of two graphs. */
export function compareSpaces(previous: RealityModelGraph, current: RealityModelGraph): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  const previousById = new Map(previous.spaces.map((space) => [space.spaceId, space] as const));
  const currentById = new Map(current.spaces.map((space) => [space.spaceId, space] as const));

  for (const [spaceId, space] of currentById) {
    const before = previousById.get(spaceId);
    if (before === undefined) {
      records.push(
        makeChange({
          category: "space",
          kind: "space-added",
          subject: { kind: "space", spaceId },
          side: "to",
          provenance: { current: { serviceId: "aise.reality-model", method: "space-declaration", methodVersion: "v1.0" } },
          detail: `space "${spaceId}" (${space.kind}) added`,
        }),
      );
    } else {
      records.push(...spaceRecords(before, space));
    }
  }
  for (const [spaceId, space] of previousById) {
    if (!currentById.has(spaceId)) {
      records.push(
        makeChange({
          category: "space",
          kind: "space-removed",
          subject: { kind: "space", spaceId },
          side: "from",
          provenance: { previous: { serviceId: "aise.reality-model", method: "space-declaration", methodVersion: "v1.0" } },
          detail: `space "${spaceId}" (${space.kind}) removed`,
        }),
      );
    }
  }
  return records;
}

/** Decomposes one identity-preserving space change (spaces carry no epistemic state). */
function spaceRecords(before: SpaceNode, after: SpaceNode): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  const spaceId = after.spaceId;
  const provenance = {
    previous: { serviceId: "aise.reality-model", method: "space-declaration", methodVersion: "v1.0" },
    current: { serviceId: "aise.reality-model", method: "space-declaration", methodVersion: "v1.0" },
  };

  const nameBefore = before.name ?? null;
  const nameAfter = after.name ?? null;
  if (nameBefore !== nameAfter) {
    records.push(
      makeChange({
        category: "space",
        kind: "space-name-changed",
        subject: { kind: "space", spaceId },
        name: { previous: nameBefore, current: nameAfter },
        provenance,
        detail: `space "${spaceId}" name: ${JSON.stringify(nameBefore)} -> ${JSON.stringify(nameAfter)}`,
      }),
    );
  }
  const parentBefore = before.parentSpaceId ?? null;
  const parentAfter = after.parentSpaceId ?? null;
  if (parentBefore !== parentAfter) {
    records.push(
      makeChange({
        category: "space",
        kind: "space-parent-changed",
        subject: { kind: "space", spaceId },
        parent: { previous: parentBefore, current: parentAfter },
        provenance,
        detail: `space "${spaceId}" parent: ${JSON.stringify(parentBefore)} -> ${JSON.stringify(parentAfter)}`,
      }),
    );
  }
  const frameEquals = JSON.stringify(before.frame) === JSON.stringify(after.frame);
  if (!frameEquals) {
    if (before.frame !== undefined && after.frame !== undefined) {
      records.push(
        makeChange({
          category: "space",
          kind: "space-frame-changed",
          subject: { kind: "space", spaceId },
          spaceFrame: { previous: { up: before.frame.up, unit: before.frame.unit }, current: { up: after.frame.up, unit: after.frame.unit } },
          provenance,
          detail: `space "${spaceId}" declared coordinate frame changed (up axis / unit)`,
        }),
      );
    } else {
      records.push(
        makeChange({
          category: "space",
          kind: "space-frame-changed",
          subject: { kind: "space", spaceId },
          provenance,
          detail: `space "${spaceId}" declared coordinate frame ${before.frame === undefined ? "absent" : "present"} -> ${after.frame === undefined ? "absent" : "present"} (v1 records presence flips of the space frame without field decomposition)`,
        }),
      );
    }
  }
  records.push(
    ...assertionRecords(
      { kind: "property", ownerSpaceId: spaceId },
      before.properties ?? [],
      after.properties ?? [],
      provenance,
      `space "${spaceId}"`,
    ),
  );
  return records;
}

/** Compares the relationship sets (identity-only in v1: same id ⇒ same triple). */
export function compareRelationships(previous: RealityModelGraph, current: RealityModelGraph): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  const previousIds = new Set(previous.relationships.map((rel) => rel.relationId));
  const currentIds = new Set(current.relationships.map((rel) => rel.relationId));
  const byId = new Map(
    [...previous.relationships, ...current.relationships].map((rel) => [rel.relationId, rel] as const),
  );

  for (const relationId of currentIds) {
    if (!previousIds.has(relationId)) {
      const rel = byId.get(relationId)!;
      records.push(
        makeChange({
          category: "relationship",
          kind: "relationship-added",
          subject: { kind: "relationship", relationId },
          side: "to",
          detail: `relationship "${relationId}" (${rel.type} ${rel.fromId} -> ${rel.toId}) added`,
        }),
      );
    }
  }
  for (const relationId of previousIds) {
    if (!currentIds.has(relationId)) {
      const rel = byId.get(relationId)!;
      records.push(
        makeChange({
          category: "relationship",
          kind: "relationship-removed",
          subject: { kind: "relationship", relationId },
          side: "from",
          detail: `relationship "${relationId}" (${rel.type} ${rel.fromId} -> ${rel.toId}) removed`,
        }),
      );
    }
  }
  return records;
}
