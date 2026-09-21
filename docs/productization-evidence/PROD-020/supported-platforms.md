# PROD-020 — Supported-platform declaration

**Adapter:** `@aise/desktop` (`apps/desktop`) — an Electron 44 thin
installed shell over the existing `apps/web` application, with the
adapter logic layer (`src/adapter/`) fully platform-independent
TypeScript running under Bun (typecheck/tests) and bundled into the
Electron main process (esbuild, node20 target).

## Declared supported desktop environments

| Environment | Status | Basis |
|---|---|---|
| **Linux x64** (X11/Wayland desktop environments, e.g. GNOME, KDE) | **Declared supported; contract-conformance verified in-sandbox** | the full conformance + journey + shell-behavior suite (175 tests) ran and passed on Linux x64 in the build sandbox (see conformance-report.md); the platform layer is Electron 44 (upstream-supported on Linux x64) |
| macOS (Apple silicon + Intel) | Declared supported by the Electron baseline; NOT launch-verified here | the shell uses only cross-platform Electron APIs (`app`, `BrowserWindow`, `Menu`, `dialog`, `Notification`, `loadURL`, `file://` and http/https load targets); accelerators use the `CommandOrControl` vocabulary (⌘ on macOS, Ctrl elsewhere — asserted by tests) |
| Windows 10/11 x64 | Declared supported by the Electron baseline; NOT launch-verified here | same cross-platform API surface; path handling in the shell uses `node:path` joins and the deep-link/id vocabularies are platform-neutral |

## Exactly what was and was not verified in-sandbox (honest)

**Verified in-sandbox (Linux x64, Bun 1.3.14, headless):**

- `bun install` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — the electron
  npm package (including its TypeScript definitions) installs as a
  devDependency of `apps/desktop` only;
- `tsc --noEmit -p apps/desktop/tsconfig.json` — clean, INCLUDING the
  electron main entry (`src/shell/main.ts`) typechecked against
  electron's own d.ts;
- `eslint .` at the repository root — clean over `apps/desktop` (the
  `no-console` discipline holds);
- `bun run build` (in `apps/desktop`) — the reproducible esbuild bundle
  `dist/shell/main.js` (ESM, node20, electron/node builtins external);
- `bun test apps/desktop` — **175 tests / 0 fail**: the contract
  conformance suite (C0–C9 with sabotage discrimination), the 12-item
  client conformance suite, the representative project/review journey,
  the client/entrypoint behaviors, the shell policy behaviors
  (argument handling, URL/loading policy, menu/accelerator wiring,
  deep links) — all WITHOUT launching the platform binary (the shell's
  decisions are pure functions in `src/shell/policy.ts`);
- the full root gate `bun run verify` — 3983 pass / 0 fail, boundaries
  clean, `VERIFY: PASS`.

**NOT verifiable in-sandbox (needs the platform binary and/or a
display — the Lead runs these at the integration station):**

- the Electron **binary download** (~100 MB from the Electron releases;
  skipped in-sandbox via `ELECTRON_SKIP_BINARY_DOWNLOAD=1`) and the
  actual **launch** (`bun run dev` / `bun run start` → `electron .`):
  window creation, loading the web dev server / built assets in a real
  BrowserWindow, OS dialog/notifications, the menu in a real desktop
  environment;
- macOS/Windows launch behavior (the declared-by-baseline environments
  above).

## How to run the launch smoke at the integration station

```bash
bun install                       # fetches the electron binary (no skip flag)
cd apps/web && bun run dev &      # target a: the web dev server (port 5173)
cd ../desktop && bun run build
bun run dev                       # electron . --dev → loads http://localhost:5173
# or, for built assets:
cd ../web && bun run build
cd ../desktop && bun run start -- --dir=../web/dist
# deep link:
electron . aise://project/proj-7f3a2b
```

Expected launch behavior (all unit-tested at the policy level): a
1680×1000 (min 1200×720) review window titled "AISE Desktop — Review
Workspace" loading the configured target; the four-section menu (File /
View / Review / Help) with the registry accelerators; typed startup
rejections for invalid targets.
