/**
 * PROD-002 — the Engineering Case surface (the "ENGINEERING CASE" step of the
 * golden journey): the project's engineering case — observations, hypotheses
 * and declared missing evidence kept SEPARATE — with its linked evidence
 * records and the recorded review outcome of any linked intervention
 * scenario (the viewer library's approval-reference vocabulary, verbatim).
 *
 * Honesty: observations are observed facts; hypotheses are interpretations
 * (never rendered as facts); missing evidence is an explicit inventory; the
 * review outcome is a Case-domain record relayed verbatim — approving a
 * scenario is a review decision, not an observed reality.
 */

import { useCallback } from "react";
import type { ReactNode } from "react";
import { useResource, type ResourceOutcome } from "../resource";
import { isDemoMode, useAppEnvironment } from "../environment";
import {
  describeApiFailure,
  loadCaseDetailLive,
  loadCaseSummariesLive,
  type CaseDetailRecord,
  type CaseSummaryRecord,
} from "../api";
import { demoCase, demoEvidenceList, demoScenario } from "../demo";
import type { CasePaneView, EvidencePaneView, SourceRef } from "../../shell";
import type { ViewerScenario } from "../../viewer";
import {
  Card,
  DataBadge,
  EmptyState,
  EpistemicBadge,
  Instant,
  ResourceView,
  SourceNote,
} from "../components";
import { ProjectSurfaceNav } from "../components";
import { formatRoute } from "../router";
import { plural, shortId } from "../format";

/** What the Engineering Case surface renders once loaded. */
export interface CaseData {
  readonly mode: "demo" | "api";
  readonly projectId: string;
  /** The demo dataset's records (null in live mode). */
  readonly demo: {
    readonly caseView: CasePaneView | null;
    readonly evidence: readonly EvidencePaneView[];
    readonly scenario: ViewerScenario | null;
  } | null;
  /** The live deployment's records (null in demo mode). */
  readonly live: {
    readonly cases: readonly CaseSummaryRecord[];
    readonly detail: CaseDetailRecord | null;
    readonly detailEndpoint: string;
  } | null;
}

/** The Engineering Case surface. */
export function EngineeringCase({ projectId }: { readonly projectId: string }): ReactNode {
  const environment = useAppEnvironment();
  const mode = environment.apiStatus?.mode ?? "probing";
  const load = useCallback(async (): Promise<ResourceOutcome<CaseData>> => {
    if (isDemoMode(environment) || environment.apiStatus === null) {
      return {
        kind: "ready",
        data: {
          mode: "demo",
          projectId,
          demo: {
            caseView: demoCase(projectId),
            evidence: demoEvidenceList(projectId),
            scenario: demoScenario(projectId),
          },
          live: null,
        },
      };
    }
    const summaries = await loadCaseSummariesLive(environment.fetchImpl);
    if (!summaries.ok) {
      return { kind: "error", message: describeApiFailure(summaries.failure) };
    }
    // The case summaries carry no project attribution in this API build —
    // the honest view is the deployment-wide list, stated as such.
    const first = summaries.cases[0] ?? null;
    const detail =
      first === null
        ? null
        : await loadCaseDetailLive(environment.fetchImpl, first.caseId);
    if (detail !== null && !detail.ok) {
      return { kind: "error", message: describeApiFailure(detail.failure) };
    }
    return {
      kind: "ready",
      data: {
        mode: "api",
        projectId,
        demo: null,
        live: {
          cases: summaries.cases,
          detail: detail === null ? null : detail.record,
          detailEndpoint: `/v1/cases${first === null ? "" : `/${first.caseId}`}`,
        },
      },
    };
  }, [environment, projectId]);

  const { state, reload } = useResource(`case:${projectId}:${mode}`, load);

  return (
    <>
      <div className="page-head">
        <p className="crumbs">
          <a href={formatRoute({ name: "projects" })}>Projects</a> /{" "}
          <a href={formatRoute({ name: "project", projectId })}>{projectId}</a>
        </p>
        <h1>Engineering Case</h1>
        <p>
          The case record keeps observations, hypotheses and declared missing
          evidence separate — an interpretation is never rendered as an
          observed fact.
        </p>
      </div>
      <ProjectSurfaceNav projectId={projectId} current="case" />
      <ResourceView
        state={state}
        loadingLabel="Loading the engineering case…"
        onRetry={reload}
        render={(data) => <CaseBody data={data} />}
      />
    </>
  );
}

export function CaseBody({ data }: { readonly data: CaseData }): ReactNode {
  if (data.demo !== null) {
    return <CaseDemo data={data} />;
  }
  return <CaseLive data={data} />;
}

function CaseDemo({ data }: { readonly data: CaseData }): ReactNode {
  const demo = data.demo;
  if (demo === null) {
    return null;
  }
  const caseView = demo.caseView;
  return (
    <>
      {caseView === null ? (
        <Card title="Engineering case" badge={<DataBadge mode="demo" />}>
          <EmptyState
            title="No engineering case recorded for this project"
            guidance="Cases are opened per project when a discrepancy needs engineering judgement — observations, hypotheses and missing evidence are then recorded on the case. The demo dataset holds a case only for the pilot project."
          />
        </Card>
      ) : (
        <CaseSummaryCard
          caseId={caseView.caseId}
          title={caseView.title.value}
          status={caseView.status.value}
          observationCount={caseView.observationCount}
          hypothesisCount={caseView.hypothesisCount}
          missingEvidenceCount={caseView.missingEvidenceCount}
          source={caseView.source}
          mode={data.mode}
        />
      )}
      <ScenarioReviewCard scenario={demo.scenario} mode={data.mode} />
      {caseView === null ? null : (
        <CaseEvidenceCard
          evidence={demo.evidence}
          linkedIds={caseView.evidenceIds.map((entry) => entry.value)}
          mode={data.mode}
        />
      )}
    </>
  );
}

function CaseSummaryCard({
  caseId,
  title,
  status,
  observationCount,
  hypothesisCount,
  missingEvidenceCount,
  source,
  mode,
}: {
  readonly caseId: string;
  readonly title: string;
  readonly status: string;
  readonly observationCount: number;
  readonly hypothesisCount: number;
  readonly missingEvidenceCount: number;
  readonly source: SourceRef;
  readonly mode: "demo" | "api";
}): ReactNode {
  return (
    <Card
      title={title}
      badge={<DataBadge mode={mode} />}
      meta={
        <span>
          case <span className="mono">{caseId}</span> · status {status} ·{" "}
          <SourceNote source={source} />
        </span>
      }
    >
      <div className="stat-row">
        <div className="stat">
          <div className="stat-value">{String(observationCount)}</div>
          <div className="stat-label">observations (observed facts)</div>
        </div>
        <div className="stat">
          <div className="stat-value">{String(hypothesisCount)}</div>
          <div className="stat-label">hypotheses (interpretations)</div>
        </div>
        <div className="stat">
          <div className="stat-value">{String(missingEvidenceCount)}</div>
          <div className="stat-label">declared missing evidence</div>
        </div>
      </div>
      <p className="pane-foot">
        Observations state what was seen (with evidence); hypotheses state
        candidate explanations — supported, contested or rejected — and are
        never presented as observed facts. Missing evidence is the explicit
        inventory of what the case still needs.
      </p>
    </Card>
  );
}

function ScenarioReviewCard({
  scenario,
  mode,
}: {
  readonly scenario: ViewerScenario | null;
  readonly mode: "demo" | "api";
}): ReactNode {
  if (scenario === null) {
    return (
      <Card title="Linked intervention scenario" badge={<DataBadge mode={mode} />}>
        <EmptyState
          title="No intervention scenario linked to this project"
          guidance="When a scenario is recorded for this project, its status timeline and its recorded review outcome (the Case-domain approval reference) appear here — verbatim."
          action={
            <a
              className="button"
              href={formatRoute({
                name: "intervention",
                projectId: "project-zurich-hq",
                query: {},
              })}
            >
              Open the demo scenario project
            </a>
          }
        />
      </Card>
    );
  }
  const approval = scenario.approvalReference ?? null;
  return (
    <Card
      title="Linked intervention scenario"
      badge={<DataBadge mode={mode} />}
      meta={
        <span>
          scenario <span className="mono">{scenario.scenarioId}</span> · “{scenario.title}” ·
          status {scenario.status}
        </span>
      }
    >
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Recorded status</th>
              <th>At</th>
            </tr>
          </thead>
          <tbody>
            {scenario.transitions.map((transition, index) => (
              <tr key={index}>
                <td>{transition.status}</td>
                <td>
                  <Instant iso={transition.at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {approval === null ? (
        <p className="pane-foot">
          No review outcome recorded on this scenario yet — an unreviewed
          proposal stays a proposal.
        </p>
      ) : (
        <div className="callout callout-warning">
          <p>
            Recorded review outcome (relayed verbatim — a review decision, not
            an observed reality): decision <strong>{approval.reviewDecision}</strong>{" "}
            on case <span className="mono">{approval.caseId}</span>, reviewed{" "}
            <Instant iso={approval.reviewedAt} />.
          </p>
        </div>
      )}
    </Card>
  );
}

function CaseEvidenceCard({
  evidence,
  linkedIds,
  mode,
}: {
  readonly evidence: readonly EvidencePaneView[];
  readonly linkedIds: readonly string[];
  readonly mode: "demo" | "api";
}): ReactNode {
  const linked = evidence.filter((record) => linkedIds.includes(record.evidenceId));
  return (
    <Card
      title="Case evidence"
      badge={<DataBadge mode={mode} />}
      meta={<span>the evidence records this case links — verbatim ids</span>}
    >
      {linked.length === 0 ? (
        <EmptyState
          title="This case links no evidence records"
          guidance="Cases link evidence records by their content ids; this one carries none in the current dataset."
        />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Evidence</th>
                <th>Method</th>
                <th>Captured</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {linked.map((record) => (
                <tr key={record.evidenceId}>
                  <td className="mono" title={record.evidenceId}>
                    {shortId(record.evidenceId)}
                  </td>
                  <td>{record.acquisitionMethod.value}</td>
                  <td>
                    <Instant iso={record.capturedAt.value} />
                  </td>
                  <td>
                    {record.invalidationReason === null ? (
                      <span className="tag">valid</span>
                    ) : (
                      <span className="tag tag-invalidated">
                        invalidated — {record.invalidationReason.value}
                      </span>
                    )}
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

function CaseLive({ data }: { readonly data: CaseData }): ReactNode {
  const live = data.live;
  if (live === null) {
    return null;
  }
  return (
    <>
      <Card
        title="Engineering cases"
        badge={<DataBadge mode="api" />}
        meta={
          <span>
            the deployment-wide case list — the case summaries carry no project
            attribution in this API build, so the list is shown as recorded
          </span>
        }
      >
        {live.cases.length === 0 ? (
          <EmptyState
            title="No engineering cases recorded in this deployment"
            guidance="Cases are recorded through the AISE API (POST /v1/cases). Once the first case exists it appears here with its observations, hypotheses and declared missing evidence."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Observations</th>
                  <th>Hypotheses</th>
                  <th>Missing evidence (open)</th>
                </tr>
              </thead>
              <tbody>
                {live.cases.map((summary) => (
                  <tr key={summary.caseId}>
                    <td className="mono">{summary.caseId}</td>
                    <td>{summary.title}</td>
                    <td>{summary.status}</td>
                    <td>{String(summary.counts.observations)}</td>
                    <td>{String(summary.counts.hypotheses)}</td>
                    <td>
                      {String(summary.counts.openMissingEvidence)} of{" "}
                      {String(summary.counts.missingEvidence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card
        title="Case detail"
        meta={
          live.detail === null ? undefined : (
            <span>
              case <span className="mono">{live.detail.caseId}</span> · loaded from{" "}
              <span className="mono">{live.detailEndpoint}</span>
            </span>
          )
        }
      >
        {live.detail === null ? (
          <EmptyState
            title="No case detail to show"
            guidance="This deployment records no cases yet — the detail view appears once a case exists."
          />
        ) : (
          <CaseDetailRecordView record={live.detail} />
        )}
      </Card>
    </>
  );
}

/** The full live case record: observations / hypotheses / missing evidence. */
function CaseDetailRecordView({ record }: { readonly record: CaseDetailRecord }): ReactNode {
  return (
    <>
      <h3 className="pane-head">Observations — observed facts</h3>
      {record.observations.length === 0 ? (
        <p className="pane-foot">none recorded</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Node</th>
                <th>Observed at</th>
                <th>Evidence</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {record.observations.map((observation, index) => (
                <tr key={index}>
                  <td className="mono">{observation.nodeId}</td>
                  <td>
                    <Instant iso={observation.observedAt} />
                  </td>
                  <td>
                    {observation.evidenceIds.length === 0
                      ? "—"
                      : observation.evidenceIds.map((id) => shortId(id)).join(", ")}
                  </td>
                  <td>{observation.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3 className="pane-head">Hypotheses — interpretations, not facts</h3>
      {record.hypotheses.length === 0 ? (
        <p className="pane-foot">none recorded</p>
      ) : (
        <ul className="notes-list">
          {record.hypotheses.map((hypothesis, index) => (
            <li key={index}>
              <EpistemicBadge status="INFERRED" /> {hypothesis.statement} — status{" "}
              {hypothesis.status}
              {hypothesis.supportedByEvidenceIds.length === 0
                ? " (no supporting evidence recorded)"
                : ` (supported by ${plural(hypothesis.supportedByEvidenceIds.length, "evidence record")})`}
            </li>
          ))}
        </ul>
      )}
      <h3 className="pane-head">Declared missing evidence</h3>
      {record.missingEvidence.length === 0 ? (
        <p className="pane-foot">none declared</p>
      ) : (
        <ul className="notes-list">
          {record.missingEvidence.map((missing, index) => (
            <li key={index}>
              <span className={`tag tag-missing-${missing.status === "open" ? "open" : "closed"}`}>
                {missing.status}
              </span>{" "}
              {missing.description}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
