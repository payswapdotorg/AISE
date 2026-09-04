/**
 * AISE-020 service-boundary suite: the intent engine composed
 * into the assurance service.
 *
 * Proves at the SERVICE level:
 *
 * - `resolveTaskAssurance` — the REQ-003 endpoint (declare
 *   intent; the system determines required evidence and
 *   verification depth) is exposed, deterministic, and
 *   identical to the pure engine;
 * - `registerIntentTaskProfile` — the fail-closed binding: a
 *   below-floor declaration is refused at the boundary AND
 *   nothing is written (no half-registration); compliant
 *   declarations register through the AISE-013 store semantics
 *   (immutable, content-pinned, idempotent, conflict-detecting);
 * - no second authority: the new verbs leave the canonical
 *   graph and evidence mapping bit-identical (digests before
 *   and after);
 * - surface discipline: the new verbs are read/compute/declare
 *   verbs — no mutation verbs appear on the service surface;
 * - the AISE-013 primitive path is unchanged (a
 *   caller-declared profile still registers and assesses
 *   exactly as before — the engine is additive, not a rewrite).
 */
import { describe, expect, it } from "vitest";
import { loadConfig } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import type { AiseConfig } from "@aise/backend-config";
import { buildAssuranceService } from "./runtime.js";
import type { AssuranceService } from "./runtime.js";
import { createInMemoryAssuranceStore, type AssuranceStore } from "./store.js";
import { isAssuranceError, type AssuranceError } from "./errors.js";
import {
  resolveTaskAssurance as pureResolveTaskAssurance,
  type TaskAssuranceResolution,
} from "./intent.js";
import {
  MODEL,
  PROJECT,
  lidarEvidence,
  mappingWith,
  smallGraph,
  subjects,
} from "./testing.js";
import type { RealityModelGraph } from "@aise/engineering-model";

function testConfig(): AiseConfig {
  const result = loadConfig({ AISE_ENV: "test", AISE_LOG_LEVEL: "error" });
  if (!result.ok) {
    throw new Error("test config must load");
  }
  return result.config;
}

interface Harness {
  readonly service: AssuranceService;
  readonly store: AssuranceStore;
  readonly graphs: Map<string, RealityModelGraph>;
  readonly mapping: ReturnType<typeof mappingWith>;
}

function harness(): Harness {
  const graphs = new Map<string, RealityModelGraph>();
  graphs.set(`${MODEL}:1`, smallGraph());
  const mapping = mappingWith([lidarEvidence()], [
    { subject: subjects(1).wallExistence, evidenceId: lidarEvidence().evidenceId },
  ]);
  const store = createInMemoryAssuranceStore({ now: () => "2026-09-06T12:00:00Z" });
  const service = buildAssuranceService(
    testConfig(),
    createLogger({ level: "error", module: "assurance-intent-test" }),
    {
      modelReader: {
        getModelGraph: (modelId, version) => graphs.get(`${modelId}:${version}`),
      },
      evidenceReader: {
        getMapping: (projectId) => (projectId === PROJECT ? mapping : undefined),
      },
      store,
    },
  );
  return { service, store, graphs, mapping };
}

describe("resolveTaskAssurance (the REQ-003 endpoint)", () => {
  it("answers every intent deterministically, identical to the pure engine", () => {
    const { service } = harness();
    for (const intent of ["AS_BUILT", "MAINTENANCE", "INSPECTION"] as const) {
      for (const declaredProfile of [undefined, "LIGHT", "STANDARD", "HIGH_ASSURANCE", "CRITICAL"] as const) {
        const viaService: TaskAssuranceResolution =
          declaredProfile === undefined
            ? service.resolveTaskAssurance({ intent })
            : service.resolveTaskAssurance({ intent, declaredProfile });
        const viaEngine: TaskAssuranceResolution =
          declaredProfile === undefined
            ? pureResolveTaskAssurance({ intent })
            : pureResolveTaskAssurance({ intent, declaredProfile });
        expect(viaService).toEqual(viaEngine);
        expect(viaService.digest).toBe(viaEngine.digest);
      }
    }
  });

  it("repeated resolution is bit-identical (replay)", () => {
    const { service } = harness();
    const first = service.resolveTaskAssurance({ intent: "INSPECTION", declaredProfile: "LIGHT" });
    const second = service.resolveTaskAssurance({ intent: "INSPECTION", declaredProfile: "LIGHT" });
    expect(first).toEqual(second);
    expect(first.digest).toBe(second.digest);
    expect(first.effectiveProfile).toBe("CRITICAL");
    expect(first.findings).toHaveLength(1);
  });

  it("fail-closed on unknown vocabulary at the service boundary", () => {
    const { service } = harness();
    expect(() => service.resolveTaskAssurance({ intent: "RENOVATION" as never })).toThrowError(/intent/);
    const error = capture(() => service.resolveTaskAssurance({ intent: 42 as never }));
    expect(error?.code).toBe("INTENT_INVALID");
  });
});

describe("registerIntentTaskProfile (the fail-closed binding)", () => {
  it("refuses below-floor declarations and writes NOTHING", () => {
    const { service } = harness();
    const attempt = () =>
      service.registerIntentTaskProfile(PROJECT, {
        taskId: "task-bad",
        intent: "INSPECTION",
        profile: "LIGHT",
      });
    expect(attempt).toThrowError(/below the .* contract floor/);
    const error = capture(attempt);
    expect(error?.code).toBe("INTENT_PROFILE_BELOW_FLOOR");
    // Nothing was half-registered: the store stayed empty.
    expect(service.listTaskProfiles(PROJECT)).toEqual([]);
    expect(service.getTaskProfile(PROJECT, "task-bad")).toBeUndefined();
    expect(service.listTaskProfiles(PROJECT)).toHaveLength(0);
  });

  it("refuses below-floor for every violating intent/profile pair (discrimination)", () => {
    const pairs: readonly { intent: "AS_BUILT" | "MAINTENANCE" | "INSPECTION"; profile: "LIGHT" | "STANDARD" | "HIGH_ASSURANCE" }[] = [
      { intent: "MAINTENANCE", profile: "LIGHT" },
      { intent: "AS_BUILT", profile: "LIGHT" },
      { intent: "AS_BUILT", profile: "STANDARD" },
      { intent: "INSPECTION", profile: "LIGHT" },
      { intent: "INSPECTION", profile: "STANDARD" },
      { intent: "INSPECTION", profile: "HIGH_ASSURANCE" },
    ];
    for (const pair of pairs) {
      const { service } = harness();
      const error = capture(() =>
        service.registerIntentTaskProfile(PROJECT, { taskId: "t", ...pair }),
      );
      expect(error?.code).toBe("INTENT_PROFILE_BELOW_FLOOR");
      expect(service.listTaskProfiles(PROJECT)).toEqual([]);
    }
  });

  it("undeclared profile binds at the intent floor", () => {
    const { service } = harness();
    const result = service.registerIntentTaskProfile(PROJECT, {
      taskId: "task-inspect",
      intent: "INSPECTION",
    });
    expect(result.status).toBe("created");
    expect(result.record.profile).toBe("CRITICAL");
    expect(result.record.intent).toBe("INSPECTION");
    // Assessable through the unchanged AISE-013 path.
    const assessment = service.assessModelVersion(PROJECT, {
      modelId: MODEL,
      version: 1,
      taskId: "task-inspect",
      assessedBy: "test",
    });
    expect(assessment.report.assuranceProfile).toBe("CRITICAL");
    expect(assessment.report.intent).toBe("INSPECTION");
  });

  it("compliant declarations register with full AISE-013 store semantics", () => {
    const { service } = harness();
    const input = {
      taskId: "task-comply",
      intent: "AS_BUILT" as const,
      profile: "CRITICAL" as const,
      description: "dimensional compliance verification",
      uncertaintyBudget: { lengthM: 0.05 },
    };
    const first = service.registerIntentTaskProfile(PROJECT, input);
    expect(first.status).toBe("created");
    expect(first.record.digest).toMatch(/^[0-9a-f]{64}$/);

    // Idempotent re-registration (identical content).
    const second = service.registerIntentTaskProfile(PROJECT, { ...input });
    expect(second.status).toBe("exists_identical");

    // Conflicting re-registration (different content, same id).
    const conflicting = service.registerIntentTaskProfile(PROJECT, {
      ...input,
      profile: "HIGH_ASSURANCE" as const,
    });
    expect(conflicting.status).toBe("exists_conflict");

    // Listed and inspectable like any AISE-013 profile.
    const listed = service.listTaskProfiles(PROJECT);
    expect(listed.map((record) => record.taskId)).toContain("task-comply");
  });

  it("unknown intents are refused at the boundary (fail-closed)", () => {
    const { service } = harness();
    const error = capture(() =>
      service.registerIntentTaskProfile(PROJECT, { taskId: "t", intent: "RENOVATION" as never }),
    );
    expect(error?.code).toBe("INTENT_INVALID");
    expect(service.listTaskProfiles(PROJECT)).toEqual([]);
  });
});

describe("no second authority (the intent verbs write neither graph nor mapping)", () => {
  it("resolve + register leave the canonical digests bit-identical", () => {
    const { service, graphs, mapping } = harness();
    const graph = graphs.get(`${MODEL}:1`)!;
    const graphDigestBefore = graph.digest;
    const mappingDigestBefore = mapping.digest;

    service.resolveTaskAssurance({ intent: "INSPECTION", declaredProfile: "LIGHT" });
    service.resolveTaskAssurance({ intent: "AS_BUILT" });
    service.registerIntentTaskProfile(PROJECT, {
      taskId: "t",
      intent: "MAINTENANCE",
      description: "routine servicing",
    });
    service.registerIntentTaskProfile(PROJECT, {
      taskId: "t2",
      intent: "INSPECTION",
      profile: "CRITICAL",
    });

    expect(graph.digest).toBe(graphDigestBefore);
    expect(mapping.digest).toBe(mappingDigestBefore);
  });
});

describe("surface discipline (additive, mutation-free)", () => {
  it("the new verbs are present and no mutation verbs appear", () => {
    const { service } = harness();
    const surface = Object.keys(service).sort();
    expect(surface).toContain("resolveTaskAssurance");
    expect(surface).toContain("registerIntentTaskProfile");
    for (const verb of surface) {
      expect(verb).not.toMatch(/commit|ingest|link|retract|write|mutate|update/i);
    }
  });

  it("the AISE-013 primitive surface is unchanged (additive only)", () => {
    const { service } = harness();
    const surface = Object.keys(service).sort();
    // The AISE-013 verbs all still exist...
    for (const verb of [
      "registerTaskProfile",
      "getTaskProfile",
      "listTaskProfiles",
      "assessModelVersion",
      "latestAssessment",
      "assessmentHistory",
      "limits",
    ]) {
      expect(surface).toContain(verb);
    }
    // ...and the primitive path still registers and assesses a
    // caller-declared profile at exactly its declared depth
    // (the engine composes on top; it does not rewrite).
    service.registerTaskProfile(PROJECT, { taskId: "t-primitive", intent: "AS_BUILT", profile: "LIGHT" });
    const assessment = service.assessModelVersion(PROJECT, {
      modelId: MODEL,
      version: 1,
      taskId: "t-primitive",
      assessedBy: "test",
    });
    expect(assessment.report.assuranceProfile).toBe("LIGHT");
    expect(assessment.report.intent).toBe("AS_BUILT");
  });
});

/** Captures the AssuranceError a thunk throws (or undefined). */
function capture(thunk: () => unknown): AssuranceError | undefined {
  try {
    thunk();
    return undefined;
  } catch (error) {
    expect(isAssuranceError(error)).toBe(true);
    return error as AssuranceError;
  }
}
