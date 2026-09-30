# @aise/anchoring-contract

The **SHARED ANCHORING CONTRACT** of Work Item **ANCHOR-002** (docs/anchoring-contract-work-orders-2026-09-30.md): the provider-neutral anchoring port lifted from the delivered ANCHOR-001 spike (`docs/productization-evidence/ANCHOR-001/` — frozen, read-only) into a typed zod-coded contract in `packages/`, following the `@aise/solution-contract` codec discipline.

**Every anchoring provider and every anchoring consumer implements against the same closed wire shapes, the same AISE-owned identity discipline and the same fail-closed laws** — keeping "no provider type crosses the canonical contract" PHYSICALLY true (a process boundary), not merely conventional (PORT.md §1).

## Layout

```text
src/anchoring-contracts.version.ts   the contract version + the NEW port id
src/vocabularies.ts                  the closed, versioned vocabularies (+ the gate order)
src/request.ts                       the AnchoringRequest zod wire schema (HANDEDNESS LAW included)
src/response.ts                      the AnchoringResponse zod wire schema (typed PARTIAL included)
src/codec.ts                         the codec engine (decode / decodeStrict / encode)
src/codecs.instance.ts               the two concrete codecs
src/guard.ts                         the AISE-side output guard (the boundary law, typed)
src/laws.ts                          the constructive port laws + the declared gate order
src/runner.ts                        the supervised subprocess runner (input digest, timeout, stdio JSON, output guard)
src/registration.ts                  the evaluation-stage reference-lane registration (pure derivation)
src/index.ts                         public API (functions + frozen constants ONLY)
src/*.test.ts                        the co-located invariant/negative suites (95 tests)
scripts/generate-registration.ts     regenerates the committed registration artifacts (drift-checked by tests)
```

## The wire contract

`AnchoringRequest` (AISE → provider, stdin JSON) and `AnchoringResponse` (provider → AISE, stdout JSON) over the port id **`anchor002-anchoring-contract/1`** — never the spike's disposable `anchor001-anchoring-port/1` (pinned by literal and by the guard).

- `schemaVersion: 1`, `authority: "AISE"`, `units: "SI"`, AISE-owned 64-hex sha-256 content ids the provider re-verifies against the bytes digest, the `bytesPath` convention, and the **rasterToScene HANDEDNESS LAW as a first-class typed field** (`xDirection: "east-right"`, `yDirection: "north-up"` — closed literals; PORT.md §5 carried verbatim: leaving raster handedness implicit is how a future adapter silently produces mirrored anchors that pass every numeric gate).
- The outcome vocabulary is **`anchored | partial | refused`** (closed, versioned). The typed PARTIAL outcome is designed in at the contract layer: the anchored stills carry their hypotheses; the refused stills carry their typed per-still reason codes from the closed per-still vocabulary; `partialSummary` counts must match the arrays exactly (guard-enforced).
- Provenance is provider-neutral and closed-fielded: component versions ride in `components` (name+version pairs), every parameter is echoed verbatim in `config`, and **`externalReferences` is the ONLY home a provider-side reference may ever take.**

## The three port laws (PORT.md §4, typed and tested)

1. **No provider type crosses.** The provider is a subprocess over stdio JSON; the guard refuses unknown fields AT EVERY NESTING LEVEL WITH THE FIELD NAMED (typed `unknown-field` violations); `decodeStrict` refuses unknown keys at any object nesting level (issue code `unrecognized_keys`).
2. **AISE owns identity.** Content ids are echoed, never invented (guard `identity-echo`); `executionId` must be the request's; every requested still is accounted EXACTLY ONCE across hypotheses ∪ refusedStills (guard `partial-accounting`); provider refs live only in `provenance.externalReferences`.
3. **Fail closed BEFORE anchoring.** The declared gate order is frozen data — `input-sanity → content-id-re-verification → evidence-method-support → plan-context-support → parameters` (an earlier gate's refusal wins, `firstFailingStage`); every refusal carries a typed `reasonCode` from the closed vocabulary and ZERO hypotheses (no fabricated anchors — enforced at construction AND by the guard).

## The supervised subprocess runner

`runSupervisedAnchoring(request, { command, args, timeoutMs, cwd?, env? })` — the GBIM-004 pattern: canonical request bytes with the sha-256 **input digest recorded** (and re-verified against the provider's echo — a mismatch is the typed `input-digest-mismatch` failure); a **timeout enforced** with an explicit SIGKILL supervision timer (kernel-guaranteed — a provider that defers SIGTERM cannot outlive its supervision); stdout must be JSON (`invalid-json`) and must **pass the output guard** (`guard-refused` with every typed violation); spawn failures and non-zero exits are typed with bounded stderr excerpts. Failure vocabulary (closed): `spawn-failed | timeout | nonzero-exit | invalid-json | guard-refused | input-digest-mismatch`.

## The evaluation-stage registration

`src/registration.ts` derives — deterministically, from DECLARED values carrying the frozen ANCHOR-001 measurement evidence — the OpenCV SIFT+RANSAC reference lane's `ProviderProfile`, `BenchmarkRecord`, `ProvenanceManifest` and lifecycle through `@aise/provider-registry`:

```
provider-registered → evaluation-started → execution-normalized ×2 → benchmark-recorded → provenance-sealed
final state: benchmarked  (promotion NOT attempted — NOT a default provider)
```

The lane stops one gate short of promotion BY DESIGN: the profile's license declares the production intended use NOT cleared (`evaluationOnly` derives true — the production adapter is gated on a real-photoset evidence run, `ANCHOR-001/recommendation.md`'s own gate), so a promotion request today answers the typed `license-blocked` refusal (provable via `evaluateReferenceLanePromotion()` without appending any decision event). The committed artifacts under `docs/productization-evidence/ANCHOR-002/registration/` re-derive byte-identically — drift in either direction fails `bun run verify`.

## Determinism and boundaries

Pure deterministic computation over declared inputs: no network, no clock reads, no randomness, no environment senses. The package imports only `@aise/shared-contracts` (canonical JSON + primitives), `@aise/provider-registry` (the control plane) and `zod` — no new external dependency was added to the program (the lockfile change is the workspace registration edge only). Workspace boundary rules: `packages` imports `packages` only.

## Out of scope (owned elsewhere)

Any production adapter promotion; the real-photoset run; line-art plan registration (a separate method lane, a separate future adapter); 3D/elevation anchoring; budget calibration beyond carrying the v2.1 declaration forward — see the work order's OUT OF SCOPE and `docs/productization-evidence/ANCHOR-002/deferment.md`.
