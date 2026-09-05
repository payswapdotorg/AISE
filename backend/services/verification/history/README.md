# AISE-031 — Historical Comparison / Change Detection

Deterministic version-to-version geometry/semantic/evidence comparison over committed Reality Graph versions — read-only verification-family analysis, never a canonical authority.

## Layering

```
@aise/engineering-model   (AISE-011 model, AISE-012 evidence/validity — frozen authority)
        │  read-only consumption
        ▼
@aise/backend-history     (this package — derived comparison facts)
```

The package consumes: `RealityModelGraph` + `ModelVersionRecord` (committed versions), `EvidenceGraph` (AISE-012 mapping states), and the `computeVersionValidity` projection. It never imports sibling backend services at runtime; it never mutates the Reality Graph, version records, or evidence mapping (digest-proven by tests).

## What it produces

`compareModelVersions({ from, to, evidence? })` → `HistoricalChangeReport`:

- **change records** — one independently reviewable fact each, identity-bound (`changeId` = sha256 of canonical content):
  - object: added/removed (identity facts only — **no correspondence ever inferred**, AISE-011 lineage discipline), epistemic transitions, name changes;
  - geometry: mechanism added/removed, frame/extent changes, dimension-quantity changes, fit-quality changes, asset-reference set changes;
  - properties: added/removed, shape (quantity↔presence), quantity, status, presence, confidence, measurement kind, evidence-citation set — each its OWN record;
  - spaces: added/removed, name, parent, frame, properties;
  - relationships: added/removed (identity-only in v1);
  - evidence validity: `evidence-validity-invalidated` / `restored` — flips of the AISE-012 projection for logical assertions CONFIRMED in both versions (AC-063 retractions surface as change facts, never graph mutations).
- **summary** — honest counts (`identical` reflects the pinned version digests, not the record count).
- **digest** — content-bound over the canonical report body; `validateHistoricalChangeReport` re-derives BOTH the report digest and every record's `changeId` (two-level identity↔content binding), plus ordering, kind→field contract, and summary-count honesty.

## Confidence / uncertainty separation (the acceptance core)

- Quantity records pass both sides through **verbatim** — value, unit, and uncertainty per side, never recomputed or converted.
- Derived deltas: same-unit only; **combined uncertainty only when both sides state standard uncertainties** (RSS). Expanded/tolerance/absent stays uncombined.
- **Confidence (a model probability, AC-070) is a separate record kind** and never appears on a quantity record; uncertainty never appears on a confidence record.
- Epistemic transitions (status) are separate records — never folded into quantity or confidence changes.

## Boundary (fail-closed)

Same-model + same-project enforced; strictly ascending versions; structural re-validation (`validateRealityGraph`) and **digest re-derivation** of both pinned graphs (tampered inputs are rejected, never partially compared); evidence input must be symmetric (both versions or neither); record-count cap fails closed (`LIMIT_EXCEEDED`, never truncated); the runtime service re-validates every report through the fail-closed validator before returning it.

## Known limitations (documented honesty)

See `HISTORICAL_CHANGE_LIMITATIONS` (exported): no correspondence inference; verbatim uncertainty passthrough; same-unit deltas only; per-record provenance is a producer summary (full `ModelProvenance` stays pinned in the compared versions); validity records cover both-version-confirmed subjects only; optional geometry quantities / assertion metadata / space kind changes are covered by the content identity but not decomposed into dedicated records in v1 (the `identical` flag still reflects the digests, so such changes are never silently identical); the report states WHAT changed, never WHY.

## Commands

```
npm run typecheck --workspace @aise/backend-history
npm run test --workspace @aise/backend-history
```

Included in the repository `npm run verify` (workspaces) and CI Foundation verify.
