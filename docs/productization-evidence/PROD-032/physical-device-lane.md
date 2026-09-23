# PROD-032 — Physical-device lane (documented, AWAITING physical execution)

The E2B station empirically established build/CLI/test capability and the
station-fidelity field journey, and empirically established that **no emulator
can run there** (`BLOCKED_NO_KVM` — see [`README.md`](README.md) §3). The
remaining fidelity classes — **physical camera, physical video, real sensors,
runtime permissions, capture lifecycle on real hardware** — can only be
evidenced on a physical device. This file is the smallest legitimate lane for
that: exact commands a human operator runs.

> **Status: DOCUMENTED LANE — NOT YET EXECUTED.** No results below are claimed,
> implied, or fabricated. Every "expected" line states what the operator should
> observe and record, and becomes evidence only when a real run fills it in.

## 0. Prerequisites

- A physical Android device, API 26+ (minSdk 26; targetSdk 35), with Developer
  Options → USB debugging enabled, connected over USB.
- A workstation with git, JDK 21, and the Android SDK (or just run everything
  on a fresh E2B station via `station-driver.py script gradle-trio` and fetch
  the APK — the build path is identical; §1).
- [Bun](https://bun.sh) for the real backend (same as the station).

## 1. Build exactly as the station does

```bash
git clone https://github.com/payswapdotorg/AISE.git && cd AISE
git checkout 6728c3b                      # the PROD-032 delivery SHA

cd apps/android
./gradlew :core:test :app:test :app:assembleDebug   # the same three gates
sha256sum app/build/outputs/apk/debug/app-debug.apk
# record: expected to match the station digest class (18.4 MB debug APK);
# the exact station digests are in README.md §2.
```

## 2. Boot the real backend on the workstation

Identical to `field-journey.sh`, except the host must be reachable from the
device (either same Wi-Fi, or `adb reverse` below keeps it loopback-only):

```bash
cd /path/to/AISE
bun install

mkdir -p ~/.aise-physical-data
AUTH_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export AISE_AUTH=1 AISE_AUTH_MODE=demo-open
export AISE_DATA_DIR="$HOME/.aise-physical-data"
export AUTH_SECRET HOST=127.0.0.1 PORT=8791

cd backend/api
bun run start &            # wait for: curl -fsS http://127.0.0.1:8791/healthz
```

## 3. Install and reach the backend from the device

```bash
adb devices                                             # device visible + authorized
adb reverse tcp:8791 tcp:8791                           # device 127.0.0.1:8791 → workstation
adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
adb shell dumpsys package org.payswap.aise.app | grep -E 'versionName|targetSdk'   # record
```

In the app: **Settings → server base URL = `http://127.0.0.1:8791`** (the
station journey used the same loopback pattern; `adb reverse` makes it valid
on-device).

**Honest gap the operator must close first (record it as part of the lane):**
the debug APK ships no `networkSecurityConfig` and no `usesCleartextTraffic`,
so on Android 9+ (API 28+) the OS default blocks plain-HTTP backends. Add a
**debug-only** cleartext permission for your backend host before installing
(`app/src/debug/AndroidManifest.xml`):

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:usesCleartextTraffic="true" />
</manifest>
```

(or restrict via `android:networkSecurityConfig` to `127.0.0.1`/your LAN IP).
This debug-only override never ships in release; alternatively serve the
backend over HTTPS. Building with the override is part of the lane, not a
fabrication of evidence.

## 4. The physical field journey (operator script)

Perform and RECORD each step (screen recording + logcat, §5). This mirrors the
station journey's 16 steps, but the fidelity classes flip for the hardware
steps: still/video/sensor become **REAL**, and runtime permissions become
**REAL OS dialogs**.

1. **Sign in** (demo principal) — the authenticated transport is exercised
   exactly as on the station.
2. **Capability assessment + session start** — on a device with a camera and
   IMU the honest baseline should now report the hardware as PRESENT
   (contrast: the station baseline records `imuActive=false`). Record the
   reported capability snapshot.
3. **Runtime permissions (physical-fidelity evidence):** start guided capture —
   the CAMERA permission is requested MISSION-SCOPED at first capture use
   (manifest: `CAMERA` + `INTERNET` only; camera is `required="false"`).
   Record: (a) dialog appears at capture time, not at install/launch; (b) deny
   once — the app must degrade honestly (capture unavailable, no crash); (c)
   grant — capture proceeds.
4. **Guided still capture** — real camera frames (record megapixels/EXIF or the
   captured asset's content hash and byte size).
5. **Guided video capture** — real camera video (record duration/size).
6. **Sensor capture** — real IMU/rotation-vector data (record sample count and
   rate; on a device without these sensors, record the honest
   unavailable-report instead — that too is valid evidence).
7. **Pause/resume** during capture; **recovery** (force-stop the app via
   `adb shell am force-stop org.payswap.aise.app`, relaunch, confirm journal
   replay recovers the open session and assets).
8. **Submit-blocked → sign-in flow** (sign out; attempt sync — the app must
   defer explicitly with the sign-in message, never silently drop evidence).
9. **Submit + idempotent resubmit** — both accepted server-side; then verify
   from the workstation:
   ```bash
   curl -fsS http://127.0.0.1:8791/healthz
   # GET the session created on-device (session id from the app's sync screen):
   curl -fsS http://127.0.0.1:8791/v1/capture/sessions/<session-id> | head
   # expected: HTTP 200 with the sequence the device submitted
   ```

## 5. Evidence capture (what the operator records)

```bash
adb shell getprop ro.build.fingerprint          # device fingerprint
adb shell getprop ro.product.model; adb shell getprop ro.build.version.release
adb shell screenrecord /sdcard/aise-journey.mp4 # run during §4; then:
adb pull /sdcard/aise-journey.mp4 .
adb logcat -d -s AiseFieldFieldJourney:V AiseApp:V > aise-logcat.txt 2>/dev/null || adb logcat -d > aise-logcat.txt
adb shell dumpsys package org.payswap.aise.app | grep -A4 'runtime permissions'   # granted state
sha256sum app-debug.apk aise-journey.mp4
```

File the results as
`docs/productization-evidence/PROD-032/physical-device/` (fingerprint, journey
recording, logcat, session GET output, per-step classification updated to
physical fidelity) with the date, device model, and Android version. Until
that directory exists and is filled by a real run, **physical fidelity remains
UNEVIDENCED — by design, honestly.**
