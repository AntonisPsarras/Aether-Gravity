package com.aethergravity.app;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Opts the window into drawing behind the system bars and *into* the display
     * cutout.
     *
     * The web layer is already safe-area aware — index.css derives
     * --safe-top/right/bottom/left from env(safe-area-inset-*) and ~30 rules
     * consume them — but Chromium only reports non-zero insets when the window
     * actually extends under the cutout. Without SHORT_EDGES the default
     * LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT letterboxes the cutout region in
     * portrait, so env() stays 0 and the HUD is held off the notch only by the
     * hardcoded pixel floors in index.css.
     *
     * Done in Java rather than as a values-v28/styles.xml attribute: this
     * activity's theme is AppTheme.NoActionBarLaunch, a Theme.SplashScreen child
     * that core-splashscreen swaps out once the splash finishes. A theme
     * attribute would have to be duplicated onto both styles and would silently
     * stop working if Capacitor ever changed the swap target.
     *
     * Note for the CSS side: Chromium derives the safe-area insets from the
     * *cutout*, not from the status bar or the gesture bar. A notchless phone
     * still reports --safe-top: 0 even though its status bar overlays the
     * WebView, and --safe-bottom is 0 even with a gesture bar. That is why the
     * max(..., floor) fallbacks in index.css are load-bearing, not cosmetic.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES is API 28; minSdk is 24.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
    }
}
