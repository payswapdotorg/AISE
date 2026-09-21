/**
 * PROD-002 — the application chrome: header (brand + API-mode chip), the
 * primary navigation (collapsible drawer on mobile, persistent rail on
 * desktop), the main landmark and the footer.
 *
 * A11Y: semantic landmarks (header / nav / main / footer), a skip link,
 * `aria-current="page"` on the active nav link, an `aria-expanded` +
 * `aria-controls` drawer toggle with ≥44px touch targets, and visible
 * focus everywhere (see styles/app.css).
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { formatRoute, parseHash, type Route, type SurfaceName } from "./router";
import type { ApiStatus } from "./api";

/** Subscribe to the browser hash (the router's pure codec does the work). */
export function useHashRoute(): Route {
  const [hash, setHash] = useState(() =>
    typeof window === "undefined" ? "#/" : window.location.hash || "#/",
  );
  useEffect(() => {
    const onChange = (): void => {
      setHash(window.location.hash || "#/");
    };
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
    };
  }, []);
  return parseHash(hash);
}

/** One primary navigation entry. */
interface NavEntry {
  readonly surface: SurfaceName | "projects";
  readonly label: string;
  readonly target: Route;
  /** Deep links to the per-project surfaces (the pilot + scenario projects). */
  readonly subs: readonly { readonly label: string; readonly target: Route }[];
}

const PRIMARY_NAV: readonly NavEntry[] = [
  { surface: "dashboard", label: "Dashboard", target: { name: "dashboard" }, subs: [] },
  {
    surface: "projects",
    label: "Projects",
    target: { name: "projects" },
    subs: [
      {
        label: "Pilot — SiteTwin / Evidence",
        target: { name: "sitetwin", projectId: "proj-riverside-refit" },
      },
      {
        label: "Pilot — BOQ Lens",
        target: { name: "boq-lens", projectId: "proj-riverside-refit" },
      },
      {
        label: "Pilot — Engineering Case",
        target: { name: "case", projectId: "proj-riverside-refit" },
      },
      {
        label: "Scenario — Intervention Studio",
        target: { name: "intervention", projectId: "project-zurich-hq", query: {} },
      },
      {
        label: "Demo — Interactive Solution",
        target: { name: "solution", projectId: "proj-demo-001", query: {} },
      },
      {
        label: "Corpus — Outcomes (demo journey)",
        target: { name: "outcomes", projectId: "proj-7f3a2b" },
      },
    ],
  },
  { surface: "settings", label: "Settings / Integrations", target: { name: "settings" }, subs: [] },
];

/** The API chip: probing / live / demo (the app-level honesty badge). */
function ApiChip({ status }: { readonly status: ApiStatus | null }): ReactNode {
  if (status === null) {
    return (
      <span className="api-chip api-chip-probe" role="status">
        checking API…
      </span>
    );
  }
  if (status.mode === "available") {
    return (
      <span className="api-chip api-chip-live" title={status.detail}>
        live API
      </span>
    );
  }
  return (
    <span className="api-chip api-chip-demo" title={status.detail}>
      demo data — API unavailable
    </span>
  );
}

/** The full application chrome around the routed surface. */
export function AppShell({
  route,
  apiStatus,
  userMenu,
  children,
}: {
  readonly route: Route;
  readonly apiStatus: ApiStatus | null;
  /** PROD-004 (additive): the signed-in user menu; absent = pre-auth chrome. */
  readonly userMenu?: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeSurface = routeSurfaceGroup(route);

  // Close the drawer whenever the route changes (a navigation is a
  // completed drawer intent on mobile).
  useEffect(() => {
    setDrawerOpen(false);
  }, [formatRoute(route)]);

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <a className="brand" href="#/">
            <span className="brand-name">AISE</span>
            <span className="brand-tag">AI Site Engineer — product shell</span>
          </a>
          <span className="header-spacer" />
          {userMenu === undefined ? null : userMenu}
          <ApiChip status={apiStatus} />
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={drawerOpen}
            aria-controls="primary-nav"
            aria-label={drawerOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => {
              setDrawerOpen((open) => !open);
            }}
          >
            {drawerOpen ? "✕" : "☰"}
          </button>
        </div>
      </header>
      <div className="app-body">
        <nav
          className="app-nav"
          id="primary-nav"
          aria-label="Primary"
          data-open={drawerOpen ? "true" : "false"}
        >
          <div className="app-nav-inner">
            <ul className="nav-list">
              {PRIMARY_NAV.map((entry) => (
                <li key={entry.surface}>
                  <a
                    className="nav-link"
                    href={formatRoute(entry.target)}
                    aria-current={activeSurface === entry.surface ? "page" : undefined}
                  >
                    {entry.label}
                  </a>
                  {entry.subs.length === 0 ? null : (
                    <ul className="nav-sublist">
                      {entry.subs.map((sub) => (
                        <li key={sub.label}>
                          <a className="nav-link nav-sub" href={formatRoute(sub.target)}>
                            {sub.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <main className="app-main" id="main-content">
          {children}
        </main>
      </div>
      <footer className="app-footer">
        <div className="app-footer-inner">
          <span>
            AISE keeps observed evidence, derived interpretation and proposed
            interventions visually distinct. Proposed content is never presented
            as observed reality.
          </span>
          <span>Engineering facts remain owned by the server-side AISE records.</span>
        </div>
      </footer>
    </div>
  );
}

/** Which primary nav group a route belongs to. */
function routeSurfaceGroup(route: Route): SurfaceName | "projects" {
  switch (route.name) {
    case "dashboard":
      return "dashboard";
    case "projects":
    case "project":
    case "sitetwin":
    case "boq-lens":
    case "case":
    case "intervention":
    case "solution":
    case "outcomes":
      return "projects";
    case "settings":
      return "settings";
    case "not-found":
      return "projects";
  }
}
