# PROD-017 — render traces (DOM evidence of the primary screens and their explicit states)

**Honesty note on the evidence form:** a literal screenshot is not producible
in the delivery sandbox (no display server; the browser preview available to
the worker is a *different* project workspace, not this repository's Vite
app). Per the work order's evidence clause, this directory therefore commits
**DOM/text render traces** — the exact `renderToStaticMarkup` output of the
app's pure task-first components over the committed demo task dataset — and
documents that limitation here instead of fabricating images. Every trace is
regenerable: the same components with the same inputs are pinned by
`apps/web/src/app/task-first.test.tsx` (and the components are the ones
`App.tsx`/`Dashboard.tsx`/the five project surfaces render in the running
app).

## The traces

| File | Screen / state |
|---|---|
| `landing-full-panel.md` | the task-first landing's full panel: NextBestAction (blocked), the golden journey (all six steps with honest record summaries + the reality-readiness line), AuthorizationContext (grants + denials), the capability negotiation (blocked verdict + domain reasons), the browser adapter declaration and the semantic-objects audit card (every contract object verbatim, contract version included) |
| `landing-next-best-action.md` | the NextBestAction panel in the **blocked** state: the server's prompt VERBATIM plus both typed blockers (`capability-blocked`, `authorization-denied`) with their details |
| `landing-authorization.md` | the authorization panel: grants AND every typed denial with reason codes verbatim (W-R1) |
| `landing-negotiation.md` | the capability negotiation panel: the blocked outcome, the honest domain reasons, the explicit "never a readiness statement" framing |
| `landing-journey.md` | the golden journey steps: each step's record summary (honest field joins; absent = the explicit empty state), the reality-readiness statement verbatim |
| `strip-blocked.md` | the **blocked** next-action strip every primary screen exposes: status tag, prompt, blocker codes, the journey link, and the platform-blocked note |
| `strip-empty.md` | the **empty** strip state (a project with no task-flow objects): honest naming + the next useful action |
| `strip-no-action.md` | the **no-action** strip state (task-flow served, no NBA computed yet): "the server has not computed one yet" — never a client-side guess |
| `operation-failed.md` | the **unavailable-provider** state: the OperationResult with `status: failed`, the typed `provider-unavailable` failure and its detail verbatim, "No result references" honest |
| `operation-succeeded.md` | the terminal **succeeded** state: result refs rendered verbatim |

The **loading** and **error** states are the app's resource machine
(`LoadingPanel` skeletons / `ErrorState` with retry) driven by
`useResource` — their behavior is pinned by `apps/web/src/app/resource.test.ts`
(the PROD-002 suite, unchanged and re-run green in this item's gate); the
**unavailable-provider** task-flow state (a live deployment that answers the
API but does not serve the adapter routes) renders the app's
`UnavailableState` with the honest reason + impact (see
`task-first.tsx` `notServedReason`/`notServedImpact`), asserted in
`golden-journey.test.tsx` ("a deployment that does not serve the adapter
routes answers 404 honestly").
