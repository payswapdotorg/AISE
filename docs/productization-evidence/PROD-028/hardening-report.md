# PROD-028 — Hardening Report

**Actionable Evidence-Envelope / reasoning weaknesses the negative
scenarios exposed.** Each finding names the fixture that exposed it, the
concrete weakness, and the recommended successor action. None of these
block PROD-028's acceptance (the harness catches every one of them
deterministically); all of them are real Layer-2 hardening debts for
HFX-201..204.

## F1 — Implicit-assumption leakage in correct answers

**Exposed by:** `vlm-implicit-assumptions` (the claim, facts, evidence
and conclusion are all CORRECT; the assumptions array is empty while the
oracle declares the claim rests on one).

**Weakness:** a provider can produce a fully correct, well-cited answer
whose premises are entirely implicit. The architecture-lock requires
"explicit inferred assumptions"; without an evaluator-side oracle
declaring WHICH assumptions the correct answer rests on, nothing
distinguishes "no assumptions needed" from "assumptions hidden". The
`assumptions-explicit` rule can only fire when the scenario author has
declared the expected assumptions — the check is only as strong as the
fixture.

**Recommended action:** HFX-201's golden corpus should declare the
required-assumption set for every consequential answer (the oracle field
`correctAssumptions` is the seam), and a successor item should require
Layer-2 providers to enumerate premise non-emptiness for inferential
claims (a claim whose fact base does not entail it without a bridge
premise must carry that premise).

## F2 — Fabricated deterministic-check invocations

**Exposed by:** `doc-fabricated-check`, `retrieval-fabricated-check`
(the answers are CORRECT; the envelopes claim checks
`doc-ocr-confidence-check/9` / `retrieval-rerank-check/2` that the
scenario never offered).

**Weakness:** "deterministic checks/tools invoked" is self-reported by
the provider. A provider can claim validation it never ran, laundering
authority it does not have (the exact ACR-006 boundary: deterministic
checks are authorities, agents are proposers). The harness catches the
closed-set violation, but the closed set exists only because the BUNDLE
declares `offeredChecks` — nothing today verifies that an offered check
WAS actually invoked (only that an unoffered one was not claimed).

**Recommended action:** the check-invocation claim should be bound to
the check engine's own receipt (a deterministic check id + the harness's
independent execution), not to the provider's word — the seam is the
bundle's `offeredChecks` plus a per-check receipt contract. Suggested
owner: HFX-204 (its benchmark "must not bypass deterministic
validation").

## F3 — False-absence facts (missed data reported as absence)

**Exposed by:** `doc-missed-field` — the provider states "section 1 does
not state a quantity for the concrete item" while S1 lists 120 m3.

**Weakness:** the closed vocabulary and the grounding oracle catch the
false absence ONLY because the absence claim is phrased as a FACT
(ungrounded string). A provider that phrases the same miss as an UNKNOWN
("the quantity for Concrete C30 is not stated" in `unknowns`) would pass
the current rules — unknowns are gap declarations, not grounded claims,
and the harness does not cross-check them against the cited evidence's
actual content. The house rule "UNKNOWN, NOT_OBSERVED and OCCLUDED are
not absence" is enforced for statuses, not yet for unknowns.

**Recommended action:** add an `unknowns-must-be-gaps` rule — every
declared unknown must name content absent from the CITED evidence's
ground truth (string-level check is enough for doubles; semantic
matching is the HFX-201 problem, see F5). Owner: a PROD-028 successor or
HFX-202 (its "OCR/layout errors are surfaced as uncertainty or
review-required states" acceptance rides exactly this distinction).

## F4 — Two refusal representations, one semantics

**Exposed by:** `vlm-refusal`/`doc-refusal` (failed provider results
carrying `unsupported-data` — the control-plane pattern) versus
`retrieval-empty-out-of-scope` (an OK result whose envelope declares
status `unsupported` + a named gap).

**Weakness:** Layer-2 refusals currently exist in two shapes: the
provider-level failed result and the envelope-level unsupported status.
The harness accepts both as the honest refusal (classification
`unsupported-data`, no violations) — provider-neutral, but ambiguous for
downstream consumers that must decide "is this an envelope or a
transport-level refusal?".

**Recommended action:** pick ONE canonical Layer-2 refusal projection
(the envelope-level `unsupported` status with the gap in `unknowns` —
refusals are data, the reasoning module's first-class-refusal
discipline) and map provider-level failed results onto it explicitly at
the adapter boundary (the harness already maps both; the adapters should
stop emitting the dual shape). Suggested owner: HFX-201's adapter
contract.

## F5 — Exact-string grounding will not survive real paraphrase

**Exposed by:** every hallucination/misread fixture — the doubles emit
ground-truth fact strings VERBATIM, so the grounding oracle
(`facts-grounded-in-cited-evidence`) is exact-match.

**Weakness:** a real Qwen3-VL describing the red toolbox as "a red
metal tool box on a wooden bench" states a TRUE fact that fails the
exact-match oracle (false perception-failure); conversely a hallucinated
"the toolbox contains a torque wrench" fails it correctly. The oracle's
precision on real models depends on fact canonicalization, which does
not exist yet.

**Recommended action:** HFX-201 must either (a) constrain its envelope
emission to canonical fact strings (the fixture discipline — the
envelope contract should declare it), or (b) a governed
fact-canonicalization step must be added between the declared envelope
and the grounding oracle (deterministic, versioned, content-addressed —
never a model's judgment). This is the single biggest gap between the
deterministic fixture world and the real-provider wave.

## F6 — Classification precedence is a policy, and consumers must know it

**Exposed by:** `vlm-wrong-evidence` — the provider's CLAIM is also
wrong (the rope is not red), yet the classification is retrieval-failure
with zero violations, because selection-before-comprehension is the
documented precedence.

**Weakness:** the primary classification is a ROOT-CAUSE ordering, not a
severity ranking. A consumer reading `retrieval-failure` alone will not
know the claim was also wrong; a consumer reading the violation list as
a ranking will be misled (violations are secondary observations with
their own kinds).

**Recommended action:** document the precedence as a contract wherever
the records are consumed (the failureObservations detail strings already
carry the why-not-the-neighbors rationale, and
failure-discrimination.md is the canonical statement); HFX-401's
scorecard should join on the FULL observation set, not the primary kind
alone.

## F7 — The benchmark record's honesty is bounded by the oracle's honesty

**Exposed by:** the suite design itself — `expected_outcome_match` is
always 1 in the committed golden because the golden IS the committed
prediction; the metrics cannot detect a fixture and a double that drift
TOGETHER (both regenerated from the same source).

**Weakness:** the golden leg proves determinism and
regeneration-stability, not fixture-truth. The correctness oracle is
hand-authored per scenario — the actual ground truth — but nothing
cross-checks it against an independent source (the building-benchmark's
"trade practice" sanity table has no Layer-2 analogue yet).

**Recommended action:** HFX-201's golden corpus should carry an
independent provenance for each oracle (the source document/image the
answer key was authored from), making the answer key itself auditable —
the provenance-manifest pattern applied to the fixtures.
