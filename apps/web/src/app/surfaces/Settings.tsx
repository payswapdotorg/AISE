/**
 * PROD-002 — the Settings / Integrations surface: the API connection status,
 * the external-system connector bindings (with their honest statuses), the
 * authorized-action tri-state matrix and the authorization decision table —
 * all consumed from the FROZEN shell library (the AISE-040 adoption shell).
 *
 * Honesty (the §040 broker matrix, presentation-only here):
 *  - allowed    → an ENABLED control (with the grant, relayed verbatim);
 *  - refused    → DISABLED + the verbatim refusal code and detail;
 *  - unavailable → DISABLED + the honest unknown reason;
 *  - binding statuses render distinctly: connected / unavailable /
 *    unknown-last-sync (an unknown is first-class, never "offline" by guess);
 *  - external record ids are verbatim references to the incumbent systems —
 *    AISE displays them, it does not own them.
 */

import { useCallback } from "react";
import type { ReactNode } from "react";
import { useResource, type ResourceOutcome } from "../resource";
import { isDemoMode, useAppEnvironment } from "../environment";
import {
  DEMO_ORG_ID,
  DEMO_PRINCIPALS,
  DEMO_PROJECT_ID,
  demoAuthorizationTable,
} from "../demo";
import {
  allBindings,
  authorizationTable,
  makeAuthorizationPort,
  projectTarget,
  type AuthorizationTableRow,
} from "../../shell/fixtures";
import {
  contextAddress,
  describeGrant,
  pairConnectorAction,
  resolveConnectorActionOffer,
  type ConnectorActionOffer,
} from "../../shell";
import type { ConnectorBindingView } from "../../shell";
import { Card, DataBadge, Instant, ResourceView, UnavailableState } from "../components";
import { ProviderStatusList } from "../provider-status";
import { plural } from "../format";

/** One connector surface: the binding + its resolved action offers. */
export interface ConnectorSurface {
  readonly binding: ConnectorBindingView;
  readonly offers: readonly ConnectorActionOffer[];
}

/**
 * Resolve the demo dataset's connector surfaces for one acting principal:
 * every fixture binding's action descriptors, paired with the project
 * context address as the return path and resolved through the demo
 * authorization port (the shell library's tri-state broker — this module
 * only assembles its inputs). Exported for the surface's tests.
 */
export async function demoConnectorSurfaces(
  principalId: string,
): Promise<readonly ConnectorSurface[]> {
  const port = makeAuthorizationPort(authorizationTable());
  const target = projectTarget();
  const returnTo = contextAddress(DEMO_PROJECT_ID);
  const surfaces: ConnectorSurface[] = [];
  for (const binding of allBindings()) {
    const offers: ConnectorActionOffer[] = [];
    for (const action of binding.actions) {
      const paired = pairConnectorAction(action, binding.bindingId, returnTo);
      offers.push(await resolveConnectorActionOffer(port, paired, principalId, target));
    }
    surfaces.push({ binding, offers });
  }
  return surfaces;
}

/** What the Settings surface renders once loaded. */
export interface SettingsData {
  readonly mode: "demo" | "api";
  /** The demo dataset's connector surfaces (null in live mode). */
  readonly connectors: readonly ConnectorSurface[] | null;
  /** The demo authorization decision table (null in live mode). */
  readonly authorization: readonly AuthorizationTableRow[] | null;
}

/** The Settings / Integrations surface. */
export function Settings({
  principalId,
  onPrincipalChange,
  onReprobe,
}: {
  /** The acting principal (drives the tri-state resolution). */
  readonly principalId: string;
  readonly onPrincipalChange: (principalId: string) => void;
  /** Re-run the API health probe. */
  readonly onReprobe: () => void;
}): ReactNode {
  const environment = useAppEnvironment();
  const mode = environment.apiStatus?.mode ?? "probing";
  const demoMode = environment.apiStatus?.mode === "unavailable";
  const load = useCallback(async (): Promise<ResourceOutcome<SettingsData>> => {
    if (isDemoMode(environment) || environment.apiStatus === null) {
      // The demo world: the shell fixtures' connector bindings, with offers
      // resolved through the demo authorization port for the acting principal
      // (the broker is the library's — this surface only renders its output).
      return {
        kind: "ready",
        data: {
          mode: "demo",
          connectors: await demoConnectorSurfaces(principalId),
          authorization: demoAuthorizationTable(),
        },
      };
    }
    return {
      kind: "ready",
      data: {
        mode: "api",
        // The integration registry has no readable same-origin endpoint in
        // this build — honestly unavailable, never faked.
        connectors: null,
        authorization: null,
      },
    };
  }, [environment, principalId]);

  const { state, reload } = useResource(`settings:${mode}:${principalId}`, load);

  return (
    <>
      <div className="page-head">
        <h1>Settings / Integrations</h1>
        <p>
          The deployment&apos;s API connection, the external systems bound to
          the project, and what each acting principal is authorized to do —
          decisions are relayed, never decided here.
        </p>
      </div>
      <ApiConnectionCard onReprobe={onReprobe} />
      {demoMode ? (
        <Card
          title="Acting principal"
          meta={<span>the demo authorization table&apos;s principals (the live deployment has no authenticated principal in this build)</span>}
        >
          <label className="inline-label" htmlFor="principal-select">
            Resolve connector actions as
          </label>{" "}
          <select
            id="principal-select"
            value={principalId}
            onChange={(event) => {
              onPrincipalChange(event.target.value);
            }}
          >
            {DEMO_PRINCIPALS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
          <p className="pane-foot">
            Switching the principal re-resolves every connector action through
            the authorization table below — allowed actions enable, refusals
            disable with their verbatim reason.
          </p>
        </Card>
      ) : null}
      <ResourceView
        state={state}
        loadingLabel="Loading integrations…"
        onRetry={reload}
        render={(data) => <SettingsBody data={data} />}
      />
    </>
  );
}

function ApiConnectionCard({ onReprobe }: { readonly onReprobe: () => void }): ReactNode {
  const environment = useAppEnvironment();
  const status = environment.apiStatus;
  return (
    <Card
      title="API connection"
      meta={<span>same-origin only — the app never talks to another origin</span>}
    >
      {status === null ? (
        <p role="status">checking the API on this origin…</p>
      ) : (
        <>
          <dl className="fields">
            <div className="field">
              <dt>Mode</dt>
              <dd>
                {status.mode === "available" ? (
                  <span className="tag tag-mapping-mapped">live API</span>
                ) : (
                  <span className="tag tag-mapping-unmapped">demo data</span>
                )}{" "}
                — {status.detail}
              </dd>
            </div>
            <div className="field">
              <dt>/healthz</dt>
              <dd>{status.healthz}</dd>
            </div>
            <div className="field">
              <dt>/readyz</dt>
              <dd>{status.readyz}</dd>
            </div>
          </dl>
          {status.mode === "available" ? (
            status.providers === null ? (
              <p className="pane-foot" data-providers="none-reported">
                This deployment&apos;s readiness check reports no optional
                providers — nothing on this deployment is provider-gated
                beyond the API itself.
              </p>
            ) : (
              <>
                <h3 className="pane-head">Optional providers (the readiness check&apos;s own report)</h3>
                <ProviderStatusList providers={status.providers} />
                <p className="pane-foot">
                  Statuses only, exactly as the readiness check reports them —
                  never credential material, never raw provider errors.
                </p>
              </>
            )
          ) : null}
          <div className="toolbar">
            <button type="button" className="button" onClick={onReprobe}>
              Check again
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

function SettingsBody({ data }: { readonly data: SettingsData }): ReactNode {
  return (
    <>
      {data.connectors === null ? (
        <Card title="Connector bindings" badge={<DataBadge mode={data.mode} />}>
          <UnavailableState
            reason="the integration registry (bindings, external record refs, action descriptors) has no readable same-origin endpoint in this build"
            impact="external-system status and authorized actions cannot be shown against the live API — the demo dataset (API unavailable) exercises the full connector panel"
          />
        </Card>
      ) : (
        <>
          {data.connectors.map((surface) => (
            <ConnectorCard key={surface.binding.bindingId} surface={surface} />
          ))}
        </>
      )}
      {data.authorization === null ? (
        <Card title="Authorization decisions" badge={<DataBadge mode={data.mode} />}>
          <UnavailableState
            reason="authorization decisions are relayed per request by the identity service; this build wires no readable decision endpoint"
            impact="the decision table below is a demo-dataset concept — it renders when the API is unavailable"
          />
        </Card>
      ) : (
        <AuthorizationTableCard table={data.authorization} />
      )}
    </>
  );
}

export { SettingsBody };

function ConnectorCard({ surface }: { readonly surface: ConnectorSurface }): ReactNode {
  const binding = surface.binding;
  return (
    <Card
      title={binding.displayName.value}
      badge={<BindingStatusBadge status={binding.status} />}
      meta={
        <span>
          binding <span className="mono">{binding.bindingId}</span> · system{" "}
          <span className="mono">
            {binding.systemClass}/{binding.systemInstanceId}
          </span>{" "}
          · <span title={binding.statusDetail.value}>{binding.statusDetail.value}</span>
        </span>
      }
    >
      <dl className="fields">
        <div className="field">
          <dt>Last sync</dt>
          <dd>
            {binding.lastSyncAt === null ? (
              "never recorded — unknown, not assumed"
            ) : (
              <Instant iso={binding.lastSyncAt.value} />
            )}
          </dd>
        </div>
        <div className="field">
          <dt>Capabilities</dt>
          <dd>{binding.capabilities.join(", ")}</dd>
        </div>
      </dl>
      <h3 className="pane-head">External records (verbatim references)</h3>
      <ul className="notes-list">
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
      <h3 className="pane-head">Authorized actions</h3>
      <ul className="action-list">
        {surface.offers.map((offer) => (
          <ActionOfferView key={offer.action.descriptor.actionId} offer={offer} />
        ))}
      </ul>
    </Card>
  );
}

export function BindingStatusBadge({ status }: { readonly status: string }): ReactNode {
  const className =
    status === "connected"
      ? "tag tag-mapping-mapped"
      : status === "unavailable"
        ? "tag tag-mapping-unmapped"
        : "tag tag-ambiguous";
  const title =
    status === "connected"
      ? "the adapter reports a healthy connection"
      : status === "unavailable"
        ? "the adapter reported a typed failure"
        : "no sync result recorded yet — unknown, first-class";
  return (
    <span className={className} title={title}>
      {status}
    </span>
  );
}

function ActionOfferView({ offer }: { readonly offer: ConnectorActionOffer }): ReactNode {
  const descriptor = offer.action.descriptor;
  const label = descriptor.label.value;
  const initiateUrl = descriptor.initiateUrl;
  return (
    <li className="action-offer" data-offer-state={offer.state.kind}>
      {offer.state.kind === "allowed" ? (
        initiateUrl === null ? (
          <button type="button" className="button" disabled title="allowed, but the deployment recorded no initiate URL for this action">
            {label}
          </button>
        ) : (
          <a className="button" href={initiateUrl} rel="noreferrer">
            {label}
          </a>
        )
      ) : (
        <button type="button" className="button" disabled>
          {label}
        </button>
      )}{" "}
      <span className="offer-state">
        {offer.state.kind === "allowed" ? (
          <span className="tag tag-mapping-mapped">allowed</span>
        ) : offer.state.kind === "refused" ? (
          <span className="tag tag-mapping-unmapped" title={offer.state.refusal.detail}>
            refused — {offer.state.refusal.code}
          </span>
        ) : (
          <span className="tag tag-ambiguous" title="the decision cannot be known in this deployment — never guessed">
            unavailable — {offer.state.reason}
          </span>
        )}
      </span>
      <div className="pane-foot">
        {offer.state.kind === "allowed"
          ? describeGrant(offer.state.grant)
          : offer.state.kind === "refused"
            ? offer.state.refusal.detail
            : "the authorization state is unknown here — the action stays disabled"}
        {" · "}
        requires <span className="mono">{descriptor.requiredPermission}</span> · returns to{" "}
        <span className="mono">
          {offer.action.returnTo.module}/{offer.action.returnTo.projectId}
        </span>
      </div>
    </li>
  );
}

function AuthorizationTableCard({
  table,
}: {
  readonly table: readonly AuthorizationTableRow[];
}): ReactNode {
  return (
    <Card
      title="Authorization decision table"
      badge={<DataBadge mode="demo" />}
      meta={
        <span>
          the demo dataset&apos;s decisions for organization{" "}
          <span className="mono">{DEMO_ORG_ID}</span>, project{" "}
          <span className="mono">{DEMO_PROJECT_ID}</span> — the identity
          refusal vocabulary, verbatim
        </span>
      }
    >
      <p className="pane-foot">
        {plural(table.length, "recorded decision")} — grants and refusals with
        their reasons, exactly as the identity module records them.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Principal</th>
              <th>Permission</th>
              <th>Decision</th>
              <th>Reason (verbatim)</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, index) => (
              <tr key={index}>
                <td className="mono">{row.principalId}</td>
                <td className="mono">{row.permission}</td>
                <td>
                  {row.decision.allowed ? (
                    <span className="tag tag-mapping-mapped">allowed</span>
                  ) : (
                    <span className="tag tag-mapping-unmapped">
                      refused — {row.decision.refusal.code}
                    </span>
                  )}
                </td>
                <td>
                  {row.decision.allowed
                    ? describeGrant(row.decision.grant)
                    : row.decision.refusal.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
