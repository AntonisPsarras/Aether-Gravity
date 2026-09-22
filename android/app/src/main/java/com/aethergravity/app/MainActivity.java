package com.aethergravity.app;

import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;

import androidx.activity.EdgeToEdge;
import androidx.appcompat.app.ActionBar;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Draws the window behind the system bars and into the display cutout.
     *
     * EdgeToEdge.enable is the supported path on Android 15+, where
     * FLAG_FULLSCREEN and SYSTEM_UI_FLAG_IMMERSIVE* are ignored. It is called
     * before super.onCreate so it runs before BridgeActivity.setContentView.
     * BridgeActivity.setTheme inside super can reset window attributes, so
     * setDecorFitsSystemWindows(false) and SHORT_EDGES are applied again after.
     *
     * The web layer is already safe-area aware — index.css derives
     * --safe-top/right/bottom/left from env(safe-area-inset-*) and ~30 rules
     * consume them — but Chromium only reports non-zero insets when the window
     * actually extends under the cutout. Without SHORT_EDGES the default
     * LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT letterboxes the cutout region in
     * portrait, so env() stays 0 and the HUD is held off the notch only by the
     * hardcoded pixel floors in index.css. EdgeToEdge sets ALWAYS on API 30+;
     * SHORT_EDGES is assigned after that call so it wins.
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
     * System bars stay visible and overlay the WebView; nothing here hides them.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Apply postSplashScreenTheme before AppCompat inflates the window.
        // Without this, Theme.SplashScreen can dismiss into a titled decor and
        // leave the truncated "Aether Gravity" ActionBar over the WebView.
        SplashScreen.installSplashScreen(this);
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        hideTitleBar();

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES is API 28; minSdk is 24.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attrs = getWindow().getAttributes();
            attrs.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attrs);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // BridgeActivity.setTheme runs after super.onCreate and can rebuild
        // window chrome; hide again once the activity is in the foreground.
        hideTitleBar();
    }

    private void hideTitleBar() {
        ActionBar bar = getSupportActionBar();
        if (bar != null) {
            bar.hide();
        }
        android.app.ActionBar nativeBar = getActionBar();
        if (nativeBar != null) {
            nativeBar.hide();
        }
    }
}
