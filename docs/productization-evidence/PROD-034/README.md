# PROD-034 — Web product discoverability closure (chunk 1: gaps 1, 2, 3)

Branch `prod-034-closure` (base `c4df5bc`). This directory holds the chunk-1
evidence for issue #9 gaps 1–3 (first-class capture acquisition, BOQ import
discoverability, Evidence Envelope explainability). Gaps 5/6 (contextual
incumbent integration discovery, provider status UX) + cross-route
discoverability are chunk 2 (a later worker session on the same branch).

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
