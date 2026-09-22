# PROD-029 — Integration notes (Lead wiring + HFX-3xx consumption)

## What landed (the file inventory)

```text
backend/api/src/solution-eval/
  model.ts        scenario types, closed vocabularies, pure parsers + the
                  canonical-boundary guard (the strict projections)
  fixtures.ts     the committed reference data: the wall-upgrade baseline
                  world, the compiler corpus slice + demo session, the
                  canonical golden values (engine state chain, validation
                  snapshot, BOQ lines, compiler semantics), the eight
                  substitute provider profiles, the canonical registry log,
                  the committed scenario matrix
  harness.ts      evaluateSubstitution + runSubstitutionMatrix (the
                  provider-neutral Layer-3 evaluation entry point)
  service.ts      SolutionEvalService (thin transport adapter, stateless)
  router.ts       handleSolutionEvalRequest (the pure route factory)
  testkit.ts      TEST-ONLY builders + the committed-golden (de)serialization
                  + the regeneration entry
  index.ts        the module's public surface
  model.test.ts fixtures.test.ts harness.test.ts golden.test.ts
  service.test.ts router.test.ts

tools/solution-eval/
  scenario.json                    the committed substitution matrix (data)
  runner.ts                        the pure check-runner (no package imports)
  benchmark.test.ts                the tools-side gate pickup (root verify)
  fixtures/expected-outcomes.json  the committed golden outcomes
  README.md                        the benchmark harness doc

docs/productization-evidence/PROD-029/
  evaluation-entry-point.md substitution-matrix.md divergence-analysis.md
  hardening-report.md integration-notes.md
```

**104 new tests** (93 backend + 11 tools) over the 4742/0 baseline →
**4846/0, VERIFY: PASS**. No existing test was weakened, skipped or
deleted; `bun.lock` and `backend/api/package.json` are untouched (every
needed workspace dependency — `@aise/provider-registry`,
`@aise/solution-contract`, `@aise/solution-engine`,
`@aise/solution-boq` — was already declared by merged work items).

## Lead wiring (the mount snippet)

The router is NOT mounted in `server.ts` (explicitly out of PROD-029's
owned surface — `backend/api/src/server.ts` + `main.ts` are Lead wires,
exactly like `solution/`, `solution-boq/` and `providers/` which are also
delivered-but-unmounted). The intended wiring (the providers/router
exemplar; a DISTINCT top-level path word so the `/v1/solutions` cascade
stays untouched):

```ts
import { handleSolutionEvalRequest } from "./solution-eval/router";
import { SolutionEvalService } from "./solution-eval/service";
import type { SolutionEvalRouteOptions } from "./solution-eval/router";

// on the HandlerOptions interface:
solutionEval?: SolutionEvalRouteOptions;

// in the route cascade, before the 404 fallthrough:
if (url.pathname === "/v1/solution-eval" || url.pathname.startsWith("/v1/solution-eval/")) {
  const response = await handleSolutionEvalRequest(request, url, requestId, solutionEvalRoutesOrDefault(options));
  if (response !== null) { return response; }
}

// the lazily-defaulted route options (the execution/ exemplar):
const defaultSolutionEvalRoutes = new WeakMap<HandlerOptions, SolutionEvalRouteOptions>();
function solutionEvalRoutesOrDefault(options: HandlerOptions): SolutionEvalRouteOptions {
  if (options.solutionEval !== undefined) { return options.solutionEval; }
  let routes = defaultSolutionEvalRoutes.get(options);
  if (routes === undefined) {
    routes = { service: new SolutionEvalService(), logger: options.logger };
    defaultSolutionEvalRoutes.set(options, routes);
  }
  return routes;
}
```

The service is STATELESS (the provider-registry event log travels with
the request — the caller owns the log), so the default wiring needs no
store, no dataDir and no clock. The mount adds three POST routes:

- `POST /v1/solution-eval/scenario/validate`
- `POST /v1/solution-eval/substitution/evaluate`
- `POST /v1/solution-eval/matrix/run`

Status table: 400 `malformed_json`; 422
`invalid_request`/`invalid_scenario`/`invalid_registry_log`; 200 for every
completed evaluation INCLUDING refusals (a refusal is verdict evidence:
`{ ok: true, evaluation: { verdict: "substitution-refused", refusal: { kind, detail } } }`).

## The committed-golden regeneration (documented one-off)

```bash
bun -e 'const kit = await import("./backend/api/src/solution-eval/testkit.ts"); await kit.writeGoldenArtifacts();'
```

Rewrites `tools/solution-eval/scenario.json` and
`tools/solution-eval/fixtures/expected-outcomes.json` from the live
computation (the backend-side golden tests then hold the committed files
to the live output byte-for-byte — drift fails the root verify gate).
Regeneration should only ever be needed after a DELIBERATE change to the
committed matrix or the canonical components' committed golden behavior —
and a canonical-behavior change should trip the engine/BOQ/compiler
packages' own golden suites first.

## HFX-3xx consumption notes

**HFX-301 (NL ↔ direct-manipulation semantic equivalence):**
- Register the candidate agent-compiler provider (a real adapter behind
  `NlUnderstandingPort` or a full compiler provider) in YOUR registry log;
  declare scenarios at the `operation-compiler` seam over the
  command-corpus slice (or your own corpus — the baseline fixture id
  pins the committed slice; extending the slice is a fixtures.ts +
  scenario.json regeneration).
- `expectation: "canonical-equality"` per equivalence group is the
  convergence proof (same operation id ⇒ same semantics; provenance is
  excluded from identity by the contract — attribution is not
  semantics). Different-but-valid implementations stay distinguishable:
  declare the divergence honestly (`declared-divergence` +
  `operation-semantic-failure`).
- Finding 4 in the hardening report applies: extend the substitute's
  declared input contract with the session's seedable facts before
  baking off real providers, or the focus-seeded parameters will
  diverge for harness reasons.
- Unsafe/ambiguous commands: the canonical compiler answers
  clarification/ambiguous/unsafe unions BEFORE an intent exists — a
  substitute that auto-executes them is the operation-semantic failure
  family (or contract-mismatch if it cannot emit a canonical intent at
  all).

**HFX-302 (geometry/validation technology substitution):**
- Register the candidate engine/validation provider; declare scenarios at
  the `engine-execution` / `validation` seams with the candidate's
  outputs over the same canonical operation sequence. Byte-equal state
  digests → `substitution-proven` (drop-in equivalence); anything else →
  `divergence-recorded` with the EXACT per-point evidence (which state,
  which quantity, which check) — your tolerance report is a JOIN over
  the recorded comparison points, not a reimplementation.
- Findings 2 and 3 in the hardening report apply: surface explicit
  provider refusals verbatim, and require the parent-digest echo for
  chain-continuity verification.
- Keep check-level validation comparison (Finding 8) — the
  outcome-only shortcut is a regression.

**HFX-303 (bounded visual-solution providers):**
- The non-interference proof is a substitution scenario at the EXISTING
  canonical seams whose substitute emits no canonical claims: any visual
  output that claims a canonical field must pass the projection guard
  (or be recorded as `contract-mismatch`). Provider replacement changes
  presentation only — the matrix's four seams ARE the interference
  surface.
- Finding 2 applies: a visual provider honestly declining a canonical
  seam should surface its own `unsupported-data` refusal — extend the
  harness when you add those scenarios.

**HFX-401 (the scorecard):** every evaluation emits a `BenchmarkRecord`
with the comparability key `layer3-substitution-eval/1|layer3-<seam>` and
failure observations already in the closed vocabulary — the scorecard
joins on the key and counts the kinds. The provenance manifest is
portable and digest-verifiable (`verifyProvenanceManifest`) — historical
evaluations stay interpretable after a provider retires (replay the log
+ the manifest, no harness state needed).

## Non-goals (owned by other work items — unchanged)

- Any REAL provider, model, agent framework or network egress (the
  fixtures here are deterministic in-repo doubles — HFX-101..303's
  non-scope statement).
- The provider scorecard / rollback gate semantics (HFX-401).
- Canonical Layer-3 semantics (PROD-021/022/023/025 — imported and
  called, never modified; zero changes under `packages/solution-*` or
  `backend/api/src/{solution,solution-boq,reasoning}`).
- Server mounting (the Lead wires; this module ships the pure route
  factory + the documented snippet).
