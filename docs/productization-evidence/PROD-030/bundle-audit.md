# PROD-030 — bundle audit: the scan markers, the assets scanned, the absence proof

The scan phase of the `tools/web-bundle/` gate reads every built asset under
`apps/web/dist/assets/*.js` plus the built `apps/web/dist/index.html` and
asserts they contain NO Node-builtin import/externalization markers. This
file documents each marker (what it is, why it is robust under
minification), the assets scanned, and the absence proof after the fix.

## 1. The markers (each documented)

### M1 — `node:fs` / `node:path` import specifier

```text
pattern:    /node:(?:fs|path)\b/
concept:    a literal Node-builtin import specifier in a built browser asset
robustness: string literals survive minification verbatim — minifiers do not
            rewrite the TEXT of string specifiers or error messages
catches:    build pipelines that preserve external import specifier text
            (e.g. an ESM-output build that keeps `import ... from "node:fs"`
            as a bare external), and rolldown-vite's guarded-externalization
            stub, whose dev/test-form error message carries the specifier
            text (`Module "node:fs" has been externalized for browser
            compatibility`) — this is the form the negative control hit.
note:       the current rolldown production build REWRITES the specifier
            away to a stub (M2/M3 carry the load there); M1 is the
            future-proofing leg for pipelines that keep the specifier.
```

### M2 — the browser-external stub feeding an fs/path-style call

```text
pattern:    /__vite-browser-external|\(0,[A-Za-z_$][\w$]*\.(?:join|readdirSync|readFileSync)\)\(/
concept:    the vite browser-external stub — either the classic stub MODULE
            NAME (`__vite-browser-external`, the identifier classic-vite
            emits for externalized Node builtins), or rolldown's interop
            CALL SHAPE `(0, X.fn)(...)` where fn is one of the three
            filesystem/path functions the fixtures loaders use (join,
            readdirSync, readFileSync)
robustness: `__vite-browser-external` is the bundler's own generated module
            name (app code cannot contain it legitimately); the
            `(0, X.fn)(` namespace-call shape is rolldown's emitted interop
            for externalized-module member calls — the shape survives
            minification because it is structural (the parenthesized
            namespace + member call), and app/vendor code (react,
            react-dom, zod — the app's only dependencies) does not emit it
            for these function names
catches:    any SURVIVING loader statement through the externalized-builtin
            namespace, whether the dead module-init (M3's special case) or
            a call inside a shipped function body
```

### M3 — the dead module-init join on `import.meta.dir` (the documented crash class)

```text
pattern:    /\(0,[A-Za-z_$][\w$]*\.join\)\(import\.meta\.dir\b/
concept:    the exact PROD-012-R Phase-0b-documented crash: a module-scope
            `(0, X.join)(import.meta.dir, "..")` call on the externalized
            node:path stub, evaluated when the module graph initializes —
            before the app ever mounts
robustness: `import.meta.dir` is SYNTAX (a meta-property — never renamed by
            any minifier); the `(0, X.join)(` interop call shape is the
            bundler's, not app code's; the two are bound together in one
            expression, so nothing legitimate matches
catches:    the defect class itself — a Node-only loader's module-scope
            path computation landing in a browser bundle
```

A marker that only matches this exact defect is acceptable — the point is
this defect class can never ship silently again.

### The deliberately NOT-marked externalization (documented exclusion)

`node:crypto` inside the lazy `solution-mount-*.js` chunk is the known,
documented PROD-026 composition design: the engine surface loads through
ONE cached dynamic import inside a Suspense boundary; where the engine
cannot execute (the plain browser) the dynamic import rejects, the
rejection is caught, and the honest engine-unavailable composition renders
(PROD-026 verified zero page errors with that design in place). The stub
usage `(0, X.createHash)(` is not reachable at app mount and is not among
the marker functions (join/readdirSync/readFileSync) — the scan targets
the fs/path loader class this item fixes, not the documented lazy-engine
pattern.

## 2. The assets scanned

At the delivery tree, the gate's build produces:

```text
apps/web/dist/index.html                 (references assets/index-B6kNczPC.js + the CSS)
apps/web/dist/assets/index-B6kNczPC.js   (the main browser bundle — the entry chunk)
apps/web/dist/assets/solution-mount-_ZpTD5hg.js  (the lazy PROD-026 solution-surface chunk)
```

Every `*.js` under `apps/web/dist/assets/` plus the built `index.html` is
scanned on every verify run (the file names are content-hashed and will
change with the sources; the scan enumerates the directory, not fixed
names).

## 3. The absence proof after the fix

### The gate's own scan (test-env build)

`bun test tools/web-bundle/check.test.ts` → the scan test PASSES with
`expect(findings).toEqual([])` — zero findings across
`index-B6kNczPC.js`, `solution-mount-_ZpTD5hg.js` and `index.html`
(passing output in [browser-proof.md](browser-proof.md) §2).

### Independent manual verification (both build forms)

Because the gate's spawned build inherits the test runner's
`NODE_ENV=test` (dev-form React + the guarded-Proxy externalization stub),
the absence was ALSO verified against a plain-shell production build
(`cd apps/web && bun run build`, no NODE_ENV) of the fixed tree:

```text
assets: index-DllwVSop.js, solution-mount-CGrRqZ75.js

node:fs                          → 0 occurrences
node:path                        → 0 occurrences
__vite-browser-external          → 0 occurrences
(0, X.join)( ... interop call    → 0 occurrences
import.meta.dir                  → 0 occurrences
readdirSync                      → 0 occurrences
readFileSync                     → 0 occurrences

createHash (the documented node:crypto lazy-chunk exclusion) → present ONLY
in solution-mount-CGrRqZ75.js (2 occurrences, inside functions — the
PROD-026 engine surface, unreachable at mount)
```

### What the absence means (the stronger property the subpath design buys)

The loaders are not merely "crash-free" in the browser bundle — they are
ABSENT from it. Before the fix, the pristine base bundle contained, per
chunk, the dead init `var X=stub(),Y=(0,X.join)(import.meta.dir,`..`);
(0,X.join)(Y,`fixtures`)` (both chunks) plus the externalization stub
feeding them. After the fix, no module in either chunk references
`node:fs`/`node:path` at all — the barrel a browser imports can no longer
reach the filesystem. That is exactly the property the REJECTED
lazy-init alternative would NOT have bought (it would have kept the loader
graph and the Node-builtin stubs in every browser bundle, one future
module-scope addition away from the same crash).
