/**
 * Evidence-validity comparison (AISE-031, over the AISE-012
 * verification-validity projection).
 *
 * The evidence subsystem owns the authoritative provenance
 * mapping; `computeVersionValidity` derives, for each committed
 * version, whether every CONFIRMED assertion's verification state
 * is backed by live (non-retracted) evidence (AC-063). This module
 * compares the two versions' projections at the LOGICAL-subject
 * level (the AISE-012 subject identity with the version field
 * stripped — the same logical assertion in both versions) and
 * records validity flips for subjects CONFIRMED in BOTH versions:
 *
 * - `evidence-validity-invalidated` — valid in the earlier version,
 *   invalid in the later one (the invalidation reasons of the
 *   later side are carried);
 * - `evidence-validity-restored` — invalid earlier, valid later
 *   (the prior invalidation reasons are carried for review).
 *
 * Subjects confirmed in only one version are not validity CHANGES
 * (the confirmation itself is a property/object change record
 * produced by the graph comparison); retracted-support sets and
 * cited references are surfaced inside the projection entries and
 * summarized in the record detail.
 */
import {
  computeVersionValidity,
  subjectKey,
  type EvidenceGraph,
  type InvalidationReason,
  type RealityModelGraph,
  type VersionValidityReport,
  type ConfirmedAssertionRef,
} from "@aise/engineering-model";
import { makeChange, type ChangeRecord } from "./records.js";

/** Computes one version's validity projection (pure read view). */
export function validityProjection(
  graph: RealityModelGraph,
  version: number,
  evidence: EvidenceGraph,
): VersionValidityReport {
  return computeVersionValidity(graph, version, evidence);
}

/** The logical key of a confirmed assertion: the AISE-012 subject key with the version stripped. */
function logicalSubjectKey(ref: ConfirmedAssertionRef): string {
  // AISE-012 key layout: `${modelId}@${version}::${kind}:${entity}/${propertyKey?}`
  return subjectKey(ref.subject).replace(/@(\d+)::/, "::");
}

interface LogicalEntry {
  readonly logicalKey: string;
  readonly ref: ConfirmedAssertionRef;
  readonly valid: boolean;
  readonly invalidationReasons: readonly InvalidationReason[];
}

function logicalEntries(report: VersionValidityReport): Map<string, LogicalEntry> {
  const byLogical = new Map<string, LogicalEntry>();
  for (const entry of report.entries) {
    const valid = entry.valid;
    const logicalKey = logicalSubjectKey(entry);
    byLogical.set(logicalKey, {
      logicalKey,
      ref: {
        subject: entry.subject,
        description: entry.description,
        citedEvidenceRefs: entry.citedEvidenceRefs,
      },
      valid,
      invalidationReasons: entry.invalidationReasons ?? [],
    });
  }
  return byLogical;
}

/** Compares two versions' validity projections and emits flip records. */
export function compareEvidenceValidity(
  from: VersionValidityReport,
  to: VersionValidityReport,
): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  const fromEntries = logicalEntries(from);
  const toEntries = logicalEntries(to);

  for (const [logicalKey, toEntry] of toEntries) {
    const fromEntry = fromEntries.get(logicalKey);
    if (fromEntry === undefined) {
      // Confirmed in the later version only — not a validity change.
      continue;
    }
    if (fromEntry.valid && !toEntry.valid) {
      records.push(
        makeChange({
          category: "evidence",
          kind: "evidence-validity-invalidated",
          subject: subjectFromRef(toEntry.ref),
          validity: { previous: true, current: false },
          invalidationReasons: [...toEntry.invalidationReasons],
          detail: `${toEntry.ref.description}: verification state was VALID in version ${from.version} and is INVALIDATED in version ${to.version} (${toEntry.invalidationReasons.join(", ")}) — evidence retraction invalidates the derived validity, never the committed graph`,
        }),
      );
    } else if (!fromEntry.valid && toEntry.valid) {
      records.push(
        makeChange({
          category: "evidence",
          kind: "evidence-validity-restored",
          subject: subjectFromRef(toEntry.ref),
          validity: { previous: false, current: true },
          invalidationReasons: [...fromEntry.invalidationReasons],
          detail: `${toEntry.ref.description}: verification state was INVALIDATED in version ${from.version} (${fromEntry.invalidationReasons.join(", ")}) and is VALID in version ${to.version} — live evidence support was re-established`,
        }),
      );
    }
  }
  return records;
}

/** Maps a confirmed-assertion ref to the history subject (version-stripped). */
function subjectFromRef(ref: ConfirmedAssertionRef): {
  kind: "evidence-subject";
  evidenceSubjectKind: "object-existence" | "object-property" | "space-property";
  objectId?: string;
  spaceId?: string;
  propertyKey?: string;
} {
  const subject = {
    kind: "evidence-subject" as const,
    evidenceSubjectKind: ref.subject.kind,
  } as {
    kind: "evidence-subject";
    evidenceSubjectKind: "object-existence" | "object-property" | "space-property";
    objectId?: string;
    spaceId?: string;
    propertyKey?: string;
  };
  if (ref.subject.objectId !== undefined) subject.objectId = ref.subject.objectId;
  if (ref.subject.spaceId !== undefined) subject.spaceId = ref.subject.spaceId;
  if (ref.subject.propertyKey !== undefined) subject.propertyKey = ref.subject.propertyKey;
  return subject;
}
