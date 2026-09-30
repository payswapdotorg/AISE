# GBIM-FT-001 — Verify transcript (docs-only build-inertness, demonstrated not assumed)

**Work order requirement:** "`bun run verify` must still PASS at the delivered tree (docs-only changes are build-inert, and that must be demonstrated, not assumed)" (`docs/geometry-follow-through-work-orders-2026-09-29.md` §GBIM-FT-001).
**Gate:** `bun run verify` = `bun tools/verify.ts` — sequentially `typecheck -> lint -> test -> workspace-boundary checks`, stops at the first failing step, always prints a final `VERIFY: PASS` or `VERIFY: FAIL` line. The gate's boundary scan covers `apps/, backend/, packages/, tools/` — the delivered files are markdown under `spec/governance/` and `docs/`, outside that scan surface, which is why a docs-only tree must still be proven inert by an actual run.

## Run 1 — baseline at the starting tree (base SHA `4a9087228c49ec1d21cfd4ea1b285188c167b350`, branch `work/gbim-ft-001` at base)

```
==> typecheck PASS
==> lint PASS (eslint)
==> test: 6356 pass / 0 fail, 81306 expect() calls, 419 files
==> boundaries: scanned 1090 source files across apps/, backend/, packages/, tools/
    no cross-zone import violations
VERIFY: PASS
```

**Environment note (honest record):** the first baseline attempt FAILED with 3 tests failing — `error: Chromium is not installed at '/home/z/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome'` (the PROD-030 browser-bundle gate and the PROD-031 browser-journey gate). This was a sandbox environment gap, not a repository regression; the gate's own error message names the fix (`bunx playwright install chromium`). After installing the Playwright Chromium browser into the sandbox (an environment change, not a repository change — nothing was committed for it), the baseline above passed at the unmodified base tree. No repo file was changed to make the baseline green.

## Run 2 — the delivered tree (all GBIM-FT-001 files in place: ACR-007, the GBIM-004 Work Item record, this evidence tree minus this transcript's final bytes)

```
==> typecheck PASS
==> lint PASS (eslint)
==> test: 6356 pass / 0 fail, 81304 expect() calls, 419 files
==> boundaries: scanned 1090 source files across apps/, backend/, packages/, tools/
    no cross-zone import violations
VERIFY: PASS
```

Identical outcome to the baseline: same pass/fail counts (6356/0), same file count (419), same boundary-scan count (1090 source files, 0 violations). The expect() call count varies slightly run-to-run (81306 vs 81304) — the same run-to-run variance the VOICE-003 transcript records ("the playwright browser-gate suites count live-mount expectations whose exact count varies slightly per run — pass/fail is stable at 0 fail", `docs/productization-evidence/VOICE-003/transcripts/bun-verify.txt`).

## The docs-only diff (the protected-surface proof)

At Run 2's tree, `git status --porcelain` shows **additions only** — no modification (`M`) of any tracked file:

```
?? docs/productization-evidence/GBIM-FT-001/
?? docs/shared-geometry-contract-work-item-2026-09-30.md
?? spec/governance/architecture-change-record-007.md
```

`git ls-files --others --exclude-standard` enumerates the delivered files:

```
docs/productization-evidence/GBIM-FT-001/README.md
docs/productization-evidence/GBIM-FT-001/acr-007-summary.md
docs/productization-evidence/GBIM-FT-001/deferment-ledger.md
docs/productization-evidence/GBIM-FT-001/work-item-summary.md
docs/shared-geometry-contract-work-item-2026-09-30.md
spec/governance/architecture-change-record-007.md
```

(plus this `verify-transcript.md` itself — the sixth file of the evidence tree). Zero files outside `spec/governance/` (the one new ACR) and `docs/` (the Work Item record + the evidence tree). ACR-001…006, the GBIM-000…003 spike evidence, the charter/work-order/scorecard documents, and all engine/package/app/tool code: untouched.

## Run 3 — final confirmation at the exact delivered tree (this file final)

```
==> typecheck PASS
==> lint PASS (eslint)
==> test: 6356 pass / 0 fail, 81304 expect() calls, 419 files
==> boundaries: scanned 1090 source files, no cross-zone import violations
VERIFY: PASS
```

(Recorded after the run; the tree as committed differs from Run 3's tree only by this line's own presence — a markdown line under `docs/`, outside the gate's scan surface, per the determinism contract of `tools/verify.ts`: "The same tree plus the same command must produce the same gate outcome.")

## Conclusion

**VERIFY: PASS at the delivered tree — the docs-only, build-inert claim is demonstrated:** the gate outcome is identical to the baseline (6356/0, 0 boundary violations) with a purely additive markdown diff. No existing ACR, spike evidence, or engine code was modified.
