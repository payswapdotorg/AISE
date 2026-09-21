# PROD-024 — Operation trace of the golden journey (typed, deterministic)

**Work item:** PROD-024 · **Module:** `apps/web/src/solution/**`
**Source:** the automated golden journey
(`apps/web/src/solution/workspace.test.tsx` — "the journey trace is
BYTE-STABLE across two runs").

The trace below is the workspace's serialized journey record (canonical
JSON, sorted keys — `serializeJourneyTrace`): every step joined through the
ENGINE's trace identities (operation id / state id / transition id). Two
runs of the identical scripted session produce byte-identical output
(asserted by the suite).

Trace identities of the journey (all content addresses — the contract's
own derivations):

| Step | Kind | Operation / state identity |
|---|---|---|
| 1 | inspect | baseline overlay `ce0f5133d8a0097d7a53766687cf145c43448ac54a1b9e01c66bbe498a0e0dd2` (v1 layer 0) |
| 2 | direct-manipulation | demolition-removal op `78be478643fcbb4aad1ba5e9165ab3382199c9165770f50b83a58c431096f2f9` → state `cb7cc34aa2a883d14ceff1fc4146113077598c2c09c051ab284019d8a0f6e764` (v1 layer 1); transition `879ef07899eccca5bf83abc3bd7541a4f0709bfa162c464f55db3d521491c681` |
| 3 | agent-turn (ask) | clarification for slots height, material — no operation authored |
| 4 | agent-turn (propose) | preview of "Lay blocks to a height of 1 m along this wall." — not yet applied |
| 5 | confirm (agent) | block-wall-placement op `281417008f64faec1343a222213785066c6d480c1ef07b67120d73bd89d903ea` → state `a4951ff261cfa434be6582460b7db4710c3700351f494dd82f027be9c7ca2768` (v1 layer 2); transition `5c8526f42cb1257bb7f6b5d9edd5b611529233621b1caacb7c40bd62dd9bf80a` |
| 6 | step-back | cursor → engine state layer 1 (`cb7cc34a…`) — identity restore |
| 7 | revise | NEW version 2 (parent 1), demolition reverted; undo transition `947417b83ed5e7edef4cdb2d651eb552d4542ec7e27df6a65da6ce390d80973a`; v1 preserved untouched |
| 8 | agent-turn (propose) | preview of "Apply 30 mm plaster to the affected wall faces." |
| 9 | confirm (agent) | plaster-application op `8d69d2f8f6cdb9863e0f1edfafb613bef15e310393b12f56f4985a70c834a808` → state `2f3fde2088ff512c2acd394421b0d757a9522de7bd2e316ea98f785e6b6abca6` (v2 layer 2); transition `5445de6a482822eab002acd3cb244ab958f7e5259d0d48c8f1775628efc5867e` |

**Corpus alignment (the convergence law made concrete):** the journey's
version-1 operations `78be4786…` (demolition) and `281417…` (block wall)
are the COMMITTED contract corpus's/engine golden's own identities for the
same semantics at the same version context — the direct-manipulation
demolition and the agent-authored block wall land on the corpus's
content addresses, and the committed direct/agent excavation fixture pair
derives the SAME id through the contract's identity derivation (asserted
by the suite).

The final version 2 of the journey:

```text
version 2 (parent 1, draft, createdAt 2026-09-16T10:01:00.000Z)
  op 1  block-wall-placement  7d23d91c555872dea4f54961dd4b4af92d21060d3c1f2bf97d0e57d01567510f
        origin agent · agent-demo-assistant
        command "Lay blocks to a height of 1 m along this wall."
        effects: added 0.5 m3 · added 5 m2 · added 65 count
        (calculationRef aise-solution-engine/quantity/block-wall-placement/v1)
  op 2  plaster-application   8d69d2f8f6cdb9863e0f1edfafb613bef15e310393b12f56f4985a70c834a808
        origin agent · agent-demo-assistant
        command "Apply 30 mm plaster to the affected wall faces."
        effects: added 12.5 m2 · added 0.375 m3
        (calculationRef aise-solution-engine/quantity/plaster-application/v1)

  layer 0  a726d5c58cbc2ef5c3c28f3b4e00678df851c61030b95d9be7d5c8c67eb76c87  (baseline overlay)
  layer 1  9d0bc694d053d070cd3d7251a1e2fa2ac521126b87058be2d840da7e81a1d0d9  (after op 1)
  layer 2  2f3fde2088ff512c2acd394421b0d757a9522de7bd2e316ea98f785e6b6abca6  (final)
```

The full canonical journey record (as serialized by the workspace; the
suite asserts two runs byte-identical):

```json
{
  "baselineRealityVersionId": "rgv-demo-0007",
  "finalStateId": "2f3fde2088ff512c2acd394421b0d757a9522de7bd2e316ea98f785e6b6abca6",
  "finalVersionNumber": 2,
  "journey": [
    { "step": 1, "kind": "inspect", "stateId": "ce0f5133d8a0097d7a53766687cf145c43448ac54a1b9e01c66bbe498a0e0dd2", "stateIndex": 0, "versionNumber": 1,
      "detail": "opened the solution workspace on the observed baseline (reality version rgv-demo-0007) — the proposal starts from the baseline overlay, layer 0" },
    { "step": 2, "kind": "direct-manipulation", "origin": "direct-manipulation", "intentId": "intent-direct-demolition-001",
      "operationId": "78be478643fcbb4aad1ba5e9165ab3382199c9165770f50b83a58c431096f2f9",
      "stateId": "cb7cc34aa2a883d14ceff1fc4146113077598c2c09c051ab284019d8a0f6e764",
      "transitionId": "879ef07899eccca5bf83abc3bd7541a4f0709bfa162c464f55db3d521491c681",
      "stateIndex": 1, "versionNumber": 1,
      "detail": "applied 'demolition-removal' (direct manipulation) — engine state layer 1 of version 1" },
    { "step": 3, "kind": "agent-turn", "utterance": "Rebuild the damaged wall with blocks.",
      "detail": "the agent asked for clarification: height, material" },
    { "step": 4, "kind": "agent-turn", "utterance": "1 m high, using concrete blocks",
      "detail": "the agent proposed 'Lay blocks to a height of 1 m along this wall.' — awaiting user confirmation" },
    { "step": 5, "kind": "confirm", "origin": "agent", "intentId": "intent-agent-block-001",
      "utterance": "yes, apply it",
      "operationId": "281417008f64faec1343a222213785066c6d480c1ef07b67120d73bd89d903ea",
      "stateId": "a4951ff261cfa434be6582460b7db4710c3700351f494dd82f027be9c7ca2768",
      "transitionId": "5c8526f42cb1257bb7f6b5d9edd5b611529233621b1caacb7c40bd62dd9bf80a",
      "stateIndex": 2, "versionNumber": 1,
      "detail": "applied 'block-wall-placement' (agent command confirmed) — engine state layer 2 of version 1" },
    { "step": 6, "kind": "step-back", "stateId": "cb7cc34aa2a883d14ceff1fc4146113077598c2c09c051ab284019d8a0f6e764",
      "stateIndex": 1, "versionNumber": 1,
      "detail": "stepped to engine state layer 1 (state cb7cc34aa2a883d14ceff1fc4146113077598c2c09c051ab284019d8a0f6e764)" },
    { "step": 7, "kind": "revise", "operationId": "78be478643fcbb4aad1ba5e9165ab3382199c9165770f50b83a58c431096f2f9",
      "stateId": "9d0bc694d053d070cd3d7251a1e2fa2ac521126b87058be2d840da7e81a1d0d9",
      "transitionId": "947417b83ed5e7edef4cdb2d651eb552d4542ec7e27df6a65da6ce390d80973a",
      "stateIndex": 1, "versionNumber": 2,
      "detail": "revised version 1 into NEW version 2 (reverting operation 78be478643fc…) — the prior version is preserved untouched in the history" },
    { "step": 8, "kind": "agent-turn", "utterance": "Apply 30 mm plaster to the affected wall faces.",
      "detail": "the agent proposed 'Apply 30 mm plaster to the affected wall faces.' — awaiting user confirmation" },
    { "step": 9, "kind": "confirm", "origin": "agent", "intentId": "intent-agent-plaster-001",
      "utterance": "yes, apply it",
      "operationId": "8d69d2f8f6cdb9863e0f1edfafb613bef15e310393b12f56f4985a70c834a808",
      "stateId": "2f3fde2088ff512c2acd394421b0d757a9522de7bd2e316ea98f785e6b6abca6",
      "transitionId": "5445de6a482822eab002acd3cb244ab958f7e5259d0d48c8f1775628efc5867e",
      "stateIndex": 2, "versionNumber": 2,
      "detail": "applied 'plaster-application' (agent command confirmed) — engine state layer 2 of version 2" }
  ],
  "solutionId": "solution-demo-001"
}
```
