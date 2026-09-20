# Publisher release checklist

The in-repo production work for 1.6.0 is in `docs/PRODUCTION_READINESS.md`. This file is only the remaining **console and device** steps that cannot be completed from source.

## GitHub (repository Settings)

- Protect `main`: require the Playwright workflow, dismiss stale reviews, no force-push, no deletion.
- Enable secret scanning and push protection.
- Confirm 2FA on the owner account.
- Do not commit keystores, `.env` files, or Play Console JSON keys.

## Play Console

- Sign the AAB from `:app:bundleRelease` with the existing upload key (outside this repo).
- Upload versionCode **5** / versionName **1.6.0**.
- Fill Data safety using the sheet in `ANDROID_BUILD.md`.
- Confirm the hosted privacy policy URL still matches `content/privacyPolicy.ts`.
- Supply Play listing assets (feature graphic is not in this repo).

## Device matrix (signed artifact)

On at least one low-end and one representative phone:

- Cold launch offline, create / save / reopen a world
- Second-tab / lock behaviour if the WebView supports Web Locks (otherwise the session must stay read-only)
- Pause, background, resume, Android Back, rotation
- WebGL context loss if you can trigger it
- Long session (well beyond the desktop 10-minute soak)

Do not add telemetry, INTERNET, or `@capacitor/assets` to “fix” store or lint warnings.
