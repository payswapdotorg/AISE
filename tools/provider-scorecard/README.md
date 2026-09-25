# HFX-401 — the provider scorecard / promotion / rollback runner

The STANDALONE tools-side check runner of the provider scorecard gate
(HFX-401). It consumes ONLY committed data — no package imports (the
workspace boundary matrix forbids tools → packages/backend), no network,
no clock, no randomness:

- `docs/productization-evidence/HFX-401/runs/lane-registry.json` — the
  scored-provider corpus projection (identities, digests, corpus rows,
  drill kits);
- `docs/productization-evidence/HFX-401/runs/*.json` — the committed
  scorecard / promotion / rollback records;
- `tools/geometry-eval/fixtures/expected-outcomes.json` — the committed
  HFX-302 corpus (the evidence universe + the row cross-check);
- `tools/equivalence-eval/fixtures/expected-outcomes.json` — the committed
  HFX-301 corpus (the Layer-3 dependent-layer citation).

## What it proves

1. **Registry coherence** — the lane registry's geometry/equivalence
   linkages match the committed HFX-302/HFX-301 artifacts digests and the
   committed HFX-000 lifecycle is the exit-gate shape (12 events; v1
   promoted, v2 license-blocked rejected).
2. **Row honesty** — every scored provider's corpus rows re-project
   identically from the committed HFX-302 outcomes (the reference lane and
   the three substitute lanes), the engineered provider mirrors its basis
   lane, and the fixture providers' records ARE the committed lifecycle
   events' records.
3. **The scorecard rebuild** — every committed scorecard record rebuilds
   BYTE-FOR-BYTE from the committed corpus data through the mirrored
   ten-gate derivation (the frozen gate vocabulary, the per-layer
   checklist, the evidence pointers), and its 64-hex content address
   re-derives from its own content.
4. **The evidence doctrine** — every one of the ten gates carries at least
   one committed evidence pointer, every evidence kind is accepted by its
   gate, every `committed-benchmark-id` pointer resolves in the committed
   record universe, and every NA carries a reason.
5. **The promotion decision** — every committed promotion record's
   decision re-derives from its cited scorecard (approved ⟺ every
   layer-mandatory gate passed; a forged approval is detected), the
   refusal names EVERY non-passing gate, and the control-plane traces
   (drill-registry event logs, the committed history walks, the
   counterfactuals) re-derive.
6. **The rollback drill** — the committed rollback record rebuilds
   byte-for-byte (the demotion event payload, the fallback config, the
   replay proof), and its replay set covers EVERY committed record naming
   the demoted provider.

## Commands

```bash
bun tools/provider-scorecard/runner.ts --list
bun tools/provider-scorecard/runner.ts scorecard <provider-id>
bun tools/provider-scorecard/runner.ts promotion <provider-id>
bun tools/provider-scorecard/runner.ts rollback <provider-id>
bun tools/provider-scorecard/runner.ts all
```

`all` runs every drill (77 checks at the committed corpus), re-verifies
every record and re-writes the files idempotently (canonical JSON —
byte-identical when nothing drifted). Exit code 0 = every check passed.

## The two-leg discipline

This runner is the committed-data leg; the backend-side golden test
(`backend/api/src/provider-scorecard/golden.test.ts`) is the live leg —
the freshly computed records must equal the committed files
byte-for-byte. Drift in either direction fails `bun run verify`.

The runner NEVER mutates the control-plane registry files: drills emit
event payloads as records; applying them to the live registry is the Tech
Lead's call.
