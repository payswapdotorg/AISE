/**
 * PROD-002 — the app environment context: the API mode (probed same-origin)
 * and the injected fetch transport, plus the acting principal the demo
 * authorization table offers.
 *
 * The environment NEVER holds engineering data — only transport-level facts
 * (is the API up? which fetch do loaders use?). Surfaces own their data
 * through the resource machine; nothing here is browser-side authority.
 */

import { createContext, useContext } from "react";
import type { ApiStatus, FetchLike } from "./api";

/** What every surface can read from the environment. */
export interface AppEnvironment {
  /** The probed API status, or null while probing. */
  readonly apiStatus: ApiStatus | null;
  /** The fetch transport (the browser global in production, stubs in tests). */
  readonly fetchImpl: FetchLike;
  /** The acting principal (the demo authorization table's vocabulary). */
  readonly principalId: string;
}

/** The environment context (provided once by App). */
export const AppEnvironmentContext = createContext<AppEnvironment>({
  apiStatus: null,
  fetchImpl: (input) => Promise.reject(new Error(`no fetch transport wired for ${input}`)),
  principalId: "user-alice",
});

/** Read the app environment (transport facts only — never data). */
export function useAppEnvironment(): AppEnvironment {
  return useContext(AppEnvironmentContext);
}

/** True while the API mode is unknown (the probe is in flight). */
export function isProbing(environment: AppEnvironment): boolean {
  return environment.apiStatus === null;
}

/** True when the app must render the demo dataset (API absent). */
export function isDemoMode(environment: AppEnvironment): boolean {
  return environment.apiStatus !== null && environment.apiStatus.mode === "unavailable";
}
