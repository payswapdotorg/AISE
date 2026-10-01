# ANCHOR-003a — The plan-context seam: plan-image import with the declared raster convention

**Work order:** the operator's 2026-09-30 roadmap directive; ANCHOR-001
recommendation §3 — "the enabling dependency, small, load-bearing,
independent of any provider decision". Authorization basis: the delivered
ANCHOR-002 shared anchoring contract (`anchor002-anchoring-contract/1`)
consumes plan context of kind `plan-raster` with the rasterToScene
HANDEDNESS LAW as a first-class field; the product had NO readable
plan/floor-context surface. This work item is that surface — WITHOUT any
anchoring execution (a separate worker's lane).

**Base:** `88689ae` (origin/main lineage, the R3 re-validation tip).
**Branch:** `work/anchor-003a`.

## What was delivered

1. **The plan-image import lane** (`apps/web/src/app/surfaces/RealityRecorder.tsx`
   — `PlanImportCard`, the reality-recorder surface): one image file → the
   PRE-UPLOAD GATE (a non-image media type refused BY NAME before the bytes
   are read, hashed or POSTed — fail closed BEFORE side effects) → the
   EXISTING digest→asset→registration path, seam-for-seam reused:
   `webCryptoSha256` → `uploadCaptureAssetLive`
   (`POST /v1/capture/assets/:contentId` — the gateway re-verifies the
   digest server-side) → the SINGLE `EvidenceRegistrationPanel` with the
   plan lane's honest `DOCUMENT_REGION` prefill (an imported drawing, not a
   photo; the additive `initialAcquisitionMethod` prop, default-preserving —
   the VOICE-002 lane-prop precedent). NEVER a new storage seam.
2. **The declared plan-context record** (`apps/web/src/app/reality-recorder.ts`
   — the ANCHOR-003a section): kind `plan-raster` (the contract's CLOSED
   vocabulary — `PLAN_CONTEXT_KINDS` reused verbatim, pinned by test), the
   raster convention fields including the HANDEDNESS LAW's closed literals
   (`xDirection: "east-right"`, `yDirection: "north-up"`), `imageContentId`
   = the 64-hex sha-256 of the stored bytes, and the record is validated by
   the CONTRACT'S OWN `planContextSchema` (imported read-only from
   `packages/anchoring-contract/src/request.ts` — never reinvented). Every
   defect NAMED, never thrown.
3. **The readable plan-context surface** (`PlanContextSelectCard` — ONE
   component, TWO mounts, no fork): the reality recorder surface
   (`RealityRecorderPanel`, with the import lane) AND the Intervention
   Studio (`StudioBody`, list/select only). Lists the imported plan rasters
   from the live evidence register (uninvalidated image documents —
   `DOCUMENT_REGION` + `image/*`, what the index exposes; the register is
   the authority); reads the ACTIVE plan context back from the project's
   latest graph version through the typed reader; and records the selection
   through the EXISTING governed state seam — the reality changes API
   (`POST /v1/reality/projects/:id/changes`, brokered `reality:write` offer,
   the same chassis the snapshot recorder uses) as ONE annotation node
   under the STABLE id `active-plan-context` (PROPOSED — a declaration, not
   an observation; the plan raster's evidence record as SUPPORTS
   provenance + the declaration note as DERIVED_FROM). At most one active
   plan context per version, by construction — no new authority, no second
   canonical model.
4. **The typed read seam** (`apps/web/src/app/api.ts` —
   `loadActivePlanContextLive`): `GET /v1/reality/projects/:id/versions/latest`
   (the EXISTING route — zero backend changes), the stable annotation node
   parsed back through `planContextOfAnnotationNode` (the contract's own
   schema validates the rebuild; a malformed node is a NAMED typed refusal).
   404 and a node-less version are the HONEST EMPTY state.

## Where

| Surface | File | Change |
| --- | --- | --- |
| Pure logic (the seam) | `apps/web/src/app/reality-recorder.ts` | ADDITIVE §ANCHOR-003a (~520 lines: vocabularies carried from the contract, the draft + named-defect validation, the contract-validated record builder, the register filter, the pre-upload gate, the annotation change-record builder, the typed reader, the per-version read) |
| Live read seam | `apps/web/src/app/api.ts` | ADDITIVE `loadActivePlanContextLive` (+ the read-only type import) |
| Import + select panels | `apps/web/src/app/surfaces/RealityRecorder.tsx` | ADDITIVE `PlanContextPanel`/`PlanImportCard`/`PlanContextSelectCard`; `RealityRecorderPanel` composes the plan surface FIRST, then the snapshot recorder |
| Registration lane prop | `apps/web/src/app/surfaces/CaptureMission.tsx` | ADDITIVE optional `initialAcquisitionMethod` on `EvidenceRegistrationPanel` (absent/null → byte-identical behavior) |
| Studio mount | `apps/web/src/app/surfaces/InterventionStudio.tsx` | ADDITIVE `PlanContextPanel` mount in `StudioBody` (list/select only) |
| Tests | `apps/web/src/app/reality-recorder-plan-context.test.ts`, `reality-recorder-plan-context-panel.test.tsx` | NEW colocated suites (49 tests) |

## Protected-surface compliance (additive only)

- `packages/anchoring-contract` — **read-only consumer**: `vocabularies.ts`
  (`PLAN_CONTEXT_KINDS`) and `request.ts` (`planContextSchema`, `PlanContext`)
  imported, ZERO changes to the package. The barrel `index.ts` is
  deliberately NOT imported by app code: it re-exports the supervised
  runner (`node:child_process`) and would leak Node-builtin markers into
  the browser bundle — the PROD-030/031 bundle gates caught exactly this
  during development (see WORKER-PROGRESS §deviations-prevented).
- `packages/solution-*`, `backend/` — **untouched** (the read seam reuses
  the existing `versions/latest` route; NO backend change at all).
- `apps/android` — untouched. No new package, no new external dependency
  (`bun.lock` unchanged).
- The ANCHOR-001 evidence tree and the ANCHOR-002 evidence tree — untouched.

## Verify

`bun run verify` at the delivered tree: **VERIFY: PASS — 6500 pass / 0 fail
across 429 files (81669 expect() calls); typecheck PASS; lint PASS;
boundaries 1114 source files / zero cross-zone violations.** Baseline
`88689ae`: 6451/0 across 427 files (81525 expects), boundaries 1112 — the
delta is exactly the two new colocated suites (+49 tests, +2 files).

## Evidence map

- `SCORECARD.md` — the gate record (verdicts per dimension, PROVEN/DEFERRED
  vocabulary, committed evidence pointers).
- `negative-ledger.md` — the 21 fail-closed sabotage drills (declaration,
  wire and gate layers), each asserting the NAMED typed refusal and zero
  side effects.
- `deferment.md` — the deferred lanes (anchoring execution, provider calls,
  the real-photoset run — the future adapter work order's own gates).
