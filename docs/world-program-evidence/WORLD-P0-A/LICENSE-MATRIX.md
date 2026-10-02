# WORLD-P0-A — License Matrix (VERIFIED)

**Item:** WORLD-P0-A (Reality substrate contracts)
**Base:** 09dd9c3f4c4627940efd482d0d6bc7d36547c8d4
**Verification date:** 2026-10-02 (all URLs fetched live from primary
sources this date; the verbatim license-name line quoted from each source
appears under "verified")

Distribution model being licensed for: **web** (browser bundle served by
AISE), **desktop** (Tauri-class shell bundling web assets + native
sidecars), **Android** (mobile field app). No iOS build in scope yet
(P5 records it when it enters scope).

---

## 1. Babylon.js — the primary interactive scene runtime

- **SPDX:** `Apache-2.0`
- **Verified at:** https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/license.md
  (fetched 2026-10-02)
- **Verbatim license-name line:** `# Apache License 2.0 (Apache)` (first line of license.md)
- **Attribution duties:** retain the copyright notice + license text in
  distributions; Apache-2.0 §4.
- **Patent clause:** YES — Apache-2.0 §3 explicit patent grant + §9
  patent retaliation termination. Protective for AISE.
- **Distribution compatibility:** web ✓ (bundled JS), desktop ✓ (bundled
  in the Tauri shell), Android ✓ (WebView/bundled).
- **Verdict: APPROVED** — standard Apache-2.0 duties only.

## 2. CesiumJS — the geospatial context substrate

- **SPDX:** `Apache-2.0`
- **Verified at:** https://raw.githubusercontent.com/CesiumGS/cesium/main/LICENSE.md
  (fetched 2026-10-02; header line) and
  https://raw.githubusercontent.com/CesiumGS/cesium/main/package.json
  (`"license": "Apache-2.0"`)
- **Verbatim license-name lines:** `Copyright 2011-2026 CesiumJS Contributors` /
  `Apache License` (LICENSE.md), `"license": "Apache-2.0"` (package.json)
- **Attribution duties:** Apache-2.0 §4 (retain notice + license).
- **Patent clause:** YES — Apache-2.0 §3/§9.
- **Distribution compatibility:** web ✓, desktop ✓, Android ✓.
- **Verdict: APPROVED** — standard Apache-2.0 duties only. (Cesium ion
  cloud services are commercial and NOT used — AISE consumes the
  open-source engine only; no ion dependency is introduced by this item.)

## 3. OpenUSD (pxr/usd) — composition-semantics substrate

- **SPDX:** NONE (not a standard SPDX id) — the license is the
  **Tomorrow Open Source Technology License 1.0**, an Apache-2.0-derived
  license whose ONLY stated difference is Section 6 (Trademarks).
- **Verified at:** https://raw.githubusercontent.com/PixarAnimationStudios/OpenUSD/release/LICENSE.txt
  (fetched 2026-10-02)
- **Verbatim license-name lines:** `TOMORROW OPEN SOURCE TECHNOLOGY LICENSE 1.0`
  and `Note: The Tomorrow Open Source Technology License 1.0 differs from the
  original Apache License 2.0 in the following manner. Section 6 ("Trademarks")
  is different.`
- **Attribution duties:** Apache-style notice retention.
- **Patent clause:** Apache-2.0 §3/§9 text is carried (only §6 differs) —
  treat as protective, same as Apache-2.0.
- **Distribution compatibility:** AISE uses OpenUSD as an
  interchange/composition substrate — never as authority, never bundled
  into web assets (sidecar/desktop tooling only). web n/a (not shipped),
  desktop ✓ (sidecar), Android n/a (not shipped).
- **Verdict: APPROVED-WITH-CONDITIONS** — conditions stated exactly:
  1. AISE's THIRD-PARTY-NOTICES must carry the license text VERBATIM
     (it is NOT plain Apache-2.0 — writing "Apache-2.0" for OpenUSD would
     be a licensing defect).
  2. The differing §6 (Trademarks) means: no use of Pixar/USD marks to
     promote AISE; AISE's own names never imply endorsement.
  3. USD object paths never become canonical AISE identity (already law
     in the adapter contract — `usd.composition/1` refuses unbound paths).

## 4. glTF 2.0 — the runtime asset-delivery substrate

Two artifacts, two licenses:

**4a. The glTF 2.0 specification (KhronosGroup/glTF):**
- **SPDX:** `CC-BY-4.0` (specification text) — the repo's LICENSE.adoc
  also assigns `Apache-2.0` to scripts/build tooling in the same repo.
- **Verified at:** https://raw.githubusercontent.com/KhronosGroup/glTF/main/LICENSE.adoc
  (fetched 2026-10-02)
- **Verbatim license-name lines:** `SPDX-License-Identifier: CC-BY-4.0` and
  `* SPDX license identifier: "Apache-2.0"` (for scripts and build tooling)
- **Attribution duties:** when AISE reproduces spec text/tables (e.g. in
  generated documentation), attribute The Khronos Group under CC-BY-4.0.
  Implementing against the spec surface (what the P0-A parser does)
  requires no license at all — the spec governs the DOCUMENT, not
  implementations of it.
- **Patent clause:** the CC-BY-4.0 spec text carries no patent grant;
  Khronos operates glTF under its IP policy (spec participation).
  AISE's parser is an independent implementation of the published spec.
- **Distribution compatibility:** web ✓, desktop ✓, Android ✓ (no spec
  text is redistributed by the runtime).
- **Verdict: APPROVED-WITH-CONDITIONS** — condition: any AISE content
  that QUOTES the spec (docs, tooltips, generated references) carries the
  CC-BY-4.0 attribution.

**4b. The Khronos glTF-Validator (reference validator):**
- **SPDX:** `Apache-2.0`
- **Verified at:** https://raw.githubusercontent.com/KhronosGroup/glTF-Validator/master/LICENSE
  (fetched 2026-10-02)
- **Verbatim license-name lines:** `Apache License` / `Version 2.0, January 2004`
- **Verdict: APPROVED** — Apache-2.0 duties; AISE does not bundle the
  validator (P0-A's parser is an independent implementation; the
  validator is a conformance reference for WORLD-P1 cross-checking).

## 5. Assimp — the format-ingest substrate

- **SPDX:** `BSD-3-Clause` (the library; the LICENSE file is a composite)
- **Verified at:** https://raw.githubusercontent.com/assimp/assimp/master/LICENSE
  (fetched 2026-10-02)
- **Verbatim license-name lines:** `Open Asset Import Library (assimp)` /
  `Copyright (c) 2006-2026, assimp team` / `All rights reserved.` followed
  by the 3-clause BSD redistribution text.
- **Composite-license conditions (stated exactly):**
  1. Bundled components inside assimp (e.g. Poly2Tri) carry their own
     notices in the same LICENSE file — the WHOLE file must be preserved
     in any distribution that ships assimp.
  2. `AN EXCEPTION applies to all files in the ./test/models-nonbsd
     folder` — those test models have external copyright and MUST NOT be
     redistributed. AISE never packages assimp's test data.
- **Attribution duties:** 3-clause BSD: retain notice; no-endorsement.
- **Patent clause:** none (BSD).
- **Distribution compatibility:** web n/a (native sidecar only), desktop ✓
  (sidecar), Android ✓ (native library).
- **Verdict: APPROVED** — with the composite-LICENSE preservation duty.

## 6. Three.js — the PRIOR incumbent being replaced (spatial-studio-spike)

- **SPDX:** `MIT`
- **Verified at:** https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE
  (fetched 2026-10-02)
- **Verbatim license-name lines:** `The MIT License` /
  `Copyright © 2010-2026 three.js authors`
- **Verdict: APPROVED (as incumbent — not adopted going forward)**
- **Replacement rationale (recorded honestly per the packet):** the
  2026-10-02 directive selects Babylon.js as the primary interactive
  substrate. This is a capability/strategy decision, NOT a licensing one:
  - What Three.js did well (recorded, not erased): the
    `apps/spatial-studio-spike` GBIM evaluation proved the browser lane
    viable with small bundles and a familiar scene-graph API; the spike
    stays in-repo, unmigrated, as the honest record.
  - Why Babylon per the directive: first-class WebGPU path, built-for-
    engineering scene tooling (gizmos/inspection/sectioning primitives),
    and the directive's product-parity targets (SYNCHRO-class interaction,
    OpenSpace-class navigation) map onto its control/camera stack.
  - The adapter contract (`babylon.scene-runtime/1`) keeps the door open:
    a conforming Three.js adapter remains substitutable — the port never
    exposes Babylon types.

---

## Summary table

| substrate | SPDX | patent clause | web | desktop | Android | verdict |
|---|---|---|---|---|---|---|
| Babylon.js | Apache-2.0 | §3/§9 grant | ✓ | ✓ | ✓ | APPROVED |
| CesiumJS | Apache-2.0 | §3/§9 grant | ✓ | ✓ | ✓ | APPROVED |
| OpenUSD | custom (Tomorrow OSTL 1.0) | Apache-derived | n/a | ✓ sidecar | n/a | APPROVED-WITH-CONDITIONS |
| glTF spec | CC-BY-4.0 | none (document) | ✓ | ✓ | ✓ | APPROVED-WITH-CONDITIONS |
| glTF-Validator | Apache-2.0 | §3/§9 grant | ref | ref | ref | APPROVED |
| Assimp | BSD-3-Clause (composite) | none | n/a | ✓ sidecar | ✓ | APPROVED |
| Three.js (prior) | MIT | none | ✓ | ✓ | ✓ | APPROVED (incumbent record) |

**Zero licenses require source disclosure of AISE code.** All conditions
are attribution/preservation duties, recorded above verbatim from primary
sources.
