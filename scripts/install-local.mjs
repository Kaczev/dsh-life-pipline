#!/usr/bin/env node
/**
 * Link every component package under components/ into a DSH profile.
 *
 *   node scripts/install-local.mjs                 # edit + pnpm install
 *   node scripts/install-local.mjs --no-install    # edit only
 *   node scripts/install-local.mjs --revert        # undo the edit
 *
 * Each component is its own plugin package with its own cordis.patch.yml, so
 * the profile names each one directly — that is what makes the Host activate
 * it. `dsh-life-pipline` is linked too: it is the common package that owns the
 * shared 「Lpipe 设置」 page, and no component can mount it on its own.
 *
 * Always writes a timestamped backup of the profile package.json first.
 * A restart of DSH is required afterwards; this script never restarts it.
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Former names of the aggregator. They are stripped from the profile so an
// older setup stops loading a second copy; the current `dsh-life-pipline` is
// installed normally and carries the shared Settings page.
const RETIRED = ['dsh-life-piplines'];
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = 'dsh-life-pipline';
const profile = resolve(value('--profile', join(homedir(), '.dsh', 'profiles', 'desktop')));
const manifestPath = join(profile, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

/** Every package under components/ that declares a name. */
function componentPackages() {
  const root = join(repo, 'components');
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, 'package.json'))
    .filter((path) => existsSync(path))
    .map((path) => ({ dir: dirname(path), manifest: JSON.parse(readFileSync(path, 'utf8')) }))
    .filter(({ manifest: own }) => typeof own.name === 'string' && own.name !== '');
}

const LINK = (dir) => `link:${dir.replaceAll('\\', '/')}`;
const backup = `${manifestPath}.bak-life-chat-${Date.now()}`;

if (flag('--revert')) {
  copyFileSync(manifestPath, backup);
  manifest.dependencies = manifest.dependencies ?? {};
  const names = [BUNDLE, ...RETIRED, ...componentPackages().map(({ manifest: own }) => own.name)];
  for (const name of names) delete manifest.dependencies[name];
  const bundles = manifest.dsh?.profile?.bundles;
  if (Array.isArray(bundles)) {
    const ours = new Set(names);
    manifest.dsh.profile.bundles = bundles.filter((entry) => !ours.has(entry));
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`removed the dsh-lpipe- components from ${manifestPath}\nbackup: ${backup}`);
  process.exit(0);
}

copyFileSync(manifestPath, backup);

manifest.dependencies = manifest.dependencies ?? {};
for (const name of RETIRED) delete manifest.dependencies[name];
manifest.dependencies[BUNDLE] = LINK(repo);
for (const { dir, manifest: own } of componentPackages()) {
  manifest.dependencies[own.name] = LINK(dir);
}

manifest.dsh = manifest.dsh ?? {};
manifest.dsh.profile = manifest.dsh.profile ?? {};
const bundles = (Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : [])
  .filter((entry) => !RETIRED.includes(entry));
// The common package and every component are bundles of their own, so the
// profile has to name each one for the Host to activate it.
for (const name of [BUNDLE, ...componentPackages().map(({ manifest: own }) => own.name)]) {
  if (!bundles.includes(name)) bundles.push(name);
}
manifest.dsh.profile.bundles = bundles;

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`linked ${BUNDLE} -> ${repo}`);
for (const { dir, manifest: own } of componentPackages()) console.log(`linked ${own.name} -> ${dir}`);
console.log(`profile: ${manifestPath}`);
console.log(`backup:  ${backup}`);

if (!flag('--no-install')) {
  console.log('\nrunning pnpm install in the profile...');
  execFileSync('pnpm', ['install', '--prefer-offline'], {
    cwd: profile,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

console.log('\nnext: restart DeepSeek Harness, then ask the agent for chat_status.');
