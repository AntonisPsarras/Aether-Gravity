# App Icons and Splash Screen

Your app currently uses the default Capacitor icons. To customize them with your Aether Gravity branding:

## Option 1: Use Existing Thumbnail (Quick)

Your `thumbnail.png` can be used as a base for the app icon:

1. Create a square version (1024x1024) of your thumbnail
2. Save it as `resources/icon.png`
3. Create a splash screen image (2732x2732) and save as `resources/splash.png`

## Option 2: Use Online Icon Generator (Recommended)

1. Go to [Icon Kitchen](https://icon.kitchen/) or [App Icon Generator](https://www.appicon.co/)
2. Upload your logo/icon design
3. Download the generated Android icons
4. Replace the icons in `android/app/src/main/res/mipmap-*` folders

## Option 3: Use Capacitor Assets Plugin

Install and use the official Capacitor assets plugin:

```bash
npm install @capacitor/assets --save-dev
```

Create `resources/` folder with:
- `icon.png` (1024x1024) - Your app icon
- `splash.png` (2732x2732) - Your splash screen

Then run:

```bash
npx capacitor-assets generate --android
```

This will automatically generate all required icon sizes and splash screens.

## Required Icon Sizes

If manually creating icons, you need these sizes in `android/app/src/main/res/`:

- `mipmap-mdpi/ic_launcher.png` (48x48)
- `mipmap-hdpi/ic_launcher.png` (72x72)
- `mipmap-xhdpi/ic_launcher.png` (96x96)
- `mipmap-xxhdpi/ic_launcher.png` (144x144)
- `mipmap-xxxhdpi/ic_launcher.png` (192x192)

## Design Guidelines

For best results:
- Use a simple, recognizable design
- Avoid text (it won't be readable at small sizes)
- Use your brand colors (#22d3ee cyan/turquoise)
- Ensure good contrast against various backgrounds
- Test on actual devices to see how it looks

## Current Status

✅ Default Capacitor icons are in place
⚠️ Custom icons need to be created and added

The app will work with default icons, but custom icons will make it look more professional on the Play Store and user devices.
