/**
 * PROD-026 — the LAZY MOUNTED BODY of the solution surface.
 *
 * ⚠ This module transitively imports `node:crypto` (through the PROD-024
 * workspace module and the engine/contract/BOQ packages — the identity
 * derivations), which a plain browser bundle externalizes: importing it
 * statically would crash the whole app's module graph at evaluation. The
 * surface therefore loads it through ONE cached DYNAMIC import
 * (`solutionEngineResource`, see `surfaces/Solution.tsx`) and renders the
 * honest engine-unavailable composition when the chunk cannot evaluate in
 * the runtime (the plain browser). In the server-side renders and the
 * deterministic gate the module always evaluates and the FULL composed
 * surface — the mounted PROD-024 workspace entry + the recorded journey —
 * renders.
 *
 * The default export is the composed body (React.lazy-compatible).
 */

import type { ReactNode } from "react";
import { Card } from "./components";
import { formatRoute } from "./router";
import type { SolutionQuery } from "./router";
import { DEMO_SOLUTION_PROJECT_ID } from "./demo";
import type { ComposedJourneyResult } from "./solution-journey";
import {
  SolutionBoqTracePanel,
  SolutionInboundLinksCard,
  SolutionJourneyStepsPanel,
} from "./solution-composition";
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
  const addressedCaseMatches =
    query.case === undefined || query.case === record.world.caseId;
  return (
    <>
      <Card
        title={record.world.title}
        meta={
          <span>
            case {record.world.caseId} · solution {record.world.solutionId} · the
            engineering problem
          </span>
        }
        id="solution-case-header"
      >
        <p>{record.world.problemStatement}</p>
        <p className="pane-foot">
          Branches from the observed building (reality version{" "}
          <code>{record.world.baselineRealityVersionId}</code>) — proposed work never
          changes the observed record. Every proposed layer comes from the deterministic
          solution engine; the generated solution BOQ is a derived projection tied to a
          declared validation snapshot.
        </p>
        {addressedCaseMatches ? null : (
          <div className="state state-empty" data-case-pin="mismatch">
            <p className="state-title">The deep-linked case does not pin this solution</p>
            <p className="state-guidance">
              The <code className="mono">?case={query.case}</code> deep link names a case
              this recorded solution world does not pin (its recorded case is{" "}
              <code className="mono">{record.world.caseId}</code>) — the reference stays
              visible, never re-keyed.
            </p>
          </div>
        )}
      </Card>

      <SolutionInboundLinksCard projectId={projectId} record={record} />

      <SolutionJourneyStepsPanel record={record} />

      <SolutionBoqTracePanel
        projectId={projectId}
        boq={record.boq}
        selectedLineId={query.boqLine}
        addressedStep={query.step}
      />

      <Card
        title="The interactive workspace (the mounted PROD-024 entry)"
        meta={
          <span>
            direct manipulation · timeline stepping · inspection · undo · validation —
            every mutation through the ONE engine submission path
          </span>
        }
        id="solution-workspace-mount"
      >
        <p className="pane-foot">
          The workspace below opens a FRESH authoring session of the same solution
          (version 1, empty draft). The recorded reference journey&apos;s generated BOQ
          (version 1) is supplied through the guarded BOQ seam — the pane renders its
          lines as pinned history of the same solution&apos;s version 1, keyed by the
          contract&apos;s trace identities. The agent panel is honestly not connected in
          this session (the compiler routes are the Lead&apos;s server-side wiring);
          author the same operations through the direct-manipulation controls.
        </p>
      </Card>

      <SolutionWorkspace context={composed.caseContext} boq={composed.boqSyncInput} />

      <Card title="The revised solution (the save/revise leg)" id="solution-revision-record">
        {record.revisedBoq === null ? null : (
          <>
            <p>
              The save/revise leg produced a NEW version 2 (the demolition undone — the
              kept rebuild + plaster re-applied through the same engine path; version 1
              stays in the history untouched). Its own declared validation snapshot
              generated the revised BOQ:
            </p>
            <ul className="notes-list">
              {record.revisedBoq.lines.map((line) => (
                <li key={line.boqLineId}>
                  {line.itemDescription} — {line.quantity.value} {line.quantity.unit} (
                  {line.contributingSteps
                    .map(
                      (contribution) =>
                        `step ${contribution.operationIndex} (${contribution.contributionKind})`,
                    )
                    .join(", ")}
                  )
                </li>
              ))}
            </ul>
            <p className="pane-foot">
              Revised BOQ <code>{record.revisedBoq.boqId.slice(0, 24)}…</code> — version{" "}
              {record.revisedBoq.versionNumber}, {record.revisedBoq.lineCount} line(s);
              the observed reality stayed byte-identical across the whole journey (the
              reality seal).
            </p>
          </>
        )}
      </Card>

      <p className="pane-foot">
        The composed golden journey is proven by the deterministic gate
        (`apps/web/src/app/solution-composition-model.test.ts`): both authoring paths,
        the equivalence of their operation identities, byte-deterministic replay, and
        the authoritative-reality seal. Open the{" "}
        <a href={formatRoute({ name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} })}>
          recorded demo world
        </a>{" "}
        any time from the project navigation.
      </p>
    </>
  );
}

export default ComposedSolutionBody;
