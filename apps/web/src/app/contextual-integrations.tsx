/**
 * PROD-034 — CONTEXTUAL incumbent-integration discovery (issue #9 gap 5:
 * integrations discoverable FROM the current task, not Settings archaeology).
 *
 * The incumbent source-of-record references the CURRENT TASK's records
 * already carry are the contextual discovery points: the BOQ context
 * records WHERE the scope came from (`sourceSystem` + the VERBATIM
 * `sourceRecordRef` — e.g. the ERP's own BOQ number). This module surfaces
 * those references AT the surfaces where they are relevant (the BOQ Lens —
 * where the incumbent's scope is inspected — and the task-first landing —
 * the current task's context), each rendered with the deployment's
 * matching connector binding when one exists.
 *
 * THE HONESTY RULES (the AISE-037 integration discipline, presented):
 *
 *  - REFERENCE-ONLY: an incumbent reference is displayed verbatim; AISE
 *    does not own it, re-key it or merge it. Integration metadata is
 *    NEVER a new authority — external systems stay authoritative for
 *    their own domains.
 *  - The binding join is a PRESENTATION JOIN over RECORDED vocabulary:
 *    a binding matches when its declared system class IS the recorded
 *    system family (`erp` ↔ `erp-procurement`, the frozen SYSTEM_CLASSES
 *    vocabulary) — the basis line states the join; nothing is invented.
 *  - EXPLICIT STATES: not-configured (no binding for the system — the
 *    reference stays reference-only), unavailable (the binding's adapter
 *    reported a typed failure — verbatim), unknown-last-sync (first-class
 *    unknown), and the live-mode honest not-readable state (the
 *    integration registry has no readable same-origin endpoint in this
 *    build — the same statement Settings makes, never faked).
 *  - Authorized ACTIONS resolve per principal through the authorization
 *    broker — never decided here (no second authority); the contextual
 *    card links the brokered panel for that.
 *
 * Determinism: pure functions + pure presentation; no clock, no
 * randomness, no IO.
 */

import type { ReactNode } from "react";
import type { ConnectorBindingView } from "../shell";
import { allBindings } from "../shell/fixtures";
import type { TaskFlowBundle } from "./task-contract";
import { useTaskFlow, TaskFlowResourceView } from "./task-first";
import type { TaskFlowResourceData } from "./task-first";
import { isDemoMode, useAppEnvironment } from "./environment";
import { Card, DataBadge, EmptyState, Instant } from "./components";
import { BindingStatusBadge } from "./surfaces/Settings";
import { formatRoute } from "./router";

/* ------------------------------------------------------------------ */
/* The discovery model (pure projections of the records)               */
/* ------------------------------------------------------------------ */

/** One incumbent source-of-record reference discovered on the records. */
export interface IncumbentSourceRef {
  /** The recorded system identity, VERBATIM (e.g. `erp`). */
  readonly system: string;
  /** The VERBATIM incumbent record id, when the record carries one. */
  readonly recordRef: string | null;
  /** Where the reference was discovered (the record's own identity). */
  readonly basis: string;
}

/** True when a recorded source system is AISE's own (not an incumbent). */
function isInternalSystem(system: string): boolean {
  return system === "aise-internal";
}

/**
 * Discover the incumbent source-of-record references of one task-flow
 * bundle (PURE): the BOQ context's source-of-record identity is the
 * incumbent reference the current task carries. Internal sources are
 * honestly excluded from the INCUMBENT list — they are AISE's own
 * records, not an external system of record (the exclusion is over the
 * recorded value itself, never a guess).
 */
export function incumbentSourceRefs(bundle: TaskFlowBundle): readonly IncumbentSourceRef[] {
  const refs: IncumbentSourceRef[] = [];
  const boq = bundle.boq;
  if (boq !== null && !isInternalSystem(boq.sourceSystem)) {
    refs.push({
      system: boq.sourceSystem,
      recordRef: boq.sourceRecordRef ?? null,
      basis: `the BOQ context ${boq.boqId} (revision ${String(boq.revision)}) records its source of record`,
    });
  }
  return refs;
}

/**
 * The connector bindings relevant to one incumbent reference (PURE): the
 * bindings whose declared system class IS the recorded system family —
 * `erp` ↔ `erp-procurement` over the frozen SYSTEM_CLASSES vocabulary.
 * A presentation join over RECORDED vocabulary (the caller renders the
 * basis); no binding is invented, and a non-matching system honestly
 * joins to nothing.
 */
export function bindingsForSourceRef(
  ref: IncumbentSourceRef,
  bindings: readonly ConnectorBindingView[],
): readonly ConnectorBindingView[] {
  return bindings.filter(
    (binding) =>
      binding.systemClass === ref.system || binding.systemClass.startsWith(`${ref.system}-`),
  );
}

/* ------------------------------------------------------------------ */
/* The card (the contextual discovery surface)                          */
/* ------------------------------------------------------------------ */

/** One incumbent reference block: the reference + its matching bindings. */
function IncumbentReferenceBlock({
  ref,
  bindings,
  mode,
}: {
  readonly ref: IncumbentSourceRef;
  readonly bindings: readonly ConnectorBindingView[] | null;
  readonly mode: "demo" | "api";
}): ReactNode {
  return (
    <div className="task-operation" data-incumbent-system={ref.system}>
      <p>
        <span className="tag tag-origin-touched">reference only</span>{" "}
        <strong className="mono">{ref.system}</strong>
        {ref.recordRef === null ? (
          " — no incumbent record id recorded"
        ) : (
          <>
            {" "}
            — record <span className="mono">{ref.recordRef}</span>
          </>
        )}
      </p>
      <p className="pane-foot">
        basis: {ref.basis} · the incumbent system stays the system of record
        for its own scope — AISE displays the reference, it does not own it.
      </p>
      {bindings === null ? (
        <div className="callout callout-warning" data-integration-state="not-readable">
          The integration registry (bindings, external record refs, action
          descriptors) has no readable same-origin endpoint in this build —
          which connectors exist for {ref.system} cannot be shown against the
          live API. The reference above stays reference-only either way.
        </div>
      ) : bindings.length === 0 ? (
        <div className="callout callout-warning" data-integration-state="not-configured">
          No integration is configured on this deployment for{" "}
          <span className="mono">{ref.system}</span> — the reference stays
          reference-only; there is nothing to sync and nothing was lost.
        </div>
      ) : (
        bindings.map((binding) => (
          <div key={binding.bindingId} data-integration-state={binding.status} className="task-operation">
            <p>
              <BindingStatusBadge status={binding.status} />{" "}
              <strong>{binding.displayName.value}</strong>{" "}
              <span className="pane-foot">
                binding <span className="mono">{binding.bindingId}</span> · system{" "}
                <span className="mono">
                  {binding.systemClass}/{binding.systemInstanceId}
                </span>
              </span>
            </p>
            <p className="pane-foot" data-integration-detail="true">
              {binding.statusDetail.value} · last sync:{" "}
              {binding.lastSyncAt === null ? (
                "never recorded — unknown, not assumed"
              ) : (
                <Instant iso={binding.lastSyncAt.value} />
              )}{" "}
              · capabilities: {binding.capabilities.join(", ")}
            </p>
            {binding.externalRecordRefs.length === 0 ? null : (
              <ul className="notes-list" data-integration-records="true">
                {binding.externalRecordRefs.map((record) => (
                  <li key={record.sourceRecordId}>
                    <span className="mono">{record.sourceRecordId}</span>
                    {record.revision === null ? "" : ` rev ${record.revision}`} —{" "}
                    {record.label.value}
                    {record.externalUrl === null ? (
                      " (no external URL recorded)"
                    ) : (
                      <>
                        {" "}
                        —{" "}
                        <a href={record.externalUrl} rel="noreferrer">
                          open in the incumbent system
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
      <p className="pane-foot" data-integration-actions="true">
        Authorized actions resolve per principal through the authorization
        broker — never here.{" "}
        <a href={formatRoute({ name: "settings" })}>
          The brokered action panel is at Settings / Integrations
        </a>
        . <DataBadge mode={mode} />{" "}
        <span className="pane-foot">
          (integration metadata is never a new authority)
        </span>
      </p>
    </div>
  );
}

/**
 * The contextual integrations card (exported for static render tests — a
 * pure projection): the incumbent source-of-record references of the
 * current task, each with its matching bindings and their honest states.
 * `bindings === null` is the live-mode not-readable state; `[]` per ref is
 * the honest not-configured state.
 */
export function ContextualIntegrationsCard({
  refs,
  bindings,
  mode,
}: {
  readonly refs: readonly IncumbentSourceRef[];
  /** The deployment's connector bindings; null = not readable in this build. */
  readonly bindings: readonly ConnectorBindingView[] | null;
  readonly mode: "demo" | "api";
}): ReactNode {
  return (
    <Card
      title="The incumbent systems behind this scope"
      badge={<DataBadge mode={mode} />}
      meta={
        <span>
          discovered from the current task&apos;s own records — reference-only,
          never a new authority
        </span>
      }
    >
      {refs.length === 0 ? (
        <EmptyState
          title="No incumbent source-of-record references on this task's records"
          guidance="The current task's records name no external system of record (an internal AISE source is not an incumbent system). Nothing external to discover here — the integrations that exist on this deployment are listed at Settings / Integrations."
          action={
            <a className="button button-secondary" href={formatRoute({ name: "settings" })}>
              Settings / Integrations
            </a>
          }
        />
      ) : (
        refs.map((ref) => (
          <IncumbentReferenceBlock
            key={`${ref.system}:${ref.recordRef ?? "no-ref"}`}
            ref={ref}
            bindings={bindings === null ? null : bindingsForSourceRef(ref, bindings)}
            mode={mode}
          />
        ))
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* The hook-driven panel (the surfaces render this one)                 */
/* ------------------------------------------------------------------ */

/**
 * The contextual integrations panel: the task-flow resource (the current
 * task's records) projected through {@link ContextualIntegrationsCard} —
 * demo mode renders the demo dataset's connector bindings (badged demo);
 * live mode renders the honest not-readable state for bindings (the
 * registry has no readable endpoint in this build) while the references
 * still render from the live bundle when it is served.
 */
export function ContextualIntegrationsPanel({
  projectId,
}: {
  readonly projectId: string;
}): ReactNode {
  const environment = useAppEnvironment();
  const demo = isDemoMode(environment) || environment.apiStatus === null;
  const { state, reload } = useTaskFlow(projectId);
  return (
    <TaskFlowResourceView
      state={state}
      onRetry={reload}
      render={(data) => <ContextualIntegrationsPanelBody data={data} demo={demo} />}
    />
  );
}

/** The panel body (exported for static render tests — pure projection). */
export function ContextualIntegrationsPanelBody({
  data,
  demo,
}: {
  readonly data: TaskFlowResourceData;
  readonly demo: boolean;
}): ReactNode {
  const mode: "demo" | "api" = demo ? "demo" : "api";
  if (data.bundle === null) {
    return (
      <ContextualIntegrationsCard
        refs={[]}
        bindings={demo ? allBindings() : null}
        mode={mode}
      />
    );
  }
  return (
    <ContextualIntegrationsCard
      refs={incumbentSourceRefs(data.bundle)}
      bindings={demo ? allBindings() : null}
      mode={mode}
    />
  );
}
