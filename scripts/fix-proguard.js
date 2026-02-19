
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Files to patch
const filesToPatch = [
    'node_modules/@capacitor/keyboard/android/build.gradle',
    'node_modules/@capacitor/splash-screen/android/build.gradle',
    'node_modules/@capacitor/status-bar/android/build.gradle'
];

const targetString = "proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'";
const replacementString = "proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'";

console.log('Running ProGuard fix for Android build...');

filesToPatch.forEach(relativePath => {
    const fullPath = join(process.cwd(), relativePath);

    if (existsSync(fullPath)) {
        try {
            let content = readFileSync(fullPath, 'utf8');

            if (content.includes(targetString)) {
                content = content.replace(targetString, replacementString);
                writeFileSync(fullPath, content, 'utf8');
                console.log(`✅ Patched: ${relativePath}`);
            } else if (content.includes(replacementString)) {
                console.log(`ℹ️ Already patched: ${relativePath}`);
            } else {
                console.warn(`⚠️ Target string not found in: ${relativePath}`);
            }
        } catch (error) {
            console.error(`❌ Error patching ${relativePath}:`, error);
        }
    } else {
        console.warn(`⚠️ File not found (skipping): ${relativePath}`);
    }
});

console.log('ProGuard fix completed.');
