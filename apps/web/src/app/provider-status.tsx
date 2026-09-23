/**
 * PROD-034 — the PROVIDER-STATUS vocabulary and presentation (issue #9 gap
 * 6: provider readiness/degraded/unavailable states understandable and
 * consistent, without implementation noise).
 *
 * ONE consistent, calm treatment everywhere provider gating bites:
 *
 *  - the WORDS come from the backend's own readiness contract (`/readyz`
 *    answers `available | disabled | unavailable` per optional provider —
 *    statuses only, never credential material, never raw provider errors);
 *    the recorded word renders VERBATIM in the badge, exactly like every
 *    other carried vocabulary in this app;
 *  - the MEANING is the one calm user-facing sentence per word (below) —
 *    the same sentence everywhere, so `disabled` on the Settings panel and
 *    `disabled` under a blocked feature mean the same thing;
 *  - NO IMPLEMENTATION NOISE: no environment-variable names, no provider
 *    SDK identifiers beyond the deployment's own provider id, no raw
 *    errors, no retry-interval internals — the operator-facing detail
 *    lives in the deployment's logs, not the product UI;
 *  - `ProviderStatusNote` is the compact strip the provider-gated surfaces
 *    render (the task-flow unavailable view, the capture upload entry, the
 *    solution engine-unavailable panel): the API mode line + the providers
 *    (or the honest none-reported line), so a blocked feature always shows
 *    WHICH layer is unavailable — the API itself, an optional provider, or
 *    the surface's own route.
 *
 * PRESENTATION ONLY: the note never decides availability — the probed
 * statuses and each surface's own typed states stay the truth.
 */

import type { ReactNode } from "react";
import { useAppEnvironment } from "./environment";
import type { ProviderStatusWord } from "./api";

/* ------------------------------------------------------------------ */
/* The vocabulary (one meaning per recorded word)                       */
/* ------------------------------------------------------------------ */

/** The consistent user-facing meaning of one recorded provider status. */
export interface ProviderStatusMeaning {
  /** The calm one-line meaning (the same sentence everywhere). */
  readonly meaning: string;
  /** The badge's tooltip (what this word means in the readiness contract). */
  readonly title: string;
}

/** The ONE meaning of each recorded provider-status word (frozen data). */
const PROVIDER_STATUS_MEANINGS: Readonly<Record<ProviderStatusWord, ProviderStatusMeaning>> =
  Object.freeze({
    available: Object.freeze({
      meaning:
        "ready — configured on this deployment, and the parts of the product that use it can run",
      title: "the readiness check reports this provider as configured",
    } as const),
    disabled: Object.freeze({
      meaning:
        "not configured — a deliberate deployment choice, cleanly off; the features that would use it stay honestly unavailable",
      title: "the readiness check reports this provider as not configured (never an error)",
    } as const),
    unavailable: Object.freeze({
      meaning:
        "not usable — the deployment's readiness check reports it as misconfigured; the features that need it stay blocked until the operator fixes the configuration",
      title: "the readiness check reports this provider as configured but not usable",
    } as const),
  } as const);

/** The consistent meaning of one recorded provider status. */
export function describeProviderStatus(status: ProviderStatusWord): ProviderStatusMeaning {
  return PROVIDER_STATUS_MEANINGS[status];
}

/** The consistent badge: the recorded word VERBATIM, one visual per word. */
export function ProviderStatusBadge({ status }: { readonly status: ProviderStatusWord }): ReactNode {
  const meaning = describeProviderStatus(status);
  const className =
    status === "available"
      ? "tag tag-mapping-mapped"
      : status === "unavailable"
        ? "tag tag-missing-open"
        : "tag";
  return (
    <span className={className} title={meaning.title} data-provider-status={status}>
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* The list (the Settings API-connection section)                        */
/* ------------------------------------------------------------------ */

/** One provider row: the deployment's own id + the recorded status + the meaning. */
export function ProviderStatusRow({
  id,
  status,
}: {
  readonly id: string;
  readonly status: ProviderStatusWord;
}): ReactNode {
  return (
    <div className="field" data-provider-row={id}>
      <dt>
        <span className="mono">{id}</span>
      </dt>
      <dd>
        <ProviderStatusBadge status={status} /> {describeProviderStatus(status).meaning}
      </dd>
    </div>
  );
}

/**
 * The full provider list (Settings): every provider the deployment's
 * readiness check reports, statuses only, one consistent meaning each.
 */
export function ProviderStatusList({
  providers,
}: {
  readonly providers: Readonly<Record<string, ProviderStatusWord>>;
}): ReactNode {
  const ids = Object.keys(providers).sort();
  return (
    <dl className="fields" data-provider-list="true">
      {ids.map((id) => (
        <ProviderStatusRow key={id} id={id} status={providers[id]!} />
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* The compact note (the provider-gated surfaces)                        */
/* ------------------------------------------------------------------ */

/**
 * The compact, consistent provider-status note for a surface where
 * provider gating bites. The `subject` states WHAT is gated here (one calm
 * clause); the note then shows the deployment-level truth: the API mode
 * (the app's own vocabulary: live API / demo data), the per-provider
 * statuses when the deployment reports them, or the honest none-reported
 * line. Never a retry loop, never internals — the surfaces' own typed
 * states (unavailable views, demo notices) stay the primary honesty; this
 * note makes the LAYER of the problem identifiable at a glance.
 */
export function ProviderStatusNote({
  subject,
}: {
  /** What is provider-gated at this point (e.g. "the task-first flow"). */
  readonly subject: string;
}): ReactNode {
  const environment = useAppEnvironment();
  const status = environment.apiStatus;
  if (status === null) {
    return null; // probing — nothing honest to say yet
  }
  return (
    <div className="pane-foot" data-provider-note={subject}>
      <strong>Deployment status</strong> ({subject}):{" "}
      {status.mode === "available" ? (
        status.providers === null ? (
          <>
            <span className="tag tag-mapping-mapped">live API</span> this
            deployment reports no optional providers — nothing here is
            provider-gated beyond the API itself
          </>
        ) : (
          <>
            <span className="tag tag-mapping-mapped">live API</span> optional
            providers:{" "}
            {Object.keys(status.providers)
              .sort()
              .map((id) => (
                <span key={id} data-provider-inline={id}>
                  <span className="mono">{id}</span>{" "}
                  <ProviderStatusBadge status={status.providers![id]!} />
                </span>
              ))}{" "}
            — statuses are the deployment&apos;s own readiness report, never a
            guess
          </>
        )
      ) : (
        <>
          <span className="tag tag-mapping-unmapped">demo data</span> the API
          on this origin did not answer — provider statuses are not probeable
          without it; every live feature renders its honest unavailable state
          instead of pretending
        </>
      )}
    </div>
  );
}
