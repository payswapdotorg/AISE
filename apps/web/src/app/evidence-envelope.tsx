/**
 * PROD-034 — the EVIDENCE ENVELOPE explainability component (issue #9 gap 3:
 * "Why this result?" at consequential Layer-2 decisions).
 *
 * The architecture-lock's Evidence Envelope rule, as a CALM, COMPACT
 * user-facing projection — NOT a debug console: at a consequential
 * decision the user can ask what the result rests on and get the
 * envelope's recorded sections —
 *
 *   evidence · observed facts · inferred assumptions · unknowns/evidence
 *   gaps · measurement uncertainty · deterministic checks · result/status
 *   · next action
 *
 * — each entry carrying its recorded basis, and each section that the
 * decision's records genuinely do not carry rendering the EXPLICIT
 * "none recorded on this record" line (absent is a state, never hidden,
 * never invented — the honest-states doctrine of every surface).
 *
 * PROD-028's hardened envelope semantics (the canonical
 * `CanonicalEvidenceEnvelope`) fix the section vocabulary; this module is
 * the PRESENTATION over whatever the decision's own records carry:
 *
 *  - {@link caseEvidenceEnvelope} — the CASE decision (an engineering
 *    case's diagnosis/status): the live case detail record's separate
 *    facts/inferences/missing-evidence arrays, or the demo pane view's
 *    recorded counts (honestly labeled when the individual records are
 *    server-side);
 *  - {@link readinessEvidenceEnvelope} — the READINESS decision (the
 *    task-flow bundle's RealitySummary verdict): the readiness
 *    authority's own status + detail, the evidence summary's ids and
 *    declared gaps, and the server's next best action.
 *
 * Determinism: pure functions + pure presentation; no clock, no
 * randomness, no IO, no React state.
 */

import type { ReactNode } from "react";
import { Card, DataBadge } from "./components";
import type { CaseDetailRecord } from "./api";
import type { CasePaneView } from "../shell";
import type { TaskFlowBundle } from "./task-contract";
import { plural, shortId } from "./format";

/* ------------------------------------------------------------------ */
/* The envelope view model (the canonical section vocabulary)           */
/* ------------------------------------------------------------------ */

/** One recorded envelope entry: the statement + its recorded basis. */
export interface EnvelopeEntry {
  readonly text: string;
  readonly basis: string;
}

/** The compact envelope view of one consequential decision. */
export interface EvidenceEnvelopeView {
  /** The decision's subject (the record the decision lives on). */
  readonly subjectRef: string;
  readonly subjectLabel: string;
  /** The question/task intent the decision answers (recorded, or null). */
  readonly question: EnvelopeEntry | null;
  /** Supporting evidence ids + revisions (verbatim record references). */
  readonly evidence: readonly EnvelopeEntry[];
  /** Observed/confirmed facts (separate from interpretation, always). */
  readonly facts: readonly EnvelopeEntry[];
  /** Explicit inferred assumptions (interpretations, labeled as such). */
  readonly assumptions: readonly EnvelopeEntry[];
  /** Unknowns / declared evidence gaps. */
  readonly unknowns: readonly EnvelopeEntry[];
  /** Measurement uncertainty (σ per recorded evidence/property). */
  readonly uncertainty: readonly EnvelopeEntry[];
  /** Deterministic checks/tools invoked (recorded outcomes only). */
  readonly checks: readonly EnvelopeEntry[];
  /** The result/claim and its status, verbatim. */
  readonly result: { readonly status: string; readonly claim: string } | null;
  /** The next recommended action, verbatim. */
  readonly nextAction: EnvelopeEntry | null;
}

/* ------------------------------------------------------------------ */
/* The composers (pure projections of the decision's own records)       */
/* ------------------------------------------------------------------ */

/**
 * The CASE decision's envelope — the LIVE case detail record (the route's
 * separate fact/inference arrays are the envelope's discipline made
 * structural: observations are facts, hypotheses are assumptions, declared
 * missing evidence is the unknowns section).
 */
export function caseEvidenceEnvelopeFromDetail(record: CaseDetailRecord): EvidenceEnvelopeView {
  const basis = `the case record ${record.caseId}`;
  const evidenceIds = new Set<string>();
  for (const observation of record.observations) {
    for (const id of observation.evidenceIds) {
      evidenceIds.add(id);
    }
  }
  for (const hypothesis of record.hypotheses) {
    for (const id of hypothesis.supportedByEvidenceIds) {
      evidenceIds.add(id);
    }
  }
  return {
    subjectRef: record.caseId,
    subjectLabel: "engineering case decision",
    question: {
      text: record.title,
      basis: `${basis} — the recorded title`,
    },
    evidence: [...evidenceIds].map((id) => ({
      text: `evidence ${shortId(id)}`,
      basis: `${basis} — cited by the case's observations/hypotheses`,
    })),
    facts:
      record.observations.length === 0
        ? []
        : record.observations.map((observation) => ({
            text:
              observation.note === undefined
                ? `observed on ${observation.nodeId} (${observation.observedAt})`
                : `${observation.note} — on ${observation.nodeId} (${observation.observedAt})`,
            basis:
              observation.evidenceIds.length === 0
                ? `${basis} — observation (no evidence id recorded)`
                : `${basis} — observation supported by ${observation.evidenceIds.map((id) => shortId(id)).join(", ")}`,
          })),
    assumptions:
      record.hypotheses.length === 0
        ? []
        : record.hypotheses.map((hypothesis) => ({
            text: `${hypothesis.statement} (status: ${hypothesis.status})`,
            basis:
              hypothesis.supportedByEvidenceIds.length === 0
                ? `${basis} — hypothesis with no supporting evidence recorded`
                : `${basis} — hypothesis supported by ${hypothesis.supportedByEvidenceIds.map((id) => shortId(id)).join(", ")}`,
          })),
    unknowns:
      record.missingEvidence.length === 0
        ? []
        : record.missingEvidence.map((missing) => ({
            text: `${missing.description} (${missing.status})`,
            basis: `${basis} — declared missing evidence`,
          })),
    // The case model's own design carries no sigma/uncertainty keys and no
    // deterministic-check records — the honest absence renders, never a
    // fabricated value (measurement uncertainty lives on the evidence/gap
    // records; deterministic checks on the validation records).
    uncertainty: [],
    checks: [],
    result: {
      status: record.status,
      claim: `case ${record.caseId} is ${record.status}`,
    },
    nextAction: null,
  };
}

/**
 * The CASE decision's envelope — the DEMO pane view (the frozen shell
 * fixture): the recorded counts and evidence ids render verbatim; the
 * individual observation/hypothesis records are server-side and are
 * stated as such (never fabricated into the demo).
 */
export function caseEvidenceEnvelopeFromPane(
  view: CasePaneView,
): EvidenceEnvelopeView {
  const basis = `the case pane view ${view.caseId}`;
  return {
    subjectRef: view.caseId,
    subjectLabel: "engineering case decision",
    question: {
      text: view.title.value,
      basis: `${basis} — the recorded title`,
    },
    evidence: view.evidenceIds.map((entry) => ({
      text: `evidence ${shortId(entry.value)}`,
      basis: `${basis} — linked evidence (verbatim id)`,
    })),
    facts:
      view.observationCount === 0
        ? []
        : [
            {
              text: `${plural(view.observationCount, "observation")} recorded — observed facts, kept separate from interpretation`,
              basis: `${basis} — the recorded observation count (the observation records themselves are server-side)`,
            },
          ],
    assumptions:
      view.hypothesisCount === 0
        ? []
        : [
            {
              text: `${plural(view.hypothesisCount, "hypothesis", "hypotheses")} recorded — interpretations, never facts`,
              basis: `${basis} — the recorded hypothesis count (the hypothesis records themselves are server-side)`,
            },
          ],
    unknowns:
      view.missingEvidenceCount === 0
        ? []
        : [
            {
              text: `${plural(view.missingEvidenceCount, "declared missing evidence", "declared missing evidence entries")} — open gaps the case names`,
              basis: `${basis} — the recorded missing-evidence count (the declarations themselves are server-side)`,
            },
          ],
    uncertainty: [],
    checks: [],
    result: {
      status: view.status.value,
      claim: `case ${view.caseId} is ${view.status.value}`,
    },
    nextAction: null,
  };
}

/**
 * The READINESS decision's envelope — the task-flow bundle (the demo
 * journey's Layer-2 verdict): the RealitySummary's readiness status +
 * detail (the readiness authority's own statement), the EvidenceSummary's
 * evidence ids and declared gaps, and the server's next best action.
 */
export function readinessEvidenceEnvelope(
  bundle: TaskFlowBundle,
): EvidenceEnvelopeView | null {
  if (bundle.reality === null) {
    return null;
  }
  const realityBasis = `the reality summary (model v${String(bundle.reality.modelVersion)})`;
  const evidence = bundle.evidence;
  return {
    subjectRef: bundle.reality.projectId,
    subjectLabel: "readiness decision",
    question: null,
    evidence:
      evidence === null
        ? []
        : evidence.evidenceContentIds.map((id) => ({
            text: `evidence ${shortId(id)}`,
            basis: "the evidence summary's recorded content ids",
          })),
    facts: [
      {
        text: `${plural(bundle.reality.objectCount, "object")} in the reality model (v${String(bundle.reality.modelVersion)})`,
        basis: `${realityBasis} — the recorded object count`,
      },
    ],
    assumptions: [],
    unknowns:
      evidence === null
        ? []
        : evidence.gaps.map((gap) => ({
            text: `${gap.kind} — ${gap.description}`,
            basis: `the evidence summary's declared gap ${gap.gapId}`,
          })),
    // The RealitySummary carries no per-property sigma and no check log —
    // the honest absence renders (σ lives on the gap/evidence records).
    uncertainty: [],
    checks: [],
    result: {
      status: bundle.reality.readinessStatus,
      claim:
        bundle.reality.readinessDetail === undefined
          ? "no readiness detail recorded on this record"
          : bundle.reality.readinessDetail,
    },
    nextAction:
      bundle.nextBestAction === null
        ? null
        : {
            text: `${bundle.nextBestAction.status} — ${bundle.nextBestAction.prompt}`,
            basis: `the server's NextBestAction ${bundle.nextBestAction.actionId}`,
          },
  };
}

/* ------------------------------------------------------------------ */
/* The card (calm, compact — the primary UI stays task-first)           */
/* ------------------------------------------------------------------ */

/** One envelope section row (entries, or the honest not-recorded line). */
function EnvelopeSection({
  label,
  hint,
  entries,
  emptyText,
}: {
  readonly label: string;
  readonly hint: string;
  readonly entries: readonly EnvelopeEntry[];
  readonly emptyText: string;
}): ReactNode {
  return (
    <div className="field" data-envelope-section={label}>
      <dt>
        {label} <span className="pane-foot">· {hint}</span>
      </dt>
      <dd>
        {entries.length === 0 ? (
          <p className="pane-foot" data-envelope-empty="true">
            {emptyText}
          </p>
        ) : (
          <ul className="notes-list">
            {entries.map((entry, index) => (
              <li key={index}>
                {entry.text}
                <span className="pane-foot"> basis: {entry.basis}</span>
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

/**
 * The compact "Why this result?" card: the decision's Evidence Envelope
 * as a calm explanation — every section visible, every entry with its
 * recorded basis, every absence explicit. Not a debug console: no raw
 * JSON, no internal ids beyond the records' own, no module topology.
 */
export function EvidenceEnvelopeCard({
  view,
  mode,
  title = "Why this result?",
}: {
  readonly view: EvidenceEnvelopeView;
  readonly mode: "demo" | "api";
  /** The card title (the surface frames the question; the records answer). */
  readonly title?: string;
}): ReactNode {
  return (
    <Card
      title={title}
      badge={<DataBadge mode={mode} />}
      meta={
        <span>
          what this{" "}
          <span className="mono">{view.subjectLabel}</span> (
          <span className="mono">{view.subjectRef}</span>) rests on — the
          Evidence Envelope sections, every absence explicit
        </span>
      }
    >
      <dl className="fields" data-envelope="true" data-envelope-subject={view.subjectRef}>
        {view.question === null ? null : (
          <div className="field" data-envelope-section="question">
            <dt>The question it answers</dt>
            <dd>
              {view.question.text}
              <span className="pane-foot"> basis: {view.question.basis}</span>
            </dd>
          </div>
        )}
        <EnvelopeSection
          label="Evidence"
          hint="the recorded evidence it rests on"
          entries={view.evidence}
          emptyText="No evidence recorded on this record."
        />
        <EnvelopeSection
          label="Observed facts"
          hint="directly observed/confirmed — never interpretation"
          entries={view.facts}
          emptyText="No observed facts recorded on this record."
        />
        <EnvelopeSection
          label="Assumptions"
          hint="inferred interpretations — labeled, never facts"
          entries={view.assumptions}
          emptyText="No inferred assumptions recorded on this record."
        />
        <EnvelopeSection
          label="Unknowns & evidence gaps"
          hint="what the record itself declares missing"
          entries={view.unknowns}
          emptyText="No evidence gaps declared on this record."
        />
        <EnvelopeSection
          label="Measurement uncertainty"
          hint="recorded σ per evidence/property"
          entries={view.uncertainty}
          emptyText="No measurement uncertainty recorded on this record (σ lives on the evidence/gap records — an absence is never ±0)."
        />
        <EnvelopeSection
          label="Deterministic checks"
          hint="recorded check outcomes invoked for this decision"
          entries={view.checks}
          emptyText="No deterministic checks recorded on this record."
        />
        {view.result === null ? null : (
          <div className="field" data-envelope-section="result">
            <dt>Result</dt>
            <dd data-envelope-status={view.result.status}>
              {/* The record's OWN status, verbatim — never an epistemic
                  upgrade (an in-review case is not rendered CONFIRMED). */}
              <span className="tag">{view.result.status}</span> {view.result.claim}
            </dd>
          </div>
        )}
        {view.nextAction === null ? null : (
          <div className="field" data-envelope-section="next-action">
            <dt>Next action</dt>
            <dd>
              {view.nextAction.text}
              <span className="pane-foot"> basis: {view.nextAction.basis}</span>
            </dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
