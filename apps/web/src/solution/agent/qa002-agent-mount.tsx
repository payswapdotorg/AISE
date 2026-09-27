/**
 * QA-002 (D2) — the BROWSER-TEST MOUNT for the agent panel's offered
 * clarification choices (NOT part of the product app — an entry the
 * qa002-browser test bundles with esbuild and drives in real Chromium;
 * this workspace has no jsdom, so the interactive click proof runs in a
 * real browser against the REAL panel component).
 *
 * Mounts the real {@link AgentPanel} with a CLEARLY-LABELED STUBBED port
 * (the scripted-double discipline: it never parses anything — these tests
 * exercise the panel's own submission wiring, not the compiler) and a
 * pending clarification whose questions carry `offeredChoices` exactly as
 * the PROD-023 compiler sends them (session focus labels + the material
 * vocabulary). Every `onUserTurn` submission is RECORDED into the DOM so
 * the browser test can assert that clicking a choice submits it as the
 * next user turn through the SAME path as typing.
 */

import { createRoot } from "react-dom/client";
import { useState } from "react";
import { AgentPanel } from "./AgentPanel";
import type { SolutionAgentPort } from "./port";

/** The stubbed agent seam (browser-test double — never a second compiler). */
const stubPort: SolutionAgentPort = {
  descriptor: { agentId: "agent-qa002-browser-double", binding: "browser-test-double" },
  compile: async () => {
    throw new Error("compile is not exercised by this mount");
  },
  decideTurn: async () => {
    throw new Error("decideTurn is not exercised by this mount");
  },
};

/** The QA-002 mount: the real panel + the recorded user turns. */
function Qa002AgentMount(): React.ReactNode {
  const [turns, setTurns] = useState<string[]>([]);
  return (
    <main id="qa002-agent-mount">
      <AgentPanel
        busy={false}
        onCancelPending={() => {
          setTurns((current) => [...current, "CANCEL"]);
        }}
        pendingClarification={{
          utterance: "Apply 30 mm plaster to the affected wall faces.",
          questions: [
            {
              slotKind: "location",
              slot: "target location",
              question:
                "Which target location should the plaster-application apply to? The request names no place and the session declares no default focus.",
              offeredChoices: [
                "Damaged ground-floor wall faces",
                "Rear facade parapet",
                "node-wall-002",
              ],
            },
            {
              slotKind: "material",
              slot: "material",
              question:
                "Which material should the plaster-application use? The material is never invented.",
              offeredChoices: ["cement-plaster", "gypsum-plaster", "lime-plaster"],
            },
          ],
        }}
        pendingProposal={undefined}
        port={stubPort}
        onUserTurn={(utterance) => {
          setTurns((current) => [...current, utterance]);
        }}
        transcript={[]}
      />
      <ol data-submitted-turns="true" aria-label="The user turns submitted by this mount">
        {turns.map((turn, index) => (
          <li data-submitted-turn={String(index)} key={index}>
            {turn}
          </li>
        ))}
      </ol>
    </main>
  );
}

const container = document.getElementById("app");
if (container !== null) {
  createRoot(container).render(<Qa002AgentMount />);
}
