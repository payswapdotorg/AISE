# @aise/backend-evidence — Evidence & provenance service (AISE-012)

The backend surface of the AISE-012 evidence and provenance graph —
architecture-lock §1: "the authoritative provenance mapping for
engineering assertions":

- **`capture`** — the capture-upload adapter bridging the AISE-004
  ingestion boundary into the evidence subsystem: a committed
  logical upload becomes a first-class evidence record whose
  capture binding is pinned to the ingestion boundary's
  SERVER-COMPUTED received hash — never the client's declared hash.
  Raw captures are immutable evidence artifacts (lock §2); records
  reference them, they never re-assert their bytes. The upload view
  is a narrow structural interface (composition at the runtime
  boundary — no package dependency from this service into the API
  service).
- **`store`** — the project-scoped, append-only,
  boundary-validating evidence persistence (in-memory v1.0,
  following the AISE-001/004/008/011 store precedents): records,
  links, and retractions are never mutated or erased — "removing
  required evidence" is retraction, and retraction is history. The
  AISE-008 PR #9 lesson applied — **the store does not trust the
  caller**: record identity and content hash are re-derived,
  capture bindings are verified field-by-field against the injected
  upload reader (tenant boundary enforced), link subjects are
  resolved against the injected model-graph reader (committed
  versions only, cross-project links rejected), and retracted-event
  identities can never be resurrected (re-attachment is a new
  event). Idempotency: `exists_identical` / `already_present` /
  `already_retracted`; conflicting content for one identity is
  `exists_conflict` — never a silent merge.
- **`runtime`** — bounded service composition
  (`maxEvidenceRecords` default 10,000; `maxEvidenceLinks` default
  50,000): capture evidence registration, linking with the service
  clock, retraction, the AC-062/AC-063 verification-validity
  projection (version-pinned: exactly one committed version's graph
  plus the project's current mapping snapshot), per-entity coverage
  (the AISE-013 completeness input), and per-entity evidence
  bundles (the AISE-016 review input). The service adds NO
  authority of its own: it is transport and projection — the
  canonical Reality Graph is read only (subject resolution,
  validity) and never written; graph digests are bit-identical
  before and after every evidence operation (proven by tests).
- **`errors`** — typed, fail-closed `EvidenceServiceError` with
  wrapped pure-layer (`engineering-model/evidence`) causes
  preserved in a structured cause chain.

The pure model layer lives in
`@aise/engineering-model` (`src/evidence/**`): evidence records
(first-class, immutable, content-pinned; identity is lineage — the
source pin — and content is separately hash-pinned), assertion
subjects (references into committed model versions; resolution
against the real graph, fail-closed), links and retractions
(append-only events with deterministic identities), the
project-scoped mapping aggregate (canonical ordering, digest,
deep-freeze), whole-graph re-validation (the persistence-boundary
gate), the verification-validity projection (a CONFIRMED assertion
is verification-VALID iff at least one live link attaches evidence
to its subject AND every cited evidence reference is covered by
that live support; retraction flips to INVALIDATED while the
canonical graph stands untouched), and derived coverage/bundle
read views (never stored).

v1.0 limitation (documented, not hidden): in-memory store (lost on
restart); no external intake surface yet — capture evidence
registration and review-time linking bind into this composition
point, and web reads arrive with AISE-015/016.

## Commands

```bash
npm run typecheck --workspace @aise/backend-evidence
npm run test --workspace @aise/backend-evidence
npm run dev:evidence        # from the repository root
```
