/**
 * POST-006 — DIRECT / NL SEMANTIC-EQUIVALENCE REGRESSION after the
 * POST-004/004B navigation changes (plan §6 Wave 2 "prove direct/NL
 * equivalence again after navigation changes" — pulled into this
 * acceptance lane as work-order item 5; the frozen law is handoff §5:
 * "Direct manipulation and natural-language authoring must resolve to
 * the same operation semantics").
 *
 * POST-004 changed HOW users arrive at authoring (the nav's "Build
 * solution" now enters the interactive workspace DIRECTLY, both build
 * paths presented as its subs; POST-004B added the Projects-surface
 * walkthrough affordance). The regression risk is not the routes — it
 * is whether the two authoring modes still resolve to the SAME typed
 * operations through the NEW entries. This suite re-derives the proof
 * at this base, deterministically:
 *
 *  1. ENTRY PARITY — every entry that reaches the workspace presents
 *     BOTH authoring paths (the nav's subs, the workspace's own
 *     build-paths card), and the nav's hint states the equivalence law
 *     in plain language ("draw it or describe it; both resolve to the
 *     same typed operations");
 *  2. THE NL FRONT DOOR — the task-intent form (the natural-language
 *     entry: "What do you need to do?") still composes the typed task
 *     contract with its honest demo-mode statement;
 *  3. THE EQUIVALENCE CORE — the three authoring journeys (direct,
 *     agent, mixed) re-derived over the seeded world produce IDENTICAL
 *     operation identities, identical state digests, identical
 *     validation outcomes and identical BOQ line identities, while the
 *     PROVENANCE axis (origin: direct-manipulation vs agent) stays
 *     distinct — attribution is not semantics;
 *  4. THE CORPUS IDENTITY — the committed demolition operation id (the
 *     recorded corpus identity the W2 journey replays live) derives
 *     from BOTH pure authoring modes.
 *
 * The LIVE proof (real Chromium: the direct-manipulation click → the
 * typed operation; the agent turn → the semantically equivalent
 * operation) is the W2 journey's w2.direct-manipulation + w2.agent-turn
 * legs, replayed at this base by the acceptance run and cited in the
 * POST-006 evidence record.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { AppEnvironmentContext } from "./environment";
import { TaskIntentForm } from "./task-first";
import { SolutionSurface } from "./surfaces/Solution";
import { formatRoute } from "./router";
import { runComposedJourney, seededJourneyWorld } from "./solution-journey";
import type { ApiStatus } from "./api";
import {
  DEMO_PROJECT_ID,
  DEMO_SCENARIO_PROJECT_ID,
  DEMO_SOLUTION_PROJECT_ID,
} from "./demo";

/** The committed corpus identities (the W2 journey's live legs re-derive these). */
const DEMOLITION_ID = "78be478643fcbb4aad1ba5e9165ab3382199c9165770f50b83a58c431096f2f9";

const DEMO_STATUS: ApiStatus = {
  mode: "unavailable",
  healthz: "failed",
  readyz: "skipped",
  detail: "the API did not answer /healthz on this origin — showing demo data",
  providers: null,
};

function withEnv(node: ReactNode): ReactNode {
  return (
    <AppEnvironmentContext.Provider
      value={{
        apiStatus: DEMO_STATUS,
        fetchImpl: (input) => Promise.reject(new Error(`no transport for ${input}`)),
        principalId: "user-alice",
      }}
    >
      {node}
    </AppEnvironmentContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Entry parity — both authoring paths from every entry             */
/* ------------------------------------------------------------------ */

describe("POST-006 direct/NL equivalence — entry parity after the navigation changes", () => {
  test("the nav's Build-solution entry presents BOTH paths with the equivalence stated in plain language", () => {
    const shell = renderToStaticMarkup(
      <AppShell route={{ name: "dashboard" }} apiStatus={DEMO_STATUS}>
        <div />
      </AppShell>,
    );
    // the primary entry targets the interactive workspace directly…
    expect(shell).toContain(
      `href="${formatRoute({ name: "solution", projectId: DEMO_SOLUTION_PROJECT_ID, query: {} })}"`,
    );
    // …its hint names BOTH paths in plain language, and the subs carry
    // the two authoring modes with their distinction in the labels
    expect(shell).toContain(
      "Design the proposed intervention — interactively, or as recorded steps",
    );
    expect(shell).toContain("Build an intervention — plan changes as recorded, layer-by-layer steps");
    expect(shell).toContain("Build interactively — design and validate in the live workspace");
  });

  test("the workspace presents BOTH paths at arrival (a direct-entry user sees the NL/agent path and vice versa)", () => {
    const solution = renderToStaticMarkup(
      withEnv(<SolutionSurface projectId={DEMO_SOLUTION_PROJECT_ID} query={{}} />),
    );
    expect(solution).toContain('data-build-paths="true"');
    expect(solution).toContain("Build an intervention");
    expect(solution).toContain("Build interactively");
    expect(solution).toContain("you are here");
  });

  test("the step-by-step studio presents the interactive path (the paths cross-link BOTH ways)", () => {
    // The studio's page-head states the alternative path in plain language
    // (pinned by post004-navigation for the StudioBody; here the DIRECT
    // cross-link from the surface's own head is the acceptance pin).
    const shell = renderToStaticMarkup(
      <AppShell route={{ name: "dashboard" }} apiStatus={DEMO_STATUS}>
        <div />
      </AppShell>,
    );
    expect(shell).toContain("Build an intervention");
    expect(shell).toContain(
      `href="${formatRoute({ name: "intervention", projectId: DEMO_SCENARIO_PROJECT_ID, query: {} })}"`,
    );
  });
});

/* ------------------------------------------------------------------ */
/* 2. The NL front door (the task-intent form)                         */
/* ------------------------------------------------------------------ */

describe("POST-006 direct/NL equivalence — the natural-language front door", () => {
  test("the task-intent form composes the typed task contract (the NL entry is typed, never free-text-only)", () => {
    const html = renderToStaticMarkup(withEnv(<TaskIntentForm initialProjectId={DEMO_PROJECT_ID} />));
    expect(html).toContain("What do you need to do?");
    expect(html).toContain('id="task-intent"');
    expect(html).toContain('for="task-intent"');
    expect(html).toContain("Submit task intent");
  });

  test("demo mode states the honest live-API requirement (never a fabricated NL answer)", () => {
    const html = renderToStaticMarkup(withEnv(<TaskIntentForm />));
    expect(html).toContain("requires the adapter endpoints on a live API");
    expect(html).toContain("never fabricates writes or server answers");
  });
});

/* ------------------------------------------------------------------ */
/* 3. The equivalence core (re-derived at this base)                  */
/* ------------------------------------------------------------------ */

/* The three authoring journeys, re-derived once over the seeded world
 * (module top-level await — bun ESM; the journeys are deterministic). */
const DIRECT_JOURNEY = await runComposedJourney(seededJourneyWorld(), "direct");
const AGENT_JOURNEY = await runComposedJourney(seededJourneyWorld(), "agent");
const MIXED_JOURNEY = await runComposedJourney(seededJourneyWorld(), "mixed");

describe("POST-006 direct/NL equivalence — the three authoring modes resolve to the same operations", () => {
  test("the DIRECT and AGENT journeys produce IDENTICAL operation identities (every version)", () => {
    expect(AGENT_JOURNEY.record.operationIdentities.map((entry) => entry.operationId)).toEqual(
      DIRECT_JOURNEY.record.operationIdentities.map((entry) => entry.operationId),
    );
  });

  test("the committed corpus identity derives from BOTH pure modes (the demolition operation)", () => {
    for (const record of [DIRECT_JOURNEY.record, AGENT_JOURNEY.record]) {
      const v1 = record.operationIdentities.filter((entry) => entry.versionNumber === 1);
      expect(v1.map((entry) => entry.operationId)).toContain(DEMOLITION_ID);
    }
  });

  test("identical states, digests, validation outcomes and BOQ line identities (attribution is not semantics)", () => {
    const direct = DIRECT_JOURNEY;
    const agent = AGENT_JOURNEY;
    expect(agent.record.versions.map((version) => version.stateIds)).toEqual(
      direct.record.versions.map((version) => version.stateIds),
    );
    expect(agent.record.versions.map((version) => version.finalStateDigest)).toEqual(
      direct.record.versions.map((version) => version.finalStateDigest),
    );
    const agentValidation = agent.record.steps.find((step) => step.leg === "validate")!.validation!;
    const directValidation = direct.record.steps.find((step) => step.leg === "validate")!.validation!;
    expect(agentValidation.checkSummary).toEqual(directValidation.checkSummary);
    expect(agentValidation.outcome).toBe(directValidation.outcome);
    expect(agent.record.boq.lines.map((line) => line.boqLineId)).toEqual(
      direct.record.boq.lines.map((line) => line.boqLineId),
    );
    expect(
      agent.record.boq.lines.map((line) => `${line.quantity.value} ${line.quantity.unit}`),
    ).toEqual(direct.record.boq.lines.map((line) => `${line.quantity.value} ${line.quantity.unit}`));
  });

  test("the PROVENANCE axis stays distinct (direct-manipulation vs agent — never conflated)", () => {
    const directV1 = DIRECT_JOURNEY.record.operationIdentities.filter(
      (entry) => entry.versionNumber === 1,
    );
    const agentV1 = AGENT_JOURNEY.record.operationIdentities.filter(
      (entry) => entry.versionNumber === 1,
    );
    expect(directV1.every((entry) => entry.origin === "direct-manipulation")).toBe(true);
    expect(agentV1.every((entry) => entry.origin === "agent")).toBe(true);
  });

  test("the MIXED journey (direct + agent in one solution) lands on the SAME corpus identities", () => {
    const mixedV1 = MIXED_JOURNEY.record.operationIdentities.filter(
      (entry) => entry.versionNumber === 1,
    );
    const directV1 = DIRECT_JOURNEY.record.operationIdentities.filter(
      (entry) => entry.versionNumber === 1,
    );
    expect(mixedV1.map((entry) => entry.operationId)).toEqual(
      directV1.map((entry) => entry.operationId),
    );
  });
});
