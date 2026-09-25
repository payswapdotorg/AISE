# HFX-303 — Visual Lane Provider Profiles (as registered)

The three in-repo deterministic providers of the bounded visual-solution
provider lane, with their descriptors (the lane's own
`VisualProviderDescriptor`), their control-plane profiles (HFX-000's
15-field `ProviderProfile`, validated by `validateProviderProfile`) and
their content digests. All digests below are REAL outputs of the
committed code at the delivery commit (re-derivable via
`packages/visual-render/src/profiles.test.ts` and the lane's public
surface).

The lane capability is `solution-state-visual-rendering`
(`VISUAL_LANE_CAPABILITY`); the in-repo lane id is
`deterministic-inhouse-visual-lane` (`VISUAL_LANE_ID`).

## 1. The reference hypothesis-renderer — `visual-hypothesis-reference`

| Field | Value |
|---|---|
| providerId | `visual-hypothesis-reference` |
| technologyVersion | `1.0.0-inrepo-v1` |
| displayName | Reference Hypothesis Renderer |
| presentationStyle | "light hypothesis study" — warm paper ground, dark ink canonical outlines (observed solid, proposed dashed), one hatched illustrative band for the hypothesized finish, banner and region labels in plain text |
| capabilities | `elevation-hypothesis`, `material-study`, `context-sketch` |
| **descriptorDigest** | `52c0a229df84fd1552bd941bef47d73795a5497e5c132fe5819f9731156e9b5a` |
| **profileDigest** (control plane) | `9482088a13d448a6b901b910de43a7cf18e3eabe9ab4dea8c2aa7e36c29b73e5` |

Declared limitations (verbatim from the descriptor): deterministic in-repo
SVG stylization — no learned generation; draws the canonical PLAN
projection only; the hypothesized-finish band is anchored to the canonical
extents — with no canonical shapes the visual renders the honest empty
notice and no illustration; carries no numeric engineering claims.

Failure modes: `unsupported-data` (undeclared visual class → explicit
refusal, never a fabricated rendering); `contract-mismatch` (typed refusal
carried from the lane's request gate). License: `fixture-permissive-1.0`,
commercial use + intended use cleared (NOT evaluation-only).

**What it renders:** every canonical shape of the plan projection VERBATIM
(observed origins solid, everything else dashed), plus ONE declared
illustrative addition — the hatched `reference-hypothesized-finish-band`
INSIDE the canonical extents — labeled
`GENERATED — hypothesized finish zone (beyond deterministic geometry)`
with basis `beyond-deterministic-geometry`.

## 2. The blueprint alternate renderer — `visual-blueprint-alternate`

| Field | Value |
|---|---|
| providerId | `visual-blueprint-alternate` |
| technologyVersion | `1.0.0-inrepo-v1` |
| displayName | Blueprint Alternate Renderer |
| presentationStyle | "dark blueprint study" — slate blueprint ground, light cyan linework with a dotted grid, a left legend column, and a dotted illustrative context margin around the canonical extents |
| capabilities | `elevation-hypothesis`, `context-sketch` (deliberately NOT `material-study` — the honest unsupported-class refusal is exercised by the drills) |
| **descriptorDigest** | `7e3483798dd1efced279c7b930c56258390173eac8e5baaa332378a7f57f6147` |
| **profileDigest** (control plane) | `fad9966c0ad3e4d2593b48f592f3c40b3ce21ea9d556798fc077780b1ccf9a9b` |

Independently implemented (no shared code with the reference renderer —
its own formatting helpers, palette, layout and SVG construction): the
swap lane's proof that provider replacement is PRESENTATION-ONLY. Its
illustrative addition is the dotted `alt-context-sketch-margin` framed
AROUND the canonical extents, labeled
`GENERATED — context sketch margin (beyond deterministic geometry)`.

## 3. The failing fixture — `visual-failing-fixture`

| Field | Value |
|---|---|
| providerId | `visual-failing-fixture` |
| technologyVersion | `1.0.0-inrepo-v1` |
| displayName | Failing Visual Fixture |
| presentationStyle | "none (always fails)" |
| capabilities | `elevation-hypothesis`, `material-study`, `context-sketch` (declared but never rendered — the fixture always refuses) |
| **descriptorDigest** | `08b2500af054da37b678fc1c5412ce029b5979b4ecd308f930e7c2d48745ce40` |
| **profileDigest** (control plane) | `134d552b08e6bdff66c77023b3c7f503b5b1be420314ef7d8ae6e356a8b15178` |

The fallback lane's test driver: EVERY render answers the typed failure
`unsupported-data` ("the failing visual fixture never renders — this typed
failure drives the fallback lane"). Never an artifact, never a throw,
never a silent gap. The failure kind is configurable at construction and
DECLARED as the descriptor's failure mode (honest reference data).

## A provenance example (a real artifact, committed-code output)

The reference provider rendering the corpus's multi-operation case
(`demo-world-multi-operation` — the demo wall-upgrade world's final
layer):

```json
{
  "kind": "visual-artifact",
  "schemaVersion": "visual-artifact/1",
  "artifactId": "a15c7c18de6ddd10b1cba929ffefdaa2d6cffae1271a4a8bc7b28e580f87ca75",
  "visualClass": "elevation-hypothesis",
  "provenance": {
    "solutionId": "solution-demo-001",
    "versionRef": "v1",
    "stateId": "607856bb40576d7d552c12aa3ca509f4e0c160b6726cc086c1a7b822c58b06b8",
    "stateIndex": 3,
    "appliedOperationIds": [
      "<operation 1 — demolition-removal>",
      "<operation 2 — block-wall-placement>",
      "<operation 3 — plaster-application>"
    ],
    "stateContentDigest": "36eecf9f9d3d74281d195c5e0c197ced355d70b7f244c5513d92fa102a0f3e5b",
    "provider": {
      "providerId": "visual-hypothesis-reference",
      "technologyVersion": "1.0.0-inrepo-v1",
      "descriptorDigest": "52c0a229df84fd1552bd941bef47d73795a5497e5c132fe5819f9731156e9b5a"
    },
    "laneStatement": "presentation-only hypothesis rendering — a generated visual is never engineering geometry authority and can never change quantities, validation or canonical Solution Graph state"
  },
  "labels": [
    {
      "regionId": "reference-hypothesized-finish-band",
      "regionKind": "hypothesized-finish",
      "label": "GENERATED — hypothesized finish zone (beyond deterministic geometry)",
      "basis": "beyond-deterministic-geometry",
      "detail": "an illustrative finish hypothesis drawn inside the canonical extents — no deterministic record describes this zone; it is presentation only and implies no quantity, material or validation"
    }
  ],
  "canonicalComparison": {
    "canonicalShapeCount": 8,
    "renderedCanonicalShapeCount": 8,
    "excessRegionCount": 1,
    "statement": "every canonical shape of the plan projection is drawn verbatim; the labeled hypothesized-finish band is the only content beyond deterministic geometry"
  }
}
```

(The `appliedOperationIds` entries above are the engine's
content-derived operation ids — carried verbatim in the committed record
files; elided here only for readability. The full artifacts, with their
SVG content, are embedded in [`runs/swap.record.json`](./runs/swap.record.json).)

## What the digests mean

- **descriptorDigest** — the sha-256 content address over the canonical
  JSON of the descriptor's semantic projection (`providerId`,
  `technologyVersion`, `presentationStyle`, `capabilities`,
  `declaredLimitations`, `numericClaimPolicy`, `failureModes`,
  `laneStatement`; presentation-only `displayName`/`description` are
  EXCLUDED — renaming a provider is not a semantic change). Every
  artifact's provenance carries this digest: the artifact pins the EXACT
  provider profile that rendered it.
- **profileDigest** — the control plane's own `profileDigestOf` over the
  15 mandatory fields; what the registry's provenance manifests chain.
- **artifactId** — the sha-256 content address over the canonical JSON of
  the whole artifact minus its own id. `verifyVisualArtifact` re-derives
  it: any tampered provenance or content field breaks the address → typed
  refusal (`artifact-id-mismatch`). Binding to the exact state revision is
  checked separately (`provenance-binding-mismatch`).

## Future occupants

A real visual-generation technology (Apple SHARP, TRELLIS.2, any image/3D
generation model) registers the same way: a descriptor + a control-plane
profile + an implementation of `VisualRenderProvider` behind
`renderThroughLane`. It inherits, by construction and by drill: the
frozen presentation-only request, the provenance binding, the
presentation-only swap discipline, the honest fallback and the labeling
law — before a single user sees a single pixel.
