# PROD-034 — Web product discoverability closure (chunks 1 + 2: gaps 1, 2, 3, 5, 6 + the cross-route sweep)

Branch `prod-034-closure` (base `c4df5bc`). This directory holds the evidence
for issue #9 gaps 1–3 (chunk 1: first-class capture acquisition, BOQ import
discoverability, Evidence Envelope explainability) and gaps 5–6 + the
cross-route discoverability sweep (chunk 2: contextual incumbent integration
discovery, provider status UX, the navigation pass). The per-gap designs are
below; `browser-journey.md` records the discoverability journey as a
test-backed table.

## The exact commands and results

Run at the chunk-1 tip (`git log --oneline` of this branch's three commits):

```text
bun test apps/web/src/app/capture-mission.test.tsx    # 18 pass / 0 fail (67 expects)
bun test apps/web/src/app/boq-import.test.tsx         # 12 pass / 0 fail (52 expects)
bun test apps/web/src/app/evidence-envelope.test.tsx  # 11 pass / 0 fail (69 expects)
bun test apps/web/src                                # 859 pass / 0 fail (4305 expects, 51 files)
bunx tsc --noEmit -p apps/web/tsconfig.json           # PASS (no output)
bun run lint                                          # VERIFY: PASS (eslint .)
```

Run at the chunk-2 tip (the item's final worker tip):

```text
bun test apps/web/src/app/contextual-integrations.test.tsx  # 14 pass / 0 fail (44 expects)
bun test apps/web/src/app/provider-status.test.tsx         # 14 pass / 0 fail (44 expects)
bun test apps/web/src/app/discoverability.test.tsx         # 10 pass / 0 fail (25 expects)
bun test apps/web/src                                      # 897 pass / 0 fail (4418 expects, 54 files)
bunx tsc --noEmit -p apps/web/tsconfig.json                # PASS (no output)
bun run lint                                               # VERIFY: PASS (eslint .)
```

No full `bun run verify` in the worker lane (the memory-constrained box
discipline); the Lead's five-gate harvest runs it.

## Gap 1 — first-class capture acquisition (the Capture / Upload surface)

**The problem.** The `Capture` canonical action landed on SiteTwin/Evidence
*inspection* — acquisition itself was buried; the browser had no honest
ingestion entry at all.

**The design.**

- **A first-class route** — `#/projects/:id/capture` (a new typed `Route`
  member, the first per-project surface in `PROJECT_SURFACES`, wired in
  `App.tsx`/`AppShell.tsx`/the not-found guidance; malformed addresses stay
  typed not-found). The **Capture canonical action now opens it**
  (`parity/action-labels.ts` retarget from `sitetwin`; the four PROD-018
  test pins updated to the new href — the product change, not a silent
  re-pin).
- **The guided mission** (`surfaces/CaptureMission.tsx` →
  `CaptureMissionPanel/Body`): "what to capture and why" projected from the
  SAME task-flow resource every task-first surface consumes (no second
  authority): the server's NextBestAction prompt/blockers VERBATIM, the
  EvidenceSummary's declared gaps as the mission list (the records' own
  descriptions), and the honest platform-blocked note when the capability
  negotiation blocks this browser.
- **The upload entry** (`CaptureUploadPanel/Body` + `api.ts`'s
  `uploadCaptureAssetLive`/`webCryptoSha256`): one file → the browser's
  sha-256 content address (Web Crypto; a TRANSPORT step — the gateway
  re-computes and verifies server-side) → `POST /v1/capture/assets/:contentId`
  with the RAW bytes and the file's media type. This is the capture
  gateway's exact contract **consumed read-only** (no backend edit):
  authoritative evidence ingestion stays entirely server-side; the store is
  immutable and idempotent (STORED | DUPLICATE); the 422 typed rejections
  (`CONTENT_ID_MISMATCH`/`CONTENT_COLLISION`) use the route's own
  `reasonCode`/`reasonDetail` envelope shape, extracted honestly (never
  coerced into the standard error envelope).
- **The honest limits** (`BrowserCaptureLimitsCard` + the panel's explicit
  states): this browser adapter does NOT implement camera capture (the
  declared `BROWSER_IMPLEMENTED_INTERACTION_MODES`); live camera/depth/LiDAR
  capture, resumable sessions and mission-batch submission are the mobile
  field adapter's journey (the SyncBatch device session envelope is not
  fabricated here); a platform without Web Crypto (insecure context)
  renders the explicit blocked reason — never a fallback hash; demo mode
  renders the never-fabricate notice; the STORED outcome states honestly
  that registering the asset as an Evidence document on a case is the
  server-validated evidence-registration step this upload does not do.

**Reachability:** the project surface nav (every project page), the
canonical Capture action (landing + every composed journey), the AppShell
nav sub-link, the task-first gap suggestions, and the not-found guidance.

## Gap 2 — first-class BOQ import (the Import a SOURCE BOQ panel)

**The design** (`surfaces/BoqImport.tsx` + `api.ts`'s
`importBoqSourceLive`/`BOQ_IMPORT_FORMATS`):

- The panel sits ON the BOQ Lens surface above the lens content — a product
  action, visible with or without an existing import (the live empty state
  points at it).
- One source file + the operator-declared format (csv/xlsx/pdf, with the
  honest PDF "stored verbatim; not parsed" known-limit label) → `POST
  /v1/boq/imports?format=<format>` with the RAW bytes (the ingestion route's
  exact contract, consumed read-only: bytes stored content-addressed BEFORE
  parsing — preservation unconditional; identical bytes idempotent; the
  explicit format override is the route's own authoritative resolution).
- **The SOURCE-BOQ vs SOLUTION-BOQ separation, stated visually and
  semantically:** SOURCE BOQ = the incumbent scope's own verbatim record,
  never edited, never overwritten; SOLUTION BOQ = a DERIVED projection from
  a declared validation snapshot of a proposed solution — a different record
  class with its own surface (linked), never a replacement; "the BOQ graph
  is not reality."
- Honest states: the demo never-fabricate notice; the verbatim answer
  (import id, format, byte size, parsed row count or the recorded
  `unsupported_format` reason); the typed `boq_parse_failed` failure with
  the failing part + "the bytes stay stored and retrievable".

## Gap 3 — Evidence Envelope explainability (the Why-this-result card)

**The design** (`app/evidence-envelope.tsx`):

- `EvidenceEnvelopeCard` — a compact, CALM explanation (not a debug console:
  no raw JSON, no contract-version noise — test-pinned) exposing the
  canonical envelope sections of PROD-028's hardened vocabulary: **evidence,
  observed facts, inferred assumptions, unknowns/evidence gaps, measurement
  uncertainty, deterministic checks, result/status, next action**. Every
  entry carries its recorded basis; every section the decision's records
  genuinely do not carry renders the EXPLICIT not-recorded line ("an absence
  is never ±0"); the result status renders verbatim in a neutral tag — no
  epistemic upgrades (an in-review case is never rendered CONFIRMED).
- **Composers (pure projections):**
  `caseEvidenceEnvelopeFromDetail` (the live case record's separate
  fact/inference arrays — the envelope discipline made structural:
  observations = facts, hypotheses = assumptions, declared missing evidence
  = unknowns), `caseEvidenceEnvelopeFromPane` (the demo pane view's counts +
  evidence ids, honestly labeled where the individual records are
  server-side), `readinessEvidenceEnvelope` (the task-flow bundle's
  RealitySummary verdict + the EvidenceSummary's evidence ids and declared
  gaps + the server's next best action).
- **Wired at the demo journey's consequential Layer-2 decisions:** the CASE
  decision (Engineering Case surface, demo + live paths — "What is this case
  based on?") and the READINESS decision (the task-first panel body — "Why
  this readiness verdict?").
- **Honest limitation, recorded for the Lead (no fabrication):** the case
  and readiness records carry no σ and no deterministic-check log BY DESIGN
  (the case model's own contract), so those two sections render the explicit
  not-recorded state at these decision points. The sections are fully
  rendered and tested with content where records carry them; σ-bearing
  records (gap analyses, BOQ quantities) keep their own surfaces
  (PROD-018's BoundaryLabelsCard renders σ at the quantity boundary). A
  future envelope-bearing reasoning route (e.g. a served Layer-2 envelope
  projection) would render through the same card unchanged.

## Surface discipline

`apps/web/**` presentation only; NO backend/packages/spec edits (the three
consumed route families — capture assets, BOQ imports, cases/task-flow — are
READ-ONLY). No new authority: the capture gateway stays the ingestion
authority; the mission text is the records' own; the envelope is a
projection. Integration metadata introduces no new authority. Providers stay
non-authoritative. All writes go through the app's gated same-origin fetch
(401 re-arms the auth gate).

## What remains for PROD-034 (chunk 2)

- Gap 5 — contextual incumbent integration discovery (from the current
  task, not Settings archaeology).
- Gap 6 — provider status UX (readiness/degraded/unavailable, consistent,
  no implementation noise).
- Cross-route discoverability sweep (the remaining cross-links).
- The browser-journey evidence capture for the whole item (per the
  acceptance: browser journey evidence; the Lead's Gate F will also replay
  it).

## Gap 5 — contextual incumbent integration discovery (chunk 2)

**The problem.** Integrations lived only on the Settings surface — to learn
that the current scope came from the ERP (and that the ERP connector is
broken), a user had to know to look in Settings ("archaeology").

**The design** (`app/contextual-integrations.tsx`):

- **Discovery from the current task's own records** (no new authority, no
  new metadata): `incumbentSourceRefs` projects the task-flow bundle's
  BOQContext — its `sourceSystem` + the VERBATIM `sourceRecordRef` — as the
  incumbent reference; internal sources (`aise-internal`) are honestly
  excluded from the INCUMBENT list (an AISE record is not an incumbent
  system).
- **The binding join is a presentation join over the recorded vocabulary**:
  a connector binding matches when its declared system class IS the recorded
  system family (`erp` ↔ `erp-procurement`, over the frozen SYSTEM_CLASSES
  vocabulary); the basis line states the join. Nothing is invented; a
  non-matching system honestly joins to nothing.
- **The card** ("The incumbent systems behind this scope"): each reference
  renders REFERENCE-ONLY ("the incumbent system stays the system of record
  for its own scope — AISE displays the reference, it does not own it"),
  followed by the matching binding with its honest status — connected /
  unavailable (the ERP adapter's typed `AUTHENTICATION_EXPIRED` detail,
  verbatim) / unknown-last-sync (first-class unknown) — plus the external
  record refs and the incumbent deep links.
- **Explicit states:** not-configured (no binding for the system — "the
  reference stays reference-only; there is nothing to sync and nothing was
  lost"), unavailable, unknown-last-sync, live not-readable (the integration
  registry has no readable same-origin endpoint in this build — the same
  statement Settings makes; the references still render), and the honest
  empty (no incumbent refs on the records).
- **Actions stay brokered:** authorized actions resolve per principal at the
  authorization broker — the card links the brokered panel; it never decides
  (no second authority; integration metadata is never a new authority).
- **Placed at the contextual points:** the BOQ Lens surface (where the
  incumbent's scope is inspected) and the task-first landing (via
  `TaskFirstLanding`). Settings' `BindingStatusBadge` is exported and reused
  so the status vocabulary stays ONE vocabulary.

## Gap 6 — provider status UX (chunk 2)

**The problem.** Provider readiness already flowed through `/readyz` (the
backend's readiness contract answers an optional-provider statuses map —
statuses ONLY, never credential material), but the app's probe discarded
it; provider-gated surfaces explained their own blocked state without
showing WHICH layer was unavailable, and there was no shared vocabulary.

**The design** (`app/provider-status.tsx` + the `api.ts` probe extension):

- **The seam:** `probeApi` now extracts `/readyz`'s `providers` map onto an
  additive `ApiStatus.providers` field — the readiness contract's OWN
  vocabulary (`available | disabled | unavailable`); values outside the
  vocabulary are dropped (never coerced); null when absent or the API is
  unavailable.
- **ONE consistent, calm vocabulary:** `describeProviderStatus` gives each
  recorded word exactly one user-facing meaning — available = "ready —
  configured on this deployment…"; disabled = "not configured — a deliberate
  deployment choice, cleanly off… never an error"; unavailable = "not usable
  — the readiness check reports it as misconfigured…". `ProviderStatusBadge`
  renders the recorded word VERBATIM with one visual per word; the badge/word
  tests pin the no-noise discipline (no env-var names, no SDK identifiers
  beyond the deployment's own provider ids, no raw errors).
- **Two presentations:** `ProviderStatusList` (the Settings API-connection
  section — the full provider list when live, or the honest
  none-reported line) and `ProviderStatusNote` (the compact strip for
  provider-gated surfaces: the API mode chip + the providers inline, or the
  honest none-reported / not-probeable lines).
- **Wired where provider gating bites:** the task-flow UNAVAILABLE view (via
  an additive optional `unavailableNote` on `ResourceView`, so the blocked
  view names the layer), the capture upload entry, the solution
  engine-unavailable rung, and Settings. The note deliberately does NOT
  render in loading/error/ready states (calm, not noise) — test-pinned.

## The cross-route discoverability sweep (chunk 2)

`app/discoverability.test.tsx` — one navigation pass over a 16-render
corpus (AppShell nav, NotFound guidance, canonical action bar, project
surface nav, the task-flow panel/strip/composed-journey bodies, the capture
mission + upload + limits bodies, the BOQ import body, the contextual
integrations body, the case body, the landing, and the capture + boq-lens
surfaces, wrapped in the app environment):

1. **No dead pointers** — every `#/` hash link parses to a real route (the
   SiteTwin/Outcomes bodies were verified clean in the same pass).
2. **No orphaned surfaces** — all 11 route families are pointed-to; the
   capture mission is threaded from ≥6 points.
3. **The new elements are threaded where they belong** — the landing
   composes the task-flow panel AND the integrations panel; the lens surface
   mounts the import + integrations panels; the envelope renders at BOTH
   consequential decisions; the provider note renders at the gated capture
   entry; the strip threads back to the landing.

Findings: none structural — the sweep verified the chunk-1/2 threading is
complete (the NotFound guidance's capture link targets the pilot project;
confirmed by the any-project matcher).

## Item status

All five assigned gaps (1, 2, 3, 5, 6) are closed with real, tested product
surfaces + honest states, and the cross-route sweep passes. The
`browser-journey.md` recording classifies every step honestly: deterministic
test-backed (static render / stubbed seam), NOT walked in a live browser in
this worker lane — the Lead's Gate F / PROD-033 W-journey replay covers the
live walk at the final merged SHA.
