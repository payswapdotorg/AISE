# HFX-303 — The Bounded Visual-Solution Provider Lane: Delivery Evidence

**Work item:** HFX-303 (P3 — WEB/3D; parent PROD-029; depends on PROD-024 + HFX-000)
**Work order:** `docs/productization-layer-hardening-work-orders.md` §"HFX-303 — Bounded visual-solution provider lane"
**Package:** `packages/visual-render` (`@aise/visual-render`)
**Runner:** `tools/visual-eval/run.ts` (standalone — never wired into `bun run verify`)
**UI seam:** `apps/web/src/viewer/generated/**` + two OPTIONAL fields on `ViewerInput`
**Base SHA:** `d11d03e44dbebb2b2cea069bffa7c7fb57ab6d2c` (5677/0, `VERIFY: PASS` at dispatch — reproduced here before any edit)

## What this delivery IS — and deliberately is not

The work order directs: *"Evaluate image/3D generation technologies such as
Apple SHARP and TRELLIS.2 strictly as visualization or hypothesis-rendering
aids, not engineering geometry authority."* This delivery builds **the
visual-rendering provider PORT — the governed, bounded lane** — and proves it
end-to-end. **No external model is integrated, nothing is downloaded, zero
new dependencies are added**: the lane is evidenced with three IN-REPO
deterministic providers (a reference hypothesis-renderer, an independently
implemented alternate renderer with a visibly different presentation style,
and an always-failing fixture). Real external visual-generation models
(SHARP, TRELLIS.2, future occupants) plug in behind exactly this port,
under exactly these laws. The PORT is the deliverable; the providers prove
the LANE.

## The five lane laws (the work order's acceptance criteria → proving artifacts)

| # | Acceptance criterion (verbatim from the work order) | Proving artifacts (tests + runner records) |
|---|---|---|
| 1 | **Generated visuals can never change quantities, validation or canonical Solution Graph state.** | `packages/visual-render/src/noninterference.test.ts` — *renders through EVERY provider leave the canonical state and version BYTE-IDENTICAL*; *quantities and validation verdicts re-derived AFTER every render are EXACTLY the no-visual baseline*; *the canonical PROJECTIONS are byte-identical after every render*. Runner: [`runs/noninterfere.record.json`](./runs/noninterfere.record.json) — per-case `canonical-state-bytes` / `canonical-version-bytes` / `quantity-value` / `validation-verdict` / `canonical-projection-bytes` comparison points, all `equal: true`, verdicts `noninterference-proven` ×3. Structural enforcement: the request carries presentation inputs ONLY (state identity + already-computed projection snapshots), CLONED and DEEP-FROZEN by `renderThroughLane` (`port.ts`). |
| 2 | **Every visual artifact is linked to a solution/state revision and provider profile.** | `packages/visual-render/src/provenance.test.ts` — *the artifact's provenance carries the FULL state revision + provider identity*; *sealing is DETERMINISTIC*; tamper-rejection negatives (tampered `stateId` / applied-operation sequence / provider digest / SVG body / label manifest all REFUSED); *an artifact presented for the WRONG state revision is rejected*. `port.test.ts` — *artifacts carry provenance binding the EXACT state revision*. Runner: the swap record embeds both artifacts' full provenance blocks. |
| 3 | **Provider replacement changes presentation only, not engineering semantics.** | `port.test.ts` — *swap changes presentation only: the two renderers produce DIFFERENT artifacts over the same state*. Viewer seam: `compat.test.ts` — *the alternate provider swaps in over the SAME state — different pane content, same canonical panes*. Runner: [`runs/swap.record.json`](./runs/swap.record.json) — per-case `presentation-bytes` comparison point deliberately `equal: false` (the renderings differ) while `canonical-state-bytes` / `canonical-version-bytes` / `canonical-projection-bytes` are `equal: true`; verdicts `substitution-proven` ×3. |
| 4 | **Missing/failed visual generation falls back to canonical 2D/3D views.** | `packages/visual-render/src/fallback.test.ts` — provider-failure and provider-absent records, digest binding to the canonical projections, tampered-record rejection, non-closed-vocabulary failure kinds refused. `apps/web/src/viewer/generated/fallback.test.ts` + `compat.test.ts` — the viewer renders the typed failure notice / provider-absent notice with ALL canonical panes intact. Runner: [`runs/fallback.record.json`](./runs/fallback.record.json) — verdicts `fallback-proven` ×3 (canonical projection digest binding + typed failure note). |
| 5 | **Generated details are labeled as generated/hypothetical where they exceed observed or deterministic geometry.** | `port.test.ts` — *the generated/hypothetical label manifest: every beyond-geometry region is labeled* (region join keys present in the SVG, manifest counts consistent); *the honest EMPTY case* (no canonical shapes → NO illustrative additions); *no numeric engineering claims ride the rendered text content* (the tolerance-free law). Viewer: `pane.test.ts` — the ALWAYS-PRESENT `GENERATED — HYPOTHETICAL VISUAL, NOT ENGINEERING GEOMETRY` banner, per-region labels, provenance block. |

Additionally delivered and proven: **the no-visual render path is
BIT-IDENTICAL to the pre-change viewer** — `apps/web/src/viewer/generated/golden.test.ts`
renders four committed goldens (`golden/*.html`, generated from the
PRISTINE base commit `d11d03e` before any seam edit) byte-for-byte, plus
the untouched-surface sweep; and `pane.test.ts` /
`fallback.test.ts` / `compat.test.ts` each prove the canonical panes are
byte-identical with and without the generated pane attached.

## The negative cases (the lane FAILS CLOSED)

| Negative case | Proof |
|---|---|
| A tampered provenance record is rejected | `provenance.test.ts` — five tamper twins (stateId, operation sequence, provider digest, SVG body, label manifest) all fail `verifyVisualArtifact` with `artifact-id-mismatch`; `renderThroughLane` converts the rogue artifact into a typed `contract-mismatch` refusal (`port.test.ts`). |
| A numeric mutation by a provider (simulated) is caught | `noninterference.test.ts` — the sabotage twin: through the governed lane the rogue's frozen-input mutation THROWS → typed refusal, canonical projections unchanged; with the lane BYPASSED the mutation lands and the byte-comparison DETECTS it. Runner: `runs/noninterfere.record.json` `sabotage` — `lane=defended`, `direct=detected`, verdicts `sabotage-caught` ×2. |
| The failing provider yields the canonical fallback (never a gap) | `fallback.test.ts` + `runs/fallback.record.json` + the viewer's fallback pane tests — the typed failure note rides the record; the canonical 2D/3D panes remain; the fallback statement is always present. |
| The no-visual path is bit-identical | `golden.test.ts` — four committed pre-change goldens rendered byte-for-byte; a pane leaking into the canonical render would break them. |

## How to re-run everything (one command each)

```bash
bun run verify                     # 5770 pass / 0 fail — includes all 93 HFX-303 tests
bun tools/visual-eval/run.ts --list        # the corpus inventory
bun tools/visual-eval/run.ts swap          # the provider swap trace
bun tools/visual-eval/run.ts noninterfere  # semantic non-interference + sabotage twin
bun tools/visual-eval/run.ts fallback      # the fallback drill
bun tools/visual-eval/run.ts all           # every drill; exit 0 = all records PASS
```

Every drill appends/reproduces its canonical-JSON record under
[`runs/`](./runs/) (repo SHA + per-case verdicts + comparison-point
digests). The runner is STANDALONE by design — the work order's evidence
is reproducible on demand, and `bun run verify` stays the sole quality
gate.

## The drill corpus (mirroring the eval-module fixture pattern)

| Case | What it is | Why it is in the corpus |
|---|---|---|
| `demo-world-baseline` | The demo wall-upgrade world's layer 0 (the pure baseline overlay; 4 canonical plan shapes) | "the demo world state" — the committed PROD-022/024 world, replayed through the engine's public surface |
| `demo-world-multi-operation` | The same world's final layer (after demolition-removal + block-wall-placement + plaster-application; 8 canonical plan shapes) | "one multi-operation state" — the richest live-content layer |
| `edge-empty-projection` | An edge world: no observed scene elements, one unanchorable operation → EMPTY canonical projections (1 honest omission) | "one edge/boundary state" — the honest-empty discipline (no shapes → no illustrative additions) |

Every case is ENGINE-PRODUCED (`replaySolution` over the contract's
committed intent fixtures, read by reference) and carries the canonical
projections computed with the documented AISE-021 formulas under the
solution workspace's default view. The mirrors are CROSS-CHECKED:
`apps/web/src/viewer/generated/compat.test.ts` proves the package's
projections equal the solution workspace's own `proposedOverlaysOf` +
`projectPolygon` over the same engine version.

## Control-plane integration (HFX-000 vocabulary, imported — never modified)

- The failure vocabulary (`FailureKind`, 9 kinds) is imported from
  `@aise/provider-registry`; providers cannot invent failure kinds
  (descriptor validation + the fallback record's fail-closed carry).
- Every lane provider is ALSO representable by the control plane's
  15-field `ProviderProfile` (`profiles.ts`), validates through
  `validateProviderProfile`, and registers lawfully in the append-only
  registry (`profiles.test.ts`).
- Every render execution can seal the control plane's portable
  `ProvenanceManifest` (`sealLaneProvenanceManifest`) — verified by
  `verifyProvenanceManifest` (`provenance.test.ts`).
- Provider profiles + descriptor digests: [`provider-profiles.md`](./provider-profiles.md).

## Honest statement of scope

The three providers are deterministic in-repo SVG fixtures proving the
LANE. No Apple SHARP, no TRELLIS.2, no Hugging Face model, no network
call, no downloaded weight, no new dependency (root `bun.lock` changed
only by the workspace registration of `@aise/visual-render` — zero
external packages). When a real visual-generation technology is evaluated,
it enters through `VisualRenderProvider` behind `renderThroughLane`,
carries a `ProviderProfile` + `VisualProviderDescriptor`, and is subject
to exactly the drills committed here — non-interference, provenance
binding, presentation-only swap, honest fallback and labeling — before it
may render anything a user sees.

## File map

```text
packages/visual-render/
  src/descriptor.ts        the visual-provider descriptor + closed vocabularies
  src/port.ts              the provider-neutral port + the governed lane entry
  src/provenance.ts        artifact sealing/verification + state-revision binding
  src/fallback.ts          the honest fallback policy + records
  src/profiles.ts          the control-plane ProviderProfiles (HFX-000 shape)
  src/corpus.ts            the deterministic drill corpus (engine replays)
  src/lane.ts              the lane-side JSON worker (boundary-clean transport)
  src/providers/reference.ts    the reference hypothesis-renderer
  src/providers/alternate.ts    the independent blueprint alternate renderer
  src/providers/failing.ts      the always-failing fixture
  src/*.test.ts            68 tests (descriptor/port/provenance/fallback/
                           profiles/noninterference/corpus)
tools/visual-eval/run.ts   the standalone drill runner (swap/noninterfere/
                           fallback/all; exit 0 = PASS)
apps/web/src/viewer/generated/
  model.ts                 structural mirrors of the lane's wire records
  pane.ts                  the generated pane (banner + labels + provenance)
  fallback.ts              the fallback notice
  golden/*.html            the pre-change no-visual goldens (bit-identity)
  *.test.ts                25 tests (golden/pane/fallback/compat)
apps/web/src/viewer/model.ts     +2 OPTIONAL fields (type-only mirrors)
apps/web/src/viewer/render.ts    optional composition AFTER the canonical panes
docs/productization-evidence/HFX-303/
  README.md                this document
  provider-profiles.md     the three provider registrations + digest examples
  runs/*.record.json       the committed drill records
```
