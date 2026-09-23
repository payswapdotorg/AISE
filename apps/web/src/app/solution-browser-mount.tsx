/**
 * PROD-031 — the BROWSER MOUNT of the solution surface (the selection
 * ladder's SECOND rung) — the composed body with EVERY engine/contract/BOQ
 * value supplied through the HTTP bindings.
 *
 * WHY THIS RUNG EXISTS: the FIRST rung (`solution-mount.tsx`) statically
 * imports the local engine binding, whose graph transitively reaches
 * `node:crypto` (the identity derivations) — a plain-browser bundle
 * externalizes it and the rung's journey promise rejects (the documented
 * PROD-026 law). This module is the CRYPTO-FREE twin: its chunk graph
 * imports ONLY browser-safe modules (the `@aise/solution-contract/browser`
 * subpath, the engine's pure units module, the binding-explicit workspace
 * body), and the ENGINE executes SERVER-SIDE through the live same-origin
 * routes (the PROD-001 contract: no configurable origin; the demo
 * session's cookie rides the injected fetch):
 *
 *  - the SERVICE binding — `createHttpSolutionService` over
 *    `POST /v1/solutions/step|validate|inspect|quantities|revise|baseline`
 *    (the runtime-mounted route factory): every mutation, validation,
 *    inspection, revision AND the baseline materialization (layer 0 —
 *    crypto-dependent, so the browser asks the backend engine for it
 *    through `openWorkspaceThroughService`);
 *  - the AGENT binding — `createHttpSolutionAgentPort` over
 *    `POST /v1/solution-agent/compile|turn` (the live assistant);
 *  - the JOURNEY RECORD — the COMMITTED seeded record (data, never
 *    recomputed client-side: the record's identity seals are engine
 *    derivations; §4.6's "one record" choice — the parity test pins the
 *    committed JSON to the live Node run of the SAME runner);
 *  - the BOQ seam — the record's own trace set (the recorded reference
 *    journey's version-1 BOQ — the same pinned history the first rung
 *    renders; the resolvers are the contract's crypto-free functions).
 *
 * HONESTY: if the backend is unreachable (no session / network error), the
 * workspace surfaces the honest NOT-CONNECTED panel — never fabricated
 * engine output. The observed scene stays inspectable; the recorded panels
 * render from the committed record (they are data, not engine calls).
 *
 * MOUNT CONTRACT: the surface loads this module through ONE cached dynamic
 * import (`surfaces/Solution.tsx`); the local-engine mount stays the FIRST
 * choice wherever the module graph evaluates (the deterministic gate, the
 * server-side renders) — the browser rung is the SECOND, and the honest
 * engine-unavailable panel the LAST.
 */

import { useMemo, use } from "react";
import type { ReactNode } from "react";
import { useAppEnvironment } from "./environment";
import type { SolutionQuery } from "./router";
import type { ComposedJourneyRecord } from "./solution-journey";
import { ComposedSolutionSurface } from "./solution-composition";
// The crypto-free cut of the solution module (DIRECT module imports — the
// module barrel re-exports the Node-side facades whose graphs reach
// node:crypto; the browser chunk must carry none of it — the PROD-031
// web-bundle gate asserts it).
import { SolutionWorkspaceBody } from "../solution/SolutionWorkspaceBody";
import type { SolutionCaseContext } from "../solution/SolutionWorkspaceBody";
import {
  defaultWorkspaceClock,
  openWorkspaceThroughService,
  type WorkspaceDeps,
} from "../solution/operations-core";
import { createHttpSolutionService } from "../solution/service-http";
import { createHttpSolutionAgentPort } from "../solution/agent/port";
import { DEMO_SOLUTION_WORLD, demoObservedScene } from "../solution/demo-world";
// The committed journey record (data — the §4.6 "one record" choice).
import committedRecordJson from "./solution-journey-record.json" with { type: "json" };

const committedRecord = committedRecordJson as unknown as ComposedJourneyRecord;

/** The browser rung's case context (the crypto-free demo world). */
export function browserCaseContext(): SolutionCaseContext {
  return {
    projectId: DEMO_SOLUTION_WORLD.projectId,
    caseId: DEMO_SOLUTION_WORLD.caseId,
    solutionId: DEMO_SOLUTION_WORLD.solutionId,
    title: DEMO_SOLUTION_WORLD.title,
    problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
    baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
    observedScene: demoObservedScene(),
    // No baselineGeometry resolver browser-side: coated operations resolve
    // baseline geometry SERVER-SIDE through the HTTP service binding (the
    // backend's mounted resolver over the engine's committed world).
  };
}

/**
 * The browser rung's composed body: the SAME surface the first rung
 * renders (the rung-neutral `ComposedSolutionSurface`), with the workspace
 * mounted over the HTTP service binding and the record from the committed
 * fixture.
 */
export function ComposedSolutionBrowserBody({
  projectId,
  query,
}: {
  readonly projectId: string;
  readonly query: SolutionQuery;
}): ReactNode {
  const context = browserCaseContext();
  return (
    <div data-browser-mount="solution-browser-mount">
      <ComposedSolutionSurface
        projectId={projectId}
        query={query}
        record={committedRecord}
        workspaceCardTitle="The interactive workspace (the browser engine binding)"
        workspaceCardMeta={
          <span>
            direct manipulation · timeline stepping · inspection · undo · validation —
            every mutation through the ONE engine submission path, the engine executing
            server-side over the live same-origin routes
          </span>
        }
        workspaceCardNote={
          <p className="pane-foot">
            The workspace below opens a FRESH authoring session of the same solution
            (version 1, empty draft) — the browser mount: the deterministic engine
            executes on the backend through the live <code>/v1/solutions/*</code>{" "}
            routes, the same routes the deployed product serves. The recorded reference
            journey&apos;s generated BOQ (version 1) is supplied through the guarded BOQ
            seam as pinned history; the assistant is LIVE (the HTTP solution-agent
            port) — natural-language commands and direct manipulation flow through the
            SAME engine submission path.
          </p>
        }
        workspace={<SolutionWorkspaceOverHttp context={context} />}
      />
    </div>
  );
}

/**
 * The workspace over the HTTP service binding (the browser rung's mount):
 * opens the session through the service port (the baseline leg — the
 * backend engine materializes layer 0) and renders the binding-explicit
 * body. A rejection (backend unreachable / no session) renders the honest
 * NOT-CONNECTED panel — never fabricated engine output.
 */
function SolutionWorkspaceOverHttp({
  context,
}: {
  readonly context: SolutionCaseContext;
}): ReactNode {
  const environment = useAppEnvironment();
  const service = useMemo(
    () => createHttpSolutionService({ fetchImpl: environment.fetchImpl }),
    [environment.fetchImpl],
  );
  const deps: WorkspaceDeps = useMemo(
    () => ({
      service,
      clock: defaultWorkspaceClock(),
      authoredBy: DEMO_SOLUTION_WORLD.userId,
    }),
    [service],
  );
  const agentPort = useMemo(
    () =>
      createHttpSolutionAgentPort({
        fetchImpl: environment.fetchImpl,
        agentId: "aise-solution-agent",
      }),
    [environment.fetchImpl],
  );
  const agent = useMemo(
    () => ({
      port: agentPort,
      sessionId: `solution:${context.projectId}:${context.solutionId}`,
      agentId: agentPort.descriptor.agentId,
      userId: DEMO_SOLUTION_WORLD.userId,
    }),
    [agentPort, context.projectId, context.solutionId],
  );
  // The opening leg: the baseline overlay materialized by the BACKEND
  // engine (layer 0 — the state's identity derivations need node:crypto,
  // which the browser graph does not carry). The promise memoizes per
  // service instance; a rejection is CAUGHT here (the honest not-connected
  // state — the panel below), never a crash.
  const opening = useMemo(
    () =>
      openWorkspaceThroughService(
        {
          projectId: context.projectId,
          caseId: context.caseId,
          solutionId: context.solutionId,
          title: context.title,
          problemStatement: context.problemStatement,
          baselineRealityVersionId: context.baselineRealityVersionId,
          createdAt: DEMO_SOLUTION_WORLD.createdAt,
          materializedAt: DEMO_SOLUTION_WORLD.baselineMaterializedAt,
        },
        { service },
      ).then(
        (openedState) => ({ ok: true as const, openedState }),
        (error: unknown) => ({
          ok: false as const,
          reason: error instanceof Error ? error.message : String(error),
        }),
      ),
    [context, service],
  );
  const outcome = use(opening);
  if (!outcome.ok) {
    return (
      <section
        aria-label="The interactive workspace is not connected"
        className="solution-workspace"
        data-backend-connected="false"
        id="solution-backend-unreachable"
      >
        <h2>{context.title}</h2>
        <p>{context.problemStatement}</p>
        <div className="state state-empty">
          <p className="state-title">The solution engine backend is not reachable</p>
          <p className="state-guidance">
            The browser workspace executes the deterministic engine through this
            origin&apos;s live <code>/v1/solutions/*</code> routes — they did not answer
            (no session, or the backend is down). Nothing is fabricated: enter the demo
            session or retry once the backend is reachable. The recorded reference
            journey above is committed data and stays inspectable.
          </p>
          <p className="pane-foot">
            Transport detail (verbatim): <code>{outcome.reason}</code>
          </p>
        </div>
      </section>
    );
  }
  return (
    <SolutionWorkspaceBody
      agent={agent}
      boq={{ kind: "trace-set", traceSet: committedRecord.boqTraceSet }}
      context={context}
      deps={deps}
      openedState={outcome.openedState}
    />
  );
}

export default ComposedSolutionBrowserBody;
