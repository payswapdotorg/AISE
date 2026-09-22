# PROD-030 — browser proof: the gate FAILS at base, PASSES after the fix

A gate that cannot fail on the defect it exists to catch is not a gate.
The negative control was run FIRST, on the pristine base — before any fix
was applied — and it FAILS with the defect signature. Then the fix lands
and the same command PASSES.

## 1. The negative control — the gate FAILS on the pristine base

Command (run in a pristine `git worktree` at the base commit, with only the
gate's own two files copied in — the tracked tree untouched):

```bash
git worktree add /tmp/aise-base-nc 6ef2c3c1b5bf82fa3dc90ca1a19e7e7dd10786ed
cd /tmp/aise-base-nc && bun install
cp <repo>/tools/web-bundle/gate.ts <repo>/tools/web-bundle/check.test.ts tools/web-bundle/
bun test tools/web-bundle/check.test.ts
```

Output (verbatim — `bun test v1.3.14`):

```text
tools/web-bundle/check.test.ts:
32 |     "the built browser bundle contains no Node-builtin externalization markers",
33 |     () => {
34 |       const findings = scanDistForMarkers();
35 |       // The full finding list (asset + marker + excerpt) IS the failure
36 |       // evidence — expect() prints it verbatim.
37 |       expect(findings).toEqual([]);
                            ^
error: expect(received).toEqual(expected)

- []
+ [
+   {
+     "asset": "apps/web/dist/assets/index-C2VzIy6G.js",
+     "excerpt": "to__`&&t!==`constructor`&&t!==`splice`)throw Error(`Module \"node:fs\" has been externalized for browser compatibility. Cannot access \"node:fs.${t}\" in client cod",
+     "marker": "M1:node-builtin-import-specifier",
+   },
+   {
+     "asset": "apps/web/dist/assets/index-C2VzIy6G.js",
+     "excerpt": "ompatibility for more details.`)}}))}));Ea();var Oa=Da(),ka=(0,Oa.join)(import.meta.dir,`..`);(0,Oa.join)(ka,`fixtures`);function Aa(e){switch(e.kind){case`vers",
+     "marker": "M2:browser-external-stub-feeding-fs-path-call",
+   },
+   {
+     "asset": "apps/web/dist/assets/index-C2VzIy6G.js",
+     "excerpt": "ompatibility for more details.`)}}))}));Ea();var Oa=Da(),ka=(0,Oa.join)(import.meta.dir,`..`);(0,Oa.join)(ka,`fixtures`);function Aa(e){switch(e.kind){case`vers",
+     "marker": "M3:dead-module-init-join-on-import-meta-dir",
+   },
+   {
+     "asset": "apps/web/dist/assets/solution-mount-CBduVsAM.js",
+     "excerpt": ",A(Mt),A(we),A(Ye),A(Nt)].map(e=>e.name),ne();var Ht=p(),Ut=(0,Ht.join)(import.meta.dir,`..`);(0,Ht.join)(Ut,`fixtures`);function Wt(e){if(e===void 0)return{k",
+     "marker": "M2:browser-external-stub-feeding-fs-path-call",
+   },
+   {
+     "asset": "apps/web/dist/assets/solution-mount-CBduVsAM.js",
+     "excerpt": ",A(Mt),A(we),A(Ye),A(Nt)].map(e=>e.name),ne();var Ht=p(),Ut=(0,Ht.join)(import.meta.dir,`..`);(0,Ht.join)(Ut,`fixtures`);function Wt(e){if(e===void 0)return{k",
+     "marker": "M3:dead-module-init-join-on-import-meta-dir",
+   },
+ ]

- Expected  - 1
+ Received  + 27

      at <anonymous> (/tmp/aise-base-nc/tools/web-bundle/check.test.ts:37:24)
(fail) PROD-030 web browser-bundle gate (build → scan → real Chromium mount) > the built browser bundle contains no Node-builtin externalization markers [4.30ms]
42 |   test(
43 |     "the built web app mounts in a real Chromium with zero pageerror events",
44 |     async () => {
45 |       const report = await mountBuiltAppInChromium();
46 |       if (!report.mounted || report.pageErrors.length > 0) {
47 |         throw new Error(
                       ^
error: web-bundle gate: MOUNT FAILURE — the built app did not mount cleanly in Chromium
mounted: false
gate title (h2#gate-title): null
shell header: null
content headings: none
pageerror events: 1
  [1] Module "node:path" has been externalized for browser compatibility. Cannot access "node:path.join" in client code.  See https://vite.dev/guide/troubleshooting.html#module-externalized-for-browser-compatibility for more details.
      at <anonymous> (/tmp/aise-base-nc/tools/web-bundle/check.test.ts:47:19)
(fail) PROD-030 web browser-bundle gate (build → scan → real Chromium mount) > the built web app mounts in a real Chromium with zero pageerror events [16028.44ms]

 0 pass
 2 fail
 1 expect() calls
Ran 2 tests across 1 file. [17.09s]
```

**The defect signature, read off the failure:**

- the SCAN findings show BOTH loaders' dead module-init statements in the
  built browser bundle — `var Oa=Da(),ka=(0,Oa.join)(import.meta.dir,`..`);
  (0,Oa.join)(ka,`fixtures`)` in the main index chunk (adapter-contract)
  and `var Ht=p(),Ut=(0,Ht.join)(import.meta.dir,`..`);(0,Ht.join)(Ut,
  `fixtures`)` in the lazy solution-mount chunk (solution-contract) — the
  exact class the PROD-012-R harness documented;
- the MOUNT check shows the crash consequence in a REAL Chromium: the
  shell never mounts (`mounted: false`, `#app` empty, no gate title, no
  header, no content headings) and the pageerror carries the
  module-evaluation crash (`node:path.join` accessed through the
  browser-external stub).

The same negative control was ALSO captured before any tracked file was
touched (the gate run in the main checkout while the working tree was
still pristine at the base commit) with the identical outcome — the
worktree re-run above is the airtight, SHA-pinned record.

**A note on the stub form (honest environment detail):** under `bun test`,
the spawned build inherits the test runner's `NODE_ENV=test`, for which
vite's browser-externalization stub is the guarded Proxy whose error
message carries the `node:fs`/`node:path` specifier text (M1 fires on that
text). A plain-shell `bun run build` (production env) emits the
empty-object stub instead — the crash then surfaces as the
`TypeError: (0, X.join) is not a function` the PROD-012-R harness and the
2026-09-22 deployed-check recorded. Both stub forms carry the SAME defect
markers (M2 + M3 hit the production-form base bundle too — verified
manually on the pristine checkout: `t.exports={}` stub +
`(0,_a.join)(import.meta.dir` present in `index-*.js`), so the gate catches
the defect class in either environment.

## 2. The passing run — the same gate after the fix

Command (the delivery working tree — the tree that becomes the delivery
commit; see DELIVERY.txt for the exact SHAs):

```bash
bun test tools/web-bundle/check.test.ts
```

Output (verbatim — `bun test v1.3.14`):

```text
tools/web-bundle/check.test.ts:
(pass) PROD-030 web browser-bundle gate (build → scan → real Chromium mount) > the built browser bundle contains no Node-builtin externalization markers [5.95ms]
(pass) PROD-030 web browser-bundle gate (build → scan → real Chromium mount) > the built web app mounts in a real Chromium with zero pageerror events [1212.60ms]

 2 pass
 0 fail
 4 expect() calls
Ran 2 tests across 1 file. [2.42s]
```

What the passing run proves:

- **scan**: every built asset (`apps/web/dist/assets/index-B6kNczPC.js`,
  `apps/web/dist/assets/solution-mount-_ZpTD5hg.js`) and the built
  `index.html` contain ZERO Node-builtin import/externalization markers —
  the loaders are out of the browser module graph entirely (the absence
  proof per asset is in [bundle-audit.md](bundle-audit.md));
- **mount**: in the real Chromium the app MOUNTS — the shell root is
  non-empty, `header.app-header` renders ("AISE — AI Site Engineer —
  product shell" + the honest API-unavailable chip), the Dashboard surface
  heading renders ("Workspace overview"), and there are ZERO `pageerror`
  events. (On this static server there is no backend, so the auth gate
  intentionally does not block — the app's documented offline-honest
  behavior; the `h2#gate-title` alternative of the mount assertion is the
  one an authed deployment exercises.)

## 3. The full-suite context

The gate is part of `bun run verify` (no root config change — bun test's
default discovery picks up `tools/web-bundle/check.test.ts` exactly like
`tools/reality-eval/benchmark.test.ts`):

```text
 5272 pass
 0 fail
 72572 expect() calls
Ran 5272 tests across 330 files. [11.99s]
==> boundaries
  scanned 893 source files across apps/, backend/, packages/, tools/
  no cross-zone import violations
VERIFY: PASS
```

(327 files at base → 330 files at the delivery tree: only the three new
test files — `tools/web-bundle/check.test.ts`,
`packages/adapter-contract/src/barrel-safety.test.ts`,
`packages/solution-contract/src/barrel-safety.test.ts`.)
