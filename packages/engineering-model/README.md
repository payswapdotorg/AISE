# @aise/engineering-model — Reality Graph core (AISE-011)

The **canonical engineering-model authority** of AI Site Engineer
(architecture-lock §1: "the Reality Graph is the only canonical
structured engineering-model authority"). AISE-011 implements the core:
`RealityObject` is the central abstraction, with geometry, topology,
properties, evidence/provenance references, epistemic state,
uncertainty, relationships, temporal/version state, and stable
identities all represented — **without ever collapsing inference into
truth**.

## Module map

| Module | Responsibility |
| --- | --- |
| `errors` | Typed, fail-closed `EngineeringModelError` (non-retryable by construction) |
| `canonical` | Canonical JSON serialization + SHA-256 content pinning (deterministic digests) |
| `epistemic` | The four epistemic states, the no-upgrade guard, weakest-link derivation, presence vocabulary |
| `quantities` | Canonical units (length/area/angle), uncertainty (standard/expanded/tolerance), estimate↔measurement distinction |
| `assertions` | Property assertions: value+unit+status+confidence?+uncertainty?+evidence+method+verified-by |
| `geometry` | Structured planar geometry (v1: rectangles) + content-pinned geometry-asset references |
| `provenance` | Lineage records (method + materialized parameters + content-pinned inputs) |
| `identity` | Deterministic object/relation identity; deep-freeze immutability |
| `model` | The graph: spaces, objects, relationships; fail-closed assembly; canonical ordering; digest |
| `version` | Version metadata records; honest diffs (no correspondence claims); epistemic-change reports |
| `validate` | Whole-graph validation — the persistence-boundary gate (the store does not trust the caller) |
| `query` | Derived read views (containment, openings, ancestry, interchange refs, counts) |

## Discipline

- **Epistemic honesty** — every assertion preserves
  `OBSERVED`/`INFERRED`/`CONFIRMED`/`PROPOSED`; derived paths run the
  no-upgrade guard; `CONFIRMED` requires evidence references and a
  verifier; `CONFIRMED_ABSENT` requires affirmative evidence
  (`UNKNOWN`/`NOT_OBSERVED`/`OCCLUDED` never become confirmed absence).
- **Estimates vs measurements** — `kind: "measurement"` requires
  directly-supported states; `INFERRED`/`PROPOSED` values are estimates
  by construction (no silent estimate→measurement upgrade).
- **Uncertainty ≠ confidence** — distinct fields, distinct types
  (metrological record vs unitless probability); no code path converts
  one into the other.
- **Stable identity, honest discontinuity** — object identity derives
  from the provenance source pin (lineage, not mutable content); a
  re-extraction that changes upstream content yields a new identity,
  and version diffs report removal+addition — never a fabricated
  correspondence.
- **Immutability** — assembled graphs are deep-frozen; committed model
  content cannot be mutated in place.
- **Determinism** — canonical ordering + canonical digests: the same
  content in any input order yields the identical digest, which is the
  backbone of version idempotency (`already_present` on identical
  re-derivation).

## Layering

The package depends only on `@aise/shared-contracts` (the
cross-platform vocabulary). Backend services adapt INTO this
vocabulary at their boundaries (`@aise/backend-reality-model` owns the
scene→graph mapping); the model never imports backend service
packages. The browser/desktop workspace consumes read models through
API contracts, never by importing the canonical authority directly.

## Commands

```bash
npm run typecheck --workspace @aise/engineering-model
npm run test --workspace @aise/engineering-model
```

The full repository gate is `npm run verify` at the root (lint +
typecheck + test + smoke + web build), identical to CI.
