# PROD-020 — Build/run transcript

**Work item:** PROD-020 — Desktop adapter productization
**Base:** `0bbcb1fb11765ea5fcd9db7198210b7dd5975363` (public GitHub main —
PROD-016 + 017 + 019 + 021 merged)
**Branch:** `prod-020/desktop-adapter`

## What was built

`apps/desktop/` — a real bun workspace package (`@aise/desktop`), an
**Electron thin installed shell over the existing web application**
(ACR-004 desktop specialization) with a fully unit-testable adapter logic
layer:

| Layer | Files | Runs without the platform binary? |
|---|---|---|
| ADAPTER LOGIC | `src/adapter/` — `profile.ts` (the declared `ClientCapabilityProfile`, reference `desktop-rich-shell` as factual template), `seam.ts` (the contract decode seam: all twelve semantic objects + the three negotiation objects, `decodeX`/`decodeXStrict`/`encodeTaskIntent` through `@aise/adapter-contract`), `binding.ts` (the `runConformance` binding), `render-registry.ts` (presented-fields + verbatim pane renderer), `review-layout.ts` (high-density three-column review model + dense evidence table), `shortcuts.ts` (declarative shortcut registry), `local-integrations.ts` (capability-gated local affordances), `convenience-store.ts` (non-authoritative recents/preferences/outbox), `client.ts` (the entrypoints the shell drives: `openProject` / `refreshAuthorization` / `submitIntent` / `replayOutbox`), `corpus-world.ts` (the committed corpus world, pinned by tests) | **yes** — 175 tests under plain `bun test` |
| PLATFORM (thin shell) | `src/shell/policy.ts` (pure behavior: argument handling, URL/loading policy, declarative menu, accelerator wiring, IPC vocabulary — unit-tested), `src/shell/main.ts` (the ONLY file importing `electron`; no adapter logic), `scripts/build.ts` (esbuild bundle) | policy tests: **yes**; the launch itself: no (needs the binary + a display) |

Dependency shape (the "lightest maintainable" constraint):

- `@aise/adapter-contract` `workspace:*` — the shared contract, consumed
  (never modified) from the first commit.
- `electron` `^44.4.3` — a **devDependency of `apps/desktop` only**,
  never a root dependency.
- `esbuild` `^0.28.2` — devDependency of `apps/desktop` (same version as
  the root's, no duplicate install).

## The exact commands run (in-sandbox, in order)

```bash
git clone https://github.com/payswapdotorg/AISE.git
cd AISE
git checkout 0bbcb1fb11765ea5fcd9db7198210b7dd5975363
git rev-parse HEAD          # → 0bbcb1fb11765ea5fcd9db7198210b7dd5975363
bun install
bun run verify              # baseline: 3808 pass / 0 fail, VERIFY: PASS
git checkout -b prod-020/desktop-adapter

# the desktop package's platform dependency (binary skipped in-sandbox —
# the sandbox has no display; types + CLI still install):
ELECTRON_SKIP_BINARY_DOWNLOAD=1 bun install

# development loop:
./node_modules/typescript/bin/tsc --noEmit -p apps/desktop/tsconfig.json   # typecheck
cd apps/desktop && bun run build            # → dist/shell/main.js (233.4 kB, esbuild ESM)
bun test apps/desktop                        # the adapter suite (from the repo root)

# the gate (see conformance-report.md for the numbers):
cd /home/z/AISE && bun run verify            # → 3983 pass / 0 fail, VERIFY: PASS
```

## What ran in-sandbox vs what needs a display (honest)

| Activity | In-sandbox | Why / how |
|---|---|---|
| `bun install` (electron npm package, binary skipped) | ✅ ran | `ELECTRON_SKIP_BINARY_DOWNLOAD=1`; the package's TypeScript types install with the tarball — typecheck of `src/shell/main.ts` (which imports `electron`) passes |
| Electron **binary download** (~100 MB) | ❌ skipped | headless sandbox; the Lead runs a full `bun install` at the integration station to fetch it |
| Typecheck (`tsc --noEmit -p apps/desktop/tsconfig.json`) | ✅ ran, clean | covers `src/` + `scripts/` INCLUDING the electron main entry (electron's own d.ts) |
| Lint (`eslint .` at the root, covers `apps/desktop`) | ✅ ran, clean | `no-console` etc. |
| Shell **build** (`bun run build` → `dist/shell/main.js`) | ✅ ran | esbuild bundles `src/shell/main.ts` + the adapter layer; `electron`/`node:*` external; deterministic output |
| Shell **launch** (`electron .`) | ❌ not run | needs the platform binary + a display; the LEAD runs the launch smoke at the integration station |
| Shell **behavior** tests (argument handling, URL/loading policy, menu/accelerator wiring, deep links, dispatch) | ✅ ran | `src/shell/policy.test.ts` — the shell's decisions are pure functions in `src/shell/policy.ts`; `src/shell/main.ts` only wires platform events to them |
| Adapter suite (175 tests: conformance C0–C9, sabotage, the 12-item client suite, journey, client, layout, shortcuts, affordances, store, corpus pins) | ✅ ran | plain `bun test`, no platform binary, no network (stub transports + committed fixtures), no clock, no randomness |
| Full gate `bun run verify` | ✅ ran | 3983 pass / 0 fail (3808 baseline + 175 new), boundaries clean, `VERIFY: PASS` |

## Reproducibility notes

- `bun run build` is deterministic (fixed entry, `format: "esm"`,
  `platform: "node"`, no minification variance, no timestamps); the same
  tree produces the same `dist/shell/main.js`.
- `dist/` is build output — never committed, never delivered (source
  only; the boundary scanner and eslint both skip `dist/`).
- `bun.lock` changed in the working tree (the new `apps/desktop`
  devDependencies) and is deliberately NOT committed and NOT delivered:
  the Lead regenerates the canonical lockfile at the integration station
  from `apps/desktop/package.json`.
