/**
 * PROD-024 — the DIRECT-MANIPULATION CONTROLS PANE.
 *
 * Selecting an object/region in the viewer offers the available
 * operations as LABELED, REAL-WORDED actions (from the engine-owned
 * capability catalogue keyed by the element's anchoring kind — §4.4).
 * Each action expands a parameter form whose fields are the ENGINE
 * profile's required parameters in declaration order. Executing one
 * builds the typed intent (through the contract's single constructor
 * surface, provenance origin "direct-manipulation") and submits it
 * through the ONE engine submission path — the resulting engine state
 * renders; refusals surface honestly.
 *
 * The pane is fully keyboard-operable (native buttons/inputs/labels) and
 * carries explicit empty states.
 */

import { useState } from "react";
import type { ManipulationAction } from "../operations";
import { manipulationActionsForElement } from "../operations";
import type { SceneElement } from "../viewer/model";

/** One action's parameter draft keyed by slot name. */
type ParameterDraft = Record<string, string>;

export function ManipulationControlsPane({ element, onExecute }: {
  /** The selected observed element (undefined = nothing selected). */
  readonly element: SceneElement | undefined;
  readonly onExecute: (input: {
    readonly element: SceneElement;
    readonly action: ManipulationAction;
    readonly parameterValues: Readonly<Record<string, number | string>>;
  }) => void;
}): React.ReactNode {
  const [openActionId, setOpenActionId] = useState<string | undefined>(undefined);
  const [drafts, setDrafts] = useState<Record<string, ParameterDraft>>({});

  if (element === undefined) {
    return (
      <section aria-label="Direct manipulation controls" className="solution-pane" id="solution-manipulation">
        <h3>Change something</h3>
        <p className="empty" data-empty="manipulation">
          Select a part of the building in the drawing (or its accessible list) to see what you
          can do here.
        </p>
      </section>
    );
  }

  const actions = manipulationActionsForElement(element);
  return (
    <section
      aria-label={`What you can do with ${element.label}`}
      className="solution-pane"
      id="solution-manipulation"
      data-selected-element={element.elementId}
    >
      <h3>
        Change something — <span className="element-label">{element.label}</span>
      </h3>
      <ul className="element-facts">
        {element.facts.map((fact) => (
          <li data-fact-label={fact.label} key={fact.label}>
            {fact.label}: {fact.value}
          </li>
        ))}
      </ul>
      {actions.length === 0 ? (
        <p className="empty">No operations are available for this part in the current engine.</p>
      ) : (
        <div className="action-list" role="list">
          {actions.map((action) => {
            const isOpen = openActionId === action.actionId;
            const draft = drafts[action.actionId] ?? {};
            return (
              <div className="action" data-action-id={action.actionId} key={action.actionId} role="listitem">
                <button
                  aria-expanded={isOpen ? "true" : "false"}
                  onClick={() => {
                    setOpenActionId(isOpen ? undefined : action.actionId);
                  }}
                  type="button"
                >
                  {action.label}
                </button>
                {isOpen ? (
                  <form
                    aria-label={`${action.label} parameters`}
                    className="action-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const values: Record<string, number | string> = {};
                      for (const field of action.parameterFields) {
                        const raw = draft[field.name] ?? "";
                        if (raw.trim() === "") {
                          return; // never submit an incomplete form — the engine would only ask
                        }
                        values[field.name] =
                          field.unit === "" ? raw : Number(raw);
                      }
                      onExecute({ element, action, parameterValues: values });
                      setOpenActionId(undefined);
                      setDrafts({});
                    }}
                  >
                    <p className="action-description">{action.description}</p>
                    {action.parameterFields.map((field) => (
                      <label key={field.name}>
                        {field.label}
                        {field.unit === "" ? null : ` (${field.unit})`}
                        {field.choices === undefined ? (
                          <input
                            aria-label={`${field.label} in ${field.unit}`}
                            data-parameter-name={field.name}
                            inputMode={field.unit === "" ? "text" : "decimal"}
                            onChange={(event) => {
                              setDrafts({
                                ...drafts,
                                [action.actionId]: { ...draft, [field.name]: event.target.value },
                              });
                            }}
                            placeholder={field.unit === "" ? "choose" : `0`}
                            required
                            type={field.unit === "" ? "text" : "number"}
                            value={draft[field.name] ?? ""}
                          />
                        ) : (
                          <select
                            aria-label={field.label}
                            data-parameter-name={field.name}
                            onChange={(event) => {
                              setDrafts({
                                ...drafts,
                                [action.actionId]: { ...draft, [field.name]: event.target.value },
                              });
                            }}
                            required
                            value={draft[field.name] ?? ""}
                          >
                            <option value="">choose…</option>
                            {field.choices.map((choice) => (
                              <option key={choice} value={choice}>
                                {choice}
                              </option>
                            ))}
                          </select>
                        )}
                      </label>
                    ))}
                    <button type="submit">{action.label} — apply</button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
