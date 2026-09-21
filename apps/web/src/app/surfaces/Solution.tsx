/**
 * PROD-026 — the INTERACTIVE SOLUTION surface: the integration station of
 * the interactive engineering solution workflow (the composition layer's
 * mount of the PROD-024 workspace).
 *
 * THE MOUNT CONTRACT (§4.1 of the PROD-024 work order, wired here): the
 * single `SolutionWorkspace` React component mounted at the project-scoped
 * route `#/projects/:id/solution` with the case/solution context (the
 * module's committed demo wall world — read-only through its public
 * fixtures), the local engine service binding (the default — the REAL
 * `@aise/solution-engine` executing in-process), the deterministic clock
 * and the guarded BOQ seam input (the recorded reference journey's
 * generated trace set). No workspace internal is duplicated or
 * re-implemented here — this surface composes, mounts and routes.
 *
 * THE LAZY MOUNT (the browser-safety law): the mounted body
 * (`solution-mount.tsx`) transitively requires `node:crypto` (the
 * engine's identity derivations), which a plain browser bundle
 * externalizes — a STATIC import would crash the whole app's module graph
 * at evaluation. The surface therefore loads it through ONE cached
 * DYNAMIC import (`solutionEngineResource`) inside a Suspense boundary:
 *
 *  - where the engine executes (the server-side renders, the deterministic
 *    test gate, a future polyfilled build): the FULL composed surface —
 *    the engineering-problem header, the recorded §3 journey, the
 *    generated BOQ line trace panel (the clicked-line selection + the
 *    step/geometry jump deep links) and the mounted workspace;
 *  - where it cannot (the plain browser): the honest degraded
 *    composition — the problem, the observed facts, the recorded links —
 *    never a crash, never fabricated engine output.
 *
 * The agent seam mounts ABSENT (the honest "not connected" panel): the
 * PROD-023 compiler routes are backend-zone surfaces the Lead mounts in
 * the server; direct manipulation, timeline stepping, inspection, undo
 * and validation remain fully available in the workspace.
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
 * The engine capability resource: loads the mounted body module (which
 * transitively requires the engine's `node:crypto` identity derivations)
 * and its recorded journey. Where the module cannot evaluate (the plain
 * browser — Vite's browser-external stub throws at module evaluation),
 * the dynamic import REJECTS and the resource resolves to `null`: the
 * honest engine-unavailable composition. The rejection is caught here —
 * never surfaced as an app crash.
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
      .catch(() => null);
  }
  return engineResource;
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
 * The engine-aware body: unwraps the lazy mount resource and renders
 * either the full composed surface or the honest degraded composition.
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
    return (
      <SolutionEngineUnavailablePanel
        reason={
          "The deterministic solution engine cannot execute in this browser build — " +
          "its identity derivations require node:crypto, which the browser bundle " +
          "externalizes. The interactive workspace and the recorded journey record " +
          "are composed where the engine runs (the server-side engine binding is " +
          "the Lead's production wiring over the mounted /v1/solutions/* routes)."
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
  const ComposedSolutionBody = mount.ComposedSolutionBody;
  return (
    <ComposedSolutionBody projectId={projectId} query={query} composed={mount.journey} />
  );
}
