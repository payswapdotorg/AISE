# PROD-029 — Layer-3 hardening report (actionable weaknesses the divergent scenarios exposed)

Building the substitution matrix and its four divergent fixtures exposed
real Layer-3 weaknesses and design constraints. Each finding below is
actionable, states its owner, and records what PROD-029 already did about
it.

## Finding 1 — provider-specific types can hide inside canonical-JSON string fields

**Exposure:** the control plane's declared output contracts validate FIELD
TYPES (`string`, `number`, …) — a provider payload that smuggles a
provider-specific structure INSIDE a contract-valid string field
(`intentSemanticsJson` carrying `vendorOperationRef`) passes
normalization untouched. The field-type gate is blind to string CONTENT.

**Risk:** without a second guard, provider-specific identifiers would
reach canonical comparison points inside opaque strings — the D26 gate
would hold lexically and fail semantically.

**What PROD-029 did:** the harness's STRICT CANONICAL PROJECTIONS
(`model.ts`): every JSON-in-string provider field is parsed and validated
against a closed canonical shape — unknown fields are refused with the
field named and recorded as `contract-mismatch` (the committed
smuggled-field negative proves the catch).

**Actionable (HFX-3xx, SHARED):** every future seam that accepts
structured provider output through a string field MUST declare its strict
projection alongside the contract. Never accept an unprojected
canonical-JSON string from a provider.

## Finding 2 — an explicit provider failure is currently flattened into a shape divergence

**Exposure:** a declared execution that normalizes to an explicit
`ProviderResult` with `status: "failed"` (a provider refusing with the
closed vocabulary, e.g. `unsupported-data`) has NO outputs — the
per-seam comparison then projects the missing fields and records
`contract-mismatch`. The provider's own honest refusal kind is carried in
the result (and its digest in the manifest) but not surfaced as the
divergence's failure kind.

**Risk:** an HFX-303 visual provider evaluated at a canonical seam should
honestly answer `unsupported-data` ("this seam is not mine") — flattening
that to `contract-mismatch` misclassifies honest refusal as shape
violation.

**What PROD-029 did:** documented the behavior; the committed matrix
carries no explicit-failure executions (out of the packet's scope — the
four divergent fixtures are semantic divergences).

**Actionable (HFX-3xx):** when adding explicit-refusal scenarios, extend
the harness to record the provider's declared failure observation
verbatim as the divergence kind (the observation is already in the
normalized result — a small, governed change in `harness.ts`).

## Finding 3 — the substitute's state chain is not internally verifiable from declared outputs

**Exposure:** the engine seam compares each step's declared state digest
INDEPENDENTLY. A real engine's state digests form a CHAIN (the parent
digest feeds every successor), but the declared outputs do not echo the
parent link — so a substitute could declare a divergent step-1 digest and
byte-equal later digests (internally impossible for a real chained
engine) and the harness would record only the step-1 divergence.

**Risk:** partial-equality claims that no real chained engine could
produce.

**What PROD-029 did:** the divergent engine fixture deviates at the LAST
step (internally consistent: no successor contradicts it); the input
contract carries `parentStateContentDigest` (the chain input the harness
computed from the live replay).

**Actionable (HFX-302):** require the substitute to ECHO the parent state
digest it applied from in its outputs (one field on the engine output
contract), and compare it against the live chain — chain continuity
becomes verifiable from declared data.

## Finding 4 — the compiler seam's input contract is utterance-minimal; real providers need the session facts

**Exposure:** the canonical compiler seeds focus-known parameters (the
wall's length/thickness) from the session context; the seam's declared
INPUT contract carries only `{ utteranceId, utterance }`. The faithful
fixture replays the canonical semantics as data, so the matrix is
unaffected — but a REAL HFX-301 provider cannot reproduce the canonical
parameters without the session's seedable facts.

**Risk:** an HFX-301 bake-off would show systematic parameter divergence
caused by the HARNESS's input contract, not by the provider — a false
`operation-semantic-failure` family.

**What PROD-029 did:** documented; the input contract is profile-DECLARED
(it can evolve per provider version without harness changes).

**Actionable (HFX-301):** extend the substitute's declared input contract
with the session's seedable facts (the focus-known parameter rows) — the
input payload is harness-built, so this is a seam-input extension in the
profile + harness input builder, governed with HFX-301.

## Finding 5 — the comparison-point taxonomy maps quantity divergence onto `operation-semantic-failure` by interpretation

**Exposure:** the closed failure vocabulary has no quantity-specific
kind. BOQ/engine quantity deviations record as `operation-semantic-
failure` (the "wrong units/amounts" family); verdict deviations as
`reasoning-failure`. The mapping is PROVABLE but interpretive — a
taxonomy reviewer could argue a BOQ derivation error is a
`reasoning-failure` ("incorrect derivation over correctly perceived
inputs").

**Risk:** kind drift across future seams (two seams recording the same
defect class with different kinds) would corrupt the HFX-401 scorecard's
failure counts.

**What PROD-029 did:** the mapping is FROZEN REFERENCE DATA
(`DIVERGENCE_KIND_BY_POINT` in `model.ts`, restated independently in the
tools runner) and documented in `divergence-analysis.md` — one table, one
meaning, checked by tests on both sides.

**Actionable (governance):** if the vocabulary ever grows a
quantity-specific kind, the frozen table changes through a governed work
item — never a local edit.

## Finding 6 — re-evaluation requires a log that ends in the provider's evaluation state

**Exposure:** the harness appends `execution-normalized` events, which
the registry's transition table allows ONLY from the `evaluation` state.
A caller re-evaluating a provider over a log that already carries its
`benchmark-recorded` event (state `benchmarked`) answers
`registry-event-refused`.

**Risk:** none to honesty — the registry state machine is the authority —
but consumers will hit it on retry loops.

**What PROD-029 did:** the refusal is typed and machine-readable; the
canonical log (register + evaluation-started × 8) is the committed
evaluation-time log.

**Actionable (HFX-3xx):** evaluate each provider+version over a log whose
last event for that provider is its `evaluation-started` (a fresh log per
bake-off wave is the natural pattern).

## Finding 7 — the baseline worlds are inlined committed data with drift gates (the single-source trade)

**Exposure:** the wall-upgrade world and the compiler corpus slice are
inlined in `backend/api/src/solution-eval/fixtures.ts` (the service must
stay filesystem-free), while the matrix is also committed as
`tools/solution-eval/scenario.json`. Two committed copies exist.

**Risk:** silent divergence between the copies.

**What PROD-029 did:** both copies are pinned by drift gates — the
fixtures tests assert the inline goldens equal the packages' committed
fixtures AND the live canonical outputs; the golden tests assert the
committed tools artifacts equal the live serialization byte-for-byte.
Drift fails the root verify gate (the building-benchmark house answer to
the same trade).

**Actionable (none required):** the gates are the mitigation; a
single-source refactor would need backend→tools runtime reads (a boundary
smell) — rejected deliberately.

## Finding 8 — the validation divergence shows why check-level points are non-negotiable

**Exposure:** comparing only the worst-of OUTCOME would have shown
"review-needed vs pass" without attribution; the per-check points
localize the disagreement to `operation.phase1-limits` AND expose the
fabricated threshold ("1.0 m > 0.9 m substitute limit") in the recorded
detail — the provider invented a private limit the canonical reference
data contradicts (block-wall height limit: 3 m).

**Risk (if removed):** unverifiable verdict disagreements — exactly the
ambiguity a substitute could exploit ("my model is just more
conservative").

**What PROD-029 did:** eight comparison points per validation scenario
(outcome + 7 checks), each recorded with its own verdict and detail.

**Actionable (HFX-302):** keep check-level comparison for any future
validation substitute; the outcome-only shortcut is a regression.
