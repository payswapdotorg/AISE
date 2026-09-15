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
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { probeApi, type ApiStatus } from "./api";
import { AppEnvironmentContext, type AppEnvironment } from "./environment";
import { AppShell, useHashRoute } from "./AppShell";
import { formatRoute, routeKey, type Route } from "./router";
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

  const environment = useMemo<AppEnvironment>(
    () => ({ apiStatus, fetchImpl: browserFetch, principalId }),
    [apiStatus, principalId],
  );

  const route = useHashRoute();

  return (
    <AppEnvironmentContext.Provider value={environment}>
      <AppShell route={route} apiStatus={apiStatus}>
        {apiStatus === null ? (
          <LoadingPanel label="Checking the API on this origin…" />
        ) : (
          <RoutedSurface route={route} principalId={principalId} onPrincipalChange={setPrincipalId} onReprobe={reprobe} />
        )}
      </AppShell>
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
