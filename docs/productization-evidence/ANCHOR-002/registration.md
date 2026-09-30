# ANCHOR-002 — The evaluation-stage registration (the OpenCV reference lane)

The spike's adapter enters the provider-evaluation control plane (`@aise/provider-registry`) per the substitution-contract §6 discipline: **registered → evaluation → execution → normalized result → benchmark → provenance — and promotion NOT attempted.** The lane is an EVALUATION-stage provider, NOT a default provider (nothing in the registration marks it default; no consumer surface consumes it; the state machine itself keeps it one gate short of promotion).

## The artifacts (committed, content-addressed, drift-checked)

All four re-derive byte-identically from the declared constants in `packages/anchoring-contract/src/registration.ts` (`bun packages/anchoring-contract/scripts/generate-registration.ts`); `src/registration.test.ts` re-derives and compares against the committed bytes AND re-reads the frozen ANCHOR-001 evidence files to assert the declared constants still match them — drift in either direction fails `bun run verify`.

| artifact | identity | notes |
| --- | --- | --- |
| `registration/profile.json` | providerId `sift-homography-spike`, technologyVersion `anchor001-adapter/1`, profileDigest `1514841201c234d419a8a92df0f51ebef722540a5c64fa9f88e1cbf0dd6ad3f9` | the 15/15 mandatory fields; license Apache-2.0 with commercial use permitted BUT the production intended use NOT cleared → `evaluationOnly: true` (the real-photoset gate) |
| `registration/benchmark-record.json` | recordId `13e0d24ce30df185da260e177c26cf39e223b1068266ba5110d04888be2d88ea`, comparability key `anchor001-synthetic-fixture/1\|spatial-anchoring` | carries the FROZEN ANCHOR-001 measurements verbatim (fidelity class SYNTHETIC — never upgraded): mean/min/max floor-registration RMSE 0.034969 / 0.003762 / 0.088869 m; 10/10 stills anchored; 9/9 negatives fail-closed; 2 byte-identical deterministic runs (`457710cf…`); budget95 coverage 0.4 (the honest calibration miss — 6/10 exceptions, measurements.md §4); resources: local CPU, 512 MiB declared (not separately measured during the spike — recorded honestly), latency 15083/15225 ms (the two observed cold-process wall times) |
| `registration/provenance-manifest.json` | manifestId `23c283c1067655c05698b015f197ccde83c4dabe1f9ba0dea01db10e49abe4f8` | chains the profile (digest above), the spike's exact request-bytes digest `d270b8ff…`, the deterministic-projection normalized-result digest `457710cf…` (byte-identical across both runs), and the benchmark record (digest + reference); the environment fingerprint is DECLARED, NOT SENSED (python 3.12.14 / opencv 5.0.0 / numpy 2.5.3 / Linux x86_64, codeVersion the ANCHOR-001 merge `0dae7343a780ecdb1358d3f90c7facf2661a0d0f`) |
| `registration/lifecycle.json` | 6 events, final state `benchmarked` | provider-registered → evaluation-started → execution-normalized ×2 (the two spike runs) → benchmark-recorded → provenance-sealed; replays lawfully (`replayRegistry`) with zero promotion decisions |

## The promotion gate (proven, not attempted)

`evaluateReferenceLanePromotion()` (pure — appends NO decision event) answers at the delivered tree:

```
admitted: false
refusalKinds: ["license-blocked"]
```

— and ONLY that refusal: the benchmark-evidence and provenance-continuity gates PASS (the lane has its record and its manifest). The refusal is license-driven, not metric-driven: the profile's license declares the production intended use ("production floor-plan-to-photoset anchoring adapter behind the anchor002 anchoring contract") NOT cleared, because the real-photoset evidence run has not happened — the ANCHOR-001 recommendation's own gate, now enforced BY THE CONTROL PLANE rather than by convention. A future adapter work order that clears the intended use with real-photoset evidence registers a NEW technologyVersion and walks the same gates.

## What the registration is NOT

- It is NOT a promotion, NOT a default-provider selection, and NOT an execution of the reference adapter against the new contract (the frozen ANCHOR-001 measurements are carried as declared evidence, fidelity SYNTHETIC; the work order's OUT OF SCOPE names the production adapter and the real-photoset run explicitly — see `deferment.md`).
- It does not modify `packages/provider-registry` (the registration path is CONSUMED, not altered): the whole lifecycle is built from the package's public API (`applyRegistryEvent`, `sealProvenanceManifest`, `evaluatePromotionGate`), proving the registration path works for the anchoring lane as-is.
