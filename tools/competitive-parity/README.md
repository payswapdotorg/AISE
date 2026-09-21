# Competitive-parity equivalence harness (PROD-018)

The cross-adapter semantic-equivalence harness: **browser / mobile /
desktop produce semantically equivalent engineering results**, proven by
composing the adapter wave's COMMITTED artifacts — never adapter code (the
boundary matrix forbids tools → apps imports, and the packet's own rule:
"the equivalence harness consumes the sibling adapters' COMMITTED
ARTIFACTS, not their code").

## What it consumes (all committed, no live devices)

| Artifact | Where |
|---|---|
| The PROD-016 fixture corpus | `packages/adapter-contract/fixtures/**` |
| The committed JSON Schemas + manifest | `packages/adapter-contract/schemas/**` |
| The browser adapter's conformance evidence | `docs/productization-evidence/PROD-017/conformance-report.md` |
| The mobile adapter's conformance evidence | `docs/productization-evidence/PROD-019/conformance-report.md` |
| The desktop adapter's conformance evidence | `docs/productization-evidence/PROD-020/conformance-report.md` |
| The committed reference profiles + negotiation fixtures | the corpus's `capability/` family |

## What it proves (the five flows)

1. **corpus-substrate** — the committed corpus is complete and parseable:
   every registered object family has ≥ 1 valid fixture (the C0 substrate,
   computed directly); the corpus's canonical digest is pinned.
2. **task-intent-roundtrip** — the three adapters' decodable TaskIntent
   outputs are semantically equivalent: each adapter's committed C2
   (round-trip-lossless) + C3 (wire-bytes-identical) PASS over the SAME
   corpus proves each emission is canonically equal to the fixture, so the
   emissions are canonically equal to each other (transitivity through the
   one shared lossless contract).
3. **presented-fields** — every schema-required field of every object
   family (computed from the committed schemas as data) is presented by
   all three adapters (their committed C4/C5 PASS): the same semantic
   content surfaces on every platform.
4. **honest-states** — the denial / operation-failure / blocked-action
   scenario fixtures surface identically on all three adapters (their
   committed C7/C8/C9 PASS): honest states are carried, never swallowed.
5. **negotiation-results** — the committed negotiation fixtures satisfy
   the shared contract's own invariants (read from the committed
   CapabilityNegotiation schema as data: blocked ⇒ NO interaction modes;
   permitted ⇒ every domain satisfied; degraded ⇒ non-blocking shortfall;
   the fixed domain order; the reason-null discipline; the vocabulary
   enums), the same requirement set carries the same `requirementsRef` +
   `contractVersion` on every platform, and the platform-honest verdicts
   (browser **blocked** / mobile **permitted** for depth capture) are
   exactly what the adapters' evidence documents state — the honest
   difference is the platform, never the semantics.

## The equality semantics

Canonical forms, not incidental formatting: two payloads are semantically
equal iff their `canonicalJson` forms (recursively sorted object keys) are
equal — the same canonical-bytes discipline the contract package's codec
and the Android mirror's codec both state.

## Layout

```
tools/competitive-parity/
  corpus.ts            the committed-corpus + schema loaders, canonicalJson/digest
  adapters.ts          the three adapters' committed artifacts (incl. the
                       evidence-report parsers)
  equivalence.ts       the five flows + the report computation
  report.ts            the regeneration CLI (writes the committed report)
  equivalence.test.ts  the gate tests (picked up by the root bun test)
  fixtures/
    equivalence-report.json   the COMMITTED machine-readable report (the
                              harness's fixture — drift fails the gate)
```

## Running

```bash
bun test tools/competitive-parity    # the gate tests
bun tools/competitive-parity/report.ts   # regenerate the committed report
```

The gate tests run under the root `bun run verify` (the tools/ test
pattern). If you deliberately change the corpus, a committed schema, an
evidence document or the harness itself, regenerate the report and commit
it — the freshly computed report must equal the committed fixture
byte-for-byte.

The human-readable summary of the results lives at
`docs/productization-evidence/PROD-018/equivalence-summary.md`.
