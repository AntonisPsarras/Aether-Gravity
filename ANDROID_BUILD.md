# Android Build Guide for Aether Gravity

This guide will walk you through building and deploying your Aether Gravity app to the Google Play Store.

## Prerequisites

✅ **Already Installed:**
- Android Studio
- Node.js and npm

## Project Setup (Already Complete)

The following has been configured for you:

✅ Capacitor installed and configured
✅ Android platform initialized
✅ Mobile optimizations added
✅ Android manifest configured with necessary permissions
✅ Build configuration optimized for mobile

## Building the Android App

### 1. Build the Web Assets

First, build your production web bundle:

```bash
npm run build
```

### 2. Sync to Android

Sync the built web assets to the Android project:

```bash
npm run android:sync
```

This command:
- Builds your web app
- Copies the dist folder to Android assets
- Updates Android plugins

### 3. Open in Android Studio

Open the Android project in Android Studio:

```bash
npm run android:open
```

Or manually open: `android/` folder in Android Studio

### 4. Build Debug APK (Testing)

In Android Studio:
1. Wait for Gradle sync to complete
2. Click **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
3. Once complete, click "locate" to find the APK
4. Install on your device or emulator for testing

### 5. Create Signed Release Build

For Play Store submission, you need a signed release build.

#### A. Generate Keystore (One-Time Setup)

> [!IMPORTANT]
> **Keep your keystore file safe!** If you lose it, you cannot update your app on the Play Store.

If `keytool` is not recognized, use the full path to the one bundled with Android Studio. In your terminal/PowerShell:

```powershell
# Set the path to Android Studio's JDK (adjust if your installation path is different)
$env:PATH += ";C:\Program Files\Android\Android Studio\jbr\bin"

# Now try the command again
cd android/app
keytool -genkey -v -keystore aether-gravity-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias aether-gravity
```

*Note: If `jbr` folder doesn't exist, try `jre` instead.*

#### B. Configure Signing in Android Studio (Recommended)

**This is the easiest way** as it handles everything through the interface:
1. In Android Studio, go to **Build** → **Generate Signed Bundle / APK**
2. Select **Android App Bundle** (AAB) - required for Play Store
3. Click **Next**
4. Click **Create new...**
5. For **Key store path**, click the folder icon and choose where to save it (e.g., `android/app/aether-gravity-release.jks`)
6. Fill in the passwords, name, and alias.
7. Click **Next**, choose **release**, and click **Finish**.


The signed AAB will be created in: `android/app/release/app-release.aab`

## Testing on Physical Device

### Enable Developer Options on Android Device:
1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times
3. Go back to **Settings** → **Developer Options**
4. Enable **USB Debugging**

### Install and Test:
1. Connect device via USB
2. In Android Studio, select your device from the device dropdown
3. Click the **Run** button (green play icon)
4. The app will install and launch on your device

### Performance Testing Checklist:
- [ ] App launches without crashes
- [ ] 3D graphics render correctly
- [ ] Touch interactions work smoothly
- [ ] Planet creation and manipulation works
- [ ] Time controls function properly
- [ ] No significant lag or frame drops
- [ ] Rotation works (if enabled)
- [ ] App survives backgrounding and returning

## Google Play Store Submission

### 1. Create Google Play Developer Account

- Go to [Google Play Console](https://play.google.com/console)
- Pay the **$25 one-time registration fee**
- Complete account setup

### 2. Create New App

1. Click **Create app**
2. Fill in:
   - App name: **Aether Gravity**
   - Default language: English (US)
   - App or game: Game
   - Free or paid: Free (or Paid)
3. Accept declarations
4. Click **Create app**

### 3. Prepare Store Listing

#### App Details:
- **Short description** (80 chars max):
  ```
  Create and explore custom universes with realistic N-body gravity simulation
  ```

- **Full description** (4000 chars max):
  Use the content from your README.md, highlighting:
  - N-body physics simulation
  - Create custom solar systems
  - Realistic black holes with lensing
  - Beautiful planetary visuals
  - Time manipulation controls

#### Graphics Assets Needed:

**App Icon:**
- 512 x 512 PNG
- Use your existing `thumbnail.png` as a base

**Feature Graphic:**
- 1024 x 500 PNG
- Landscape banner for Play Store

**Screenshots** (at least 2, up to 8):
- Phone: 16:9 or 9:16 ratio
- Recommended: 1080 x 1920 or 1920 x 1080
- Take screenshots of:
  - Main menu
  - Solar system view
  - Planet creation
  - Black hole visualization
  - Universe outliner

**Optional but Recommended:**
- Promo video (YouTube link)
- Tablet screenshots (7-inch and 10-inch)

### 4. Content Rating

1. Go to **Content rating** section
2. Fill out the questionnaire honestly
3. Common answers for Aether Gravity:
   - No violence, sexual content, or profanity
   - No user-generated content
   - No sharing of user location
   - No ads (unless you added them)
4. Submit and receive rating

### 5. App Content

Fill out required sections:
- **Privacy Policy**: Required if you collect any data
  - If you don't collect data, you can use a simple "We don't collect data" policy
  - Host it on GitHub Pages or your website
- **App access**: If app requires login or special access
- **Ads**: Declare if app contains ads
- **Target audience**: Age groups (likely 3+)

### 6. Upload Release

1. Go to **Production** → **Create new release**
2. Upload your signed AAB file: `app-release.aab`
3. Fill in release notes (what's new in this version)
4. Review and roll out to production

### 7. Submit for Review

1. Review all sections (they must have green checkmarks)
2. Click **Submit for review**
3. Wait for approval (typically 1-7 days)

## Updating Your App

When you make changes:

1. Update version in `android/app/build.gradle`:
   ```gradle
   versionCode 2  // Increment by 1
   versionName "1.1"  // Update version string
   ```

2. Build and sync:
   ```bash
   npm run android:sync
   ```

3. Create new signed AAB in Android Studio

4. Upload to Play Console as a new release

## Troubleshooting

### Build Errors

**Gradle sync failed:**
- In Android Studio: **File** → **Invalidate Caches** → **Invalidate and Restart**
- Check that Android SDK is properly installed

**WebView errors:**
- Ensure `android:hardwareAccelerated="true"` is in AndroidManifest.xml (already added)
- Check that device supports OpenGL ES 2.0+

### Performance Issues

**Low FPS on device:**
- The app automatically reduces quality on mobile
- Consider further reducing particle counts in `SpaceCanvas.tsx`
- Test on multiple devices (newer devices will perform better)

**App crashes on launch:**
- Check Android Studio Logcat for error messages
- Ensure all Capacitor plugins are properly installed
- Verify WebGL is supported on the device

### Play Store Rejection

**Common reasons:**
- Missing privacy policy
- Incomplete content rating
- Insufficient screenshots
- App crashes on reviewer's device

**Fix and resubmit:**
- Address the issues mentioned in rejection email
- Upload new AAB if code changes needed
- Resubmit for review

## Additional Resources

- [Capacitor Android Documentation](https://capacitorjs.com/docs/android)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Android App Signing](https://developer.android.com/studio/publish/app-signing)

## Quick Reference Commands

```bash
# Build web assets
npm run build

# Sync to Android
npm run android:sync

# Open in Android Studio
npm run android:open

# Run on connected device (from Android Studio)
# Click the green play button

# Build signed release
# Use Android Studio: Build → Generate Signed Bundle / APK
```

---

**You're now ready to deploy Aether Gravity to the Google Play Store! 🚀**
