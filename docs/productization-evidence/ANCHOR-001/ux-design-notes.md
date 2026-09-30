# ANCHOR-001 — UX Design Notes (design notes only — NO UI implementation, per the charter)

These notes record what an accepted anchoring hypothesis would mean for
the two existing seams the parity scorecard names: the capture surface's
**registration panel** (`apps/web/src/app/surfaces/CaptureMission.tsx` →
`EvidenceRegistrationPanel`) and the **SiteTwin reality recorder**
(`apps/web/src/app/surfaces/RealityRecorder.tsx` + the closed vocabularies
in `apps/web/src/reality-recorder.ts`). Everything here is a design note
for a future Work Item; this spike implements no UI.

## 1. Where the anchor candidate appears in the existing flow

The current PROD-016/016b crossing is:

```
upload (content-addressed, idempotent)
  → register (the registration panel: capturedAt + acquisition method + session)
      POST /v1/evidence → "Registered."
  → record (the reality recorder: closed vocabularies, evidence picker,
      one governed change set) → POST /v1/reality/projects/:id/changes
  → pin (the Studio's baseline picker prefills the recorded version)
```

An anchoring lane inserts ONE new candidate state between **register** and
**record** — never a write:

```
register ("Registered.")
  → ANCHOR CANDIDATE (read-only panel state, per still or per session):
      "3 of 10 stills can be placed on the floor plan (confidence 0.8–0.9,
       expected placement error ~2–8 cm). 7 could not (reasons: …)."
  → the human approves/rejects/ignores
  → ONLY an approval prefills the recorder draft (still one change set,
      still gated by the governed changes API — the anchor never writes)
```

The provider's typed refusals surface verbatim in this state — the
charter's fail-closed law is a UX property too: the panel says "no plan
context was supplied" or "these stills do not match this plan" in the
provider's own typed words (`refusalDetail`), never a silent empty map.

## 2. How an accepted anchor prefills the SiteTwin reality recorder

The recorder's draft model (`RealitySnapshotDraft` in
`reality-recorder.ts`) is node rows + relation rows over the CLOSED
vocabularies:

- `REALITY_NODE_KINDS` = project | site | building | storey | space |
  element | opening | system | issue | **annotation**
- `REALITY_RELATIONSHIP_KINDS` = contains | bounded-by | adjacent-to |
  supports | part-of | opens-into | references
- `REALITY_EPISTEMIC_STATUSES` = CONFIRMED > OBSERVED > INFERRED > PROPOSED
- `REALITY_PROVENANCE_ROLES` = SUPPORTS | DERIVED_FROM | CONTEXT |
  CONTRADICTS
- every node/property/relation needs ≥ 1 provenance source (evidence id
  and/or derivation note) or the engine's `missing_provenance` refusal
  fires — the anchor prefill must satisfy this by construction.

### The prefill (one accepted anchor for a still set over one plan)

- **Node rows** (upsert-node):
  - one `annotation` node per accepted still — id
    `anchor:<planId>:<evidenceContentId>` (deterministic, idempotent
    re-anchoring produces the same id, mirroring the engine's
    derivation-keyed identities);
  - the node's property lines (the recorder's `key = value unit` shape):
    - `floor-registration.frame = plan-raster:<planId>` (unitless string)
    - `floor-registration.transform-digest = sha256:<digest of the matrix>`
      (the full 3×3 matrix is TOO BIG for a property line; the digest
      identifies it, the matrix lives in the anchoring evidence record)
    - `floor-registration.error-budget = <budget95M> m` (the explicit
      uncertainty, carried as a MEASUREMENT-shaped property, never
      collapsed into confidence)
    - `floor-registration.confidence = <score>` (the declared support
      score, clearly labeled a heuristic, epistemically distinct from
      the error budget)
    - `epistemic-status = INFERRED` (pre-filled; the human approval step
      is what would move it to CONFIRMED — see §3)
  - **Relation rows**: `references` from each annotation node to the
    still's registered evidence id — provenance role `DERIVED_FROM`
    (the anchor is derived from evidence, method string
    `anchored-by:sift-homography-spike@anchor001-adapter/1` — the
    provider-neutral method identity, exactly the VOICE-001 pattern for
    ASR transcripts: method names the lane, never the vendor internals).

- **What the prefill does NOT do:**
  - no `element`/`space` nodes are created (the anchor places EVIDENCE
    on the plan; it does not invent building elements — that stays
    human/reconstruction work);
  - no geometry is written (the transform is carried as a
    digest+reference on an annotation, ready for a future
    evidence-graph record kind, not as RealityObject geometry);
  - nothing is CONFIRMED (INFERRED max — the human approval step is the
    only path to CONFIRMED).

- **The recorder's submit stays exactly as-is:** ONE change set, brokered
  `reality:write` authorization, the governed changes API — the anchor
  prefill only changes what the draft CONTAINS, never how it commits.
  If the operator removes the annotation rows, the anchor simply does not
  enter the Reality Graph (removable by design).

## 3. What the human approval step looks like (notes only)

A **two-sided review** with the uncertainty visible, mirroring how the
recorder already shows provenance pickers:

- **Left — the plan** with the still's anchor footprint drawn (the
  estimated transform applied to the still's image outline on the plan
  raster), shaded by the per-point error budget; overlapping accepted
  stills show their cross-validation links (green consistent / red
  inconsistent) — the operator sees the redundancy evidence, not just a
  score.
- **Right — the still thumbnail + the typed numbers**: inlier support,
  cross-validation peers, the error budget in meters ("expected
  placement error ≤ 2 cm (95 %)"), the confidence score labeled as a
  heuristic, and — for the refused stills — the provider's typed
  refusalDetail verbatim.
- **The approval actions** map to epistemics, not to plumbing:
  - **Accept** → the recorder draft is prefilled (§2) with
    INFERRED status; the submit-then-verify path is unchanged.
  - **Accept & verify** → the same prefill but the operator's identity +
    instant land in the property's verification fields (the
    `PropertyAssertion` `verified_by`/`verified_at` shape — the existing
    human-observation discipline); epistemic status moves to CONFIRMED
    in the DRAFT (still one governed change, still append-only).
  - **Reject** → a typed disposal record (evidence id + reason), kept in
    the anchoring evidence record — rejected anchors are evidence too
    (the negative ledger discipline at UX scale).
  - **Re-anchor** → re-run with a different/adjusted plan context (e.g.
    the operator picks the correct drawing when the mismatched-plan
    refusal fires).
- **Trust boundaries the UI must make visible** (from this spike's
  findings): common-mode error is invisible to cross-validation
  (measurements.md §4) — so the review shows the FOOTPRINT ON THE PLAN,
  not just green checks; and a still with zero cross-validation peers
  renders an explicit "no redundancy evidence" badge (still-001's class).

## 4. Open UX questions for the Work Item

- Session-level vs still-level approval: the provider answers per
  request (a session), the recorder records per node — the prefill
  should offer "accept the 3 confident stills, review the rest" (the
  typed PARTIAL state, PORT.md §7, is the API prerequisite).
- Where the plan raster comes from in the live product: the recorder has
  no readable projection endpoint today (the explore-seam finding); the
  anchoring lane needs a plan-image upload/import surface with the
  declared `rasterToScene` convention (the handedness law) captured at
  import time — a small, load-bearing piece of UX.
- Whether the anchor's annotation nodes survive into the Studio's pin
  step (the baseline picker prefills the latest reality version —
  anchored evidence changing the version sequence is fine; the anchor
  itself never claims to be geometry).
