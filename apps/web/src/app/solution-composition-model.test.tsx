/**
 * PROD-026 — the COMPOSITION-MODEL tests (the PROD-018 parity convention,
 * in the composition layer's own surface).
 *
 * THE COMPOSED GOLDEN JOURNEY — the ENTIRE §3 journey driven
 * programmatically against the SEEDED building fixture (the engine's
 * committed demo wall world — the same world the contract's committed
 * intent corpus and the PROD-025 golden BOQ describe):
 *
 *   1. the ROUTE/NAV WIRING — the project-scoped solution route (the house
 *      hash-router convention: typed query, canonical formatting, honest
 *      not-found rejections), the primary-nav entry, the per-project
 *      surface nav, the app's routing of the surface;
 *   2. the COMPOSITION CROSS-LINKS — case → solution workspace,
 *      intervention → solution, BOQ lens line → solution BOQ line trace
 *      (the parity conventions: recorded-reference joins, honest
 *      unresolved states, the app's ONE router);
 *   3. THE TWELVE-STEP JOURNEY — every step's typed operation, state
 *      transition, validation snapshot, BOQ trace and cross-surface link
 *      asserted, with the operation identities pinned to the COMMITTED
 *      corpus identities;
 *   4. the EQUIVALENCE — the agent-path and direct-path variants both
 *      executed; their operation identities COMPARED (identical — the
 *      sha-256 identity excluding provenance) and their outcomes identical;
 *   5. DETERMINISTIC REPLAY — two full runs produce the identical record
 *      digest (byte-determinism end to end);
 *   6. the REALITY SEAL — after the full journey including the save/revise
 *      leg, the authoritative reality is byte-identical to its pre-journey
 *      state (the committed engine fixture bytes + the observed scene +
 *      every state's PROPOSED seal over the pinned baseline);
 *   7. the BOQ LINE CLICK → STEP/GEOMETRY JUMP — the clicked line's
 *      contributing steps, geometry refs and the deep-linked route that
 *      round-trips the app's router (plus the reverse navigation);
 *   8. the SURFACE — the mounted PROD-024 workspace entry, the recorded
 *      journey record, the trace panel, the guarded engine branch and the
 *      honest per-project empty state.
 *
 * Determinism: pure computations + the real engine; no clock reads (the
 * injected stepped clock), no randomness, no network, no I/O beyond the
 * committed fixture reads of the seal proof.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  formatRoute,
  parseHash,
  PROJECT_SURFACES,
  routeSurface,
  type Route,
} from "./router";
import { AppShell } from "./AppShell";
import { NotFound } from "./App";
import { SolutionSurface } from "./surfaces/Solution";
import { ComposedSolutionBody } from "./solution-mount";
import {
  boqLensLineToSolutionTraceCrossLink,
  caseToSolutionCrossLink,
  interventionToSolutionCrossLink,
} from "./solution-links";
import {
  recordedSolutionWorldPin,
  SolutionBoqTracePanel,
  SolutionEngineUnavailablePanel,
  SolutionWorldEmptyState,
} from "./solution-composition";
import {
  runComposedJourney,
  seededJourneyResource,
  seededJourneyWorld,
  solutionEngineExecutable,
} from "./solution-journey";
import { DEMO_SOLUTION_PROJECT_ID, DEMO_PROJECT_ID, DEMO_SOLUTION_WORLD_PINS, demoSolutionObservedFacts } from "./demo";
import { demoBoqImport, demoLensInput } from "./demo";
import { DEMO_SOLUTION_WORLD, demoObservedScene } from "../solution";
import { resolveLinesForOperation } from "../../../../packages/solution-contract/src/index";
import { canonicalJsonStringify } from "../../../../packages/shared-contracts/src/index";

const PROJECT = DEMO_SOLUTION_PROJECT_ID;

/* ------------------------------------------------------------------ */
/* 1. The route / nav wiring                                           */
/* ------------------------------------------------------------------ */

describe("PROD-026 composition wiring (the route, the nav, the app's routing)", () => {
  test("the solution route parses and formats (the house hash-router convention)", () => {
    const route: Route = { name: "solution", projectId: PROJECT, query: {} };
    expect(parseHash(formatRoute(route))).toEqual(route);
    expect(formatRoute(route)).toBe(`#/projects/${PROJECT}/solution`);
    expect(routeSurface(route)).toBe("solution");
  });

  test("the deep-linked journey query round-trips (case / boq-line / step, any order)", () => {
    const href = `#/projects/${PROJECT}/solution?case=case-demo-wall-001&boq-line=abc123&step=3`;
    const parsed = parseHash(href);
    expect(parsed).toEqual({
      name: "solution",
      projectId: PROJECT,
      query: { case: "case-demo-wall-001", boqLine: "abc123", step: 3 },
    });
    // any parse order is accepted; the canonical formatting order is case, boq-line, step
    expect(parseHash(formatRoute(parsed))).toEqual(parsed);
    expect(formatRoute(parsed)).toBe(
      `#/projects/${PROJECT}/solution?case=case-demo-wall-001&boq-line=abc123&step=3`,
    );
    expect(parseHash(`#/projects/${PROJECT}/solution?step=3&boq-line=abc123&case=case-demo-wall-001`)).toEqual(parsed);
  });

  test("unknown keys, blank values and malformed steps are typed rejections (never a guess)", () => {
    expect(parseHash(`#/projects/${PROJECT}/solution?case=x&layer=2`).name).toBe("not-found");
    expect(parseHash(`#/projects/${PROJECT}/solution?case=`).name).toBe("not-found");
    expect(parseHash(`#/projects/${PROJECT}/solution?boq-line=%20`).name).toBe("not-found");
    expect(parseHash(`#/projects/${PROJECT}/solution?step=-1`).name).toBe("not-found");
    expect(parseHash(`#/projects/${PROJECT}/solution?step=x`).name).toBe("not-found");
    expect(parseHash(`#/projects/${PROJECT}/solution?case`).name).toBe("not-found");
    expect(parseHash(`#/projects//solution`).name).toBe("not-found");
  });

  test("the per-project surface nav and the primary nav carry the solution surface", () => {
    expect(PROJECT_SURFACES.map((surface) => surface.surface)).toContain("solution");
    const shell = renderToStaticMarkup(
      <AppShell route={{ name: "solution", projectId: PROJECT, query: {} }} apiStatus={null}>
        <span />
      </AppShell>,
    );
    expect(shell).toContain(formatRoute({ name: "solution", projectId: PROJECT, query: {} }));
    expect(shell).toContain("Demo — Interactive Solution");
  });

  test("the not-found surface lists the Interactive Solution surface", () => {
    const html = renderToStaticMarkup(<NotFound hash="#/nope" />);
    expect(html).toContain("Interactive Solution");
    expect(html).toContain(formatRoute({ name: "solution", projectId: PROJECT, query: {} }));
  });
});

/* ------------------------------------------------------------------ */
/* 2. The composition cross-links                                       */
/* ------------------------------------------------------------------ */

describe("PROD-026 composition cross-links (the parity conventions)", () => {
  test("case → solution workspace resolves through the recorded world pin on the demo world's project", () => {
    const pin = recordedSolutionWorldPin(PROJECT);
    expect(pin).not.toBeNull();
    const link = caseToSolutionCrossLink(
      PROJECT,
      { caseId: DEMO_SOLUTION_WORLD.caseId, title: DEMO_SOLUTION_WORLD.title },
      pin,
    );
    expect(link.kind).toBe("case-to-solution");
    expect(link.target.kind).toBe("route");
    if (link.target.kind === "route") {
      expect(link.target.href).toBe(
        `#/projects/${PROJECT}/solution?case=${DEMO_SOLUTION_WORLD.caseId}`,
      );
      expect(parseHash(link.target.href)).toEqual({
        name: "solution",
        projectId: PROJECT,
        query: { case: DEMO_SOLUTION_WORLD.caseId },
      });
    }
    expect(link.basis).toContain(DEMO_SOLUTION_WORLD.solutionId);
    expect(link.basis).toContain("recorded join");
  });

  test("case → solution on a project without a recorded world is the honest affordance (never borrowed data)", () => {
    const link = caseToSolutionCrossLink(
      DEMO_PROJECT_ID,
      { caseId: "case-007", title: "North wall deviation" },
      recordedSolutionWorldPin(DEMO_PROJECT_ID),
    );
    expect(recordedSolutionWorldPin(DEMO_PROJECT_ID)).toBeNull();
    expect(link.target.kind).toBe("route");
    expect(link.basis).toContain("affordance");
    expect(link.basis).toContain("honest empty state");
  });

  test("intervention → solution composes the affordance (with the scenario pin when held)", () => {
    const withScenario = interventionToSolutionCrossLink(
      PROJECT,
      { scenarioId: "scenario-x", title: "An office refit" },
      recordedSolutionWorldPin(PROJECT),
    );
    expect(withScenario.kind).toBe("intervention-to-solution");
    expect(withScenario.target.kind).toBe("route");
    if (withScenario.target.kind === "route") {
      expect(parseHash(withScenario.target.href)).toEqual({
        name: "solution",
        projectId: PROJECT,
        query: {},
      });
    }
    const withoutWorld = interventionToSolutionCrossLink(DEMO_PROJECT_ID, null, null);
    expect(withoutWorld.basis).toContain("affordance");
  });

  test("BOQ lens line → solution BOQ line trace resolves ONLY through the identity-only source reference", () => {
    const item = { itemId: "row-12", rowNumber: 12, sectionTitle: "Substructure" };
    const importRecord = { importId: "boq-0042" };
    // the honest unresolved: no generated BOQ held
    const none = boqLensLineToSolutionTraceCrossLink(DEMO_PROJECT_ID, item, importRecord, null);
    expect(none.target.kind).toBe("unresolved");
    if (none.target.kind === "unresolved") {
      expect(none.target.reason).toContain("no solution-generated BOQ");
    }
    // the honest unresolved: a generated BOQ that references a DIFFERENT source document
    const other = boqLensLineToSolutionTraceCrossLink(DEMO_PROJECT_ID, item, importRecord, {
      boqId: "b1",
      solutionId: "s1",
      sourceBoqRef: { importId: "boq-other" },
    });
    expect(other.target.kind).toBe("unresolved");
    // the resolved join: the generated BOQ references this row's source import
    const resolved = boqLensLineToSolutionTraceCrossLink(DEMO_PROJECT_ID, item, importRecord, {
      boqId: "b1",
      solutionId: "s1",
      sourceBoqRef: { importId: "boq-0042" },
    });
    expect(resolved.target.kind).toBe("route");
    if (resolved.target.kind === "route") {
      expect(parseHash(resolved.target.href)).toEqual({
        name: "solution",
        projectId: DEMO_PROJECT_ID,
        query: {},
      });
    }
    expect(resolved.basis).toContain("sourceBoqRef boq-0042");
    expect(resolved.basis).toContain("no row-level trace join is recorded");
  });

  test("the demo lens rows render the honest unresolved bridge (no fabricated trace)", () => {
    const lens = demoLensInput(DEMO_PROJECT_ID);
    const boqImport = demoBoqImport(DEMO_PROJECT_ID);
    expect(lens).not.toBeNull();
    expect(boqImport).not.toBeNull();
    const row = lens!.items[0]!;
    const link = boqLensLineToSolutionTraceCrossLink(
      DEMO_PROJECT_ID,
      row,
      boqImport,
      null,
    );
    expect(link.target.kind).toBe("unresolved");
    if (link.target.kind === "unresolved") {
      expect(link.target.reason).toContain("never fabricated");
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3–7. THE COMPOSED GOLDEN JOURNEY (the seeded fixture)                */
/* ------------------------------------------------------------------ */

/** The committed corpus operation identities (the contract's own fixtures). */
const DEMOLITION_ID =
  "78be478643fcbb4aad1ba5e9165ab3382199c9165770f50b83a58c431096f2f9";
const BLOCK_WALL_ID =
  "281417008f64faec1343a222213785066c6d480c1ef07b67120d73bd89d903ea";
const PLASTER_ID =
  "84edfbc5221e39787e698800e9847b3fc87c2b83fd1e67d7e4d162265e25045e";

async function journeyOf(mode: "mixed" | "direct" | "agent" = "mixed") {
  return runComposedJourney(seededJourneyWorld(), mode);
}

describe("PROD-026 the composed golden journey (the twelve steps over the seeded fixture)", () => {
  test("the journey records EXACTLY the twelve steps covering every §3 leg", async () => {
    const { record } = await journeyOf();
    expect(record.steps.length).toBe(12);
    expect(record.steps.map((step) => step.leg)).toEqual([
      "open-reality",
      "select-problem",
      "create-solution",
      "manipulate",
      "manipulate",
      "manipulate",
      "step-through",
      "validate",
      "generate-boq",
      "click-boq-line",
      "jump-and-inspect",
      "save-revise",
    ]);
    expect(record.steps.map((step) => step.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  test("steps 4–6 record the typed operations with the COMMITTED corpus identities", async () => {
    const { record } = await journeyOf();
    const operations = record.steps.filter((step) => step.leg === "manipulate");
    expect(operations.map((step) => step.operation?.operationId)).toEqual([
      DEMOLITION_ID,
      BLOCK_WALL_ID,
      PLASTER_ID,
    ]);
    expect(operations.map((step) => step.operation?.operationType)).toEqual([
      "demolition-removal",
      "block-wall-placement",
      "plaster-application",
    ]);
    expect(operations.map((step) => step.operation?.origin)).toEqual([
      "direct-manipulation",
      "agent",
      "agent",
    ]);
    // the typed parameters, verbatim from the engine's records
    expect(operations[0]!.operation!.parameters).toEqual([
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 2.4, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
    ]);
    expect(operations[1]!.operation!.parameters).toEqual([
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 1, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
      { name: "material", value: "concrete-block" },
    ]);
    expect(operations[2]!.operation!.parameters).toEqual([
      { name: "thickness", value: 30, unit: "mm" },
      { name: "material", value: "cement-plaster" },
    ]);
    // the read-only reality anchors
    expect(operations[0]!.operation!.target.geometryRefs).toEqual([
      { kind: "polygon", ref: "geo-wall-faces-002" },
    ]);
    expect(operations[1]!.operation!.target.geometryRefs).toEqual([
      { kind: "plane", ref: "geo-wall-line-003" },
    ]);
    // the agent-authored steps carry the exact command text
    expect(operations[1]!.operation!.commandText).toBe("Rebuild the damaged wall with blocks.");
    expect(operations[2]!.operation!.commandText).toBe(
      "Apply 30 mm plaster to the affected wall faces.",
    );
  });

  test("every consequential step records its engine state transition (ids + digests)", async () => {
    const { record } = await journeyOf();
    const transitions = record.steps
      .filter((step) => step.stateTransition !== undefined)
      .map((step) => step.stateTransition!);
    expect(transitions.length).toBe(7); // create + 3 operations + step-through + jump + revise
    for (const transition of transitions) {
      expect(transition.toStateId).toMatch(/^[0-9a-f]{64}$/);
      expect(transition.toStateDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(transition.toStateIndex).toBeGreaterThanOrEqual(0);
    }
    // the layer chain: 0 (baseline) → 1 (demolition) → 2 (block wall) → 3 (plaster)
    expect(transitions.slice(0, 4).map((transition) => transition.toStateIndex)).toEqual([0, 1, 2, 3]);
    // the create-solution step starts from nothing (layer 0, the baseline overlay)
    expect(transitions[0]!.fromStateId).toBeNull();
    // each applied operation's resulting layer follows the prior layer
    expect(transitions[1]!.fromStateId).toBe(transitions[0]!.toStateId);
    expect(transitions[2]!.fromStateId).toBe(transitions[1]!.toStateId);
    expect(transitions[3]!.fromStateId).toBe(transitions[2]!.toStateId);
  });

  test("step 8 records the deterministic validation snapshot (7 checks, engine-pinned)", async () => {
    const { record } = await journeyOf();
    const validation = record.steps.find((step) => step.leg === "validate")!.validation!;
    expect(validation.outcome).toBe("pass");
    expect(validation.checkSummary).toEqual([
      { checkId: "operation.contract-invariants", result: "pass" },
      { checkId: "geometry.dimensions-positive", result: "pass" },
      { checkId: "units.quantity-units-typed", result: "pass" },
      { checkId: "operation.ordering-dependencies", result: "pass" },
      { checkId: "quantities.calculation-refs", result: "pass" },
      { checkId: "operation.capability-declared", result: "pass" },
      { checkId: "operation.phase1-limits", result: "pass" },
    ]);
    expect(validation.engine).toEqual({ kind: "aise-solution-engine", version: "1.0.0" });
    expect(validation.snapshotId).toMatch(/^[0-9a-f]{64}$/);
    expect(validation.inputDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("step 9 records the generated solution BOQ with the engine's own quantities", async () => {
    const { record } = await journeyOf();
    const boq = record.steps.find((step) => step.leg === "generate-boq")!.boq!;
    expect(boq.lineCount).toBe(7);
    expect(boq.lines.map((line) => `${line.quantity.value} ${line.quantity.unit}`)).toEqual([
      "12 m2",
      "1.2 m3",
      "5 m2",
      "0.5 m3",
      "65 count",
      "12.5 m2",
      "0.375 m3",
    ]);
    // every line's quantity cites the engine's versioned calculation reference
    for (const line of boq.lines) {
      expect(line.quantity.calculationRef.startsWith("aise-solution-engine/quantity/")).toBe(true);
      expect(line.quantity.calculationRef.endsWith("/v1")).toBe(true);
      expect(line.traceId).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(
      boq.lines.map((line) => line.quantity.calculationRef).filter((ref, index, all) => all.indexOf(ref) === index),
    ).toEqual([
      "aise-solution-engine/quantity/demolition-removal/v1",
      "aise-solution-engine/quantity/block-wall-placement/v1",
      "aise-solution-engine/quantity/plaster-application/v1",
    ]);
    // the contributions carry the contributing steps with resulting state refs
    const plasterVolume = boq.lines.find(
      (line) => line.quantity.dimension === "volume" && line.quantity.value === 0.375,
    )!;
    expect(plasterVolume.contributingSteps).toEqual([
      {
        operationId: PLASTER_ID,
        operationIndex: 3,
        contributionKind: "created",
        resultingStateRef: plasterVolume.contributingSteps[0]!.resultingStateRef,
      },
    ]);
    expect(plasterVolume.contributingSteps[0]!.resultingStateRef).toMatch(/^[0-9a-f]{64}$/);
    expect(plasterVolume.geometryRefs).toEqual([{ kind: "polygon", ref: "geo-wall-faces-002" }]);
    expect(boq.verification.ok).toBe(true);
    expect(boq.assumptions).toEqual([]);
  });

  test("steps 10–11: the clicked BOQ line jumps to the corresponding solution step/geometry", async () => {
    const { record } = await journeyOf();
    const click = record.steps.find((step) => step.leg === "click-boq-line")!;
    const jump = record.steps.find((step) => step.leg === "jump-and-inspect")!;
    expect(click.boqLineClick!.boqLineId).toBe(
      record.boq.lines[record.boq.lines.length - 1]!.boqLineId,
    );
    expect(click.boqLineClick!.resolvedSteps).toEqual([
      { operationId: PLASTER_ID, operationIndex: 3, contributionKind: "created" },
    ]);
    expect(click.boqLineClick!.geometryRefs).toEqual([
      { kind: "polygon", ref: "geo-wall-faces-002" },
    ]);
    // the jump lands on the contributing operation + its engine state
    expect(jump.operation!.operationId).toBe(PLASTER_ID);
    expect(jump.operation!.operationIndex).toBe(3);
    expect(jump.stateTransition!.toStateIndex).toBe(3);
    // the deep link round-trips the app's ONE router
    const jumpHref = jump.links![0]!.href;
    const parsed = parseHash(jumpHref);
    expect(parsed).toEqual({
      name: "solution",
      projectId: PROJECT,
      query: {
        case: DEMO_SOLUTION_WORLD.caseId,
        boqLine: click.boqLineClick!.boqLineId,
        step: 3,
      },
    });
    expect(formatRoute(parsed)).toBe(jumpHref);
  });

  test("the reverse navigation: the jumped operation reveals its generated lines (bidirectional)", async () => {
    const { boq } = await journeyOf();
    const lines = resolveLinesForOperation(boq.traceSet, PLASTER_ID);
    expect(lines!.length).toBe(2);
    expect(lines!.every((line) => line.quantity.value === 12.5 || line.quantity.value === 0.375)).toBe(true);
  });

  test("step 12 (save/revise) produces a NEW version, preserves v1, and re-derives the revised BOQ", async () => {
    const { record } = await journeyOf();
    const revise = record.steps.find((step) => step.leg === "save-revise")!;
    expect(record.versions.length).toBe(2);
    expect(record.versions[0]!.operationIds).toEqual([DEMOLITION_ID, BLOCK_WALL_ID, PLASTER_ID]);
    expect(record.versions[0]!.status).toBe("draft");
    // v2 keeps the block wall + plaster (rebuilt at the new version context — new identities)
    expect(record.versions[1]!.operationIds.length).toBe(2);
    expect(record.versions[1]!.operationIds).not.toContain(DEMOLITION_ID);
    expect(revise.validation!.outcome).toBe("pass");
    expect(revise.boq!.lineCount).toBe(5);
    expect(revise.boq!.lines.map((line) => `${line.quantity.value} ${line.quantity.unit}`)).toEqual([
      "5 m2",
      "0.5 m3",
      "65 count",
      "12.5 m2",
      "0.375 m3",
    ]);
    // the revised state is a NEW engine state (not v1's final state)
    expect(revise.stateTransition!.versionNumber).toBe(2);
    expect(revise.stateTransition!.toStateId).not.toBe(
      record.steps.find((step) => step.leg === "step-through")!.stateTransition!.toStateId,
    );
  });

  test("the composition's cross-surface map routes through the app's ONE router", async () => {
    const { record } = await journeyOf();
    expect(record.crossSurfaceLinks.length).toBe(4);
    // the first three links target the solution surface; the fourth is the
    // distinct source-BOQ surface (the never-overwrite distinction)
    const routeNames = record.crossSurfaceLinks.map((link) => parseHash(link.href).name);
    expect(routeNames).toEqual(["solution", "solution", "solution", "boq-lens"]);
    for (const link of record.crossSurfaceLinks) {
      const parsed = parseHash(link.href);
      if (parsed.name === "solution" || parsed.name === "boq-lens") {
        expect(parsed.projectId).toBe(PROJECT);
      }
    }
    const caseLink = record.crossSurfaceLinks[0]!;
    expect(parseHash(caseLink.href)).toEqual({
      name: "solution",
      projectId: PROJECT,
      query: { case: DEMO_SOLUTION_WORLD.caseId },
    });
    const boqLineLink = record.crossSurfaceLinks[2]!;
    expect(parseHash(boqLineLink.href)).toEqual({
      name: "solution",
      projectId: PROJECT,
      query: {
        boqLine: record.boq.lines[record.boq.lines.length - 1]!.boqLineId,
        step: 3,
      },
    });
    expect(parseHash(record.crossSurfaceLinks[3]!.href)).toEqual({
      name: "boq-lens",
      projectId: PROJECT,
    });
  });
});

/* ------------------------------------------------------------------ */
/* 4. The equivalence (agent-path vs direct-path)                       */
/* ------------------------------------------------------------------ */

describe("PROD-026 agent/direct-manipulation equivalence (one operation semantics)", () => {
  test("the same journey authored entirely through agent commands produces IDENTICAL operation identities", async () => {
    const direct = await journeyOf("direct");
    const agent = await journeyOf("agent");
    const directV1 = direct.record.operationIdentities.filter((entry) => entry.versionNumber === 1);
    const agentV1 = agent.record.operationIdentities.filter((entry) => entry.versionNumber === 1);
    expect(agentV1.map((entry) => entry.operationId)).toEqual(
      directV1.map((entry) => entry.operationId),
    );
    expect(agentV1.map((entry) => entry.operationId)).toEqual([
      DEMOLITION_ID,
      BLOCK_WALL_ID,
      PLASTER_ID,
    ]);
    // the provenance differs (attribution is not semantics) — the origins flip
    expect(directV1.every((entry) => entry.origin === "direct-manipulation")).toBe(true);
    expect(agentV1.every((entry) => entry.origin === "agent")).toBe(true);
    // ALL versions (including the revision's rebuilt operations) are identical
    expect(agent.record.operationIdentities.map((entry) => entry.operationId)).toEqual(
      direct.record.operationIdentities.map((entry) => entry.operationId),
    );
  });

  test("the agent and direct variants produce identical states, digests, check outcomes and BOQ VALUES", async () => {
    const direct = await journeyOf("direct");
    const agent = await journeyOf("agent");
    expect(agent.record.versions.map((version) => version.stateIds)).toEqual(
      direct.record.versions.map((version) => version.stateIds),
    );
    expect(agent.record.versions.map((version) => version.finalStateDigest)).toEqual(
      direct.record.versions.map((version) => version.finalStateDigest),
    );
    // the deterministic CHECKS are identical (same semantics, same engine);
    // the snapshot IDS differ because a snapshot certifies the version's
    // exact bytes — provenance included — so each variant's certification
    // is its own (the honest contract behavior, never a collision)
    const agentValidation = agent.record.steps.find((step) => step.leg === "validate")!.validation!;
    const directValidation = direct.record.steps.find((step) => step.leg === "validate")!.validation!;
    expect(agentValidation.checkSummary).toEqual(directValidation.checkSummary);
    expect(agentValidation.outcome).toBe(directValidation.outcome);
    expect(agentValidation.engine).toEqual(directValidation.engine);
    expect(agentValidation.snapshotId).not.toBe(directValidation.snapshotId);
    expect(
      agent.record.boq.lines.map((line) => `${line.quantity.value} ${line.quantity.unit}`),
    ).toEqual(direct.record.boq.lines.map((line) => `${line.quantity.value} ${line.quantity.unit}`));
    // the LINE identities are identical (attribution is not semantics — the
    // line identity excludes provenance) while the DOCUMENT identity differs
    // (the BOQ is version-pinned through the snapshot, which certifies the
    // version's exact bytes — provenance included)
    expect(agent.record.boq.lines.map((line) => line.boqLineId)).toEqual(
      direct.record.boq.lines.map((line) => line.boqLineId),
    );
    expect(agent.record.boq.boqId).not.toBe(direct.record.boq.boqId);
    expect(agent.record.journeyId).not.toBe(direct.record.journeyId); // the record includes PROVENANCE (origin) — the record differs, the operations do not
  });

  test("the recorded mixed journey's identities are the SAME three (the corpus world)", async () => {
    const mixed = await journeyOf("mixed");
    expect(
      mixed.record.operationIdentities
        .filter((entry) => entry.versionNumber === 1)
        .map((entry) => entry.operationId),
    ).toEqual([DEMOLITION_ID, BLOCK_WALL_ID, PLASTER_ID]);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Deterministic replay                                              */
/* ------------------------------------------------------------------ */

describe("PROD-026 deterministic replay (the PROD-022 doctrine, end to end)", () => {
  test("two full runs produce byte-identical canonical records (identical journey ids)", async () => {
    const first = await journeyOf();
    const second = await journeyOf();
    expect(second.record.journeyId).toBe(first.record.journeyId);
    expect(canonicalJsonStringify(second.record)).toBe(canonicalJsonStringify(first.record));
    expect(second.record.steps.map((step) => step.stateTransition?.toStateId)).toEqual(
      first.record.steps.map((step) => step.stateTransition?.toStateId),
    );
    expect(second.record.boq.boqId).toBe(first.record.boq.boqId);
    expect(second.record.revisedBoq!.boqId).toBe(first.record.revisedBoq!.boqId);
  });

  test("the cached surface resource is the same record (one composition per process)", async () => {
    const resource = await seededJourneyResource();
    const fresh = await journeyOf();
    expect(resource.record.journeyId).toBe(fresh.record.journeyId);
  });
});

/* ------------------------------------------------------------------ */
/* 6. The reality seal (mutation protection at the composition level)   */
/* ------------------------------------------------------------------ */

describe("PROD-026 the authoritative-reality seal (byte-identity across the journey)", () => {
  test("the seal echo: the observed scene is byte-identical and every proposed state is sealed PROPOSED", async () => {
    const { record } = await journeyOf();
    expect(record.seal.observedSceneDigestBefore).toBe(record.seal.observedSceneDigestAfter);
    expect(record.seal.everyStateSealedProposed).toBe(true);
    expect(record.seal.sealedStateCount).toBe(7); // v1: 4 layers, v2: 3 layers
    expect(record.seal.pinnedRealityVersionId).toBe(DEMO_SOLUTION_WORLD.baselineRealityVersionId);
  });

  test("the committed engine baseline fixture is byte-identical before and after the full journey", async () => {
    const fixturePath = resolve(
      import.meta.dir,
      "../../../../packages/solution-engine/fixtures/baseline-geometry.json",
    );
    const before = readFileSync(fixturePath, "utf8");
    await journeyOf(); // the full journey including validate, BOQ derivation and the save/revise leg
    const after = readFileSync(fixturePath, "utf8");
    expect(after).toBe(before);
    // the demo world's anchored surface fact is the engine's committed value
    expect(JSON.parse(before)["geo-wall-faces-002"]).toEqual({ value: 12.5, unit: "m2" });
  });

  test("the observed scene object is deep-equal before and after (read-only display data)", async () => {
    const world = seededJourneyWorld();
    const sceneBefore = structuredClone(world.scene);
    await runComposedJourney(world, "mixed");
    expect(world.scene).toEqual(sceneBefore);
  });
});

/* ------------------------------------------------------------------ */
/* 8. The surface (the mounted workspace entry + the honest states)     */
/* ------------------------------------------------------------------ */

describe("PROD-026 the Solution surface (the integration station)", () => {
  test("the engine executes in this runtime (the probe that guards the mount)", () => {
    expect(solutionEngineExecutable()).toBe(true);
  });

  test("the composed surface renders the workspace mount + the trace panel + the journey record", async () => {
    const composed = await seededJourneyResource();
    const html = renderToStaticMarkup(
      <ComposedSolutionBody
        projectId={PROJECT}
        query={{}}
        composed={composed}
      />,
    );
    // the PROD-024 workspace entry is mounted (its own landmark + pins)
    expect(html).toContain('id="solution-workspace"');
    expect(html).toContain(`data-solution-id="${DEMO_SOLUTION_WORLD.solutionId}"`);
    expect(html).toContain(`data-baseline-reality-version="${DEMO_SOLUTION_WORLD.baselineRealityVersionId}"`);
    // the guarded BOQ seam: the recorded trace set renders in the workspace's pane
    expect(html).toContain('id="solution-boq"');
    expect(html).toContain("Generated solution BOQ — version 1");
    // the recorded journey + the trace panel + the inbound links
    expect(html).toContain('id="solution-journey-steps"');
    expect(html).toContain('id="solution-boq-trace-panel"');
    expect(html).toContain('id="solution-inbound-links"');
    expect(html).toContain("The recorded journey (the §3 golden journey)");
    expect(html).toContain("12 steps");
    // the LIVE agent mount (PROD-031): the composed surface binds the
    // workspace's agent seam to the HTTP solution-agent port — the panel
    // renders the wired "ready" state (the honest not-connected panel is
    // now only the ABSENT-seam state, proven by the workspace module's own
    // tests)
    expect(html).toContain('id="solution-agent"');
    expect(html).toContain('data-agent-status="ready"');
  });

  test("the deep-linked boq-line selection renders the line's full trace + the step jump", async () => {
    const composed = await seededJourneyResource();
    const clicked = composed.record.boq.lines[composed.record.boq.lines.length - 1]!;
    const html = renderToStaticMarkup(
      <ComposedSolutionBody
        projectId={PROJECT}
        query={{ boqLine: clicked.boqLineId, step: 3, case: DEMO_SOLUTION_WORLD.caseId }}
        composed={composed}
      />,
    );
    expect(html).toContain(`data-selected-line="${clicked.boqLineId}"`);
    expect(html).toContain("Trace of");
    expect(html).toContain("the deep-linked solution step is");
    expect(html).toContain("<strong>step 3</strong>");
    expect(html).toContain(clicked.quantity.calculationRef);
  });

  test("an unknown boq-line deep link renders the honest unknown-line state (never re-keyed)", async () => {
    const composed = await seededJourneyResource();
    const html = renderToStaticMarkup(
      <ComposedSolutionBody projectId={PROJECT} query={{ boqLine: "not-a-line" }} composed={composed} />,
    );
    expect(html).toContain('data-boq-line-state="unknown"');
    expect(html).toContain("No generated line answers this deep link");
  });

  test("a mismatched case deep link renders the honest pin notice", async () => {
    const composed = await seededJourneyResource();
    const html = renderToStaticMarkup(
      <ComposedSolutionBody projectId={PROJECT} query={{ case: "case-other" }} composed={composed} />,
    );
    expect(html).toContain('data-case-pin="mismatch"');
  });

  test("the trace panel alone renders the generated lines with their step links", async () => {
    const composed = await seededJourneyResource();
    const html = renderToStaticMarkup(
      <SolutionBoqTracePanel
        projectId={PROJECT}
        boq={composed.record.boq}
        selectedLineId={undefined}
        addressedStep={undefined}
      />,
    );
    expect(html).toContain(composed.record.boq.lines[0]!.itemDescription);
    expect(html).toContain(`data-boq-line-id="${composed.record.boq.lines[0]!.boqLineId}"`);
    expect((html.match(/data-boq-line-id="/g) ?? []).length).toBe(composed.record.boq.lineCount);
  });

  test("a project without the recorded world renders the genuine empty state (never borrowed data)", () => {
    const html = renderToStaticMarkup(<SolutionWorldEmptyState projectId={DEMO_PROJECT_ID} />);
    expect(html).toContain("This project holds no recorded interactive-solution world");
    expect(html).toContain(formatRoute({ name: "solution", projectId: PROJECT, query: {} }));
  });

  test("the engine-unavailable panel renders the honest degraded composition", () => {
    const html = renderToStaticMarkup(
      <SolutionEngineUnavailablePanel
        reason="the engine cannot execute in this runtime"
        world={{
          projectId: PROJECT,
          caseId: DEMO_SOLUTION_WORLD.caseId,
          solutionId: DEMO_SOLUTION_WORLD.solutionId,
          title: DEMO_SOLUTION_WORLD.title,
          problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
          baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
        }}
        observedFacts={demoSolutionObservedFacts()}
      />,
    );
    expect(html).toContain('data-engine-available="false"');
    expect(html).toContain("The deterministic solution engine is unavailable here");
    expect(html).toContain("Damaged ground-floor wall faces");
    expect(html).toContain("12.5 m2");
  });

  test("the browser-safe world-pin mirrors equal the solution module's own constants (no drift)", () => {
    expect({ ...DEMO_SOLUTION_WORLD_PINS }).toEqual({
      projectId: DEMO_SOLUTION_WORLD.projectId,
      caseId: DEMO_SOLUTION_WORLD.caseId,
      solutionId: DEMO_SOLUTION_WORLD.solutionId,
      title: DEMO_SOLUTION_WORLD.title,
      problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
      baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
    });
    const observed = demoObservedScene();
    const facts = demoSolutionObservedFacts();
    expect(facts.length).toBe(observed.elements.length);
    for (const mirror of facts) {
      const element = observed.elements.find((entry) => entry.elementId === mirror.elementId)!;
      expect(mirror.label).toBe(element.label);
      expect(mirror.facts).toEqual(element.facts.map((fact) => ({ ...fact })));
    }
  });

  test("the full surface renders (first paint: the composing state before the lazy mount resolves)", () => {
    const html = renderToStaticMarkup(
      <SolutionSurface projectId={PROJECT} query={{}} />,
    );
    // the surface nav + the composing panel (the record resolves in a microtask)
    expect(html).toContain('aria-label="Project surfaces"');
    expect(html).toContain("Composing the recorded reference journey");
  });

  test("the full surface renders the honest empty state for a project without the world", () => {
    const html = renderToStaticMarkup(
      <SolutionSurface projectId={DEMO_PROJECT_ID} query={{}} />,
    );
    expect(html).toContain("This project holds no recorded interactive-solution world");
  });
});

/* ------------------------------------------------------------------ */
/* The record's canonical serializability (the benchmark substrate)     */
/* ------------------------------------------------------------------ */

describe("PROD-026 the journey record (canonical, deterministic)", () => {
  test("the record canonicalizes byte-stably (the digest re-derives)", async () => {
    const { record } = await journeyOf();
    const canonical = canonicalJsonStringify(record);
    expect(JSON.parse(canonical).journeyId).toBe(record.journeyId);
    expect(canonicalJsonStringify(JSON.parse(canonical))).toBe(canonical);
  });

  test("the record echoes the world pins verbatim", async () => {
    const { record } = await journeyOf();
    expect(record.world).toEqual({
      projectId: DEMO_SOLUTION_WORLD.projectId,
      caseId: DEMO_SOLUTION_WORLD.caseId,
      solutionId: DEMO_SOLUTION_WORLD.solutionId,
      title: DEMO_SOLUTION_WORLD.title,
      problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
      baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
    });
    expect(record.mode).toBe("mixed");
    expect(record.journeyKind).toBe("aise-composed-solution-journey");
    expect(record.journeyVersion).toBe("1.0.0");
  });
});
