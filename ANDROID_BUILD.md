# Android build and release

The Android project wraps the production Vite assets using Capacitor 8. The package is `com.aethergravity.app`, minSdk 24, compile/target SDK 36. Native **versionCode is 6** and **versionName is 2.0.0**, matching the npm package version. Bump both native fields together for every Play upload (`versionCode` must increase).

## Toolchain

Use Node 22 or newer, JDK 21, Android SDK 36 and the checked-in Gradle wrapper. Set JAVA_HOME to the local JDK installation. Keep SDK paths in ignored `android/local.properties` or user configuration. WebGL2 / OpenGL ES 3.0 is required.

`npm ci` / `npm install` are allowed for this release line. Install with a reviewed lockfile; CI re-checks that every `resolved` URL is the npm registry, integrity hashes are present, `@capacitor/assets` / `sharp` stay absent, and remaining advisories match `scripts/audit-allowlist.json`. Do not add `@capacitor/assets` back — regenerate icons by hand ([ICONS_README.md](./ICONS_README.md)). Release builds enable R8 (`minifyEnabled` and `shrinkResources`). Keep rules live in `android/app/proguard-rules.pro`. `scripts/fix-proguard.js` still rewrites plugin `proguard-android.txt` references to `proguard-android-optimize.txt` on install.

## Build with the installed toolchain

From the repository root:

```powershell
npm run build
node node_modules/@capacitor/cli/bin/capacitor copy android
node scripts/android-manifest-gate.mjs
.\android\gradlew.bat -p android :app:assembleRelease :app:bundleRelease :app:lintRelease :app:testDebugUnitTest --offline --no-daemon
node scripts/android-manifest-gate.mjs
```

The copy command refreshes web assets and Capacitor configuration. Use the root Capacitor CLI 8 binary. Do not run `capacitor-assets generate`, `cap add`, or other tar-extracting generator commands. Offline Gradle requires previously cached Android dependencies; a missing cache is a blocked check, not permission to change the dependency graph. Open `android/` in Android Studio for development. Use a debug build for local device investigation.

Unsigned APK/AAB from this tree are validation artifacts, not Play uploads.

## Release configuration

The app manifest disallows backup and cleartext traffic and requires ES 3.0. FileProvider shares only the dedicated `cache/shared_exports/` directory. Capacitor disables WebView debugging and native logging; release is explicitly non-debuggable. Inspect the **merged release manifest** after building, including permissions and exported components contributed by libraries. `scripts/android-manifest-gate.mjs` fails if the source (and merged, when present) manifest declares INTERNET, enables cleartext, or is debuggable. The launch activity is intentionally exported. Haptics requires VIBRATE.

Lint errors fail the build. Warnings remain review items, not automatically suppressed. Do not add Firebase configuration, signing credentials or network services to resolve unrelated build warnings.

## Play Console Data safety (publisher form)

Fill the Play Data safety form from the shipped behaviour in [content/privacyPolicy.ts](content/privacyPolicy.ts). Suggested answers for this build:

- **Does the app collect or share user data?** No.
- **Data collected:** none (no accounts, no analytics, no crash SDKs, no advertising IDs).
- **Data shared:** none.
- **Security practices:** data is not transmitted; the Android package is intended to ship without INTERNET. Encryption in transit is not applicable. Backups are disabled in the manifest.
- **Account creation / login:** not offered.
- **Children:** not directed at children; no collection.
- **Privacy policy URL:** `https://www.termsfeed.com/live/cded6b3e-c46c-465e-a562-f1a73cd79f1c`

Worlds are stored only in on-device WebView `localStorage`. That is app-private device storage, not a Play-declared collection category, as long as you do not add cloud backup, sign-in, or network export.

Re-check the hosted TermsFeed page against the in-app text before each store listing update.

## Signing and device gate

Use the publisher's existing signing identity through Android Studio or an external credential store. Do not place passwords in source, terminal commands, logs or reports. Keep keystores outside tracked source. This repository does not generate keys, sign, install, upload or publish a release.

Before release, test the **signed** AAB/APK on low-end and representative Android hardware: launch offline, create/edit/save/reopen, pause/background/resume, Android Back, rotation, WebView context loss, touch targets, screen reader, large text, storage-full recovery, and a long session. Verify that device/browser locking allows editing on the target WebView. Without Web Locks the app deliberately opens read-only.

## Final publisher checklist

- Run the source checks documented in the root README and confirm the signed artifact passes the device gate above.
- Upload the signed AAB with the current `versionCode` / `versionName`, then re-check the Data safety answers and hosted privacy policy.
- Keep the upload key and Play service credentials outside the repository; confirm repository branch protection, secret scanning, and owner 2FA separately in GitHub.
