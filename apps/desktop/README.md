# @aise/desktop — the AISE desktop adapter (PROD-020)

An **Electron thin installed shell over the existing web application**
(ACR-004's desktop specialization): it loads `apps/web` (the dev server
or its built assets) and adds only desktop-appropriate capabilities —
high-density review, keyboard shortcuts and optional local integration
affordances — over the shared `@aise/adapter-contract` semantic objects
(PROD-016). Desktop actions resolve to the **same shared server/domain
actions** the browser adapter consumes; there is no desktop-specific
endpoint, no domain fork, and **no local-filesystem authority**.

```text
                 AISE DOMAIN + SERVICE CORE  (backend/api)
                           ▲
                           │ shared /v1/adapter/** routes
          ┌────────────────┼────────────────┐
          │                │                │
   BROWSER (web)      MOBILE (android)   DESKTOP (this package)
        │                                      │
        │  ┌───────────────────────────────────┤
        └──┤ loads the web app (dev URL or    │
           │ built assets) — the thin shell   │
           │ + ADAPTER LAYER (this package):  │
           │   profile · seam · conformance   │
           │   review layout · shortcuts      │
           │   local affordances · outbox     │
           └───────────────────────────────────┘
```

## Layout

```text
src/adapter/               the ADAPTER LOGIC layer (100% unit-testable
                           under plain `bun test`, no platform binary)
  profile.ts               the declared ClientCapabilityProfile
                           (reference desktop-rich-shell as template)
  seam.ts                  the contract decode seam — all twelve
                           semantic objects + the negotiation family,
                           decoded through @aise/adapter-contract
  binding.ts               the conformance binding (runConformance)
  render-registry.ts       the presented-fields registry + the verbatim
                           pane line renderer (C4/C5 backing)
  review-layout.ts         the high-density review surface model
                           (three-column dense panes + evidence table)
  shortcuts.ts             the declarative keyboard-shortcut registry
                           (presentation, never authority)
  local-integrations.ts    optional local affordances behind explicit
                           capability declarations (non-authoritative)
  convenience-store.ts     recent projects · preferences · the
                           TaskIntent outbox (convenience only)
  client.ts                the adapter entrypoints the shell drives
                           (openProject / refreshAuthorization /
                           submitIntent / replayOutbox)
  corpus-world.ts          the committed PROD-016 corpus world (test
                           stub bodies, pinned by tests)
src/shell/                 the thin PLATFORM layer
  policy.ts                pure shell behavior: argument handling,
                           URL/loading policy, menu + wiring (tested)
  main.ts                  the Electron main entry (the ONLY file that
                           imports electron; no adapter logic)
scripts/build.ts           the reproducible esbuild bundle
src/journey/               the desktop project/review journey trace
```

## Prerequisites

- Bun ≥ 1.2 (the repository's only runtime requirement).
- The desktop platform binary: `electron` is a **devDependency of this
  package only** (never a root dependency). A plain `bun install` at the
  repo root downloads it; in environments where the binary download is
  undesired, `ELECTRON_SKIP_BINARY_DOWNLOAD=1 bun install` installs the
  package (types + CLI) without the ~100 MB binary — tests, typecheck,
  lint and the shell BUILD all work without the binary; only the LAUNCH
  needs it.
- The web application to wrap: either its dev server
  (`cd apps/web && bun run dev`, default `http://localhost:5173`) or its
  built assets (`cd apps/web && bun run build` → `apps/web/dist/`).

## Run

```bash
# 1. build the shell bundle (esbuild; deterministic)
cd apps/desktop
bun run build            # → dist/shell/main.js

# 2. start the web app (choose ONE target)
#    a) dev server:      cd ../web && bun run dev        (port 5173)
#    b) built assets:    cd ../web && bun run build      (→ ../web/dist)

# 3. run the shell
bun run dev              # electron . --dev  → loads http://localhost:5173
bun run start            # electron .        → --url/--dir/env decides (below)
```

Loading-target policy (mutually exclusive; first match wins):

| Source | Meaning |
|---|---|
| `--url=http://…` | load the web app from an http/https URL (dev or preview server) |
| `--dir=/path/to/dist` | load the web app's built `index.html` from a directory (file:) |
| `AISE_DESKTOP_TARGET_URL` | env equivalent of `--url` |
| `AISE_DESKTOP_TARGET_DIR` | env equivalent of `--dir` |
| *(none)* | the default dev target `http://localhost:5173` |

Deep links: `aise://project/<projectId>` opens the shell on one project —
the load target stays the configured web app; the deep link drives the
adapter client's `openProject` (a shared server action).

The adapter client talks to the backend API directly
(`AISE_API_URL`, default `http://127.0.0.1:8080` — the same API the web
app's dev server proxies for the browser). When the deployment does not
serve the shared adapter objects yet, the adapter renders the honest
`not-served` state (the same provider-gated state the browser adapter
renders) — never a guess.

## Tests and conformance (the root gate)

```bash
bun run test             # in apps/desktop — the adapter suite
bun run verify           # at the repo root — the FULL gate; the
                         # desktop suite is picked up automatically
```

- **Contract conformance (C0–C9):** `src/adapter/conformance.test.ts`
  runs `runConformance(createDesktopConformanceBinding(),
  loadCommittedFixtures())` — the shared harness over the committed
  PROD-016 corpus, driven by the adapter's REAL binding (the seam
  decoders, the render registry, the honest implemented-modes claim),
  plus sabotage discrimination (a dropped field, a hidden denial, a
  dishonest mode claim each FAIL explicit checks).
- **The 12-item client conformance suite** of
  `spec/client-adapter-contract.md` (project open/create, task
  selection, evidence inspection, next-best-action rendering, evidence
  submission, BOQ inspection, case inspection/update, intervention
  state, outcome comparison, authorization denial, failure state,
  offline/resume) — desktop item 12 is SUPPORTED (the TaskIntent outbox
  replays through the shared endpoint).
- **The representative journey:**
  `src/journey/desktop-journey.test.ts` — the project/review smoke
  trace through the adapter's REAL entrypoints (open project → review
  surfaces with provenance → blocked action → TaskIntent authoring →
  server-authoritative OperationResult → offline queue/replay).

## Non-authority (the frozen discipline)

- Local state (recent projects, preferences, the outbox) is convenience
  only — `resolveProjectIdentity` ALWAYS prefers the server-answered
  `ProjectContext`; a queued intent is never "completed" locally; only
  the server's `OperationResult` answers a submission.
- Keyboard shortcuts are presentation: no command mutates authoritative
  state; consequential commands resolve through the adapter client's
  shared seam.
- Local integration affordances (open-a-local-file dialogs, OS
  notifications) are gated behind explicit capability declarations and
  are optional: the open-local-file consequential leg is a typed
  `TaskIntent` the server validates and answers; OS notifications are
  informational only.

## Supported platforms

Declared and evidenced in
`docs/productization-evidence/PROD-020/supported-platforms.md`
(Linux x64 desktop environments with Electron 44; macOS and Windows are
supported by the same Electron baseline but were not launch-verified in
the sandbox — see the evidence for exactly what was and was not
verified).
