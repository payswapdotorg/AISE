/**
 * WORLD-P0-C — the DESKTOP SHELL INTEGRATION CONTRACT (`src/desktop/`).
 *
 * The contract the desktop application consumes to HOST the world:
 * shell lifecycle, local sidecar process management for the heavy
 * substrates (OCCT / IfcOpenShell / FreeCAD — the directive §6 desktop
 * model: "local sidecar/native services … when browser execution is
 * inappropriate"), and window/view state. Implemented by EITHER shell
 * candidate — Tauri (wry/tao) or the existing Electron thin shell
 * (`apps/desktop`, PROD-020) — and proven implementable WITHOUT EITHER
 * by the in-memory substitution doubles (../doubles.ts), which model
 * the two candidates honestly as candidates, not as integrations.
 *
 * LAWS (on top of the seam laws, enforced by the doubles + tests):
 *
 *  1. THE THIN-SHELL LAW — the shell owns PRESENTATION and PLATFORM
 *     INTERACTION only: windowing, view lanes, sidecar processes. It
 *     NEVER owns canonical engineering state — there is no operation on
 *     this interface that reads or writes the Reality Graph, the
 *     Solution Graph, the BOQ Graph or any evidence; the contract
 *     surface is structurally incapable of becoming a second desktop
 *     engineering authority (the PROD-020 / ACR-004 discipline, and the
 *     directive §6 "no second desktop-only engineering authority").
 *  2. THE SIDECAR LAW — heavy substrates run as LOCAL sidecar processes
 *     behind TYPED spawn/query/teardown operations: the spawn spec
 *     carries the substrate kind from the CLOSED vocabulary, the
 *     executable identity as a `sidecar-process` namespaced external
 *     label (never canonical AISE identity), and DECLARED resource
 *     budgets. Teardown is explicit and IDEMPOTENT; shutdown tears down
 *     every live sidecar and reports them (no orphans — the report is
 *     the proof). A sidecar handle is opaque; the sidecar id is
 *     AISE-assigned.
 *  3. THE LIFECYCLE LAW — a deterministic state machine:
 *     `uninitialized → ready → shutdown`. Calls before `initialize`
 *     and after `shutdown` are typed refusals (fail-closed); double
 *     initialization is a typed refusal. After shutdown every handle is
 *     dead. The doubles implement the machine deterministically; real
 *     shells map their platform lifecycle onto it.
 *  4. THE VIEW LAW — windows carry AISE-assigned window ids; the view
 *     state records which product lane a window hosts (the closed
 *     `DESKTOP_VIEW_LANES` vocabulary — presentation only) plus the
 *     optional substrate-neutral world camera (`CameraState` of the
 *     P0-A scene vocabulary — the hosted world view's presentation
 *     state, never engineering state).
 *  5. PLATFORM-NEUTRALITY LAW — no Tauri and no Electron type appears
 *     anywhere in this contract; a conforming implementation compiles
 *     against it with NEITHER shell installed (the doubles prove it).
 *     The shell candidate is a provider-descriptor identity, not a
 *     type dependency.
 *  6. DETERMINISM IN THE CONTRACT CORE — the doubles' observable
 *     behavior is a pure function of the call sequence (no clock reads,
 *     no randomness, no real process spawn): identical call sequences
 *     produce byte-identical observable states. Real shells add sensed
 *     platform facts (pids, instants) as STATUS detail — the contract
 *     vocabulary stays closed.
 */

import type { CameraState } from "@aise/world-reality-substrate";
import type {
  NamespacedExternalLabel,
  SubstrateOutcome,
  SubstrateResultProvenance,
} from "../seam";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const DESKTOP_SHELL_PORT_ID = "desktop.shell/1" as const;

/** The closed heavy-substrate sidecar vocabulary (the directive §6 list). */
export const SIDECAR_SUBSTRATE_KINDS = ["occt", "ifcopenshell", "freecad"] as const;
export type SidecarSubstrateKind = (typeof SIDECAR_SUBSTRATE_KINDS)[number];

/** The closed product-lane vocabulary a window can host (presentation only). */
export const DESKTOP_VIEW_LANES = ["world", "boq", "timeline", "evidence"] as const;
export type DesktopViewLane = (typeof DESKTOP_VIEW_LANES)[number];

/** The closed shell lifecycle phase vocabulary (law 3). */
export const SHELL_LIFECYCLE_PHASES = ["uninitialized", "ready", "shutdown"] as const;
export type ShellLifecyclePhase = (typeof SHELL_LIFECYCLE_PHASES)[number];

/** The closed sidecar state vocabulary. */
export const SIDECAR_STATES = ["spawned", "ready", "terminated", "failed"] as const;
export type SidecarState = (typeof SIDECAR_STATES)[number];

/** The reference-implementation note (the two shell candidates). */
export const DESKTOP_SHELL_REFERENCE_NOTE =
  "WORLD-P0-C desktop shell decision scope: the contract is shell-neutral; the " +
  "two candidates are Tauri (wry/tao, Rust) and the existing Electron thin shell " +
  "of apps/desktop (PROD-020). The evidence-based decision lives in " +
  "docs/world-program-evidence/WORLD-P0-C/DESKTOP-SHELL-DECISION.md; neither " +
  "candidate is integrated in P0 — the in-repo doubles model both candidates " +
  "honestly as in-memory substitution doubles.";

/* ------------------------------------------------------------------ */
/* Sidecar process management (law 2)                                   */
/* ------------------------------------------------------------------ */

/** The DECLARED sidecar spawn specification. */
export interface SidecarSpec {
  readonly sidecarId: string;
  readonly substrateKind: SidecarSubstrateKind;
  /** The executable identity as a `sidecar-process` namespaced external label. */
  readonly executableLabel: NamespacedExternalLabel;
  /** Declared launch arguments (verbatim, deterministic order). */
  readonly declaredArguments: readonly string[];
  /** Declared memory budget (MB) or null for the platform default. */
  readonly declaredMemoryLimitMb: number | null;
  /** Declared startup budget (ms) or null for no explicit budget. */
  readonly declaredStartupBudgetMs: number | null;
}

/** Opaque handle to a spawned sidecar process. */
export interface SidecarHandle {
  readonly handleKind: "sidecar-process";
  readonly sidecarId: string;
  /** Opaque token — implementations may encode anything; callers treat as opaque. */
  readonly token: string;
}

/** The closed-vocabulary sidecar status (real adapters map sensed facts into it). */
export interface SidecarStatus {
  readonly sidecarId: string;
  readonly state: SidecarState;
  /** Honest detail line (never a stack trace; null when nothing to add). */
  readonly detail: string | null;
}

/* ------------------------------------------------------------------ */
/* Window/view state (law 4)                                            */
/* ------------------------------------------------------------------ */

/** The window creation specification. */
export interface WindowSpec {
  readonly windowId: string;
  readonly title: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
}

/** The window state (presentation only — never engineering state). */
export interface DesktopWindowState {
  readonly windowId: string;
  readonly title: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly minimized: boolean;
  readonly maximized: boolean;
}

/** The view state of one window (which product lane it hosts + the world camera). */
export interface DesktopViewState {
  readonly windowId: string;
  readonly lane: DesktopViewLane;
  /**
   * The hosted world view's camera in the P0-A substrate-neutral form,
   * when the window hosts the world lane — presentation state only.
   */
  readonly worldCamera: CameraState | null;
}

/* ------------------------------------------------------------------ */
/* Lifecycle (law 3)                                                    */
/* ------------------------------------------------------------------ */

/** The shell-ready report. */
export interface ShellReady {
  readonly phase: "ready";
  /** The shell instance's descriptor digest (provenance pin). */
  readonly shellDescriptorDigest: string;
  /** Windows/sidecars live at ready time (always zero after a clean initialize). */
  readonly liveWindows: 0;
  readonly liveSidecars: 0;
}

/** The shutdown report — the no-orphans proof (law 2). */
export interface ShellShutdownReport {
  readonly phase: "shutdown";
  readonly closedWindowIds: readonly string[];
  readonly tornDownSidecarIds: readonly string[];
  readonly provenance: SubstrateResultProvenance;
}

/* ------------------------------------------------------------------ */
/* Capabilities + the port                                              */
/* ------------------------------------------------------------------ */

export interface DesktopShellCapabilities {
  readonly supportsMultipleWindows: boolean;
  readonly supportsSidecarProcesses: boolean;
  readonly maxSidecars: number | null;
  readonly maxWindows: number | null;
  /** Named BLOCKED capabilities with the honest reason (law 3 vocabulary). */
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/**
 * The desktop shell integration port — the contract the desktop app
 * consumes to host the world. Tauri and the existing Electron thin
 * shell are the two candidates; the in-repo doubles prove the contract
 * is implementable WITHOUT either.
 */
export interface DesktopShellAdapter {
  readonly portId: typeof DESKTOP_SHELL_PORT_ID;
  readonly capabilities: DesktopShellCapabilities;

  /** Bring the shell up (idempotence violation = typed refusal). */
  initialize(): SubstrateOutcome<ShellReady>;

  /** Create a window (AISE-assigned window id; fail-closed on duplicates). */
  createWindow(spec: WindowSpec): SubstrateOutcome<DesktopWindowState>;

  /** Update window state (known window required). */
  setWindowState(
    windowId: string,
    patch: Partial<Pick<DesktopWindowState, "title" | "position" | "size" | "minimized" | "maximized">>,
  ): SubstrateOutcome<DesktopWindowState>;

  /** Read window state back (round-trip with setWindowState). */
  getWindowState(windowId: string): SubstrateOutcome<DesktopWindowState>;

  /** Set the view state (lane + optional world camera) of a window. */
  setViewLane(
    windowId: string,
    lane: DesktopViewLane,
    worldCamera: CameraState | null,
  ): SubstrateOutcome<DesktopViewState>;

  /** Spawn a heavy-substrate sidecar process (fail-closed on the spec laws). */
  spawnSidecar(spec: SidecarSpec): SubstrateOutcome<SidecarHandle>;

  /** Query a sidecar's status (closed vocabulary). */
  querySidecar(handle: SidecarHandle): SubstrateOutcome<SidecarStatus>;

  /** Tear a sidecar down — IDEMPOTENT for already-terminated handles. */
  teardownSidecar(handle: SidecarHandle): SubstrateOutcome<null>;

  /** Shut the shell down: closes every window, tears down every sidecar, reports. */
  shutdown(): SubstrateOutcome<ShellShutdownReport>;
}

/* ------------------------------------------------------------------ */
/* Shared pure validators (reusable by real adapters)                   */
/* ------------------------------------------------------------------ */

/** Law 2 + law 6 helper — validate a sidecar spawn spec. PURE. */
export function sidecarSpecViolations(spec: SidecarSpec): string[] {
  const violations: string[] = [];
  if (spec.sidecarId.trim().length === 0) {
    violations.push("sidecarId must be non-empty");
  }
  if (!(SIDECAR_SUBSTRATE_KINDS as readonly string[]).includes(spec.substrateKind)) {
    violations.push(
      `substrateKind must be one of ${SIDECAR_SUBSTRATE_KINDS.join(" | ")} (the closed heavy-substrate vocabulary)`,
    );
  }
  if (spec.executableLabel.namespace !== "sidecar-process") {
    violations.push("executableLabel must be a sidecar-process namespaced external label");
  }
  if (spec.executableLabel.value.trim().length === 0) {
    violations.push("executableLabel.value must be non-empty");
  }
  if (spec.declaredMemoryLimitMb !== null && !(spec.declaredMemoryLimitMb > 0)) {
    violations.push("declaredMemoryLimitMb must be strictly positive when present");
  }
  if (spec.declaredStartupBudgetMs !== null && !(spec.declaredStartupBudgetMs > 0)) {
    violations.push("declaredStartupBudgetMs must be strictly positive when present");
  }
  return violations;
}

/** Law 4 + law 6 helper — validate a window spec. PURE. */
export function windowSpecViolations(spec: WindowSpec): string[] {
  const violations: string[] = [];
  if (spec.windowId.trim().length === 0) {
    violations.push("windowId must be non-empty");
  }
  if (spec.title.trim().length === 0) {
    violations.push("title must be non-empty");
  }
  if (!(spec.size.width > 0) || !(spec.size.height > 0)) {
    violations.push("window size must be strictly positive");
  }
  if (
    !Number.isFinite(spec.position.x) ||
    !Number.isFinite(spec.position.y)
  ) {
    violations.push("window position must be finite");
  }
  return violations;
}
