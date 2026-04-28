# Mobile build (Android Capacitor)

This document covers everything you need to go from the web app to an
installable Android APK, and the steps that are still blocked on external
signing secrets for a Play Store release.

## 1. Local debug APK (no secrets needed)

```bash
npm install
npm run cap:android:debug
```

The `cap:android:debug` script runs:

1. `npm run build` — Vite production build into `dist/`
2. `cap sync android` — copies `dist/` into `android/app/src/main/assets/public`
3. `./gradlew assembleDebug` — produces an **unsigned debug APK** at

   `android/app/build/outputs/apk/debug/app-debug.apk`

Install it on a phone with USB debugging enabled:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Pointing the APK at your live backend

The web app reads `import.meta.env.VITE_*` values at **build time**, and
`cap sync` then bakes those values into the APK's bundled JS.  So the APK
talks to whichever backend was configured when you ran `npm run build`.

For "all data matches the web" parity, create a `.env.production` (or
`.env.local`) at the repo root before building:

```bash
# .env.production
VITE_API_URL=https://api.your-domain.com/api
VITE_API_FALLBACK_URL=                       # optional secondary host
VITE_ADMIN_PRIVATE_PATH_SEGMENT=<must match backend ADMIN_PRIVATE_PATH_SEGMENT>
VITE_ADMIN_PANEL_PATH=<your secret admin path>
VITE_ADMIN_API_SEGMENT=<your secret admin segment>
VITE_GOOGLE_MAP_API_KEY=...
VITE_RAZORPAY_KEY_ID=rzp_live_...
VITE_APP_ENV=production
```

The Capacitor WebView loads pages from `https://localhost` on Android
(and `capacitor://localhost` on iOS).  Both are already on the backend's
allow-list (`backend/src/config/origins.js`), so CORS, cookie auth, and
the double-submit CSRF token all work unchanged inside the APK.

### Prerequisites

* **Node 22.x** and **npm 10.x** (matching `engines` in `package.json`)
* **JDK 17** (Temurin recommended)
* **Android SDK** (cmdline-tools + platform-tools + build-tools). The
  CI workflow uses `android-actions/setup-android@v3` to install these
  automatically.

### CI workflow

`.github/workflows/build-apk.yml` runs on every push to `main`, every pull
request that touches the app, and via the Actions **Run workflow** button.
It uploads the debug APK as a workflow artifact named `speedy-trucks-apk`
with a 30-day retention — download it from the run summary page.

The workflow injects the same `VITE_*` values from repo **Variables** and
**Secrets** so the CI-built APK points at the same backend as production:

| Setting | Type | Purpose |
|---|---|---|
| `VITE_API_URL` | Variable | Backend base URL (include `/api`) |
| `VITE_API_FALLBACK_URL` | Variable | Optional failover backend |
| `VITE_ADMIN_PANEL_PATH` | Variable | Hidden admin route path |
| `VITE_ADMIN_API_SEGMENT` | Variable | Hidden admin API segment |
| `VITE_ADMIN_PRIVATE_PATH_SEGMENT` | Variable | Same value, alias |
| `VITE_APP_ENV` | Variable | Defaults to `production` |
| `VITE_GOOGLE_MAP_API_KEY` | Secret | Google Maps key |
| `VITE_RAZORPAY_KEY_ID` | Secret | Razorpay public key |

If any value is missing the build still succeeds — but the APK falls back
to dev defaults (`http://localhost:5000`) and won't reach prod data.

## 2. Release (signed) APK / AAB

The debug APK is **not** Play Store eligible — it is signed with the
Android debug keystore shipped in the SDK. A Play release needs an
upload keystore and a few CI secrets.

### One-time setup

1. **Generate an upload keystore** (do this once, keep the file safe — if
   you lose it you cannot publish updates to the same Play listing):

   ```bash
   keytool -genkeypair -v \
     -keystore upload.jks \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -alias speedy-trucks
   ```

   You'll be prompted for a keystore password, key password, and
   distinguished-name fields.

2. **Add these GitHub Actions secrets** under
   *Settings → Secrets and variables → Actions*:

   | Secret name | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | `base64 -w0 upload.jks` (single line) |
   | `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
   | `ANDROID_KEY_ALIAS` | `speedy-trucks` (or whatever alias you chose) |
   | `ANDROID_KEY_PASSWORD` | Key password (often same as keystore password) |

### Running the build

The `.github/workflows/build-apk-release.yml` workflow runs:

* Manually — Actions tab → **Build Android Release (Signed APK + AAB)**
  → **Run workflow**.
* Automatically when you push a tag matching `v*` (e.g. `git tag v1.0.0
  && git push --tags`).

It produces two artifacts on the run summary page:

* `speedy-trucks-release-apk` → `app-release.apk` — sideload / direct
  distribution.
* `speedy-trucks-release-aab` → `app-release.aab` — upload to Play
  Console (Internal testing → Production).

The keystore file is decoded into the runner workspace and deleted again
in a final cleanup step, so it never lands in build artifacts.

### Local signed build

Same env vars work locally — set them in your shell, drop the keystore
at `android/app/release.keystore` (or point `ANDROID_KEYSTORE_PATH` at
it), then:

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease bundleRelease
```

Outputs land in `android/app/build/outputs/apk/release/` and
`android/app/build/outputs/bundle/release/`.

If the keystore env vars are absent, `assembleRelease` still works but
produces an **unsigned** APK that Play Store will reject — useful only
for local smoke testing.

### Auto-uploading to Play Console (optional, future work)

To automate the Play Console upload, add a `GOOGLE_PLAY_SA_JSON` secret
(service-account JSON from Google Cloud → IAM, granted "Release
manager" in Play Console → API access) and append a step using
`r0adkll/upload-google-play@v1` to the workflow. Not wired up yet —
file an issue when you're ready and we'll add it.

## 3. iOS — deliberately not started

An iOS build adds another set of external dependencies:

* An **Apple Developer account** (US$99/yr)
* A **signing identity** (Development + Distribution certificates)
* An **App Store Connect app record** + **provisioning profile**
* Running `cap add ios` on a macOS machine with Xcode (Linux runners
  can't produce IPA files)

When you've signed up for the Apple Developer Program and know which
team will own the app, open an issue and we'll wire up a macOS GitHub
Actions runner and a Fastlane match/manual signing flow.

## 4. Browser-based GPS as a stand-in for a native driver app

While you don't have a signed release build, drivers can visit
`/driver/live` in Chrome on their phone. That page uses
`navigator.geolocation.watchPosition()` → existing socket.io
`update-location` handler. Its honest limits (documented in-UI):

* iOS Safari suspends watchPosition when the tab is backgrounded or the
  screen is locked.
* Browser GPS accuracy is worse than a native fused-location provider
  (typically ±10–50 m in motion vs ±3–10 m native).
* If the device goes offline, pings are dropped until the socket
  reconnects — there is no replay.

A signed native app with a foreground service is the only way to get
always-on background tracking. That's a separate ~4–6 week effort once
the signing secrets above are in place.
