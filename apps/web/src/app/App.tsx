/**
 * PROD-002 — the application root: probes the same-origin API once (and on
 * demand), provides the app environment (transport facts only), routes the
 * hash address to ONE surface, and renders the explicit not-found surface
 * for unknown addresses.
 *
 * While the probe is in flight the app renders a labelled loading state —
 * never demo data behind a "checking" badge: the mode is resolved before
 * any surface loads, and every surface's resource key includes the mode so
 * a mode change re-loads honestly.
 *
 * PROD-004 (additive): when the API is available the app ALSO probes the
 * session (`/v1/auth/whoami`). When the deployment's auth layer is active
 * and no session exists, the web GATE renders (sign-in form + "Enter demo")
 * BEFORE the shell instead of the surfaces; a signed-in session renders the
 * shell with the user menu; a deployment without the auth layer (whoami
 * 404) renders exactly the pre-auth app. ANY surface 401 re-arms the gate
 * (the session died mid-flight). When the API is unavailable the app keeps
 * its honest demo-dataset behavior — the gate never blocks the offline
 * fallback.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { ReactNode } from "react";
import { probeApi, type ApiStatus } from "./api";
import { enterDemoSession, probeAuth, signInPrincipal, signOutSession } from "./api";
import { AppEnvironmentContext, type AppEnvironment } from "./environment";
import { AppShell, useHashRoute } from "./AppShell";
import { AuthGate, UserMenu, type GateActions } from "./AuthGate";
import { formatRoute, routeKey, type Route } from "./router";
import { gateAdmitsSurfaces, gateReducer, initialGateState } from "./gate";
import { LoadingPanel } from "./components";
import { Dashboard } from "./surfaces/Dashboard";
import { Projects } from "./surfaces/Projects";
import { ProjectOverview } from "./surfaces/ProjectOverview";
import { SiteTwin } from "./surfaces/SiteTwin";
import { BoqLensSurface } from "./surfaces/BoqLens";
import { EngineeringCase } from "./surfaces/EngineeringCase";
import { InterventionStudio } from "./surfaces/InterventionStudio";
import { Settings } from "./surfaces/Settings";

/** The browser's fetch (same-origin paths only — see api.ts). */
const browserFetch = (input: string, init?: RequestInit): Promise<Response> =>
  fetch(input, init);

/** The product application. */
export function App(): ReactNode {
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [probeAttempt, setProbeAttempt] = useState(1);
  const [principalId, setPrincipalId] = useState("user-alice");

  // PROD-010: the ACTING PRINCIPAL the session was minted for. The whoami
  // probe is display-only by design (AISE-036), so the app REMEMBERS the id
  // it authenticated with — typed at sign-in, the documented demo default
  // ("demo-evaluator") on Enter-demo — session-scoped so a reload keeps it
  // while the session lives. The SERVER stays the authority: a mismatched
  // or expired session surfaces as the honest typed 401/403 (never a
  // silently-wrong identity).
  const [sessionPrincipalId, setSessionPrincipalId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem("aise.acting-principal");
    } catch {
      return null;
    }
  });
  const rememberActingPrincipal = useCallback((id: string) => {
    setSessionPrincipalId(id);
    try {
      sessionStorage.setItem("aise.acting-principal", id);
    } catch {
      // storage unavailable — the in-memory state stands for this page
    }
  }, []);
  const forgetActingPrincipal = useCallback(() => {
    setSessionPrincipalId(null);
    try {
      sessionStorage.removeItem("aise.acting-principal");
    } catch {
      // storage unavailable — the in-memory state is already cleared
    }
  }, []);
  const [gate, dispatch] = useReducer(gateReducer, undefined, initialGateState);

  useEffect(() => {
    let cancelled = false;
    void probeApi(browserFetch).then((status) => {
      if (!cancelled) {
        setApiStatus(status);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [probeAttempt]);

  const reprobe = useCallback(() => {
    setApiStatus(null);
    setProbeAttempt((attempt) => attempt + 1);
  }, []);

  // PROD-004: probe the session ONLY when the API is available (an
  // unavailable API keeps the honest demo-dataset fallback — no gate).
  // The reducer ignores late answers after a retry (deterministic machine).
  const apiAvailable = apiStatus !== null && apiStatus.mode === "available";
  useEffect(() => {
    if (!apiAvailable || gate.status !== "probing") {
      return;
    }
    let cancelled = false;
    void probeAuth(browserFetch).then((probe) => {
      if (!cancelled) {
        dispatch({ type: "probe-settled", probe });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [apiAvailable, gate.status]);

  // The environment's transport: the browser fetch WRAPPED so any surface
  // 401 re-arms the gate (the auth-aware seam — api.ts's isUnauthorized is
  // the typed signal; here it is wired to the state machine). The request
  // runs ONCE; only the response is observed.
  const gatedFetch = useCallback(
    (input: string, init?: RequestInit): Promise<Response> => {
      return browserFetch(input, init).then((response) => {
        if (response.status === 401) {
          dispatch({ type: "unauthorized" });
        }
        return response;
      });
    },
    [],
  );

  // PROD-010: the ACTING PRINCIPAL follows the authenticated session —
  // the remembered session principal when one exists; the demo default
  // (user-alice, the Settings selection) stands only when there is no
  // session (demo mode / auth-inactive).
  const actingPrincipalId = sessionPrincipalId ?? principalId;

  const environment = useMemo<AppEnvironment>(
    () => ({ apiStatus, fetchImpl: apiAvailable ? gatedFetch : browserFetch, principalId: actingPrincipalId }),
    [apiStatus, apiAvailable, actingPrincipalId, gatedFetch],
  );

  const route = useHashRoute();

  // The gate's intents (async results land as typed events — the components
  // stay pure projections).
  const gateActions = useMemo<GateActions>(
    () => ({
      onSignIn: (id: string) => {
        dispatch({ type: "sign-in-submitted" });
        void signInPrincipal(browserFetch, id).then((result) => {
          if (result.ok) {
            rememberActingPrincipal(id);
          }
          dispatch(
            result.ok
              ? { type: "action-succeeded", principal: result.principal }
              : { type: "action-failed", failure: result.failure },
          );
        });
      },
      onEnterDemo: () => {
        dispatch({ type: "demo-submitted" });
        void enterDemoSession(browserFetch).then((result) => {
          // The documented demo principal (the server's AISE_DEMO_PRINCIPAL
          // default — a deployment overriding it gets the honest typed 403
          // on guarded reads, never a silently-wrong identity).
          if (result.ok) {
            rememberActingPrincipal("demo-evaluator");
          }
          dispatch(
            result.ok
              ? { type: "action-succeeded", principal: result.principal }
              : { type: "action-failed", failure: result.failure },
          );
        });
      },
      onRetry: () => {
        dispatch({ type: "retry-probe" });
      },
    }),
    [rememberActingPrincipal],
  );

  const signOut = useCallback(() => {
    dispatch({ type: "sign-out-submitted" });
    void signOutSession(browserFetch).then((result) => {
      if (result.ok) {
        forgetActingPrincipal();
      }
      dispatch(
        result.ok
          ? { type: "action-succeeded", principal: null }
          : { type: "action-failed", failure: result.failure },
      );
    });
  }, [forgetActingPrincipal]);

  // The gate renders INSTEAD of the shell only when the auth layer is
  // active and blocking (signed-out / probe-error). Every other state is
  // the additive pass-through.
  const gateBlocks = apiAvailable && !gateAdmitsSurfaces(gate);
  const userMenu =
    gate.status === "signed-in" && gate.principal !== null ? (
      <UserMenu
        principal={gate.principal}
        signingOut={gate.submitting === "sign-out"}
        onSignOut={signOut}
      />
    ) : null;

  return (
    <AppEnvironmentContext.Provider value={environment}>
      {gateBlocks ? (
        <AuthGate state={gate} actions={gateActions} />
      ) : (
        <AppShell route={route} apiStatus={apiStatus} userMenu={userMenu}>
          {apiStatus === null ? (
            <LoadingPanel label="Checking the API on this origin…" />
          ) : apiAvailable && gate.status === "probing" ? (
            <LoadingPanel label="Checking your session on this origin…" />
          ) : (
            <RoutedSurface
              route={route}
              principalId={actingPrincipalId}
              onPrincipalChange={setPrincipalId}
              onReprobe={reprobe}
            />
          )}
        </AppShell>
      )}
    </AppEnvironmentContext.Provider>
  );
}

/** Render the surface one route addresses (the typed switch). */
function RoutedSurface({
  route,
  principalId,
  onPrincipalChange,
  onReprobe,
}: {
  readonly route: Route;
  readonly principalId: string;
  readonly onPrincipalChange: (principalId: string) => void;
  readonly onReprobe: () => void;
}): ReactNode {
  switch (route.name) {
    case "dashboard":
      return <Dashboard />;
    case "projects":
      return <Projects />;
    case "project":
      return <ProjectOverview projectId={route.projectId} />;
    case "sitetwin":
      return <SiteTwin projectId={route.projectId} />;
    case "boq-lens":
      return <BoqLensSurface projectId={route.projectId} />;
    case "case":
      return <EngineeringCase projectId={route.projectId} />;
    case "intervention":
      return (
        <InterventionStudio
          key={routeKey(route)}
          projectId={route.projectId}
          layer={route.query.layer ?? 0}
          scenarioId={route.query.scenario}
        />
      );
    case "settings":
      return (
        <Settings
          principalId={principalId}
          onPrincipalChange={onPrincipalChange}
          onReprobe={onReprobe}
        />
      );
    case "not-found":
      return <NotFound hash={route.hash} />;
  }
}

/** The explicit not-found surface: the offending address + honest guidance. */
export function NotFound({ hash }: { readonly hash: string }): ReactNode {
  return (
    <section className="card" aria-labelledby="not-found-title">
      <div className="card-head">
        <h2 id="not-found-title" className="card-title">
          This address does not match any product surface
        </h2>
      </div>
      <div className="card-body">
        <p>
          The address <code className="mono">{hash}</code> is not one of the
          product&apos;s routes. Nothing was guessed and no fallback surface
          was rendered.
        </p>
        <p>The product surfaces are:</p>
        <ul className="notes-list">
          <li>
            <a href={formatRoute({ name: "dashboard" })}>Dashboard</a> — the landing overview
          </li>
          <li>
            <a href={formatRoute({ name: "projects" })}>Projects</a> — open a project
          </li>
          <li>
            <a href={formatRoute({ name: "sitetwin", projectId: "proj-riverside-refit" })}>
              SiteTwin / Evidence
            </a>{" "}
            — synchronized 2D/3D + evidence (per project)
          </li>
          <li>
            <a href={formatRoute({ name: "boq-lens", projectId: "proj-riverside-refit" })}>
              BOQ Lens
            </a>{" "}
            — verbatim BOQ scope + mapping (per project)
          </li>
          <li>
            <a href={formatRoute({ name: "case", projectId: "proj-riverside-refit" })}>
              Engineering Case
            </a>{" "}
            — observations / hypotheses / missing evidence (per project)
          </li>
          <li>
            <a
              href={formatRoute({
                name: "intervention",
                projectId: "project-zurich-hq",
                query: {},
              })}
            >
              Intervention Studio
            </a>{" "}
            — proposed states, 2D/3D/BOQ impact (per project)
          </li>
          <li>
            <a href={formatRoute({ name: "settings" })}>Settings / Integrations</a> — API
            connection + connectors
          </li>
        </ul>
      </div>
    </section>
  );
}
