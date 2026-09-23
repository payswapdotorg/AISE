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
 * PRESENTATION ONLY: the ingestion route is the authority; nothing here
 * normalizes, maps or derives.
 */

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { isDemoMode, useAppEnvironment } from "../environment";
import {
  BOQ_IMPORT_FORMATS,
  describeApiFailure,
  importBoqSourceLive,
  type BoqImportRecord,
} from "../api";
import { Card, DataBadge } from "../components";
import { formatRoute } from "../router";
import { plural } from "../format";

/** The selected source file's honest summary. */
export interface SelectedBoqFile {
  readonly name: string;
  readonly byteSize: number;
}

/** The import outcome (the route's verbatim answer, or the typed failure). */
export type BoqImportOutcome =
  | { readonly kind: "imported"; readonly record: BoqImportRecord; readonly endpoint: string }
  | { readonly kind: "failed"; readonly detail: string };

/**
 * The first-class SOURCE-BOQ import panel. The file is read locally and
 * POSTed as raw bytes with the operator-declared format (the route's
 * authoritative `?format=` resolution). Demo mode disables submission with
 * the honest never-fabricate notice.
 */
export function BoqImportPanel({
  projectId,
  onImported,
}: {
  readonly projectId: string;
  /** Signals the host surface to reload its lens (the new import may join it). */
  readonly onImported: () => void;
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
    const result = await importBoqSourceLive(environment.fetchImpl, bytes, format);
    setSubmitting(false);
    if (result.ok) {
      setOutcome({ kind: "imported", record: result.record, endpoint: result.endpoint });
      onImported();
      return;
    }
    setOutcome({ kind: "failed", detail: describeApiFailure(result.failure) });
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
          content-addressed BEFORE parsing — preservation is unconditional)
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
