# PROD-026 — Agent-path vs direct-path equivalence proof

**Work item:** PROD-026 · **Harness:** the equivalence describe-blocks of
`apps/web/src/app/solution-composition-model.test.tsx` +
`apps/web/src/app/solution-benchmark.test.ts` (the benchmark scenario runs
the same proof at its own scale).

## The claim

The same journey, authored ENTIRELY through agent commands and ENTIRELY
through direct manipulation, produces **identical operation identities**
(the contract's sha-256 semantic identity, which EXCLUDES provenance by
design) and **identical outcomes** (states, digests, validation check
results, BOQ line values and line identities).

## How both paths run

The generic journey runner (`apps/web/src/app/solution-journey.ts`,
`runComposedJourney`) drives the PROD-024 workspace's public controllers:

- **the direct path** — every operation authored through
  `buildDirectManipulationIntent` (the contract's ONE constructor surface,
  origin `direct-manipulation`) → `submitIntent` (the ONE submission path)
  → the real engine;
- **the agent path** — every operation authored through natural-language
  commands routed via the workspace's agent-turn controller
  (`agentSessionContextOf` + the port's `decideTurn` +
  `applyAgentDecision`), with the clarification dance for underspecified
  commands (ask → answer → merged recompile → proposal preview → confirm)
  and the confirmed proposal dispatched through THE SAME `submitIntent`.

**The compiler boundary, honestly stated.** The PROD-023 compiler
(`backend/api/src/reasoning/solution/`) lives in the backend zone and
CANNOT be imported from apps (the frozen AISE-001 boundary matrix — the
same discipline PROD-024's own conformance evidence records for this
exact seam). The agent turns therefore run against the workspace's
scripted agent port whose scripted intents carry the PROD-023 command
corpus's pinned semantics — the exact utterances and parameters the
compiler's committed corpus tests prove the compiler produces
(`corpus.test.ts`: REP-DEMO-002-style demolition command → demolition
{5, 2.4, 0.1} @ wall-faces; REP-BLOCK-001 "Lay blocks to a height of 1 m
along this wall." → block-wall {5, 1, 0.1, concrete-block} @ wall;
REP-PLASTER-001 "Apply 30 mm plaster to the affected wall faces." →
plaster {30 mm, cement-plaster} @ wall-faces). The NL→intent leg is thus
proven by the compiler's own committed corpus; the intent→operation→state
→BOQ legs — the equivalence compared here — are executed LIVE through the
real engine and the real derivation.

## The twelve-step journey's shared operation identities

The direct-variant and the agent-variant of the SEEDED twelve-step journey
produce EXACTLY these operation ids (listed once — they are shared; the
mixed recorded session uses the same first three):

| version | step | operation type | operation identity (sha-256, provenance excluded) |
|---|---|---|---|
| 1 | 4 | demolition-removal | `78be478643fcbb4aad1ba5e9165ab3382199c9165770f50b83a58c431096f2f9` |
| 1 | 5 | block-wall-placement | `281417008f64faec1343a222213785066c6d480c1ef07b67120d73bd89d903ea` |
| 1 | 6 | plaster-application | `84edfbc5221e39787e698800e9847b3fc87c2b83fd1e67d7e4d162265e25045e` |
| 2 (rebuilt) | 12 | block-wall-placement | `7d23d91c555872dea4f54961dd4b4af92d21060d3c1f2bf97d0e57d01567510f` |
| 2 (rebuilt) | 12 | plaster-application | `8d69d2f8f6cdb9863e0f1edfafb613bef15e310393b12f56f4985a70c834a808` |

The first three are the COMMITTED contract-corpus identities (the same
ids the PROD-024 recording and the PROD-025 golden BOQ pin); the two v2
identities are the revision's rebuilt operations (the new version context
re-addresses them — provenance preserved verbatim).

## What is identical and what honestly differs

| property | direct variant | agent variant | verdict |
|---|---|---|---|
| v1 + v2 operation identities (5) | as listed above | as listed above | **IDENTICAL** (asserted) |
| v1/v2 state ids + content digests | `ce0f5133…/cb7cc34a…/a4951ff2…/607856bb…` + `a726d5c5…/9d0bc694…/2f3fde20…` | the same | **IDENTICAL** |
| validation check results | pass, the same 7 checks, engine aise-solution-engine 1.0.0 | the same | **IDENTICAL** |
| BOQ line values + LINE identities | 7 lines / 5 revised, the values of end-to-end-journey.md | the same | **IDENTICAL** (line ids are provenance-excluded content addresses) |
| validation SNAPSHOT id | `4aefb250…` | a different id | honestly DIFFERS — a snapshot certifies the version's exact bytes, and the bytes carry provenance; each variant's certification is its own |
| BOQ DOCUMENT id (boqId) | `38e542e9…` | a different id | honestly DIFFERS — version-pinned through the snapshot (same reason) |
| journey record digest | `358366b4…` | `8e1ad6a5…` | honestly DIFFERS — the record includes the origin provenance echo |

The equivalence claim is exactly the contract's: **attribution is not
semantics** — the operation identity (and every downstream state, quantity
and line value) is invariant under the authoring mode.

## The benchmark's equivalence (the same proof at real-world scale)

The physically grounded masonry-retrofit scenario runs the same two
variants over its FIVE operations + the revision's four rebuilt
operations — **9 identities, identical across paths** (committed in
`tools/building-benchmark/fixtures/expected-outcomes.json`'s
`equivalence` block and re-proven live by
`apps/web/src/app/solution-benchmark.test.ts`):

```
83ef53b5b84bf852e3cc2a04ba69d022deed7d8d5f79cda68347290396cdcb68  opening-creation (v1)
f88f3cad710c764879cebc2d0ee1f057c4f6245fa558a2cf211be9e137a4836c  demolition-removal (v1)
6bf2b214ac8da1fe7634114e81c445636a7b82bb911e109586d44a6a7b39d5d3  block-wall-placement (v1)
a533700ca29c07681265e1c1874903f5ddd9845e7c269a947cfc66bc0f750810  plaster-application (v1)
0fa929401baf36d6a64e368d66b8a295f3ea9e7f476b102214ba722c4c47b90e  finish-application (v1)
2d234af2019eea611232973983b6cb7b9d8b729f3246bc12928f175886054e45  demolition-removal (v2 rebuilt)
46e10c11892f4fb2c0f608f6b1bf209678f39ccc719212b4e61e8020831b7299  block-wall-placement (v2 rebuilt)
06ad33c0bedddf5e9e6e8bf854a996f3ed6eb0ee1277e7874a722e18c8ca1e72  plaster-application (v2 rebuilt)
65ca6c01cca9423a720d8303ac34a9468ed8d8366507abbc2d7a6c1aefaf8bad  finish-application (v2 rebuilt)
```
