# @aise/world-reality-substrate

AISE WORLD-P0-A — the Layer-1 **reality substrate contracts**: the
provider-neutral adapter lane for the substrates the world program
composes in later waves (Babylon.js scene runtime, CesiumJS geospatial
context, OpenUSD composition semantics, glTF/GLB runtime delivery,
Assimp-format ingest).

**Law:** substrates are implementation components, never AISE
authorities (`spec/technology-substitution-contract.md` is binding).
Nothing in this package imports, wraps or invokes a substrate; every
lane ships a typed contract plus an in-memory substitution double that
proves the interface with REAL deterministic behavior. External
technology is never canonical truth; provider ids never become
canonical AISE identity.

## What is actually here

- **The closed five-kind substrate failure vocabulary** (`src/outcome.ts`):
  `malformed-input | unsupported-format | contract-mismatch |
  capability-unavailable | resource-limit-exceeded` — FROZEN reference
  data; every substrate failure in the whole program is one of these.
- **Opaque substrate handles + provider-id quarantine** (`src/identity.ts`):
  `substrate:<lane>:<40-hex>` handles (one-way lane-scoped digests of
  provider refs); canonical-id fields carrying handle material are
  refused fail-closed.
- **The REAL glTF 2.0 / GLB v2 parser and validator** (`src/glb.ts`,
  `src/gltf.ts`): authored from the specification, headless, fail-closed,
  80 closed issue codes each exercised by the committed negative corpus,
  declared resource limits (64 MiB / 10M elements), and the
  **byte-identical canonical extraction rule** (same GLB bytes →
  byte-identical canonical stream + sha-256 content address, tested).
- **AISE scene composition** (`src/composition.ts`): the USD-inspired
  strength model (local > variant > reference > payload; lazy payloads)
  with winning-opinion provenance, as AISE-owned types (OpenUSD stays
  external).
- **Real WGS84 ellipsoid mathematics** (`src/wgs84.ts`): exact geodetic ↔
  ECEF, Bowring's inverse, Vincenty's inverse geodesic with a declared
  iteration budget (non-convergence honestly refused), the exact
  tangent-plane horizon test.
- **Substrate-neutral linear algebra** (`src/linalg.ts`): the AISE
  column-vector convention (T·R·S), ray/AABB slab picking.
- **The five substitution doubles + lane contracts** (`src/lanes.ts`)
  and the **shared six-check lane-conformance harness**
  (`src/conformance.ts`): contract-shape, determinism, failure-closure,
  capability-proof, provenance, quarantine — proven per lane on the
  doubles, with a discrimination battery that fails anti-subjects.

## The five failure kinds (mirror of the frozen vocabulary)

| Kind | Meaning |
|---|---|
| `malformed-input` | The input violates the format contract the adapter declares — refused fail-closed, path named. |
| `unsupported-format` | Well-formed input outside the adapter's declared support — explicit refusal, never fabricated output. |
| `contract-mismatch` | A payload crossed the boundary with a shape outside the closed AISE wire contract — refused with the field named. |
| `capability-unavailable` | A declared capability is not available in this build — an honest declaration. |
| `resource-limit-exceeded` | The input exceeds a declared bounded limit — refused before unbounded work, limit + actual recorded. |

## Determinism contract

Pure: no network, no clock reads, no unseeded randomness. The same
request yields the byte-identical artifact on every host, forever. The
seeded PRNG for doubles (`src/seeded.ts`, mulberry32) is explicitly
seeded wherever pseudo-random-looking distributions are needed.

## Scripts

- `bun test` — the package battery (conformance + parser corpora +
  discrimination + math tests).
- `bun scripts/measure.ts` — regenerates
  `docs/world-program-evidence/WORLD-P0-A/measurements.json` (real
  in-sandbox observations; timings are not gates).

## Evidence

The item's evidence set lives in
`docs/world-program-evidence/WORLD-P0-A/` (license matrix verified from
primary sources, capability boundaries with specification citations,
performance observations with BLOCKED declarations, test transcript,
incumbent-substrate note).
