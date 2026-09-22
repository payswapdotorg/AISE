# PROD-014 — docs audit (every pointer verified; the stale ones and their fate)

**Work item:** PROD-014 · **Base:** `7b90d70bc0309bbac790af9713fad4de17c9e984`
**Method:** every documentation pointer the evaluator journey relies on was
resolved against the repository (file exists / anchor exists / claim true),
either by direct read or by executing the referenced command. The pointers I
FIXED are in my owned surface; the ones I could not touch are listed honestly
for the Lead.

---

## 1. Verified TRUE (no change needed)

| Pointer | Where it is referenced from | Verification |
|---|---|---|
| `docs/INSTALL.md` §1 prerequisites (Bun ≥ 1.2, no Node/Docker) | guide §2, bootstrap phase 1 | `bun --version` ran; nothing else was needed in the fresh clone |
| `docs/INSTALL.md` §3 clean-checkout install commands | guide §2, INSTALL.md box | executed in the fresh-clone transcript (attempt 1 ran `bun install` green) |
| `docs/INSTALL.md` §4 env reference + validate-env behavior | guide §2/§5 | `bun tools/validate-env.ts --mode start` executed with the demo overlay; the INVALID `DATABASE_URL` message reproduced verbatim |
| `docs/INSTALL.md` §5 auth/demo path (`POST /v1/auth/demo`, `whoami`, demo-open semantics, the curl legs) | guide §3A | executed verbatim against the running demo server — see the transcript |
| `docs/INSTALL.md` §6/§7 dev/start behavior (ports, `AISE_DATA_DIR` requirement, dist requirement) | bootstrap start phase | `tools/start.ts` orchestrated for real; health+web waits green |
| `docs/INSTALL.md` §8 smoke contract (port 8787, self-cleaning, `SMOKE: PASS`) | bootstrap phase 8 | executed; 6/6 assertions passed |
| `docs/INSTALL.md` §9 verify gate (`VERIFY: PASS`, single steps) | guide §4 | `bun run verify` → 5130/0, VERIFY: PASS |
| `docs/INSTALL.md` §10 ports table (5173/4173/8080/8787) | bootstrap prerequisites | all four ports probed/used exactly as the table says |
| `docs/INSTALL.md` §13 persistence (DATABASE_URL presence-switch; db:migrate/db:seed offline-safe exit 1) | bootstrap phases 4/5 | the shims' "nothing to migrate/seed" behavior honored by the honest skip |
| `docs/DEPLOYMENT.md` + `docs/free-tier-deployment.md` exist and describe the deployed shape | guide §1 promise 2 | read; the deployed URL matched (`x-vercel-id` host, gate, live API) |
| `docs/productization-state.json` `publicUrl` (https://aise-tan.vercel.app) | guide §1/§3B | opened in a real browser; the gate rendered |
| `docs/productization-evidence/PROD-010/TRANSCRIPT.md` (+ 19 journey screenshots) | guide §4 | exists; the golden-journey record |
| `docs/productization-evidence/PROD-011/TRANSCRIPT.md` | guide §4 | exists |
| `docs/productization-evidence/PROD-012/run-2026-09-20.txt` | guide §3B/§4 | exists; the two FAILs + the expected-401 exclusion note read |
| `docs/productization-evidence/PROD-012-R/remediation.md` (+ run-before/after) | guide §3B/§4 | exists; both fixes verified locally by that item |
| `docs/productization-evidence/PROD-017/browser-task-trace.md`, `PROD-018/capability-matrix.md`, `PROD-026/end-to-end-journey.md`, `PROD-027/`, `PROD-028/`, `PROD-029/`, `docs/COST-GUARDS.md` | guide §4 | all exist |
| `docs/interactive-engineering-solution-workflow.md` | (mandated reading) | read; the guide's Solution-leg description matches it |

## 2. Stale pointers FIXED by this item (each in my owned surface)

| Where | Was | Now | Why (verified stale by the fresh-checkout run) |
|---|---|---|---|
| `docs/INSTALL.md` top | no demo entry point | the **“Just want to see it run?”** box: `bun run demo` + the EVALUATOR-GUIDE.md link | the packet's mandated addition; the one command now exists |
| `docs/INSTALL.md` §3 | “`bun run dev` … (see §5)” | “(see §6)” | §5 is Auth; dev is §6 — read and confirmed |
| `docs/INSTALL.md` Contents | garbled: two overlapping duplicated lists (items 5–13 repeated twice with conflicting anchors) | one ordered 1–15 list matching the body's actual sections | read; the anchors now resolve |
| `docs/EVALUATOR-GUIDE.md` §3B step 6 (my own first draft) | described the task-first landing on the deployed Dashboard | describes the actual deployed landing + the repository-code note | my guided walk proved the deployed commit predates PROD-017 |
| `docs/EVALUATOR-GUIDE.md` §4 (my own first draft) | pointed at nonexistent `PROD-001/` and `PROD-011B/` evidence dirs | real paths | `ls docs/productization-evidence/` |
| `docs/EVALUATOR-GUIDE.md` §3B (my own first draft) | “awaiting their governed remediation” for the two PROD-012 findings | credits PROD-012-R's in-repo fix; notes the deployment predates it | read PROD-012-R/remediation.md |

## 3. Stale / wrong OUTSIDE this item's surface (honest list for the Lead — NOT fixed here)

1. **`docs/INSTALL.md` §2** — “apps/web … Currently a foundation placeholder —
   the product UI is PROD-002.” STALE: the product shell shipped (PROD-002
   through PROD-026 are finalized; the deployed app and the golden-journey
   screenshots show the real UI). Same class in §12 (“A product web UI. The
   browser entrypoint is still the foundation placeholder”). PROD-001-owned
   content — outside my pointer-updates-only mandate.
2. **`docs/INSTALL.md` §12 “A public deployment. There is no public URL yet
   (PROD-011).”** STALE: the public URL exists and is evidenced
   (`docs/productization-state.json`, PROD-011/011b/012). Same section also
   still lists Cloudflare R2/Upstash as not-included while §11/§13 document
   them as included — the section's own §11/§13 cross-links disagree with its
   body (the duplicate-§11/§13 numbering the Contents fix exposes but the
   body headings still carry).
3. **`README.md` Quickstart** — no `bun run demo` line (clone → install →
   verify → dev). The fastest evaluator path is now the demo command + the
   guide link. README is outside my owned surface; one line for the Lead.
4. **`docs/productization-roadmap.md`** — “(evidence/PROD-011B/)” for the
   PROD-011b finalization: no such directory exists (the session-stability
   evidence lives under `PROD-011/` and `PROD-012/` instead).
5. **The committed deploy beacon `api/[...path].mjs` is stale relative to
   `backend/api` sources at the base commit** — any `bun run build`
   (including the demo's phase 6) regenerates it with a real diff
   (`server.ts`'s identity-routes memoization change is in sources but not
   in the committed bundle). Local runtime is unaffected (the API runs from
   source; only Vercel's zero-config scan reads the committed beacon), and
   every deploy rebuilds it — but the repo's own "committed bytes are always
   refreshed" discipline is violated at base. Needs a one-line rebuild
   commit (outside my surface; noted for the Lead).
6. **`bun run check:env`'s own failure footer** points to
   “docs/INSTALL.md §Environment” — an anchor that does not exist (the
   section is “§4 Environment configuration”). Cosmetic, tool-owned
   (`tools/validate-env.ts` — explicitly not mine to modify).

## 4. Anchors self-check of the NEW documents

- `docs/EVALUATOR-GUIDE.md`: internal links resolve to `INSTALL.md`,
  `productization-state.json`, `free-tier-deployment.md`,
  `productization-roadmap.md`, `COST-GUARDS.md`, and the evidence files
  listed in §1 above; the evidence-relative links
  (`productization-evidence/PROD-014/…`) resolve once this evidence is
  committed (this file's siblings).
- `docs/INSTALL.md` new box: `EVALUATOR-GUIDE.md` resolves (same directory).
- `tools/bootstrap.ts` / the demo output: every INSTALL.md section pointer it
  prints (§1, §4, §7, §8, §10, §11, §13) was verified against the guide's
  actual headings above.
