/**
 * PROD-024 — the ACCESSIBLE NON-VIEWER FALLBACK (§4.7 — first-class).
 *
 * A COMPLETE keyboard-navigable, screen-reader-labeled inspection path
 * with ZERO reliance on the spatial viewer: the observed building as a
 * labeled list (every element with its recorded facts), the proposed
 * work at the current step as a labeled list (every engine-recorded
 * operation with its direction), and the same selection semantics —
 * selecting an observed element offers its manipulation actions; opening
 * an operation opens the detail inspector; the timeline, the undo
 * control and the BOQ pane all remain operable. A user can inspect and
 * revise a full solution through this path alone (the fallback is not a
 * stub).
 *
 * The fallback exercises the SAME semantics: the elements' actions build
 * the same typed intents through the same submission path; nothing here
 * computes engineering values.
 */

import type { ObservedScene, ProposedOverlay } from "../viewer/model";
import { directionTextOf, operationNameOf } from "../panes/labels";

export function AccessibleScenePane({ scene, overlays, selectedElementId, selectedOperationId, onSelectElement, onSelectOperation }: {
  readonly scene: ObservedScene;
  /** The proposed overlays at the current timeline position. */
  readonly overlays: readonly ProposedOverlay[];
  readonly selectedElementId: string | undefined;
  readonly selectedOperationId: string | undefined;
  readonly onSelectElement: (elementId: string) => void;
  readonly onSelectOperation: (operationId: string) => void;
}): React.ReactNode {
  return (
    <section
      aria-label="Building contents (accessible view)"
      className="solution-pane solution-fallback"
      id="solution-accessible-scene"
    >
      <h3>The building — accessible view</h3>
      <h4>Observed parts (authoritative)</h4>
      <ul className="accessible-observed">
        {scene.elements.map((element) => (
          <li key={element.elementId} data-element-id={element.elementId}>
            <button
              aria-pressed={selectedElementId === element.elementId ? "true" : "false"}
              onClick={() => onSelectElement(element.elementId)}
              type="button"
            >
              {element.label} ({element.kind})
            </button>
            <ul className="element-facts">
              {element.facts.map((fact) => (
                <li data-fact-label={fact.label} key={fact.label}>
                  {fact.label}: {fact.value}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <h4>Proposed work at this step</h4>
      {overlays.length === 0 ? (
        <p className="empty" data-empty="overlays">
          No proposed work is visible at this step.
        </p>
      ) : (
        <ul className="accessible-proposed">
          {overlays.map((overlay) => (
            <li data-operation-id={overlay.operationId} key={overlay.operationId}>
              <button
                aria-pressed={selectedOperationId === overlay.operationId ? "true" : "false"}
                onClick={() => onSelectOperation(overlay.operationId)}
                type="button"
              >
                {overlay.label} — {directionTextOf(overlay.direction)} material
              </button>
              <span className="accessible-proposed-type">
                ({operationNameOf(overlay.operationType)}, step {overlay.operationIndex})
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
