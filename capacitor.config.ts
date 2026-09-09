import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.aethergravity.app',
    appName: 'Aether Gravity',
    webDir: 'dist',
    server: {
        androidScheme: 'https'
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 2000,
            launchAutoHide: true,
            // Deliberately NOT the status-bar / theme colour below. This matches
            // the WebGL scene clear colour in SpaceCanvas, so the splash → canvas
            // handoff has no flash. The two greys differ on purpose.
            backgroundColor: "#050505",
            androidSplashResourceName: "splash",
            androidScaleType: "CENTER_CROP",
            showSpinner: false,
            androidSpinnerStyle: "large",
            iosSpinnerStyle: "small",
            spinnerColor: "#22d3ee",
            splashFullScreen: true,
            splashImmersive: true,
        },
        StatusBar: {
            style: 'DARK',
            // Void Navy — the single canonical chrome colour, matching the
            // theme-color meta in index.html and the runtime call in App.tsx.
            backgroundColor: '#10141C',
        },
        Keyboard: {
            resize: 'body',
            style: 'DARK',
            resizeOnFullScreen: true,
        }
    }
};

export default config;
