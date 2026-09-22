# PROD-030 — the shared-contract barrel browser-bundle fix (the PROD-026-escalated module-evaluation defect)

**Item:** fix the browser-bundle module-evaluation defect in the two
shared-contract barrels (`@aise/adapter-contract`, `@aise/solution-contract`
both re-exported a Node-only fixtures loader whose module scope crashes
plain-browser bundles), add the bundle gate that proves it stays fixed, and
update the three honest-limitation notes that documented the defect.

**Base:** `6ef2c3c1b5bf82fa3dc90ca1a19e7e7dd10786ed` (public GitHub main,
PROD-014 finalized). Baseline `bun run verify` at base: 5260 pass / 0 fail,
VERIFY: PASS.

**Scope doctrine:** a SEAM/PACKAGING fix — zero behavior changes. The
loaders keep working identically for every Node consumer; no test is
weakened, skipped or deleted; the public barrel of each package loses
exactly the loader symbols and keeps everything else.

---

## 1. The defect story

### The escalation record (PROD-026)

`docs/productization-evidence/PROD-026/end-to-end-journey.md` — the
"pre-existing baseline finding" section — reported that browser
verification against the BASE commit (before any PROD-026 change) showed
the web app ALREADY failed to load in a plain browser:
`packages/adapter-contract/src/fixtures-loader.ts` was re-exported from the
package index and computed module-level constants with `node:fs`/`node:path`
at evaluation, which Vite externalizes — the dashboard was blank with the
same class of module-evaluation error. The finding was escalated for a
governed shared fix: "This defect belongs to the adapter wave's seam
(PROD-016/017 territory)."

### The documented crash mechanism (PROD-012-R, Phase 0b)

`docs/productization-evidence/PROD-012-R/repro-harness.ts` — the Phase 0b
block — documented the exact mechanism, quoted from a real browser:

- both shared-contract barrels re-export `loadCommittedFixtures`
  (fixtures-loader.ts), whose MODULE SCOPE runs
  `join(import.meta.dir, "..")` from `node:path`;
- vite externalizes `node:path` for the browser
  (`__vite-browser-external` = `{}`), so the bundle throws
  `TypeError: (0, ga.join) is not a function` before the app ever mounts
  (no gate, no shell);
- `bun run build` succeeds and `bun run verify` never loads the built
  bundle in a browser — which is how the defect shipped unnoticed;
- the PROD-012 deployment predates the adapter wave, which is why the
  deployed site used to boot.

### The live production failure (2026-09-22 deployed-check)

The 2026-09-22 deployed-browser verification against the production
deployment recorded the defect signature live: the auth gate never becomes
visible, with 10 `pageerror` events carrying exactly the
module-evaluation TypeError. The gate heading (`h2#gate-title`) the
deployed-check shell selector waits for never renders because the bundle
crashes at module init — blank page, no auth gate, no shell.

### The two defect sites

- `packages/adapter-contract/src/index.ts`:
  `export { loadCommittedFixtures } from "./fixtures-loader";`
- `packages/solution-contract/src/index.ts`:
  `export { loadCommittedFixtures } from "./fixtures-loader";` plus
  `export type { SolutionFixtureRecord, SolutionFixtureCorpus } from
  "./fixtures-loader";`

Each loader imports `node:fs`/`node:path` AND evaluates
`join(import.meta.dir, "..")` at MODULE SCOPE. `apps/web` imports the
barrels; vite bundles the loaders along; for the browser it externalizes
the Node builtins, so the module-init call throws before the app ever
mounts.

## 2. The fix — subpath exports (the mandated design)

1. `packages/adapter-contract/package.json` — the exports map gains the
   documented subpath:

   ```json
   "exports": {
     ".": "./src/index.ts",
     "./fixtures-loader": "./src/fixtures-loader.ts"
   }
   ```

2. `packages/adapter-contract/src/index.ts` — the `loadCommittedFixtures`
   re-export line is DELETED (the trailing section becomes an honest
   pointer comment naming the subpath). Nothing else changes.

3. `packages/solution-contract/package.json` — the same subpath entry
   (`"./fixtures-loader": "./src/fixtures-loader.ts"`).

4. `packages/solution-contract/src/index.ts` — BOTH the
   `loadCommittedFixtures` re-export AND the `SolutionFixtureRecord`/
   `SolutionFixtureCorpus` type re-export are DELETED from the barrel (they
   move to the subpath with the loader). Nothing else changes.

5. Every in-repo consumer migrated to the deep import (import statements
   only; mixed import statements split so the remaining barrel symbols stay
   on the barrel import):

   | consumer | new import |
   |---|---|
   | `packages/adapter-contract/src/conformance.test.ts` | relative `"./fixtures-loader"` |
   | `packages/adapter-contract/src/authority.test.ts` | (surface list: the loader entry left the barrel-expectation list — see below) |
   | `packages/solution-contract/src/authority.test.ts` | (surface list: same) |
   | `packages/solution-contract/src/invariants.test.ts` | relative `"./fixtures-loader"` |
   | `apps/web/src/app/task-contract.test.ts` | `"@aise/adapter-contract/fixtures-loader"` |
   | `apps/web/src/app/conformance.test.tsx` | `"@aise/adapter-contract/fixtures-loader"` |
   | `apps/desktop/src/adapter/corpus-world.test.ts` | `"@aise/adapter-contract/fixtures-loader"` |
   | `apps/desktop/src/adapter/seam.test.ts` | `"@aise/adapter-contract/fixtures-loader"` |
   | `apps/desktop/src/adapter/conformance.test.ts` | `"@aise/adapter-contract/fixtures-loader"` |
   | `backend/api/src/reasoning/solution/compiler.test.ts` | `"@aise/solution-contract/fixtures-loader"` |

   Postcondition (verified by grep): NO import of `loadCommittedFixtures`
   from either bare barrel (`"@aise/adapter-contract"` /
   `"@aise/solution-contract"`) remains anywhere in the repo.

   **The two authority-test surface lists:** both
   `packages/*/src/authority.test.ts` files assert "the expected contract
   surface IS exported" through a required-name list that included
   `"loadCommittedFixtures"`. With the seam fix the loader is intentionally
   no longer part of the barrel surface, so that one list entry is removed
   — the lists keep every other expectation, and the new barrel-safety
   tests positively assert the ABSENCE (the surface expectation moved from
   "the barrel exports it" to "the subpath exports it; the barrel cannot
   reach it"). No test was weakened: each authority test still asserts the
   same strength for every other symbol.

   **`apps/desktop/src/adapter/corpus-world.ts`** (enumerated in the work
   order as a production-code consumer): it references
   `loadCommittedFixtures()` only in its doc comment (the PIN tests against
   it live in `corpus-world.test.ts`, which IS migrated) — it has no import
   statement of the loader, so no change was needed (verified by grep).

## 3. The REJECTED alternative — lazy module scope (documented, NOT implemented)

**Rejected design:** make the loader's module scope lazy — move the
`join(import.meta.dir, "..")` calls inside `loadCommittedFixtures()`.

**Why rejected:** that would stop THIS crash but still ship the loader
graph and the Node-builtin externalization stubs into every browser bundle
that imports the barrel — one future module-scope addition away from the
same crash (the defect shipped exactly because a "harmless" re-export
dragged a Node-only module into the browser graph). The subpath design
removes the loader from the browser module graph ENTIRELY: the barrel a
browser imports can no longer reach `node:fs`. The scan markers in the new
bundle gate enforce precisely that stronger property.

## 4. The bundle gate — `tools/web-bundle/` (NEW)

- `tools/web-bundle/gate.ts` — the gate: build (spawns `bun run build`
  inside apps/web, cwd owned by the gate, inherited env, generous bounded
  timeout), scan (every built asset under `apps/web/dist/assets/*.js` plus
  the built `index.html`, asserted free of the Node-builtin
  externalization markers — each marker documented in
  [bundle-audit.md](bundle-audit.md)), and the real Chromium mount check
  (mirroring `tools/deployed/browser.ts`: executable preflight that FAILS
  EXPLICITLY with the `bunx playwright install chromium` command;
  `--no-sandbox` + `--disable-dev-shm-usage`; ONE browser; an ephemeral
  loopback static server over `apps/web/dist` — no backend needed for the
  mount assertion; load `/`; assert the app MOUNTS (shell root non-empty /
  the auth-gate heading `h2#gate-title` visible) and ZERO `pageerror`
  events; guaranteed cleanup).
- `tools/web-bundle/check.test.ts` — the bun test suite that runs the gate,
  picked up by `bun run verify` through bun test's default test-file
  discovery (the same pickup that runs `tools/reality-eval/benchmark.test.ts`);
  NO root config change was needed or made (proven by the discovered
  suite/file count: 327 files at base → 330 files after, only the three new
  test files added).
- `tools/web-bundle/README.md` — how to run it and the marker table.
- Barrel-safety tests co-located in each package
  (`packages/adapter-contract/src/barrel-safety.test.ts`,
  `packages/solution-contract/src/barrel-safety.test.ts`): the barrel
  namespace does NOT export `loadCommittedFixtures`; the barrel source no
  longer imports/re-exports the loader module (the type re-exports left
  too — types leave no runtime trace, so the source is scanned); the
  barrel still exports its contract surface (sentinels); the package
  exports map declares the subpath; and the deep import loads the
  non-empty committed corpus (the round-trip proof the loader still works
  where it belongs).

The negative control (the gate FAILS on the pristine base with the defect
signature, then PASSES after the fix) is recorded verbatim in
[browser-proof.md](browser-proof.md).

## 5. Compatibility note

Both packages are workspace-internal (`"private": true`, consumed only
inside this monorepo — no npm publish). The loader moved from the public
barrel to the documented subpath `@aise/<package>/fixtures-loader`
(declared in each package.json `exports` map); every in-repo consumer was
migrated in this item; nothing outside the repository consumes either
package. The loaders' own implementations are untouched — their Node
behavior is unchanged; only WHERE they are exported from moved.

## 6. The honest-limitation notes updated

`docs/EVALUATOR-GUIDE.md`:

1. §3A — the local-bundle "renders a blank page" note → now states the
   defect is FIXED by PROD-030 (the seam fix + the bundle gate), with the
   one-line history pointer to this directory.
2. §5 — the troubleshooting row "Local web page at
   `http://localhost:4173/` is blank" → same update (with the honest
   pointer that a STILL-blank page now means a start/build failure, not
   the bundle).
3. §6 — the "Not the local UI at this commit" bullet → the local visual
   surface is now demonstrable (the bundle gate proves the mount in a real
   Chromium on every verify run), with the history pointer.

`docs/INSTALL.md` carries no equivalent defect note (verified by search) —
no change there.

## 7. Gate results (all at the worker commit)

```
bun run verify    # 5272 pass / 0 fail across 330 files — VERIFY: PASS
bun run typecheck # PASS
bun run lint      # PASS
```

New tests: 12 (2 bundle-gate tests + 5 adapter barrel-safety tests + 5
solution barrel-safety tests); no existing test was deleted or skipped.
The discovered file count moved 327 → 330 (only the three new test files) —
the proof that the gate is wired into `bun run verify` through the existing
default discovery, with NO root config change.
