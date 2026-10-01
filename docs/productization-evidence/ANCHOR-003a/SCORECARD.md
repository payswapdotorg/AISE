# ANCHOR-003a — Scorecard (gate record, not a ranking)

Decision vocabulary: **PROVEN / PARTIAL / DIVERGENT / REFUSED / DEFERRED**
(the geometry-spike scorecard's vocabulary, carried by ANCHOR-002's
scorecard; the scorecard is a gate/evidence record, not a ranking). Every
dimension carries its verdict plus a committed evidence pointer; a
dimension without an evidence pointer is not recorded.

Scope note: ANCHOR-003a is the plan-context SEAM — the plan-image import
lane, the declared plan-context record and the readable list/select/activate
surface over the EXISTING governed seams. Anchoring EXECUTION (any provider
call behind `anchor002-anchoring-contract/1`) is a separate worker's lane
and is DEFERRED here by the work order's own scope.

| Dimension | Verdict | Evidence line |
| --- | --- | --- |
| Plan-image import routed through the EXISTING digest→asset→registration path (never a new storage seam) | **PROVEN** | `RealityRecorder.tsx` `PlanImportCard` — `webCryptoSha256` → `uploadCaptureAssetLive` → the SINGLE `EvidenceRegistrationPanel` (seam-for-seam reuse; `apps/web/src/app/api.ts` unchanged on the write path); panel test "names the EXISTING path (never a new storage seam)" |
| The declared plan-context record carries the CONTRACT's typed shape (kind `plan-raster`; raster convention incl. the HANDEDNESS LAW; contentId = the stored bytes' sha-256) | **PROVEN** | `reality-recorder.ts` §ANCHOR-003a: `PLAN_CONTEXT_KINDS` reused verbatim (pinned: `PLAN_CONTEXT_KIND_OPTIONS === PLAN_CONTEXT_KINDS`), `planContextSchema` (the contract's OWN schema, `packages/anchoring-contract/src/request.ts`) validates every built record; `reality-recorder-plan-context.test.ts` "the plan-context kind vocabulary is reused verbatim" + "a valid draft maps to the contract's PlanContext and passes the CONTRACT'S OWN schema" |
| The HANDEDNESS convention ROUND-TRIPS | **PROVEN** | the round-trip test: draft → `planContextRecord` (contract-parsed) → `activePlanContextChangeRecord` (the annotation wire form) → `planContextOfAnnotationNode` (the typed reader) → the IDENTICAL record (`rasterToScene` deep-equal: scale, world origin, east-right/north-up); the version-level round-trip repeats it through `activePlanContextOfVersion` |
| Negatives fail closed with the kind/digest/media type NAMED, zero side effects on refusal | **PROVEN** | `negative-ledger.md` 21/21 FAIL-CLOSED OK — the pre-upload gate (non-image refused BY NAME before any byte moves), the declaration layer (unknown kind WITH THE KIND NAMED, wrong digest, non-image, wrong-handedness, non-numeric scale/origin), the wire layer (non-annotation node, missing property, unknown kind, wrong digest, wrong literal, non-image media type), the register filter (invalidated / non-image / photo registrations excluded) |
| The readable surface: list/select an imported plan raster as the ACTIVE plan context for a project/version, through the EXISTING governed seams | **PROVEN** | `PlanContextSelectCard` — the list from the live register (`planRasterOptionsFromLive`: uninvalidated `image/*` + `DOCUMENT_REGION`, captions from the record's own fields), the active read-back (`loadActivePlanContextLive` over the EXISTING `versions/latest` route — zero backend changes), the record through the governed changes API as ONE annotation node under the STABLE id `active-plan-context` (same-id upsert = at most one active per version); brokered `reality:write` offer (the snapshot recorder's chassis); panel tests for both mounts (recorder surface with the import lane; Studio list/select only) |
| No anchoring execution / no provider call (the separate worker's lane) | **DEFERRED** | the work order's own OUT OF SCOPE: "any anchoring execution or provider call" — `deferment.md` (the future adapter work order's first gate, per the ANCHOR-002 deferment note) |
| Real-photoset evidence (the production adapter's own gate) | **DEFERRED** | `deferment.md` — the ANCHOR-001 recommendation's gate, unchanged by this seam |
| `packages/anchoring-contract` stays read-only | **PROVEN** | zero diff under `packages/anchoring-contract` (the branch touches only `apps/web/**` + this evidence tree + the worker-progress file); the app imports the contract's `vocabularies.ts`/`request.ts` modules directly — NEVER the barrel (which re-exports the runner's `node:child_process`); the PROD-030/031 bundle gates pass at the delivered tree (the marker scan is the enforcement) |
| Additive-only diff, no new external dependency | **PROVEN** | `bun.lock` byte-identical to the base; boundaries 1114 files / zero cross-zone violations; the five touched app files carry only additive sections (the one pre-existing-component change is the default-preserving `initialAcquisitionMethod` prop) |

**Gate result:** the plan-context seam is delivered and gated — `bun run
verify` at the delivered tree: **VERIFY: PASS, 6500 pass / 0 fail across
429 files (81669 expect() calls)**, baseline `88689ae`: 6451/0 across 427
files (81525 expects) — the delta is exactly the two new colocated suites
(+49 tests, +2 files); typecheck PASS, lint PASS, boundaries 1114 source
files / zero cross-zone violations.

**Fork gate:** no fork proposed and none needed — the seam CONSUMES the
existing control plane (the capture gateway, the evidence register, the
reality changes API, the authorization broker) and the delivered anchoring
contract (read-only); it adds no package and no second authority.
