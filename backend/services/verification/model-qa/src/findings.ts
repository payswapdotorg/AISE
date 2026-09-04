/**
 * QA finding records and stable finding identities (AISE-014).
 *
 * Every finding is independently reviewable: it carries a stable
 * code, family, outcome, severity, blocking bit, the affected
 * entity, related entities, expected/actual values where they
 * apply, evidence references where they apply, epistemic context
 * (passthrough — never rewritten), and a deterministic reason.
 *
 * `findingId` is DERIVED (sha-256 over the finding's canonical
 * content) — identical finding content yields the identical id,
 * across replays and across processes. Caller-supplied finding
 * ids are never trusted; they are not even accepted.
 */
import { canonicalJsonString, sha256Hex, type EpistemicState, type ModelPresence } from "@aise/engineering-model";
import type { AssuranceProfile } from "@aise/shared-contracts";
import {
  CODE_FAMILY,
  isBlocking,
  severityForOutcome,
  type QaCheckFamily,
  type QaFindingCode,
  type QaFindingOutcome,
  type QaSeverity,
} from "./vocabulary.js";

/** A reference to the entity a finding is about. */
export type QaSubjectRef =
  | { readonly kind: "object"; readonly objectId: string }
  | { readonly kind: "space"; readonly spaceId: string }
  | { readonly kind: "relationship"; readonly relationId: string }
  | {
      readonly kind: "property";
      readonly objectId?: string;
      readonly spaceId?: string;
      readonly propertyKey: string;
    }
  | { readonly kind: "model" };

/** Stable subject key (canonical subject identity for ordering). */
export function qaSubjectKey(subject: QaSubjectRef): string {
  switch (subject.kind) {
    case "object":
      return `object:${subject.objectId}`;
    case "space":
      return `space:${subject.spaceId}`;
    case "relationship":
      return `relationship:${subject.relationId}`;
    case "property": {
      const owner =
        subject.objectId !== undefined
          ? `object:${subject.objectId}`
          : subject.spaceId !== undefined
            ? `space:${subject.spaceId}`
            : "model";
      return `property:${owner}/${subject.propertyKey}`;
    }
    case "model":
      return "model";
  }
}

/** Epistemic context attached to a finding (passthrough, never rewritten). */
export interface QaEpistemicContext {
  /** The involved assertion's own status, when applicable. */
  readonly assertionStatus?: EpistemicState;
  /** The involved object's existence/geometry state, when applicable. */
  readonly objectState?: EpistemicState;
  /** Presence state for valueless assertions, when applicable. */
  readonly presence?: ModelPresence;
}

/** One deterministic, independently reviewable QA finding. */
export interface QaFinding {
  /** Deterministic identity derived from the finding's content. */
  readonly findingId: string;
  readonly code: QaFindingCode;
  readonly family: QaCheckFamily;
  readonly outcome: QaFindingOutcome;
  readonly severity: QaSeverity;
  /** Derived from (outcome, profile) by the fixed policy table. */
  readonly blocking: boolean;
  readonly subject: QaSubjectRef;
  /** Other entities the finding relates (endpoints, hosts, peers). */
  readonly related?: readonly QaSubjectRef[];
  /** Deterministically rendered expected/reference value. */
  readonly expected?: string;
  /** Deterministically rendered actual/measured value. */
  readonly actual?: string;
  /** Evidence identities the finding is about, where applicable. */
  readonly evidenceRefs?: readonly string[];
  /** Epistemic context (passthrough; QA never rewrites epistemics). */
  readonly epistemic?: QaEpistemicContext;
  /** The deterministic reason (human-reviewable). */
  readonly detail: string;
}

/** Input to `makeFinding` (everything except the derived identity). */
export type QaFindingInput = Omit<QaFinding, "findingId">;

/** Derives the finding identity from the finding's canonical content. */
export function deriveFindingId(finding: QaFindingInput): string {
  const canonical = canonicalJsonString([
    "qa-finding/v1",
    finding.code,
    finding.family,
    finding.outcome,
    qaSubjectKey(finding.subject),
    (finding.related ?? []).map(qaSubjectKey),
    finding.expected ?? null,
    finding.actual ?? null,
    finding.evidenceRefs ?? null,
    finding.detail,
  ]);
  return sha256Hex(canonical);
}

/** Everything `makeFinding` needs from the caller (identity, family, severity and blocking are derived). */
export type QaFindingSeed = Omit<QaFindingInput, "family" | "severity" | "blocking"> & {
  /** The assurance profile the run executes under (drives the blocking policy). */
  readonly profile: AssuranceProfile;
};

/** Builds a finding, deriving identity, family, severity and blocking. */
export function makeFinding(input: QaFindingSeed): QaFinding {
  const family = CODE_FAMILY[input.code];
  if (family === undefined) {
    throw new Error(`unregistered finding code: ${String(input.code)}`);
  }
  const { profile, ...rest } = input;
  const finding: QaFindingInput = {
    ...rest,
    family,
    severity: severityForOutcome(input.outcome),
    blocking: isBlocking(input.outcome, profile),
  };
  return { ...finding, findingId: deriveFindingId(finding) };
}

/** The canonical total order over findings (report determinism). */
export function compareFindings(a: QaFinding, b: QaFinding): number {
  const aKey = qaSubjectKey(a.subject);
  const bKey = qaSubjectKey(b.subject);
  const aRelated = (a.related ?? []).map(qaSubjectKey).join("|");
  const bRelated = (b.related ?? []).map(qaSubjectKey).join("|");
  return (
    compareStrings(a.family, b.family) ||
    compareStrings(a.code, b.code) ||
    compareStrings(aKey, bKey) ||
    compareStrings(aRelated, bRelated) ||
    compareStrings(a.detail, b.detail) ||
    compareStrings(a.findingId, b.findingId)
  );
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
