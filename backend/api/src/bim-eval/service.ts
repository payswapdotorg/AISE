/**
 * HFX-204 — the BIM evaluation service (thin orchestration over the
 * harness + the committed fixture corpus — the reasoning-eval service
 * discipline).
 *
 * DETERMINISTIC and IN-MEMORY: no clock, no randomness, no I/O, NO
 * NETWORK (providers are never invoked by this module — the registry log
 * carries the adapter-submitted execution). Identical request sequences
 * produce identical response values. Every domain decision is made by the
 * HARNESS (harness.ts) over the control plane's pure validators and the
 * Layer-2 reasoning harness; this service owns only the corpus index and
 * the fail-closed request parsing (typed errors, never silent coercion).
 */

import { BimEvalError } from "./model";
import type { BimEditFixture, BimQuestionFixture, BimEvalLane } from "./model";
import { evaluateEditFixture, evaluateQuestionFixture } from "./harness";
import type { BimEditOutcome, BimQuestionOutcome } from "./harness";
import {
  bimEditOutcomeViewOf,
  bimEvalEditFixtures,
  bimEvalQuestionFixtures,
  bimEvalSuiteSummaryOf,
  bimQuestionOutcomeViewOf,
  registryLogForEditFixture,
  registryLogForQuestionFixture,
} from "./testkit";
import type { BimEvalOutcomeView, BimEvalSuiteSummary } from "./testkit";

/* ------------------------------------------------------------------ */
/* Request shapes (parsed fail-closed)                                  */
/* ------------------------------------------------------------------ */

/** The corpus listing request — optional lane filter. */
export interface CatalogRequest {
  readonly lane?: BimEvalLane;
}

/** The fixture-run request: run one corpus fixture by id. */
export interface FixtureRunRequest {
  readonly fixtureId: string;
}

/* ------------------------------------------------------------------ */
/* Response shapes                                                      */
/* ------------------------------------------------------------------ */

/** The corpus listing projection (presentation only). */
export interface FixtureSummary {
  readonly fixtureId: string;
  readonly lane: BimEvalLane;
  readonly fixtureClass: string;
  readonly commandForm?: string;
  readonly negativeCase?: string;
  readonly behavior: string;
  readonly expectedFailureKind: string;
}

/** The full corpus suite run response. */
export interface SuiteRunResponse {
  readonly questionOutcomes: readonly BimQuestionOutcome[];
  readonly editOutcomes: readonly BimEditOutcome[];
  readonly summary: BimEvalSuiteSummary;
}

/* ------------------------------------------------------------------ */
/* Boundary parsers (shape → typed errors)                              */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const LANES: readonly string[] = ["ifc-bench-questions", "bim-edit-operations"];

/** Parses the corpus listing request body (fail closed). */
export function parseCatalogRequest(payload: unknown): CatalogRequest {
  if (!isRecord(payload)) {
    throw new BimEvalError("invalid_request", "expected a JSON object body");
  }
  const lane = payload["lane"];
  if (lane === undefined) {
    return {};
  }
  if (typeof lane !== "string" || !LANES.includes(lane)) {
    throw new BimEvalError(
      "invalid_request",
      `lane, when present, must be one of [${LANES.join(", ")}]`,
    );
  }
  return { lane: lane as BimEvalLane };
}

/** Parses the fixture-run request body (fail closed). */
export function parseFixtureRunRequest(payload: unknown): FixtureRunRequest {
  if (!isRecord(payload)) {
    throw new BimEvalError("invalid_request", "expected a JSON object body");
  }
  const fixtureId = payload["fixtureId"];
  if (typeof fixtureId !== "string" || fixtureId.trim().length === 0) {
    throw new BimEvalError(
      "invalid_request",
      "fixtureId is required and must be a non-empty string",
    );
  }
  return { fixtureId };
}

/* ------------------------------------------------------------------ */
/* The service                                                          */
/* ------------------------------------------------------------------ */

/**
 * The BIM evaluation service: the committed corpus (default) or a
 * caller-supplied fixture list, evaluated through the two-lane harness.
 * Instantiate once per process; deterministic.
 */
export class BimEvalService {
  private readonly questionFixtures: readonly BimQuestionFixture[];
  private readonly editFixtures: readonly BimEditFixture[];
  private readonly byId: Map<string, BimQuestionFixture | BimEditFixture>;

  constructor(
    questionFixtures: readonly BimQuestionFixture[] = bimEvalQuestionFixtures(),
    editFixtures: readonly BimEditFixture[] = bimEvalEditFixtures(),
  ) {
    this.questionFixtures = [...questionFixtures];
    this.editFixtures = [...editFixtures];
    this.byId = new Map();
    for (const fixture of this.questionFixtures) {
      if (this.byId.has(fixture.fixtureId)) {
        throw new BimEvalError(
          "invalid_fixture",
          `duplicate fixture id '${fixture.fixtureId}' — fixture identity is unique`,
        );
      }
      this.byId.set(fixture.fixtureId, fixture);
    }
    for (const fixture of this.editFixtures) {
      if (this.byId.has(fixture.fixtureId)) {
        throw new BimEvalError(
          "invalid_fixture",
          `duplicate fixture id '${fixture.fixtureId}' — fixture identity is unique`,
        );
      }
      this.byId.set(fixture.fixtureId, fixture);
    }
  }

  /** Lists the corpus (optionally filtered by lane), sorted by fixture id. */
  listFixtures(request: CatalogRequest = {}): readonly FixtureSummary[] {
    const summaries: FixtureSummary[] = [];
    for (const fixture of this.questionFixtures) {
      if (request.lane !== undefined && request.lane !== "ifc-bench-questions") {
        continue;
      }
      summaries.push({
        fixtureId: fixture.fixtureId,
        lane: fixture.lane,
        fixtureClass: fixture.questionClass,
        ...(fixture.negativeCase === undefined ? {} : { negativeCase: fixture.negativeCase }),
        behavior: String(fixture.scenario.input.payload["behaviorTag"] ?? ""),
        expectedFailureKind: fixture.scenario.expected.expectedFailureKind,
      });
    }
    for (const fixture of this.editFixtures) {
      if (request.lane !== undefined && request.lane !== "bim-edit-operations") {
        continue;
      }
      summaries.push({
        fixtureId: fixture.fixtureId,
        lane: fixture.lane,
        fixtureClass: fixture.editClass,
        commandForm: fixture.commandForm,
        ...(fixture.negativeCase === undefined ? {} : { negativeCase: fixture.negativeCase }),
        behavior: fixture.behavior,
        expectedFailureKind: fixture.expected.expectedFailureKind,
      });
    }
    return summaries.sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));
  }

  /** Runs ONE corpus fixture through its lane's harness (unknown id → typed error). */
  runFixture(fixtureId: string): BimQuestionOutcome | BimEditOutcome {
    const fixture = this.byId.get(fixtureId);
    if (fixture === undefined) {
      throw new BimEvalError(
        "unknown_fixture",
        `no corpus fixture '${fixtureId}' — list the corpus via the catalog`,
      );
    }
    if (fixture.kind === "bim-question-fixture") {
      return evaluateQuestionFixture(fixture, registryLogForQuestionFixture(fixture));
    }
    return evaluateEditFixture(fixture, registryLogForEditFixture(fixture));
  }

  /** Runs the whole corpus (deterministic; the per-lane/per-kind summary). */
  runSuite(): SuiteRunResponse {
    const questionOutcomes = this.questionFixtures.map((fixture) =>
      evaluateQuestionFixture(fixture, registryLogForQuestionFixture(fixture)),
    );
    const editOutcomes = this.editFixtures.map((fixture) =>
      evaluateEditFixture(fixture, registryLogForEditFixture(fixture)),
    );
    const views: readonly BimEvalOutcomeView[] = [
      ...questionOutcomes.map((outcome) => bimQuestionOutcomeViewOf(outcome)),
      ...editOutcomes.map((outcome) => bimEditOutcomeViewOf(outcome)),
    ];
    return {
      questionOutcomes,
      editOutcomes,
      summary: bimEvalSuiteSummaryOf(views),
    };
  }
}
