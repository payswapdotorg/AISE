/**
 * PROD-018 — the COMPOSITION PRESENTATION layer (the parity cards).
 *
 * The competitive-parity composition's PRESENTATIONAL components — pure
 * projections over the parity models (cross-links, canonical actions,
 * plan-vs-reality, boundary labels) and the decoded contract objects:
 *
 *  - {@link CanonicalActionBar} — the four canonical actions (Capture →
 *    Investigate → Build solution → Review outcome) labeling every
 *    project's entry points (the terminology normalization made visible);
 *  - {@link CrossLinkList}/{@link CaseCrossLinksCard}/
 *    {@link BoqLineBridgesCard} — the capture → issue → BOQ navigation
 *    (resolvable targets are real routes; unresolved targets state the
 *    recorded reason);
 *  - {@link PlanRealityCard}/{@link BeforeAfterCard} — the plan-vs-reality
 *    sides and the executed-work before/after pairs;
 *  - {@link BoundaryLabelsCard} — uncertainty/provenance/verification
 *    labels at the consequential boundaries;
 *  - {@link TaskCompositionPanel}/{@link TaskCompositionPanelBody} — the
 *    composed task-first journey with honest per-step states and
 *    evidence-gap next actions (the adapter contract's honest-states
 *    doctrine extended to the composition layer).
 *
 * PRESENTATION ONLY: every semantic statement comes from the decoded
 * records/contract objects (rendered verbatim); this layer owns layout
 * and wording of guidance — never readiness, sufficiency, authorization
 * or measurement truth.
 */

import type { ReactNode } from "react";
import type {
  BoqPaneView,
  CasePaneView,
  EvidencePaneView,
  RealityPaneView,
} from "../shell";
import type { BoqLensInput, BoqLensItem } from "../boqlens";
import type { WorkspaceInput } from "../workspace";
import { Card, DataBadge, EmptyState } from "../app/components";
import { plural } from "../app/format";
import {
  boqLineCrossLinks,
  captureCrossLinks,
  issueCrossLinks,
  type CrossLink,
} from "./cross-links";
import {
  CANONICAL_ACTIONS,
  canonicalActionHref,
  nextActionSuggestions,
  type CanonicalActionDefinition,
  type NextActionSuggestion,
} from "./action-labels";
import type { PlanRealityView, BeforeAfterPair } from "./plan-reality";
import type { BoundaryLabelSet } from "./boundary-labels";
import type { TaskFlowResourceData } from "../app/task-first";

/* ------------------------------------------------------------------ */
/* The canonical action bar (the four-journey vocabulary)              */
/* ------------------------------------------------------------------ */

/**
 * The four canonical actions as the project's journey entry points —
 * the same four labels everywhere (entry points, navigation, next-step
 * suggestions), rendered over the app's real routes.
 */
export function CanonicalActionBar({
  projectId,
  current,
}: {
  readonly projectId: string;
  /** The canonical action id of the surface rendering the bar (optional). */
  readonly current?: string;
}): ReactNode {
  return (
    <nav className="toolbar" aria-label="The four actions of the journey" data-canonical-actions="true">
      {CANONICAL_ACTIONS.map((action) => (
        <a
          key={action.action}
          className="button button-secondary button-small"
          href={canonicalActionHref(action, projectId)}
          aria-current={current === action.action ? "true" : undefined}
          title={`${action.oneLiner} — ${action.honestStates}`}
          data-action={action.action}
        >
          {action.label}
        </a>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Cross-links (capture → issue → BOQ)                                  */
/* ------------------------------------------------------------------ */

/** Render one cross-link: a real route, or the honest unresolved state. */
export function CrossLinkEntry({ link }: { readonly link: CrossLink }): ReactNode {
  return (
    <li data-cross-link-kind={link.kind} data-resolved={link.target.kind}>
      {link.target.kind === "route" ? (
        <a href={link.target.href}>{link.target.label}</a>
      ) : (
        <span className="task-strip-blocker">
          {link.target.label} — <strong>{link.target.reason}</strong>
        </span>
      )}
      <span className="pane-foot"> basis: {link.basis}</span>
    </li>
  );
}

/** A list of cross-links with its recorded basis per entry. */
export function CrossLinkList({ links }: { readonly links: readonly CrossLink[] }): ReactNode {
  if (links.length === 0) {
    return (
      <p className="pane-foot">
        No recorded cross-links — links are composed only from recorded
        references, never inferred.
      </p>
    );
  }
  return (
    <ul className="notes-list" data-cross-links="true">
      {links.map((link, index) => (
        <CrossLinkEntry key={`${link.kind}:${link.fromId}:${String(index)}`} link={link} />
      ))}
    </ul>
  );
}

/** One capture's composed cross-links (its issues + derived quantities). */
export function CaptureCrossLinksCard({
  projectId,
  capture,
  caseView,
  boqImport,
  lens,
  mode,
}: {
  readonly projectId: string;
  readonly capture: EvidencePaneView;
  readonly caseView: CasePaneView | null;
  readonly boqImport: BoqPaneView | null;
  readonly lens: BoqLensInput | null;
  readonly mode: "demo" | "api";
}): ReactNode {
  const links = captureCrossLinks(projectId, capture, caseView, boqImport, lens);
  return (
    <Card
      title="From this capture"
      badge={<DataBadge mode={mode} />}
      meta={
        <span>
          the issues and quantities the records derive from this capture —
          composed joins, never inferences
        </span>
      }
    >
      <CrossLinkList links={links} />
    </Card>
  );
}

/** One issue's composed cross-links (its evidence + affected BOQ lines). */
export function CaseCrossLinksCard({
  projectId,
  caseView,
  evidence,
  reality,
  lens,
  mode,
}: {
  readonly projectId: string;
  readonly caseView: CasePaneView;
  readonly evidence: readonly EvidencePaneView[];
  readonly reality: RealityPaneView | null;
  readonly lens: BoqLensInput | null;
  readonly mode: "demo" | "api";
}): ReactNode {
  const links = issueCrossLinks(projectId, caseView, evidence, reality, lens);
  return (
    <Card
      title="From this issue"
      badge={<DataBadge mode={mode} />}
      meta={
        <span>
          its evidence and its affected BOQ lines — the affected-quantity join
          runs through recorded case evidence and mapping records only
        </span>
      }
    >
      <CrossLinkList links={links} />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* The BOQ line action bridges                                          */
/* ------------------------------------------------------------------ */

/**
 * ONE BOQ QUANTITY LINE's action bridges (the BOQ Lens composition):
 * its spatial context (plan nodes), its captures (the source document +
 * the geometry evidence), its issues (the honest join) — plus the
 * consequential-boundary labels the quantity carries (uncertainty,
 * provenance, source of record).
 */
export function BoqLineBridgesCard({
  projectId,
  item,
  boqImport,
  workspace,
  caseViews,
  boundaryLabels,
  mode,
}: {
  readonly projectId: string;
  readonly item: BoqLensItem;
  readonly boqImport: BoqPaneView | null;
  readonly workspace: WorkspaceInput | null;
  readonly caseViews: readonly CasePaneView[];
  readonly boundaryLabels: BoundaryLabelSet;
  readonly mode: "demo" | "api";
}): ReactNode {
  const links = boqLineCrossLinks(projectId, item, boqImport, workspace, caseViews);
  return (
    <Card
      title={`Action bridges — row ${String(item.rowNumber)}`}
      badge={<DataBadge mode={mode} />}
      meta={
        <span>
          from this quantity to its evidence, its case and its next actions —
          every bridge is a recorded reference
        </span>
      }
    >
      <p className="pane-foot">
        The row&apos;s verbatim text: <span className="verbatim">{item.originalText}</span>
      </p>
      <CrossLinkList links={links} />
      <div className="callout" data-boundary="quantity">
        <strong>At this consequential boundary:</strong>
        <BoundaryLabelsList set={boundaryLabels} />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Plan-vs-reality + before/after                                       */
/* ------------------------------------------------------------------ */

/** The plan-vs-reality navigation card (both sides, honestly distinct). */
export function PlanRealityCard({ view }: { readonly view: PlanRealityView }): ReactNode {
  return (
    <Card
      title="Plan vs reality"
      meta={<span>easy access to both sides of this project — different records, honestly distinct</span>}
    >
      <div className="pane-grid" data-card-kind="plan-reality">
        <PlanRealitySide side={view.plan} />
        <PlanRealitySide side={view.reality} />
      </div>
      <p className="pane-foot">{view.note}</p>
    </Card>
  );
}

function PlanRealitySide({
  side,
}: {
  readonly side: PlanRealityView["plan"];
}): ReactNode {
  return (
    <div className="pane" data-side={side === null ? "absent" : side.side}>
      {side === null ? (
        <EmptyState
          title="No plan records for this project"
          guidance="No pinned projection workspace or intervention scenario is recorded for this project yet — an honest empty state, never borrowed data. The reality side below stays whatever the records state."
        />
      ) : (
        <>
          <div className="pane-head">
            {side.title}
          </div>
          <p className={side.side === "plan" ? "pane-foot" : "pane-foot"}>
            <span
              className={
                side.side === "plan"
                  ? "tag tag-mapping-ambiguous"
                  : "tag tag-mapping-mapped"
              }
            >
              {side.side === "plan" ? "plan" : "reality"}
            </span>{" "}
            <span className="mono">{side.recordId}</span>
          </p>
          <ul className="notes-list">
            {side.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          <p className="pane-foot">{side.epistemicStatement}</p>
          <div className="toolbar">
            <a className="button button-secondary button-small" href={side.href}>
              Open the {side.side === "plan" ? "plan" : "reality"} view
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/** The executed-work before/after pairs (recorded outcomes only). */
export function BeforeAfterCard({
  pairs,
  mode,
}: {
  readonly pairs: readonly BeforeAfterPair[];
  readonly mode: "demo" | "api";
}): ReactNode {
  return (
    <Card
      title="Before / after"
      badge={<DataBadge mode={mode} />}
      meta={<span>executed work with recorded outcomes — a proposal without post-work evidence never appears here as an outcome</span>}
    >
      {pairs.length === 0 ? (
        <EmptyState
          title="No before/after pairs recorded for this project"
          guidance="Pairs are composed only from recorded outcome records (the task-flow outcome summary or the executions/comparisons namespaces). Record an execution and its outcome to compose the first pair."
        />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Before</th>
                <th>After</th>
                <th>Post-work evidence</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair) => (
                <tr key={pair.pairId} data-pair-id={pair.pairId}>
                  <td>
                    {pair.label}
                    {pair.comparisonAvailable ? (
                      <span className="tag tag-mapping-mapped"> comparison available</span>
                    ) : (
                      <span className="tag tag-missing-open"> no comparison recorded</span>
                    )}
                  </td>
                  <td>
                    <strong>{pair.before.label}</strong>
                    <br />
                    <span className="mono">{pair.before.recordId}</span>
                    <br />
                    {pair.before.state}
                  </td>
                  <td>
                    <strong>{pair.after.label}</strong>
                    <br />
                    <span className="mono">{pair.after.recordId}</span>
                    <br />
                    {pair.after.state}
                  </td>
                  <td>
                    {pair.evidenceRefs.length === 0
                      ? "—"
                      : pair.evidenceRefs.map((ref) => (
                          <span key={ref} className="mono" title={ref}>
                            {ref.slice(0, 8)}…{" "}
                          </span>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Boundary labels                                                      */
/* ------------------------------------------------------------------ */

/** One boundary's label list (the recorded labels, each with its basis). */
export function BoundaryLabelsList({ set }: { readonly set: BoundaryLabelSet }): ReactNode {
  if (set.labels.length === 0) {
    return (
      <p className="pane-foot">
        No labels recorded at this boundary — an absent label is a state,
        never a default.
      </p>
    );
  }
  return (
    <ul className="notes-list" data-boundary-kind={set.boundary}>
      {set.labels.map((label, index) => (
        <li key={index} data-label-family={label.family}>
          <span
            className={
              label.family === "uncertainty"
                ? "tag tag-ambiguous"
                : label.family === "verification"
                  ? "tag tag-mapping-mapped"
                  : label.family === "epistemic"
                    ? "tag tag-mapping-ambiguous"
                    : "tag tag-derived"
            }
          >
            {label.family}
          </span>{" "}
          {label.text}
          <span className="pane-foot"> ({label.basis})</span>
        </li>
      ))}
    </ul>
  );
}

/** The consequential-boundary labels card (one or more boundaries). */
export function BoundaryLabelsCard({
  sets,
}: {
  readonly sets: readonly BoundaryLabelSet[];
}): ReactNode {
  return (
    <Card
      title="Uncertainty, provenance and verification at this boundary"
      meta={
        <span>
          the labels the records already carry — collected here, never
          invented
        </span>
      }
    >
      {sets.map((set) => (
        <div key={set.boundary} data-boundary={set.boundary}>
          <h3 className="pane-head">The {set.boundary} boundary</h3>
          <BoundaryLabelsList set={set} />
        </div>
      ))}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* The task-first composition panel                                     */
/* ------------------------------------------------------------------ */

/** One canonical action step's honest state (from the decoded bundle). */
export interface ComposedJourneyStep {
  readonly action: CanonicalActionDefinition;
  readonly href: string;
  /** present: a record answers this step; absent: the explicit gap state. */
  readonly state: "present" | "absent";
  /** Honest one-line summary of the record (or the gap). */
  readonly summary: string;
}

/** The composed journey + gap next actions of one project's current task. */
export interface TaskCompositionView {
  readonly projectId: string;
  readonly steps: readonly ComposedJourneyStep[];
  readonly suggestions: readonly NextActionSuggestion[];
}

/** Assemble the composed-journey view from a decoded task-flow bundle. */
export function taskCompositionView(
  data: TaskFlowResourceData,
): TaskCompositionView | null {
  const bundle = data.bundle;
  if (bundle === null) {
    return null;
  }
  const step = (
    action: CanonicalActionDefinition,
    present: boolean,
    summary: string,
  ): ComposedJourneyStep => ({
    action,
    href: canonicalActionHref(action, data.projectId),
    state: present ? "present" : "absent",
    summary,
  });
  const evidenceSummary =
    bundle.evidence === null
      ? "no evidence summary recorded for this project's task yet"
      : `${plural(bundle.evidence.totalItems, "evidence item")} · ${plural(bundle.evidence.gaps.length, "declared gap")}`;
  const caseSummary =
    bundle.caseSummary === null
      ? "no engineering case summary recorded yet"
      : `${bundle.caseSummary.status} · ${plural(bundle.caseSummary.observationCount, "observation")}`;
  const scenarioSummary =
    bundle.scenario === null
      ? "no intervention scenario recorded yet"
      : `v${String(bundle.scenario.version)} · ${bundle.scenario.epistemicState} · approval ${bundle.scenario.approvalState}`;
  const outcomeSummary =
    bundle.outcome === null
      ? "no outcome summary recorded yet"
      : `${bundle.outcome.epistemicState} · ${plural(bundle.outcome.postWorkEvidenceContentIds.length, "post-work evidence item")}`;
  return {
    projectId: data.projectId,
    steps: [
      step(CANONICAL_ACTIONS[0]!, bundle.evidence !== null, evidenceSummary),
      step(CANONICAL_ACTIONS[1]!, bundle.caseSummary !== null, caseSummary),
      step(CANONICAL_ACTIONS[2]!, bundle.scenario !== null, scenarioSummary),
      step(CANONICAL_ACTIONS[3]!, bundle.outcome !== null, outcomeSummary),
    ],
    suggestions: nextActionSuggestions(
      data.projectId,
      bundle.evidence,
      bundle.nextBestAction,
    ),
  };
}

/** The composed task-first panel body (exported for static render tests —
 * a pure projection of the decoded bundle): the four canonical actions
 * with honest present/absent states, and the evidence-gap next actions as
 * typed, inspectable suggestions. The hook-driven wrapper lives in
 * task-composition.tsx (surfaces render that one).
 */
export function TaskCompositionPanelBody({
  data,
}: {
  readonly data: TaskFlowResourceData;
}): ReactNode {
  const view = taskCompositionView(data);
  if (view === null) {
    return (
      <Card title="The composed journey" badge={<DataBadge mode={data.mode} />}>
        <EmptyState
          title="No task-flow objects recorded for this project"
          guidance="The composed journey renders from the server's task-flow objects (context, evidence, case, scenario, outcome summaries). None are recorded for this project yet."
        />
      </Card>
    );
  }
  return (
    <Card
      title="The composed journey"
      badge={<DataBadge mode={data.mode} />}
      meta={
        <span>
          the four actions with honest per-step states — absent is a state,
          never an error
        </span>
      }
    >
      <ol className="journey" data-composed-steps="true" data-composed-journey="true">
        {view.steps.map((step, index) => (
          <li key={step.action.action}>
            <span className="journey-index" aria-hidden="true">
              {String(index + 1)}
            </span>
            <span className="journey-body">
              <a href={step.href}>{step.action.label}</a>
              <span className="journey-hint">{step.action.oneLiner}</span>
              <span className="pane-foot" data-step-state={step.state}>
                {step.state === "present"
                  ? step.summary
                  : `no record for this step yet — ${step.summary}`}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <h3 className="pane-head">Next actions the records suggest</h3>
      {view.suggestions.length === 0 ? (
        <p className="pane-foot">
          No next action is recorded or derivable — the server&apos;s
          next-best-action and the evidence summary&apos;s declared gaps
          would appear here; the composition never invents one.
        </p>
      ) : (
        <ul className="notes-list" data-suggestions="true">
          {view.suggestions.map((suggestion) => (
            <li key={suggestion.suggestionId} data-suggestion-state={suggestion.state}>
              <span
                className={
                  suggestion.state === "blocked" || suggestion.state === "gap-missing"
                    ? "tag tag-missing-open"
                    : suggestion.state === "gap-weak"
                      ? "tag tag-ambiguous"
                      : "tag tag-mapping-mapped"
                }
              >
                {suggestion.action.label} · {suggestion.state}
              </span>{" "}
              {suggestion.text}{" "}
              <a href={suggestion.href} className="button button-secondary button-small">
                {suggestion.action.label}
              </a>
              <span className="pane-foot"> basis: {suggestion.basis}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
