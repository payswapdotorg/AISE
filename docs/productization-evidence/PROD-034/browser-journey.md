# PROD-034 — The discoverability browser journey (test-backed recording)

The work order's acceptance asks for **browser journey evidence**: a user
lands on the product and can FIND the things this item made first-class —
the capture mission, the BOQ import, the Evidence Envelope explanation, the
incumbent-integration context, and honest provider states — without
Settings archaeology or address-bar knowledge.

**Honest classification of this recording:** every step below is proven by
committed deterministic tests (static renders of the real components /
typed seam tests with stubbed transports — the repo's established
`renderToStaticMarkup` discipline). **No step was walked in a live browser
inside this worker lane** (the memory-constrained box discipline; the
Lead's five-gate harvest + the PROD-033 W-journey replay the product in a
real browser at the final SHA). The `Test` column cites the exact test that
proves the step; the classification column states the evidence class.

## The journey

| # | Step (what the user does) | What the product answers | Test (the proof) | Class |
|---|---|---|---|---|
| 1 | **LAND** — open `#/` (the Dashboard) | The task-first landing: the four canonical actions, the "What do you need to do?" intent form, the current task's flow panel, and the contextual-integrations panel (all mounted) | `discoverability.test.tsx` › "the LANDING composes the task-first flow AND the contextual integrations panel" (2× task-flow panels mounted on the landing render); `golden-journey.test.tsx` (PROD-018) › step 0 (every journey address parses) | DETERMINISTIC (static render) — not browser-walked |
| 2 | **Capture mission reachable** — click the `Capture` canonical action (or the surface nav's "Capture / Upload", or a gap suggestion, or the app nav, or the not-found guidance) | The Capture / Upload surface: the guided mission (the server's next-best-action VERBATIM + the declared evidence gaps as the "what to capture and why" list) and the upload entry | `discoverability.test.tsx` › "the capture mission is threaded from MANY points" (≥6 pointing renders) + › "the capture SURFACE mounts the guided mission, the upload entry and the honest limits card"; `capture-mission.test.tsx` › "renders the server's blocked NBA with its typed blockers…" + the route round-trip tests; `composition-model.test.ts` › the Capture action routes to `#/…/capture` | DETERMINISTIC (static render + router codec) — not browser-walked |
| 3 | **Upload honesty** — pick a file on the capture surface | The entry states what happens (sha-256 → the server-side gateway, STORED/DUPLICATE, the not-yet-evidence line) and what this browser cannot do (no camera capture — the mobile field journey); a platform without Web Crypto renders the explicit blocked reason | `capture-mission.test.tsx` › the upload-entry explicit states (demo notice / no-digest / selected file / STORED outcome / typed refusal) + the seam tests (raw-bytes request shape, the gateway's own rejection envelope) | DETERMINISTIC (static render + stubbed seam) — not browser-walked |
| 4 | **BOQ import reachable** — from the landing, follow the journey's "Understand the BOQ scope" step (or the surface nav's "BOQ Lens") | The BOQ Lens surface mounts the `Import a SOURCE BOQ` panel ABOVE the lens (visible with or without an existing import), with the SOURCE-vs-SOLUTION separation stated and the operator-declared format selector | `discoverability.test.tsx` › "the BOQ import is discoverable from the journey… and lives on the lens surface"; `boq-import.test.tsx` › "the panel labels the import as a SOURCE BOQ…" + the seam tests (the `?format=` request, the PDF known limit, the typed parse failure) | DETERMINISTIC (static render + stubbed seam) — not browser-walked |
| 5 | **Envelope visible at a consequential decision** — open the Engineering Case surface (Investigate), or read the task-first panel | "What is this case based on?" / "Why this readiness verdict?" — the Evidence Envelope sections with every absence explicit (no σ recorded is never ±0; no checks recorded is stated; the result status verbatim, never upgraded) | `discoverability.test.tsx` › "the evidence envelope is visible at BOTH consequential decisions (readiness + case)"; `evidence-envelope.test.tsx` (11 tests: section content, honest absences, verbatim statuses, the calm-not-debug-console rule) | DETERMINISTIC (static render) — not browser-walked |
| 6 | **Integration context visible** — read the incumbent-systems card on the BOQ Lens surface (or the landing) | "The incumbent systems behind this scope": the ERP source-of-record reference VERBATIM (reference-only), the matching connector binding with its honest status (the ERP adapter's typed AUTHENTICATION_EXPIRED + the first-class unknown last sync), and the pointer to the brokered action panel | `discoverability.test.tsx` › "the contextual integrations render the incumbent reference and point at the brokered panel" + the lens-surface mounting test; `contextual-integrations.test.tsx` (14 tests: the discovery model, the join discrimination, every honest state) | DETERMINISTIC (static render) — not browser-walked |
| 7 | **Provider status honest** — observe a provider-gated point (the task-flow unavailable view, the capture upload entry, the solution engine-unavailable panel, Settings → API connection) | The SAME calm vocabulary everywhere: the API mode chip + the optional providers with their recorded status words (`available` / `disabled` / `unavailable`) and one consistent meaning each — no env-var names, no SDK identifiers, no raw errors | `provider-status.test.tsx` (14 tests: the vocabulary, the no-noise discipline, every note state, the task-flow-unavailable wiring, the `/readyz` extraction seam); `discoverability.test.tsx` › "the provider-status note renders at the provider-gated capture entry" | DETERMINISTIC (static render + stubbed seam) — not browser-walked |
| 8 | **No dead ends** — click anything the journey composes | Every `#/` link addresses a real route; every surface is pointed-to; the strip threads back to the landing | `discoverability.test.tsx` › "every hash link the journey composes addresses a real route" + "every product surface is pointed-to…" (the 16-render corpus; the SiteTwin/Outcomes bodies verified clean in the same pass) | DETERMINISTIC (static render) — not browser-walked |

## What a real browser walk would add (honestly not done here)

The deterministic tests above prove the composition, the honest states and
the seams. A live walk against a session-authenticated backend (the
PROD-031 journey-gate pattern) would additionally prove: the live task-flow
GET populating the mission/envelope/integration panels with real records,
the live `/readyz` probe populating the provider note, and a real
`POST /v1/capture/assets/:contentId` round-trip from the file input. Those
belong to the Lead's Gate F / PROD-033 W-journey replay at the final
merged SHA; this recording deliberately does not claim them.
