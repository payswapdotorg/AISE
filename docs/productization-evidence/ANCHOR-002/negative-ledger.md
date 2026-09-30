# ANCHOR-002 — The contract-layer negative ledger

**Runner:** the co-located test suites of `packages/anchoring-contract` (`bun test` in the package; part of `bun run verify`). The cases below are the SABOTAGE DRILLS: mutations of lawful wire objects and hostile provider behaviors, each asserting the typed fail-closed outcome. Numbering is fresh within this tree (the ANCHOR-001 provider-layer ledger `neg-001…neg-006d` is the frozen record in `docs/productization-evidence/ANCHOR-001/negative-ledger.md`).

**The fail-closed rule (this layer's form):** the degraded or hostile artifact must be answered by a TYPED refusal — a guard violation naming the field, a typed codec error, a typed runner failure, or a construction-time invariant error — and may NEVER silently become anchoring evidence (zero hypotheses on every refusal; nothing ungated crosses the boundary).

## The cases

| case | kind | expected typed state | outcome |
| --- | --- | --- | --- |
| neg-001 | corrupted response / unknown top-level field | guard `unknown-field` naming the field | **FAIL-CLOSED OK** — injected `mysteryPoseGraph` → `unknown-field @ mysteryPoseGraph` "provider types may not cross the canonical anchoring boundary" |
| neg-002 | corrupted response / provider handle leak in a hypothesis | guard `unknown-field` naming the field | **FAIL-CLOSED OK** — injected `hypotheses[0].siftKeyPointHandle` → `unknown-field @ hypotheses[0].siftKeyPointHandle` (the spike's neg-006b class, lifted) |
| neg-003 | corrupted response / non-finite matrix entry | guard `type-mismatch` at the matrix path | **FAIL-CLOSED OK** — `NaN` in `matrix[0][0]` → `type-mismatch @ hypotheses[0].transform.matrix` "must be a 3x3 matrix of finite numbers" (the spike's neg-006c class, lifted) |
| neg-004 | corrupted response / refused response carrying hypotheses (fabricated anchors) | guard `refusal-discipline` | **FAIL-CLOSED OK** — refusal + 1 hypothesis → "a refused response must carry NO hypotheses (no fabricated anchors)" (the spike's neg-006d class, lifted) |
| neg-005 | invented identity / hypothesis content id AISE never supplied | guard `identity-echo` | **FAIL-CLOSED OK** — `evidenceContentId` outside the request's stills → "carries a content id AISE did not supply (ids are echoed, never invented)" |
| neg-006 | invented identity / foreign executionId | guard `identity-echo` | **FAIL-CLOSED OK** — "provider-invented-execution-42" ≠ the request's executionId → identity-echo refusal |
| neg-007 | typed PARTIAL / refused still with an UNSUPPLIED content id | guard `identity-echo` | **FAIL-CLOSED OK** — a partial refusing a fabricated id → `identity-echo @ refusedStills[0].contentId` |
| neg-008 | typed PARTIAL / summary disagreeing with the arrays | guard `partial-accounting` | **FAIL-CLOSED OK** — `partialSummary {9,9}` vs. arrays {1,2} → both count violations named |
| neg-009 | typed PARTIAL / a requested still covered by NEITHER array | guard `partial-accounting` | **FAIL-CLOSED OK** — anchored response missing one still → "appears 0 times across hypotheses/refusedStills (exactly once is required)" |
| neg-010 | typed PARTIAL / a still covered by BOTH arrays | guard `partial-accounting` | **FAIL-CLOSED OK** — duplicated hypothesis → "appears 2 times across hypotheses/refusedStills (exactly once is required)" |
| neg-011 | hostile provider / ignores the supervision timeout | runner `timeout` | **FAIL-CLOSED OK** — a provider blocked in `Atomics.wait` for 60 s under a 250 ms supervision → typed `timeout` failure, SIGKILL-enforced, bounded run (wall < 10 s), input digest still recorded (the audit trail) |
| neg-012 | hostile provider / fabricated input-digest echo | runner `input-digest-mismatch` | **FAIL-CLOSED OK** — an otherwise-lawful response echoing `sha256:000…0` → typed mismatch naming the runner's actual digest |
| neg-013 | hostile provider / stdout is not JSON | runner `invalid-json` | **FAIL-CLOSED OK** — "not json at all" → typed `invalid-json` failure; nothing ungated becomes evidence |
| neg-014 | hostile provider / non-zero exit with stderr | runner `nonzero-exit` | **FAIL-CLOSED OK** — exit 3 + "boom" → typed failure with the code and a bounded stderr excerpt |
| neg-015 | hostile provider / command cannot spawn | runner `spawn-failed` | **FAIL-CLOSED OK** — nonexistent binary → typed `spawn-failed` |
| neg-016 | hostile provider / guard-violating response THROUGH THE RUNNER | runner `guard-refused` (violations carried) | **FAIL-CLOSED OK** — response with `mysteryTop` + `hypotheses[0].siftKeyPointHandle` → typed `guard-refused` carrying BOTH unknown-field violations |
| neg-017 | vocabulary discipline / a whole-request-only code tries to name a still | schema refusal | **FAIL-CLOSED OK** — `refusedStills[].reasonCode: "insufficient-stills"` → enum refusal (the per-still vocabulary is closed and separate from the whole-request vocabulary) |
| neg-018 | vocabulary discipline / open-vocabulary refusal code | guard `vocabulary-violation` | **FAIL-CLOSED OK** — `reasonCode: "vibes-wrong"` on a refusal → "must carry a reasonCode from the closed vocabulary" |

Construction-time invariants (the same laws enforced BEFORE a response can even exist — `src/laws.ts` throws `AnchoringContractInvariantError`): an empty refusalDetail (the refusal must name the offender); a partial double-covering a still; a partial inventing a still id; a partial with no refused still (that is an anchored outcome). Covered by `laws.test.ts` and `response.test.ts`.

## Results — 18/18 FAIL-CLOSED OK

No exceptions.

## Discrimination value (beyond echoing failures)

- neg-001..neg-004 re-prove the spike's four corruption classes AGAINST THE NEW CONTRACT LAYER — the guard lift is real, not a copy-paste of strings: the violations are typed (`code`/`path`/`detail`), not stringly.
- neg-005..neg-010 are NEW discriminators that only exist because the PARTIAL outcome exists: exact per-still accounting (every requested still exactly once across anchored ∪ refused) is a quantitative invariant — a provider cannot silently drop a bad still, double-cover a good one, or invent ids to pad its numbers.
- neg-011 is the supervision teeth: a provider that BLOCKS ITS MAIN THREAD (immune to deferred SIGTERM handling) still cannot outlive its supervision — the kill is kernel-guaranteed (SIGKILL), and the failure is typed, bounded, and still records the input digest.
- neg-012 is the audit's teeth: the runner re-hashes what it actually wrote to stdin and compares against the provider's claim — a provider cannot claim to have consumed bytes it did not.
- neg-017/018 keep the two reason-code vocabularies SEPARATE and CLOSED (whole-request vs per-still) — the typed PARTIAL design's own fence.
