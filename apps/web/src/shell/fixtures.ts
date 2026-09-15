/**
 * AISE-040 deterministic shell fixtures — TEST SUPPORT ONLY, never
 * imported by the shell rendering/assembly modules (mirrors the viewer/
 * workspace/boqlens fixtures convention).
 *
 * apps/web CANNOT import backend sources (boundary matrix), so this file
 * HAND-BUILDS a structural fixture world that mirrors the backend
 * vocabularies it references (all carried VERBATIM — see model.ts's
 * attribution notes):
 *
 *  - the pilot project "proj-riverside-refit" of org "org-northwind"
 *    (identity/organization naming per AISE-036 conventions);
 *  - one pinned Reality Graph version v003 (AISE-016 GraphVersion
 *    semantics — wall/door/finish nodes with canonical epistemic
 *    statuses and evidence content ids);
 *  - one BOQ import boq-0042 (AISE-014 verbatim-source identity; imports
 *    are evidence, so it carries a source evidence id);
 *  - three content-addressed evidence records (AISE-003 — 64-hex
 *    content addresses, fixed literal constants);
 *  - one engineering case case-007 (AISE-025 — facts/inferences kept
 *    separate; links to evidence);
 *  - three connector bindings exercising every binding status honestly:
 *    connected (bim-ifc), unavailable (erp-procurement, typed failure
 *    detail) and unknown-last-sync (project-management);
 *  - an authorization decision table exercising the AISE-036 refusal
 *    vocabulary verbatim (allowed grant, missing_permission,
 *    membership_revoked, cross_tenant, wrong_scope,
 *    insufficient_granularity) for five principals.
 *
 * Plus the test utilities: `deepFreeze` (purity proofs) and
 * `makeRecordingPorts` (recording proxies that prove ONLY read members
 * are ever touched — accessing any write-shaped member name THROWS).
 *
 * All ids/timestamps fixed; no clock, no randomness, no network.
 */

import type {
  BoqPaneView,
  CasePaneView,
  ConnectorBindingView,
  ContextPaneView,
  EvidencePaneView,
  RealityPaneView,
  ShellAuthorizationDecision,
  ShellAuthorizationRequest,
  SourcedValue,
  SourceRef,
} from "./model";
import type {
  ShellAuthorizationPort,
  ShellBoqPort,
  ShellCasePort,
  ShellConnectorStatusPort,
  ShellContextPort,
  ShellEvidencePort,
  ShellPortName,
  ShellPorts,
  ShellRealityPort,
} from "./ports";

/* ------------------------------------------------------------------ */
/* Fixture constants                                                   */
/* ------------------------------------------------------------------ */

export const ORG_ID = "org-northwind";
export const PROJECT_ID = "proj-riverside-refit";
export const REALITY_VERSION = "v003";
export const BOQ_IMPORT_ID = "boq-0042";
export const CASE_ID = "case-007";
export const PRINCIPAL_ALICE = "user-alice";
export const PRINCIPAL_BOB = "user-bob";
export const PRINCIPAL_CAROL = "user-carol";
export const PRINCIPAL_DAVE = "user-dave";
export const PRINCIPAL_ERIN = "user-erin";

/** Evidence content addresses (fixed 64-hex literals — fixture constants). */
export const EV_WALL_NORTH =
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4";
export const EV_WALL_EAST =
  "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5";
export const EV_BOQ_SOURCE =
  "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7";

/** Connector binding ids. */
export const BINDING_BIM = "bim-prod-01";
export const BINDING_ERP = "erp-proc-01";
export const BINDING_PM = "pm-prod-01";

/* ------------------------------------------------------------------ */
/* Sourced-value helpers                                               */
/* ------------------------------------------------------------------ */

function st(text: string, source: SourceRef): SourcedValue<string> {
  return { value: text, source };
}

function num(value: number, source: SourceRef): SourcedValue<number> {
  return { value, source };
}

function ref(module: SourceRef["module"], recordId: string): SourceRef {
  return { module, recordId };
}

/* ------------------------------------------------------------------ */
/* Pane view fixtures                                                   */
/* ------------------------------------------------------------------ */

/** The canonical project-context view (the discovery entry point). */
export function contextView(): ContextPaneView {
  const source = ref("context", PROJECT_ID);
  return {
    source,
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    projectName: st("Riverside office refit", source),
    phase: st("Construction documentation", source),
    site: st("Riverside office, storey 2", source),
    latestRealityVersionId: st(REALITY_VERSION, source),
    boqImportIds: [st(BOQ_IMPORT_ID, source)],
    openCaseIds: [st(CASE_ID, source)],
  };
}

/** The canonical reality snapshot v003 (four nodes, mixed epistemics). */
export function realityV003(): RealityPaneView {
  const source = ref("reality", REALITY_VERSION);
  return {
    source,
    projectId: PROJECT_ID,
    versionId: REALITY_VERSION,
    versionCreatedAt: st("2025-06-02T14:20:00Z", source),
    nodes: [
      {
        source: ref("reality", `${REALITY_VERSION}:wall-north`),
        nodeId: "wall-north",
        kind: "wall",
        epistemicStatus: "CONFIRMED",
        summary: st("fireRating REI90 · thickness 240 mm · length 6.10 m", source),
        evidenceIds: [st(EV_WALL_NORTH, source)],
      },
      {
        source: ref("reality", `${REALITY_VERSION}:wall-east`),
        nodeId: "wall-east",
        kind: "wall",
        epistemicStatus: "OBSERVED",
        summary: st("thickness 240 mm · length 4.25 m", source),
        evidenceIds: [st(EV_WALL_EAST, source)],
      },
      {
        source: ref("reality", `${REALITY_VERSION}:door-d14`),
        nodeId: "door-d14",
        kind: "door",
        epistemicStatus: "INFERRED",
        summary: st("single leaf · clear opening 0.90 m", source),
        evidenceIds: [st(EV_WALL_EAST, source)],
      },
      {
        source: ref("reality", `${REALITY_VERSION}:paint-ceiling-p1`),
        nodeId: "paint-ceiling-p1",
        kind: "finish",
        epistemicStatus: "INFERRED",
        summary: st("acoustic ceiling tile, type B", source),
        evidenceIds: [],
      },
    ],
  };
}

/** The canonical BOQ import view (two sheets, verbatim source identity). */
export function boqImportView(): BoqPaneView {
  const source = ref("boq", BOQ_IMPORT_ID);
  return {
    source,
    projectId: PROJECT_ID,
    importId: BOQ_IMPORT_ID,
    format: st("xlsx", source),
    mediaType: st("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", source),
    byteSize: num(38214, source),
    sheets: [
      {
        source: ref("boq", `${BOQ_IMPORT_ID}:Overview`),
        sheetName: st("Overview", source),
        rowCount: 12,
        sectionCount: 1,
      },
      {
        source: ref("boq", `${BOQ_IMPORT_ID}:Measurable`),
        sheetName: st("Measurable", source),
        rowCount: 208,
        sectionCount: 9,
      },
    ],
    sourceEvidenceId: st(EV_BOQ_SOURCE, source),
  };
}

/** The wall-north evidence record (the case's primary evidence). */
export function evidenceWallNorth(): EvidencePaneView {
  const source = ref("evidence", EV_WALL_NORTH);
  return {
    source,
    projectId: PROJECT_ID,
    evidenceId: EV_WALL_NORTH,
    acquisitionMethod: st("VISUAL_RECONSTRUCTION", source),
    mediaType: st("image/jpeg", source),
    byteSize: num(4211840, source),
    capturedAt: st("2025-05-28T08:41:00Z", source),
    invalidationReason: null,
    relatedCaseIds: [st(CASE_ID, source)],
  };
}

/** The wall-east evidence record (invalidated — the honest state). */
export function evidenceWallEast(): EvidencePaneView {
  const source = ref("evidence", EV_WALL_EAST);
  return {
    source,
    projectId: PROJECT_ID,
    evidenceId: EV_WALL_EAST,
    acquisitionMethod: st("STILL_IMAGERY", source),
    mediaType: st("image/jpeg", source),
    byteSize: num(2945123, source),
    capturedAt: st("2025-05-26T10:03:00Z", source),
    invalidationReason: st("superseded by re-capture on 2025-06-04", source),
    relatedCaseIds: [],
  };
}

/** The BOQ source-bytes evidence record (a document region capture). */
export function evidenceBoqSource(): EvidencePaneView {
  const source = ref("evidence", EV_BOQ_SOURCE);
  return {
    source,
    projectId: PROJECT_ID,
    evidenceId: EV_BOQ_SOURCE,
    acquisitionMethod: st("DOCUMENT_REGION", source),
    mediaType: st("application/pdf", source),
    byteSize: num(38214, source),
    capturedAt: st("2025-06-01T16:30:00Z", source),
    invalidationReason: null,
    relatedCaseIds: [],
  };
}

/** The canonical engineering case view. */
export function caseView(): CasePaneView {
  const source = ref("case", CASE_ID);
  return {
    source,
    projectId: PROJECT_ID,
    caseId: CASE_ID,
    title: st("Fire rating discrepancy — storey 2 north wall", source),
    status: st("in-review", source),
    observationCount: 3,
    hypothesisCount: 2,
    missingEvidenceCount: 1,
    evidenceIds: [st(EV_WALL_NORTH, source), st(EV_WALL_EAST, source)],
  };
}

/* ------------------------------------------------------------------ */
/* Connector binding fixtures (every status, honestly)                 */
/* ------------------------------------------------------------------ */

/** The CONNECTED bim-ifc binding (with an export action). */
export function bimBinding(): ConnectorBindingView {
  const source = ref("integration", BINDING_BIM);
  return {
    source,
    bindingId: BINDING_BIM,
    systemClass: "bim-ifc",
    systemInstanceId: "arch-bim-prod",
    displayName: st("Architect BIM (prod)", source),
    status: "connected",
    statusDetail: st("adapter reports healthy", source),
    lastSyncAt: st("2025-06-12T09:30:00Z", source),
    capabilities: ["import-entities", "export-derived", "query-status"],
    externalRecordRefs: [
      {
        source: ref("integration", `${BINDING_BIM}:IFC-MODEL-0042`),
        systemClass: "bim-ifc",
        systemInstanceId: "arch-bim-prod",
        sourceRecordId: "IFC-MODEL-0042",
        revision: "C3",
        label: st("Storey 2 architectural model", source),
        externalUrl: "https://bim.example.org/records/IFC-MODEL-0042",
      },
    ],
    actions: [
      {
        actionId: "act-bim-export",
        kind: "export-derived",
        label: st("Export derived IFC projection", source),
        requiredPermission: "reality:write",
        initiateUrl: "https://bim.example.org/exports/derive?from=v003",
      },
    ],
  };
}

/** The UNAVAILABLE erp-procurement binding (typed failure detail). */
export function erpBinding(): ConnectorBindingView {
  const source = ref("integration", BINDING_ERP);
  return {
    source,
    bindingId: BINDING_ERP,
    systemClass: "erp-procurement",
    systemInstanceId: "erp-proc",
    displayName: st("ERP procurement", source),
    status: "unavailable",
    statusDetail: st("AUTHENTICATION_EXPIRED: the ERP connector token expired", source),
    lastSyncAt: null,
    capabilities: ["import-entities", "export-derived", "query-status"],
    externalRecordRefs: [
      {
        source: ref("integration", `${BINDING_ERP}:PO-2025-1187`),
        systemClass: "erp-procurement",
        systemInstanceId: "erp-proc",
        sourceRecordId: "PO-2025-1187",
        revision: null,
        label: st("Purchase order PO-2025-1187", source),
        externalUrl: null,
      },
    ],
    actions: [
      {
        actionId: "act-erp-import",
        kind: "import-entities",
        label: st("Initiate procurement item import", source),
        requiredPermission: "evidence:write",
        initiateUrl: null,
      },
    ],
  };
}

/** The UNKNOWN-LAST-SYNC project-management binding (first-class unknown). */
export function pmBinding(): ConnectorBindingView {
  const source = ref("integration", BINDING_PM);
  return {
    source,
    bindingId: BINDING_PM,
    systemClass: "project-management",
    systemInstanceId: "pm-prod",
    displayName: st("Project management system", source),
    status: "unknown-last-sync",
    statusDetail: st("no sync result recorded yet", source),
    lastSyncAt: null,
    capabilities: [
      "import-entities",
      "import-documents",
      "export-derived",
      "query-status",
    ],
    externalRecordRefs: [
      {
        source: ref("integration", `${BINDING_PM}:SCHED-77`),
        systemClass: "project-management",
        systemInstanceId: "pm-prod",
        sourceRecordId: "SCHED-77",
        revision: "4",
        label: st("Level 2 schedule", source),
        externalUrl: "https://pm.example.org/schedules/SCHED-77",
      },
    ],
    actions: [
      {
        actionId: "act-pm-open",
        kind: "open-record",
        label: st("Open schedule in incumbent system", source),
        requiredPermission: "case:read",
        initiateUrl: "https://pm.example.org/schedules/SCHED-77",
      },
      {
        actionId: "act-pm-export",
        kind: "export-derived",
        label: st("Export progress snapshot", source),
        requiredPermission: "reality:write",
        initiateUrl: null,
      },
    ],
  };
}

/** All three bindings in deterministic order. */
export function allBindings(): readonly ConnectorBindingView[] {
  return [bimBinding(), erpBinding(), pmBinding()];
}

/* ------------------------------------------------------------------ */
/* Authorization decision table (AISE-036 vocabulary, verbatim)         */
/* ------------------------------------------------------------------ */

/** One fixture decision row: principal + permission → decision. */
export interface AuthorizationTableRow {
  readonly principalId: string;
  readonly permission: string;
  readonly decision: ShellAuthorizationDecision;
}

/** The project authorization target every fixture decision is about. */
export function projectTarget(): ShellAuthorizationRequest["target"] {
  return { kind: "project", organizationId: ORG_ID, projectId: PROJECT_ID };
}

function allowedGrant(permission: string): ShellAuthorizationDecision {
  return {
    allowed: true,
    grant: {
      membershipId: "mbr-011",
      roleId: "role-engineer",
      permission,
      scope: { kind: "project", projectId: PROJECT_ID },
    },
  };
}

function refusalRow(
  principalId: string,
  permission: string,
  code: string,
  detail: string,
): AuthorizationTableRow {
  return {
    principalId,
    permission,
    decision: {
      allowed: false,
      refusal: { code, detail, principalId, target: projectTarget() },
    },
  };
}

/**
 * The fixture decision table. The identity module's refusal vocabulary is
 * carried VERBATIM (AISE-036 AUTHORIZATION_REFUSAL_CODES members); every
 * refusal names its principal and target (the identity discipline).
 */
export function authorizationTable(): readonly AuthorizationTableRow[] {
  return [
    {
      principalId: PRINCIPAL_ALICE,
      permission: "reality:write",
      decision: allowedGrant("reality:write"),
    },
    {
      principalId: PRINCIPAL_ALICE,
      permission: "evidence:write",
      decision: allowedGrant("evidence:write"),
    },
    {
      principalId: PRINCIPAL_ALICE,
      permission: "case:read",
      decision: allowedGrant("case:read"),
    },
    refusalRow(
      PRINCIPAL_BOB,
      "reality:write",
      "missing_permission",
      `principal ${PRINCIPAL_BOB} holds no reality:write grant in project ${PROJECT_ID} of organization ${ORG_ID}`,
    ),
    refusalRow(
      PRINCIPAL_BOB,
      "evidence:write",
      "membership_revoked",
      `principal ${PRINCIPAL_BOB} has no active membership in organization ${ORG_ID} — their membership was revoked`,
    ),
    refusalRow(
      PRINCIPAL_BOB,
      "case:read",
      "missing_permission",
      `principal ${PRINCIPAL_BOB} holds no case:read grant in project ${PROJECT_ID} of organization ${ORG_ID}`,
    ),
    refusalRow(
      PRINCIPAL_CAROL,
      "reality:write",
      "cross_tenant",
      `principal ${PRINCIPAL_CAROL} is a member of organization(s) [org-contoso] but not of project ${PROJECT_ID} of organization ${ORG_ID} — cross-tenant access is refused`,
    ),
    refusalRow(
      PRINCIPAL_DAVE,
      "reality:write",
      "wrong_scope",
      `principal ${PRINCIPAL_DAVE} holds reality:write in organization ${ORG_ID} at a scope that does not cover project ${PROJECT_ID}`,
    ),
    refusalRow(
      PRINCIPAL_ERIN,
      "reality:write",
      "insufficient_granularity",
      `principal ${PRINCIPAL_ERIN} holds reality:read in project ${PROJECT_ID} — reality:write is required`,
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* Port factories (deterministic, in-memory)                          */
/* ------------------------------------------------------------------ */

export function makeContextPort(view: ContextPaneView | null): ShellContextPort {
  return {
    readContext: async (projectId: string) =>
      view !== null && view.projectId === projectId ? view : null,
  };
}

export function makeRealityPort(views: readonly RealityPaneView[]): ShellRealityPort {
  return {
    readReality: async (projectId: string, versionId?: string) => {
      const exact = views.find(
        (view) => view.projectId === projectId && view.versionId === versionId,
      );
      if (exact !== undefined) {
        return exact;
      }
      if (versionId === undefined) {
        return views.find((view) => view.projectId === projectId) ?? null;
      }
      return null;
    },
  };
}

export function makeBoqPort(views: readonly BoqPaneView[]): ShellBoqPort {
  return {
    readBoqImport: async (projectId: string, importId: string) =>
      views.find(
        (view) => view.projectId === projectId && view.importId === importId,
      ) ?? null,
  };
}

export function makeEvidencePort(views: readonly EvidencePaneView[]): ShellEvidencePort {
  return {
    readEvidence: async (projectId: string, evidenceId: string) =>
      views.find(
        (view) => view.projectId === projectId && view.evidenceId === evidenceId,
      ) ?? null,
  };
}

export function makeCasePort(views: readonly CasePaneView[]): ShellCasePort {
  return {
    readCase: async (projectId: string, caseId: string) =>
      views.find((view) => view.projectId === projectId && view.caseId === caseId) ??
      null,
  };
}

export function makeConnectorStatusPort(
  bindings: readonly ConnectorBindingView[],
): ShellConnectorStatusPort {
  // The fixture bindings are project-scoped by construction (the ids and
  // references are the pilot project's); the projectId scoping duty stays
  // with real deployments' port implementations.
  return {
    readBindings: async () => [...bindings],
  };
}

export function makeAuthorizationPort(
  table: readonly AuthorizationTableRow[],
): ShellAuthorizationPort {
  return {
    decide: async (request: ShellAuthorizationRequest) => {
      const row = table.find(
        (entry) =>
          entry.principalId === request.principalId &&
          entry.permission === request.permission,
      );
      if (row === undefined) {
        throw new Error(
          `fixture authorization port has no decision for (${request.principalId}, ${request.permission})`,
        );
      }
      return row.decision;
    },
  };
}

/** The complete canonical port bundle for the pilot world. */
export function makeShellPorts(): ShellPorts {
  return {
    context: makeContextPort(contextView()),
    reality: makeRealityPort([realityV003()]),
    boq: makeBoqPort([boqImportView()]),
    evidence: makeEvidencePort([
      evidenceWallNorth(),
      evidenceWallEast(),
      evidenceBoqSource(),
    ]),
    case: makeCasePort([caseView()]),
    authorization: makeAuthorizationPort(authorizationTable()),
    connectorStatus: makeConnectorStatusPort(allBindings()),
  };
}

/** A port bundle with NO ports wired (the all-omissions deployment). */
export function emptyShellPorts(): ShellPorts {
  return {};
}

/* ------------------------------------------------------------------ */
/* deepFreeze (purity proofs)                                           */
/* ------------------------------------------------------------------ */

/** Recursively freeze a fixture value (objects AND arrays). */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Recording proxies (the no-write discriminations)                    */
/* ------------------------------------------------------------------ */

/** One recorded call on one port member. */
export interface RecordedPortCall {
  readonly port: ShellPortName;
  readonly member: string;
  readonly args: readonly unknown[];
}

/** A port bundle whose every member access is recorded (and writes THROW). */
export interface RecordingShellPorts extends ShellPorts {
  calls(): readonly RecordedPortCall[];
  membersTouched(): readonly { readonly port: ShellPortName; readonly member: string }[];
}

/** Write-shaped member names are forbidden on the seam — access THROWS. */
const BANNED_MEMBER_PATTERN =
  /set|update|mutate|assign|approve|reject|save|write|fetch|delete|patch|push|post|create|add|remove|transition|record|append|materialize/i;

/**
 * Wrap a port bundle in recording proxies: every STRING member access is
 * recorded (symbol accesses pass through unrecorded); accessing a
 * write-shaped member name throws immediately (the tripwire).
 */
export function makeRecordingPorts(base: ShellPorts): RecordingShellPorts {
  const calls: RecordedPortCall[] = [];
  const touched = new Map<string, ShellPortName>();
  const wrap = <P extends object>(portName: ShellPortName, port: P): P =>
    new Proxy(port, {
      get(target: P, prop: string | symbol): unknown {
        if (typeof prop !== "string") {
          return (target as Record<string | symbol, unknown>)[prop];
        }
        if (BANNED_MEMBER_PATTERN.test(prop)) {
          throw new Error(
            `write-shaped member '${prop}' is not part of the read-only ${portName} seam`,
          );
        }
        const value = (target as Record<string, unknown>)[prop];
        if (typeof value !== "function") {
          touched.set(prop, portName);
          return value;
        }
        return (...args: unknown[]): unknown => {
          calls.push({ port: portName, member: prop, args });
          touched.set(prop, portName);
          const result = (value as (...fnArgs: unknown[]) => unknown)(...args);
          return result;
        };
      },
    }) as P;

  const wrapped: Record<string, unknown> = {};
  for (const [portName, port] of Object.entries(base)) {
    if (port !== undefined) {
      wrapped[portName] = wrap(portName as ShellPortName, port as object);
    }
  }
  return {
    ...(wrapped as unknown as ShellPorts),
    calls: () => [...calls],
    membersTouched: () =>
      [...touched.entries()].map(([member, port]) => ({ port, member })),
  };
}
