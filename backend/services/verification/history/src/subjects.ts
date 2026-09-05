/**
 * Change-record subjects and their canonical keys (AISE-031).
 *
 * A subject identifies the ENTITY a change record is about. The
 * subject is deliberately version-NEUTRAL: the record itself pins
 * which side (from/to) the subject exists on for added/removed
 * records. For evidence-validity records the subject mirrors the
 * AISE-012 evidence-subject identity with the version stripped
 * (the logical assertion compared across versions).
 */
export type HistorySubjectRef =
  | { readonly kind: "object"; readonly objectId: string }
  | { readonly kind: "space"; readonly spaceId: string }
  | { readonly kind: "relationship"; readonly relationId: string }
  | {
      readonly kind: "property";
      readonly ownerObjectId?: string;
      readonly ownerSpaceId?: string;
      readonly propertyKey: string;
    }
  | {
      readonly kind: "evidence-subject";
      readonly evidenceSubjectKind: "object-existence" | "object-property" | "space-property";
      readonly objectId?: string;
      readonly spaceId?: string;
      readonly propertyKey?: string;
    };

/** Stable canonical key (identity for ordering and digest binding). */
export function historySubjectKey(subject: HistorySubjectRef): string {
  switch (subject.kind) {
    case "object":
      return `object:${subject.objectId}`;
    case "space":
      return `space:${subject.spaceId}`;
    case "relationship":
      return `relationship:${subject.relationId}`;
    case "property": {
      const owner =
        subject.ownerObjectId !== undefined
          ? `object:${subject.ownerObjectId}`
          : subject.ownerSpaceId !== undefined
            ? `space:${subject.ownerSpaceId}`
            : "model";
      return `property:${owner}/${subject.propertyKey}`;
    }
    case "evidence-subject": {
      const owner =
        subject.objectId !== undefined
          ? `object:${subject.objectId}`
          : subject.spaceId !== undefined
            ? `space:${subject.spaceId}`
            : "model";
      const property = subject.propertyKey !== undefined ? `/${subject.propertyKey}` : "";
      return `evidence-subject:${subject.evidenceSubjectKind}:${owner}${property}`;
    }
  }
}

/** Deterministic rank of subject kinds (canonical tie-break order). */
export const SUBJECT_KIND_RANK: Readonly<Record<HistorySubjectRef["kind"], number>> =
  Object.freeze({
    object: 0,
    space: 1,
    relationship: 2,
    property: 3,
    "evidence-subject": 4,
  });
