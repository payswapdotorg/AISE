/**
 * AISE-029 test kit — deterministic fixture builders for the reasoning
 * tests (house style: colocated, no I/O, no wall clock, no randomness).
 *
 * THE SYNTHETIC GROUNDED STOREY is the canonical fixture, exactly as the
 * work order prescribes: one storey snapshot (project hierarchy with two
 * measured walls and a floor), two evidence records (one carrying a σ
 * measurement, one INVALIDATED), two verification findings, and one
 * engineering case with an observation and a hypothesis.
 *
 * Evidence ids are readable short strings, NOT 64-hex content addresses:
 * the gateway checks membership/verbatim-resolution only (form validation
 * of evidence ids is the Evidence authority's write-time duty — the
 * documented AISE-023 boundary).
 *
 * The SCRIPTED PROVIDER records every query it receives (dispatch
 * assertions) and plays a deterministic script of completions, failures or
 * thrown exceptions — the untrusted-provider surface the gateway's
 * post-validation is tested against.
 */

import type { EpistemicStatus } from "@aise/shared-contracts";
import type { NodeKind, ProvenanceRecord, RelKind } from "../reality/model";
import type { Relationship } from "./model";
import type { ProviderKind } from "./model";
import type { ReasoningPolicy } from "./policy";
import {
  DEFAULT_REASONING_POLICY,
} from "./policy";
import type {
  GroundedCase,
  GroundedContext,
  GroundedEvidenceRecord,
  GroundedNode,
  GroundedProperty,
  ProviderCompletion,
  ReasoningProvider,
  ReasoningQuery,
} from "./model";

export const FIXTURE_INSTANT = "2026-01-01T00:00:00Z";

/* ------------------------------------------------------------------ */
/* Node / property / relationship builders                              */
/* ------------------------------------------------------------------ */

function derivationProvenance(): ProvenanceRecord[] {
  return [{ role: "DERIVED_FROM", derivationNote: "test fixture", recordedAt: FIXTURE_INSTANT }];
}

function supportsProvenance(evidenceId: string): ProvenanceRecord[] {
  return [{ role: "SUPPORTS", evidenceId, recordedAt: FIXTURE_INSTANT }];
}

export function gprop(
  key: string,
  value: string | number | boolean,
  options?: {
    readonly unit?: string;
    readonly sigma?: number;
    readonly epistemicStatus?: EpistemicStatus;
    readonly evidenceId?: string;
  },
): GroundedProperty {
  return {
    key,
    value,
    ...(options?.unit !== undefined ? { unit: options.unit } : {}),
    epistemicStatus: options?.epistemicStatus ?? "OBSERVED",
    provenance:
      options?.evidenceId !== undefined
        ? supportsProvenance(options.evidenceId)
        : derivationProvenance(),
    ...(options?.sigma !== undefined ? { uncertainty: { sigma: options.sigma } } : {}),
  };
}

export function gnode(
  nodeId: string,
  kind: NodeKind,
  epistemicStatus: EpistemicStatus,
  properties: readonly GroundedProperty[],
): GroundedNode {
  return { nodeId, kind, epistemicStatus, properties, provenance: derivationProvenance() };
}

export function grel(relationshipId: string, kind: RelKind, fromNodeId: string, toNodeId: string): Relationship {
  return { relationshipId, kind, fromNodeId, toNodeId, provenance: derivationProvenance() };
}

/* ------------------------------------------------------------------ */
/* The synthetic grounded storey                                        */
/* ------------------------------------------------------------------ */

export const EV_NORTH_DEPTH = "ev-wall-north-depth";
export const EV_EAST_MANUAL = "ev-wall-east-manual";

/**
 * The canonical fixture. Property → evidence wiring:
 *   wall-north.width → ev-wall-north-depth (VALID, σ 0.01 m)
 *   wall-east.height → ev-wall-east-manual (INVALIDATED, σ 0.02 m —
 *   unusable as grounding, exactly the R7 discipline)
 */
export function groundedStoreyContext(): GroundedContext {
  const nodes: readonly GroundedNode[] = [
    gnode("node-storey-1", "storey", "CONFIRMED", [
      gprop("label", "Ground floor", { epistemicStatus: "CONFIRMED" }),
    ]),
    gnode("node-space-living", "space", "CONFIRMED", [
      gprop("label", "Living room", { epistemicStatus: "CONFIRMED" }),
    ]),
    gnode("node-wall-north", "element", "OBSERVED", [
      gprop("label", "Wall North"),
      gprop("width", 4.2, { unit: "m", sigma: 0.01, evidenceId: EV_NORTH_DEPTH }),
    ]),
    gnode("node-wall-east", "element", "OBSERVED", [
      gprop("label", "Wall East"),
      gprop("height", 2.7, { unit: "m", evidenceId: EV_EAST_MANUAL }),
    ]),
    gnode("node-floor-1", "element", "OBSERVED", [
      gprop("label", "Floor"),
      gprop("area", 24.5, { unit: "m2", sigma: 0.05, epistemicStatus: "CONFIRMED" }),
    ]),
  ];
  const relationships: readonly Relationship[] = [
    grel("rel-contains-space", "contains", "node-storey-1", "node-space-living"),
    grel("rel-contains-wall-north", "contains", "node-space-living", "node-wall-north"),
    grel("rel-contains-wall-east", "contains", "node-space-living", "node-wall-east"),
    grel("rel-contains-floor", "contains", "node-space-living", "node-floor-1"),
  ];
  const evidenceRecords: readonly GroundedEvidenceRecord[] = [
    {
      contentId: EV_NORTH_DEPTH,
      method: "DEPTH_SENSING",
      capturedAt: FIXTURE_INSTANT,
      invalidated: false,
      linkedNodeIds: ["node-wall-north"],
      measurement: { value: 4.2, unit: "m", sigma: 0.01 },
    },
    {
      contentId: EV_EAST_MANUAL,
      method: "MANUAL_MEASUREMENT",
      capturedAt: FIXTURE_INSTANT,
      invalidated: true,
      invalidationReason: "superseded by re-measurement",
      linkedNodeIds: ["node-wall-east"],
      measurement: { value: 2.7, unit: "m", sigma: 0.02 },
    },
  ];
  const verificationFindings = [
    {
      code: "INVALIDATED_EVIDENCE_LINKED",
      severity: "error",
      subjectNodeIds: ["node-wall-east"],
      message:
        "property 'height' of node 'node-wall-east' cites invalidated evidence 'ev-wall-east-manual'",
    },
    {
      code: "UNCERTAIN_NUMERIC_WITHOUT_SIGMA",
      severity: "warning",
      subjectNodeIds: ["node-wall-east"],
      message: "numeric property 'height' of node 'node-wall-east' (OBSERVED) declares no 1σ",
    },
  ] as const;
  const cases: readonly GroundedCase[] = [
    {
      caseId: "case-crack-1",
      observations: [
        {
          observationId: "obs-crack-1",
          statement: "Hairline cracking observed on the Wall North plaster face.",
          epistemicStatus: "OBSERVED",
          recordedAt: FIXTURE_INSTANT,
          evidenceIds: [EV_NORTH_DEPTH],
        },
      ],
      hypotheses: [
        {
          hypothesisId: "hyp-settle-1",
          statement:
            "Differential settlement of the Wall North foundation is causing the cracking.",
          epistemicStatus: "PROPOSED",
          supportingObservationIds: ["obs-crack-1"],
          contradictingObservationIds: [],
          confidence: "medium",
          recordedAt: FIXTURE_INSTANT,
        },
      ],
    },
  ];
  return {
    graphSnapshot: { nodes, relationships },
    evidenceRecords,
    verificationFindings,
    cases,
    rules: [
      "Structural safety conclusions require review by a chartered structural engineer before reliance.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Queries                                                              */
/* ------------------------------------------------------------------ */

export const WIDTH_QUESTION = "What is the width of Wall North?";
export const HEIGHT_QUESTION = "What is the height of Wall East?";
export const FINDINGS_QUESTION = "What verification findings exist for Wall East?";
export const CASE_QUESTION = "What was observed in case case-crack-1?";
export const UNGROUNDED_QUESTION = "What is the melting point of the Eiffel Tower?";
export const MATERIAL_QUESTION = "What is the material of Wall North?";
export const AREA_ON_WALL_QUESTION = "What is the area of Wall North?";

/** A fresh default policy (never the shared const, so tests can mutate). */
export function defaultPolicy(): ReasoningPolicy {
  return { ...DEFAULT_REASONING_POLICY };
}

/** Build a query over the synthetic storey by default. */
export function makeQuery(options: {
  readonly question: string;
  readonly context?: GroundedContext;
  readonly policy?: ReasoningPolicy;
  readonly queryId?: string;
}): ReasoningQuery {
  return {
    queryId: options.queryId ?? "query-test-1",
    question: options.question,
    context: options.context ?? groundedStoreyContext(),
    policy: options.policy ?? defaultPolicy(),
  };
}

/* ------------------------------------------------------------------ */
/* Clocks (injected — the tests never touch wall time)                  */
/* ------------------------------------------------------------------ */

/** A clock frozen at one instant (byte-determinism tests). */
export function constClock(instant: string = FIXTURE_INSTANT): () => string {
  return () => instant;
}

/** A clock advancing through instants (repeating the last one). */
export function sequenceClock(...instants: readonly string[]): () => string {
  let index = 0;
  return () => {
    const instant = instants[Math.min(index, instants.length - 1)];
    index += 1;
    return instant ?? FIXTURE_INSTANT;
  };
}

/* ------------------------------------------------------------------ */
/* The scripted provider (untrusted-provider surface for tests)         */
/* ------------------------------------------------------------------ */

export type ScriptedCompletion =
  | ProviderCompletion
  | { readonly kind: "throw"; readonly message: string };

export interface ScriptedProvider extends ReasoningProvider {
  /** Every query this provider received, in dispatch order. */
  readonly calls: readonly ReasoningQuery[];
}

/**
 * A provider that plays a deterministic script (completions, typed
 * failures or thrown exceptions — the last entry repeats). Claims in the
 * script are typed loosely on purpose: the gateway must treat provider
 * output as UNTRUSTED, and tests inject deliberately malformed claims.
 */
export function scriptedProvider(
  providerId: string,
  providerKind: ProviderKind,
  script: readonly ScriptedCompletion[],
): ScriptedProvider {
  const calls: ReasoningQuery[] = [];
  let index = 0;
  return {
    descriptor: { providerId, providerKind },
    calls,
    complete: async (query: ReasoningQuery): Promise<ProviderCompletion> => {
      calls.push(query);
      const entry = script[Math.min(index, script.length - 1)];
      index += 1;
      if (entry === undefined) {
        return { kind: "completed", claims: [], refusals: [] };
      }
      if (entry.kind === "throw") {
        throw new Error(entry.message);
      }
      return entry;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                                */
/* ------------------------------------------------------------------ */

/** Deterministic seeded shuffle (LCG) for order-insensitivity tests. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (1103515245 * state + 12345) >>> 0;
    const j = state % (i + 1);
    const swap = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = swap;
  }
  return copy;
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
