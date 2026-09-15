/**
 * AISE-040 — primary-interface adoption shell public surface.
 *
 * The AISE project-facing shell that lets users inspect context, reality,
 * BOQ, evidence and cases and initiate authorized connector actions
 * without routine system switching (§040, R19): deep links/context
 * return paths and explicit external-system status. READ the module
 * headers before use:
 *
 *  - model.ts    — the structural model + typed error/omission registry:
 *                  view-models, deep-link types, source-reference
 *                  discipline (SourcedValue/SourceRef + validators),
 *                  the AISE-036 authorization-decision mirror and the
 *                  AISE-037 integration vocabulary carried verbatim;
 *  - ports.ts    — the READ-ONLY data-access seam: the seven injected
 *                  ports (context/reality/boq/evidence/case/authorization/
 *                  connector-status) with frozen member registries, and
 *                  `loadShellInput` (assembly + alignment cross-checks +
 *                  the assembled ShellInput with tri-state offers);
 *  - nav.ts      — the deep-link codec (`formatShellAddress` /
 *                  `parseShellAddress` — typed rejections, never silent
 *                  fallbacks) and the breadcrumb SESSION model
 *                  (begin/extend/current — the AISE-centered walk);
 *  - actions.ts  — the authorized-action broker: the tri-state matrix
 *                  (allowed → enabled; refused → disabled + reason
 *                  named; unavailable → disabled + honest unknown);
 *  - render.ts   — `renderAdoptionShell`: the pure input → HTML document
 *                  function (context header, breadcrumbs, the addressed
 *                  pane, the connector panel with system-of-record labels
 *                  and return paths, the typed omission list).
 *
 * This package renders deterministic HTML STRINGS server-side (the
 * existing dependency-free convention of apps/web — see workspace/,
 * boqlens/ and viewer/). No browser APIs, no fetch, no client state, no
 * writes: the shell is PRESENTATION, never authority — every displayed
 * value carries its source reference, connector actions are offered only
 * on explicit authorization decisions, external record identities are
 * verbatim references, and unknown states are first-class.
 */

/* model.ts — the structural model + the typed registries */
export {
  ShellError,
  SHELL_ERROR_CODES,
  type ShellErrorCode,
  SOURCE_MODULES,
  type SourceModule,
  type SourceRef,
  type SourcedValue,
  validateSourceRef,
  validateSourcedText,
  validateSourcedNumber,
  validateSourcedTextList,
  SHELL_MODULES,
  type ShellModule,
  type ShellAddress,
  validateShellAddress,
  SHELL_OMISSION_PANES,
  type ShellOmissionPane,
  SHELL_OMISSION_REASONS,
  type ShellOmissionReason,
  type ShellOmission,
  validateShellOmission,
  BINDING_STATUSES,
  type BindingStatus,
  CONNECTOR_ACTION_KINDS,
  type ConnectorActionKind,
  type ShellMembershipScope,
  type ShellPermissionTarget,
  type ShellPermissionGrant,
  type ShellAuthorizationRefusal,
  type ShellAuthorizationDecision,
  type ShellAuthorizationRequest,
  validatePermissionTarget,
  validateAuthorizationDecision,
  type ContextPaneView,
  type RealityNodeView,
  type RealityPaneView,
  type BoqSheetSummaryView,
  type BoqPaneView,
  type EvidencePaneView,
  type CasePaneView,
  type ExternalRecordRefView,
  type ConnectorActionDescriptor,
  type ConnectorBindingView,
  validateContextPaneView,
  validateRealityPaneView,
  validateRealityNodeView,
  validateBoqPaneView,
  validateEvidencePaneView,
  validateCasePaneView,
  validateExternalRecordRefView,
  validateConnectorActionDescriptor,
  validateConnectorBindingView,
} from "./model";

/* nav.ts — the deep-link codec + the breadcrumb session model */
export {
  SHELL_ADDRESS_SCHEME,
  formatShellAddress,
  parseShellAddress,
  addressKey,
  contextAddress,
  realityAddress,
  boqAddress,
  evidenceAddress,
  caseAddress,
  type ShellBreadcrumb,
  type ShellSession,
  validateShellSession,
  beginShellSession,
  extendShellSession,
  currentShellAddress,
  sessionBreadcrumbs,
  sessionContainsAddress,
} from "./nav";

/* actions.ts — the authorized-action tri-state broker */
export {
  CONNECTOR_ACTION_UNAVAILABLE_REASONS,
  type ConnectorActionUnavailableReason,
  type ShellConnectorAction,
  type ConnectorActionOfferState,
  type ConnectorActionOffer,
  pairConnectorAction,
  resolveConnectorActionOffer,
  describeGrant,
} from "./actions";

/* ports.ts — the read-only seam + the shell assembly */
export {
  SHELL_PORT_NAMES,
  SHELL_PORT_MEMBERS,
  type ShellPortName,
  type ShellContextPort,
  type ShellRealityPort,
  type ShellBoqPort,
  type ShellEvidencePort,
  type ShellCasePort,
  type ShellAuthorizationPort,
  type ShellConnectorStatusPort,
  type ShellPorts,
  type ShellPaneData,
  type ConnectorSurfaceView,
  type ShellInput,
  type LoadShellOptions,
  loadShellInput,
  validateShellInput,
} from "./ports";

/* render.ts — the deterministic shell document */
export {
  renderAdoptionShell,
  crumbLabel,
  SHELL_GENERATOR_VERSION,
} from "./render";
