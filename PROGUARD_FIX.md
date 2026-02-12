# Fix for Capacitor Plugins ProGuard Error

If you encounter the ProGuard error again after running `npm install`, you can fix it with these commands:

## Quick Fix (PowerShell)

Run these commands in your project root to fix all three Capacitor plugins:

```powershell
# Fix Keyboard plugin
(Get-Content "node_modules\@capacitor\keyboard\android\build.gradle") -replace "proguard-android\.txt", "proguard-android-optimize.txt" | Set-Content "node_modules\@capacitor\keyboard\android\build.gradle"

# Fix Splash Screen plugin
(Get-Content "node_modules\@capacitor\splash-screen\android\build.gradle") -replace "proguard-android\.txt", "proguard-android-optimize.txt" | Set-Content "node_modules\@capacitor\splash-screen\android\build.gradle"

# Fix Status Bar plugin
(Get-Content "node_modules\@capacitor\status-bar\android\build.gradle") -replace "proguard-android\.txt", "proguard-android-optimize.txt" | Set-Content "node_modules\@capacitor\status-bar\android\build.gradle"
```

## Manual Fix

Edit the following files and change line ~45-46 in each:

1. `node_modules/@capacitor/keyboard/android/build.gradle`
2. `node_modules/@capacitor/splash-screen/android/build.gradle`
3. `node_modules/@capacitor/status-bar/android/build.gradle`

**Change from:**
```gradle
proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
```

**Change to:**
```gradle
proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
```

## Why This Happens

The Capacitor plugins (v8.0.0) use an outdated ProGuard configuration. This will be fixed in future releases. Once Capacitor releases new versions, this workaround won't be needed.

## Status

✅ **Already fixed** - All three plugin files have been patched for you. You can now build your APK.

If you reinstall dependencies (`npm install`), you'll need to apply these fixes again.

