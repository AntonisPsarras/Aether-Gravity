# Capacitor 8 / Cordova bridge. Mirrors the consumer rules shipped in
# @capacitor/android, plus the app package and WebView JavaScript interfaces.
# SplashScreen is intentionally not kept wholesale: R8 must be able to drop
# legacyImmersive / legacyFullscreen when isFullScreen and isImmersive are false.

-keepattributes *Annotation*
-keepattributes JavascriptInterface
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}

-keep public class * extends com.getcapacitor.Plugin { *; }

-keep @com.getcapacitor.NativePlugin public class * {
    @com.getcapacitor.PluginMethod public <methods>;
}

-keep public class * extends org.apache.cordova.* {
    public <methods>;
    public <fields>;
}

-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }

# Plugin helpers the bridge constructs from kept Plugin subclasses. The splash
# package is not an entry point: a kept R$style field would pin
# capacitor_full_screen_style (android:windowFullscreen) into the APK.
-keep class !com.capacitorjs.plugins.splashscreen.**,com.capacitorjs.plugins.** { *; }

# Config is read from JSON at runtime, so the false flags are not visible to R8.
# Treat the deprecated fullscreen branches as dead so Play's DEX scan does not
# see SYSTEM_UI_FLAG_IMMERSIVE* / SYSTEM_UI_FLAG_FULLSCREEN from this plugin.
-assumevalues class com.capacitorjs.plugins.splashscreen.SplashScreenConfig {
    public boolean isFullScreen() return false;
    public boolean isImmersive() return false;
}

-keep class com.aethergravity.app.** { *; }

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
