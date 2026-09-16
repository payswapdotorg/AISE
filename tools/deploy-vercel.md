# AISE Vercel deploy runbook (PROD-011 — executed for real)

Every phase below has been executed against the real project
(`ekonplacidegmailcoms-projects/aise`, Hobby plan). The evidence transcript is
`docs/productization-evidence/PROD-011/TRANSCRIPT.md`.

## Phase 0 — local, no account needed

```bash
bun install
bun run build     # BUILD: PASS (apps/web/dist/index.html + api/[...path].mjs)
bun run verify    # VERIFY: PASS, boundaries clean
bun run smoke     # SMOKE: PASS (unset DATABASE_URL if the host injects one)
```

Optional local proof of the emitted function (the six request shapes):
run the bundle under plain Node with `AISE_SERVERLESS=1` and call its `fetch`
export with absolute/relative × mounted/public × single/multi-segment Requests.

## Phase 1 — link the project (once)

```bash
bunx vercel link
# → creates .vercel/project.json (machine-local, gitignored)
```

## Phase 2 — configure environment secrets (once per scope)

```bash
bunx vercel env add AISE_SERVERLESS production   # value: 1
bunx vercel env add AISE_AUTH production         # value: 1
bunx vercel env add AISE_AUTH_MODE production    # value: demo-open
bunx vercel env add AUTH_SECRET production       # value: random string
bunx vercel env ls
```

Repeat with `preview` instead of `production` for the preview scope. Values stay
in the Vercel secret store; never in Git.

## Phase 3 — deploy

```bash
bunx vercel deploy --prod
# → Production  https://<hash>-<scope>.vercel.app
# → Aliased     https://<project>-<scope>.vercel.app
```

The platform runs `bun install` + `bun run build` from the uploaded repository
state. Expected build log shape (see the captured `build-logs.txt`): vite build
(74 modules) → esbuild bundle → `BUILD: PASS` → deployment completed.

## Phase 4 — public smoke

```bash
curl -fsS https://<alias>/healthz
curl -fsS https://<alias>/readyz
curl -fsS https://<alias>/v1/gaps
curl -fsS https://<alias>/api/v1/gaps   # direct mount, multi-segment
curl -fsS -o /dev/null -w '%{http_code}\n' https://<alias>/        # 200 SPA
curl -fsS -o /dev/null -w '%{http_code}\n' https://<alias>/demo    # 200 SPA fallback
```

## Phase 5 — evidence capture (per the PROD-011 work order)

```bash
bunx vercel ls                                   # deployment id/url/status
bunx vercel inspect <url> --logs > build-logs.txt
# + the smoke outputs + (browser) journey screenshots/recording
```

Filed under `docs/productization-evidence/PROD-011/`.

## Troubleshooting (all hit and fixed for real)

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Build fails on the function source | `@vercel/node` cannot build Bun-style extensionless TS imports | the pre-bundled `api/[...path].mjs` (already the default) |
| Function runs but every response is empty/`null` | default export treated as legacy `(req,res)=>void`; return value ignored | export under the name `fetch` (already the case) |
| `ERR_INVALID_URL` in the function | Vercel hands the handler a RELATIVE request url | the adapter anchors relative urls (already the case) |
| `/api/v1/*` or `/v1/*` 404 at the platform (single-segment paths fine) | zero-config compiles bracket catch-all names to a single-segment route | the `vercel.json` rewrites onto `/api/[...path]` (already the case) |
| a second broken `serverless` function appears in builds | a plain `api/*.ts` file is picked up by zero-config | the `_`-prefixed source name (already the case) |
| session lost mid-journey (401 `session_invalid`) | per-instance `/tmp` sessions, no routing affinity | re-enter demo; see DEPLOYMENT.md §5; stable path = `DATABASE_URL` (+ PROD-011b for sessions) |

## Rollback / redeploy

```bash
bunx vercel rollback                 # previous production deployment
bunx vercel deploy --prod            # redeploy from current repository state
```
