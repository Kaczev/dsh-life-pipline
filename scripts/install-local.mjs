#!/usr/bin/env node
/**
 * Link the active component packages into a DSH profile.
 *
 *   node scripts/install-local.mjs                 # edit + pnpm install
 *   node scripts/install-local.mjs --no-install    # edit only
 *   node scripts/install-local.mjs --revert        # undo the edit
 *
 * Each component is its own plugin package with its own cordis.patch.yml, so
 * the profile names each one directly — that is what makes the Host activate
 * it. `dsh-life-pipline` is linked too: it owns the aggregate switch panel.
 *
 * Always writes a timestamped backup of the profile package.json first.
 * A restart of DSH is required afterwards; this script never restarts it.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE, COMPONENTS } from '../components/dsh-life-core/src/dependencies.mjs';
import { linkSelf } from './link-self.mjs';

// Former names of the aggregator. They are stripped from the profile so an
// older setup stops loading a second copy.
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
const names = [CORE, ...COMPONENTS];
const LINK = (dir) => `link:${dir.replaceAll('\\', '/')}`;
const backup = `${manifestPath}.bak-life-chat-${Date.now()}`;

if (flag('--revert')) {
  copyFileSync(manifestPath, backup);
  manifest.dependencies = manifest.dependencies ?? {};
  const ours = new Set([BUNDLE, ...RETIRED, ...names]);
  for (const name of ours) delete manifest.dependencies[name];
  const bundles = manifest.dsh?.profile?.bundles;
  if (Array.isArray(bundles)) {
    manifest.dsh.profile.bundles = bundles.filter((entry) => !ours.has(entry));
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`removed the dsh-lpipe- components from ${manifestPath}\nbackup: ${backup}`);
  process.exit(0);
}

// pnpm link: points at the checkout. Its bare imports must also resolve here.
linkSelf();
copyFileSync(manifestPath, backup);

manifest.dependencies = manifest.dependencies ?? {};
for (const name of RETIRED) delete manifest.dependencies[name];
manifest.dependencies[BUNDLE] = LINK(repo);
for (const name of names) manifest.dependencies[name] = LINK(join(repo, 'components', name));

manifest.dsh = manifest.dsh ?? {};
manifest.dsh.profile = manifest.dsh.profile ?? {};
const bundles = (Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : [])
  .filter((entry) => !RETIRED.includes(entry));
// The common package and every component are bundles of their own, so the
// profile has to name each one for the Host to activate it.
for (const name of [BUNDLE, ...names]) {
  if (!bundles.includes(name)) bundles.push(name);
}
manifest.dsh.profile.bundles = bundles;

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`linked ${BUNDLE} -> ${repo}`);
for (const name of names) console.log(`linked ${name} -> ${join(repo, 'components', name)}`);
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
