# HFX-201 — Provider Comparison: Qwen3-VL 8B vs Qwen3-VL 30B-A3B

**The 8B vs 30B-A3B comparison record over the same corpus** (the
"provider comparison" evidence of the HFX-201 work order). Both
registered candidate profiles executed the identical 12-scenario
multimodal corpus (24 runs total); their consolidated benchmark records
join on the control plane's comparability key.

> **Honest note (carried by the record itself):** both runs exercise
> DETERMINISTIC IN-REPO DOUBLES standing in for the registered Qwen3-VL
> candidates — the per-variant outcome counts below measure the scripted
> demonstration capability profiles, **not measured model behavior**. A
> future real-model run slots into the same benchmark id, capability and
> comparability key without any schema change.

## The comparison record

| | **Qwen3-VL 8B** | **Qwen3-VL 30B-A3B** |
|---|---|---|
| providerId | `qwen3-vl-8b` | `qwen3-vl-30b-a3b` |
| technologyVersion | `8b-eval-doubles-1` | `30b-a3b-eval-doubles-1` |
| profile digest | `b98e6c5707984a6bc8a6451bb84eb7c04ad1db51da1b24460d83df4f9a3188e7` | `4ba1c9482c30bf6e93ebbbea239bf968a0d6549ecbf732f138bffbdf2fd3c512` |
| license status | evaluation-only | evaluation-only |
| registry state | rejected (`license-blocked`, recorded) | rejected (`license-blocked`, recorded) |
| benchmark id | `qwen3-vl-multimodal-benchmark/1` | (identical) |
| capability | `multimodal-reasoning` | (identical) |
| **comparability key** | `qwen3-vl-multimodal-benchmark/1\|multimodal-reasoning` | (identical) |
| consolidated benchmark record | `8c5d66dfaef6b53034e2a5a0b57191efc2d847cc4c3352d8244f95686dcb8c62` | `48747b88ea59f817247b11f159cd3b3ca9b337e4006677de678158c155f2a017` |
| provenance manifest | `816eb7eaf9a85f5d9cef5d8eb4296555ae2f45ad3156338ddd82423a3defb71f` | `a88d45c27722add529778aaf9c82d05a421afa63d81806860994f83c1deb8557` |
| scenarios executed | 12 (the same corpus) | 12 (the same corpus) |

## Outcome counts (the Layer-2 five-way classification)

| Classification | Qwen3-VL 8B | Qwen3-VL 30B-A3B |
|---|---|---|
| `none` (clean) | 5 | 8 |
| `perception-failure` | 3 | 1 |
| `retrieval-failure` | 1 | 0 |
| `unsupported-data` (the honest refusals) | 3 | 3 |
| classification matches / expected matches | 12 / 12 | 12 / 12 |

## Deterministic grounded-check observations

| Closed-vocabulary kind | Qwen3-VL 8B | Qwen3-VL 30B-A3B |
|---|---|---|
| `unsupported-data` (non-derivable claimed facts) | 3 | 1 |
| `reasoning-failure` (recomputation contradictions) | 2 | 1 |
| `retrieval-failure` (unsurfaced evidence / silent conflict resolution) | 1 | 0 |
| **total grounded failure observations** | **6** | **2** |

## Where the scripted doubles diverge (the demonstration hypothesis)

| Scenario | 8B double | 30B-A3B double |
|---|---|---|
| `lintel-flange-width-missing` | invents "flange width 150 mm" over missing evidence → caught (perception-failure + unsupported-data) | bounded refusal citing the found lintel + the missing dimension |
| `nameplate-inspection-date-illegible` | invents "inspected 2024-03-15" over the illegible region → caught (perception-failure + unsupported-data + reasoning-failure) | bounded refusal over the honest absence |
| `video-crack-width-hallucination` | claims 1.4 mm against the recomputed 1.1 mm → caught (perception-failure + unsupported-data + reasoning-failure) | grounded (1.1 mm, σ 0.05 mm propagated) |
| `beam-section-conflict-silent-resolution` | silently resolves W12x26 by dropping the stencil → caught (retrieval-failure on both layers) | surfaces the conflict (`conflicted`) |
| `spatial-ref-between-openings` | grounded (resolves the pier PIER-N-02) | mis-resolves the transitive reference ("curtain-wall glazing spandrel") → caught (perception-failure + unsupported-data + reasoning-failure) |

## The §HF-1 exit-gate dimensions (both records)

| Dimension | Qwen3-VL 8B | Qwen3-VL 30B-A3B |
|---|---|---|
| comparable benchmark record | content-addressed, same comparability key | (identical join) |
| provenance | sealed manifest, digest-verifiable, profile + 12 input digests + result digests + record digest | (identical shape) |
| uncertainty | 2 runs with propagated measurement uncertainty (σ 0.05 mm, verbatim from cited evidence — never provider-fabricated) | 2 runs (identical) |
| resource profile | declared-profile:gpu / 32768 MiB / 800–2500 ms (from the registered profile — declared, never sensed) | declared-profile:gpu / 98304 MiB / 1200–4000 ms |
| explicit failure behavior | 7 non-clean runs, every failure named from the closed vocabulary; all four behavior-matrix cells passed | 4 non-clean runs; all four cells passed |

## Reading the comparison honestly

- The doubles' differences are **authored demonstration data**: the 8B
  double is scripted weaker on missing-evidence hallucinations and
  conflict handling; the 30B-A3B double is scripted weaker on one
  transitive spatial reference. This exercises the comparison machinery
  in BOTH directions (neither variant is favored) — it is not a claim
  about the real models.
- Both variants refuse the out-of-capability questions identically
  (audio transcription; engineering code verification) and both surface
  the drawing/stencil conflict when scripted honestly.
- What IS real and reusable: the corpus, the declared I/O contracts, the
  envelope schema, the deterministic checks, the classification
  semantics, the records/manifests/comparability join and the license
  gate — a real-model run replaces only the execution, nothing else.
