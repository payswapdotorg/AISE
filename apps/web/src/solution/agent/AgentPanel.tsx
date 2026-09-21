/**
 * PROD-024 — the EMBEDDED AGENT PANEL (§4.5 of the work order).
 *
 * Where the user states an intent in real-world language. The panel:
 *
 *  - routes the utterance (+ the pending clarification/proposal state)
 *    through the AGENT PORT (the PROD-023 compiler seam — the same
 *    NL → EngineeringOperationIntent path the real agent uses);
 *  - previews the resulting typed operations for confirmation (the
 *    proposal card: rendered command, affected target, parameter-only
 *    quantity estimates, irreversible/review flags) — nothing applies
 *    before the user confirms;
 *  - applies confirmed proposals through the SAME engine submission path
 *    as direct manipulation (§4.2 — the convergence law);
 *  - surfaces clarifications, unsupported/ambiguous/unsafe-refusal
 *    states and read-only tool reports VERBATIM — the workspace never
 *    invents an operation the compiler did not produce.
 *
 * The transcript renders the full conversation; the pending state is
 * visible and cancellable. The panel degrades honestly when the agent
 * seam is not wired (a clear "agent not available" state — never a fake
 * assistant).
 */

import { useState } from "react";
import type { AgentPendingProposal } from "./port";
import type { SolutionAgentPort } from "./port";

export function AgentPanel({ port, busy, transcript, pendingProposal, pendingClarification, onUserTurn, onCancelPending }: {
  /** The agent seam port (undefined = not wired; the panel says so). */
  readonly port: SolutionAgentPort | undefined;
  readonly busy: boolean;
  readonly transcript: readonly import("../model").TranscriptEntry[];
  readonly pendingProposal: AgentPendingProposal | undefined;
  readonly pendingClarification: import("../model").SolutionWorkspaceState["pendingClarification"];
  readonly onUserTurn: (utterance: string) => void;
  readonly onCancelPending: () => void;
}): React.ReactNode {
  const [utterance, setUtterance] = useState("");
  if (port === undefined) {
    return (
      <section aria-label="Assistant" className="solution-pane" id="solution-agent">
        <h3>Ask the assistant</h3>
        <p className="empty" data-agent-status="unwired">
          The assistant is not connected in this session. Direct manipulation, the timeline,
          inspection and undo all remain fully available.
        </p>
      </section>
    );
  }
  return (
    <section aria-label="Assistant" className="solution-pane" id="solution-agent" data-agent-status={busy ? "busy" : "ready"}>
      <h3>Ask the assistant</h3>
      <p className="agent-hint">
        Describe the work in your own words — e.g. “Apply 30 mm plaster to the affected wall
        faces.” The assistant proposes the exact operation; you confirm before anything changes.
      </p>
      <form
        aria-label="Message the assistant"
        className="agent-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = utterance.trim();
          if (trimmed === "") {
            return;
          }
          setUtterance("");
          onUserTurn(trimmed);
        }}
      >
        <label className="sr-only" htmlFor="agent-utterance">
          Your request to the assistant
        </label>
        <input
          id="agent-utterance"
          onChange={(event) => {
            setUtterance(event.target.value);
          }}
          placeholder="What should be done?"
          required
          value={utterance}
        />
        <button disabled={busy} type="submit">
          Send
        </button>
      </form>
      {pendingClarification !== undefined ? (
        <div className="agent-pending" data-pending="clarification">
          <p>
            <strong>Waiting for your answer:</strong>{" "}
            {pendingClarification.questions.map((question) => question.question).join(" ")}
          </p>
          <button onClick={onCancelPending} type="button">
            Cancel this request
          </button>
        </div>
      ) : null}
      {pendingProposal !== undefined ? (
        <div className="agent-pending" data-pending="proposal">
          <p>
            <strong>Proposed change — confirm to apply:</strong>
          </p>
          <p className="proposal-command" data-proposal-command="true">
            {pendingProposal.proposal.renderedCommand}
          </p>
          <p className="proposal-target">Where: {pendingProposal.proposal.target.description}</p>
          <ul className="proposal-quantities">
            {pendingProposal.proposal.estimatedQuantities.map((quantity, index) => (
              <li data-quantity-label={quantity.label} key={index}>
                {quantity.label}: {quantity.value} {quantity.unit} ({quantity.basis})
              </li>
            ))}
          </ul>
          {pendingProposal.proposal.irreversible ? (
            <p className="proposal-warning" data-irreversible="true">
              This step is hard to reverse in reality — make sure the dimensions are right.
            </p>
          ) : null}
          {pendingProposal.proposal.reviewRequirements.length === 0 ? null : (
            <ul className="proposal-review">
              {pendingProposal.proposal.reviewRequirements.map((requirement, index) => (
                <li key={index}>{requirement}</li>
              ))}
            </ul>
          )}
          <div className="proposal-actions">
            <button
              aria-label="Confirm the proposed operation and apply it"
              disabled={busy}
              onClick={() => onUserTurn("yes, apply it")}
              type="button"
            >
              Confirm and apply
            </button>
            <button onClick={onCancelPending} type="button">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <div aria-live="polite" aria-label="Conversation" className="agent-transcript" role="log">
        {transcript.length === 0 ? (
          <p className="empty">The conversation will appear here.</p>
        ) : (
          <ol>
            {transcript.map((entry, index) => (
              <li className={`turn turn-${entry.who}`} data-turn-who={entry.who} key={index}>
                <span className="turn-who">{entry.who === "user" ? "You" : "Assistant"}</span>
                <span className="turn-text">{entry.text}</span>
                {entry.who === "agent" && entry.proposalSummary !== undefined ? (
                  <span className="turn-proposal">
                    {entry.proposalSummary.estimatedQuantities
                      .map((quantity) => `${quantity.label}: ${quantity.value} ${quantity.unit}`)
                      .join("; ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
