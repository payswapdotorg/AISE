# WORLD-P2 — test transcript (the honest gate record)

**Item:** WORLD-P2 — the Layer-2 experience lane.
**What this record is:** the exact gate sequence run at the delivery
commit, the per-suite counts, the law-by-law drill inventory, and the
fixture seals — so the TL can re-run every claim. Nothing here is
simulated; every count below is a real `bun test` run in this sandbox.

## The gate sequence (in execution order)

| # | Command | Result |
| --- | --- | --- |
| 1 | `bun install` (workspace link after adding the package) | 167 installs checked; `bun.lock` gained the mechanical +12-line registration of `packages/world-layer2-experience` (the P0-A/P0-C precedent) |
| 2 | `bunx playwright install chromium` | closed the pre-existing sandbox chromium-1208 gap (cache-only; no repo file touched) so the repo's own browser-gate tests run |
| 3 | `bun test packages/world-layer2-experience` | **118 pass / 0 fail**, 3594 expect() calls, 7 files, ~0.3 s |
| 4 | `tsc --noEmit -p packages/world-layer2-experience/tsconfig.json` | **0 errors** (strict, noUncheckedIndexedAccess) |
| 5 | `eslint packages/world-layer2-experience` | **0 problems** |
| 6 | `bun run verify` (the full battery: typecheck every workspace tsconfig → eslint . → bun test → boundary scan) | typecheck **PASS** · lint **PASS** · tests **6942/6942 PASS** (baseline 6824 + 118 new; 87688 expect() calls; 453 files; 23.74 s) · boundaries **PASS** (1197 files, no cross-zone violations) → **VERIFY: PASS** |

## Per-suite counts (the 118 new tests)

| Suite | Tests | expect() calls | What it drills |
| --- | ---: | ---: | --- |
| `src/seam.test.ts` | 11 | 74 | the lane identity + eight-stage order; the closed family/actor vocabularies; the digest discipline's VERBATIM agreement with the P0-B seam; the HFX-000 registry used-not-narrowed; declared instants; deepFreeze non-interference; the content-id seal |
| `src/problem/problem.test.ts` | 20 | 598 | the sealed problem shape; the fail-closed binding (unresolved element / wrong revision / invalid scene); the substrate-candidate composition through the P0-B validator; both P0-B IFC doubles semantically identical at composition; INFERRED seeds decode through the shared wire codecs; the label-as-identity refusal; byte-identical context assembly (both doubles); determinism; the observation-evidence law + the smuggled-status refusal; the 500-iteration digest fuzz |
| `src/evidence/evidence.test.ts` | 23 | 1348 | the Evidence Envelope refusals (duplicate identity / link-to-nothing / unresolvable subject / invalidating-air / wrong problem); the fail-closed detection refusals (empty requirement set / unresolved subject / malformed requirement); scenario A NOT_READY with the MISSING steel-section gap; scenario B READY; byte-identical reports (both doubles); the seal-is-the-content-digest determinism; invalidated-evidence discounting (the record STAYS); the epistemic floor unsatisfied by INFERRED substrate candidates; sigma-not-reported / sigma-above-bound / unit-mismatch disciplines; the worst-of law; the monotonicity + order-independence fuzz (300+200 iterations) |
| `src/reasoning/reasoning.test.ts` | 21 | 136 | the pinned-scope refusal (UNGROUNDED_QUESTION); the NOT_READY → INSUFFICIENT_EVIDENCE flagship refusal with the blocking gap ids named and provenance carried; the CONTRACT_VIOLATION request refusal; INFERRED/advisory claim laws through both LLM doubles; byte-identical claims with provider identity differing by design; determinism; citation resolution + the unresolvable-citation catch; the rogue-provider drills (OBSERVED-claim rejection, authority-claim rejection); the prompt digest determinism; the gate: fixture classification, the 20-entry inventory, the fabricated-authority / LLM-sourced / mislabel / unresolvable-provenance / empty-check-set refusals, the engine FAIL worst-of roll-up, the advisory-never-bears-verdict law |
| `src/action/action.test.ts` | 22 | 1157 | the ownership law (missing ownership refused); byte-identical actions (both recorders); the ungated-proposal / non-passing-gate / unresolvable-gate-citation refusals; the rejected-review resolution refusal + the approved path; the unevidenced-observation refusal; the request-evidence dispatch; the closed transition table + the terminal state + the 4×4 matrix fuzz; the ledger: chained content-derived events, byte-identical trails (both ledgers), the missing-WHY refusal, the wrong-problem refusal, the tamper drill, the 200-iteration append/tamper fuzz, the bad-append refusal |
| `src/lane.test.ts` | 14 | 214 | scenario A through both kits (NOT_READY → INSUFFICIENT_EVIDENCE refusal → the request-evidence action citing the MISSING gap's task → the audited refusal event; every event carries who/what/when/why); scenario B through both kits (READY → 3 claims → gate pass → the 4 governed actions with the gate citation resolved → the full audited stage set, 4 action events, the engineering-authority reason, the 8 stage summaries); byte-identical re-runs (both kits, both scenarios, canonical-JSON equality incl. run ids); the full-kit swap semantic equality; the single-seam swaps (context/detector/reasoner/recorder/ledger each swapped alone); the P0-B alternate-IFC composition run (semantically identical, provider identity differs); the P0-A scene fixture validity |
| `src/profiles.test.ts` | 7 | 67 | all 10 profiles validate through the registry's own validator (15/15 mandatory fields); the content-derived stable digests; the unique provider ids; the 4 capabilities covering the 5 ports; the honestly-EMPTY benchmark tables; the LLM-lane BLOCKED declaration + the refusal-first failure mode; the confidence/uncertainty separation |

## The fail-closed drills exercised (the negative inventory)

1. Problem binding: unresolved scene element · wrong scene revision ·
   structurally invalid scene (duplicate element id).
2. Substrate candidates: INFERRED-violating seeds refused · label-as-
   identity (IFC GUID in an id field) refused.
3. Observations: empty evidence ids refused · smuggled non-OBSERVED
   status refused by the context validator.
4. Evidence envelope: duplicate content id · provenance link citing
   unregistered evidence · link citing an unresolvable subject ·
   invalidating evidence not in the envelope · envelope for another
   problem.
5. Detection: empty requirement set (never vacuously READY) ·
   unresolvable requirement subject · out-of-range requiredCount.
6. Bounded reasoning: scope mismatch (UNGROUNDED_QUESTION) · NOT_READY →
   INSUFFICIENT_EVIDENCE (both doubles, gap ids named) ·
   contract-violating request · rogue provider claiming OBSERVED · rogue
   provider claiming authority (advisoryOnly false) · unresolvable
   citations.
7. The deterministic-check gate: fabricated-authority id · inventory id
   claiming engine ownership from an LLM source · engine-produced check
   mislabeled advisory · advisory check citing an unsupplied reasoning
   result · empty check set · engine FAIL rolls the verdict.
8. Actions: missing ownership · ungated consequential proposal ·
   non-passing gate · unresolvable gate citation · rejected-review
   resolution · unevidenced observation · every illegal lifecycle edge
   (4×4 matrix).
9. The audit ledger: missing WHY · wrong problem · mutated past event
   (typed `event-id-not-content-derived`) · randomized single-field
   tampering always caught (200 iterations).

## The fuzz/property batteries

- **Digest-shape fuzz** (500 iterations): randomized 63/65-hex ids never
  pass the canonical-digest gate.
- **Evidence monotonicity** (300 iterations): growing valid linked
  evidence never decreases the readiness verdict rank
  (INSUFFICIENT_DATA < NOT_READY < READY_WITH_NOTES < READY).
- **Order independence** (200 iterations): the same evidence set under
  shuffled link order yields the byte-identical report id — through BOTH
  detector doubles.
- **Audit append/tamper fuzz** (200 iterations): randomized valid appends
  (1–6 events, both ledgers) always replay clean; a randomized
  single-field tamper of one event always fails replay.
- **Lifecycle matrix fuzz**: the complete 4×4 from→to transition matrix
  checked against the closed table (16 cells, 5 legal).

## The committed fixture seals (reproducible semantics)

- The fixture problem id: `005c63c1a4199a515e82b9846ab9a1c9b131f4f5bec0d6ef8a1b90a13e7fe97d`
- Scenario B context id: `03b2fcfd0d2680537ea3dca12c9862c8a9616743cf508446f4b00dcdd2ddaf88`
- Scenario B missing-evidence report id: `cafcc9efea852b636a2317511f51d0e4dbf29d3f59b6af26d6654d852369a5c4`
- Scenario A full-lane run id: `ecd8e0c74eda624120b74fa2409087202a87ec53fb74576f1151436606168927`
- Scenario B full-lane run id: `71e25d9315edc7e648691b30274101ae2345b9063b046b922e4043587fd4c853`

(Scenario A: 7 audit events, 1 action, verdict NOT_READY, reasoning
refused INSUFFICIENT_EVIDENCE. Scenario B: 11 audit events, 4 actions,
verdict READY, 3 INFERRED claims, gate `pass` with 2 engine-owned + 1
advisory check.)

## Honest notes on the transcript

- During development, before the gates, 12 then 8 then 4 then 3 then 0
  test failures were debugged to zero — the intermediate failures were
  fixture/test construction defects (an entry-point type check mismatch
  with the shared-contracts `Observation` wire shape, the P0-B
  provider-identity discipline initially asserted too strongly, a
  requirement subject pointing at the project node instead of the wall
  candidate), each fixed at the ROOT cause with the laws unchanged. The
  final gate sequence above ran clean end-to-end.
- The three repo browser-gate tests failed on the FIRST verify run
  because the sandbox lacked the Playwright chromium-1208 build — a
  PRE-EXISTING environmental gap (the same gap the WORLD-P0-A lane
  recorded), closed by the cache-only install before the recorded re-run;
  the passing battery is the honest gate result, and no repo file was
  modified to obtain it.
