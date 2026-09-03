# @aise/backend-reconstruction

AISE reconstruction pipeline foundation (AISE-008) — asynchronous
preprocessing, pose/reconstruction interfaces, and point-cloud/scene
artifact creation, strictly inside the
`services/reality/reconstruction/**` surface (physically
`backend/services/reality/reconstruction/**`, per the AISE-001
directory mapping in the repository README).

## Runtime

```bash
npm run dev:reconstruction   # from the repository root
```

- Fails closed at boot on invalid configuration (exit 1, structured
  `config.invalid`), identical to the API and worker processes.
- SIGINT/SIGTERM → `reconstruction.shutdown` → `reconstruction.stopped`
  → exit 0.
- v1.0 limitation (documented, not hidden): the process starts the
  pipeline with production defaults and has **no external job intake
  yet** — the durable transport connecting ingestion to
  reconstruction is a later Work Item. Jobs are enqueued
  programmatically (`runner.enqueue(...)`); the entry point proves
  the boot/shutdown contract and is the composition point future
  transport binds into.

## Pipeline model

```text
committed uploads (AISE-004 ingestion state)
        │  capture-source port (CommittedCaptureUpload)
        ▼
[preprocess_session job]  integrity re-verification → frames + exclusions
        │                 (deterministic, fingerprinted, versioned)
        ▼
[pose stage]              PoseEstimator port — production: acquisition-
        │                 metadata orientation adapter (position never
        │                 claimed); output gate fails closed
        ▼
[reconstruction stage]    ReconstructionEngine port — NO production
        │                 engine registered (fail closed until a real
        │                 method lands; placeholder geometry would
        │                 violate evidence-over-claims)
        ▼
[artifact creation]       content-addressed point cloud + scene,
                            provenance-complete, epistemic INFERRED
```

Jobs are processed asynchronously by the runner (FIFO, one at a
time): a failing job is recorded `FAILED` with its typed failure and
isolated — it never stops the runner and never leaves partial derived
state. `drain()` processes the queue deterministically (composition
and tests); `start()`/`stop()` run the background poll loop with
graceful shutdown.

## Fail-closed guarantees (test-pinned)

- **Integrity re-verification** — for every upload the pipeline
  recomputes sha256(payload) and requires equality with the declared
  `contentHash`, the ingestion-recorded `receivedHash`, and the
  declared `byteSize`. Reconstruction never trusts a hash it did not
  recompute (defense in depth over AISE-004).
- **Metadata validation** — `capturedAt` parses; quaternions are
  finite with non-zero norm (accepted verbatim, never renormalized);
  geolocation within contract ranges. Invalid metadata is rejected,
  not repaired.
- **Ambiguity halts** — a non-routable asset type (including the
  AISE-003 cross-MINOR reader sentinel `unknown`) fails the whole
  preprocess (`UNKNOWN_ASSET_TYPE`): ambiguity must not become
  authoritative state. Non-visual assets (METADATA, SKETCH, VOICE,
  DOCUMENT) are excluded **with a recorded reason**, never silently
  dropped. A session with no reconstructable frames is a failure, not
  an empty success.
- **Pose honesty** — every pose field is either established with an
  explicit provenance label or explicitly `NOT_ESTABLISHED` (`null`).
  The result gate requires every input frame to be accounted for
  exactly once (pose or failure) and rejects foreign, duplicated,
  lying, or malformed entries (`INVALID_POSE_OUTPUT`). Any failed
  frame fails the job (`POSE_ESTIMATION_FAILED`) — partial poses do
  not become scene state in the foundation.
- **Engine output gate** — a successful engine output must carry
  non-empty finite points (colors in [0,255]), a non-empty method
  label, and canonically-serializable parameters
  (`INVALID_ENGINE_OUTPUT` otherwise); an engine failure must carry a
  reason.
- **Provenance completeness** — every artifact carries pipeline
  identity, method, parameters fingerprint, and a non-empty input
  lineage (committed assets by content hash, derived artifacts by id
  + hash). Any gap fails creation AND verification
  (`PROVENANCE_INCOMPLETE`).
- **Epistemic discipline** — reconstruction products are `INFERRED`.
  A point cloud or scene claiming `OBSERVED`, `CONFIRMED`, or
  `PROPOSED` is rejected at creation and at verification
  (`EPISTEMIC_STATE_INVALID`). Clouds declare `SESSION_LOCAL` meters
  and `georeferenced: false` — an unevidenced georeferencing claim is
  rejected.
- **Content addressing & tamper detection** — artifact `contentHash`
  is the canonical JSON SHA-256 of all content (points, frames, poses,
  references, provenance, epistemic state); bookkeeping (artifactId,
  createdAt) is excluded so equal inputs + equal pipeline ⇒ equal
  hashes. `verifyPointCloudArtifact` / `verifySceneArtifact` recompute
  and compare; a scene additionally resolves and deeply re-verifies
  every cloud it cites — tampering with a referenced cloud invalidates
  the scene that cites it.
- **Non-emptiness** — empty clouds (`EMPTY_RECONSTRUCTION`) and
  scenes without clouds (`EMPTY_SCENE`) are rejected: "nothing
  reconstructed" is a failure state, not a successful artifact.
- **Idempotency & versioning** — re-committing identical derived
  content is `already_present` (content is identity); preprocessed
  sessions are append-only versioned (a changed fingerprint appends a
  new version; prior versions stay discoverable — reprocessing never
  erases prior derived state); an artifact id reused for different
  content fails closed (`ARTIFACT_ID_CONFLICT`).

## Design decisions (flagged for review)

- **Own job model instead of `@aise/backend-jobs`** — the AISE-001
  jobs package pins `JobType` to system-level types by design
  ("product job types are introduced by their own Work Items together
  with their contracts"). Reconstruction job types therefore live
  inside this surface; a later SHARED work item may unify the
  transport.
- **Capture-source port mirrors AISE-004's committed-upload shape**
  rather than importing the API service's internals — services share
  ports and contracts, not internals. Structural compatibility with
  the committed `UploadRecord` facts (identity, hashes, byte size,
  MIME, verbatim acquisition, payload access) is pinned by tests
  feeding AISE-003 fixture acquisition metadata through
  preprocessing.
- **No production geometry engine** — the engine port exists, the
  output gate exists, and a deterministic test double proves the
  chain in tests; with no engine registered, reconstruct jobs fail
  closed with `NO_RECONSTRUCTION_ENGINE`. Fabricating geometry
  without a real method would violate evidence-over-claims.
- **Pose stage ships a real, honest adapter** — device-reported
  orientation from acquisition metadata (`ACQUISITION_METADATA`
  provenance), position always `NOT_ESTABLISHED` (the v1.0 capture
  contract carries no position data, and a metadata carrier must not
  invent one).
- **Fingerprints/hashes exclude bookkeeping** (`createdAt`,
  `artifactId`) so the same inputs + pipeline + parameters yield the
  same content hash — reproducibility is test-pinned.

## Persistence (documented placeholder)

State lives in an in-memory store (in-memory preprocessed-session
versions + content-addressed artifacts), following the AISE-001
in-memory JobQueue and the AISE-004 in-memory CaptureStore precedent.
Process-local, lost on restart. It is explicitly **not** the
canonical Reality Graph (AISE-011) and not a second engineering-model
authority: it holds derived, INFERRED reconstruction products.

## Tests

Reconstruction-specific suites (134 tests): preprocessing (integrity,
determinism, routing, fixtures-as-contract-consumer), pose (adapter +
fail-closed gate), engine output gate, artifacts (provenance,
content-addressing, tamper detection, cross-artifact integrity),
state store (versioning, idempotency, conflicts), pipeline runner
(lifecycle, failure isolation, fail-closed composition, end-to-end
artifact creation and verification), runtime composition (production
defaults fail closed).

Run: `npm run test --workspace @aise/backend-reconstruction` (or the
repository-wide `npm run verify`).

## Out of scope (deferred)

- Real geometry engines (photogrammetry / depth fusion / SLAM) —
  later Work Items behind the `ReconstructionEngine` port.
- Durable cross-process job transport and durable artifact storage.
- Georeferenced coordinate frames and survey control.
- Reality Graph integration (AISE-011) — artifacts here are derived
  products, not canonical model state.
- Measurement/uncertainty attachment to geometry (AISE-009).
