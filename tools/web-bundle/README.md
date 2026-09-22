# tools/web-bundle — the browser-bundle gate (PROD-030)

The gate that proves the apps/web production browser bundle stays free of
the shared-contract barrel defect class (the PROD-026-escalated
module-evaluation crash documented in
`docs/productization-evidence/PROD-012-R/repro-harness.ts` Phase 0b): a
Node-only fixtures loader re-exported from a package barrel, externalized
by the bundler for the browser, crashing module evaluation before the app
mounts — while `bun run build` succeeds and a build-only verify never
loads the bundle in a browser.

## Run

Part of `bun run verify` (picked up by bun test's default test-file
discovery — the same pickup that runs `tools/reality-eval/benchmark.test.ts`;
no root config change), or directly:

```bash
bun test tools/web-bundle/check.test.ts
```

Chromium must be installed for the repo's pinned playwright — the gate
FAILS EXPLICITLY with the exact command when it is not (browser checks are
never silently skipped):

```bash
bunx playwright install chromium
```

## Phases

1. **build** — spawns `bun run build` inside `apps/web` (cwd owned by the
   gate; generous bounded timeout: the vite build takes seconds to tens of
   seconds) and proves the artifacts exist.
2. **scan** — every built asset under `apps/web/dist/assets/*.js` plus the
   built `index.html` must contain NO Node-builtin import/externalization
   markers (see below).
3. **mount** — one real Chromium (`--no-sandbox` +
   `--disable-dev-shm-usage`, mirroring `tools/deployed/browser.ts`),
   serving `apps/web/dist` from an ephemeral loopback static server (no
   backend: the app's same-origin API probe fails honestly and the demo
   shell renders), loads `/` and asserts the app MOUNTS (shell root
   non-empty / the auth-gate heading `h2#gate-title` visible) with ZERO
   `pageerror` events. The browser closes no matter what.

## The scan markers

Each marker is chosen to be robust under minification and documented in
`docs/productization-evidence/PROD-030/bundle-audit.md`:

| id | pattern (concept) | catches |
|---|---|---|
| `M1` | a literal `node:fs` / `node:path` import specifier | build pipelines that preserve external specifier text (rolldown's dev-form externalization error messages carry it too) |
| `M2` | the vite browser-external stub feeding an fs/path-style call — the classic `__vite-browser-external` stub name, or rolldown's `(0, X.join|readdirSync|readFileSync)(` interop call shape | any surviving loader call through the externalized-builtin namespace |
| `M3` | `(0, X.join)(import.meta.dir` | the exact PROD-012-R-documented dead module-init (module-scope `join` on the externalized `node:path`) |

A marker that only matches this exact defect is acceptable — the point is
this defect class can never ship silently again. The known, deliberately
NOT-marked externalization: `node:crypto` inside the lazy
`solution-mount-*` chunk (the documented PROD-026 composition design — one
cached dynamic import inside a Suspense boundary whose rejection is caught
and renders the honest engine-unavailable panel; it is not reachable at
app mount).
