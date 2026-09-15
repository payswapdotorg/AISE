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

import type { ReactNode } from "react";
import type { SourceRef } from "../shell";
import type { ResourceState } from "./resource";
import { formatInstant } from "./format";
import { PROJECT_SURFACES, formatRoute, projectSurfaceRoute } from "./router";

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
