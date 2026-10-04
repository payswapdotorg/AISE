# WORLD-P2 — capability boundaries (what this lane can and cannot do at P2)

**Item:** WORLD-P2 — the Layer-2 experience lane.
**Scope of this record:** the honest boundary between what
`packages/world-layer2-experience` PROVES at P2 and what it deliberately
does NOT claim. Declared-BLOCKED is acceptable evidence (the ANCHOR
doctrine); nothing here upgrades a contract proof into a capability claim.

## CAN do at P2 (proven, in-repo, deterministic)

1. **Define an engineering problem bound to spatial world context** —
   fail-closed binding through the P0-A scene-composition types
   (`validateScene` + element-id resolution + revision pinning). PROVEN:
   the fixture problem and the negative drills (unresolved element,
   wrong revision, structurally invalid scene).
2. **Assemble the case-context view** — composing AISE-side records
   (reality objects, measurements, property assertions, evidence-bound
   observations) with the P0-B understanding-substrate extracted
   candidates as INFERRED inputs, the substrate's own mapping-block laws
   applied verbatim at composition time. PROVEN: byte-identical assembly
   by two independent doubles; the epistemic/identity violations refused.
3. **Bind evidence to a problem under the Evidence Envelope laws** —
   immutable content-addressed evidence, resolving provenance links with
   closed roles, bundles as the documents/drawings continuity
   translation, recorded (never silent) invalidation. PROVEN: the law
   refusals (duplicate identity, link-to-nothing, invalidating-air) and
   the discounting drill.
4. **Detect missing evidence with typed gaps, explicit remediation tasks
   and worst-of readiness verdicts** — FAILS CLOSED. PROVEN: scenario A
   (NOT_READY with the MISSING steel-section gap), the empty-requirement
   refusal, the epistemic-floor discipline (the BIM file's INFERRED
   LoadBearing never satisfies an OBSERVED floor), the sigma-not-reported
   / sigma-above-bound / unit-mismatch disciplines, the monotonicity and
   order-independence fuzz.
5. **Run bounded reasoning over the case scope** — retrieval pinned to
   the case context; INFERRED advisory claims with resolved citations and
   recorded prompt/context provenance; INSUFFICIENT_EVIDENCE refusal when
   the readiness verdict is not READY; CONTRACT_VIOLATION refusals
   rejecting rogue provider outputs (OBSERVED claims, authority claims,
   unresolvable citations). PROVEN: the two LLM substrate doubles and the
   rogue-provider drills.
6. **Classify deterministic checks (engine-owned vs advisory) and roll up
   the authoritative verdict worst-of** — over the closed 20-entry
   inventory mirroring the PROD-022 check list + AISE-023 FINDING_CODES.
   PROVEN: the fabricated-authority refusals (out-of-inventory id,
   LLM-sourced engine check), the symmetric authority-mislabel refusal,
   the unresolvable-provenance refusal, the empty-check-set refusal, the
   advisory-never-bears-verdict law.
7. **Record governed actions with explicit ownership and lifecycle** —
   the closed transition table; consequential actions gate-required;
   resolution review-governed; observations evidence-required. PROVEN:
   the action law refusals + the full 4×4 transition-matrix fuzz.
8. **Keep the append-only audit trail** — chained content digests,
   monotonic sequences, deterministic replay, typed tamper failures.
   PROVEN: the tamper drill, the randomized append/tamper fuzz, the
   byte-identical trails across the ledger substitution pair.
9. **Run the whole eight-stage lane end-to-end deterministically** — both
   fixture scenarios, both kits, byte-identical re-runs, one audit event
   per lane transition.

## CANNOT do at P2 (declared honestly)

### BLOCKED 1 — mobile/office continuity (WORLD-P5 protocol)

The directive's Layer-2 parity target includes "mobile/office
continuity". At P2 this is **BLOCKED**: the package defines typed
contracts only — there is no web surface, no desktop shell, no field-
mobile client and no cross-platform session/state transport. The
cross-platform identity continuity (the same problem id, evidence
identities, context seals, gap/task ids, audit trail opening on web,
desktop and mobile) is WORLD-P5's wiring.

**Protocol for WORLD-P5:** the P5 item composes this lane's contracts
behind the platform clients and verifies, per acceptance scenario E of
the directive, that (a) the same `problemId`/`contextId`/`reportId`/
action ids/audit event ids resolve identically on every platform, (b) no
platform-specific engineering truth appears (the contracts carry none by
construction — every field is platform-neutral typed data with declared
instants), and (c) the audit trail replays byte-identically when read
from any platform's cached copy. The Android field adapter and the
Electron thin shell (the P0-C recorded decision) are the first
occupants of the client seams; the evidence-capture continuity enters
through the existing Evidence contract (`STILL_IMAGERY` /
`VOICE_NOTE` / etc. — already platform-neutral in
`@aise/shared-contracts`).

### BLOCKED 2 — the real LLM lane (the bounded-reasoning substrate decision)

The `BoundedReasoningProvider` port is proven by two deterministic
in-memory doubles ONLY. **No LLM is integrated, invoked, or selected.**
The real lane is BLOCKED pending the bounded-reasoning substrate
decision, which MUST follow the HFX-000 control-plane gates before any
promotion:

1. **License/use clearance** — the candidate LLM's terms must pass the
   license matrix (a research-only or evaluation-only license is REJECTED
   with the typed `license-blocked` refusal regardless of metrics — the
   HFX-000 law).
2. **Benchmark evidence** — a real candidate adapter must be evaluated
   against the substitution harness on this lane's committed fixtures
   FIRST (the two doubles' outputs are the semantic-equivalence baseline:
   the same claims, the same citations, the same refusal behavior on the
   insufficient-evidence scenario), with divergence recorded, never
   averaged away.
3. **Provenance continuity** — the candidate's adapter must emit the
   `ReasoningProvenance` block (provider id, technology version,
   descriptor digest, rendered-prompt digest, context digest) so the
   substitution is testable from provenance alone; the controlled entry
   `reasonThroughBoundedPort` post-validates every output (INFERRED-only,
   advisory-only, resolved citations) regardless of provider — a real LLM
   is untrusted input, exactly like wire input.
4. **The authority boundary is non-negotiable:** the real LLM NEVER
   becomes an engineering authority (directive §10); its outputs stay
   advisory INFERRED claims; the deterministic-check gate stays the only
   authority classifier; an LLM-sourced check claiming engine ownership
   is refused as fabricated authority (drilled).

### NOT CLAIMED — the authority bounds (existing AISE authorities stay authoritative)

- **The AISE-022 Assurance Engine remains the single readiness
  authority.** This package's `MissingEvidenceDetector` is the Layer-2
  experience lane's typed VIEW of requirement-vs-has assessment; the
  WORLD-P4 wiring composes the real authority behind the port. The
  verdict/gap/task vocabularies here MIRROR the frozen backend registries
  (AISE-022 `READINESS_LEVELS`; AISE-025 `MISSING_EVIDENCE_KINDS`, task
  statuses, review decisions) verbatim so the P4 composition is a wiring
  act, never a re-definition.
- **The PROD-022 solution engine + AISE-023 verification seams remain the
  only engineering authorities.** The deterministic-check gate CLASSIFIES
  attached checks against the closed inventory (mirroring the PROD-022
  check list + AISE-023 FINDING_CODES verbatim); it never computes an
  engine verdict itself — the fixture's engine snapshot digest is a
  DECLARED input standing in for the real engine snapshot that the P4
  wiring binds.
- **The backend AISE-025 case store and AISE-029 reasoning gateway
  remain the owners of their seams.** The refusal-code registry here is a
  VERBATIM mirror of AISE-029's frozen `REFUSAL_CODES` (see the finding
  below).
- **No Procore domain model was copied.** Every incumbent workflow
  behavior was translated into the AISE evidence/case architecture (the
  table in README.md); there are no issue-priority/distribution-list/
  spec-section fields anywhere in the package.

## Findings for the TL (shape WORLD-P4/WORLD-P5)

1. **VERBATIM-MIRROR finding (backend vocabularies in package space).**
   The workspace boundary rules allow packages to import packages only —
   the AISE-025/AISE-029/AISE-022 vocabularies live in `backend/api/src/`
   and therefore CANNOT be imported by this package. The lane's
   case-status / gap-kind / task-status / review-decision / refusal-code
   / readiness vocabularies are VERBATIM mirrors, each documented at its
   definition site. NOT a seam-change request (no existing surface was
   modified): the WORLD-P4 wiring should either (a) compose through the
   backend authorities directly and treat these mirrors as the wire
   shapes they already match, or (b) — if the TL prefers one definition
   site — promote the registries into `@aise/shared-contracts` as a
   governed additive change. The mirrors are asserted against the
   documented frozen values in the test suites.
2. **The observation epistemic-status discipline is type-level in the
   shared contracts.** The shared-contracts `Observation` wire type
   carries no `epistemicStatus` field (observations are observed BY
   TYPE); this lane's context validator additionally refuses a SMUGGLED
   non-OBSERVED status field (drilled). The AISE-025 backend model
   declares the same law with a literal type — consistent semantics, two
   enforcement sites.
3. **The gate verdict vocabulary is wider than the action gate's
   acceptance.** The deterministic-check gate answers the full PROD-022
   outcome vocabulary (pass/fail/unknown/review-needed + refused);
   consequential actions require the literal `pass` — `review-needed`
   BLOCKS the automated action (the engineer-review flag is honored,
   fail-closed, until the review lands). P4's UI should surface the
   distinction (blocked-for-review ≠ failed checks).
4. **The alternate doubles cost ~2× on the full lane** (measured:
   3.42 ms vs 1.68 ms per scenario-B run — the canonical-JSON round-trip
   proofs). That is the price of the wire-stability evidence, paid only
   by the doubles' test paths; the reference doubles are the production
   shape the P4 wiring composes.
5. **No SEAM-CHANGE-REQUEST.** No existing package, app, backend, spec,
   tools or root-config surface required modification. The only
   non-owned-path change is `bun.lock` (+12 lines, the mechanical
   workspace registration of the new package — the recorded P0-A/P0-C
   landing precedent).
