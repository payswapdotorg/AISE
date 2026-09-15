/**
 * AISE-040 — primary-interface adoption shell: STRUCTURAL MODEL.
 *
 * ⚠⚠⚠ NO BROWSER-SIDE AUTHORITY (frozen invariant, spec/architecture-lock.md
 * "Authority" #8: "UI state, mobile state and exported files are not
 * canonical authorities") ⚠⚠⚠
 *
 * ⚠⚠⚠ THE SHELL IS PRESENTATION, NEVER AUTHORITY (work order §040) ⚠⚠⚠
 *
 * Everything in this module is READ-ONLY DISPLAY DATA. The shell NEVER
 * fetches, NEVER mutates, NEVER records and NEVER holds authoritative
 * client state. All facts arrive through INJECTED READ-ONLY PORTS
 * (ports.ts — the seam this module types): project context, reality
 * snapshots, BOQ imports, evidence records, engineering cases, connector
 * binding surfaces and authorization decisions. Making UI/client state
 * authoritative is an Architecture Change trigger — this module is built
 * so it CANNOT be: there is no write member, no fetch, no clock and no
 * randomness anywhere under apps/web/src/shell/.
 *
 * BOUNDARY MATRIX (tools/lib/boundaries.ts): apps may import apps/packages
 * ONLY — apps/web CANNOT import backend/api sources. Therefore the types
 * below are STRUCTURAL MIRRORS of the backend shapes (same field names,
 * same JSON shapes, defined locally; a serialized backend record satisfies
 * them as-is via structural typing). Mirrored vocabularies are carried
 * VERBATIM as plain strings — a re-validated or re-derived copy would be
 * a SECOND CANONICAL MODEL, which the worker rules forbid:
 *
 *   - identity/authorization semantics mirror AISE-036
 *     (backend/api/src/identity/model.ts): `ShellPermissionGrant`,
 *     `ShellAuthorizationRefusal`, `ShellAuthorizationDecision`,
 *     `ShellMembershipScope`, `ShellPermissionTarget` — same field names,
 *     same shapes; permission strings ("reality:write" &c.) and refusal
 *     codes ("cross_tenant" &c.) are the identity vocabulary carried
 *     verbatim, NEVER re-validated here. The authorization AUTHORITY stays
 *     in the identity module; the shell only relays its decisions.
 *   - integration vocabulary mirrors AISE-037
 *     (backend/api/src/integrations/model.ts + spec/domain-model.md
 *     "Integration semantics"): system classes ("bim-ifc" &c.),
 *     capabilities ("export-derived" &c.) and the ExternalReference fields
 *     (system class, instance id, VERBATIM incumbent record id, revision)
 *     are carried verbatim. The incumbent system remains the SYSTEM OF
 *     RECORD for its own data (lock "Authority" #9) — the shell renders
 *     explicit references, never a competing truth.
 *   - epistemic statuses (OBSERVED/INFERRED/CONFIRMED) are the canonical
 *     vocabulary carried verbatim on reality nodes.
 *
 * The ONLY vocabularies defined HERE are the shell's OWN presentation
 * vocabularies (documented attribution, no second canonical model): the
 * deep-link module set, the omission reason codes, the binding-status
 * display states (connected / unavailable / unknown-last-sync — the
 * honest external-system status vocabulary §040 demands), the connector
 * action kinds (mirroring the AISE-037 capability names plus the shell's
 * own "open-record"), and the typed error registry.
 *
 * SOURCE-REFERENCE DISCIPLINE (the loud §040 rule): every displayed value
 * carries its source reference (which module/record it came from) — a
 * value without a source reference is a TYPED BOUNDARY REJECTION
 * (`source_reference_required`), never rendered. Structurally, every
 * display scalar in a pane view is a `SourcedValue` carrying its
 * `SourceRef` (module + verbatim record id); structural identity fields
 * (ids used for deep links) and record-structural counts (array lengths)
 * are covered by their owning record's `source`. The validators below
 * enforce the discipline at every boundary (port assembly AND render,
 * mirroring the AISE-027 viewer's typed-parameter `requireInput`
 * convention); they reject, they never repair.
 *
 * FILE PLACEMENT NOTE: the §040 work-order design sketch places the typed
 * error/omission registry in model.ts (the sibling apps/web exemplars use
 * a separate errors.ts; the work order is the more specific instruction
 * for this module, so the registry lives HERE).
 */

/* ------------------------------------------------------------------ */
/* Typed error registry (the ONLY error vocabulary of the shell)      */
/* ------------------------------------------------------------------ */

/**
 * Stable shell error codes — never bare string errors. Mirrors the
 * ViewerError/WorkspaceError/BoqLensError convention of the sibling
 * apps/web modules.
 *
 *  - invalid_input             — malformed shell input/options/records
 *  - invalid_address           — malformed deep-link address (text or
 *                                structure); NEVER a silent fallback
 *  - source_reference_required — a display value arrived without its
 *                                source reference (the discipline tripwire)
 *  - session_invalid           — malformed breadcrumb session
 */
export const SHELL_ERROR_CODES = Object.freeze([
  "invalid_input",
  "invalid_address",
  "source_reference_required",
  "session_invalid",
] as const satisfies readonly string[]);
export type ShellErrorCode = (typeof SHELL_ERROR_CODES)[number];

/** Typed rejection carrying a stable code. */
export class ShellError extends Error {
  readonly code: ShellErrorCode;
  readonly detail: string;

  constructor(code: ShellErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ShellError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Internal record helpers                                              */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecordId(value: unknown): value is string {
  // Record ids are non-empty strings; whitespace-only ids are absent ids.
  return typeof value === "string" && value.trim().length > 0;
}

/* ------------------------------------------------------------------ */
/* Source references (the display-value discipline)                    */
/* ------------------------------------------------------------------ */

/**
 * The frozen source-module registry: which AISE module/record family a
 * displayed value came from. "integration" covers connector bindings and
 * external record references (AISE-037); "identity" covers authorization
 * grants/refusals (AISE-036).
 */
export const SOURCE_MODULES = Object.freeze([
  "context",
  "reality",
  "boq",
  "evidence",
  "case",
  "integration",
  "identity",
] as const);
export type SourceModule = (typeof SOURCE_MODULES)[number];

/**
 * Where a displayed value came from: the module family + the VERBATIM
 * record id (no second id scheme — the same id the owning module uses).
 */
export interface SourceRef {
  readonly module: SourceModule;
  readonly recordId: string;
}

/**
 * A displayed value with its source. Every display scalar in every pane
 * view is one of these; the validators reject a value without a source.
 */
export interface SourcedValue<T> {
  readonly value: T;
  readonly source: SourceRef;
}

/** Validate a source reference (typed rejection, never a repair). */
export function validateSourceRef(source: SourceRef): SourceRef {
  if (!isRecord(source)) {
    throw new ShellError("source_reference_required", "source must be an object");
  }
  if (
    typeof source.module !== "string" ||
    !(SOURCE_MODULES as readonly string[]).includes(source.module)
  ) {
    throw new ShellError(
      "source_reference_required",
      `source.module must be one of: ${SOURCE_MODULES.join(", ")}`,
    );
  }
  if (!isRecordId(source.recordId)) {
    throw new ShellError(
      "source_reference_required",
      "source.recordId must be a non-empty string",
    );
  }
  return source;
}

/** Validate a sourced text value (non-empty string + valid source). */
export function validateSourcedText(value: SourcedValue<string>): SourcedValue<string> {
  if (!isRecord(value)) {
    throw new ShellError("source_reference_required", "sourced value must be an object");
  }
  if (typeof value.value !== "string" || value.value.length === 0) {
    throw new ShellError("source_reference_required", "sourced text requires a value");
  }
  validateSourceRef(value.source);
  return value;
}

/** Validate a sourced numeric value (finite number + valid source). */
export function validateSourcedNumber(value: SourcedValue<number>): SourcedValue<number> {
  if (!isRecord(value)) {
    throw new ShellError("source_reference_required", "sourced value must be an object");
  }
  if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
    throw new ShellError("source_reference_required", "sourced number requires a finite value");
  }
  validateSourceRef(value.source);
  return value;
}

/** Validate a list of sourced text values (deterministic, order verbatim). */
export function validateSourcedTextList(
  values: readonly SourcedValue<string>[],
  field: string,
): readonly SourcedValue<string>[] {
  if (!Array.isArray(values)) {
    throw new ShellError("source_reference_required", `${field} must be an array`);
  }
  for (const entry of values) {
    validateSourcedText(entry);
  }
  return values;
}

/* ------------------------------------------------------------------ */
/* Deep-link modules and addresses (typed structures)                  */
/* ------------------------------------------------------------------ */

/**
 * The frozen deep-link module set — the five inspectable §040 surfaces.
 * Entity ids inside addresses are the owning modules' VERBATIM ids (no
 * second id scheme): a reality address carries the Reality Graph's own
 * `versionId`/`nodeId`, a BOQ address the import's own `importId`, &c.
 */
export const SHELL_MODULES = Object.freeze([
  "context",
  "reality",
  "boq",
  "evidence",
  "case",
] as const);
export type ShellModule = (typeof SHELL_MODULES)[number];

/**
 * One stable, module-scoped shell deep link. The string codec lives in
 * nav.ts (`formatShellAddress` / `parseShellAddress`); this is the typed
 * structure. Optional members are ABSENT (not undefined) when unused.
 */
export type ShellAddress =
  | { readonly module: "context"; readonly projectId: string }
  | {
      readonly module: "reality";
      readonly projectId: string;
      readonly versionId?: string;
      readonly nodeId?: string;
    }
  | { readonly module: "boq"; readonly projectId: string; readonly importId: string }
  | {
      readonly module: "evidence";
      readonly projectId: string;
      readonly evidenceId: string;
    }
  | { readonly module: "case"; readonly projectId: string; readonly caseId: string };

/** Per-module required id fields (projectId is always required). */
function requiredAddressFields(module: ShellModule): readonly string[] {
  switch (module) {
    case "context":
    case "reality":
      return [];
    case "boq":
      return ["importId"];
    case "evidence":
      return ["evidenceId"];
    case "case":
      return ["caseId"];
  }
}

/** Per-module optional id fields. */
function optionalAddressFields(module: ShellModule): readonly string[] {
  switch (module) {
    case "context":
    case "boq":
    case "evidence":
    case "case":
      return [];
    case "reality":
      return ["versionId", "nodeId"];
  }
}

/** Per-module allowed property names (for strict validation). */
const ALLOWED_ADDRESS_FIELDS: Readonly<Record<ShellModule, readonly string[]>> =
  Object.freeze({
    context: ["module", "projectId"],
    reality: ["module", "projectId", "versionId", "nodeId"],
    boq: ["module", "projectId", "importId"],
    evidence: ["module", "projectId", "evidenceId"],
    case: ["module", "projectId", "caseId"],
  });

/**
 * Validate a shell address STRUCTURE (typed rejection; strict — unknown
 * properties are rejected, never silently dropped). Used by the address
 * builders, the session model and the assembly seam.
 */
export function validateShellAddress(address: ShellAddress): ShellAddress {
  if (!isRecord(address)) {
    throw new ShellError("invalid_address", "address must be an object");
  }
  const module = address.module;
  if (typeof module !== "string" || !(SHELL_MODULES as readonly string[]).includes(module)) {
    throw new ShellError(
      "invalid_address",
      `address.module must be one of: ${SHELL_MODULES.join(", ")}`,
    );
  }
  const shellModule = module as ShellModule;
  const allowed = ALLOWED_ADDRESS_FIELDS[shellModule];
  for (const key of Object.keys(address)) {
    if (!(allowed as readonly string[]).includes(key)) {
      throw new ShellError(
        "invalid_address",
        `unknown address field '${key}' for module ${module}`,
      );
    }
  }
  const record = address as unknown as Record<string, unknown>;
  if (!isRecordId(record.projectId)) {
    throw new ShellError("invalid_address", "address requires a non-empty projectId");
  }
  for (const field of requiredAddressFields(shellModule)) {
    if (!isRecordId(record[field])) {
      throw new ShellError(
        "invalid_address",
        `address for module ${module} requires a non-empty ${field}`,
      );
    }
  }
  for (const field of optionalAddressFields(shellModule)) {
    if (record[field] !== undefined && !isRecordId(record[field])) {
      throw new ShellError(
        "invalid_address",
        `address field '${field}' must be a non-empty string when present`,
      );
    }
  }
  return address;
}

/* ------------------------------------------------------------------ */
/* Honest omission codes (absent ports / unresolved records)           */
/* ------------------------------------------------------------------ */

/**
 * The surfaces that can carry an honest omission: the five panes plus
 * the connector panel.
 */
export const SHELL_OMISSION_PANES = Object.freeze([
  ...SHELL_MODULES,
  "connectors",
] as const);
export type ShellOmissionPane = (typeof SHELL_OMISSION_PANES)[number];

/**
 * The frozen omission reason vocabulary — the §040 "honest omissions"
 * contract: a pane whose data port is ABSENT (not wired in this
 * deployment) or whose addressed record did not resolve renders a TYPED
 * omission notice — never blank space, never a spinner, never fake data.
 */
export const SHELL_OMISSION_REASONS = Object.freeze([
  "port_absent",
  "record_unresolved",
] as const);
export type ShellOmissionReason = (typeof SHELL_OMISSION_REASONS)[number];

/** One typed honest omission. */
export interface ShellOmission {
  readonly pane: ShellOmissionPane;
  readonly reason: ShellOmissionReason;
  readonly detail: string;
}

/** Validate one omission (typed rejection). */
export function validateShellOmission(omission: ShellOmission): ShellOmission {
  if (!isRecord(omission)) {
    throw new ShellError("invalid_input", "omission must be an object");
  }
  if (
    typeof omission.pane !== "string" ||
    !(SHELL_OMISSION_PANES as readonly string[]).includes(omission.pane)
  ) {
    throw new ShellError(
      "invalid_input",
      `omission.pane must be one of: ${SHELL_OMISSION_PANES.join(", ")}`,
    );
  }
  if (
    typeof omission.reason !== "string" ||
    !(SHELL_OMISSION_REASONS as readonly string[]).includes(omission.reason)
  ) {
    throw new ShellError(
      "invalid_input",
      `omission.reason must be one of: ${SHELL_OMISSION_REASONS.join(", ")}`,
    );
  }
  if (!isNonEmptyString(omission.detail)) {
    throw new ShellError("invalid_input", "omission requires a non-empty detail");
  }
  return omission;
}

/* ------------------------------------------------------------------ */
/* External-system status (explicit, honest)                           */
/* ------------------------------------------------------------------ */

/**
 * The frozen binding-status display vocabulary — §040's "explicit
 * external-system status": connected / unavailable / unknown-last-sync.
 * "unknown-last-sync" is a FIRST-CLASS status and is NEVER rendered as
 * connected; the incumbent system stays the system of record for its own
 * data in every state.
 */
export const BINDING_STATUSES = Object.freeze([
  "connected",
  "unavailable",
  "unknown-last-sync",
] as const);
export type BindingStatus = (typeof BINDING_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Connector action kinds (presentation vocabulary)                    */
/* ------------------------------------------------------------------ */

/**
 * The connector action kinds the shell can offer. "export-derived",
 * "import-entities" and "import-documents" mirror the AISE-037
 * `ADAPTER_CAPABILITIES` names verbatim (documented attribution);
 * "open-record" is the shell's own presentation kind for opening an
 * incumbent record from AISE. Which actions exist is DEPLOYMENT data
 * (supplied by the connector-status port); the shell never invents
 * actions.
 */
export const CONNECTOR_ACTION_KINDS = Object.freeze([
  "export-derived",
  "import-entities",
  "import-documents",
  "open-record",
] as const);
export type ConnectorActionKind = (typeof CONNECTOR_ACTION_KINDS)[number];

/* ------------------------------------------------------------------ */
/* Authorization decision mirror (AISE-036 structural mirror)          */
/* ------------------------------------------------------------------ */

/**
 * Where a membership (and its role's permissions) applies — structural
 * mirror of AISE-036 `MembershipScope`. Carried verbatim inside grants;
 * never interpreted here.
 */
export type ShellMembershipScope =
  | { readonly kind: "organization" }
  | { readonly kind: "project"; readonly projectId: string };

/**
 * What an authorization decision is about — structural mirror of AISE-036
 * `PermissionTarget` (always names the org; a project target names both).
 */
export type ShellPermissionTarget =
  | { readonly kind: "organization"; readonly organizationId: string }
  | {
      readonly kind: "project";
      readonly organizationId: string;
      readonly projectId: string;
    };

/**
 * The grant that satisfied an allowed authorization — structural mirror
 * of AISE-036 `PermissionGrant`. `permission` is the identity vocabulary
 * verbatim (e.g. "reality:write"); least-privilege selection stays the
 * identity module's authority.
 */
export interface ShellPermissionGrant {
  readonly membershipId: string;
  readonly roleId: string;
  readonly permission: string;
  readonly scope: ShellMembershipScope;
}

/**
 * A typed refusal — structural mirror of AISE-036 `AuthorizationRefusal`.
 * `code` is the identity refusal vocabulary verbatim (e.g.
 * "cross_tenant", "missing_permission"); the shell NAMES it in the UI,
 * never interprets it.
 */
export interface ShellAuthorizationRefusal {
  readonly code: string;
  readonly detail: string;
  readonly principalId: string;
  readonly target: ShellPermissionTarget;
}

/**
 * The authorization decision — structural mirror of AISE-036
 * `AuthorizationDecision`: allowed with the satisfying grant, or refused
 * with a typed refusal. Never a blanket error, never silent.
 */
export type ShellAuthorizationDecision =
  | { readonly allowed: true; readonly grant: ShellPermissionGrant }
  | { readonly allowed: false; readonly refusal: ShellAuthorizationRefusal };

/** What the shell asks the authorization port (principal/permission/target). */
export interface ShellAuthorizationRequest {
  readonly principalId: string;
  readonly permission: string;
  readonly target: ShellPermissionTarget;
}

/** Validate a permission target shape (typed rejection). */
export function validatePermissionTarget(target: ShellPermissionTarget): ShellPermissionTarget {
  if (!isRecord(target)) {
    throw new ShellError("invalid_input", "permission target must be an object");
  }
  if (target.kind === "organization") {
    if (!isRecordId(target.organizationId)) {
      throw new ShellError("invalid_input", "organization target requires organizationId");
    }
    return target;
  }
  if (target.kind === "project") {
    if (!isRecordId(target.organizationId) || !isRecordId(target.projectId)) {
      throw new ShellError("invalid_input", "project target requires organizationId+projectId");
    }
    return target;
  }
  throw new ShellError("invalid_input", "permission target kind must be organization|project");
}

/**
 * Validate an authorization decision arriving over the seam (the broker
 * re-checks; the identity module stays the authority — this is a SHAPE
 * check, never a semantics check).
 */
export function validateAuthorizationDecision(
  decision: ShellAuthorizationDecision,
): ShellAuthorizationDecision {
  if (!isRecord(decision)) {
    throw new ShellError("invalid_input", "authorization decision must be an object");
  }
  if (decision.allowed === true) {
    const grant = decision.grant;
    if (!isRecord(grant)) {
      throw new ShellError("invalid_input", "allowed decision requires a grant");
    }
    if (
      !isRecordId(grant.membershipId) ||
      !isRecordId(grant.roleId) ||
      !isNonEmptyString(grant.permission)
    ) {
      throw new ShellError("invalid_input", "grant requires membershipId, roleId, permission");
    }
    validateScope(grant.scope);
    return decision;
  }
  if (decision.allowed === false) {
    const refusal = decision.refusal;
    if (!isRecord(refusal)) {
      throw new ShellError("invalid_input", "refused decision requires a refusal");
    }
    if (
      !isNonEmptyString(refusal.code) ||
      !isNonEmptyString(refusal.detail) ||
      !isRecordId(refusal.principalId)
    ) {
      throw new ShellError(
        "invalid_input",
        "refusal requires code, detail and principalId",
      );
    }
    validatePermissionTarget(refusal.target);
    return decision;
  }
  throw new ShellError("invalid_input", "authorization decision requires allowed: true|false");
}

function validateScope(scope: ShellMembershipScope): ShellMembershipScope {
  if (!isRecord(scope)) {
    throw new ShellError("invalid_input", "grant scope must be an object");
  }
  if (scope.kind === "organization") {
    return scope;
  }
  if (scope.kind === "project") {
    if (!isRecordId(scope.projectId)) {
      throw new ShellError("invalid_input", "project scope requires projectId");
    }
    return scope;
  }
  throw new ShellError("invalid_input", "grant scope kind must be organization|project");
}

/* ------------------------------------------------------------------ */
/* Pane view models (server-assembled, read-only, sourced)             */
/* ------------------------------------------------------------------ */

/**
 * The project-context pane — what a pilot user discovers first (R19):
 * the organization/project identity plus the DEEP-LINKABLE entry points
 * into the other panes. Entry ids are the owning modules' verbatim ids.
 */
export interface ContextPaneView {
  /** The context record this pane projects (required — the discipline). */
  readonly source: SourceRef;
  readonly organizationId: string;
  readonly projectId: string;
  readonly projectName: SourcedValue<string>;
  readonly phase: SourcedValue<string>;
  readonly site: SourcedValue<string>;
  /** Latest Reality Graph version id, when the context record knows one. */
  readonly latestRealityVersionId: SourcedValue<string> | null;
  /** BOQ import ids discoverable from context (verbatim import ids). */
  readonly boqImportIds: readonly SourcedValue<string>[];
  /** Open engineering case ids discoverable from context (verbatim ids). */
  readonly openCaseIds: readonly SourcedValue<string>[];
}

/** One reality node in the snapshot (kinds/epistemics verbatim). */
export interface RealityNodeView {
  readonly source: SourceRef;
  readonly nodeId: string;
  /** AISE-016 NodeKind vocabulary, verbatim. */
  readonly kind: string;
  /** Epistemic vocabulary (OBSERVED/INFERRED/CONFIRMED), verbatim. */
  readonly epistemicStatus: string;
  /** Deterministic one-line property summary (server-assembled). */
  readonly summary: SourcedValue<string>;
  /** Evidence content ids supporting the node (verbatim, deep-linkable). */
  readonly evidenceIds: readonly SourcedValue<string>[];
}

/** The reality pane — one pinned Reality Graph version snapshot. */
export interface RealityPaneView {
  readonly source: SourceRef;
  readonly projectId: string;
  readonly versionId: string;
  readonly versionCreatedAt: SourcedValue<string>;
  readonly nodes: readonly RealityNodeView[];
}

/** One BOQ sheet summary (counts are structural facts of the record). */
export interface BoqSheetSummaryView {
  readonly source: SourceRef;
  readonly sheetName: SourcedValue<string>;
  readonly rowCount: number;
  readonly sectionCount: number;
}

/** The BOQ pane — one imported BOQ document (verbatim source identity). */
export interface BoqPaneView {
  readonly source: SourceRef;
  readonly projectId: string;
  readonly importId: string;
  readonly format: SourcedValue<string>;
  readonly mediaType: SourcedValue<string>;
  readonly byteSize: SourcedValue<number>;
  readonly sheets: readonly BoqSheetSummaryView[];
  /**
   * The evidence record for the imported source bytes, when the
   * deployment registered the import as evidence (AISE-037 imports are
   * evidence, never canonical writes). Absent = honestly null.
   */
  readonly sourceEvidenceId: SourcedValue<string> | null;
}

/** The evidence pane — one content-addressed evidence record. */
export interface EvidencePaneView {
  readonly source: SourceRef;
  readonly projectId: string;
  readonly evidenceId: string;
  readonly acquisitionMethod: SourcedValue<string>;
  readonly mediaType: SourcedValue<string>;
  readonly byteSize: SourcedValue<number>;
  readonly capturedAt: SourcedValue<string>;
  /** The invalidation reason, or null while the record is valid. */
  readonly invalidationReason: SourcedValue<string> | null;
  /** Cases referencing this evidence (verbatim case ids, deep-linkable). */
  readonly relatedCaseIds: readonly SourcedValue<string>[];
}

/** The case pane — one engineering case (facts/inferences never merged). */
export interface CasePaneView {
  readonly source: SourceRef;
  readonly projectId: string;
  readonly caseId: string;
  readonly title: SourcedValue<string>;
  readonly status: SourcedValue<string>;
  /** Structural counts of the record (arrays are server-side). */
  readonly observationCount: number;
  readonly hypothesisCount: number;
  readonly missingEvidenceCount: number;
  /** Evidence ids the case links (verbatim, deep-linkable). */
  readonly evidenceIds: readonly SourcedValue<string>[];
}

/* ------------------------------------------------------------------ */
/* Connector surface views (integration-facing, sourced)               */
/* ------------------------------------------------------------------ */

/**
 * One incumbent record reference — the `ExternalReference` contract
 * (spec/domain-model.md "Integration semantics"): external system class,
 * instance, VERBATIM incumbent record id, revision. Never re-keyed, never
 * merged; the incumbent system stays the system of record for it.
 */
export interface ExternalRecordRefView {
  readonly source: SourceRef;
  /** AISE-037 SystemClass vocabulary, verbatim. */
  readonly systemClass: string;
  readonly systemInstanceId: string;
  /** VERBATIM incumbent record id (e.g. "IFC-MODEL-0042"). */
  readonly sourceRecordId: string;
  /** Design revision/version identifier, verbatim; null when unknown. */
  readonly revision: string | null;
  readonly label: SourcedValue<string>;
  /** The incumbent system's own deep link, verbatim; null when not provided. */
  readonly externalUrl: string | null;
}

/**
 * One connector action the DEPLOYMENT offers through a binding — the
 * port-supplied descriptor. The `requiredPermission` is the identity
 * permission vocabulary VERBATIM (the deployment's wiring decides which
 * permission gates which action; the shell never invents this mapping).
 * The session-paired action (descriptor + return path) is actions.ts's
 * `ShellConnectorAction`.
 */
export interface ConnectorActionDescriptor {
  readonly actionId: string;
  readonly kind: ConnectorActionKind;
  readonly label: SourcedValue<string>;
  readonly requiredPermission: string;
  /** Where initiation is dispatched; null renders an enabled control without href. */
  readonly initiateUrl: string | null;
}

/**
 * One connector binding surface — the external-system status source
 * (AISE-037 vocabulary, verbatim): what is connected, what it can do,
 * which incumbent records it references and which actions it offers.
 */
export interface ConnectorBindingView {
  readonly source: SourceRef;
  readonly bindingId: string;
  /** AISE-037 SystemClass vocabulary, verbatim. */
  readonly systemClass: string;
  readonly systemInstanceId: string;
  readonly displayName: SourcedValue<string>;
  /** connected | unavailable | unknown-last-sync (never guessed). */
  readonly status: BindingStatus;
  readonly statusDetail: SourcedValue<string>;
  /** Last sync instant, verbatim; null when unknown (first-class). */
  readonly lastSyncAt: SourcedValue<string> | null;
  /** AISE-037 AdapterCapability vocabulary, verbatim. */
  readonly capabilities: readonly string[];
  readonly externalRecordRefs: readonly ExternalRecordRefView[];
  readonly actions: readonly ConnectorActionDescriptor[];
}

/* ------------------------------------------------------------------ */
/* Pane validators (the boundary rejections for unsourced views)       */
/* ------------------------------------------------------------------ */

/** Validate a context pane view (shape + the source discipline). */
export function validateContextPaneView(view: ContextPaneView): ContextPaneView {
  if (!isRecord(view)) {
    throw new ShellError("invalid_input", "context view must be an object");
  }
  validateSourceRef(view.source);
  if (!isRecordId(view.organizationId) || !isRecordId(view.projectId)) {
    throw new ShellError("invalid_input", "context view requires organizationId and projectId");
  }
  validateSourcedText(view.projectName);
  validateSourcedText(view.phase);
  validateSourcedText(view.site);
  if (view.latestRealityVersionId !== null && view.latestRealityVersionId !== undefined) {
    validateSourcedText(view.latestRealityVersionId);
  }
  validateSourcedTextList(view.boqImportIds, "boqImportIds");
  validateSourcedTextList(view.openCaseIds, "openCaseIds");
  return view;
}

/** Validate a reality pane view (shape + the source discipline). */
export function validateRealityPaneView(view: RealityPaneView): RealityPaneView {
  if (!isRecord(view)) {
    throw new ShellError("invalid_input", "reality view must be an object");
  }
  validateSourceRef(view.source);
  if (!isRecordId(view.projectId) || !isRecordId(view.versionId)) {
    throw new ShellError("invalid_input", "reality view requires projectId and versionId");
  }
  validateSourcedText(view.versionCreatedAt);
  if (!Array.isArray(view.nodes)) {
    throw new ShellError("invalid_input", "reality view requires a nodes array");
  }
  for (const node of view.nodes) {
    validateRealityNodeView(node);
  }
  return view;
}

/** Validate one reality node view. */
export function validateRealityNodeView(node: RealityNodeView): RealityNodeView {
  if (!isRecord(node)) {
    throw new ShellError("invalid_input", "reality node must be an object");
  }
  validateSourceRef(node.source as SourceRef);
  if (
    !isRecordId(node.nodeId) ||
    !isNonEmptyString(node.kind) ||
    !isNonEmptyString(node.epistemicStatus)
  ) {
    throw new ShellError(
      "invalid_input",
      "reality node requires nodeId, kind and epistemicStatus",
    );
  }
  validateSourcedText(node.summary as SourcedValue<string>);
  validateSourcedTextList(node.evidenceIds as readonly SourcedValue<string>[], "evidenceIds");
  return node;
}

/** Validate a BOQ pane view (shape + the source discipline). */
export function validateBoqPaneView(view: BoqPaneView): BoqPaneView {
  if (!isRecord(view)) {
    throw new ShellError("invalid_input", "boq view must be an object");
  }
  validateSourceRef(view.source);
  if (!isRecordId(view.projectId) || !isRecordId(view.importId)) {
    throw new ShellError("invalid_input", "boq view requires projectId and importId");
  }
  validateSourcedText(view.format);
  validateSourcedText(view.mediaType);
  validateSourcedNumber(view.byteSize);
  if (!Array.isArray(view.sheets)) {
    throw new ShellError("invalid_input", "boq view requires a sheets array");
  }
  for (const sheet of view.sheets) {
    if (!isRecord(sheet)) {
      throw new ShellError("invalid_input", "boq sheet summary must be an object");
    }
    validateSourceRef(sheet.source as SourceRef);
    validateSourcedText(sheet.sheetName as SourcedValue<string>);
    if (
      typeof sheet.rowCount !== "number" ||
      !Number.isInteger(sheet.rowCount) ||
      sheet.rowCount < 0 ||
      typeof sheet.sectionCount !== "number" ||
      !Number.isInteger(sheet.sectionCount) ||
      sheet.sectionCount < 0
    ) {
      throw new ShellError("invalid_input", "boq sheet requires non-negative integer counts");
    }
  }
  if (view.sourceEvidenceId !== null && view.sourceEvidenceId !== undefined) {
    validateSourcedText(view.sourceEvidenceId);
  }
  return view;
}

/** Validate an evidence pane view (shape + the source discipline). */
export function validateEvidencePaneView(view: EvidencePaneView): EvidencePaneView {
  if (!isRecord(view)) {
    throw new ShellError("invalid_input", "evidence view must be an object");
  }
  validateSourceRef(view.source);
  if (!isRecordId(view.projectId) || !isRecordId(view.evidenceId)) {
    throw new ShellError("invalid_input", "evidence view requires projectId and evidenceId");
  }
  validateSourcedText(view.acquisitionMethod);
  validateSourcedText(view.mediaType);
  validateSourcedNumber(view.byteSize);
  validateSourcedText(view.capturedAt);
  if (view.invalidationReason !== null && view.invalidationReason !== undefined) {
    validateSourcedText(view.invalidationReason);
  }
  validateSourcedTextList(view.relatedCaseIds, "relatedCaseIds");
  return view;
}

/** Validate a case pane view (shape + the source discipline). */
export function validateCasePaneView(view: CasePaneView): CasePaneView {
  if (!isRecord(view)) {
    throw new ShellError("invalid_input", "case view must be an object");
  }
  validateSourceRef(view.source);
  if (!isRecordId(view.projectId) || !isRecordId(view.caseId)) {
    throw new ShellError("invalid_input", "case view requires projectId and caseId");
  }
  validateSourcedText(view.title);
  validateSourcedText(view.status);
  for (const field of ["observationCount", "hypothesisCount", "missingEvidenceCount"] as const) {
    const count = view[field];
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new ShellError("invalid_input", `case view requires a non-negative ${field}`);
    }
  }
  validateSourcedTextList(view.evidenceIds, "evidenceIds");
  return view;
}

/** Validate an external record reference view. */
export function validateExternalRecordRefView(ref: ExternalRecordRefView): ExternalRecordRefView {
  if (!isRecord(ref)) {
    throw new ShellError("invalid_input", "external record ref must be an object");
  }
  validateSourceRef(ref.source);
  if (
    !isNonEmptyString(ref.systemClass) ||
    !isRecordId(ref.systemInstanceId) ||
    !isRecordId(ref.sourceRecordId)
  ) {
    throw new ShellError(
      "invalid_input",
      "external record ref requires systemClass, systemInstanceId and sourceRecordId",
    );
  }
  if (ref.revision !== null && ref.revision !== undefined && !isNonEmptyString(ref.revision)) {
    throw new ShellError("invalid_input", "external record revision must be non-empty or null");
  }
  validateSourcedText(ref.label);
  if (
    ref.externalUrl !== null &&
    ref.externalUrl !== undefined &&
    !isNonEmptyString(ref.externalUrl)
  ) {
    throw new ShellError("invalid_input", "external record url must be non-empty or null");
  }
  return ref;
}

/** Validate a connector action descriptor (port-supplied). */
export function validateConnectorActionDescriptor(
  descriptor: ConnectorActionDescriptor,
): ConnectorActionDescriptor {
  if (!isRecord(descriptor)) {
    throw new ShellError("invalid_input", "action descriptor must be an object");
  }
  if (!isRecordId(descriptor.actionId)) {
    throw new ShellError("invalid_input", "action descriptor requires an actionId");
  }
  if (
    typeof descriptor.kind !== "string" ||
    !(CONNECTOR_ACTION_KINDS as readonly string[]).includes(descriptor.kind)
  ) {
    throw new ShellError(
      "invalid_input",
      `action kind must be one of: ${CONNECTOR_ACTION_KINDS.join(", ")}`,
    );
  }
  validateSourcedText(descriptor.label);
  if (!isNonEmptyString(descriptor.requiredPermission)) {
    throw new ShellError(
      "invalid_input",
      "action descriptor requires a non-empty requiredPermission",
    );
  }
  if (
    descriptor.initiateUrl !== null &&
    descriptor.initiateUrl !== undefined &&
    !isNonEmptyString(descriptor.initiateUrl)
  ) {
    throw new ShellError("invalid_input", "action initiateUrl must be non-empty or null");
  }
  return descriptor;
}

/** Validate a connector binding view (shape + the source discipline). */
export function validateConnectorBindingView(view: ConnectorBindingView): ConnectorBindingView {
  if (!isRecord(view)) {
    throw new ShellError("invalid_input", "connector binding must be an object");
  }
  validateSourceRef(view.source);
  if (
    !isRecordId(view.bindingId) ||
    !isNonEmptyString(view.systemClass) ||
    !isRecordId(view.systemInstanceId)
  ) {
    throw new ShellError(
      "invalid_input",
      "connector binding requires bindingId, systemClass and systemInstanceId",
    );
  }
  validateSourcedText(view.displayName);
  if (
    typeof view.status !== "string" ||
    !(BINDING_STATUSES as readonly string[]).includes(view.status)
  ) {
    throw new ShellError(
      "invalid_input",
      `binding status must be one of: ${BINDING_STATUSES.join(", ")}`,
    );
  }
  validateSourcedText(view.statusDetail);
  if (view.lastSyncAt !== null && view.lastSyncAt !== undefined) {
    validateSourcedText(view.lastSyncAt);
  }
  if (!Array.isArray(view.capabilities)) {
    throw new ShellError("invalid_input", "connector binding requires a capabilities array");
  }
  if (!Array.isArray(view.externalRecordRefs)) {
    throw new ShellError("invalid_input", "connector binding requires externalRecordRefs");
  }
  for (const ref of view.externalRecordRefs) {
    validateExternalRecordRefView(ref);
  }
  if (!Array.isArray(view.actions)) {
    throw new ShellError("invalid_input", "connector binding requires an actions array");
  }
  for (const descriptor of view.actions) {
    validateConnectorActionDescriptor(descriptor);
  }
  return view;
}
