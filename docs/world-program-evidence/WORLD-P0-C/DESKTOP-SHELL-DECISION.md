# WORLD-P0-C — the desktop shell decision record (Tauri vs the existing Electron thin shell)

**Decision scope:** which shell candidate occupies the
`desktop.shell/1` adapter contract (`packages/world-solution-substrate/src/desktop/`)
for the first-class Windows/macOS/Linux application of directive §6 —
Tauri (wry/tao, Rust) or the EXISTING Electron thin shell of
`apps/desktop` (PROD-020, already shipped).

**What this decision is NOT:** it is not a rewrite decision. The
directive's law is explicit — the desktop app "must not be a separate
fork of the product" and there is "no second desktop-only engineering
authority". Both candidates host the SAME shared React/Babylon front
end over the same domain contracts; the shell is presentation/platform
substrate only (the thin-shell law is enforced STRUCTURALLY by the
`desktop.shell/1` contract — its closed method surface has no
engineering-state operation, drilled by the colocated tests).

**Evidence status honesty:** this sandbox has NO display, NO webview
runtime and NO Rust toolchain — nothing about real shells was EXECUTED
here (the in-repo doubles model both candidates' contract behavior
only). Everything below is either (a) MEASURED in this sandbox where
marked, (b) OFFICIALLY DOCUMENTED with citations where marked, or
(c) declared NOT-DERIVABLE with the protocol that would settle it.

## 1. Sidecar process management (the §6 heavy-substrate model)

Both candidates can host the OCCT/IfcOpenShell/FreeCAD sidecars the
contract types (`SidecarSpec` → spawn/query/teardown):

- **Electron (PROD-020, in-repo):** Node.js main process has mature
  child-process APIs (`child_process.spawn` with typed IPC channels);
  the existing shell already demonstrates typed main-process messaging
  (`SHELL_IPC_CHANNELS` in `apps/desktop/src/shell/policy.ts`). The
  PROD-020 evidence records the launch smoke run at the integration
  station. Risk: an Electron main-process crash takes the shell (and
  orphaned sidecars unless supervised — the contract's shutdown report
  exists precisely to make orphaning testable).
- **Tauri:** Rust side (`std::process::Command` + tauri's shell/sidecar
  plugin — the official `shell` plugin supports shipping sidecar
  binaries with explicit capability allow-lists, documented at
  https://v2.tauri.app/plugin/shell/ ). Rust process supervision is
  robust and memory-safe; capability-scoped sidecar execution fits the
  contract's typed `SidecarSpec` allow-listing (closed substrate-kind
  vocabulary) naturally.
- **Assessment:** parity-class capability on both sides; Tauri's
  capability-scoped sidecar plugin matches the contract's closed
  vocabulary slightly more directly, Electron's is already exercised
  in-repo. NOT decisive alone.

## 2. Webview fidelity for Babylon/Cesium (WebGPU availability per platform webview)

This is the highest-stakes axis for the Layer-3 game world
(Babylon.js WebGPU-first with WebGL fallback, directive §6):

- **Electron:** the webview IS Chromium. Chromium's WebGPU rollout
  (official Chrome Platform Status, feature
  `https://chromestatus.com/feature/5210197539168256`): shipped default-on
  on Windows (Chrome 113, 2023) and macOS (Chrome 121, 2024); Linux
  enablement has lagged behind Windows/macOS across releases (verify the
  exact default state at the pinned Electron/Chromium version before
  wiring — the sandbox cannot measure this). Net: TWO of three desktop
  platforms get WebGPU with high confidence and IDENTICAL webview
  behavior on all three (one engine, one release train) — the
  same-engine guarantee is what kills rendering-fork risk.
- **Tauri:** the webview is the OS webview (official Tauri docs,
  https://v2.tauri.app/start/prerequisites/ — verbatim: *"Tauri uses
  Microsoft Edge WebView2 to render content on Windows"*; Linux deps
  list `webkit2gtk-4.1`; macOS uses WKWebView):
  - Windows: WebView2 (Chromium-based) → WebGPU available following the
    WebView2 runtime's Chromium version (direction documented; exact
    default-enablement NOT verified here — check the WebView2 release
    notes at the pinned runtime).
  - macOS: WKWebView → WebGPU arrived with WebKit's Safari 26 release
    train (Apple's official Safari 26 release notes, verbatim entry:
    *"Added support for WebGPU. (145801580)"*). Older macOS installs
    (Safari 26-era WebKit required) fall back to WebGL.
  - Linux: WebKitGTK → WebGPU landed in the WebKitGTK 2.46 release
    train (2024, WebKit release notes) with distro-dependent enablement
    timelines.
  - Net: THREE DIFFERENT engines across three platforms — each Babylon
    feature must be verified per-engine, and the Linux WebKitGTK lane
    is the weakest WebGPU surface.
- **Assessment:** for a WebGPU-first world, Electron's single-engine
  model is the LOWER-fidelity-risk path today; Tauri's OS-webview model
  trades bundle size for engine variance. DECLARED: real per-platform
  WebGPU fidelity is NOT MEASURABLE in this sandbox (no display, no
  webviews) — the measurement protocol is recorded in
  PERFORMANCE-OBSERVATIONS.md for the WORLD-P5 packaging item.

## 3. Memory / bundle footprint

- **Tauri (officially documented):** *"Tauri apps take advantage of the
  web view already available on every user's system. This means that a
  minimal Tauri app can be less than 600KB in size."* (official
  https://v2.tauri.app/start/ , verbatim). No Chromium/Node runtime is
  bundled → installers of single-digit MB and RAM governed by the OS
  webview process.
- **Electron (officially documented direction):** every app embeds
  Chromium + Node.js — tens-of-MB installers and multi-process Chromium
  RAM costs per window. Electron does not publish a single official
  RAM number (honestly recorded); the magnitude is common knowledge and
  is OFFICIALLY implied by the architecture (bundled full browser
  engine). NOT MEASURED in this sandbox (no Electron launch possible
  headlessly here — the PROD-020 evidence records the launch smoke at
  the integration station, which had a display).
- **Assessment (documented-numbers basis, as labeled):** Tauri wins the
  footprint axis decisively; this matters most for the Android-adjacent
  and low-spec field scenarios.

## 4. Security model

- **Tauri:** Rust memory-safety core; a capability-based allow-list
  system (permissions per command/plugin — IPC surface is
  deny-by-default), documented at https://v2.tauri.app/concept/security/ .
  OS-webview CVE train is shared with the OS (patched by the platform,
  but out of AISE's release train).
- **Electron:** full Chromium sandboxing model available, but the
  default IPC surface is broader and discipline-dependent (the existing
  PROD-020 shell is deliberately thin and policy-driven —
  `apps/desktop/src/shell/policy.ts` — which mitigates this);
  Chromium CVE train is in ELECTRON's release train (AISE controls
  updates by upgrading Electron).
- **Assessment:** Tauri's deny-by-default capability model is
  architecturally stricter; Electron's is discipline-dependent but
  already demonstrated thin in-repo.

## 5. Licensing

Recorded in LICENSE-MATRIX.md with verbatim citations: Tauri/wry
`Apache-2.0 OR MIT`, tao `Apache-2.0`, Electron `MIT` (+ the bundled
Chromium/Node third-party notice aggregation duty). BOTH are permissive
and compatible with AISE's web + desktop + Android distribution
model — licensing does not decide this.

## 6. Maintenance risk

- **Electron:** high release cadence (frequent Chromium security
  updates → periodic major upgrades), mature ecosystem, zero new
  toolchain in the repo (already shipped as PROD-020; TypeScript
  end-to-end).
- **Tauri:** adds a Rust toolchain + a second language boundary to the
  repo's TypeScript discipline; slower release cadence; the OS-webview
  variance (three engines) is an ongoing per-platform compatibility
  surface; the team's existing investment is zero (new surface).
- **Assessment:** Electron is the lower-maintenance-risk path for THIS
  repository today; Tauri is the longer-term footprint/security play.

## 7. Migration cost from the existing thin shell

- **Electron:** ZERO — it exists (`apps/desktop`), is verified under
  PROD-020, and consumes the same shared adapter contracts. The
  `desktop.shell/1` contract was designed so the existing thin shell's
  lifecycle/policy surface maps onto it directly (load policy, menu,
  typed IPC channels — `apps/desktop/src/shell/policy.ts`).
- **Tauri:** a NEW shell crate + build/packaging pipeline (bundler
  plugins, code signing per platform), plus porting the PROD-020
  affordances (menus, notifications, local-file dialog, outbox replay)
  to Tauri commands — a bounded but real migration (the directive's
  migration-cost axis), AND the cross-webview verification burden from
  §2.

## VERDICT

**KEEP THE EXISTING ELECTRON THIN SHELL as the first occupant of the
`desktop.shell/1` contract; DEFER the Tauri migration decision to
WORLD-P5 with a recorded trigger.** Conditions, stated exactly:

1. **Contract-first either way (the P0 deliverable):** the desktop app
   consumes ONLY the `desktop.shell/1` adapter — the shell stays
   swappable substrate (the two in-repo doubles prove both candidates
   can occupy the port). No shell-specific engineering authority
   (directive §6/§10 — enforced structurally by the closed method
   surface).
2. **Electron occupancy conditions:** (a) keep the thin-shell policy
   discipline of PROD-020 (no domain logic in the main process);
   (b) adopt the typed sidecar management of `desktop.shell/1` for the
   OCCT/IfcOpenShell/FreeCAD sidecars with the shutdown-report
   no-orphans check wired into the app's teardown path; (c) maintain
   the Electron/Chromium upgrade train for the WebGPU + security
   cadence; (d) keep the third-party license aggregation in builds.
3. **Tauri trigger (the recorded re-decision condition for WORLD-P5):**
   migrate if and only if BOTH (a) per-platform WebGPU fidelity in the
   OS-webview set is VERIFIED sufficient for the Babylon world (the
   measurement protocol is recorded in PERFORMANCE-OBSERVATIONS.md —
   WKWebView Safari-26-era WebKit on macOS, WebKitGTK ≥ 2.46-class on
   Linux, WebView2 current on Windows), AND (b) the field-device
   footprint targets (installer/RAM on low-spec hardware) become
   product requirements the bundled-Chromium model cannot meet.
   Until both hold, the single-engine rendering fidelity and zero
   migration cost dominate.

**What would change this verdict:** a verified WebGPU regression in
the Electron/Chromium train, a hard product requirement on <10 MB
installers for field devices, or a security posture that requires
deny-by-default IPC beyond what PROD-020's policy discipline delivers.
