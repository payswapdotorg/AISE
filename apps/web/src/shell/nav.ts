/**
 * AISE-040 — deep-link address codec + the breadcrumb session model.
 *
 * ⚠⚠⚠ NAVIGATION CHANGES PRESENTATION ONLY ⚠⚠⚠
 *
 *  - DEEP LINKS ARE TYPED STRUCTURES WITH TYPED PARSERS: every pane and
 *    action address is a `ShellAddress` (model.ts). The string form is a
 *    stable, module-scoped URI (`aise-shell://<module>?p=<projectId>&…`)
 *    whose entity ids are the owning modules' VERBATIM ids — there is NO
 *    second id scheme anywhere (the reality address carries the Reality
 *    Graph's own versionId/nodeId, the BOQ address the import's own
 *    importId, &c.). `parseShellAddress` rejects malformed addresses with
 *    a typed `invalid_address` error — NEVER a silent fallback to a
 *    default pane, never a best-effort guess. Unknown params, duplicate
 *    params, empty values, wrong schemes and bad percent-encodings are
 *    all rejections.
 *  - THE SESSION IS A VALUE, NOT STATE: `ShellSession` is an immutable
 *    breadcrumb chain of addresses. `beginShellSession` starts one;
 *    `extendShellSession` appends (a consecutive repeat is a no-op). The
 *    chain is what "remains AISE-centered" means operationally: the whole
 *    §040 walk (context → reality → BOQ → evidence → case → authorized
 *    action → return path) is ONE session whose breadcrumbs carry the
 *    context through every step. The shell never persists sessions, never
 *    reads a clock and never generates randomness — the same session +
 *    address produce byte-identical results.
 *  - RETURN PATHS: every external-system action carries the AISE context
 *    the user returns to (`ShellConnectorAction.returnTo` in actions.ts).
 *    Following a return path is just `extendShellSession` with the return
 *    address — the context survives the round trip by construction.
 *
 * Determinism: fixed param order (p, then module-specific keys), canonical
 * percent-encoding, no clock, no randomness, no IO.
 */

import {
  ShellError,
  SHELL_MODULES,
  validateShellAddress,
  type ShellAddress,
  type ShellModule,
} from "./model";

/* ------------------------------------------------------------------ */
/* The address string codec                                            */
/* ------------------------------------------------------------------ */

/** The stable deep-link scheme every shell address text starts with. */
export const SHELL_ADDRESS_SCHEME = "aise-shell://";

/**
 * The per-module query-parameter grammar (frozen). Keys are short and
 * fixed; values are percent-encoded VERBATIM entity ids. A module's
 * required set must all be present; anything outside allowed is a typed
 * rejection.
 */
const ADDRESS_PARAMS: Readonly<
  Record<ShellModule, { readonly required: readonly string[]; readonly optional: readonly string[] }>
> = Object.freeze({
  context: { required: ["p"], optional: [] },
  reality: { required: ["p"], optional: ["v", "n"] },
  boq: { required: ["p", "i"], optional: [] },
  evidence: { required: ["p", "e"], optional: [] },
  case: { required: ["p", "c"], optional: [] },
});

/** The canonical parameter emission order per module (format is fixed). */
const PARAM_ORDER: readonly string[] = ["p", "v", "n", "i", "e", "c"];

/**
 * Format one address into its canonical string form (validates first —
 * a malformed structure is a typed rejection, never a coerced string).
 */
export function formatShellAddress(address: ShellAddress): string {
  const validated = validateShellAddress(address);
  const parts: string[] = [SHELL_ADDRESS_SCHEME, validated.module, "?"];
  const encoded: string[] = [];
  for (const key of PARAM_ORDER) {
    const value = addressParamValue(validated, key);
    if (value !== null) {
      encoded.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  parts.push(encoded.join("&"));
  return parts.join("");
}

/** Map a canonical param key to the address's value (null when absent). */
function addressParamValue(address: ShellAddress, key: string): string | null {
  switch (key) {
    case "p":
      return address.projectId;
    case "v":
      return address.module === "reality" ? (address.versionId ?? null) : null;
    case "n":
      return address.module === "reality" ? (address.nodeId ?? null) : null;
    case "i":
      return address.module === "boq" ? address.importId : null;
    case "e":
      return address.module === "evidence" ? address.evidenceId : null;
    case "c":
      return address.module === "case" ? address.caseId : null;
    default:
      return null;
  }
}

/** Strictly decode one percent-encoded value (typed rejection on garbage). */
function decodeParamValue(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new ShellError(
      "invalid_address",
      `address parameter value '${raw}' is not validly percent-encoded`,
    );
  }
}

/**
 * Parse an address string into its typed structure. STRICT: the scheme,
 * the module, the required parameters, the absence of unknown/duplicate
 * parameters, the non-emptiness of every id and the validity of every
 * percent-encoding are all enforced with typed `invalid_address`
 * rejections — a malformed address NEVER falls back to a default pane.
 */
export function parseShellAddress(text: string): ShellAddress {
  if (typeof text !== "string") {
    throw new ShellError("invalid_address", "address must be a string");
  }
  if (!text.startsWith(SHELL_ADDRESS_SCHEME)) {
    throw new ShellError(
      "invalid_address",
      `address must start with '${SHELL_ADDRESS_SCHEME}'`,
    );
  }
  const rest = text.slice(SHELL_ADDRESS_SCHEME.length);
  const queryIndex = rest.indexOf("?");
  if (queryIndex < 0) {
    throw new ShellError("invalid_address", "address requires a '?project' query");
  }
  const module = rest.slice(0, queryIndex);
  if (module.length === 0 || module.includes("/")) {
    throw new ShellError("invalid_address", `address module '${module}' is malformed`);
  }
  if (!(SHELL_MODULES as readonly string[]).includes(module)) {
    throw new ShellError(
      "invalid_address",
      `address module must be one of: ${SHELL_MODULES.join(", ")}`,
  );
  }
  const shellModule = module as ShellModule;
  const grammar = ADDRESS_PARAMS[shellModule];
  const query = rest.slice(queryIndex + 1);
  const seen = new Map<string, string>();
  if (query.length > 0) {
    for (const pair of query.split("&")) {
      const equals = pair.indexOf("=");
      if (equals <= 0) {
        throw new ShellError(
          "invalid_address",
          `address parameter '${pair}' must be a key=value pair`,
        );
      }
      const key = pair.slice(0, equals);
      const raw = pair.slice(equals + 1);
      if (seen.has(key)) {
        throw new ShellError("invalid_address", `address parameter '${key}' is duplicated`);
      }
      if (
        !(grammar.required as readonly string[]).includes(key) &&
        !(grammar.optional as readonly string[]).includes(key)
      ) {
        throw new ShellError(
          "invalid_address",
          `address parameter '${key}' is not valid for module ${module}`,
        );
      }
      const value = decodeParamValue(raw);
      if (value.trim().length === 0) {
        throw new ShellError(
          "invalid_address",
          `address parameter '${key}' must carry a non-empty id`,
        );
      }
      seen.set(key, value);
    }
  }
  for (const key of grammar.required) {
    if (!seen.has(key)) {
      throw new ShellError(
        "invalid_address",
        `address for module ${module} requires the '${key}' parameter`,
      );
    }
  }
  return validateShellAddress(addressFromParams(shellModule, seen));
}

/** Rebuild the typed address from validated parameters. */
function addressFromParams(
  module: ShellModule,
  params: ReadonlyMap<string, string>,
): ShellAddress {
  const project = params.get("p") as string;
  switch (module) {
    case "context":
      return { module: "context", projectId: project };
    case "reality": {
      const version = params.get("v");
      const node = params.get("n");
      return {
        module: "reality",
        projectId: project,
        ...(version === undefined ? {} : { versionId: version }),
        ...(node === undefined ? {} : { nodeId: node }),
      };
    }
    case "boq":
      return { module: "boq", projectId: project, importId: params.get("i") as string };
    case "evidence":
      return {
        module: "evidence",
        projectId: project,
        evidenceId: params.get("e") as string,
      };
    case "case":
      return { module: "case", projectId: project, caseId: params.get("c") as string };
  }
}

/**
 * The canonical identity key of an address (its canonical string form —
 * format is injective by construction). Two addresses are the same
 * address exactly when their keys are equal.
 */
export function addressKey(address: ShellAddress): string {
  return formatShellAddress(address);
}

/* ------------------------------------------------------------------ */
/* Address builders (validated, verbatim ids)                          */
/* ------------------------------------------------------------------ */

/** Build the project-context address (the discovery entry point). */
export function contextAddress(projectId: string): ShellAddress {
  return validateShellAddress({ module: "context", projectId });
}

/** Build a reality address (version/node optional, verbatim ids). */
export function realityAddress(
  projectId: string,
  versionId?: string,
  nodeId?: string,
): ShellAddress {
  return validateShellAddress({
    module: "reality",
    projectId,
    ...(versionId === undefined ? {} : { versionId }),
    ...(nodeId === undefined ? {} : { nodeId }),
  });
}

/** Build a BOQ import address. */
export function boqAddress(projectId: string, importId: string): ShellAddress {
  return validateShellAddress({ module: "boq", projectId, importId });
}

/** Build an evidence record address. */
export function evidenceAddress(projectId: string, evidenceId: string): ShellAddress {
  return validateShellAddress({ module: "evidence", projectId, evidenceId });
}

/** Build an engineering case address. */
export function caseAddress(projectId: string, caseId: string): ShellAddress {
  return validateShellAddress({ module: "case", projectId, caseId });
}

/* ------------------------------------------------------------------ */
/* The breadcrumb session model                                         */
/* ------------------------------------------------------------------ */

/** One breadcrumb: an address the session visited, verbatim. */
export interface ShellBreadcrumb {
  readonly address: ShellAddress;
}

/** An immutable breadcrumb chain — the AISE-centered session (a VALUE). */
export interface ShellSession {
  readonly breadcrumbs: readonly ShellBreadcrumb[];
}

/** Validate a session (typed rejection; a session always has ≥ 1 crumb). */
export function validateShellSession(session: ShellSession): ShellSession {
  if (
    typeof session !== "object" ||
    session === null ||
    Array.isArray(session) ||
    !Array.isArray(session.breadcrumbs)
  ) {
    throw new ShellError("session_invalid", "session requires a breadcrumbs array");
  }
  const breadcrumbs = session.breadcrumbs;
  if (breadcrumbs.length === 0) {
    throw new ShellError("session_invalid", "session requires at least one breadcrumb");
  }
  for (const crumb of breadcrumbs) {
    if (typeof crumb !== "object" || crumb === null || Array.isArray(crumb)) {
      throw new ShellError("session_invalid", "every breadcrumb requires an address");
    }
    const address = (crumb as { address: unknown }).address;
    if (typeof address !== "object" || address === null || Array.isArray(address)) {
      throw new ShellError("session_invalid", "every breadcrumb requires an address");
    }
    // a structurally malformed address is reported with the precise
    // invalid_address code — the session surfaces it, never hides it
    validateShellAddress(crumb.address);
  }
  return session;
}

/** Begin a session at an entry address (the discovery step). */
export function beginShellSession(entry: ShellAddress): ShellSession {
  validateShellAddress(entry);
  return { breadcrumbs: [{ address: entry }] };
}

/**
 * Extend a session with the next visited address. A CONSECUTIVE repeat
 * returns the session unchanged (re-visiting where you already are is not
 * a new step); anything else appends — the prior context is always
 * preserved, never rewritten (append-only breadcrumbs).
 */
export function extendShellSession(
  session: ShellSession,
  next: ShellAddress,
): ShellSession {
  validateShellSession(session);
  validateShellAddress(next);
  const current = session.breadcrumbs[session.breadcrumbs.length - 1];
  if (current !== undefined && addressKey(current.address) === addressKey(next)) {
    return session;
  }
  return { breadcrumbs: [...session.breadcrumbs, { address: next }] };
}

/** The session's current address (its last breadcrumb). */
export function currentShellAddress(session: ShellSession): ShellAddress {
  const validated = validateShellSession(session);
  const last = validated.breadcrumbs[validated.breadcrumbs.length - 1];
  return (last as ShellBreadcrumb).address;
}

/** The session's breadcrumbs in visit order (verbatim, append-only). */
export function sessionBreadcrumbs(session: ShellSession): readonly ShellBreadcrumb[] {
  return validateShellSession(session).breadcrumbs;
}

/**
 * Does the session's breadcrumb chain contain this address (exact key
 * match)? Used by the walk test to prove the context is carried through
 * every step.
 */
export function sessionContainsAddress(session: ShellSession, address: ShellAddress): boolean {
  const validated = validateShellSession(session);
  const key = addressKey(address);
  return validated.breadcrumbs.some((crumb) => addressKey(crumb.address) === key);
}
