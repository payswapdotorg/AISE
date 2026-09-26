# GBIM-003 — Semantic comparison: direct manipulation ⇄ agent ⇄ canonical identity

**Work item:** GBIM-003 · **Acceptance mapped:** direct manipulation resolves to the SAME EngineeringOperation path as the existing agent flow; all consequences from AISE quantities/verification.

## 1. The one pipeline (cited AISE files)

Every authored operation — direct manipulation, click-to-place, agent proposal, revision — is:

1. constructed through the contract's ONE constructor surface `createOperationIntent`
   (`packages/solution-contract/src/intent.ts` L174) with
   `provenance.origin` ∈ {`direct-manipulation`, `agent`, `imported-template`}
   (`packages/solution-contract/src/operation.ts` L87–101);
2. posted as intent JSON and DECODED server-side (`decodeEngineeringOperationIntent`) — decode,
   never trust;
3. gated by the engine's capability negotiation (`packages/solution-contract/src/negotiation.ts`
   L163) and applied by `applyOperation` (`packages/solution-engine/src/apply.ts` L156);
4. validated (`validateSolutionVersion`, `packages/solution-engine/src/validation.ts` L103) and
   BOQ-derived (`deriveSolutionBoq`, `packages/solution-boq/src/derive.ts` L416);
5. rendered by the sandbox VERBATIM.

The spike's direct-manipulation wrapper
(`apps/spatial-studio-spike/src/client/intent-builder.ts`) mirrors the production workspace's
`buildDirectManipulationIntent` (`apps/web/src/solution/operations-core.ts` L314–354): same
constructor, same origin, same never-invented-parameters rule, same parameter order (the engine
profile's required order). The agent lane compiles through the REAL deterministic compiler
(`backend/api/src/reasoning/solution/compiler.ts`, `createSolutionCommandCompiler` L275) — the
same code the production solution-agent routes use.

## 2. Identity law (why equivalence is structural)

`packages/solution-contract/src/identity.ts` L113 `deriveEngineeringOperationId` hashes the
semantic projection {solutionId, versionNumber, operationIndex, operationType, vertical,
parameters, target(selectorKind, nodeRefs, geometryRefs, units), dependsOn} — **provenance,
presentation and timestamps are excluded by design** (module doc L1–30). Therefore the same
semantics authored by direct manipulation or by the agent IS THE SAME OPERATION — the PROD-021
acceptance criterion, already proven structurally by the committed fixture pair
`packages/solution-contract/fixtures/operation/EngineeringOperationIntent.valid-excavation-direct.json`
vs `...-agent.json` (asserted by identity.test.ts).

## 3. The GBIM-003 live proof (building domain, mm→m canonicalization)

- **Direct side:** an 8 × 3 × **0.2 m** concrete-block wall authored through the component
  library (anchor wall-001).
- **Agent side:** the utterance *"Build a new block wall 8 m long, 3 m high and **200 mm**
  thick from concrete blocks in the wall."* compiled by the REAL compiler → normalized command
  "Lay a concrete-block wall 8 m long, 3 m high and 0.2 m thick." → parameters
  `[length 8 m, height 3 m, thickness 0.2 m, material concrete-block]` (the compiler
  canonicalized 200 mm → 0.2 m).
- **Result (identical operation identity, same version context):**

```
direct-manipulation intent → cb0ba7c4234e7213ddbc85cb54109c3779b70082cec6b35a97b592f3b57f7163
agent-compiled intent      → cb0ba7c4234e7213ddbc85cb54109c3779b70082cec6b35a97b592f3b57f7163
```

Recorded in `results/agent-trace.json` (generated through the real compiler; re-verified live
in the sandbox's Agent lane — screenshot `screenshots/05-agent-equivalence.png`, in-browser
banner "✓ SAME operation identity"). The check runner re-derives both sides deterministically
(check `direct-nl-equivalence`, PROVEN).

Note: the operation id embeds the version context (solutionId, versionNumber, operationIndex),
so the id VALUE differs between workspace rebuilds with different step counts — the EQUALITY of
the two ids within the same context is the invariant (identity.ts: version pinning is
semantic).

## 4. Quantity provenance (consequences come only from the engine)

| Displayed consequence | Source (cited) |
|---|---|
| HUD quantities (wall-volume 3.600 m³ = 6×3×0.2; wall-face-area 18 m²; block-count 225 = ceil(3/0.2)×ceil(6/0.4)) | `applyOperation` dry-run → `EngineQuantity` with `calculationRef` + `formula` (`packages/solution-engine/src/quantity-models.ts` reference model, block-wall model) |
| Inspector quantities + limits | the recorded `AppliedOperation.quantities` / `limitsExceeded` |
| BOQ lines | `deriveSolutionBoq` — "the engine is the single quantity authority" (BOQ never recomputes) |
| Validation outcome + checks | `validateSolutionVersion` snapshot (worst-of vocabulary) |
| Negotiation outcome + reasons | `OperationCapabilityNegotiation` echo |

The renderer adds NO cost, fire-safety or compliance semantics (Atelier's hard-coded semantics
deliberately not copied — charter §1/§6 and the work order).

## 5. Fail-closed refusals through the SAME pipeline

Verified live in-browser and by the check runner: negative dimension (engine
`parameter_not_positive`), unsupported type (`operation-type-not-declared`), unsafe authority
claims (compiler `unsafe-refusal` / `approval-authority-claim` for "Approve the wall and mark it
verified."), malformed intents (contract decode failure). No fabricated geometry, quantities or
approval anywhere.
