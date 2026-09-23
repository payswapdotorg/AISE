/**
 * PROD-026 — the SOLUTION COMPOSITION COMPONENTS (presentational, in the
 * app's composition layer).
 *
 * The cards and panels that wire the interactive engineering solution
 * workflow into the app shell:
 *
 *  - the three COMPOSITION CROSS-LINK CARDS rendered additively on the
 *    existing surfaces (Engineering Case → solution workspace, Intervention
 *    Studio → solution, BOQ Lens row → the solution BOQ line trace) — the
 *    PROD-018 cross-link rendering conventions (route targets are anchors
 *    through the app's one router; unresolved targets state their recorded
 *    reason, never a guess);
 *  - the SOLUTION SURFACE panels: the composed case header, the inbound
 *    cross-links, the recorded §3 journey steps, the generated BOQ line
 *    trace panel (with the clicked-line selection + the step/geometry jump
 *    deep links), the honest composing/degraded states.
 *
 * Everything here renders RECORDED data only (the journey record's echoes);
 * no engineering value is computed in this module.
 */

import type { ReactNode } from "react";
import { Card, DataBadge, EmptyState } from "./components";
import { formatRoute } from "./router";
import type { SolutionQuery } from "./router";
import { plural, shortId } from "./format";
import {
  caseToSolutionCrossLink,
  interventionToSolutionCrossLink,
  boqLensLineToSolutionTraceCrossLink,
  type GeneratedSolutionBoqRef,
  type RecordedSolutionWorldPin,
  type SolutionCrossLink,
} from "./solution-links";
import type {
  ComposedJourneyRecord,
  ComposedJourneyStep,
  JourneyBoqEcho,
} from "./solution-journey";
// PROD-031 (the browser-safe cut): this composition module stays in BOTH
// mounts' chunk graphs (the Node rung AND the browser rung render the SAME
// composed surface; only the workspace binding and the record source
// differ) — it imports NOTHING from the solution module at value scope
// (the rungs carry their own bindings).
import { DEMO_SOLUTION_WORLD_PINS, DEMO_SOLUTION_PROJECT_ID } from "./demo";

/* ------------------------------------------------------------------ */
/* The recorded world pin (the demo dataset's projection)               */
/* ------------------------------------------------------------------ */

/**
 * The recorded interactive-solution world the demo dataset holds for a
 * project: the PROD-024 demo wall world on `proj-demo-001` (read-only
 * pins mirrored browser-safely in the demo dataset — the composition-model
 * suite asserts the mirror equals the solution module's own constants).
 * Other projects hold none.
 */
export function recordedSolutionWorldPin(projectId: string): RecordedSolutionWorldPin | null {
  if (projectId !== DEMO_SOLUTION_WORLD_PINS.projectId) {
    return null;
  }
  return {
    projectId,
    solutionId: DEMO_SOLUTION_WORLD_PINS.solutionId,
    caseId: DEMO_SOLUTION_WORLD_PINS.caseId,
    title: DEMO_SOLUTION_WORLD_PINS.title,
    baselineRealityVersionId: DEMO_SOLUTION_WORLD_PINS.baselineRealityVersionId,
  };
}

/* ------------------------------------------------------------------ */
/* The cross-link rendering (the parity conventions)                    */
/* ------------------------------------------------------------------ */

/** One cross-link row: a route anchor, or the honest unresolved reason. */
export function SolutionCrossLinkRow({ link }: { readonly link: SolutionCrossLink }): ReactNode {
  return (
    <li data-cross-link-kind={link.kind} data-cross-link-from={link.fromId}>
      <span className="cross-link-from">{link.fromLabel}</span>
      {" → "}
      {link.target.kind === "route" ? (
        <a href={link.target.href}>{link.target.label}</a>
      ) : (
        <span className="cross-link-unresolved" data-unresolved="true">
          {link.target.label} — {link.target.reason}
        </span>
      )}
      <span className="pane-foot">basis: {link.basis}</span>
    </li>
  );
}

/** The shared cross-link list. */
export function SolutionCrossLinkList({
  links,
}: {
  readonly links: readonly SolutionCrossLink[];
}): ReactNode {
  return (
    <ul className="notes-list">
      {links.map((link) => (
        // PROD-031 note: the key carries the target too — the inbound card
        // renders multiple links of one kind from the same source entity
        // (the recorded world's cross-surface map), and a kind+fromId-only
        // key collides (React's duplicate-key warning, previously printed
        // on every render of the solution surface).
        <SolutionCrossLinkRow
          key={`${link.kind}:${link.fromId}:${
            link.target.kind === "route" ? link.target.href : link.target.label
          }`}
          link={link}
        />
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* The three cross-link cards (rendered on the existing surfaces)       */
/* ------------------------------------------------------------------ */

/** The Engineering Case surface's composition card: case → solution workspace. */
export function CaseToSolutionCard({
  projectId,
  caseRef,
  mode,
}: {
  readonly projectId: string;
  readonly caseRef: { readonly caseId: string; readonly title: string };
  readonly mode: "demo" | "api";
}): ReactNode {
  const link = caseToSolutionCrossLink(projectId, caseRef, recordedSolutionWorldPin(projectId));
  return (
    <Card
      title="Compose an interactive solution"
      badge={<DataBadge mode={mode} />}
      meta={
        <span>
          the second first-class workflow: observed reality → problem → proposed
          operations → validation → solution BOQ with line ↔ step traceability
        </span>
      }
      id="case-to-solution-card"
    >
      <SolutionCrossLinkList links={[link]} />
      <p className="pane-foot">
        Every proposed layer of an interactive solution is a PROPOSED projection
        over the pinned observed reality — the solution engine is authoritative
        for proposed states, and a generated solution BOQ never overwrites a
        source BOQ.
      </p>
    </Card>
  );
}

/** The Intervention Studio surface's composition card: intervention → solution. */
export function InterventionToSolutionCard({
  projectId,
  scenarioRef,
  mode,
}: {
  readonly projectId: string;
  readonly scenarioRef: { readonly scenarioId: string; readonly title: string } | null;
  readonly mode: "demo" | "api";
}): ReactNode {
  const link = interventionToSolutionCrossLink(
    projectId,
    scenarioRef,
    recordedSolutionWorldPin(projectId),
  );
  return (
    <Card
      title="Compose as an interactive solution"
      badge={<DataBadge mode={mode} />}
      meta={
        <span>
          the interactive engineering-solution workflow composes the same class
          of proposal — typed operations, deterministic validation, a generated BOQ
        </span>
      }
      id="intervention-to-solution-card"
    >
      <SolutionCrossLinkList links={[link]} />
    </Card>
  );
}

/**
 * The BOQ Lens surface's per-row solution-trace bridge: the honest record
 * join through the generated BOQ's identity-only source reference.
 */
export function BoqLineSolutionTraceBridge({
  projectId,
  item,
  boqImport,
  solutionBoq,
  mode,
}: {
  readonly projectId: string;
  readonly item: {
    readonly itemId: string;
    readonly rowNumber: number;
    readonly sectionTitle?: string | null;
  };
  readonly boqImport: { readonly importId: string } | null;
  readonly solutionBoq: GeneratedSolutionBoqRef | null;
  readonly mode: "demo" | "api";
}): ReactNode {
  const link = boqLensLineToSolutionTraceCrossLink(projectId, item, boqImport, solutionBoq);
  return (
    <Card
      title={`Solution BOQ line trace — row ${String(item.rowNumber)}`}
      badge={<DataBadge mode={mode} />}
      meta={<span>the interactive-solution workflow&apos;s generated quantities, traced</span>}
      id="boq-line-solution-trace-bridge"
    >
      <SolutionCrossLinkList links={[link]} />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* The solution surface panels                                          */
/* ------------------------------------------------------------------ */

/** The honest composing state (the recorded journey resolves in a microtask). */
export function SolutionComposingPanel(): ReactNode {
  return (
    <Card title="Composing the recorded reference journey…" meta={<span>the deterministic solution engine is executing</span>}>
      <p className="pane-foot">
        The recorded reference journey (observed reality → problem → operations →
        validation → solution BOQ) is being composed through the deterministic
        solution engine — every state, quantity and identity is engine-computed.
      </p>
    </Card>
  );
}

/** The honest engine-unavailable state (the guarded browser mount). */
export function SolutionEngineUnavailablePanel({
  reason,
  world,
  observedFacts,
}: {
  readonly reason: string;
  readonly world: {
    readonly projectId: string;
    readonly caseId: string;
    readonly solutionId: string;
    readonly title: string;
    readonly problemStatement: string;
    readonly baselineRealityVersionId: string;
  };
  readonly observedFacts: readonly {
    readonly elementId: string;
    readonly label: string;
    readonly facts: readonly { readonly label: string; readonly value: string }[];
  }[];
}): ReactNode {
  return (
    <>
      <Card title={world.title} meta={<span>case {world.caseId} — the engineering problem</span>}>
        <p>{world.problemStatement}</p>
        <p className="pane-foot">
          Branches from the observed building (reality version{" "}
          <code>{world.baselineRealityVersionId}</code>) — proposed work never changes the
          observed record.
        </p>
      </Card>
      <Card title="The interactive workspace cannot run in this build" id="solution-engine-unavailable">
        <div className="state state-empty" data-engine-available="false">
          <p className="state-title">The deterministic solution engine is unavailable here</p>
          <p className="state-guidance">{reason}</p>
        </div>
        <p className="pane-foot">
          The observed reality below stays inspectable; the recorded reference
          journey, the workspace and the generated BOQ are composed wherever the
          engine executes (the deterministic gate proves them end to end).
        </p>
      </Card>
      <Card title="The observed current building reality (read-only)" id="solution-observed-facts">
        <ul className="notes-list">
          {observedFacts.map((element) => (
            <li key={element.elementId}>
              <strong>{element.label}</strong>
              <ul className="notes-list">
                {element.facts.map((fact) => (
                  <li key={fact.label}>
                    {fact.label}: <span className="verbatim">{fact.value}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

/** The recorded §3 journey steps (the composition's journey recording). */
export function SolutionJourneyStepsPanel({
  record,
}: {
  readonly record: ComposedJourneyRecord;
}): ReactNode {
  return (
    <Card
      title="The recorded journey (the §3 golden journey)"
      meta={
        <span>
          {plural(record.steps.length, "step")} · journey id{" "}
          <code>{shortId(record.journeyId)}</code> · deterministic replay digest
        </span>
      }
      id="solution-journey-steps"
    >
      <ol className="notes-list" data-journey-mode={record.mode}>
        {record.steps.map((step) => (
          <li key={step.step} data-step={step.step} data-leg={step.leg}>
            <strong>
              {step.step}. {step.title}
            </strong>
            <p>{step.detail}</p>
            <JourneyStepEchoes step={step} />
          </li>
        ))}
      </ol>
      <p className="pane-foot">
        The authoritative-reality seal: the observed scene is byte-identical before
        and after the full journey including the save/revise leg (digest{" "}
        <code>{shortId(record.seal.observedSceneDigestBefore)}</code>), and all{" "}
        {record.seal.sealedStateCount} proposed states carry the PROPOSED seal over the
        pinned baseline <code>{record.seal.pinnedRealityVersionId}</code>.
      </p>
    </Card>
  );
}

/** The typed echoes of one journey step (ids + digests, verbatim from the record). */
function JourneyStepEchoes({ step }: { readonly step: ComposedJourneyStep }): ReactNode {
  return (
    <ul className="notes-list">
      {step.operation === undefined ? null : (
        <li data-echo="operation">
          operation <code>{shortId(step.operation.operationId)}</code> (
          {step.operation.operationType}, {step.operation.origin}) — typed parameters:{" "}
          {step.operation.parameters
            .map(
              (parameter) =>
                `${parameter.name} ${parameter.value}${parameter.unit === undefined ? "" : ` ${parameter.unit}`}`,
            )
            .join(", ")}
        </li>
      )}
      {step.stateTransition === undefined ? null : (
        <li data-echo="state">
          state <code>{shortId(step.stateTransition.toStateId)}</code> (layer{" "}
          {step.stateTransition.toStateIndex}, digest{" "}
          <code>{shortId(step.stateTransition.toStateDigest)}</code>)
        </li>
      )}
      {step.validation === undefined ? null : (
        <li data-echo="validation">
          validation <code>{shortId(step.validation.snapshotId)}</code> — outcome{" "}
          {step.validation.outcome} ({step.validation.checkSummary.length} checks, engine{" "}
          {step.validation.engine.kind} {step.validation.engine.version})
        </li>
      )}
      {step.boq === undefined ? null : (
        <li data-echo="boq">
          solution BOQ <code>{shortId(step.boq.boqId)}</code> — {step.boq.lineCount} line(s)
        </li>
      )}
      {step.boqLineClick === undefined ? null : (
        <li data-echo="click">
          clicked line <code>{shortId(step.boqLineClick.boqLineId)}</code> —{" "}
          {step.boqLineClick.itemDescription} ({step.boqLineClick.quantity.value}{" "}
          {step.boqLineClick.quantity.unit}) → solution step{" "}
          {step.boqLineClick.resolvedSteps
            .map((resolved) => String(resolved.operationIndex))
            .join(", ")}
        </li>
      )}
      {step.links === undefined || step.links.length === 0 ? null : (
        <li data-echo="links">
          {step.links.map((link) => (
            <span key={link.href}>
              <a href={link.href}>{link.label}</a>{" "}
            </span>
          ))}
        </li>
      )}
    </ul>
  );
}

/**
 * The generated solution BOQ line trace panel: every generated line with its
 * typed quantity, CITED calculation method, contributing solution steps (the
 * jump deep links) and geometry references; the selected line (the deep-link
 * `boq-line` query) renders its full provenance chain. This is the "click a
 * BOQ line → jump to the corresponding solution step/geometry" leg of the
 * journey, composed as a product surface.
 */
export function SolutionBoqTracePanel({
  projectId,
  boq,
  selectedLineId,
  addressedStep,
}: {
  readonly projectId: string;
  readonly boq: JourneyBoqEcho;
  readonly selectedLineId: string | undefined;
  readonly addressedStep: number | undefined;
}): ReactNode {
  const selectedLine =
    selectedLineId === undefined
      ? undefined
      : boq.lines.find((line) => line.boqLineId === selectedLineId);
  return (
    <Card
      title="The generated solution BOQ (line traces)"
      meta={
        <span>
          BOQ <code>{shortId(boq.boqId)}</code> · version {boq.versionNumber} · validation
          snapshot <code>{shortId(boq.validationSnapshotRef)}</code> · {boq.lineCount} line(s)
          — a derived projection, never a source BOQ
        </span>
      }
      id="solution-boq-trace-panel"
    >
      <table className="boq-table" data-boq-id={boq.boqId}>
        <caption>
          Generated from the validated solution version — every quantity is
          engine-sourced with its calculation reference cited; click a line to
          jump to its contributing solution step and geometry.
        </caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Quantity</th>
            <th scope="col">Steps</th>
            <th scope="col">Geometry</th>
          </tr>
        </thead>
        <tbody>
          {boq.lines.map((line) => {
            const isSelected = selectedLine?.boqLineId === line.boqLineId;
            return (
              <tr
                key={line.boqLineId}
                data-boq-line-id={line.boqLineId}
                data-selected={isSelected ? "true" : undefined}
              >
                <td>
                  <a
                    href={formatRoute({
                      name: "solution",
                      projectId,
                      query: {
                        case: boq.solutionId === DEMO_SOLUTION_WORLD_PINS.solutionId
                          ? DEMO_SOLUTION_WORLD_PINS.caseId
                          : undefined,
                        boqLine: line.boqLineId,
                        step: line.contributingSteps[0]?.operationIndex,
                      },
                    })}
                  >
                    {line.itemDescription}
                  </a>
                </td>
                <td>
                  {line.quantity.value} {line.quantity.unit}
                </td>
                <td>
                  {line.contributingSteps
                    .map(
                      (contribution) =>
                        `step ${contribution.operationIndex} (${contribution.contributionKind})`,
                    )
                    .join(", ")}
                </td>
                <td>
                  {line.geometryRefs.map((ref) => ref.ref).join(", ") || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {boq.assumptions.length > 0 ? (
        <p className="pane-foot">
          {plural(boq.assumptions.length, "carried assumption")} (propagated validation
          findings and stated uncertainties — never dropped):{" "}
          {boq.assumptions.map((assumption) => assumption.statement).join(" · ")}
        </p>
      ) : null}
      {selectedLineId !== undefined && selectedLine === undefined ? (
        <div className="state state-empty" data-boq-line-state="unknown">
          <p className="state-title">No generated line answers this deep link</p>
          <p className="state-guidance">
            The boq-line <code className="mono">{selectedLineId}</code> is not one of this
            recorded BOQ&apos;s {boq.lineCount} generated line ids — the reference stays
            visible, never re-keyed to another line.
          </p>
        </div>
      ) : null}
      {selectedLine === undefined ? null : (
        <div className="callout" data-boundary="quantity" data-selected-line={selectedLine.boqLineId}>
          <strong>Trace of “{selectedLine.itemDescription}”:</strong>
          <ul className="notes-list">
            <li>
              line id <code>{shortId(selectedLine.boqLineId)}</code> · trace id{" "}
              <code>{shortId(selectedLine.traceId)}</code> · section {selectedLine.sectionId} ·
              building element {selectedLine.buildingElement}
              {selectedLine.material === undefined ? "" : ` · material ${selectedLine.material}`}
            </li>
            <li>
              quantity {selectedLine.quantity.value} {selectedLine.quantity.unit} (
              {selectedLine.quantity.dimension}) — calculation reference{" "}
              <code>{selectedLine.quantity.calculationRef}</code> (the engine&apos;s own
              versioned formula, cited — never restated)
            </li>
            <li>
              contributing steps:{" "}
              {selectedLine.contributingSteps
                .map((contribution) => (
                  <span key={contribution.operationId}>
                    <a
                      href={formatRoute({
                        name: "solution",
                        projectId,
                        query: {
                          boqLine: selectedLine.boqLineId,
                          step: contribution.operationIndex,
                        },
                      })}
                    >
                      step {contribution.operationIndex} ({contribution.contributionKind})
                    </a>{" "}
                  </span>
                ))}
              — resulting states{" "}
              {selectedLine.contributingSteps
                .map((contribution) => shortId(contribution.resultingStateRef))
                .join(", ")}
            </li>
            <li>
              geometry:{" "}
              {selectedLine.geometryRefs
                .map((ref) => `${ref.kind} ${ref.ref}`)
                .join(", ") || "—"}{" "}
              (read-only reality anchors)
            </li>
            {selectedLine.assumptionRefs.length === 0 ? null : (
              <li>assumption refs: {selectedLine.assumptionRefs.join(", ")}</li>
            )}
            {addressedStep === undefined ? null : (
              <li>
                the deep-linked solution step is <strong>step {addressedStep}</strong> — its
                typed operation, engine state and quantities render in the recorded journey
                above (step {addressedStep} of the journey record)
              </li>
            )}
          </ul>
        </div>
      )}
      <p className="pane-foot">
        Bidirectional navigation: every line resolves its contributing solution steps
        (the contract&apos;s line → operations resolver), and every operation reveals its
        generated lines (the workspace&apos;s guarded BOQ pane below renders the same trace
        set). The source BOQ, if any, stays a separate document — this generated BOQ
        references it by identity only.
      </p>
    </Card>
  );
}

/** The inbound cross-links card of the solution surface. */
export function SolutionInboundLinksCard({
  projectId,
  record,
}: {
  readonly projectId: string;
  readonly record: ComposedJourneyRecord;
}): ReactNode {
  return (
    <Card
      title="Into this workflow (the composition cross-links)"
      badge={<DataBadge mode="demo" />}
      meta={<span>case → solution · intervention → solution · BOQ lens line → solution BOQ line trace</span>}
      id="solution-inbound-links"
    >
      <SolutionCrossLinkList
        links={record.crossSurfaceLinks.map((link) => ({
          kind: link.href.includes("boq-line=")
            ? ("boq-lens-line-to-solution-trace" as const)
            : link.href.includes("?case=")
              ? ("case-to-solution" as const)
              : ("intervention-to-solution" as const),
          fromId: record.world.caseId,
          fromLabel: link.label,
          target: { kind: "route" as const, href: link.href, label: link.label },
          basis: link.basis,
        }))}
      />
      <p className="pane-foot">
        The composition&apos;s cross-surface map is the app&apos;s one router —{" "}
        <code>{formatRoute({ name: "solution", projectId, query: {} })}</code> is this
        surface; every deep link carries the recorded reference that grounds it.
      </p>
    </Card>
  );
}

/** The honest empty state: this project holds no recorded solution world. */
export function SolutionWorldEmptyState({
  projectId,
}: {
  readonly projectId: string;
}): ReactNode {
  return (
    <Card title={`Interactive Solution — ${projectId}`} id="solution-empty">
      <EmptyState
        title="This project holds no recorded interactive-solution world"
        guidance={
          <>
            <p>
              An interactive engineering solution composes over a project&apos;s pinned
              observed reality: an engineering problem, a solution world whose operations
              the deterministic engine applies, and a generated solution BOQ tied to a
              declared validation snapshot. The demo dataset holds one recorded world —{" "}
              <a
                href={formatRoute({
                  name: "solution",
                  projectId: DEMO_SOLUTION_WORLD_PINS.projectId,
                  query: {},
                })}
              >
                the demo wall upgrade ({DEMO_SOLUTION_WORLD_PINS.projectId})
              </a>
              .
            </p>
            <p>
              Nothing was borrowed from another project to render this state; open the
              recorded world to walk the composed golden journey end to end.
            </p>
          </>
        }
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* The composed surface (PROD-031: the rung-neutral body)               */
/* ------------------------------------------------------------------ */

/**
 * The composed solution surface — the ONE body both selection-ladder rungs
 * render (PROD-031): the case header, the inbound cross-links, the recorded
 * journey steps, the generated BOQ trace panel, the WORKSPACE mount and the
 * revised-solution record.
 *
 * The surface is RUNG-NEUTRAL BY CONSTRUCTION: it takes the journey RECORD
 * (the Node rung computes it live through the engine; the browser rung
 * renders the committed record — data, never recomputed client-side), the
 * case context, the guarded BOQ sync input and the WORKSPACE as an injected
 * mount (the Node rung mounts the local-engine default; the browser rung
 * mounts the HTTP service binding). No second composed surface exists —
 * the two rungs differ ONLY in their bindings, exactly the PROD-024 mount
 * contract's law.
 */
export function ComposedSolutionSurface({
  projectId,
  query,
  record,
  workspace,
  workspaceCardTitle,
  workspaceCardMeta,
  workspaceCardNote,
}: {
  readonly projectId: string;
  readonly query: SolutionQuery;
  /** The journey record (live from the engine, or the committed record). */
  readonly record: ComposedJourneyRecord;
  /** The rung's workspace mount (the binding-explicit PROD-024 body over
   *  the rung's record + case context + BOQ seam input). */
  readonly workspace: ReactNode;
  readonly workspaceCardTitle: string;
  readonly workspaceCardMeta: ReactNode;
  readonly workspaceCardNote: ReactNode;
}): ReactNode {
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
        title={workspaceCardTitle}
        meta={workspaceCardMeta}
        id="solution-workspace-mount"
      >
        {workspaceCardNote}
      </Card>

      {workspace}

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
