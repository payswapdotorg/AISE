# Cost guards — the free-tier budget layer (PROD-013)

This document is the configuration review for the cost-guard layer introduced
by PROD-013 (`backend/api/src/cost/`). Its contract: **the deployed demo is
provably incapable of silently creating paid usage** — every metered external
resource is counted against a hard cap, the cap is refused loudly when
reached, and the refusal is never an "upgrade".

## 1. The free-tier posture (verified 2026-09-16 against the providers' own pages)

| Provider | Plan | Free allotment (verified) | What AISE meters | What happens at exhaustion |
| --- | --- | --- | --- | --- |
| Upstash Redis | Free | **500K commands/month** + 256MB data ([upstash.com/pricing/redis](https://upstash.com/pricing/redis)) | `redis_commands` — every REST command the process issues (the `MeteredRedisClient` wraps the Upstash client) | AISE REFUSES the command (typed `quota_exhausted`); Upstash itself hard-stops free databases at quota — no billing without an explicit upgrade (provider FAQ: "Once you upgrade to a paid tier, you will be charged") |
| Cloudflare R2 | Free | **10 GB-month storage** + 1M Class A ops/month ([developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/)) | `r2_storage_bytes` per artifact upload; `r2_objects` as operational hygiene | AISE REFUSES the upload before it stores anything (all-or-nothing bytes meter). R2 CAN bill beyond the free allotment — which is exactly why the AISE cap defaults to 80% of the allotment. |
| Vercel | Hobby | Monthly **allotment** of each billable resource; no payment method on the account ([vercel.com/docs/limits](https://vercel.com/docs/limits)) | Not metered by AISE (the serverless function count/execution is bounded by the demo's route surface; Hobby is an allotment, not a billed dimension) | Hobby usage is capped by the platform; "Upgrade to Pro for higher limits" is an explicit operator action — there is no auto-upgrade path |
| Neon Pg | Free | 100 CU-hours, 0.5GB storage, 5GB egress per month; "permanent (not a trial); no credit card required" ([neon.tech/pricing](https://neon.tech/pricing)) | Not metered by AISE in the deployed Fs mode; with `DATABASE_URL` set, Pg usage is bounded by the demo's tiny domain data | Hitting any Free limit **suspends** the project (verified verbatim on the pricing page) — no billing on the Free plan |

Verification status: all four rows above were fetched live from the linked
provider pages on 2026-09-16 (see `evidence/PROD-013/configuration-review.md`
for the fetch method). The `r2_objects` meter deserves its own honesty note:
**R2's free tier publishes no object-COUNT cap** (storage and operation
classes are the billed dimensions) — AISE's default of 100,000 objects is an
OPERATIONAL HYGIENE bound, not a provider-cited number.

## 2. The no-auto-upgrade review

- **Vercel Hobby**: the account holds no payment method; usage is delivered
  as a monthly allotment. There is no mechanism by which the demo's traffic
  creates a charge. Verified on [vercel.com/docs/limits](https://vercel.com/docs/limits).
- **Upstash Free**: free databases are hard-stopped at the free quota; paid
  usage requires the operator to explicitly upgrade the database (provider
  FAQ, verified live). AISE additionally refuses at 80% of the quota
  (default), so the platform stop is a backstop, not the primary guard.
- **Neon Free**: "permanent (not a trial); no credit card required"; limits
  suspend rather than bill (verified live).
- **Cloudflare R2**: the one provider that CAN bill beyond the free
  allotment (payment method on file). This is precisely the threat model the
  quota layer exists for: `AISE_QUOTA_R2_BYTES` (default 8 GiB = 80% of the
  10 GB-month allotment) is a HARD cap enforced BEFORE the upload is stored
  — a refused upload stores nothing and counts nothing. The artifacts route
  additionally retains its own `AISE_ARTIFACT_MAX_BYTES` per-object cap
  (PROD-006).

## 3. The env surface (ALL optional; absence = conservative defaults, existing flows unchanged)

| Variable | Default | Meaning |
| --- | --- | --- |
| `AISE_QUOTA_REDIS_COMMANDS` | `400000` (80% of Upstash free's 500K/month) | Hard monthly cap on metered Upstash REST commands |
| `AISE_QUOTA_R2_BYTES` | `8589934592` (8 GiB = 80% of R2 free's 10 GB-month) | Hard monthly cap on metered R2 artifact bytes |
| `AISE_QUOTA_R2_OBJECTS` | `100000` (operational hygiene — see §1) | Hard monthly cap on artifact object count |
| `AISE_QUOTA_THRESHOLD_PERCENT` | `80` | Where the one-per-window warn band starts |
| `AISE_RATELIMIT_WINDOW_SECONDS` | `60` | Expensive-route rate-limit window |
| `AISE_RATELIMIT_MAX` | `60` | Expensive-route requests per window per principal (session digest, else client-IP digest) |
| `AISE_RATELIMIT_GLOBAL_MAX` | `600` | Expensive-route requests per window per instance globally |
| `AISE_MAX_UPLOAD_BYTES` | `10485760` (10 MiB) | Upload cap enforced BEFORE body buffering (capture assets/sync, BOQ import; the artifacts route keeps `AISE_ARTIFACT_MAX_BYTES`) |

Notes:
- The `AISE_REDIS_RATELIMIT_*` names are DISTINCT from `AISE_RATELIMIT_*`:
  the former configure the PROD-007 `consumeRateLimit` primitive's internal
  defaults; the latter configure the PROD-013 pipeline guard.
- Malformed values degrade to the documented defaults with a warn — never a
  crash (tested in `runtime/entry-cost.test.ts`).

## 4. What the meters count (and what they deliberately do not)

Metered (real spend paths): Upstash REST commands; R2 artifact bytes; R2
object count. Deliberately NOT invented: an LLM/integration-call meter — the
only network-calling integration adapter (Apify, PROD-008) is default-disabled
and unwired in the runtime entry; metering a call path that does not exist
would be dishonest theater. When a real integration lands, its adapter seam
gets a meter here (the ledger is open for new resources by design).

## 5. The ledger twins (honest scope)

- **Memory twin (zero-config default)**: per-instance counters for the
  current UTC month window. On a multi-instance deployment each instance
  counts only its own consumption — `/readyz` says so (`"ledger":"memory"`).
- **Redis twin** (when `AISE_REDIS_REST_URL` + `AISE_REDIS_REST_TOKEN` are
  both set): counters shared across instances by window key, on the
  outage-tolerant PROD-007 wrapper (counter writes degrade to the local twin
  rather than failing the request path).

## 6. The expensive-route guard

The PROD-007 fixed-window limiter (`consumeRateLimit`) is wired into the
runtime pipeline between the auth layer and the routing core. The route set
(every entry performs heavy compute or external I/O):

- `POST /v1/boq/imports…` and the derived compute POSTs under the prefix
  (XLSX = ZIP inflate + XML parse; normalization; mappings) — the heaviest
  parsing surface;
- `POST /v1/reconstruction/jobs…` and `/run` — the provider-dispatch surface
  (the geometry pipeline is the heaviest compute in the API);
- `POST /v1/capture/assets…` / `sync` — whole-body buffered uploads.

Behavior: per-principal (session digest, else client-IP digest) AND
per-instance global bounds; over-limit requests get the typed 429 envelope
via the EXISTING stable error shape + observable `x-ratelimit-limit` /
`x-ratelimit-remaining` / `x-ratelimit-reset` headers. Anonymous floods are
answered by AUTH (401) before the limiter is ever consulted. Under the
defaults, normal demo use never sees a 429.

## 7. Observability

- `/readyz` carries an ADDITIVE `cost` section: ledger mode, window id,
  threshold percent, per-meter `{metered, used, cap, remaining,
  remainingPercent, status}`, the guard tuning, the upload cap, and the
  honest aggregate status (the worst per-meter status — never a lying `ok`).
- Threshold crossing logs ONE structured warn per resource per window
  (`quota_<resource>_threshold`); the first refused consume logs
  `quota_<resource>_exhausted`. Names, never values.
- The full evidence: `evidence/PROD-013/` (quota simulation, log inspection,
  provider failure drill, configuration review).
