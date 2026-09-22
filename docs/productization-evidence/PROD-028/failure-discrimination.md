# PROD-028 — The Five-Way Failure Discrimination Proof

**The §HF-2 exit gate: "the benchmark suite can distinguish perception,
retrieval, reasoning, unsupported-data and operation-semantic failures."**
This document is the committed proof: for every failure kind, the
scenario that exhibits it, the harness's asserted classification, and —
the load-bearing part — WHY it is not the neighboring kinds.

The classification is the deterministic precedence tree in
`backend/api/src/reasoning-eval/harness.ts` (`classifyOutcome`):

```text
normalization refusal                          → contract-mismatch
operation-contract violation                   → operation-semantic-failure
failed provider result                         → its own closed kind
out-of-scope question answered                 → unsupported-data
fabricated evidence reference (id ∉ bundle)    → unsupported-data
required evidence not cited (wrong/missed/empty, all real ids) → retrieval-failure
declared fact ungrounded in cited evidence     → perception-failure
claim/status mismatch (evidence + facts right) → reasoning-failure
otherwise: first violation kind (integrity), else "none"
```

Every row of the table below is ASSERTED by tests
(`backend/api/src/reasoning-eval/harness.test.ts` — live;
`tools/reasoning-eval/benchmark.test.ts` — over the committed golden)
and by the committed golden itself (`expectedFailureKind`).

## 1. perception-failure — "the data was processed, the perception was wrong"

| Scenario | Observed | Why not the neighbors |
|---|---|---|
| `vlm-perception-failure` (cites E1; declares "the image shows a blue toolbox"; truth: red) | `perception-failure` + `facts-grounded-in-cited-evidence` | The evidence was cited and exists → not retrieval; the wrongness is IN the observed fact itself, not in a conclusion drawn from right facts → not reasoning; the question is in-scope → not unsupported-data. |
| `vlm-hallucination` (cites E1; declares "a cordless drill is lying on the workbench" — plausible, absent) | `perception-failure` + the grounding violation | The hallucination asserts content the cited real evidence does not contain — caught by the grounding rule. NOT unsupported-data: the question IS in scope (a tool is on the bench) and the cited evidence is REAL — only the content is invented; NOT reasoning: no inference happened over right facts — the premise itself is fabricated. |
| `doc-missed-field` (cites S1; declares the false absence "section 1 does not state a quantity") | `perception-failure` | A missed field stated as a false-absence FACT — the closed kind's "failed to read the physical/visual content of its input". NOT reasoning (no wrong inference — a wrong observation); NOT unsupported (the data exists and is cited). |
| `retrieval-perception-failure` (cites H1 — the RIGHT hit; misreports the crack location) | `perception-failure` | The hit was retrieved (cited, exists, required) → not retrieval-failure; the misreport is the perception defect. |

## 2. retrieval-failure — "failed to surface evidence that exists (or surfaced the wrong evidence)"

| Scenario | Observed | Why not the neighbors |
|---|---|---|
| `vlm-wrong-evidence` (rope question; answers from the toolbox image E1 — facts GROUNDED in E1) | `retrieval-failure`, **zero violations** | THE mandated case: answering from wrong (but real) evidence. The envelope is well-formed — the SELECTION is the defect. NOT reasoning-failure: the precedence tree deliberately resolves selection-before-comprehension (the closed kind's own boundary: "a retrieval/indexing defect, not a comprehension defect"). Even though the claim is also wrong, the retrieval defect is the root cause. |
| `doc-wrong-section` (warranty question; cites S2, whose facts it correctly reports) | `retrieval-failure` | Wrong-section attribution = citing the wrong real section. The section's content is correctly perceived (facts grounded in S2) → not perception. |
| `retrieval-near-miss` (cites H2 — the visually-similar slab crack — for the spandrel beam query) | `retrieval-failure` | HFX-203's hard negative: spatially similar but semantically wrong evidence, correctly described. The wrongness is the ranking/selection, not the reading. |
| `retrieval-empty-in-scope` (empty unsupported envelope for an in-scope query) | `retrieval-failure` | "The provider failed to surface evidence that exists." NOT unsupported-data: the data IS in scope — the pair scenario (row 4 below) proves the same behavior classifies differently when the ground truth differs. |
| `retrieval-uncited-claim` (claims the answer, cites nothing) | `retrieval-failure` + `claim-requires-evidence` | The claim's support was never surfaced — plus the citation-contract violation (kind unsupported-data, recorded as a SECONDARY observation; the primary classification stays retrieval). |

## 3. reasoning-failure — "an incorrect inference over correctly perceived and retrieved inputs"

| Scenario | Observed | Why not the neighbors |
|---|---|---|
| `vlm-reasoning-failure` (cites E1; facts = hammer-inside-toolbox, both grounded; concludes "the screwdriver stored inside the toolbox is the tool that can drive nails") | `reasoning-failure`, **zero violations** | Evidence right (cited = required), facts grounded, envelope well-formed — only the CONCLUSION is wrong (compared against the evaluator-side correctness oracle, never the prediction). NOT perception: nothing observed is wrong. |
| `doc-reasoning-failure` (cites S3; correctly extracts "retention is 5 percent"; concludes "higher than five percent") | `reasoning-failure` | The extraction (perception) is exactly right; the comparison (reasoning) is wrong. |
| `retrieval-reasoning-failure` (cites H1+H3 — both required, both correctly reported; concludes "H1 alone is sufficient") | `reasoning-failure` | Multi-evidence synthesis defect with perfect retrieval and perfect perception — the purest reasoning case. |

## 4. unsupported-data — "outside the declared support — answered by explicit refusal, never by fabricated output"

| Scenario | Observed | Why not the neighbors |
|---|---|---|
| `vlm-refusal` / `doc-refusal` (out-of-scope questions: the toolbox serial number; the supplier's VAT id — no evidence carries them) | `unsupported-data`, **zero violations** — the honest refusal | THE mandated case: refusing out-of-scope data is unsupported-data, NOT perception-failure (nothing was misread — the data simply is not in the authorized set; the failed provider result carries the closed kind `unsupported-data` explicitly). The degenerate envelope is clean: status `unsupported`, claim null, the gap named in unknowns. |
| `retrieval-empty-out-of-scope` (roof-membrane query; the SAME empty behavior as row `retrieval-empty-in-scope`) | `unsupported-data`, zero violations | The empty-behavior PAIR: identical provider behavior, different ground truth ⇒ different kind. In-scope emptiness = the provider failed to find existing data (retrieval); out-of-scope emptiness = the honest statement that no data exists. |
| `vlm-hallucination-out-of-scope` (serial-number question; answers "TB-2024-1187" citing E1) | `unsupported-data` + `claim-requires-authorized-scope` + `facts-grounded-in-cited-evidence` | The question's required data is outside the authorized set — ANY supported answer asserts unauthorized data, so the kind is unsupported-data regardless of citation; the hallucinated content is additionally recorded as a perception-kind violation (secondary observation). |
| `retrieval-fabricated-hit` (cites "H9" — no such corpus id) | `unsupported-data` + `cited-evidence-exists` | THE boundary case vs retrieval-failure: wrong-but-REAL evidence is a selection defect (retrieval-failure); INVENTED evidence asserts support outside the authorized context — unsupported-data. The line is existence in the bundle, and the committed pair (`retrieval-near-miss` vs `retrieval-fabricated-hit`) proves the harness draws it. |

## 5. operation-semantic-failure — "engineering semantics wrong or ill-typed for the requested operation, though parsing and perception succeeded"

| Scenario | Observed | Why not the neighbors |
|---|---|---|
| `doc-operation-wrong-target` (asked to update the warranty duration in S3 to 72 months; proposes targeting S2's "retention" field) | `operation-semantic-failure` + `operation-contract-honored` | The claim matches the oracle and the facts are grounded — `fieldMatches.resultClaim` and `facts` are TRUE (parsing and perception succeeded, exactly the closed kind's definition). The wrongness is purely the proposal's ENGINEERING semantics: wrong target evidence, wrong field. NOT reasoning-failure (the inference about the requested change is correct — only its typed execution shape is wrong); nothing is unsupported (all referenced evidence exists). Precedence puts operation semantics before comprehension — a wrong command is a wrong command even with a right conclusion. |

## The supporting kinds (not part of the five, but discriminated)

- **contract-mismatch** — envelope-contract violations:
  `vlm-missing-identity` (identity-recorded), `vlm-implicit-assumptions`
  (assumptions-explicit), `doc-fabricated-check` and
  `retrieval-fabricated-check` (checks-authorized), plus the
  normalization/parse negative paths (malformed envelope payloads →
  `output-contract-normalizable`). All three lanes cover it; the answer
  itself may be perfectly correct — the ENVELOPE is the defect.
- **"none"** — the clean successes (`vlm-correct`, `doc-correct`,
  `doc-operation-correct`, `retrieval-correct`): well-formed envelopes,
  matching oracles, zero violations — proving the harness does not merely
  fail everything.

## The canonical-boundary guard (why the classifications are trustworthy)

- Provider-NATIVE payloads never enter the classification: mutating
  `providerNative` arbitrarily leaves classification, violations,
  envelope digest, record id AND manifest id byte-identical (asserted).
- Measurement uncertainty is propagated from cited evidence, never
  provider-declared; intent and authorized context are injected from the
  bundle; the correctness oracle lives evaluator-side and never reaches
  the provider.
- Every violation and classification kind is from the HFX-000 closed
  vocabulary — the suite asserts no invented kinds anywhere.
