# PROD-029 — Divergence analysis (each divergent fixture: what diverged, why it is a provider error, the failure kind recorded)

The four divergent fixture providers each carry exactly ONE well-defined
deviation from the canonical components' committed golden behavior. This
document records, per fixture: WHAT diverged (the exact comparison
points), WHY it is a PROVIDER error and not a canonical ambiguity, and the
closed-vocabulary failure kind the harness recorded (the committed golden
of the recording).

The distinction "provider error vs canonical ambiguity" is the divergence
doctrine: an ambiguity would mean TWO defensible canonical answers exist
(the canonical spec under-determines the output); a provider error means
the canonical answer is uniquely determined by committed, deterministic
reference data — the provider's output simply is not that answer. Each
fixture below is checked against that bar.

## 1. The compiler divergence — the block-wall thickness misread

**Scenario:** `layer3-compiler-divergent-001` (seam: operation-compiler,
substitute: `fixture-compiler-provider 1.1.0-fixture-divergent`).

**What diverged:** ONE comparison point, `operation-identity` at subject
`REP-BLOCK-001` ("Lay blocks to a height of 1 m along this wall."). The
substitute compiled the utterance with the wall thickness parameter
**0.2 m** where the canonical compiler compiles **0.1 m** (the session
focus's known-parameter — the wall's observed thickness, the same fact the
contract's committed `valid-block-wall-placement` intent fixture carries).
A different semantic parameter ⇒ a different content-addressed operation
identity. The other two utterances (`REP-EXC-001`, `REP-PLASTER-001`)
stayed byte-equal — the divergence is isolated to the discriminator.

**Why it is a provider error, not a canonical ambiguity:** the wall's
thickness is a CALLER-KNOWN session fact (the focus's `knownParameters` —
`WALL_FOCUS` in the committed PROD-023 testkit, mirroring the contract's
committed intent fixture). The canonical semantics are uniquely
determined: seed the focus-known thickness (0.1 m). A compiler that
misreads a session-known fact is misreading its input — the closed
failure vocabulary's `operation-semantic-failure` ("wrong units, wrong
target" family: wrong typed parameter). The unit-variant equivalence
corpus (EQV-EXC-004: "1500 mm deep, 200 cm wide") proves the canonical
compiler is NOT ambiguous about dimensions — it canonicalizes exactly.

**Recorded failure kind:** `operation-semantic-failure` (declared up front
by the scenario's `expectedDivergenceKind`; the harness recorded exactly
it).

**The provider's own honest declaration:** the substitute's profile
declares the defect mode (`failureModes`:
`operation-semantic-failure` — "the divergent fixture misreads the
block-wall thickness on the discriminator utterance").

## 2. The engine divergence — the subtly-divergent final state

**Scenario:** `layer3-engine-divergent-001` (seam: engine-execution,
substitute: `fixture-engine-provider 1.1.0-fixture-divergent`).

**What diverged:** ONE comparison point, `state-digest` at subject
`step-3` (the plaster application). Steps 1–2 (demolition, block wall)
reproduce the canonical state chain byte-for-byte; step 3's resulting
state identity and content digest each deviate by exactly ONE hex digit
(`…0f3e5b` → `…0f3e5c`; `…58b06b8` → `…58b069`). All seven quantity
values stayed equal — the deviation is purely the state-evolution
content.

**Why it is a provider error, not a canonical ambiguity:** the state
content digest is a deterministic hash CHAIN (parent digest → layer index
→ operation id → canonical effect projection) over inputs that are all
committed reference data (the wall-upgrade intents, the baseline
geometry, the caller-injected clock). Given the same inputs there is
exactly ONE canonical chain — the engine's own committed golden
(`packages/solution-engine/fixtures/wall-upgrade-expected.json`) pins it,
and the engine's tests prove the live replay reproduces it
bit-identically. A substitute engine that produces a different final
state for the same operations is not "another defensible reading" — the
chain is content-addressed, so a different digest IS a different state
evolution. The last step was chosen deliberately: a step-1 divergence
would cascade (the parent digest feeds every later state), which would
make "one subtly-divergent point" unfalsifiable; a final-step divergence
isolates the deviation to exactly one state.

**Recorded failure kind:** `operation-semantic-failure` (state-identity
divergence — the recorded point's taxonomy).

**Design note (the tolerance question):** the harness compares canonical
equality EXACTLY (byte-equal digests). This is intentional: for a
drop-in engine substitution, "semantically compatible states" either are
the canonical states (the digest chain is deterministic over committed
inputs) or the difference is real and must be RECORDED (never averaged
away). HFX-302's "within declared tolerances" consumption is a JOIN over
these recorded comparison points — the tolerance decision stays with the
consumer; the harness supplies the honest per-point evidence.

## 3. The validation divergence — the disagreeing phase1-limits verdict

**Scenario:** `layer3-validation-divergent-001` (seam: validation,
substitute: `fixture-validation-provider 1.1.0-fixture-divergent`).

**What diverged:** TWO comparison points, both `validation-verdict`:
(1) the worst-of outcome (`validation-outcome`): the substitute certified
**`review-needed`** where the deterministic validator certifies
**`pass`**; (2) the check result at `check:operation.phase1-limits`: the
substitute flagged review-needed on a fabricated exceedance ("block-wall
height 1.0 m > its declared 0.9 m substitute limit") where the canonical
Phase 1 limit for block-wall height is 3 m — no exceedance exists. The
other six checks stayed equal.

**Why it is a provider error, not a canonical ambiguity:** validation is
a SERVER-SIDE DETERMINISTIC operation over committed reference data
(`REFERENCE_BUILDING_OPERATION_LIMITS`: excavation depth ≤ 6 m;
block-wall height ≤ 3 m; plaster thickness ≤ 50 mm per coat — data, not
code). The wall's 1.0 m block-wall height is within the 3 m limit by
simple arithmetic — there is no defensible reading under which it
exceeds. The substitute's 0.9 m "limit" is a private, undeclared
threshold it invented and then applied against the canonical inputs —
an incorrect inference over correctly perceived inputs. The frozen
honesty discipline also rules out the ambiguity reading: a
`review-needed` flag is a deterministic engineer-review signal computed
from typed parameters, not a judgment call.

**Recorded failure kind:** `reasoning-failure` — the closed vocabulary's
"incorrect inference, comparison or derivation over correctly perceived
and retrieved inputs". This is the one divergence family mapped to
`reasoning-failure` (the verdict taxonomy: verdicts are inferences;
identities, states and quantities are engineering semantics).

**Severity note:** this is the most consequential divergence family in
the matrix — a false `review-needed` blocks a version from clean
validation; a false `fail` would block BOQ generation entirely. Either
way the canonical gate would be corrupted by the substitute's claim —
which is exactly why the canonical `Validate` stays a deterministic
server-side operation and a validation PROVIDER can only ever be
evaluated against it (never promoted into it).

## 4. The BOQ divergence — the block-count quantity deviation

**Scenario:** `layer3-boq-divergent-001` (seam: boq-derivation,
substitute: `fixture-boq-provider 1.1.0-fixture-divergent`).

**What diverged:** ONE comparison point, `boq-line` at subject
`block-wall-placement:count`. All seven lines' semantic keys match the
canonical derivation exactly (the same work items, units, materials and
calculation references); the block-count line's quantity is **64** where
the canonical derivation carries **65**. Every other line value stayed
equal.

**Why it is a provider error, not a canonical ambiguity:** the block
count is `ceil(height/0.2) × ceil(length/0.4)` over committed reference
data — the engine's documented formula table (a versioned calculation
reference: `aise-solution-engine/quantity/block-wall-placement/v1`) and
the nominal 400 × 200 mm module INCLUDING 10 mm joints. For the 5 m × 1 m
wall: ceil(1/0.2) × ceil(5/0.4) = 5 × 13 = **65** — the engine's
committed `engine-quantity-expectations.json` and
`wall-upgrade-expected.json` goldens both pin it, and the engine README
documents the worked example ("5 m × 1 m wall → 5 courses × 13 modules =
65 blocks"). The substitute's 64 is the classic floor-instead-of-ceiling
error on the partial module (13 modules × 5 courses with one module
floored) — the formula table explicitly states "a partial module at a
course end or a partial top course counts as a whole block (ceiling)".
The quantity authority rule makes the ambiguity reading additionally
impossible: the BOQ package NEVER recomputes a quantity — it groups and
labels the ENGINE's recorded outputs, so a "different derivation" of the
same line's value cannot be a defensible second answer; it is a wrong
value.

**Recorded failure kind:** `operation-semantic-failure` (wrong quantity
semantics for the operation — the closed vocabulary's "wrong units"
family: a quantity is a typed value, not a judgment).

## The shape-divergence family (the boundary guard's own negatives)

Beyond the four semantic divergences, the committed test corpus carries
two `contract-mismatch` shape divergences (recorded by the guard, not by
comparison):

1. **A provider-specific field smuggled INSIDE a canonical-JSON string
   field** (`intentSemanticsJson` carrying `vendorOperationRef`): the
   control plane cannot see it (the field is a contract-valid string);
   ONLY the harness's canonical projection catches it — refused with the
   field named, recorded as `contract-mismatch`. This is the D26 gate's
   hardest negative: the boundary must hold even when the provider
   hides its types inside a string.
2. **An undeclared provider output field** (`vendorConfidence: 0.9` at
   the top level of the outputs object): the control plane's CLOSED
   output contract refuses it at normalization (contracts are closed —
   a provider may not invent outputs), recorded as `contract-mismatch`
   with the typed issues.

Both answer `divergence-recorded` with the declared kind
`contract-mismatch` and satisfy their declared expectations — the guard
is part of the benchmark, not an afterthought.
