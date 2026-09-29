# AISE — Voice Notes as Evidence Work Orders
**Authorization basis:** `docs/layered-competitive-parity-scorecard-2026-09-29.md` open item 3 (L1: OpenSpace captures voice on site; AISE's acquisition methods cover stills/video today) + `spec/architecture.md` §7 (evidence kinds).
**Execution:** one worker per work order; maximum three concurrent workers. This document defines VOICE-001. Client UI/UX lanes (web capture surface, Android field capture) are deliberately OUT of scope here — they follow in a separate work order once the contract lands (the PROD-016 pattern: contract + server/API semantic conformance first, clients after).

## VOICE-001 — Voice notes as an evidence kind (contract + API conformance)

**Protected primary surfaces:** `packages/shared-contracts/src/evidence.ts`, the Android contract mirror `apps/android/core/src/main/kotlin/org/payswap/aise/core/session/AcquisitionMethod.kt`, and the evidence derivation path. Do not alter evidence immutability, content-addressing, or the register/idempotency semantics.

### Objective

Make a field voice note a first-class evidence kind: raw audio captured on site, registered content-addressed like every other evidence, with an optional provider-gated transcription recorded as a `Derivation` — never as a rewrite of the raw evidence.

### Required work

- Add `VOICE_NOTE` to `EVIDENCE_METHODS` (`packages/shared-contracts/src/evidence.ts`) and mirror it 1:1 in the Android `AcquisitionMethod` enum (source-sync only; no Gradle run required by this work order's gate).
- Extend `ACQUISITION_METADATA_KEYS` with the canonical voice keys (duration, codec/media subtype, sample rate, language hint — exact key names are the worker's design decision but must follow the existing `capture.kind` / `acquisition.sensorId` dot-namespacing and be documented in the contract header).
- Bump the shared-contracts version per the family versioning discipline and regenerate the exported JSON Schemas / wire fixtures.
- Define the ASR transcription derivation contract: a provider-neutral method identity (e.g. `transcription.asr`), the `Derivation` record shape linking the voice-note content id (input) to the content-addressed transcript artifact (output), deterministic parameters as a string map, and the provenance rule that the transcript is a derived candidate — never authoritative text, never a rewrite of the raw evidence.
- Honest degradation is load-bearing: with no ASR provider configured, registering a voice note MUST succeed and the absence of a transcript MUST be an explicit, inspectable state (no fabricated transcript, no silent skip, no error). This mirrors the reconstruction provider discipline (`PROD-009`).
- API conformance: the evidence register accepts `VOICE_NOTE` evidence end-to-end (register → idempotent re-register → get → list → provenance-link) under the existing authorization model; a derivation can be recorded against a registered voice note and is replayable.
- Tests: contract schema tests (enum, metadata keys, codec fixtures, JSON Schema export), evidence-service tests (voice-note register/idempotency/get/list), derivation tests (recorded derivation over a voice note; provider-absent honest state), and unknown-key tolerance must remain intact (the open string map discipline).

### Acceptance

- `bun run verify` PASSES at the delivered tree (no worker narrative substitutes for the gate).
- Evidence remains append-only and immutable; a voice note can never be rewritten or invalidated by a transcript.
- The transcript derivation carries method identity, version, parameters and input content ids — provenance-complete and replayable.
- Provider-absent behavior is proven by test: voice-note registration succeeds without any ASR configuration and the no-transcript state is explicit.
- The Android Kotlin enum mirror is source-synced (same order, same names) — the three-platform one-contract discipline.
- No client UI work is included or required by this work order.

### Deliverables

`docs/productization-evidence/VOICE-001/` containing: the contract delta description (new method, new metadata keys, derivation contract), the honest-degradation proof (test names + expected outcomes), the conformance transcript (register/idempotency/get/list/derivation against a local stack), and the hand-off notes for the follow-up client work order (what the web capture surface and the Android field capture will consume).
