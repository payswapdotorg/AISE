# PROD-016 — the reality-materialization seam (closed 2026-09-29)

The parity scorecard's open item #1: *"a UI path from captured evidence to a
first reality version — the one place a first-time user still needed the API
to complete the governed intervention lane."* Closed this session by two
panels + three live adapters, live-proven end-to-end in a real browser.

## The crossing (live walk, 2026-09-29, demo stack :4173, real browser)

| Leg | Surface | What happened | Proof |
| --- | --- | --- | --- |
| 1. Upload | Capture / Upload | A real 2,693,684-byte construction photo (image-search: formwork slab with workers) re-uploaded after the stack restart → **DUPLICATE** (idempotent; the bytes were already in the content-addressed store) → content id `196761c267380b565e88cd02f57475ae65c5c6ffcc2fc5d029899452a6f5b39c` | `aise_seam_*` walk log below |
| 2. Register | Capture / Upload → the NEW registration panel | The stored upload's own record prefills every field (content id, byte size, media type; captured-at defaults to the upload instant; method defaults STILL_IMAGERY from the media type) → submit → **"Registered."** — `POST /v1/evidence` answered REGISTERED; the register (previously empty) now holds the record | register API: 1 record |
| 3. Record | SiteTwin → the NEW recorder panel | "Record the first snapshot" (the empty state's affordance) → the broker answers **allowed — permission reality:write via role org-founder** → the evidence picker offers the REGISTERED capture → composed `site-riverside-01` (site, OBSERVED, `name = Riverside site`, `length = 24 m`) + `slab-l2` (element, CONFIRMED, `thickness = 240 mm`) + `site-riverside-01--contains-->slab-l2`, both nodes evidence-provenanced via the picker → submit → **v002 recorded** (2 nodes, 1 relationship, 3 change records) → the surface reloads live: "reality graph version v002 · 2 nodes · 1 evidence record behind the snapshot · 1 CONFIRMED node · 1 OBSERVED node" | `aise_seam_sitetwin_v002.png` |
| 4. Pin | Intervention Studio | The baseline picker (whose "none" state previously said "Record a reality snapshot first" with no path) **prefills v002** → scenario `scenario-first-crossing` created over it (LIVE API, status draft, baseline v002) | `aise_seam_scenario_created.png` |

Mobile: the recorder panel renders 390 == 390 on a 390px viewport (no
horizontal overflow); the capture surface with the registration panel
likewise. Zero page errors throughout.

## What shipped

- `apps/web/src/app/reality-recorder.ts` — the pure draft model, the named
  defect checks (closed vocabularies pinned by test against the backend's
  lists; missing-provenance, duplicate node ids, unitless numerics through
  the shared parser, dangling relationship endpoints, duplicate derived
  relationship ids) and the EXACT wire mapping (node upserts first,
  relationship upserts after; properties carry the node's epistemic status
  + stamped provenance; one SUPPORTS record per evidence id + one
  DERIVED_FROM note).
- `apps/web/src/app/evidence-registration.ts` — the registration draft
  (acquisition-method mirror pinned by test against the shared contract's
  EVIDENCE_METHODS; the wire document carries the shared CONTRACT_VERSION,
  never a local literal; the optional session id rides the well-known
  `session.id` key).
- `apps/web/src/app/surfaces/RealityRecorder.tsx` — the recorder panel on
  the create-panel chassis (brokered `reality:write`, authorization note,
  demo never-fabricate notice, named defects, explicit outcomes).
- `apps/web/src/app/surfaces/CaptureMission.tsx` — `EvidenceRegistrationPanel`
  (rendered after a stored/duplicate upload; every field prefilled from the
  upload's own record; idempotent re-registration and typed conflicts
  surfaced verbatim).
- `apps/web/src/app/surfaces/SiteTwin.tsx` — the affordance in both reality
  card states (empty: "Record the first snapshot"; present: "Record another
  version"); `onRecorded` reloads the live surface.
- `apps/web/src/app/api.ts` — three live adapters: `ensureRealityProjectLive`
  (project_exists is an honest already-exists via the header read),
  `applyRealityChangesLive` (the governed changes POST; typed 422 codes
  surface code + reason), `registerEvidenceLive` (REGISTERED/IDEMPOTENT
  envelopes; the invalid-envelope refusal).
- `components.tsx` `BaselinePicker` — the "none" state links to the SiteTwin
  recorder when a route is provided (demo panels keep the plain text).

## Tests (all green; the suites in `apps/web/src/app/`)

- `reality-recorder.test.ts` — vocabulary pins + 11 named-defect cases + the
  exact wire-mapping matrix (op order, property/unit/provenance stamping,
  derived relationship ids).
- `reality-recorder-live.test.ts` — the two reality adapters (created /
  project_exists / header-read-failure / typed pass-through / network; the
  recorded-version subset; the POST body verbatim; 422 + 404 surfacing).
- `reality-recorder-panel.test.tsx` — SiteTwinBody's affordance matrix
  (api-empty / api-empty-no-action / demo / api-with-snapshot) + the panel's
  static render (closed-vocabulary selects, named defects, honest submit
  states, evidence loading state, demo notice).
- `evidence-registration.test.ts` — the method mirror, the wire document
  (shared CONTRACT_VERSION), 5 named-defect cases, the live adapter's four
  outcome shapes.

Full battery: see the session's verify log (`VERIFY: PASS` with the suites
above included; baseline 6197 + 56 new = 6253).

## Honesty ledger

- The panel never invents content: every option is a record's own field;
  the vocabularies are the backend's closed lists, pinned by test.
- The engine stays the authority: the client pre-checks only what the
  engine would refuse, with the same wording family; every typed refusal
  surfaces verbatim (the POST-009 discipline).
- project_exists is an honest "already exists" (never a failure); the
  empty-v001 trap stays called out by the baseline picker after creation.
- The reconstruction-driven path (server-side materialization over the
  deterministic demo provider) is deliberately NOT claimed — the composed
  path is what shipped; automatic spatial anchoring remains OPEN on the
  scorecard.
