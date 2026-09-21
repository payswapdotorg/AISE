# PROD-024 — Adapter conformance result

**Work item:** PROD-024 · **Module:** `apps/web/src/solution/**`
**Sources:** the automated suites (`operations.test.ts`, `service.test.ts`,
`agent/port.test.ts`, `boq.test.ts`/`model.test.ts`, `viewer/viewer.test.ts`,
`workspace.test.tsx`) + the boundary gate (`bun run verify` → boundaries:
no cross-zone import violations).

## What the workspace consumes (import-only, never re-implemented)

| Seam | Consumed as | Evidence |
|---|---|---|
| `@aise/solution-contract` (PROD-021, frozen) | wire objects + the ONE constructor surface `createOperationIntent`, the capability profile, `negotiateOperationCapability` (through the engine), the identity derivations, the trace resolvers — imported read-only via relative package paths (apps→packages is boundary-legal; no bare-specifier resolution exists without package.json edits outside this item's surface) | the manipulation-mapping tests assert every control produces EXACTLY the typed intent; the convergence tests assert the same semantics from direct manipulation and the agent derive the SAME operation identity through the contract's own `deriveEngineeringOperationId` (the committed direct/agent excavation fixture pair) |
| `@aise/solution-engine` (PROD-022, frozen) | `applyOperation`, `reviseVersion`, `validateSolutionVersion`, `deriveStateQuantities`, `materializeBaselineState`, `resolveNumericParameter`, `TableBaselineGeometryResolver` — called through the `SolutionServicePort` (the local binding IS the engine package; the HTTP binding mirrors the backend `/v1/solutions/*` request/response shapes for the Lead's production wiring) | the service tests: applied/refused outcomes pass through VERBATIM; the explicit-capability-profile test (the partial profile's `unknown` excavation negotiates to needs-input — the frozen honesty discipline); the timeline-determinism test: the workspace-evolved version is byte-identical to the engine's `replaySolution` |
| PROD-023 compiler seam (backend, import-forbidden for apps by the AISE-001 boundary matrix) | `SolutionAgentPort` — STRUCTURAL MIRRORS of the compiler's public shapes (`CompiledCommand`, `TurnDecision`, `AgentSessionContext`, pending states); the HTTP adapter speaks the route factory's exact paths (`POST /v1/solution-agent/compile`, `/turn`); a clearly-labeled scripted TEST DOUBLE (the PROD-023 `createInMemorySolutionToolDouble` discipline) drives the co-located tests with REAL contract intents | the port tests: the double replays scripted turns IN ORDER and never improvises (mismatch → honest cancelled); the HTTP adapter posts the exact wire bodies and unwraps `{ok, command}` / `{ok, decision}`; the golden journey's agent turns land on the corpus's block-wall/plaster identities through the SAME submission path as direct manipulation |
| `@aise/adapter-contract` discipline (version locking, PROPOSED vs OBSERVED separation) | followed, not modified: the workspace renders the two epistemic classes as distinct structural layers with the engine's own seals; the observed scene is read-only props; no generic adapter contract file is touched | the viewer layer-separation tests; the mutation-protection suite |

## What the workspace does NOT do (the non-scope held)

- NO second operation semantics: no client-local geometry/quantity
  computation anywhere (quantity rows derive VERBATIM from engine-recorded
  effects; viewer overlays are projections of engine-recorded parameters,
  resolved through the engine's own unit resolution).
- NO compiler re-implementation: the scripted double performs no language
  understanding (exact/ordered script replay only, clearly labeled).
- NO BOQ derivation: the BOQ seam consumes the contract's trace-set wire
  object read-only and resolves navigation through the CONTRACT's own pure
  functions; no line is ever fabricated.
- NO modification of any file outside `apps/web/src/solution/**` and
  `docs/productization-evidence/PROD-024/**` (see `DELIVERY.txt`); the
  root `bun.lock` is untouched (no new runtime dependency — React 19, the
  workspace packages and the existing SVG patterns only).

## Gate result

`bun run verify` at the delivery commit:
**4382 pass / 0 fail** (baseline 4323 + this item's 59 new tests),
`VERIFY: PASS` — including typecheck, lint, the full test suite and the
workspace-boundary scan (no cross-zone import violations).
