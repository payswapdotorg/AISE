/**
 * PROD-002 — shared presentational components of the product web shell.
 *
 * EVERYTHING HERE IS PURE PRESENTATION (props in, JSX out — no fetching, no
 * clocks, no randomness): the honesty system of the product lives in this
 * file as reusable pieces, so no surface can forget it:
 *
 *  - {@link EpistemicBadge} — the epistemic vocabulary (OBSERVED / CONFIRMED
 *    / INFERRED / PROPOSED, carried verbatim from the libraries) with a
 *    DISTINCT visual treatment per status; proposed is amber + dashed,
 *    observed blue, confirmed green, inferred gray. An unknown status
 *    renders VERBATIM in a neutral badge — never upgraded, never hidden.
 *  - {@link DerivedTag} — the "derived" marker every normalized/mapped/
 *    reconstructed value must carry.
 *  - {@link SigmaNote} — measurement uncertainty: `± σ` when known, the
 *    explicit "σ unknown" when the record does not carry one — never ±0.
 *  - {@link SourceNote} — the shell library's source-reference discipline:
 *    every displayed value names its module + verbatim record id.
 *  - {@link DataBadge} / {@link DemoBadge} — API vs demo-data provenance.
 *  - The state components ({@link LoadingPanel}, {@link EmptyState},
 *    {@link ErrorState}, {@link UnavailableState}) render the resource
 *    machine's four states; {@link ResourceView} wires them together.
 *  - {@link LibrarySvg} — embeds the frozen libraries' deterministic SVG
 *    strings and delegates click events to their `data-node-id` anchors.
 */

import type { MouseEvent, ReactNode } from "react";
import type { SourceRef } from "../shell";
import type { ResourceState } from "./resource";
import { formatInstant } from "./format";

/**
 * An IN-PAGE scroll anchor's click handler. The app routes by `location.hash`
 * (the hash IS the route), so a bare `href="#some-id"` link would NAVIGATE
 * THE ROUTE away — every in-page anchor must preventDefault and scroll
 * instead. Usage: `onClick={inPageAnchorOnClick}` (compose after it for
 * state side effects).
 */
export function inPageAnchorOnClick(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
  const href = event.currentTarget.getAttribute("href");
  if (href !== null && href.startsWith("#") && href.length > 1) {
    const target = document.getElementById(href.slice(1));
    if (target !== null) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}
import { PROJECT_SURFACES, formatRoute, projectSurfaceRoute } from "./router";
import type { CreateActionOffer, CreateActionOfferState } from "./create-forms";
import { evidenceIdsFromField } from "./evidence-picker";
import type { EvidenceOption } from "./evidence-picker";

/**
 * The per-project surface navigation (the golden journey order). Rendered at
 * the top of every project-scoped surface; the current surface is marked
 * with aria-current.
 */
export function ProjectSurfaceNav({
  projectId,
  current,
}: {
  readonly projectId: string;
  readonly current: "overview" | "sitetwin" | "boq-lens" | "case" | "intervention";
}): ReactNode {
  return (
    <nav className="toolbar" aria-label="Project surfaces">
      <a
        className="button button-secondary button-small"
        href={formatRoute({ name: "project", projectId })}
        aria-current={current === "overview" ? "page" : undefined}
      >
        Overview
      </a>
      {PROJECT_SURFACES.map((surface) => (
        <a
          key={surface.surface}
          className="button button-secondary button-small"
          href={formatRoute(projectSurfaceRoute(surface.surface, projectId))}
          aria-current={current === surface.surface ? "page" : undefined}
        >
          {surface.label}
        </a>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Honesty primitives                                                  */
/* ------------------------------------------------------------------ */

/**
 * The epistemic-status badge. `status` is carried VERBATIM from the
 * libraries' records; the visual treatment is presentation-only.
 */
export function EpistemicBadge({ status }: { readonly status: string }): ReactNode {
  const known =
    status === "OBSERVED" ||
    status === "CONFIRMED" ||
    status === "INFERRED" ||
    status === "PROPOSED";
  return (
    <span
      className={known ? `epistemic epistemic-${status.toLowerCase()}` : "epistemic epistemic-other"}
      data-epistemic={status}
      title={
        status === "PROPOSED"
          ? "Proposed content — not observed reality"
          : status === "CONFIRMED"
            ? "Confirmed by evidence and review"
            : status === "OBSERVED"
              ? "Directly observed in captured evidence"
              : status === "INFERRED"
                ? "Inferred — not directly observed"
                : "Status carried verbatim from the record"
      }
    >
      {status}
    </span>
  );
}

/** The "derived" marker: every normalized/mapped/derived value carries it. */
export function DerivedTag({ children = "derived" }: { readonly children?: ReactNode }): ReactNode {
  return (
    <span className="tag tag-derived" title="Derived by AISE from source records — not a source fact">
      {children}
    </span>
  );
}

/** Measurement uncertainty: ±σ when known, explicit "σ unknown" when not. */
export function SigmaNote({
  sigma,
  unit = "m",
}: {
  readonly sigma: number | null | undefined;
  readonly unit?: string;
}): ReactNode {
  if (sigma === null || sigma === undefined) {
    return (
      <span className="sigma sigma-unknown" title="The record does not state an uncertainty — never assumed zero">
        σ unknown
      </span>
    );
  }
  return (
    <span className="sigma" title="Measurement uncertainty carried by the geometry record">
      ± {String(sigma)} {unit}
    </span>
  );
}

/** Confidence (interpretation/mapping), verbatim from the lens records. */
export function ConfidenceBadge({ confidence }: { readonly confidence: string }): ReactNode {
  return (
    <span
      className={`confidence confidence-${confidence}`}
      data-confidence={confidence}
    >
      confidence: {confidence}
    </span>
  );
}

/** The source-reference note: module + verbatim record id. */
export function SourceNote({ source }: { readonly source: SourceRef }): ReactNode {
  return (
    <span className="source-note" data-source-module={source.module}>
      source: {source.module}/{source.recordId}
    </span>
  );
}

/** Provenance badge: live API record vs demo fixture. */
export function DataBadge({ mode }: { readonly mode: "api" | "demo" }): ReactNode {
  return mode === "api" ? (
    <span className="data-badge data-badge-api" title="Loaded from the same-origin AISE API">
      live API
    </span>
  ) : (
    <span
      className="data-badge data-badge-demo"
      title="The API is unavailable on this origin — this record comes from the built-in demo dataset (the libraries' fixtures)"
    >
      demo data
    </span>
  );
}

/** A cell-ref anchor: the verbatim source location inside a BOQ document. */
export function CellRef({ cellRef }: { readonly cellRef: string | null }): ReactNode {
  if (cellRef === null) {
    return <span className="cell-ref cell-ref-none">no cell ref</span>;
  }
  return <code className="cell-ref">{cellRef}</code>;
}

/* ------------------------------------------------------------------ */
/* Layout primitives                                                   */
/* ------------------------------------------------------------------ */

/** A titled card (the product's primary content container). */
export function Card({
  title,
  meta,
  badge,
  children,
  id,
}: {
  readonly title: ReactNode;
  readonly meta?: ReactNode;
  readonly badge?: ReactNode;
  readonly children: ReactNode;
  readonly id?: string;
}): ReactNode {
  return (
    <section className="card" id={id}>
      <div className="card-head">
        <h2 className="card-title">{title}</h2>
        {badge}
        {meta === undefined ? null : <div className="card-meta">{meta}</div>}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

/** A definition-list row. */
export function Field({
  label,
  children,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A timestamp rendered deterministically from the record's ISO string. */
export function Instant({ iso }: { readonly iso: string }): ReactNode {
  return <time dateTime={iso}>{formatInstant(iso)}</time>;
}

/* ------------------------------------------------------------------ */
/* Resource machine rendering                                          */
/* ------------------------------------------------------------------ */

/** The loading state: a labelled skeleton block (never a bare spinner). */
export function LoadingPanel({ label }: { readonly label: string }): ReactNode {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <p className="state-title">{label}</p>
      <div className="skeleton" aria-hidden="true">
        <span className="skeleton-line" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-line-short" />
      </div>
    </div>
  );
}

/** The empty state: guidance + the next action (never blank space). */
export function EmptyState({
  title,
  guidance,
  action,
}: {
  readonly title: string;
  readonly guidance: ReactNode;
  readonly action?: ReactNode;
}): ReactNode {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      <p className="state-guidance">{guidance}</p>
      {action === undefined ? null : <div className="state-action">{action}</div>}
    </div>
  );
}

/** The error state: the message + a retry control (attempt counted). */
export function ErrorState({
  message,
  onRetry,
  attempt,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
  readonly attempt: number;
}): ReactNode {
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">This data could not be loaded</p>
      <p className="state-guidance">{message}</p>
      <p className="state-detail">Attempt {String(attempt)}.</p>
      {onRetry === undefined ? null : (
        <div className="state-action">
          <button type="button" className="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The unavailable-provider state: WHY the provider is disabled/unavailable
 * and WHAT the user loses — first-class, never downgraded to "empty".
 */
export function UnavailableState({
  reason,
  impact,
  onRetry,
}: {
  readonly reason: string;
  readonly impact: string;
  readonly onRetry?: () => void;
}): ReactNode {
  return (
    <div className="state state-unavailable">
      <p className="state-title">Unavailable in this deployment</p>
      <p className="state-guidance">{reason}</p>
      <p className="state-detail">Impact: {impact}</p>
      {onRetry === undefined ? null : (
        <div className="state-action">
          <button type="button" className="button" onClick={onRetry}>
            Check again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Render a resource machine state through the matching state component.
 * `render` is only called for `ready`; the surface owns empty detection
 * inside `render` (guidance + next action).
 */
export function ResourceView<T>({
  state,
  loadingLabel,
  onRetry,
  render,
}: {
  readonly state: ResourceState<T>;
  readonly loadingLabel: string;
  readonly onRetry?: () => void;
  readonly render: (data: T) => ReactNode;
}): ReactNode {
  switch (state.status) {
    case "loading":
      return <LoadingPanel label={loadingLabel} />;
    case "error":
      return <ErrorState message={state.message} onRetry={onRetry} attempt={state.attempt} />;
    case "unavailable":
      return (
        <UnavailableState reason={state.reason} impact={state.impact} onRetry={onRetry} />
      );
    case "ready":
      return render(state.data);
  }
}

/* ------------------------------------------------------------------ */
/* Library SVG embedding                                               */
/* ------------------------------------------------------------------ */

/**
 * Embed one of the frozen libraries' deterministic SVG documents. Clicks
 * are delegated to the shapes' `data-node-id` anchors (the libraries emit
 * them as their stable cross-pane identity hooks) — presentation only.
 */
export function LibrarySvg({
  svg,
  title,
  onSelectNode,
  className,
}: {
  readonly svg: string;
  readonly title: string;
  readonly onSelectNode?: (nodeId: string) => void;
  readonly className?: string;
}): ReactNode {
  return (
    <div
      className={`library-svg${className === undefined ? "" : ` ${className}`}`}
      role="img"
      aria-label={title}
      onClick={
        onSelectNode === undefined
          ? undefined
          : (event) => {
              const target = event.target;
              if (target instanceof Element) {
                const nodeId = target.getAttribute("data-node-id");
                if (nodeId !== null) {
                  onSelectNode(nodeId);
                }
              }
            }
      }
    >
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PROD-010 — the brokered CREATE panels' shared machinery              */
/*                                                                     */
/* EVERYTHING IN THIS SECTION IS PURE PRESENTATION (props in, JSX out). */
/* The panels stay thin: they own draft state + the broker question +   */
/* the write adapter call; these components render the honest matrix    */
/* (authorization note, demo notice, named defects, explicit outcomes). */
/* ------------------------------------------------------------------ */

/** The explicit outcome of one submitted write (created or failed, named). */
export type CreatePanelOutcome =
  | { readonly kind: "created"; readonly detail: string; readonly endpoint: string }
  | { readonly kind: "failed"; readonly detail: string };

/** Human text for one brokered offer's authorization state (verbatim codes). */
export function describeOfferState(state: CreateActionOfferState): string {
  switch (state.kind) {
    case "allowed":
      return `allowed — permission ${state.grant.permission} via role ${state.grant.roleId}`;
    case "refused":
      return `refused — ${state.refusal.code}: ${state.refusal.detail}`;
    case "unavailable":
      return `unavailable — ${state.reason}`;
    case "ask-failed":
      return `the authorization question failed — ${state.detail}`;
  }
}

/**
 * The honest CREATE-panel matrix (the shared chassis of every write panel):
 *
 *  - the AUTHORIZATION NOTE renders the brokered offer's tri-state (or
 *    "checking…" while the question is in flight) with codes VERBATIM;
 *  - the DEMO NOTICE states that creation requires the live API and that
 *    the shell never fabricates writes — the submit control is DISABLED
 *    in demo mode, always;
 *  - the submit control is enabled ONLY when the offer is an EXPLICIT
 *    `allowed` AND the draft is valid AND no write is in flight;
 *  - draft defects are NAMED (the server contracts stay the authority);
 *  - outcomes are EXPLICIT: the created record's id + endpoint, or the
 *    typed failure detail — never a silent state change;
 *  - the optional `children` slot carries the pickers.
 */
export function CreateRecordPanel({
  id,
  title,
  intro,
  offer,
  mode,
  draftValid,
  defects,
  submitting,
  outcome,
  onSubmit,
  submitLabel = "Create record",
  children,
}: {
  /** The anchor id (deep-linkable: #create-project, #append-step, …). */
  readonly id: string;
  readonly title: string;
  readonly intro?: ReactNode;
  /** The brokered offer (null while the authorization question is in flight). */
  readonly offer: CreateActionOffer | null;
  readonly mode: "demo" | "api";
  readonly draftValid: boolean;
  readonly defects: readonly string[];
  readonly submitting: boolean;
  readonly outcome: CreatePanelOutcome | null;
  readonly onSubmit: () => void;
  readonly submitLabel?: string;
  readonly children?: ReactNode;
}): ReactNode {
  const allowed = offer !== null && offer.state.kind === "allowed";
  const demo = mode === "demo";
  const submitDisabled = demo || !allowed || !draftValid || submitting;
  return (
    <section className="card" id={id}>
      <div className="card-head">
        <h2 className="card-title">{title}</h2>
      </div>
      <div className="card-body">
        {intro === undefined ? null : <p>{intro}</p>}
        <p className="pane-foot" data-offer-state={offer === null ? "asking" : offer.state.kind}>
          Authorization:{" "}
          {offer === null ? (
            "checking with the broker…"
          ) : (
            <>
              {describeOfferState(offer.state)}
              {offer === null || offer.state.kind !== "refused" ? null : (
                <> (permission {offer.action.descriptor.requiredPermission})</>
              )}
            </>
          )}
        </p>
        {demo ? (
          <div className="callout callout-warning" data-demo-notice="true">
            Creation requires the live API — this deployment renders the demo
            dataset, and the shell never fabricates writes. Start the API (or
            open a deployment with one) to create records.
          </div>
        ) : null}
        {children}
        {defects.length === 0 ? null : (
          <div className="callout callout-warning" role="alert">
            <strong>The draft does not satisfy the recorded contract yet:</strong>
            <ul className="notes-list">
              {defects.map((defect) => (
                <li key={defect}>{defect}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="toolbar">
          <button
            type="button"
            className="button"
            disabled={submitDisabled}
            data-submit-state={demo ? "demo" : allowed ? (draftValid ? "ready" : "invalid-draft") : "not-allowed"}
            onClick={onSubmit}
          >
            {submitting ? "Submitting…" : submitLabel}
          </button>
        </div>
        {outcome === null ? null : outcome.kind === "created" ? (
          <div className="callout callout-info" data-outcome="created" role="status">
            <p>
              <strong>Created.</strong> {outcome.detail}
            </p>
            <p className="mono">{outcome.endpoint}</p>
          </div>
        ) : (
          <div className="callout callout-warning" data-outcome="failed" role="alert">
            <p>
              <strong>The write was refused.</strong> {outcome.detail}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/** One labeled draft field: text input, select (fixed options) or textarea. */
export function CreateField({
  label,
  value,
  onChange,
  options,
  multiline,
  rows = 3,
  hint,
  placeholder,
  mono = true,
  disabled = false,
}: {
  readonly label: ReactNode;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Fixed options render a select (the append-step kind selector). */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly multiline?: boolean;
  readonly rows?: number;
  readonly hint?: ReactNode;
  readonly placeholder?: string;
  readonly mono?: boolean;
  readonly disabled?: boolean;
}): ReactNode {
  const id = `field-${String(label).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {options === undefined ? (
        multiline === true ? (
          <textarea
            id={id}
            className={mono ? "mono" : undefined}
            rows={rows}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
        ) : (
          <input
            id={id}
            type="text"
            className={mono ? "mono" : undefined}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
        )
      ) : (
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {hint === undefined ? null : <p className="pane-foot">{hint}</p>}
    </div>
  );
}

/** The evidence picker's honest data states (the register read discipline). */
export type EvidencePickerStatus =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly options: readonly EvidenceOption[] };

/**
 * The evidence PICKER (pure): a checkbox list of FULL content addresses
 * from the evidence-picker options, with loading / failed / empty honest
 * states. INVALIDATED entries render visible but UNPICKABLE. The hand-entry
 * field (the panel's comma-separated ids field) remains the power-user
 * path — this picker only toggles entries in it.
 */
export function EvidencePicker({
  status,
  value,
  onToggle,
}: {
  readonly status: EvidencePickerStatus;
  /** The panel's comma-separated evidence-id field (the toggle target). */
  readonly value: string;
  readonly onToggle: (evidenceId: string) => void;
}): ReactNode {
  const selected = evidenceIdsFromField(value);
  return (
    <fieldset className="picker" data-picker="evidence">
      <legend>Evidence register (pick by content address)</legend>
      {status.kind === "loading" ? (
        <p className="state-guidance" data-picker-state="loading">
          Loading the evidence register…
        </p>
      ) : status.kind === "failed" ? (
        <p className="state-guidance" data-picker-state="failed">
          The evidence register could not be loaded: {status.message} — hand-entry below remains
          available.
        </p>
      ) : status.options.length === 0 ? (
        <p className="state-guidance" data-picker-state="empty">
          The register carries no pickable evidence records — hand-entry below remains the path.
        </p>
      ) : (
        <ul className="notes-list">
          {status.options.map((option) => {
            const checked = selected.includes(option.evidenceId);
            return (
              <li key={option.evidenceId}>
                <label
                  className={option.invalidated ? "picker-entry picker-entry-invalidated" : "picker-entry"}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={option.invalidated}
                    onChange={() => {
                      onToggle(option.evidenceId);
                    }}
                  />{" "}
                  <span className="mono" title={option.evidenceId}>
                    {option.evidenceId}
                  </span>
                  <span className="picker-caption"> — {option.caption}</span>
                  {option.invalidated ? (
                    <span className="tag tag-invalidated">
                      invalidated{option.invalidationReason === null ? "" : ` — ${option.invalidationReason}`} (unpickable)
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <p className="pane-foot">
        Picked ids ride the write verbatim; hand-entry below stays available (power-user path).
      </p>
    </fieldset>
  );
}

/** One case-picker option (record fields only — caseId + title). */
export interface CasePickerOption {
  readonly caseId: string;
  readonly title: string;
}

/**
 * The CASE picker (pure): a radio list over the deployment's recorded case
 * summaries. The hand-entry field stays (the cases route is deployment-wide
 * in this API build — the picker OFFERS, hand-entry decides).
 */
export function CasePicker({
  options,
  value,
  onPick,
}: {
  readonly options: readonly CasePickerOption[];
  readonly value: string;
  readonly onPick: (caseId: string) => void;
}): ReactNode {
  const known = options.some((option) => option.caseId === value);
  return (
    <fieldset className="picker" data-picker="case">
      <legend>Recorded cases (pick one)</legend>
      {options.length === 0 ? (
        <p className="state-guidance" data-picker-state="empty">
          No cases are recorded on this deployment yet — hand-entry stays the path.
        </p>
      ) : (
        <ul className="notes-list">
          {options.map((option) => (
            <li key={option.caseId}>
              <label className="picker-entry">
                <input
                  type="radio"
                  name="case-picker"
                  checked={known && value === option.caseId}
                  onChange={() => {
                    onPick(option.caseId);
                  }}
                />{" "}
                <span className="mono">{option.caseId}</span>
                <span className="picker-caption"> — {option.title}</span>
              </label>
            </li>
          ))}
          {known ? null : (
            <li className="state-guidance" data-picker-state="hand-entry">
              The current value {value === "" ? "(empty)" : <span className="mono">{value}</span>} is
              hand-entered — it is not one of the recorded cases above.
            </li>
          )}
        </ul>
      )}
    </fieldset>
  );
}

/** One step-picker row (the scenario's REAL step ids — never invented). */
export interface StepPickerOption {
  readonly stepId: string;
  readonly kind: string;
  readonly stepIndex: number;
}

/**
 * The STEP picker (pure): checkboxes over the scenario's REAL step ids.
 * Hand-added ids the scenario does not carry are NAMED by the panel (the
 * `unknown_step_ref` mirror) — this picker only offers what exists.
 */
export function StepPicker({
  steps,
  selectedStepIds,
  onToggle,
}: {
  readonly steps: readonly StepPickerOption[];
  readonly selectedStepIds: readonly string[];
  readonly onToggle: (stepId: string) => void;
}): ReactNode {
  if (steps.length === 0) {
    return (
      <p className="state-guidance" data-picker-state="empty">
        This scenario carries no steps yet — append a step first (#append-step).
      </p>
    );
  }
  return (
    <fieldset className="picker" data-picker="step">
      <legend>Scenario steps (the scenario&apos;s real step ids)</legend>
      <ul className="notes-list">
        {steps.map((step) => {
          const checked = selectedStepIds.includes(step.stepId);
          return (
            <li key={step.stepId}>
              <label className="picker-entry">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    onToggle(step.stepId);
                  }}
                />{" "}
                <span className="mono" title={step.stepId}>
                  {step.stepId}
                </span>
                <span className="picker-caption">
                  {" "}
                  — step {String(step.stepIndex)} · {step.kind}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/** The baseline picker's honest data states. */
export type BaselinePickerState =
  | { readonly kind: "demo" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "none" }
  | {
      readonly kind: "ready";
      readonly version: { readonly versionId: string; readonly createdAt: string; readonly nodeCount: number };
    };

/**
 * The BASELINE picker (pure): renders the latest-reality-version read's
 * honest state next to the baseline field. The EMPTY-vNNN trap is called
 * out explicitly — pinning a baseline whose version carries NO nodes
 * materializes empty states; a version with nodes names its node count.
 */
export function BaselinePicker({
  state,
  value,
  onChange,
}: {
  readonly state: BaselinePickerState;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <div className="field" data-picker="baseline">
      <label htmlFor="field-baseline-version">Pinned baseline (vNNN reality version)</label>
      <input
        id="field-baseline-version"
        type="text"
        className="mono"
        value={value}
        placeholder="v001"
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {state.kind === "demo" ? (
        <p className="pane-foot" data-picker-state="demo">
          Demo mode — the demo dataset&apos;s scenario worlds pin their own baselines; the latest
          live reality version cannot be probed without the API.
        </p>
      ) : state.kind === "loading" ? (
        <p className="pane-foot" data-picker-state="loading">
          Loading the project&apos;s latest reality version…
        </p>
      ) : state.kind === "failed" ? (
        <p className="pane-foot" data-picker-state="failed">
          The latest reality version could not be loaded: {state.message} — hand-entry stays
          available (a wrong id is named by the server&apos;s typed refusal).
        </p>
      ) : state.kind === "none" ? (
        <p className="pane-foot" data-picker-state="none">
          No reality version is recorded for this project yet — a scenario pins a baseline, and
          there is none to pin. Record a reality snapshot first.
        </p>
      ) : state.version.nodeCount === 0 ? (
        <div className="callout callout-warning" data-picker-state="empty-latest">
          <p>
            <strong>The empty-version trap:</strong> the latest reality version{" "}
            <span className="mono">{state.version.versionId}</span> carries ZERO nodes — pinning it
            materializes empty states. Pin it only if that is the honest intent.
          </p>
        </div>
      ) : (
        <p className="pane-foot" data-picker-state="ready">
          Latest reality version: <span className="mono">{state.version.versionId}</span> ·{" "}
          {String(state.version.nodeCount)} nodes · created {state.version.createdAt} — the field
          prefills with it until you type your own (a typed value is a manual override).
        </p>
      )}
    </div>
  );
}
