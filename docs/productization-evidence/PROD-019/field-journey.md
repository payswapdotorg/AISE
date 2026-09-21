# PROD-019 — Representative field journey and offline/resume evidence

**Work item:** PROD-019. **Base:** public main `7d21d47147a3df14a0e6138131de6d9add672d27`.

The representative field journey is EXECUTED and proven end-to-end on a plain
JVM by `FieldJourneyTest` (`:core`), which composes the shared adapter-contract
objects, the EXISTING capture-session journal/recovery engine (AISE-005,
untouched in behavior) and the new submission seam. The `:app` runtime
(`field/FieldJourneyRuntime` + the mission panel) wires the same journey into
the Android shell (its JVM test, `FieldJourneyRuntimeTest`, runs at the
integration station — this sandbox has no Android SDK).

## 1. The journey, step by step (the semantic objects at each step)

The representative journey runs the task this build HONESTLY supports (still +
video field capture). All fixed constants — no clock, no randomness.

### Step 1 — Field-intent selection

The operator selects the field intent; the client authors the ONLY object a
client legitimately authors:

- **`TaskIntent`** (`task-field-0001`, `field-capture`, "Capture visual
  evidence of the cracked masonry on level 2 so the engineering case can be
  diagnosed.", project `proj-7f3a2b`, targets `[case-91ab, node-wall-12]`).
  Schema-validated against the committed `TaskIntent.schema.json` (zero
  errors). The server validates and answers intents — this is intent, not
  authority.

### Step 2 — Capability assessment

The declared `ClientCapabilityProfile` (see `conformance-report.md` §1) × the
server-owned `TaskCapabilityRequirements` → the pure negotiation consumer →
**`CapabilityNegotiation`**:

- For the journey's requirement set (touch/camera-scan input + still imagery,
  blocking — the task this build honestly supports): outcome **`permitted`**,
  `camera-capture` and `offline-queue` among the permitted interaction modes.
- The journey verdict and its domain reasons are surfaced in the mission UX.

### Step 3 — Adaptive mission

The server's **`MissionPlan`** (`mission-2026-000042`: overview stills
[mandatory], detail stills [mandatory], walk-through video [optional]) + the
negotiation + the DEVICE compatibility verdict
(`MissionCompatibilityChecker`, AISE-030 — facts-not-policy) → the
**`MissionDirective`**: per step the EXACT capture action
("Capture still image" / "Record video footage" — never a generic prompt),
the server's instructions/mandatory/requirementRefs VERBATIM, the honest
readiness (READY / DEGRADED / NEEDS-PROBING / NOT-EXECUTABLE) and the
verbatim burden/blocker notes. Before capture: 3 evidence gaps.

### Step 4 — Guided capture WITH an offline interruption

The session journal is THE truth (AISE-005 discipline, untouched):

1. `session.created` (missionRef `mission-2026-000042`) → `CAPTURING` →
   `asset.captured` (overview stills, real AISE-CONTENT-V1 content id) —
   gap 1 closes.
2. **THE INTERRUPTION** — the process dies mid-capture. The journal tail
   survives; `SessionReplay.replay` folds the partial journal (status
   `CAPTURING`, 1 asset).
3. **RECOVERY** — the interrupted session re-opens EXACTLY ONCE (a
   `session.reopened` event with the recovery audit: the uncommitted tmp
   discarded, the journaled asset verified). The fold rejects double reopens
   (the existing invariant, re-proven here).
4. **RESUME** — the detail stills and the walk-through video are captured;
   all gaps close (the journey records each intact asset's content id per
   step — deterministic bookkeeping, facts not sufficiency).

### Step 5 — Finalize + evidence submission

5. `FINALIZED` → `SessionManifestExporter` emits the manifest (validated
   against the COMMITTED AISE-003 `CaptureSessionEnvelope.schema.json`
   discipline, unchanged from AISE-005).
6. The **submission payload** = manifest + the journey's `TaskIntent` + the
   declared `ClientCapabilityProfile` — every part schema-valid against its
   committed contract schema.
7. **SUBMIT WHILE OFFLINE** — the seam reports
   `NetworkAvailability.Unavailable("no sync transport on this build — the
   AISE-030 transport is not wired; evidence stays in the resumable offline
   queue")` → the explicit **`DeferredOffline`** phase: the reason is
   surfaced VERBATIM, the attempt count recorded, the idempotency key
   (sha-256 of the payload — `aise-submission-v1:…`) stable across retries.
8. **RESUME** — another attempt while still offline (attempt 2, still
   explicit); then the transport comes online → the same payload, the same
   key → **`Submitted`** with the server reference (`op-9d2f1c`) carried
   verbatim.

A typed server REJECTION is surfaced verbatim in a `SubmissionFailed` phase —
never silently dropped (`a typed server rejection is surfaced verbatim`).

## 2. Which JVM tests prove interruption/resume

| Guarantee | Proof (JVM test) |
|---|---|
| Mid-capture interruption survives (journal is the truth; partial fold) | `FieldJourneyTest` step 4.2 — `SessionReplay.replay` over the interrupted journal |
| Exactly-once reopen after interruption | `FieldJourneyTest` step 4.3 (+ the AISE-005 `SessionReplayTest` battery, unchanged) |
| Resume closes the remaining evidence gaps | `FieldJourneyTest` step 4.4 — `FieldJourney.recordEvidence` per captured asset |
| Finalized manifest is the portable projection | `FieldJourneyTest` step 5 (`SessionManifestExporter`, schema-validated discipline) |
| Submission defers EXPLICITLY offline (never silent) | `FieldJourneyTest` step 7 — `DeferredOffline` with the verbatim reason + attempt count |
| Resumable submission with a stable idempotency key | `FieldJourneyTest` step 8 — deferred → (still offline: attempt 2) → online → `Submitted`; `EvidenceSubmission.submissionKeyOf` is a pure function of the payload |
| Typed rejection surfaced verbatim | `FieldJourneyTest` `a typed server rejection is surfaced verbatim, never silently dropped` |
| The app runtime wires the same journey | `FieldJourneyRuntimeTest` (`:app:test`; integration station) — journey start, honest profile, deterministic evidence bookkeeping (incl. no double-count on flow re-render), seam deferral, attempt counting, scripted-online resume, reset |

The offline queue, session integrity, content identity and capture platform
layers are untouched in behavior (the PROD-016 audit records NO removals
there); this item adds only the journey wiring AROUND them.

## 3. The explicit BLOCKED state (never a generic prompt)

Two blocked scenarios are proven with the committed requirement fixtures:

- **The committed `field-depth-capture` set** (depth capture kind, blocking)
  against this build's honest profile → **BLOCKED** with the verbatim reason
  `"camera requirement unmet: required any of [depth]; profile declares
  [still, video]"` — the honest capability gap of this build's capture
  binding, surfaced, never silently downgraded. The blocked task permits NO
  interaction modes and the directive exposes NO actionable steps.
- **The committed `lidar-capture` set** — BLOCKED with the verbatim reason,
  INDEPENDENT of the device gate (the device snapshot is depth-capable; the
  checker would call a depth step executable — the client negotiation blocks
  the task on the declared capture kinds). The A-R3 independent-gates proof.

In the app UI, the mission panel renders the blocked reasons VERBATIM (error
color) and offers no capture affordances.

## 4. Degradation changes burden, never thresholds

`a degraded device camera domain changes operator burden, not the mission's
requirements` (`FieldJourneyTest`): a DEGRADED camera domain yields step
readiness `DEGRADED` (still actionable) with the verbatim note
"operator burden increases — capability domain(s) CAMERA=DEGRADED degraded",
while the mission's assurance content is carried VERBATIM — `mandatory`
stays `true`, `requirementRefs` stay `[req-crack-visual]`, the instructions
stay verbatim. Client-side, the honest undeclared queue bound makes
byte-bounded tasks negotiate to explicit DEGRADED/BLOCKED verdicts with
verbatim reasons — the truth standard is never lowered
(`a degraded camera domain cannot weaken a depth requirement`,
`the negotiation object carries no authorization, readiness or sufficiency
semantics`, `requirements are consumed read-only` in `CapabilityNegotiationTest`).

The reverse independence is proven too: a client-PERMITTED input-only task
set with device-unavailable camera hardware → the mandatory still steps are
NOT-EXECUTABLE device blockers; the directive blocks with the checker's
verbatim reasons (`a mandatory not-executable device step is a device blocker
while the client gate permits`).

## 5. Provider/network-unavailable behavior

Network unavailability is a FIRST-CLASS state at the submission seam, never a
silent failure:

- The seam interface models `NetworkAvailability.Available(transport)` /
  `Unavailable(reason)`; every attempt probes availability FIRST.
- This build's seam (`OfflineUntilSyncTransport`) is ALWAYS unavailable with
  the surfaced reason — honest about the missing AISE-030 transport; the
  evidence remains in the durable offline store (session journals + manifests
  + the local capture store, all AISE-005/AISE-002 machinery, unchanged).
- The UI renders the deferred state with the reason VERBATIM, the attempt
  count, and the retry affordance (`SubmissionPanel` / the
  `DeferredOffline` mission-panel branch).
- Server answers are typed: `Accepted(serverRef)` → `Submitted` (reference
  verbatim); `Rejected(reason)` → `SubmissionFailed` (reason verbatim).

## 6. Server-authoritative semantics (browser-equivalence basis)

Evidence reaches the same server-authoritative semantics as browser
operations: the submission payload is composed ONLY of contract objects
(`TaskIntent` — client-authored; the declared `ClientCapabilityProfile` —
client facts) plus the AISE-003 `CaptureSessionEnvelope` manifest whose
content ids the server re-derives (AISE-004 ingestion, unchanged). The
adapter makes NO assurance decisions: negotiation changes acquisition
strategy/operator burden, never thresholds; the gap list is recorded-evidence
facts, never sufficiency claims; `RealitySummary.readinessStatus` and every
authoritative field are carried opaque and read-only (C5-verified); the
journey's blocked/degraded states render the contract's verbatim reasons.

## 7. Representative field journey recording (operator trace)

The journey as the operator experiences it in the app (the mission panel +
the capture stage; server documents badged "provisioned" until the AISE-030
transport lands):

```text
[Field journey]  Start field journey
  → Task permitted
  → Mission mission-2026-000042 (provisioned)
    Capture still image — Crack pattern overview stills (mandatory)
      Photograph the full crack pattern from 2 m, one frame per wall segment.
      Evidence gap — not yet captured
    Capture still image — Crack detail stills (mandatory)   … (same shape)
    Record video footage — Walk-through video (optional)    … (same shape)
  → [Start session] (carries missionRef) → capture → *interruption*
    (process death; journal survives; restart re-opens exactly once)
  → resume capture → all gaps close → [Finalize]
  → [Evidence submission]
    "The sync transport is not wired in this build — submission defers to
     the resumable offline store (an explicit state, never a silent failure)."
    [Submit evidence] → "Offline — submission deferred: no sync transport on
    this build — … evidence stays in the resumable offline queue"
    [Retry submission] → "Still offline — attempt 2: …"
    (when the transport lands: → "Submitted — server ref op-…")
```

The blocked-task rendering (verbatim, no actions):

```text
  → Task blocked
    camera requirement unmet: required any of [depth]; profile declares [still, video]
  (no capture affordances are offered)
```
