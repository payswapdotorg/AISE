/**
 * PROD-020 — the desktop SHELL POLICY: the pure, unit-testable behavior
 * of the thin Electron layer — argument handling, the URL/loading policy,
 * the declarative menu template and the accelerator/IPC wiring plan.
 *
 * The platform layer (shell/main.ts — the ONLY file that imports
 * `electron`) stays a thin consumer of this module: every decision the
 * shell makes at runtime is a pure function here, so the shell's
 * BEHAVIOR is fully unit-tested under plain `bun test` WITHOUT launching
 * the platform binary (the work-order requirement for the headless
 * sandbox; the Lead runs the launch smoke at the integration station).
 *
 * LOADING POLICY (the thin-shell contract over the existing web app):
 * the shell loads EITHER the web app's dev/preview server over http(s)
 * (`--url` / `AISE_DESKTOP_TARGET_URL`, default
 * `http://localhost:5173` — the documented web dev port) OR its built
 * assets from a directory (`--dir` / `AISE_DESKTOP_TARGET_DIR`, loading
 * the directory's `index.html` through the file: protocol). Anything
 * else — non-http(s) schemes in `--url`, `javascript:`/unknown
 * protocols, a missing directory — is a typed rejection the shell
 * renders instead of loading (never a silent fallback, never a guess).
 *
 * DEEP LINKS: `aise://project/<projectId>` opens the shell on one
 * project — the load target stays the configured web app; the deep link
 * drives the ADAPTER client's `openProject` (a shared server action),
 * not a special UI route.
 *
 * Determinism: pure data + pure functions; no clock, no randomness,
 * no IO (existence checks are the shell's concern — the policy pure
 * function receives a `directoryExists` predicate).
 */

import {
  DESKTOP_SHORTCUTS,
  resolveShortcut,
  type DesktopCommand,
  type ShortcutDefinition,
} from "../adapter/shortcuts";

/* ------------------------------------------------------------------ */
/* Argument handling                                                    */
/* ------------------------------------------------------------------ */

/** The parsed desktop shell arguments. */
export type ShellArguments =
  | { readonly kind: "load-target"; readonly target: LoadTarget }
  | { readonly kind: "deep-link"; readonly projectRef: string; readonly target: LoadTarget }
  | { readonly kind: "invalid"; readonly reason: string };

/** Where the shell loads the web application from. */
export type LoadTarget =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "directory"; readonly path: string };

/** The default web dev-server URL (the documented apps/web dev port). */
export const DEFAULT_DEV_URL = "http://localhost:5173";

/** The AISE desktop deep-link scheme. */
export const AISE_DESKTOP_SCHEME = "aise://";

/** One argument parse (pure). */
export function parseShellArguments(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  options?: { readonly directoryExists?: (path: string) => boolean },
): ShellArguments {
  const directoryExists = options?.directoryExists ?? (() => false);

  let url: string | undefined = env.AISE_DESKTOP_TARGET_URL;
  let dir: string | undefined = env.AISE_DESKTOP_TARGET_DIR;
  let deepLink: string | undefined;
  let dev = false;

  for (const raw of argv) {
    const arg = raw.trim();
    if (arg === "--dev") {
      dev = true;
      continue;
    }
    if (arg.startsWith("--url=")) {
      url = arg.slice("--url=".length);
      continue;
    }
    if (arg.startsWith("--dir=")) {
      dir = arg.slice("--dir=".length);
      continue;
    }
    if (arg.startsWith(AISE_DESKTOP_SCHEME)) {
      deepLink = arg;
      continue;
    }
    return { kind: "invalid", reason: `unknown argument: ${arg}` };
  }

  if (url !== undefined && dir !== undefined) {
    return {
      kind: "invalid",
      reason: "--url and --dir (or AISE_DESKTOP_TARGET_URL and AISE_DESKTOP_TARGET_DIR) are mutually exclusive",
    };
  }

  // The loading target: explicit --url > explicit --dir > env --url >
  // env --dir > the default dev-server URL.
  let target: LoadTarget;
  if (url !== undefined && url !== "") {
    const checked = checkUrl(url);
    if (checked.kind === "invalid") {
      return { kind: "invalid", reason: `--url rejected: ${checked.reason}` };
    }
    target = { kind: "url", url: checked.url };
  } else if (dir !== undefined && dir !== "") {
    if (!directoryExists(dir)) {
      return {
        kind: "invalid",
        reason: `--dir rejected: directory not found: ${dir}`,
      };
    }
    target = { kind: "directory", path: dir };
  } else {
    target = { kind: "url", url: DEFAULT_DEV_URL };
  }

  if (deepLink !== undefined) {
    const projectRef = parseDeepLinkProject(deepLink);
    if (projectRef === null) {
      return {
        kind: "invalid",
        reason: `malformed deep link: ${deepLink} (expected ${AISE_DESKTOP_SCHEME}project/<projectId>)`,
      };
    }
    return { kind: "deep-link", projectRef, target };
  }

  // `--dev` is an explicit, visible alias for the default dev target
  // (it never overrides an explicit --url/--dir).
  if (dev && url === undefined && dir === undefined) {
    target = { kind: "url", url: DEFAULT_DEV_URL };
  }
  return { kind: "load-target", target };
}

/** The URL acceptance check (http/https only; never other schemes). */
export function checkUrl(
  raw: string,
): { readonly kind: "ok"; readonly url: string } | { readonly kind: "invalid"; readonly reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { kind: "invalid", reason: `not a valid URL: ${raw}` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      kind: "invalid",
      reason: `only http/https load targets are accepted (got ${parsed.protocol}; use --dir for built assets)`,
    };
  }
  return { kind: "ok", url: parsed.toString() };
}

/** Parse `aise://project/<projectId>` (null when malformed). */
export function parseDeepLinkProject(deepLink: string): string | null {
  if (!deepLink.startsWith(AISE_DESKTOP_SCHEME)) {
    return null;
  }
  const rest = deepLink.slice(AISE_DESKTOP_SCHEME.length);
  const match = /^project\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(rest);
  return match?.[1] ?? null;
}

/* ------------------------------------------------------------------ */
/* Window policy                                                        */
/* ------------------------------------------------------------------ */

/** The desktop review window's creation descriptor (high-density default). */
export const REVIEW_WINDOW_SPEC = Object.freeze({
  width: 1680,
  height: 1000,
  minWidth: 1200,
  minHeight: 720,
  title: "AISE Desktop — Review Workspace",
});

/* ------------------------------------------------------------------ */
/* The declarative menu template                                        */
/* ------------------------------------------------------------------ */

/** One declarative menu item (pure data the shell compiles to Electron). */
export interface MenuSpec {
  readonly id: string;
  readonly label: string;
  /** The shortcut command the item triggers (menu = another shortcut binding). */
  readonly command?: DesktopCommand;
  readonly targetPane?: string;
  readonly accelerator?: string;
  readonly role?: "separator";
  readonly submenu?: readonly MenuSpec[];
}

/** The accelerator for one command (its FIRST registered binding). */
export function acceleratorForCommand(command: DesktopCommand): string | null {
  return DESKTOP_SHORTCUTS.find((shortcut) => shortcut.command === command)?.accelerator ?? null;
}

/**
 * The declarative application menu: File (open project, recent projects,
 * open local file), View (density, refresh, multi-window), Review (pane
 * focus), Help (shortcuts). Every accelerator comes from the shortcut
 * registry — the menu and the keyboard are the SAME command surface
 * (checked by tests).
 */
export function buildMenu(options?: {
  readonly recentProjects?: readonly { readonly projectId: string; readonly projectName: string }[];
}): readonly MenuSpec[] {
  const recents = options?.recentProjects ?? [];
  const recentItems: MenuSpec[] =
    recents.length === 0
      ? [{ id: "file.recent.none", label: "No Recent Projects", role: "separator" }]
      : recents.map((entry) => ({
          id: `file.recent.${entry.projectId}`,
          label: entry.projectName,
          command: "open-project" as DesktopCommand,
        }));
  return [
    {
      id: "menu.file",
      label: "File",
      submenu: [
        {
          id: "file.open-project",
          label: "Open Project…",
          command: "open-project",
          accelerator: acceleratorForCommand("open-project") ?? undefined,
        },
        { id: "file.recent", label: "Open Recent", submenu: recentItems },
        {
          id: "file.open-local-file",
          label: "Open Local File…",
          command: "open-local-file",
          accelerator: acceleratorForCommand("open-local-file") ?? undefined,
        },
      ],
    },
    {
      id: "menu.view",
      label: "View",
      submenu: [
        {
          id: "view.cycle-density",
          label: "Cycle Review Density",
          command: "cycle-density",
          accelerator: acceleratorForCommand("cycle-density") ?? undefined,
        },
        {
          id: "view.refresh-task-flow",
          label: "Refresh Task Flow",
          command: "refresh-task-flow",
          accelerator: acceleratorForCommand("refresh-task-flow") ?? undefined,
        },
        {
          id: "view.multi-window",
          label: "Toggle Multi-Window Review",
          command: "toggle-multi-window-review",
          accelerator: acceleratorForCommand("toggle-multi-window-review") ?? undefined,
        },
      ],
    },
    {
      id: "menu.review",
      label: "Review",
      submenu: focusMenuItems(),
    },
    {
      id: "menu.help",
      label: "Help",
      submenu: [
        {
          id: "help.shortcuts",
          label: "Keyboard Shortcuts",
          command: "show-shortcuts",
          accelerator: acceleratorForCommand("show-shortcuts") ?? undefined,
        },
      ],
    },
  ];
}

function focusMenuItems(): MenuSpec[] {
  const focusShortcuts = DESKTOP_SHORTCUTS.filter((shortcut) => shortcut.command === "focus-pane");
  const items: MenuSpec[] = focusShortcuts.map((shortcut: ShortcutDefinition) => ({
    id: `review.focus.${shortcut.targetPane ?? "pane"}`,
    label: shortcut.title,
    command: "focus-pane",
    targetPane: shortcut.targetPane,
    accelerator: shortcut.accelerator,
  }));
  items.push({
    id: "review.focus-next",
    label: "Focus Next Pane",
    command: "focus-next-pane",
    accelerator: acceleratorForCommand("focus-next-pane") ?? undefined,
  });
  items.push({
    id: "review.submit-intent",
    label: "Submit Task Intent",
    command: "submit-task-intent",
    accelerator: acceleratorForCommand("submit-task-intent") ?? undefined,
  });
  return items;
}

/* ------------------------------------------------------------------ */
/* The wiring plan (what the shell registers — checked by tests)        */
/* ------------------------------------------------------------------ */

/**
 * The shell's accelerator wiring plan: every registry shortcut that is
 * menu-visible (`inMenu`) becomes a globalShortcut/Menu registration
 * entry bound to its command. The plan is pure data — the shell's
 * registration loop is three lines.
 */
export interface AcceleratorWiring {
  readonly accelerator: string;
  readonly command: DesktopCommand;
  readonly targetPane?: string;
}

export function acceleratorWiringPlan(): readonly AcceleratorWiring[] {
  return DESKTOP_SHORTCUTS.filter((shortcut) => shortcut.inMenu).map((shortcut) => ({
    accelerator: shortcut.accelerator,
    command: shortcut.command,
    targetPane: shortcut.targetPane,
  }));
}

/**
 * The IPC channel vocabulary the shell registers (main↔renderer). Kept
 * minimal and explicit: the desktop affordances are thin bridges to the
 * ADAPTER layer, never a side channel around the shared contract.
 */
export const SHELL_IPC_CHANNELS = Object.freeze({
  /** Renderer → main: open one project through the adapter client. */
  openProject: "desktop:open-project",
  /** Renderer → main: submit one TaskIntent through the adapter client. */
  submitIntent: "desktop:submit-intent",
  /** Main → renderer: the adapter client's answer payloads (view/outcome). */
  adapterAnswer: "desktop:adapter-answer",
  /** Renderer → main: the open-local-file affordance (capability-gated). */
  openLocalFile: "desktop:open-local-file",
  /** Main → renderer: OS notification contents (informational only). */
  notify: "desktop:notify",
} as const);

/**
 * Resolve one pressed accelerator to the shell dispatch it should
 * trigger. Pure: the same input always yields the same dispatch (the
 * menu, the global shortcuts and any renderer key handling share ONE
 * resolution function).
 */
export function dispatchForAccelerator(
  accelerator: string,
): { readonly command: DesktopCommand; readonly targetPane?: string } | null {
  const shortcut = resolveShortcut(accelerator);
  if (shortcut === null) {
    return null;
  }
  return { command: shortcut.command, targetPane: shortcut.targetPane };
}
