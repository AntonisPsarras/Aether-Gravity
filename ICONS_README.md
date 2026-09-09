# App Icons and Splash Screen

## Current status

Custom icons and splash screens are **already generated and committed**. There is nothing to do here for a normal build — this document exists for when you want to change the artwork.

What is in the repo today, under `android/app/src/main/res/`:

| Resource | Location |
|---|---|
| Legacy launcher icon | `mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher.png` |
| Adaptive icon foreground | `mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher_foreground.png` |
| Adaptive icon definition | `mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml` |
| Adaptive icon background colour | `values/ic_launcher_background.xml` — currently `#0a0a0a` |
| Splash screens | `drawable/`, `drawable-{land,port}-{m,h,x,xx,xxx}hdpi/splash.png` |

The splash screen's own background and behaviour (duration, scale type, fullscreen) are configured in `capacitor.config.ts` under `plugins.SplashScreen`, not in these resource files.

## Regenerating the icons

`@capacitor/assets` is already a devDependency — no install step is needed.

1. Create a `resources/` directory at the repo root (it is not checked in):
   - `resources/icon.png` — 1024×1024, square, no transparency at the edges
   - `resources/icon-foreground.png` and `resources/icon-background.png` — optional, for finer control over the Android adaptive icon
   - `resources/splash.png` — 2732×2732, subject centred well inside the safe area
   - `resources/splash-dark.png` — optional

2. Generate:

   ```bash
   npx capacitor-assets generate --android
   ```

3. Review the diff under `android/app/src/main/res/` before committing — the generator overwrites every density at once.

If you would rather not run the generator, [Icon Kitchen](https://icon.kitchen/) produces the same Android density set by hand; drop the output into the matching `mipmap-*` folders.

## Required sizes (manual route)

| Density | `ic_launcher.png` |
|---|---|
| mdpi | 48×48 |
| hdpi | 72×72 |
| xhdpi | 96×96 |
| xxhdpi | 144×144 |
| xxxhdpi | 192×192 |

Adaptive-icon foregrounds are larger (108dp square at each density) and must keep the subject inside the central 66dp safe zone, since Android masks the outer ring to the device's icon shape.

## Design guidelines

- Keep the mark simple and recognisable at 48×48.
- Avoid text — it will not be readable at launcher sizes.
- Stay inside the app's palette: Void Navy `#10141C` and Pulsar White `#F4F4FB` (see the design-system section of [`README.md`](./README.md)). The adaptive-icon background is currently the near-black `#0a0a0a`.
- Check contrast against both light and dark launcher wallpapers, and against the Play Store's white listing background.
- Test on a real device — adaptive-icon masking is hard to judge from a flat PNG.
