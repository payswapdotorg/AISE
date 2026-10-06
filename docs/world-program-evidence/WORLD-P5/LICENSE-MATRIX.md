# WORLD-P5 — License Matrix (the runtime-adoption extensions)

**Item:** WORLD-P5 — Multiplatform convergence (the final program item).
**Base:** `bb624fb` (WORLD-P4 complete, battery 7325/7325 at its station).
**Law:** `spec/world-program.md` gate 3 + `spec/technology-substitution-contract.md`
— a license/use matrix recorded per NEW substrate adoption BEFORE any
runtime adoption; the WORLD-P0-A matrices stand and are EXTENDED ONLY
by what is new in this item.

## What is NEW at P5

Exactly ONE new substrate enters RUNTIME adoption at P5: the
`@babylonjs/core` npm distribution of Babylon.js (the real occupant of
the P0-A `babylon.scene-runtime/1` port — `packages/world-scene-runtime`).
Everything else P5 composes is already matrixed: Electron (P0-C
DESKTOP-SHELL-DECISION — keep, Tauri deferred), CesiumJS (P0-A — NOT
adopted at P5, see the BLOCKED record), the landed workspace packages
(AISE-owned).

## 1. Babylon.js — the runtime adoption of the P0-A matrixed substrate

- **SPDX:** `Apache-2.0`
- **Verified at install (this delivery):** the installed package
  `node_modules/@babylonjs/core/package.json` declares `"license":
  "Apache-2.0"`; `node_modules/@babylonjs/core/license.md` first line
  (verbatim): `# Apache License 2.0 (Apache)` — the SAME verbatim
  license-name line the WORLD-P0-A matrix verified at
  https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/license.md
  (fetched 2026-10-02). The installed distribution additionally ships
  `NOTICE.md` (verbatim head: `Babylon.js` / `Copyright 2023 The
  Babylon.js team`).
- **Attribution duties:** Apache-2.0 §4 — retain the copyright notice
  + license text in distributions. P5 ADDS the NOTICE.md aggregation
  duty: the package's NOTICE lists embedded components (e.g. Draco
  [v1.5.6] — Apache-2.0-family); desktop builds that bundle
  `@babylonjs/core` MUST carry the package's license.md + NOTICE.md
  into the shipped third-party notices (the P0-C Electron occupancy
  condition (d) — "keep the third-party license aggregation in
  builds" — already requires exactly this).
- **Patent clause:** YES — Apache-2.0 §3 explicit patent grant + §9
  patent retaliation termination. Protective for AISE (unchanged from
  the P0-A verdict).
- **Distribution compatibility across the three platforms:**
  - web ✓ — bundled JS served by the product SPA (esbuild-bundled;
    the crypto-free bundle law is verified by the P5 bundle-scan
    tests);
  - desktop ✓ — the SAME bundled front end inside the existing
    Electron thin shell (the P0-C decision; no second authority);
  - Android ✓ — the world-open handoff is a URI (no Babylon bundle on
    the device at P5; the mobile world journey opens on web/desktop).
- **Verdict: APPROVED for runtime adoption** — standard Apache-2.0
  duties only, PLUS the recorded condition: desktop/mobile
  distributions that embed Babylon must aggregate license.md +
  NOTICE.md (the P0-C condition (d) discipline).

## 2. SwiftShader (the software-GL renderer of the headless Chromium)

NOT an AISE adoption: SwiftShader is a component of the Playwright
Chromium test runtime (already a devDependency matrixed by the
PROD-030 browser-journey discipline). It appears in this item's
RECORDED MEASUREMENTS as the honest renderer identity of the
software-render browser legs (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader
Device (Subzero) (0x0000C0DE)), SwiftShader driver)` — recorded
verbatim in PERFORMANCE-OBSERVATIONS.md §4); those legs are labeled
SOFTWARE-RENDERED and are NEVER presented as GPU numbers. No
distribution duty arises (test-only, not shipped).

## 3. CesiumJS — NOT adopted at P5 (declared)

The P0-A matrix verdict (APPROVED, standard Apache-2.0 duties, no ion
dependency) STANDS, but no real Cesium occupant is mounted in this
delivery: the measurement protocol's Cesium legs are declared BLOCKED
with their exact blockers (no campus-scale open-licensed 3D Tiles
corpus in the sandbox; no GPU device; the P5 mounts are the Babylon
viewport per the work order). No new matrix entry is required — the
P0-A entry remains the governing record; the BLOCKED protocol is
recorded in PERFORMANCE-OBSERVATIONS.md §5.

## Summary

| substrate | SPDX | patent clause | web | desktop | Android | verdict |
|---|---|---|---|---|---|---|
| Babylon.js (`@babylonjs/core` runtime adoption) | Apache-2.0 | YES (§3/§9) | ✓ | ✓ (+NOTICE aggregation duty) | ✓ (URI handoff — no bundle) | APPROVED (extends WORLD-P0-A §1) |
| SwiftShader (test-runtime renderer only) | (Chromium component) | — | test-only | test-only | n/a | NOT an adoption (recorded renderer identity) |
| CesiumJS | Apache-2.0 | YES | not adopted | not adopted | not adopted | P0-A entry stands; legs BLOCKED at P5 |
