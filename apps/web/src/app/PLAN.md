# PROD-002 — Product web shell plan

Honest, brief plan for replacing the `textContent` placeholder entrypoint with a
production-quality React application shell. Written before implementation;
kept in the commit as the design record.

## Non-negotiables (from the work order + brief)

- Consume the FROZEN libraries (`../boqlens`, `../shell`, `../viewer`,
  `../workspace`) as the rendering/logic engine and demo dataset. Never
  rewrite them. All engineering semantics (epistemic statuses, σ, provenance,
  verbatim text) come from those libraries — the app adds presentation only.
- Same-origin API seam only: `fetch('/healthz')`, `fetch('/v1/...')` (the
  vite proxy forwards). Never hardcode an API origin. When the API is absent
  the app renders demo data (the libraries' fixtures) with an explicit
  "demo data" badge — never a blank page.
- No browser authority: proposed ≠ observed, generated ≠ evidenced, derived
  is labeled, uncertainty is visible. The word "authoritative" never appears
  as a UI claim.
- Determinism: no `Date.now()`/`Math.random()` in render paths; deterministic
  formatters (the boqlens `fmt`/`moneyFmt` utilities); injectable `fetch`
  for tests.

## Technology choices

- **react + react-dom** (allowed). The shell needs real navigation, state
  machines, and interactive panes; React's declarative model fits, and
  `renderToStaticMarkup` gives deterministic snapshot tests without a
  browser. `@types/react` + `@types/react-dom` are dev-only type companions.
- **Plain CSS** (one stylesheet, `apps/web/src/styles/app.css`, imported from
  the app). Chosen over Tailwind v4 because: zero extra build-time
  dependencies; the app's look is one coherent design system (mobile-first
  CSS) rather than a utility soup; deterministic output with no JIT
  scanning. CSS custom properties carry the design tokens.
- **Hash-based routing** (`#/…`) implemented as a small typed pure module
  (`app/router.ts`) + a thin subscription hook. Deep-linkable, back-button
  correct, no server rewrite requirements, trivially testable. Unknown routes
  render an explicit not-found surface (never a silent fallback).
- No other runtime deps. No icon packs, no charts (the viewer/workspace
  libraries already project the SVG panes), no UI kit.

## Route map (path → surface → consumed library)

| Hash route | Surface | Library consumed |
| --- | --- | --- |
| `#/` | Dashboard (landing) | shell (context view), boqlens (health), viewer (scenario meta) via demo dataset + API health |
| `#/projects` | Projects (list + open) | shell (context view / ports), demo dataset; live: `GET /v1/identity/organizations/:org/projects` |
| `#/projects/:projectId` | Project overview (scope + missing evidence) | shell (context), boqlens (health/search), demo dataset |
| `#/projects/:projectId/sitetwin` | SiteTwin / Evidence | workspace (drawing SVG, wireframe, resolveSelection), shell (reality + evidence pane views) |
| `#/projects/:projectId/boq` | BOQ Lens | boqlens (model, search, explain, health, claims/trace, derive, format) |
| `#/projects/:projectId/case` | Engineering Case | shell (case + evidence views), viewer (approval reference vocabulary) |
| `#/projects/:projectId/intervention` | Intervention Studio (states, 2D/3D/BOQ, execution & outcome) | viewer (sync, projection, svg, paneboq, read request builders); live: `GET /v1/interventions/:id` |
| `#/settings` | Settings / Integrations | shell (bindings, actions broker, authorization table) + API status |
| anything else | Not found (explicit guidance) | — |

The intervention route carries an optional layer selector
(`…/intervention?layer=N`) and selection is internal state; the layer is
deep-linkable.

## Component tree

```
main.ts (bootstrap: createRoot → <App/> on #app)
App.tsx (route state + API mode context + demo badge)
├── AppShell (header, primary nav, mobile drawer, footer, skip link)
├── Dashboard | Projects | ProjectOverview | SiteTwin | BoqLensSurface
│   | EngineeringCase | InterventionStudio | Settings | NotFound
└── shared: ResourceView (state machine renderer), EmptyState, ErrorState,
    UnavailableState, Skeleton, EpistemicBadge, DerivedTag, SigmaNote,
    DemoBadge, SourceNote, PaneFrame
```

## State machines

1. **API mode** (app level): `unknown → available | unavailable` probed via
   `GET /healthz` + `GET /readyz` (same-origin). `unavailable` switches every
   loader to demo fixtures and shows the global badge. Injectable `fetch`.
2. **Resource machine** (`app/resource.ts`, per data surface):
   `loading → ready(data) | error(message, retry)`, plus `unavailable(reason,
   impact)` for provider-gated data; `ready` + empty detection is handled by
   each surface (guidance + next action). Implemented as a pure reducer +
   `useResource(key, loader)` hook with stale-response guards and an explicit
   `reload()` (retry) action. Tested as a state machine, not ad-hoc
   conditionals.
3. **Router**: pure `parseHash`/`formatRoute`; hook subscribes to
   `hashchange`; navigation = `location.hash = formatRoute(...)`.
4. **Intervention layer navigation**: the viewer library's
   `navigationTargets`/`frameOf`/`stateAt` drive Previous/Next (clamped at
   edges, honest disabled states); the route's `layer` param is the source of
   truth.
5. **Selection** (SiteTwin + Intervention): stable node id internal state;
   SVG panes delegate click events to `data-node-id` (library-rendered
   attributes); BOQ table rows select the same id.

## Demo dataset (from the frozen libraries' fixtures — honest assembly)

- Project `proj-riverside-refit` (org `org-northwind`): context, reality
  snapshot v003, BOQ import boq-0042, evidence records (3, one invalidated),
  engineering case case-007, connector bindings (connected / unavailable /
  unknown-last-sync), authorization decision table (5 principals).
- Project `project-zurich-hq`: the intervention scenario
  `scenario-office-refit` record (4 layers, baseline v001) — its other
  surfaces show genuine empty states (no data for this project), which
  exercises the empty-state machinery honestly.
- BOQ Lens input `imp-2024-boq-001` (6 items, uncertain/ambiguous/unmapped
  cases) rendered under the riverside project with its verbatim import id.
- SiteTwin pinned drawing v002 (workspace fixture: 2D drawing + 3D
  wireframe + evidence entries) rendered alongside the reality snapshot,
  each labeled with its verbatim version id (they are different records).

## Honesty mapping (design contract)

- Epistemic badges, distinct color + text: OBSERVED (blue), CONFIRMED
  (green), INFERRED (gray), PROPOSED (amber, dashed border). Rendered from
  library-carried vocabulary verbatim.
- Every derived/normalized/mapped value renders a "derived" tag; verbatim
  source text renders unmarked with its cell ref / record id.
- σ (uncertainty) renders as `± σ` when known and `σ unknown` when null —
  never ±0. Confidence (high/medium/low/uncertain) renders as text badges
  where the fixture carries it.
- Mapping statuses: mapped / ambiguous / unmapped render distinct badges;
  ambiguous lists competing alternatives verbatim; unmapped carries the
  recorded reason.
- Proposed removals (tombstones) render in a separate "proposed removals"
  list, never deleted silently.
- Connector actions: allowed → enabled; refused → disabled + the verbatim
  refusal code + detail; unavailable → disabled + the honest reason.
  Invalidated evidence renders a visible "invalidated" state.
- Demo mode: a global "demo data" badge + per-card source notes
  (record id … via demo fixture) vs (via API).

## Tests (colocated, deterministic, no network, no real timers)

- `app/router.test.ts` — parse/format round-trips, unknown hashes, layer
  params, project id encoding.
- `app/api.test.ts` — health probe success/failure, fetchJson failure
  taxonomy, live scenario adapter (structural validation + 404 ≠ absent API),
  demo fallback discrimination. Injected fetch stubs only.
- `app/resource.test.ts` — the resource state machine: loading→ready,
  loading→error→retry, unavailable, stale-response guard, reload.
- `app/surfaces.test.tsx` — `renderToStaticMarkup` assertions: one
  honest-rendering test per surface (real content, proposed/observed
  distinction, uncertainty visibility, demo badge, derived tags) plus
  empty/error/unavailable renderings.
- `app.test.ts` (updated) — the new `app.ts` public surface smoke.

## Out of scope (recorded, not silently dropped)

- Write paths (project creation, BOQ import upload, step authoring,
  execution recording writes): the product surfaces are read-oriented; write
  affordances render honest "requires the API" guidance where relevant.
- Live adapters for namespaces whose response shapes cannot be validated
  show an honest error state naming the endpoint — never fake data.
