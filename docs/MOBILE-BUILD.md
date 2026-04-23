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

## 2. Release (signed) APK / AAB — blocked until you add secrets

The debug APK is **not** Play Store eligible — it is signed with the
Android debug keystore shipped in the SDK. A Play release needs:

| Secret / resource | How to obtain it |
|---|---|
| Upload keystore (`.jks` or `.keystore`) | Generate once with `keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias speedy-trucks` |
| Keystore password | Same command — pick a strong one. Keep it in a password manager. |
| Key alias | `speedy-trucks` (or whatever you used above; must match `capacitor.config.json#android.buildOptions.keystoreAlias`) |
| Key password | Usually the same as the keystore password |
| Google Play service account JSON | Create in Google Cloud → IAM → Service accounts, grant "Release manager" in Play Console → API access, download JSON |

Once you have these, add them to this repository under **Settings → Secrets
and variables → Actions** using these exact names:

| GitHub Actions secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Output of `base64 -w0 upload.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |
| `GOOGLE_PLAY_SA_JSON` | Full contents of the service-account JSON |

Adding a signed build job to `.github/workflows/build-apk.yml` is then
straightforward:

```yaml
  release:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Restore keystore
        run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/app/speedy-trucks.keystore
      - name: Assemble release
        env:
          KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          KEY_ALIAS:         ${{ secrets.ANDROID_KEY_ALIAS }}
          KEY_PASSWORD:      ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: cd android && ./gradlew bundleRelease --no-daemon
      - name: Upload to Play Store
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.GOOGLE_PLAY_SA_JSON }}
          packageName: com.speedytrucks.app
          releaseFiles: android/app/build/outputs/bundle/release/app-release.aab
          track: internal
```

That block is **deliberately not enabled today** — it would fail on the
first run because the secrets above don't exist yet. Add the secrets,
uncomment the job, push, and it works.

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
