# WORKER PROGRESS — ANCHOR-003a (the plan-context seam)

Work item: the plan-image import with the declared raster convention —
the reality recorder's readable plan/floor-context surface. Branch
`work/anchor-003a` off `88689ae` (origin/main lineage). One worker, no
subcontracted surfaces, no self-approval (the Lead gates the merge).

## What was built

1. **The pure seam** (`apps/web/src/app/reality-recorder.ts`, additive
   §ANCHOR-003a, ~520 lines) — the plan-context logic layer, following the
   module's own discipline (closed vocabularies pinned by test, every
   defect NAMED never thrown, deterministic pure functions):
   - the contract's typed shape CARRIED read-only: `PLAN_CONTEXT_KINDS`
     (`packages/anchoring-contract/src/vocabularies.ts`) and
     `planContextSchema` + `PlanContext` (`.../src/request.ts`) — every
     built AND rebuilt record is validated by the contract's OWN schema;
   - `PlanImportDraft` + `validatePlanImportDraft` (the named-defect
     validation: closed kind vocabulary with the kind named, 64-hex digest,
     image-only media type, strictly-positive scale, finite world origin,
     the HANDEDNESS LAW's closed literals east-right/north-up);
   - `planContextRecord` (draft → the contract-parsed `PlanContext`);
   - `planRasterOptionsFromLive` (the register filter: uninvalidated
     `image/*` + `DOCUMENT_REGION`, captions from the record's own fields)
     + `planImageUploadDefect` (the pre-upload gate: non-image refused BY
     NAME, zero side effects);
   - `activePlanContextChangeRecord` (the annotation `upsert-node` under
     the STABLE id `active-plan-context`, PROPOSED, ten typed properties —
     numbers with units `px/m`/`px`, strings unitless per the engine's own
     rule — SUPPORTS the plan raster's evidence id + DERIVED_FROM the
     declaration note);
   - `planContextOfAnnotationNode` + `activePlanContextOfVersion` (the
     typed reader: the wire/graph read-back, contract-validated, every
     refusal named).
2. **The live read seam** (`apps/web/src/app/api.ts`, additive) —
   `loadActivePlanContextLive`: the EXISTING
   `GET /v1/reality/projects/:id/versions/latest` route, the stable
   annotation node parsed back through the typed reader; 404 and a
   node-less version are the honest empty state. ZERO backend changes.
3. **The panels** (`apps/web/src/app/surfaces/RealityRecorder.tsx`,
   additive ~640 lines) — `PlanContextPanel` (ONE component, TWO mounts):
   - `PlanImportCard` (the recorder surface's lane): the image-only file
     input → the pre-upload gate → `webCryptoSha256` →
     `uploadCaptureAssetLive` → the SINGLE `EvidenceRegistrationPanel`
     (with the plan lane's `DOCUMENT_REGION` prefill — the additive,
     default-preserving `initialAcquisitionMethod` prop on
     `CaptureMission.tsx`'s panel, the VOICE-002 lane-prop precedent) →
     the registration auto-selects the fresh raster below;
   - `PlanContextSelectCard` (recorder surface AND Studio): the active
     read-back slot, the register list, the declaration fields (the
     handedness law rendered as the closed literals it is), the brokered
     `reality:write` offer, and the submit: ensure project → the
     contract-validated record → the annotation change → the governed
     changes API. One version transition per activation.
   - `RealityRecorderPanel` now composes the plan surface FIRST, then the
     snapshot recorder (one surface, one discipline).
4. **The Studio mount** (`apps/web/src/app/surfaces/InterventionStudio.tsx`,
   additive ~13 lines) — `StudioBody` mounts `PlanContextPanel`
   (list/select only; importing stays the recorder surface's lane).
5. **The tests** (2 new colocated files, 49 tests):
   - `reality-recorder-plan-context.test.ts` (35): the contract pins
     (vocabulary verbatim, the stable node id, the ten-key property list,
     the bytes-path convention), the register filter, the pre-upload gate,
     the named-defect validation, the contract-validated record, the
     governed wire shape (units, provenance, stamped), the typed reader
     (incl. THE HANDEDNESS ROUND-TRIP: record → annotation → reader → the
     identical record), the per-version read;
   - `reality-recorder-plan-context-panel.test.tsx` (14): static renders —
     the readable surface (both mounts), the import lane (the image-only
     input, the named gate, the honest waiting state), the demo
     never-fabricate notices, the composed recorder surface, the Studio
     mount.
6. **The evidence tree** (`docs/productization-evidence/ANCHOR-003a/`):
   README (what/where/protected-surface compliance/verify), SCORECARD (the
   gate record), negative-ledger (21/21 FAIL-CLOSED OK), deferment (the
   four deferred lanes, each with its gate and owner).

## The exact verify counts

`bun install` once (286 packages, no lockfile change). `bun run verify`:

- **Delivered tree: VERIFY: PASS — 6500 pass / 0 fail across 429 files,
  81669 expect() calls; typecheck PASS (13 workspace tsconfigs); lint
  PASS; boundaries 1114 source files scanned, zero cross-zone violations.**
- Baseline `88689ae` (before any change, same environment): 6451/0 across
  427 files, 81525 expects, boundaries 1112. The delta is exactly the two
  new colocated suites: +49 tests, +2 files, +144 expects, +2 scanned
  sources. No pre-existing test was modified.

## Deviations honestly declared

1. **Environment provisioning (not a repo change):** the sandbox lacked
   Playwright's Chromium binary — the base tree's first verify run failed
   ONLY the three browser gates with "Chromium is not installed". Fixed by
   `bunx playwright install chromium` (an environment install to
   `~/.cache/ms-playwright`, zero repo changes); the base tree then
   verified PASS 6451/0. Recorded here because the baseline claim depends
   on it.
2. **Deviations PREVENTED (caught by the repo's own gates, fixed before
   delivery):** the first implementation imported the anchoring contract's
   barrel `index.ts`, which re-exports the supervised runner's
   `node:child_process` — the PROD-030/031 browser-bundle gates failed
   exactly as designed (Node-builtin markers in the built bundle; 11
   dependent live-mount/scan tests red). Root-caused and fixed by importing
   the contract's own `vocabularies.ts`/`request.ts` modules directly
   (never the barrel); all gates green at the delivered tree. The fix is
   documented in-code at both import sites.
3. **No push performed from this environment:** the sandbox carries no
   credentials for `github.com/payswapdotorg/aise` (pushes answer
   "could not read Username ... terminal prompts disabled"). The branch
   `work/anchor-003a` exists at the delivered tree below; the Lead
   (or the operator) pushes it. NOT a scope deviation — an environment
   limit, declared rather than papered over.
4. **One pre-existing component touched** (`CaptureMission.tsx`'s
   `EvidenceRegistrationPanel`): the additive, default-preserving
   `initialAcquisitionMethod` prop — the established VOICE-002 lane-prop
   precedent on that exact panel ("the SAME single registration path — not
   forked"). No existing call site passes it; behavior is byte-identical
   without it (the existing panel tests pass unchanged).
5. **An observed environmental flake in ONE browser-gate test (pre-existing
   exposure, not caused by this diff):** during repeated full-suite runs on
   this sandbox, `boq-flow-live.test.tsx`'s "ephemerality honesty" leg
   failed 4 consecutive times with `Target page, context or browser has
   been closed` (the Chromium PROCESS dying mid-wait, not an assertion),
   then passed — the signature of concurrent Chromium instances on this
   container's **64 MB `/dev/shm`** (the classic container/Chromium crash
   mode; the box also carries the 4 GB RAM ceiling with ~600 MB
   permanently held by the sandbox's own dev server). The leg passes 100%
   in isolation (3/3 repeated) and drives the BOQ Lens page, which mounts
   NONE of this work item's components; the baseline tree carries the same
   exposure (its two PASS runs and the four failures here bracket the
   identical code). The delivered gate result below is a full-suite PASS
   at the delivered tree; the live-browser expect-count varies by a few
   calls between runs (81664–81669) with the pass/fail outcome stable.

## Out of scope respected

- No anchoring execution, no provider call, no provider-registry change.
- `packages/anchoring-contract` — ZERO diff (read-only consumer).
- `packages/solution-*`, `packages/shared-contracts` — ZERO diff.
- `backend/` — ZERO diff (not even the "minimal read seam": the existing
  `versions/latest` route already answers everything the read needs).
- `apps/android` — ZERO diff. No new package, no new dependency
  (`bun.lock` byte-identical to the base).
- The frozen evidence trees (ANCHOR-001, ANCHOR-002) — ZERO diff.

## Handoff

The delivered seam is the input surface the future adapter work order
consumes: `planContextOfAnnotationNode` /
`activePlanContextOfVersion` (`reality-recorder.ts`) read the active plan
context out of any graph version in the contract's own `PlanContext` shape
— ready to ride an `AnchoringRequest.planContext` verbatim. The adapter
order's own gates (real-photoset run, promotion through the registry) are
recorded in `deferment.md` and unchanged.
