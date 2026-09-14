/**
 * AISE-037 — Adapter registry: registration, lookup and DETERMINISTIC
 * selection of incumbent adapters.
 *
 * Contract (spec/work-orders.md §037; the AISE-012 registry pattern):
 *
 *  - Registration validates the descriptor (`validateAdapterDescriptor`) and
 *    refuses duplicate adapter ids with a TYPED conflict — ids are the
 *    registry key, so one id can never name two connectors.
 *  - Lookup of an unknown id is a TYPED not-found (never null-silent, never
 *    an exception).
 *  - Selection is deterministic: candidates are ordered by adapterId
 *    (code-unit order) — registration order NEVER leaks. A candidate must
 *    match the system class, DECLARE the requested capability, and — when
 *    granted scopes are given — the capability's scope must be granted
 *    (least privilege participates in selection).
 *  - The registry holds adapter INSTANCES (injected implementations); it has
 *    no lifecycle, no I/O, no credentials. Removing an adapter removes only
 *    the routing — sync lineage already journaled stays exactly as recorded
 *    (the ledger is the history, not the registry).
 */

import type { AdapterCapability, SystemClass } from "./model";
import { validateAdapterDescriptor } from "./model";
import { scopeForCapability } from "./permissions";
import type { GrantedScopes } from "./permissions";
import type { IncumbentAdapter } from "./adapter";

export type AdapterRegistrationResult =
  | { readonly ok: true; readonly adapterId: string }
  | {
      readonly ok: false;
      readonly code: "invalid_adapter_descriptor" | "adapter_id_conflict";
      readonly issues?: readonly string[];
      readonly detail?: string;
    };

export type AdapterLookupResult =
  | { readonly ok: true; readonly adapter: IncumbentAdapter }
  | { readonly ok: false; readonly code: "adapter_not_found"; readonly detail: string };

export interface AdapterSelectionCriteria {
  readonly systemClass: SystemClass;
  readonly capability: AdapterCapability;
  /** Optional least-privilege filter: the capability's scope must be granted. */
  readonly grantedScopes?: GrantedScopes;
}

export type AdapterSelectionResult =
  | { readonly ok: true; readonly adapter: IncumbentAdapter }
  | { readonly ok: false; readonly code: "no_matching_adapter"; readonly detail: string };

export interface AdapterRegistry {
  register(adapter: IncumbentAdapter): AdapterRegistrationResult;
  lookup(adapterId: string): AdapterLookupResult;
  /** Adapters of one class, ordered by adapterId (deterministic). */
  listBySystemClass(systemClass: SystemClass): readonly IncumbentAdapter[];
  /** All registered adapters, ordered by adapterId (deterministic). */
  listAll(): readonly IncumbentAdapter[];
  select(criteria: AdapterSelectionCriteria): AdapterSelectionResult;
}

/** Deterministic ordering key: the adapter id itself (code-unit order). */
function byAdapterId(a: IncumbentAdapter, b: IncumbentAdapter): number {
  return a.descriptor.adapterId < b.descriptor.adapterId
    ? -1
    : a.descriptor.adapterId > b.descriptor.adapterId
      ? 1
      : 0;
}

/** Create a fresh, empty adapter registry (no ambient/global state). */
export function createAdapterRegistry(): AdapterRegistry {
  const byId = new Map<string, IncumbentAdapter>();

  return {
    register: (adapter) => {
      const validation = validateAdapterDescriptor(adapter.descriptor);
      if (!validation.ok) {
        return {
          ok: false,
          code: "invalid_adapter_descriptor",
          issues: validation.issues,
        };
      }
      const adapterId = validation.descriptor.adapterId;
      const existing = byId.get(adapterId);
      if (existing !== undefined) {
        return {
          ok: false,
          code: "adapter_id_conflict",
          detail:
            `adapter id '${adapterId}' is already registered for system class ` +
            `'${existing.descriptor.systemClass}' — cannot register a ` +
            `'${adapter.descriptor.systemClass}' adapter under the same id ` +
            `(registry ids are unique)`,
        };
      }
      byId.set(adapterId, adapter);
      return { ok: true, adapterId };
    },

    lookup: (adapterId) => {
      const adapter = byId.get(adapterId);
      if (adapter === undefined) {
        return {
          ok: false,
          code: "adapter_not_found",
          detail: `no adapter registered under id '${adapterId}'`,
        };
      }
      return { ok: true, adapter };
    },

    listBySystemClass: (systemClass) =>
      [...byId.values()]
        .filter((adapter) => adapter.descriptor.systemClass === systemClass)
        .sort(byAdapterId),

    listAll: () => [...byId.values()].sort(byAdapterId),

    select: (criteria) => {
      const candidates = [...byId.values()]
        .filter((adapter) => adapter.descriptor.systemClass === criteria.systemClass)
        .filter((adapter) =>
          (adapter.descriptor.capabilities as readonly string[]).includes(criteria.capability),
        )
        .sort(byAdapterId);
      // Least privilege participates in selection: the capability's scope
      // must be granted (and the grant must be for the same system class).
      const requiredScope = scopeForCapability(criteria.capability);
      const scopeUsable =
        criteria.grantedScopes === undefined ||
        (criteria.grantedScopes.systemClass === criteria.systemClass &&
          criteria.grantedScopes.scopes.includes(requiredScope));
      const usable = scopeUsable ? candidates : [];
      if (usable.length === 0) {
        const scopeNote = criteria.grantedScopes ? ` with scope '${requiredScope}' granted` : "";
        return {
          ok: false,
          code: "no_matching_adapter",
          detail:
            `no registered adapter for system class '${criteria.systemClass}' declaring ` +
            `capability '${criteria.capability}'${scopeNote}`,
        };
      }
      return { ok: true, adapter: usable[0]! };
    },
  };
}
