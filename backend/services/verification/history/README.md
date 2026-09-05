# AISE-031 — Historical Comparison / Change Detection

Deterministic version-to-version geometry/semantic/evidence comparison over committed Reality Graph versions — read-only verification-family analysis, never a canonical authority.

## Layering

```
@aise/engineering-model   (AISE-011 model, AISE-012 evidence/validity — frozen authority)
        │  read-only consumption
        ▼
@aise/backend-history     (this package — derived comparison facts)
```

The package consumes: `RealityModelGraph` + `ModelVersionRecord` + the version's authoritative commit `ModelProvenance` (committed versions), `EvidenceGraph` (AISE-012 mapping states), and the `computeVersionValidity` projection. It never imports sibling backend services at runtime; it never mutates the Reality Graph, version records, or evidence mapping (digest-proven by tests).

## What it produces

`compareModelVersions({ from, to, evidence? })` → `HistoricalChangeReport`:

- **change records** — one independently reviewable fact each, identity-bound (`changeId` = sha256 of canonical content):
  - object: added/removed (identity facts only — **no correspondence ever inferred**, AISE-011 lineage discipline), epistemic transitions, name changes;
  - geometry: mechanism added/removed, frame/extent changes, dimension-quantity changes (**including the presence of optional quantities — added/removed are their own records, never silently dropped**), fit-quality changes, asset-reference set changes;
  - properties: added/removed, shape (quantity↔presence), quantity, status, presence, confidence, measurement kind, evidence-citation set — each its OWN record;
  - spaces: added/removed, name, parent, frame, properties;
  - relationships: added/removed (identity-only in v1);
  - evidence validity: `evidence-validity-invalidated` / `restored` — flips of the AISE-012 projection for logical assertions CONFIRMED in both versions (AC-063 retractions surface as change facts, never graph mutations).

**Provenance authority (mandatory on every change kind except evidence-validity flips):** object-family records carry the per-object producer provenance of the compared graphs (authoritative at ingest); space/relationship records (spaces and relationships carry no per-entity provenance in the Reality Graph v1) carry the compared **versions' commit producers**, supplied at the boundary and fail-closed validated (`validateModelProvenance`) — never a synthesized or hard-coded second authority. Evidence-validity records deliberately carry no producer summary: a validity flip is derived from the two pinned evidence graphs (the evidence subsystem is the authority); pinning a version producer would misattribute it.
- **summary** — honest counts (`identical` reflects the pinned version digests, not the record count).
- **digest** — content-bound over the canonical report body; `validateHistoricalChangeReport` re-derives BOTH the report digest and every record's `changeId` (two-level identity↔content binding), plus ordering, kind→field contract, and summary-count honesty.

## Confidence / uncertainty separation (the acceptance core)

- Quantity records pass both sides through **verbatim** — value, unit, and uncertainty per side, never recomputed or converted.
- Derived deltas: same-unit only; **combined uncertainty only when both sides state standard uncertainties** (RSS). Expanded/tolerance/absent stays uncombined.
- **Confidence (a model probability, AC-070) is a separate record kind** and never appears on a quantity record; uncertainty never appears on a confidence record.
- Epistemic transitions (status) are separate records — never folded into quantity or confidence changes.

## Boundary (fail-closed)

Same-model + same-project enforced; strictly ascending versions; structural re-validation (`validateRealityGraph`), **commit-producer validation** (`validateModelProvenance` — an absent or malformed version producer is a provenance gap, never a default), and **digest re-derivation** of both pinned graphs (tampered inputs are rejected, never partially compared); evidence input must be symmetric (both versions or neither); record-count cap fails closed (`LIMIT_EXCEEDED`, never truncated); the runtime service re-validates every report through the fail-closed validator before returning it.

## Known limitations (documented honesty)

See `HISTORICAL_CHANGE_LIMITATIONS` (exported): no correspondence inference; verbatim uncertainty passthrough; same-unit deltas only; per-record provenance is the authoritative producer summary (per-object for the object family, version commit producers for spaces/relationships); evidence-validity records carry no producer summary (the evidence subsystem is the authority — misattribution avoided) and cover both-version-confirmed subjects only; optional structured-geometry quantities ARE decomposed into added/removed records; assertion metadata / space kind changes are covered by the content identity but not decomposed into dedicated records in v1 (the `identical` flag still reflects the digests, so such changes are never silently identical); the report states WHAT changed, never WHY.

## Commands

```
npm run typecheck --workspace @aise/backend-history
npm run test --workspace @aise/backend-history
```

Included in the repository `npm run verify` (workspaces) and CI Foundation verify.
