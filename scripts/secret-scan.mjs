import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const allowName = new Set(['.env.example']);
const skipContentExt = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.icns',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp4', '.webm', '.wasm', '.bin',
]);
const skipContentName = new Set(['package-lock.json']);
const maxBytes = 1_000_000;

const bannedNames = [
  { name: '.env file', re: /(^|\/)\.env(?!example$)(\.|$)/ },
  { name: 'Java keystore', re: /\.(jks|keystore)$/i },
  { name: 'PKCS12 / PEM / p8 key', re: /\.(p12|pem|p8)$/i },
  { name: 'Google services config', re: /(^|\/)google-services\.json$/i },
  { name: 'Apple GoogleService plist', re: /(^|\/)GoogleService-Info\.plist$/ },
  { name: 'signing properties', re: /(^|\/)(keystore|signing)\.properties$/i },
  { name: 'Play/Google service account', re: /(^|\/).*-service-account\.json$/i },
  { name: 'credentials JSON', re: /(^|\/).*credentials.*\.json$/i },
];

const bannedContent = [
  { name: 'PEM private key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/ },
  { name: 'PKCS8 private key', re: /-----BEGIN PRIVATE KEY-----/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { name: 'service account JSON', re: /"type"\s*:\s*"service_account"/ },
  { name: 'embedded private_key field', re: /"private_key"\s*:/ },
];

const tracked = execSync('git ls-files -z', { encoding: 'buffer' })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

let failed = false;
const fail = (message) => {
  console.error(message);
  failed = true;
};

const basename = (file) => file.slice(file.lastIndexOf('/') + 1);

for (const file of tracked) {
  const base = basename(file);
  if (allowName.has(base) || allowName.has(file)) continue;
  for (const rule of bannedNames) {
    if (rule.re.test(file)) fail(`Tracked ${rule.name}: ${file}`);
  }
}

for (const file of tracked) {
  const base = basename(file);
  if (allowName.has(base) || skipContentName.has(base) || skipContentName.has(file)) continue;
  if (skipContentExt.has(extname(file).toLowerCase())) continue;
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    continue;
  }
  if (size === 0 || size > maxBytes) continue;
  const text = readFileSync(file, 'utf8');
  if (text.includes('\0')) continue;
  for (const rule of bannedContent) {
    if (rule.re.test(text)) fail(`${rule.name} in ${file}`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`PASS secret scan: ${tracked.length} tracked files, no credential patterns.`);
}
