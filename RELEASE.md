# Release Guide — Speedy Trucks

This document explains how to build, sign, and publish a production Android APK / AAB (App Bundle).
It also covers the keystore strategy, CI/CD pipeline wiring, and the release checklist.

---

## 1. Versioning

All version numbers live in `package.json` (`version`) and `android/app/build.gradle`
(`versionCode` / `versionName`). Keep them in sync for every release.

| Field          | File                         | Example      |
|----------------|------------------------------|--------------|
| `version`      | `package.json`               | `1.2.0`      |
| `versionName`  | `android/app/build.gradle`   | `"1.2.0"`    |
| `versionCode`  | `android/app/build.gradle`   | `12`         |

> `versionCode` must be **strictly increasing** — the Play Store rejects uploads
> where versionCode ≤ the last published versionCode.

---

## 2. Android Keystore Strategy

### 2.1 Development / debug signing

Capacitor uses the debug keystore at `~/.android/debug.keystore` automatically.
Debug builds are **not** installable from the Play Store.

### 2.2 Production signing

1. **Generate once** (keep the `.jks` file permanently — losing it means you can
   never update the Play Store listing):

   ```bash
   keytool -genkey -v \
     -keystore speedytrucks-release.jks \
     -alias speedytrucks \
     -keyalg RSA \
     -keysize 2048 \
     -validity 10000
   ```

2. **Store securely** — never commit the `.jks` to the repository.
   Use one of:
   - GitHub Actions secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`)
   - A secrets manager (HashiCorp Vault, AWS Secrets Manager, etc.)

3. **Configure** `android/app/build.gradle`:

   ```groovy
   android {
     signingConfigs {
       release {
         storeFile     file(System.getenv("KEYSTORE_PATH") ?: "speedytrucks-release.jks")
         storePassword System.getenv("KEYSTORE_PASSWORD") ?: ""
         keyAlias      System.getenv("KEY_ALIAS")         ?: "speedytrucks"
         keyPassword   System.getenv("KEY_PASSWORD")      ?: ""
       }
     }
     buildTypes {
       release {
         signingConfig signingConfigs.release
         minifyEnabled false
       }
     }
   }
   ```

4. **CI** — the `.github/workflows/build-apk-release.yml` workflow decodes
   `KEYSTORE_BASE64` from repository secrets, writes the `.jks` to a temp path,
   and injects the env vars above.

---

## 3. Build Steps

### 3.1 Local debug build

```bash
npm run build            # Vite build → dist/
npx cap sync android     # Copies dist/ into android assets + syncs plugins
cd android
./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

### 3.2 Local release build (unsigned)

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

### 3.3 Signed release build (requires keystore env vars)

```bash
export KEYSTORE_PATH=/path/to/speedytrucks-release.jks
export KEYSTORE_PASSWORD=<secret>
export KEY_ALIAS=speedytrucks
export KEY_PASSWORD=<secret>

npm run build
npx cap sync android
cd android
./gradlew assembleRelease
# Signed APK: android/app/build/outputs/apk/release/app-release.apk
```

### 3.4 App Bundle (Play Store preferred format)

```bash
./gradlew bundleRelease
# AAB: android/app/build/outputs/bundle/release/app-release.aab
```

---

## 4. CI/CD Workflows

| Workflow                         | Trigger            | Output          |
|----------------------------------|--------------------|-----------------|
| `build-apk.yml`                  | push to `main`     | debug APK       |
| `build-apk-release.yml`          | `v*` tag push      | signed release APK |
| `e2e.yml`                        | PR against `main`  | Playwright report |
| `production.yml`                 | push to `main`     | deployed backend |
| `security-audit.yml`             | schedule (weekly)  | npm audit report |

### 4.1 Triggering a release

```bash
git tag v1.2.0
git push origin v1.2.0
```

This triggers `build-apk-release.yml`, which builds and uploads the signed APK
as a GitHub Release asset.

---

## 5. Required GitHub Repository Secrets

| Secret              | Description                                            |
|---------------------|--------------------------------------------------------|
| `KEYSTORE_BASE64`   | Base64-encoded `.jks` keystore file                    |
| `KEYSTORE_PASSWORD` | Password for the keystore                              |
| `KEY_ALIAS`         | Key alias inside the keystore                          |
| `KEY_PASSWORD`      | Password for the key (often same as `KEYSTORE_PASSWORD`) |

To base64-encode the keystore for GitHub Secrets:

```bash
base64 -w 0 speedytrucks-release.jks | pbcopy   # macOS
base64 -w 0 speedytrucks-release.jks             # Linux (then copy output)
```

---

## 6. Play Store Submission Checklist

- [ ] `versionCode` incremented in `android/app/build.gradle`
- [ ] `versionName` updated to match `package.json` `version`
- [ ] Release notes written in `android/fastlane/metadata/android/en-US/changelogs/`
- [ ] Screenshot set updated if UI changed significantly
- [ ] Privacy Policy URL still valid (`VITE_PRIVACY_URL` env var)
- [ ] Signed AAB built locally and smoke-tested on a physical device
- [ ] `npm audit` shows no high/critical vulnerabilities
- [ ] All backend tests green (`cd backend && npm run test:security`)
- [ ] Frontend tests green (`npx vitest run`)
- [ ] Playwright E2E smoke test passing locally

---

## 7. Hotfix Process

1. Create a branch from the release tag: `git checkout -b hotfix/1.2.1 v1.2.0`
2. Apply the fix and bump `versionCode` + `versionName`.
3. Push the branch, open a PR to `main`.
4. After merge, tag: `git tag v1.2.1 && git push origin v1.2.1`.

---

## 8. Rollback

The Play Store does not support instant rollback of an APK once it is live on
> 1 % rollout. The safe rollback path is:

1. Halt the staged rollout in the Play Console.
2. Identify the previous signed APK / AAB from GitHub Release assets.
3. Re-submit the previous version with a **new, higher** `versionCode`.
4. Investigate the regression before resuming rollout.
