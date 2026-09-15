/**
 * PROD-004 — the deterministic demo path ("Enter demo").
 *
 * THE DEMO CONTRACT (the loud parts):
 *
 *  - The demo path mints a session for ONE FIXED PRINCIPAL (AISE_DEMO_PRINCIPAL,
 *    default "demo-evaluator") inside ONE FIXED TENANT — the demo
 *    organization `org-northwind` — which owns exactly the web demo
 *    world's projects (`proj-riverside-refit`, `project-zurich-hq`), ids
 *    kept verbatim from the product's demo dataset.
 *  - CONTAINMENT IS STRUCTURAL, not a blocklist: the demo principal's ONLY
 *    membership is in the demo organization, so the tenant predicate
 *    refuses every other tenant with 403 cross_tenant by the same rule as
 *    everyone else (matrix-tested). Demo mutations can only land in the
 *    demo tenant's own projects — there is no code path that re-scopes
 *    them.
 *  - NO SECOND AUTHORITY: the demo tenant is REAL identity-library state,
 *    created through the library's own un-gated bootstrap acts
 *    (registerPrincipal → createOrganization with the demo principal as
 *    founder → createProject ×2), each appending the library's audit
 *    events. The auth layer performs the acts; it never writes identity
 *    records directly. The founder permission set is the library's full
 *    frozen registry, scoped to the demo organization ONLY (an
 *    org-scoped founder grants nothing outside org-northwind).
 *  - IDEMPOTENT AND DETERMINISTIC: every act is an ensure (an "already
 *    exists" typed rejection is success); the same data dir + clock
 *    produces byte-identical registry state. The bootstrap is memoized —
 *    one execution per process, awaited by the demo entrypoint and by
 *    tests; requests that arrive before it lands simply fail closed
 *    (unregistered_project) for a few milliseconds.
 */

import {
  IdentityError,
  PERMISSIONS,
  type IdentityService,
} from "../identity";
import type { Logger } from "../lib/log";

/** The fixed demo tenant (the web demo world's organization id, verbatim). */
export const DEMO_ORGANIZATION_ID = "org-northwind";

/** The demo tenant's projects (the web demo world's project ids, verbatim). */
export const DEMO_PROJECT_IDS: readonly string[] = Object.freeze([
  "proj-riverside-refit",
  "project-zurich-hq",
]);

/** The display name of the demo principal (display-only vocabulary). */
export const DEMO_PRINCIPAL_DISPLAY_NAME = "Demo Evaluator";

/** The demo organization's display name (registry metadata only). */
const DEMO_ORGANIZATION_NAME = "AISE Demo Tenant";

/** The demo projects' display names (registry metadata only, same order as DEMO_PROJECT_IDS). */
const DEMO_PROJECT_NAMES: readonly string[] = Object.freeze([
  "Riverside Refit (pilot)",
  "Zurich HQ (intervention scenario)",
]);

/** True when the typed rejection is the act's "already exists" answer. */
function isAlreadyExists(error: unknown, code: string): boolean {
  return error instanceof IdentityError && error.code === code;
}

/** What one demo bootstrap run ensured (the honest report). */
export interface DemoBootstrapReport {
  readonly principalId: string;
  readonly organizationId: string;
  readonly projectIds: readonly string[];
  /** The audit actions the identity library recorded for this run (may be empty on re-boot). */
  readonly recordedActions: readonly string[];
}

/**
 * Ensure the demo tenant exists in the identity registry (idempotent — see
 * the module header). `clock` is the identity service's own injected
 * clock; determinism is the library's contract.
 */
export async function ensureDemoTenant(input: {
  readonly service: IdentityService;
  readonly demoPrincipalId: string;
  readonly logger?: Logger;
}): Promise<DemoBootstrapReport> {
  const { service, demoPrincipalId } = input;
  const recordedActions: string[] = [];

  try {
    await service.registerPrincipal({
      principalId: demoPrincipalId,
      displayName: DEMO_PRINCIPAL_DISPLAY_NAME,
    });
    recordedActions.push("principal registered");
  } catch (error) {
    if (!isAlreadyExists(error, "principal_exists")) {
      throw error;
    }
  }

  try {
    await service.createOrganization({
      organizationId: DEMO_ORGANIZATION_ID,
      name: DEMO_ORGANIZATION_NAME,
      founder: { principalId: demoPrincipalId, permissions: [...PERMISSIONS] },
    });
    recordedActions.push("organization created with demo founder");
  } catch (error) {
    if (!isAlreadyExists(error, "organization_exists")) {
      throw error;
    }
  }

  for (const [index, projectId] of DEMO_PROJECT_IDS.entries()) {
    try {
      await service.createProject({
        organizationId: DEMO_ORGANIZATION_ID,
        projectId,
        name: DEMO_PROJECT_NAMES[index] ?? projectId,
        actor: demoPrincipalId,
      });
      recordedActions.push(`project ${projectId} registered`);
    } catch (error) {
      if (!isAlreadyExists(error, "project_exists")) {
        throw error;
      }
    }
  }

  input.logger?.debug("demo tenant ensured in the identity registry", {
    organizationId: DEMO_ORGANIZATION_ID,
    principalId: demoPrincipalId,
    projectIds: DEMO_PROJECT_IDS,
  });

  return {
    principalId: demoPrincipalId,
    organizationId: DEMO_ORGANIZATION_ID,
    projectIds: DEMO_PROJECT_IDS,
    recordedActions,
  };
}

/** The memoized demo-tenant bootstrap (one execution per process). */
export function memoizedDemoBootstrap(input: {
  readonly service: IdentityService;
  readonly demoPrincipalId: string;
  readonly logger?: Logger;
}): () => Promise<DemoBootstrapReport> {
  let run: Promise<DemoBootstrapReport> | null = null;
  return () => {
    run ??= ensureDemoTenant(input).catch((error: unknown) => {
      // Never memoize a failure: the next call retries the ensure.
      run = null;
      throw error;
    });
    return run;
  };
}
