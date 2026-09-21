# PROD-018 — Cross-adapter semantic equivalence summary

**Work item:** PROD-018 — competitive-parity and differentiation hardening
(composition).
**The harness:** `tools/competitive-parity/**` (bun-runnable, wired into
the root `bun run verify` via its committed tests — the same pickup as
the other tools/ suites).
**The committed machine-readable report:**
`tools/competitive-parity/fixtures/equivalence-report.json` (the harness's
fixture: the gate recomputes the report and compares byte-for-byte, so
any corpus / evidence / harness change without a regeneration
`bun tools/competitive-parity/report.ts` fails the gate).

## What was proven

**Browser, mobile and desktop produce semantically equivalent engineering
results.** The proof COMPOSES the adapter wave's committed artifacts
(the packet's mandate: the harness consumes the sibling adapters'
COMMITTED ARTIFACTS, never their code — the boundary matrix forbids
tools → apps imports, and the harness reads the corpus, the schemas and
the evidence documents as data):

| Composed artifact | Source |
|---|---|
| The PROD-016 fixture corpus (65 fixtures, 27 valid) | `packages/adapter-contract/fixtures/` |
| The committed JSON Schemas + manifest | `packages/adapter-contract/schemas/` |
| The browser adapter's conformance results (C0–C9 + negotiation claims) | `docs/productization-evidence/PROD-017/conformance-report.md` |
| The mobile adapter's conformance results (C0–C9 + fixture reproductions) | `docs/productization-evidence/PROD-019/conformance-report.md` |
| The desktop adapter's conformance results (C0–C9 + negotiation claims) | `docs/productization-evidence/PROD-020/conformance-report.md` |

### The equality semantics

Canonical forms, not incidental formatting: two payloads are semantically
equal iff their canonical JSON forms (recursively sorted object keys) are
equal — the same canonical-bytes discipline the contract package's codec
and the Android mirror's integer-only codec both state. Pinned by tests
("semantically equal payloads with different formatting compare EQUAL",
"semantically different payloads compare UNEQUAL").

### The five flows (all PASS)

1. **corpus-substrate** — the committed corpus is complete and parseable:
   every one of the 15 registered object families has ≥ 1 valid fixture
   (the C0 substrate, computed directly); the corpus digest
   (`sha256:fc04f149…e17e59`) is pinned in the report.
2. **task-intent-roundtrip** — the three adapters' decodable TaskIntent
   outputs are semantically equivalent: each adapter's committed C2
   (round-trip-lossless) + C3 (wire-bytes-identical) PASS over the SAME
   corpus proves its emission is canonically equal to the fixture — so
   the three adapters' emissions are canonically equal to each other
   (transitivity through the one shared lossless contract). The shared
   fixture's canonical digest is pinned.
3. **presented-fields** — every schema-required field of every object
   family (computed from the committed schemas as data) is presented by
   all three adapters (their committed C4/C5 PASS): the same semantic
   content surfaces on every platform.
4. **honest-states** — the denial / operation-failure / blocked-action
   scenario fixtures (canonical digests pinned) surface identically on
   all three adapters (their committed C7/C8/C9 PASS): honest states are
   carried, never swallowed.
5. **negotiation-results** — the committed negotiation fixtures satisfy
   the shared contract's own invariants (read from the committed
   CapabilityNegotiation schema as data): blocked ⇒ NO interaction modes;
   permitted ⇒ every domain satisfied; degraded ⇒ a non-blocking
   shortfall; the fixed domain order; the reason-null discipline; the
   vocabulary enums. The same requirement set carries the same
   `requirementsRef` + `contractVersion` on every platform. The
   platform-honest verdicts — **browser blocked / mobile permitted for
   depth capture; desktop blocked; browser permitted for BOQ review;
   desktop degraded for the offline field queue** — are exactly what the
   adapters' evidence documents state, and the mobile adapter's committed
   reproduction of its fixtures is EXACT. The honest difference is the
   platform, never the semantics: negotiation changes capture method and
   operator burden, never the truth standard.

### Discrimination (the checks are real, not vacuous)

The committed sabotage tests prove each check fails loudly on tampering:
a BLOCKED negotiation that permits interaction modes FAILS; a SATISFIED
domain carrying a reason FAILS; an UNSATISFIED domain without a reason
FAILS; a PERMITTED negotiation with an unsatisfied domain FAILS; an
out-of-vocabulary outcome FAILS; a drifted committed report FAILS the
fixture comparison.

### The adapters' committed results (parsed from the evidence docs)

| Adapter | Binding id | C0–C9 |
|---|---|---|
| browser | `browser-web-adapter` | all PASS |
| mobile | `android-mobile-field` | all PASS |
| desktop | `desktop-rich-shell-adapter` | all PASS |

## Verdict

**EQUIVALENT** — `equivalent: true` in the committed report; every flow
passes; every adapter's committed checks are all-PASS. The result is
reproducible: `bun test tools/competitive-parity` (the gate) and
`bun tools/competitive-parity/report.ts` (the regeneration + summary).
