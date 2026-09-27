/**
 * QA-002 (D2) — the AGENT PANEL's clarification-choice tests.
 *
 * The live defect: the backend's ClarificationQuestion.offeredChoices (the
 * session foci labels, the material vocabulary) reached the workspace but
 * AgentPanel rendered ONLY the question text — the user had to GUESS the
 * exact answer string ("Damaged ground-floor wall faces" / "node-wall-002"),
 * and natural attempts ended in out-of-vocabulary refusals.
 *
 * These tests pin the fix at the deterministic level (renderToStaticMarkup
 * of the pure panel — the surfaces-create.test.tsx discipline):
 *
 *  (a) offered choices render as ACTIONABLE answer affordances — one button
 *      per choice, each wired to submit the choice as the next user turn;
 *  (b) [browser-level] clicking a choice submits it through onUserTurn —
 *      pinned by apps/web/src/app/qa002-browser.test.tsx against the real
 *      panel in real Chromium (no jsdom in this workspace);
 *  (c) absent choices never fabricate a list — the plain question stands;
 *  (d) the multi-question join still works: every pending question renders,
 *      each with ITS OWN offered choices (choices never leak across
 *      questions);
 *  (e) the example/hint copy stays truthful — the documented example phrase
 *      remains, now with the honest statement that offered answers appear
 *      as pickable buttons.
 *
 * Deterministic: static renders, no network, no clock, no randomness.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentPanel } from "./AgentPanel";
import type { SolutionAgentPort } from "./port";
import type { AgentPendingClarification } from "./port";

/** A stubbed port (the panel only needs the seam to be wired to render). */
const stubPort: SolutionAgentPort = {
  descriptor: { agentId: "agent-stub", binding: "test-double" },
  compile: async () => {
    throw new Error("not used by these tests");
  },
  decideTurn: async () => {
    throw new Error("not used by these tests");
  },
};

/** Render the panel's pending-clarification state with a stubbed port. */
function renderPanel(options: {
  readonly pending?: AgentPendingClarification;
  readonly busy?: boolean;
}): string {
  return renderToStaticMarkup(
    <AgentPanel
      busy={options.busy ?? false}
      onCancelPending={() => {}}
      pendingClarification={options.pending}
      pendingProposal={undefined}
      port={stubPort}
      onUserTurn={() => {}}
      transcript={[]}
    />,
  );
}

describe("QA-002 D2 — the assistant's offered clarification choices render as answers", () => {
  test("(a) every offered choice renders as an actionable button under its question", () => {
    const html = renderPanel({
      pending: {
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
        ],
      },
    });
    // The question text still renders verbatim (the join is intact).
    expect(html).toContain("Which target location should the plaster-application apply to?");
    // One button per offered choice — the labels the compiler actually
    // accepts, rendered as pickable answers (never a dead list).
    expect(html).toContain('data-clarification-choices="target location"');
    for (const choice of [
      "Damaged ground-floor wall faces",
      "Rear facade parapet",
      "node-wall-002",
    ]) {
      expect(html).toContain(`data-clarification-choice="${choice}"`);
      expect(html).toContain(`>${choice}</button>`);
    }
    // Native buttons (keyboard accessible by construction), never links.
    const choiceButtons = html.match(/<button[^>]*data-clarification-choice/g) ?? [];
    expect(choiceButtons.length).toBe(3);
    expect(html).not.toContain("<a data-clarification-choice");
  });

  test("(a-material) the material vocabulary renders the same way (the second live defect shape)", () => {
    const html = renderPanel({
      pending: {
        utterance: "Apply 30 mm plaster to the affected wall faces.",
        questions: [
          {
            slotKind: "material",
            slot: "material",
            question:
              "Which material should the plaster-application use? The material is never invented. Offered choices: [cement-plaster, gypsum-plaster, lime-plaster].",
            offeredChoices: ["cement-plaster", "gypsum-plaster", "lime-plaster"],
          },
        ],
      },
    });
    expect(html).toContain('data-clarification-choices="material"');
    for (const material of ["cement-plaster", "gypsum-plaster", "lime-plaster"]) {
      expect(html).toContain(`data-clarification-choice="${material}"`);
    }
  });

  test("(c) absent choices render NO fabricated list — the plain question stands", () => {
    const html = renderPanel({
      pending: {
        utterance: "Do the thing.",
        questions: [
          {
            slotKind: "dimension",
            slot: "depth",
            question: "Which depth should the excavation reach?",
          },
        ],
      },
    });
    expect(html).toContain("Which depth should the excavation reach?");
    expect(html).not.toContain("data-clarification-choices");
    expect(html).not.toContain("data-clarification-choice");
    expect(html).not.toContain("agent-choice");
  });

  test("(c-empty) an EMPTY offeredChoices array is equally honest — no buttons, no list", () => {
    const html = renderPanel({
      pending: {
        utterance: "Do the thing.",
        questions: [
          {
            slotKind: "dimension",
            slot: "depth",
            question: "Which depth should the excavation reach?",
            offeredChoices: [],
          },
        ],
      },
    });
    expect(html).toContain("Which depth should the excavation reach?");
    expect(html).not.toContain("data-clarification-choices");
  });

  test("(d) the multi-question join: every question renders, each with ITS OWN choices only", () => {
    const html = renderPanel({
      pending: {
        utterance: "Apply 30 mm plaster to the affected wall faces.",
        questions: [
          {
            slotKind: "location",
            slot: "target location",
            question: "Which target location should the plaster-application apply to?",
            offeredChoices: ["Damaged ground-floor wall faces"],
          },
          {
            slotKind: "material",
            slot: "material",
            question: "Which material should the plaster-application use?",
            offeredChoices: ["cement-plaster", "lime-plaster"],
          },
          {
            slotKind: "dimension",
            slot: "thickness",
            question: "Which thickness should the plaster layer have?",
          },
        ],
      },
    });
    // The joined question texts all render (the map/join semantics stand).
    expect(html).toContain("Which target location should the plaster-application apply to?");
    expect(html).toContain("Which material should the plaster-application use?");
    expect(html).toContain("Which thickness should the plaster layer have?");
    // Each question's choices render under ITS OWN slot group — the
    // choiceless question contributes no group, and no choice leaks across.
    expect(html).toContain('data-clarification-choices="target location"');
    expect(html).toContain('data-clarification-choices="material"');
    expect(html).not.toContain('data-clarification-choices="thickness"');
    const targetGroup = /data-clarification-choices="target location"[\s\S]*?<\/div>/.exec(html);
    expect(targetGroup).not.toBeNull();
    expect(targetGroup!.length > 0).toBe(true);
    expect(targetGroup![0]!).toContain("Damaged ground-floor wall faces");
    expect(targetGroup![0]!).not.toContain("cement-plaster");
    expect(targetGroup![0]!).not.toContain("lime-plaster");
    const materialGroup = /data-clarification-choices="material"[\s\S]*?<\/div>/.exec(html);
    expect(materialGroup).not.toBeNull();
    expect(materialGroup![0]!).toContain("cement-plaster");
    expect(materialGroup![0]!).toContain("lime-plaster");
    expect(materialGroup![0]!).not.toContain("Damaged ground-floor wall faces");
  });

  test("(e) the example/hint copy stays truthful: the example phrase remains, and the offered-answers behavior is stated", () => {
    const html = renderPanel({});
    // The panel's OWN documented example phrase stays (it may trigger a
    // clarification — now an answerable one).
    expect(html).toContain("Apply 30 mm plaster to the affected wall faces.");
    // The copy states the honest new behavior: pickable offered answers.
    expect(html).toContain("they appear as buttons you can pick instead of typing");
    // The confirm-before-apply promise stays.
    expect(html).toContain("you confirm before anything changes");
  });

  test("(busy) the offered choices disable while the assistant is busy (no double submission)", () => {
    const html = renderPanel({
      busy: true,
      pending: {
        utterance: "Apply 30 mm plaster to the affected wall faces.",
        questions: [
          {
            slotKind: "location",
            slot: "target location",
            question: "Which target location should the plaster-application apply to?",
            offeredChoices: ["Damaged ground-floor wall faces"],
          },
        ],
      },
    });
    expect(html).toMatch(/<button[^>]*data-clarification-choice="Damaged ground-floor wall faces"[^>]*disabled[^>]*>/);
  });
});
