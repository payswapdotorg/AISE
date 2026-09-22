# Reality evaluation benchmark harness (PROD-027)

The provider-neutral **Layer-1 reality/capture/retrieval evaluation benchmark**
of the AISE layer-hardening track: **one committed scenario set — three
deterministic fixture providers over the canonical Layer-1 golden fixtures
and the documented depth truth — executed end to end through the REAL
evaluation harness (`backend/api/src/reality-eval/`), the REAL control
plane (`@aise/provider-registry`), and the EXISTING benchmark metrics
(`backend/api/src/benchmarks/`), emitting content-addressed control-plane
`BenchmarkRecord`s + portable `ProvenanceManifest`s per scenario.**

## The scenario set (committed data)

`scenario.json` — the deterministic scenario-set descriptor (the
suite `reality-eval-layer1/1`): the fixture provider declarations
(`fixture-reconstruction-provider` v1 good / v2 degraded, and the
`fixture-reality-depth-provider` reference-pattern variant) plus the six
committed scenarios:

| # | scenario | class | capability | provider | the doctrine it proves |
|---|---|---|---|---|---|
| 1 | `recon-flagship-positive-001` | positive | reconstruction | recon v1 | the honest measured baseline (plane fits over the ground-truth-blind capture view) PASSES the gates-1-mirrored flagship thresholds |
| 2 | `recon-midrange-positive-002` | positive | reconstruction | recon v1 | the midrange device class passes its own (coarser) thresholds — device-aware bars, never assurance downgrades |
| 3 | `recon-flagship-discrimination-003` | discrimination | reconstruction | recon v2 | the ×1.02 plausible-but-wrong geometry is CAUGHT: verdict fail + RECORDED `perception-failure` observations (the day-27 rule) |
| 4 | `recon-timeout-negative-004` | negative | reconstruction | recon v2 | the documented explicit `timeout` refusal is evaluated as explicit-and-safe (never a fabricated partial result) |
| 5 | `depth-wall-positive-005` | positive | depth | depth v1 | the documented depth truth reproduced exactly (mae 0, max 0) |
| 6 | `depth-unsupported-negative-006` | negative | depth | depth v1 | the out-of-domain scene tag answers the explicit `unsupported-data` refusal — never fabricated depth |

The negative/discrimination doctrine is the benchmark's hard requirement:
**a provider that silently returns plausible-but-wrong geometry MUST be
caught by the criteria, and the harness must RECORD the failure (closed
vocabulary), not just low scores.** The two honest capability gaps
(`capture-readiness`, `retrieval`) are NOT fabricatable here — the harness
answers the typed `capability-lane-unavailable` refusal for them (see
`docs/productization-evidence/PROD-027/fixture-map.md`).

## The expected outcomes (committed fixture)

`fixtures/expected-outcomes.json` — the full committed golden body of the
suite run: the per-scenario evaluation projections (the verdict, the
control-plane `BenchmarkRecord` — content-addressed, closed-vocabulary
failure observations — and the digest-verifiable `ProvenanceManifest`)
plus the full append-only registry event log the suite produced
(3 registrations + 3 evaluation-starts + 6 × (execution-normalized →
provenance-sealed); the suite never self-promotes). Regenerate
deterministically:

```bash
bun backend/api/src/reality-eval/regenerate.ts
```

The regeneration CLI lives in the backend zone because the boundary matrix
forbids tools → backend imports: the suite must run through the REAL
harness + the REAL control plane, which only the backend zone can import.
The root `bun run verify` gate runs BOTH legs:

- `tools/reality-eval/benchmark.test.ts` — the tools-side CHECK RUNNER over
  the committed artifacts as data (the building-benchmark convention):
  typed seals, the suite digest, every record's content address, every
  manifest's content address + record chaining, every input digest, the
  closed failure vocabulary, the scenario↔record coherence + comparability
  keys, the lawful registry lifecycle, and the class doctrine — plus
  sabotage checks proving the checks themselves discriminate;
- `backend/api/src/reality-eval/golden.test.ts` — the backend-side LIVE
  leg: the freshly computed suite equals the committed fixture
  **byte-for-byte** (drift fails the gate), the records validate through
  the control plane's own validators, the manifests verify by digest, and
  the registry log replays deterministically.

## What the benchmark proves

1. **The provider-neutral Layer-1 entry point works end to end** — register
   a provider profile, start its evaluation, execute it over a canonical
   input fixture, normalize the declared result through the control-plane
   boundary, compare against the expected CANONICAL outcome (the Layer-1
   golden fixtures' ground truth / the documented depth truth) using the
   EXISTING benchmark metrics, and emit the control-plane artifacts.
2. **No provider-specific type ever crosses the canonical boundary** — a
   provider result carrying undeclared provider-specific fields is refused
   with the typed `normalization-refused` (contract-mismatch) refusal;
   native payloads stay opaque and can never rescue a wrong output.
3. **The criteria are per-instance and directional** — the GATE RULE
   (violation iff |value| > threshold, mirrored from the benchmark
   engine's gates-1 table) catches biases in BOTH directions; aggregates
   never gate (R17).
4. **The negative paths are explicit and safe** — timeout and
   unsupported-data refusals are lawful answers, evaluated and recorded as
   such; fabricated outputs where a refusal is expected are caught.
5. **Every record is content-addressed and every manifest is portable** —
   recordIds and manifestIds re-derive from their own content (verified as
   data by the tools runner, by validators in the live leg, and by the
   sabotage checks).
6. **The evaluation never self-promotes** — the suite ends at
   provenance-sealed; the benchmark-record intake and the promotion
   decision are the control plane's separate governed decisions.

## Layout

```
tools/reality-eval/
  scenario.json                    the committed scenario set (data)
  runner.ts                        the tools-side check functions (pure, data-only)
  benchmark.test.ts                the tools-side gate pickup (wired into bun run verify)
  fixtures/expected-outcomes.json  the committed golden records + registry log
  README.md                        this harness doc
```

The human-readable evaluation entry-point walkthrough, the Layer-1 fixture
map (the honest gap list), the hardening report and the integration notes
live at `docs/productization-evidence/PROD-027/`.
