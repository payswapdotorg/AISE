/**
 * PROD-024 — the interactive SCENE VIEW (the viewer shell around the
 * deterministic layered SVG).
 *
 * Embeds the viewer's deterministic SVG string (viewer/svg.ts — pure
 * string rendering) and delegates clicks to its stable anchors: observed
 * shapes carry `data-element-id`, proposed overlays carry
 * `data-operation-id` (the engine's operation identity — the cross-pane
 * join key). Clicking an observed element selects it (offering its
 * manipulation actions); clicking a proposed overlay selects the
 * operation (opening the detail inspector + isolation).
 *
 * Interactive 2D/3D navigation: azimuth/elevation sliders + plan/3D
 * projection toggle — PRESENTATION parameters only (they change the
 * projection, never any data). The SVG itself stays byte-deterministic
 * for identical scene + view (the AISE-021 discipline), and the pane
 * carries the WCAG text alternative (sceneTextAlternative) so the viewer
 * is never the only way to understand the state.
 */

import { useCallback } from "react";
import type { MouseEvent } from "react";

import type { ProjectionView } from "./projection";

export function SceneView({ svg, title, selectedElementId, selectedOperationId, onSelectElement, onSelectOperation, view, onViewChange, alternative }: {
  /** The deterministic layered SVG string (viewer/svg.ts). */
  readonly svg: string;
  /** Accessible title of the current scene. */
  readonly title: string;
  readonly selectedElementId: string | undefined;
  readonly selectedOperationId: string | undefined;
  readonly onSelectElement: (elementId: string) => void;
  readonly onSelectOperation: (operationId: string) => void;
  readonly view: ProjectionView & { readonly projection: "plan" | "axonometric" };
  readonly onViewChange: (view: ProjectionView & { readonly projection: "plan" | "axonometric" }) => void;
  /** The WCAG text alternative of the scene. */
  readonly alternative: string;
}): React.ReactNode {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target as SVGElement | null;
      const elementId = target?.getAttribute?.("data-element-id") ?? undefined;
      if (elementId !== undefined) {
        onSelectElement(elementId);
        return;
      }
      const operationId = target?.getAttribute?.("data-operation-id") ?? undefined;
      if (operationId !== undefined) {
        onSelectOperation(operationId);
      }
    },
    [onSelectElement, onSelectOperation],
  );

  return (
    <section aria-label="Building view" className="solution-pane solution-viewer" id="solution-viewer">
      <h3>The building — observed and proposed</h3>
      <div className="viewer-controls">
        <label>
          View
          <select
            aria-label="Projection"
            onChange={(event) => {
              onViewChange({ ...view, projection: event.target.value as "plan" | "axonometric" });
            }}
            value={view.projection}
          >
            <option value="axonometric">3D view</option>
            <option value="plan">Floor plan</option>
          </select>
        </label>
        <label>
          Turn (azimuth {Math.round((view.azimuthRad * 180) / Math.PI)}°)
          <input
            aria-label="Azimuth"
            disabled={view.projection === "plan"}
            max={360}
            min={0}
            onChange={(event) => {
              onViewChange({ ...view, azimuthRad: (Number(event.target.value) * Math.PI) / 180 });
            }}
            step={5}
            type="range"
            value={Math.round((view.azimuthRad * 180) / Math.PI)}
          />
        </label>
        <label>
          Tilt (elevation {Math.round((view.elevationRad * 180) / Math.PI)}°)
          <input
            aria-label="Elevation"
            disabled={view.projection === "plan"}
            max={80}
            min={5}
            onChange={(event) => {
              onViewChange({ ...view, elevationRad: (Number(event.target.value) * Math.PI) / 180 });
            }}
            step={5}
            type="range"
            value={Math.round((view.elevationRad * 180) / Math.PI)}
          />
        </label>
      </div>
      <div
        aria-label={title}
        className="scene-svg"
        data-selected-element={selectedElementId}
        data-selected-operation={selectedOperationId}
        onClick={handleClick}
        role="img"
        title={title}
      >
        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <p className="scene-alternative">{alternative}</p>
      <p className="viewer-legend">
        <span className="legend-observed">▬ observed (authoritative)</span>{" "}
        <span className="legend-added">╌ proposed — added</span>{" "}
        <span className="legend-removed">·· proposed — removed</span>
      </p>
    </section>
  );
}
