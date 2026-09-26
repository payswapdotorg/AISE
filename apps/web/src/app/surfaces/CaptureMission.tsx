/**
 * PROD-034 — the CAPTURE / UPLOAD surface (issue #9 gap 1: first-class
 * capture acquisition).
 *
 * The Capture canonical action's own destination (no longer landing on
 * SiteTwin/Evidence inspection): the guided capture MISSION plus the
 * browser-appropriate acquisition entry, both first-class —
 *
 *  - {@link CaptureMissionPanel} — "what to capture and why": the SAME
 *    task-flow resource every task-first surface consumes (no second
 *    authority), projected as the capture mission — the server's
 *    NextBestAction prompt/blockers VERBATIM and the EvidenceSummary's
 *    declared gaps as the guided list (each entry is the record's own
 *    description, never an invented instruction);
 *  - {@link CaptureUploadPanel} — the first-class browser upload entry:
 *    one file → the client's sha-256 content address → `POST
 *    /v1/capture/assets/:contentId` with the RAW bytes (the capture
 *    gateway's exact contract, consumed read-only). Authoritative
 *    evidence ingestion stays entirely SERVER-SIDE: the gateway
 *    re-computes the digest, stores immutably, answers idempotently
 *    (STORED | DUPLICATE) or with the typed rejection verbatim;
 *  - {@link BrowserCaptureLimitsCard} — the honest platform statement:
 *    this browser adapter does not implement camera capture (the declared
 *    implemented modes say so), so live field capture stays the mobile
 *    adapter's journey — stated, never faked.
 *
 * EXPLICIT STATES EVERYWHERE: the task-flow resource machine's
 * loading/empty/error/unavailable states (the mission panel), the demo
 * never-fabricate notice (upload), the Web-Crypto-unavailable state (an
 * insecure context cannot content-address — the entry renders the honest
 * blocked reason), and the typed upload outcomes/failures.
 *
 * PRESENTATION ONLY: no readiness, sufficiency or authority decisions —
 * the gateway is the ingestion authority; the mission text is the
 * records' own.
 */

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTaskFlow, TaskFlowResourceView } from "../task-first";
import type { TaskFlowResourceData } from "../task-first";
import { isDemoMode, useAppEnvironment } from "../environment";
import {
  describeApiFailure,
  uploadCaptureAssetLive,
  webCryptoSha256,
  type AssetDigest,
  type CaptureAssetUploadRecord,
} from "../api";
import { Card, DataBadge, EmptyState, Instant, ProjectSurfaceNav } from "../components";
import { TaskFlowStrip } from "../task-first";
import { ProviderStatusNote } from "../provider-status";
import { formatRoute } from "../router";
import { BROWSER_IMPLEMENTED_INTERACTION_MODES } from "../adapter-profile";
import { plural } from "../format";
import { DEMO_TASK_PROJECT_ID } from "../task-dataset";
import {
  FIELD_TASK_DEEP_LINK_SCHEME,
  formatFieldTaskDeepLink,
  type FieldTaskHandoff,
} from "@aise/adapter-contract/task-handoff";

/* ------------------------------------------------------------------ */
/* POST-005 — the cross-device handoff builders (pure)                  */
/* ------------------------------------------------------------------ */

/** The record fields a case-specific capture handoff is built from. */
export interface CaptureHandoffSource {
  readonly projectId: string;
  /** The field task identity (adapter-authored, stable per target). */
  readonly taskId: string;
  /** What to capture — the declaring record's own words, verbatim. */
  readonly intent: string;
  /** The entities the capture concerns (case id, gap id, execution id…). */
  readonly targetRefs: readonly string[];
  /** The subject record's own status string, verbatim. */
  readonly epistemicState: string;
  /** The emitting surface's own name. */
  readonly originSurface: string;
  /** Version context of the records the task was declared from. */
  readonly versionContext: {
    readonly boqImportId?: string;
    readonly boqRevision?: number;
    readonly realityVersionId?: string;
    readonly missionId?: string;
  };
  /** Instant the emitting surface produced the handoff. */
  readonly issuedAt: string;
}

/**
 * Build a case-specific FIELD-CAPTURE handoff (missing-evidence → capture
 * bridge): the envelope that lets the mobile field adapter continue THIS
 * task — same project, same task identity, same targets, same epistemic
 * state — instead of starting a generic capture. Pure: every field is the
 * input record's own statement; nothing is invented or upgraded.
 */
export function fieldCaptureHandoff(source: CaptureHandoffSource): FieldTaskHandoff {
  return {
    contractVersion: "1.0.0",
    handoffId: `handoff-${source.taskId}`,
    purpose: "field-capture",
    projectId: source.projectId,
    taskId: source.taskId,
    taskType: "field-capture",
    intent: source.intent,
    targetRefs: [...source.targetRefs],
    origin: "web",
    originSurface: source.originSurface,
    versionContext: source.versionContext,
    epistemicState: source.epistemicState,
    issuedAt: source.issuedAt,
  };
}

/**
 * Build a POST-WORK-CAPTURE handoff (the plan §5 return-path bridge):
 * executed work that needs post-work evidence so the outcome loop can turn
 * it into an observed outcome through new evidence — never by assertion.
 */
export function postWorkCaptureHandoff(source: CaptureHandoffSource): FieldTaskHandoff {
  return {
    ...fieldCaptureHandoff(source),
    handoffId: `handoff-postwork-${source.taskId}`,
    purpose: "post-work-capture",
    taskType: "field-capture",
  };
}

/* ------------------------------------------------------------------ */
/* The surface                                                          */
/* ------------------------------------------------------------------ */

/** The Capture / Upload surface: the guided mission + the upload entry. */
export function CaptureMission({ projectId }: { readonly projectId: string }): ReactNode {
  return (
    <>
      <div className="page-head">
        <p className="crumbs">
          <a href={formatRoute({ name: "projects" })}>Projects</a> /{" "}
          <a href={formatRoute({ name: "project", projectId })}>{projectId}</a>
        </p>
        <h1>Capture / Upload</h1>
        <p>
          Bring evidence in: the guided capture mission (what the records say
          is missing and why), and the browser&apos;s acquisition entry — one
          file, content-addressed, ingested by the server-side capture
          gateway.
        </p>
      </div>
      <TaskFlowStrip projectId={projectId} />
      <ProjectSurfaceNav projectId={projectId} current="capture" />
      <CaptureMissionPanel projectId={projectId} />
      <CrossDeviceHandoffPanel projectId={projectId} />
      <CaptureUploadPanel projectId={projectId} />
      <BrowserCaptureLimitsCard />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The guided mission (the task-flow resource, capture-projected)       */
/* ------------------------------------------------------------------ */

/** The mission panel: the task-flow resource rendered as the capture mission. */
export function CaptureMissionPanel({ projectId }: { readonly projectId: string }): ReactNode {
  const { state, reload } = useTaskFlow(projectId);
  return (
    <TaskFlowResourceView
      state={state}
      onRetry={reload}
      render={(data) => <CaptureMissionBody data={data} />}
    />
  );
}

/**
 * The mission body (exported for static render tests — pure projection):
 * the server's next-best-action as the guided action, the evidence
 * summary's declared gaps as the "what to capture and why" list, and the
 * honest platform-blocked note when the negotiation blocks this browser.
 */
export function CaptureMissionBody({ data }: { readonly data: TaskFlowResourceData }): ReactNode {
  if (data.view === null) {
    return (
      <Card title="The capture mission" badge={<DataBadge mode={data.mode} />}>
        <EmptyState
          title="No task-flow objects recorded for this project"
          guidance="The guided capture mission renders from the server's task-flow objects (the next-best-action and the evidence summary's declared gaps). None are recorded for this project yet — the adapter never invents a mission."
          action={
            <a
              className="button"
              href={formatRoute({ name: "capture", projectId: DEMO_TASK_PROJECT_ID })}
            >
              Open the demo capture mission
            </a>
          }
        />
      </Card>
    );
  }
  const view = data.view;
  const action = view.nextBestAction;
  const gaps = data.bundle?.evidence?.gaps ?? [];
  return (
    <Card
      title="The capture mission"
      badge={<DataBadge mode={data.mode} />}
      meta={
        <span>
          the server-stated next step and the declared evidence gaps — the
          records&apos; own words, never an invented instruction
        </span>
      }
    >
      {action === null ? (
        <EmptyState
          title="No next-best-action recorded for this task"
          guidance="The server computes the next capture step from the task, the known evidence and the declared gaps. None is recorded yet — the adapter never invents one."
        />
      ) : (
        <div className="task-operation" data-mission-action-status={action.status}>
          <p>
            <span className={action.status === "blocked" ? "tag tag-missing-open" : "tag tag-mapping-mapped"}>
              {action.status}
            </span>{" "}
            {action.prompt}
          </p>
          {action.blockers.length === 0 ? null : (
            <ul className="notes-list" data-mission-blockers="true">
              {action.blockers.map((blocker) => (
                <li key={blocker.reasonCode}>
                  <strong className="mono">{blocker.reasonCode}</strong> — {blocker.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <h3 className="pane-head">What to capture and why</h3>
      {gaps.length === 0 ? (
        <p className="pane-foot">
          No evidence gaps are declared for this task&apos;s subject — nothing
          to capture is recorded right now.
        </p>
      ) : (
        <ul className="notes-list" data-mission-gaps="true">
          {gaps.map((gap) => (
            <li key={gap.gapId} data-mission-gap-kind={gap.kind}>
              <span className={gap.kind === "MISSING" ? "tag tag-missing-open" : "tag tag-ambiguous"}>
                {gap.kind}
              </span>{" "}
              <strong className="mono">{gap.gapId}</strong> — {gap.description}
            </li>
          ))}
        </ul>
      )}
      {view.taskBlockedOnThisPlatform ? (
        <div className="callout callout-warning" data-platform-blocked="true">
          This browser cannot execute this capture task (capability negotiation:
          blocked). The honest paths are a depth-capable/mobile device for the
          field capture, or the file upload below for documents and photos you
          already hold — the truth standard never changes.
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* The upload entry (the browser-appropriate acquisition)               */
/* ------------------------------------------------------------------ */

/** The selected file's honest summary (no content inspection — facts only). */
export interface SelectedCaptureFile {
  readonly name: string;
  readonly byteSize: number;
  readonly mediaType: string;
}

/** The upload outcome (verbatim gateway fields, or the typed failure). */
export type CaptureUploadOutcome =
  | { readonly kind: "stored" | "duplicate"; readonly record: CaptureAssetUploadRecord; readonly endpoint: string }
  | { readonly kind: "failed"; readonly detail: string };

/**
 * The first-class browser upload entry. The file is read locally, hashed
 * with Web Crypto (the TRANSPORT content address — the gateway re-verifies
 * server-side) and POSTed as raw bytes to the capture gateway. Demo mode
 * disables submission with the honest never-fabricate notice; a platform
 * without Web Crypto renders the explicit blocked reason.
 */
export function CaptureUploadPanel({ projectId }: { readonly projectId: string }): ReactNode {
  const environment = useAppEnvironment();
  const demo = isDemoMode(environment) || environment.apiStatus === null;
  const digest = useMemo<AssetDigest | null>(() => webCryptoSha256(), []);
  const [file, setFile] = useState<SelectedCaptureFile | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [reading, setReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<CaptureUploadOutcome | null>(null);

  const onFileSelected = useCallback(
    (selected: File | null) => {
      setOutcome(null);
      if (selected === null) {
        setFile(null);
        setBytes(null);
        return;
      }
      setReading(true);
      void selected.arrayBuffer().then((buffer) => {
        setBytes(new Uint8Array(buffer));
        setFile({
          name: selected.name,
          byteSize: selected.size,
          mediaType: selected.type === "" ? "application/octet-stream" : selected.type,
        });
        setReading(false);
      });
    },
    [],
  );

  const submit = useCallback(async () => {
    if (demo || digest === null || bytes === null || file === null || submitting) {
      return;
    }
    setSubmitting(true);
    setOutcome(null);
    const result = await uploadCaptureAssetLive(environment.fetchImpl, digest, bytes, file.mediaType);
    setSubmitting(false);
    if (result.ok) {
      setOutcome({
        kind: result.record.outcome === "STORED" ? "stored" : "duplicate",
        record: result.record,
        endpoint: result.endpoint,
      });
      return;
    }
    setOutcome({ kind: "failed", detail: describeApiFailure(result.failure) });
  }, [demo, digest, bytes, file, submitting, environment.fetchImpl]);

  return (
    <CaptureUploadCardBody
      projectId={projectId}
      demo={demo}
      digestAvailable={digest !== null}
      file={file}
      reading={reading}
      submitting={submitting}
      outcome={outcome}
      onFileSelected={onFileSelected}
      onSubmit={() => {
        void submit();
      }}
    />
  );
}

/** The upload body (exported for static render tests — pure projection). */
export function CaptureUploadCardBody({
  projectId,
  demo,
  digestAvailable,
  file,
  reading,
  submitting,
  outcome,
  onFileSelected,
  onSubmit,
}: {
  readonly projectId: string;
  readonly demo: boolean;
  readonly digestAvailable: boolean;
  readonly file: SelectedCaptureFile | null;
  readonly reading: boolean;
  readonly submitting: boolean;
  readonly outcome: CaptureUploadOutcome | null;
  readonly onFileSelected: (file: File | null) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  const ready = !demo && digestAvailable && file !== null && !reading;
  return (
    <Card
      title="Upload one capture asset"
      badge={demo ? <DataBadge mode="demo" /> : <DataBadge mode="api" />}
      meta={
        <span>
          one file → sha-256 content address → the server-side capture
          gateway (POST /v1/capture/assets/:contentId)
        </span>
      }
    >
      <p>
        Photos, scans, documents or measurements you already hold go in here:
        the browser reads the file, computes its content address and uploads
        the raw bytes to the capture gateway. The SERVER re-computes the
        digest, stores the bytes immutably in the content-addressed store and
        answers idempotently — re-uploading identical bytes is a DUPLICATE,
        never a duplication. Authoritative evidence ingestion stays entirely
        server-side.
      </p>
      <div className="task-form">
        <label className="inline-label" htmlFor="capture-file">
          File
          <input
            id="capture-file"
            type="file"
            onChange={(event) => {
              onFileSelected(event.target.files?.[0] ?? null);
            }}
          />
        </label>
      </div>
      {reading ? (
        <p className="pane-foot" data-reading="true">
          Reading the file…
        </p>
      ) : null}
      {file === null ? null : (
        <p className="pane-foot" data-selected-file="true">
          Selected: <span className="mono">{file.name}</span> ·{" "}
          {plural(file.byteSize, "byte")} · media type{" "}
          <span className="mono">{file.mediaType}</span>
        </p>
      )}
      {!digestAvailable ? (
        <div className="callout callout-warning" data-digest-unavailable="true">
          This browser context does not expose Web Crypto (content addressing
          requires a secure context — HTTPS or localhost). The upload entry is
          honestly disabled: the adapter never falls back to an unverified
          address. Open the deployment over HTTPS, or submit the asset from
          the mobile field adapter.
        </div>
      ) : null}
      {demo ? (
        <div className="callout callout-warning" data-demo-notice="true">
          Upload requires the live API — this deployment renders the demo
          dataset, and the shell never fabricates writes or server answers.
        </div>
      ) : null}
      <div className="toolbar">
        <button
          type="button"
          className="button"
          disabled={!ready || submitting}
          data-submit-state={demo ? "demo" : !digestAvailable ? "no-digest" : file === null ? "no-file" : submitting ? "submitting" : "ready"}
          onClick={onSubmit}
        >
          {submitting ? "Uploading…" : "Upload to the capture gateway"}
        </button>
        <a
          className="button button-secondary"
          href={formatRoute({ name: "sitetwin", projectId })}
        >
          Inspect the stored evidence
        </a>
      </div>
      {outcome === null ? null : outcome.kind === "failed" ? (
        <div className="callout callout-warning" data-outcome="failed" role="alert">
          <p>
            <strong>The upload was refused.</strong> {outcome.detail}
          </p>
        </div>
      ) : (
        <div className="callout callout-info" data-outcome={outcome.kind} role="status">
          <p>
            <strong>
              {outcome.kind === "stored" ? "Stored server-side." : "Already stored — no duplication."}
            </strong>{" "}
            Content id <span className="mono">{outcome.record.contentId}</span> ·{" "}
            {plural(outcome.record.byteSize, "byte")} · media type{" "}
            <span className="mono">{outcome.record.mediaType}</span>
          </p>
          <p className="pane-foot">
            The asset now lives in the server&apos;s content-addressed store
            under this id (the gateway verified the digest and stored the bytes
            immutably). Registering it as an Evidence document on an engineering
            case is the server-validated evidence registration step — this
            upload does not do it, and the adapter never implies it did.
          </p>
          <p className="mono pane-foot">{outcome.endpoint}</p>
        </div>
      )}
      <ProviderStatusNote subject="the capture upload" />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* The honest platform statement                                        */
/* ------------------------------------------------------------------ */

/** The browser adapter's honest capture-limits declaration. */
export function BrowserCaptureLimitsCard(): ReactNode {
  const modes = BROWSER_IMPLEMENTED_INTERACTION_MODES.join(", ");
  return (
    <Card
      title="What this browser can and cannot capture"
      meta={
        <span>
          the adapter&apos;s declared implemented interaction modes — platform
          honesty, never a readiness statement
        </span>
      }
    >
      <p data-implemented-modes={modes}>
        This browser adapter implements <span className="mono">{modes}</span>.
        Live camera/depth/LiDAR capture, resumable offline capture sessions and
        mission-batch submission are the <strong>mobile field adapter&apos;s</strong>{" "}
        journey — they need the device session envelope this browser honestly
        does not fabricate.
      </p>
      <p>
        The browser&apos;s acquisition entry is the upload above: raw bytes,
        content-addressed, verified and stored by the server-side gateway. When
        a task needs depth or in-field capture, the honest path is the
        capability escalation the server states (a depth-capable device or a
        specialist instrument) — the browser never pretends to satisfy it.
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* POST-005 — the web → mobile task handoff (the obvious handoff)       */
/* ------------------------------------------------------------------ */

/**
 * The cross-device task handoff panel (plan §2 C / §6 Wave 1 Worker 2):
 * "a user who starts a field task on web should be able to understand
 * immediately that the next action belongs on the phone, with a direct
 * handoff/deep-link/task identity". Renders the SAME task-flow resource
 * the mission panel consumes (no second authority) as the handoff: the
 * task identity, the canonical `aise://task` deep link the mobile field
 * adapter opens to CONTINUE this task (capability assessment → guided
 * capture → pause/resume → finalize → sync), and the honest return path.
 */
export function CrossDeviceHandoffPanel({ projectId }: { readonly projectId: string }): ReactNode {
  const { state, reload } = useTaskFlow(projectId);
  const [handoff, setHandoff] = useState<FieldTaskHandoff | null>(null);
  return (
    <TaskFlowResourceView
      state={state}
      onRetry={reload}
      render={(data) => (
        <CrossDeviceHandoffBody
          data={data}
          handoff={handoff}
          onPrepare={() => {
            // The emission instant is the click instant (the only moment
            // this envelope is honestly "issued"); every other field is the
            // record's own statement.
            setHandoff(handoffFromTaskFlow(data, new Date().toISOString()));
          }}
        />
      )}
    />
  );
}

/** Project the task-flow records into the handoff source (pure). */
function handoffFromTaskFlow(
  data: TaskFlowResourceData,
  issuedAt: string,
): FieldTaskHandoff | null {
  const evidence = data.bundle?.evidence ?? null;
  const caseSummary = data.bundle?.caseSummary ?? null;
  const firstGap = evidence?.gaps[0] ?? null;
  if (firstGap === null || caseSummary === null) {
    return null;
  }
  return fieldCaptureHandoff({
    projectId: data.projectId,
    taskId: `task-capture-${firstGap.gapId}`,
    intent: firstGap.description,
    targetRefs: [caseSummary.caseId, firstGap.gapId],
    epistemicState: caseSummary.status,
    originSurface: "capture",
    // Version context: only what the records themselves state — the
    // task-flow bundle's reality summary carries a model version NUMBER,
    // not a version id, so none is fabricated here.
    versionContext: {},
    issuedAt,
  });
}

/** The handoff body (exported for static render tests — pure projection). */
export function CrossDeviceHandoffBody({
  data,
  handoff,
  onPrepare,
}: {
  readonly data: TaskFlowResourceData;
  readonly handoff: FieldTaskHandoff | null;
  readonly onPrepare: () => void;
}): ReactNode {
  const view = data.view;
  const evidence = data.bundle?.evidence ?? null;
  const caseSummary = data.bundle?.caseSummary ?? null;
  const gapCount = evidence?.gaps.length ?? 0;
  return (
    <Card
      title="Continue this task on the mobile field app"
      badge={<DataBadge mode={data.mode} />}
      meta={
        <span>
          the direct cross-device handoff — task identity, provenance and
          version context cross the adapter boundary verbatim
        </span>
      }
    >
      {view === null || caseSummary === null ? (
        <EmptyState
          title="No task-flow records to hand off"
          guidance="The handoff carries the project's open field task (its declared evidence gaps and the case they belong to). No task-flow objects are recorded for this project — nothing is handed off, and none is invented."
        />
      ) : (
        <>
          <p data-handoff-lead="true">
            The next action belongs on the phone: live field capture (camera,
            sensors, offline sessions, mission submission) is the{" "}
            <strong>mobile field adapter&apos;s</strong> journey. The handoff
            below continues <em>this</em> task there — the same project, task
            identity, case and declared gaps — never a generic capture
            surface.
          </p>
          <ul className="notes-list" data-handoff-identity="true">
            <li>
              Project <span className="mono">{data.projectId}</span> · case{" "}
              <span className="mono">{caseSummary.caseId}</span> (
              {caseSummary.status} — the case&apos;s own status, carried
              verbatim)
            </li>
            <li>
              {plural(gapCount, "declared evidence gap")} rides the task:{" "}
              {(evidence?.gaps ?? [])
                .map((gap) => `${gap.gapId} (${gap.kind})`)
                .join(", ") || "none declared"}
            </li>
            <li>
              On the device: open task → capability assessment → guided
              capture → pause/resume → finalize → sync (the plan §5 field
              journey).
            </li>
          </ul>
          {handoff === null ? (
            <div className="toolbar">
              <button
                type="button"
                className="button"
                onClick={onPrepare}
                data-handoff-prepare="idle"
              >
                Prepare the task handoff link
              </button>
            </div>
          ) : (
            <div className="callout callout-info" data-handoff-link="true" role="status">
              <p>
                <strong>Task handoff ready.</strong> Open this link on the
                phone (or send it there) — the AISE Field app continues this
                exact task:
              </p>
              <p className="mono pane-foot" data-handoff-uri={FIELD_TASK_DEEP_LINK_SCHEME}>
                <a href={formatFieldTaskDeepLink(handoff)}>{formatFieldTaskDeepLink(handoff)}</a>
              </p>
              <ul className="notes-list">
                <li>
                  task <span className="mono">{handoff.taskId}</span> ·
                  targets{" "}
                  {handoff.targetRefs.map((ref) => (
                    <span key={ref} className="mono">
                      {ref}{" "}
                    </span>
                  ))}
                  · purpose {handoff.purpose}
                </li>
                <li>
                  Provenance: emitted by the web capture surface at{" "}
                  <Instant iso={handoff.issuedAt} />; version context{" "}
                  {Object.keys(handoff.versionContext).length === 0
                    ? "none recorded"
                    : Object.entries(handoff.versionContext)
                        .map(([key, value]) => `${key}=${String(value)}`)
                        .join(" · ")}
                  .
                </li>
                <li>
                  The device still runs its OWN capability assessment before
                  capture — the handoff carries identity, never readiness.
                </li>
              </ul>
            </div>
          )}
          <p className="pane-foot" data-handoff-return="true">
            The return path: captured evidence syncs through the server-side
            ingestion gateway (content-addressed, provenance preserved) and
            reappears here — in the evidence records, the case&apos;s
            evidence envelope, and the outcome loop&apos;s before/after — as
            observed evidence, never as an automatic conclusion.
          </p>
        </>
      )}
    </Card>
  );
}
