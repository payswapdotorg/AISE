/**
 * PROD-023 test kit — deterministic fixture builders for the solution
 * command compiler tests (house style: colocated, no I/O, no wall clock,
 * no randomness).
 *
 * THE DEMO SESSION is the canonical fixture: the wall / wall-faces /
 * pit-area foci mirror the contract's committed valid intent fixtures
 * (node-wall-002 / geo-wall-faces-002 / geo-wall-line-003 / node-site-001 /
 * geo-pit-outline-001) with the caller-known facts the compiler may seed
 * (the wall's length/height/thickness, the wall-faces' area), recent
 * excavation / demolition / plaster operations for delta and change
 * requests, and the solution attachment solution-demo-001 v1.
 *
 * The SCRIPTED UNDERSTANDING PORT records every enrichment request and
 * plays a deterministic script of slot assignments — the LLM-seam double
 * the compiler's enrichment guard is tested against (assignments that
 * invent values are deterministically ignored).
 */

import type { AgentSessionContext } from "./model";
import type { NlSlotResolutionRequest, NlUnderstandingPort } from "./model";
import type { RecentOperationSummary, SessionFocus } from "./model";

/** Fixed reference instants (mirroring the contract fixtures' clock). */
export const FIXTURE_INSTANT = "2026-09-16T09:05:00.000Z";
export const FIXTURE_INSTANT_LATER = "2026-09-16T10:00:00.000Z";

/** A clock frozen at one instant (byte-determinism tests). */
export function constClock(instant: string = FIXTURE_INSTANT): () => string {
  return () => instant;
}

/** Recursively freeze a value (purity tests: nothing may mutate inputs). */
export function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* The demo session foci                                                */
/* ------------------------------------------------------------------ */

/** The wall line focus (the contract block-wall fixture's target). */
export const WALL_FOCUS: SessionFocus = {
  focusId: "wall",
  label: "The wall line along the damaged section",
  aliases: [
    "this wall",
    "the wall section",
    "the damaged wall",
    "the wall line",
    "wall section",
    "the wall",
  ],
  selectorKind: "line-extent",
  nodeRefs: ["node-wall-002"],
  geometryRefs: [{ kind: "plane", ref: "geo-wall-line-003" }],
  knownParameters: [
    { name: "length", value: 5, unit: "m" },
    { name: "height", value: 2.4, unit: "m" },
    { name: "thickness", value: 0.1, unit: "m" },
  ],
};

/** The wall-faces focus (the contract plaster/finish fixtures' target). */
export const WALL_FACES_FOCUS: SessionFocus = {
  focusId: "wall-faces",
  label: "The affected ground-floor wall faces",
  aliases: [
    "affected wall faces",
    "ground-floor wall faces",
    "the wall faces",
    "damaged plaster",
    "the plaster",
  ],
  selectorKind: "face-set",
  nodeRefs: ["node-wall-002"],
  geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
  knownParameters: [
    { name: "length", value: 5, unit: "m" },
    { name: "height", value: 2.4, unit: "m" },
    { name: "area", value: 12, unit: "m2" },
  ],
};

/** The pit-area focus (the contract excavation fixture's target). */
export const PIT_AREA_FOCUS: SessionFocus = {
  focusId: "pit-area",
  label: "The pit excavation area south of the building footprint",
  aliases: [
    "the pit area",
    "south of the building",
    "the excavation area",
    "the pit",
  ],
  selectorKind: "volume",
  nodeRefs: ["node-site-001"],
  geometryRefs: [{ kind: "polygon", ref: "geo-pit-outline-001" }],
  knownParameters: [],
};

/* ------------------------------------------------------------------ */
/* Recent operations                                                    */
/* ------------------------------------------------------------------ */

/** The session's recent excavation (the delta base of the corpus). */
export const RECENT_EXCAVATION: RecentOperationSummary = {
  operationId: "op-excavation-001",
  operationType: "excavation",
  parameters: [
    { name: "depth", value: 1.5, unit: "m" },
    { name: "width", value: 2, unit: "m" },
    { name: "length", value: 3, unit: "m" },
  ],
};

/** The session's recent demolition (sequencing reference). */
export const RECENT_DEMOLITION: RecentOperationSummary = {
  operationId: "op-demolition-001",
  operationType: "demolition-removal",
  parameters: [
    { name: "length", value: 5, unit: "m" },
    { name: "height", value: 2.4, unit: "m" },
    { name: "thickness", value: 0.1, unit: "m" },
  ],
};

/** The session's recent plaster (material/layer change base). */
export const RECENT_PLASTER: RecentOperationSummary = {
  operationId: "op-plaster-001",
  operationType: "plaster-application",
  parameters: [
    { name: "thickness", value: 30, unit: "mm" },
    { name: "material", value: "cement-plaster" },
  ],
};

/* ------------------------------------------------------------------ */
/* The sessions                                                         */
/* ------------------------------------------------------------------ */

/** The canonical demo session (attached to solution-demo-001 v1). */
export function demoSessionContext(): AgentSessionContext {
  return {
    sessionId: "session-demo-001",
    agentId: "agent-demo-assistant",
    userId: "user-demo-engineer",
    proposedTo: { solutionId: "solution-demo-001", versionNumber: 1 },
    foci: [WALL_FACES_FOCUS, WALL_FOCUS, PIT_AREA_FOCUS],
    defaultFocusId: "pit-area",
    recentOperations: [RECENT_EXCAVATION, RECENT_DEMOLITION, RECENT_PLASTER],
  };
}

/** The bare session: no foci, no default, no recents, no attachment. */
export function bareSessionContext(): AgentSessionContext {
  return {
    sessionId: "session-bare-001",
    agentId: "agent-demo-assistant",
    userId: "user-demo-engineer",
  };
}

/** The session fixture of a corpus entry kind. */
export function sessionOf(kind: "demo" | "bare"): AgentSessionContext {
  return kind === "demo" ? demoSessionContext() : bareSessionContext();
}

/* ------------------------------------------------------------------ */
/* The scripted understanding port (the LLM-seam double)                */
/* ------------------------------------------------------------------ */

/** A recording NLU port double: captures requests, plays a script. */
export interface ScriptedUnderstandingPort extends NlUnderstandingPort {
  /** Every enrichment request the port received, in order. */
  readonly requests: readonly NlSlotResolutionRequest[];
}

/**
 * A deterministic understanding-port double that proposes a fixed script
 * of slot assignments on every request. Used to prove the enrichment
 * seam: accepted assignments mark the interpretation `provider-enriched`;
 * assignments that invent values or name ineligible slots are
 * deterministically ignored by the compiler.
 */
export function scriptedUnderstandingPort(
  assignments: readonly { slot: string; value: number; unit: string }[],
): ScriptedUnderstandingPort {
  const requests: NlSlotResolutionRequest[] = [];
  return {
    descriptor: {
      understandingId: "reasoning-scripted-understanding",
      kind: "llm-adapter",
    },
    requests,
    resolveSlotAssignments: async (request: NlSlotResolutionRequest) => {
      requests.push(request);
      return assignments.map((assignment) => ({ ...assignment }));
    },
  };
}
