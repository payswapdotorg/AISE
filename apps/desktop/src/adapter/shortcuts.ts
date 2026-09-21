/**
 * PROD-020 — the desktop adapter's DECLARATIVE KEYBOARD-SHORTCUT REGISTRY.
 *
 * Keyboard shortcuts are PRESENTATION, never authority (the frozen
 * discipline): every shortcut resolves to a COMMAND, and every command is
 * either
 *
 *  - a `presentation` command (focus a pane, cycle the density, toggle
 *    multi-window review) that only changes viewport state, or
 *  - a `shared-action` command whose execution path is ALWAYS the adapter
 *    client's shared seam (client.ts) — `submit-task-intent` authors and
 *    submits a typed `TaskIntent` and renders the SERVER-AUTHORITATIVE
 *    `OperationResult`; `open-project` loads the joined task-flow bundle
 *    through the same `/v1/adapter/**` endpoints the browser adapter
 *    consumes. There is deliberately NO command that mutates an
 *    authoritative field: the registry cannot approve, deny, upgrade,
 *    verify or measure anything (asserted by tests — the command
 *    catalogue is frozen data and its `authority` field is always false).
 *
 * The registry is declarative and platform-parameterized: accelerators
 * are given in Electron's accelerator vocabulary with `CommandOrControl`
 * so the same declaration wires macOS (⌘) and Windows/Linux (Ctrl). The
 * shell (shell/main.ts) registers these accelerators and routes the
 * commands to the adapter client; the registry itself is pure data + pure
 * functions (fully unit-testable without launching the platform binary).
 *
 * Determinism: pure data + pure functions; no clock, no randomness, no IO.
 */

import type { ReviewPaneId } from "./review-layout";

/* ------------------------------------------------------------------ */
/* The command catalogue                                                */
/* ------------------------------------------------------------------ */

/** The desktop adapter's shortcut-command ids (frozen vocabulary). */
export const DESKTOP_COMMANDS = [
  "open-project",
  "focus-next-pane",
  "focus-pane",
  "cycle-density",
  "toggle-multi-window-review",
  "open-local-file",
  "refresh-task-flow",
  "submit-task-intent",
  "show-shortcuts",
] as const;
export type DesktopCommand = (typeof DESKTOP_COMMANDS)[number];

/** How a command executes (the authority discipline, in data). */
export type CommandExecutionKind =
  /** Pure viewport/presentation state change — no server action. */
  | "presentation"
  /** Resolves to a shared server/domain action through the adapter client. */
  | "shared-action";

/** One command's execution discipline (frozen data). */
export interface CommandDiscipline {
  readonly command: DesktopCommand;
  readonly execution: CommandExecutionKind;
  /**
   * Always false in this registry: no shortcut command may mutate
   * authoritative state (readiness, measurement, sufficiency,
   * verification, approval, authorization). Asserted by tests.
   */
  readonly mutatesAuthoritativeState: false;
}

/** The execution discipline of every command (the frozen catalogue). */
export const COMMAND_DISCIPLINES: Readonly<Record<DesktopCommand, CommandDiscipline>> =
  Object.freeze({
    "open-project": {
      command: "open-project",
      execution: "shared-action",
      mutatesAuthoritativeState: false,
    },
    "focus-next-pane": {
      command: "focus-next-pane",
      execution: "presentation",
      mutatesAuthoritativeState: false,
    },
    "focus-pane": {
      command: "focus-pane",
      execution: "presentation",
      mutatesAuthoritativeState: false,
    },
    "cycle-density": {
      command: "cycle-density",
      execution: "presentation",
      mutatesAuthoritativeState: false,
    },
    "toggle-multi-window-review": {
      command: "toggle-multi-window-review",
      execution: "presentation",
      mutatesAuthoritativeState: false,
    },
    "open-local-file": {
      command: "open-local-file",
      execution: "shared-action",
      mutatesAuthoritativeState: false,
    },
    "refresh-task-flow": {
      command: "refresh-task-flow",
      execution: "shared-action",
      mutatesAuthoritativeState: false,
    },
    "submit-task-intent": {
      command: "submit-task-intent",
      execution: "shared-action",
      mutatesAuthoritativeState: false,
    },
    "show-shortcuts": {
      command: "show-shortcuts",
      execution: "presentation",
      mutatesAuthoritativeState: false,
    },
  });

/* ------------------------------------------------------------------ */
/* The registry                                                         */
/* ------------------------------------------------------------------ */

/** The keyboard platforms the registry parameterizes. */
export const KEYBOARD_PLATFORMS = ["macos", "windows-linux"] as const;
export type KeyboardPlatform = (typeof KEYBOARD_PLATFORMS)[number];

/** One declarative keyboard shortcut. */
export interface ShortcutDefinition {
  /** The command the shortcut resolves to. */
  readonly command: DesktopCommand;
  /** The menu/title label shown to the user. */
  readonly title: string;
  /** The Electron accelerator string (CommandOrControl = ⌘ / Ctrl). */
  readonly accelerator: string;
  /** Optional: the pane this focus shortcut targets. */
  readonly targetPane?: ReviewPaneId;
  /** Whether the shortcut appears in the shell menu (data for buildMenu). */
  readonly inMenu: boolean;
}

/**
 * The desktop shortcut registry (frozen, declarative). `Mod+1..9` focus
 * the review panes in layout order — the same order
 * `denseReviewLayout().focusOrder` defines, so the wiring is checkable in
 * tests without launching the shell.
 */
export const DESKTOP_SHORTCUTS: readonly ShortcutDefinition[] = Object.freeze([
  { command: "open-project", title: "Open Project…", accelerator: "CommandOrControl+O", inMenu: true },
  { command: "focus-next-pane", title: "Focus Next Pane", accelerator: "CommandOrControl+]", inMenu: true },
  { command: "focus-pane", title: "Focus Context Column", accelerator: "CommandOrControl+1", targetPane: "pane:project-context", inMenu: true },
  { command: "focus-pane", title: "Focus Review Column", accelerator: "CommandOrControl+2", targetPane: "pane:boq", inMenu: true },
  { command: "focus-pane", title: "Focus Action Column", accelerator: "CommandOrControl+3", targetPane: "pane:next-best-action", inMenu: true },
  { command: "cycle-density", title: "Cycle Review Density", accelerator: "CommandOrControl+D", inMenu: true },
  { command: "toggle-multi-window-review", title: "Toggle Multi-Window Review", accelerator: "CommandOrControl+Shift+W", inMenu: true },
  { command: "open-local-file", title: "Open Local File…", accelerator: "CommandOrControl+Shift+O", inMenu: true },
  { command: "refresh-task-flow", title: "Refresh Task Flow", accelerator: "CommandOrControl+R", inMenu: true },
  { command: "submit-task-intent", title: "Submit Task Intent", accelerator: "CommandOrControl+Enter", inMenu: true },
  { command: "show-shortcuts", title: "Keyboard Shortcuts", accelerator: "CommandOrControl+/", inMenu: true },
]);

/* ------------------------------------------------------------------ */
/* Resolution (pure)                                                    */
/* ------------------------------------------------------------------ */

/**
 * Normalize one accelerator for the platform: `CommandOrControl` maps to
 * `Cmd` on macOS and `Ctrl` on Windows/Linux (display form). Used for
 * conflict detection and help rendering; the shell registers the raw
 * Electron form.
 */
export function displayAccelerator(accelerator: string, platform: KeyboardPlatform): string {
  const head = platform === "macos" ? "Cmd" : "Ctrl";
  return accelerator.replace("CommandOrControl", head).replace(/\+/g, platform === "macos" ? "+" : "+");
}

/** All shortcuts bound to one accelerator (conflict detection input). */
export function shortcutsByAccelerator(
  accelerator: string,
): readonly ShortcutDefinition[] {
  return DESKTOP_SHORTCUTS.filter((shortcut) => shortcut.accelerator === accelerator);
}

/**
 * Resolve one pressed accelerator to its command. Returns the shortcut
 * definition, or null when no registered shortcut matches (the shell
 * ignores unbound keys). Deterministic: the FIRST matching declaration in
 * registry order wins.
 */
export function resolveShortcut(accelerator: string): ShortcutDefinition | null {
  return DESKTOP_SHORTCUTS.find((shortcut) => shortcut.accelerator === accelerator) ?? null;
}

/** All shortcuts resolving to one command (the command's bindings). */
export function shortcutsForCommand(command: DesktopCommand): readonly ShortcutDefinition[] {
  return DESKTOP_SHORTCUTS.filter((shortcut) => shortcut.command === command);
}

/** The discipline of the command a shortcut resolves to. */
export function shortcutDiscipline(shortcut: ShortcutDefinition): CommandDiscipline {
  return COMMAND_DISCIPLINES[shortcut.command];
}

/* ------------------------------------------------------------------ */
/* Registry discipline checks (pure — asserted by tests, usable by CI)   */
/* ------------------------------------------------------------------ */

/** One registry discipline defect. */
export interface ShortcutRegistryDefect {
  readonly kind: "duplicate-accelerator" | "focus-target-unknown" | "unknown-command";
  readonly detail: string;
}

/**
 * Check the registry's own discipline (pure): accelerators are unique,
 * every focus-pane shortcut names a known review pane kind, and every
 * shortcut's command exists in the frozen catalogue with the honest
 * `mutatesAuthoritativeState: false` discipline.
 */
export function shortcutRegistryDefects(): readonly ShortcutRegistryDefect[] {
  const defects: ShortcutRegistryDefect[] = [];
  const seen = new Map<string, number>();
  for (const shortcut of DESKTOP_SHORTCUTS) {
    const count = seen.get(shortcut.accelerator) ?? 0;
    if (count > 0) {
      defects.push({
        kind: "duplicate-accelerator",
        detail: `${shortcut.accelerator} is bound more than once`,
      });
    }
    seen.set(shortcut.accelerator, count + 1);
    if (!DESKTOP_COMMANDS.includes(shortcut.command)) {
      defects.push({
        kind: "unknown-command",
        detail: `${shortcut.accelerator} resolves to unknown command ${shortcut.command}`,
      });
    }
    if (COMMAND_DISCIPLINES[shortcut.command].mutatesAuthoritativeState !== false) {
      defects.push({
        kind: "unknown-command",
        detail: `${shortcut.command} claims authoritative mutation — forbidden`,
      });
    }
    if (shortcut.command === "focus-pane") {
      if (shortcut.targetPane === undefined) {
        defects.push({
          kind: "focus-target-unknown",
          detail: `${shortcut.accelerator} focuses no pane`,
        });
      } else if (!shortcut.targetPane.startsWith("pane:")) {
        defects.push({
          kind: "focus-target-unknown",
          detail: `${shortcut.accelerator} targets malformed pane id ${shortcut.targetPane}`,
        });
      }
    }
  }
  return defects;
}
