# Android build and release

The Android project wraps the production Vite assets using Capacitor 8. The package is `com.aethergravity.app`, minSdk 24, compile/target SDK 36. Native versionCode is 4 and versionName is 1.5.0; npm package version is 1.0.2. These independent existing version fields were preserved; the publisher must select the next store version before submission.

## Toolchain

Use Node 22 or newer, JDK 21, Android SDK 36 and the checked-in Gradle wrapper. Set JAVA_HOME to the local JDK installation. Keep SDK paths in ignored `android/local.properties` or user configuration. WebGL2 / OpenGL ES 3.0 is required. Installed tools and an emulator are not assumed merely because this project exists.

During the frozen-dependency audit, use the already installed toolchain. Do not install packages or regenerate the lockfile. Existing package scripts include a postinstall patch for native ProGuard references; it was not run during the audit. Release minification is currently disabled, so ProGuard shrinking has not been validated.

## Build with the installed toolchain

From the repository root:

```powershell
npm run build
node node_modules/@capacitor/cli/bin/capacitor copy android
.\android\gradlew.bat -p android :app:assembleRelease :app:lintRelease :app:testDebugUnitTest --offline --no-daemon
```

The copy command refreshes web assets and Capacitor configuration without installing packages. Offline Gradle requires previously cached Android dependencies; a missing cache is a blocked check, not permission to download or change the dependency graph. Open `android/` in Android Studio for development. Use a debug build for local device investigation.

## Release configuration

The app manifest disallows backup and cleartext traffic and requires ES 3.0. FileProvider shares only the dedicated `cache/shared_exports/` directory. Capacitor disables WebView debugging and native logging; release is explicitly non-debuggable. Inspect the **merged release manifest** after building, including permissions and exported components contributed by libraries. The launch activity is intentionally exported. Haptics requires VIBRATE; no INTERNET permission is intended.

Lint errors fail the build. Warnings remain review items, not automatically suppressed. Do not add Firebase configuration, signing credentials or network services to resolve unrelated build warnings.

## Signing and device gate

Use the publisher's existing signing identity through Android Studio or an external credential store. Do not place passwords in source, terminal commands, logs or reports. Keep keystores outside tracked source. This audit does not generate keys, sign, install, upload or publish a release.

Before release, test the actual signed artifact on low-end and representative Android hardware: launch offline, create/edit/save/reopen, pause/background/resume, Android Back, rotation, WebView context loss, touch targets, screen reader, large text, storage-full recovery, and a long session. Verify that device/browser locking allows editing on the target WebView. Without Web Locks the app deliberately opens read-only.

Review Play Console requirements, Data safety and the hosted privacy policy against the actual signed build. Store declarations, signing, branch protection and physical-device behavior cannot be certified from source inspection. See [the readiness report](docs/PRODUCTION_READINESS.md) for exact checks and unresolved dependency blockers.
