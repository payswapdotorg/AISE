# PROD-012-R — deployed-app accessibility and responsive remediation

- **Work item:** PROD-012-R — the PROD-012 deployed-verification remediation (the two honest FAILs + one moderate finding of `docs/productization-evidence/PROD-012/run-2026-09-20.txt`).
- **Base:** `deb46cb29948f348079c803c1e81cb5831c62c8c` (public GitHub main — adapter wave + PROD-018 + PROD-022 + PROD-023 merged).
- **Branch:** `prod-012r/a11y-responsive`.
- **Owned surface touched:** `apps/web/src/styles/app.css`, `apps/web/src/styles/tokens.test.ts` (NEW), `docs/productization-evidence/PROD-012-R/**`.
- **`apps/web/src/app/AppShell.tsx`: UNTOUCHED.** Both fixes were CSS-only — no markup change the header fix required (see §3); the landmark fix is deferred precisely because its clean resolution lives in `apps/web/index.html`, outside this item's surface (§6).
- **Verification target:** the LOCAL production build (`bun run build` → `apps/web/dist`, served by the repo's established production-like local start `bun run start`: vite preview over dist with the API proxied same-origin), measured by `repro-harness.ts` (this folder) — the local mirror of `tools/deployed-check.ts`'s responsive-mobile / accessibility / responsive-desktop logic. The DEPLOYED re-verification against `https://aise-tan.vercel.app` is the Tech Lead's post-merge step, deliberately not this item's.

---

## 1. The contract (from run-2026-09-20.txt)

1. **responsive-mobile (FAIL)** — the signed-in shell horizontally overflows the 390px viewport: `scrollWidth 469` vs `innerWidth 390` (budget +1). Root cause: `.app-header-inner` is a flex row with no wrap; brand + user menu + "live API" chip + drawer toggle need ~469px; the main content follows the wider document width.
2. **accessibility (FAIL, WCAG 1.4.3 AA, serious)** — `.journey-hint` renders `#7a8894` (`--ink-faint`) on `#ffffff` (`--surface`) = 3.64:1 < 4.5:1 (the Dashboard journey hints; the token also colors other surfaces' faint text).
3. **accessibility (moderate, non-blocking)** — nested/duplicate main landmarks (`index.html`'s `main#app` wraps AppShell's `main#main-content`).

## 2. Reproduction (before) — local production build, 390x844 / 1440x900 headless

Raw capture: `run-before.txt` (this folder). The deployed run's numbers reproduce EXACTLY on the base commit's local production build:

| Measurement (deployed run → local before) | Deployed | Local before |
| --- | --- | --- |
| gate overflow @390x844 | 390 vs 390 PASS | 390 vs 390 PASS |
| signed-in shell overflow @390x844 | **469 vs 390 FAIL** | **469 vs 390 FAIL** |
| drawer-open overflow @390x844 | **469 vs 390 FAIL** | **469 vs 390 FAIL** |
| axe serious (both viewports) | **1 (color-contrast)** | **1 (color-contrast)** |
| `.journey-hint` pair | **#7a8894 on #ffffff = 3.64:1** | **#7a8894 on #ffffff = 3.64:1** (computed in-page: 3.635) |
| main landmarks | 2, nested | 2 (`app`, `main-content`), NESTED |

The element-level diagnostic walk (the harness's mobile phase) pins the overflow source: **`.app-header-inner` itself is 468.8px wide** — brand 109.2 + spacer 0 + user menu 175.1 + chip 72.9 + toggle 31.7 + 4×12px gaps + 2×16px padding = 468.9 ≈ 469. Everything below it in the document (`.app-body`, `main#main-content`, the Dashboard cards) merely follows the wider document width. A secondary victim of the same defect: the 44px drawer toggle was being **squeezed to 31.7px** (below the `--touch` 44px target) by the unwrapped row's shrink pressure.

Local color-contrast node count is 5 (`.state-detail` + the 4 journey hints) versus the deployed run's 4: the `.state-detail` element is part of the PROD-017 task-first landing, which postdates the deployed PROD-012 build — it consumes the same `--ink-faint` token and fails for the same reason, so the single-token fix remediates all 5.

## 3. The fixes (both CSS-only — `apps/web/src/styles/app.css`)

### Fix 1 — responsive-mobile: `.app-header-inner` wraps instead of overflowing

```css
.app-header-inner {
  …
  flex-wrap: wrap;   /* was: no wrap — the row overflowed 390px viewports */
  gap: 12px;
  row-gap: 8px;      /* inert on the single-line desktop row */
}
```

The house-style shape (flex-wrap on the row; `min-width: 0` on the brand block was already present). The signed-in header now flows onto wrapped lines at phone widths instead of forcing a 469px document width — and the drawer toggle regains its full 44px touch target. No chip label is hidden (the API-mode honesty badge stays visible at every width) and no markup change was needed, so `AppShell.tsx` is untouched. `row-gap` only applies between wrapped lines; the desktop row (≥880px, where everything fits a single line with ~700px to spare) is visually unchanged.

### Fix 2 — accessibility: `--ink-faint` darkened once, #7a8894 → #5c6b77

```css
--ink-faint: #5c6b77;   /* was #7a8894 — 3.64:1 on --surface */
```

A single token change remediates every consumer (crumbs, field labels, source notes, journey hints, state detail, task-strip notes, the auth-gate divider). `#5c6b77` is in the work order's `#5f6e7a`-class; it was chosen over `#5f6e7a` itself because it clears 4.5:1 on **every light surface of the palette** — including `--derived-bg`, where `#5f6e7a` computes 4.498:1 (a 0.002 shortfall) — giving the uniform-margin robustness the work order prefers. Computed WCAG 2.x ratios (the committed test recomputes these from the stylesheet on every `bun run verify`):

| `--ink-faint` on surface | old `#7a8894` | new `#5c6b77` |
| --- | --- | --- |
| `--surface` `#ffffff` (cards, panes, journey items, states, task strip, gate) | 3.635 FAIL | **5.491** |
| `--bg` `#f4f6f8` (crumbs) | 3.356 FAIL | **5.068** |
| `--surface-2` `#eef1f4` (hovered table rows) | 3.207 FAIL | **4.843** |
| `--warn-bg` `#fdf3d7` (selected table rows) | 3.285 FAIL | **4.962** |
| `--error-bg` `#fbeaea` (error states) | 3.126 FAIL | **4.722** |
| `--derived-bg` `#f0ebfb` | 3.113 FAIL | **4.702** |
| `--epistemic-observed-bg` `#e7effb` | 3.140 FAIL | **4.742** |
| `--epistemic-confirmed-bg` `#e8f5ec` | 3.238 FAIL | **4.890** |
| `--epistemic-inferred-bg` / `--epistemic-other-bg` `#eceff2` | 3.150 FAIL | **4.758** |
| `--epistemic-proposed-bg` `#fdf1df` | 3.259 FAIL | **4.922** |

Every `--ink-faint` usage renders small text (0.7–0.85rem), so no large-text 3:1 exemption applies — the uniform 4.5:1 bar is the correct one. The committed guard: `apps/web/src/styles/tokens.test.ts` (6 tests / 86 expects) parses `app.css`'s `:root`, computes the WCAG ratios of the text-token palette on their surfaces, and asserts ≥ 4.5:1 — including a regression pin for the exact remediated pair. Mutation-verified: restoring `#7a8894` fails the suite with `--ink-faint (#7a8894) on --surface (#ffffff) … computed 3.635:1`. (The same suite also pins `--ink` 13.4–15.1, `--ink-soft` 6.1–7.1, `--brand-ink` on `--brand` 9.5 — all comfortably AA.)

### Fix 3 — landmarks: **DEFERRED** (moderate, non-blocking) — see §6

## 4. Verification (after) — same harness, same local production build

Raw capture: `run-after.txt` (this folder).

| Measurement | Before | After | Verdict |
| --- | --- | --- | --- |
| signed-in shell overflow @390x844 | 469 vs 390 FAIL | **390 vs 390** | **PASS** |
| drawer-open overflow @390x844 | 469 vs 390 FAIL | **390 vs 390** | **PASS** |
| elements exceeding the 390px viewport | 15 | **0** | PASS |
| drawer toggle rendered width @390 | 31.7px (squeezed) | **44.0px** (`--touch`) | PASS |
| axe serious @390x844 | 1 (color-contrast, 5 nodes) | **0** | **PASS** |
| axe serious @1440x900 | 1 (color-contrast, 5 nodes) | **0** | **PASS** |
| `.journey-hint` pair | 3.64:1 FAIL | **#5c6b77 on #ffffff = 5.49:1** | **PASS** |
| main landmarks | 2, nested | 2, nested | **DEFERRED** (§6) |
| desktop shell overflow @1440x900 | 1440 vs 1440 | 1440 vs 1440 | PASS |
| desktop header one-row | spread 0.00px | **spread 0.00px** | PASS |
| desktop nav rail visible | true | true | PASS |

Desktop header geometry, before → after (pixel-identical): `.brand` l=146.0 r=331.6 w=185.6 t=10.0 h=43.9 · `.user-menu` l=911.4 r=1209.1 w=297.7 t=13.9 h=36.0 · `.api-chip` l=1063.2 r=1122.6 w=59.5 t=15.6 h=32.6 · `.nav-toggle` hidden (by design ≥880px) · row height 63.9px. **No desktop regression.**

At 390px the wrapped header now renders three lines — brand (full tag line, 185.6px), user menu (297.7px, wrapping internally), then API chip + the restored 44px toggle — within the viewport at all times, drawer open or closed.

Remaining axe output at both viewports: `moderate=3` — exactly the three landmark rules of finding 3 (`landmark-main-is-top-level`, `landmark-no-duplicate-main`, `landmark-unique`), non-blocking by the run's own classification, and deferred with this item (§6). `critical=0`, `serious=0`, `minor=0`.

## 5. Repo gates

- `bun run verify` → **4329 pass / 0 fail** (the 4323 baseline + the 6 new token tests), `VERIFY: PASS`
- `bun run typecheck` → `VERIFY: PASS`
- `bun run lint` → `VERIFY: PASS`

## 6. Fix 3 (landmarks) — deferred, with the recommendation

**Finding:** `apps/web/index.html` mounts the app in `<main id="app">`, and `AppShell.tsx` renders the content in `<main id="main-content">` — two main landmarks, one nested in the other (axe: 3 moderate rules).

**Deferred because:** the clean fix is to change the *wrapper* — `apps/web/index.html`'s `<main id="app">` → `<div id="app">` — which keeps `main#main-content` (the skip-link target, `main#main-content h1`) as the single top-level main landmark with zero visual change. `apps/web/index.html` is **outside this item's owned surface**. The only in-surface alternative (demoting AppShell's `main#main-content` to a `div`) would leave `main#app` — which wraps the header, nav and footer — as the sole main landmark: technically passing the duplicate rule but semantically worse, and `AppShell.tsx` changes are reserved for the header fix (which turned out to need none).

**Recommendation to the owning lane / Tech Lead:** in `apps/web/index.html`, change line 15 from `<main id="app"></main>` to `<div id="app"></div>`. One line, no visual change, no test dependencies on `main#app` exist in the repo's suites (the check suites target `main#main-content` / `header.app-header` / `nav#primary-nav`). After that change the axe moderate count on the shell drops from 3 to 0.

## 7. Blocker finding outside this item's surface — and the harness workaround

**Current main's production web bundle crashes at mount in a real browser.** `packages/adapter-contract/src/index.ts:292` re-exports `loadCommittedFixtures` from `./fixtures-loader.ts`, whose module scope runs `join(import.meta.dir, "..")` from `node:path`. Vite externalizes `node:path` for the browser (`__vite-browser-external` = `{}`), so the bundle throws `TypeError: (0, ga.join) is not a function` before the app ever mounts — no gate, no shell, at every address. `bun run build` succeeds and `bun run verify` never loads the built bundle in a browser, so the adapter wave (PROD-016/017) shipped with this unnoticed; the PROD-017/018 browser evidence was driven by the automated test harness (`golden-journey.test.tsx` with an injected fetch), not the built bundle. The deployed PROD-012 site predates the adapter wave, which is why it boots.

**Harness workaround (disclosed, minimal, output-only):** `repro-harness.ts` patches the BUILT, gitignored, regenerated-by-every-build bundle (`apps/web/dist/assets/index-*.js`) to neutralize exactly those two dead module-init statements — the bundler had already tree-shaken `loadCommittedFixtures` itself away (no `readdirSync`/`readFileSync`/`loadCommittedFixtures` in the bundle); only the dead init calls remain, and their results are referenced nowhere else (verified). The patch touches no shell markup, no CSS, no app code path — the measured surface is unaffected. If a future merge fixes the upstream defect, the pattern no longer matches and the harness reports "workaround NOT needed" and serves the clean build. Both `run-before.txt` and `run-after.txt` print the workaround line at the top.

**Recommendation to the owning lane:** remove the top-level filesystem work from `fixtures-loader.ts`'s module scope (e.g. resolve `FIXTURES_ROOT` lazily inside `loadCommittedFixtures`), or stop re-exporting the loader from the package barrel (`packages/adapter-contract/src/index.ts:292`) so browser consumers never pull it. Either restores a bootable production build; until then, **any deployment of current main will render a blank page.**

## 8. Other observations outside the work item (reported, not fixed)

- **`api/[...path].mjs` (the committed Vercel deploy beacon) does not match a fresh deterministic rebuild of the base sources.** Running `bun run build` at BASE regenerates it with real differences (e.g. `identityRoutesOrDefault` gaining a WeakMap cache — 68 insertions / 44 deletions). `tools/build.ts` documents the beacon as "regenerated deterministically by every build", so the committed bytes at BASE were not produced by building the BASE tree. This item restored the committed file and excluded it from its commit; the owning lane should regenerate-and-commit it deliberately.
- **`--accent` (links, `#147d93`) computes 4.79:1 on `--surface` but 4.23:1 on `--surface-2`** (hovered table rows). No default-state link-contrast violation was reported by axe (links render on white surfaces at rest), so this is a hover-state nuance outside this item's findings — flagged for the owning lane, not remediated here (the token is shared by the app chrome and changing it is not this item's surface of findings).

## 9. Honesty summary

- Both FAILs reproduce on the base commit's local production build with the deployed run's exact numbers, and both are remediated with CSS-only changes verified green by the same harness (`run-after.txt`).
- The landmark finding is deferred with a one-line recommendation (its clean fix is outside the owned surface; §6).
- The local verification required a disclosed, output-only workaround for an upstream, out-of-scope mount crash in the production bundle (§7) — the defect itself is reported for the owning lane, not fixed here.
- `AppShell.tsx` is untouched; the work order's conditional permission for a markup change was not needed.
