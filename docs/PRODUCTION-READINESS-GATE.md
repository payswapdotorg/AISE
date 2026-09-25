# AISE Production-Readiness Gate

## Declaration rule

AISE is **PRODUCT-READY** only when every mandatory gate below is PASS on the same merged commit lineage.

The declaration is deliberately narrower than “all v2 Work Items are complete”. The v2 implementation campaign is already complete; this document governs product usability, deployment and evaluator readiness.

## Gate A — Installable

PASS requires:

- documented prerequisites with supported versions;
- `bun install --frozen-lockfile` succeeds on a clean checkout;
- one documented local command starts the web product;
- one documented local command starts the API if it is separate;
- sample/demo bootstrap requires no hidden repository knowledge;
- environment configuration is represented by checked-in `.env.example` files and validation;
- clean install plus `bun run verify` passes;
- a fresh evaluator can reach the golden journey without opening source code.

## Gate B — Public free-tier deployment

PASS requires:

- a public HTTPS production URL;
- Vercel Hobby project for the web/API surface where technically appropriate;
- Neon Free for persistent relational state or an explicitly documented equivalent free tier;
- Cloudflare R2 Standard for user artifacts under the documented included allowance;
- Upstash Redis Free for transient/cache/job primitives under the documented allowance;
- Apify Free only for optional external acquisition/import tasks;
- no required paid provider in the golden journey;
- explicit spend guards and quota exhaustion behavior;
- secrets stored only in hosting/provider secret stores, never in Git;
- redeploy does not destroy durable user/project data;
- deployment smoke checks are reproducible from Git.

The phrase “free-tier deployed” means the baseline product remains operable on the specified free plans for its intended demo/evaluator workload. It does not mean unlimited usage or free GPU inference.

## Gate C — User-friendly interface

PASS requires a coherent primary web experience with:

- landing/dashboard;
- project creation/opening;
- clear navigation between SiteTwin, BOQ Lens, Engineering Case and Intervention Studio;
- evidence/capture intake with guided next action;
- BOQ upload and understandable item explanation;
- 2D/3D/evidence synchronized viewing where supported by available data;
- case review with evidence and uncertainty visible;
- intervention step/layer navigation;
- interactive solution workspace for supported building workflows;
- direct manipulation and agent-command paths resolving to the same typed engineering operations;
- validation and solution-BOQ actions with explicit results;
- BOQ line ↔ solution step/geometry navigation;
- explicit observed vs proposed state distinction;
- visible loading, empty, failure and unavailable-provider states;
- mobile-responsive layout;
- keyboard-accessible controls and reasonable screen-reader semantics;
- accessible non-3D fallback for core solution inspection;
- no architecture/debug panels in the primary journey unless intentionally exposed as a specialist view.

A page that merely renders deterministic fixture HTML is not sufficient by itself. The browser must exercise the real application entrypoints and backend contracts.

## Gate D — Engineering truthfulness

The product must never claim more certainty than its evidence supports.

- Reconstruction outputs remain derived candidates until accepted by AISE assurance/verification rules.
- Generated completion is visibly distinguished from observed evidence.
- Device limitations produce additional capture requirements rather than a silent assurance downgrade.
- BOQ remains a connected scope/cost source, not canonical physical reality.
- Solution-generated BOQs remain derived projections of validated Solution Graph versions and never overwrite source BOQs.
- Proposed intervention/solution states never overwrite observed reality.
- Every consequential operation has typed parameters, provenance and version context.
- Agents/LLMs cannot bypass deterministic validation or fabricate engineering inputs.
- Provider failures are explicit.

## Gate E — Operational safety

PASS requires:

- tenant/project authorization tests;
- upload size/type validation;
- signed/short-lived artifact access or equivalent controlled access;
- rate limiting and idempotent job handling;
- no secret or credential leakage to logs/browser payloads;
- provider timeouts and retries are bounded;
- background jobs survive retries without duplicated durable side effects;
- disabled optional providers do not break the product;
- solution operations are replay-safe and do not create duplicate durable side effects on retry.

## Gate F — Browser proof

The Tech Lead must run browser automation against the final deployed URL and record both journeys:

```text
HOME → DEMO PROJECT → BOQ → EVIDENCE → CASE → INTERVENTION → OUTCOME

CURRENT BUILDING → PROBLEM → INTERACTIVE SOLUTION → VALIDATE → SOLUTION BOQ → BOQ LINE → SOLUTION STEP
```

The test must confirm:

- the route loads;
- core controls are present;
- no blocking console errors;
- API calls return expected status classes;
- a representative upload/import path works;
- navigation state remains coherent;
- desktop and mobile viewport smoke checks pass;
- direct manipulation creates typed operations;
- agent commands create semantically equivalent operations;
- validation results are visible and tied to a solution version;
- generated BOQ lines navigate to contributing steps/geometry.

## Gate G — Cost/availability truth

Every external provider must have:

- declared plan/tier;
- relevant included allowance;
- hard failure behavior at/after quota;
- no auto-upgrade to a paid plan from application behavior;
- clear operator documentation for replacing/rotating credentials;
- a replacement or disabled path where the provider is optional.

## Gate H — Interactive engineering-solution proof

The interactive solution workflow is product-ready only when:

- a current-state building fixture can be opened/reconstructed;
- a supported engineering problem can be expressed without developer terminology;
- direct manipulation and natural-language agent commands resolve to typed operations;
- operations produce reproducible proposed states;
- the user can inspect the solution layer-by-layer;
- validation is deterministic and explicit;
- solution BOQ generation is tied to the exact validated solution version;
- every generated BOQ line traces to operation/geometry provenance;
- BOQ-to-step and step-to-BOQ navigation both work;
- saving/revising the solution cannot mutate authoritative observed reality;
- a representative physically grounded building scenario passes the applicable benchmark;
- unsupported/high-risk/underspecified operations fail closed with useful next actions.

## Gate I — Technology substitution / provider resilience

AISE is not product-ready unless the implementation remains replaceable at the technology boundaries defined by `spec/technology-substitution-contract.md`.

PASS requires, for each Layer 1, Layer 2 and Layer 3 where a swappable provider/technology is used:

- a stable AISE contract boundary exists;
- provider-specific types do not become canonical domain state;
- provider identity/version/configuration/input identity remain in provenance;
- at least one replacement or dual-provider drill demonstrates semantic/provenance compatibility;
- failure/unsupported behavior remains explicit;
- dependent-layer regression passes;
- historical records remain interpretable without the replaced provider;
- replacement does not lower assurance thresholds or bypass verification.

The evidence must identify which technologies were compared and which results are empirical versus deterministic test results. No provider swap is accepted solely on visual similarity or model confidence.

## Final declaration

Only when Gates A–I are PASS may the Tech Lead set:

```text
productization.status = "PRODUCT-READY"
```

and publish the public URL and installation instructions in the root README.

## Gate → evidence index (PROD-033)

The per-gate evidence assembly for this gate document lives in
[`docs/productization-evidence/PROD-033/gates.md`](productization-evidence/PROD-033/gates.md)
— for each gate A–I: the verdict, the committed evidence pointers (test
names, harness outputs, documents) and the honest gap that only the Lead's
final-SHA finalization (PROD-015) can close. The gate DEFINITIONS in this
document remain the authority; the index only points at evidence and never
restates or weakens a definition. The production journey harness that
produces the Gate F journey evidence is `tools/journey/` (STANDALONE —
never wired into `bun run verify`); the final-SHA deployment + replay
runbook is
[`docs/DEPLOYMENT.md`](DEPLOYMENT.md) §"The final-SHA deployment + replay
runbook".
