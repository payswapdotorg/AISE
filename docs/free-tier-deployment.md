# AISE Free-Tier Deployment Reference

## Target

The default evaluator/demo deployment should run without a paid subscription to the baseline hosting/data services. It is a bounded prototype/demo workload, not a promise of unlimited production capacity.

## Reference services

| Concern | Provider | Baseline plan | AISE use | Required? |
|---|---|---|---|---|
| Web hosting | Vercel | Hobby | Public web app and lightweight API/server functions where compatible | Yes |
| Relational data | Neon | Free | Projects, cases, BOQ metadata, domain state, audit metadata | Yes |
| Object storage | Cloudflare R2 | Standard included free allowance | BOQs, images, videos, derived artifacts and exports | Yes |
| Cache / transient jobs | Upstash Redis | Free | Cache, rate limiting, idempotency, bounded async job state | Yes |
| External acquisition/import | Apify | Free | Optional web/document acquisition actors | No |
| Auth | AISE-owned application layer using durable DB state/session primitives | No separate paid subscription required | Sign-in, tenant/project authorization | Yes |
| Reconstruction compute | Provider-neutral adapters | Free/demo path first; paid/GPU providers optional | Reconstruction candidates and provider-backed processing | No paid dependency for baseline |

## Current provider facts

These values are current reference values and must be revalidated by the Tech Lead before a public declaration.

### Vercel

The user-accessible Vercel team available to the current session is on the Hobby plan. Vercel's current pricing documentation states that Hobby accounts are usage-capped and cannot purchase additional usage without upgrading. citeturn854877search6

AISE must therefore treat quota exhaustion as a controlled degraded state, never as an automatic paid upgrade.

### Cloudflare R2

R2 Standard currently includes 10 GB-month of storage, 1 million Class A operations and 10 million Class B operations per month at no charge; Internet egress is free. citeturn854877search0

The application must enforce upload limits and lifecycle/retention policies appropriate for this allowance. Large raw video/mesh archives can quickly exceed a hobby workload, so the demo should use fixture-sized assets and an explicit retention policy.

### Neon

Neon's current Free plan provides 10 projects, 50 CU-hours/month per project, 0.5 GB storage per project, 10 branches/project, 5 GB/month egress, autoscaling up to 2 CU, and limited monitoring/history. citeturn854877search10

The AISE default should use one project with scale-to-zero and minimal background activity.

### Upstash Redis

The current Redis Free plan provides one free database with up to 256 MB data, 10 GB monthly bandwidth and 500K commands/month. citeturn854877search1

The AISE queue/cache layer must use TTLs, bounded command volume, idempotency keys and explicit quota behavior rather than treating Redis as durable canonical storage.

### Apify

Apify's current Free plan provides $5/month of prepaid platform usage and does not require a credit card; when the free allowance is exhausted, access is blocked until the next billing cycle. citeturn201985search0turn201985search7

Apify is optional. The core product must remain functional when the connector is absent or quota-blocked.

## Required configuration model

Checked-in configuration examples must include placeholders for:

```text
APP_BASE_URL
API_BASE_URL
DATABASE_URL
REDIS_URL / UPSTASH_REDIS_REST_URL
R2_ACCOUNT_ID
R2_BUCKET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
APIFY_TOKEN (optional)
AUTH_SECRET
OPTIONAL_RECONSTRUCTION_PROVIDER_* (provider-specific, optional)
```

Secrets must never be committed. Runtime configuration must be validated at startup and exposed through a safe `/health` or `/readiness` diagnostic that reports availability state without secret values.

## Free-tier operating policy

1. No application path may trigger a paid upgrade automatically.
2. Provider-specific quotas are configuration and policy concerns, not hidden behavior.
3. Optional integrations have explicit `enabled/disabled/unavailable/quota_exhausted` states.
4. Heavy reconstruction is asynchronous and optional.
5. The seeded demo path must run without a paid model API, GPU service or external enterprise connector.
6. Large uploads are bounded and rejected or redirected to an explicit retention/upgrade path.
7. Durable engineering state lives in Neon; R2 stores blobs; Redis stores transient state.
8. The product remains usable when any optional provider is unavailable.

## Deployment topology

```text
                         ┌───────────────────────┐
                         │   Vercel Hobby        │
                         │ Web UI + light API    │
                         └───────────┬───────────┘
                                     │
                 ┌───────────────────┼────────────────────┐
                 │                   │                    │
                 ▼                   ▼                    ▼
          ┌────────────┐      ┌──────────────┐     ┌──────────────┐
          │ Neon Free  │      │ Upstash Free │     │ Cloudflare   │
          │ PostgreSQL │      │ Redis        │     │ R2 Standard  │
          └────────────┘      └──────────────┘     └──────────────┘
                                                         │
                                                         ▼
                                                Raw/derived artifacts

                   Optional external acquisition
                              │
                              ▼
                       ┌────────────┐
                       │ Apify Free │
                       └────────────┘

                   Optional reconstruction providers
                              │
            ┌─────────────────┼──────────────────┐
            ▼                 ▼                  ▼
       WorldSculpt       World Labs Atlas    Magic Leap Atlas
       / future providers through AISE reconstruction registry
```

## Infrastructure non-goals

Do not attempt to run a large GPU world model inside Vercel serverless functions, Neon, Redis or R2. The provider-neutral reconstruction contract already exists to let these engines run elsewhere and return provenance-preserving candidates. The free-tier claim applies to the baseline application/deployment and golden demo journey, not to unlimited high-end reconstruction compute.
