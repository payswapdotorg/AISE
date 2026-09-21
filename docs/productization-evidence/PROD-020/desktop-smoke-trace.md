# PROD-020 — Desktop smoke trace (the representative project/review journey)

**Trace:** `apps/desktop/src/journey/desktop-journey.test.ts`
(`PROD-020 the desktop project/review journey (the real adapter
entrypoints)`) — the automated smoke trace that drives the desktop
adapter's REAL entrypoints end-to-end, following the repo's task-trace
test patterns (the browser adapter's golden-journey discipline: only the
HTTP transport is injected — a stub answering the committed PROD-016
corpus values, "what a contract-serving deployment answers"; no test
doubles of adapter code, no network, no clock, no randomness).

The same entrypoints are what the thin Electron shell drives at runtime
(`src/shell/main.ts` wires platform events to `src/adapter/client.ts`).

## The trace, step by step, with the semantic objects at each step

### Step 1 — SHELL STARTUP (`shell/policy.ts`, pure)

- Input: `["aise://project/proj-7f3a2b"]` (a deep-link launch) + no env.
- The loading policy resolves: `{ kind: "deep-link", projectRef:
  "proj-7f3a2b", target: { kind: "url", url: "http://localhost:5173" } }`
  — the shell will load the EXISTING web app (the default dev target)
  and open the project through the ADAPTER client (a shared server
  action), not a special UI route.
- Non-http(s) load targets, missing directories, unknown flags and
  malformed deep links are typed rejections (policy tests).

### Step 2 — OPEN PROJECT (`client.openProject` → the shared joined endpoint)

- `GET /v1/adapter/projects/proj-7f3a2b/task-flow` (the SAME route the
  browser adapter consumes; base `http://127.0.0.1:8080`).
- The joined bundle decodes OBJECT-BY-OBJECT through the contract seam:
  **ProjectContext** (`proj-7f3a2b`, "Riverside Block B Refurbishment",
  field-operator, aise-internal), **RealitySummary** (model version 14,
  partial readiness), **EvidenceSummary** (3 items, 2 declared gaps),
  **BOQContext** (`boq-import-33d` rev 2, source `erp`, record
  `ERP-BOQ-2026-0042`, 1284 line items), **EngineeringCaseSummary**
  (`case-91ab`, under-review, 7 observations),
  **InterventionScenarioSummary** (`scenario-55c1` v3, PROPOSED,
  pending-review), **OutcomeSummary** (`outcome-77e2`, OBSERVED,
  comparison available, 2 post-work evidence ids), **NextBestAction**
  (action-8ba2, BLOCKED with 2 typed blockers), **AuthorizationContext**
  (principal-field-12; 5 grants; 2 typed denials) and the task's
  **TaskCapabilityRequirements** (requirements-field-depth-capture).
- The local-fs non-authority rule fires here: with a deliberately STALE
  local recents entry ("STALE LOCAL NAME") for the same project, the
  view's identity resolution is **`source: "server"`** — the
  server-answered ProjectContext always wins.
- The shared PURE `negotiateCapabilities` runs over the task's
  requirements: **blocked** (camera requirement unmet on the
  review-optimized shell) with **empty permitted interaction modes**.

### Step 3 — REVIEW SURFACES (`review-layout.ts`, the high-density model)

The composed three-column dense workspace (Context & Evidence | Review
Surfaces | Action & Authorization) with provenance spot checks:

- the dense evidence table: 3 evidence-item rows (the content ids ARE
  the provenance anchors) + 2 evidence-gap rows (`gap-4471` MISSING —
  "no calibrated reference dimension…", `gap-4472` WEAK — "too
  low-angle…");
- the BOQ pane renders the source-of-record identity
  (`erp / ERP-BOQ-2026-0042`) and the 1284 line-item count verbatim;
- the case pane renders `case-91ab`, `under-review`, 7 observations
  verbatim;
- the intervention pane keeps the **PROPOSED** epistemic seal and
  `pending-review` approval state (never upgraded);
- the outcome pane keeps **OBSERVED** with both post-work evidence
  content ids visible;
- the reality pane carries model version 14 and the honest partial
  readiness statement verbatim.

### Step 4 — THE BLOCKED ACTION + AUTHORIZATION (verbatim surfacing)

- The next-best-action pane renders status `blocked`, the full prompt,
  and both blockers with their reason codes (`capability-blocked`,
  `authorization-denied`) verbatim.
- The authorization pane renders the grants AND both typed denials
  (`reality:write` — `missing-permission`; `settings:tenant-admin` —
  `forbidden-role`).
- The separate authorization refresh leg (`GET …/authorization`) decodes
  the **AuthorizationContext** with the denial carried field-for-field
  verbatim.

### Step 5 — INTENT AUTHORING + SUBMISSION (the server answers)

- A review **TaskIntent** is authored (task `task-journey-review`,
  taskType `evidence-review`, targets `case-91ab` + `scenario-55c1`) and
  its wire encoding is canonical (`encodeTaskIntentWire` —
  serialization, never authority).
- `POST /v1/adapter/task-intents` with the intent AS the JSON body (the
  test asserts the submitted body decodes back through the contract as
  the same intent).
- The server answers the first submission with a FAILED
  **OperationResult** (`operation-3fa9`, `provider-unavailable`, the
  typed failure and its detail carried verbatim; the evidence batch is
  preserved). The workspace recomposition (`composeReviewWorkspace`)
  renders it in the action column.
- The retry answers SUCCEEDED with result refs
  (`mission-batch-9917`, `evidence-f08d256a`, `mission-step-42`) —
  rendered verbatim; the adapter never re-derives a result.

### Step 6 — THE OFFLINE LEG (queue honestly, complete only on the server's answer)

- With the transport unreachable, `submitIntent` returns the typed
  `unreachable` outcome — NEVER a fabricated result; the intent is
  enqueued in the outbox (the queued entry carries only `queuedAt` +
  `intent` — no status, no result, no completedAt).
- When connectivity returns, `replayOutbox` re-submits through the SAME
  shared endpoint; only the server's OperationResult completes the
  intent (the entry dequeues on `answered`; unreachable entries stay
  queued).

### Step 7 — THE DESKTOP AFFORDANCES (optional, non-authoritative)

- The keyboard focus path dispatches over the workspace
  (`Cmd+2` → focus the review column's BOQ pane; `Cmd+Enter` → the
  submit-intent command) — presentation commands resolving through the
  one pure dispatch function the menu and the keyboard share.
- The open-local-file affordance is capability-gated on the declared
  profile (enabled: persistent store) and its consequential leg is a
  typed **TaskIntent** (`channel: desktop-local-file`) — the server
  validates and answers; the local file never becomes evidence or a
  source of record by being opened.
- The journey closes with the negotiation discipline intact: the
  review-optimized shell stays **blocked** for depth capture
  (honest delegation to the mobile adapter, never a silent downgrade).

## What this trace proves against the acceptance criteria

- The desktop adapter **can open a project** (step 2: ProjectContext
  decoded through the real seam, server identity winning over local
  state).
- It **exercises representative review/intervention workflows**
  (steps 3–5: the case/scenario/BOQ/outcome surfaces with provenance
  visible; intent authoring; the server-authoritative result and its
  typed failure state).
- Desktop actions **resolve to shared server/domain actions**
  (steps 2/4/5/6: the same `/v1/adapter/**` routes the browser adapter
  consumes — no desktop fork).
- Platform conveniences stay **optional and non-authoritative**
  (steps 6–7: the outbox never fabricates answers; shortcuts and local
  affordances are presentation/intent only).
