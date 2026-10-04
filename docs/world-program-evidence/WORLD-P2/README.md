# WORLD-P2 — the Layer-2 experience lane (evidence)

**Item:** WORLD-P2 — Layer 2 Procore parity: problem → context → evidence →
missing-evidence detection → bounded reasoning → deterministic checks →
action → audit trail.
**Branch:** `work/WORLD-P2` (base `82f31d6`, the WORLD-P0-C-complete state).
**Deliverable:** `packages/world-layer2-experience/` — the
`@aise/world-layer2-experience` package defining the Layer-2 experience
lane as typed, testable contracts composing the P0 ports with the
existing evidence/case architecture — plus this evidence directory.
**Status:** every lane stage proven by two independent in-memory
substitution doubles with byte-identical outputs on the committed
fixtures; the real occupants (the app wiring over the real Reality Graph,
scene runtime, assurance seam, LLM adapter, and case/action store) are
future occupants — P2 defines the lane, P4 wires the primary UI.

## The binding translation law (how the incumbent's workflow behavior was translated)

Directive §7 P2: "Do not copy Procore's domain model. Translate useful
workflow behavior into the AISE evidence/case architecture." The
translation table actually implemented:

| Incumbent workflow behavior | AISE translation (this package) |
| --- | --- |
| Issue / observation / inspection records | `EngineeringProblem` — a typed statement BOUND to spatial world context (P0-A scene-composition types + stable AISE element ids); AISE problems/cases, never Procore issues |
| Issue detail view / "what is this about" | `CaseContext` — the composed context view: bound elements, AISE-side records, and the P0-B understanding-substrate extracted candidates entering as INFERRED inputs |
| Photos / documents / drawings / RFIs / submittals as attachments | `ProblemEvidenceEnvelope` — Evidence (immutable, content-addressed), `ProvenanceLink` roles (SUPPORTS/CONTRADICTS/DERIVED_FROM/CONTEXT), `EvidenceBundle` described groupings; there is NO parallel document-management domain |
| "Needs more info" / submittal-required flags | `MissingEvidenceReport` — typed requirement-vs-has gaps with `MissingEvidenceTask` remediation records and a worst-of readiness verdict; FAILS CLOSED (empty requirement set → refusal, never vacuous READY) |
| Procore Assist (bounded AI retrieval/action) | `BoundedReasoningProvider` — the LLM lane as a REPLACEABLE SUBSTRATE behind a port with two substitution doubles; retrieval scoped to the pinned case context; outputs INFERRED advisory claims with recorded prompt/context provenance; refusal on insufficient evidence is first-class; NEVER an engineering authority |
| Checklists / automated checks | `gateDeterministicChecks` — the engine-owned vs advisory classification over the closed inventory mirroring the PROD-022 solution-engine checks + AISE-023 verification finding codes; fabricated authority is refused |
| Assignee / inspector / due dates / status | `ProblemAction` — typed per-kind payloads, explicit `ActionOwnership` (owner/assigned-by/assigned-at as declared instants), a governed closed transition table |
| Activity / audit / email-style history | `AuditTrail` — append-only, chained content digests; every lane transition one auditable who/what/when/why/evidence-bound record; deterministic byte-identical replay |
| Mobile ↔ office continuity | DECLARED BLOCKED at P2 (see CAPABILITY-BOUNDARIES.md — the cross-platform identity continuity is WORLD-P5's wiring; the contracts carry no platform-specific state by construction) |

## What was delivered

`@aise/world-layer2-experience` (27 source files, 10,784 added lines)
carries seven surfaces (package.json exports):

- **`src/seam.ts`** — the nine lane laws (epistemic, identity,
  evidence-envelope, fail-closed readiness, no-LLM-authority, refusal,
  ownership, audit, determinism), the eight-stage vocabulary, the typed
  actor discipline, the digest discipline RE-EXPORTED VERBATIM from the
  P0-B seam (this lane composes that substrate, never re-defines it), and
  the HFX-000 closed failure vocabulary imported from
  `@aise/provider-registry` (never modified — proven by digest/registry
  agreement tests).
- **`src/problem/`** — stages 1–2 (PROBLEM + CONTEXT):
  `defineEngineeringProblem` (fail-closed spatial binding through the
  P0-A `validateScene`), the `CaseContextAssembler` port, the substrate
  candidate composition validated through the P0-B
  `validateAiseMappingBlock` (the substrate's own INFERRED/digest/
  evidence-binding laws applied verbatim at composition time), and TWO
  doubles (direct assembly vs canonical-JSON round-trip) producing
  byte-identical contexts.
- **`src/evidence/`** — stages 3–4 (EVIDENCE + MISSING-EVIDENCE):
  `bindProblemEvidence` (the Evidence Envelope laws: duplicate identity
  refused, provenance resolves or refuses, invalidation recorded never
  silent), the `MissingEvidenceDetector` port (typed gaps with explicit
  remediation tasks, worst-of readiness verdicts mirroring the AISE-022
  `READINESS_LEVELS` and AISE-025 `MISSING_EVIDENCE_KINDS` vocabularies
  verbatim), and TWO doubles (scan-based vs index-based evaluation)
  producing byte-identical reports.
- **`src/reasoning/`** — stages 5–6 (BOUNDED REASONING + DETERMINISTIC
  CHECKS): the `BoundedReasoningProvider` port — THE LLM SUBSTRATE SEAM
  (real lane BLOCKED, see CAPABILITY-BOUNDARIES.md) — with the
  AISE-029-mirrored frozen refusal registry, retrieval scoped to the
  pinned case context, INFERRED-only advisory claims with resolved
  citations and recorded prompt/context provenance; the deterministic-
  check gate with the closed 20-entry engine-owned inventory (the PROD-022
  check list + AISE-023 FINDING_CODES, mirrored verbatim) refusing
  fabricated authority in both directions; TWO LLM substrate doubles
  (direct vs round-trip claim construction) with byte-identical claims.
- **`src/action/`** — stages 7–8 (ACTION + AUDIT TRAIL):
  `recordProblemAction` (ownership explicit; ungated consequential
  actions refused; resolution review-governed; observations require
  evidence), the closed lifecycle transition table, the `AuditLedger`
  port (append-only chained digests, deterministic replay, typed tamper
  failures), and TWO recorder + TWO ledger doubles with byte-identical
  outputs.
- **`src/lane.ts`** — the lane runner composing the four family ports
  end-to-end with the P0-B IFC double's extraction as the substrate
  input; the two committed fixture scenarios (A: honest
  insufficient-evidence refusal; B: ready → claims → gate → governed
  action), each producing the content-derived `runId`.
- **`src/profiles.ts`** — the ten control-plane `ProviderProfile`s (two
  doubles × five ports; 15/15 mandatory fields; honestly-empty benchmark
  tables; the real-LLM-lane BLOCKED declaration recorded on the reasoning
  profiles).

## Gates (all green at the delivery commit)

1. **Baseline preserved + the new battery:** `bun run verify` PASS
   **6942/6942** — the P0-C baseline 6824 plus this package's **118 new
   tests** (seam 11 / problem 20 / evidence 23 / reasoning 21 / action 22
   / lane 14 / profiles 7), zero regressions. (One pre-existing sandbox
   gap was closed before the run: the Playwright chromium-1208 build was
   missing in this sandbox — the exact gap recorded by the WORLD-P0-A
   lane — and was installed with `bunx playwright install chromium`
   BEFORE the battery; the three browser-gate tests then passed
   unchanged. No repo file was modified by the install.)
2. **Typecheck strict / lint clean / boundaries clean:** `tsc --noEmit`
   over all workspace tsconfigs including the new package's, `eslint .`
   clean, boundary scan over 1197 files with no cross-zone violations.
3. **Diffstat discipline:** `git diff --stat 82f31d6..HEAD` touches ONLY
   `packages/world-layer2-experience/**` and
   `docs/world-program-evidence/WORLD-P2/**` — plus `bun.lock`, which
   carries the mechanical workspace registration of the new package only
   (12 added lines, zero existing lines touched — the recorded P0-A/P0-C
   landing precedent).
4. **Substitution law:** every family port proven implementable by two
   independent in-memory doubles — byte-identical outputs on the
   committed fixtures (contexts, reports, claims, actions, audit trails);
   provider identity (descriptor digests / methodVersion / result ids)
   differs by design, exactly as the P0-B substitution pair does.
5. **Evidence set committed with the branch:** this directory (4 md).
6. **Determinism:** no network / clock / randomness / I/O anywhere in the
   contract core; every instant is a declared fixture input; the same kit
   + scenario re-run produces the byte-identical canonical JSON and run
   id (asserted in `lane.test.ts`).

## Evidence shape

| File | Content |
| --- | --- |
| `README.md` | this index |
| `CAPABILITY-BOUNDARIES.md` | what this lane can and cannot do at P2; the BLOCKED declarations (mobile/office continuity → WORLD-P5 protocol; the real LLM lane → the bounded-reasoning substrate decision protocol); the honest authority bounds |
| `PERFORMANCE-OBSERVATIONS.md` | the NOW-measured in-sandbox numbers (lane-run latencies, battery and typecheck timings, the alternate-kit cost) with the measurement protocol; zero fabricated numbers |
| `TEST-TRANSCRIPT.md` | the full honest test transcript: the gate re-run sequence, the per-suite counts, the fail-closed drills exercised, the fuzz/property batteries, and the two fixture scenarios' sealed ids |

## Honesty bounds

- No substrate is integrated, imported, or required at runtime: the
  Reality-Graph store, the scene runtime, the IFC engine, the LLM and the
  backend case/action persistence are all future occupants of the ports
  these contracts prove (the package composes the P0 packages' TYPES and
  their committed in-memory doubles — that is the P0 composition, not an
  integration).
- The AISE-022 Assurance Engine remains the single readiness authority
  and the PROD-022 solution engine + AISE-023 verification seams remain
  the only engineering authorities of the AISE architecture; this
  package's detector and gate are the experience lane's typed VIEWS of
  those authorities, mirrored vocabularies included, and the WORLD-P4
  wiring composes the real ones behind these ports.
- The backend AISE-025 EngineeringCase and AISE-029 reasoning-gateway
  vocabularies mirrored here (case statuses, gap kinds, task statuses,
  review decisions, refusal codes) are VERBATIM mirrors recorded as a
  deliberate composition decision (packages cannot import the backend
  zone); the mirror is recorded as a finding for the WORLD-P4 wiring in
  CAPABILITY-BOUNDARIES.md.
