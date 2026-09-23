# PROD-031 — journey 2: the browser journey, twelve steps, real-run outcomes

The work order's §6 gate: a real headless Chromium (Playwright `chromium.launch`,
`--no-sandbox`) walking the solution journey against the BUILT web bundle + the
session-authenticated local backend (`tools/web-bundle/gate.ts`'s
`startLocalDeploymentStack` — one same-origin loopback deployment, the demo
session entered through the honest "Enter demo" UI gate). This is the same
twelve-step journey shape the committed record
(`apps/web/src/app/solution-journey-record.json`, journey
`ca27385e41a32715e4fb4e691ac1c80e51d803387a6ae700e12907cb4115ee62`) pins; the
browser walk asserts the live same-origin legs against it.

**Real-run result (2026-09-23T04:2xZ, branch `prod-031-closure` tip `605d86d`):
PASS — 2 tests / 0 fail, 24 expect() calls, the journey leg itself 1988.52 ms,
ZERO `pageerror` events across the whole session.** Command:

```
$ bun test tools/web-bundle/solution-journey.test.ts
```

## The twelve steps and their real-run outcomes

| # | The step (the record's shape) | The browser journey's assertion (what Chromium did) | Real-run outcome |
| --- | --- | --- | --- |
| 1 | Reconstruct / open the current building reality | `page.goto(origin)` → `h2#gate-title` appears → click **Enter demo** → gate detaches; the demo session's observed reality is entered through the honest UI gate | ✅ PASSED — gate rendered, entered, detached within budget (`legMs` = 20 s) |
| 2 | Select the engineering problem | navigate `#/projects/proj-demo-001/solution?case=case-demo-wall-001`; the surface's problem statement renders over the demo world | ✅ PASSED — the solution route resolved the demo case (CURRENT BUILDING → PROBLEM composition) |
| 3 | Create the interactive solution | `#solution-workspace[data-case-id="case-demo-wall-001"]` mounts through the selection ladder's SECOND rung — `[data-browser-mount="solution-browser-mount"]` present, `#solution-engine-unavailable` and `#solution-backend-unreachable` both ABSENT; workspace pins `data-baseline-reality-version="rgv-demo-0007"`, `data-current-version="1"`, `data-cursor-state-index="0"`; the opening leg is ONE `POST /v1/solutions/baseline` (the per-transport binding cache) | ✅ PASSED — rung 2 mounted, all four data anchors asserted, no unavailable panel |
| 4 | Manipulate directly — demolition-removal | click element `node-wall-002` ("Damaged ground-floor wall faces") → action `demolition-removal` → fill 5 / 2.4 / 0.1 → apply; the operation row appears with `data-operation-type="demolition-removal" data-origin="direct-manipulation"`, its `data-operation-id` matching `^78be478643fcbb4a` (the committed corpus identity), cursor → `1` | ✅ PASSED — the committed demolition id reproduced byte-prefix-exact by the live engine, cursor `1` |
| 5 | Use agent commands — block-wall-placement | `#agent-utterance`: "Build the wall 5 m long and 0.1 m thick." → `[data-pending="clarification"]` (the missing slot pair) → answer "1 m high, using concrete blocks, on the wall line along the damaged section" → `[data-pending="proposal"]` whose command text matches `/concrete-block wall 5 m long, 1 m high and 0\.1 m thick/i` → confirm → the operation row `data-operation-type="block-wall-placement" data-origin="agent"`, id matching `^[0-9a-f]{64}$`, cursor → `2` | ✅ PASSED — the LIVE PROD-023 compiler (`/v1/solution-agent/compile|turn`) walked clarification → proposal → confirm; the typed content matches the record's step 5 (the double's literal id is NOT asserted — the live compiler's own deterministic intent id is, by shape; see the test header note) |
| 6 | Use agent commands — plaster-application | **not re-walked in the browser journey** — the §6 gate budgets ONE agent command (step 5); the plaster leg stays pinned by the committed record, whose live-Node equality is asserted byte-exact by `solution-journey-record.test.ts` ("deep-equals the LIVE Node run of the ONE runner") | ⏸️ PINNED ELSEWHERE — asserted by the parity test (4 pass), not by this Chromium run |
| 7 | Step through the proposed layers/states | the cursor transitions ARE the step-through: `data-cursor-state-index` `0 → 1` (after step 4) → `2` (after step 5), every position the engine's own state over the live routes, never a client-side snapshot; the full timeline walk (back to layer 1, forward to layer 3) is the record's step 7 | ✅ PASSED (the live subset) — both transitions asserted; the full three-layer walk pinned by the record |
| 8 | Validate (the deterministic server-side checks) | click **Check this proposal (validate)** → `#solution-validation` visible with `data-validation-outcome="pass"` and exactly `7` `li[data-check-id]` rows (the engine's deterministic Validate over `/v1/solutions/validate`) | ✅ PASSED — outcome `pass`, 7/7 checks |
| 9 | Generate the solution BOQ | `#solution-boq [data-boq-line-id]` renders exactly `committedRecord.boqTraceSet.lineTraces.length` = **7** lines — the guarded seam over the COMMITTED trace set (the §4.6 one-record choice), not a client re-derivation | ✅ PASSED — 7 lines rendered from the committed record |
| 10 | Click the BOQ line | click the recorded plaster line's button ("Plaster application to affected surfaces — cement-plaster, measured by volume") → its row gets `data-selected="true"` | ✅ PASSED — the recorded line selected by its committed `boqLineId` |
| 11 | Jump to the corresponding solution step / geometry (and inspect it) | `page.goto(…&boq-line=<plasterLineId>&step=3)` → `#solution-boq-trace-panel` renders, the line `data-selected="true"`, panel text contains "the deep-linked solution step is step 3" — ONE router round-trip carrying the query | ✅ PASSED — the line→step deep link round-tripped through the real router |
| 12 | Save / revise the solution without altering observed reality | the reality seal: click **Use the accessible view (no drawing)** again — the observed scene's accessible text is byte-identical to the pre-work capture (`observedSceneAfter === observedSceneBefore`), and the workspace still pins `data-baseline-reality-version="rgv-demo-0007"` (the read-only anchors; the revision leg itself is the `/v1/solutions/revise` route, wire-serializable per `14fabd0`) | ✅ PASSED — observed reality byte-unchanged across the whole journey, baseline pin held |
| — | The honest close | `pageErrors` (every `pageerror` event of the session) asserted empty | ✅ PASSED — ZERO page errors |

## The companion crypto-freeness check (test 1 of the same run)

The same run first proved the browser mount's whole built graph crypto-free:
`browserMountAssets()` > 0 (the mount chunk exists), `legacyEngineMountAssets()
≤ 1` (the documented legacy local-engine chunk is the only excused asset), and
`scanBrowserGraphForCryptoMarkers()` returned `[]` — no Node-builtin
externalization markers anywhere else in the built graph. ✅ PASSED (7.73 ms).

## Provenance

- Negative control (the PRE-fix tree, same machinery): `negative-control.md` —
  the workspace did NOT mount, the honest engine-unavailable panel rendered,
  zero page errors. The post-fix output is this file (the `gate-outputs.md`
  name used there resolves here).
- The parity backbone: `bun test apps/web/src/app/solution-journey-record.test.ts`
  → 4 pass / 0 fail (17 expect() calls) — the committed record equals the live
  Node run, losslessly, byte-exact in shape, twelve steps over the demo pins.
