/**
 * PROD-017 — the task-first browser adapter's PRESENTATION layer.
 *
 * The React surface of the golden journey (task-first, not module-first):
 *
 *  - {@link TaskFirstLanding} — the entry experience: "What do you need to
 *    do?" (typed task selection → a `TaskIntent` wire object, W-R3), the
 *    open/create-project entrypoints and the current task's journey;
 *  - {@link TaskFlowPanel} — the full task-first view: the server's
 *    NextBestAction (actionable prompt or EXPLICIT blocked reason,
 *    verbatim), the AuthorizationContext grants + typed denials (W-R1),
 *    the platform-honesty negotiation (blocked → the reason, never a
 *    pretend-actionable affordance) and the golden journey steps with
 *    honest record summaries;
 *  - {@link TaskFlowStrip} — the compact next-action strip EVERY primary
 *    screen exposes (the acceptance rule): the NBA status/prompt or the
 *    explicit blocked reason, one link into the journey;
 *  - {@link TaskIntentForm} — the typed task-intent authoring form
 *    (live-only submission: the server answers with the authoritative
 *    OperationResult; demo mode renders the honest never-fabricate notice).
 *
 * EXPLICIT STATES EVERYWHERE (never blank, never generic): loading
 * skeletons, the honest empty state (no task-flow objects for this
 * project), the error state with retry, the unavailable-provider state
 * (this deployment does not serve the adapter task-flow objects) and the
 * permission state (authorization denials rendered verbatim).
 *
 * PRESENTATION ONLY: every semantic statement comes from the decoded
 * contract objects (rendered verbatim); this layer owns layout, wording of
 * guidance and navigation affordances — never readiness, sufficiency,
 * authorization or measurement truth.
 */

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TASK_TYPES } from "@aise/adapter-contract";
import { useResource, type ResourceOutcome, type ResourceState } from "./resource";
import { isDemoMode, useAppEnvironment } from "./environment";
import {
  describeApiFailure,
  isNotFoundHttp,
  loadTaskFlowLive,
  submitTaskIntentLive,
} from "./api";
import {
  taskIntentFromSelection,
  validateTaskIntentIdentity,
  validateTaskSelectionDraft,
  type TaskSelectionDraft,
} from "./create-forms";
import {
  taskFlowView,
  operationResultView,
  type TaskFlowView,
  type OperationResultView,
} from "./task-flow";
import { DEMO_TASK_PROJECT_ID, demoTaskFlowBundle } from "./task-dataset";
import {
  Card,
  DataBadge,
  EmptyState,
  Instant,
  ResourceView,
} from "./components";
import { SemanticObjectsAudit } from "./contract-objects";
import { BROWSER_ADAPTER_PROFILE } from "./adapter-profile";
import type { TaskFlowBundle } from "./task-contract";
import {
  EvidenceEnvelopeCard,
  readinessEvidenceEnvelope,
} from "./evidence-envelope";
import { formatRoute } from "./router";
import {
  CanonicalActionBar,
  TaskCompositionPanelBody,
} from "../parity/components";

/* ------------------------------------------------------------------ */
/* The task-flow resource                                              */
/* ------------------------------------------------------------------ */

/** What the task-flow resource carries once loaded. */
export interface TaskFlowResourceData {
  readonly mode: "demo" | "api";
  readonly projectId: string;
  /** The assembled view (null = the honest empty state for this project). */
  readonly view: TaskFlowView | null;
  /** The decoded bundle (the audit card renders the objects verbatim). */
  readonly bundle: TaskFlowBundle | null;
}

/** The honest not-served reason (live 404 on the adapter task-flow route). */
function notServedReason(): string {
  return "this deployment answers the API but does not serve the task-flow adapter contract objects (/v1/adapter/projects/:id/task-flow answered HTTP 404)";
}

function notServedImpact(): string {
  return "the task-first journey cannot run on live records here; the committed demo task journey below remains executable and is badged demo — never presented as live authority";
}

/**
 * The task-flow loader (the explicit-state machine's data leg):
 *
 *  - demo mode (API unavailable) → the committed demo journey for the
 *    corpus project, the honest empty state for every other project;
 *  - live mode → the same-origin joined task-flow GET; a 404 is the
 *    EXPLICIT unavailable-provider state (the honest reason + impact);
 *  - every other failure → the error state (typed detail, retryable).
 */
function loadTaskFlow(
  environment: ReturnType<typeof useAppEnvironment>,
  projectId: string,
): () => Promise<ResourceOutcome<TaskFlowResourceData>> {
  return async () => {
    if (isDemoMode(environment) || environment.apiStatus === null) {
      if (projectId !== DEMO_TASK_PROJECT_ID) {
        return {
          kind: "ready" as const,
          data: { mode: "demo" as const, projectId, view: null, bundle: null },
        };
      }
      const bundle = demoTaskFlowBundle();
      return {
        kind: "ready" as const,
        data: {
          mode: "demo" as const,
          projectId,
          view: taskFlowView(bundle, projectId),
          bundle,
        },
      };
    }
    const result = await loadTaskFlowLive(environment.fetchImpl, projectId);
    if (result.ok) {
      return {
        kind: "ready" as const,
        data: {
          mode: "api" as const,
          projectId,
          view: taskFlowView(result.flow, projectId),
          bundle: result.flow,
        },
      };
    }
    if (isNotFoundHttp(result.failure)) {
      return { kind: "unavailable" as const, reason: notServedReason(), impact: notServedImpact() };
    }
    return { kind: "error" as const, message: describeApiFailure(result.failure) };
  };
}

/** The task-flow resource hook (keyed by project + API mode). */
export function useTaskFlow(
  projectId: string,
): {
  readonly state: ResourceState<TaskFlowResourceData>;
  readonly reload: () => void;
} {
  const environment = useAppEnvironment();
  const mode = environment.apiStatus?.mode ?? "probing";
  const load = useMemo(
    () => loadTaskFlow(environment, projectId),
    // The loader captures the environment (transport + mode); the resource
    // key re-runs it when either changes.
    [environment.fetchImpl, mode, projectId],
  );
  return useResource(`task-flow:${projectId}:${mode}`, load);
}

/* ------------------------------------------------------------------ */
/* The next-best-action panel (verbatim server statements)             */
/* ------------------------------------------------------------------ */

/** Render the server's NextBestAction — prompt, status and blockers verbatim. */
export function NextBestActionPanel({
  view,
  mode,
}: {
  readonly view: TaskFlowView;
  readonly mode: "demo" | "api";
}): ReactNode {
  const action = view.nextBestAction;
  return (
    <Card
      title="Next best action"
      badge={<DataBadge mode={mode} />}
      meta={
        <span>
          the server-stated next step of task{" "}
          <span className="mono">{action === null ? "—" : action.taskRef}</span>
        </span>
      }
    >
      {action === null ? (
        <EmptyState
          title="No next-best-action recorded for this task"
          guidance="The task-flow objects for this project carry no next-best-action yet. The server computes it from the task, the known evidence and the declared gaps — the adapter never invents one."
        />
      ) : (
        <>
          <p data-nba-status={action.status} data-nba-kind={action.kind}>
            <span
              className={action.status === "blocked" ? "tag tag-missing-open" : "tag tag-mapping-mapped"}
            >
              {action.status}
            </span>{" "}
            <span>{action.prompt}</span>
          </p>
          {action.blockers.length === 0 ? null : (
            <ul className="notes-list" data-nba-blockers="true">
              {action.blockers.map((blocker) => (
                <li key={blocker.reasonCode}>
                  <strong className="mono">{blocker.reasonCode}</strong> — {blocker.detail}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

/** Render the AuthorizationContext — grants and EVERY typed denial (W-R1). */
export function AuthorizationPanel({
  view,
}: {
  readonly view: TaskFlowView;
}): ReactNode {
  const authorization = view.authorization;
  return (
    <Card
      title="Authorization"
      meta={
        <span>
          the server-provided context for principal{" "}
          <span className="mono">
            {authorization === null ? "—" : authorization.subjectRef}
          </span>
        </span>
      }
    >
      {authorization === null ? (
        <EmptyState
          title="No authorization context recorded"
          guidance="The task-flow objects for this project carry no authorization context yet. Authorization stays server-provided; the adapter never decides it."
        />
      ) : (
        <>
          <p className="pane-foot">
            Granted:{" "}
            {authorization.grantedActions.length === 0 ? (
              "no actions granted"
            ) : (
              authorization.grantedActions.map((granted) => (
                <span key={granted} className="tag tag-mapping-mapped">
                  {granted}
                </span>
              ))
            )}
          </p>
          {authorization.denials.length === 0 ? (
            <p className="pane-foot">No denials — every requested action was granted.</p>
          ) : (
            <ul className="notes-list" data-denials="true">
              {authorization.denials.map((denial) => (
                <li key={`${denial.action}:${denial.reasonCode}`}>
                  <strong className="mono">{denial.action}</strong> denied —{" "}
                  <strong className="mono">{denial.reasonCode}</strong>
                  {denial.reasonDetail === undefined ? null : `: ${denial.reasonDetail}`}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

/** Render the platform-honesty negotiation (never a readiness statement). */
export function NegotiationPanel({
  view,
}: {
  readonly view: TaskFlowView;
}): ReactNode {
  const negotiation = view.negotiation;
  return (
    <Card
      title="This browser's capability for the task"
      meta={
        negotiation === null ? (
          <span>no capability requirements stated for this task</span>
        ) : (
          <span>
            task type <span className="mono">{negotiation.taskType}</span> · requirement set{" "}
            <span className="mono">{negotiation.requirementsRef}</span>
          </span>
        )
      }
    >
      {negotiation === null ? (
        <p className="pane-foot">
          The server stated no capability requirements for the current task — no platform
          negotiation applies.
        </p>
      ) : (
        <>
          <p data-negotiation-outcome={negotiation.outcome}>
            <span
              className={
                negotiation.outcome === "blocked"
                  ? "tag tag-missing-open"
                  : negotiation.outcome === "degraded" || negotiation.outcome === "unknown"
                    ? "tag tag-ambiguous"
                    : "tag tag-mapping-mapped"
              }
            >
              {negotiation.outcome}
            </span>{" "}
            {negotiation.outcome === "blocked" ? (
              <span>
                this task cannot run on this browser — the reason below is platform honesty,
                never a readiness statement; escalation changes capture method, never the
                truth standard
              </span>
            ) : (
              <span>
                the honest platform verdict for this task on this browser
              </span>
            )}
          </p>
          {negotiation.domainOutcomes.filter((domain) => domain.outcome !== "satisfied")
            .length === 0 ? (
            <p className="pane-foot">Every stated requirement domain is satisfied.</p>
          ) : (
            <ul className="notes-list" data-negotiation-domains="true">
              {negotiation.domainOutcomes
                .filter((domain) => domain.outcome !== "satisfied")
                .map((domain) => (
                  <li key={domain.domain}>
                    <strong className="mono">{domain.domain}</strong> — {domain.outcome}
                    {domain.blocking ? " (blocking)" : ""}
                    {domain.reason === null ? null : `: ${domain.reason}`}
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

/** Render the golden journey steps with honest record summaries. */
export function TaskJourneyView({ view }: { readonly view: TaskFlowView }): ReactNode {
  return (
    <Card
      title="The golden journey"
      meta={<span>each step states its record honestly — absent is a state, not an error</span>}
    >
      {view.realityLine === null ? null : (
        <p className="pane-foot" data-reality-line="true">
          Reality readiness (server-stated, verbatim): {view.realityLine}
        </p>
      )}
      <ol className="journey" data-journey-steps="true">
        {view.steps.map((step, index) => (
          <li key={step.step}>
            <span className="journey-index" aria-hidden="true">
              {String(index + 1)}
            </span>
            <span className="journey-body">
              <a href={step.href}>{step.label}</a>
              <span className="journey-hint">{step.hint}</span>
              <span
                className="pane-foot"
                data-step-record={step.record.kind}
              >
                {step.record.kind === "present"
                  ? step.record.summary
                  : `no record for this project yet — ${step.record.summary}`}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* The full task-flow panel (landing + project overview)                */
/* ------------------------------------------------------------------ */

/** The full task-first panel: NBA + authorization + negotiation + journey. */
export function TaskFlowPanel({ projectId }: { readonly projectId: string }): ReactNode {
  const { state, reload } = useTaskFlow(projectId);
  return (
    <TaskFlowResourceView
      state={state}
      onRetry={reload}
      render={(data) => <TaskFlowPanelBody data={data} />}
    />
  );
}

/** The resource view shared by the full panel and the strip. */
export function TaskFlowResourceView({
  state,
  onRetry,
  render,
}: {
  readonly state: ResourceState<TaskFlowResourceData>;
  readonly onRetry: () => void;
  readonly render: (data: TaskFlowResourceData) => ReactNode;
}): ReactNode {
  return (
    <ResourceView
      state={state}
      loadingLabel="Loading the task-first flow…"
      onRetry={onRetry}
      render={render}
    />
  );
}

/** The full panel body (exported for static render tests — pure projection). */
export function TaskFlowPanelBody({ data }: { readonly data: TaskFlowResourceData }): ReactNode {
  if (data.view === null) {
    return (
      <Card title="Task-first flow" badge={<DataBadge mode={data.mode} />}>
        <EmptyState
          title="No task-flow objects recorded for this project"
          guidance="This project's task journey carries no contract objects yet (context, next best action, evidence summary, …). The committed demo task journey shows the full flow on the corpus project."
          action={
            <a className="button" href={formatRoute({ name: "sitetwin", projectId: DEMO_TASK_PROJECT_ID })}>
              Open the demo task journey
            </a>
          }
        />
      </Card>
    );
  }
  return (
    <div className="grid grid-2">
      <NextBestActionPanel view={data.view} mode={data.mode} />
      <TaskJourneyView view={data.view} />
      <ReadinessEnvelopeCard data={data} />
      <TaskCompositionPanelBody data={data} />
      <AuthorizationPanel view={data.view} />
      <NegotiationPanel view={data.view} />
      <BrowserAdapterCard />
      <SemanticObjectsCard data={data} />
    </div>
  );
}

/**
 * PROD-034 — the READINESS decision's Evidence Envelope ("Why is readiness
 * what it is?"): the same task-flow data the panel already renders,
 * projected through {@link readinessEvidenceEnvelope} — the readiness
 * authority's own status/detail, the evidence ids, the declared gaps and
 * the server's next action, with every unrecorded section explicit.
 */
export function ReadinessEnvelopeCard({
  data,
}: {
  readonly data: TaskFlowResourceData;
}): ReactNode {
  if (data.bundle === null) {
    return null;
  }
  const envelope = readinessEvidenceEnvelope(data.bundle);
  if (envelope === null) {
    return null;
  }
  return (
    <EvidenceEnvelopeCard
      view={envelope}
      mode={data.mode}
      title="Why this readiness verdict?"
    />
  );
}

/** The browser adapter's own declaration (honest platform facts). */
function BrowserAdapterCard(): ReactNode {
  return (
    <Card
      title="This browser adapter"
      meta={
        <span>
          the declared capability profile — platform facts, never readiness or
          authorization claims
        </span>
      }
    >
      <SemanticObjectsAudit
        objects={[
          {
            label: "Browser capability profile",
            objectName: "ClientCapabilityProfile",
            payload: BROWSER_ADAPTER_PROFILE,
          },
        ]}
      />
    </Card>
  );
}

/** The verbatim semantic-objects audit card (the auditability acceptance). */
function SemanticObjectsCard({ data }: { readonly data: TaskFlowResourceData }): ReactNode {
  const bundle = data.bundle;
  if (bundle === null) {
    return null;
  }
  const objects: {
    readonly label: string;
    readonly objectName: string;
    readonly payload: unknown;
  }[] = [
    { label: "Project context", objectName: "ProjectContext", payload: bundle.context },
    { label: "Next best action", objectName: "NextBestAction", payload: bundle.nextBestAction },
    { label: "Authorization", objectName: "AuthorizationContext", payload: bundle.authorization },
    { label: "Evidence summary", objectName: "EvidenceSummary", payload: bundle.evidence },
    { label: "Reality summary", objectName: "RealitySummary", payload: bundle.reality },
    { label: "BOQ context", objectName: "BOQContext", payload: bundle.boq },
    { label: "Case summary", objectName: "EngineeringCaseSummary", payload: bundle.caseSummary },
    { label: "Scenario summary", objectName: "InterventionScenarioSummary", payload: bundle.scenario },
    { label: "Outcome summary", objectName: "OutcomeSummary", payload: bundle.outcome },
    { label: "Task requirements", objectName: "TaskCapabilityRequirements", payload: bundle.requirements },
  ];
  if (data.view?.negotiationObject != null) {
    objects.push({
      label: "Capability negotiation (this browser)",
      objectName: "CapabilityNegotiation",
      payload: data.view.negotiationObject,
    });
  }
  return (
    <Card
      title="The task's semantic objects (verbatim)"
      meta={
        <span>
          the contract objects behind every claim above — ids, versions,
          evidence references and the contract version, inspectable
        </span>
      }
    >
      <SemanticObjectsAudit objects={objects} />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* The compact strip (every primary screen's next-action exposure)      */
/* ------------------------------------------------------------------ */

/**
 * The compact next-action strip EVERY primary screen exposes: the NBA
 * status + prompt (or the explicit blocked reason with its blockers) and
 * one link into the full journey. Unavailable/error/empty render their
 * explicit states too — never a blank strip, never a generic one.
 */
export function TaskFlowStrip({ projectId }: { readonly projectId: string }): ReactNode {
  const { state, reload } = useTaskFlow(projectId);
  return (
    <section className="task-strip" data-task-strip="true" aria-label="Next best action">
      <TaskFlowResourceView
        state={state}
        onRetry={reload}
        render={(data) => <TaskFlowStripBody data={data} />}
      />
    </section>
  );
}

/** The strip body (exported for static render tests — pure projection). */
export function TaskFlowStripBody({ data }: { readonly data: TaskFlowResourceData }): ReactNode {
  if (data.view === null) {
    return (
      <p className="task-strip-line" data-strip-state="empty">
        No task-flow objects recorded for this project —{" "}
        <a href={formatRoute({ name: "dashboard" })}>open the task journey</a> or connect a
        deployment serving the adapter contract.
      </p>
    );
  }
  const action = data.view.nextBestAction;
  if (action === null) {
    return (
      <p className="task-strip-line" data-strip-state="no-action">
        No next-best-action recorded for this task — the server has not computed one yet.{" "}
        <a href={formatRoute({ name: "dashboard" })}>Open the task journey</a>
      </p>
    );
  }
  const blocked = action.status === "blocked";
  return (
    <p className="task-strip-line" data-strip-state={action.status}>
      <span className={blocked ? "tag tag-missing-open" : "tag tag-mapping-mapped"}>
        {action.status}
      </span>{" "}
      {action.prompt}
      {blocked ? (
        <>
          {" "}
          {action.blockers.map((blocker) => (
            <span key={blocker.reasonCode} className="task-strip-blocker">
              <strong className="mono">{blocker.reasonCode}</strong>
            </span>
          ))}
        </>
      ) : null}{" "}
      <a href={formatRoute({ name: "dashboard" })}>Open the task journey</a>
      {data.view.taskBlockedOnThisPlatform ? (
        <span className="task-strip-note">
          · this browser cannot execute this task (capability negotiation: blocked)
        </span>
      ) : null}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* The task-intent authoring form (W-R3 — the entry experience)         */
/* ------------------------------------------------------------------ */

/** The outcome of a task-intent submission (the server-authoritative answer). */
export interface TaskIntentSubmissionOutcome {
  readonly kind: "submitted" | "failed";
  readonly operation: OperationResultView | null;
  readonly detail: string;
}

/**
 * The typed task-selection form: task type (the contract's advisory
 * vocabulary, open), the project the task lives in, the natural-language
 * intent, target refs and the caller-supplied task identity — assembled
 * into a `TaskIntent` wire object (validated client-side, defects named;
 * the SERVER stays the validator of record) and submitted to the adapter
 * seam in live mode. Demo mode disables submission with the honest
 * never-fabricate notice (the CreateRecordPanel precedent).
 */
export function TaskIntentForm({
  initialProjectId,
}: {
  readonly initialProjectId?: string;
}): ReactNode {
  const environment = useAppEnvironment();
  const demo = isDemoMode(environment) || environment.apiStatus === null;
  const [projectRef, setProjectRef] = useState(initialProjectId ?? "");
  const [taskType, setTaskType] = useState<string>(TASK_TYPES[0]);
  const [intent, setIntent] = useState("");
  const [targetRefs, setTargetRefs] = useState("");
  const [taskId, setTaskId] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<TaskIntentSubmissionOutcome | null>(null);

  const draft: TaskSelectionDraft = useMemo(
    () => ({
      projectRef,
      taskType,
      intent,
      targetRefs: targetRefs
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
      parameters: {},
    }),
    [projectRef, taskType, intent, targetRefs],
  );
  const draftDefects = validateTaskSelectionDraft(draft);
  const identityDefects =
    taskId === "" && createdAt === ""
      ? []
      : validateTaskIntentIdentity({ taskId, createdAt });
  const wireIntent = useMemo(() => {
    if (draftDefects.length > 0 || identityDefects.length > 0) {
      return null;
    }
    return taskIntentFromSelection(draft, { taskId, createdAt });
  }, [draft, taskId, createdAt, draftDefects.length, identityDefects.length]);

  const submit = useCallback(async () => {
    if (wireIntent === null || submitting) {
      return;
    }
    setSubmitting(true);
    setOutcome(null);
    const result = await submitTaskIntentLive(environment.fetchImpl, wireIntent);
    setSubmitting(false);
    if (result.ok) {
      setOutcome({
        kind: "submitted",
        operation: operationResultView(result.answer.result),
        detail: `the server answered the task intent (${result.answer.result.status})`,
      });
      return;
    }
    setOutcome({
      kind: "failed",
      operation: null,
      detail: describeApiFailure(result.failure),
    });
  }, [wireIntent, submitting, environment.fetchImpl]);

  return (
    <Card
      title="What do you need to do?"
      badge={demo ? <DataBadge mode="demo" /> : <DataBadge mode="api" />}
      meta={<span>task intent → context → evidence → gaps → next best action</span>}
    >
      <p>
        Start from the task, not the module: state what you need to do and the
        project it lives in. The adapter turns your statement into a typed
        task intent the server validates, plans and answers.
      </p>
      <div className="task-form">
        <label className="inline-label" htmlFor="task-type">
          Task type
          <select
            id="task-type"
            value={taskType}
            onChange={(event) => {
              setTaskType(event.target.value);
            }}
          >
            {TASK_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-label" htmlFor="task-project">
          Project
          <input
            id="task-project"
            type="text"
            value={projectRef}
            placeholder="proj-…"
            onChange={(event) => {
              setProjectRef(event.target.value);
            }}
          />
        </label>
        <label className="inline-label" htmlFor="task-targets">
          Target refs
          <input
            id="task-targets"
            type="text"
            value={targetRefs}
            placeholder="case-…, node-… (comma-separated, optional)"
            onChange={(event) => {
              setTargetRefs(event.target.value);
            }}
          />
        </label>
        <label className="inline-label" htmlFor="task-id">
          Task id
          <input
            id="task-id"
            type="text"
            value={taskId}
            placeholder="task-…"
            onChange={(event) => {
              setTaskId(event.target.value);
            }}
          />
        </label>
        <label className="inline-label" htmlFor="task-created">
          Authored at
          <input
            id="task-created"
            type="text"
            value={createdAt}
            placeholder="2026-01-15T09:25:00.000Z"
            onChange={(event) => {
              setCreatedAt(event.target.value);
            }}
          />
        </label>
        <label className="inline-label" htmlFor="task-intent">
          Intent
          <input
            id="task-intent"
            type="text"
            value={intent}
            placeholder="e.g. capture depth evidence of the cracked masonry on level 2"
            onChange={(event) => {
              setIntent(event.target.value);
            }}
          />
        </label>
      </div>
      {[...draftDefects, ...identityDefects].length === 0 ? null : (
        <div className="callout callout-warning" role="alert">
          <strong>The task intent does not satisfy the recorded contract yet:</strong>
          <ul className="notes-list">
            {[...draftDefects, ...identityDefects].map((defect) => (
              <li key={defect}>{defect}</li>
            ))}
          </ul>
        </div>
      )}
      {demo ? (
        <div className="callout callout-warning" data-demo-notice="true">
          Task-intent submission requires the adapter endpoints on a live API —
          this deployment renders the demo dataset, and the shell never
          fabricates writes or server answers.
        </div>
      ) : null}
      <div className="toolbar">
        <button
          type="button"
          className="button"
          disabled={demo || wireIntent === null || submitting}
          data-submit-state={demo ? "demo" : wireIntent === null ? "invalid-draft" : "ready"}
          onClick={() => {
            void submit();
          }}
        >
          {submitting ? "Submitting…" : "Submit task intent"}
        </button>
        {demo ? (
          <a className="button button-secondary" href={formatRoute({ name: "sitetwin", projectId: DEMO_TASK_PROJECT_ID })}>
            Walk the demo task journey
          </a>
        ) : null}
      </div>
      {wireIntent === null ? null : (
        <p className="pane-foot" data-wire-intent="true">
          Wire object: <span className="mono">{JSON.stringify(wireIntent)}</span>
        </p>
      )}
      {outcome === null ? null : (
        <div
          className={outcome.kind === "submitted" ? "callout callout-info" : "callout callout-warning"}
          data-outcome={outcome.kind}
          role="status"
        >
          <p>
            <strong>
              {outcome.kind === "submitted" ? "The server answered." : "The submission failed."}
            </strong>{" "}
            {outcome.detail}
          </p>
          {outcome.operation === null ? null : (
            <OperationResultNote operation={outcome.operation} />
          )}
        </div>
      )}
    </Card>
  );
}

/** The operation-result render (status/failure/refs verbatim, terminal step). */
export function OperationResultNote({
  operation,
}: {
  readonly operation: OperationResultView;
}): ReactNode {
  return (
    <div className="task-operation" data-operation-status={operation.status}>
      <p>
        Operation <span className="mono">{operation.operationId}</span> —{" "}
        <strong>{operation.status}</strong> · completed{" "}
        <Instant iso={operation.completedAt} /> · action{" "}
        <span className="mono">{operation.actionRef}</span>
      </p>
      {operation.failure === null ? null : (
        <p>
          <span className="tag tag-missing-open">{operation.failure.code}</span>{" "}
          {operation.failure.detail}
        </p>
      )}
      {operation.resultRefs.length === 0 ? (
        <p className="pane-foot">No result references.</p>
      ) : (
        <ul className="notes-list" data-result-refs="true">
          {operation.resultRefs.map((ref) => (
            <li key={ref}>
              <span className="mono">{ref}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The landing (the entry experience: task-first, then the journey)     */
/* ------------------------------------------------------------------ */

/**
 * The task-first landing: the intent form, the open/create-project
 * entrypoints and the current task's journey panel. PROD-018: the four
 * canonical actions (Capture → Investigate → Build solution → Review
 * outcome) label the entry points — the parity composition's terminology
 * normalization, rendered over the app's real routes.
 */
export function TaskFirstLanding(): ReactNode {
  return (
    <>
      <CanonicalActionBar projectId={DEMO_TASK_PROJECT_ID} />
      <TaskIntentForm initialProjectId={DEMO_TASK_PROJECT_ID} />
      <TaskFlowPanel projectId={DEMO_TASK_PROJECT_ID} />
    </>
  );
}
