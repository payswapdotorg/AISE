/**
 * AISE-040 — the READ-ONLY data-access seam of the adoption shell.
 *
 * ⚠⚠⚠ THE SHELL HAS NO WRITE PATH, BY TYPE AND BY TEST ⚠⚠⚠
 *
 *  - `ShellPorts` is the ONLY way shell input is assembled, and every
 *    port exposes EXACTLY ONE READ member (`readContext`, `readReality`,
 *    `readBoqImport`, `readEvidence`, `readCase`, `decide`,
 *    `readBindings`). There is no create/save/transition member, no
 *    write flag, no fetch anywhere in this package: the type is the
 *    tripwire (unused `@ts-expect-error` directives in the tests are
 *    themselves compile errors, so the seam cannot silently grow a
 *    writer). The frozen `*_PORT_MEMBERS` registries pin the vocabulary
 *    exhaustively.
 *  - EVERY port is OPTIONAL: a deployment wires what it has. An absent
 *    data port renders its pane's TYPED OMISSION notice (port_absent) —
 *    never blank space, never fake data. An absent authorization port
 *    disables every connector action with the honest unknown reason
 *    (actions.ts). An absent connector-status port omits the connector
 *    panel.
 *  - `loadShellInput` assembles the render input from the session's
 *    CURRENT address: the context header (always attempted), the
 *    addressed pane (via the matching port), the connector surfaces
 *    (bindings + tri-state action offers paired with the current address
 *    as the return path). Every view arriving over the seam is VALIDATED
 *    (model.ts) — an unsourced or malformed view is a typed boundary
 *    rejection, never rendered, never repaired. Alignment is enforced:
 *    the addressed pane's ids must equal the pane view's ids VERBATIM
 *    (no second id scheme, no silent re-keying — the AISE-027 read-back
 *    discipline applied to every module).
 *  - The authorization TARGET is formed from the context record's
 *    organizationId + the addressed projectId (the AISE-036 project
 *    target shape). Without context there is no target — and the broker
 *    reports authorization-target-unknown instead of guessing.
 *
 * Determinism: no clock, no randomness, no IO beyond the injected ports;
 * the same port responses → byte-identical assembled input. Read order
 * is fixed (context → pane → bindings → authorization decisions in
 * binding/action order).
 */

import {
  pairConnectorAction,
  resolveConnectorActionOffer,
  type ConnectorActionOffer,
} from "./actions";
import {
  ShellError,
  validateAuthorizationDecision,
  validateBoqPaneView,
  validateCasePaneView,
  validateConnectorBindingView,
  validateContextPaneView,
  validateEvidencePaneView,
  validateRealityPaneView,
  validateShellOmission,
  type BoqPaneView,
  type CasePaneView,
  type ConnectorBindingView,
  type ContextPaneView,
  type EvidencePaneView,
  type RealityPaneView,
  type ShellAddress,
  type ShellAuthorizationDecision,
  type ShellAuthorizationRefusal,
  type ShellAuthorizationRequest,
  type ShellOmission,
} from "./model";
import type { ShellSession } from "./nav";
import { currentShellAddress, validateShellSession } from "./nav";

/* ------------------------------------------------------------------ */
/* The read-only port interfaces (one read member each)                */
/* ------------------------------------------------------------------ */

/** Reads the project-context pane view, or null when unresolved. */
export interface ShellContextPort {
  readonly readContext: (projectId: string) => Promise<ContextPaneView | null>;
}

/**
 * Reads one Reality Graph version snapshot (optionally addressing one
 * node), or null when the version does not resolve.
 */
export interface ShellRealityPort {
  readonly readReality: (
    projectId: string,
    versionId?: string,
    nodeId?: string,
  ) => Promise<RealityPaneView | null>;
}

/** Reads one BOQ import, or null when the import does not resolve. */
export interface ShellBoqPort {
  readonly readBoqImport: (projectId: string, importId: string) => Promise<BoqPaneView | null>;
}

/** Reads one evidence record, or null when it does not resolve. */
export interface ShellEvidencePort {
  readonly readEvidence: (projectId: string, evidenceId: string) => Promise<EvidencePaneView | null>;
}

/** Reads one engineering case, or null when it does not resolve. */
export interface ShellCasePort {
  readonly readCase: (projectId: string, caseId: string) => Promise<CasePaneView | null>;
}

/**
 * The injected AUTHORIZATION AUTHORITY relay (AISE-036 semantics):
 * decides one principal/permission/target question. The shell never
 * implements this — it only relays decisions, verbatim.
 */
export interface ShellAuthorizationPort {
  readonly decide: (request: ShellAuthorizationRequest) => Promise<ShellAuthorizationDecision>;
}

/**
 * Reads the project's connector binding surfaces (the external-system
 * status source: bindings, statuses, external record refs and the
 * deployment's action descriptors).
 */
export interface ShellConnectorStatusPort {
  readonly readBindings: (projectId: string) => Promise<readonly ConnectorBindingView[]>;
}

/** The complete (all-optional) injected port bundle. */
export interface ShellPorts {
  readonly context?: ShellContextPort;
  readonly reality?: ShellRealityPort;
  readonly boq?: ShellBoqPort;
  readonly evidence?: ShellEvidencePort;
  readonly case?: ShellCasePort;
  readonly authorization?: ShellAuthorizationPort;
  readonly connectorStatus?: ShellConnectorStatusPort;
}

/** The names of the seven ports (the registry key vocabulary). */
export const SHELL_PORT_NAMES = Object.freeze([
  "context",
  "reality",
  "boq",
  "evidence",
  "case",
  "authorization",
  "connectorStatus",
] as const);
export type ShellPortName = (typeof SHELL_PORT_NAMES)[number];

/** The exhaustive, frozen member registry of every read-only seam port. */
export const SHELL_PORT_MEMBERS: Readonly<Record<ShellPortName, readonly string[]>> =
  Object.freeze({
    context: Object.freeze(["readContext"]),
    reality: Object.freeze(["readReality"]),
    boq: Object.freeze(["readBoqImport"]),
    evidence: Object.freeze(["readEvidence"]),
    case: Object.freeze(["readCase"]),
    authorization: Object.freeze(["decide"]),
    connectorStatus: Object.freeze(["readBindings"]),
  });

/* ------------------------------------------------------------------ */
/* The assembled shell input (the render model)                        */
/* ------------------------------------------------------------------ */

/** The addressed pane's data (module-tagged, validated view). */
export type ShellPaneData =
  | { readonly module: "context"; readonly view: ContextPaneView }
  | { readonly module: "reality"; readonly view: RealityPaneView }
  | { readonly module: "boq"; readonly view: BoqPaneView }
  | { readonly module: "evidence"; readonly view: EvidencePaneView }
  | { readonly module: "case"; readonly view: CasePaneView };

/** One connector surface: the binding + its tri-state action offers. */
export interface ConnectorSurfaceView {
  readonly binding: ConnectorBindingView;
  readonly offers: readonly ConnectorActionOffer[];
}

/**
 * EVERYTHING the shell renders for one step of one session: the session
 * (breadcrumb chain), the context header data (or null), the addressed
 * pane (or null — its omission explains), the connector surfaces and the
 * typed honest omissions. Assembled ONLY by `loadShellInput` over the
 * injected ports; the render is a pure projection of this value.
 */
export interface ShellInput {
  readonly session: ShellSession;
  readonly context: ContextPaneView | null;
  readonly pane: ShellPaneData | null;
  readonly connectors: readonly ConnectorSurfaceView[];
  readonly omissions: readonly ShellOmission[];
}

/* ------------------------------------------------------------------ */
/* Assembly                                                             */
/* ------------------------------------------------------------------ */

/** Options for `loadShellInput`. */
export interface LoadShellOptions {
  /** The AISE-centered session (its CURRENT address is the pane shown). */
  readonly session: ShellSession;
  /** The acting principal (named in every authorization question). */
  readonly principalId: string;
}

/** Validate the port bundle's shape (a present port must be a read port). */
function requirePorts(ports: ShellPorts): void {
  if (typeof ports !== "object" || ports === null || Array.isArray(ports)) {
    throw new ShellError("invalid_input", "ports must be an object");
  }
  const pairs: readonly [ShellPortName, unknown, string][] = [
    ["context", ports.context, "readContext"],
    ["reality", ports.reality, "readReality"],
    ["boq", ports.boq, "readBoqImport"],
    ["evidence", ports.evidence, "readEvidence"],
    ["case", ports.case, "readCase"],
    ["authorization", ports.authorization, "decide"],
    ["connectorStatus", ports.connectorStatus, "readBindings"],
  ];
  for (const [name, port, member] of pairs) {
    if (port === undefined) {
      continue;
    }
    if (typeof port !== "object" || port === null || Array.isArray(port)) {
      throw new ShellError("invalid_input", `${name} port must be an object`);
    }
    if (typeof (port as Record<string, unknown>)[member] !== "function") {
      throw new ShellError(
        "invalid_input",
        `${name} port must expose its read member '${member}'`,
      );
    }
  }
}

/** Validate the load options (typed invalid_input). */
function requireOptions(options: LoadShellOptions): void {
  if (typeof options.principalId !== "string" || options.principalId.trim().length === 0) {
    throw new ShellError("invalid_input", "principalId must be a non-empty string");
  }
  validateShellSession(options.session);
}

/**
 * Assemble the shell input over the injected READ-ONLY ports:
 *
 *  1. validate ports + options (typed rejections);
 *  2. read the CONTEXT record for the current project (the header —
 *     attempted on every step; absent port / null record ⇒ typed omission);
 *  3. read the ADDRESSED pane via its matching port (context reuses the
 *     step-2 read — one read per record per step); validate every view
 *     (the source-reference discipline) and CROSS-CHECK the view's ids
 *     against the address VERBATIM;
 *  4. read the CONNECTOR BINDINGS and pair every deployment action with
 *     the current address as its return path, resolving each offer's
 *     tri-state through the authorization port;
 *  5. return the assembled `ShellInput` (session + context + pane +
 *     connectors + omissions).
 */
export async function loadShellInput(
  ports: ShellPorts,
  options: LoadShellOptions,
): Promise<ShellInput> {
  requirePorts(ports);
  requireOptions(options);
  const session = options.session;
  const current: ShellAddress = currentShellAddress(session);
  const projectId = current.projectId;
  const omissions: ShellOmission[] = [];

  /* --- 1. the context header -------------------------------------- */
  let context: ContextPaneView | null = null;
  if (ports.context === undefined) {
    omissions.push({
      pane: "context",
      reason: "port_absent",
      detail: "the context data port is not available in this deployment",
    });
  } else {
    const raw = await ports.context.readContext(projectId);
    if (raw === null) {
      omissions.push({
        pane: "context",
        reason: "record_unresolved",
        detail: `the context record for project ${projectId} did not resolve`,
      });
    } else {
      context = validateContextPaneView(raw);
    }
  }

  /* --- 2. the addressed pane -------------------------------------- */
  let pane: ShellPaneData | null = null;
  if (current.module === "context") {
    if (context !== null) {
      pane = { module: "context", view: context };
    }
  } else if (current.module === "reality") {
    pane = await loadRealityPane(ports, current, omissions);
  } else if (current.module === "boq") {
    pane = await loadBoqPane(ports, current, omissions);
  } else if (current.module === "evidence") {
    pane = await loadEvidencePane(ports, current, omissions);
  } else {
    pane = await loadCasePane(ports, current, omissions);
  }

  /* --- 3. the connector surfaces ---------------------------------- */
  const connectors: ConnectorSurfaceView[] = [];
  if (ports.connectorStatus === undefined) {
    omissions.push({
      pane: "connectors",
      reason: "port_absent",
      detail: "the connector-status port is not available in this deployment",
    });
  } else {
    const bindings = await ports.connectorStatus.readBindings(projectId);
    if (!Array.isArray(bindings)) {
      throw new ShellError("invalid_input", "connector bindings must be an array");
    }
    const target =
      context === null
        ? null
        : { kind: "project", organizationId: context.organizationId, projectId } as const;
    for (const rawBinding of bindings) {
      const binding = validateConnectorBindingView(rawBinding);
      const offers: ConnectorActionOffer[] = [];
      for (const descriptor of binding.actions) {
        const action = pairConnectorAction(descriptor, binding.bindingId, current);
        offers.push(
          await resolveConnectorActionOffer(
            ports.authorization,
            action,
            options.principalId,
            target,
          ),
        );
      }
      connectors.push({ binding, offers });
    }
  }

  for (const omission of omissions) {
    validateShellOmission(omission);
  }
  return { session, context, pane, connectors, omissions };
}

/* ------------------------------------------------------------------ */
/* Per-pane loaders (validate + verbatim id cross-check)               */
/* ------------------------------------------------------------------ */

async function loadRealityPane(
  ports: ShellPorts,
  address: ShellAddress,
  omissions: ShellOmission[],
): Promise<ShellPaneData | null> {
  if (address.module !== "reality") {
    throw new ShellError("invalid_input", "reality pane requires a reality address");
  }
  if (ports.reality === undefined) {
    omissions.push({
      pane: "reality",
      reason: "port_absent",
      detail: "the reality data port is not available in this deployment",
    });
    return null;
  }
  const raw = await ports.reality.readReality(
    address.projectId,
    address.versionId,
    address.nodeId,
  );
  if (raw === null) {
    omissions.push({
      pane: "reality",
      reason: "record_unresolved",
      detail: `the reality snapshot for project ${address.projectId}${
        address.versionId === undefined ? "" : ` version ${address.versionId}`
      } did not resolve`,
    });
    return null;
  }
  const view = validateRealityPaneView(raw);
  if (view.projectId !== address.projectId) {
    throw new ShellError(
      "invalid_input",
      `reality view project ${view.projectId} disagrees with the addressed project ${address.projectId}`,
    );
  }
  if (address.versionId !== undefined && view.versionId !== address.versionId) {
    throw new ShellError(
      "invalid_input",
      `reality view version ${view.versionId} disagrees with the addressed version ${address.versionId}`,
    );
  }
  return { module: "reality", view };
}

async function loadBoqPane(
  ports: ShellPorts,
  address: ShellAddress,
  omissions: ShellOmission[],
): Promise<ShellPaneData | null> {
  if (address.module !== "boq") {
    throw new ShellError("invalid_input", "boq pane requires a boq address");
  }
  if (ports.boq === undefined) {
    omissions.push({
      pane: "boq",
      reason: "port_absent",
      detail: "the boq data port is not available in this deployment",
    });
    return null;
  }
  const raw = await ports.boq.readBoqImport(address.projectId, address.importId);
  if (raw === null) {
    omissions.push({
      pane: "boq",
      reason: "record_unresolved",
      detail: `the boq import ${address.importId} did not resolve`,
    });
    return null;
  }
  const view = validateBoqPaneView(raw);
  if (view.projectId !== address.projectId || view.importId !== address.importId) {
    throw new ShellError(
      "invalid_input",
      `boq view identity (${view.projectId}, ${view.importId}) disagrees with the address (${address.projectId}, ${address.importId})`,
    );
  }
  return { module: "boq", view };
}

async function loadEvidencePane(
  ports: ShellPorts,
  address: ShellAddress,
  omissions: ShellOmission[],
): Promise<ShellPaneData | null> {
  if (address.module !== "evidence") {
    throw new ShellError("invalid_input", "evidence pane requires an evidence address");
  }
  if (ports.evidence === undefined) {
    omissions.push({
      pane: "evidence",
      reason: "port_absent",
      detail: "the evidence data port is not available in this deployment",
    });
    return null;
  }
  const raw = await ports.evidence.readEvidence(address.projectId, address.evidenceId);
  if (raw === null) {
    omissions.push({
      pane: "evidence",
      reason: "record_unresolved",
      detail: `the evidence record ${address.evidenceId} did not resolve`,
    });
    return null;
  }
  const view = validateEvidencePaneView(raw);
  if (view.projectId !== address.projectId || view.evidenceId !== address.evidenceId) {
    throw new ShellError(
      "invalid_input",
      `evidence view identity (${view.projectId}, ${view.evidenceId}) disagrees with the address (${address.projectId}, ${address.evidenceId})`,
    );
  }
  return { module: "evidence", view };
}

async function loadCasePane(
  ports: ShellPorts,
  address: ShellAddress,
  omissions: ShellOmission[],
): Promise<ShellPaneData | null> {
  if (address.module !== "case") {
    throw new ShellError("invalid_input", "case pane requires a case address");
  }
  if (ports.case === undefined) {
    omissions.push({
      pane: "case",
      reason: "port_absent",
      detail: "the case data port is not available in this deployment",
    });
    return null;
  }
  const raw = await ports.case.readCase(address.projectId, address.caseId);
  if (raw === null) {
    omissions.push({
      pane: "case",
      reason: "record_unresolved",
      detail: `the engineering case ${address.caseId} did not resolve`,
    });
    return null;
  }
  const view = validateCasePaneView(raw);
  if (view.projectId !== address.projectId || view.caseId !== address.caseId) {
    throw new ShellError(
      "invalid_input",
      `case view identity (${view.projectId}, ${view.caseId}) disagrees with the address (${address.projectId}, ${address.caseId})`,
    );
  }
  return { module: "case", view };
}

/* ------------------------------------------------------------------ */
/* Input validation for the render boundary                             */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a fully assembled `ShellInput` (the render's boundary check):
 * session, context, pane, connectors, omissions — plus the alignment
 * cross-checks (the pane's ids must match the current address verbatim;
 * a context pane requires the context record; every offer's action must
 * belong to its surface's binding). Typed rejections only; never repairs.
 */
export function validateShellInput(input: ShellInput): ShellInput {
  if (!isRecord(input)) {
    throw new ShellError("invalid_input", "shell input must be an object");
  }
  const session = validateShellSession(input.session);
  const current = currentShellAddress(session);
  if (input.context !== null && !isRecord(input.context)) {
    throw new ShellError("invalid_input", "context must be an object or null");
  }
  if (input.context !== null) {
    validateContextPaneView(input.context);
  }
  if (input.pane !== null && !isRecord(input.pane)) {
    throw new ShellError("invalid_input", "pane must be an object or null");
  }
  if (input.pane !== null) {
    const pane = input.pane;
    if (pane.module === "context") {
      validateContextPaneView(pane.view);
      if (input.context === null) {
        throw new ShellError(
          "invalid_input",
          "a context pane requires the context record",
        );
      }
      if (pane.view.projectId !== current.projectId) {
        throw new ShellError(
          "invalid_input",
          "the context pane must belong to the addressed project",
        );
      }
    } else if (pane.module === "reality") {
      const view = validateRealityPaneView(pane.view);
      if (view.projectId !== current.projectId) {
        throw new ShellError("invalid_input", "reality pane project must match the address");
      }
      if (current.module === "reality" && current.versionId !== undefined) {
        if (view.versionId !== current.versionId) {
          throw new ShellError(
            "invalid_input",
            "reality pane version must match the address",
          );
        }
      }
    } else if (pane.module === "boq") {
      const view = validateBoqPaneView(pane.view);
      if (
        current.module !== "boq" ||
        view.projectId !== current.projectId ||
        view.importId !== current.importId
      ) {
        throw new ShellError("invalid_input", "boq pane identity must match the address");
      }
    } else if (pane.module === "evidence") {
      const view = validateEvidencePaneView(pane.view);
      if (
        current.module !== "evidence" ||
        view.projectId !== current.projectId ||
        view.evidenceId !== current.evidenceId
      ) {
        throw new ShellError("invalid_input", "evidence pane identity must match the address");
      }
    } else if (pane.module === "case") {
      const view = validateCasePaneView(pane.view);
      if (
        current.module !== "case" ||
        view.projectId !== current.projectId ||
        view.caseId !== current.caseId
      ) {
        throw new ShellError("invalid_input", "case pane identity must match the address");
      }
    } else {
      throw new ShellError("invalid_input", "pane module is not a shell module");
    }
  }
  if (!Array.isArray(input.connectors)) {
    throw new ShellError("invalid_input", "shell input requires a connectors array");
  }
  for (const surface of input.connectors) {
    if (!isRecord(surface)) {
      throw new ShellError("invalid_input", "connector surface must be an object");
    }
    const binding = validateConnectorBindingView(surface.binding as ConnectorBindingView);
    if (!Array.isArray(surface.offers)) {
      throw new ShellError("invalid_input", "connector surface requires an offers array");
    }
    for (const offer of surface.offers) {
      validateOffer(offer as ConnectorActionOffer, binding.bindingId);
    }
  }
  if (!Array.isArray(input.omissions)) {
    throw new ShellError("invalid_input", "shell input requires an omissions array");
  }
  for (const omission of input.omissions) {
    validateShellOmission(omission as ShellOmission);
  }
  return input;
}

/** Validate one brokered offer against its owning binding. */
function validateOffer(offer: unknown, bindingId: string): void {
  if (!isRecord(offer)) {
    throw new ShellError("invalid_input", "action offer must be an object");
  }
  const action = offer.action;
  if (!isRecord(action)) {
    throw new ShellError("invalid_input", "offer action must be an object");
  }
  if (action.bindingId !== bindingId) {
    throw new ShellError(
      "invalid_input",
      "offer action bindingId must match its surface binding",
    );
  }
  const state = offer.state;
  if (!isRecord(state)) {
    throw new ShellError("invalid_input", "offer state must be an object");
  }
  const kind = state.kind;
  if (kind === "allowed") {
    return; // the grant was validated with the decision inside the broker
  }
  if (kind === "refused") {
    validateAuthorizationDecision({
      allowed: false,
      refusal: state.refusal as ShellAuthorizationRefusal,
    });
    return;
  }
  if (kind === "unavailable") {
    const reason = state.reason;
    if (reason !== "authorization-port-absent" && reason !== "authorization-target-unknown") {
      throw new ShellError(
        "invalid_input",
        "unavailable offer requires a known unavailable reason",
      );
    }
    return;
  }
  throw new ShellError("invalid_input", "offer state kind must be allowed|refused|unavailable");
}
