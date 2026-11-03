#!/usr/bin/env node
/**
 * Link this package into a DSH profile so the host loads dsh-life-chat.
 *
 *   node scripts/install-local.mjs                 # edit + pnpm install
 *   node scripts/install-local.mjs --no-install    # edit only
 *   node scripts/install-local.mjs --revert        # undo the edit
 *
 * Always writes a timestamped backup of the profile package.json first.
 * A restart of DSH is required afterwards; this script never restarts it.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE = 'dsh-life-pipline';
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profile = resolve(value('--profile', join(homedir(), '.dsh', 'profiles', 'desktop')));
const manifestPath = join(profile, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const backup = `${manifestPath}.bak-life-chat-${Date.now()}`;
copyFileSync(manifestPath, backup);

if (flag('--revert')) {
  manifest.dependencies = manifest.dependencies ?? {};
  delete manifest.dependencies[PACKAGE];
  const bundles = manifest.dsh?.profile?.bundles;
  if (Array.isArray(bundles)) {
    manifest.dsh.profile.bundles = bundles.filter((entry) => entry !== PACKAGE);
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`removed ${PACKAGE} from ${manifestPath}\nbackup: ${backup}`);
  process.exit(0);
}

manifest.dependencies = manifest.dependencies ?? {};
manifest.dependencies[PACKAGE] = `link:${repo.replaceAll('\\', '/')}`;

manifest.dsh = manifest.dsh ?? {};
manifest.dsh.profile = manifest.dsh.profile ?? {};
const bundles = Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : [];
if (!bundles.includes(PACKAGE)) bundles.push(PACKAGE);
manifest.dsh.profile.bundles = bundles;

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`linked ${PACKAGE} -> ${repo}`);
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
