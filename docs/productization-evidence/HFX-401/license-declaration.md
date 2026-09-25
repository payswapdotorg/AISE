# HFX-401 — the license/use clearance declaration (the refusal-path demonstration)

**The gate:** `license-use-clearance` — the tenth of the ten promotion
gates, and the one the HFX-000 control plane already enforces as its own
`license-use-clearance` gate. The work order's dataset/model-use rule is
binding: *"Unless licensing and intended-use terms are explicitly cleared
for the intended use, a model/dataset is evaluation-only. In particular,
non-commercial benchmark datasets must not silently enter a commercial
training pipeline."*

**The evidence kind:** `license-declaration` — one of the four closed
evidence kinds of the scorecard's evidence doctrine. Every
license-use-clearance outcome cites the provider profile's license
declaration (identifier + `commercialUse` + `intendedUseCleared`), which
the control plane's own profile validator type-checks (the derived
`evaluationOnly` flag must equal `!(commercialUse &&
intendedUseCleared)` — the `license-flag-inconsistent` invariant).

## The cleared providers (the passing posture)

The geometry-eval lanes and the HFX-000 v1 fixture declare
`fixture-permissive-1.0`:

```json
{
  "identifier": "fixture-permissive-1.0",
  "commercialUse": true,
  "intendedUse": "deterministic … evaluation behind the AISE geometry-eval harness",
  "intendedUseCleared": true,
  "evaluationOnly": false
}
```

→ the gate PASSES: *"license 'fixture-permissive-1.0' clears commercial
use and the declared intended use for production."*

## The refusal-path provider (the demonstration this document exists for)

`geometry-substitute-fine-research@1.0.0-discretized` is the ENGINEERED
drill provider: the fine substitute's deterministic engine and its full
strong benchmark (all 22 corpus cells compatible, zero divergent points,
every other gate PASSING), under a RESEARCH-ONLY license posture:

```json
{
  "identifier": "fixture-research-only-1.0",
  "commercialUse": false,
  "intendedUse": "research and evaluation of geometry/validation substitution providers
                  only — NOT cleared for production deployment (the HFX-401 refusal-path
                  demonstration)",
  "intendedUseCleared": false,
  "evaluationOnly": true
}
```

→ the gate FAILS with exactly this evidence, and the promotion engine
REFUSES on exactly this gate (the one and only non-passing gate on the
scorecard — a strong benchmark with one mandatory-gate failure). The
committed records:

- `runs/scorecard-geometry-substitute-fine-research-1-0-0-discretized.json`
  — the scorecard: nine gates PASS, `license-use-clearance` FAIL, verdict
  NOT production-eligible, every other dimension green;
- `runs/promotion-geometry-substitute-fine-research-1-0-0-discretized.json`
  — the promotion record: the engine's refusal (named gate:
  `license-use-clearance`, kind `mandatory-gate-failed`) AND the REAL
  control-plane rejection — the drill drives the lawful lifecycle
  (registration → evaluation → executions → consolidated record → sealed
  manifest) and requests the promotion; the control plane's own license
  gate refuses with the typed `license-blocked` refusal and the
  `promotion-decided{rejected}` event is recorded. Both layers refuse
  independently; there is no override path.

This mirrors the committed HFX-000 v2 fixture
(`fixture-depth-provider@1.1.0-fixture-v2`, license
`fixture-research-only-1.0`, committed lifecycle: rejected with
`license-blocked`) — the earlier module's own committed evidence of the
same rule, consumed here as a scored provider.

## Why this matters (the rule in one paragraph)

Training and evaluation are separate decisions. A provider whose
benchmark metrics are excellent — the fine-research provider's metrics are
IDENTICAL to the approved fine substitute's — still cannot become the
production default while its licensing/intended-use terms are not
explicitly cleared, because nothing evaluation-only may silently enter a
commercial pipeline. The gate is enforced in code at THREE independent
layers: the control plane's profile validator (the `evaluationOnly`
derivation invariant), the control plane's promotion gate
(`license-blocked`), and the HFX-401 scorecard engine
(`mandatory-gate-failed` + the refusal naming the gate). A strong
benchmark score does not override any of them.
