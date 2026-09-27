/**
 * PROD-034 — the BOQ IMPORT entry (issue #9 gap 2: first-class import,
 * not hidden plumbing).
 *
 * Import/upload is a PRODUCT ACTION: this panel lives on the BOQ Lens
 * surface (a per-project task surface, reachable from every project's
 * surface navigation), above the lens content — visible whether or not an
 * import exists yet.
 *
 *  - the entry: one source file + the operator-declared format →
 *    `POST /v1/boq/imports?format=<format>` with the RAW bytes (the
 *    ingestion route's exact contract, consumed read-only: the server
 *    stores the bytes content-addressed BEFORE parsing, answers
 *    idempotently for identical bytes, and reports parse failures with
 *    the failing part);
 *  - QA-003: the flow then ENSURES THE DERIVED NORMALIZATION EXISTS —
 *    `POST /v1/boq/imports/:id/normalization` (AISE-014's idempotent
 *    write-once run) — BEFORE the host surface reloads its lens, because
 *    the joined lens route answers 409 `normalization_required` until a
 *    view is stored: without this step a freshly imported document is
 *    un-viewable in-flow (the observed defect). A typed normalization
 *    failure is surfaced honestly with its typed reason — the import
 *    itself still succeeded (the source stays stored), but the outcome
 *    states the lens cannot be built and why, never a silent swallow;
 *  - QA-003: HONEST EPHEMERALITY — the success state never promises
 *    durability the deployment does not provide. When the flow's own
 *    request responses identify a per-instance serverless platform
 *    (the platform's own response header — no new probe is issued), the
 *    success state states the honest limit: imports live per-instance on
 *    this deployment and may not survive a reload. Durable deployments
 *    (no such marker) get no such caveat — no scare-mongering;
 *  - the SOURCE-BOQ vs SOLUTION-BOQ separation, stated visually and
 *    semantically: this import is a SOURCE BOQ — the incumbent scope's
 *    own verbatim record, preserved immutable, never overwritten. SOLUTION
 *    BOQs are DERIVED projections from declared validation snapshots of
 *    proposed solutions (the Interactive Solution surface) — a different
 *    record class with its own surface, never a replacement of the
 *    source, and the BOQ Graph is not reality;
 *  - the explicit states: the demo never-fabricate notice, the typed
 *    outcomes (import id, format, byte size, parse status + row count or
 *    the recorded reason), and the typed failures verbatim.
 *
 * PRESENTATION ONLY: the ingestion and normalization routes are the
 * authority; nothing here normalizes, maps or derives.
 */

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { isDemoMode, useAppEnvironment } from "../environment";
import {
  BOQ_IMPORT_FORMATS,
  describeApiFailure,
  ensureBoqNormalizationLive,
  importBoqSourceLive,
  type BoqImportRecord,
  type BoqNormalizationRecord,
  type FetchLike,
} from "../api";
import { Card, DataBadge } from "../components";
import { formatRoute } from "../router";
import { plural } from "../format";

/** The selected source file's honest summary. */
export interface SelectedBoqFile {
  readonly name: string;
  readonly byteSize: number;
}

/**
 * QA-003 — the deployment mode the import flow OBSERVED on the responses
 * to its own requests (the deployment-status discipline: the platform's
 * own self-identification, never a guess, never a new probe).
 *
 *  - `"serverless"` — the API's own responses carry the serverless
 *    platform's request-id header (`x-vercel-id`, the deployment shape of
 *    docs/DEPLOYMENT.md: ONE catch-all function, Fs data dir under /tmp,
 *    ephemeral per warm instance). On such a deployment imports live
 *    per-instance and may not survive a reload — the success state says
 *    so.
 *  - `"durable"` — no such marker on the responses this flow issued. The
 *    deployment is not observed to be a per-instance serverless function;
 *    no ephemerality caveat is rendered (no scare-mongering).
 */
export type BoqDeploymentMode = "serverless" | "durable";

/** The header a serverless function platform stamps on every response. */
const SERVERLESS_PLATFORM_HEADER = "x-vercel-id";

/**
 * The deployment mode one of the flow's own responses reveals. Absent
 * marker = `"durable"` (not observed serverless — the honest default that
 * renders no caveat). Pure observation of the response the flow already
 * received; no extra request is ever issued.
 */
export function observedBoqDeployment(response: Response): BoqDeploymentMode {
  return response.headers.get(SERVERLESS_PLATFORM_HEADER) === null ? "durable" : "serverless";
}

/**
 * QA-003 — the honest normalization leg's summary (the route's own
 * counters, rendered in the imported outcome) or its typed failure.
 */
export type BoqNormalizationOutcome =
  | { readonly ok: true; readonly view: BoqNormalizationRecord; readonly endpoint: string }
  | { readonly ok: false; readonly detail: string };

/** The import outcome (the routes' verbatim answers, or the typed failure). */
export type BoqImportOutcome =
  | {
      readonly kind: "imported";
      readonly record: BoqImportRecord;
      readonly endpoint: string;
      /** QA-003 (additive): the deployment mode observed on the flow's own responses. */
      readonly deployment?: BoqDeploymentMode;
      /**
       * QA-003 (additive): the ensured normalization view (the derived lens
       * can now be fetched) — or the honest typed failure that leaves the
       * import recorded but its lens un-buildable.
       */
      readonly normalization?: BoqNormalizationOutcome;
    }
  | { readonly kind: "failed"; readonly detail: string };

/**
 * QA-003 — run the full import flow at the transport seam: import the
 * source bytes, then ENSURE the derived normalization view exists so the
 * lens is viewable in-flow. Exported for the fetch-order spy tests (the
 * POST /imports → POST /imports/:id/normalization sequence is the fix's
 * load-bearing wire).
 *
 * The transport is wrapped (transparently — every call passes through
 * unchanged) to OBSERVE the deployment mode from the responses the flow
 * itself already receives: a per-instance serverless platform identifies
 * itself on them, and that observation — and nothing else — decides the
 * ephemerality caveat. No new request is issued for it.
 */
export async function runBoqImportFlow(
  fetchImpl: FetchLike,
  bytes: Uint8Array,
  format: "csv" | "xlsx" | "pdf",
): Promise<BoqImportOutcome> {
  let deployment: BoqDeploymentMode = "durable";
  const observingFetch: FetchLike = (input, init) =>
    fetchImpl(input, init).then((response) => {
      const observed = observedBoqDeployment(response);
      if (observed === "serverless") {
        deployment = "serverless";
      }
      return response;
    });
  const result = await importBoqSourceLive(observingFetch, bytes, format);
  if (!result.ok) {
    return { kind: "failed", detail: describeApiFailure(result.failure) };
  }
  // The normalization leg: idempotent (a stored view is returned, never
  // recomputed into a different one). A typed failure here is HONEST — the
  // source stays stored (the import succeeded) but the lens cannot be
  // built; the outcome carries the route's own reason, never a swallow.
  const normalization = await ensureBoqNormalizationLive(
    observingFetch,
    result.record.importId,
  );
  return {
    kind: "imported",
    record: result.record,
    endpoint: result.endpoint,
    deployment,
    normalization: normalization.ok
      ? { ok: true, view: normalization.record, endpoint: normalization.endpoint }
      : { ok: false, detail: describeApiFailure(normalization.failure) },
  };
}

/**
 * The first-class SOURCE-BOQ import panel. The file is read locally and
 * POSTed as raw bytes with the operator-declared format (the route's
 * authoritative `?format=` resolution); on success the flow ENSURES the
 * derived normalization exists (QA-003) so the lens the host surface
 * reloads is viewable. Demo mode disables submission with the honest
 * never-fabricate notice.
 */
export function BoqImportPanel({
  projectId,
  onImported,
}: {
  readonly projectId: string;
  /**
   * Signals the host surface to reload its lens (the new import may join
   * it) and SELECT the freshly imported document — the direct consequence
   * of the operator's own action, named in the selector (never a guess).
   */
  readonly onImported: (importId: string) => void;
}): ReactNode {
  const environment = useAppEnvironment();
  const demo = isDemoMode(environment) || environment.apiStatus === null;
  const [format, setFormat] = useState<string>(BOQ_IMPORT_FORMATS[0]!.format);
  const [file, setFile] = useState<SelectedBoqFile | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [reading, setReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<BoqImportOutcome | null>(null);

  const onFileSelected = useCallback((selected: File | null) => {
    setOutcome(null);
    if (selected === null) {
      setFile(null);
      setBytes(null);
      return;
    }
    setReading(true);
    void selected.arrayBuffer().then((buffer) => {
      setBytes(new Uint8Array(buffer));
      setFile({ name: selected.name, byteSize: selected.size });
      setReading(false);
    });
  }, []);

  const submit = useCallback(async () => {
    if (demo || bytes === null || file === null || submitting) {
      return;
    }
    if (format !== "csv" && format !== "xlsx" && format !== "pdf") {
      return;
    }
    setSubmitting(true);
    setOutcome(null);
    // QA-003: the flow runs import → normalization (the derived view is
    // ensured BEFORE the lens reloads — the 409 normalization_required
    // defect's fix). The host reloads its lens in BOTH outcome branches
    // where the import itself succeeded: the document joins the selector's
    // list either way, and its own lens failure (if any) renders per-import.
    const result = await runBoqImportFlow(environment.fetchImpl, bytes, format);
    setSubmitting(false);
    if (result.kind === "imported") {
      setOutcome(result);
      onImported(result.record.importId);
      return;
    }
    setOutcome({ kind: "failed", detail: result.detail });
  }, [demo, bytes, file, format, submitting, environment.fetchImpl, onImported]);

  return (
    <BoqImportPanelBody
      projectId={projectId}
      demo={demo}
      format={format}
      onFormat={setFormat}
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

/** The import body (exported for static render tests — pure projection). */
export function BoqImportPanelBody({
  projectId,
  demo,
  format,
  onFormat,
  file,
  reading,
  submitting,
  outcome,
  onFileSelected,
  onSubmit,
}: {
  readonly projectId: string;
  readonly demo: boolean;
  readonly format: string;
  readonly onFormat: (format: string) => void;
  readonly file: SelectedBoqFile | null;
  readonly reading: boolean;
  readonly submitting: boolean;
  readonly outcome: BoqImportOutcome | null;
  readonly onFileSelected: (file: File | null) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  const ready = !demo && file !== null && !reading;
  return (
    <Card
      title="Import a SOURCE BOQ"
      badge={demo ? <DataBadge mode="demo" /> : <DataBadge mode="api" />}
      meta={
        <span>
          one source file → POST /v1/boq/imports (the server stores the bytes
          content-addressed BEFORE parsing — preservation is unconditional) →
          the derived normalization is ensured (POST
          /v1/boq/imports/:id/normalization) so the lens below can open
        </span>
      }
    >
      <p data-boq-class="source">
        <span className="tag tag-mapping-mapped">SOURCE BOQ</span> The
        incumbent scope&apos;s own record: the ERP&apos;s export, the
        contractor&apos;s spreadsheet, the tender PDF. Importing stores the
        verbatim bytes server-side and parses them into the lens&apos; source
        rows — the source is <strong>never edited, never overwritten</strong>{" "}
        (identical bytes re-import to the same record; derived normalization
        and mapping live in separate, clearly-derived views).
      </p>
      <p data-boq-class="solution">
        <span className="tag tag-origin-scenario">SOLUTION BOQ</span> is a
        different record class: a DERIVED projection from a declared validation
        snapshot of a proposed solution —{" "}
        <a href={formatRoute({ name: "solution", projectId, query: {} })}>
          the Interactive Solution surface
        </a>{" "}
        authors and traces them. A solution BOQ never replaces a source BOQ,
        and neither is the building itself — the BOQ graph is not reality.
      </p>
      <div className="task-form">
        <label className="inline-label" htmlFor="boq-import-format">
          Format (declared by you — the server parses accordingly)
          <select
            id="boq-import-format"
            value={format}
            onChange={(event) => {
              onFormat(event.target.value);
            }}
          >
            {BOQ_IMPORT_FORMATS.map((entry) => (
              <option key={entry.format} value={entry.format}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-label" htmlFor="boq-import-file">
          Source file
          <input
            id="boq-import-file"
            type="file"
            accept=".csv,.xlsx,.pdf"
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
          {plural(file.byteSize, "byte")} · declared format{" "}
          <span className="mono">{format}</span>
        </p>
      )}
      {demo ? (
        <div className="callout callout-warning" data-demo-notice="true">
          Import requires the live API — this deployment renders the demo
          dataset, and the shell never fabricates writes or server answers.
          Start the API (or open a deployment with one) to import a source
          BOQ.
        </div>
      ) : null}
      <div className="toolbar">
        <button
          type="button"
          className="button"
          disabled={!ready || submitting}
          data-submit-state={demo ? "demo" : file === null ? "no-file" : submitting ? "submitting" : "ready"}
          onClick={onSubmit}
        >
          {submitting ? "Importing…" : "Import the source BOQ"}
        </button>
      </div>
      {outcome === null ? null : outcome.kind === "failed" ? (
        <div className="callout callout-warning" data-outcome="failed" role="alert">
          <p>
            <strong>The import was refused.</strong> {outcome.detail}
          </p>
          <p className="pane-foot">
            A refused import still preserves nothing silently: the server
            states the typed reason (a corrupt file of a supported format
            answers <span className="mono">boq_parse_failed</span> with the
            failing part — the bytes stay stored and retrievable).
          </p>
        </div>
      ) : (
        <div className="callout callout-info" data-outcome="imported" role="status">
          <p>
            <strong>Source BOQ stored server-side.</strong> Import{" "}
            <span className="mono">{outcome.record.importId}</span> · format{" "}
            <span className="mono">{outcome.record.format}</span> ·{" "}
            {plural(outcome.record.byteSize, "byte")} ·{" "}
            {outcome.record.parseStatus === "parsed"
              ? outcome.record.rowCount === null
                ? "parsed"
                : `parsed (${plural(outcome.record.rowCount, "source row")})`
              : `stored without parsing (${outcome.record.parseStatus})`}
            {outcome.record.parseReason === null
              ? ""
              : ` — ${outcome.record.parseReason}`}
            .
          </p>
          {outcome.normalization === undefined || outcome.normalization === null ? null : outcome.normalization.ok ? (
            <p className="pane-foot" data-normalization="ensured">
              The derived normalization is ensured —{" "}
              {plural(outcome.normalization.view.totalItems, "item row")} under
              dictionary <span className="mono">{outcome.normalization.view.dictionaryVersion}</span>{" "}
              ({plural(outcome.normalization.view.resolvedConcepts, "resolved concept")},{" "}
              {plural(outcome.normalization.view.unresolvedConcepts, "unresolved concept")}{" "}
              — unresolved is an honest outcome, never guessed) — so the lens
              below can open this import.
            </p>
          ) : (
            <p className="pane-foot" data-normalization="failed" role="alert">
              <strong>The derived view could not be ensured.</strong>{" "}
              {outcome.normalization.detail} The source stays stored under its
              content id, but the lens cannot be built for this import — the
              reason is the route&apos;s own typed answer.
            </p>
          )}
          {outcome.deployment === "serverless" ? (
            <p className="pane-foot" data-ephemerality="serverless">
              Imports live per-instance on this deployment and may not survive
              a reload — the SOURCE BOQ parse result shown now is the
              server&apos;s own answer.
            </p>
          ) : null}
          <p className="pane-foot">
            The lens below renders one import at a time (the deployment&apos;s
            own order); reload it to see the newly ingested source among the
            deployment&apos;s imports. The source record stays immutable under
            its content id.
          </p>
          <p className="mono pane-foot">{outcome.endpoint}</p>
        </div>
      )}
    </Card>
  );
}
