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
import { formatRoute, parseHash, type Route } from "./router";
import type { ApiStatus } from "./api";
import {
  DEMO_PROJECT_ID,
  DEMO_SCENARIO_PROJECT_ID,
  DEMO_SOLUTION_PROJECT_ID,
} from "./demo";
import { DEMO_TASK_PROJECT_ID } from "./task-dataset";

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

/**
 * POST-004 — the TASK-FIRST primary navigation.
 *
 * The front door speaks the JOURNEY, not the module topology: the five
 * task verbs (Capture → Investigate → Understand costs → Build solution →
 * Review outcome) label the primary entries, in journey order, before any
 * registry/surface grouping. The specialist dataset names (Corpus, Pilot,
 * Scenario, Demo) are demoted out of the default vocabulary — the sample
 * deep links under "Projects" carry plain, project-scoped labels instead.
 *
 * "Build solution" exposes the INTERACTIVE SOLUTION WORKSPACE DIRECTLY
 * (its target IS the solution surface — no Intervention-Studio-first hop)
 * and presents both build paths as its subs with the plain-language
 * distinction in the labels themselves:
 *   - "Build an intervention" — plan changes as recorded, layer-by-layer
 *     steps over a pinned baseline;
 *   - "Build interactively" — design and validate in the live workspace
 *     (draw it or describe it; both resolve to the same typed operations).
 *
 * Surface names (SiteTwin, BOQ Lens, Engineering Case, Intervention
 * Studio, Interactive Solution) remain the domain language ON their own
 * surfaces — the nav labels the journey (the PROD-018 canonical-action
 * convention; see parity/action-labels.ts).
 */

/** One primary navigation entry. */
interface NavEntry {
  readonly surface: NavGroupId;
  readonly label: string;
  /** Plain-language one-liner (the title tooltip; task language, no jargon). */
  readonly hint?: string;
  readonly target: Route;
  /** Secondary entries (the two build paths; the sample project deep links). */
  readonly subs: readonly { readonly label: string; readonly target: Route }[];
}

/** The nav groups (task verbs first, then the registry, then settings). */
type NavGroupId =
  | "dashboard"
  | "capture"
  | "investigate"
  | "understand-costs"
  | "build-solution"
  | "review-outcome"
  | "projects"
  | "settings";

const PRIMARY_NAV: readonly NavEntry[] = [
  {
    surface: "dashboard",
    label: "Dashboard",
    hint: "Home — start from the task",
    target: { name: "dashboard" },
    subs: [],
  },
  {
    surface: "capture",
    label: "Capture",
    hint: "Bring field evidence in — photos, scans, documents, measurements",
    target: { name: "capture", projectId: DEMO_TASK_PROJECT_ID },
    subs: [],
  },
  {
    surface: "investigate",
    label: "Investigate",
    hint: "Understand what the evidence states — cases, quantities, gaps",
    target: { name: "case", projectId: DEMO_TASK_PROJECT_ID },
    subs: [],
  },
  {
    surface: "understand-costs",
    label: "Understand costs",
    hint: "See the recorded cost scope and what is still unmapped",
    target: { name: "boq-lens", projectId: DEMO_TASK_PROJECT_ID },
    subs: [],
  },
  {
    surface: "build-solution",
    label: "Build solution",
    hint: "Design the proposed intervention — interactively, or as recorded steps",
    target: { name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} },
    subs: [
      {
        label: "Build interactively — design and validate in the live workspace",
        target: { name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} },
      },
      {
        label: "Build an intervention — plan changes as recorded, layer-by-layer steps",
        target: { name: "intervention", projectId: DEMO_SCENARIO_PROJECT_ID, query: {} },
      },
    ],
  },
  {
    surface: "review-outcome",
    label: "Review outcome",
    hint: "See what executed work changed — before/after and plan vs reality",
    target: { name: "outcomes", projectId: DEMO_TASK_PROJECT_ID },
    subs: [],
  },
  {
    surface: "projects",
    label: "Projects",
    hint: "Open or create a project — the sample walkthroughs live here",
    target: { name: "projects" },
    subs: [
      {
        label: "Riverside office refit — project overview",
        target: { name: "project", projectId: DEMO_PROJECT_ID },
      },
      {
        label: "Riverside office refit — site & evidence",
        target: { name: "sitetwin", projectId: DEMO_PROJECT_ID },
      },
      {
        label: "Riverside office refit — cost scope",
        target: { name: "boq-lens", projectId: DEMO_PROJECT_ID },
      },
      {
        label: "Riverside office refit — engineering case",
        target: { name: "case", projectId: DEMO_PROJECT_ID },
      },
    ],
  },
  {
    surface: "settings",
    label: "Settings / Integrations",
    hint: "Providers and incumbent connections",
    target: { name: "settings" },
    subs: [],
  },
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
                    title={entry.hint}
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

/**
 * Which primary nav group a route belongs to (POST-004: the task groups —
 * the task verb whose journey step the surface serves, so `aria-current`
 * lands on the task entry, not just the registry group).
 */
function routeSurfaceGroup(route: Route): NavGroupId {
  switch (route.name) {
    case "dashboard":
      return "dashboard";
    case "capture":
    case "sitetwin":
      // the evidence path: capturing, then browsing what was captured
      return "capture";
    case "boq-lens":
      return "understand-costs";
    case "case":
      return "investigate";
    case "intervention":
    case "solution":
      return "build-solution";
    case "outcomes":
      return "review-outcome";
    case "projects":
    case "project":
      return "projects";
    case "settings":
      return "settings";
    case "not-found":
      return "projects";
  }
}
