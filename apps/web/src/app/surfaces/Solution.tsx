/**
 * PROD-026/PROD-031 — the INTERACTIVE SOLUTION surface: the integration
 * station of the interactive engineering solution workflow (the
 * composition layer's mount of the PROD-024 workspace).
 *
 * THE MOUNT CONTRACT (§4.1 of the PROD-024 work order, wired here): the
 * single `SolutionWorkspace` React component mounted at the project-scoped
 * route `#/projects/:id/solution` with the case/solution context (the
 * module's committed demo wall world — read-only through its public
 * fixtures), the engine service binding, the deterministic clock and the
 * guarded BOQ seam input (the recorded reference journey's generated trace
 * set). No workspace internal is duplicated or re-implemented here — this
 * surface composes, mounts and routes.
 *
 * THE SELECTION LADDER (PROD-031 — one more rung on the PROD-026
 * lazy-mount law): the mounted body is chosen by TWO cached dynamic
 * imports, each inside the SAME Suspense boundary, each logging its
 * outcome to the console's non-blocking channel (never a crash, never a
 * silent catch):
 *
 *  1. the LOCAL ENGINE MOUNT (`solution-mount.tsx`) — where the module
 *     graph evaluates (the server-side renders, the deterministic test
 *     gate, a future polyfilled build): the FULL composed surface with the
 *     workspace over the in-process engine and the journey record computed
 *     LIVE. In a plain browser the chunk's externalized node:crypto stub
 *     throws at the journey's createHash call — the cached promise
 *     resolves to null and the ladder falls through;
 *  2. the BROWSER MOUNT (`solution-browser-mount.tsx`, PROD-031) — the
 *     crypto-free twin: the workspace over the HTTP service binding (the
 *     engine executes server-side through the live same-origin routes,
 *     the baseline overlay included) and the committed journey record;
 *  3. the honest engine-unavailable composition — the problem, the
 *     observed facts, the recorded links; never a crash, never fabricated
 *     engine output.
 *
 * The agent seam: both mounted rungs bind the LIVE HTTP solution-agent
 * port (PROD-031 — the workspace's agent prop); the degraded composition
 * has no agent (the honest panel).
 */

import { Suspense, use } from "react";
import type { ReactNode } from "react";
import { ProjectSurfaceNav } from "../components";
import { TaskFlowStrip } from "../task-first";
import type { SolutionQuery } from "../router";
import {
  DEMO_SOLUTION_WORLD_PINS,
  demoSolutionObservedFacts,
  demoSolutionWorldHeld,
} from "../demo";
import type { ComposedJourneyResult } from "../solution-journey";
import {
  SolutionComposingPanel,
  SolutionEngineUnavailablePanel,
  SolutionWorldEmptyState,
} from "../solution-composition";

/* ------------------------------------------------------------------ */
/* The engine resource (ONE cached dynamic import per process)         */
/* ------------------------------------------------------------------ */

/** The resolved lazy mount: the module + its recorded journey result. */
interface SolutionEngineMount {
  readonly ComposedSolutionBody: (props: {
    readonly projectId: string;
    readonly query: SolutionQuery;
    readonly composed: ComposedJourneyResult;
  }) => ReactNode;
  readonly journey: ComposedJourneyResult;
}

let engineResource: Promise<SolutionEngineMount | null> | undefined;

/**
 * The engine capability resource — the selection ladder's FIRST rung: the
 * LOCAL engine mount. Where the module cannot evaluate (the plain browser
 * — the externalized node:crypto stub throws at the journey's createHash
 * call), the dynamic import REJECTS and the resource resolves to `null`
 * (the ladder falls to the second rung). The rejection is logged to the
 * console's non-blocking channel — never surfaced as an app crash.
 */
function solutionEngineResource(): Promise<SolutionEngineMount | null> {
  if (engineResource === undefined) {
    engineResource = import("../solution-mount")
      .then((module) =>
        module.seededJourneyResource().then((journey) => ({
          ComposedSolutionBody: module.ComposedSolutionBody,
          journey,
        })),
      )
      .catch((error: unknown) => {
        // The rung's outcome, logged non-blockingly (the honest ladder
        // trace — PROD-031's evidence channel; never a crash).
        // eslint-disable-next-line no-console -- the ladder's non-blocking outcome channel (the documented PROD-026 precedent: surface-module diagnostics, never the structured logger's domain)
        console.info(
          "[solution-surface] rung 1 (the local engine mount) is unavailable — " +
            "falling to the browser mount",
          error instanceof Error ? error.message : error,
        );
        return null;
      });
  }
  return engineResource;
}

/* ------------------------------------------------------------------ */
/* The browser-mount resource (the ladder's SECOND rung, PROD-031)     */
/* ------------------------------------------------------------------ */

/** The resolved lazy browser mount (the crypto-free HTTP-binding rung). */
interface SolutionBrowserMount {
  readonly ComposedSolutionBrowserBody: (props: {
    readonly projectId: string;
    readonly query: SolutionQuery;
  }) => ReactNode;
}

let browserMountResource: Promise<SolutionBrowserMount | null> | undefined;

/**
 * The browser-mount resource — the selection ladder's SECOND rung
 * (PROD-031): the crypto-free twin of the local mount (the workspace over
 * the HTTP service binding + the committed journey record). Its chunk
 * graph is crypto-free by construction, so in a healthy build this import
 * resolves wherever the app itself runs; only a broken build (or a
 * chunk-load failure) rejects — the resource then resolves to null and
 * the honest engine-unavailable composition renders (the LAST rung).
 */
function solutionBrowserMountResource(): Promise<SolutionBrowserMount | null> {
  if (browserMountResource === undefined) {
    browserMountResource = import("../solution-browser-mount")
      .then((module) => ({ ComposedSolutionBrowserBody: module.ComposedSolutionBrowserBody }))
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console -- the ladder's non-blocking outcome channel (see rung 1 above)
        console.info(
          "[solution-surface] rung 2 (the browser mount) is unavailable — " +
            "rendering the honest engine-unavailable composition",
          error instanceof Error ? error.message : error,
        );
        return null;
      });
  }
  return browserMountResource;
}

/* ------------------------------------------------------------------ */
/* The surface                                                          */
/* ------------------------------------------------------------------ */

/** The Interactive Solution surface (the composition integration station). */
export function SolutionSurface({
  projectId,
  query,
}: {
  readonly projectId: string;
  readonly query: SolutionQuery;
}): ReactNode {
  return (
    <>
      <TaskFlowStrip projectId={projectId} />
      <ProjectSurfaceNav projectId={projectId} current="solution" />
      {demoSolutionWorldHeld(projectId) ? (
        <Suspense fallback={<SolutionComposingPanel />}>
          <EngineAwareSolutionBody projectId={projectId} query={query} />
        </Suspense>
      ) : (
        <SolutionWorldEmptyState projectId={projectId} />
      )}
    </>
  );
}

/**
 * The engine-aware body: unwraps the ladder's cached resources and renders
 * the first rung that answers — the local engine mount, the browser mount,
 * or the honest degraded composition (in that order, one outcome each).
 */
function EngineAwareSolutionBody({
  projectId,
  query,
}: {
  readonly projectId: string;
  readonly query: SolutionQuery;
}): ReactNode {
  const mount = use(solutionEngineResource());
  if (mount === null) {
    const browser = use(solutionBrowserMountResource());
    if (browser === null) {
      return (
        <SolutionEngineUnavailablePanel
          reason={
            "The deterministic solution engine cannot execute in this browser build — " +
            "its identity derivations require node:crypto, which the browser bundle " +
            "externalizes, and the browser engine mount (the live same-origin " +
            "/v1/solutions/* routes) did not load. The interactive workspace and the " +
            "recorded journey record are composed where the engine runs."
          }
          world={{
            projectId,
            caseId: DEMO_SOLUTION_WORLD_PINS.caseId,
            solutionId: DEMO_SOLUTION_WORLD_PINS.solutionId,
            title: DEMO_SOLUTION_WORLD_PINS.title,
            problemStatement: DEMO_SOLUTION_WORLD_PINS.problemStatement,
            baselineRealityVersionId: DEMO_SOLUTION_WORLD_PINS.baselineRealityVersionId,
          }}
          observedFacts={demoSolutionObservedFacts()}
        />
      );
    }
    return <browser.ComposedSolutionBrowserBody projectId={projectId} query={query} />;
  }
  const ComposedSolutionBody = mount.ComposedSolutionBody;
  return (
    <ComposedSolutionBody projectId={projectId} query={query} composed={mount.journey} />
  );
}
