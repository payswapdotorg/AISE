# ANCHOR-002 — The Shared Anchoring Contract (evidence tree)

**Work item:** ANCHOR-002 — the shared anchoring contract Work Item, authorized by `docs/anchoring-contract-work-orders-2026-09-30.md` (commit `b846e1c`, "docs: authorize ANCHOR-002"), the ANCHOR-001 follow-through: the port lifted into a typed zod-coded contract in `packages/`, the handedness law carried, the PARTIAL outcome designed in, the supervised runner, the evaluation-stage provider registration; the production adapter gated on a real-photoset run — declared, not executed here.

**Charter:** `docs/anchoring-contract-work-orders-2026-09-30.md` §ANCHOR-002 is the ONLY authority for this work item's scope.

**Base SHA:** `b846e1cf5e58a7b4cbfc32ed98f343f6b73c13a4` (main; the authorization commit).

**Branch:** `work/anchor-002`.

**The question:** can the spike-proven `anchor001-anchoring-port/1` shape be lifted into ONE typed, provider-neutral anchoring contract in `packages/` following the `solution-contract` codec discipline — port laws as tested invariants, the typed PARTIAL outcome designed in, the supervised runner, and the reference lane registered at evaluation stage — additively, without touching any protected surface?

**The answer, in one line:** yes — `packages/anchoring-contract` (NEW port id `anchor002-anchoring-contract/1`) delivers the typed wire pair + the three port laws as 95 passing invariant/negative tests + the supervised runner (input digest recorded, timeout enforced via SIGKILL supervision, output guarded) + the evaluation-stage registration (final state `benchmarked`, promotion NOT attempted; a promotion request today answers the typed `license-blocked` refusal); `bun run verify` PASSES at the delivered tree: **6451/0** (baseline 6356/0 + 95 new), boundaries 1112 sources, zero violations, and the whole diff is additive (`packages/anchoring-contract/` + this evidence tree + the 11-line bun.lock workspace edge — zero external dependencies).

## Index

| file | content |
| --- | --- |
| `README.md` | this index + reproduce + protected-surface compliance |
| `SCORECARD.md` | the scorecard-shaped gate record (dimensions, verdicts, evidence lines) |
| `negative-ledger.md` | the contract-layer negative ledger — 18/18 FAIL-CLOSED OK |
| `registration.md` | the evaluation-stage registration artifacts and their digests |
| `deferment.md` | the deferment note naming the production adapter's real-photoset gate (+ the other §7 items) |
| `registration/profile.json` | the reference lane's ProviderProfile (15/15 mandatory fields; Apache-2.0; intended use NOT cleared → evaluation-only) |
| `registration/benchmark-record.json` | the benchmark record carrying the FROZEN ANCHOR-001 measurements (content-addressed) |
| `registration/provenance-manifest.json` | the portable, digest-verifiable provenance manifest |
| `registration/lifecycle.json` | the append-only lifecycle event log + derived entries + summary (final state `benchmarked`) |

The implementation itself is `packages/anchoring-contract/` (see its README): `src/` — version, vocabularies, errors, request/response zod schemas, codec engine, codecs, guard, laws, runner, registration, public API, and the co-located test suites; `scripts/generate-registration.ts` regenerates the registration artifacts deterministically.

## Reproduce

```bash
cd <repo root>                     # bun 1.3.14 (the CI pin), bun install --frozen-lockfile
bun run verify                     # VERIFY: PASS — 6451/0 across 427 files, boundaries 1112/0
cd packages/anchoring-contract
bun test                           # 95/95 (the +95 of the gate counts)
bun scripts/generate-registration.ts   # regenerates registration/*.json byte-identically
git diff --stat                    # additive only (see Protected-surface compliance)
git status --porcelain             # expected: CLEAN after generation (byte-identical)
```

The registration artifacts re-derive byte-identically from the declared constants in `src/registration.ts`, and `src/registration.test.ts` re-reads the FROZEN ANCHOR-001 evidence files (`results/reproducibility.json`, `results/measurements.json`, `results/run-1.json`, `results/negative-cases.json`) and asserts the declared constants still match them — drift in either direction fails `bun run verify`.

## Protected-surface compliance

The delivered diff at `work/anchor-002` (vs. base `b846e1c`) touches EXACTLY:

- `packages/anchoring-contract/` — the NEW package (additive only);
- `docs/productization-evidence/ANCHOR-002/` — this evidence tree (additive only);
- `bun.lock` — the workspace registration edge only (+11 lines; **zero external dependencies** — zod was already resolved for `@aise/solution-contract`).

NOT touched (verified by the diff and by the boundaries gate): `packages/solution-contract`, `packages/solution-engine` (canonical solution semantics — authoritative and unmodified), `docs/productization-evidence/ANCHOR-001/` (the spike evidence tree — frozen, read-only; read as evidence, never written), `packages/shared-contracts`, `backend/`, `apps/web`, `apps/android`, and every other pre-existing file.

## Environment notes (honest, recorded)

- bun 1.3.14 (the CI pin in `.github/workflows/ci.yml`); playwright chromium-1208 provisioned for the pre-existing PROD-030/031/QA-002 browser gates (environment provisioning, not a repo change).
- The repo was checked out at `/home/z/aise-anchor002` — OUTSIDE any parent JavaScript project. A checkout nested inside another project's `node_modules` tree contaminates TypeScript's `@types` walk-up resolution (the outer `@types/node` leaks into `bun-types`' resolution and breaks `process.on` overloads); a clean-checkout topology reproduces CI exactly.
- The reference provider (the spike's Python/OpenCV adapter) was NOT executed in this work order — by scope. The registration's benchmark record carries the FROZEN ANCHOR-001 measurements (synthetic fixture, fidelity class SYNTHETIC, never upgraded); exercising the reference provider against the NEW contract is the future adapter work order's first gate, together with the real-photoset run.
- Pre-existing environmental flake observed during baseline (not introduced by this work): the QA-003 live-API proofs are timing-sensitive on a loaded sandbox (1 flake in 4 full gate runs; passed on every retry and in the delivered run).
