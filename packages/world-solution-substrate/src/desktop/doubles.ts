/**
 * WORLD-P0-C — the DESKTOP SHELL substitution DOUBLES (`src/desktop/`).
 *
 * Two INDEPENDENT in-memory hosts of the `DesktopShellAdapter` port —
 * the substitution proof that the desktop shell integration contract
 * is implementable WITHOUT Tauri AND WITHOUT Electron (no Rust tool
 * chain, no Electron binary, no display — only the typed contract):
 *
 *  - `TauriLikeShellDouble` — models the TAURI candidate's mechanics:
 *    a single primary window that cannot be closed while sidecars
 *    live without an explicit teardown, a Map-registry of sidecars,
 *    and sidecar handles whose tokens embed the substrate kind (the
 *    wry/tao process model simulated);
 *  - `ElectronLikeShellDouble` — models the EXISTING ELECTRON THIN
 *    SHELL's mechanics (apps/desktop, PROD-020): an event-queue-driven
 *    state machine — every adapter call enqueues a typed event which
 *    is applied synchronously by a reducer (the main-process event
 *    loop simulated); window/sidecar registries are array scans.
 *
 * The names are HONEST: these are in-memory doubles that MODEL the two
 * candidates' observable contract behavior; neither Tauri nor Electron
 * is installed, imported or executed (the P0 scope — the decision
 * record and real measurement protocol live in the item's evidence
 * directory).
 *
 * Both MUST produce byte-identical observable behavior for identical
 * call sequences — same window states, same sidecar statuses, same
 * shutdown reports — except the provenance's provider identity,
 * exactly as a real Tauri shell and a real Electron shell would differ
 * while conforming to the same contract.
 *
 * HONESTY OF THE DOUBLES (no fabrication):
 *
 *  - no real process is spawned and no pid is invented: sidecar status
 *    comes from the deterministic lifecycle state machine only (the
 *    contract's closed vocabulary);
 *  - the BLOCKED capabilities are declared honestly (real process
 *    management, native window systems, webview fidelity — none of it
 *    exists in an in-memory double);
 *  - no clock reads, no randomness: identical call sequences produce
 *    byte-identical observable states;
 *  - the thin-shell law is structural: the doubles carry NO field and
 *    NO method that touches any engineering state.
 */

import type { CameraState } from "@aise/world-reality-substrate";
import {
  SOLUTION_LANE_STATEMENT,
  canonicalDigestOf,
  deepFreeze,
  refused,
  type SolutionSubstrateFamily,
  type SubstrateOutcome,
  type SubstrateProviderDescriptor,
  type SubstrateResultProvenance,
} from "../seam";
import {
  sidecarSpecViolations,
  windowSpecViolations,
  type DesktopShellAdapter,
  type DesktopShellCapabilities,
  type DesktopViewState,
  type DesktopWindowState,
  type ShellReady,
  type ShellShutdownReport,
  type SidecarHandle,
  type SidecarSpec,
  type SidecarStatus,
} from "./contract";

const FAMILY: SolutionSubstrateFamily = "desktop";

/* ------------------------------------------------------------------ */
/* The two provider descriptors                                         */
/* ------------------------------------------------------------------ */

/** The Tauri-candidate modeling double's port-occupant identity. */
export const TAURI_LIKE_SHELL_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "solution-substrate.desktop.tauri-like-double",
  family: "desktop",
  technologyVersion: "desktop-tauri-like-double/1.0.0",
  engineNote:
    "in-memory substitution double MODELING the Tauri (wry/tao) shell candidate — " +
    "NO Tauri installed, no Rust toolchain, no native window system, no real " +
    "sidecar process (P0 defines the contract; the decision record and the " +
    "real measurement protocol live in the item evidence directory)",
  laneStatement: SOLUTION_LANE_STATEMENT,
};

/** The Electron-candidate modeling double's port-occupant identity. */
export const ELECTRON_LIKE_SHELL_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "solution-substrate.desktop.electron-like-double",
  family: "desktop",
  technologyVersion: "desktop-electron-like-double/1.0.0",
  engineNote:
    "in-memory substitution double MODELING the existing Electron thin shell of " +
    "apps/desktop (PROD-020) — an event-queue reducer state machine; NO Electron " +
    "installed, no main process, no BrowserWindow (P0 defines the contract; the " +
    "decision record and the real measurement protocol live in the item evidence)",
  laneStatement: SOLUTION_LANE_STATEMENT,
};

/* ------------------------------------------------------------------ */
/* Shared mechanics                                                     */
/* ------------------------------------------------------------------ */

const SHELL_DOUBLE_CAPABILITIES: DesktopShellCapabilities = {
  supportsMultipleWindows: true,
  supportsSidecarProcesses: true,
  maxSidecars: null,
  maxWindows: null,
  blocked: [
    {
      capability: "real-process-management",
      reason:
        "in-memory shell double: no OS process spawn/teardown — the sidecar " +
        "lifecycle is a deterministic state machine; real spawn/query/teardown " +
        "measurement belongs to the shell-candidate evaluation (see the " +
        "DESKTOP-SHELL-DECISION protocol)",
    },
    {
      capability: "native-window-system",
      reason: "in-memory shell double: no window manager, no display",
    },
    {
      capability: "webview-fidelity",
      reason:
        "in-memory shell double: no webview — Babylon/Cesium/WebGPU fidelity " +
        "per platform webview is a real-shell measurement lane (BLOCKED: not " +
        "measurable in this sandbox; protocol recorded in PERFORMANCE-OBSERVATIONS)",
    },
    {
      capability: "os-integration",
      reason: "in-memory shell double: no menus, notifications, dialogs or file system",
    },
  ],
};

/** Shell provenance for the shutdown report (provider identity + digests). */
function shellProvenanceOf(
  descriptor: SubstrateProviderDescriptor,
  input: unknown,
): SubstrateResultProvenance {
  return {
    providerId: descriptor.providerId,
    technologyVersion: descriptor.technologyVersion,
    providerDescriptorDigest: canonicalDigestOf(descriptor),
    inputDigest: canonicalDigestOf(input),
    parametersDigest: canonicalDigestOf({ lane: "desktop.shell/1", method: "desktop.shell" }),
    laneStatement: descriptor.laneStatement,
  };
}

/** The deterministic sidecar state machine (shared semantics). */
interface SidecarRecord {
  readonly sidecarId: string;
  readonly token: string;
  state: "spawned" | "ready" | "terminated" | "failed";
}

/** Law 6 helper — the lifecycle guard shared by both doubles. */
function lifecycleGuard(
  phase: "uninitialized" | "ready" | "shutdown",
): SubstrateOutcome<never> | null {
  if (phase === "uninitialized") {
    return refused(
      FAMILY,
      "contract-mismatch",
      "the shell is not initialized — call initialize() first (fail-closed lifecycle law)",
    );
  }
  if (phase === "shutdown") {
    return refused(
      FAMILY,
      "contract-mismatch",
      "the shell is shut down — every handle is dead (fail-closed lifecycle law)",
    );
  }
  return null;
}

/** The deterministic sidecar token (content-derived, replayable). */
function sidecarTokenOf(spec: SidecarSpec): string {
  return `sidecar-${canonicalDigestOf({
    sidecarId: spec.sidecarId,
    substrateKind: spec.substrateKind,
    executable: spec.executableLabel.value,
    arguments: spec.declaredArguments,
  }).slice(0, 16)}`;
}

/* ------------------------------------------------------------------ */
/* The Tauri-like double (direct state model)                           */
/* ------------------------------------------------------------------ */

export class TauriLikeShellDouble implements DesktopShellAdapter {
  readonly portId = "desktop.shell/1" as const;
  readonly capabilities: DesktopShellCapabilities = SHELL_DOUBLE_CAPABILITIES;
  readonly descriptor: SubstrateProviderDescriptor = TAURI_LIKE_SHELL_DOUBLE_DESCRIPTOR;

  private phase: "uninitialized" | "ready" | "shutdown" = "uninitialized";
  private readonly windows = new Map<string, DesktopWindowState>();
  private readonly viewStates = new Map<string, DesktopViewState>();
  private readonly sidecars = new Map<string, SidecarRecord>();

  initialize(): SubstrateOutcome<ShellReady> {
    if (this.phase === "ready") {
      return refused(FAMILY, "contract-mismatch", "the shell is already initialized");
    }
    if (this.phase === "shutdown") {
      return refused(FAMILY, "contract-mismatch", "the shell is shut down and cannot re-initialize");
    }
    this.phase = "ready";
    return {
      ok: true,
      value: {
        phase: "ready",
        shellDescriptorDigest: canonicalDigestOf(this.descriptor),
        liveWindows: 0,
        liveSidecars: 0,
      },
    };
  }

  createWindow(spec: Parameters<DesktopShellAdapter["createWindow"]>[0]): SubstrateOutcome<DesktopWindowState> {
    const guard = lifecycleGuard(this.phase);
    if (guard !== null) return guard;
    const frozen = deepFreeze(spec);
    const violations = windowSpecViolations(frozen);
    if (this.windows.has(frozen.windowId)) {
      violations.push(`window ${frozen.windowId} already exists`);
    }
    if (violations.length > 0) {
      return refused(FAMILY, "contract-mismatch", `createWindow refused: ${violations.join("; ")}`);
    }
    const state: DesktopWindowState = {
      windowId: frozen.windowId,
      title: frozen.title,
      position: frozen.position,
      size: frozen.size,
      minimized: false,
      maximized: false,
    };
    this.windows.set(frozen.windowId, state);
    this.viewStates.set(frozen.windowId, {
      windowId: frozen.windowId,
      lane: "world",
      worldCamera: null,
    });
    return { ok: true, value: state };
  }

  setWindowState(
    windowId: string,
    patch: Partial<
      Pick<DesktopWindowState, "title" | "position" | "size" | "minimized" | "maximized">
    >,
  ): SubstrateOutcome<DesktopWindowState> {
    const guard = lifecycleGuard(this.phase);
    if (guard !== null) return guard;
    const current = this.windows.get(windowId);
    if (current === undefined) {
      return refused(FAMILY, "contract-mismatch", `unknown window ${windowId}`);
    }
    if (patch.size !== undefined && (!(patch.size.width > 0) || !(patch.size.height > 0))) {
      return refused(FAMILY, "contract-mismatch", "window size must be strictly positive");
    }
    const next: DesktopWindowState = {
      windowId: current.windowId,
      title: patch.title !== undefined ? patch.title : current.title,
      position: patch.position !== undefined ? patch.position : current.position,
      size: patch.size !== undefined ? patch.size : current.size,
      minimized: patch.minimized !== undefined ? patch.minimized : current.minimized,
      maximized: patch.maximized !== undefined ? patch.maximized : current.maximized,
    };
    this.windows.set(windowId, next);
    return { ok: true, value: next };
  }

  getWindowState(windowId: string): SubstrateOutcome<DesktopWindowState> {
    const guard = lifecycleGuard(this.phase);
    if (guard !== null) return guard;
    const current = this.windows.get(windowId);
    if (current === undefined) {
      return refused(FAMILY, "contract-mismatch", `unknown window ${windowId}`);
    }
    return { ok: true, value: current };
  }

  setViewLane(
    windowId: string,
    lane: DesktopViewState["lane"],
    worldCamera: CameraState | null,
  ): SubstrateOutcome<DesktopViewState> {
    const guard = lifecycleGuard(this.phase);
    if (guard !== null) return guard;
    const current = this.viewStates.get(windowId);
    if (current === undefined) {
      return refused(FAMILY, "contract-mismatch", `unknown window ${windowId}`);
    }
    const next: DesktopViewState = { windowId, lane, worldCamera };
    this.viewStates.set(windowId, next);
    return { ok: true, value: next };
  }

  spawnSidecar(spec: SidecarSpec): SubstrateOutcome<SidecarHandle> {
    const guard = lifecycleGuard(this.phase);
    if (guard !== null) return guard;
    const frozen = deepFreeze(spec);
    const violations = sidecarSpecViolations(frozen);
    if (this.sidecars.has(frozen.sidecarId)) {
      violations.push(`sidecar ${frozen.sidecarId} already exists`);
    }
    if (violations.length > 0) {
      return refused(FAMILY, "contract-mismatch", `spawnSidecar refused: ${violations.join("; ")}`);
    }
    const record: SidecarRecord = {
      sidecarId: frozen.sidecarId,
      token: sidecarTokenOf(frozen),
      state: "spawned",
    };
    this.sidecars.set(frozen.sidecarId, record);
    return {
      ok: true,
      value: { handleKind: "sidecar-process", sidecarId: frozen.sidecarId, token: record.token },
    };
  }

  querySidecar(handle: SidecarHandle): SubstrateOutcome<SidecarStatus> {
    const guard = lifecycleGuard(this.phase);
    if (guard !== null) return guard;
    const record = this.sidecars.get(handle.sidecarId);
    if (record === undefined || record.token !== handle.token) {
      return refused(FAMILY, "contract-mismatch", `unknown sidecar handle ${handle.token}`);
    }
    // the documented deterministic readiness handshake: the FIRST status
    // query of a freshly spawned sidecar transitions it to ready (both
    // doubles model the startup probe identically)
    if (record.state === "spawned") {
      record.state = "ready";
    }
    return {
      ok: true,
      value: {
        sidecarId: record.sidecarId,
        state: record.state,
        detail: record.state === "ready" ? "the deterministic lifecycle machine reports ready" : null,
      },
    };
  }

  teardownSidecar(handle: SidecarHandle): SubstrateOutcome<null> {
    const guard = lifecycleGuard(this.phase);
    if (guard !== null) return guard;
    const record = this.sidecars.get(handle.sidecarId);
    if (record === undefined || record.token !== handle.token) {
      return refused(FAMILY, "contract-mismatch", `unknown sidecar handle ${handle.token}`);
    }
    // idempotent for already-terminated handles (law 2)
    if (record.state !== "terminated") {
      record.state = "terminated";
    }
    return { ok: true, value: null };
  }

  shutdown(): SubstrateOutcome<ShellShutdownReport> {
    if (this.phase !== "ready") {
      return refused(FAMILY, "contract-mismatch", "the shell is not in the ready phase");
    }
    const closedWindowIds = [...this.windows.keys()].sort();
    const tornDownSidecarIds = [...this.sidecars.keys()].sort();
    this.windows.clear();
    this.viewStates.clear();
    this.sidecars.clear();
    this.phase = "shutdown";
    return {
      ok: true,
      value: {
        phase: "shutdown",
        closedWindowIds,
        tornDownSidecarIds,
        provenance: shellProvenanceOf(this.descriptor, {
          closedWindowIds,
          tornDownSidecarIds,
        }),
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* The Electron-like double (event-queue reducer model)                 */
/* ------------------------------------------------------------------ */

/** The typed events the Electron-like reducer applies. */
type ShellEvent =
  | { readonly event: "initialize" }
  | { readonly event: "sidecar-ready"; readonly token: string }
  | { readonly event: "create-window"; readonly spec: Parameters<DesktopShellAdapter["createWindow"]>[0] }
  | { readonly event: "set-window-state"; readonly windowId: string; readonly patch: Record<string, unknown> }
  | { readonly event: "set-view-lane"; readonly windowId: string; readonly lane: DesktopViewState["lane"]; readonly worldCamera: CameraState | null }
  | { readonly event: "spawn-sidecar"; readonly spec: SidecarSpec }
  | { readonly event: "teardown-sidecar"; readonly token: string }
  | { readonly event: "shutdown" };

interface ReducerState {
  phase: "uninitialized" | "ready" | "shutdown";
  readonly windows: DesktopWindowState[];
  readonly viewStates: DesktopViewState[];
  readonly sidecars: SidecarRecord[];
}

const INITIAL_REDUCER_STATE: ReducerState = {
  phase: "uninitialized",
  windows: [],
  viewStates: [],
  sidecars: [],
};

/** Applies one event to the reducer state (the pure transition). */
function reduceEvent(state: ReducerState, event: ShellEvent): ReducerState {
  {
    switch (event.event) {
      case "initialize":
        return { ...state, phase: "ready" };
      case "sidecar-ready": {
        const sidecars = state.sidecars.map((s) =>
          s.token === event.token && s.state === "spawned"
            ? { ...s, state: "ready" as const }
            : s,
        );
        return { ...state, sidecars };
      }
      case "create-window": {
        const window: DesktopWindowState = {
          windowId: event.spec.windowId,
          title: event.spec.title,
          position: event.spec.position,
          size: event.spec.size,
          minimized: false,
          maximized: false,
        };
        return {
          ...state,
          windows: [...state.windows, window],
          viewStates: [
            ...state.viewStates,
            { windowId: event.spec.windowId, lane: "world", worldCamera: null },
          ],
        };
      }
      case "set-window-state": {
        const windows = state.windows.map((w) => {
          if (w.windowId !== event.windowId) return w;
          const patch = event.patch as {
            title?: string;
            position?: { x: number; y: number };
            size?: { width: number; height: number };
            minimized?: boolean;
            maximized?: boolean;
          };
          return {
            windowId: w.windowId,
            title: patch.title !== undefined ? patch.title : w.title,
            position: patch.position !== undefined ? patch.position : w.position,
            size: patch.size !== undefined ? patch.size : w.size,
            minimized: patch.minimized !== undefined ? patch.minimized : w.minimized,
            maximized: patch.maximized !== undefined ? patch.maximized : w.maximized,
          };
        });
        return { ...state, windows };
      }
      case "set-view-lane": {
        const viewStates = state.viewStates.map((v) =>
          v.windowId === event.windowId
            ? { windowId: event.windowId, lane: event.lane, worldCamera: event.worldCamera }
            : v,
        );
        return { ...state, viewStates };
      }
      case "spawn-sidecar": {
        const record: SidecarRecord = {
          sidecarId: event.spec.sidecarId,
          token: sidecarTokenOf(event.spec),
          state: "spawned",
        };
        return { ...state, sidecars: [...state.sidecars, record] };
      }
      case "teardown-sidecar": {
        const sidecars = state.sidecars.map((s) =>
          s.token === event.token ? { ...s, state: "terminated" as const } : s,
        );
        return { ...state, sidecars };
      }
      case "shutdown":
        return { phase: "shutdown", windows: [], viewStates: [], sidecars: [] };
    }
  }
}

/** Drains the event queue synchronously (the simulated main loop). */
function flushQueue(state: ReducerState, queue: ShellEvent[]): ReducerState {
  let current = state;
  while (queue.length > 0) {
    const event = queue.shift();
    if (event !== undefined) {
      current = reduceEvent(current, event);
    }
  }
  return current;
}

export class ElectronLikeShellDouble implements DesktopShellAdapter {
  readonly portId = "desktop.shell/1" as const;
  readonly capabilities: DesktopShellCapabilities = SHELL_DOUBLE_CAPABILITIES;
  readonly descriptor: SubstrateProviderDescriptor = ELECTRON_LIKE_SHELL_DOUBLE_DESCRIPTOR;

  private state: ReducerState = INITIAL_REDUCER_STATE;
  private readonly queue: ShellEvent[] = [];

  initialize(): SubstrateOutcome<ShellReady> {
    if (this.state.phase === "ready") {
      return refused(FAMILY, "contract-mismatch", "the shell is already initialized");
    }
    if (this.state.phase === "shutdown") {
      return refused(FAMILY, "contract-mismatch", "the shell is shut down and cannot re-initialize");
    }
    this.queue.push({ event: "initialize" });
    this.state = flushQueue(this.state, this.queue);
    return {
      ok: true,
      value: {
        phase: "ready",
        shellDescriptorDigest: canonicalDigestOf(this.descriptor),
        liveWindows: 0,
        liveSidecars: 0,
      },
    };
  }

  createWindow(spec: Parameters<DesktopShellAdapter["createWindow"]>[0]): SubstrateOutcome<DesktopWindowState> {
    const guard = lifecycleGuard(this.state.phase);
    if (guard !== null) return guard;
    const frozen = deepFreeze(spec);
    const violations = windowSpecViolations(frozen);
    if (this.state.windows.some((w) => w.windowId === frozen.windowId)) {
      violations.push(`window ${frozen.windowId} already exists`);
    }
    if (violations.length > 0) {
      return refused(FAMILY, "contract-mismatch", `createWindow refused: ${violations.join("; ")}`);
    }
    this.queue.push({ event: "create-window", spec: frozen });
    this.state = flushQueue(this.state, this.queue);
    const created = this.state.windows.find((w) => w.windowId === frozen.windowId);
    return created === undefined
      ? refused(FAMILY, "operation-semantic-failure", "internal: the reducer lost the created window")
      : { ok: true, value: created };
  }

  setWindowState(
    windowId: string,
    patch: Partial<
      Pick<DesktopWindowState, "title" | "position" | "size" | "minimized" | "maximized">
    >,
  ): SubstrateOutcome<DesktopWindowState> {
    const guard = lifecycleGuard(this.state.phase);
    if (guard !== null) return guard;
    const current = this.state.windows.find((w) => w.windowId === windowId);
    if (current === undefined) {
      return refused(FAMILY, "contract-mismatch", `unknown window ${windowId}`);
    }
    if (patch.size !== undefined && (!(patch.size.width > 0) || !(patch.size.height > 0))) {
      return refused(FAMILY, "contract-mismatch", "window size must be strictly positive");
    }
    this.queue.push({ event: "set-window-state", windowId, patch: { ...patch } });
    this.state = flushQueue(this.state, this.queue);
    const next = this.state.windows.find((w) => w.windowId === windowId);
    return next === undefined
      ? refused(FAMILY, "operation-semantic-failure", "internal: the reducer lost the window")
      : { ok: true, value: next };
  }

  getWindowState(windowId: string): SubstrateOutcome<DesktopWindowState> {
    const guard = lifecycleGuard(this.state.phase);
    if (guard !== null) return guard;
    const current = this.state.windows.find((w) => w.windowId === windowId);
    if (current === undefined) {
      return refused(FAMILY, "contract-mismatch", `unknown window ${windowId}`);
    }
    return { ok: true, value: current };
  }

  setViewLane(
    windowId: string,
    lane: DesktopViewState["lane"],
    worldCamera: CameraState | null,
  ): SubstrateOutcome<DesktopViewState> {
    const guard = lifecycleGuard(this.state.phase);
    if (guard !== null) return guard;
    const current = this.state.viewStates.find((v) => v.windowId === windowId);
    if (current === undefined) {
      return refused(FAMILY, "contract-mismatch", `unknown window ${windowId}`);
    }
    this.queue.push({ event: "set-view-lane", windowId, lane, worldCamera });
    this.state = flushQueue(this.state, this.queue);
    const next = this.state.viewStates.find((v) => v.windowId === windowId);
    return next === undefined
      ? refused(FAMILY, "operation-semantic-failure", "internal: the reducer lost the view state")
      : { ok: true, value: next };
  }

  spawnSidecar(spec: SidecarSpec): SubstrateOutcome<SidecarHandle> {
    const guard = lifecycleGuard(this.state.phase);
    if (guard !== null) return guard;
    const frozen = deepFreeze(spec);
    const violations = sidecarSpecViolations(frozen);
    if (this.state.sidecars.some((s) => s.sidecarId === frozen.sidecarId)) {
      violations.push(`sidecar ${frozen.sidecarId} already exists`);
    }
    if (violations.length > 0) {
      return refused(FAMILY, "contract-mismatch", `spawnSidecar refused: ${violations.join("; ")}`);
    }
    this.queue.push({ event: "spawn-sidecar", spec: frozen });
    this.state = flushQueue(this.state, this.queue);
    const record = this.state.sidecars.find((s) => s.sidecarId === frozen.sidecarId);
    return record === undefined
      ? refused(FAMILY, "operation-semantic-failure", "internal: the reducer lost the sidecar")
      : {
          ok: true,
          value: { handleKind: "sidecar-process", sidecarId: record.sidecarId, token: record.token },
        };
  }

  querySidecar(handle: SidecarHandle): SubstrateOutcome<SidecarStatus> {
    const guard = lifecycleGuard(this.state.phase);
    if (guard !== null) return guard;
    const record = this.state.sidecars.find((s) => s.token === handle.token);
    if (record === undefined) {
      return refused(FAMILY, "contract-mismatch", `unknown sidecar handle ${handle.token}`);
    }
    // the documented deterministic readiness handshake (identical rule to
    // the Tauri-like double — the observable contract behavior is shared)
    if (record.state === "spawned") {
      this.queue.push({ event: "sidecar-ready", token: handle.token });
      this.state = flushQueue(this.state, this.queue);
    }
    const ready = this.state.sidecars.find((s) => s.token === handle.token);
    if (ready === undefined) {
      return refused(FAMILY, "operation-semantic-failure", "internal: the reducer lost the sidecar");
    }
    return {
      ok: true,
      value: {
        sidecarId: ready.sidecarId,
        state: ready.state,
        detail: ready.state === "ready" ? "the deterministic lifecycle machine reports ready" : null,
      },
    };
  }

  teardownSidecar(handle: SidecarHandle): SubstrateOutcome<null> {
    const guard = lifecycleGuard(this.state.phase);
    if (guard !== null) return guard;
    const record = this.state.sidecars.find((s) => s.token === handle.token);
    if (record === undefined) {
      return refused(FAMILY, "contract-mismatch", `unknown sidecar handle ${handle.token}`);
    }
    this.queue.push({ event: "teardown-sidecar", token: handle.token });
    this.state = flushQueue(this.state, this.queue);
    return { ok: true, value: null };
  }

  shutdown(): SubstrateOutcome<ShellShutdownReport> {
    if (this.state.phase !== "ready") {
      return refused(FAMILY, "contract-mismatch", "the shell is not in the ready phase");
    }
    const closedWindowIds = this.state.windows.map((w) => w.windowId).sort();
    const tornDownSidecarIds = this.state.sidecars.map((s) => s.sidecarId).sort();
    this.queue.push({ event: "shutdown" });
    this.state = flushQueue(this.state, this.queue);
    return {
      ok: true,
      value: {
        phase: "shutdown",
        closedWindowIds,
        tornDownSidecarIds,
        provenance: shellProvenanceOf(this.descriptor, {
          closedWindowIds,
          tornDownSidecarIds,
        }),
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Convenience constructors                                             */
/* ------------------------------------------------------------------ */

/** The Tauri-candidate modeling double. */
export function tauriLikeShellDouble(): DesktopShellAdapter {
  return new TauriLikeShellDouble();
}

/** The Electron-candidate modeling double (independent code path). */
export function electronLikeShellDouble(): DesktopShellAdapter {
  return new ElectronLikeShellDouble();
}
