# WORLD-P0-A License / Use Matrix — Reality Substrates

**Work item:** WORLD-P0-A (worker-a, reality substrate contracts)
**Recorded:** 2026-10-04 (evidence wave of the WORLD program)
**Governing law:** `spec/world-program.md` §Gates item 3 — "License/use matrix
recorded per substrate (SPDX id, verbatim citation, distribution
compatibility across web + desktop + mobile, attribution duties, patent
clauses, verdict + conditions) BEFORE any runtime adoption."

**Verification method:** every row below was verified against the
PRIMARY SOURCE license document fetched from the substrate's canonical
repository at verification time; the fetched documents are committed
verbatim under `licenses/` with their sha-256 digests in
`licenses/SHA256SUMS.txt`. No license claim in this matrix is derived from
secondary sources.

**P0 adoption status:** NONE of these substrates is adopted, wrapped or
invoked by the delivered package. `packages/world-reality-substrate`
ships substrate-NEUTRAL contracts and in-memory substitution doubles
only. The matrix is the pre-adoption record the gates require; the
verdicts below license FUTURE adoption waves (P1+), not this delivery.

---

## 1. Babylon.js (scene runtime lane)

| Field | Value |
|---|---|
| Substrate | Babylon.js — web rendering/scene engine (TypeScript) |
| Primary source | `https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/license.md` (fetched 2026-10-04; sha-256 `9362ea9e…702cd6`, full digest in `licenses/SHA256SUMS.txt`) |
| SPDX id | `Apache-2.0` |
| Verbatim citation (file header) | "# Apache License 2.0 (Apache)" followed by the full Apache License, Version 2.0, January 2004 text |
| Distribution compatibility | Web (bundled JS): compatible. Desktop (bundled with the app shell): compatible. Mobile (WebView/JS runtime): compatible. Apache-2.0 is permissive with redistribution, modification and commercial use all granted. |
| Attribution duty | NOTICE handling: retain copyright/license/attribution notices in redistributed copies (Apache-2.0 §4). Babylon.js does not ship a NOTICE file in the fetched license; check per-release. |
| Patent clause | Apache-2.0 §3 (patent license grant) and §8 (defensive termination on patent litigation) apply. |
| Verdict | **ADOPTABLE (later waves)** — Apache-2.0, standard permissive terms; no copyleft, no field-of-use restriction observed in the fetched text. Condition: attribution notice retention; review of any third-party code paths Babylon pulls at the version actually adopted. |

## 2. CesiumJS (geospatial context lane)

| Field | Value |
|---|---|
| Substrate | CesiumJS — WGS84 geospatial visualization engine |
| Primary source | `https://raw.githubusercontent.com/CesiumGS/cesium/main/LICENSE.md` (fetched 2026-10-04; sha-256 `721844bc…5d030`) |
| SPDX id | `Apache-2.0` |
| Verbatim citation (file header) | "Copyright 2011-2026 CesiumJS Contributors" followed by the full Apache License, Version 2.0 text |
| Distribution compatibility | Web / desktop / mobile: compatible (same Apache-2.0 analysis as Babylon.js). |
| Attribution duty | Apache-2.0 §4 notice retention. |
| Patent clause | Apache-2.0 §3 / §8. |
| Verdict | **ADOPTABLE (later waves)** — with the same conditions as Babylon.js. Note for later waves: the Cesium ion online tiling/streaming SERVICE is a separate commercial offering with its own terms; the matrix row covers the open-source engine only, and AISE's P0 cesium lane deliberately models the offline WGS84/ellipsoid/horizon math that the engine performs locally. |

## 3. OpenUSD (composition semantics lane)

| Field | Value |
|---|---|
| Substrate | OpenUSD (Universal Scene Description) — scene composition engine |
| Primary source | `https://raw.githubusercontent.com/PixarAnimationStudios/OpenUSD/release/LICENSE.txt` (fetched 2026-10-04; sha-256 `4d6e8e3a…f4452`) |
| SPDX id | **No standard SPDX id** — the file declares "TOMORROW OPEN SOURCE TECHNOLOGY LICENSE 1.0". Record as `LicenseRef-TOST-1.0`. |
| Verbatim citation (file header) | "Note: The Tomorrow Open Source Technology License 1.0 differs from the original Apache License 2.0 in the following manner. Section 6 ("Trademarks") is different." followed by the full license text. |
| Distribution compatibility | Web / desktop / mobile: the license body is an Apache-2.0-derived permissive grant (redistribution, modification, commercial use); the Delta is Section 6 (Trademarks), which is a trademark-use carve-out, not a distribution restriction. Compatible for bundling USD runtimes into desktop builds; web use of native USD is not realistic (native C++), but the license does not forbid compiled-to-wasm distribution. |
| Attribution duty | Apache-2.0 §4-equivalent notice retention including the License's copyright statements; because the license is not OSI/SPDX-standard, the VERBATIM license text must accompany distributions that cannot enumerate standard licenses (e.g. some app-store flows). |
| Patent clause | The Apache-2.0 §3/§8 structure is retained in TOST-1.0's body (verified in the fetched text); the delta is confined to trademarks per the file's own note. Confirm at adoption time by diffing the fetched file against the Apache-2.0 reference text. |
| Verdict | **ADOPTABLE-WITH-CONDITIONS (later waves)** — permissive in substance, but a NON-STANDARD license: (a) treat as `LicenseRef-TOST-1.0` in all SBOM tooling; (b) ship the verbatim license text with desktop distributions; (c) re-verify the Section 6 delta at the exact commit adopted; (d) if the product ever needs trademark rights in "OpenUSD"/"USD" names, that is a separate rights question the license does not grant. |

## 4. glTF 2.0 (runtime delivery lane — format specification)

| Field | Value |
|---|---|
| Substrate | glTF 2.0 — Khronos transmission format (the P0 lane parses the FORMAT, real parsing headless) |
| Primary sources | `https://raw.githubusercontent.com/KhronosGroup/glTF/main/LICENSE.adoc` (sha-256 `efd59d5f…2e47f`) and the specification source `specification/2.0/Specification.adoc` (fetched 2026-10-04; sha-256 `c305d1b0…32664`), both committed under `licenses/` |
| SPDX id | Split by file class per the project's own LICENSE.adoc: `Apache-2.0` for scripts/build tooling; `CC-BY-4.0` for the specification source markup (the 2.0 AsciiDoc this package's validator rules cite); `LicenseRef-KhronosSpecCopyright` for legacy Markdown specs. The FORMAT itself is an open standard; implementing a parser of the format carries no license obligation from these documents. |
| Verbatim citation (LICENSE.adoc) | "Files in this repository fall under one of these licenses: * SPDX license identifier: "Apache-2.0" … * SPDX license identifier: "CC-BY-4.0" … For specification source markup documents such as the glTF 2.0 AsciiDoc sources." |
| Distribution compatibility | AISE's glb parser is an independent implementation authored from the specification (no Khronos code copied); the delivered package contains no Khronos-licensed material. Web / desktop / mobile: no constraint from the format. |
| Attribution duty | None for an independent implementation. If specification text is ever embedded in the product (docs/help), CC-BY-4.0 attribution applies to that text. |
| Patent clause | The Khronos glTF 2.0 specification carries a patent disclosure call (conformance language lives in the specification body); independent parsing of the container/JSON grammar by this package is not a conformance claim and makes no patent representation. Honest note: full patent clearance for SHIPPING conformance-certified glTF tooling is a later-wave legal review item, not a P0 engineering item. |
| Verdict | **CLEARED for P0 (independent implementation, no substrate code adopted); ADOPTABLE for later runtime waves** with the patent-review condition if/when AISE claims glTF conformance or ships Khronos-derived code. |

## 5. Assimp (format ingest lane)

| Field | Value |
|---|---|
| Substrate | Open Asset Import Library (Assimp) — multi-format 3D ingest library |
| Primary source | `https://raw.githubusercontent.com/assimp/assimp/master/LICENSE` (fetched 2026-10-04; sha-256 `21195d41…1a1bd`) |
| SPDX id | `BSD-3-Clause` |
| Verbatim citation (file header) | "Open Asset Import Library (assimp) / Copyright (c) 2006-2026, assimp team / All rights reserved." followed by the standard three-clause BSD redistribution conditions and disclaimer. |
| Distribution compatibility | Web / desktop / mobile: compatible (BSD-3-Clause, permissive). Binary redistribution must retain the copyright notice, conditions list and disclaimer (clause 1); source redistribution likewise (clause 2); neither is a copyleft. |
| Attribution duty | Retain the license text in redistributed binaries/sources; no advertising-clause (that is BSD-4-Clause; this is 3-clause). |
| Patent clause | None granted, none asserted in the fetched text; standard BSD disclaimer of warranties applies. |
| Verdict | **ADOPTABLE (later waves)** — BSD-3-Clause standard terms. |

---

## Cross-row synthesis

- All five substrates are permissive-licensed; NONE triggers copyleft
  obligations for any of web, desktop or field-mobile distribution.
- The one row requiring process care is **OpenUSD** (non-standard
  `LicenseRef-TOST-1.0`): SBOM tooling, verbatim-text distribution, and a
  re-verification step at adoption time are recorded as conditions.
- The one row carrying a deferred legal-review item is **glTF**
  (patent/conformance review IF AISE later claims conformance or ships
  Khronos-derived code — not applicable to this P0's independent parser).
- **Incumbent continuity:** the GBIM spike's Three.js lane
  (`docs/geometry-bim-technology-spike-2026-09-25.md`) was the PRIOR
  evaluation substrate; the directive's replacement rationale and the
  explicit do-not-migrate decision are recorded in
  `INCUMBENT-SUBSTRATE-NOTE.md`.

BLOCKED items (honesty law): none for the five matrix rows — all five
primary sources were fetched and verified this wave. Legal-review items
that are NOT engineering-measurable (patent clearance, trademark rights)
are recorded above as future-wave conditions rather than resolved here.
