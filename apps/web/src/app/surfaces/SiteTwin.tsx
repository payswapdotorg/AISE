/**
 * PROD-002 — the SiteTwin / Evidence surface (the "SITETWIN/EVIDENCE" step
 * of the golden journey): synchronized 2D drawing + 3D wireframe panes of
 * the pinned model version, the reality snapshot, and the project's
 * evidence records — all linked by ONE stable node id (the AISE-021 R5
 * discipline, consumed from the frozen workspace library).
 *
 * Honesty:
 *  - the pinned drawing (v002) and the reality snapshot (v003) are DIFFERENT
 *    records and are labeled with their verbatim version ids — the drawing is
 *    a projection pinned to a model version, the snapshot is the reality
 *    graph; neither is presented as the other;
 *  - σ renders as ±σ when known and "σ unknown" when not (never ±0);
 *  - omitted nodes are listed with their verbatim reason codes;
 *  - invalidated evidence renders as a visible state, not a deletion;
 *  - in live mode the projection panes are honestly UNAVAILABLE (no readable
 *    projection endpoint in this build) while the reality pane stays live.
 */

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useResource, type ResourceOutcome } from "../resource";
import { isDemoMode, useAppEnvironment } from "../environment";
import { describeApiFailure, loadRealityLive } from "../api";
import { demoEvidenceList, demoReality, demoWorkspaceInput } from "../demo";
import type { EvidencePaneView, RealityPaneView } from "../../shell";
import {
  project3dWireframe,
  renderDrawing2dSvg,
  renderWireframeSvg,
  resolveSelection,
  viewOf,
  type WorkspaceInput,
} from "../../workspace";
import {
  Card,
  DataBadge,
  EmptyState,
  EpistemicBadge,
  Instant,
  LibrarySvg,
  ResourceView,
  SigmaNote,
  SourceNote,
  UnavailableState,
} from "../components";
import { ProjectSurfaceNav } from "../components";
import { TaskFlowStrip } from "../task-first";
import { formatRoute } from "../router";
import { formatBytes, plural, shortId } from "../format";
import { measurementText } from "../../workspace";

/** What the SiteTwin surface renders once loaded. */
export interface SiteTwinData {
  readonly mode: "demo" | "api";
  readonly projectId: string;
  /** The pinned projection workspace (2D + 3D + evidence links); null = none. */
  readonly workspace: WorkspaceInput | null;
  /** The reality snapshot (demo fixture or live adapter); null = none recorded. */
  readonly reality: RealityPaneView | null;
  /** Evidence records (demo fixtures; live mode has no readable evidence route). */
  readonly evidence: readonly EvidencePaneView[];
}

/** The SiteTwin / Evidence surface. */
export function SiteTwin({ projectId }: { readonly projectId: string }): ReactNode {
  const environment = useAppEnvironment();
  const mode = environment.apiStatus?.mode ?? "probing";
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const load = useCallback(async (): Promise<ResourceOutcome<SiteTwinData>> => {
    if (isDemoMode(environment) || environment.apiStatus === null) {
      return {
        kind: "ready",
        data: {
          mode: "demo",
          projectId,
          workspace: demoWorkspaceInput(projectId),
          reality: demoReality(projectId),
          evidence: demoEvidenceList(projectId),
        },
      };
    }
    const reality = await loadRealityLive(environment.fetchImpl, projectId);
    if (!reality.ok) {
      return { kind: "error", message: describeApiFailure(reality.failure) };
    }
    return {
      kind: "ready",
      data: {
        mode: "api",
        projectId,
        workspace: null,
        reality: reality.view,
        evidence: [],
      },
    };
  }, [environment, projectId]);

  const { state, reload } = useResource(`sitetwin:${projectId}:${mode}`, load);

  return (
    <>
      <div className="page-head">
        <p className="crumbs">
          <a href={formatRoute({ name: "projects" })}>Projects</a> /{" "}
          <a href={formatRoute({ name: "project", projectId })}>{projectId}</a>
        </p>
        <h1>SiteTwin / Evidence</h1>
        <p>
          Synchronized 2D and 3D views of the pinned model version, the reality
          snapshot and the evidence records — one stable node id resolves in
          every view.
        </p>
      </div>
      <TaskFlowStrip projectId={projectId} />
      <ProjectSurfaceNav projectId={projectId} current="sitetwin" />
      <ResourceView
        state={state}
        loadingLabel="Loading the SiteTwin…"
        onRetry={reload}
        render={(data) => (
          <SiteTwinBody
            data={data}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        )}
      />
    </>
  );
}

export function SiteTwinBody({
  data,
  selectedNodeId,
  onSelectNode,
}: {
  readonly data: SiteTwinData;
  readonly selectedNodeId: string | null;
  readonly onSelectNode: (nodeId: string) => void;
}): ReactNode {
  return (
    <>
      {data.workspace === null ? (
        <Card
          title="Projection workspace"
          badge={<DataBadge mode={data.mode} />}
          meta={<span>the pinned 2D drawing + 3D wireframe</span>}
        >
          {data.mode === "demo" ? (
            <EmptyState
              title="No pinned projection workspace for this project"
              guidance="The demo dataset pins a drawing + wireframe only for the pilot project. A workspace is pinned when a drawing is generated from a model version."
            />
          ) : (
            <UnavailableState
              reason="the pinned 2D/3D projection workspace is assembled by the projection pipeline; this build has no readable same-origin endpoint for it yet"
              impact="the clickable 2D/3D panes and the cross-view selection panel are hidden; the reality snapshot and its evidence references below remain available"
            />
          )}
        </Card>
      ) : (
        <WorkspacePanes
          workspace={data.workspace}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
        />
      )}
      <RealityCard reality={data.reality} mode={data.mode} />
      <EvidenceCard evidence={data.evidence} mode={data.mode} />
    </>
  );
}

function WorkspacePanes({
  workspace,
  selectedNodeId,
  onSelectNode,
}: {
  readonly workspace: WorkspaceInput;
  readonly selectedNodeId: string | null;
  readonly onSelectNode: (nodeId: string) => void;
}): ReactNode {
  const view = viewOf(workspace);
  const wireframe = project3dWireframe(workspace.graphSnapshot, view);
  const drawingSvg = renderDrawing2dSvg(workspace.drawing, selectedNodeId ?? undefined);
  const wireframeSvg = renderWireframeSvg(wireframe, selectedNodeId ?? undefined);
  const bundle =
    selectedNodeId === null ? null : resolveSelection(selectedNodeId, workspace);
  return (
    <Card
      title="Pinned projection workspace"
      meta={
        <span>
          drawing <span className="mono">{workspace.drawing.drawingId}</span> (kind{" "}
          {workspace.drawing.kind}) · pinned to version{" "}
          <span className="mono">{workspace.drawing.sourceVersionId}</span> · generated by{" "}
          <span className="mono">{workspace.drawing.generatedBy}</span>
        </span>
      }
    >
      <div className="pane-grid">
        <div className="pane">
          <div className="pane-head">
            2D — floor plan
            <span className="pane-sub">
              {plural(workspace.drawing.elements.length, "element")} ·{" "}
              {plural(workspace.drawing.omittedNodes.length, "omitted node")}
            </span>
          </div>
          <LibrarySvg
            svg={drawingSvg}
            title="Floor-plan drawing of the pinned model version"
            onSelectNode={onSelectNode}
          />
          <div className="pane-foot">
            <OmissionList
              title="Omitted from the 2D drawing"
              omissions={workspace.drawing.omittedNodes.map((node) => ({
                nodeId: node.nodeId,
                reason: node.reason,
              }))}
            />
          </div>
        </div>
        <div className="pane">
          <div className="pane-head">
            3D — axonometric wireframe
            <span className="pane-sub">
              {plural(wireframe.elements.length, "element")} ·{" "}
              {plural(wireframe.omissions.length, "omission")}
            </span>
          </div>
          <LibrarySvg
            svg={wireframeSvg}
            title="Axonometric wireframe of the pinned model version"
            onSelectNode={onSelectNode}
          />
          <div className="pane-foot">
            <OmissionList
              title="Omitted from the 3D wireframe"
              omissions={wireframe.omissions.map((omission) => ({
                nodeId: omission.nodeId,
                reason: omission.reason,
              }))}
            />
          </div>
        </div>
      </div>
      <div className="callout">
        Click a wall, floor or opening in either pane — the same stable node id
        resolves in the 2D drawing, the 3D wireframe and the linked evidence
        (the cross-view identity the workspace library enforces).
      </div>
      <div className="table-wrap">
        <table className="data">
          <caption className="pane-foot">
            Measurements carried by the drawing — values with their propagated
            uncertainty
          </caption>
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Measured value</th>
              <th>Between</th>
            </tr>
          </thead>
          <tbody>
            {workspace.drawing.dimensions.map((dimension) => (
              <tr key={dimension.dimensionId}>
                <td className="mono">{dimension.dimensionId}</td>
                <td>{measurementText(dimension)}</td>
                <td className="mono">
                  {dimension.sourceNodeIds[0]} ↔ {dimension.sourceNodeIds[1]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bundle === null ? (
        <EmptyState
          title="Nothing selected"
          guidance="Select an element in a pane or a table row to resolve it across every view."
        />
      ) : (
        <SelectionPanel bundle={bundle} />
      )}
    </Card>
  );
}

function OmissionList({
  title,
  omissions,
}: {
  readonly title: string;
  readonly omissions: readonly { readonly nodeId: string; readonly reason: string }[];
}): ReactNode {
  if (omissions.length === 0) {
    return <p>{title}: none.</p>;
  }
  return (
    <div>
      <p>{title} (honest omissions — geometry is never guessed):</p>
      <ul>
        {omissions.map((omission) => (
          <li key={omission.nodeId}>
            <span className="mono">{omission.nodeId}</span> — {omission.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SelectionPanel({
  bundle,
}: {
  readonly bundle: ReturnType<typeof resolveSelection>;
}): ReactNode {
  return (
    <section className="selection-panel" aria-label="Selection">
      <h3 className="pane-head">
        Selection — <span className="mono">{bundle.nodeId}</span>
      </h3>
      <dl className="fields">
        <Field2 label="Resolved in views">{bundle.resolvedIn.join(", ") || "none"}</Field2>
        <Field2 label="2D drawing entries">
          {bundle.drawingEntries.length === 0
            ? "none"
            : bundle.drawingEntries
                .map((entry) => `${entry.entryKind} ${entry.elementId}`)
                .join(", ")}
        </Field2>
        <Field2 label="3D wireframe entries">
          {bundle.wireframeEntries.length === 0
            ? "none"
            : bundle.wireframeEntries.map((entry) => entry.geometryId).join(", ")}
        </Field2>
        <Field2 label="Linked evidence">
          {bundle.evidenceEntries.length === 0
            ? "none"
            : bundle.evidenceEntries.map((entry) => entry.evidenceId).join(", ")}
        </Field2>
      </dl>
      {bundle.properties.length === 0 ? null : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Property</th>
                <th>Value</th>
                <th>Epistemic status</th>
              </tr>
            </thead>
            <tbody>
              {bundle.properties.map((property) => (
                <tr key={property.key}>
                  <td className="mono">{property.key}</td>
                  <td>
                    {String(property.value)}
                    {property.unit === undefined ? "" : ` ${property.unit}`}
                  </td>
                  <td>
                    <EpistemicBadge status={property.epistemicStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {bundle.sigmas.length === 0 ? null : (
        <p className="pane-foot">
          σ concerning this node:{" "}
          {bundle.sigmas.map((sigma, index) => (
            <span key={`${sigma.source}:${sigma.id}`}>
              {index === 0 ? null : " · "}
              <span className="mono">
                {sigma.source}/{sigma.id}
              </span>{" "}
              <SigmaNote sigma={sigma.sigma} />
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/** A definition-list row (local alias to keep the panel readable). */
function Field2({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function RealityCard({
  reality,
  mode,
}: {
  readonly reality: RealityPaneView | null;
  readonly mode: "demo" | "api";
}): ReactNode {
  return (
    <Card
      title="Reality snapshot"
      badge={<DataBadge mode={mode} />}
      meta={
        reality === null ? undefined : (
          <span>
            version <span className="mono">{reality.versionId}</span> · recorded{" "}
            <Instant iso={reality.versionCreatedAt.value} /> ·{" "}
            <SourceNote source={reality.source} />
          </span>
        )
      }
    >
      {reality === null ? (
        <EmptyState
          title="No reality snapshot recorded for this project"
          guidance="Reality snapshots are materialized from reconstructed evidence. This project has none yet — the SiteTwin shows the pinned projections only."
        />
      ) : (
        <>
          <p className="pane-foot">
            The snapshot is a DIFFERENT record from the pinned drawing above: it
            is the project&apos;s reality graph version, with every node&apos;s
            epistemic status and evidence references.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Kind</th>
                  <th>Epistemic status</th>
                  <th>Recorded properties</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {reality.nodes.map((node) => (
                  <tr key={node.nodeId}>
                    <td className="mono">{node.nodeId}</td>
                    <td>{node.kind}</td>
                    <td>
                      <EpistemicBadge status={node.epistemicStatus} />
                    </td>
                    <td>{node.summary.value}</td>
                    <td>
                      {node.evidenceIds.length === 0
                        ? "none recorded"
                        : node.evidenceIds.map((entry) => shortId(entry.value)).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function EvidenceCard({
  evidence,
  mode,
}: {
  readonly evidence: readonly EvidencePaneView[];
  readonly mode: "demo" | "api";
}): ReactNode {
  return (
    <Card
      title="Evidence records"
      badge={<DataBadge mode={mode} />}
      meta={<span>captures behind the reality graph — invalidation is a state, not a deletion</span>}
    >
      {evidence.length === 0 ? (
        mode === "api" ? (
          <EmptyState
            title="Evidence records are not readable through this build's API seam"
            guidance="The evidence namespace has no GET route this build consumes; evidence ids remain visible on every reality node above. The demo dataset (API unavailable) shows the full evidence surface."
          />
        ) : (
          <EmptyState
            title="No evidence records for this project"
            guidance="Evidence is captured per project through the AISE API. The demo dataset holds evidence only for the pilot project."
          />
        )
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Evidence</th>
                <th>Acquisition method</th>
                <th>Media</th>
                <th>Size</th>
                <th>Captured</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((record) => (
                <tr key={record.evidenceId}>
                  <td className="mono" title={record.evidenceId}>
                    {shortId(record.evidenceId)}
                  </td>
                  <td>{record.acquisitionMethod.value}</td>
                  <td>{record.mediaType.value}</td>
                  <td>{formatBytes(record.byteSize.value)}</td>
                  <td>
                    <Instant iso={record.capturedAt.value} />
                  </td>
                  <td>
                    {record.invalidationReason === null ? (
                      <span className="tag">valid</span>
                    ) : (
                      <span
                        className="tag tag-invalidated"
                        title={record.invalidationReason.value}
                      >
                        invalidated — {record.invalidationReason.value}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
