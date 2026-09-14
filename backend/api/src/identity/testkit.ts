/**
 * Deterministic identity test fixtures (AISE-036) — TEST SUPPORT ONLY,
 * never imported by production modules.
 *
 * All ids are fixed seed strings, all timestamps are fixed constants,
 * clocks are constant or fixed-sequence functions. No wall-clock, no
 * randomness, no network — the verify gate stays deterministic.
 *
 * The fixture world (two tenants, one cross-tenant principal):
 *   - principals: founder-north (org north), engineer-south (org south),
 *     contractor-both (member of north; NOT of south — the cross-tenant
 *     discriminator), uninvited (registered, member of nothing).
 *   - organizations: org-north (founder-north is the bootstrap founder
 *     with identity:admin + more), org-south (founder-south … created by
 *     tests), org-empty (no members — locked-org discrimination).
 *   - roles: org-north's "surveyor" (reality:read, evidence:read,
 *     verification:read, case:read, reasoning:read — the AI-context
 *     consumer), "reader" (reality:read only), "project-engineer"
 *     (reality:write at PROJECT scope), "org-founder" (bootstrap).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProvenanceRecord } from "../reality/model";
import type { GroundedContext } from "../reasoning/model";
import { IdentityService } from "./service";
import type { IdentityStore } from "./store";

export const FIXED_NOW = "2026-02-02T09:00:00.000Z";
export const FIXED_LATER = "2026-02-02T09:30:00.000Z";
export const FIXED_EVEN_LATER = "2026-02-02T10:15:00.000Z";
export const FIXED_MONTHS_LATER = "2026-08-02T09:00:00.000Z";

/** Injected clock: constant, so identity bytes are stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Deterministic advancing clock: returns steps[i] on the i-th call. */
export function makeSequenceClock(steps: readonly string[]): () => string {
  let calls = 0;
  const last = steps.length - 1;
  return (): string => {
    const value = steps[Math.min(calls, last)];
    calls += 1;
    return value ?? steps[last] ?? FIXED_NOW;
  };
}

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-identity-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* The fixture world                                                    */
/* ------------------------------------------------------------------ */

export const PRINCIPAL_FOUNDER_NORTH = "principal-founder-north";
export const PRINCIPAL_ENGINEER_SOUTH = "principal-engineer-south";
export const PRINCIPAL_CONTRACTOR = "principal-contractor";
export const PRINCIPAL_UNINVITED = "principal-uninvited";

export const ORG_NORTH = "org-north";
export const ORG_SOUTH = "org-south";

export const PROJECT_ALPHA = "project-alpha";
export const PROJECT_BETA = "project-beta";

/** The AI-context consumer role: read over the surfaces the selector gates. */
export const ROLE_SURVEYOR = "role-surveyor";
export const SURVEYOR_PERMISSIONS = [
  "reality:read",
  "evidence:read",
  "verification:read",
  "case:read",
  "reasoning:read",
] as const;

/** Read-only reality (the insufficient-granularity discriminator). */
export const ROLE_READER = "role-reader";

/** Project-scoped write (the wrong-scope discriminator). */
export const ROLE_PROJECT_ENGINEER = "role-project-engineer";

/**
 * Build the canonical fixture world on ANY store:
 *   - 4 registered principals;
 *   - org-north created BY founder-north as bootstrap founder with
 *     identity:admin + the surveyor permission set;
 *   - org-south created by engineer-south (identity:admin);
 *   - org-north projects alpha + beta;
 *   - org-north roles: surveyor, reader (reality:read), project-engineer
 *     (reality:write PROJECT-scoped via membership scope);
 *   - contractor holds the surveyor role in org-north at PROJECT ALPHA
 *     scope only (cross-tenant AND cross-project discrimination).
 */
export async function buildFixtureWorld(
  store: IdentityStore,
  clock: () => string = fixedClock,
): Promise<IdentityService> {
  const service = new IdentityService({ store, clock });
  for (const [principalId, displayName] of [
    [PRINCIPAL_FOUNDER_NORTH, "Founder North"],
    [PRINCIPAL_ENGINEER_SOUTH, "Engineer South"],
    [PRINCIPAL_CONTRACTOR, "Contractor"],
    [PRINCIPAL_UNINVITED, "Uninvited"],
  ] as const) {
    await service.registerPrincipal({ principalId, displayName });
  }
  await service.createOrganization({
    organizationId: ORG_NORTH,
    name: "North Construction",
    founder: {
      principalId: PRINCIPAL_FOUNDER_NORTH,
      permissions: ["identity:admin", "identity:write", "identity:read", "audit:admin", "audit:read"],
    },
  });
  await service.createOrganization({
    organizationId: ORG_SOUTH,
    name: "South Engineering",
    founder: {
      principalId: PRINCIPAL_ENGINEER_SOUTH,
      permissions: ["identity:admin", "identity:write", "identity:read"],
    },
  });
  for (const [projectId, name] of [
    [PROJECT_ALPHA, "Alpha retrofit"],
    [PROJECT_BETA, "Beta extension"],
  ] as const) {
    await service.createProject({
      organizationId: ORG_NORTH,
      projectId,
      name,
      actor: PRINCIPAL_FOUNDER_NORTH,
    });
  }
  await service.createRole({
    organizationId: ORG_NORTH,
    roleId: ROLE_SURVEYOR,
    name: "Surveyor",
    permissions: [...SURVEYOR_PERMISSIONS],
    actor: PRINCIPAL_FOUNDER_NORTH,
  });
  await service.createRole({
    organizationId: ORG_NORTH,
    roleId: ROLE_READER,
    name: "Reality reader",
    permissions: ["reality:read"],
    actor: PRINCIPAL_FOUNDER_NORTH,
  });
  await service.createRole({
    organizationId: ORG_NORTH,
    roleId: ROLE_PROJECT_ENGINEER,
    name: "Project engineer",
    permissions: ["reality:write"],
    actor: PRINCIPAL_FOUNDER_NORTH,
  });
  // The contractor: surveyor ONLY inside project alpha of org-north.
  await service.grantMembership({
    organizationId: ORG_NORTH,
    principalId: PRINCIPAL_CONTRACTOR,
    roleId: ROLE_SURVEYOR,
    scope: { kind: "project", projectId: PROJECT_ALPHA },
    actor: PRINCIPAL_FOUNDER_NORTH,
  });
  return service;
}

/* ------------------------------------------------------------------ */
/* GroundedContext fixture (selector tests)                             */
/* ------------------------------------------------------------------ */

const CONTEXT_INSTANT = "2026-02-02T08:00:00Z";

function derivationProvenance(): ProvenanceRecord[] {
  return [
    { role: "DERIVED_FROM", derivationNote: "identity test fixture", recordedAt: CONTEXT_INSTANT },
  ];
}

/**
 * A minimal candidate AI context (structurally valid GroundedContext —
 * type-only import from the reasoning gateway's model): two nodes, one
 * relationship, two evidence records, one finding, one case, one rule.
 */
export function candidateContext(): GroundedContext {
  return {
    graphSnapshot: {
      nodes: [
        {
          nodeId: "node-wall-north",
          kind: "element",
          epistemicStatus: "OBSERVED",
          properties: [
            {
              key: "width",
              value: 4.2,
              unit: "m",
              epistemicStatus: "OBSERVED",
              provenance: derivationProvenance(),
            },
          ],
          provenance: derivationProvenance(),
        },
        {
          nodeId: "node-wall-south",
          kind: "element",
          epistemicStatus: "OBSERVED",
          properties: [
            {
              key: "height",
              value: 2.7,
              unit: "m",
              epistemicStatus: "OBSERVED",
              provenance: derivationProvenance(),
            },
          ],
          provenance: derivationProvenance(),
        },
      ],
      relationships: [
        {
          relationshipId: "rel-contains-wall-north",
          kind: "contains",
          fromNodeId: "node-space-living",
          toNodeId: "node-wall-north",
          provenance: derivationProvenance(),
        },
      ],
    },
    evidenceRecords: [
      {
        contentId: "ev-wall-north-depth",
        method: "DEPTH_SENSING",
        capturedAt: CONTEXT_INSTANT,
        invalidated: false,
        linkedNodeIds: ["node-wall-north"],
        measurement: { value: 4.2, unit: "m", sigma: 0.01 },
      },
      {
        contentId: "ev-wall-south-manual",
        method: "MANUAL_MEASUREMENT",
        capturedAt: CONTEXT_INSTANT,
        invalidated: false,
        linkedNodeIds: ["node-wall-south"],
      },
    ],
    verificationFindings: [
      {
        code: "MISSING_UNIT",
        severity: "error",
        subjectNodeIds: ["node-wall-south"],
        message: "numeric property 'height' of node-wall-south has no typed unit",
      },
    ],
    cases: [
      {
        caseId: "case-crack-1",
        observations: [
          {
            observationId: "obs-crack-1",
            statement: "Hairline cracking observed on the Wall North plaster face.",
            epistemicStatus: "OBSERVED",
            recordedAt: CONTEXT_INSTANT,
            evidenceIds: ["ev-wall-north-depth"],
          },
        ],
        hypotheses: [],
      },
    ],
    rules: ["Structural safety conclusions require chartered-engineer review."],
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                                */
/* ------------------------------------------------------------------ */

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
