/**
 * `@aise/desktop` — the desktop ADAPTER layer's public API (PROD-020).
 *
 * Everything the thin platform shell (src/shell/main.ts) drives, and
 * everything the desktop tests exercise, WITHOUT importing the platform
 * binary: the declared capability profile, the contract decode seam, the
 * conformance binding, the high-density review surface model, the
 * keyboard-shortcut registry, the optional local integration affordances,
 * the non-authoritative convenience store and the adapter client whose
 * actions resolve to the SHARED server/domain actions.
 */

export {
  DESKTOP_ADAPTER_PROFILE,
  DESKTOP_ADAPTER_PROFILE_ID,
  DESKTOP_IMPLEMENTED_INTERACTION_MODES,
  desktopDeclaredInteractionModes,
  negotiateDesktopTask,
} from "./profile";

export * from "./seam";

export {
  DESKTOP_PRESENTED_FIELDS,
  presentedFieldsOf,
  renderContractObject,
  type RenderedFieldLine,
} from "./render-registry";

export { createDesktopConformanceBinding, DESKTOP_BINDING_ID } from "./binding";

export {
  DENSITY_PROFILES,
  REVIEW_PANE_KINDS,
  denseReviewLayout,
  evidenceTableOf,
  paneById,
  nextFocusedPane,
  provenanceSpotCheck,
  type DensityProfile,
  type EvidenceTable,
  type EvidenceTableRow,
  type ProvenanceSpotCheck,
  type ReviewColumn,
  type ReviewLayout,
  type ReviewPane,
  type ReviewPaneId,
  type ReviewPaneKind,
} from "./review-layout";

export {
  COMMAND_DISCIPLINES,
  DESKTOP_COMMANDS,
  DESKTOP_SHORTCUTS,
  KEYBOARD_PLATFORMS,
  displayAccelerator,
  resolveShortcut,
  shortcutDiscipline,
  shortcutRegistryDefects,
  shortcutsByAccelerator,
  shortcutsForCommand,
  type CommandDiscipline,
  type CommandExecutionKind,
  type DesktopCommand,
  type KeyboardPlatform,
  type ShortcutDefinition,
  type ShortcutRegistryDefect,
} from "./shortcuts";

export {
  LOCAL_AFFORDANCES,
  LOCAL_AFFORDANCE_IDS,
  enabledLocalAffordances,
  localAffordanceById,
  notificationForOperationStatus,
  taskIntentForLocalFile,
  type AffordanceResolution,
  type DesktopNotificationContent,
  type LocalAffordance,
  type LocalAffordanceId,
  type LocalFileSelection,
} from "./local-integrations";

export {
  RECENT_PROJECTS_BOUND,
  clearConvenienceState,
  dequeueIntent,
  emptyConvenienceState,
  enqueueIntent,
  forgetProject,
  outboxBytes,
  pruneOutbox,
  rememberProject,
  replayableIntents,
  resolveProjectIdentity,
  setPreference,
  type DesktopConvenienceState,
  type DesktopPreferences,
  type OutboxEntry,
  type RecentProjectEntry,
} from "./convenience-store";

export {
  TASK_INTENT_ENDPOINT,
  authorizationEndpoint,
  composeReviewWorkspace,
  createDesktopClient,
  createFetchTransport,
  isNotServed,
  taskFlowEndpoint,
  type DesktopClientOptions,
  type DesktopTransport,
  type OpenProjectView,
  type ProjectIdentityResolution,
  type SubmitOutcome,
  type TransportFailure,
  type TransportResponse,
} from "./client";
