# POST-005 — cross-device + BOQ continuity (implementation wave)

Work Item: POST-005 (issue #19), AISE Wave R1 Worker 2.
Base: `c3f2e3b0715ad81a4bc7d8d10783409ccf90d355`. Branch: `post005/cross-device-boq`.
Governing plan: `docs/post-production-discoverability-and-device-validation-plan-2026-09-25.md`
§2 C/D/F, §5, §6 Wave 1 Worker 2, §7. Full completion report is the worker's
harvested chat message; this directory holds the reproducible evidence
artifacts.

## What shipped (plan §6 Wave 1 Worker 2, all five items)

1. **Web → mobile task handoff** — `CrossDeviceHandoffPanel`
   (`apps/web/src/app/surfaces/CaptureMission.tsx`): the obvious handoff —
   the task identity renders, the canonical `aise://task` deep link is
   emitted through the adapter-contract codec, the return path is stated.
2. **Mobile task identity / deep-link continuation** — the ADDITIVE
   `@aise/adapter-contract/task-handoff` subpath
   (`packages/adapter-contract/src/task-handoff.ts` +
   `handoff-fixtures/`): the `FieldTaskHandoff` envelope (project id, task
   id, target refs incl. evidence/content ids, provenance, version context,
   epistemic state — the plan §5 boundary law) and the strict `aise://task`
   deep-link codec; the Android `:core` Kotlin mirror
   (`apps/android/core/.../adapter/FieldTaskDeepLink.kt`) byte-pinned
   against the same committed fixtures; the manifest VIEW intent filter
   (scheme `aise`, host `task`, `singleTask`) + `MainActivity.onNewIntent`
   routing + `AppContainer.offerHandoff` +
   `FieldJourneyViewModel.startHandedOffJourney` continuation (identity
   renders verbatim on the mission panel; the handed-off taskId rides the
   session `missionRef` into the sync envelope).
3. **BOQ import/revision selector** — `BoqRevisionSelectorCard`
   (`apps/web/src/app/surfaces/BoqLens.tsx`): every recorded source-BOQ
   import listed and inspectable as an explicit SELECTION (the pre-selection
   default — the service's own first import — is always NAMED, never
   guessed silently); source-BOQ vs solution-BOQ separation stated and
   asserted.
4. **Missing-evidence → capture bridge** —
   `CaseCaptureBridgePanel`/`MissingEvidenceCaptureBridgePanel`/`Body`
   (`apps/web/src/app/surfaces/EngineeringCase.tsx`): from each OPEN
   missing-evidence declaration directly to "capture this evidence → on
   this device or the field device → for this case" — the case-specific
   capture task identity (case, declaration, the case's own status) crosses
   the boundary verbatim.
5. **Post-work capture return path** — `PostWorkCaptureBridgePanel`
   (`apps/web/src/app/surfaces/Outcomes.tsx`): the observed outcome's own
   post-work evidence content ids render as the COMPLETED return path; the
   outgoing post-work handoff carries `purpose=post-work-capture`; the
   Android side gains the post-work capture entry point via the deep link
   (GAP-3), with the handed-off taskId as the session `missionRef`.

Plus the POST-002 audit items on my surfaces: GAP-1 stale copy refreshed
(CaptureScreen submission/mission panels, FieldJourneyRuntime KDoc + offline
reason, AppContainer KDoc), GAP-2 empty `onError` fixed
(`onStillCaptureFailed` — visible failure, nothing journaled), GAP-3 =
item 5 above.

## Evidence classes (binding, never upgraded)

- The adapter-contract subpath suites + the web bridge suites + the
  journey rows are **deterministic** (bun tests that RAN at this SHA;
  committed fixtures; static renders).
- The Android source-level wiring checks
  (`task-handoff.android-wiring.test.ts`) are **deterministic source-level**
  verification of the committed Kotlin/manifest sources — NOT behavioral
  device evidence.
- The Kotlin behavioral suites (`FieldTaskDeepLinkTest` — 7 tests) are
  **STATION-PENDING**: this station has no JVM build toolchain (JRE only,
  no javac/gradle; probing time-boxed and never attempted as a build per
  the lane law). They run on the E2B/gradle station. Never classified as
  device or emulator evidence.
- PHYSICAL lane remains BLOCKED_NO_PHYSICAL_HARDWARE (POST-002 lane truth);
  EMULATED remains BLOCKED_NO_TOOLCHAIN (no /dev/kvm).

## Gate results at HEAD

- `bun run verify` — **VERIFY: PASS** (typecheck, lint, test, boundaries):
  5982 pass / 0 fail / 0 skip across 389 files (baseline at base:
  5944/387), boundaries: 1038 source files scanned, no cross-zone import
  violations.
- Journey harness (`tools/journey/run.ts`, standalone, real headless
  Chromium 145.0.7632.6): **W = 25 PASS / 0 FAIL** (record
  `runs/w-2026-09-26T02-17-12Z.md`), **M = 22 PASS / 0 FAIL / 1
  BLOCKED_NO_KVM recorded** (record `runs/m-2026-09-26T02-16-56Z.md`),
  **X = 16 PASS / 0 FAIL** (record `runs/x-2026-09-26T02-17-02Z.md`). The
  POST-005 rows are `m.handoff-envelope`, `m.deeplink-continuation`,
  `m.postwork-entry`, `x.boq-revision-selection`, `x.handoff-roundtrip`,
  `x.postwork-return` — every new bridge has its row. The journey run
  records are copies of the harness output committed HERE (my evidence
  directory); the harness's own PROD-033/runs side-effect files were not
  committed by this worker (not my surface).

## Station note (reproducibility)

This station nests the AISE clone inside `/home/z/my-project` (the only
persisted volume), whose own `node_modules/@types/node@25.0.9` leaks into
TypeScript's `@types` walk-up and breaks the base typecheck
(`process.on("SIGINT")` vs bun-types 1.4.2). The station repair — one
symlink inside the (gitignored) `node_modules`, no tracked file touched:

```
ln -sfn ../.bun/@types+node@24.13.6/node_modules/@types/node node_modules/@types/node
```

After the repair the base gate reproduced POST-003's recorded result
exactly (5944/0, 387 files).
