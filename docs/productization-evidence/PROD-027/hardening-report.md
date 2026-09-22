# PROD-027 — Hardening Report (actionable failures the negative scenarios exposed)

**Not a scorecard.** Every finding below was surfaced while BUILDING the
harness and its negative/discrimination scenarios, is pinned by a test, and
carries a disposition (fixed here / worked around with a documented guard /
escalated with a pointer). The committed golden outcomes are in
`tools/reality-eval/fixtures/expected-outcomes.json`; the reproduction gates
are `backend/api/src/reality-eval/golden.test.ts` (live) and
`tools/reality-eval/benchmark.test.ts` (data).

## Finding 1 — The control plane's benchmark intake is single-shot; multi-scenario evaluation cannot attach its records

**What was found.** Building the suite runner exposed that the HFX-000
registry's lawful-transition table permits exactly ONE `benchmark-recorded`
event per provider lifecycle (`evaluation → benchmarked`, no return, and
`execution-normalized` is unlawful from `benchmarked`). The natural Layer-1
evaluation shape — one provider evaluated over MANY scenarios (fixtures,
device classes, negative probes) — therefore cannot attach its per-scenario
records to the registry log without terminating the provider's evaluation
phase after the first record.

**Where it surfaced.** The first suite run failed with
`unlawful transition: state 'benchmarked' cannot move to evaluation
(execution)` on the second reconstruction scenario.

**Disposition (worked around, deliberately).** The suite appends only the
lawful evaluation events per scenario (`execution-normalized` +
`provenance-sealed`, both `evaluation → evaluation`) and ends at
provenance-sealed; the per-scenario `BenchmarkRecord`s are INTAKE
CANDIDATES for the control-plane surface (`/v1/providers/benchmarks/intake`),
and promotion stays the control plane's governed decision. The harness
never self-promotes (asserted by the tools check runner and the golden
tests).

**Escalation pointer.** HFX-401 (the scorecard/promotion/rollback gate)
should either (a) allow `benchmark-recorded` from the `benchmarked` state
(an append-only record list per entry), or (b) model a benchmark-RUN
aggregate event. Either is a governed change to
`packages/provider-registry` (NOT this work item's surface).

## Finding 2 — The declared-contract vocabulary cannot bound signed quantities; the canonical projection must carry those invariants

**What was found.** The profile validator requires contract-field `min ≥ 0`
(the declared bound range is `[0, 1e9]`). Legitimately SIGNED canonical
quantities — plane normal components in [-1, 1], plane offsets d in ±room-scale —
cannot be bounded at the provider's declared output contract at all.

**Where it surfaced.** The first committed scenario set was REFUSED by the
control plane's own profile validation
(`outputContract.fields[0].min number -1.1 outside [0, 1000000000]`) — a
correct, loud refusal that revealed the vocabulary's shape.

**Disposition (guard added, pinned).** The reconstruction output contract
declares NO numeric bounds for the signed fields, and the canonical
projection (`projectReconstructionScene`) enforces the invariants instead:
count alignment, finiteness, UNIT normals (|n| = 1 within 1e-3), positive
dimensions, non-negative volumes — each violation a typed
`operation-semantic-failure` record, never a coercion. Pinned by
`harness.test.ts` ("a non-unit plane normal…", "contract-valid but
canonically ill-typed outputs…").

**Escalation pointer.** A future control-plane schema version may add
signed-bound support (`min`/`max` permitting negatives) — governed change,
HFX-000's owner.

## Finding 3 — The existing metrics engine THROWS on malformed scenes; the harness must pre-refuse at the projection

**What was found.** `computeFixtureMetrics` (the reused Layer-1 metrics
authority) throws on missing subjects
(`metrics: engine scene missing plane for surface X`). A provider result
whose outputs are contract-valid but canonically incomplete (wrong subject
counts) would CRASH a naive harness instead of producing a typed outcome —
violating the never-throw discipline.

**Where it surfaced.** The truncated-outputs discrimination scenario
(one plane fewer than the canonical fixture) — the count mismatch is
invisible to the declared contract (which cannot know the fixture's
surface count).

**Disposition (fixed here).** The canonical projection validates count
alignment, finiteness and the geometric invariants BEFORE the metrics run;
ill-typed content answers a typed `operation-semantic-failure` evaluation
record (verdict fail, `canonical_conformance` metric 0) — the comparison is
never performed over coerced shapes. Pinned by
`harness.test.ts`.

**Escalation pointer.** A governed change to
`backend/api/src/benchmetrics.ts` could return typed failures instead of
throws (AISE-019's surface — not this item's).

## Finding 4 — A naive threshold rule misses the NEGATIVE bias direction (signed metrics can evade)

**What was found.** `dimension_error` is SIGNED (measured − truth). A
threshold rule of `value > threshold` (instead of `|value| > threshold`)
catches the ×1.02 inflation but NOT the ×0.98 shrink — a provider whose
geometry is uniformly 2% small would pass a naive bar.

**Where it surfaced.** The mirrored-direction discrimination scenario
(hand-crafted ×0.98 shrink over the flagship fixture): all dimension_error
values go NEGATIVE.

**Disposition (fixed + pinned).** The GATE RULE is mirrored verbatim from
the benchmark engine's gates.ts (violation iff `Math.abs(value) >
threshold`, uniformly over signed metrics) and pinned by the dedicated test
"the GATE RULE catches a bias in the NEGATIVE direction too" — the ×0.98
shrink produces exactly the same 7 violations as the ×1.02 bias.

**Actionable for future lanes.** Every future lane (HFX-102/103/104) MUST
copy the absolute-value rule; it is documented in the model header and the
scenario-threshold docblock.

## Finding 5 — Class-tiered threshold tables have asymmetric sensitivity; a 2% systematic bias is sub-threshold on the midrange class for 2 of 5 metric families

**What was found.** Running the discrimination double against the
midrange-class thresholds (gates-1 `midrange_no_depth` rows) shows the ×1.02
bias is caught ONLY by `dimension_error` (0.06–0.07 m vs the 0.04 m bar):
`scale_error` 0.02 stays UNDER the 2.5% midrange bar and
`object_volume_error` 0.0612 stays far under the 15% bar. The flagship
class catches the same bias through three metric families.

**Where it surfaced.** During threshold calibration (the committed suite
pins the flagship discrimination scenario, where the catch is
unambiguous — 7 per-instance violations — but the midrange lanes'
coarser bars were measured honestly).

**Disposition (documented, not widened).** This is the EXISTING gates-1
table's deliberate class tiering (flagship critical / midrange review
thresholds), mirrored faithfully — the harness must not silently widen
another authority's bars. The committed midrange POSITIVE scenario pins the
honest midrange baseline; a midrange-class discrimination scenario would
rely on the single `dimension_error` family.

**Actionable.** If midrange-class systematic-bias detection matters
product-wise, the governed change is a gates-2 threshold table (AISE-019's
surface), not a harness-side tweak. The harness would pick it up
verbatim (scenario-declared thresholds cite the table rows).

## Finding 6 — Positional output alignment is a real confusion channel (and it IS caught per-subject)

**What was found.** The provider-neutral flat output contract is
positionally aligned with the fixture's canonical order (the input fixture
pins the order). A provider emitting correct values in the WRONG order
(permuting its surface list) produces plausible-looking numbers mapped to
wrong canonical subjects.

**Where it surfaced.** By construction analysis of the projection; the
per-instance metrics make it loud: a permuted `planeNormals` array maps
plane i to surface i, and the per-surface `registration_error` /
`plane_fit_rms` instances spike for exactly the mismatched subjects (the
ideal-engine baseline is 0/≈noise for every subject).

**Disposition (verified by the metrics' structure; no change needed).**
The per-instance discipline (R17 — aggregates never gate) is what makes
this detectable; a mean-only bar would hide it. Re-affirmed by every
committed record's per-subject metric instances.

## Finding 7 — Timeout evidence must be DECLARED by the adapter, never sensed by the harness

**What was found.** The closed vocabulary's `timeout` ("did not answer
within its declared latency budget") cannot be MEASURED by this harness:
the control plane reads no wall clock (the determinism contract —
"no clock reads, the log order IS the time"). A real adapter (HFX-101/102)
must declare the timeout observation itself when its own declared budget
is exceeded, exactly as the fixture double does for its declared trigger.

**Disposition (doctrine-consistent; documented).** The committed timeout
scenario demonstrates the lawful shape: the provider answers the explicit
`timeout` refusal (declared, with its declared budget in the detail); the
harness evaluates it as explicit-and-safe when the scenario's criteria
expected it. The record's resource observations are the profile's DECLARED
latency envelope, never a measurement.

**Actionable for HFX-101/102.** Adapter-side timeout measurement (where a
clock legitimately exists) must produce the closed-vocabulary observation
at the boundary — never a partial/fabricated result.

## What the negative scenarios proved robust (the strengths, briefly)

- **The canonical-boundary guard holds under smuggling**: a provider-specific
  output field (`mapAnythingNativeMesh`, a provider-specific failure KIND)
  is refused at the control-plane boundary (`normalization-refused`) —
  pinned twice (harness + service + router).
- **Opaque native payloads cannot rescue wrong outputs**: a deceptive
  `providerNative` claiming the honest engine + "correct" values leaves
  the perception-failure verdict unchanged — the native payload is never
  parsed (pinned).
- **Fabricated outputs where a refusal is expected are caught**: the
  unsupported-input scenario with a fabricated execution answers verdict
  fail + the expected-kind observation ("the negative path was not taken").
- **Unexpected explicit failures are recorded, never silent**: a timeout
  where outputs were expected is a caught failure (verdict fail).
- **The honest lane refusals are machine-readable**: capture-readiness and
  retrieval scenarios answer the typed `capability-lane-unavailable`
  refusal with a pointer to this evidence directory (pinned in harness,
  service and router tests).
