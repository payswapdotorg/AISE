# HFX-201 — Benchmark Report (the deterministic run)

**The captured output of the committed-artifact check runner** — the
deterministic benchmark run of the two registered Qwen3-VL candidate
profiles over the 12-scenario multimodal corpus (24 runs).

- **Command:** `bun tools/vlm-eval/runner.ts`
- **Commit:** `975e61ad0068380652545d784888741aa19d1bd7` (branch
  `hfx-201/vlm-provider-benchmark`; base `7b90d70bc0309bbac790af9713fad4de17c9e984`)
- **Exit code:** 0 — `RUNNER: PASS`
- **Execution mode:** deterministic in-repo fixture doubles — no live
  model, no network, no clock, no randomness. Re-running the command at
  this commit reproduces this output byte-for-byte (all digests are
  content-addressed over canonical JSON).

## The captured output

```text
HFX-201 qwen3-vl provider benchmark — committed artifact check runner
  suite: qwen3-vl-provider-benchmark/1 (version 1.0.0)
  execution mode: deterministic in-repo doubles (no live model, no network)
  registered profile: qwen3-vl-8b @ 8b-eval-doubles-1 — license: evaluation-only (registry state: rejected, promotion refused: ["license-blocked"])
    fixture runs: 12
  registered profile: qwen3-vl-30b-a3b @ 30b-a3b-eval-doubles-1 — license: evaluation-only (registry state: rejected, promotion refused: ["license-blocked"])
    fixture runs: 12
  runs: 24 (12 base scenarios × 2 variants), expected matches: 24
  classifications:
    none: 13
    perception-failure: 4
    retrieval-failure: 1
    unsupported-data: 6
  behavior-matrix cells:
    conflicting-evidence: 4
    grounded-pass: 10
    missing-evidence: 6
    unsupported-question: 4
  provenance-manifest digests:
    qwen3-vl-8b: 816eb7eaf9a85f5d9cef5d8eb4296555ae2f45ad3156338ddd82423a3defb71f
      benchmark record: 8c5d66dfaef6b53034e2a5a0b57191efc2d847cc4c3352d8244f95686dcb8c62 (comparability key: qwen3-vl-multimodal-benchmark/1|multimodal-reasoning)
    qwen3-vl-30b-a3b: a88d45c27722add529778aaf9c82d05a421afa63d81806860994f83c1deb8557
      benchmark record: 48747b88ea59f817247b11f159cd3b3ca9b337e4006677de678158c155f2a017 (comparability key: qwen3-vl-multimodal-benchmark/1|multimodal-reasoning)
  [pass] coherence-suite-identity: both artifacts pin suiteId 'qwen3-vl-provider-benchmark/1', benchmarkId 'qwen3-vl-multimodal-benchmark/1' and code version 'hfx-201/vlm-eval/1'
  [pass] coherence-run-identity: 24 runs with unique composed ids (<base>@<variant>)
  [pass] coherence-outcome-alignment: the outcome ids align 1:1 with the scenario ids
  [pass] coherence-both-variants-run-the-same-corpus: 12 base scenarios × both registered variants = 24 runs of the SAME corpus
  [pass] coherence-canonical-form: both committed artifacts are canonical JSON (sorted keys, 2-space, trailing newline)
  [pass] candidates-two-separate-profiles: two separate registered profiles: qwen3-vl-8b (8b-eval-doubles-1), qwen3-vl-30b-a3b (30b-a3b-eval-doubles-1)
  [pass] candidates-evaluation-only: both registered candidates are evaluation-only (upstream license terms not verified as clearing production use)
  [pass] candidates-license-gate-refused: the control-plane promotion gate REFUSED both candidates with the typed license-blocked refusal (recorded, never silent)
  [pass] behavior-matrix-all-cells-exhibited: every variant exhibits every mandated behavior-matrix cell (grounded-pass, missing-evidence, conflicting-evidence, unsupported-question)
  [pass] behavior-hallucination-caught: all 5 hallucinating runs are caught: a closed-vocabulary classification + deterministic grounded-check observations (no invented measurement survives)
  [pass] behavior-invented-facts-are-unsupported-data: an asserted measurement/material/observation absent from the bundle is recorded as an unsupported-data failure by the fact-derivability check
  [pass] behavior-no-silent-conflict-resolution: silently resolving a bundle conflict is a retrieval failure (both sides must be surfaced); the honest run surfaces it as conflicted
  [pass] vocabulary-closed: every classification, violation kind and grounded observation kind comes from the closed nine-kind vocabulary
  [pass] emission-content-addressed: every run carries 64-hex recordId/manifestId/envelopeDigest (content-addressed artifacts)
  [pass] emission-metrics-consistent: every run matched its expected golden (classification + envelope + grounded checks + revision binding), metrics consistent
  [pass] emission-records-comparable: both consolidated benchmark records are content-addressed and share the comparability key (a future real-model run joins here without schema change)
  [pass] emission-provenance-manifests-sealed: both provenance manifests are sealed (64-hex digest-verifiable ids) and the registry lifecycle replays identically
  [pass] revision-binding-exact: every cited evidence id is bound to the exact revision its bundle declares (answers bind to evidence revision and task/context)
  [pass] uncertainty-propagated: the measured video runs carry measurement uncertainty propagated verbatim from cited evidence (never provider-fabricated)
  [pass] summary-recomputes: the committed suite summary re-derives from the outcomes alone (independent arithmetic)
  [pass] summary-same-corpus-per-variant: each registered variant executed the same 12-scenario corpus (24 runs total)
RUNNER: PASS
```

## The gate run at the same commit

```text
$ bun run verify
  5235 pass
  0 fail
  72002 expect() calls
  Ran 5235 tests across 326 files.
==> boundaries
  scanned 887 source files across apps/, backend/, packages/, tools/
  no cross-zone import violations
VERIFY: PASS

$ bun run typecheck   → VERIFY: PASS
$ bun run lint        → VERIFY: PASS
```

Baseline at the base commit was 5105 pass / 0 fail; this work item adds
**130 new tests** (113 co-located backend module tests + 17 tools gate
tests), all green, zero regressions.

## Per-variant outcome counts (the committed demonstration profiles)

| Classification | Qwen3-VL 8B | Qwen3-VL 30B-A3B |
|---|---|---|
| none (clean) | 5 | 8 |
| perception-failure | 3 | 1 |
| retrieval-failure | 1 | 0 |
| unsupported-data (honest refusals) | 3 | 3 |

Deterministic grounded-check observations: 8B `{unsupported-data: 3,
reasoning-failure: 2, retrieval-failure: 1}` (6 total); 30B-A3B
`{unsupported-data: 1, reasoning-failure: 1}` (2 total). Both variants
pass all four behavior-matrix cells and record 2 runs with propagated
measurement uncertainty (σ 0.05 mm, verbatim from cited video evidence).

**Honesty note:** these counts measure the deterministic doubles'
scripted demonstration capability profiles, not measured model behavior —
see `provider-comparison.md`.
