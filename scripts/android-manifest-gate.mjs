import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const check = (label, xml) => {
  if (/\bandroid:name="android\.permission\.INTERNET"/i.test(xml)) {
    fail(`${label} declares INTERNET`);
  }
  if (/usesCleartextTraffic\s*=\s*"true"/i.test(xml)) {
    fail(`${label} allows cleartext traffic`);
  }
  if (!/usesCleartextTraffic\s*=\s*"false"/i.test(xml) && label.includes('source')) {
    fail(`${label} must set usesCleartextTraffic=false`);
  }
  if (/android:debuggable\s*=\s*"true"/i.test(xml)) {
    fail(`${label} is debuggable`);
  }
};

const source = resolve('android/app/src/main/AndroidManifest.xml');
check('source AndroidManifest.xml', readFileSync(source, 'utf8'));

const mergedCandidates = [
  'android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml',
  'android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml',
  'android/app/build/intermediates/merged_manifest/release/AndroidManifest.xml',
];
const merged = mergedCandidates.find((file) => existsSync(file));
if (merged) {
  check(`merged release manifest (${merged})`, readFileSync(merged, 'utf8'));
  console.log(`PASS android manifest gate: source and merged release (${merged}) have no INTERNET and no cleartext.`);
} else {
  console.log('PASS android manifest gate: source has no INTERNET and usesCleartextTraffic=false. Merged release manifest not present yet.');
}
