import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const allowlist = JSON.parse(readFileSync(new URL('./audit-allowlist.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const rank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
let failed = false;

const fail = (message) => {
  console.error(message);
  failed = true;
};

for (const [name, pkg] of Object.entries(lock.packages)) {
  if (pkg.resolved && !String(pkg.resolved).startsWith('https://registry.npmjs.org/')) {
    fail(`Non-npm-registry resolved URL: ${name} -> ${pkg.resolved}`);
  }
  if (name && pkg.resolved && !pkg.integrity) {
    fail(`Missing integrity: ${name}`);
  }
}

const packageNames = Object.keys(lock.packages);
if (packageNames.includes('node_modules/@capacitor/assets')) {
  fail('@capacitor/assets must stay out of the lockfile (nested sharp/tar).');
}
if (packageNames.some((name) => name === 'node_modules/sharp' || name.endsWith('/sharp'))) {
  fail('sharp must stay out of the lockfile.');
}
const tar = lock.packages['node_modules/tar'];
if (tar && String(tar.version).split('.').map(Number).reduce((acc, n, i) => acc + n * [10000, 100, 1][i], 0) < 70521) {
  fail(`tar ${tar.version} is below the patched 7.5.21 floor.`);
}

const audit = (omitDev) => {
  const command = omitDev
    ? 'npm audit --json --ignore-scripts --omit=dev'
    : 'npm audit --json --ignore-scripts';
  try {
    return JSON.parse(execSync(command, { encoding: 'utf8' }));
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
};

const advisoriesOf = (entry) => {
  const ids = new Set();
  for (const item of entry.via ?? []) {
    if (typeof item === 'object' && item.url) {
      const id = String(item.url).split('/').pop();
      if (id?.startsWith('GHSA-')) ids.add(id);
    }
  }
  return [...ids];
};

const production = audit(true);
for (const [name, entry] of Object.entries(production.vulnerabilities ?? {})) {
  if (rank[entry.severity] >= rank.high) {
    fail(`Production dependency ${name} has ${entry.severity} advisory; none are allowed.`);
  }
  const allowed = allowlist.packages[name];
  if (!allowed) {
    fail(`Unexpected production advisory for ${name}. Add a reviewed allowlist entry or upgrade.`);
    continue;
  }
  for (const id of advisoriesOf(entry)) {
    if (!allowed.advisories.includes(id)) fail(`New production advisory ${id} on ${name}`);
  }
}

const full = audit(false);
for (const [name, entry] of Object.entries(full.vulnerabilities ?? {})) {
  const allowed = allowlist.packages[name];
  if (!allowed) {
    fail(`Unexpected advisory for ${name} (${entry.severity}). Upgrade or add a reviewed allowlist entry.`);
    continue;
  }
  if (rank[entry.severity] > rank[allowed.maxSeverity]) {
    fail(`${name} severity ${entry.severity} exceeds allowlist max ${allowed.maxSeverity}`);
  }
  for (const id of advisoriesOf(entry)) {
    if (!allowed.advisories.includes(id)) fail(`New advisory ${id} on ${name}`);
  }
}

if (failed) {
  process.exit(1);
}
console.log('PASS audit gate: npm registry sources, integrity present, no sharp/@capacitor/assets, production has no high/critical, remaining findings match scripts/audit-allowlist.json.');
