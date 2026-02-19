# Fix for Capacitor Plugins ProGuard Error

If you encounter the ProGuard error again after running `npm install`, you don't need to do anything manually!

## Automated Fix

I have added a `postinstall` script to `package.json` that automatically patches the affected Capacitor plugins whenever you run `npm install`.

The script is located at `scripts/fix-proguard.js`.

## Manual Fix (Fallback)

If for some reason the automated script fails, you can run it manually:

```bash
node scripts/fix-proguard.js
```

Or you can revert to the manual method described below:

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
