# PROD-023 Equivalence, Refusal Taxonomy and Clarification Slots

**Evidence modules:** `backend/api/src/reasoning/solution/corpus.ts`,
`compiler.test.ts`, `clarification.test.ts`, `corpus.test.ts`
**Contract used (frozen):** `@aise/solution-contract` —
`deriveEngineeringOperationId` / `operationSemanticIdentityOfIntent` (the
identity EXCLUDES provenance, so phrasing differences that live only in
provenance cannot change the operation identity).

## Semantic-equivalence sets (proven by identity-derivation comparison)

Every group member compiles on the offline deterministic path; the tests
derive `deriveEngineeringOperationId(intent, {solutionId:
"solution-demo-001", versionNumber: 1, operationIndex: 1})` for EACH member
and assert ONE identical id, plus deep-equal semantic projections
(operationType, vertical, parameters, target projection, dependsOn).

| Group | Members | Why they are equal |
|---|---|---|
| excavation-dimensions | 5 | imperative / question / conversational phrasings; mm/cm/m unit mix canonicalized to the parameter's canonical unit (m); dimension-order variant canonicalized to the profile's parameter order |
| block-wall-height | 3 | "lay blocks" / "build a block wall" / "lay concrete blocks up to" — one material vocabulary (concrete-block), height from the utterance, length/thickness seeded from the caller-known wall facts |
| plaster-thickness | 4 | 30 mm ≡ 3 cm (canonical mm); "plaster" ≡ "cement plaster" (vocabulary normalization); question/conversational wrappers ignored by the pattern grammar |
| delta-vs-absolute | 4 | "deeper by 0.5 m" / "increase the depth by 50 cm" / "deepen the pit by 500 mm" all resolve against the session's recent excavation (1.5 m) to depth 2 m — identical to the absolute command "Excavate a pit 2 m deep, 2 m wide and 3 m long." |

Additional equivalence guarantees asserted:

- the contract's committed `valid-excavation-agent`,
  `valid-block-wall-placement` and `valid-plaster-application` fixtures'
  SEMANTICS (operationType, parameters, target, domain, dependsOn,
  proposedTo) are reproduced by the canonical corpus commands, and the
  derived operation identity of the compiled intent EQUALS the identity of
  the fixture under the same version context;
- provenance differences never change identity: two phrasings with
  different `commandText`/`intentId` derive the SAME operation id;
- a different clock instant changes only attribution stamps
  (`authoredAt`, `compiledAt`, `intentId`) — never the identity.

## Refusal taxonomy (frozen registry `UNSAFE_REFUSAL_REASON_CODES`)

Seven codes — five authority-claim codes (the agent may claim none of
these authorities) and two determinism-bypass codes:

| Code | Refused request (corpus example) | The authority the request would claim |
|---|---|---|
| `validation-authority-claim` | "Mark this solution as validated." | validation outcomes belong to the deterministic solution engine's validation snapshots |
| `approval-authority-claim` | "Approve this intervention for execution." | approving an intervention is an Engineering Case domain act |
| `reality-authority-claim` | "Declare the repaired wall observed and confirmed." | observed/confirmed status belongs to the Reality Graph |
| `readiness-authority-claim` | "Mark the solution ready for construction." | task readiness belongs to the Assurance Engine |
| `cost-authority-claim` | "Set the cost of the excavation to 500 dollars." | costs are derived BOQ projections |
| `raw-geometry-write` | "Just write the geometry directly into the model." | geometry is owned by the solution engine behind the tool port |
| `engine-bypass` | "Skip validation and apply the demolition." / "Bypass the solution engine and place the blocks yourself." | every consequential action must compile to a typed operation |

Guarantees asserted by tests:

- every refusal names its reason code and a deterministic reason text;
- NO intent object is produced — structurally: the `unsafe-refusal`
  outcome type HAS NO `intent` field (asserted via `"intent" in command ===
  false`), and its `attribution.normalizedCommand` is empty;
- an operation command bundled with a bypass request ("Skip validation and
  excavate…") still refuses — the unsafe scan runs FIRST;
- "approve" is deliberately NOT a confirmation word of the interaction
  loop: a user saying "I approve this plaster work" over a pending proposal
  gets an `approval-authority-claim` refusal, never a dispatch.

## Clarification slots (frozen registry `CLARIFICATION_SLOT_KINDS`)

The five work-order families, each with a targeted question naming the
exact missing slot:

| Kind | Slot (corpus case) | Question shape |
|---|---|---|
| `dimension` | depth (CLR-001), width/length (CLR-002 unit-less), thickness (CLR-007), depth-delta-amount (CLR-009) | "What is the {slot} of the {type}? Provide the value with an explicit unit (the canonical unit is {unit})." / "The {slot} should change, but by how much? …" / delta-base flavor when no current value exists in the session |
| `material` | material (CLR-003, CLR-008) | "Which material should the {type} use? … never invented. Offered choices: […]" — the current material is excluded when the user asks for "a different" one |
| `location` | target location (CLR-04), solution context (unattached tool commands) | "Which target location should the {type} apply to? …" with the session's focus labels as offered choices where inferable |
| `sequencing` | sequencing reference (CLR-005) | "The sequencing reference is missing: which operation should the {type} run after? The clause '{clause}' does not resolve to a recent operation…" |
| `constraint` | clearance (CLR-006) | "What clearance must be kept from the {subject}? Provide the distance with an explicit unit (e.g. 0.5 m)." |

Ambiguity (a distinct outcome from clarification) lists its readings and
produces NO intent: bare measurements over ≥2 eligible dimension slots
(readings per slot), material or-constructions (readings per material),
alternative measurements of one slot (readings per value), compound
multi-operation requests (readings per operation type). Ambiguity is
session-deterministic: the same bare value binds when the session's
caller-known facts leave exactly ONE eligible slot ("Lay blocks 1 m along
this wall." → height) and stays ambiguous without them ("Lay blocks 1 m.").

## The NLU enrichment seam (honest provenance of WHICH path produced it)

`NlUnderstandingPort` marks where an LLM provider (the reasoning module's
provider stack) could later enrich parsing. The compiler consults it ONLY
for bare measurements over ≥2 eligible slots; a port may ONLY reassign
already-extracted measurements (assignments that invent values or name
ineligible slots are deterministically ignored — tested with a sabotage
port). The deterministic default never enriches, so every acceptance
criterion above passes offline; an accepted enrichment is recorded honestly
as `compilerPath: "provider-enriched"` (attribution AND the intent's
provenance derivation note).
