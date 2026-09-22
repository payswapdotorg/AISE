# PROD-028 — The Evidence Envelope Fixture Map

**Which canonical envelope fields are evaluable today, per lane — and the
honest gap list.** The canonical semantics are the architecture-lock's
Layer-2 envelope list (spec/architecture-lock.md "Layer 2 Evidence
Envelope"; ACR-006), declared as the evaluable projection in
`backend/api/src/reasoning-eval/model.ts` (`CanonicalEvidenceEnvelope`).

Legend: ✅ provider-neutral entry point exists, fixtures exercise it, the
harness asserts it (integrity rule, expected-outcome comparison and/or
canonical mapping); 🟡 carried canonically but not asserted today (a
declared gap); ➖ not applicable to the lane today.

## The map

| Canonical envelope field | Multimodal (9) | Document (8) | Retrieval (9) | How it is evaluated |
|---|---|---|---|---|
| **intent** (question/task) | ✅ | ✅ | ✅ | Injected from the bundle's question by the harness (providers never author intent); present in every committed envelope (`envelope.intent`) and covered by the golden's `envelopeDigest`. |
| **authorizedContext** (project/context/revision) | ✅ | ✅ | ✅ | Injected from the bundle; the out-of-scope rule (`claim-requires-authorized-scope`) enforces that answers stay inside it. |
| **evidenceIds** (supporting evidence) | ✅ | ✅ | ✅ | The retrieval-failure classification (required ⊄ cited), the fabricated-reference rule (`cited-evidence-exists`) and the claim-citation rule (`claim-requires-evidence`) — all three lanes exhibit every one of those scenarios. |
| **evidenceRevisions** | ✅ | ✅ | ✅ | Propagated verbatim from the bundle's evidence items (r1/r2/r3 fixtures); asserted through the golden envelope digest and the registry lifecycle's normalized executions. |
| **facts** (observed/confirmed) | ✅ | ✅ | ✅ | The grounding rule (`facts-grounded-in-cited-evidence`) — the exact-match oracle over the cited evidence's ground-truth facts; false-absence facts are caught (doc-missed-field). |
| **assumptions** (explicit inferred) | ✅ | ✅ | ✅ | The explicitness rule (`assumptions-explicit`) against the evaluator-side oracle + the expected-outcome comparison (vlm-implicit-assumptions is the negative fixture; every correct fixture declares its assumptions). |
| **unknowns** (evidence gaps) | ✅ | ✅ | ✅ | The explicitness rule (`unknowns-declared-when-unsupported`) + the honest-refusal mapping (failed results name their gap) + the empty-result fixtures. |
| **measurementUncertainty** | ➖ | ➖ | ✅ | Propagated VERBATIM from cited evidence (retrieval-correct: H1 0.4 mm ± 0.05 mm); providers never declare it (never fabricated). **Gap: the multimodal/document lanes carry no measured evidence today — no σ fixture exists for image or document lanes.** |
| **deterministicChecks** (invoked) | ✅ | ✅ | ✅ | The authorization rule (`checks-authorized`) — the bundle offers a closed check set; doc-fabricated-check and retrieval-fabricated-check are the negative fixtures; correct scenarios invoke offered checks. |
| **resultClaim + status** | ✅ | ✅ | ✅ | The reasoning-failure classification (against the correctness oracle), the expected-outcome comparison, and the refusal statuses (`unsupported`) of the honest-refusal envelopes. |
| **nextRecommendedAction** | 🟡 | 🟡 | 🟡 | Carried canonically (the correct fixtures declare one), but NOT asserted: no provider-neutral expected semantics for "next action" quality exists yet — an honest gap (see below). |
| **invalidationConditions** | ✅ | ✅ | ✅ | Expected-outcome comparison per scenario (every committed fixture declares its invalidation conditions). |
| **agentIdentity** (provider identity) | ✅ | ✅ | ✅ | The identity rule (`identity-recorded`) — presence AND match with the evaluated profile (spoofing caught); vlm-missing-identity is the negative fixture. |
| **proposedOperation** (operation scenarios) | ➖ | ✅ | ➖ | The operation-contract rule (`operation-contract-honored`) + the operation-semantic-failure classification (doc-operation-correct / doc-operation-wrong-target). |
| **envelope integrity (cross-cutting)** | ✅ | ✅ | ✅ | The full rule battery, criteria-gated per scenario; violations recorded as closed-vocabulary observations; benchmark records + manifests content-addressed and digest-verifiable. |

## Per-lane fixture inventory (the evaluable outcome surface)

- **multimodal-reasoning (9):** `vlm-correct` · `vlm-perception-failure` ·
  `vlm-hallucination` · `vlm-wrong-evidence` · `vlm-reasoning-failure` ·
  `vlm-refusal` · `vlm-hallucination-out-of-scope` ·
  `vlm-missing-identity` · `vlm-implicit-assumptions`
- **document-understanding (8):** `doc-correct` · `doc-missed-field` ·
  `doc-wrong-section` · `doc-reasoning-failure` · `doc-refusal` ·
  `doc-operation-correct` · `doc-operation-wrong-target` ·
  `doc-fabricated-check`
- **retrieval (9):** `retrieval-correct` · `retrieval-near-miss` ·
  `retrieval-empty-in-scope` · `retrieval-empty-out-of-scope` ·
  `retrieval-fabricated-hit` · `retrieval-uncited-claim` ·
  `retrieval-perception-failure` · `retrieval-reasoning-failure` ·
  `retrieval-fabricated-check`

## The honest gap list

Fields/lanes lacking provider-neutral entry points today — each with the
successor item that should close it:

1. **`nextRecommendedAction` is carried but never asserted.** No
   canonical semantics exist for what makes a "next action" correct — the
   architecture-lock lists it, the envelope carries it, the expected
   outcomes ignore it. Closing it needs a governed decision (what the
   next-action vocabulary IS for Layer-2 envelopes) before fixtures can
   assert it. Suggested owner: a PROD-028 successor or HFX-201's golden
   corpus design.
2. **Measurement uncertainty has exactly ONE fixture (retrieval lane,
   H1's ± 0.05 mm).** The multimodal/document lanes carry no measured
   evidence — the propagation path is exercised only in retrieval. σ
   propagation through derived quantities is AISE-013's deterministic
   domain and deliberately NOT re-implemented here. Closing: HFX-201
   (image-derived dimensions with sensor σ) and HFX-202 (OCR confidence →
   review-required states).
3. **The `conflicted` result status is declared but never exercised.**
   HFX-201's work order requires "conflicting-evidence behavior"
   testing; no committed fixture carries two evidence items asserting
   contradictory facts. Closing: HFX-201's conflict fixtures (the
   vocabulary slot already exists in `ENVELOPE_RESULT_STATUSES`).
4. **Evidence revision CONFLICTS are not exercised.** Revisions are
   carried verbatim, but no fixture cites a superseded revision of an
   evidence item (HFX-202's "revision changes are detected without
   silently overwriting earlier derived interpretations"). Closing:
   HFX-202 revision-triplet fixtures.
5. **Operation contracts cover one operation kind** (`document-field-edit`
   with target/field/unit/value semantics). HFX-204's create/update/
   delete + spatial/topological task classes need a richer contract
   vocabulary (typed parameters, precedence/dependency) — the seam
   (`EnvelopeOperationContract` + `proposedOperation` + the rule) is
   designed to extend without changing the envelope schema.
6. **The grounding oracle is exact-string over scripted facts.** The
   deterministic doubles emit ground-truth strings verbatim, so grounding
   is exact. A real model's paraphrases would evade the exact-match rule —
   HFX-201 must either emit canonical facts or a governed fact-
   canonicalization step must be added (hardening-report.md, finding F5).
7. **No `resource-exhaustion` / `timeout` / `license-blocked` fixtures.**
   Deterministic doubles never exhaust or time out, and their fixture
   license is permissive. Those closed-vocabulary kinds remain available
   to future lanes (the vocabulary check asserts nothing outside the
   closed list); the license path is HFX-000's promotion gate, not this
   harness's.
