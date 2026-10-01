# ANCHOR-003a — Deferments

The work order's own scope names the deferred lanes; each is recorded here
with its gate and its owner.

1. **Anchoring execution / any provider call behind
   `anchor002-anchoring-contract/1`.** OUT OF SCOPE by the work order's own
   words ("OUT OF SCOPE: any anchoring execution or provider call"). This
   seam DELIVERS the readable plan context the anchoring request consumes;
   executing an AnchoringRequest against any provider (including the
   OpenCV reference lane registered at evaluation stage by ANCHOR-002)
   belongs to the future adapter work order. Until that order runs, the
   reference lane stays at `benchmarked` (evaluation stage) and every
   promotion request answers the typed `license-blocked` refusal — the
   ANCHOR-002 registration's own control-plane gate, unchanged here.

2. **The real-photoset evidence run.** The ANCHOR-001 recommendation's own
   gate ("the synthetic fixture proves the lane, not the world"), carried
   verbatim by the ANCHOR-002 deferment note: the production adapter work
   order is gated on a real photoset with per-photo provenance, a real plan
   drawing/raster, and the same measurements + negative ledger. ANCHOR-003a
   changes nothing about that gate; the plan-image import lane it delivers
   is the UI-side on-ramp for exactly such a real plan raster.

3. **`capture.kind` plan-lane metadata on the evidence record.** Considered
   and deliberately NOT added: the evidence INDEX (`GET /v1/evidence`) does
   not expose `acquisitionMetadata`, so a metadata marker would be
   invisible to the list the work order asks for, and extending the index
   envelope would touch the frozen evidence read contract (backend changes
   beyond the minimal read seam — out of scope). The seam instead keys the
   list on what the index DOES expose, honestly: `DOCUMENT_REGION` (the
   plan lane's own registration discipline — an imported drawing, not a
   photo) + an `image/*` media type. A future work order that opens the
   index's metadata may tighten the filter; nothing here blocks it.

4. **Multi-plan-context declarations per project (a plan-context LIBRARY
   in the graph).** The minimal load-bearing surface records exactly ONE
   annotation node (the stable `active-plan-context` upsert — selecting a
   different raster replaces it; history lives in the version chain). A
   per-plan declaration-node library (`plan-context--<planId>` nodes with
   an active pointer) was considered and deferred: the evidence register
   already persists every imported plan raster (the list), and the
   convention is (re)declared at activation — the honest minimal seam. A
   future order may add the library if product need appears.
