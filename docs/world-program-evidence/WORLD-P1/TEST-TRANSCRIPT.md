# WORLD-P1 — Test Transcript

**Item:** WORLD-P1 (Layer 1 experience lane) — branch `work/WORLD-P1` from base `82f31d6`
**Sandbox:** AISE station (bun 1.3.14, Linux x64; Playwright Chromium installed for the pre-existing browser-journey tests)
**Runs recorded:** 2026-10-04 (the commands below were executed in this sandbox at the delivered tree; re-runnable)

## 1. The full verify battery (the TL's gate)

```text
$ bun run verify
==> typecheck
    (tsc --noEmit over every workspace incl. packages/world-layer1-experience — PASS)
==> lint
    (eslint . — PASS)
==> test
    (bun test — 6962 pass / 0 fail — see §3)
==> boundaries
  scanned 1196 source files across apps/, backend/, packages/, tools/
  no cross-zone import violations
VERIFY: PASS
```

Baseline preservation: the recorded gate baseline at the pinned base is 6824/6824 (P0-C state). This branch: 6824 baseline + **138 new tests** = **6962/6962 PASS** — zero regressions.

Sandbox honesty note: before installing Playwright Chromium, this sandbox ran the battery at 6820 tests / 6817 pass / 3 fail AT THE PINNED BASE `82f31d6` (a worktree run — identical failures with and without this branch: the PROD-030/031/qa002 browser-journey tests require the Chromium binary). Installing Chromium (`bunx playwright install chromium`) resolved all three; the verify gate then reports 6962/6962. No test outcome differs between base and branch.

## 2. The new package's tests in isolation

```text
$ bun test packages/world-layer1-experience/
  138 pass
  0 fail
  783 expect() calls
Ran 138 tests across 6 files. [107.00ms]
```

## 3. The 138 new tests (every name, deterministic)

```text
law 1 — substitution is not semantics change (byte-identity) > capture family: spatialize + register identical on both doubles
law 1 — substitution is not semantics change (byte-identity) > world family: compose identical on both doubles (the world id pins it)
law 1 — substitution is not semantics change (byte-identity) > world family: layer toggles identical on all 16 toggle combinations
law 1 — substitution is not semantics change (byte-identity) > world family: bookmark capture + resolve identical (the digest round-trip)
law 1 — substitution is not semantics change (byte-identity) > compare family: the comparison report identical on both doubles (exact kernels)
law 1 — substitution is not semantics change (byte-identity) > compare family: the measurement set identical on both doubles (every query kind)
law 1 — substitution is not semantics change (byte-identity) > compare family: the near-boundary containment identical on the wide-tolerance drill
law 1 — substitution is not semantics change (byte-identity) > evidence family: what-is-here identical on every fixture answer kind
law 1 — substitution is not semantics change (byte-identity) > evidence family: the bindings identical on both doubles
law 2 — tolerances are declared, never implicit > a tolerance-less comparison refuses IDENTICALLY on both doubles
law 2 — tolerances are declared, never implicit > a tolerance-less measurement refuses IDENTICALLY on both doubles
law 2 — tolerances are declared, never implicit > the declared tolerance rides VERBATIM into both doubles' outputs
law 3 — unsupported is recorded, never computed > the voice-note omission is IDENTICAL evidence on both doubles (visible, typed)
law 3 — unsupported is recorded, never computed > a foreign-hypothesis registration answers PARTIAL identically on both doubles
law 3 — unsupported is recorded, never computed > an unregistered-fragment composition refuses IDENTICALLY on both doubles
law 3 — unsupported is recorded, never computed > an unknown-layer toggle refuses IDENTICALLY on both doubles
law 3 — unsupported is recorded, never computed > a stale what-is-here query refuses IDENTICALLY on both doubles
law 3 — unsupported is recorded, never computed > no double ever emits perception/reasoning/resource/timeout/license kinds (honesty of the vocabulary mapping)
the identity + ghost laws carry through every stage > no canonical id in the lane outputs matches a substrate id pattern
the identity + ghost laws carry through every stage > the IFC GUID lives ONLY in the external-label array (never in any identity field)
the identity + ghost laws carry through every stage > ghost distinctness: no capture/plan node in any lane output is a ghost
the identity + ghost laws carry through every stage > a bookmark selecting a substrate-shaped id refuses (quarantine at the bookmark gate)
determinism — byte-identical repeated invocation > spatialize: 5 runs → one canonical output
determinism — byte-identical repeated invocation > register: 5 runs → one canonical output
determinism — byte-identical repeated invocation > compose: 5 runs → one world id
determinism — byte-identical repeated invocation > navigate: toggles + bookmark round-trips are stable
determinism — byte-identical repeated invocation > compare + measure: 5 runs → one canonical output each
determinism — byte-identical repeated invocation > evidence queries + bindings: 5 runs → one canonical output each
determinism — the source-level tripwire > the contract core contains NO clock, randomness, network or timer calls
determinism — the source-level tripwire > the only node imports are the deterministic ones (crypto/fs-free core)
determinism — the instant discipline > every instant in the lane outputs is one of the declared fixture instants
evidence — the envelope bindings > the fragment binding: one DERIVED_FROM link per session asset, wire-codec valid
evidence — the envelope bindings > the world binding: per-element links over the evidence-backed elements
evidence — the envelope bindings > the comparison binding: the union of the paired elements' evidence chains
evidence — the envelope bindings > the measurement binding: INFERRED candidates with the declared instant
evidence — what is actually here? > element-bound: the point inside a declared capture volume names the element + chains
evidence — what is actually here? > coverage-only: inside the coverage union, outside every element volume — honest
evidence — what is actually here? > not-covered NEVER implies absence (the ANCHOR doctrine, machine-readable)
evidence — what is actually here? > a stale query (wrong world revision) refuses — never silently applied
evidence — what is actually here? > a non-finite point refuses
evidence — what is actually here? > a world with NO coverage answers unverifiable (never a fabricated absence)
evidence — what is actually here? > a plan element's volume is NOT a capture claim: provenance stays capture-only
evidence — what changed? > rev 1 → rev 2: the moved wall, the added column, the unchanged rest
evidence — what changed? > every change record carries both sides' evidence chains (never a bare diff)
evidence — what changed? > an evidence-chain change classifies evidence-changed (distinct from moved)
evidence — what changed? > cross-world comparison refuses (a fabricated diff is never produced)
evidence — what changed? > a backwards revision direction refuses
evidence — binding fail-closed drills > binding a fragment with no evidence refuses (an empty chain is a fabricated chain)
evidence — binding fail-closed drills > binding a world with no evidence-backed elements refuses (retrieval-failure)
evidence — binding fail-closed drills > binding measurements without a declared instant refuses (no clock reads)
evidence — binding fail-closed drills > binding measurements with no evidence content ids refuses
evidence — binding fail-closed drills > binding a comparison whose elements lack provenance refuses (never a fabricated chain)
reconstruct — the committed fixture > the world composes: 3 capture + 2 plan + 1 coverage node, structurally valid
reconstruct — the committed fixture > the scene IS the P0-A ComposedScene shape (substrate-neutral composition types)
reconstruct — the committed fixture > capture element ids are AISE content digests, NEVER asset content ids (identity separation)
reconstruct — the committed fixture > IFC GUIDs ride as namespaced external labels, never as identity
reconstruct — the committed fixture > the coverage node carries the union bounds and the derived provenance
reconstruct — the committed fixture > the world derivation binds the method identity and every input evidence id
reconstruct — the committed fixture > determinism: recomposing the same request yields the byte-identical world id
reconstruct — fail-closed drills > an UNREGISTERED fragment refuses (never a silently-unanchored world)
reconstruct — fail-closed drills > a REFUSED-registration fragment refuses too (the state machine is honest)
reconstruct — fail-closed drills > a fragment with a DIFFERENT site frame refuses (one frame per world)
reconstruct — fail-closed drills > a substrate-shaped plan element id refuses (identity quarantine, directive §10)
reconstruct — fail-closed drills > a usd-prim-path-shaped plan element id refuses
reconstruct — fail-closed drills > duplicate plan element ids refuse
reconstruct — fail-closed drills > an empty composition refuses (no fragments, no plan — no empty world)
reconstruct — fail-closed drills > a non-positive world revision refuses
reconstruct — fail-closed drills > every composed node is isGhost: false (the ghost-distinctness law, structural)
navigate — layer toggling > default visibility: every layer's visibleByDefault, AND semantics per node
navigate — layer toggling > hiding plan-model hides plan nodes and leaves capture nodes visible
navigate — layer toggling > toggling works for the coverage layer too (annotation node)
navigate — layer toggling > an UNKNOWN layer id in a toggle refuses (fail-closed, P0-A mirror)
navigate — layer toggling > later toggles win (deterministic last-wins semantics)
navigate — layer toggling > the predicate is idempotent: applying the same toggles twice yields the identical view state
navigate — layer toggling > the standalone resolvers are exported pure (layer + element resolution)
navigate — bookmarks > a bookmark captures the typed world state (content-addressed identity)
navigate — bookmarks > resolveBookmark round-trips the view state (byte-identical resolution)
navigate — bookmarks > a STALE bookmark (different world revision) refuses — never silently applied
navigate — bookmarks > a bookmark selecting an UNKNOWN element refuses
navigate — bookmarks > a non-unit section-plane normal refuses
navigate — bookmarks > a lawful section plane passes and rides in the bookmark
navigate — bookmarks > a view state from a DIFFERENT world refuses at capture (the binding gate)
world family — properties > toggle-set closure: every toggle combination resolves to a total visibility map
world family — properties > world composition over generated fragments stays structurally valid (property)
world family — properties > unplaced assets never become scene nodes (spatial honesty at composition)
capture family — vocabularies > the lane statement names the eight stages and the world-not-records law
capture family — vocabularies > the registration-state vocabulary is closed and extends the anchoring outcomes with the pre-state
capture family — vocabularies > the spatializable media-type vocabulary is closed
spatialize — the committed fixture > the fixture session spatializes: 3 spatializable assets, 1 visible omission
spatialize — the committed fixture > the fragment id is the canonical content digest (deterministic identity)
spatialize — the committed fixture > declared poses are carried verbatim; coverage unions the declared volumes exactly
spatialize — the committed fixture > the derivation binds the evidence chain and the declared instant
spatialize — the committed fixture > the evidence chain carries EVERY session asset (omitted included — evidence, not spatial input)
spatialize — honest absent declarations > an asset without pose keys is carried UNPLACED (never guessed)
spatialize — honest absent declarations > an asset without volume keys contributes NO coverage (a limitation, not a fabricated bound)
spatialize — honest absent declarations > unparseable pose metadata omits the asset with the typed reason (garbage is not trusted)
spatialize — honest absent declarations > an inverted declared volume is malformed (min > max refuses the volume)
spatialize — fail-closed drills > a non-ISO declared instant refuses (contract-mismatch)
spatialize — fail-closed drills > an asset with a non-64-hex content id refuses (the Evidence identity shape)
spatialize — fail-closed drills > a duplicate asset content id refuses (idempotent identity discipline)
spatialize — fail-closed drills > an empty capture session refuses (an empty fragment would fabricate a world)
spatialize — fail-closed drills > a substrate-shaped session id refuses (identity quarantine at the seam)
register — the committed fixture > two admissible hypotheses anchor the fragment (outcome vocabulary verbatim)
register — the committed fixture > the established georeference preserves the ADMITTED hypotheses verbatim (P0-A law)
register — the committed fixture > re-registering a registered fragment refuses (the stage machine)
register — fail-closed + partial drills > insufficient hypotheses REFUSE the whole registration (zero fabricated georeferences)
register — fail-closed + partial drills > zero hypotheses refuse (fail-closed, not an empty success)
register — fail-closed + partial drills > a hypothesis naming FOREIGN evidence is an echo failure → PARTIAL (typed, honest)
register — fail-closed + partial drills > a zero-inlier hypothesis carries no admissible signal (per-hypothesis refusal)
register — fail-closed + partial drills > an uncertainty-budget-violating hypothesis is refused per-hypothesis
register — fail-closed + partial drills > a non-positive declared accuracy refuses (contract-mismatch)
spatialize — properties over generated sessions > determinism: the same generated session digests identically across 5 invocations
spatialize — properties over generated sessions > coverage union is exact for integer declared volumes (property over 8 generated sessions)
spatialize — properties over generated sessions > omissions are ALWAYS visible: a mixed session reports every non-spatial asset
compare — the committed fixture > the fixture comparison: one deviation-detected (5 m), one within-tolerance (0 m)
compare — the committed fixture > the unpaired classifications: missing-in-capture from the model side
compare — the committed fixture > the declared tolerance is carried VERBATIM into every verdict (law 2)
compare — the committed fixture > the near-boundary flag: a deviation within the DECLARED band of the boundary
compare — the committed fixture > a comparison WITHOUT a declared near-boundary band refuses (the band is a declaration)
compare — the committed fixture > determinism: the same request yields the byte-identical report id
compare — fail-closed drills > a comparison WITHOUT a declared tolerance refuses (tolerance-must-be-declared)
compare — fail-closed drills > a comparison with an EMPTY units declaration refuses
compare — fail-closed drills > a malformed shape (2-vertex polygon) refuses
compare — fail-closed drills > a model element paired twice refuses (ambiguous pairing)
compare — fail-closed drills > a non-finite shape coordinate refuses
measure — the committed fixture > the five query kinds compute EXACT values on the integer fixture geometry
measure — the committed fixture > every measurement is an INFERRED candidate bound to the measured elements' evidence
measure — the committed fixture > the near-boundary containment verdict: within-tolerance instead of a silent boolean
measure — the committed fixture > an OUTSIDE point answers false (or within-tolerance near the edge) — never fabricated
measure — fail-closed drills > a measurement WITHOUT a declared tolerance refuses (the P0-B law, delegated)
measure — fail-closed drills > a measurement referencing an UNKNOWN element refuses
measure — fail-closed drills > duplicate query ids refuse (idempotent query identity)
measure — fail-closed drills > an area query without a polygon shape refuses
measure — fail-closed drills > a volume query with an inverted box refuses (malformed geometry never computes)
compare family — vocabularies + kernels > the difference-classification vocabulary is closed
compare family — vocabularies + kernels > the measurement query-kind vocabulary is closed (point/line/area/volume/containment)
compare family — vocabularies + kernels > the centroid proxy kernel is exact for every shape kind (integer fixtures)
compare family — vocabularies + kernels > the standalone kernels are exact on the P0-B-style integer corpus
```

## 4. The test files and what each proves

| file | tests | proves |
|---|---|---|
| `src/capture/capture.test.ts` | 29 | the CAPTURE→SPATIALIZE→REGISTER contract: vocabularies, the committed fixture (3 spatializable + 1 visible omission, exact coverage union), honest absent declarations (unplaced/no-volume/garbage metadata), the fail-closed drills (bad instant, bad content id, duplicates, empty session, substrate-shaped session ids), the registration verdicts (anchored/partial/refused, echo law, per-hypothesis quality), determinism + coverage properties over generated sessions |
| `src/world/world.test.ts` | 33 | the RECONSTRUCT→NAVIGATE contract: the composed world (6 nodes, P0-A validateScene-clean, identity separation, IFC GUIDs as labels only, coverage node), the fail-closed drills (unregistered/refused fragments, cross-frame, substrate-shaped plan ids, duplicates, empty composition, bad revision), the ghost law (every node isGhost:false), layer toggling (defaults, hiding, unknown layer, last-wins, idempotence, all 16 combinations), bookmarks (capture/resolve round-trips, stale refusal, unknown selection, unit-normal section, cross-world view), the unplaced-assets spatial-honesty property |
| `src/compare/compare.test.ts` | 24 | the COMPARE+MEASURE contract: the fixture comparison (exact 5 m deviation-detected, 0 m within-tolerance, verbatim tolerance), the declared near-boundary band (incl. its refusal without declaration), the fail-closed drills (tolerance-less, unitless, malformed shapes, double pairing, non-finite), the exact measurement values (10 m, 16 m², 60 m³, containment true/within-tolerance), the INFERRED evidence bindings, the vocabulary/kernel checks |
| `src/evidence/evidence.test.ts` | 21 | the EVIDENCE contract: the four binders with EVERY link/derivation decoded through the shared wire codecs (the seam types are real), what-is-here on all four honest answer kinds (element-bound with chains, coverage-only, not-covered never implying absence, unverifiable), what-changed (moved/added/unchanged, evidence-changed distinct, cross-world/backwards refusals), the binding fail-closed drills (empty chains, no provenance, no declared instant) |
| `src/substitution.test.ts` | 22 | the three substitution LAWS at the lane level: byte-identity of reference vs alternate doubles on every family (spatialize/register/compose/toggles/bookmarks/compare/measure/what-is-here/bindings), tolerance-less refusals identical on both doubles, verbatim tolerance carriage, the unsupported/omission discipline identical, the identity + ghost laws across the whole lane (incl. the IFC GUID appearing exactly once — as a label) |
| `src/determinism.test.ts` | 9 | behavioral determinism (byte-identical repeated invocation of every stage), the source-level tripwire (no Date.now/new Date/Math.random/performance.now/setTimeout/fetch/WebSocket/node:http in the contract core; only node:crypto imported), the instant discipline (every output instant is a declared input) |

## 5. The gates summary

| gate | result |
|---|---|
| typecheck (strict, every workspace) | PASS |
| lint (eslint .) | PASS |
| boundaries (1196 files scanned) | PASS — no cross-zone violations |
| tests | 6962/6962 (6824 baseline + 138 new) |
| determinism | proven (behavioral + source-level) |
| substitution law | proven (byte-identity on the committed fixtures) |
