/**
 * PROD-026/PROD-031 — the LAZY MOUNTED BODY of the solution surface (the
 * selection ladder's FIRST rung: the LOCAL engine mount).
 *
 * ⚠ This module transitively imports `node:crypto` (through the PROD-024
 * workspace module and the engine/contract/BOQ packages — the identity
 * derivations), which a plain browser bundle externalizes: importing it
 * statically would crash the whole app's module graph at evaluation. The
 * surface therefore loads it through ONE cached DYNAMIC import
 * (`solutionEngineResource`, see `surfaces/Solution.tsx`) — the selection
 * ladder's FIRST choice: where the engine executes (the server-side
 * renders, the deterministic test gate, a future polyfilled build), the
 * FULL composed surface renders with the workspace over the LOCAL engine
 * binding and the journey record computed LIVE by the engine. Where it
 * cannot (the plain browser), the SECOND cached dynamic import loads the
 * BROWSER mount (`solution-browser-mount.tsx` — the HTTP-binding rung);
 * only when BOTH rungs fail does the honest engine-unavailable
 * composition render.
 *
 * The default export is the composed body (React.lazy-compatible).
 */

import { useMemo } from "react";
import type { ReactNode } from "react";
import type { SolutionQuery } from "./router";
import { useAppEnvironment } from "./environment";
import { createHttpSolutionAgentPort } from "../solution";
import type { ComposedJourneyResult } from "./solution-journey";
import { ComposedSolutionSurface } from "./solution-composition";
import { SolutionWorkspace } from "../solution";

/* The recorded journey resource (re-exported for the lazy surface mount). */
export { seededJourneyResource } from "./solution-journey";

/** The composed body: the recorded journey record + the workspace mount. */
export function ComposedSolutionBody({
  projectId,
  query,
  composed,
}: {
  readonly projectId: string;
  readonly query: SolutionQuery;
  readonly composed: ComposedJourneyResult;
}): ReactNode {
  const record = composed.record;
  const environment = useAppEnvironment();
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
      sessionId: `solution:${projectId}:${record.world.solutionId}`,
      agentId: agentPort.descriptor.agentId,
      userId: "user-demo-engineer",
    }),
    [agentPort, projectId, record.world.solutionId],
  );
  return (
    <ComposedSolutionSurface
      projectId={projectId}
      query={query}
      record={record}
      workspaceCardTitle="The interactive workspace (the mounted PROD-024 entry)"
      workspaceCardMeta={
        <span>
          direct manipulation · timeline stepping · inspection · undo · validation —
          every mutation through the ONE engine submission path
        </span>
      }
      workspaceCardNote={
        <p className="pane-foot">
          The workspace below opens a FRESH authoring session of the same solution
          (version 1, empty draft). The recorded reference journey&apos;s generated BOQ
          (version 1) is supplied through the guarded BOQ seam — the pane renders its
          lines as pinned history of the same solution&apos;s version 1, keyed by the
          contract&apos;s trace identities. The assistant is LIVE in this session
          (PROD-031: the HTTP solution-agent port, same-origin — natural-language
          commands and direct manipulation flow through the SAME engine submission
          path).
        </p>
      }
      workspace={
        <SolutionWorkspace
          context={composed.caseContext}
          boq={composed.boqSyncInput}
          agent={agent}
          userId={agent.userId}
        />
      }
    />
  );
}

export default ComposedSolutionBody;
