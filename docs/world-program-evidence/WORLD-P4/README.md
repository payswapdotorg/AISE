# WORLD-P4 — the game-world UX transformation (evidence)

**Item:** WORLD-P4 — the game-world UX transformation: the primary UI
becomes a SPATIAL ENVIRONMENT with a task/objective HUD rather than a
navigation-heavy dashboard (the 2026-10-02 product directive, recorded
in `docs/TECH-LEAD-HANDOFF.md` §7 P4; handoff §4 "In-world HUD").
**Branch:** `work/WORLD-P4` (base `f1ee912`, the WAVE-2-CLOSED state —
P0-A/P0-B/P0-C + P1 + P2 + P3 all landed).
**Deliverable:** `packages/world-ux/` (the `@aise/world-ux` package:
the restrained seven-panel in-world HUD + the spatial surface station
as READ-ONLY typed projections composing the six landed world
packages, with the route-binding ports and their in-memory
substitution doubles) + `apps/web/src/app/world/` (the world route: a
headless deterministic mount + a real-browser smoke journey) + this
evidence directory.
**Status:** every family proven by pure validators + poison drills +
seeded property/fuzz suites + the substitution law (126 new tests; the
full battery stays at the composed 7199-test baseline + 126 new =
7325 total with zero regressions; typecheck strict / lint / boundaries
all clean — see TEST-TRANSCRIPT.md). The real Babylon GPU viewport and
the production chrome are the P5 multiplatform mounts (BLOCKED — see
CAPABILITY-BOUNDARIES.md); P4 delivers the transformation's CONTRACTS
and their deterministic route proof.

## The transformation (as delivered)

```text
navigation-dense dashboard  →  THE SPATIAL ENVIRONMENT IS THE STATION
                               + a restrained seven-panel in-world HUD
```

The handoff's §4 wording — "The product MUST feel like an engineering
game… a spatial environment with a task/objective HUD" — is translated
into ONE composition law (seam law #2, `HUD-EXPLAINS-NEVER-REPLACES`):
the SCENE owns the viewport; the HUD is a restrained chrome of seven
panels around it. No panel re-renders what the scene shows; no panel
is ever an engineering authority (handoff §10; seam law #8).

## The seven panels (the closed vocabulary, handoff §4 verbatim roles)

| Panel | The role (handoff §4) | Composes (read-only) |
| --- | --- | --- |
| **Objective** | the current engineering problem | the P2 problem lane (`EngineeringProblem`, cited verbatim) + the LIVE clash→problem bindings from the P3 coordination family (`CoordinationConflictRecord` — P3 wiring note #4) |
| **Evidence** | the evidence/readiness state | the P2 missing-evidence report (verdict + typed gaps, verbatim) + the P1 world's what-is-here census |
| **Constraints** | the governed constraints observed in scope | governed constraint observations derived from the P2 case context + the P3 what-if/declared-tolerance observations (the closed six kinds, validated + sorted) |
| **Agent** | the currently active specialist / bounded action | the P2 lane operator + open `ProblemAction`s — BOUNDED_AGENT proposes, never decides (the P2 law, cited not re-implemented) |
| **Validation** | the current solution status | the P2 deterministic check-gate verdict + the P3 replay verification (both cited verbatim) |
| **Cost / BOQ** | the live consequence of the selected proposed operation | the P3 quantity-consequence projection (`projectLiveQuantityConsequences` over the REAL engine replay + the REAL derived BOQ) — a typed PROPOSED VIEW; the BOQ Graph stays the ONLY quantity authority |
| **Timeline** | the optional execution sequence / 4D view | the P3 `SequencedExecution` trajectory + the playback phases over the P0-C simulation contract |

Every panel carries an explicit honest `contentState` from the closed
`{POPULATED, EMPTY, UNAVAILABLE}` vocabulary (seam law #3): POPULATED
= real lane data cited verbatim; EMPTY = the lane answered "none in
scope" (never fabricated filler); UNAVAILABLE = the source refused and
the UNIFIED typed failure is carried (never a silent gap). The
assembly is fail-closed: one poisoned panel refuses the whole HUD
(never a partial HUD) — drilled in `hud/failclosed.test.ts`.

## The spatial surface (the station scene)

`src/surface/contract.ts` composes the station scene as a READ-ONLY
projection of the six lanes: the P0-A scene-composition types (the
navigable world as composed by the P1 lane), the P0-C ghost overlay
(captured reality is NEVER mutated — the ghost scene is an overlay with
its own authored/proposed elements), and the P3
authored/proposed status index. The typed operations:

- **`composeStationScene`** — the composed scene model (element status
  index + ghost overlay + layer table), structurally validated
  fail-closed;
- **`resolveStationElement` / `pickStationElement`** — resolution and
  pick carry the CANONICAL AISE identity (never a substrate object id
  — seam law #7, the lanes' `looksLikeSubstrateId` composed at the UX
  boundary); a pick pre-resolves which HUD panels the element
  CONCERNS (the HUD↔scene wiring, computed not configured);
- **`applyStationSelection`** — the typed selection (unknown id ⇒
  typed refusal, drilled);
- **`applyStationCameraOperation`** — the typed camera vocabulary
  (`walk / orbit / fly` — the P0-A camera state, deterministic
  transforms);
- **`applyStationLayerToggles`** — layer visibility with the P1
  navigate vocabulary's AND-semantics.

**Ghost-removed resolvability (P3 wiring note #5, honored):** an
element id deleted by a ghost (proposed) operation STAYS RESOLVABLE in
the composed station scene — it resolves with status
`proposed-removed` and its captured node intact; the runtime overlay
owns the visual removal; identity never dangles (proven in
`surface/contract.test.ts` + visible as the distinct ghost chips in
the browser journey).

## The wiring (the route-binding ports + the substitution doubles)

`src/wiring/contract.ts` defines `WorldStationSources` — one typed
read function per lane projection the HUD and surface consume, every
one returning the unified `WorldUxOutcome<T>`; `bindWorldStation`
composes the station model (content-derived station identity — the
same sources produce the byte-identical model, seam law #9).
`src/wiring/doubles.ts` provides the two in-memory SUBSTITUTION
DOUBLES implementing every source with ZERO substrate installed:

- **`referenceWorldStationSources`** — the all-reference kit: the REAL
  P1 fixture world, the REAL P2 lane run (`runLayer2Lane` over the
  committed scenario), the REAL P3 lane run
  (`runInteractiveSolutionLane` over the default kit) + the REAL
  solution-engine replay + the REAL `deriveSolutionBoq`;
- **`alternateWorldStationSources`** — the fully-alternate kit: the P2
  alternate lane kit, the P3 alternate NL/clash/BOQ/replay doubles,
  the P0-C alternate scene-usage + simulation doubles — the SAME
  station through the fully-alternate substrate seam.

Both kits produce **byte-identical station models** (the substitution
law — `wiring/substitution.test.ts`). The only DECLARED data is what
the doubles legitimately own as substrate stand-ins (the declared
clash-pair box proxies, the declared activity durations + simulation
clock the sequencing contract requires, and the declared instants —
never a clock read).

## The four P3 wiring notes — how each was honored

| P3 wiring note | The P4 implementation |
| --- | --- |
| **#1 LaneFailure unified as the P2/P3 family shape** | `WorldUxFailure {kind, family, detail}` (seam law #4). The `kind` comes from the CLOSED HFX-000 vocabulary (`@aise/provider-registry`, imported — never modified, never extended) and is carried VERBATIM; the `detail` is carried VERBATIM; the P1 lane's `{kind, port, detail, subjectId}` maps onto the family shape with `family := port` (the port already names the refusing surface) and the subjectId appended to the detail. **Recorded as the P4 seam decision** (recorded in `src/seam.ts` and below in "The seam decision"). |
| **#5 ghost-removed element ids stay RESOLVABLE** | The composed scene's status index resolves ghost-deleted ids with status `proposed-removed` + the captured node intact (the SUMMARY says deleted; the runtime overlay owns the visual removal). Proven + rendered as the distinct ghost chips. |
| **#3 authored intents carry derivationNote provenance (`missing_operation_provenance`)** | The surface family's provenance guard: a ghost-source command whose provenance violates the solution-contract invariant (no evidence ids, no derivation note, no command text) REFUSES the station composition — attribution is never optional (drilled in `surface/failclosed.test.ts`). |
| **#4 the HUD Objective panel wires LIVE clash→problem creation** | The `clashConflicts` source feeds the Objective panel with the REAL P3 coordination conflict records bound to P2 problems (`recordCoordinationConflicts` over the L3 clash report) — LIVE, not replayed; the panel cites both the P2 problem and the bound clash problems with their declared tolerances. |

## The seam decision (recorded)

**SEAM DECISION — WORLD-P4 (on the P3 wiring note #1):** the unified
failure presentation keeps the P2/P3 SHAPE (`{kind, family, detail}`)
and maps the P1 lane's `{kind, port, detail, subjectId}` onto it:
`family := port` VERBATIM, the subjectId APPENDED to the detail
(`" [subject: <id>]"`) when present. The `kind` (the CLOSED HFX-000
vocabulary) and the `detail` are carried VERBATIM in every case —
nothing dropped, nothing invented, no failure kind added. This is a
PRESENTATION-layer unification inside `@aise/world-ux` only; no lane
package was modified (the diff proves it — owned paths only).

## The route (`apps/web/src/app/world/`) — the one-record discipline

The station binding composes the REAL lanes + the deterministic
solution engine + the BOQ derivation — Node-side seams whose graphs
transitively import `node:crypto`. A plain-browser bundle would
externalize the builtin and crash exactly the way PROD-030 documented.
So, exactly as PROD-031's browser mount, **the engine executes
Node-side and the browser renders its outputs VERBATIM**:

- **`record.ts` + `station-record.json`** — the bound station model is
  committed ONCE as a record (the HUD panels, the element status
  index with pre-resolved pick concerns through the REAL quarantined
  pipeline, the layer table, the initial camera);
- **`browser-station.ts`** — the browser-safe interaction layer (ZERO
  runtime imports; a pure typed command reducer over the record);
- **`station.tsx` + `browser-mount.tsx`** — the deterministic
  presentation surface: the scene roster with ghost-distinct chips,
  the layer table, the typed camera readout, and the seven honest
  panels (the restrained chrome);
- **`headless.test.tsx`** — pins the three parity laws:
  **LAW 1** the live Node binding reproduces the committed record
  byte-identically; **LAW 2** the browser reducer ≡ the REAL
  world-ux transforms (selection / camera / layer / pick concerns /
  fail-closed refusal, byte-identical); **LAW 3** repeated renders
  are byte-identical (no hidden clock/randomness) and the minimal
  record renders honest EMPTY panels;
- **`browser-smoke.test.ts`** — the REAL-browser journey (the
  PROD-030/031 pattern): esbuild-bundle the mount, serve it from an
  ephemeral loopback static server, open it in a REAL Chromium, and
  walk MOUNT → SELECT → GHOST → CAMERA → LAYERS → REFUSAL with ZERO
  `pageerror` events, plus the bundle scan (NO Node-builtin
  externalization markers in the mount's own graph).

## What was delivered

`@aise/world-ux` (18 files, 5,266 lines: 7 source files 3,388 lines +
9 test files 1,878 lines) with six exports (`.` / `./seam` / `./hud` /
`./surface` / `./wiring` / `./station`):

- **`src/seam.ts`** — the TEN package laws (read-only projection;
  HUD-explains-never-replaces; honest panel states; unified failure
  presentation; ghost-removed resolvability; provenance fail-closed;
  identity quarantine; no-UI-authority; determinism; substitution
  doubles), the closed panel/family vocabularies, the unified
  `WorldUxFailure`, the typed outcome, the digest/freeze discipline;
- **`src/hud/contract.ts`** — the seven panel projectors + the
  fail-closed `assembleHud` (one poisoned panel refuses the whole
  assembly);
- **`src/surface/contract.ts`** — the station scene composition + the
  typed selection/pick/camera/layer operations;
- **`src/wiring/contract.ts`** — `WorldStationSources`,
  `bindWorldStation` (the route-binding seam);
- **`src/wiring/doubles.ts`** — the two substitution doubles (the
  reference + alternate kits, byte-identical station models);
- **`src/station/model.ts`** — the committed station scenario +
  `openWorldStation` (the controlled entry: `openReferenceWorldStation`
  for the committed fixtures; the minimal honest station for the
  EMPTY world).

The route adds 7 files (1,756 lines: the record + the reducer + the
surface + the two proofs + the committed record JSON). The full
inventory and the honest boundaries are in
CAPABILITY-BOUNDARIES.md; the measured numbers are in
PERFORMANCE-OBSERVATIONS.md; the recorded runs are in
TEST-TRANSCRIPT.md.

## How the incumbent's UX behavior was translated

Directive §7 P4 — parity with the WORKFLOW FEEL, never a copy of a
game engine:

| The game-world behavior (handoff §4) | The AISE translation (this item) |
| --- | --- |
| The spatial environment is the primary surface | `composeStationScene` — the station IS the route; the dashboard is not re-implemented, it is superseded at the route seam (new files only) |
| A task/objective HUD, restrained | The closed seven-panel vocabulary + the honest content states; the panel chrome cites lane records verbatim |
| "What am I doing / what do I need" | The Objective panel (the P2 problem + LIVE clash bindings) + the Evidence panel (the readiness verdict + typed gaps) |
| "What may I do" | The Constraints panel (the governed six kinds) + the Agent panel (the bounded actions — propose, never decide) |
| "Did it work" | The Validation panel (the P2 check gate + the P3 replay verification) |
| "What does it cost / when" | The Cost/BOQ panel (the PROPOSED view — the BOQ Graph stays the authority) + the Timeline panel (the 4D playback phases) |
| Direct-manipulation feel | The typed selection/pick/camera/layer operations with the parity law (the browser reducer ≡ the real transforms) |

## Verification summary (the recorded gates)

| Gate | Result |
| --- | --- |
| Baseline battery at the pinned base `f1ee912` (pristine) | 7199 pass / 0 fail / 90,675 expects / 466 files |
| Full battery at the P4 branch | **7325 pass / 0 fail** / 92,035 expects / 477 files (baseline + 126 new) |
| `@aise/world-ux` suite (3 consecutive runs) | 108 pass / 0 fail / 1,257 expects each |
| World route suite (3 consecutive runs) | 18 pass / 0 fail / 104 expects each (incl. the real-Chromium journey) |
| `bun run verify` | **VERIFY: PASS** (typecheck strict incl. the new package, lint, the full battery, boundaries) |
| Boundaries | 1,268 source files scanned, no cross-zone import violations |
| Diff | owned paths only: `packages/world-ux/**` + `apps/web/src/app/world/**` + `docs/world-program-evidence/WORLD-P4/**` + the mechanical registrations (`apps/web/package.json` +3 dependency lines, `bun.lock` +20 lines) |
| Determinism | no network / no clock reads / no randomness in the contract core (proven: repeated binds byte-identical, station identity content-derived, repeated renders byte-identical) |

See TEST-TRANSCRIPT.md for the full recorded transcript,
CAPABILITY-BOUNDARIES.md for what this item deliberately does NOT
claim, and PERFORMANCE-OBSERVATIONS.md for the measured numbers.
