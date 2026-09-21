# PROD-017 — browser task trace (the golden journey through the real entrypoints)

**Work item:** PROD-017 (browser adapter and task-first product UX)
**Base:** public main @ `7d21d47147a3df14a0e6138131de6d9add672d27`

The trace below is the golden journey as the **automated task trace**
(`apps/web/src/app/golden-journey.test.tsx`) drives it: the app's REAL
entrypoints — the typed hash router, the same-origin API seam (`app/api.ts`),
the task-first adapter modules, the shell/viewer projections — with only the
fetch transport injected (the `api.test.ts` discipline: fixed stub payloads,
no network, no clock, no randomness). The `/v1/adapter/**` stub bodies are
the committed PROD-016 corpus values — exactly what a contract-serving
deployment answers; the `/v1/**` stub bodies are the backend's own record
contracts.

The journey is executable in the browser without source-code/API knowledge:
the landing asks **"What do you need to do?"**, the task intent is authored
through a form, and every subsequent screen exposes the next useful action
or an explicit blocked reason.

---

## Step 0 — the journey's addresses (the router entrypoint)

`parseHash` (the app's pure route codec) resolves every journey address:
`#/` → dashboard (the task-first landing), `#/projects` → the open/create
surface, `#/projects/proj-7f3a2b` → project overview,
`…/sitetwin` → evidence, `…/boq-lens` → BOQ, `…/case` → the case,
`…/intervention?layer=3&scenario=scenario-55c1` → the intervention studio.
No second navigation model exists: the journey steps (`GOLDEN_JOURNEY_STEPS`
in `task-flow.ts`) project onto these same routes.

## Step 1 — open / create the project (the identity entrypoints)

- **Read:** `GET /v1/identity/organizations/org-northwind/projects?requester=user-alice`
  (requester-guarded) → `ProjectRecord[]`; `proj-7f3a2b` (Riverside Block B
  Refurbishment) is the current project.
- **Write:** `POST /v1/identity/organizations/org-northwind/projects` with the
  identity router's exact body `{ projectId, name, actor }` → the created
  record.
- *Semantics observed:* the project registry is server-owned; the adapter
  renders records verbatim and never re-keys them.

## Step 2 — author the task intent (W-R3) and submit it (the adapter seam)

The user's statement — *"Capture depth evidence of the cracked masonry on
level 2 so the engineering case can be diagnosed."* — is assembled by
`taskIntentFromSelection` into a typed **`TaskIntent`** wire object
(`taskType: field-capture`, `projectRef: proj-7f3a2b`, `targetRefs:
[case-91ab, node-wall-12]`, `parameters: {priority: high, area: level-2}`,
`createdAt: 2026-01-15T09:25:00.000Z`) — the ONE client-authored semantic
object. `POST /v1/adapter/task-intents` answers the
**server-authoritative `OperationResult`**:

```json
{ "status": "succeeded", "operationId": "operation-3fa9",
  "resultRefs": ["mission-batch-9917", "evidence-f08d256a", "mission-step-42"],
  "completedAt": "2026-01-15T12:40:00.000Z" }
```

decoded through the contract decoder, never locally re-validated; the result
refs render verbatim.

## Step 3 — the joined task flow (the contract decoders at the seam)

`GET /v1/adapter/projects/proj-7f3a2b/task-flow` answers the joined bundle —
the server's assembly of the shared semantic objects, decoded field-by-field
at the `app/api.ts` seam:

| Object | Observed (verbatim fields) |
|---|---|
| **ProjectContext** | `proj-7f3a2b` · Riverside Block B Refurbishment · role `field-operator` · source `aise-internal` · updated 2026-01-15T09:20:00.000Z |
| **NextBestAction** | `action-8ba2` · **blocked** · kind `capture-evidence` · the prompt names BOTH blockers: capability + authorization |
| **AuthorizationContext** | `principal-field-12` · granted `reality:read, evidence:read, evidence:submit, boq:read, case:read` · DENIED `reality:write` (missing-permission), `settings:tenant-admin` (forbidden-role) |
| **EvidenceSummary** | subject `engineering_case/case-91ab` · 3 items · 3 content ids · gaps `gap-4471` (MISSING — no calibrated reference dimension), `gap-4472` (WEAK — oblique photo) |
| **RealitySummary** | model **v14** · readiness **partial** (the Assurance Engine's opaque statement) · 218 objects |
| **BOQContext** | `boq-import-33d` · revision 2 · source **erp / ERP-BOQ-2026-0042** (the incumbent stays the system of record) · 1284 line items |
| **EngineeringCaseSummary** | `case-91ab` · under-review · 7 observations |
| **InterventionScenarioSummary** | `scenario-55c1` · v3 · **PROPOSED** · approval pending-review |
| **OutcomeSummary** | `outcome-77e2` · **OBSERVED** · comparison available · 2 post-work evidence ids |
| **TaskCapabilityRequirements** | `requirements-field-depth-capture` (camera: any-of depth, blocking; input: camera-scan/touch, blocking; offline: bounded-queue, non-blocking) |

`GET /v1/adapter/projects/proj-7f3a2b/authorization` (**W-R1**) answers the
standalone AuthorizationContext — grants + typed denials, decoded through the
contract, rendered verbatim.

**The blocked reason rendered explicitly:** the task-first panel shows the
server's blocked NBA (prompt + both blockers) AND the platform honesty —
`negotiateCapabilities(browser profile, field-depth-capture requirements)` →
**blocked** (camera `unsupported`: required any of [depth]; profile declares
[still, video]) — with the escalation guidance (switch to a depth-capable
device — the mobile adapter — or escalate to a specialist instrument). The
journey's inspection/review steps remain executable on the browser; the
capture step is honestly blocked, never pretend-actionable.

## Step 4 — the golden journey's surfaces (the real data adapters)

- **Reality (`…/sitetwin`):** `GET /v1/reality/projects/proj-7f3a2b/versions/latest`
  → the GraphVersion → the shell's `RealityPaneView`.
  *Provenance spot check:* node `node-wall-12` (CONFIRMED) carries source
  `{module: reality, recordId: v014:node-wall-12}`; its summary
  "thickness 240 mm · condition cracked-masonry" is a property join over
  verbatim properties; its evidence id is
  `f08d256a…57712` (verbatim); `node-slab-3` is OBSERVED (statuses never
  conflated).
- **Evidence register:** `GET /v1/evidence` → 2 records (STILL_IMAGERY
  2 841 503 bytes; DEPTH_SCAN 587 202 bytes), invalidation `null` (the
  honest state — invalidated is a state, not a deletion).
- **Case (`…/case`):** `GET /v1/cases` (7 observations, 2 hypotheses, 2 open
  missing evidence) + `GET /v1/cases/case-91ab`.
  *Provenance spot check:* observation `node-wall-12` carries its evidence id
  `f08d256a…57712`; the missing-evidence declaration stays `open`.
- **BOQ (`…/boq-lens`):** `GET /v1/boq/imports` + `GET /v1/boq/imports/boq-import-33d/lens`.
  *Provenance spot check:* the joined lens input keeps the source identity
  (`ERP-BOQ-2026-0042.xlsx`, mappingVersion 2) and the mapped item's
  `cellRef: B4` + `mapping: {status: mapped, nodeId: node-wall-12}` — the
  source BOQ stays authoritative for its own scope (W-R5).
- **Intervention (`…/intervention`):** `GET /v1/interventions/scenario-55c1`
  through the viewer library's request builder → the scenario record
  (proposed states, PROPOSED-only epistemic seal — a proposal is never
  observed reality).

## Step 5 — the outcome loop (the terminal write legs)

- `POST /v1/executions` (the exact router body) → the execution record with
  the `approved → executed` state transition.
  *Provenance spot check:* the transition carries its evidence id
  `196b5ab5…c0e43`.
- `POST /v1/executions/exec-001/outcomes` → the OBSERVED outcome.
  *Provenance spot check:* `epistemicStatus: OBSERVED` is earned by the
  post-work evidence `196b5ab5…c0e43` — an outcome never becomes observed by
  implication.

## Explicit states on every leg (never blank, never generic)

| State | Where it renders |
|---|---|
| **loading** | the resource machine's skeletons (pinned by the PROD-002 `resource.test.ts` suite, re-run green) |
| **empty** | "No task-flow objects recorded for this project" + the next useful action; absent journey steps render "no record for this project yet" |
| **error** | the typed failure detail + retry (e.g. a contract decode failure names the object and the structured issue) |
| **unavailable-provider** | a live deployment answering the API but not serving the adapter routes → the honest 404 classification + reason + impact (the task-first flow cannot run on live records; the committed demo journey remains executable, badged) — asserted in the trace test |
| **permission** | the AuthorizationContext denials rendered verbatim with reason codes (W-R1); the write panels' brokered offers stay disabled with the refusal reason named |
| **platform-blocked** | the negotiation-blocked task renders the blocked reason + escalation guidance; NO interaction modes are offered |

## Auditability (the semantic-objects audit card)

The task-first panel renders every contract object **verbatim and complete**
(`contract-objects.tsx`): ids in mono, timestamps as instants, evidence id
lists, gaps, denials, blockers, the readiness statement, the source-of-record
identity — and the `contractVersion` on every object. Consequential
claims/quantities (readiness `partial`, 1284 line items, 218 objects, the
PROPOSED/OBSERVED distinctions) trace to their source/evidence/version
context because the objects themselves are inspectable.
