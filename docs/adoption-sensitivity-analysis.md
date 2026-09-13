# AISE Adoption Sensitivity Analysis

This is a planning model, not empirical market evidence. Pilot measurements must replace the synthetic assumptions before external claims are made.

## Baseline calibration

| Segment | Primary interface | Exclusive interface |
|---|---:|---:|
| Large firms | 86% | 47% |
| Small/medium firms | 94% | 75% |
| Total | 90% | 61% |

Baseline integration quality = 0.75; switching friction = 0.45; project type = commercial/building.

## Sensitivity ranking

| Variable | Primary sensitivity | Exclusive sensitivity |
|---|---:|---:|
| Incumbent integration quality | ~18.9 pp | ~17.5 pp |
| Firm size | ~9.2 pp | ~24.3 pp |
| Switching friction | ~6.8 pp | ~51.2 pp |
| Project type | ~3.3 pp | ~9.7 pp |

These are marginal swings across the tested factor levels in the synthetic model.

## Interpretation

Primary-interface adoption is mainly an integration/product-value problem: AISE must work over and through the existing construction stack.

Exclusive adoption is mainly a switching-cost problem. Large organizations retain contractual, procurement, BIM/CAD, identity and system-of-record constraints even when AISE is preferred.

Project type matters less than integration and switching friction in this model. Maintenance/retrofit is the strongest adoption context; infrastructure/civil is the weakest.

## Full-factorial range

Primary interface ranged from 56.3% to 98.2%. Exclusive interface ranged from 8.7% to 94.3%.

Best modeled case: small/medium + maintenance/retrofit + integration 1.0 + friction 0.1 → 98.2% primary / 94.3% exclusive.

Worst modeled case: large + infrastructure/civil + integration 0.4 + friction 0.85 → 56.3% primary / 8.7% exclusive.

Large-firm best case in the model: 95.5% primary / 83.1% exclusive.

## Product consequences

1. Make AISE the fastest way to understand and act on a project.
2. Make incumbent systems accessible from inside AISE through durable connectors.
3. Instrument workflow switching friction instead of guessing it.
4. Migrate one workflow at a time when semantic equivalence is demonstrable.
5. Preserve rollback and the incumbent source of record until operational acceptance exists.

## Pilot metrics

Measure primary-interface share, exclusive-interface share by workflow, incumbent systems touched per task, manual re-entry, context-switch time, integration failures, permission burden, migration completion, rollback events, abandonment and task outcome quality.

Recalibrate the model from observed pilot data before using it for commercial forecasting.
