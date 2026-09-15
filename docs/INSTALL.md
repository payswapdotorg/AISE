# AISE Installation and Evaluation

## Status

The v2 implementation campaign is complete, but productization is still governed by `docs/productization-roadmap.md`. This document becomes the authoritative evaluator guide once PROD-014 is finalized; until then it is the target contract for the Tech Lead.

## Local installation

From a clean checkout:

```bash
bun install --frozen-lockfile
bun run verify
```

The productized repository must expose:

```bash
bun run dev
```

for the full local application, with any required API/background services either started automatically or through one additional documented command.

## Environment

Copy every relevant `.env.example` into the documented local location. No real credential belongs in Git.

The productized configuration must fail fast on malformed required values and must clearly identify optional providers as disabled rather than treating missing optional credentials as a broken installation.

## Demo bootstrap

A new evaluator must be able to create a deterministic demo project containing:

- a representative BOQ;
- sample evidence/capture assets;
- a small synchronized 2D/3D representation;
- an Engineering Case;
- at least two intervention states;
- an example post-work outcome.

The bootstrap must not require WorldSculpt, World Labs Atlas, Magic Leap Atlas, a GPU, Apify or a paid model provider.

## Public evaluation

The production URL is published in the root `README.md` only after `docs/PRODUCTION-READINESS-GATE.md` passes all mandatory gates.

The evaluator journey is:

```text
Open URL
  → sign in / demo access
  → open demo project
  → inspect BOQ Lens
  → inspect SiteTwin / evidence
  → inspect Engineering Case
  → step through Intervention Studio
  → inspect outcome comparison
```

## Verification

At every release candidate:

```bash
bun run verify
```

and then run the browser acceptance suite against the exact deployed URL.

The browser suite must test the product, not fixture render functions in isolation.

## Common failure modes

### No public deployment

Do not claim SaaS readiness. Deploy the web product through the repository-connected Vercel Hobby project and record the deployment identifier.

### Empty or placeholder web page

Do not claim UI readiness. The default route must render the actual product shell and provide a discoverable path into the golden journey.

### Missing provider credentials

Optional providers must show a useful disabled/unavailable state. The core demo must continue to operate.

### Free-tier exhaustion

The product must stop or degrade safely at quota boundaries. Never silently provision a paid plan.
