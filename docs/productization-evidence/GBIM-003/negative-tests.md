# GBIM-003 — Negative / discrimination tests

**Work item:** GBIM-003 · **Fixture negative cases:** GBIM-000 `negativeCases` neg-001…neg-007.
**Runner:** `apps/spatial-studio-spike/src/server/run-checks.ts` (deterministic; results in
`results/spike-results.json`, 16 checks, 15 PROVEN + 1 recorded DIVERGENT engine gap).

## Layered defense model

The spike distinguishes WHERE each invariant is enforced:

- **E** — the ENGINE (capability negotiation / apply-time invariants / validation);
- **A** — the AISE-side fixture invariant layer (`validateFixtureInvariants`, spike
  implementation of the GBIM-000 §3 set — the layer the future Geometry Port owns);
- **P** — the PRESENTATION adapter guard (strict scene-payload decoder, `scene-model.ts`).

## Results

| Case | Probe | Layer(s) that catch it | Verdict | Evidence |
|---|---|---|---|---|
| neg-001 impossible-wall-thickness (wall thickness 8.1 m) | engine apply + modified fixture through the AISE validator | **A** fails closed ("thickness 8.1 m is not smaller than the room's smallest dimension 6 m — the workspace refuses to build"); **E gap recorded honestly**: Phase 1 `block-wall-placement` has NO thickness limit (8.1 m ACCEPTED, wall-volume 8×3×8.1 m³ computed) | PROVEN (layered) | check `neg-001-impossible-wall-thickness`; follow-up G-1 in `fixture-mapping.md` |
| neg-002 opening-outside-host-wall (host `wall-missing`) | engine apply + modified fixture | **A** fails closed ("opening references host wall 'wall-missing' which does not exist"); **E gap recorded**: Phase 1 `opening-creation` has no host-existence/void model (the intent applied) | PROVEN (layered) | check `neg-002-opening-outside-host-wall`; follow-up G-2 |
| neg-003 negative-dimension (width −0.5 m) | engine apply (and fixture validator for fixture-level dimensions) | **E** fails closed (`parameter_not_positive: parameter 'length' must be positive; found -0.5 m`) — no state created; live in-browser too | PROVEN | check `neg-003-negative-dimension` |
| neg-004 disconnected-footing (supportRelation none) | engine apply + fixture without a supported column | **A** fails closed ("footing has no declared supported element"); **E gap recorded**: Phase 1 `foundation-placement` has no connectivity model | PROVEN (layered) | check `neg-004-disconnected-footing`; follow-up G-3 |
| neg-005 duplicate-operation-identity (op-001 twice) | fixture with a duplicated op id + engine identity law | **A** fails closed (duplicate fixture op id rejected); **E**: operation identity includes version context + index (order is semantic) — a repeated identical intent applies as a DISTINCT step BY DESIGN, and the engine's `duplicate_operation_in_state` guard (apply.ts L261–279) refuses same-id collisions | PROVEN | check `neg-005-duplicate-operation-identity` |
| neg-006 unsupported-operation (`make-portal`) | real intent against the engine | **E** fails closed: negotiation outcome `unsupported`, reason `operation-type-not-declared` — the engine never fabricates a capability; live in-browser via the ⚠ component kinds (create-column/create-beam → same refusal) | PROVEN | check `neg-006-unsupported-operation` |
| neg-007 malformed-provider-response (unknownField) | malformed scene payloads against the strict presentation decoder | **P** fails closed: the well-formed fixture scene (11 elements) decodes; the malformed payload is REJECTED ("unknown fields […] — strict shape (malformed-provider-response guard)"; empty aiseId; unknown kind; non-finite box) — corrupt elements can never render as canonical truth | PROVEN | check `neg-007-malformed-provider-response` |

## Additional discrimination checks

| Check | Verdict | Evidence |
|---|---|---|
| fixture-replay-determinism | PROVEN | two independent workspace builds → byte-identical projections |
| renderer-non-interference | PROVEN | mutating every presentation box leaves the canonical projection byte-identical; serialized ops/states contain no renderer field tokens |
| historical-replay | PROVEN | the renderer-free JSON projection fully interprets the record; the fallback pane renders it live |
| engine-dependency-gate | PROVEN | a `completion-before` dependency on the REAL wall op applies; an unknown ref is refused `dependency_not_applied` |
| **revision-dependency-gap** | **DIVERGENT (recorded engine gap G-4)** | LIVE DEMO: revising a version (wall + opening depending on the wall) by undoing the wall fails closed — `intentOfOperation` preserves `dependsOn.operationRef` verbatim, but operation ids are content-addressed including versionNumber, so the v1 ref cannot exist in v2. Correct fail-closed behavior that nonetheless blocks legitimate dependent-sequence revisions. Follow-up: remap dependency refs by operation index in the revision rebuild. The sandbox's canonical mapping is dependency-free for this reason (host relations in mapping notes). |
| engine-quantity-sanity | PROVEN | op-001 wall-volume = 4.8 m³ = 8×3×0.2 (documented Phase 1 formula) |
| fixture-integrity | PROVEN | the pinned GBIM-000 fixture consumed verbatim (sha-256 recorded) |

## Honest statement

The three "layered" cases (neg-001/002/004) show a REAL divergence between the GBIM-000
invariant set and the Phase 1 engine catalogue: the engine alone does not yet enforce them. The
spike does not paper over this — the engine outcomes are recorded verbatim, the AISE-side
validator provides the fail-closed layer today, and the gaps are escalated as Geometry Port /
capability-profile follow-ups. No fabricated refusal, no fabricated geometry, no fabricated
approval.
