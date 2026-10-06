# WORLD-P5 — the desktop world journey (`apps/desktop/src/world/`)

The first-class DESKTOP world surface: the full world journey
(**mount + HUD + authoring-review interactions**) packaged with the
shell's existing policy/adapter surfaces, **feature-equivalent to web**
over the ONE committed station record.

## Files

| File | Role |
|---|---|
| `station-corpus.ts` | the ONE committed record, imported from the web route (`apps→apps` — legal by the workspace boundary matrix), exposed through typed accessors (`stationId()`, `scopeLabel()`, `panelIds()`, `elementCount()`, `viewportBoxCount()`, `ghostElementId()`, `committedAt()`, `initialCamera()`, `ghostSummary()`) |
| `world-journey.ts` | the journey MODEL (pure, bun-testable, fail-closed) |
| `world-journey.test.ts` | the 7-test trace (the repo battery picks it up via plain `bun test`) |

## What the journey proves

`runDesktopWorldJourney({ shellArguments, env, directoryExists })`
walks six typed steps and returns `{ ok, steps, interactions,
parityFacts, failure }` — **fail-closed**: any sub-step failure returns
`ok: false` with the step named (never a partial journey presented as
complete):

1. **shell-boot** — the shell's own pure policy (`../shell/policy`)
   resolves the deep-link startup `aise://project/proj-demo-001` and
   the load target (the default dev URL);
2. **world-open** — the deep link maps to the web app's world route
   hash (`http://localhost:5173/#/world`);
3. **station-mount** — the census over the ONE record: station
   `794d5f8ca8e59d66` (scope `proj-demo-001`), **7 panels all
   POPULATED**, **7 elements**, **7 declared viewport boxes**, the
   ghost present (the ghost summary proposes the ghost element and
   removes `plan-wall-001`);
4. **typed-interactions** — the **SAME browser-safe reducer the web
   route runs** (`apps/web/src/app/world/browser-station.ts`):
   select the proposed-removed wall → select the ghost → camera
   `orbit-to (2,-8,3)→(2,-2,1.5)` → toggle `capture-reality` off
   (the layer AND-semantics hides the capture assets) → the
   unknown-element refusal drill (`element-unknown-42` refuses with
   "not part of this station scene", **state unchanged**);
5. **gpu-parity** — the **REAL Babylon adapter**
   (`@aise/world-scene-runtime` — the same package the web GPU mount
   occupies the P0-A port with) over the record's viewport scene under
   **NullEngine**: `loadScene` ok (revision 2 matches), the record's
   initial camera round-trips **byte-equal**, the ghost set applies,
   `frameStats` reports active meshes ≥ 1, and `rendererInfo()` is
   honestly `null` (no GL device — never a fabricated renderer string);
6. **feature-equivalence** — the parity facts, exact: the SAME
   stationId, the SAME panel id order (`objective, evidence,
   constraints, agent, validation, cost-boq, timeline` — the canonical
   7), the refusal substring the web headless tests pin
   (`"not part of this station scene"`), and the note
   *"feature-equivalent to web over the ONE committed station
   record"*.

The adapter stays **thin**: the journey READS and ASSERTS — it hosts no
engineering authority; the reducer and the adapter are the shared
surfaces, the record is the ONE truth.

## Electron keep (the P0-C decision, re-checked for P5)

The shell stays the **existing Electron thin shell** (PROD-020), per
`docs/world-program-evidence/WORLD-P0-C/DESKTOP-SHELL-DECISION.md`.
The P0-C **Tauri trigger** requires BOTH (a) verified per-platform
WebGPU fidelity in the OS-webview set AND (b) hard field-device
footprint targets the bundled-Chromium model cannot meet — neither
condition is met (nothing about real shells was executable in this
sandbox: **no display, no webview runtime**), so the single-engine
rendering fidelity and zero migration cost dominate. The desktop world
journey therefore runs **headless under plain `bun test`** (the NullEngine
lane — real scene graph, CPU-side); the Electron **launch** smoke stays
the integration-station lane per PROD-020, exactly as the P0-C record
prescribes for this environment.

## The ONE committed record (no copied truth)

The corpus imports
`apps/web/src/app/world/station-record.json` **directly** — the same
file the web route commits (built Node-side by its `record.ts`, pinned
byte-identical to the live binding by the web headless LAW 1 test).
There is no desktop-side copy of the record: if the web record
changes, the desktop corpus — and every census/parity assertion here —
changes with it, by construction.
